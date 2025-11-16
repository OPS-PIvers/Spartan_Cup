/**
 * Activities.gs
 * Activity and Season Management Functions
 *
 * This module handles activity and season configuration.
 * Includes functions for:
 * - Getting and setting the active season
 * - Managing season-to-activity assignments
 * - Creating and retrieving activity details
 * - Fetching activities for the current season
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
    // Use cached activities data (reduces Sheets API calls)
    const activitiesData = getActivitiesData();

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
    // Use cached activities data (reduces Sheets API calls)
    const activitiesData = getActivitiesData();

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
 * Takes a season and array of activity codes, assigns all those activities to the season.
 * Activities not in the array keep their existing season assignment (no removal).
 * @param {string} season - The season name to assign
 * @param {Array} activityCodes - Array of activity codes to assign to this season
 * @return {Object} Status object with success/error message
 */
function updateActivitySeasonAssignments(season, activityCodes) {
  try {
    // Use cached activities data to find rows (reduces Sheets API calls)
    const activitiesData = getActivitiesData();

    // Convert activity codes to a Set for O(1) lookup
    const codeSet = new Set(activityCodes);

    // Now get sheet reference for write operations
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activitiesSheet = ss.getSheetByName('Activities_Data');

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
    const cache = CacheService.getScriptCache();
    cache.remove('active_season');
    cache.remove('active_events_data');
    cache.remove('activities_data'); // Clear activities cache since we modified it

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
    // Use cached activities data to check for duplicates (reduces Sheets API calls)
    const activitiesData = getActivitiesData();

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

    // Now get sheet reference for write operation
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activitiesSheet = ss.getSheetByName('Activities_Data');

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
    const cache = CacheService.getScriptCache();
    cache.remove('active_season');
    cache.remove('active_events_data');
    cache.remove('activities_data'); // Clear activities cache since we added new activity

    return { status: 'success', message: 'Activity created: ' + activityName, activityCode: activityCode };
  } catch (e) {
    // Logger.log('Error creating new activity: ' + e.message);
    return { status: 'error', message: 'Error creating activity: ' + e.message };
  }
}

function getActivityDetails(activityCode) {
  try {
    // Use cached activities data (reduces Sheets API calls - called frequently!)
    const activitiesData = getActivitiesData();

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

function getActivitiesForSeason() {
  try {
    // Use cached activities data (reduces Sheets API calls)
    const activitiesData = getActivitiesData();
    const activeSeason = getActiveSeason();

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
