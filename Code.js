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

const BADGE_BASE_URL = 'https://the-spartan-cup.web.app/badges/';

// Cache TTL (Time To Live) values in seconds
const CACHE_TTL = {
  ADMIN_EMAILS: 21600,      // 6 hours
  STUDENT_PROFILES: 600,    // 10 minutes
  BADGES: 86400,            // 24 hours
  EVENTS: 3600,             // 1 hour
  BADGE_MAP: 86400,         // 24 hours
  ACTIVE_SEASON: 3600       // 1 hour
};

/**
 * Safely parses JSON with error handling
 * @param {string} jsonString - The JSON string to parse
 * @param {*} defaultValue - The default value to return if parsing fails
 * @param {string} context - Context for logging (optional)
 * @return {*} Parsed JSON or default value
 */
function safeJSONParse(jsonString, defaultValue, context) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    Logger.log('JSON parse error' + (context ? ' in ' + context : '') + ': ' + e.message);
    return defaultValue;
  }
}

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
      const parsed = safeJSONParse(cachedEmails, null, 'admin_emails cache');
      if (parsed) return parsed;
      // If parse failed, clear cache and rebuild
      cache.remove('admin_emails');
    }

    // Cache miss or parse error: read from Sheets
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const adminSheet = ss.getSheetByName('Config_Admins');
    const adminData = adminSheet.getDataRange().getValues();
    const adminEmails = [];
    for (let i = 1; i < adminData.length; i++) {
      if (adminData[i][0] && adminData[i][0].trim()) {
        adminEmails.push(adminData[i][0].toLowerCase());
      }
    }

    // Cache for 6 hours using constant
    cache.put('admin_emails', JSON.stringify(adminEmails), CACHE_TTL.ADMIN_EMAILS);

    return adminEmails;
  } catch (e) {
    Logger.log('ERROR in getAdminEmails: ' + e.message + ' | Stack: ' + e.stack);
    return [];
  }
}

/**
 * Gets the current user's email with fallback to getEffectiveUser().
 * @return {string} User's email address
 */
function getUserEmail() {
  let email = Session.getActiveUser().getEmail();
  if (!email || email.trim() === '') {
    email = Session.getEffectiveUser().getEmail();
  }
  // Validate email format with basic but robust regex
  // Checks for: local-part @ domain . tld
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new Error('Unable to determine user email');
  }
  return email;
}

/**
 * Gets the current user's display name from the Student_Profiles sheet.
 * Uses cached data if available to avoid redundant Sheets API calls.
 * @return {string} User's display name, or empty string if not found
 */
function getUserDisplayName() {
  const email = getUserEmail();

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
 * Checks if the current user has admin access.
 * Reads from Config_Admins sheet (same source as backend admin checks).
 * @return {boolean} True if user is an admin, false otherwise
 */
function getUserIsAdmin() {
  const email = getUserEmail();
  const adminEmails = getAdminEmails(); // Uses Config_Admins sheet with caching
  return adminEmails.includes(email.toLowerCase());
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
    const parsed = safeJSONParse(cachedData, null, 'student_profiles cache');
    if (parsed) return parsed;
    // If parse failed, clear cache and rebuild
    cache.remove(cacheKey);
  }

  // Cache miss or parse error: read from Sheets
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const studentSheet = ss.getSheetByName('Student_Profiles');
  const studentData = studentSheet.getDataRange().getValues();

  // Cache for 10 minutes using constant
  cache.put(cacheKey, JSON.stringify(studentData), CACHE_TTL.STUDENT_PROFILES);

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
    const parsed = safeJSONParse(cachedMap, null, 'badge_map cache');
    if (parsed) return parsed;
    // If parse failed, clear cache and rebuild
    cache.remove(cacheKey);
  }

  // Cache miss or parse error: read from Sheets
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

  // Cache for 24 hours using constant - badge definitions don't change often
  cache.put(cacheKey, JSON.stringify(badgeMap), CACHE_TTL.BADGE_MAP);

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
    const parsed = safeJSONParse(cachedMap, null, 'event_map cache');
    if (parsed) return parsed;
    // If parse failed, clear cache and rebuild
    cache.remove(cacheKey);
  }

  // Cache miss or parse error: read from Sheets
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventSheet = ss.getSheetByName('Events');
  const eventData = eventSheet.getDataRange().getValues();
  const eventMap = {};

  for (let i = 1; i < eventData.length; i++) {
    eventMap[eventData[i][0]] = {
      eventName: eventData[i][2],
      date: eventData[i][3],
      sportArt: eventData[i][1],
      theme: eventData[i][11]
    };
  }

  // Cache for 1 hour using constant - events are relatively static
  cache.put(cacheKey, JSON.stringify(eventMap), CACHE_TTL.EVENTS);

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
  template.badgeBaseUrl = escapeJavaScriptString(BADGE_BASE_URL);

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
      // Location available - validate and try to auto-select closest event
      const lat = parseFloat(template.userLat);
      const lon = parseFloat(template.userLon);
      if (isNaN(lat) || isNaN(lon)) {
        template.autoEventError = escapeJavaScriptString('Invalid location data');
      } else {
        const closestEvent = getClosestEvent(lat, lon);
        if (closestEvent.status === 'success') {
          template.autoEventCode = escapeJavaScriptString(closestEvent.eventCode);
          template.autoEventName = escapeJavaScriptString(closestEvent.eventName);
        } else {
          template.autoEventError = escapeJavaScriptString(closestEvent.message);
        }
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
/**
 * Generates a Drive export URL for an image file.
 * Uses Google Drive's direct view URL with browser caching.
 * @param {string} fileId - Google Drive file ID
 * @return {string} Direct export URL
 */
function getDriveImageUrl(fileId) {
  if (!fileId) return '';
  return 'https://drive.google.com/uc?id=' + fileId + '&export=view';
}

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
          const parsed = safeJSONParse(settingsJson, {}, 'user settings');
          if (parsed && Object.keys(parsed).length > 0) {
            // Logger.log('Successfully parsed settings: ' + JSON.stringify(parsed));
            return parsed;
          } else {
            // Logger.log('Failed to parse settings JSON or empty result');
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
 * Converts a string to snake_case format by replacing spaces with underscores.
 * @param {string} str - The string to convert
 * @return {string} The snake_case formatted string
 */
function toSnakeCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '') // Remove all non-alphanumeric characters except underscore
    .replace(/_+/g, '_'); // Collapse consecutive underscores into a single underscore
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

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        userProfile = {
          email: studentData[i][0],
          displayName: studentData[i][1],
          seasonPoints: studentData[i][2] || 0,
          allTimePoints: studentData[i][3] || 0,
          badgesEarned: studentData[i][4] ? safeJSONParse(studentData[i][4], [], 'student badges') : [],
          disqualified: studentData[i][7] || false
        };
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
        disqualified: false
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

    // Build top 10 leaderboards with user highlighting
    // If user is in top 10, show top 10
    // If user is outside top 10, show top 9 + user's position with gap indicator

    function buildLeaderboardWithUser(leaderboard, userEmail, pointsKey) {
      const result = [];
      const userIndex = leaderboard.findIndex(s => s.email === userEmail);
      const userRank = userIndex + 1; // userRank = 0 if user not found

      // Helper function to create entry object (reduces duplication)
      function createEntry(index, isCurrentUser, showGapBefore) {
        const student = leaderboard[index];
        return {
          rank: index + 1,
          name: student.name,
          // Use the correct points field based on leaderboard type
          points: student[pointsKey] ?? 0,
          icon: index < 3 ? 'workspace_premium' : 'military_tech',
          color: index === 0 ? 'text-gold' : (index === 1 ? 'text-silver' : (index === 2 ? 'text-bronze' : 'text-gray-400')),
          isCurrentUser: isCurrentUser,
          showGapBefore: showGapBefore
        };
      }

      // Fixed bug: check userRank > 0 to ensure user is on leaderboard
      if (userRank > 0 && userRank <= 10) {
        // User is in top 10, show top 10
        for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
          result.push(createEntry(i, leaderboard[i].email === userEmail, false));
        }
      } else if (userRank > 10) {
        // User is outside top 10, show top 9 + gap + user
        for (let i = 0; i < Math.min(9, leaderboard.length); i++) {
          result.push(createEntry(i, false, false));
        }

        // Add user's position with gap indicator
        result.push(createEntry(userIndex, true, true));
      } else {
        // User not on leaderboard (userRank = 0), just show top 10
        for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
          result.push(createEntry(i, false, false));
        }
      }

      return result;
    }

    const topSeasonLeaderboard = buildLeaderboardWithUser(seasonLeaderboard, email, 'seasonPoints');
    const topAllTimeLeaderboard = buildLeaderboardWithUser(allTimeLeaderboard, email, 'allTimePoints');

    // --- FETCH BADGES ---
    // Use cached badge data (static, doesn't change frequently)
    const badgeMap = getBadgeMapCache();

    // Map earned badge IDs to full badge objects
    const earnedBadges = userProfile.badgesEarned.map(badgeId => {
      const badge = badgeMap[badgeId];
      if (!badge) return null;

      // Determine badge image URL with multiple fallback options:
      // 1. Use badge.imageUrl if provided in Config_Badges sheet
      // 2. Use badge.imageFile if custom filename is specified (supports different extensions)
      // 3. Generate filename from badge name using snake_case convention + .svg
      let imageUrl;
      if (badge.imageUrl) {
        imageUrl = badge.imageUrl;
      } else {
        const imageName = badge.imageFile || (toSnakeCase(badge.name) + '.svg');
        imageUrl = BADGE_BASE_URL + imageName;
      }

      return {
        name: badge.name,
        description: badge.description,
        imageUrl: imageUrl,
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
      // Skip empty rows (cleared submissions)
      if (!pendingData[i][0] || pendingData[i][0] === '') {
        continue;
      }

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
      isAdmin: getUserIsAdmin() // Return admin status from Config_Admins sheet
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
    .addItem('2. Configure Points Values', 'openPointsConfigDialog')
    .addItem('2b. Edit Rulebook Content', 'openRulebookEditor')
    .addItem('3. Generate Sample Submissions (For Testing)', 'generateSampleSubmissions')
    .addItem('4. Install Active Events Trigger (Run Once)', 'installActiveEventsTrigger')
    .addItem('5. Clear Cache (Development)', 'clearAllCaches')
    .addSeparator()
    .addItem('6. Populate Sample Badges', 'populateSampleBadges')
    .addItem('Set Data Validation', 'setDataValidation')
    .addItem('7. Award Retroactive Badges (Run Once)', 'awardRetroactiveBadges')
    .addItem('8. End Season & Award Final Badges', 'processSeasonEndBadges')
    .addToUi();
}

function setDataValidation() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config_Badges');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Config_Badges" not found.');
    return;
  }

  // Set data validation for Category column (C)
  const categoryRange = sheet.getRange('C2:C');
  const categoryRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Points', 'Participation', 'Variety', 'Loyalty', 'Special', 'Career', 'Achievement', 'Activity'], true)
      .setAllowInvalid(false)
      .build();
  categoryRange.setDataValidation(categoryRule);

  // Set data validation for Trigger_Type column (D)
  const triggerTypeRange = sheet.getRange('D2:D');
  const triggerTypeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Points_Season', 'Submission_Count', 'Submission_Count_Week_1', 'Events_In_7_Days', 'Distinct_Sports', 'Activity_Pct', 'Activity_Event_Count', 'Home_Game_Pct', 'Activity_Pct_Season', 'Activity_Pct_Lifetime', 'Activity_Event_Count_Season', 'Season_Placement', 'AllTime_Placement_Reached', 'Career_Events_Attended', 'Career_Seasons_Participated', 'Career_Badges_Earned', 'Weekday_Coverage', 'Specific_Activities', 'manual', 'activity_pct_season', 'activity_count_season', 'career_seasons', 'alltime_placement', 'career_badges', 'career_events'], true)
      .setAllowInvalid(false)
      .build();
  triggerTypeRange.setDataValidation(triggerTypeRule);

  SpreadsheetApp.getUi().alert('Data validation rules have been set for Category and Trigger_Type columns in Config_Badges.');
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
 * Installs a time-based trigger to update active event status every 10 minutes.
 * Should only be run once. Checks for existing triggers to prevent duplicates.
 */
