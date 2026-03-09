// ==============================================================================
// BADGE SYSTEM FUNCTIONS
// ==============================================================================
// Extracted from Code.js - Lines 4896-6498
// Functions for badge management, calculation, and administration

function getBadgeData() {
  const email = Session.getActiveUser().getEmail();

  try {
    // Use cached badge data (reduces Sheets API calls)
    const badgeMap = getBadgeMapCache();

    const allBadges = [];
    Object.values(badgeMap).forEach(badge => {
      allBadges.push({
        badgeId: badge.id,
        badgeName: badge.name,
        category: badge.category,
        triggerType: badge.triggerType,
        triggerValue: badge.triggerValue,
        description: badge.description,
        imageUrl: badge.imageUrl
      });
    });

    // Use cached student data (reduces Sheets API calls)
    const studentData = getStudentProfilesData();

    let userEarnedBadges = [];
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        userEarnedBadges = studentData[i][4] ? safeJSONParse(studentData[i][4], [], 'badge array') : [];
        break;
      }
    }

    return {
      status: "success",
      allBadges: allBadges,
      earnedBadgeIds: userEarnedBadges
    };

  } catch (e) {
    // Logger.log('Error in getBadgeData: ' + e.message);
    return {
      status: "error",
      message: "Error fetching badge data: " + e.message
    };
  }
}

/**
 * Discovers activity codes for the final superfan awards by searching the Activities_Data sheet.
 * Maps requested categories to their actual codes.
 * @return {Object} Map of superfan categories to their labels and discovered activity codes.
 */
function getSuperfanDefinitions() {
  try {
    const activitiesData = getActivitiesData();
    const groups = [
      { key: "Girls Hockey", keywords: ["Girls Hockey"], label: "Girls Hockey Superfan" },
      { key: "Boys Hockey", keywords: ["Boys Hockey"], label: "Boys Hockey Superfan" },
      { key: "Boys Basketball", keywords: ["Boys Basketball"], label: "Boys Basketball Superfan" },
      { key: "Girls Basketball", keywords: ["Girls Basketball"], label: "Girls Basketball Superfan" },
      { key: "Meet Sports", keywords: ["Swim", "Dance", "Wrestling"], label: "Meet Sports Superfan (Swim, Dance, Wrestling)" }
    ];

    const results = {};
    groups.forEach(g => {
      results[g.key] = {
        label: g.label,
        codes: []
      };
    });

    for (let i = 1; i < activitiesData.length; i++) {
      const code = String(activitiesData[i][0] || "").trim();
      const name = String(activitiesData[i][1] || "").trim();
      if (!code || !name) continue;

      groups.forEach(g => {
        const matches = g.keywords.some(k => name.toLowerCase().includes(k.toLowerCase()));
        if (matches) {
          results[g.key].codes.push(code);
        }
      });
    }

    Logger.log('[getSuperfanDefinitions] Discovered codes: ' + JSON.stringify(results));
    return results;
  } catch (e) {
    Logger.log('Error in getSuperfanDefinitions: ' + e.message);
    return {};
  }
}

/**
 * Internal helper to build map of event IDs to activity codes.
 * Improves DRY by centralizing event-activity mapping logic.
 */
function _createEventToActivityMap(eventData) {
  const eventToActivity = {};
  for (let j = 1; j < eventData.length; j++) {
    if (eventData[j][0]) {
      eventToActivity[eventData[j][0]] = eventData[j][1]; // Event_ID -> Activity_Code
    }
  }
  return eventToActivity;
}

/**
 * Populates the Config_Badges sheet with the specific superfan badges.
 * @return {Object} Status of the operation
 */
