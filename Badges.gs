/**
 * Calculates badges earned based on student points and saves to Student_Profiles.
 * Called after a submission is approved.
 *
 * TODO: Fix logic bug - `studentSheet` variable is used but not defined in this scope.
 * This will cause a runtime error when trying to update student points.
 * Needs to be defined as `const studentSheet = ss.getSheetByName('Student_Profiles');` before use.
 *
 * @param {string} email - Student email.
 * @param {boolean} [skipSeasonEndBadges=false] - If true, skips calculation of season-end badges.
 */
function calculateBadges(email, skipSeasonEndBadges = false) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Use cached student data to find student profile (reduces Sheets API calls)
    const studentData = getStudentProfilesData();

    let studentRow = null;
    let studentProfile = null;

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        studentRow = i + 1;
        studentProfile = {
          seasonPoints: studentData[i][2] || 0,
          allTimePoints: studentData[i][3] || 0,
          earnedBadges: studentData[i][4] ? safeJSONParse(studentData[i][4], [], 'badge array') : []
        };
        break;
      }
    }

    if (!studentProfile) return;

    // Use cached badge data (reduces Sheets API calls)
    const badgeMap = getBadgeMapCache();
    // Convert badge map to array format for compatibility with existing badge logic
    const badgesData = [['Badge_ID', 'Badge_Name', 'Category', 'Trigger_Type', 'Trigger_Value', 'Description', 'Badge_Image_URL', 'Badge_Points_Base', 'Badge_Points_Multiplier']]; // Header row
    Object.values(badgeMap).forEach(badge => {
      badgesData.push([
        badge.id,
        badge.name,
        badge.category,
        badge.triggerType,
        badge.triggerValue,
        badge.description,
        badge.imageUrl,
        badge.pointsBase,
        badge.pointsMultiplier
      ]);
    });

    // PERFORMANCE: Use cached data to avoid redundant reads (reduces Sheets API calls)
    // These sheets are used by multiple badge trigger types
    const verifiedData = getVerifiedSubmissionsData();
    const eventData = getEventsData();

    // Get active season for season-scoped badges
    const activeSeason = getActiveSeason();

    // Build activity-to-season map for filtering (uses cached data)
    const activitiesData = getActivitiesData();
    const activitySeasonMap = {};
    for (let j = 1; j < activitiesData.length; j++) {
      activitySeasonMap[activitiesData[j][0]] = activitiesData[j][2]; // Activity_Code -> Season
    }

    // PERFORMANCE OPTIMIZATION: Pre-calculate user-specific aggregates in ONE pass
    // This changes complexity from O(badges × submissions) to O(submissions + badges)
    const eventToActivity = {};
    for (let j = 1; j < eventData.length; j++) {
      eventToActivity[eventData[j][0]] = eventData[j][1]; // Event_ID -> Activity_Code
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const userAggregates = {
      submissionCount: 0,
      recentSubmissionCount: 0, // Last 7 days
      distinctActivities: new Set(),
      activityEventCounts: {}, // Activity_Code -> count
      attendedEventIds: new Set(),
      seasonEventIds: new Set() // Events in current season
    };

    // Single pass through verifiedData to build all aggregates
    for (let j = 1; j < verifiedData.length; j++) {
      if (verifiedData[j][3] === email) {
        userAggregates.submissionCount++;

        const eventId = verifiedData[j][4];
        userAggregates.attendedEventIds.add(eventId);

        const submissionDate = new Date(verifiedData[j][1]);
        if (submissionDate >= sevenDaysAgo) {
          userAggregates.recentSubmissionCount++;
        }

        const activityCode = eventToActivity[eventId];
        if (activityCode) {
          userAggregates.distinctActivities.add(activityCode);
          userAggregates.activityEventCounts[activityCode] = (userAggregates.activityEventCounts[activityCode] || 0) + 1;

          if (activitySeasonMap[activityCode] === activeSeason) {
            userAggregates.seasonEventIds.add(eventId);
          }
        }
      }
    }

    // Check which badges should be earned
    for (let i = 1; i < badgesData.length; i++) {
      const badgeId = badgesData[i][0];
      const triggerType = badgesData[i][3];
      const triggerValue = badgesData[i][4];

      // Skip if badge ID is empty
      if (!badgeId) continue;

      // Skip if already earned
      if (studentProfile.earnedBadges.includes(badgeId)) continue;

      // Skip if trigger type is empty or invalid
      if (!triggerType || triggerType === '') continue;

      let shouldEarn = false;

      // Handle different trigger types from Config_Badges
      if (triggerType === 'Points_Season') {
        // Season points threshold - must have valid numeric trigger value
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;
        shouldEarn = studentProfile.seasonPoints >= triggerValue;
      } else if (triggerType === 'Submission_Count' || triggerType === 'Submission_Count_Week_1') {
        // Count verified submissions for this student - use pre-calculated aggregate
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;
        shouldEarn = userAggregates.submissionCount >= triggerValue;
      } else if (triggerType === 'Events_In_7_Days') {
        // Count events attended in last 7 days - use pre-calculated aggregate
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;
        shouldEarn = userAggregates.recentSubmissionCount >= triggerValue;
      } else if (triggerType === 'Distinct_Sports') {
        // Count unique sports/activities attended - use pre-calculated aggregate
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;
        shouldEarn = userAggregates.distinctActivities.size >= triggerValue;
      } else if (triggerType === 'Activity_Event_Count_Lifetime') {
        // Count of events attended for one or more activities ACROSS ALL SEASONS (LIFETIME)
        // Format: "ACTIVITY_CODE1,ACTIVITY_CODE2,...:COUNT" e.g., "VB,BB:5" for 5 combined volleyball+basketball events across all time
        if (typeof triggerValue !== 'string' || !triggerValue.includes(':')) continue;

        const [activityCodesStr, countStr] = triggerValue.split(':');
        const activityCodes = activityCodesStr.split(','); // Parse multiple activity codes
        const requiredCount = parseInt(countStr);

        if (!activityCodesStr || isNaN(requiredCount) || requiredCount <= 0) continue;

        // Build map of event IDs to activity codes
        const eventToActivity = {};
        for (let j = 1; j < eventData.length; j++) {
          eventToActivity[eventData[j][0]] = eventData[j][1]; // Event_ID -> Activity_Code
        }

        // Count attended events for ANY of the selected activities (combined total)
        let attendedActivityEvents = 0;
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) {
            const eventId = verifiedData[j][4];
            const eventActivity = eventToActivity[eventId];
            if (eventActivity && activityCodes.includes(eventActivity)) {
              attendedActivityEvents++;
            }
          }
        }

        shouldEarn = attendedActivityEvents >= requiredCount;
      } else if (triggerType === 'Home_Game_Pct') {
        // Percentage of home games attended - must have valid trigger value (0-1)
        if (typeof triggerValue !== 'number' || triggerValue < 0 || triggerValue > 1) continue;

        // Build event map
        const eventMap = {};
        for (let j = 1; j < eventData.length; j++) {
          eventMap[eventData[j][0]] = {
            isHome: eventData[j][9] // Is_Home_Game column
          };
        }

        let totalHomeGames = 0;
        let attendedHomeGames = 0;

        // Count total home games in season
        for (let j = 1; j < eventData.length; j++) {
          if (eventData[j][9]) totalHomeGames++; // Is_Home_Game
        }

        // Count attended home games
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) {
            const eventId = verifiedData[j][4];
            const event = eventMap[eventId];
            if (event && event.isHome) {
              attendedHomeGames++;
            }
          }
        }

        const percentage = totalHomeGames > 0 ? attendedHomeGames / totalHomeGames : 0;
        shouldEarn = percentage >= triggerValue;
      } else if (triggerType === 'Activity_Pct_Season') {
        // Percentage of one or more activities' games attended WITHIN THE CURRENT SEASON
        // Format: "ACTIVITY_CODE1,ACTIVITY_CODE2,...:PERCENTAGE" e.g., "BB,VB:0.75" for 75% of combined basketball+volleyball games THIS SEASON
        // NOTE: Season-end badge - skipped during regular submission approvals, only calculated at season-end
        if (skipSeasonEndBadges) continue;
        if (typeof triggerValue !== 'string' || !triggerValue.includes(':')) continue;

        const [activityCodesStr, percentageStr] = triggerValue.split(':');
        const activityCodes = activityCodesStr.split(','); // Parse multiple activity codes
        const requiredPercentage = parseFloat(percentageStr);

        if (!activityCodesStr || isNaN(requiredPercentage) || requiredPercentage < 0 || requiredPercentage > 1) continue;

        // Check if ALL selected activities belong to the current season
        let allInCurrentSeason = true;
        for (const code of activityCodes) {
          if (activitySeasonMap[code] !== activeSeason) {
            allInCurrentSeason = false;
            break;
          }
        }
        if (!allInCurrentSeason) {
          // Not all activities in current season, badge cannot be earned yet
          continue;
        }

        // Count total events for ALL selected activities in the current season
        let totalActivityEvents = 0;
        const activityEventIds = new Set();
        for (let j = 1; j < eventData.length; j++) {
          const eventActivityCode = eventData[j][1]; // Activity_Code column
          if (activityCodes.includes(eventActivityCode) && activitySeasonMap[eventActivityCode] === activeSeason) {
            totalActivityEvents++;
            activityEventIds.add(eventData[j][0]); // Event_ID
          }
        }

        // Count attended events for ANY of the selected activities (combined total)
        let attendedActivityEvents = 0;
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) {
            const eventId = verifiedData[j][4];
            if (activityEventIds.has(eventId)) {
              attendedActivityEvents++;
            }
          }
        }

        const percentage = totalActivityEvents > 0 ? attendedActivityEvents / totalActivityEvents : 0;
        shouldEarn = percentage >= requiredPercentage;
      } else if (triggerType === 'Activity_Pct_Lifetime') {
        // Percentage of one or more activities' games attended ACROSS ALL SEASONS (LIFETIME)
        // Format: "ACTIVITY_CODE1,ACTIVITY_CODE2,...:PERCENTAGE" e.g., "BB,VB:0.50" for 50% of combined basketball+volleyball games across all time
        if (typeof triggerValue !== 'string' || !triggerValue.includes(':')) continue;

        const [activityCodesStr, percentageStr] = triggerValue.split(':');
        const activityCodes = activityCodesStr.split(','); // Parse multiple activity codes
        const requiredPercentage = parseFloat(percentageStr);

        if (!activityCodesStr || isNaN(requiredPercentage) || requiredPercentage < 0 || requiredPercentage > 1) continue;

        // Count total events for ALL selected activities across ALL seasons
        let totalActivityEvents = 0;
        const activityEventIds = new Set();
        for (let j = 1; j < eventData.length; j++) {
          if (activityCodes.includes(eventData[j][1])) { // Activity_Code column - check if in selected activities
            totalActivityEvents++;
            activityEventIds.add(eventData[j][0]); // Event_ID
          }
        }

        // Count attended events for ANY of the selected activities (combined total)
        let attendedActivityEvents = 0;
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) {
            const eventId = verifiedData[j][4];
            if (activityEventIds.has(eventId)) {
              attendedActivityEvents++;
            }
          }
        }

        const percentage = totalActivityEvents > 0 ? attendedActivityEvents / totalActivityEvents : 0;
        shouldEarn = percentage >= requiredPercentage;
      } else if (triggerType === 'Activity_Event_Count_Season') {
        // Count of events attended for one or more activities WITHIN THE CURRENT SEASON
        // Format: "ACTIVITY_CODE1,ACTIVITY_CODE2,...:COUNT" e.g., "VB,BB:5" for 5 combined volleyball+basketball events THIS SEASON
        // NOTE: Season-end badge - skipped during regular submission approvals, only calculated at season-end
        if (skipSeasonEndBadges) continue;
        if (typeof triggerValue !== 'string' || !triggerValue.includes(':')) continue;

        const [activityCodesStr, countStr] = triggerValue.split(':');
        const activityCodes = activityCodesStr.split(','); // Parse multiple activity codes
        const requiredCount = parseInt(countStr);

        if (!activityCodesStr || isNaN(requiredCount) || requiredCount <= 0) continue;

        // Check if ALL selected activities belong to the current season
        let allInCurrentSeason = true;
        for (const code of activityCodes) {
          if (activitySeasonMap[code] !== activeSeason) {
            allInCurrentSeason = false;
            break;
          }
        }
        if (!allInCurrentSeason) {
          // Not all activities in current season, badge cannot be earned yet
          continue;
        }

        // Build map of event IDs to activity codes for current season only
        const eventToActivity = {};
        for (let j = 1; j < eventData.length; j++) {
          const eventActivityCode = eventData[j][1]; // Activity_Code column
          if (activitySeasonMap[eventActivityCode] === activeSeason) {
            eventToActivity[eventData[j][0]] = eventActivityCode; // Event_ID -> Activity_Code
          }
        }

        // Count attended events for ANY of the selected activities (combined total)
        let attendedActivityEvents = 0;
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) {
            const eventId = verifiedData[j][4];
            const eventActivity = eventToActivity[eventId];
            if (eventActivity && activityCodes.includes(eventActivity)) {
              attendedActivityEvents++;
            }
          }
        }

        shouldEarn = attendedActivityEvents >= requiredCount;
      } else if (triggerType === 'Season_Placement') {
        // Season placement badges (1st, 2nd, 3rd place in season)
        // These are ONLY awarded at season end by processSeasonEndBadges() function
        // Skip during regular badge calculations
        continue;
      } else if (triggerType === 'AllTime_Placement_Reached') {
        // All-time leaderboard placement achievement (e.g., "Reached Top 10")
        // Trigger value is the rank threshold (e.g., 10 for "Top 10")
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;

        // Calculate current all-time rank
        const allTimeRankings = [];
        for (let j = 1; j < studentData.length; j++) {
          allTimeRankings.push({
            email: studentData[j][0],
            allTimePoints: studentData[j][3] || 0
          });
        }
        allTimeRankings.sort((a, b) => b.allTimePoints - a.allTimePoints);

        // Find student's current rank
        let currentRank = 0;
        for (let j = 0; j < allTimeRankings.length; j++) {
          if (allTimeRankings[j].email === email) {
            currentRank = j + 1;
            break;
          }
        }

        // Award if student has reached or surpassed the required rank
        // (lower rank number = better placement, so <= check)
        shouldEarn = currentRank > 0 && currentRank <= triggerValue;
      } else if (triggerType === 'Career_Events_Attended') {
        // Lifetime event attendance milestone (total events across all seasons)
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;

        let totalEventsAttended = 0;
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) totalEventsAttended++;
        }

        shouldEarn = totalEventsAttended >= triggerValue;
      } else if (triggerType === 'Career_Seasons_Participated') {
        // Multi-season participation achievement (attended events in X different seasons)
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;

        // Count distinct seasons the student has attended events in
        const seasonsParticipated = new Set();
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) {
            const eventId = verifiedData[j][4];
            // Find the activity for this event
            for (let k = 1; k < eventData.length; k++) {
              if (eventData[k][0] === eventId) {
                const activityCode = eventData[k][1];
                const season = activitySeasonMap[activityCode];
                if (season) seasonsParticipated.add(season);
                break;
              }
            }
          }
        }

        shouldEarn = seasonsParticipated.size >= triggerValue;
      } else if (triggerType === 'Career_Badges_Earned') {
        // Badge collector achievement (earned X total badges)
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;

        const totalBadgesEarned = studentProfile.earnedBadges.length;
        shouldEarn = totalBadgesEarned >= triggerValue;
      } else if (triggerType === 'Weekday_Coverage') {
        // Weekday Warrior - Attended events on all 5 weekdays (M-F)
        // Trigger value is expected to be 5 (for 5 weekdays)
        if (typeof triggerValue !== 'number' || triggerValue !== 5) continue;

        // Build map of event IDs to dates
        const eventDates = {};
        for (let j = 1; j < eventData.length; j++) {
          const eventId = eventData[j][0];
          const eventDate = eventData[j][3]; // Date column
          if (eventId && eventDate) {
            eventDates[eventId] = new Date(eventDate);
          }
        }

        // Track which weekdays (1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri) have been attended
        const weekdaysAttended = new Set();
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) {
            const eventId = verifiedData[j][4];
            const eventDate = eventDates[eventId];
            if (eventDate) {
              const dayOfWeek = eventDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
              // Only count Monday (1) through Friday (5)
              if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                weekdaysAttended.add(dayOfWeek);
              }
            }
          }
        }

        // Award badge if attended all 5 weekdays
        shouldEarn = weekdaysAttended.size >= 5;
      } else if (triggerType === 'Specific_Activities') {
        // Arts Patron or similar - Attended specific required activities
        // Format: "ACTIVITY_CODE1,ACTIVITY_CODE2,ACTIVITY_CODE3"
        // Example: "ACT,BAND,SING" means must attend all 3 activities
        if (typeof triggerValue !== 'string' || !triggerValue) continue;

        const requiredActivities = triggerValue.split(',').map(code => code.trim());
        if (requiredActivities.length === 0) continue;

        // Build event to activity map
        const eventToActivity = {};
        for (let j = 1; j < eventData.length; j++) {
          eventToActivity[eventData[j][0]] = eventData[j][1]; // Event_ID -> Activity_Code
        }

        // Track which required activities have been attended
        const activitiesAttended = new Set();
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) {
            const eventId = verifiedData[j][4];
            const activity = eventToActivity[eventId];
            if (activity && requiredActivities.includes(activity)) {
              activitiesAttended.add(activity);
            }
          }
        }

        // Award badge if attended ALL required activities
        shouldEarn = activitiesAttended.size >= requiredActivities.length;
      }

      // Legacy support for old trigger type names
      else if (triggerType === 'points_threshold') {
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;
        shouldEarn = studentProfile.allTimePoints >= triggerValue;
      } else if (triggerType === 'season_points') {
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;
        shouldEarn = studentProfile.seasonPoints >= triggerValue;
      } else if (triggerType === 'event_count') {
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;
        // Use already-fetched verifiedData instead of re-reading the sheet
        let submissionCount = 0;
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) submissionCount++;
        }
        shouldEarn = submissionCount >= triggerValue;
      }

      // Skip badges with unimplemented trigger types (Activity, Loyalty, Variety, Special)
      else {
        continue;
      }

      if (shouldEarn) {
        studentProfile.earnedBadges.push(badgeId);

        // Calculate and award badge points
        const badgePointsBase = badgesData[i][7] || 0; // Badge_Points_Base (column H, index 7)
        const badgePointsMultiplier = badgesData[i][8] || 1.0; // Badge_Points_Multiplier (column I, index 8)
        const badgePointsAwarded = Math.round(badgePointsBase * badgePointsMultiplier);

        if (badgePointsAwarded > 0) {
          // Update student's season and all-time points
          studentProfile.seasonPoints = (studentProfile.seasonPoints || 0) + badgePointsAwarded;
          studentProfile.allTimePoints = (studentProfile.allTimePoints || 0) + badgePointsAwarded;
        }

        // Log badge award to Badge_Awards sheet for fan feed
        const badgeAwardsSheet = ss.getSheetByName('Badge_Awards');
        if (badgeAwardsSheet) {
          const displayName = studentData[studentRow - 1][1] || email; // Get Display_Name or fallback to email
          badgeAwardsSheet.appendRow([
            Utilities.getUuid(),          // Award_ID
            new Date(),                   // Timestamp
            email,                        // Email
            displayName,                  // Display_Name
            badgeId,                      // Badge_ID
            badgesData[i][1],             // Badge_Name
            badgesData[i][6]              // Badge_Image_URL
          ]);
        }

        // Send email notification for new badge
        const badgeName = badgesData[i][1];
        const badgeDescription = badgesData[i][5];
        const badgeImageUrl = badgesData[i][6];
        sendBadgeAwardEmail(email, badgeName, badgeDescription, badgeImageUrl);
      }
    }

    // Update Student_Profiles with new badges and updated points
    // Batch update badges (column 5) and season/all-time points (columns 3-4)
    // Get sheet reference for write operation (was previously undefined in original code)
    const studentSheet = ss.getSheetByName('Student_Profiles');
    studentSheet.getRange(studentRow, 3, 1, 3).setValues([
      [studentProfile.seasonPoints, studentProfile.allTimePoints, JSON.stringify(studentProfile.earnedBadges)]
    ]);

  } catch (e) {
    Logger.log('ERROR in calculateBadges for ' + email + ': ' + e.message + ' | Stack: ' + e.stack);
  }
}