function installActiveEventsTrigger() {
  try {
    // Check if trigger already exists
    const triggers = ScriptApp.getProjectTriggers();
    const existingTrigger = triggers.find(t => t.getHandlerFunction() === 'updateActiveEventStatus');

    if (existingTrigger) {
      SpreadsheetApp.getUi().alert('⚠️ Trigger Already Exists\n\nThe Active Events trigger is already installed.\n\nIt will run every 10 minutes to update event status.');
      return;
    }

    // Create new time-based trigger (every 10 minutes)
    ScriptApp.newTrigger('updateActiveEventStatus')
      .timeBased()
      .everyMinutes(10)
      .create();

    SpreadsheetApp.getUi().alert('✅ Trigger Installed Successfully!\n\nThe Active Events trigger will now run every 10 minutes to automatically update which events are currently active.\n\nYou can see all triggers in Extensions > Apps Script > Triggers.');
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error Installing Trigger\n\n' + e.message);
    Logger.log('Error installing trigger: ' + e.message);
  }
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
 * Updated to validate and repair existing sheets rather than clearing them.
 *
 * For each sheet:
 * - If sheet exists: validates all required headers are present and adds any missing ones
 * - If sheet doesn't exist: creates it with all required headers
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setName('[The Spartan Cup] - MASTER');

  // Define ALL sheets with their required headers
  const sheets = {
    'Student_Profiles': ['Email', 'Display_Name', 'Total_Points_Season', 'Total_Points_AllTime', 'Badges_Earned', 'Loyalty_Stats_JSON', 'Variety_Stats_Set', 'Disqualified', 'Student_Settings'],
    'Activities_Data': ['Activity_Code', 'Activity_Name', 'Season', 'Location_Name', 'Event_Lat', 'Event_Lon'],
    'Events': ['Event_ID', 'Activity_Code', 'Event_Name', 'Date', 'Location_Name', 'Event_Lat', 'Event_Lon', 'Start_Time', 'Duration_Hours', 'Is_Home_Game', 'Is_Spotlight_Game', 'Theme', 'Is_Active'],
    'Config_Active_Season': ['Setting_Name', 'Setting_Value'],
    'Submissions_Pending': ['Submission_ID', 'Timestamp', 'Email', 'Event_ID', 'Photo_URL', 'Photo_ID', 'Location_Data_JSON', 'Dressed_For_Theme', 'Notes'],
    'Submissions_Verified': ['Submission_ID', 'Timestamp_Submitted', 'Timestamp_Approved', 'Email', 'Event_ID', 'Admin_Email', 'Points_Base', 'Points_Theme', 'Points_Spotlight_Multiplier', 'Points_Total', 'Photo_URL', 'Photo_ID'],
    'Submissions_Denied': ['Submission_ID', 'Timestamp_Submitted', 'Timestamp_Denied', 'Email', 'Event_ID', 'Admin_Email', 'Denial_Reason', 'Photo_URL', 'Photo_ID'],
    'Config_Badges': ['Badge_ID', 'Badge_Name', 'Category', 'Trigger_Type', 'Trigger_Value', 'Description', 'Badge_Image_URL'],
    'Config_Admins': ['Admin_Email', 'Role'],
    'Config_Points': ['Setting_Name', 'Points_Value', 'Description'],
    'Active_Season_Prizes': ['Rank', 'Description'],
    'Badge_Awards': ['Award_ID', 'Timestamp', 'Email', 'Display_Name', 'Badge_ID', 'Badge_Name', 'Badge_Image_URL']
  };

  const sheetsCreated = [];
  const sheetsValidated = [];
  const headersAdded = [];

  Object.keys(sheets).forEach((sheetName, index) => {
    const requiredHeaders = sheets[sheetName];
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      // Sheet doesn't exist - create it
      if (index === 0 && ss.getSheetByName('Sheet1')) {
        sheet = ss.getSheetByName('Sheet1').setName(sheetName);
      } else {
        sheet = ss.insertSheet(sheetName);
      }
      // Add headers to new sheet
      sheet.appendRow(requiredHeaders);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold');
      sheetsCreated.push(sheetName);
    } else {
      // Sheet exists - validate headers

      // Handle completely empty sheets (no rows at all)
      if (sheet.getLastRow() < 1) {
        sheet.appendRow(requiredHeaders);
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold');
        headersAdded.push(`${sheetName} (was empty - added headers)`);
      } else {
        // Sheet has at least one row and one column - check existing headers
        const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const existingHeaderSet = new Set(existingHeaders);

        // Find headers that are required but missing from existing sheet
        const missingHeaders = requiredHeaders.filter(h => !existingHeaderSet.has(h));

        if (missingHeaders.length > 0) {
          // IMPORTANT: Append missing headers to END of sheet to avoid data corruption
          // Inserting columns mid-sheet would shift existing data and misalign it with headers
          //
          // NOTE: Any code relying on specific column positions (rather than header names)
          // may need updates when missing headers are appended to the end.
          // Best practice: Always reference columns by header name lookup, not by hardcoded indices.
          const firstNewCol = sheet.getLastColumn() + 1;
          sheet.getRange(1, firstNewCol, 1, missingHeaders.length).setValues([missingHeaders]).setFontWeight('bold');
          headersAdded.push(`${sheetName} (appended ${missingHeaders.length} header(s) to end: ${missingHeaders.join(', ')})`);
        } else {
          sheetsValidated.push(sheetName);
        }

        // Ensure frozen rows and bold headers for all columns
        sheet.setFrozenRows(1);
        if (sheet.getLastColumn() > 0) {
          sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
        }
      }
    }
  });

  // Add sample data only for newly created sheets
  if (sheetsCreated.includes('Activities_Data')) {
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    if (activitiesSheet.getLastRow() === 1) { // Only header row exists (no data rows)
      activitiesSheet.appendRow(['GBB', 'Girls Basketball', 'Winter', 'Orono High School Gym', 44.965, -93.625]);
      activitiesSheet.appendRow(['BBB', 'Boys Basketball', 'Winter', 'Orono High School Gym', 44.965, -93.625]);
      activitiesSheet.appendRow(['GVBB', 'Girls Volleyball', 'Fall', 'Orono High School Gym', 44.965, -93.625]);
    }
  }

  if (sheetsCreated.includes('Events')) {
    const eventsSheet = ss.getSheetByName('Events');
    if (eventsSheet.getLastRow() === 1) { // Only header row exists (no data rows)
      eventsSheet.appendRow(['GBB-001', 'GBB', 'Girls Basketball vs. Hopkins', '2025-11-15', 'Orono High School Gym', 44.965, -93.625, '2025-11-15T19:00', 2, true, true, 'White Out', false]);
    }
  }

  if (sheetsCreated.includes('Config_Active_Season')) {
    const seasonSheet = ss.getSheetByName('Config_Active_Season');
    if (seasonSheet.getLastRow() === 1) { // Only header row exists (no data rows)
      seasonSheet.appendRow(['Active_Season', 'Winter']);
    }
  }

  if (sheetsCreated.includes('Config_Admins')) {
    const adminsSheet = ss.getSheetByName('Config_Admins');
    if (adminsSheet.getLastRow() === 1) { // Only header row exists (no data rows)
      adminsSheet.appendRow([Session.getActiveUser().getEmail(), 'Owner']);
    }
  }

  // Initialize Config_Points with default values (this function already checks if data exists)
  initializeConfigPoints();

  // Initialize Config_Rulebook with default content (this function already checks if data exists)
  initializeConfigRulebook();

  // Log summary
  Logger.log('=== Spreadsheet Setup Summary ===');
  if (sheetsCreated.length > 0) {
    Logger.log(`Sheets created: ${sheetsCreated.join(', ')}`);
  }
  if (sheetsValidated.length > 0) {
    Logger.log(`Sheets validated (no changes needed): ${sheetsValidated.join(', ')}`);
  }
  if (headersAdded.length > 0) {
    Logger.log(`Sheets with headers added: ${headersAdded.join(', ')}`);
  }
  if (sheetsCreated.length === 0 && headersAdded.length === 0 && sheetsValidated.length === 0) {
    Logger.log('No changes needed: all sheets and headers are already set up correctly');
  }

  // Note: Config_Event_Codes has been removed - Events tab is now the single source of truth
  // Is_Active status is updated by the updateActiveEventStatus() trigger
}

/**
 * Updates the Is_Active status for all events in the Events tab.
 * Should be run by a time-based trigger every 10 minutes.
 * Marks events as active if current time (Central) is between Start_Time and Start_Time + Duration_Hours.
 */
function updateActiveEventStatus() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const eventsSheet = ss.getSheetByName('Events');
    if (!eventsSheet) {
      Logger.log('Events sheet not found');
      return;
    }

    const data = eventsSheet.getDataRange().getValues();
    if (data.length <= 1) {
      Logger.log('No events found in Events sheet');
      return;
    }

    // Get current time
    const now = new Date();

    Logger.log(`Updating event active status at: ${Utilities.formatDate(now, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss')} Central`);

    // Column indices (0-indexed)
    const COL_EVENT_ID = 0;
    const COL_START_TIME = 7;
    const COL_DURATION_HOURS = 8;
    const COL_IS_ACTIVE = 12;

    let updatesCount = 0;

    // Process each event (skip header row)
    for (let i = 1; i < data.length; i++) {
      const eventId = data[i][COL_EVENT_ID];
      const startTimeRaw = data[i][COL_START_TIME];
      const durationHours = data[i][COL_DURATION_HOURS];

      // Validate data
      if (!eventId || !startTimeRaw || !durationHours) {
        Logger.log(`  Skipping row ${i + 1}: Missing required data`);
        continue;
      }

      try {
        Logger.log(`  Processing event ${eventId}:`);
        Logger.log(`    startTimeRaw: "${startTimeRaw}" (type: ${typeof startTimeRaw})`);

        // Parse start time
        let eventStartTime;
        if (startTimeRaw instanceof Date && !isNaN(startTimeRaw.getTime())) {
          eventStartTime = startTimeRaw;
          Logger.log(`    Parsed as Date object: ${eventStartTime}`);
        } else if (typeof startTimeRaw === 'string') {
          // Handle string formats
          if (startTimeRaw.includes('T')) {
            const normalized = startTimeRaw.substring(0, 16).replace('T', ' ');
            eventStartTime = Utilities.parseDate(normalized, 'America/Chicago', 'yyyy-MM-dd HH:mm');
            Logger.log(`    Parsed ISO format: ${eventStartTime}`);
          } else {
            eventStartTime = Utilities.parseDate(startTimeRaw, 'America/Chicago', 'yyyy-MM-dd HH:mm');
            Logger.log(`    Parsed space format: ${eventStartTime}`);
          }
        } else {
          Logger.log(`  Skipping event ${eventId}: Invalid start time format`);
          continue;
        }

        // Calculate end time
        const eventEndTime = new Date(eventStartTime.getTime() + durationHours * 60 * 60 * 1000);
        Logger.log(`    Event window: ${Utilities.formatDate(eventStartTime, 'America/Chicago', 'HH:mm')} - ${Utilities.formatDate(eventEndTime, 'America/Chicago', 'HH:mm')}`);

        // Determine if event is active
        const isActive = (now >= eventStartTime && now <= eventEndTime);
        Logger.log(`    now >= start? ${now >= eventStartTime}, now <= end? ${now <= eventEndTime}, isActive = ${isActive}`);

        // Update the Is_Active column (only if value changed to reduce API calls)
        const currentIsActive = data[i][COL_IS_ACTIVE];
        Logger.log(`    currentIsActive: ${currentIsActive}, calculated: ${isActive}`);
        if (currentIsActive !== isActive) {
          eventsSheet.getRange(i + 1, COL_IS_ACTIVE + 1).setValue(isActive);
          updatesCount++;
          Logger.log(`    ✓ Updated ${eventId}: Is_Active = ${isActive}`);
        } else {
          Logger.log(`    (no update needed - already ${currentIsActive})`);
        }
      } catch (e) {
        Logger.log(`  Error processing event ${eventId}: ${e.message}`);
      }
    }

    // Clear the active events cache to force reload
    CacheService.getScriptCache().remove('active_events_data');

    Logger.log(`Active status update complete. ${updatesCount} events updated.`);
  } catch (e) {
    Logger.log(`Error in updateActiveEventStatus: ${e.message}`);
  }
}