function setupFinalSuperfanBadges() {
  const email = Session.getActiveUser().getEmail();
  if (!getAdminEmails().includes(email.toLowerCase())) {
    return { status: 'error', message: 'Access denied. Admin privileges required.' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const badgesSheet = ss.getSheetByName('Config_Badges');
    if (!badgesSheet) {
      return { status: 'error', message: 'Config_Badges sheet not found' };
    }

    const superfanDefs = getSuperfanDefinitions();
    const badgeMap = getBadgeMapCache();
    const existingNames = Object.values(badgeMap).map(b => b.name);

    // Calculate max badge ID concisely using functional methods
    const baseMaxId = Object.keys(badgeMap)
      .map(badgeId => parseInt(badgeId.replace('badge_', ''), 10))
      .filter(idNum => !isNaN(idNum))
      .reduce((max, id) => Math.max(max, id), 0);

    let badgesCreated = 0;
    Object.keys(superfanDefs).forEach(key => {
      const def = superfanDefs[key];
      if (!existingNames.includes(def.label)) {
        // Generate new ID
        const newBadgeId = 'badge_' + String(baseMaxId + 1 + badgesCreated).padStart(3, '0');

        badgesSheet.appendRow([
          newBadgeId,
          def.label,
          'Special',
          'Superfan_Placement',
          key, // Use the group key as trigger value
          `Top fan for ${def.label.replace(' Superfan', '')} this season.`,
          'https://the-spartan-cup.web.app/badges/super_fan.svg'
        ]);
        badgesCreated++;
      }
    });

    if (badgesCreated > 0) {
      CacheService.getScriptCache().remove('badge_map_cache');
    }

    return {
      status: 'success',
      message: `Successfully initialized ${badgesCreated} superfan badge definitions.`
    };
  } catch (e) {
    Logger.log('Error in setupFinalSuperfanBadges: ' + e.message);
    return { status: 'error', message: 'Error setting up superfan badges: ' + e.message };
  }
}

/**
 * Calculates badges earned based on student points and saves to Student_Profiles.
 * Called after a submission is approved.
 * @param {string} email - Student email
 */
function calculateBadges(email, skipSeasonEndBadges = false) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const studentSheet = ss.getSheetByName('Student_Profiles');

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
    const eventToActivity = _createEventToActivityMap(eventData);

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
        const eventToActivity = _createEventToActivityMap(eventData);

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
        const eventToActivity = _createEventToActivityMap(eventData);

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
    studentSheet.getRange(studentRow, 3, 1, 3).setValues([
      [studentProfile.seasonPoints, studentProfile.allTimePoints, JSON.stringify(studentProfile.earnedBadges)]
    ]);

    // Invalidate cache so subsequent calls see the updated data
    CacheService.getScriptCache().remove('student_profiles_data');

  } catch (e) {
    Logger.log('ERROR in calculateBadges for ' + email + ': ' + e.message + ' | Stack: ' + e.stack);
  }
}

/**
 * Retroactively calculates and awards badges for ALL existing students.
 * This is a one-time admin function to backfill badges for users who already have points.
 * Can be run from the Admin menu: "6. Award Retroactive Badges (Run Once)"
 */
function awardRetroactiveBadges() {
  try {
    // Clear cache to ensure fresh data at start
    CacheService.getScriptCache().remove('student_profiles_data');

    // Use cached student data (reduces Sheets API calls)
    const studentData = getStudentProfilesData();

    let studentsProcessed = 0;

    // Loop through all students (skip header row)
    for (let i = 1; i < studentData.length; i++) {
      const email = studentData[i][0];

      if (!email) continue; // Skip empty rows

      // Calculate badges (this will add any newly qualified badges)
      // Note: calculateBadges now invalidates cache, so each iteration sees fresh data
      calculateBadges(email);

      studentsProcessed++;
    }

    // Show completion message
    SpreadsheetApp.getUi().alert(
      '✅ Retroactive Badge Award Complete!\n\n' +
      'Students Processed: ' + studentsProcessed + '\n\n' +
      'All existing users have now received badges they qualified for based on their current points and submission history.\n\n' +
      'Check Student_Profiles sheet (column E) to verify badges were awarded correctly.'
    );

  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error awarding retroactive badges:\n\n' + e.message);
    Logger.log('Error in awardRetroactiveBadges: ' + e.message);
  }
}

/**
 * Processes season-end badges for all students.
 * This function should be run when a season concludes to:
 * 1. Award Season_Placement badges to top 3 students
 * 2. Recalculate all badges with season-specific data
 * 3. Optionally archive season results
 * Can be run from the Admin menu: "7. End Season & Award Final Badges"
 */
