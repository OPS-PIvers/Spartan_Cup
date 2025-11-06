/**
 * ==============================================================================
 * THE SPARTAN CUP - SERVER-SIDE LOGIC (Code.gs)
 * ==============================================================================
 *
 * This file contains all server-side logic, including:
 * 1. A setup function to automatically create all spreadsheet tabs, folders, AND
 * all necessary .html files in your project.
 * 2. A `doGet(e)` router to serve the SPA (Single Page App).
 * 3. `include(filename)` function for templating HTML.
 * 4. `getUserDetails()` to pass user info to the client.
 * 5. All submission and backend logic.
 */

// --- GLOBAL CONFIGURATION ---------------------------------------------------
const CAMPUS_GEOFENCE = [
  [44.9702, -93.6300], [44.9702, -93.6180],
  [44.9630, -93.6180], [44.9630, -93.6300],
];

/**
 * Reads admin emails from the Config_Admins sheet.
 * Results are cached for 6 hours to reduce Sheets API calls.
 * @return {string[]} Array of admin email addresses
 */
function getAdminEmails() {
  try {
    // Check cache first (reduces repeated Sheets API calls)
    const cache = CacheService.getScriptCache();
    const cachedEmails = cache.get('admin_emails');
    if (cachedEmails) {
      return JSON.parse(cachedEmails);
    }

    // Cache miss: read from Sheets
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const adminSheet = ss.getSheetByName('Config_Admins');
    const adminData = adminSheet.getDataRange().getValues();
    const adminEmails = [];
    for (let i = 1; i < adminData.length; i++) {
      if (adminData[i][0] && adminData[i][0].trim()) {
        adminEmails.push(adminData[i][0].toLowerCase());
      }
    }

    // Cache for 6 hours (21600 seconds)
    cache.put('admin_emails', JSON.stringify(adminEmails), 21600);

    return adminEmails;
  } catch (e) {
    // Logger.log('Error reading admin emails: ' + e.message);
    return [];
  }
}

/**
 * Gets the current user's display name from the Student_Profiles sheet.
 * Uses cached data if available to avoid redundant Sheets API calls.
 * @return {string} User's display name, or empty string if not found
 */
function getUserDisplayName() {
  const email = Session.getActiveUser().getEmail();

  try {
    // Try to use cached student data first
    const studentData = getStudentProfilesData();

    // Find user and get display name from column B (index 1)
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        return studentData[i][1] || ''; // Return display name or empty string
      }
    }
  } catch (e) {
    // Logger.log('Error reading user display name: ' + e.message);
  }

  return ''; // Default to empty if not found
}

/**
 * Gets the current user's admin status from Student_Profiles isAdmin column (J).
 * @return {boolean} True if user is an admin, false otherwise
 */
function getUserIsAdmin() {
  const email = Session.getActiveUser().getEmail();

  try {
    const studentData = getStudentProfilesData();

    // Find user and get isAdmin status from column J (index 9)
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        // Column J contains the isAdmin formula result (TRUE/FALSE or boolean)
        const isAdminValue = studentData[i][9];
        return isAdminValue === true || isAdminValue === 'TRUE' || isAdminValue === 'True';
      }
    }
  } catch (e) {
    // Logger.log('Error reading user admin status: ' + e.message);
  }

  return false; // Default to false if not found
}

/**
 * Checks if the current user is new (not in Student_Profiles sheet).
 * Used to determine if user should see welcome screen.
 * @return {boolean} True if user is new, false if returning user
 */
function isNewUser() {
  const email = Session.getActiveUser().getEmail();

  try {
    const studentData = getStudentProfilesData();

    // Find user in Student_Profiles
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        // User exists in Student_Profiles = returning user (even if display name empty)
        return false;
      }
    }

    // User not found in sheet = definitely a new user
    return true;
  } catch (e) {
    // Logger.log('Error checking if user is new: ' + e.message);
    // On error, assume returning user to avoid unnecessary welcome screens
    return false;
  }
}

/**
 * Gets all student profile data from cache or Sheets.
 * Caches for 10 minutes to reduce redundant API calls within same session.
 * @return {Array} 2D array of student profile data
 */
function getStudentProfilesData() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'student_profiles_data';
  let cachedData = cache.get(cacheKey);

  if (cachedData) {
    return JSON.parse(cachedData);
  }

  // Cache miss: read from Sheets
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const studentSheet = ss.getSheetByName('Student_Profiles');
  const studentData = studentSheet.getDataRange().getValues();

  // Cache for 10 minutes (600 seconds) for request batching
  cache.put(cacheKey, JSON.stringify(studentData), 600);

  return studentData;
}

/**
 * Gets badge definitions as a map, cached for 24 hours.
 * Badge data is static, so longer cache is appropriate.
 * @return {Object} Map of badge ID to badge object
 */
function getBadgeMapCache() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'badge_map_cache';
  let cachedMap = cache.get(cacheKey);

  if (cachedMap) {
    return JSON.parse(cachedMap);
  }

  // Cache miss: read from Sheets
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const badgesSheet = ss.getSheetByName('Config_Badges');
  const badgesData = badgesSheet.getDataRange().getValues();
  const badgeMap = {};

  for (let i = 1; i < badgesData.length; i++) {
    badgeMap[badgesData[i][0]] = {
      id: badgesData[i][0],
      name: badgesData[i][1],
      category: badgesData[i][2],
      triggerType: badgesData[i][3],
      triggerValue: badgesData[i][4],
      description: badgesData[i][5],
      imageUrl: badgesData[i][6]
    };
  }

  // Cache for 24 hours (86400 seconds) - badge definitions don't change often
  cache.put(cacheKey, JSON.stringify(badgeMap), 86400);

  return badgeMap;
}

/**
 * Gets event details as a map, cached for 1 hour.
 * Events change less frequently than student data, 1-hour cache is appropriate.
 * @return {Object} Map of event ID to event object
 */
function getEventMapCache() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'event_map_cache';
  let cachedMap = cache.get(cacheKey);

  if (cachedMap) {
    return JSON.parse(cachedMap);
  }

  // Cache miss: read from Sheets
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventSheet = ss.getSheetByName('Events');
  const eventData = eventSheet.getDataRange().getValues();
  const eventMap = {};

  for (let i = 1; i < eventData.length; i++) {
    eventMap[eventData[i][0]] = {
      name: eventData[i][2],
      date: eventData[i][3],
      sportArt: eventData[i][1],
      theme: eventData[i][11]
    };
  }

  // Cache for 1 hour (3600 seconds) - events are relatively static
  cache.put(cacheKey, JSON.stringify(eventMap), 3600);

  return eventMap;
}

// --- 1. WEB APP ROUTER (doGet) ----------------------------------------------

/**
 * Escapes a string for safe embedding in JavaScript code.
 * Handles quotes, apostrophes, backslashes, newlines, and other control characters.
 * @param {string} str - The string to escape
 * @return {string} JavaScript-safe escaped string
 */
function escapeJavaScriptString(str) {
  if (str === null || str === undefined) {
    return '';
  }

  return String(str)
    .replace(/\\/g, '\\\\')   // Backslash (must be first!)
    .replace(/"/g, '\\"')      // Double quotes
    .replace(/'/g, "\\'")      // Single quotes/apostrophes
    .replace(/\n/g, '\\n')     // Newlines
    .replace(/\r/g, '\\r')     // Carriage returns
    .replace(/\t/g, '\\t')     // Tabs
    .replace(/\f/g, '\\f')     // Form feeds
    .replace(/\v/g, '\\v')     // Vertical tabs
    .replace(/\u2028/g, '\\u2028')  // Line separator
    .replace(/\u2029/g, '\\u2029'); // Paragraph separator
}

/**
 * Main entry point for the web app. Acts as a router to serve the SPA.
 */
function doGet(e) {
  let page = e.parameter.page || 'profile'; // Default to profile page

  const user = Session.getActiveUser();

  // NEW USER WELCOME SCREEN: Redirect new users to welcome page on first visit
  // This gives time for the Display Name formula in Student_Profiles to populate
  if (page === 'profile' && isNewUser() && !e.parameter.skip_welcome) {
    page = 'welcome';
  }

  // Pass data to the HTML template
  const template = HtmlService.createTemplateFromFile('Index');
  template.page = page; // Tell the template which page to load

  // Escape all string values for safe JavaScript embedding
  const rawEmail = user.getEmail();
  const rawUserName = getUserDisplayName(); // Fetch from Student_Profiles sheet (will be empty until formula populates it)
  const rawUserPhoto = getUserProfilePhoto(rawEmail, rawUserName); // Pass display name for initials

  template.userEmail = escapeJavaScriptString(rawEmail);
  template.userName = escapeJavaScriptString(rawUserName);
  template.userPhoto = escapeJavaScriptString(rawUserPhoto);
  template.isAdmin = getUserIsAdmin(); // Read from Student_Profiles isAdmin column (J)
  template.userSettings = JSON.stringify(getUserSettings()); // Pass settings as JSON string
  template.firebaseWrapperUrl = escapeJavaScriptString('https://the-spartan-cup.web.app/?target=submit');

  // NEW: Accept location from Firebase wrapper via URL parameters
  // These are passed from the wrapper: ?lat=X&lon=Y&acc=Z
  template.userLat = e.parameter.lat || null;
  template.userLon = e.parameter.lon || null;
  template.userAcc = e.parameter.acc || null;

  // AUTO-EVENT DETECTION: If submit page with location but no eventCode, auto-select closest event
  // Initialize as empty strings (not null) for safe template rendering
  template.autoEventCode = '';
  template.autoEventName = '';
  template.autoEventError = '';
  if (page === 'submit' && !e.parameter.eventCode && !e.parameter.event) {
    // User came to submit page without an event (direct from Firebase wrapper)
    if (template.userLat && template.userLon) {
      // Location available - try to auto-select closest event
      const closestEvent = getClosestEvent(parseFloat(template.userLat), parseFloat(template.userLon));
      if (closestEvent.status === 'success') {
        template.autoEventCode = escapeJavaScriptString(closestEvent.eventCode);
        template.autoEventName = escapeJavaScriptString(closestEvent.eventName);
      } else {
        template.autoEventError = escapeJavaScriptString(closestEvent.message);
      }
    } else {
      template.autoEventError = escapeJavaScriptString('Location is required to check in. Please enable location access.');
    }
  }

  // DEBUG LOGGING: Log all template variable values to trace what's breaking JavaScript
  // Logger.log('=== TEMPLATE VARIABLES DEBUG ===');
  // Logger.log('page: ' + page);
  // Logger.log('userEmail: [' + template.userEmail + ']');
  // Logger.log('userName: [' + template.userName + ']');
  // Logger.log('userPhoto: [' + template.userPhoto + ']');
  // Logger.log('isAdmin: ' + template.isAdmin);
  // Logger.log('appUrl: [' + getWebAppUrl() + ']');
  // Logger.log('userLat: ' + template.userLat);
  // Logger.log('userLon: ' + template.userLon);
  // Logger.log('userAcc: ' + template.userAcc);
  // Logger.log('autoEventCode: [' + template.autoEventCode + ']');
  // Logger.log('autoEventName: [' + template.autoEventName + ']');
  // Logger.log('autoEventError: [' + template.autoEventError + ']');
  // Logger.log('userSettings: [' + template.userSettings + ']');

  return template.evaluate()
    .setTitle('The Spartan Cup')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Extracts initials from a display name (first letter of first name + first letter of last name).
 * @param {string} displayName - Full name (e.g., "Pat Ipsum")
 * @return {string} Initials (e.g., "PI")
 */
function extractInitials(displayName) {
  if (!displayName || displayName.trim() === '') {
    return '?';
  }

  const nameParts = displayName.trim().split(/\s+/); // Split on whitespace

  if (nameParts.length === 1) {
    // Single word name: use first letter twice or just first letter
    return nameParts[0].charAt(0).toUpperCase();
  } else {
    // Multiple words: first letter of first and last word
    const firstInitial = nameParts[0].charAt(0).toUpperCase();
    const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
    return firstInitial + lastInitial;
  }
}

/**
 * Gets user's profile photo from Google Drive or generates avatar with initials.
 * @param {string} email - User email
 * @param {string} displayName - User's display name for generating initials
 * @return {string} URL to user's profile photo or avatar with initials
 */
function getUserProfilePhoto(email, displayName) {
  try {
    const parentFolders = DriveApp.getFoldersByName('The Spartan Cup');
    if (parentFolders.hasNext()) {
      const parentFolder = parentFolders.next();
      const profileFolders = parentFolder.getFoldersByName('Profile Pictures');
      if (profileFolders.hasNext()) {
        const folder = profileFolders.next();
        const files = folder.getFilesByName(email + '.jpg');
        if (files.hasNext()) {
          const file = files.next();
          file.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
          return file.getDownloadUrl();
        }
      }
    }
  } catch (e) {
    // Logger.log('Error fetching profile photo: ' + e.message);
  }

  // Fallback: Generate avatar with initials
  const initials = extractInitials(displayName);
  return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(initials) + '&background=1b3b87&color=fff&bold=true&size=96';
}

/**
 * Serves an image file from Google Drive by file ID.
 * Used for embedding submission photos in the admin dashboard.
 * Returns the image as a data URL that can be used in img src attributes.
 * @param {string} fileId - The Google Drive file ID
 * @return {object} Object with data URL or error message
 */
function serveImage(fileId) {
  try {
    if (!fileId) {
      return { status: "error", message: "No file ID provided" };
    }
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    const dataUrl = 'data:' + blob.getContentType() + ';base64,' + base64;
    return { status: "success", dataUrl: dataUrl };
  } catch (e) {
    // Logger.log('Error serving image ' + fileId + ': ' + e.message);
    return { status: "error", message: "Image not found or access denied" };
  }
}

/**
 * Utility function to include HTML content from other files (templating).
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Gets the current user's settings from the Student_Profiles sheet.
 * Settings are stored as JSON in column I (index 8).
 * @return {Object} User settings object with darkMode, notifications, etc.
 */
function getUserSettings() {
  const email = Session.getActiveUser().getEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const studentData = studentSheet.getDataRange().getValues();

    // Find user and get settings from column I (index 8)
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        let settingsJson = studentData[i][8];
        if (settingsJson && settingsJson.toString().trim()) {
          settingsJson = settingsJson.toString().trim();
          // Handle malformed JSON by removing extra quotes if present
          if (settingsJson.startsWith('""') && settingsJson.endsWith('""')) {
            settingsJson = settingsJson.slice(2, -2); // Remove outer quotes
          }
          // Logger.log('Raw settings from sheet: ' + settingsJson);
          try {
            const parsed = JSON.parse(settingsJson);
            // Logger.log('Successfully parsed settings: ' + JSON.stringify(parsed));
            return parsed;
          } catch (parseError) {
            // Logger.log('Failed to parse settings JSON: ' + parseError.message);
            // Logger.log('Malformed JSON was: ' + settingsJson);
          }
        }
      }
    }
  } catch (e) {
    // Logger.log('Error reading user settings: ' + e.message);
  }

  // Return default settings if none found or on error
  const defaults = {
    darkMode: false,
    eventNotifications: true,
    approvalNotifications: true,
    badgeNotifications: true
  };
  // Logger.log('Returning default settings: ' + JSON.stringify(defaults));
  return defaults;
}

/**
 * Saves the current user's settings to the Student_Profiles sheet.
 * Settings are stored as JSON in column I (index 8).
 * @param {Object} settings - Settings object with darkMode, notifications, etc.
 * @return {Object} Confirmation with status
 */
function saveUserSettings(settings) {
  const email = Session.getActiveUser().getEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Logger.log('saveUserSettings called with: ' + JSON.stringify(settings));
  // Logger.log('User email: ' + email);

  try {
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const studentData = studentSheet.getDataRange().getValues();

    // Find user and update settings in column I (index 8)
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        // Logger.log('Found user at row ' + (i + 1));
        const settingsJson = JSON.stringify(settings);
        // Logger.log('Saving JSON: ' + settingsJson);
        studentSheet.getRange(i + 1, 9).setValue(settingsJson); // Column I = column 9
        SpreadsheetApp.flush(); // Force immediate write to sheet
        // Logger.log('Settings saved and flushed successfully');
        return { status: 'success', message: 'Settings saved' };
      }
    }

    // Logger.log('User not found in Student_Profiles sheet');
    return { status: 'error', message: 'User profile not found' };
  } catch (e) {
    // Logger.log('Error saving user settings: ' + e.message);
    return { status: 'error', message: 'Failed to save settings: ' + e.message };
  }
}

/**
 * Gets the current user's profile data to populate the page.
 * Fetches real data from Student_Profiles, Config_Badges, and Submissions_Verified sheets.
 * @return {Object} Profile data including points, rank, badges, leaderboard, and history
 */