/**
 * Adds dropdown data validation to Config_Badges sheet columns.
 * Column C (Category): Points, Participation, Variety, Loyalty, Special, Career, Achievement
 * Column D (Trigger_Type): All implemented trigger types
 */
function setupBadgeDropdowns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const badgesSheet = ss.getSheetByName('Config_Badges');

  if (!badgesSheet) {
    SpreadsheetApp.getUi().alert('Error: Config_Badges sheet not found. Please run First-Time Setup first.');
    return;
  }

  // TODO: Implement data validation dropdowns for badge configuration
  // This function is a placeholder for future implementation
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

    // Get points configuration
    const pointsConfig = getPointsConfig();

    for (let i = 0; i < 5; i++) {
      const student = sampleStudents[i];
      const hoursAgo = Math.floor(Math.random() * 72) + 1; // 1-72 hours ago
      const submittedTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
      const approvedTime = new Date(submittedTime.getTime() + Math.floor(Math.random() * 3600000)); // 0-1hr after submission
      const dressedForTheme = Math.random() > 0.3;
      const basePoints = dressedForTheme ? pointsConfig['Base_Points_With_Theme'] : pointsConfig['Base_Points_Without_Theme'];
      const themeBonus = dressedForTheme ? pointsConfig['Theme_Bonus'] : 0;
      const spotlightMultiplier = pointsConfig['Spotlight_Game_Multiplier']; // GBB-01 is a spotlight game
      const totalPoints = Math.round(basePoints * spotlightMultiplier + themeBonus);

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
          // Batch update both columns in single API call for better performance
          studentSheet.getRange(j + 1, 3, 1, 2).setValues([[newSeasonPoints, newAllTimePoints]]);
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
 * Populates the Config_Badges sheet with sample badge definitions.
 * This creates a tiered badge system based on points and event attendance.
 */
function populateSampleBadges() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const badgesSheet = ss.getSheetByName('Config_Badges');

    // Clear existing badges (except header)
    const existingData = badgesSheet.getDataRange().getValues();
    if (existingData.length > 1) {
      badgesSheet.deleteRows(2, existingData.length - 1);
    }

    // Sample badge definitions
    // Structure: Badge_ID, Badge_Name, Category, Trigger_Type, Trigger_Value, Description, Badge_Image_URL
    const sampleBadges = [
      ['badge_001', 'First Event', 'Participation', 'event_count', 1, 'Attended your first Spartan event', 'https://the-spartan-cup.web.app/badges/first_event.svg'],
      ['badge_002', 'Rookie Fan', 'Points', 'points_threshold', 50, 'Earned your first 50 points', 'https://the-spartan-cup.web.app/badges/rookie_fan.svg'],
      ['badge_003', 'Regular', 'Participation', 'event_count', 5, 'Attended 5 events this season', 'https://the-spartan-cup.web.app/badges/regular.svg'],
      ['badge_004', 'Committed Fan', 'Points', 'points_threshold', 100, 'Reached 100 total points', 'https://the-spartan-cup.web.app/badges/committed_fan.svg'],
      ['badge_005', 'Super Fan', 'Participation', 'event_count', 10, 'Attended 10 events - true dedication!', 'https://the-spartan-cup.web.app/badges/super_fan.svg'],
      ['badge_006', 'Century Club', 'Points', 'season_points', 100, 'Earned 100 points in a single season', 'https://the-spartan-cup.web.app/badges/century_club.svg'],
      ['badge_007', 'Point Collector', 'Points', 'points_threshold', 200, 'Accumulated 200 total points', 'https://the-spartan-cup.web.app/badges/point_collector.svg'],
      ['badge_008', 'Elite Supporter', 'Participation', 'event_count', 15, 'Attended 15+ events - elite status!', 'https://the-spartan-cup.web.app/badges/elite_supporter.svg'],
      ['badge_009', 'Triple Threat', 'Points', 'points_threshold', 300, 'Reached the 300 point milestone', 'https://the-spartan-cup.web.app/badges/triple_threat.svg'],
      ['badge_010', 'Spartan Legend', 'Points', 'points_threshold', 500, 'Legendary dedication - 500 points!', 'https://the-spartan-cup.web.app/badges/spartan_legend.svg']
    ];

    // Append all badges
    sampleBadges.forEach(badge => {
      badgesSheet.appendRow(badge);
    });

    SpreadsheetApp.getUi().alert(
      '✅ Sample Badges Created!\n\n' +
      'Created ' + sampleBadges.length + ' badge definitions:\n\n' +
      '• First Event (1 event)\n' +
      '• Rookie Fan (50 pts)\n' +
      '• Regular (5 events)\n' +
      '• Committed Fan (100 pts)\n' +
      '• Super Fan (10 events)\n' +
      '• Century Club (100 season pts)\n' +
      '• Point Collector (200 pts)\n' +
      '• Elite Supporter (15 events)\n' +
      '• Triple Threat (300 pts)\n' +
      '• Spartan Legend (500 pts)\n\n' +
      'Now run "6. Award Retroactive Badges" to award badges to existing students!'
    );

  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error creating badges:\n\n' + e.message);
    Logger.log('Error in populateSampleBadges: ' + e.message);
  }
}

/**
 * Clears all Apps Script caches. Use this during development when you update
 * spreadsheet data and need changes to reflect immediately in the web app.
 */
function clearAllCaches() {
  try {
    // Clear script-level caches (shared across all users)
    const cache = CacheService.getScriptCache();
    cache.removeAll([
      'admin_emails',
      'student_profiles_data',
      'event_map_cache',
      'badge_map_cache',
      'active_events_data',
      'active_season'
    ]);

    // Clear user-level caches (fan feed, personal data, etc.)
    const userCache = CacheService.getUserCache();
    userCache.removeAll([
      'fanfeed_cache'
    ]);

    const message = '✅ Cache Cleared!\n\nAll cached data has been removed.\nRefresh the web app to see your spreadsheet changes.';

    // Try to show UI alert (works when called from spreadsheet menu)
    // If no UI available (running from Apps Script editor), just log
    try {
      SpreadsheetApp.getUi().alert(message);
    } catch (uiError) {
      // No UI available - running from Apps Script editor
      Logger.log(message);
      Logger.log('Successfully cleared all caches: admin_emails, student_profiles_data, event_map_cache, badge_map_cache, active_events_data, active_season, fanfeed_cache');
    }

    return 'Success: All caches cleared';
  } catch (e) {
    const errorMsg = '❌ Error clearing cache: ' + e.message;
    Logger.log(errorMsg);

    try {
      SpreadsheetApp.getUi().alert(errorMsg);
    } catch (uiError) {
      // No UI available - error already logged
    }

    return 'Error: ' + e.message;
  }
}

/**
 * Initializes the Config_Points sheet with default point values.
 * Should be called during setup or when first-time setup is run.
 */
function initializeConfigPoints() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pointsSheet = ss.getSheetByName('Config_Points');

    // Only initialize if empty (no data rows beyond header)
    const data = pointsSheet.getDataRange().getValues();
    if (data.length > 1) {
      return; // Sheet already has data, don't overwrite
    }

    // Default point values
    const defaults = [
      ['Base_Points_With_Theme', 75, 'Points for attending event with theme dress'],
      ['Base_Points_Without_Theme', 50, 'Points for attending event without theme dress'],
      ['Theme_Bonus', 25, 'Additional points for dressing according to theme'],
      ['Spotlight_Game_Multiplier', 1.5, 'Points multiplier for spotlight games']
    ];

    defaults.forEach(row => {
      pointsSheet.appendRow(row);
    });

    CacheService.getScriptCache().remove('points_config');
  } catch (e) {
    Logger.log('Error initializing Config_Points: ' + e.message);
  }
}

/**
 * Gets the current points configuration from the Config_Points sheet.
 * Results are cached for 1 hour.
 * @return {Object} Object with keys like 'Base_Points_With_Theme', etc.
 */
function getPointsConfig() {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'points_config';
    const cached = cache.get(cacheKey);

    if (cached) {
      return safeJSONParse(cached, null, 'points config cache');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pointsSheet = ss.getSheetByName('Config_Points');
    const data = pointsSheet.getDataRange().getValues();

    const config = {};
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        config[data[i][0]] = parseFloat(data[i][1]) || 0;
      }
    }

    // Cache for 1 hour (3600 seconds)
    cache.put(cacheKey, JSON.stringify(config), 3600);
    return config;
  } catch (e) {
    Logger.log('Error reading points config: ' + e.message);
    // Return defaults as fallback
    return {
      'Base_Points_With_Theme': 75,
      'Base_Points_Without_Theme': 50,
      'Theme_Bonus': 25,
      'Spotlight_Game_Multiplier': 1.5
    };
  }
}

/**
 * Opens a dialog for editing points configuration.
 * Creates a simple UI to update points values.
 */
function openPointsConfigDialog() {
  try {
    const config = getPointsConfig();

    let html = '<style>';
    html += 'body { font-family: Arial, sans-serif; padding: 15px; }';
    html += 'label { display: block; margin-top: 12px; font-weight: bold; }';
    html += 'input { width: 100%; padding: 6px; margin-top: 4px; box-sizing: border-box; }';
    html += 'button { margin-top: 20px; padding: 10px 20px; background: #1b3b87; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }';
    html += 'button:hover { background: #0f2550; }';
    html += '.description { font-size: 12px; color: #666; margin-top: 2px; }';
    html += '</style>';

    html += '<h2>⚙️ Points Configuration</h2>';
    html += '<p>Edit the point values used in the app:</p>';

    html += '<form id="pointsForm">';

    html += '<label>Base Points (With Theme):</label>';
    html += '<input type="number" id="Base_Points_With_Theme" value="' + config['Base_Points_With_Theme'] + '" step="0.1" />';
    html += '<div class="description">Points for attending event with theme dress</div>';

    html += '<label>Base Points (Without Theme):</label>';
    html += '<input type="number" id="Base_Points_Without_Theme" value="' + config['Base_Points_Without_Theme'] + '" step="0.1" />';
    html += '<div class="description">Points for attending event without theme dress</div>';

    html += '<label>Theme Bonus:</label>';
    html += '<input type="number" id="Theme_Bonus" value="' + config['Theme_Bonus'] + '" step="0.1" />';
    html += '<div class="description">Additional points for dressing according to theme</div>';

    html += '<label>Spotlight Game Multiplier:</label>';
    html += '<input type="number" id="Spotlight_Game_Multiplier" value="' + config['Spotlight_Game_Multiplier'] + '" step="0.1" />';
    html += '<div class="description">Points multiplier for spotlight games (e.g., 1.5 = 50% more)</div>';

    html += '<label>Home Game Bonus:</label>';
    html += '<input type="number" id="Home_Game_Bonus" value="' + config['Home_Game_Bonus'] + '" step="0.1" />';
    html += '<div class="description">Bonus points for home games</div>';

    html += '<button type="button" onclick="submitForm()">Save Changes</button>';
    html += '<button type="button" onclick="google.script.host.close()" style="margin-left: 8px; background: #999;">Cancel</button>';

    html += '</form>';

    html += '<script>';
    html += 'function submitForm() {';
    html += '  const config = {';
    html += '    "Base_Points_With_Theme": parseFloat(document.getElementById("Base_Points_With_Theme").value),';
    html += '    "Base_Points_Without_Theme": parseFloat(document.getElementById("Base_Points_Without_Theme").value),';
    html += '    "Theme_Bonus": parseFloat(document.getElementById("Theme_Bonus").value),';
    html += '    "Spotlight_Game_Multiplier": parseFloat(document.getElementById("Spotlight_Game_Multiplier").value),';
    html += '    "Home_Game_Bonus": parseFloat(document.getElementById("Home_Game_Bonus").value)';
    html += '  };';
    html += '  google.script.run.updatePointsConfig(config);';
    html += '  google.script.host.close();';
    html += '}';
    html += '</script>';

    const ui = SpreadsheetApp.getUi();
    const dialog = HtmlService.createHtmlOutput(html).setWidth(400).setHeight(500);
    ui.showModalDialog(dialog, 'Points Configuration');

  } catch (e) {
    SpreadsheetApp.getUi().alert('Error opening dialog: ' + e.message);
  }
}