function processSeasonEndBadges() {
  try {
    // Use cached student data (reduces Sheets API calls)
    const studentData = getStudentProfilesData();

    // Use cached badge data (reduces Sheets API calls)
    const badgeMap = getBadgeMapCache();
    // Convert badge map to array format for compatibility
    const badgesData = [['Badge_ID', 'Badge_Name', 'Category', 'Trigger_Type', 'Trigger_Value', 'Description', 'Badge_Image_URL', 'Badge_Points_Base', 'Badge_Points_Multiplier']];
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

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const studentSheet = ss.getSheetByName('Student_Profiles');

    // Get current season for display
    const activeSeason = getActiveSeason();

    // Calculate final season rankings
    const seasonRankings = [];
    for (let i = 1; i < studentData.length; i++) {
      if (!studentData[i][0]) continue; // Skip empty rows
      seasonRankings.push({
        email: studentData[i][0],
        name: studentData[i][1],
        seasonPoints: studentData[i][2] || 0,
        rowIndex: i
      });
    }

    // Sort by season points (descending)
    seasonRankings.sort((a, b) => b.seasonPoints - a.seasonPoints);

    // Find all Season_Placement badges
    const placementBadges = [];
    for (let i = 1; i < badgesData.length; i++) {
      const badgeId = badgesData[i][0];
      const badgeName = badgesData[i][1];
      const triggerType = badgesData[i][3];
      const triggerValue = badgesData[i][4];

      if (triggerType === 'Season_Placement' && badgeId) {
        placementBadges.push({
          badgeId: badgeId,
          badgeName: badgeName,
          placement: triggerValue // 1 for 1st place, 2 for 2nd, 3 for 3rd
        });
      }
    }

    // Award placement badges to top students
    let placementBadgesAwarded = 0;
    for (const badge of placementBadges) {
      const placement = badge.placement;
      if (placement >= 1 && placement <= seasonRankings.length) {
        const topStudent = seasonRankings[placement - 1]; // 0-indexed
        const studentRowIndex = topStudent.rowIndex;

        // Get student's current badges
        const currentBadges = studentData[studentRowIndex][4] ? safeJSONParse(studentData[studentRowIndex][4], [], 'badge array') : [];

        // Award badge if not already earned
        if (!currentBadges.includes(badge.badgeId)) {
          currentBadges.push(badge.badgeId);
          const badgeJson = JSON.stringify(currentBadges);
          studentSheet.getRange(studentRowIndex + 1, 5).setValue(badgeJson);
          studentData[studentRowIndex][4] = badgeJson; // Update local cache to prevent overwrite
          placementBadgesAwarded++;

          // Log badge award to Badge_Awards sheet for fan feed
          const badgeAwardsSheet = ss.getSheetByName('Badge_Awards');
          if (badgeAwardsSheet) {
            // Find badge image URL from Config_Badges
            let badgeImageUrl = '';
            for (let j = 1; j < badgesData.length; j++) {
              if (badgesData[j][0] === badge.badgeId) {
                badgeImageUrl = badgesData[j][6] || ''; // Badge_Image_URL column
                break;
              }
            }

            badgeAwardsSheet.appendRow([
              Utilities.getUuid(),          // Award_ID
              new Date(),                   // Timestamp
              topStudent.email,             // Email
              topStudent.name,              // Display_Name
              badge.badgeId,                // Badge_ID
              badge.badgeName,              // Badge_Name
              badgeImageUrl                 // Badge_Image_URL
            ]);
          }

          // Send email notification for badge award
          let badgeDescription = '';
          for (let j = 1; j < badgesData.length; j++) {
            if (badgesData[j][0] === badge.badgeId) {
              badgeDescription = badgesData[j][5] || ''; // Description column
              break;
            }
          }
          sendBadgeAwardEmail(topStudent.email, badge.badgeName, badgeDescription, badgeImageUrl);
        }
      }
    }

    // --- START SUPERFAN AWARDS ---
    // Find all Superfan_Placement badges
    const superfanBadges = [];
    for (let i = 1; i < badgesData.length; i++) {
      if (badgesData[i][3] === 'Superfan_Placement' && badgesData[i][0]) {
        superfanBadges.push({
          badgeId: badgesData[i][0],
          badgeName: badgesData[i][1],
          groupKey: badgesData[i][4],
          imageUrl: badgesData[i][6],
          description: badgesData[i][5]
        });
      }
    }

    let superfanBadgesAwarded = 0;
    if (superfanBadges.length > 0) {
      const superfanDefs = getSuperfanDefinitions();
      const activityToGroups = {};
      Object.keys(superfanDefs).forEach(gk => {
        superfanDefs[gk].codes.forEach(code => {
          if (!activityToGroups[code]) activityToGroups[code] = [];
          activityToGroups[code].push(gk);
        });
      });

      const verifiedData = getVerifiedSubmissionsData();
      const eventData = getEventsData();
      const eventToActivity = _createEventToActivityMap(eventData);

      const studentSuperfanCounts = {}; // email -> { groupKey -> count }
      for (let j = 1; j < verifiedData.length; j++) {
        const email = verifiedData[j][3];
        const eventId = verifiedData[j][4];
        const activityCode = eventToActivity[eventId];
        const groups = activityToGroups[activityCode];
        if (groups) {
          if (!studentSuperfanCounts[email]) studentSuperfanCounts[email] = {};
          groups.forEach(gk => {
            studentSuperfanCounts[email][gk] = (studentSuperfanCounts[email][gk] || 0) + 1;
          });
        }
      }

      for (const badge of superfanBadges) {
        const groupKey = badge.groupKey;
        const groupRankings = [];
        for (let i = 1; i < studentData.length; i++) {
          const email = studentData[i][0];
          if (!email) continue;
          groupRankings.push({
            email: email,
            name: studentData[i][1],
            attendance: (studentSuperfanCounts[email] && studentSuperfanCounts[email][groupKey]) || 0,
            points: studentData[i][2] || 0,
            rowIndex: i
          });
        }

        groupRankings.sort((a, b) => {
          if (b.attendance !== a.attendance) return b.attendance - a.attendance;
          return b.points - a.points;
        });

        if (groupRankings.length > 0 && groupRankings[0].attendance > 0) {
          const winner = groupRankings[0];
          const studentRowIndex = winner.rowIndex;
          const currentBadges = studentData[studentRowIndex][4] ? safeJSONParse(studentData[studentRowIndex][4], [], 'badge array') : [];

          if (!currentBadges.includes(badge.badgeId)) {
            currentBadges.push(badge.badgeId);
            const badgeJson = JSON.stringify(currentBadges);
            studentSheet.getRange(studentRowIndex + 1, 5).setValue(badgeJson);
            studentData[studentRowIndex][4] = badgeJson; // Update local cache to prevent overwrite
            superfanBadgesAwarded++;

            const badgeAwardsSheet = ss.getSheetByName('Badge_Awards');
            if (badgeAwardsSheet) {
              badgeAwardsSheet.appendRow([
                Utilities.getUuid(),
                new Date(),
                winner.email,
                winner.name,
                badge.badgeId,
                badge.badgeName,
                badge.imageUrl
              ]);
            }
            sendBadgeAwardEmail(winner.email, badge.badgeName, badge.description, badge.imageUrl);
          }
        }
      }
    }
    // --- END SUPERFAN AWARDS ---

    // Recalculate all other badges for all students (to catch season-completion badges)
    let studentsProcessed = 0;
    let otherBadgesAwarded = 0;

    for (let i = 1; i < studentData.length; i++) {
      const email = studentData[i][0];
      if (!email) continue; // Skip empty rows

      // Get current badge count
      const beforeBadges = studentData[i][4] ? safeJSONParse(studentData[i][4], [], 'badge array') : [];
      const beforeCount = beforeBadges.length;

      // Recalculate badges
      calculateBadges(email);

      // Check how many badges were added (re-fetch from cache which was just invalidated by calculateBadges)
      const updatedData = getStudentProfilesData();
      const afterBadges = updatedData[i][4] ? safeJSONParse(updatedData[i][4], [], 'badge array') : [];
      const afterCount = afterBadges.length;

      studentsProcessed++;
      otherBadgesAwarded += (afterCount - beforeCount);
    }

    // Build top 3 summary for display
    let top3Summary = '';
    for (let i = 0; i < Math.min(3, seasonRankings.length); i++) {
      const rank = i + 1;
      const student = seasonRankings[i];
      const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : '🥉');
      top3Summary += `${medal} ${rank}. ${student.name} - ${student.seasonPoints} pts\n`;
    }

    // Show completion message
    SpreadsheetApp.getUi().alert(
      `✅ ${activeSeason} Season End - Badges Awarded!\n\n` +
      '📊 Final Season Rankings:\n' + top3Summary + '\n' +
      '🏆 Placement Badges Awarded: ' + placementBadgesAwarded + '\n' +
      '🏅 Superfan Badges Awarded: ' + superfanBadgesAwarded + '\n' +
      '⭐ Other Season Badges Awarded: ' + otherBadgesAwarded + '\n' +
      '👥 Students Processed: ' + studentsProcessed + '\n\n' +
      'All students have been awarded their final season badges!'
    );

  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error processing season-end badges:\n\n' + e.message);
    Logger.log('Error in processSeasonEndBadges: ' + e.message);
  }
}