function getProfileData() {
  const email = Session.getActiveUser().getEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    // --- FETCH USER PROFILE DATA ---
    // Read DIRECTLY from sheet (not cached) to avoid stale cache on first check
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const studentData = studentSheet.getDataRange().getValues();

    let userProfile = null;
    let userRowIndex = -1;

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        userProfile = {
          email: studentData[i][0],
          displayName: studentData[i][1],
          seasonPoints: studentData[i][2] || 0,
          allTimePoints: studentData[i][3] || 0,
          badgesEarned: studentData[i][4] ? JSON.parse(studentData[i][4]) : [],
          disqualified: studentData[i][7] || false,
          isAdmin: studentData[i][9] === true || studentData[i][9] === 'TRUE' || studentData[i][9] === 'True' // Column J (index 9)
        };
        userRowIndex = i;
        break;
      }
    }

    // If user not in sheet, create a new profile entry
    if (!userProfile) {
      const defaultSettings = { darkMode: false, eventNotifications: true, approvalNotifications: true, badgeNotifications: true };
      studentSheet.appendRow([email, '', 0, 0, JSON.stringify([]), '', '', false, JSON.stringify(defaultSettings)]);

      // Clear the cache since we added a new user
      const cache = CacheService.getScriptCache();
      cache.remove('student_profiles_data');

      // Read the newly added row (will be at the end)
      const updatedData = studentSheet.getDataRange().getValues();
      const newRowIndex = updatedData.length - 1;
      const newRow = updatedData[newRowIndex];

      userProfile = {
        email: newRow[0],
        displayName: newRow[1], // Will have the formula-populated value now
        seasonPoints: 0,
        allTimePoints: 0,
        badgesEarned: [],
        disqualified: false,
        isAdmin: newRow[9] === true || newRow[9] === 'TRUE' || newRow[9] === 'True' // Column J (index 9)
      };

      // Update studentData with the new row included for leaderboard building
      studentData.push(newRow);
    }

    // --- BUILD LEADERBOARDS (Season + All-Time) ---
    const seasonLeaderboard = [];
    const allTimeLeaderboard = [];

    for (let i = 1; i < studentData.length; i++) {
      const student = {
        email: studentData[i][0],
        name: studentData[i][1],
        seasonPoints: studentData[i][2] || 0,
        allTimePoints: studentData[i][3] || 0
      };
      seasonLeaderboard.push(student);
      allTimeLeaderboard.push(student);
    }

    // Sort by points (descending)
    seasonLeaderboard.sort((a, b) => b.seasonPoints - a.seasonPoints);
    allTimeLeaderboard.sort((a, b) => b.allTimePoints - a.allTimePoints);

    // Find user's rank
    let seasonRank = 1;
    let allTimeRank = 1;
    for (let i = 0; i < seasonLeaderboard.length; i++) {
      if (seasonLeaderboard[i].email === email) {
        seasonRank = i + 1;
        break;
      }
    }
    for (let i = 0; i < allTimeLeaderboard.length; i++) {
      if (allTimeLeaderboard[i].email === email) {
        allTimeRank = i + 1;
        break;
      }
    }

    // Build top 5 leaderboards
    const topSeasonLeaderboard = seasonLeaderboard.slice(0, 5).map((student, index) => ({
      rank: index + 1,
      name: student.name,
      points: student.seasonPoints,
      icon: index < 3 ? 'workspace_premium' : 'military_tech',
      color: index === 0 ? 'text-gold' : (index === 1 ? 'text-silver' : (index === 2 ? 'text-bronze' : 'text-gray-400'))
    }));

    const topAllTimeLeaderboard = allTimeLeaderboard.slice(0, 5).map((student, index) => ({
      rank: index + 1,
      name: student.name,
      points: student.allTimePoints,
      icon: index < 3 ? 'workspace_premium' : 'military_tech',
      color: index === 0 ? 'text-gold' : (index === 1 ? 'text-silver' : (index === 2 ? 'text-bronze' : 'text-gray-400'))
    }));

    // --- FETCH BADGES ---
    // Use cached badge data (static, doesn't change frequently)
    const badgeMap = getBadgeMapCache();

    // Map earned badge IDs to full badge objects
    const earnedBadges = userProfile.badgesEarned.map(badgeId => {
      const badge = badgeMap[badgeId];
      if (!badge) return null;
      return {
        name: badge.name,
        description: badge.description,
        imageUrl: badge.imageUrl || 'https://the-spartan-cup.web.app/badges/default-badge.svg', // Use Firebase-hosted badge image
        icon: 'military_tech', // Fallback icon if image fails to load
        color: 'bg-gradient-to-br from-indigo-500 to-purple-400' // Fallback color
      };
    }).filter(b => b !== null);

    // --- FETCH SUBMISSION HISTORY ---
    const verifiedSheet = ss.getSheetByName('Submissions_Verified');
    const verifiedData = verifiedSheet.getDataRange().getValues();
    const userSubmissions = [];

    for (let i = 1; i < verifiedData.length; i++) {
      if (verifiedData[i][3] === email) {
        userSubmissions.push({
          submissionId: verifiedData[i][0],
          timestampSubmitted: new Date(verifiedData[i][1]),
          eventId: verifiedData[i][4],
          pointsBase: verifiedData[i][6] || 0,
          pointsTheme: verifiedData[i][7] || 0,
          pointsMultiplier: verifiedData[i][8] || 0,
          pointsTotal: verifiedData[i][9] || 0
        });
      }
    }

    // Fetch event details for history display (cached)
    const eventMap = getEventMapCache();

    // Build history with event names
    const history = userSubmissions.map(submission => {
      const eventInfo = eventMap[submission.eventId] || { name: 'Unknown Event', date: 'N/A', sportArt: 'Other' };
      return {
        name: eventInfo.name,
        date: eventInfo.date instanceof Date ? eventInfo.date.toLocaleDateString() : eventInfo.date,
        points: submission.pointsTotal,
        status: 'Approved',
        icon: eventInfo.sportArt.toLowerCase().includes('basketball') ? 'sports_basketball' :
               eventInfo.sportArt.toLowerCase().includes('hockey') ? 'sports_hockey' :
               eventInfo.sportArt.toLowerCase().includes('art') || eventInfo.sportArt.toLowerCase().includes('play') ? 'theater_comedy' : 'event',
        color: 'text-primary'
      };
    });

    // Fetch pending submissions for history
    const pendingSheet = ss.getSheetByName('Submissions_Pending');
    const pendingData = pendingSheet.getDataRange().getValues();

    for (let i = 1; i < pendingData.length; i++) {
      if (pendingData[i][2] === email) {
        const eventInfo = eventMap[pendingData[i][3]] || { name: 'Unknown Event', date: 'N/A', sportArt: 'Other' };
        history.push({
          name: eventInfo.name,
          date: new Date(pendingData[i][1]).toLocaleDateString(),
          points: 0,
          status: 'Pending',
          icon: eventInfo.sportArt.toLowerCase().includes('basketball') ? 'sports_basketball' :
                 eventInfo.sportArt.toLowerCase().includes('hockey') ? 'sports_hockey' :
                 eventInfo.sportArt.toLowerCase().includes('art') || eventInfo.sportArt.toLowerCase().includes('play') ? 'theater_comedy' : 'event',
          color: 'text-gray-500'
        });
      }
    }

    // Sort history by date (most recent first)
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    // --- RETURN COMBINED DATA ---
    return {
      seasonPoints: userProfile.seasonPoints,
      seasonRank: seasonRank,
      allTimePoints: userProfile.allTimePoints,
      allTimeRank: allTimeRank,
      badges: earnedBadges,
      leaderboard: topSeasonLeaderboard, // Default to season; will swap on toggle
      allTimeLeaderboard: topAllTimeLeaderboard,
      history: history,
      isAdmin: userProfile.isAdmin // Return admin status from Student_Profiles column J
    };

  } catch (e) {
    // Logger.log('Error in getProfileData: ' + e.message);
    // Return empty/default data on error
    return {
      seasonPoints: 0,
      seasonRank: 0,
      allTimePoints: 0,
      allTimeRank: 0,
      badges: [],
      leaderboard: [],
      allTimeLeaderboard: [],
      history: []
    };
  }
}


// --- 2. SETUP FUNCTIONS (RUN THIS FIRST) ------------------------------------

/**
 * Creates a menu item in the spreadsheet to run the setup functions.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏆 Spartan Cup Admin')
    .addItem('1. Run First-Time Setup (All Files)', 'firstTimeSetup')
    .addItem('2. Generate Sample Submissions (For Testing)', 'generateSampleSubmissions')
    .addItem('3. Clear Cache (Development)', 'clearAllCaches')
    .addToUi();
}

/**
 * Main setup function: Creates Spreadsheet, Folders, and all HTML files.
 */
function firstTimeSetup() {
  setupSpreadsheet();
  setupDriveFolders();
  createHtmlFiles();
  SpreadsheetApp.getUi().alert('✅ Full Setup Complete!\n\nYour spreadsheet, Drive folders, and all HTML files have been created.\n\nDEPLOY this script as a Web App to get started.');
}

/**
 * Creates all necessary Google Drive folders.
 */
function setupDriveFolders() {
  try {
    let parentFolder;
    const parentFolders = DriveApp.getFoldersByName('The Spartan Cup');
    if (parentFolders.hasNext()) {
      parentFolder = parentFolders.next();
    } else {
      parentFolder = DriveApp.createFolder('The Spartan Cup');
    }

    const submissionFolders = parentFolder.getFoldersByName('Submissions_Winter_25-26');
    if (!submissionFolders.hasNext()) {
      parentFolder.createFolder('Submissions_Winter_25-26');
    }

    const assetFolders = parentFolder.getFoldersByName('Assets_Badges');
    if (!assetFolders.hasNext()) {
      parentFolder.createFolder('Assets_Badges');
    }
    
    const profileFolders = parentFolder.getFoldersByName('Profile Pictures');
    if (!profileFolders.hasNext()) {
      parentFolder.createFolder('Profile Pictures');
    }
    
  } catch (e) {
    // Logger.log('Drive Folders already exist or error: ' + e.message);
  }
}

/**
 * Creates and formats the entire Google Sheet backend.
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setName('[The Spartan Cup] - MASTER');

  const sheets = {
    'Student_Profiles': ['Email', 'Display_Name', 'Total_Points_Season', 'Total_Points_AllTime', 'Badges_Earned', 'Loyalty_Stats_JSON', 'Variety_Stats_Set', 'Disqualified', 'Student_Settings'],
    'Activities_Data': ['Activity_Code', 'Activity_Name', 'Season', 'Location_Name', 'Event_Lat', 'Event_Lon'],
    'Events': ['Event_ID', 'Activity_Code', 'Date', 'Start_Time', 'Duration_Hours', 'Is_Spotlight_Game', 'Theme'],
    'Config_Event_Codes': ['Event_Code', 'Activity_Name', 'Location_Name', 'Event_Lat', 'Event_Lon', 'Start_Time', 'Duration_Hours', 'Season'],
    'Config_Active_Season': ['Setting_Name', 'Setting_Value'],
    'Submissions_Pending': ['Submission_ID', 'Timestamp', 'Email', 'Event_ID', 'Photo_URL', 'Photo_ID', 'Location_Data_JSON', 'Dressed_For_Theme', 'Notes'],
    'Submissions_Verified': ['Submission_ID', 'Timestamp_Submitted', 'Timestamp_Approved', 'Email', 'Event_ID', 'Admin_Email', 'Points_Base', 'Points_Theme', 'Points_Spotlight_Multiplier', 'Points_Total', 'Photo_URL'],
    'Config_Badges': ['Badge_ID', 'Badge_Name', 'Category', 'Trigger_Type', 'Trigger_Value', 'Description', 'Badge_Image_URL'],
    'Config_Admins': ['Admin_Email', 'Role']
  };

  Object.keys(sheets).forEach((sheetName, index) => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = (index === 0 && ss.getSheetByName('Sheet1')) ? ss.getSheetByName('Sheet1').setName(sheetName) : ss.insertSheet(sheetName);
    }
    sheet.clear();
    sheet.appendRow(sheets[sheetName]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheets[sheetName].length).setFontWeight('bold');
  });

  // Add sample Activities_Data
  ss.getSheetByName('Activities_Data').appendRow(['GBB', 'Girls Basketball', 'Winter', 'Orono High School Gym', 44.965, -93.625]);
  ss.getSheetByName('Activities_Data').appendRow(['BBB', 'Boys Basketball', 'Winter', 'Orono High School Gym', 44.965, -93.625]);
  ss.getSheetByName('Activities_Data').appendRow(['GVBB', 'Girls Volleyball', 'Fall', 'Orono High School Gym', 44.965, -93.625]);

  // Add sample Events with Activity_Code FK
  ss.getSheetByName('Events').appendRow(['GBB-001', 'GBB', '2025-11-15', '2025-11-15T19:00', 2, true, 'White Out']);

  // Set Config_Active_Season default
  ss.getSheetByName('Config_Active_Season').appendRow(['Active_Season', 'Winter']);

  ss.getSheetByName('Config_Admins').appendRow([Session.getActiveUser().getEmail(), 'Owner']);

  // Rebuild the Config_Event_Codes cache
  refreshEventCodes();
}

/**
 * Refreshes the Config_Event_Codes sheet by joining Events and Activities_Data.
 * This creates a denormalized cache of active event codes with all necessary data.
 * Called after creating new events or changing the active season.
 */
function refreshEventCodes() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Get Activities_Data
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    const activitiesData = activitiesSheet.getDataRange().getValues();
    const activitiesMap = {};
    for (let i = 1; i < activitiesData.length; i++) {
      const code = String(activitiesData[i][0]).trim(); // Ensure code is string and trimmed
      activitiesMap[code] = {
        activityName: activitiesData[i][1],
        season: activitiesData[i][2],
        locationName: activitiesData[i][3],
        eventLat: activitiesData[i][4],
        eventLon: activitiesData[i][5]
      };
    }
    Logger.log(`Activities Map populated: ${JSON.stringify(activitiesMap)}`);

    // Get Events
    const eventsSheet = ss.getSheetByName('Events');
    const eventsData = eventsSheet.getDataRange().getValues();

    // Get Config_Event_Codes sheet
    const configSheet = ss.getSheetByName('Config_Event_Codes');
    configSheet.clear();
    configSheet.appendRow(['Event_Code', 'Activity_Name', 'Location_Name', 'Event_Lat', 'Event_Lon', 'Start_Time', 'Duration_Hours', 'Season']);
    configSheet.setFrozenRows(1);
    configSheet.getRange(1, 1, 1, 8).setFontWeight('bold');

    // Build Config_Event_Codes by joining Events with Activities_Data
    for (let i = 1; i < eventsData.length; i++) {
      const eventId = eventsData[i][0];
      const activityCode = String(eventsData[i][1]).trim(); // Ensure activityCode is string and trimmed
      const startTimeRaw = eventsData[i][7]; // This is already a Date object
      const durationHours = eventsData[i][8];
      const isSpotlightGame = eventsData[i][10];
      const theme = eventsData[i][11];

      Logger.log(`Processing Event ID: ${eventId}, Activity Code: ${activityCode}`);
      Logger.log(`  Raw Start_Time from Events sheet (Date object): ${startTimeRaw}`);

      // Check if startTimeRaw is a valid Date object
      if (!(startTimeRaw instanceof Date) || isNaN(startTimeRaw.getTime())) {
        Logger.log(`  Skipping event ${eventId}: Start_Time is not a valid Date object.`);
        continue; // Skip to next event
      }

      // Format Start_Time for Config_Event_Codes to include time and use Central Time Zone
      const formattedStartTime = Utilities.formatDate(startTimeRaw, 'America/Chicago', 'yyyy-MM-dd HH:mm');

      // Look up activity details
      if (activitiesMap[activityCode]) {
        const activity = activitiesMap[activityCode];
        try {
          configSheet.appendRow([
            eventId,
            activity.activityName,
            activity.locationName,
            activity.eventLat,
            activity.eventLon,
            formattedStartTime, // Use the newly formatted start time
            durationHours,
            activity.season
          ]);
          Logger.log(`  Successfully appended event ${eventId} to Config_Event_Codes.`);
        } catch (appendError) {
          Logger.log(`  Error appending event ${eventId} to Config_Event_Codes: ${appendError.message}`);
        }
      } else {
        Logger.log(`  Activity ${activityCode} NOT found in map. Skipping event ${eventId}.`);
      }
    }

    // Logger.log('Config_Event_Codes refreshed successfully');
  } catch (e) {
    // Logger.log('Error refreshing Config_Event_Codes: ' + e.message);
  }
}

/**
 * Generates sample submissions for testing the admin workflow.
 * Creates sample students, pending submissions, and verified submissions.
 * Safe to run multiple times - clears old test data first.
 */