/**
 * Updates the points configuration in the Config_Points sheet.
 * Called from the dialog UI.
 * @param {Object} config - Object with point settings
 */
function updatePointsConfig(config) {
  try {
    // Admin check
    if (!getUserIsAdmin()) {
      return { status: 'error', message: 'Unauthorized: Admin access required' };
    }

    // Validate all values are numbers and non-negative
    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== 'number' || isNaN(value)) {
        return { status: 'error', message: `Invalid value for ${key}: must be a number` };
      }
      if (value < 0) {
        return { status: 'error', message: `Invalid value for ${key}: must be non-negative` };
      }
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pointsSheet = ss.getSheetByName('Config_Points');
    const data = pointsSheet.getDataRange().getValues();

    // Update each row based on setting name
    let updatedCount = 0;
    for (let i = 1; i < data.length; i++) {
      const settingName = data[i][0];
      if (config[settingName] !== undefined) {
        pointsSheet.getRange(i + 1, 2).setValue(config[settingName]);
        updatedCount++;
      }
    }

    // Clear cache so new values are picked up
    CacheService.getScriptCache().remove('points_config');

    Logger.log(`Points config updated: ${updatedCount} values changed by ${Session.getActiveUser().getEmail()}`);

    // For menu-based dialog (backward compatibility)
    if (typeof SpreadsheetApp.getUi === 'function') {
      try {
        SpreadsheetApp.getUi().alert('✅ Points configuration updated successfully!');
      } catch (uiError) {
        // UI alert not available in web app context, that's ok
      }
    }

    return { status: 'success', message: `Updated ${updatedCount} point values` };
  } catch (e) {
    Logger.log('Error updating points config: ' + e.message);

    // For menu-based dialog (backward compatibility)
    if (typeof SpreadsheetApp.getUi === 'function') {
      try {
        SpreadsheetApp.getUi().alert('❌ Error updating config: ' + e.message);
      } catch (uiError) {
        // UI alert not available in web app context, that's ok
      }
    }

    return { status: 'error', message: e.message };
  }
}

/**
 * Resets points configuration to default values.
 * @return {Object} Status object with success/error
 */
function resetPointsToDefaults() {
  try {
    // Admin check
    if (!getUserIsAdmin()) {
      return { status: 'error', message: 'Unauthorized: Admin access required' };
    }

    // Default point values (same as initializeConfigPoints)
    const defaults = {
      'Base_Points_With_Theme': 75,
      'Base_Points_Without_Theme': 50,
      'Theme_Bonus': 25,
      'Spotlight_Game_Multiplier': 1.5
    };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pointsSheet = ss.getSheetByName('Config_Points');
    const data = pointsSheet.getDataRange().getValues();

    // Update each row to default value
    let resetCount = 0;
    for (let i = 1; i < data.length; i++) {
      const settingName = data[i][0];
      if (defaults[settingName] !== undefined) {
        pointsSheet.getRange(i + 1, 2).setValue(defaults[settingName]);
        resetCount++;
      }
    }

    // Clear cache so new values are picked up
    CacheService.getScriptCache().remove('points_config');

    Logger.log(`Points config reset to defaults: ${resetCount} values reset by ${Session.getActiveUser().getEmail()}`);

    return { status: 'success', message: `Reset ${resetCount} point values to defaults` };
  } catch (e) {
    Logger.log('Error resetting points config: ' + e.message);
    return { status: 'error', message: e.message };
  }
}

// ===============================================
// RULEBOOK CONFIGURATION FUNCTIONS
// ===============================================

/**
 * Initializes the Config_Rulebook sheet with default content.
 * Called during first-time setup.
 */
function initializeConfigRulebook() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let rulebookSheet = ss.getSheetByName('Config_Rulebook');

    // Create sheet if it doesn't exist
    if (!rulebookSheet) {
      rulebookSheet = ss.insertSheet('Config_Rulebook');
      rulebookSheet.appendRow(['Section_ID', 'Section_Title', 'Content_HTML', 'Display_Order', 'Is_Active']);
      rulebookSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1b3b87').setFontColor('#ffffff');
    } else {
      // Only initialize if empty (no data rows beyond header)
      const data = rulebookSheet.getDataRange().getValues();
      if (data.length > 1) {
        return; // Sheet already has data, don't overwrite
      }
    }

    // Default rulebook sections (simplified for accordion layout)
    const defaultSections = [
      [
        'photo_submission',
        'Photo Submission',
        `<p>All event participation must be verified with a photo. Photos must be clear, well-lit, and include you at the event location. Submissions must be made within 48 hours of the event's conclusion.</p>
        <p class="mt-3"><strong>Photo Requirements:</strong></p>
        <ul class="list-disc list-inside space-y-1 ml-2 mt-1">
          <li>Photos must be taken <strong>during the game</strong> (not before or after)</li>
          <li>Must include <strong>your face</strong></li>
          <li>If dressing for a theme, show <strong>your outfit</strong></li>
        </ul>
        <p class="mt-3"><strong>How to Submit:</strong></p>
        <ul class="list-disc list-inside space-y-1 ml-2 mt-1">
          <li>Use the link in the <a href="https://www.instagram.com/ohs_spartancup" target="_blank" class="text-primary dark:text-blue-400 font-semibold hover:underline">@ohs_spartancup Instagram</a></li>
          <li>Indicate which game you are attending</li>
          <li>List who you are attending with</li>
          <li>If necessary, explain how your outfit fits the theme</li>
        </ul>`,
        1,
        true
      ],
      [
        'points_system',
        'Points System',
        `<p>Earn points by attending events and collecting badges. Your total points determine your rank in The Spartan Cup.</p>
        <p class="mt-3"><strong>Base Points:</strong> Each game/event starts with a base value of <span class="font-bold text-lg">10 points</span>. Additional points can be earned through themed attendance, spotlight games, and badge collection.</p>
        <p class="mt-3"><strong>Badge Bonuses:</strong> Collect badges to earn bonus points and multipliers. Each badge category (Participation, Variety, Loyalty, etc.) has its own point values and tier-based multipliers.</p>`,
        2,
        true
      ],
      [
        'awards',
        'Winning & Awards',
        `<p>Awards are given out every <strong>season</strong> (Fall, Winter, or Spring) to the top participants. Standings are based solely on <strong>point totals</strong>.</p>
        <p class="mt-3"><strong>Seasonal Awards:</strong></p>
        <ul class="list-none space-y-2 mt-2">
          <li>🥇 <strong>First Place</strong> - Prize TBA</li>
          <li>🥈 <strong>Second Place</strong> - Prize TBA</li>
          <li>🥉 <strong>Third Place</strong> - Prize TBA</li>
        </ul>
        <p class="mt-3">Top 10 participants will receive recognition at the end-of-season ceremony.</p>`,
        3,
        true
      ],
      [
        'misconduct',
        'Misconduct & Cheating',
        `<p><strong>Any form of cheating, including submitting false photos or misrepresenting attendance, will result in immediate disqualification from The Spartan Cup and potential disciplinary action from the school.</strong></p>
        <p class="mt-3"><strong>❌ Actions Considered Cheating:</strong></p>
        <ul class="list-disc list-inside space-y-1 ml-2 mt-1">
          <li>Reusing old photos for new games/events</li>
          <li>Pretending to be at a game/event that you are not</li>
          <li>Submitting photos taken by others</li>
        </ul>
        <p class="mt-3"><strong>⚠️ Actions Considered Misconduct:</strong></p>
        <ul class="list-disc list-inside space-y-1 ml-2 mt-1">
          <li>Being thrown out of a game for unsportsmanlike behavior</li>
          <li>Being banned/suspended from events and/or school</li>
          <li>Inappropriate behavior at school events</li>
        </ul>`,
        4,
        true
      ]
    ];

    defaultSections.forEach(row => {
      rulebookSheet.appendRow(row);
    });

    // Auto-resize columns
    rulebookSheet.autoResizeColumns(1, 5);

    // Clear cache
    CacheService.getScriptCache().remove('rulebook_content');

    Logger.log('Config_Rulebook sheet initialized with default content');
  } catch (e) {
    Logger.log('Error initializing Config_Rulebook: ' + e.message);
  }
}

/**
 * Gets the rulebook content from Config_Rulebook sheet.
 * Results are cached for 1 hour.
 * @return {Array} Array of section objects {id, title, content, order, active}
 */
function getRulebookContent() {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'rulebook_content';
    const cached = cache.get(cacheKey);

    if (cached) {
      return safeJSONParse(cached, [], 'rulebook content cache');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rulebookSheet = ss.getSheetByName('Config_Rulebook');

    if (!rulebookSheet) {
      Logger.log('Config_Rulebook sheet not found');
      return [];
    }

    const data = rulebookSheet.getDataRange().getValues();
    const sections = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][4] !== false) { // Only include active sections
        sections.push({
          id: data[i][0],
          title: data[i][1],
          content: data[i][2],
          order: data[i][3] || i,
          active: data[i][4]
        });
      }
    }

    // Sort by display order
    sections.sort((a, b) => a.order - b.order);

    // Cache for 1 hour (3600 seconds)
    cache.put(cacheKey, JSON.stringify(sections), 3600);
    return sections;
  } catch (e) {
    Logger.log('Error reading rulebook content: ' + e.message);
    return [];
  }
}

/**
 * Opens a dialog for editing rulebook content.
 * Admin-only function.
 */
