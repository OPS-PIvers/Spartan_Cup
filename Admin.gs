/**
 * Admin.gs
 *
 * Admin action functions for The Spartan Cup.
 * Handles approval and denial of student event submissions.
 * Updates student points, calculates badges, and sends notifications.
 *
 * Key Functions:
 * - approveSubmission(): Approves a pending submission, awards points, calculates badges
 * - denySubmission(): Denies a pending submission with optional reason
 *
 * Security: All functions validate admin status via getAdminEmails() before execution.
 */

/**
 * Approves a pending submission and moves it to Submissions_Verified.
 * Also updates student's points in Student_Profiles.
 * @param {string} submissionId - The submission ID to approve
 * @param {number} basePoints - Base points to award
 * @param {number} themeBonus - Bonus points if theme was dressed
 * @param {number} spotlightMultiplier - Spotlight event multiplier
 */
function approveSubmission(submissionId, basePoints, themeBonus, spotlightMultiplier) {
  const email = Session.getActiveUser().getEmail();

  // Check if user is admin
  if (!getAdminEmails().includes(email.toLowerCase())) {
    return { status: "error", message: "Access denied. You are not an admin." };
  }

  try {
    // Get cache instance once and reuse throughout function (reduces API calls)
    const cache = CacheService.getScriptCache();

    // Use cached pending submissions data (reduces Sheets API calls)
    const pendingData = getPendingSubmissionsData();
    let submissionRow = null;
    let submissionInfo = null;

    for (let i = 1; i < pendingData.length; i++) {
      if (pendingData[i][0] === submissionId) {
        submissionRow = i + 1;
        submissionInfo = pendingData[i];
        break;
      }
    }

    if (!submissionRow) {
      return { status: "error", message: "Submission not found." };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Validate required sheets exist before attempting operations
    const pendingSheet = ss.getSheetByName('Submissions_Pending');
    if (!pendingSheet) {
      return { status: "error", message: "CRITICAL: Submissions_Pending sheet not found. Check spreadsheet schema." };
    }

    // Calculate total points
    const pointsTheme = themeBonus || (submissionInfo[7] ? 25 : 0); // Default theme bonus
    const pointsMultiplier = spotlightMultiplier || 1;
    const pointsTotal = Math.round(basePoints * pointsMultiplier + pointsTheme);

    // Move to Submissions_Verified (including photo URL and ID for fan feed)
    const verifiedSheet = ss.getSheetByName('Submissions_Verified');
    if (!verifiedSheet) {
      return { status: "error", message: "CRITICAL: Submissions_Verified sheet not found. Check spreadsheet schema." };
    }
    verifiedSheet.appendRow([
      submissionInfo[0], // Submission_ID
      submissionInfo[1], // Timestamp_Submitted
      new Date(), // Timestamp_Approved
      submissionInfo[2], // Email
      submissionInfo[3], // Event_ID
      email, // Admin_Email
      basePoints, // Points_Base
      pointsTheme, // Points_Theme
      pointsMultiplier, // Points_Spotlight_Multiplier
      pointsTotal, // Points_Total
      submissionInfo[4], // Photo_URL (expired URLs)
      submissionInfo[5] // Photo_ID (permanent - used to regenerate images)
    ]);

    // Clear row from Submissions_Pending (don't delete to avoid "can't delete last row" error)
    const numColumns = pendingSheet.getLastColumn();
    pendingSheet.getRange(submissionRow, 1, 1, numColumns).clearContent();

    // Update Student_Profiles with points
    // Use cached data to find student row (reduces Sheets API calls)
    const studentData = getStudentProfilesData();

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === submissionInfo[2]) {
        // Update season and all-time points
        const newSeasonPoints = (studentData[i][2] || 0) + pointsTotal;
        const newAllTimePoints = (studentData[i][3] || 0) + pointsTotal;

        // Get sheet reference for write operation
        const studentSheet = ss.getSheetByName('Student_Profiles');
        if (!studentSheet) {
          return { status: "error", message: "CRITICAL: Student_Profiles sheet not found. Check spreadsheet schema." };
        }

        // Batch update both points columns in single API call (more efficient)
        studentSheet.getRange(i + 1, 3, 1, 2).setValues([[newSeasonPoints, newAllTimePoints]]);

        break;
      }
    }

    // Clear submission caches since we moved submission from pending to verified
    cache.remove('pending_submissions_data');
    cache.remove('verified_submissions_data');

    // Calculate badges for the student (skip season-end badges during approval - only calculate at season-end)
    calculateBadges(submissionInfo[2], true);

    // Clear student profiles cache since calculateBadges() may have modified badges and points
    cache.remove('student_profiles_data');

    // Get event details from cache for notification
    const eventMap = getEventMapCache();
    const eventInfo = eventMap[submissionInfo[3]] || { eventName: 'Event' };

    // Send approval email to student
    sendApprovalEmail(
      submissionInfo[2], // studentEmail
      eventInfo.eventName,
      basePoints,
      pointsTheme,
      pointsMultiplier
    );

    return {
      status: "success",
      message: "Submission approved! " + pointsTotal + " points awarded."
    };

  } catch (e) {
    Logger.log('ERROR in approveSubmission: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: "error",
      message: "Error approving submission: " + e.message
    };
  }
}