function generateSampleSubmissions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    // Sample student data
    const sampleStudents = [
      { email: 'testuser1@orono.k12.mn.us', name: 'Sarah Johnson', grade: 12 },
      { email: 'testuser2@orono.k12.mn.us', name: 'Marcus Davis', grade: 11 },
      { email: 'testuser3@orono.k12.mn.us', name: 'Emma Wilson', grade: 10 },
      { email: 'testuser4@orono.k12.mn.us', name: 'James Chen', grade: 11 },
      { email: 'testuser5@orono.k12.mn.us', name: 'Olivia Martinez', grade: 12 },
      { email: 'testuser6@orono.k12.mn.us', name: 'Lucas Thompson', grade: 9 },
      { email: 'testuser7@orono.k12.mn.us', name: 'Sophia Anderson', grade: 10 },
      { email: 'testuser8@orono.k12.mn.us', name: 'Noah Garcia', grade: 11 },
      { email: 'testuser9@orono.k12.mn.us', name: 'Isabella Lee', grade: 12 },
      { email: 'testuser10@orono.k12.mn.us', name: 'Ethan Brown', grade: 9 }
    ];

    // Add students to Student_Profiles (skip if already exist)
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const studentData = studentSheet.getDataRange().getValues();
    const existingEmails = new Set(studentData.slice(1).map(row => row[0]));

    sampleStudents.forEach(student => {
      if (!existingEmails.has(student.email)) {
        studentSheet.appendRow([
          student.email,
          student.name,
          0, // Total_Points_Season (will be updated when submissions approved)
          0, // Total_Points_AllTime
          '', // Badges_Earned
          '{}', // Loyalty_Stats_JSON
          '[]', // Variety_Stats_Set
          false, // Disqualified
          '{}' // Student_Settings
        ]);
      }
    });

    // Placeholder image URL (300x400 placeholder)
    const placeholderImageUrl = 'https://via.placeholder.com/300x400/1b3b87/ffffff?text=Student+Photo';

    // Location data (within campus geofence bounds, slightly varied)
    const locationVariations = [
      { lat: 44.9660, lon: -93.6250 },
      { lat: 44.9670, lon: -93.6240 },
      { lat: 44.9680, lon: -93.6260 },
      { lat: 44.9650, lon: -93.6270 },
      { lat: 44.9665, lon: -93.6220 },
    ];

    // Sample notes (realistic student comments)
    const sampleNotes = [
      'Great game! Amazing support from the crowd.',
      'So excited to be here supporting the team!',
      'Love the white out theme - everyone looked great.',
      'Awesome atmosphere tonight. Go Spartans!',
      'Had a blast at the game with friends.',
      'Best school spirit event of the year!',
      'Supporting our athletes all the way!',
      'Cheering loud for the team!',
      ''
    ];

    // Create 10 pending submissions
    const pendingSheet = ss.getSheetByName('Submissions_Pending');
    const now = new Date();

    // Clear old test submissions first (optional - helps avoid duplicates)
    const pendingDataBefore = pendingSheet.getDataRange().getValues();
    for (let i = pendingDataBefore.length - 1; i > 0; i--) {
      if (pendingDataBefore[i][2] && pendingDataBefore[i][2].includes('testuser')) {
        pendingSheet.deleteRow(i + 1);
      }
    }

    for (let i = 0; i < 10; i++) {
      const student = sampleStudents[i];
      const hoursAgo = Math.floor(Math.random() * 48) + 1; // 1-48 hours ago
      const submissionTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
      const location = locationVariations[i % locationVariations.length];
      const dressedForTheme = Math.random() > 0.3; // 70% chance of theme
      const notes = sampleNotes[Math.floor(Math.random() * sampleNotes.length)];

      pendingSheet.appendRow([
        Utilities.getUuid(), // Submission_ID
        submissionTime, // Timestamp
        student.email, // Email
        'GBB-01', // Event_ID
        placeholderImageUrl, // Photo_URL
        'placeholder_' + i, // Photo_ID
        JSON.stringify(location), // Location_Data_JSON
        dressedForTheme ? 'Yes' : 'No', // Dressed_For_Theme
        notes // Notes
      ]);
    }

    // Create 5 verified submissions (approved examples)
    const verifiedSheet = ss.getSheetByName('Submissions_Verified');

    // Clear old test verified submissions first
    const verifiedDataBefore = verifiedSheet.getDataRange().getValues();
    for (let i = verifiedDataBefore.length - 1; i > 0; i--) {
      if (verifiedDataBefore[i][3] && verifiedDataBefore[i][3].includes('testuser')) {
        verifiedSheet.deleteRow(i + 1);
      }
    }

    const currentAdminEmail = Session.getActiveUser().getEmail();

    for (let i = 0; i < 5; i++) {
      const student = sampleStudents[i];
      const hoursAgo = Math.floor(Math.random() * 72) + 1; // 1-72 hours ago
      const submittedTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
      const approvedTime = new Date(submittedTime.getTime() + Math.floor(Math.random() * 3600000)); // 0-1hr after submission
      const dressedForTheme = Math.random() > 0.3;
      const basePoints = dressedForTheme ? 50 : 50;
      const themeBonus = dressedForTheme ? 25 : 0;
      const spotlightMultiplier = 1.5; // GBB-01 is a spotlight game
      const totalPoints = Math.round((basePoints + themeBonus) * spotlightMultiplier);

      verifiedSheet.appendRow([
        Utilities.getUuid(), // Submission_ID
        submittedTime, // Timestamp_Submitted
        approvedTime, // Timestamp_Approved
        student.email, // Email
        'GBB-01', // Event_ID
        currentAdminEmail, // Admin_Email
        basePoints, // Points_Base
        themeBonus, // Points_Theme
        spotlightMultiplier, // Points_Spotlight_Multiplier
        totalPoints, // Points_Total
        placeholderImageUrl // Photo_URL
      ]);

      // Update student points
      const studentDataCurrent = studentSheet.getDataRange().getValues();
      for (let j = 1; j < studentDataCurrent.length; j++) {
        if (studentDataCurrent[j][0] === student.email) {
          const newSeasonPoints = (studentDataCurrent[j][2] || 0) + totalPoints;
          const newAllTimePoints = (studentDataCurrent[j][3] || 0) + totalPoints;
          studentSheet.getRange(j + 1, 3).setValue(newSeasonPoints);
          studentSheet.getRange(j + 1, 4).setValue(newAllTimePoints);
          break;
        }
      }
    }

    SpreadsheetApp.getUi().alert(
      '✅ Sample Data Generated!\n\n' +
      '• Created 10 sample students\n' +
      '• Added 10 pending submissions (for admin review)\n' +
      '• Added 5 verified submissions (approved examples)\n' +
      '• Updated student points\n\n' +
      'Go to the Admin page to review submissions or check the Student_Profiles sheet to see updated points.'
    );

  } catch (e) {
    // Logger.log('Error generating sample submissions: ' + e.message);
    SpreadsheetApp.getUi().alert('❌ Error: ' + e.message);
  }
}

/**
 * Clears all Apps Script caches. Use this during development when you update
 * spreadsheet data and need changes to reflect immediately in the web app.
 */
function clearAllCaches() {
  try {
    const cache = CacheService.getScriptCache();
    cache.removeAll([
      'admin_emails',
      'student_profiles_data',
      'event_map_cache',
      'badge_map_cache'
    ]);

    SpreadsheetApp.getUi().alert(
      '✅ Cache Cleared!\n\n' +
      'All cached data has been removed.\n' +
      'Refresh the web app to see your spreadsheet changes.'
    );
  } catch (e) {
    // Logger.log('Error clearing cache: ' + e.message);
    SpreadsheetApp.getUi().alert('❌ Error: ' + e.message);
  }
}

/**
 * Creates all the necessary HTML files in the Apps Script project.
 */