// ==============================================================================
// BADGE MANAGEMENT FUNCTIONS (ADMIN)
// ==============================================================================

/**
 * Gets all badges from Config_Badges sheet for admin management.
 * @return {Object} Response with badges array
 */
/**
 * Gets all badges from Config_Badges sheet (for public display).
 * Returns array of badge objects.
 * @return {Array} Array of badge objects
 */
function getAllBadges() {
  try {
    // Use cached badge data (reduces Sheets API calls)
    const badgeMap = getBadgeMapCache();
    const badges = [];

    Object.values(badgeMap).forEach(badge => {
      badges.push({
        badgeId: badge.id,
        badgeName: badge.name,
        category: badge.category,
        triggerType: badge.triggerType,
        triggerValue: badge.triggerValue,
        description: badge.description,
        imageUrl: badge.imageUrl
      });
    });

    return badges;
  } catch (e) {
    Logger.log('Error in getAllBadges: ' + e.message);
    return [];
  }
}

function getAllBadgesForAdmin() {
  try {
    // Use cached badge data (reduces Sheets API calls)
    const badgeMap = getBadgeMapCache();

    const badges = [];
    Object.values(badgeMap).forEach(badge => {
      badges.push({
        badgeId: badge.id,
        badgeName: badge.name,
        category: badge.category,
        triggerType: badge.triggerType,
        triggerValue: badge.triggerValue,
        description: badge.description,
        imageUrl: badge.imageUrl
      });
    });

    return {
      status: 'success',
      badges: badges
    };
  } catch (e) {
    Logger.log('Error in getAllBadgesForAdmin: ' + e.message);
    return {
      status: 'error',
      message: 'Error fetching badges: ' + e.message
    };
  }
}

