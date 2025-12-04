/**
 * Submissions.gs
 *
 * Submission management functions for The Spartan Cup.
 * Handles photo upload, submission creation, duplicate detection,
 * and admin queue management for pending submissions.
 *
 * Key Functions:
 * - submitEvent(): Creates new submission with photo
 * - resubmitEvent(): Overwrites existing pending submission
 * - savePhotoToDrive(): Handles photo upload to Google Drive
 * - getAdminQueue(): Fetches paginated pending submissions for admin review
 * - findPendingSubmission/findVerifiedSubmission(): Duplicate detection helpers
 */

/**
 * Utility function to find a pending submission.
 * Uses cached pending submissions data to reduce API calls.
 */
function findPendingSubmission(email, eventId) {
  const data = getPendingSubmissionsData();
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === email && data[i][3] === eventId) {
      return { row: i + 1, photoId: data[i][5] };
    }
  }
  return null;
}

/**
 * Utility function to find a verified submission.
 * Uses cached verified submissions data to reduce API calls.
 */
function findVerifiedSubmission(email, eventId) {
  const data = getVerifiedSubmissionsData();
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === email && data[i][4] === eventId) {
      return { row: i + 1 };
    }
  }
  return null;
}

/**
 * Utility function to save the uploaded photo to Google Drive with optimizations.
 * Handles base64-encoded image data from client with compression already applied.
 * @param {string} photoBlob - Base64-encoded photo data (data:image/jpeg;base64,...)
 * @param {string} eventId - The event ID for file organization
 * @param {string} email - User email for file naming
 * @return {Object} {id, url} - File ID and shareable URL
 */
function savePhotoToDrive(photoBlob, eventId, email) {
  try {
    let parentFolder;
    const parentFolders = DriveApp.getFoldersByName('The Spartan Cup');
    if (parentFolders.hasNext()) {
      parentFolder = parentFolders.next();
    } else {
      parentFolder = DriveApp.createFolder('The Spartan Cup');
    }

    // Get active season for folder naming
    const activeSeason = getActiveSeason();
    const seasonFolderName = `Submissions_${activeSeason}_25-26`;

    let submissionFolder;
    const submissionFolders = parentFolder.getFoldersByName(seasonFolderName);
    if (submissionFolders.hasNext()) {
      submissionFolder = submissionFolders.next();
    } else {
      submissionFolder = parentFolder.createFolder(seasonFolderName);
    }

    // Parse base64 data URL
    const contentType = photoBlob.split(';')[0].replace('data:', '');
    const base64Data = photoBlob.split(',')[1];
    const bytes = Utilities.base64Decode(base64Data);

    // Verify reasonable file size (max 5MB to prevent quota issues)
    const fileSizeMB = bytes.length / (1024 * 1024);
    if (fileSizeMB > 5) {
      throw new Error(`Photo too large (${fileSizeMB.toFixed(1)}MB). Max 5MB allowed.`);
    }

    const blob = Utilities.newBlob(bytes, contentType, `SUB_${eventId}_${email}_${new Date().getTime()}.jpg`);
    const file = submissionFolder.createFile(blob);
    file.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);

    // Use Google Drive export URL format for embedding in web pages
    const fileId = file.getId();
    const exportUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

    // Logger.log(`Photo saved: ${fileSizeMB.toFixed(1)}MB for event ${eventId} by ${email}`);

    return { id: fileId, url: exportUrl };
  } catch (e) {
    // Logger.log('Error saving photo to Drive: ' + e.message);
    throw e;
  }
}

/**
 * Internal helper to resolve event code with a location-based fallback.
 * This reduces code duplication between submitEvent and resubmitEvent.
 * @param {string} eventCode - The event code from the form.
 * @param {object} location - The location object from the form.
 * @returns {object} { status: 'success', eventCode: '...' } or { status: 'error', message: '...' }
 */