function createHtmlFiles() {
  const files = {
    'Index.html': `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Spartan Cup</title>
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <link href="https://fonts.googleapis.com" rel="preconnect"/>
  <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;900&amp;display=swap" rel="stylesheet"/>
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet"/>
  <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
  
  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "primary": "#1b3b87", "secondary": "#b5121b", "light-gray": "#cacbcd",
            "background-light": "#f6f6f8", "background-dark": "#0a1f47",
            "gold": "#FFD700", "silver": "#C0C0C0", "bronze": "#CD7F32",
          },
          fontFamily: { "display": ["Public Sans", "sans-serif"] },
          borderRadius: { "DEFAULT": "0.5rem", "lg": "0.75rem", "xl": "1rem", "full": "9999px" },
        },
      },
    }
  </script>
  <?!= include('CSS'); ?>
</head>

<body class="font-display bg-background-light dark:bg-background-dark">

  <!-- Main App Container -->
  <div class="max-w-md mx-auto bg-background-light dark:bg-background-dark min-h-screen shadow-lg">

    <!-- Header -->
    <header class="sticky top-0 z-10 flex h-16 items-center bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-sm px-4 justify-between border-b border-gray-200 dark:border-gray-800">
      <div class="flex size-10 shrink-0 items-center justify-start">
        <span id="header-back-button" class="material-symbols-outlined text-2xl text-[#111318] dark:text-white cursor-pointer hidden">arrow_back_ios_new</span>
      </div>
      <h1 id="page-title" class="text-lg font-bold leading-tight tracking-[-0.015em] text-[#111318] dark:text-white flex-1 text-center"></h1>
      <div class="flex size-10 shrink-0 items-center justify-end">
        <span id="settings-button" class="material-symbols-outlined text-2xl text-[#111318] dark:text-white cursor-pointer">settings</span>
      </div>
    </header>

    <!-- Page Content Area -->
    <main class="pb-24">
      <?!= include('Page.' + page); ?>
    </main>
  </div>

  <!-- Modals (Hidden by default) -->
  <?!= include('Modals'); ?>

  <!-- Main 4-Tab Navigation Bar -->
  <nav class="fixed bottom-0 left-0 right-0 max-w-md mx-auto h-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-800 flex justify-around">
    <a href="<?= getWebAppUrl() ?>?page=profile" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="profile">
      <span class="material-symbols-outlined text-2xl">person</span><span class="text-xs font-medium">Profile</span>
    </a>
    <a href="<?= getWebAppUrl() ?>?page=history" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="history">
      <span class="material-symbols-outlined text-2xl">event</span><span class="text-xs font-medium">History</span>
    </a>
    <a href="<?= getWebAppUrl() ?>?page=prizes" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="prizes">
      <span class="material-symbols-outlined text-2xl">emoji_events</span><span class="text-xs font-medium">Prizes</span>
    </a>
    <a href="<?= getWebAppUrl() ?>?page=fanfeed" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="fanfeed">
      <span class="material-symbols-outlined text-2xl">dynamic_feed</span><span class="text-xs font-medium">Fan Feed</span>
    </a>
  </nav>

  <!-- Client-side JavaScript -->
  <script>
    // Pass server-side data to client-side JS
    const APP_DATA = {
      page: "<?= page ?>",
      userEmail: "<?= userEmail ?>",
      userName: "<?= userName ?>",
      userPhoto: "<?= userPhoto ?>",
      isAdmin: <?= isAdmin ?>,
      appUrl: "<?= getWebAppUrl() ?>"
    };
  </script>
  <?!= include('JavaScript'); ?>
</body>
</html>`,
    'CSS.html': `<style>
    body {
      font-family: 'display', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      padding-bottom: 80px; 
    }
    .material-symbols-outlined {
      font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24
    }
    .page {
      animation: fadeIn 0.3s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .nav-item.active .material-symbols-outlined { color: #1b3b87; }
    .nav-item.active span { color: #1b3b87; font-weight: 700; }
    #qr-reader video {
      width: 100% !important;
      height: auto !important;
      border-radius: 1.5rem;
    }
    @keyframes scan {
      0% { transform: translateY(0); }
      50% { transform: translateY(calc(280px - 2px)); }
      100% { transform: translateY(0); }
    }
  </style>`,
    'JavaScript.html': `<script>
    // --- STATE & PAGE ROUTING -----------------------------------------------
    let html5QrCode = null;
    let currentProfileData = null; // Store full profile data for leaderboard toggling

    const TITLES = {
      'profile': 'My Profile', 'history': 'Event History', 'prizes': 'Prizes & Awards',
      'fanfeed': 'Fan Feed', 'scanner': 'Scan Event Code', 'submit': 'Submit Attendance',
      'settings': 'Settings', 'all-badges': 'All Badges', 'admin': 'Admin Dashboard'
    };

    /**
     * Main function to navigate between pages using URL parameters
     */
    function navigateToPage(pageName) {
      if (pageName) {
        window.top.location.href = APP_DATA.appUrl + '?page=' + pageName;
      }
    }

    // --- QR SCANNER LOGIC ---------------------------------------------------
    // NOTE: startScanner() and stopScanner() are defined in JavaScript.html
    // Do not duplicate them here to avoid multiple camera initialization

    function enterCodeManually() {
      stopScanner();
      const eventId = prompt("Please enter the 6-digit event code:");
      if (eventId && eventId.length > 3) { // Simple validation
        navigateToPage('submit&event=' + eventId);
      }
    }

    // NOTE: All event listeners and page-specific logic have been moved to JavaScript.html
    // This includes page routing, button event handlers, and modal management

    // --- DATA POPULATION ---
    function updateLeaderboardDisplay(leaderboard) {
      const lbContainer = document.getElementById('leaderboard-container');
      lbContainer.innerHTML = ''; // Clear
      leaderboard.forEach(item => {
        lbContainer.innerHTML += \`
          <div class="flex items-center gap-3 rounded-lg p-3 \${item.rank === 1 ? 'bg-primary/10 dark:bg-primary/20' : ''}">
            <span class="font-bold text-lg \${item.rank === 1 ? 'text-primary dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'} w-5 text-center">\${item.rank}</span>
            <span class="material-symbols-outlined text-2xl \${item.color}">\${item.icon}</span>
            <span class="flex-1 truncate font-medium text-[#111318] dark:text-white">\${item.name}</span>
            <span class="font-bold \${item.rank === 1 ? 'text-primary dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'}">\${item.points} PTS</span>
          </div>\`;
      });
    }

    function populateProfile(data) {
      // Store data for leaderboard toggling
      currentProfileData = data;

      document.getElementById('profile-name').innerText = APP_DATA.userName;
      document.getElementById('profile-email').innerText = APP_DATA.userEmail;
      document.getElementById('profile-points').innerText = data.seasonPoints;
      document.getElementById('profile-rank').innerText = \`#\${data.seasonRank}\`;
      document.getElementById('profile-alltime').innerText = \`\${data.allTimePoints} PTS / Rank #\${data.allTimeRank}\`;

      // Populate Badges
      const badgeContainer = document.getElementById('badge-container');
      badgeContainer.innerHTML = ''; // Clear
      data.badges.forEach(badge => {
        badgeContainer.innerHTML += \`
          <div class="flex flex-col items-center gap-1 shrink-0">
            <div class="flex items-center justify-center w-14 h-14 rounded-full \${badge.color} text-white shadow-md">
              <span class="material-symbols-outlined text-3xl">\${badge.icon}</span>
            </div>
            <span class="text-xs font-medium text-gray-600 dark:text-gray-300">\${badge.name}</span>
          </div>\`;
      });
      badgeContainer.innerHTML += document.getElementById('view-all-badges-template').innerHTML; // Add back the 'View All'
      // Re-add listener for the new 'View All' button
      badgeContainer.querySelector('#view-all-badges-button').addEventListener('click', () => navigateToPage('all-badges'));

      // Populate Leaderboard (season by default)
      updateLeaderboardDisplay(data.leaderboard);
    }
    
    function populateHistory(data) {
      document.getElementById('history-points').innerText = data.seasonPoints;
      const historyContainer = document.getElementById('history-container');
      historyContainer.innerHTML = ''; // Clear
      data.history.forEach(item => {
        let statusColor = item.status === 'Approved' ? 'text-green-600' : (item.status === 'Pending' ? 'text-gray-500' : 'text-red-600');
        historyContainer.innerHTML += \`
          <div class="flex items-center gap-4 rounded-xl bg-white dark:bg-gray-800/50 p-4 shadow-sm \${item.status !== 'Approved' ? 'opacity-60' : ''}">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
              <span class="material-symbols-outlined text-3xl \${item.color}">\${item.icon}</span>
            </div>
            <div class="flex-1">
              <p class="font-bold text-[#111318] dark:text-white">\${item.name}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">\${item.date}</p>
            </div>
            <div class="text-right">
              <p class="text-lg font-bold \${item.color}">\${item.status === 'Approved' ? '+' + item.points + ' PTS' : '+0 PTS'}</p>
              <span class="text-xs font-semibold \${statusColor}">\${item.status}</span>
            </div>
          </div>\`;
      });
    }

    function populateEventDetails(eventData) {
      if (eventData.status === 'error') {
        alert('Error: ' + eventData.message);
        navigateToPage('profile');
        return;
      }

      // Populate event name field
      document.getElementById('event-name').value = eventData.eventName;

      // Store event data for submission
      window.currentEventData = eventData;

      // Optionally show event details like location and theme
      // console.log('Event loaded:', eventData.eventName, 'Theme:', eventData.theme);
    }

    // --- FORM SUBMISSION ---
    let pendingFormData = null;
    let pendingPhotoBlob = null;
    
    function handleFormSubmit(e) {
      e.preventDefault();
      document.getElementById('loading-modal').classList.remove('hidden');
      
      const photoFile = document.getElementById('photo-input').files[0];
      if (!photoFile) {
        alert('Please select a photo!');
        document.getElementById('loading-modal').classList.add('hidden');
        return;
      }
      
      const formData = {
        eventId: new URLSearchParams(window.location.search).get('event'),
        theme: document.getElementById('theme-check').checked,
        notes: document.getElementById('notes').value,
        location: null
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          formData.location = {
            lat: position.coords.latitude, lon: position.coords.longitude, acc: position.coords.accuracy
          };
          
          const reader = new FileReader();
          reader.onload = (e) => {
            const photoBlob = e.target.result;
            pendingFormData = formData;
            pendingPhotoBlob = photoBlob;

            google.script.run
              .withSuccessHandler(handleSubmissionResponse)
              .withFailureHandler(handleFailure)
              .submitEvent(formData, photoBlob);
          };
          reader.readAsDataURL(photoFile);
        },
        (error) => {
          alert(\`Error: Location services are required. \${error.message}\`);
          document.getElementById('loading-modal').classList.add('hidden');
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }

    function handleSubmissionResponse(response) {
      document.getElementById('loading-modal').classList.add('hidden');
      
      if (response.status === "success") {
        alert(response.message);
        navigateToPage('profile');
        
      } else if (response.status === "pending_conflict") {
        document.getElementById('modal-message').innerText = response.message;
        document.getElementById('confirm-modal').classList.remove('hidden');
        // Add logic to modal-proceed to call resubmitEvent
        
      } else if (response.status === "error") {
        alert(response.message);
      }
    }

    function handleFailure(error) {
      document.getElementById('loading-modal').classList.add('hidden');
      alert('A critical error occurred: ' + error.message);
    }
  </script>`,
    'Modals.html': `<!-- Onboarding Modal -->
  <div id="onboarding-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 hidden">
    <div class="bg-background-light dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
      <h3 class="text-2xl font-bold text-primary dark:text-blue-300">Welcome to The Spartan Cup!</h3>
      <p class="py-4 text-gray-600 dark:text-gray-300">Earn points by supporting Orono events!</p>
      <ol class="list-decimal list-inside text-sm space-y-2 text-gray-600 dark:text-gray-300">
        <li>Tap "Scan QR" on your profile to attend an event.</li>
        <li>Scan the event's QR code & submit your photo.</li>
        <li>Earn points, get badges, and climb the leaderboard!</li>
      </ol>
      <p class="text-xs text-secondary dark:text-red-400 bg-secondary/10 p-2 rounded mt-4">
        **Heads Up:** Cheating (fake photos, etc.) will result in disqualification.
      </p>
      <button id="onboarding-agree" class="w-full bg-primary text-white font-bold py-2 px-4 rounded-lg mt-4 active:scale-95 transition-transform">
        I Understand & Agree
      </button>
    </div>
  </div>

  <!-- Confirmation (Overwrite) Modal -->
  <div id="confirm-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
    <div class="bg-background-light dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
      <h3 class="text-lg font-bold text-[#111318] dark:text-white">Are you sure?</h3>
      <p id="modal-message" class="py-4 text-gray-700 dark:text-gray-300">This will delete your current submission for this event. Do you want to proceed?</p>
      <div class="flex justify-end space-x-2">
        <button id="modal-cancel" class="px-4 py-2 rounded bg-gray-200 text-gray-800 font-semibold">Cancel</button>
        <button id="modal-proceed" class="px-4 py-2 rounded bg-secondary text-white font-semibold">Yes, Proceed</button>
      </div>
    </div>
  </div>
  
  <!-- Loading Spinner Modal -->
  <div id="loading-modal" class="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center p-4 z-50 hidden">
    <div class="bg-background-light dark:bg-gray-800 p-6 rounded-lg shadow-xl flex items-center space-x-4">
      <svg class="animate-spin h-6 w-6 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="font-semibold text-gray-600 dark:text-gray-300">Submitting...</span>
    </div>
  </div>`,
    'Page.profile.html': `<div class="p-4 pt-6 @container">
    <div class="flex w-full flex-col gap-4">
      <div class="flex gap-4 items-center">
        <div id="profile-photo" class="bg-center bg-no-repeat aspect-square bg-cover rounded-full h-24 w-24 shrink-0 border-4 border-white dark:border-gray-700 shadow-md" style='background-image: url("https://lh3.googleusercontent.com/a/ACg8ocJ9...[example_url]");'></div>
        <div class="flex flex-col justify-center">
          <p id="profile-name" class="text-[#111318] dark:text-white text-[22px] font-bold leading-tight tracking-[-0.015em]">Student Name</p>
          <p id="profile-email" class="text-[#616f89] dark:text-gray-400 text-base font-normal leading-normal">student.email@domain.com</p>
        </div>
      </div>
    </div>
  </div>
  <div class="px-4 mt-2">
    <h3 class="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Earned Badges</h3>
    <div id="badge-container" class="flex items-center gap-4 overflow-x-auto pb-2 -mb-2">
      <!-- Badges populated by JavaScript -->
      <div class="text-xs text-gray-500">Loading badges...</div>
    </div>
    <!-- This template is grabbed by JS and re-added after populating badges -->
    <template id="view-all-badges-template">
      <div id="view-all-badges-button" class="flex flex-col items-center gap-1 shrink-0 cursor-pointer">
        <div class="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-gray-500 to-gray-400 text-white shadow-md">
          <span class="material-symbols-outlined text-3xl">more_horiz</span>
        </div>
        <span class="text-xs font-medium text-gray-600 dark:text-gray-300">View All</span>
      </div>
    </template>
  </div>
  <div class="flex flex-col gap-3 px-4 mt-6">
    <button id="scan-qr-button" class="flex min-w-[84px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg h-14 px-5 bg-gradient-button text-white text-base font-bold leading-normal tracking-[0.015em] w-full shadow-lg shadow-primary/30 active:scale-95 transition-transform" style="background-image: linear-gradient(to right, #b5121b, #1b3b87)">
      <span class="material-symbols-outlined text-2xl">qr_code_scanner</span>
      <span class="truncate">Scan QR to Earn Points</span>
    </button>
    <button id="event-history-button" class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-gray-200 dark:bg-gray-700/50 text-[#111318] dark:text-white text-base font-bold leading-normal tracking-[0.015em] w-full active:scale-95 transition-transform">
      <span class="truncate">Previously Attended Events &amp; Point Earnings</span>
    </button>
  </div>
  <div class="flex flex-col gap-2 px-4 mt-6">
    <div class="flex w-full flex-col gap-4 rounded-xl p-4 bg-white dark:bg-gray-800/50 shadow-sm">
      <p class="text-base font-bold text-primary dark:text-blue-300 leading-normal">Current Season: Winter 25-26</p>
      <div class="flex">
        <div class="flex-1">
          <p class="text-base font-medium leading-normal text-gray-500 dark:text-gray-400">Points</p>
          <p id="profile-points" class="text-primary dark:text-white tracking-[-0.02em] text-5xl font-black leading-tight">...</p>
        </div>
        <div class="border-l border-gray-200 dark:border-gray-700 mx-4"></div>
        <div class="flex-1">
          <p class="text-base font-medium leading-normal text-gray-500 dark:text-gray-400">Rank</p>
          <p id="profile-rank" class="text-secondary dark:text-red-400 tracking-[-0.02em] text-5xl font-black leading-tight">...</p>
        </div>
      </div>
      <div class="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between items-center text-sm">
        <p class="text-gray-500 dark:text-gray-400 font-medium">All Time:</p>
        <p id="profile-alltime" class="text-gray-600 dark:text-gray-300 font-bold">... PTS / Rank ...</p>
      </div>
    </div>
  </div>
  <div class="mt-4">
    <div class="px-4 pb-3">
      <style> .active-toggle { background-color: white; color: #1b3b87; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1); } .dark .active-toggle { background-color: #374151; color: white; } </style>
      <div id="leaderboard-toggle" class="bg-gray-200 dark:bg-gray-800 p-1 rounded-lg flex items-center">
        <button data-view="season" class="flex-1 py-2 px-3 text-center text-sm font-bold rounded-md active-toggle">Current Season</button>
        <button data-view="all-time" class="flex-1 py-2 px-3 text-center text-sm font-bold rounded-md text-gray-600 dark:text-gray-400">All Time</button>
      </div>
    </div>
    <h3 class="text-[#111318] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] px-4 pb-2 pt-2">Top 5 Spartans</h3>
    <div class="flex flex-col gap-2 px-4">
      <div id="leaderboard-container" class="flex flex-col gap-2 rounded-xl bg-white dark:bg-gray-800/50 p-2 shadow-sm">
        <p class="p-4 text-center text-gray-500">Loading leaderboard...</p>
      </div>
    </div>
  </div>
  <?if (isAdmin) ?>
  <div id="admin-button-container" class="px-4 mt-6">
    <!-- Admin-only button: only renders for admin users -->
    <button id="admin-button" class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-secondary/10 dark:bg-secondary/20 text-secondary dark:text-red-400 text-base font-bold leading-normal tracking-[0.015em] w-full active:scale-95 transition-transform">
      <span class="truncate">Admin Dashboard</span>
    </button>
  </div>
  <?endif?>`,
    'Page.history.html': `<div class="p-4 pt-6">
    <div class="rounded-xl bg-gradient-total-points p-6 text-white shadow-lg shadow-primary/30" style="background-image: linear-gradient(to right, #b5121b, #1b3b87)">
      <p class="text-base font-medium leading-normal opacity-80">Total Points Earned</p>
      <p id="history-points" class="mt-1 tracking-[-0.02em] text-5xl font-black leading-tight">...</p>
    </div>
  </div>
  <div id="history-container" class="flex flex-col gap-3 px-4 mt-4">
    <p class="p-4 text-center text-gray-500">Loading history...</p>
  </div>`,
    'Page.prizes.html': `<div class="p-4 pt-6">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm mb-4">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 mb-2">Prizes & Events</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">Earn points by attending events!</p>
    </div>

    <div class="bg-white dark:bg-gray-800/50 p-4 rounded-xl shadow-sm space-y-4 mb-4">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 border-b-2 border-gray-200 dark:border-gray-700 pb-2">🏆 Season Awards</h2>
      <p class="text-[#111318] dark:text-white">The top 3 fans at the end of the season win!</p>
      <ul class="list-disc list-inside space-y-1 text-[#111318] dark:text-white">
        <li><span class="font-bold">1st Place:</span> [TBD Prize]</li>
        <li><span class="font-bold">2nd Place:</span> [TBD Prize]</li>
        <li><span class="font-bold">3rd Place:</span> [TBD Prize]</li>
      </ul>
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 border-b-2 border-gray-200 dark:border-gray-700 pb-2 mt-6">🏅 Sport Superfan Awards</h2>
      <p class="text-[#111318] dark:text-white text-sm">The top fan for each individual sport or art wins a booster-sponsored prize!</p>
      <div id="sport-categories-container" class="flex flex-wrap gap-2 text-sm">
        <p class="text-gray-500">Loading categories...</p>
      </div>
    </div>

    <h2 class="text-2xl font-bold text-primary dark:text-blue-300 px-4 mb-3">Upcoming Events</h2>
    <div id="events-container" class="space-y-3 px-4">
      <p class="text-center text-gray-500 py-8">Loading events...</p>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      google.script.run.withSuccessHandler(populateEvents).getEventList();
    });

    function populateEvents(response) {
      if (response.status === 'error') {
        document.getElementById('events-container').innerHTML = '<p class="text-center text-red-600">Error loading events</p>';
        return;
      }

      const events = response.events || [];
      const container = document.getElementById('events-container');

      if (events.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">No events scheduled.</p>';
      } else {
        container.innerHTML = '';
        events.forEach(event => {
          const card = document.createElement('div');
          card.className = 'bg-white dark:bg-gray-800/50 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700';
          card.innerHTML = \`
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1">
                <p class="font-bold text-[#111318] dark:text-white text-lg">\${event.eventName}</p>
                <p class="text-sm text-gray-600 dark:text-gray-400">\${event.sportArt}</p>
              </div>
              \${event.isSpotlightGame ? '<span class="bg-secondary/20 text-secondary dark:text-red-400 px-2 py-1 rounded text-xs font-bold">SPOTLIGHT</span>' : ''}
            </div>

            <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
              <p><span class="material-symbols-outlined text-sm align-middle mr-1">event</span>\${typeof event.date === 'string' ? event.date : new Date(event.date).toLocaleDateString()}</p>
              <p><span class="material-symbols-outlined text-sm align-middle mr-1">location_on</span>\${event.locationName || 'TBD'}</p>
              \${event.theme && event.theme !== 'None' ? '<p><span class="material-symbols-outlined text-sm align-middle mr-1">style</span>Theme: ' + event.theme + '</p>' : ''}
            </div>

            <button class="w-full bg-primary text-white font-bold py-2 px-4 rounded-lg active:scale-95 transition-transform text-sm" onclick="navigateToPage('scanner')">
              Scan to Attend
            </button>
          \`;
          container.appendChild(card);
        });
      }

      // Extract and display unique categories
      const categories = new Set();
      events.forEach(event => categories.add(event.sportArt));

      const categoriesContainer = document.getElementById('sport-categories-container');
      if (categories.size === 0) {
        categoriesContainer.innerHTML = '<p class="text-gray-500">No categories</p>';
      } else {
        categoriesContainer.innerHTML = '';
        categories.forEach(category => {
          const tag = document.createElement('span');
          tag.className = 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-300 font-semibold px-3 py-1 rounded-full text-sm';
          tag.innerText = category;
          categoriesContainer.appendChild(tag);
        });
      }
    }
  </script>`,
    'Page.fanfeed.html': `<div class="p-4 pt-6">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm mb-4">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 mb-2">Fan Feed</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">Check out the latest approved event photos from your classmates!</p>
    </div>

    <div id="fanfeed-container" class="space-y-3">
      <p class="text-center text-gray-500 py-8">Loading photos...</p>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      loadFanFeed();
      // Refresh every 10 seconds
      setInterval(loadFanFeed, 10000);
    });

    function loadFanFeed() {
      const container = document.getElementById('fanfeed-container');
      container.innerHTML = '<p class="text-center text-gray-500 py-4">Loading...</p>';

      google.script.run.withSuccessHandler((response) => {
        if (response.status === 'error') {
          container.innerHTML = '<p class="text-center text-red-600">Error loading feed</p>';
          return;
        }

        const photos = response.photos || [];
        if (photos.length === 0) {
          container.innerHTML = '<p class="text-center text-gray-500 py-8">No approved photos yet. Scan an event code to get started!</p>';
          return;
        }

        container.innerHTML = '';
        photos.forEach(photo => {
          const card = document.createElement('div');
          card.className = 'bg-white dark:bg-gray-800/50 rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700';
          card.innerHTML = \`
            <img src="\${photo.photoUrl}" alt="Event photo" class="w-full h-64 object-cover">

            <div class="p-4">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <p class="font-bold text-[#111318] dark:text-white">\${photo.eventName}</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">\${photo.studentEmail}</p>
                </div>
              </div>

              <p class="text-xs text-gray-500 dark:text-gray-500 mb-2">
                <span class="material-symbols-outlined text-xs align-middle">schedule</span>
                \${new Date(photo.timestamp).toLocaleDateString()}
              </p>

              <div class="flex gap-2">
                <div class="flex-1 flex items-center justify-center gap-1 bg-gray-100 dark:bg-gray-700/50 rounded py-2 px-3">
                  <span class="material-symbols-outlined text-sm">favorite</span>
                  <span class="text-sm font-semibold text-gray-600 dark:text-gray-300">\${photo.likes || 0}</span>
                </div>
                <button onclick="toggleLike('\${photo.submissionId}')" class="flex-1 flex items-center justify-center gap-1 bg-primary/10 dark:bg-primary/20 rounded py-2 px-3 active:scale-95 transition-transform">
                  <span class="material-symbols-outlined text-sm">favorite_border</span>
                  <span class="text-sm font-semibold text-primary dark:text-blue-300">Like</span>
                </button>
              </div>
            </div>
          \`;
          container.appendChild(card);
        });
      }).getFanFeed();
    }

    function toggleLike(submissionId) {
      // This can be extended to implement actual like functionality
      // console.log('Liked submission:', submissionId);
    }
  </script>`,
    'Page.scanner.html': `<div class="page fixed inset-0 z-50 bg-background-dark text-white">
    <div class="relative flex h-full min-h-screen w-full flex-col overflow-hidden">
      <div class="relative z-10 flex h-full min-h-screen flex-col">
        <header class="flex items-center justify-between p-4">
          <button id="scanner-close-button" aria-label="Go back" class="flex size-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
            <span class="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
        </header>
        <main class="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <h1 class="text-xl font-bold">Scan Event QR Code</h1>
          <p class="mt-2 text-light-gray">Position the QR code within the frame to check in.</p>
          <div class="relative mt-8 flex aspect-square w-full max-w-[280px] items-center justify-center">
            <div id="qr-reader" class="w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden"></div>
            <div class="scanner-overlay absolute h-[280px] w-[280px] rounded-2xl" style="box-shadow: 0 0 0 9999px rgba(18, 18, 18, 0.7);"></div>
            <div class="absolute w-[280px] h-[280px]">
              <div class="scanning-frame-corner" style="position: absolute; width: 48px; height: 48px; border-style: solid; border-color: #ffffff; top: -4px; left: -4px; border-width: 4px 0 0 4px; border-top-left-radius: 1.75rem;"></div>
              <div class="scanning-frame-corner" style="position: absolute; width: 48px; height: 48px; border-style: solid; border-color: #ffffff; top: -4px; right: -4px; border-width: 4px 4px 0 0; border-top-right-radius: 1.75rem;"></div>
              <div class="scanning-frame-corner" style="position: absolute; width: 48px; height: 48px; border-style: solid; border-color: #ffffff; bottom: -4px; left: -4px; border-width: 0 0 4px 4px; border-bottom-left-radius: 1.75rem;"></div>
              <div class="scanning-frame-corner" style="position: absolute; width: 48px; height: 48px; border-style: solid; border-color: #ffffff; bottom: -4px; right: -4px; border-width: 0 4px 4px 0; border-bottom-right-radius: 1.75rem;"></div>
              <div class="scan-line" style="position: absolute; top: 0; left: 5%; right: 5%; height: 2px; background: linear-gradient(90deg, transparent, rgba(181, 18, 27, 0.8), transparent); box-shadow: 0 0 10px 1px #b5121b; animation: scan 2.5s infinite cubic-bezier(0.4, 0, 0.2, 1);"></div>
            </div>
          </div>
        </main>
        <footer class="flex flex-col items-center gap-6 p-6 pb-12">
          <button id="manual-entry-button" class="flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/30 backdrop-blur-sm px-6 py-4 text-center">
            <span class="material-symbols-outlined text-3xl">edit_document</span>
            <span class="text-sm font-medium">Enter Code Manually</span>
          </button>
        </footer>
      </div>
    </div>
  </div>`,
    'Page.submit.html': `<div class="p-4">
    <form id="submission-form" class="space-y-4">
      <div>
        <label class="font-bold text-[#111318] dark:text-white">Event</label>
        <input type="text" id="event-name" value="Loading event..." readonly class="w-full p-3 border rounded-lg bg-gray-200 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
      </div>
      <div>
        <label class="font-bold text-[#111318] dark:text-white">Take a Photo</label>
        <input type="file" id="photo-input" accept="image/*" capture="environment" required class="w-full text-sm file:mr-4 file:py-3 file:px-5 file:rounded-lg file:border-0 file:font-bold file:bg-primary/10 file:text-primary dark:file:bg-primary/20 dark:file:text-blue-300 hover:file:bg-primary/20">
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Tip: Use your camera! Old photos may be denied.</p>
      </div>
      <div class="flex items-center">
        <input type="checkbox" id="theme-check" class="h-5 w-5 rounded text-primary focus:ring-primary">
        <label for="theme-check" class="ml-2 font-bold text-[#111318] dark:text-white">I'm dressed for the theme!</label>
      </div>
      <div>
        <label for="notes" class="font-bold text-[#111318] dark:text-white">Notes (Optional)</label>
        <textarea id="notes" rows="3" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary dark:bg-gray-800/50 dark:border-gray-700 dark:text-white" placeholder="e.g., My face is painted!"></textarea>
      </div>
      <button type="submit" class="w-full bg-secondary text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors active:scale-95">
        Submit Attendance
      </button>
    </form>
  </div>`,
    'Page.settings.html': `<div class="p-4 pt-6 pb-24">
    <div class="space-y-4">
      <!-- Display Settings -->
      <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
        <h2 class="text-xl font-bold text-[#111318] dark:text-white mb-4">Display Settings</h2>

        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
          <div class="flex-1">
            <p class="font-semibold text-[#111318] dark:text-white">Dark Mode</p>
            <p class="text-sm text-gray-600 dark:text-gray-400">Enable dark theme</p>
          </div>
          <div class="flex items-center">
            <input type="checkbox" id="dark-mode-toggle" class="h-6 w-11 rounded-full bg-gray-300 relative appearance-none cursor-pointer transition-colors" style="background-color: var(--toggle-color, #ccc);">
          </div>
        </div>
      </div>

      <!-- Notification Settings -->
      <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
        <h2 class="text-xl font-bold text-[#111318] dark:text-white mb-4">Notifications</h2>

        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
          <div class="flex-1">
            <p class="font-semibold text-[#111318] dark:text-white">Submission Approved</p>
            <p class="text-sm text-gray-600 dark:text-gray-400">Notify when admin approves</p>
          </div>
          <input type="checkbox" id="notif-approved" class="h-5 w-5 rounded text-primary cursor-pointer" checked>
        </div>

        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
          <div class="flex-1">
            <p class="font-semibold text-[#111318] dark:text-white">New Event Posted</p>
            <p class="text-sm text-gray-600 dark:text-gray-400">Notify about new events</p>
          </div>
          <input type="checkbox" id="notif-events" class="h-5 w-5 rounded text-primary cursor-pointer" checked>
        </div>

        <div class="flex items-center justify-between py-3">
          <div class="flex-1">
            <p class="font-semibold text-[#111318] dark:text-white">Badge Unlocked</p>
            <p class="text-sm text-gray-600 dark:text-gray-400">Notify when you earn badges</p>
          </div>
          <input type="checkbox" id="notif-badges" class="h-5 w-5 rounded text-primary cursor-pointer" checked>
        </div>
      </div>

      <!-- Account Info -->
      <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
        <h2 class="text-xl font-bold text-[#111318] dark:text-white mb-4">Account</h2>

        <div class="space-y-3">
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Email</p>
            <p class="font-semibold text-[#111318] dark:text-white" id="account-email">Loading...</p>
          </div>

          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Name</p>
            <p class="font-semibold text-[#111318] dark:text-white" id="account-name">Loading...</p>
          </div>

          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Account Status</p>
            <p id="account-status" class="font-semibold text-green-600">Active</p>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
        <h2 class="text-xl font-bold text-[#111318] dark:text-white mb-4">About</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400">The Spartan Cup v1.0</p>
        <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">Gamify your school spirit and earn points by supporting Orono events!</p>
      </div>

      <!-- Save Button -->
      <button id="settings-save-btn" class="w-full bg-primary text-white font-bold py-3 px-4 rounded-lg active:scale-95 transition-transform">
        Save Settings
      </button>
    </div>
  </div>

  <style>
    #dark-mode-toggle {
      width: 44px;
      height: 24px;
      padding: 2px;
    }
    #dark-mode-toggle:checked {
      background-color: #1b3b87;
    }
    #dark-mode-toggle::after {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background-color: white;
      top: 2px;
      left: 2px;
      transition: left 0.3s;
    }
    #dark-mode-toggle:checked::after {
      left: 22px;
    }
  </style>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // Load settings
      loadSettings();

      // Account info
      document.getElementById('account-email').innerText = APP_DATA.userEmail;
      document.getElementById('account-name').innerText = APP_DATA.userName;

      // Dark mode toggle
      const darkModeToggle = document.getElementById('dark-mode-toggle');
      const isDarkMode = localStorage.getItem('spartan-cup-dark-mode') === 'true' || document.documentElement.classList.contains('dark');
      darkModeToggle.checked = isDarkMode;
      updateDarkMode(isDarkMode);

      darkModeToggle.addEventListener('change', (e) => {
        updateDarkMode(e.target.checked);
      });

      // Save button
      document.getElementById('settings-save-btn').addEventListener('click', saveSettings);
    });

    function loadSettings() {
      // Load notification settings from localStorage
      document.getElementById('notif-approved').checked = localStorage.getItem('notif-approved') !== 'false';
      document.getElementById('notif-events').checked = localStorage.getItem('notif-events') !== 'false';
      document.getElementById('notif-badges').checked = localStorage.getItem('notif-badges') !== 'false';
    }

    function saveSettings() {
      // Save dark mode
      const isDarkMode = document.getElementById('dark-mode-toggle').checked;
      localStorage.setItem('spartan-cup-dark-mode', isDarkMode);
      updateDarkMode(isDarkMode);

      // Save notification settings
      localStorage.setItem('notif-approved', document.getElementById('notif-approved').checked);
      localStorage.setItem('notif-events', document.getElementById('notif-events').checked);
      localStorage.setItem('notif-badges', document.getElementById('notif-badges').checked);

      // Show confirmation
      const btn = document.getElementById('settings-save-btn');
      const originalText = btn.innerText;
      btn.innerText = '✓ Settings Saved';
      setTimeout(() => {
        btn.innerText = originalText;
      }, 2000);
    }

    function updateDarkMode(isDark) {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('spartan-cup-dark-mode', isDark);
    }
  </script>`,
    'Page.all-badges.html': `<div class="p-4 pt-6">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm mb-4">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 mb-2">All Badges</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">Earn badges by achieving milestones!</p>
    </div>

    <h3 class="text-lg font-bold text-[#111318] dark:text-white px-4 mb-3">Earned Badges</h3>
    <div id="earned-badges-grid" class="grid grid-cols-3 gap-3 px-4 mb-6">
      <p class="col-span-3 text-center text-gray-500 py-8">Loading badges...</p>
    </div>

    <h3 class="text-lg font-bold text-[#111318] dark:text-white px-4 mb-3">Locked Badges</h3>
    <div id="locked-badges-grid" class="grid grid-cols-3 gap-3 px-4">
      <p class="col-span-3 text-center text-gray-500 py-8">Loading badges...</p>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      google.script.run.withSuccessHandler(populateAllBadges).getBadgeData();
    });

    function populateAllBadges(response) {
      if (response.status === 'error') {
        document.getElementById('earned-badges-grid').innerHTML = '<p class="col-span-3 text-center text-red-600">Error loading badges</p>';
        return;
      }

      const earnedBadgeIds = response.earnedBadgeIds || [];
      const allBadges = response.allBadges || [];

      const earnedBadges = allBadges.filter(b => earnedBadgeIds.includes(b.badgeId));
      const lockedBadges = allBadges.filter(b => !earnedBadgeIds.includes(b.badgeId));

      // Populate earned badges
      const earnedGrid = document.getElementById('earned-badges-grid');
      if (earnedBadges.length === 0) {
        earnedGrid.innerHTML = '<p class="col-span-3 text-center text-gray-500 py-4">No badges earned yet. Keep going!</p>';
      } else {
        earnedGrid.innerHTML = '';
        earnedBadges.forEach(badge => {
          earnedGrid.innerHTML += createBadgeCard(badge, true);
        });
      }

      // Populate locked badges
      const lockedGrid = document.getElementById('locked-badges-grid');
      if (lockedBadges.length === 0) {
        lockedGrid.innerHTML = '<p class="col-span-3 text-center text-gray-500 py-4">You\'ve unlocked all badges!</p>';
      } else {
        lockedGrid.innerHTML = '';
        lockedBadges.forEach(badge => {
          lockedGrid.innerHTML += createBadgeCard(badge, false);
        });
      }
    }

    function createBadgeCard(badge, isEarned) {
      const bgColor = isEarned ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-gray-300 dark:bg-gray-600';
      const opacity = isEarned ? '' : 'opacity-50';
      const lockIcon = isEarned ? '' : '<span class="material-symbols-outlined text-2xl absolute top-1 right-1 text-gray-500">lock</span>';

      return \`
        <div class="flex flex-col items-center gap-2 cursor-pointer group" title="\${badge.badgeName}">
          <div class="relative w-16 h-16 rounded-full flex items-center justify-center \${bgColor} \${opacity} shadow-md">
            <span class="material-symbols-outlined text-3xl text-white">achievement</span>
            \${lockIcon}
          </div>
          <p class="text-xs font-semibold text-center text-[#111318] dark:text-white group-hover:text-primary transition">\${badge.badgeName}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 text-center max-w-[70px]">\${badge.description || ''}</p>
        </div>
      \`;
    }
  </script>`,
    'Page.admin.html': `<div class="p-4 pt-6">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm mb-4">
      <h2 class="text-2xl font-bold text-secondary dark:text-red-400 mb-2">Admin Dashboard</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">Review and approve pending student submissions.</p>
    </div>

    <div class="flex gap-2 mb-4 sticky top-16 z-10">
      <button id="admin-refresh-btn" class="flex-1 bg-primary text-white font-bold py-2 px-4 rounded-lg active:scale-95 transition-transform">
        <span class="material-symbols-outlined text-xl align-middle mr-1">refresh</span>Refresh
      </button>
    </div>

    <div id="admin-queue-container" class="space-y-3">
      <p class="text-center text-gray-500 dark:text-gray-400 py-8">Loading pending submissions...</p>
    </div>

    <!-- Submission Approval Modal -->
    <div id="approval-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
      <div class="bg-background-light dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-sm w-full max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-[#111318] dark:text-white mb-4">Approve Submission</h3>

        <div id="approval-submission-details" class="space-y-3 mb-4"></div>

        <div class="space-y-3">
          <div>
            <label class="font-bold text-[#111318] dark:text-white text-sm">Base Points</label>
            <input type="number" id="approval-base-points" value="50" min="0" class="w-full p-2 border rounded-lg bg-gray-100 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white">
          </div>

          <div>
            <label class="flex items-center gap-2">
              <input type="checkbox" id="approval-theme-bonus" class="h-4 w-4 text-primary">
              <span class="font-bold text-[#111318] dark:text-white text-sm">Theme Bonus (+25 pts)</span>
            </label>
          </div>

          <div>
            <label class="flex items-center gap-2">
              <input type="checkbox" id="approval-spotlight-multiplier" class="h-4 w-4 text-primary">
              <span class="font-bold text-[#111318] dark:text-white text-sm">Spotlight Event (2x multiplier)</span>
            </label>
          </div>

          <p id="approval-total-points" class="text-lg font-bold text-primary dark:text-blue-300 text-center py-2">Total: 50 PTS</p>
        </div>

        <div class="flex gap-2 mt-6">
          <button id="approval-cancel-btn" class="flex-1 px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold">Cancel</button>
          <button id="approval-approve-btn" class="flex-1 px-4 py-2 rounded bg-green-600 text-white font-semibold">Approve</button>
        </div>
      </div>
    </div>

    <!-- Denial Reason Modal -->
    <div id="denial-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
      <div class="bg-background-light dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-sm w-full">
        <h3 class="text-lg font-bold text-[#111318] dark:text-white mb-4">Deny Submission</h3>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Are you sure you want to deny this submission?</p>

        <textarea id="denial-reason" placeholder="Optional: Reason for denial" rows="3" class="w-full p-2 border rounded-lg bg-gray-100 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white text-sm"></textarea>

        <div class="flex gap-2 mt-6">
          <button id="denial-cancel-btn" class="flex-1 px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold">Cancel</button>
          <button id="denial-confirm-btn" class="flex-1 px-4 py-2 rounded bg-red-600 text-white font-semibold">Deny</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Store current submission being reviewed
    let currentSubmission = null;

    document.addEventListener('DOMContentLoaded', () => {
      // Load admin queue on page load
      loadAdminQueue();

      // Refresh button
      document.getElementById('admin-refresh-btn').addEventListener('click', loadAdminQueue);

      // Modal close buttons
      document.getElementById('approval-cancel-btn').addEventListener('click', closeApprovalModal);
      document.getElementById('denial-cancel-btn').addEventListener('click', closeDenialModal);

      // Calculate points
      document.getElementById('approval-base-points').addEventListener('change', updateTotalPoints);
      document.getElementById('approval-theme-bonus').addEventListener('change', updateTotalPoints);
      document.getElementById('approval-spotlight-multiplier').addEventListener('change', updateTotalPoints);

      // Approve/Deny buttons
      document.getElementById('approval-approve-btn').addEventListener('click', confirmApproval);
      document.getElementById('denial-confirm-btn').addEventListener('click', confirmDenial);
    });

    function loadAdminQueue() {
      const container = document.getElementById('admin-queue-container');
      container.innerHTML = '<p class="text-center text-gray-500 py-4">Loading...</p>';

      google.script.run.withSuccessHandler((response) => {
        if (response.status === 'error') {
          container.innerHTML = '<p class="text-center text-red-600">' + response.message + '</p>';
          return;
        }

        if (!response.queue || response.queue.length === 0) {
          container.innerHTML = '<p class="text-center text-gray-500 py-8">No pending submissions to review.</p>';
          return;
        }

        container.innerHTML = '';
        response.queue.forEach(submission => {
          const card = document.createElement('div');
          card.className = 'bg-white dark:bg-gray-800/50 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700';
          card.innerHTML = \`
            <div class="flex gap-3 mb-3">
              <img src="\${submission.photoUrl}" alt="Submission" class="w-16 h-16 rounded-lg object-cover">
              <div class="flex-1">
                <p class="font-bold text-[#111318] dark:text-white truncate">\${submission.email}</p>
                <p class="text-sm text-gray-600 dark:text-gray-400">\${submission.eventName}</p>
                <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">\${new Date(submission.timestamp).toLocaleDateString()}</p>
              </div>
            </div>

            <div class="bg-gray-100 dark:bg-gray-700/50 p-2 rounded mb-3 text-sm">
              <p class="font-semibold text-[#111318] dark:text-white">\${submission.sportArt}</p>
              \${submission.dressedForTheme ? '<p class="text-xs text-primary dark:text-blue-300">✓ Dressed for theme</p>' : ''}
              \${submission.notes ? '<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">"' + submission.notes + '"</p>' : ''}
            </div>

            <div class="flex gap-2">
              <button class="flex-1 py-2 px-3 bg-green-600 text-white font-bold rounded-lg text-sm active:scale-95" onclick="openApprovalModal('\${submission.submissionId}', '\${submission.email}', '\${submission.eventName}')">
                Approve
              </button>
              <button class="flex-1 py-2 px-3 bg-red-600 text-white font-bold rounded-lg text-sm active:scale-95" onclick="openDenialModal('\${submission.submissionId}', '\${submission.eventName}')">
                Deny
              </button>
            </div>
          \`;
          container.appendChild(card);
        });
      }).getAdminQueue();
    }

    function openApprovalModal(submissionId, email, eventName) {
      currentSubmission = { submissionId, email, eventName };
      document.getElementById('approval-submission-details').innerHTML = \`
        <div class="text-sm">
          <p><span class="font-bold">Student:</span> \${email}</p>
          <p><span class="font-bold">Event:</span> \${eventName}</p>
        </div>
      \`;
      document.getElementById('approval-modal').classList.remove('hidden');
      updateTotalPoints();
    }

    function closeApprovalModal() {
      document.getElementById('approval-modal').classList.add('hidden');
      currentSubmission = null;
    }

    function updateTotalPoints() {
      const basePoints = parseInt(document.getElementById('approval-base-points').value) || 0;
      const themeBonus = document.getElementById('approval-theme-bonus').checked ? 25 : 0;
      const multiplier = document.getElementById('approval-spotlight-multiplier').checked ? 2 : 1;
      const total = Math.round((basePoints + themeBonus) * multiplier);

      document.getElementById('approval-total-points').innerText = 'Total: ' + total + ' PTS';
    }

    function confirmApproval() {
      const basePoints = parseInt(document.getElementById('approval-base-points').value) || 0;
      const themeBonus = document.getElementById('approval-theme-bonus').checked ? 25 : 0;
      const multiplier = document.getElementById('approval-spotlight-multiplier').checked ? 2 : 1;

      google.script.run.withSuccessHandler((response) => {
        alert(response.message);
        closeApprovalModal();
        loadAdminQueue();
      }).approveSubmission(currentSubmission.submissionId, basePoints, themeBonus, multiplier);
    }

    function openDenialModal(submissionId, eventName) {
      currentSubmission = { submissionId, eventName };
      document.getElementById('denial-reason').value = '';
      document.getElementById('denial-modal').classList.remove('hidden');
    }

    function closeDenialModal() {
      document.getElementById('denial-modal').classList.add('hidden');
      currentSubmission = null;
    }

    function confirmDenial() {
      const reason = document.getElementById('denial-reason').value;
      google.script.run.withSuccessHandler((response) => {
        alert(response.message);
        closeDenialModal();
        loadAdminQueue();
      }).denySubmission(currentSubmission.submissionId, reason);
    }
  </script>`
  };

  Object.keys(files).forEach(filename => {
    // Check if file already exists
    const existingFiles = DriveApp.getFilesByName(filename);
    let found = false;
    while (existingFiles.hasNext()) {
      const file = existingFiles.next();
      if (file.getOwner().getEmail() === Session.getEffectiveUser().getEmail()) {
        found = true;
        break;
      }
    }
    
    // If not found, create it
    if (!found) {
      try {
        // Logger.log('Creating file: ' + filename);
        const blob = Utilities.newBlob(files[filename], 'text/html', filename);
        DriveApp.getRootFolder().createFile(blob);
      } catch (e) {
        // Logger.log(`Failed to create file ${filename}: ${e.message}`);
        // This can fail if it's not in the root folder, but it's the only way
        // to programmatically add files to an Apps Script project.
        // The user may need to create them manually if this fails.
      }
    } else {
      // Logger.log('File already exists: ' + filename);
    }
  });
  
  // After trying to create, we can't be 100% sure they were added to the project
  // So we provide instructions.
  SpreadsheetApp.getUi().alert('HTML File Creation Attempted', 'The script tried to create all .html files. If they do not appear in the editor on the left, please reload this page. If they are still missing, you may need to create them manually and copy the content from the "Code.gs" file.', SpreadsheetApp.getUi().ButtonSet.OK);
}


