/**
 * ==============================================================================
 * CONFIG.GS - CONFIGURATION AND CACHING MODULE
 * ==============================================================================
 *
 * This module contains:
 * 1. Global constants (geofence coordinates, badge URLs, cache TTL values)
 * 2. Utility functions for safe JSON parsing
 * 3. Data access functions with caching for:
 *    - Admin emails (Config_Admins sheet)
 *    - Student profiles (Student_Profiles sheet)
 *    - Badge definitions (Config_Badges sheet)
 *    - Event data (Events sheet)
 * 4. Cache management utilities
 *
 * All caching functions use CacheService to reduce redundant Sheets API calls
 * and improve performance across user sessions.
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
  STUDENT_PROFILES: 1800,   // 30 minutes (increased from 10 to reduce cache misses)
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