function openRulebookEditor() {
  try {
    // Admin check
    if (!getUserIsAdmin()) {
      SpreadsheetApp.getUi().alert('❌ Unauthorized: Admin access required');
      return;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rulebookSheet = ss.getSheetByName('Config_Rulebook');

    if (!rulebookSheet) {
      SpreadsheetApp.getUi().alert('❌ Config_Rulebook sheet not found. Run First-Time Setup first.');
      return;
    }

    const data = rulebookSheet.getDataRange().getValues();

    let html = '<style>';
    html += 'body { font-family: Arial, sans-serif; padding: 15px; }';
    html += 'h2 { color: #1b3b87; margin-bottom: 10px; }';
    html += '.section { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9; }';
    html += '.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }';
    html += '.section-title { font-size: 16px; font-weight: bold; color: #333; }';
    html += 'label { display: block; margin-top: 8px; font-weight: 500; font-size: 13px; color: #555; }';
    html += 'input[type="text"], input[type="number"] { width: 100%; padding: 6px; margin-top: 4px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }';
    html += 'textarea { width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; min-height: 120px; font-family: monospace; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; }';
    html += 'input[type="checkbox"] { margin-right: 6px; }';
    html += 'button { margin-top: 20px; padding: 10px 20px; background: #1b3b87; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; }';
    html += 'button:hover { background: #0f2550; }';
    html += 'button.secondary { background: #999; }';
    html += 'button.secondary:hover { background: #777; }';
    html += '.hint { font-size: 11px; color: #666; margin-top: 3px; font-style: italic; }';
    html += '</style>';

    html += '<h2>📖 Rulebook Editor</h2>';
    html += '<p style="margin-bottom: 20px; color: #666;">Edit the rulebook sections below. HTML and Tailwind CSS classes are supported.</p>';

    html += '<form id="rulebookForm">';

    // Loop through existing sections
    for (let i = 1; i < data.length; i++) {
      const sectionId = data[i][0];
      const title = data[i][1];
      const content = data[i][2];
      const order = data[i][3] || i;
      const active = data[i][4] !== false;

      html += '<div class="section">';
      html += '<div class="section-header">';
      html += '<div class="section-title">' + title + '</div>';
      html += '<label><input type="checkbox" id="active_' + i + '" ' + (active ? 'checked' : '') + '> Active</label>';
      html += '</div>';

      html += '<input type="hidden" id="section_id_' + i + '" value="' + sectionId + '" />';

      html += '<label>Section Title:</label>';
      html += '<input type="text" id="title_' + i + '" value="' + escapeHtml(title) + '" />';

      html += '<label>Display Order:</label>';
      html += '<input type="number" id="order_' + i + '" value="' + order + '" min="1" />';

      html += '<label>Content (HTML):</label>';
      html += '<div class="hint">Supports HTML and Tailwind CSS classes</div>';
      html += '<textarea id="content_' + i + '">' + escapeHtml(content) + '</textarea>';

      html += '</div>';
    }

    html += '<button type="button" onclick="submitForm(' + (data.length - 1) + ')">💾 Save All Changes</button>';
    html += '<button type="button" onclick="google.script.host.close()" class="secondary" style="margin-left: 8px;">Cancel</button>';
    html += '<button type="button" onclick="openSheetDirectly()" class="secondary" style="margin-left: 8px;">📊 Open Sheet</button>';

    html += '</form>';

    html += '<script>';
    html += 'function submitForm(sectionCount) {';
    html += '  const sections = [];';
    html += '  for (let i = 1; i <= sectionCount; i++) {';
    html += '    sections.push({';
    html += '      id: document.getElementById("section_id_" + i).value,';
    html += '      title: document.getElementById("title_" + i).value,';
    html += '      content: document.getElementById("content_" + i).value,';
    html += '      order: parseInt(document.getElementById("order_" + i).value),';
    html += '      active: document.getElementById("active_" + i).checked';
    html += '    });';
    html += '  }';
    html += '  google.script.run.withSuccessHandler(onSuccess).withFailureHandler(onError).updateRulebookContent(sections);';
    html += '}';
    html += 'function onSuccess(result) {';
    html += '  if (result.status === "success") {';
    html += '    alert("✅ " + result.message);';
    html += '    google.script.host.close();';
    html += '  } else {';
    html += '    alert("❌ " + result.message);';
    html += '  }';
    html += '}';
    html += 'function onError(error) {';
    html += '  alert("❌ Error: " + error.message);';
    html += '}';
    html += 'function openSheetDirectly() {';
    html += '  google.script.run.openRulebookSheet();';
    html += '}';
    html += '</script>';

    const ui = SpreadsheetApp.getUi();
    const dialog = HtmlService.createHtmlOutput(html).setWidth(700).setHeight(600);
    ui.showModalDialog(dialog, 'Rulebook Editor');

  } catch (e) {
    SpreadsheetApp.getUi().alert('Error opening editor: ' + e.message);
  }
}

/**
 * Helper function to escape HTML for dialog display.
 * @param {string} text - Text to escape
 * @return {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Opens the Config_Rulebook sheet directly.
 * Helper function for admin convenience.
 */
function openRulebookSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rulebookSheet = ss.getSheetByName('Config_Rulebook');
    if (rulebookSheet) {
      rulebookSheet.activate();
    }
  } catch (e) {
    Logger.log('Error activating rulebook sheet: ' + e.message);
  }
}

/**
 * Updates the rulebook content in Config_Rulebook sheet.
 * Called from the editor dialog.
 * @param {Array} sections - Array of section objects to update
 * @return {Object} Status object with success/error
 */