/**
 * Converts badge name to snake_case for Firebase URLs.
 * @param {string} badgeName - Badge name (e.g., "First Timer")
 * @return {string} snake_case version (e.g., "first_timer")
 */
function badgeNameToSnakeCase(badgeName) {
  return badgeName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_'); // Replace spaces with underscores
}

/**
 * Uploads badge image to Google Drive and returns both Drive URL and Firebase URL.
 * @param {string} badgeName - Badge name for filename generation
 * @param {string} base64Image - Base64 encoded image data
 * @param {string} mimeType - Image MIME type (e.g., 'image/svg+xml', 'image/png')
 * @return {Object} Response with Drive URL and Firebase URL
 */
function uploadBadgeImage(badgeName, base64Image, mimeType) {
  try {
    // Get or create Assets_Badges folder
    let parentFolder;
    const parentFolders = DriveApp.getFoldersByName('The Spartan Cup');
    if (parentFolders.hasNext()) {
      parentFolder = parentFolders.next();
    } else {
      parentFolder = DriveApp.createFolder('The Spartan Cup');
    }

    let badgesFolder;
    const badgesFolders = parentFolder.getFoldersByName('Assets_Badges');
    if (badgesFolders.hasNext()) {
      badgesFolder = badgesFolders.next();
    } else {
      badgesFolder = parentFolder.createFolder('Assets_Badges');
    }

    // Generate filename from badge name
    const snakeCaseName = badgeNameToSnakeCase(badgeName);
    const extension = mimeType === 'image/svg+xml' ? '.svg' : (mimeType === 'image/jpeg' ? '.jpg' : '.png');
    const filename = snakeCaseName + extension;

    // Remove base64 prefix if present (e.g., "data:image/png;base64,")
    const base64Data = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

    // Decode base64 to blob
    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType, filename);

    // Check if file already exists and delete it
    const existingFiles = badgesFolder.getFilesByName(filename);
    while (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }

    // Upload new file
    const file = badgesFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Generate Firebase URL (this is where admin will deploy the image)
    const firebaseUrl = BADGE_BASE_URL + filename;

    return {
      status: 'success',
      driveUrl: file.getUrl(),
      driveFileId: file.getId(),
      firebaseUrl: firebaseUrl,
      filename: filename,
      message: 'Image uploaded to Google Drive. Remember to deploy to Firebase!'
    };
  } catch (e) {
    Logger.log('Error in uploadBadgeImage: ' + e.message);
    return {
      status: 'error',
      message: 'Error uploading image: ' + e.message
    };
  }
}

