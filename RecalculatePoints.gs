/**
 * RecalculatePoints.gs
 *
 * One-time utility script to recalculate student points from scratch.
 * This fixes any point discrepancies caused by the cache timing bug.
 *
 * How it works:
 * 1. Reads all verified submissions and sums points per student
 * 2. Reads all badge awards and sums badge points per student
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

    // Show confirmation dialog
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      'Recalculate All Student Points',
      'This will recalculate all student points from scratch based on:\n' +
      '• Verified submissions (Submissions_Verified sheet)\n' +
      '• Badge awards (Config_Badges sheet)\n\n' +
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

    if (!studentSheet || !verifiedSheet || !badgesSheet) {
      ui.alert('ERROR: Required sheets not found. Check spreadsheet schema.');
      return;
    }

    // Read all data
    const studentData = studentSheet.getDataRange().getValues();
    const verifiedData = verifiedSheet.getDataRange().getValues();
    const badgesData = badgesSheet.getDataRange().getValues();

    // Calculate updates
    const result = calculateStudentPointsUpdates(studentData, verifiedData, badgesData);
    const updates = result.updates;
    const studentsUpdated = result.studentsUpdated;

    // Batch update all student points (efficient single call)
    if (updates.length > 0) {
      // Updates correspond to row 2 onwards (index 2-3 in 0-indexed terms? No, row indices)
      // studentData[1] is row 2. updates[0] is for row 2.
      // Range starts at row 2, col 3 (Season_Points), numRows = updates.length, numCols = 2
      studentSheet.getRange(2, 3, updates.length, 2).setValues(updates);
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
      'All student points have been recalculated from:\n' +
      '• Verified submissions (' + (verifiedData.length - 1) + ' total)\n' +
      '• Badge awards\n\n' +
      'Check Student_Profiles sheet to verify points are now accurate.',
      ui.ButtonSet.OK
    );

  } catch (e) {
    Logger.log('ERROR in recalculateAllStudentPoints: ' + e.message + ' | Stack: ' + e.stack);
    SpreadsheetApp.getUi().alert('❌ Error: ' + e.message);
  }
}

/**
 * Calculates student points updates based on verified submissions and badges.
 * Extracted logic for easier testing and cleaner code.
 *
 * @param {Array<Array<any>>} studentData - Data from Student_Profiles sheet
 * @param {Array<Array<any>>} verifiedData - Data from Submissions_Verified sheet
 * @param {Array<Array<any>>} badgesData - Data from Config_Badges sheet
 * @returns {Object} { updates: Array<Array<number>>, studentsUpdated: number }
 */
function calculateStudentPointsUpdates(studentData, verifiedData, badgesData) {
  // Build badge points map (Badge_ID -> points)
  const badgePointsMap = {};
  for (let i = 1; i < badgesData.length; i++) {
    const badgeId = badgesData[i][0]; // Badge_ID
    const pointsBase = badgesData[i][7] || 0; // Badge_Points_Base
    const pointsMultiplier = badgesData[i][8] || 1.0; // Badge_Points_Multiplier
    badgePointsMap[badgeId] = Math.round(pointsBase * pointsMultiplier);
  }

  // Calculate points for each student
  const studentPointsMap = {}; // Email -> {submissionPoints, badgePoints, totalPoints}

  // Step 1: Calculate submission points
  for (let i = 1; i < verifiedData.length; i++) {
    const email = verifiedData[i][3]; // Email column
    const points = verifiedData[i][9] || 0; // Points_Total column (column J, index 9)

    if (!email) continue;

    if (!studentPointsMap[email]) {
      studentPointsMap[email] = {submissionPoints: 0, badgePoints: 0, totalPoints: 0};
    }

    studentPointsMap[email].submissionPoints += points;
  }

  // Step 2: Calculate badge points
  for (let i = 1; i < studentData.length; i++) {
    const email = studentData[i][0]; // Email column
    const badgesJson = studentData[i][4]; // Badges_Earned column (JSON array)

    if (!email) continue;

    // Initialize if needed
    if (!studentPointsMap[email]) {
      studentPointsMap[email] = {submissionPoints: 0, badgePoints: 0, totalPoints: 0};
    }

    // Parse badges and calculate points
    // safeJSONParse is assumed to be globally available from Config.gs or similar
    const earnedBadges = safeJSONParse(badgesJson, [], 'badges array');
    for (const badgeId of earnedBadges) {
      const badgePoints = badgePointsMap[badgeId] || 0;
      studentPointsMap[email].badgePoints += badgePoints;
    }
  }

  // Step 3: Calculate total points
  for (const email in studentPointsMap) {
    studentPointsMap[email].totalPoints =
      studentPointsMap[email].submissionPoints +
      studentPointsMap[email].badgePoints;
  }

  // Step 4: Prepare batch updates
  let studentsUpdated = 0;
  const updates = [];

  for (let i = 1; i < studentData.length; i++) {
    const email = studentData[i][0];

    if (email) {
      const points = studentPointsMap[email] || {submissionPoints: 0, badgePoints: 0, totalPoints: 0};

      const seasonPoints = points.totalPoints;
      const allTimePoints = points.totalPoints;

      updates.push([seasonPoints, allTimePoints]);
      studentsUpdated++;
    } else {
       // Preserve existing values for rows without email
       // Columns 2 and 3 in studentData correspond to indices 2 and 3 (Season_Points, All_Time_Points)
       updates.push([studentData[i][2], studentData[i][3]]);
    }
  }

  return { updates, studentsUpdated };
}