function updateRulebookContent(sections) {
  try {
    // Admin check
    if (!getUserIsAdmin()) {
      return { status: 'error', message: 'Unauthorized: Admin access required' };
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      return { status: 'error', message: 'No sections provided' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rulebookSheet = ss.getSheetByName('Config_Rulebook');

    if (!rulebookSheet) {
      return { status: 'error', message: 'Config_Rulebook sheet not found' };
    }

    // Build 2D array with all section data for efficient batch update
    const dataArray = sections.map(section => [
      section.id,
      section.title,
      section.content,
      section.order,
      section.active
    ]);

    // Update all sections in a single API call
    if (dataArray.length > 0) {
      const startRow = 2; // Row 1 is headers, data starts at row 2
      rulebookSheet.getRange(startRow, 1, dataArray.length, 5).setValues(dataArray);
    }

    const updatedCount = sections.length;

    // Clear cache so new content is picked up
    CacheService.getScriptCache().remove('rulebook_content');

    Logger.log(`Rulebook content updated: ${updatedCount} sections changed by ${Session.getActiveUser().getEmail()}`);

    return { status: 'success', message: `Successfully updated ${updatedCount} sections!` };
  } catch (e) {
    Logger.log('Error updating rulebook content: ' + e.message);
    return { status: 'error', message: e.message };
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
      appUrl: "<?= getWebAppUrl() ?>",
      badgeBaseUrl: "<?= badgeBaseUrl ?>"
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
  </style>`,
    'JavaScript.html': `<script>
    // --- STATE & PAGE ROUTING -----------------------------------------------
    let currentProfileData = null; // Store full profile data for leaderboard toggling

    const TITLES = {
      'profile': 'My Profile', 'history': 'Event History', 'prizes': 'Prizes & Awards',
      'fanfeed': 'Fan Feed', 'submit': 'Submit Attendance',
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

    // NOTE: All event listeners and page-specific logic have been moved to JavaScript.html
    // This includes page routing, button event handlers, and modal management

    // --- DATA POPULATION ---

    // Helper function to escape HTML to prevent XSS
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function updateLeaderboardDisplay(leaderboard) {
      const lbContainer = document.getElementById('leaderboard-container');

      // Build complete HTML string first (performance optimization - single DOM update)
      let htmlContent = '';

      leaderboard.forEach(item => {
        // Add gap indicator if needed (with accessibility attributes)
        if (item.showGapBefore) {
          htmlContent += \`
            <div class="flex items-center justify-center py-2" role="separator" aria-label="Gap in rankings">
              <span class="text-gray-400 dark:text-gray-500 text-sm">···</span>
            </div>\`;
        }

        // Determine if this is the first place for special styling
        const isFirstPlace = item.rank === 1;

        // Escape user name to prevent XSS
        const escapedName = escapeHtml(item.name);

        // Fix: Combine first place and current user styling when both apply
        const backgroundClass = item.isCurrentUser
          ? (isFirstPlace ? 'bg-primary/15 dark:bg-primary/25 border-l-4 border-primary' : 'bg-primary/5 dark:bg-primary/10 border-l-4 border-primary')
          : (isFirstPlace ? 'bg-primary/10 dark:bg-primary/20' : '');

        // Build row HTML with conditional user highlighting
        htmlContent += \`
          <div class="flex items-center gap-3 rounded-lg p-3 \${backgroundClass}" \${item.isCurrentUser ? 'aria-current="true"' : ''}>
            <span class="font-bold text-lg \${isFirstPlace ? 'text-primary dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'} w-5 text-center">\${item.rank}</span>
            <span class="material-symbols-outlined text-2xl \${item.color}">\${item.icon}</span>
            <span class="flex-1 truncate font-medium text-[#111318] dark:text-white \${item.isCurrentUser ? 'font-semibold' : ''}">\${escapedName}\${item.isCurrentUser ? ' <span class="text-primary dark:text-blue-300 text-sm">(You)</span>' : ''}</span>
            <span class="font-bold \${isFirstPlace ? 'text-primary dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'}">\${item.points} PTS</span>
          </div>\`;
      });

      // Set innerHTML once (performance optimization)
      lbContainer.innerHTML = htmlContent;
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
        <li>Tap "Check In" on your profile to attend an event.</li>
        <li>Your location will be detected automatically and you can submit your photo.</li>
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
    let refreshInterval = null;
    const REFRESH_INTERVAL_MS = 10000; // 10 seconds

    // Helper function to start auto-refresh
    function startRefresh() {
      if (!refreshInterval) {
        refreshInterval = setInterval(loadFanFeed, REFRESH_INTERVAL_MS);
      }
    }

    // Helper function to stop auto-refresh
    function stopRefresh() {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      loadFanFeed();
      startRefresh();

      // Pause refresh when page is hidden to reduce API calls
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          stopRefresh();
        } else {
          // Resume refresh when page becomes visible
          loadFanFeed(); // Load immediately
          startRefresh();
        }
      });
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
          container.innerHTML = '<p class="text-center text-gray-500 py-8">No approved photos yet. Check in at an event to get started!</p>';
          return;
        }

        container.innerHTML = '';
        photos.forEach(photo => {
          const card = document.createElement('div');
          card.className = 'bg-white dark:bg-gray-800/50 rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700';

          // Create img element directly for better security instead of innerHTML
          const img = document.createElement('img');
          img.src = photo.photoUrl;
          img.alt = 'Event photo';
          img.className = 'w-full h-64 object-cover';

          // Create content div
          const contentDiv = document.createElement('div');
          contentDiv.innerHTML = \`
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

          card.appendChild(img);
          card.appendChild(contentDiv);
          container.appendChild(card);
        });
      }).getFanFeed();
    }

    function toggleLike(submissionId) {
      // This can be extended to implement actual like functionality
      // console.log('Liked submission:', submissionId);
    }
  </script>`,
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
            <input type="number" id="approval-base-points" value="0" min="0" class="w-full p-2 border rounded-lg bg-gray-100 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white">
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

    // Store points config globally for access in functions
    let pointsConfig = {
      'Base_Points_With_Theme': 75,
      'Base_Points_Without_Theme': 50,
      'Theme_Bonus': 25,
      'Spotlight_Game_Multiplier': 1.5,
      'Home_Game_Bonus': 10
    };

    document.addEventListener('DOMContentLoaded', () => {
      // Load points configuration
      google.script.run.getPointsConfig((config) => {
        pointsConfig = config;
        // Update default values in the form
        document.getElementById('approval-base-points').placeholder = 'e.g. ' + pointsConfig['Base_Points_Without_Theme'];
      });

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
      const themeBonus = document.getElementById('approval-theme-bonus').checked ? pointsConfig['Theme_Bonus'] : 0;
      const multiplier = document.getElementById('approval-spotlight-multiplier').checked ? pointsConfig['Spotlight_Game_Multiplier'] : 1;
      const total = Math.round(basePoints * multiplier + themeBonus);

      document.getElementById('approval-total-points').innerText = 'Total: ' + total + ' PTS';
    }

    function confirmApproval() {
      const basePoints = parseInt(document.getElementById('approval-base-points').value) || 0;
      const themeBonus = document.getElementById('approval-theme-bonus').checked ? pointsConfig['Theme_Bonus'] : 0;
      const multiplier = document.getElementById('approval-spotlight-multiplier').checked ? pointsConfig['Spotlight_Game_Multiplier'] : 1;

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
        // Clear cache to force reload with new active season
        CacheService.getScriptCache().remove('active_season');
        CacheService.getScriptCache().remove('active_events_data');
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

    // Clear caches to force reload with updated season assignments
    CacheService.getScriptCache().remove('active_season');
    CacheService.getScriptCache().remove('active_events_data');

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

    // Clear caches to force refresh (though new activity won't affect existing events)
    CacheService.getScriptCache().remove('active_season');
    CacheService.getScriptCache().remove('active_events_data');

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

      // Get Events sheet
      const eventsSheet = ss.getSheetByName('Events');
      if (!eventsSheet) return [];
      const eventsData = eventsSheet.getDataRange().getValues();

      // Get Activities_Data for joining
      const activitiesSheet = ss.getSheetByName('Activities_Data');
      if (!activitiesSheet) return [];
      const activitiesData = activitiesSheet.getDataRange().getValues();

      // Build activities lookup map
      const activitiesMap = {};
      for (let i = 1; i < activitiesData.length; i++) {
        const code = String(activitiesData[i][0]).trim();
        activitiesMap[code] = {
          activityName: activitiesData[i][1],
          season: activitiesData[i][2]
        };
      }

      // Get active season for filtering
      const activeSeason = getActiveSeason();

      // Column indices for Events sheet
      const COL_EVENT_ID = 0;
      const COL_ACTIVITY_CODE = 1;
      const COL_EVENT_NAME = 2;
      const COL_LOCATION_NAME = 4;
      const COL_EVENT_LAT = 5;
      const COL_EVENT_LON = 6;
      const COL_START_TIME = 7;
      const COL_DURATION_HOURS = 8;
      const COL_IS_ACTIVE = 12;

      // Transform and cache the event data
      eventData = [];
      for (let i = 1; i < eventsData.length; i++) {
        const isActive = eventsData[i][COL_IS_ACTIVE];
        const activityCode = String(eventsData[i][COL_ACTIVITY_CODE]).trim();

        // Only include active events from the active season
        const activity = activitiesMap[activityCode];
        if (isActive === true && activity && activity.season === activeSeason) {
          // Normalize startTime to prevent UTC conversion when caching
          let startTime = eventsData[i][COL_START_TIME];
          if (startTime instanceof Date) {
            // Convert Date object to Central Time string to avoid UTC conversion in JSON.stringify
            startTime = Utilities.formatDate(startTime, 'America/Chicago', 'yyyy-MM-dd HH:mm');
          } else if (typeof startTime === 'string') {
            // Keep string as-is
            startTime = startTime;
          }

          eventData.push({
            eventCode: eventsData[i][COL_EVENT_ID],
            eventName: eventsData[i][COL_EVENT_NAME] || activity.activityName,
            locationName: eventsData[i][COL_LOCATION_NAME],
            eventLat: eventsData[i][COL_EVENT_LAT],
            eventLon: eventsData[i][COL_EVENT_LON],
            startTime: startTime,
            durationHours: eventsData[i][COL_DURATION_HOURS],
            season: activity.season
          });
        }
      }

      // Cache for 10 minutes (600 seconds) - shorter since Is_Active is updated by trigger
      cache.put(cacheKey, JSON.stringify(eventData), 600);
    } else {
      eventData = safeJSONParse(eventData, null, 'event data cache');
    }

    const activeEvents = [];

    for (let i = 0; i < eventData.length; i++) {
      const item = eventData[i];

      // Parse start time for calculating end time
      let eventStartTime;
      let eventEndTime;

      try {
        if (item.startTime instanceof Date) {
          eventStartTime = item.startTime;
        } else if (typeof item.startTime === 'string') {
          const str = item.startTime;

          // Handle UTC ISO format (from JSON.stringify): "2025-11-06T01:25:00.000Z"
          if (str.endsWith('Z') || str.includes('+') || /\-\d{2}:\d{2}$/.test(str)) {
            const utcDate = new Date(str);
            const centralStr = Utilities.formatDate(utcDate, 'America/Chicago', 'yyyy-MM-dd HH:mm');
            eventStartTime = Utilities.parseDate(centralStr, 'America/Chicago', 'yyyy-MM-dd HH:mm');
          }
          // Handle local ISO format without timezone: "2025-11-06T18:30"
          else if (str.includes('T')) {
            const normalized = str.substring(0, 16).replace('T', ' ');
            eventStartTime = Utilities.parseDate(normalized, 'America/Chicago', 'yyyy-MM-dd HH:mm');
          }
          // Handle space-separated format: "2025-11-06 18:30"
          else {
            eventStartTime = Utilities.parseDate(str, 'America/Chicago', 'yyyy-MM-dd HH:mm');
          }
        } else {
          eventStartTime = new Date(String(item.startTime));
        }
        eventEndTime = new Date(eventStartTime.getTime() + item.durationHours * 60 * 60 * 1000);

        Logger.log(`Active event found: ${item.eventName} (${item.eventCode})`);
      } catch (e) {
        Logger.log(`ERROR: Failed to parse date for event ${item.eventCode}: ${e.message}`);
        continue;
      }

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

    // Sort by distance if user location was provided
    if (userLat !== null && userLon !== null) {
      activeEvents.sort((a, b) => a.distance - b.distance);
    }

    Logger.log(`getActiveEvents returning ${activeEvents.length} active events`);
    return activeEvents;
  } catch (e) {
    Logger.log('Error in getActiveEvents: ' + e.message);
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
 * Used for location-based direct check-in flow.
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

    // Load Activities_Data to get activity names
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    if (!activitiesSheet) {
      Logger.log('Warning: Activities_Data sheet not found. Events will not have user-friendly activity names.');
      return { status: 'error', message: 'Activities_Data sheet not found' };
    }
    const activityMap = {};
    const activitiesData = activitiesSheet.getDataRange().getValues();
    // Columns: Activity_Code, Activity_Name, Season, Location_Name, Event_Lat, Event_Lon
    for (let i = 1; i < activitiesData.length; i++) {
      if (activitiesData[i][0]) {
        activityMap[String(activitiesData[i][0]).trim()] = String(activitiesData[i][1] || '').trim();
      }
    }

    const data = sheet.getDataRange().getValues();
    const events = [];
    const now = new Date();

    // Skip header row (row 0)
    // Columns: Event_ID, Activity_Code, Event_Name, Date, Location_Name, Event_Lat, Event_Lon, Start_Time, Duration_Hours, Is_Home_Game, Is_Spotlight_Game, Theme
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) { // If Event_ID exists
        // Format the date properly - data[i][3] may be a Date object from Sheets
        let eventDate = '';
        let eventDateObj = null;
        if (data[i][3]) {
          if (data[i][3] instanceof Date) {
            eventDateObj = new Date(data[i][3]);
            // Format as "M/D/YYYY" to match user-friendly date display
            eventDate = Utilities.formatDate(data[i][3], Session.getScriptTimeZone(), 'M/d/yyyy');
          } else {
            eventDate = String(data[i][3] || '').trim();
            // Try to parse string date
            eventDateObj = new Date(eventDate);
          }
        }
        let eventStartTime = data[i][7];

        // Handle different startTime formats
        let dateTimeCombined = '';
        let formattedStartTime = '';
        let hours = 0, minutes = 0;
        if (eventStartTime) {
          if (eventStartTime instanceof Date) {
            // Date object from Sheets - format for display and for datetime-local input
            dateTimeCombined = Utilities.formatDate(eventStartTime, 'America/Chicago', "yyyy-MM-dd'T'HH:mm");
            // Format for display: "2:30 PM" style
            formattedStartTime = Utilities.formatDate(eventStartTime, Session.getScriptTimeZone(), 'h:mm a');
            hours = eventStartTime.getHours();
            minutes = eventStartTime.getMinutes();
          } else {
            // String format - parse and format
            const str = String(eventStartTime).trim();
            if (str.includes('T')) {
              // Already has 'T': "2025-11-06T18:30" or "2025-11-06T18:30:00"
              dateTimeCombined = str.substring(0, 16); // Take just YYYY-MM-DDTHH:mm
              formattedStartTime = str.substring(11, 16); // Extract HH:mm
              const timeParts = str.substring(11, 16).split(':');
              hours = parseInt(timeParts[0]) || 0;
              minutes = parseInt(timeParts[1]) || 0;
            } else if (str.includes(' ')) {
              // Space-separated: "2025-11-06 18:30" → "2025-11-06T18:30"
              dateTimeCombined = str.substring(0, 16).replace(' ', 'T');
              formattedStartTime = str.substring(11, 16); // Extract HH:mm
              const timeParts = str.substring(11, 16).split(':');
              hours = parseInt(timeParts[0]) || 0;
              minutes = parseInt(timeParts[1]) || 0;
            } else if (str.match(/^\d{1,2}:\d{2}/)) {
              // Just a time like "18:30" - try to use it
              formattedStartTime = str;
              dateTimeCombined = eventDate ? `${eventDate}T${str}` : '';
              const timeParts = str.split(':');
              hours = parseInt(timeParts[0]) || 0;
              minutes = parseInt(timeParts[1]) || 0;
            }
          }
          eventStartTime = String(eventStartTime).trim();
        }

        // Calculate event end time and check if it's expired
        let isExpired = true;
        if (eventDateObj && !isNaN(eventDateObj.getTime())) {
          const eventEndDate = new Date(eventDateObj);
          eventEndDate.setHours(hours);
          eventEndDate.setMinutes(minutes);

          const duration = parseFloat(data[i][8]) || 0;
          eventEndDate.setHours(eventEndDate.getHours() + Math.floor(duration));
          eventEndDate.setMinutes(eventEndDate.getMinutes() + Math.round((duration % 1) * 60));

          // Include event only if it hasn't ended yet
          isExpired = eventEndDate <= now;
        }

        if (!isExpired) {
          const activityCode = String(data[i][1] || '').trim();
          events.push({
            eventId: String(data[i][0]).trim(),
            activityCode: activityCode, // Use activityCode for consistency
            sportArt: activityMap[activityCode] || activityCode, // Add sportArt field (activity name)
            eventName: String(data[i][2] || '').trim(),
            date: eventDate,
            locationName: String(data[i][4] || '').trim(),
            lat: parseFloat(data[i][5]) || 0,
            lon: parseFloat(data[i][6]) || 0,
            startTime: eventStartTime,
            formattedStartTime: formattedStartTime, // Human-readable time for display
            dateTime: dateTimeCombined, // Combined date and time for datetime-local input
            duration: String(data[i][8] || '').trim(),
            isHomeGame: true, // Hardcoded to true
            isSpotlightGame: data[i][10] || false,
            theme: String(data[i][11] || '').trim(),
            rowIndex: i + 1 // 1-indexed for Apps Script
          });
        }
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

    // Parse dateTime from frontend (comes as "2025-11-06T18:30")
    // IMPORTANT: Treat this as Central Time, not UTC
    // Convert "2025-11-06T18:30" to "2025-11-06 18:30" for parseDate
    const dateTimeStr = eventData.dateTime.replace('T', ' ');
    const dateTime = Utilities.parseDate(dateTimeStr, 'America/Chicago', 'yyyy-MM-dd HH:mm');
    const date = Utilities.formatDate(dateTime, 'America/Chicago', 'yyyy-MM-dd');
    const startTime = Utilities.formatDate(dateTime, 'America/Chicago', 'yyyy-MM-dd HH:mm');

    // Add new row: Event_ID, Activity_Code, Event_Name, Date, Location_Name, Event_Lat, Event_Lon, Start_Time, Duration_Hours, Is_Home_Game, Is_Spotlight_Game, Theme, Is_Active
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
      eventData.theme || '',                        // L: Theme
      false                                         // M: Is_Active (starts as false, will be updated by trigger)
    ]);

    // Clear cache so new event appears after trigger runs
    CacheService.getScriptCache().remove('active_events_data');

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

        // Parse dateTime from frontend (comes as "2025-11-06T18:30")
        // IMPORTANT: Treat this as Central Time, not UTC
        // Convert "2025-11-06T18:30" to "2025-11-06 18:30" for parseDate
        const dateTimeStr = eventData.dateTime.replace('T', ' ');
        const dateTime = Utilities.parseDate(dateTimeStr, 'America/Chicago', 'yyyy-MM-dd HH:mm');
        const date = Utilities.formatDate(dateTime, 'America/Chicago', 'yyyy-MM-dd');
        const startTime = Utilities.formatDate(dateTime, 'America/Chicago', 'yyyy-MM-dd HH:mm');

        // Update columns 2-13 (Activity_Code through Is_Active)
        sheet.getRange(i + 1, 2, 1, 12).setValues([[
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
          eventData.theme || '',                        // L: Theme
          false                                         // M: Is_Active (reset to false, will be updated by trigger)
        ]]);

        // Clear cache so updated event reflects after trigger runs
        CacheService.getScriptCache().remove('active_events_data');

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

        // Clear cache so deleted event is removed from active events
        CacheService.getScriptCache().remove('active_events_data');

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

    // Build full queue (skip empty rows from cleared submissions)
    const fullQueue = [];
    for (let i = 1; i < pendingData.length; i++) {
      // Skip empty rows (cleared submissions)
      if (!pendingData[i][0] || pendingData[i][0] === '') {
        continue;
      }

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

    // Validate required sheets exist before attempting operations
    const pendingSheet = ss.getSheetByName('Submissions_Pending');
    if (!pendingSheet) {
      return { status: "error", message: "CRITICAL: Submissions_Pending sheet not found. Check spreadsheet schema." };
    }

    // Find the pending submission
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
    const studentSheet = ss.getSheetByName('Student_Profiles');
    if (!studentSheet) {
      return { status: "error", message: "CRITICAL: Student_Profiles sheet not found. Check spreadsheet schema." };
    }
    const studentData = studentSheet.getDataRange().getValues();

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === submissionInfo[2]) {
        // Update season and all-time points
        const newSeasonPoints = (studentData[i][2] || 0) + pointsTotal;
        const newAllTimePoints = (studentData[i][3] || 0) + pointsTotal;

        // Batch update both points columns in single API call (more efficient)
        studentSheet.getRange(i + 1, 3, 1, 2).setValues([[newSeasonPoints, newAllTimePoints]]);
        break;
      }
    }

    // Calculate badges for the student (skip season-end badges during approval - only calculate at season-end)
    calculateBadges(submissionInfo[2], true);

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
    Logger.log('ERROR in approveSubmission: ' + e.message + ' | Stack: ' + e.stack);
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

    // Validate required sheets exist before attempting operations
    const pendingSheet = ss.getSheetByName('Submissions_Pending');
    if (!pendingSheet) {
      return { status: "error", message: "CRITICAL: Submissions_Pending sheet not found. Check spreadsheet schema." };
    }

    // Find the pending submission
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

    // Move to Submissions_Denied for record keeping
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
        submissionInfo[4], // Photo_URL
        submissionInfo[5] // Photo_ID
      ]);
    } else {
      Logger.log('WARNING: Submissions_Denied sheet not found. Denial not archived.');
    }

    // Clear row from Submissions_Pending (don't delete to avoid "can't delete last row" error)
    const numColumns = pendingSheet.getLastColumn();
    pendingSheet.getRange(submissionRow, 1, 1, numColumns).clearContent();

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
    Logger.log('ERROR in denySubmission: ' + e.message + ' | Stack: ' + e.stack);
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
 * Calculates badges earned based on student points and saves to Student_Profiles.
 * Called after a submission is approved.
 * @param {string} email - Student email
 */
function calculateBadges(email, skipSeasonEndBadges = false) {
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
          earnedBadges: studentData[i][4] ? safeJSONParse(studentData[i][4], [], 'badge array') : []
        };
        break;
      }
    }

    if (!studentProfile) return;

    // Get all badges
    const badgesSheet = ss.getSheetByName('Config_Badges');
    const badgesData = badgesSheet.getDataRange().getValues();

    // PERFORMANCE: Fetch sheet data ONCE outside the loop to avoid redundant reads
    // These sheets are used by multiple badge trigger types
    const verifiedSheet = ss.getSheetByName('Submissions_Verified');
    const verifiedData = verifiedSheet.getDataRange().getValues();
    const eventSheet = ss.getSheetByName('Events');
    const eventData = eventSheet.getDataRange().getValues();

    // Get active season for season-scoped badges
    const activeSeason = getActiveSeason();

    // Build activity-to-season map for filtering
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    const activitiesData = activitiesSheet.getDataRange().getValues();
    const activitySeasonMap = {};
    for (let j = 1; j < activitiesData.length; j++) {
      activitySeasonMap[activitiesData[j][0]] = activitiesData[j][2]; // Activity_Code -> Season
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
        // Count verified submissions for this student - must have valid trigger value
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;
        let submissionCount = 0;
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) submissionCount++;
        }
        shouldEarn = submissionCount >= triggerValue;
      } else if (triggerType === 'Events_In_7_Days') {
        // Count events attended in last 7 days - must have valid trigger value
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        let recentCount = 0;
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) {
            const submissionDate = new Date(verifiedData[j][1]);
            if (submissionDate >= sevenDaysAgo) {
              recentCount++;
            }
          }
        }
        shouldEarn = recentCount >= triggerValue;
      } else if (triggerType === 'Distinct_Sports') {
        // Count unique sports/activities attended - must have valid trigger value
        if (typeof triggerValue !== 'number' || triggerValue <= 0) continue;

        // Build event to activity map
        const eventToActivity = {};
        for (let j = 1; j < eventData.length; j++) {
          eventToActivity[eventData[j][0]] = eventData[j][1]; // Event_ID -> Activity_Code
        }

        // Count distinct activities
        const distinctActivities = new Set();
        for (let j = 1; j < verifiedData.length; j++) {
          if (verifiedData[j][3] === email) {
            const eventId = verifiedData[j][4];
            const activity = eventToActivity[eventId];
            if (activity) distinctActivities.add(activity);
          }
        }
        shouldEarn = distinctActivities.size >= triggerValue;
      } else if (triggerType === 'Activity_Pct_Lifetime') {
        // Percentage of a specific activity's games attended ACROSS ALL SEASONS (LIFETIME)
        // Format: "ACTIVITY_CODE:PERCENTAGE" e.g., "BB:0.25" for 25% of all basketball games
        if (typeof triggerValue !== 'string' || !triggerValue.includes(':')) continue;

        const [activityCode, percentageStr] = triggerValue.split(':');
        const requiredPercentage = parseFloat(percentageStr);

        if (!activityCode || isNaN(requiredPercentage) || requiredPercentage < 0 || requiredPercentage > 1) continue;

        // Count total events for this activity
        let totalActivityEvents = 0;
        const activityEventIds = new Set();
        for (let j = 1; j < eventData.length; j++) {
          if (eventData[j][1] === activityCode) { // Activity_Code column
            totalActivityEvents++;
            activityEventIds.add(eventData[j][0]); // Event_ID
          }
        }

        // Count attended events for this activity
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
        const verifiedSheet = ss.getSheetByName('Submissions_Verified');
        const verifiedData = verifiedSheet.getDataRange().getValues();
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

        // Send notification for new badge
        notifyBadgeEarned(email, badgesData[i][1]); // badgesData[i][1] is Badge_Name
      }
    }

    // Update Student_Profiles with new badges and updated points
    // Batch update badges (column 5) and season/all-time points (columns 3-4)
    studentSheet.getRange(studentRow, 3, 1, 3).setValues([
      [studentProfile.seasonPoints, studentProfile.allTimePoints, JSON.stringify(studentProfile.earnedBadges)]
    ]);

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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const studentData = studentSheet.getDataRange().getValues();

    let studentsProcessed = 0;
    let badgesAwarded = 0;

    // Loop through all students (skip header row)
    for (let i = 1; i < studentData.length; i++) {
      const email = studentData[i][0];

      if (!email) continue; // Skip empty rows

      // Get current badge count for this student
      const currentBadges = studentData[i][4] ? safeJSONParse(studentData[i][4], [], 'badge array') : [];
      const beforeCount = currentBadges.length;

      // Calculate badges (this will add any newly qualified badges)
      calculateBadges(email);

      // Check how many badges were added
      const updatedData = studentSheet.getDataRange().getValues();
      const afterBadges = updatedData[i][4] ? safeJSONParse(updatedData[i][4], [], 'badge array') : [];
      const afterCount = afterBadges.length;

      studentsProcessed++;
      badgesAwarded += (afterCount - beforeCount);
    }

    // Show completion message
    SpreadsheetApp.getUi().alert(
      '✅ Retroactive Badge Award Complete!\n\n' +
      'Students Processed: ' + studentsProcessed + '\n' +
      'Total Badges Awarded: ' + badgesAwarded + '\n\n' +
      'All existing users have now received badges they qualified for based on their current points and submission history.'
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const studentData = studentSheet.getDataRange().getValues();
    const badgesSheet = ss.getSheetByName('Config_Badges');
    const badgesData = badgesSheet.getDataRange().getValues();

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
          studentSheet.getRange(studentRowIndex + 1, 5).setValue(JSON.stringify(currentBadges));
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

          // Send notification
          notifyBadgeEarned(topStudent.email, badge.badgeName);
        }
      }
    }

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

      // Check how many badges were added
      const updatedData = studentSheet.getDataRange().getValues();
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
      '⭐ Other Season Badges Awarded: ' + otherBadgesAwarded + '\n' +
      '👥 Students Processed: ' + studentsProcessed + '\n\n' +
      'All students have been awarded their final season badges!'
    );

  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error processing season-end badges:\n\n' + e.message);
    Logger.log('Error in processSeasonEndBadges: ' + e.message);
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
    const daysBack = 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Get student name mapping
    const profileSheet = ss.getSheetByName('Student_Profiles');
    if (!profileSheet) throw new Error("Sheet 'Student_Profiles' not found");
    const profileData = profileSheet.getDataRange().getValues();
    const studentMap = {};
    for (let i = 1; i < profileData.length; i++) {
      studentMap[profileData[i][0]] = profileData[i][1]; // email -> display name
    }

    // Get event details map
    const eventSheet = ss.getSheetByName('Events');
    if (!eventSheet) throw new Error("Sheet 'Events' not found");
    const eventData = eventSheet.getDataRange().getValues();
    const eventMap = {};
    for (let i = 1; i < eventData.length; i++) {
      eventMap[eventData[i][0]] = {
        eventName: eventData[i][2],
        sportArt: eventData[i][1]
      };
    }

    const feedItems = [];

    // Get photo submissions
    const verifiedSheet = ss.getSheetByName('Submissions_Verified');
    if (!verifiedSheet) throw new Error("Sheet 'Submissions_Verified' not found");
    const verifiedData = verifiedSheet.getDataRange().getValues();

    for (let i = 1; i < verifiedData.length; i++) {
      const timestamp = new Date(verifiedData[i][2]); // Timestamp_Approved

      // Filter by date
      if (timestamp < cutoffDate) continue;

      const eventInfo = eventMap[verifiedData[i][4]] || { eventName: 'Event', sportArt: 'Event' };
      const photoId = verifiedData[i][11]; // Photo_ID (column L, index 11)

      // Skip if no photo ID (we need it to generate base64 data URL like admin page does)
      if (!photoId) continue;

      // Convert photo to base64 data URL (same approach as admin dashboard)
      let imageUrl = '';
      try {
        const imageResponse = serveImage(photoId);
        if (imageResponse.status === 'success') {
          imageUrl = imageResponse.dataUrl;
        } else {
          Logger.log('DEBUG: serveImage failed for photoId ' + photoId);
          continue;
        }
      } catch (e) {
        Logger.log('DEBUG: Error getting image for photoId ' + photoId + ': ' + e.message);
        continue;
      }

      feedItems.push({
        type: 'photo',
        submissionId: verifiedData[i][0],
        timestamp: timestamp.getTime(), // Convert to milliseconds (serializable)
        _time: timestamp.getTime(), // Cache parsed time for efficient sorting
        studentEmail: verifiedData[i][3],
        studentName: studentMap[verifiedData[i][3]] || verifiedData[i][3],
        eventName: eventInfo.eventName,
        eventId: verifiedData[i][4],
        imageUrl: imageUrl, // Base64 data URL (like admin page uses)
        likes: 0
      });
    }


    // Add badge awards
    const badgeAwardsSheet = ss.getSheetByName('Badge_Awards');
    if (badgeAwardsSheet) {
      const badgeAwardsData = badgeAwardsSheet.getDataRange().getValues();

      for (let i = 1; i < badgeAwardsData.length; i++) {
        const timestamp = new Date(badgeAwardsData[i][1]); // Timestamp

        // Filter by date
        if (timestamp < cutoffDate) continue;

        feedItems.push({
          type: 'badge',
          awardId: badgeAwardsData[i][0],
          timestamp: timestamp.getTime(), // Convert to milliseconds (serializable)
          _time: timestamp.getTime(), // Cache parsed time for efficient sorting
          studentEmail: badgeAwardsData[i][2],
          studentName: badgeAwardsData[i][3], // Display_Name
          badgeId: badgeAwardsData[i][4],
          badgeName: badgeAwardsData[i][5],
          badgeImageUrl: badgeAwardsData[i][6]
        });
      }
    }

    // Sort by cached _time (most recent first) and limit to 50 items
    feedItems.sort((a, b) => b._time - a._time);
    const recentItems = feedItems.slice(0, 50);

    return {
      status: "success",
      items: recentItems,
      daysShown: daysBack,
      timestamp: new Date().getTime() // Add update timestamp for client
    };

  } catch (e) {
    return {
      status: "error",
      message: "Error fetching fan feed: " + e.message
    };
  }
}