/**
 * Helper function to handle Google Drive backup upload for badge images.
 * @param {string} badgeName - Badge name for filename generation
 * @param {string} imageBase64 - Base64 encoded image data
 * @param {string} imageMimeType - Image MIME type
 * @param {string} existingImageUrl - Existing image URL (optional)
 * @return {string} Image URL to use (Drive URL if image uploaded, Firebase URL if provided, existing if updating without new image)
 */
function _handleImageUrl(firebaseImageUrl, existingImageUrl) {
  // Frontend uploads to Firebase Storage and sends the download URL
  // Backend just uses what the frontend provides

  // If new image URL provided from Firebase, use it
  if (firebaseImageUrl) {
    Logger.log('[_handleImageUrl] Using Firebase Storage URL: ' + firebaseImageUrl);
    return firebaseImageUrl;
  }

  // Otherwise use existing URL (for updates without new image)
  if (existingImageUrl) {
    Logger.log('[_handleImageUrl] Using existing image URL: ' + existingImageUrl);
    return existingImageUrl;
  }

  // No image URL
  Logger.log('[_handleImageUrl] No image URL provided');
  return '';
}

/**
 * Creates a new badge in Config_Badges sheet.
 * @param {Object} badgeData - Badge details
 * @return {Object} Response with status
 */