// --- 3. SUBMISSION LOGIC (STUDENT) ------------------------------------------

/**
 * Returns the web app's URL.
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/** Utility function to find a pending submission. */
function findPendingSubmission(email, eventId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Submissions_Pending');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === email && data[i][3] === eventId) {
      return { row: i + 1, photoId: data[i][5] };
    }
  }
  return null;
}

/** Utility function to find a verified submission. */
function findVerifiedSubmission(email, eventId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Submissions_Verified');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === email && data[i][4] === eventId) {
      return { row: i + 1 };
    }
  }
  return null;
}

/**
 * Gets the currently active season from Config_Active_Season.
 * @return {string} The active season name
 */
function getActiveSeason() {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'active_season';
    const cachedSeason = cache.get(cacheKey);

    if (cachedSeason) {
      return cachedSeason;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const seasonSheet = ss.getSheetByName('Config_Active_Season');
    const seasonData = seasonSheet.getDataRange().getValues();

    // Find the Active_Season row
    for (let i = 1; i < seasonData.length; i++) {
      if (seasonData[i][0] === 'Active_Season') {
        const season = seasonData[i][1];
        cache.put(cacheKey, season, 3600); // Cache for 1 hour
        return season;
      }
    }

    return 'Winter'; // Default to Winter
  } catch (e) {
    // Logger.log('Error reading active season: ' + e.message);
    return 'Winter';
  }
}