/**
 * Denies a pending submission and archives to Submissions_Denied.
 * Sends denial notification email to student with reason.
 * @param {string} submissionId - The submission ID to deny
 * @param {string} reason - Reason for denial (stock reason or custom)
 * @param {boolean} isResubmittable - If true, allows student to resubmit (returns to Pending). If false, archives permanently.
 */
function denySubmission(submissionId, reason, isResubmittable) {
  const email = Session.getActiveUser().getEmail();

  // Check if user is admin
  if (!getAdminEmails().includes(email.toLowerCase())) {
    return { status: "error", message: "Access denied. You are not an admin." };
  }

  try {
    // Use cached pending submissions data (reduces Sheets API calls)
    const pendingData = getPendingSubmissionsData();
    let submissionRow = null;
    let submissionInfo = null;

    for (let i = 1; i < pendingData.length; i++) {
      if (pendingData[i][0] === submissionId) {
        submissionRow = i + 1;
        submissionInfo = pendingData[i];
        break;
      }
    }

    if (!submissionRow) {
      return { status: "error", message: "Submission not found." };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Validate required sheets exist before attempting operations
    const pendingSheet = ss.getSheetByName('Submissions_Pending');
    if (!pendingSheet) {
      return { status: "error", message: "CRITICAL: Submissions_Pending sheet not found. Check spreadsheet schema." };
    }

    // If resubmittable: just clear from pending and notify (student will need to resubmit fresh)
    // If not resubmittable: move to Submissions_Denied for record keeping
    if (!isResubmittable) {
      const deniedSheet = ss.getSheetByName('Submissions_Denied');
      if (deniedSheet) {
        deniedSheet.appendRow([
          submissionInfo[0], // Submission_ID
          submissionInfo[1], // Timestamp_Submitted
          new Date(), // Timestamp_Denied
          submissionInfo[2], // Email
          submissionInfo[3], // Event_ID
          email, // Admin_Email
          reason || "No reason provided", // Denial_Reason
          false, // Is_Resubmittable
          submissionInfo[4], // Photo_URL
          submissionInfo[5] // Photo_ID
        ]);
      } else {
        Logger.log('WARNING: Submissions_Denied sheet not found. Denial not archived.');
      }

      // Optionally delete photo from Drive
      try {
        DriveApp.getFileById(submissionInfo[5]).setTrashed(true);
      } catch (e) {
        // File may have already been deleted
      }
    } else {
      // For resubmittable denials, still log to Submissions_Denied but mark as resubmittable
      const deniedSheet = ss.getSheetByName('Submissions_Denied');
      if (deniedSheet) {
        deniedSheet.appendRow([
          submissionInfo[0], // Submission_ID
          submissionInfo[1], // Timestamp_Submitted
          new Date(), // Timestamp_Denied
          submissionInfo[2], // Email
          submissionInfo[3], // Event_ID
          email, // Admin_Email
          reason || "No reason provided", // Denial_Reason
          true, // Is_Resubmittable
          submissionInfo[4], // Photo_URL
          submissionInfo[5] // Photo_ID
        ]);
      }
      // Don't delete photo for resubmittable - student might reference it
    }

    // Clear row from Submissions_Pending (don't delete to avoid "can't delete last row" error)
    const numColumns = pendingSheet.getLastColumn();
    pendingSheet.getRange(submissionRow, 1, 1, numColumns).clearContent();

    // Clear pending submissions cache since we modified the sheet
    const cache = CacheService.getScriptCache();
    cache.remove('pending_submissions_data');

    // Get event details for email notification
    const eventMap = getEventMapCache();
    const eventInfo = eventMap[submissionInfo[3]] || { eventName: 'Event' };

    // Send denial email to student (always sent, regardless of preferences)
    sendDenialEmail(
      submissionInfo[2], // studentEmail
      eventInfo.eventName,
      reason || "Your submission did not meet the requirements.",
      isResubmittable || false
    );

    return {
      status: "success",
      message: "Submission denied. " + (isResubmittable ? "Student can resubmit." : "Archived."),
      reason: reason
    };

  } catch (e) {
    Logger.log('ERROR in denySubmission: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: "error",
      message: "Error denying submission: " + e.message
    };
  }
}
