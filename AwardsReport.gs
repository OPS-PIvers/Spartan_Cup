/**
 * AwardsReport.gs
 *
 * Generates a report of final season awards for administrative review.
 * Creates a new sheet with winners for the current season.
 *
 * This function is intended to be run at the end of a season to verify
 * award calculations before they are officially finalized.
 */

/**
 * Main entry point for the "Generate Final Season Awards Report" menu item.
 */
function generateFinalSeasonAwardsReport() {
  const adminEmail = Session.getActiveUser().getEmail();

  // 1. Validate admin status
  if (!getAdminEmails().includes(adminEmail.toLowerCase())) {
    SpreadsheetApp.getUi().alert("Access denied. You are not an admin.");
    return;
  }

  try {
    const activeSeason = getActiveSeason();
    const currentYear = new Date().getFullYear();
    const sheetName = `${activeSeason} ${currentYear} Final Awards`;

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Check if sheet already exists
    let reportSheet = ss.getSheetByName(sheetName);
    if (reportSheet) {
      const response = SpreadsheetApp.getUi().alert(
        "Sheet Already Exists",
        `The sheet "${sheetName}" already exists. Do you want to overwrite it?`,
        SpreadsheetApp.getUi().ButtonSet.YES_NO
      );
      if (response !== SpreadsheetApp.getUi().Button.YES) {
        return;
      }
      reportSheet.clear();
    } else {
      reportSheet = ss.insertSheet(sheetName);
    }

    // Set headers
    const headers = ["Award Name", "Award Description", "Student Name", "Student Email", "Stats (For Review)"];
    reportSheet.getRange(1, 1, 1, 5).setValues([headers]).setFontWeight("bold");
    reportSheet.setFrozenRows(1);

    // Gather data
    const studentData = getStudentProfilesData();
    const badgeMap = getBadgeMapCache();
    const verifiedData = getVerifiedSubmissionsData();
    const eventData = getEventsData();
    const activitiesData = getActivitiesData();
    
    const activitySeasonMap = {};
    for (let j = 1; j < activitiesData.length; j++) {
      activitySeasonMap[activitiesData[j][0]] = activitiesData[j][2]; // Activity_Code -> Season
    }

    // 1. Calculate rankings for Season_Placement Awards
    const rankings = [];
    for (let i = 1; i < studentData.length; i++) {
      if (!studentData[i][0]) continue;
      rankings.push({
        email: studentData[i][0],
        name: studentData[i][1] || studentData[i][0],
        points: studentData[i][2] || 0,
        badges: safeJSONParse(studentData[i][4], [], 'badges')
      });
    }
    // Sort by season points descending
    rankings.sort((a, b) => b.points - a.points);

    const reportRows = [];

    // 2. Identify Placement Awards (Top 3)
    const placementBadges = Object.values(badgeMap).filter(b => b.triggerType === 'Season_Placement');
    placementBadges.sort((a, b) => a.triggerValue - b.triggerValue); // Sort by 1st, 2nd, 3rd

    for (const badge of placementBadges) {
      const rank = parseInt(badge.triggerValue);
      if (rank >= 1 && rank <= rankings.length) {
        const student = rankings[rank - 1];
        if (student.points > 0) { // Only award if they have points
          reportRows.push([
            badge.name,
            badge.description,
            student.name,
            student.email,
            `${student.points} pts`
          ]);
        }
      }
    }

    // 3. Special Winter Superfan Awards (Attendance Based)
    if (activeSeason === 'Winter') {
      const superfanCategories = [
        { name: "Superfan - Boys Hockey", codes: ["BHKY"], desc: "Attended the most Boys Hockey events this season." },
        { name: "Superfan - Girls Hockey", codes: ["GHKY"], desc: "Attended the most Girls Hockey events this season." },
        { name: "Superfan - Boys Basketball", codes: ["BBB"], desc: "Attended the most Boys Basketball events this season." },
        { name: "Superfan - Girls Basketball", codes: ["GBB"], desc: "Attended the most Girls Basketball events this season." },
        { name: "Superfan - Winter Multi-Sport", codes: ["BSWM", "DNCE", "WRST"], desc: "Attended the most combined meets for Swim, Dance, and Wrestling." }
      ];

      // Build activity event IDs set once for performance
      const activityEventIdsMap = {}; // Activity_Code -> Set of Event_IDs
      for (let j = 1; j < eventData.length; j++) {
        const eventId = eventData[j][0];
        const activityCode = eventData[j][1];
        if (!activityEventIdsMap[activityCode]) {
          activityEventIdsMap[activityCode] = new Set();
        }
        activityEventIdsMap[activityCode].add(eventId);
      }

      // Group verified submissions by student
      const submissionsByStudent = {};
      for (let j = 1; j < verifiedData.length; j++) {
        const email = verifiedData[j][3];
        if (!submissionsByStudent[email]) {
          submissionsByStudent[email] = [];
        }
        submissionsByStudent[email].push(verifiedData[j][4]); // Store Event_ID
      }

      for (const cat of superfanCategories) {
        const combinedEventIds = new Set();
        for (const code of cat.codes) {
          const eventIds = activityEventIdsMap[code] || new Set();
          eventIds.forEach(id => combinedEventIds.add(id));
        }

        if (combinedEventIds.size === 0) continue;

        // Count attendance for each student
        const attendanceCounts = [];
        for (const student of rankings) {
          const studentSubmissions = submissionsByStudent[student.email] || [];
          let count = 0;
          for (const eventId of studentSubmissions) {
            if (combinedEventIds.has(eventId)) {
              count++;
            }
          }
          if (count > 0) {
            attendanceCounts.push({ student, count });
          }
        }

        if (attendanceCounts.length > 0) {
          // Find max attendance
          attendanceCounts.sort((a, b) => b.count - a.count);
          const maxCount = attendanceCounts[0].count;
          
          // Add all students who tied for max
          const winners = attendanceCounts.filter(a => a.count === maxCount);
          for (const winner of winners) {
            reportRows.push([
              cat.name,
              cat.desc,
              winner.student.name,
              winner.student.email,
              `${winner.count} events`
            ]);
          }
        }
      }
    }

    // 4. Threshold-based Badges (Activity_Pct_Season, Activity_Event_Count_Season)
    // These are badges with trigger types like Activity_Pct_Season or Activity_Event_Count_Season
    const seasonEndBadges = Object.values(badgeMap).filter(b => 
      b.triggerType === 'Activity_Pct_Season' || 
      b.triggerType === 'Activity_Event_Count_Season'
    );

    if (seasonEndBadges.length > 0) {
      // Re-map activity event IDs just in case (already done in superfan section but needed if season != Winter)
      const activityEventIdsMap = {}; 
      for (let j = 1; j < eventData.length; j++) {
        const eventId = eventData[j][0];
        const activityCode = eventData[j][1];
        if (!activityEventIdsMap[activityCode]) {
          activityEventIdsMap[activityCode] = new Set();
        }
        activityEventIdsMap[activityCode].add(eventId);
      }

      const submissionsByStudent = {};
      for (let j = 1; j < verifiedData.length; j++) {
        const email = verifiedData[j][3];
        if (!submissionsByStudent[email]) {
          submissionsByStudent[email] = [];
        }
        submissionsByStudent[email].push(verifiedData[j][4]);
      }

      for (const student of rankings) {
        const studentSubmissions = submissionsByStudent[student.email] || [];
        
        for (const badge of seasonEndBadges) {
          // Skip if student already has this badge
          if (student.badges.includes(badge.id)) continue;

          let shouldEarn = false;
          let stats = "";
          const triggerValue = badge.triggerValue;

          if (badge.triggerType === 'Activity_Pct_Season' && typeof triggerValue === 'string' && triggerValue.includes(':')) {
            const [activityCodesStr, percentageStr] = triggerValue.split(':');
            const activityCodes = activityCodesStr.split(',').map(c => c.trim());
            const requiredPercentage = parseFloat(percentageStr);

            // Count total events for these activities in current season
            const combinedEventIds = new Set();
            for (const code of activityCodes) {
              if (activitySeasonMap[code] === activeSeason) {
                const eventIds = activityEventIdsMap[code] || new Set();
                eventIds.forEach(id => combinedEventIds.add(id));
              }
            }
            const totalEvents = combinedEventIds.size;

            // Count attended events
            let attendedCount = 0;
            for (const eventId of studentSubmissions) {
              if (combinedEventIds.has(eventId)) {
                attendedCount++;
              }
            }

            const percentage = totalEvents > 0 ? attendedCount / totalEvents : 0;
            shouldEarn = percentage >= requiredPercentage;
            stats = `${Math.round(percentage * 100)}% (${attendedCount}/${totalEvents})`;

          } else if (badge.triggerType === 'Activity_Event_Count_Season' && typeof triggerValue === 'string' && triggerValue.includes(':')) {
            const [activityCodesStr, countStr] = triggerValue.split(':');
            const activityCodes = activityCodesStr.split(',').map(c => c.trim());
            const requiredCount = parseInt(countStr);

            // Count attended events for these activities in current season
            const combinedEventIds = new Set();
            for (const code of activityCodes) {
              if (activitySeasonMap[code] === activeSeason) {
                const eventIds = activityEventIdsMap[code] || new Set();
                eventIds.forEach(id => combinedEventIds.add(id));
              }
            }

            let attendedCount = 0;
            for (const eventId of studentSubmissions) {
              if (combinedEventIds.has(eventId)) {
                attendedCount++;
              }
            }

            shouldEarn = attendedCount >= requiredCount;
            stats = `${attendedCount} events`;
          }

          if (shouldEarn) {
            reportRows.push([
              badge.name,
              badge.description,
              student.name,
              student.email,
              stats
            ]);
          }
        }
      }
    }

    // 5. Write to sheet
    if (reportRows.length > 0) {
      reportSheet.getRange(2, 1, reportRows.length, 5).setValues(reportRows);
      
      // Basic formatting
      reportSheet.autoResizeColumns(1, 5);
      
      SpreadsheetApp.getUi().alert(
        "✅ Awards Report Generated",
        `Successfully generated "${sheetName}" with ${reportRows.length} awards.\n\nNo emails were sent and no student profiles were modified.`
      );
    } else {
      SpreadsheetApp.getUi().alert(
        "ℹ️ No Awards Found",
        "No students qualified for new final season awards at this time."
      );
    }

    // Activate the new sheet
    reportSheet.activate();

  } catch (e) {
    SpreadsheetApp.getUi().alert("❌ Error generating report:\n\n" + e.message);
    Logger.log("Error in generateFinalSeasonAwardsReport: " + e.message + " | " + e.stack);
  }
}