/**
 * Sets the active season in Config_Active_Season.
 * Clears cache to ensure updated value is used immediately.
 * @param {string} season - The season to activate
 * @return {Object} Status object with success/error message
 */
function setActiveSeason(season) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const seasonSheet = ss.getSheetByName('Config_Active_Season');
    const seasonData = seasonSheet.getDataRange().getValues();

    // Find and update the Active_Season row
    for (let i = 1; i < seasonData.length; i++) {
      if (seasonData[i][0] === 'Active_Season') {
        seasonSheet.getRange(i + 1, 2).setValue(season);
        // Clear cache to force reload
        CacheService.getScriptCache().remove('active_season');
        CacheService.getScriptCache().remove('active_events_data');
        // Refresh the event codes
        refreshEventCodes();
        return { status: 'success', message: 'Active season updated to ' + season };
      }
    }

    return { status: 'error', message: 'Active_Season setting not found' };
  } catch (e) {
    // Logger.log('Error setting active season: ' + e.message);
    return { status: 'error', message: 'Error updating season: ' + e.message };
  }
}

/**
 * Gets all unique seasons from Activities_Data.
 * @return {string[]} Array of available seasons
 */
function getAvailableSeasons() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    const activitiesData = activitiesSheet.getDataRange().getValues();

    const seasons = new Set();
    for (let i = 1; i < activitiesData.length; i++) {
      if (activitiesData[i][2]) { // Season column
        seasons.add(activitiesData[i][2]);
      }
    }

    return Array.from(seasons).sort();
  } catch (e) {
    // Logger.log('Error getting available seasons: ' + e.message);
    return [];
  }
}

/**
 * Gets all activities with a flag indicating if they belong to a specific season.
 * Used by admin interface to manage season-to-activity assignments.
 * @param {string} season - The season to check against
 * @return {Array} Array of activities with isInSeason flag
 */
function getActivitiesWithSeasonStatus(season) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    const activitiesData = activitiesSheet.getDataRange().getValues();

    const activities = [];
    for (let i = 1; i < activitiesData.length; i++) {
      const code = activitiesData[i][0];
      const name = activitiesData[i][1];
      const activitySeason = activitiesData[i][2];
      const location = activitiesData[i][3];
      const lat = activitiesData[i][4];
      const lon = activitiesData[i][5];

      activities.push({
        activityCode: code,
        activityName: name,
        locationName: location,
        eventLat: lat,
        eventLon: lon,
        isInSeason: (activitySeason === season)
      });
    }

    return activities;
  } catch (e) {
    // Logger.log('Error getting activities with season status: ' + e.message);
    return [];
  }
}

/**
 * Updates season assignments for activities.
 * Takes a season and array of activity codes, assigns all those activities to the season
 * and removes the season from any activities not in the array.
 * @param {string} season - The season name to assign
 * @param {Array} activityCodes - Array of activity codes to assign to this season
 * @return {Object} Status object with success/error message
 */
function updateActivitySeasonAssignments(season, activityCodes) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    const activitiesData = activitiesSheet.getDataRange().getValues();

    // Convert activity codes to a Set for O(1) lookup
    const codeSet = new Set(activityCodes);

    // Update each activity's season assignment
    for (let i = 1; i < activitiesData.length; i++) {
      const code = activitiesData[i][0];
      const currentSeason = activitiesData[i][2];

      // If code is in the list, set its season; otherwise, clear it
      if (codeSet.has(code)) {
        if (currentSeason !== season) {
          activitiesSheet.getRange(i + 1, 3).setValue(season); // Column C is Season
        }
      }
      // Note: We don't remove other seasons - activities can only have one season
      // If an activity isn't in the list for the selected season, it keeps its old season
    }

    // Clear caches
    CacheService.getScriptCache().remove('active_season');
    CacheService.getScriptCache().remove('active_events_data');

    // Refresh the event codes cache
    refreshEventCodes();

    return { status: 'success', message: 'Season assignments updated' };
  } catch (e) {
    // Logger.log('Error updating activity season assignments: ' + e.message);
    return { status: 'error', message: 'Error updating assignments: ' + e.message };
  }
}

/**
 * Creates a new activity in Activities_Data.
 * @param {string} activityCode - Unique activity code (e.g., BBB)
 * @param {string} activityName - Display name (e.g., Boys Basketball)
 * @param {string} locationName - Location name (e.g., Orono High School Gym)
 * @param {number} eventLat - Latitude coordinate
 * @param {number} eventLon - Longitude coordinate
 * @param {string} season - Season name (e.g., Winter)
 * @return {Object} Status object with activityCode
 */
function createNewActivity(activityCode, activityName, locationName, eventLat, eventLon, season) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    const activitiesData = activitiesSheet.getDataRange().getValues();

    // Validate that activity code is unique
    for (let i = 1; i < activitiesData.length; i++) {
      if (activitiesData[i][0] === activityCode) {
        return { status: 'error', message: 'Activity code already exists: ' + activityCode };
      }
    }

    // Validate required fields
    if (!activityCode || !activityName || !locationName || eventLat === null || eventLon === null) {
      return { status: 'error', message: 'All fields are required' };
    }

    // Validate lat/lon are numbers
    const lat = parseFloat(eventLat);
    const lon = parseFloat(eventLon);
    if (isNaN(lat) || isNaN(lon)) {
      return { status: 'error', message: 'Invalid coordinates. Must be valid numbers.' };
    }

    // Add new activity row
    activitiesSheet.appendRow([
      activityCode,
      activityName,
      season || 'Winter', // Default to Winter if not provided
      locationName,
      lat,
      lon
    ]);

    // Clear caches to force refresh
    CacheService.getScriptCache().remove('active_season');
    CacheService.getScriptCache().remove('active_events_data');

    // Refresh event codes
    refreshEventCodes();

    return { status: 'success', message: 'Activity created: ' + activityName, activityCode: activityCode };
  } catch (e) {
    // Logger.log('Error creating new activity: ' + e.message);
    return { status: 'error', message: 'Error creating activity: ' + e.message };
  }
}

/**
 * Gets activity details from Activities_Data by activity code.
 * @param {string} activityCode - The activity code to look up
 * @return {Object} Activity details including name, season, location, lat/lon
 */
function getActivityDetails(activityCode) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    const activitiesData = activitiesSheet.getDataRange().getValues();

    for (let i = 1; i < activitiesData.length; i++) {
      if (activitiesData[i][0] === activityCode) {
        return {
          activityCode: activitiesData[i][0],
          activityName: activitiesData[i][1],
          season: activitiesData[i][2],
          locationName: activitiesData[i][3],
          eventLat: activitiesData[i][4],
          eventLon: activitiesData[i][5]
        };
      }
    }

    return { status: 'error', message: 'Activity not found: ' + activityCode };
  } catch (e) {
    // Logger.log('Error getting activity details: ' + e.message);
    return { status: 'error', message: 'Error fetching activity: ' + e.message };
  }
}

/**
 * Generates the next Event_ID for a given Activity_Code.
 * Uses auto-incrementing number after activity code (e.g., GBB-001, GBB-002).
 * @param {string} activityCode - The activity code to generate ID for
 * @return {string} The next Event_ID
 */
function generateEventId(activityCode) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const eventsSheet = ss.getSheetByName('Events');
    const eventsData = eventsSheet.getDataRange().getValues();

    // Find all event IDs that start with this activity code
    let maxNumber = 0;
    const prefix = activityCode + '-';
    for (let i = 1; i < eventsData.length; i++) {
      const eventId = eventsData[i][0];
      if (eventId.startsWith(prefix)) {
        const number = parseInt(eventId.substring(prefix.length));
        if (!isNaN(number) && number > maxNumber) {
          maxNumber = number;
        }
      }
    }

    // Return next number with zero padding (e.g., 001, 002)
    const nextNumber = String(maxNumber + 1).padStart(3, '0');
    return prefix + nextNumber;
  } catch (e) {
    // Logger.log('Error generating event ID: ' + e.message);
    return activityCode + '-001'; // Default fallback
  }
}

/**
 * Fetches event details from the Events sheet by event ID.
 * Joins with Activities_Data to get full event information.
 * @param {string} eventId - The event ID to look up
 * @return {Object} Event details including name, date, location, theme, etc.
 */
function getEventDetails(eventId) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Events');
    const data = sheet.getDataRange().getValues();

    // Trim whitespace from the input event ID for matching
    const trimmedEventId = String(eventId).trim();

    for (let i = 1; i < data.length; i++) {
      // Trim both sides when comparing (column A is Event_ID)
      if (String(data[i][0]).trim() === trimmedEventId) {
        const activityCode = data[i][1]; // Column B
        const activityDetails = getActivityDetails(activityCode);

        // Check if activity was found
        if (activityDetails.status === 'error') {
          return activityDetails;
        }

        return {
          eventId: data[i][0],
          activityCode: activityCode,
          activityName: activityDetails.activityName,
          sportArt: activityDetails.activityName, // Alias for compatibility
          eventName: activityDetails.activityName, // Alias for compatibility with frontend
          date: data[i][2], // Column C
          locationName: activityDetails.locationName,
          eventLat: activityDetails.eventLat,
          eventLon: activityDetails.eventLon,
          startTime: data[i][3], // Column D
          durationHours: data[i][4], // Column E
          isSpotlightGame: data[i][5] || false, // Column F
          theme: data[i][6] || 'None', // Column G
          season: activityDetails.season,
          isHomeGame: true // All events are home games now
        };
      }
    }

    // Event not found
    return {
      status: 'error',
      message: 'Event not found with ID: ' + eventId
    };
  } catch (e) {
    // Logger.log('Error in getEventDetails: ' + e.message);
    return {
      status: 'error',
      message: 'Error fetching event details: ' + e.message
    };
  }
}

/**
 * Calculates distance between two coordinates using Haversine formula (in meters).
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Gets all currently active events (where current time is within Start_Time + Duration_Hours).
 * @param {number} userLat - Optional: user's latitude for distance calculation
 * @param {number} userLon - Optional: user's longitude for distance calculation
 * @return {Array} Array of events, optionally sorted by distance from user
 */