/**
 * Cached wrapper for getFanFeed().
 * Caches results for 5 minutes to reduce Sheet reads and improve performance.
 * @return {object} Cached fan feed data with timestamp
 */
function getFanFeedCached() {
  const cache = CacheService.getUserCache();
  const cacheKey = 'fanfeed_cache';
  const cacheTTL = 300; // 5 minutes in seconds

  try {
    // Try to get cached data
    const cached = cache.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      data.fromCache = true; // Indicate this came from cache
      return data;
    }

    // Cache miss - fetch fresh data
    const freshData = getFanFeed();
    if (freshData.status === 'success') {
      // Cache the successful result
      cache.put(cacheKey, JSON.stringify(freshData), cacheTTL);
      freshData.fromCache = false;
    }
    return freshData;

  } catch (e) {
    // On cache error, fall back to fresh fetch
    return getFanFeed();
  }
}

/**
 * Clears the fan feed cache (useful for manual refresh or admin actions).
 * @return {object} Status object
 */
function clearFanFeedCache() {
  try {
    const cache = CacheService.getUserCache();
    cache.remove('fanfeed_cache');
    return { status: "success", message: "Cache cleared" };
  } catch (e) {
    return { status: "error", message: "Error clearing cache: " + e.message };
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
    const storedNotifications = userProperties.getProperty(notificationsKey);
    if (storedNotifications) {
      notifications = safeJSONParse(storedNotifications, [], 'notifications');
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const badgesSheet = ss.getSheetByName('Config_Badges');

    if (!badgesSheet) {
      Logger.log('Config_Badges sheet not found');
      return [];
    }

    const badgesData = badgesSheet.getDataRange().getValues();
    const badges = [];

    for (let i = 1; i < badgesData.length; i++) {
      if (badgesData[i][0]) { // Only include rows with badge ID
        badges.push({
          badgeId: badgesData[i][0],
          badgeName: badgesData[i][1],
          category: badgesData[i][2],
          triggerType: badgesData[i][3],
          triggerValue: badgesData[i][4],
          description: badgesData[i][5],
          imageUrl: badgesData[i][6]
        });
      }
    }

    return badges;
  } catch (e) {
    Logger.log('Error in getAllBadges: ' + e.message);
    return [];
  }
}

function getAllBadgesForAdmin() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const badgesSheet = ss.getSheetByName('Config_Badges');
    const badgesData = badgesSheet.getDataRange().getValues();

    const badges = [];
    for (let i = 1; i < badgesData.length; i++) {
      badges.push({
        badgeId: badgesData[i][0],
        badgeName: badgesData[i][1],
        category: badgesData[i][2],
        triggerType: badgesData[i][3],
        triggerValue: badgesData[i][4],
        description: badgesData[i][5],
        imageUrl: badgesData[i][6],
        rowIndex: i + 1 // Store row index for updates
      });
    }

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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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

    // Generate badge ID
    const existingData = badgesSheet.getDataRange().getValues();
    let maxId = 0;
    for (let i = 1; i < existingData.length; i++) {
      const idNum = parseInt(existingData[i][0].replace('badge_', ''));
      if (idNum > maxId) maxId = idNum;
    }
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
      Logger.log('[updateBadge] Badge not found: ' + badgeId);
      return {
        status: 'error',
        message: 'Badge not found'
      };
    }
    Logger.log('[updateBadge] Found badge at row: ' + badgeRow);

    // Use new image URL if provided, otherwise keep existing (frontend already uploaded to Firebase)
    const existingUrl = badgesData[badgeRow - 1][6];
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const badgesSheet = ss.getSheetByName('Config_Badges');
    const badgesData = badgesSheet.getDataRange().getValues();

    // Find badge
    let badgeName = null;
    for (let i = 1; i < badgesData.length; i++) {
      if (badgesData[i][0] === badgeId) {
        badgeName = badgesData[i][1];
        break;
      }
    }

    if (!badgeName) {
      return { status: 'error', message: 'Badge not found' };
    }

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