function _getEventCodeWithFallback(eventCode, location) {
  // If eventCode is provided, use it
  if (eventCode && eventCode.trim() !== '') {
    return { status: 'success', eventCode: eventCode };
  }

  // Fallback to auto-detection if location is available
  if (location && location.lat && location.lon) {
    Logger.log(`[Submission] No eventCode provided, attempting auto-detection with location: ${JSON.stringify(location)}`);
    const closestEvent = getClosestEvent(location.lat, location.lon);
    if (closestEvent.status === 'success') {
      Logger.log(`[Submission] Auto-detected event: ${closestEvent.eventCode}`);
      return { status: 'success', eventCode: closestEvent.eventCode };
    } else {
      Logger.log(`[Submission] Auto-detection failed: ${closestEvent.message}`);
      return { status: 'error', message: closestEvent.message };
    }
  }

  // If no event code and no location, return an error
  return { status: 'error', message: 'No event selected. Please enable location and try again from the Check-In button.' };
}


/**
 * STEP 1: Called when a user first hits "Submit".
 * Takes eventCode (not eventId in URL) and validates everything at once.
 */
function submitEvent(formObject, photoBlob) {
  const email = Session.getActiveUser().getEmail();

  try {
    // Resolve event code with fallback
    const eventCodeResolution = _getEventCodeWithFallback(formObject.eventCode, formObject.location);
    if (eventCodeResolution.status === 'error') {
      return { status: 'error', message: eventCodeResolution.message };
    }
    const eventCode = eventCodeResolution.eventCode;

    // Unified validation: code + location + time
    const validation = validateEventSubmission(eventCode, formObject.location, Date.now());
    if (!validation.valid) {
      return { status: 'error', message: validation.message };
    }

    const eventId = validation.eventId;

    // Check for duplicate submissions
    if (findVerifiedSubmission(email, eventId)) {
      return { status: 'error', message: 'Your submission for this event has already been verified by an admin and cannot be changed.' };
    }
    if (findPendingSubmission(email, eventId)) {
      return { status: 'pending_conflict', message: 'This will delete your current submission for this event. Do you want to proceed?' };
    }

    const file = savePhotoToDrive(photoBlob, eventId, email);

    const pendingSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Submissions_Pending');
    pendingSheet.appendRow([
      Utilities.getUuid(), new Date(), email, eventId,
      file.url, file.id, JSON.stringify(formObject.location),
      formObject.theme, formObject.notes
    ]);

    // Clear pending submissions cache since we added a new submission
    const cache = CacheService.getScriptCache();
    cache.remove('pending_submissions_data');

    return { status: 'success', message: 'Submission received! You can view it in your "My History" page.' };

  } catch (e) {
    Logger.log(e);
    return { status: 'error', message: `An error occurred: ${e.message}` };
  }
}

/**
 * STEP 2: Called only if the user confirms an overwrite.
 */
function resubmitEvent(formObject, photoBlob) {
  const email = Session.getActiveUser().getEmail();

  try {
    // Resolve event code with fallback
    const eventCodeResolution = _getEventCodeWithFallback(formObject.eventCode, formObject.location);
    if (eventCodeResolution.status === 'error') {
      return { status: 'error', message: eventCodeResolution.message };
    }
    const eventCode = eventCodeResolution.eventCode;

    // Unified validation: code + location + time
    const validation = validateEventSubmission(eventCode, formObject.location, Date.now());
    if (!validation.valid) {
      return { status: 'error', message: validation.message };
    }

    const eventId = validation.eventId;
    const oldSubmission = findPendingSubmission(email, eventId);

    if (oldSubmission) {
      try {
        DriveApp.getFileById(oldSubmission.photoId).setTrashed(true);
      } catch (e) {
        Logger.log(`Could not find old photo to delete: ${oldSubmission.photoId}`);
      }
      SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Submissions_Pending').deleteRow(oldSubmission.row);
    }

    const file = savePhotoToDrive(photoBlob, eventId, email);

    const pendingSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Submissions_Pending');
    pendingSheet.appendRow([
      Utilities.getUuid(), new Date(), email, eventId,
      file.url, file.id, JSON.stringify(formObject.location),
      formObject.theme, formObject.notes
    ]);

    // Clear pending submissions cache since we modified submissions
    const cache = CacheService.getScriptCache();
    cache.remove('pending_submissions_data');

    return { status: 'success', message: 'Your previous submission has been replaced.' };

  } catch (e) {
    Logger.log(e);
    return { status: 'error', message: `An error occurred: ${e.message}` };
  }
}