function getActiveEvents(userLat = null, userLon = null) {
  try {
    // Check cache first for event data (reduced Sheets API calls)
    const cache = CacheService.getScriptCache();
    const cacheKey = 'active_events_data';
    let eventData = cache.get(cacheKey);

    if (!eventData) {
      // Cache miss: read from Sheets
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('Config_Event_Codes');
      if (!sheet) return [];

      const data = sheet.getDataRange().getValues();

      // Get active season for filtering
      const activeSeason = getActiveSeason();

      // Transform and cache the event data
      eventData = [];
      for (let i = 1; i < data.length; i++) {
        // Filter by active season (column G is Season)
        const eventSeason = data[i][7];
        if (eventSeason === activeSeason) {
          eventData.push({
            eventCode: data[i][0],
            eventName: data[i][1],
            locationName: data[i][2],
            eventLat: data[i][3],
            eventLon: data[i][4],
            startTime: data[i][5],
            durationHours: data[i][6],
            season: data[i][7]
          });
        }
      }

      // Cache for 1 hour (3600 seconds) since event times change
      cache.put(cacheKey, JSON.stringify(eventData), 3600);
    } else {
      eventData = JSON.parse(eventData);
    }

    // Get current time and convert to Central Time Zone for consistent comparison
    const now = new Date();
    const nowCentralFormatted = Utilities.formatDate(now, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ss");
    const nowCentral = Utilities.parseDate(nowCentralFormatted, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ss");
    Logger.log(`Current time (Central, parsed): ${nowCentral}`);

    const activeEvents = [];

    for (let i = 0; i < eventData.length; i++) {
      const item = eventData[i];
      Logger.log(`Processing event: ${item.eventName} (${item.eventCode})`);
      Logger.log(`  Raw item.startTime: ${item.startTime} (type: ${typeof item.startTime})`);
      Logger.log(`  item.durationHours: ${item.durationHours}`);

      // Handle different input types: Date objects vs strings
      // Date.toString() produces locale-dependent strings, so use ISO format instead
      let startTimeStr;
      if (typeof item.startTime === 'string') {
        startTimeStr = item.startTime;
      } else if (item.startTime instanceof Date) {
        // Convert Date to ISO string, then extract just the date and time parts
        const isoStr = item.startTime.toISOString();
        // Convert "2025-11-05T16:42:00.000Z" to "2025-11-05 16:42"
        startTimeStr = isoStr.substring(0, 16).replace('T', ' ');
      } else {
        startTimeStr = String(item.startTime);
      }

      Logger.log(`  Converted startTimeStr: ${startTimeStr}`);

      // Parse item.startTime string (e.g., "2025-11-05 16:42") as a Date object in Central Time
      let eventStartTime;
      let eventEndTime;

      try {
        eventStartTime = Utilities.parseDate(startTimeStr, 'America/Chicago', "yyyy-MM-dd HH:mm");
        eventEndTime = new Date(eventStartTime.getTime() + item.durationHours * 60 * 60 * 1000);

        Logger.log(`  Event Start Time (Central, parsed): ${eventStartTime}`);
        Logger.log(`  Event End Time (Central, calculated): ${eventEndTime}`);
      } catch (e) {
        // Log parsing failure for debugging
        Logger.log(`  ERROR: Failed to parse date for event ${item.eventCode}: ${e.message}`);
        Logger.log(`  Skipping this event due to date parsing error.`);
        continue; // Skip this event and move to next
      }

      // Check if current time is within the event window
      if (nowCentral >= eventStartTime && nowCentral <= eventEndTime) {
        Logger.log(`  Event ${item.eventName} is ACTIVE.`);
        const event = {
          eventCode: item.eventCode,
          eventName: item.eventName,
          locationName: item.locationName,
          eventLat: item.eventLat,
          eventLon: item.eventLon,
          startTime: eventStartTime,
          endTime: eventEndTime,
          durationHours: item.durationHours,
          distance: null
        };

        // Calculate distance if user location provided
        if (userLat !== null && userLon !== null) {
          event.distance = calculateDistance(userLat, userLon, item.eventLat, item.eventLon);
        }

        activeEvents.push(event);
      }
    }

    // Sort by distance if user location was provided
    if (userLat !== null && userLon !== null) {
      activeEvents.sort((a, b) => a.distance - b.distance);
    }

    return activeEvents;
  } catch (e) {
    // Logger.log('Error in getActiveEvents: ' + e.message);
    return [];
  }
}

/**
 * Gets active events sorted by distance from user.
 * Called from frontend with user's geolocation.
 * @param {number} userLat - User's latitude
 * @param {number} userLon - User's longitude
 * @return {Array} Array of active events sorted by distance
 */
function getEventsByDistance(userLat, userLon) {
  try {
    const events = getActiveEvents(userLat, userLon);
    return events.map(evt => ({
      eventCode: evt.eventCode,
      eventName: evt.eventName,
      locationName: evt.locationName,
      eventLat: evt.eventLat,
      eventLon: evt.eventLon,
      distance: Math.round(evt.distance)
    }));
  } catch (e) {
    // Logger.log('Error in getEventsByDistance: ' + e.message);
    return [];
  }
}

/**
 * Gets the closest event that the user is within the geofence of.
 * Auto-selects the event that user is closest to the center of.
 * Used for direct check-in flow without QR scanning.
 * @param {number} userLat - User's latitude
 * @param {number} userLon - User's longitude
 * @return {Object} {status, eventCode, eventName, distance} or {status: 'error', message}
 */
function getClosestEvent(userLat, userLon) {
  try {
    // Validate input
    if (userLat === null || userLon === null || userLat === undefined || userLon === undefined) {
      return {
        status: 'error',
        message: 'Location is required. Please enable location access.'
      };
    }

    // Get all currently active events
    const activeEvents = getActiveEvents(userLat, userLon);

    if (activeEvents.length === 0) {
      return {
        status: 'error',
        message: 'No events are currently active. Please check back during an event.'
      };
    }

    // Filter events where user is within geofence radius (100m)
    const GEOFENCE_RADIUS_METERS = 100;
    const validEvents = activeEvents.filter(evt => {
      return evt.distance !== null && evt.distance <= GEOFENCE_RADIUS_METERS;
    });

    if (validEvents.length === 0) {
      // Find closest event to show helpful message
      const closest = activeEvents[0]; // Already sorted by distance
      return {
        status: 'error',
        message: `You are ${Math.round(closest.distance)}m away from the nearest event. You must be within ${GEOFENCE_RADIUS_METERS}m to check in.`,
        nearestEventName: closest.eventName,
        nearestDistance: Math.round(closest.distance)
      };
    }

    // Return the closest valid event (first in sorted list)
    const closestEvent = validEvents[0];
    return {
      status: 'success',
      eventCode: closestEvent.eventCode,
      eventName: closestEvent.eventName,
      locationName: closestEvent.locationName,
      distance: Math.round(closestEvent.distance)
    };
  } catch (e) {
    // Logger.log('Error in getClosestEvent: ' + e.message);
    return {
      status: 'error',
      message: 'Error finding nearby events. Please try again.'
    };
  }
}

/**
 * Finds the Event_ID from Events sheet that matches the given event code/ID.
 * Event_ID is now the primary key (no separate Event_Code needed).
 * @param {string} eventId - The event ID to look up (e.g., "GBB-01")
 * @return {string} Event_ID or null if not found
 */
function findEventIdByCode(eventId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const eventsSheet = ss.getSheetByName('Events');
    if (!eventsSheet) return null;

    const eventsData = eventsSheet.getDataRange().getValues();

    // Find matching event by Event_ID
    for (let i = 1; i < eventsData.length; i++) {
      if (String(eventsData[i][0]).trim() === String(eventId).trim()) {
        return eventsData[i][0]; // Return Event_ID
      }
    }

    return null;
  } catch (e) {
    // Logger.log('Error in findEventIdByCode: ' + e.message);
    return null;
  }
}

/**
 * Gets all events from Events sheet for admin management
 * @return {Object} {status, events: [{eventId, name, sportArt, date, location, lat, lon, startTime, duration, isHomeGame, isSpotlight, theme}, ...]}
 */
function getEventsList() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Events');
    if (!sheet) {
      return { status: 'error', message: 'Events sheet not found' };
    }

    const data = sheet.getDataRange().getValues();
    const events = [];

    // Skip header row (row 0)
    // Columns: Event_ID, Activity_Code, Event_Name, Date, Location_Name, Event_Lat, Event_Lon, Start_Time, Duration_Hours, Is_Home_Game, Is_Spotlight_Game, Theme
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) { // If Event_ID exists
        const eventDate = String(data[i][3] || '').trim();
        const eventStartTime = String(data[i][7] || '').trim();
        const dateTimeCombined = eventDate && eventStartTime ? `${eventDate}T${eventStartTime.split('T')[1] || '00:00'}` : '';

        events.push({
          eventId: String(data[i][0]).trim(),
          activityCode: String(data[i][1] || '').trim(), // Use activityCode for consistency
          eventName: String(data[i][2] || '').trim(),
          date: eventDate,
          location: String(data[i][4] || '').trim(),
          lat: parseFloat(data[i][5]) || 0,
          lon: parseFloat(data[i][6]) || 0,
          startTime: eventStartTime,
          dateTime: dateTimeCombined, // Combined date and time for datetime-local input
          duration: String(data[i][8] || '').trim(),
          isHomeGame: true, // Hardcoded to true
          isSpotlightGame: data[i][10] || false,
          theme: String(data[i][11] || '').trim(),
          rowIndex: i + 1 // 1-indexed for Apps Script
        });
      }
    }

    return { status: 'success', events };
  } catch (e) {
    // Logger.log('Error in getEventsList: ' + e.message);
    return { status: 'error', message: e.message };
  }
}

/**
 * Gets all activities for the active season from Activities_Data.
 * @return {Object} {status, activities: [{activityCode, activityName}, ...]}
 */
function getActivitiesForSeason() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    if (!activitiesSheet) {
      return { status: 'error', message: 'Activities_Data sheet not found' };
    }
    const activitiesData = activitiesSheet.getDataRange().getValues();
    const activeSeason = getActiveSeason(); // Assuming getActiveSeason() is available

    const activities = [];
    for (let i = 1; i < activitiesData.length; i++) {
      if (activitiesData[i][2] === activeSeason) { // Column C is Season
        activities.push({
          activityCode: String(activitiesData[i][0]).trim().toUpperCase(),
          activityName: String(activitiesData[i][1]).trim()
        });
      }
    }
    return { status: 'success', activities: activities };
  } catch (e) {
    // Logger.log('Error in getActivitiesForSeason: ' + e.message);
    return { status: 'error', message: e.message };
  }
}

/**
 * Adds a new event to Events sheet
 * @param {Object} eventData - {eventId, eventName, sportArt, date, location, lat, lon, startTime, isHomeGame, isSpotlightGame, theme}
 * @return {Object} {status, message}
 */
function addEvent(eventData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Events');
    if (!sheet) {
      return { status: 'error', message: 'Events sheet not found' };
    }

    // Validate required fields
    if (!eventData.activityCode) {
      return { status: 'error', message: 'Activity is required' };
    }
    if (!eventData.eventName) {
      return { status: 'error', message: 'Event name is required' };
    }
    if (!eventData.dateTime) {
      return { status: 'error', message: 'Date and Time are required' };
    }

    // Fetch activity details for auto-population
    const activityDetails = getActivityDetails(eventData.activityCode);
    if (activityDetails.status === 'error') {
      return { status: 'error', message: 'Invalid Activity Code: ' + eventData.activityCode };
    }

    // Generate new Event ID
    const newEventId = generateEventId(eventData.activityCode);

    // Check for duplicate event ID (should be unique by generateEventId, but good to double check)
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(newEventId).trim()) {
        return { status: 'error', message: 'Generated Event ID already exists. Please try again.' };
      }
    }

    // Parse dateTime
    const dateTime = new Date(eventData.dateTime);
    const date = Utilities.formatDate(dateTime, 'America/Chicago', 'yyyy-MM-dd');
    const startTime = Utilities.formatDate(dateTime, 'America/Chicago', 'yyyy-MM-dd\'T\'HH:mm');

    // Add new row: Event_ID, Activity_Code, Event_Name, Date, Location_Name, Event_Lat, Event_Lon, Start_Time, Duration_Hours, Is_Home_Game, Is_Spotlight_Game, Theme
    sheet.appendRow([
      newEventId,                                   // A: Event_ID
      eventData.activityCode,                       // B: Activity_Code
      eventData.eventName,                          // C: Event_Name
      date,                                         // D: Date
      activityDetails.locationName,                 // E: Location_Name
      activityDetails.eventLat,                     // F: Event_Lat
      activityDetails.eventLon,                     // G: Event_Lon
      startTime,                                    // H: Start_Time
      2,                                            // I: Duration_Hours (hardcoded to 2)
      true,                                         // J: Is_Home_Game (hardcoded to true)
      eventData.isSpotlightGame || false,           // K: Is_Spotlight_Game
      eventData.theme || ''                         // L: Theme
    ]);

    refreshEventCodes(); // Refresh the cached event codes

    return { status: 'success', message: 'Event added successfully' };
  } catch (e) {
    // Logger.log('Error in addEvent: ' + e.message);
    return { status: 'error', message: e.message };
  }
}

/**
 * Updates an existing event in Events sheet
 * @param {string} eventId - Event ID to update
 * @param {Object} eventData - {eventName, sportArt, date, location, lat, lon, startTime, isHomeGame, isSpotlightGame, theme}
 * @return {Object} {status, message}
 */
function updateEvent(eventId, eventData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Events');
    if (!sheet) {
      return { status: 'error', message: 'Events sheet not found' };
    }

    const data = sheet.getDataRange().getValues();

    // Find the row with this event ID
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(eventId).trim()) {
        // Validate required fields
        if (!eventData.activityCode) {
          return { status: 'error', message: 'Activity is required' };
        }
        if (!eventData.eventName) {
          return { status: 'error', message: 'Event name is required' };
        }
        if (!eventData.dateTime) {
          return { status: 'error', message: 'Date and Time are required' };
        }

        // Fetch activity details for auto-population
        const activityDetails = getActivityDetails(eventData.activityCode);
        if (activityDetails.status === 'error') {
          return { status: 'error', message: 'Invalid Activity Code: ' + eventData.activityCode };
        }

        // Parse dateTime
        const dateTime = new Date(eventData.dateTime);
        const date = Utilities.formatDate(dateTime, 'America/Chicago', 'yyyy-MM-dd');
        const startTime = Utilities.formatDate(dateTime, 'America/Chicago', 'yyyy-MM-dd\'T\'HH:mm');

        // Update columns 2-12 (Activity_Code through Theme)
        sheet.getRange(i + 1, 2, 1, 11).setValues([[
          eventData.activityCode,                       // B: Activity_Code
          eventData.eventName,
          date,
          activityDetails.locationName,
          activityDetails.eventLat,
          activityDetails.eventLon,
          startTime,
          2,                                            // I: Duration_Hours (hardcoded to 2)
          true,                                         // J: Is_Home_Game (hardcoded to true)
          eventData.isSpotlightGame || false,
          eventData.theme || ''
        ]]);
        refreshEventCodes(); // Refresh the cached event codes
        return { status: 'success', message: 'Event updated successfully' };
      }
    }

    return { status: 'error', message: 'Event ID not found' };
  } catch (e) {
    // Logger.log('Error in updateEvent: ' + e.message);
    return { status: 'error', message: e.message };
  }
}

/**
 * Deletes an event from Events sheet
 * @param {string} eventId - Event ID to delete
 * @return {Object} {status, message}
 */
function deleteEvent(eventId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Events');
    if (!sheet) {
      return { status: 'error', message: 'Events sheet not found' };
    }

    const data = sheet.getDataRange().getValues();

    // Find the row with this event ID
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(eventId).trim()) {
        sheet.deleteRow(i + 1);
        refreshEventCodes(); // Refresh the cached event codes
        return { status: 'success', message: 'Event deleted successfully' };
      }
    }

    return { status: 'error', message: 'Event ID not found' };
  } catch (e) {
    // Logger.log('Error in deleteEvent: ' + e.message);
    return { status: 'error', message: e.message };
  }
}

/**
 * Unified validation function for event submissions.
 * Validates code, location, and time all at once.
 * @param {string} eventCode - The event code submitted
 * @param {Object} userLocation - { lat, lon, acc } from geolocation
 * @param {number} timestamp - Submission timestamp (usually Date.now())
 * @return {Object} { valid: boolean, eventCode: string, eventId: string, message: string }
 */
