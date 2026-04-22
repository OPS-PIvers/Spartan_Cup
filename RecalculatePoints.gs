/**
 * RecalculatePoints.gs
 *
 * One-time utility script to recalculate student points from scratch.
 * This fixes any point discrepancies caused by the cache timing bug or season transitions.
 *
 * How it works:
 * 1. Reads all verified submissions and sums points per student
 *    - allTimePoints: sums ALL verified submissions regardless of season
 *    - seasonPoints: sums ONLY submissions belonging to the current active season
 *      (determined via Submissions_Verified.Event_ID → Events.Activity_Code → Activities_Data.Season)
 * 2. Reads all badge awards and sums badge points per student (included in both totals)
 * 3. Updates Student_Profiles with accurate totals
 *
 * Run from: Spartan Cup Admin menu → "Recalculate All Student Points"
 */

/**
 * Recalculates points for all students from verified submissions and badges.
 * This is a one-time admin function to fix point discrepancies.
 * Can be run from the Admin menu.
 */
function recalculateAllStudentPoints() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const activeSeason = getActiveSeason();

    // Show confirmation dialog
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      'Recalculate All Student Points',
      'This will recalculate all student points from scratch based on:\n' +
      '• Verified submissions (Submissions_Verified sheet)\n' +
      '• Badge awards (Config_Badges sheet)\n\n' +
      'Current active season: ' + activeSeason + '\n' +
      'Season points will be recalculated from ' + activeSeason + ' submissions only.\n' +
      'All-time points will be recalculated from ALL submissions.\n\n' +
      'Current points will be OVERWRITTEN with accurate totals.\n\n' +
      'Continue?',
      ui.ButtonSet.YES_NO
    );

    if (response !== ui.Button.YES) {
      ui.alert('Operation cancelled.');
      return;
    }

    // Get all required sheets
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const verifiedSheet = ss.getSheetByName('Submissions_Verified');
    const badgesSheet = ss.getSheetByName('Config_Badges');
    const eventsSheet = ss.getSheetByName('Events');
    const activitiesSheet = ss.getSheetByName('Activities_Data');

    if (!studentSheet || !verifiedSheet || !badgesSheet || !eventsSheet || !activitiesSheet) {
      ui.alert('ERROR: Required sheets not found. Check spreadsheet schema.\n' +
               'Required: Student_Profiles, Submissions_Verified, Config_Badges, Events, Activities_Data');
      return;
    }

    // Read all data
    const studentData = studentSheet.getDataRange().getValues();
    const verifiedData = verifiedSheet.getDataRange().getValues();
    const badgesData = badgesSheet.getDataRange().getValues();
    const eventsData = eventsSheet.getDataRange().getValues();
    const activitiesData = activitiesSheet.getDataRange().getValues();

    // Build Event_ID → Activity_Code lookup (Events col A=index 0, col B=index 1)
    const eventToActivity = {};
    for (let i = 1; i < eventsData.length; i++) {
      const eventId = eventsData[i][0];
      const activityCode = eventsData[i][1];
      if (eventId) eventToActivity[eventId] = activityCode;
    }

    // Build Activity_Code → Season lookup (Activities_Data col A=index 0, col C=index 2)
    const activityToSeason = {};
    for (let i = 1; i < activitiesData.length; i++) {
      const activityCode = activitiesData[i][0];
      const season = activitiesData[i][2];
      if (activityCode) activityToSeason[activityCode] = season;
    }

    // Build badge points map (Badge_ID -> points)
    const badgePointsMap = {};
    for (let i = 1; i < badgesData.length; i++) {
      const badgeId = badgesData[i][0]; // Badge_ID
      const pointsBase = badgesData[i][7] || 0; // Badge_Points_Base
      const pointsMultiplier = badgesData[i][8] || 1.0; // Badge_Points_Multiplier
      badgePointsMap[badgeId] = Math.round(pointsBase * pointsMultiplier);
    }

    // Calculate points for each student
    const studentPointsMap = {}; // Email -> {allTimeSubmissionPoints, seasonSubmissionPoints, badgePoints}

    // Step 1: Calculate submission points (split by season)
    for (let i = 1; i < verifiedData.length; i++) {
      const email = verifiedData[i][3]; // Email column (index 3)
      const eventId = verifiedData[i][4]; // Event_ID column (index 4)
      const points = verifiedData[i][9] || 0; // Points_Total column (index 9)

      if (!email) continue;

      if (!studentPointsMap[email]) {
        studentPointsMap[email] = { allTimeSubmissionPoints: 0, seasonSubmissionPoints: 0, badgePoints: 0 };
      }

      // Every verified submission contributes to all-time
      studentPointsMap[email].allTimeSubmissionPoints += points;

      // Only submissions from the current active season contribute to season points
      const activityCode = eventToActivity[eventId];
      const eventSeason = activityCode ? activityToSeason[activityCode] : null;
      if (eventSeason === activeSeason) {
        studentPointsMap[email].seasonSubmissionPoints += points;
      }
    }

    // Step 2: Calculate badge points from Student_Profiles.Badges_Earned
    for (let i = 1; i < studentData.length; i++) {
      const email = studentData[i][0]; // Email column
      const badgesJson = studentData[i][4]; // Badges_Earned column (JSON array)

      if (!email) continue;

      if (!studentPointsMap[email]) {
        studentPointsMap[email] = { allTimeSubmissionPoints: 0, seasonSubmissionPoints: 0, badgePoints: 0 };
      }

      const earnedBadges = safeJSONParse(badgesJson, [], 'badges array');
      for (const badgeId of earnedBadges) {
        studentPointsMap[email].badgePoints += (badgePointsMap[badgeId] || 0);
      }
    }

    // Step 3: Update Student_Profiles sheet
    let studentsUpdated = 0;
    const updates = [];

    for (let i = 1; i < studentData.length; i++) {
      const email = studentData[i][0];

      if (!email) continue;

      const data = studentPointsMap[email] || { allTimeSubmissionPoints: 0, seasonSubmissionPoints: 0, badgePoints: 0 };

      // All-time = all submissions + all badges
      // Season = current-season submissions + all badges (badges always apply to the current season, matching live behavior)
      const allTimePoints = data.allTimeSubmissionPoints + data.badgePoints;
      const seasonPoints = data.seasonSubmissionPoints + data.badgePoints;

      updates.push({
        row: i + 1,
        seasonPoints: seasonPoints,
        allTimePoints: allTimePoints
      });

      studentsUpdated++;
    }

    // Batch update all student points
    for (const update of updates) {
      studentSheet.getRange(update.row, 3, 1, 2).setValues([
        [update.seasonPoints, update.allTimePoints]
      ]);
    }

    // Clear cache to ensure fresh data
    CacheService.getScriptCache().removeAll([
      'student_profiles_data',
      'verified_submissions_data'
    ]);

    // Show completion message with details
    ui.alert(
      '✅ Point Recalculation Complete!',
      'Students Updated: ' + studentsUpdated + '\n\n' +
      'Active Season: ' + activeSeason + '\n' +
      'Verified Submissions: ' + (verifiedData.length - 1) + '\n\n' +
      'Total_Points_Season = ' + activeSeason + ' submissions + badges\n' +
      'Total_Points_AllTime = all submissions + badges\n\n' +
      'Check Student_Profiles sheet to verify the values look correct.',
      ui.ButtonSet.OK
    );

  } catch (e) {
    Logger.log('ERROR in recalculateAllStudentPoints: ' + e.message + ' | Stack: ' + e.stack);
    SpreadsheetApp.getUi().alert('❌ Error: ' + e.message);
  }
}