// =====================================================================
// SEASON PRIZES MANAGEMENT (Admin Dashboard)
// =====================================================================

/**
 * Gets all season prizes from Active_Season_Prizes sheet.
 * @return {Object} Response with prizes array
 */
function getAllSeasonPrizes() {
  try {
    Logger.log('[getAllSeasonPrizes] Starting');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const prizesSheet = ss.getSheetByName('Active_Season_Prizes');

    if (!prizesSheet) {
      Logger.log('[getAllSeasonPrizes] ERROR: Active_Season_Prizes sheet not found');
      return { status: 'error', message: 'Active_Season_Prizes sheet not found' };
    }

    const data = prizesSheet.getDataRange().getValues();
    Logger.log('[getAllSeasonPrizes] Found ' + (data.length - 1) + ' prizes');

    // Skip header row, map to objects with row indices
    const prizes = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) { // Only include rows with data in column A
        prizes.push({
          rowIndex: i + 1, // 1-indexed for sheet operations
          rank: data[i][0],
          description: data[i][1] || ''
        });
      }
    }

    return {
      status: 'success',
      prizes: prizes
    };
  } catch (e) {
    Logger.log('[getAllSeasonPrizes] ERROR: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: 'error',
      message: 'Error fetching prizes: ' + e.message
    };
  }
}

/**
 * Creates a new prize in Active_Season_Prizes sheet.
 * @param {string} rank - Prize rank/placement (e.g., "1st Place", "Most Spirited")
 * @param {string} description - Prize description
 * @return {Object} Response with status
 */
function createPrize(rank, description) {
  try {
    Logger.log('[createPrize] Rank: ' + rank + ' | Description: ' + description);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const prizesSheet = ss.getSheetByName('Active_Season_Prizes');

    if (!prizesSheet) {
      return { status: 'error', message: 'Active_Season_Prizes sheet not found' };
    }

    // Validate required fields
    if (!rank || !rank.trim()) {
      return { status: 'error', message: 'Rank/placement is required' };
    }
    if (!description || !description.trim()) {
      return { status: 'error', message: 'Prize description is required' };
    }

    // Append new row
    prizesSheet.appendRow([rank.trim(), description.trim()]);
    Logger.log('[createPrize] Prize added successfully');

    return {
      status: 'success',
      message: 'Prize created successfully!'
    };
  } catch (e) {
    Logger.log('[createPrize] ERROR: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: 'error',
      message: 'Error creating prize: ' + e.message
    };
  }
}

/**
 * Updates an existing prize in Active_Season_Prizes sheet.
 * @param {number} rowIndex - Row index (1-based) to update
 * @param {string} rank - Updated rank/placement
 * @param {string} description - Updated prize description
 * @return {Object} Response with status
 */
function updatePrize(rowIndex, rank, description) {
  try {
    Logger.log('[updatePrize] Row: ' + rowIndex + ' | Rank: ' + rank + ' | Description: ' + description);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const prizesSheet = ss.getSheetByName('Active_Season_Prizes');

    if (!prizesSheet) {
      return { status: 'error', message: 'Active_Season_Prizes sheet not found' };
    }

    // Validate required fields
    if (!rank || !rank.trim()) {
      return { status: 'error', message: 'Rank/placement is required' };
    }
    if (!description || !description.trim()) {
      return { status: 'error', message: 'Prize description is required' };
    }

    // Validate row index
    const lastRow = prizesSheet.getLastRow();
    if (rowIndex < 2 || rowIndex > lastRow) {
      return { status: 'error', message: 'Invalid row index' };
    }

    // Update the row
    prizesSheet.getRange(rowIndex, 1, 1, 2).setValues([[rank.trim(), description.trim()]]);
    Logger.log('[updatePrize] Prize updated successfully');

    return {
      status: 'success',
      message: 'Prize updated successfully!'
    };
  } catch (e) {
    Logger.log('[updatePrize] ERROR: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: 'error',
      message: 'Error updating prize: ' + e.message
    };
  }
}

/**
 * Deletes a prize from Active_Season_Prizes sheet.
 * @param {number} rowIndex - Row index (1-based) to delete
 * @return {Object} Response with status
 */
function deletePrize(rowIndex) {
  try {
    Logger.log('[deletePrize] Deleting row: ' + rowIndex);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const prizesSheet = ss.getSheetByName('Active_Season_Prizes');

    if (!prizesSheet) {
      return { status: 'error', message: 'Active_Season_Prizes sheet not found' };
    }

    // Validate row index (must be > 1 to protect header)
    const lastRow = prizesSheet.getLastRow();
    if (rowIndex < 2 || rowIndex > lastRow) {
      return { status: 'error', message: 'Invalid row index or cannot delete header row' };
    }

    // Delete the row
    prizesSheet.deleteRow(rowIndex);
    Logger.log('[deletePrize] Prize deleted successfully');

    return {
      status: 'success',
      message: 'Prize deleted successfully!'
    };
  } catch (e) {
    Logger.log('[deletePrize] ERROR: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: 'error',
      message: 'Error deleting prize: ' + e.message
    };
  }
}