function validateEventSubmission(eventCode, userLocation, timestamp) {
  try {
    // Check location provided
    if (!userLocation || userLocation.lat === null || userLocation.lon === null) {
      return {
        valid: false,
        message: 'Location permission denied. Please enable location access.'
      };
    }

    // Find the active event matching this code
    const activeEvents = getActiveEvents();
    let matchingEvent = null;

    for (let evt of activeEvents) {
      if (String(evt.eventCode).trim() === String(eventCode).trim()) {
        matchingEvent = evt;
        break;
      }
    }

    if (!matchingEvent) {
      return {
        valid: false,
        message: 'Invalid event code or event is not currently active.'
      };
    }

    // Validate location is within 100m of event
    const distance = calculateDistance(
      userLocation.lat,
      userLocation.lon,
      matchingEvent.eventLat,
      matchingEvent.eventLon
    );

    const GEOFENCE_RADIUS_METERS = 100;
    if (distance > GEOFENCE_RADIUS_METERS) {
      return {
        valid: false,
        message: `You are ${Math.round(distance)}m away from the event. You must be within ${GEOFENCE_RADIUS_METERS}m.`
      };
    }

    // Validate time is within window
    const submissionTime = new Date(timestamp);
    if (submissionTime < matchingEvent.startTime || submissionTime > matchingEvent.endTime) {
      return {
        valid: false,
        message: 'Submission is outside the event time window.'
      };
    }

    // Find the Event_ID for this event
    const eventId = findEventIdByCode(eventCode);

    return {
      valid: true,
      eventCode: eventCode,
      eventId: eventId,
      message: 'Submission validated successfully.'
    };
  } catch (e) {
    // Logger.log('Error in validateEventSubmission: ' + e.message);
    return {
      valid: false,
      message: 'Error validating submission. Please try again.'
    };
  }
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

    let submissionFolder;
    const submissionFolders = parentFolder.getFoldersByName('Submissions_Winter_25-26');
    if (submissionFolders.hasNext()) {
      submissionFolder = submissionFolders.next();
    } else {
      submissionFolder = parentFolder.createFolder('Submissions_Winter_25-26');
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
 * STEP 1: Called when a user first hits "Submit".
 * Takes eventCode (not eventId in URL) and validates everything at once.
 */
function submitEvent(formObject, photoBlob) {
  const email = Session.getActiveUser().getEmail();
  const eventCode = formObject.eventCode;

  try {
    // Unified validation: code + location + time
    const validation = validateEventSubmission(eventCode, formObject.location, Date.now());
    if (!validation.valid) {
      return { status: "error", message: validation.message };
    }

    const eventId = validation.eventId;

    // Check for duplicate submissions
    if (findVerifiedSubmission(email, eventId)) {
      return { status: "error", message: "Your submission for this event has already been verified by an admin and cannot be changed." };
    }
    if (findPendingSubmission(email, eventId)) {
      return { status: "pending_conflict", message: "This will delete your current submission for this event. Do you want to proceed?" };
    }

    const file = savePhotoToDrive(photoBlob, eventId, email);

    const pendingSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Submissions_Pending');
    pendingSheet.appendRow([
      Utilities.getUuid(), new Date(), email, eventId,
      file.url, file.id, JSON.stringify(formObject.location),
      formObject.theme, formObject.notes
    ]);

    return { status: "success", message: "Submission received! You can view it in your 'My History' page." };

  } catch (e) {
    // Logger.log(e);
    return { status: "error", message: "An error occurred: " + e.message };
  }
}

/**
 * STEP 2: Called only if the user confirms an overwrite.
 */
function resubmitEvent(formObject, photoBlob) {
  const email = Session.getActiveUser().getEmail();
  const eventCode = formObject.eventCode;

  try {
    // Unified validation: code + location + time
    const validation = validateEventSubmission(eventCode, formObject.location, Date.now());
    if (!validation.valid) {
      return { status: "error", message: validation.message };
    }

    const eventId = validation.eventId;
    const oldSubmission = findPendingSubmission(email, eventId);

    if (oldSubmission) {
      try {
        DriveApp.getFileById(oldSubmission.photoId).setTrashed(true);
      } catch (e) {
        // Logger.log("Could not find old photo to delete: " + oldSubmission.photoId);
      }
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Submissions_Pending').deleteRow(oldSubmission.row);
    }

    const file = savePhotoToDrive(photoBlob, eventId, email);

    const pendingSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Submissions_Pending');
    pendingSheet.appendRow([
      Utilities.getUuid(), new Date(), email, eventId,
      file.url, file.id, JSON.stringify(formObject.location),
      formObject.theme, formObject.notes
    ]);

    return { status: "success", message: "Your previous submission has been replaced." };

  } catch (e) {
    // Logger.log(e);
    return { status: "error", message: "An error occurred: " + e.message };
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Logger.log('Spreadsheet accessed');

    // Get pending submissions
    const pendingSheet = ss.getSheetByName('Submissions_Pending');
    if (!pendingSheet) {
      // Logger.log('Submissions_Pending sheet not found');
      return { status: "error", message: "Submissions_Pending sheet not found." };
    }
    const pendingData = pendingSheet.getDataRange().getValues();
    // Logger.log('Pending submissions data retrieved: ' + pendingData.length + ' rows');

    // Get event details map (cached)
    const eventMap = getEventMapCache();
    // Logger.log('Event map retrieved from cache');

    // Build full queue
    const fullQueue = [];
    for (let i = 1; i < pendingData.length; i++) {
      const eventInfo = eventMap[pendingData[i][3]] || { eventName: 'Unknown', sportArt: 'Other', date: 'N/A' };
      fullQueue.push({
        submissionId: pendingData[i][0],
        email: pendingData[i][2],
        eventId: pendingData[i][3],
        eventName: eventInfo.eventName,
        sportArt: eventInfo.sportArt,
        eventDate: (eventInfo.date instanceof Date) ? eventInfo.date.toLocaleDateString() : eventInfo.date,
        photoUrl: pendingData[i][4],
        photoId: pendingData[i][5],
        dressedForTheme: pendingData[i][7] || false,
        notes: pendingData[i][8] || '',
        timestamp: pendingData[i][1].toISOString()
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Find the pending submission
    const pendingSheet = ss.getSheetByName('Submissions_Pending');
    const pendingData = pendingSheet.getDataRange().getValues();
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

    // Calculate total points
    const pointsTheme = themeBonus || (submissionInfo[7] ? 25 : 0); // Default theme bonus
    const pointsMultiplier = spotlightMultiplier || 1;
    const pointsTotal = Math.round((basePoints + pointsTheme) * pointsMultiplier);

    // Move to Submissions_Verified (including photo URL for fan feed)
    const verifiedSheet = ss.getSheetByName('Submissions_Verified');
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
      submissionInfo[4] // Photo_URL (added for fan feed)
    ]);

    // Delete from Submissions_Pending
    pendingSheet.deleteRow(submissionRow);

    // Update Student_Profiles with points
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const studentData = studentSheet.getDataRange().getValues();

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === submissionInfo[2]) {
        // Update season and all-time points
        const newSeasonPoints = (studentData[i][2] || 0) + pointsTotal;
        const newAllTimePoints = (studentData[i][3] || 0) + pointsTotal;

        studentSheet.getRange(i + 1, 3).setValue(newSeasonPoints);
        studentSheet.getRange(i + 1, 4).setValue(newAllTimePoints);
        break;
      }
    }

    // Calculate badges for the student
    calculateBadges(submissionInfo[2]);

    // Get event details map for notification
    const eventSheet = ss.getSheetByName('Events');
    const eventData = eventSheet.getDataRange().getValues();
    const eventMap = {};
    for (let i = 1; i < eventData.length; i++) {
      eventMap[eventData[i][0]] = {
        eventName: eventData[i][2],
        sportArt: eventData[i][1],
        date: eventData[i][3]
      };
    }

    // Send notification to student
    const eventInfo = eventMap[submissionInfo[3]] || { eventName: 'Event' };
    notifySubmissionApproved(submissionInfo[2], eventInfo.eventName, pointsTotal);

    return {
      status: "success",
      message: "Submission approved! " + pointsTotal + " points awarded."
    };

  } catch (e) {
    // Logger.log('Error in approveSubmission: ' + e.message);
    return {
      status: "error",
      message: "Error approving submission: " + e.message
    };
  }
}

/**
 * Denies a pending submission and optionally saves denial reason.
 * @param {string} submissionId - The submission ID to deny
 * @param {string} reason - Reason for denial (optional)
 */
function denySubmission(submissionId, reason) {
  const email = Session.getActiveUser().getEmail();

  // Check if user is admin
  if (!getAdminEmails().includes(email.toLowerCase())) {
    return { status: "error", message: "Access denied. You are not an admin." };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Find the pending submission
    const pendingSheet = ss.getSheetByName('Submissions_Pending');
    const pendingData = pendingSheet.getDataRange().getValues();
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

    // Delete from Submissions_Pending
    pendingSheet.deleteRow(submissionRow);

    // Optionally delete photo from Drive
    try {
      DriveApp.getFileById(submissionInfo[5]).setTrashed(true);
    } catch (e) {
      // Logger.log("Could not delete photo: " + e.message);
    }

    return {
      status: "success",
      message: "Submission denied. Reason: " + (reason || "No reason provided")
    };

  } catch (e) {
    // Logger.log('Error in denySubmission: ' + e.message);
    return {
      status: "error",
      message: "Error denying submission: " + e.message
    };
  }
}

/**
 * Fetches all badge definitions and user's earned badges.
 * @return {Object} Includes all badges and earned badge IDs
 */
function getBadgeData() {
  const email = Session.getActiveUser().getEmail();

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Get all badges
    const badgesSheet = ss.getSheetByName('Config_Badges');
    const badgesData = badgesSheet.getDataRange().getValues();

    const allBadges = [];
    for (let i = 1; i < badgesData.length; i++) {
      allBadges.push({
        badgeId: badgesData[i][0],
        badgeName: badgesData[i][1],
        category: badgesData[i][2],
        triggerType: badgesData[i][3],
        triggerValue: badgesData[i][4],
        description: badgesData[i][5],
        imageUrl: badgesData[i][6]
      });
    }

    // Get user's profile
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const studentData = studentSheet.getDataRange().getValues();

    let userEarnedBadges = [];
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        userEarnedBadges = studentData[i][4] ? JSON.parse(studentData[i][4]) : [];
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
 * Calculates badges earned based on student points and saves to Student_Profiles.
 * Called after a submission is approved.
 * @param {string} email - Student email
 */
function calculateBadges(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Get student profile
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const studentData = studentSheet.getDataRange().getValues();

    let studentRow = null;
    let studentProfile = null;

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        studentRow = i + 1;
        studentProfile = {
          seasonPoints: studentData[i][2] || 0,
          allTimePoints: studentData[i][3] || 0,
          earnedBadges: studentData[i][4] ? JSON.parse(studentData[i][4]) : []
        };
        break;
      }
    }

    if (!studentProfile) return;

    // Get all badges
    const badgesSheet = ss.getSheetByName('Config_Badges');
    const badgesData = badgesSheet.getDataRange().getValues();

    // Check which badges should be earned
    for (let i = 1; i < badgesData.length; i++) {
      const badgeId = badgesData[i][0];
      const triggerType = badgesData[i][3];
      const triggerValue = badgesData[i][4];

      // Skip if already earned
      if (studentProfile.earnedBadges.includes(badgeId)) continue;

      let shouldEarn = false;

      if (triggerType === 'points_threshold') {
        shouldEarn = studentProfile.allTimePoints >= triggerValue;
      } else if (triggerType === 'season_points') {
        shouldEarn = studentProfile.seasonPoints >= triggerValue;
      } else if (triggerType === 'event_count') {
        // Count verified submissions for this student
        const verifiedSheet = ss.getSheetByName('Submissions_Verified');
        const verifiedData = verifiedSheet.getDataRange().getValues();
        let submissionCount = 0;
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) submissionCount++;
        }
        shouldEarn = submissionCount >= triggerValue;
      }

      if (shouldEarn) {
        studentProfile.earnedBadges.push(badgeId);
        // Send notification for new badge
        notifyBadgeEarned(email, badgesData[i][1]); // badgesData[i][1] is Badge_Name
      }
    }

    // Update Student_Profiles with new badges
    studentSheet.getRange(studentRow, 5).setValue(JSON.stringify(studentProfile.earnedBadges));

  } catch (e) {
    // Logger.log('Error in calculateBadges: ' + e.message);
  }
}

/**
 * Fetches a list of upcoming events, optionally filtered by category.
 * @param {string} category - Optional filter by sport/art category
 * @return {Array} Array of events with details
 */
function getEventList(category) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const eventSheet = ss.getSheetByName('Events');
    const eventData = eventSheet.getDataRange().getValues();

    const events = [];
    // Columns: Event_ID, Sport_Art, Event_Name, Date, Location_Name, Event_Lat, Event_Lon, Start_Time, Duration_Hours, Is_Home_Game, Is_Spotlight_Game, Theme
    for (let i = 1; i < eventData.length; i++) {
      const event = {
        eventId: eventData[i][0],
        sportArt: eventData[i][1],
        eventName: eventData[i][2],
        date: eventData[i][3],
        locationName: eventData[i][4],
        eventLat: eventData[i][5],
        eventLon: eventData[i][6],
        startTime: eventData[i][7],
        durationHours: eventData[i][8],
        isHomeGame: eventData[i][9] || false,
        isSpotlightGame: eventData[i][10] || false,
        theme: eventData[i][11] || 'None'
      };

      // Filter by category if provided
      if (!category || event.sportArt.toLowerCase().includes(category.toLowerCase())) {
        events.push(event);
      }
    }

    return {
      status: "success",
      events: events
    };

  } catch (e) {
    // Logger.log('Error in getEventList: ' + e.message);
    return {
      status: "error",
      message: "Error fetching events: " + e.message
    };
  }
}

/**
 * Fetches approved photos for the fan feed (recent 50 photos, sorted by date).
 * @return {Array} Array of approved submission photos with metadata
 */
function getFanFeed() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Get verified submissions
    const verifiedSheet = ss.getSheetByName('Submissions_Verified');
    const verifiedData = verifiedSheet.getDataRange().getValues();

    // Get event details map
    const eventSheet = ss.getSheetByName('Event_Schedule');
    const eventData = eventSheet.getDataRange().getValues();
    const eventMap = {};
    for (let i = 1; i < eventData.length; i++) {
      eventMap[eventData[i][0]] = {
        eventName: eventData[i][2],
        sportArt: eventData[i][1]
      };
    }

    const photos = [];
    for (let i = 1; i < verifiedData.length; i++) {
      const eventInfo = eventMap[verifiedData[i][4]] || { eventName: 'Event', sportArt: 'Event' };
      // Photo URL is in column 10 (0-indexed as 10) - added when approving
      const photoUrl = verifiedData[i][10];

      // Skip if no photo URL
      if (!photoUrl) continue;

      photos.push({
        submissionId: verifiedData[i][0],
        timestamp: verifiedData[i][2], // Timestamp_Approved
        studentEmail: verifiedData[i][3],
        eventName: eventInfo.eventName,
        eventId: verifiedData[i][4],
        photoUrl: photoUrl,
        likes: 0 // Default likes count; persistence tracked in PropertiesService if needed
      });
    }

    // Sort by date (most recent first) and limit to 50
    photos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recentPhotos = photos.slice(0, 50);

    return {
      status: "success",
      photos: recentPhotos
    };

  } catch (e) {
    // Logger.log('Error in getFanFeed: ' + e.message);
    return {
      status: "error",
      message: "Error fetching fan feed: " + e.message
    };
  }
}

/**
 * Calculates streak bonuses based on consecutive event attendance.
 * @param {string} email - Student email
 * @return {number} Streak bonus points
 */
function calculateStreakBonus(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const verifiedSheet = ss.getSheetByName('Submissions_Verified');
    const verifiedData = verifiedSheet.getDataRange().getValues();

    // Get this user's submissions, sorted by date
    const userSubmissions = [];
    for (let i = 1; i < verifiedData.length; i++) {
      if (verifiedData[i][3] === email) {
        userSubmissions.push({
          timestamp: new Date(verifiedData[i][2]),
          eventId: verifiedData[i][4]
        });
      }
    }

    if (userSubmissions.length === 0) return 0;

    // Sort by date descending
    userSubmissions.sort((a, b) => b.timestamp - a.timestamp);

    // Calculate streak (consecutive days with at least one submission)
    let streak = 0;
    let lastDate = null;

    for (let i = 0; i < userSubmissions.length; i++) {
      const currentDate = Math.floor(userSubmissions[i].timestamp.getTime() / (1000 * 60 * 60 * 24));

      if (lastDate === null) {
        streak = 1;
        lastDate = currentDate;
      } else if (currentDate === lastDate - 1) {
        // Consecutive day
        streak++;
        lastDate = currentDate;
      } else if (currentDate !== lastDate) {
        // Streak broken
        break;
      }
    }

    // Award bonus: 5 points per day of streak, bonus multiplier at 5+ days
    let bonus = streak * 5;
    if (streak >= 5) bonus += 25; // 25 point bonus at 5+ day streak
    if (streak >= 10) bonus += 50; // Additional 50 point bonus at 10+ day streak

    return bonus;

  } catch (e) {
    // Logger.log('Error in calculateStreakBonus: ' + e.message);
    return 0;
  }
}

/**
 * Sends a notification to a student (stores in PropertiesService for now).
 * @param {string} studentEmail - Student email
 * @param {string} type - Notification type (approved, event, badge)
 * @param {string} message - Notification message
 */
function sendNotification(studentEmail, type, message) {
  try {
    const userProperties = PropertiesService.getUserProperties();
    const notificationsKey = 'notifications_' + studentEmail;

    // Get existing notifications
    let notifications = [];
    try {
      notifications = JSON.parse(userProperties.getProperty(notificationsKey)) || [];
    } catch (e) {
      notifications = [];
    }

    // Add new notification
    notifications.push({
      type: type,
      message: message,
      timestamp: new Date(),
      read: false
    });

    // Keep last 50 notifications
    if (notifications.length > 50) {
      notifications = notifications.slice(-50);
    }

    userProperties.setProperty(notificationsKey, JSON.stringify(notifications));

    // Logger.log('Notification sent to ' + studentEmail + ': ' + message);

  } catch (e) {
    // Logger.log('Error in sendNotification: ' + e.message);
  }
}

/**
 * Called when a submission is approved - sends notification to student.
 * @param {string} studentEmail - Student email
 * @param {string} eventName - Event name
 * @param {number} pointsAwarded - Points awarded
 */
function notifySubmissionApproved(studentEmail, eventName, pointsAwarded) {
  const message = 'Your submission for ' + eventName + ' was approved! You earned ' + pointsAwarded + ' points.';
  sendNotification(studentEmail, 'approved', message);
}

/**
 * Called when a badge is earned - sends notification to student.
 * @param {string} studentEmail - Student email
 * @param {string} badgeName - Badge name
 */
function notifyBadgeEarned(studentEmail, badgeName) {
  const message = 'You earned the "' + badgeName + '" badge!';
  sendNotification(studentEmail, 'badge', message);
}

function calculateComplexBonuses() {
  // Implemented: Streak bonuses via calculateStreakBonus()
  // Future: Category-specific bonuses, achievement multipliers, etc.
}