// --- 4. ADMIN FUNCTIONS -------------------------------------------------

/**
 * Fetches all pending submissions for admin review.
 * Only accessible to users in the Config_Admins sheet.
 * @return {Array} Array of pending submissions with student and event details
 */
/**
 * Gets paginated admin queue of pending submissions.
 * @param {number} page - Page number (1-indexed)
 * @param {number} itemsPerPage - Items per page (default: 20)
 * @return {Object} Paginated queue with metadata
 */
function getAdminQueue(page = 1, itemsPerPage = 20) {
  const email = Session.getActiveUser().getEmail();
  // Logger.log('getAdminQueue called by: ' + email + ', page: ' + page);

  // Check if user is admin
  const adminEmails = getAdminEmails();
  if (!adminEmails.includes(email.toLowerCase())) {
    // Logger.log('Access denied for: ' + email);
    return { status: "error", message: "Access denied. You are not an admin." };
  }

  try {
    // Get pending submissions using cached data (reduces Sheets API calls)
    const pendingData = getPendingSubmissionsData();
    // Logger.log('Pending submissions data retrieved: ' + pendingData.length + ' rows');

    // Get event details map (cached)
    const eventMap = getEventMapCache();
    // Logger.log('Event map retrieved from cache');

    // Build full queue (skip empty rows from cleared submissions)
    const fullQueue = [];
    for (let i = 1; i < pendingData.length; i++) {
      // Skip empty rows (cleared submissions)
      if (!pendingData[i][0] || pendingData[i][0] === '') {
        continue;
      }

      const eventInfo = eventMap[pendingData[i][3]] || { name: 'Unknown', sportArt: 'Other', date: 'N/A', isSpotlightGame: false };

      // Determine if location data is present
      const locationJson = pendingData[i][6]; // Column G (Location_Data_JSON) is index 6
      let hasLocationData = false;
      if (locationJson && locationJson.trim() !== '' && locationJson !== '{}') {
        try {
          const loc = JSON.parse(locationJson);
          if (loc && loc.lat && loc.lon) {
            hasLocationData = true;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      fullQueue.push({
        submissionId: pendingData[i][0],
        email: pendingData[i][2],
        eventId: pendingData[i][3],
        eventName: eventInfo.name,
        sportArt: eventInfo.sportArt,
        eventDate: (eventInfo.date instanceof Date) ? eventInfo.date.toLocaleDateString() : eventInfo.date,
        photoUrl: pendingData[i][4],
        photoId: pendingData[i][5],
        dressedForTheme: pendingData[i][7] || false,
        notes: pendingData[i][8] || '',
        timestamp: new Date(pendingData[i][1]).toISOString(),
        isSpotlightGame: eventInfo.isSpotlightGame || false,
        hasLocationData: hasLocationData
      });
    }
    // Logger.log('Full queue built: ' + fullQueue.length + ' items');

    // Paginate results
    const totalPages = Math.ceil(fullQueue.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedQueue = fullQueue.slice(startIndex, endIndex);

    return {
      status: "success",
      queue: paginatedQueue,
      pagination: {
        page: page,
        itemsPerPage: itemsPerPage,
        totalItems: fullQueue.length,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };

  } catch (e) {
    // Logger.log('Error in getAdminQueue: ' + e.message);
    return {
      status: "error",
      message: "Error fetching admin queue: " + e.message
    };
  }
}