function createBadge(badgeData) {
  try {
    Logger.log('[createBadge] Received badgeData: ' + JSON.stringify(badgeData));

    // Validate sheet exists
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const badgesSheet = ss.getSheetByName('Config_Badges');
    if (!badgesSheet) {
      Logger.log('[createBadge] ERROR: Config_Badges sheet not found');
      return { status: 'error', message: 'Config_Badges sheet not found' };
    }

    // Validate required fields
    if (!badgeData.badgeName || !badgeData.badgeName.trim()) {
      return { status: 'error', message: 'Badge name is required' };
    }
    if (!badgeData.category || !badgeData.category.trim()) {
      return { status: 'error', message: 'Category is required' };
    }
    if (!badgeData.triggerType || !badgeData.triggerType.trim()) {
      return { status: 'error', message: 'Trigger type is required' };
    }
    if (badgeData.triggerValue === null || badgeData.triggerValue === undefined || badgeData.triggerValue === '') {
      return { status: 'error', message: 'Trigger value is required' };
    }
    if (!badgeData.description || !badgeData.description.trim()) {
      return { status: 'error', message: 'Description is required' };
    }

    // Generate badge ID from cached badge data (reduces Sheets API calls)
    const badgeMap = getBadgeMapCache();
    let maxId = 0;
    Object.keys(badgeMap).forEach(badgeId => {
      const idNum = parseInt(badgeId.replace('badge_', ''));
      if (idNum > maxId) maxId = idNum;
    });
    const newBadgeId = 'badge_' + String(maxId + 1).padStart(3, '0');
    Logger.log('[createBadge] Generated badge ID: ' + newBadgeId);

    // Handle image URL (frontend already uploaded to Firebase Storage)
    const imageUrl = _handleImageUrl(badgeData.imageUrl, null);
    Logger.log('[createBadge] Image URL result: ' + imageUrl);

    // Append new badge row
    const rowData = [
      newBadgeId,
      badgeData.badgeName.trim(),
      badgeData.category.trim(),
      badgeData.triggerType.trim(),
      badgeData.triggerValue,
      badgeData.description.trim(),
      imageUrl
    ];
    Logger.log('[createBadge] Row data to append: ' + JSON.stringify(rowData));
    badgesSheet.appendRow(rowData);
    Logger.log('[createBadge] Row appended successfully to Config_Badges');

    // Clear badge cache
    CacheService.getScriptCache().remove('badge_map_cache');

    return {
      status: 'success',
      message: 'Badge created successfully!',
      badgeId: newBadgeId,
      imageUrl: imageUrl
    };
  } catch (e) {
    Logger.log('[createBadge] ERROR: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: 'error',
      message: 'Error creating badge: ' + e.message
    };
  }
}

/**
 * Updates an existing badge in Config_Badges sheet.
 * @param {string} badgeId - Badge ID to update
 * @param {Object} badgeData - Updated badge details
 * @return {Object} Response with status
 */
function updateBadge(badgeId, badgeData) {
  try {
    Logger.log('[updateBadge] Received badgeId: ' + badgeId + ' | badgeData: ' + JSON.stringify(badgeData));

    // Validate sheet exists
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const badgesSheet = ss.getSheetByName('Config_Badges');
    if (!badgesSheet) {
      Logger.log('[updateBadge] ERROR: Config_Badges sheet not found');
      return { status: 'error', message: 'Config_Badges sheet not found' };
    }

    // Validate required fields
    if (!badgeData.badgeName || !badgeData.badgeName.trim()) {
      return { status: 'error', message: 'Badge name is required' };
    }
    if (!badgeData.category || !badgeData.category.trim()) {
      return { status: 'error', message: 'Category is required' };
    }
    if (!badgeData.triggerType || !badgeData.triggerType.trim()) {
      return { status: 'error', message: 'Trigger type is required' };
    }
    if (badgeData.triggerValue === null || badgeData.triggerValue === undefined || badgeData.triggerValue === '') {
      return { status: 'error', message: 'Trigger value is required' };
    }
    if (!badgeData.description || !badgeData.description.trim()) {
      return { status: 'error', message: 'Description is required' };
    }

    // Use cached badge data to get existing image URL (reduces Sheets API calls)
    const badgeMap = getBadgeMapCache();
    const existingBadge = badgeMap[badgeId];

    if (!existingBadge) {
      Logger.log('[updateBadge] Badge not found: ' + badgeId);
      return {
        status: 'error',
        message: 'Badge not found'
      };
    }

    // Now get sheet reference and find row for write operation
    const badgesData = badgesSheet.getDataRange().getValues();
    let badgeRow = null;
    for (let i = 1; i < badgesData.length; i++) {
      if (badgesData[i][0] === badgeId) {
        badgeRow = i + 1;
        break;
      }
    }

    if (!badgeRow) {
      Logger.log('[updateBadge] Badge row not found: ' + badgeId);
      return {
        status: 'error',
        message: 'Badge not found'
      };
    }
    Logger.log('[updateBadge] Found badge at row: ' + badgeRow);

    // Use new image URL if provided, otherwise keep existing (frontend already uploaded to Firebase)
    const existingUrl = existingBadge.imageUrl;
    Logger.log('[updateBadge] Existing image URL: ' + existingUrl);
    const imageUrl = _handleImageUrl(badgeData.imageUrl, existingUrl);
    Logger.log('[updateBadge] Final image URL: ' + imageUrl);

    // Update badge row
    const rowData = [
      badgeId,
      badgeData.badgeName.trim(),
      badgeData.category.trim(),
      badgeData.triggerType.trim(),
      badgeData.triggerValue,
      badgeData.description.trim(),
      imageUrl
    ];
    Logger.log('[updateBadge] Row data to update: ' + JSON.stringify(rowData));
    badgesSheet.getRange(badgeRow, 1, 1, 7).setValues([rowData]);
    Logger.log('[updateBadge] Row updated successfully to Config_Badges');

    // Clear badge cache
    CacheService.getScriptCache().remove('badge_map_cache');

    return {
      status: 'success',
      message: 'Badge updated successfully!',
      imageUrl: imageUrl
    };
  } catch (e) {
    Logger.log('[updateBadge] ERROR: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: 'error',
      message: 'Error updating badge: ' + e.message
    };
  }
}

/**
 * Deletes a badge from Config_Badges sheet.
 * @param {string} badgeId - Badge ID to delete
 * @return {Object} Response with status
 */
function deleteBadge(badgeId) {
  try {
    // Use cached badge data to verify badge exists (reduces Sheets API calls)
    const badgeMap = getBadgeMapCache();
    if (!badgeMap[badgeId]) {
      return {
        status: 'error',
        message: 'Badge not found'
      };
    }

    // Now get sheet reference and find row for delete operation
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const badgesSheet = ss.getSheetByName('Config_Badges');
    const badgesData = badgesSheet.getDataRange().getValues();

    // Find badge row
    let badgeRow = null;
    for (let i = 1; i < badgesData.length; i++) {
      if (badgesData[i][0] === badgeId) {
        badgeRow = i + 1;
        break;
      }
    }

    if (!badgeRow) {
      return {
        status: 'error',
        message: 'Badge not found'
      };
    }

    // Delete row
    badgesSheet.deleteRow(badgeRow);

    // Clear badge cache
    CacheService.getScriptCache().remove('badge_map_cache');

    return {
      status: 'success',
      message: 'Badge deleted successfully!'
    };
  } catch (e) {
    Logger.log('Error in deleteBadge: ' + e.message);
    return {
      status: 'error',
      message: 'Error deleting badge: ' + e.message
    };
  }
}

/**
 * Downloads a badge image from Google Drive for deployment to Firebase.
 * @param {string} badgeId - Badge ID
 * @return {Object} Response with file data
 */
function downloadBadgeForDeploy(badgeId) {
  try {
    // Use cached badge data to get badge name (reduces Sheets API calls)
    const badgeMap = getBadgeMapCache();
    const badge = badgeMap[badgeId];

    if (!badge) {
      return { status: 'error', message: 'Badge not found' };
    }

    const badgeName = badge.name;

    // Find file in Drive
    const snakeCaseName = badgeNameToSnakeCase(badgeName);
    const parentFolders = DriveApp.getFoldersByName('The Spartan Cup');
    if (!parentFolders.hasNext()) {
      return { status: 'error', message: 'Drive folder not found' };
    }

    const parentFolder = parentFolders.next();
    const badgesFolders = parentFolder.getFoldersByName('Assets_Badges');
    if (!badgesFolders.hasNext()) {
      return { status: 'error', message: 'Assets_Badges folder not found' };
    }

    const badgesFolder = badgesFolders.next();

    // Try both .svg and .png
    let file = null;
    const svgFiles = badgesFolder.getFilesByName(snakeCaseName + '.svg');
    if (svgFiles.hasNext()) {
      file = svgFiles.next();
    } else {
      const pngFiles = badgesFolder.getFilesByName(snakeCaseName + '.png');
      if (pngFiles.hasNext()) {
        file = pngFiles.next();
      }
    }

    if (!file) {
      return { status: 'error', message: 'Badge image file not found in Drive' };
    }

    return {
      status: 'success',
      downloadUrl: file.getDownloadUrl(),
      filename: file.getName()
    };
  } catch (e) {
    Logger.log('Error in downloadBadgeForDeploy: ' + e.message);
    return {
      status: 'error',
      message: 'Error downloading badge: ' + e.message
    };
  }
}
