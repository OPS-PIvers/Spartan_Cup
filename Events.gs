/**
 * Events.gs
 *
 * Event management functions for The Spartan Cup.
 * Handles event CRUD operations, active event detection, location validation,
 * and event queries for both students and admins.
 *
 * Key Functions:
 * - getActiveEvents(): Fetches currently active events based on time window
 * - getClosestEvent(): Auto-detects nearest event within geofence
 * - validateEventSubmission(): Unified validation for event submissions
 * - addEvent/updateEvent/deleteEvent(): Admin event management
 * - updateActiveEventStatus(): Trigger function to update Is_Active column
 */

/**
 * Updates the Is_Active column in Events sheet based on current time.
 * Runs automatically via time-based trigger (every 10 minutes).
 *
 * Logic: Event is active if (now >= Start_Time) AND (now <= Start_Time + Duration_Hours)
 * Clears the active events cache after updating.
 */
function updateActiveEventStatus() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
    const activeStatusUpdates = [];
    let hasChanges = false;

    for (let i = 1; i < data.length; i++) {
      const eventId = data[i][COL_EVENT_ID];
      const startTimeRaw = data[i][COL_START_TIME];
      const durationHours = data[i][COL_DURATION_HOURS];
      const currentIsActive = data[i][COL_IS_ACTIVE];

      let isActive = currentIsActive; // Default to existing value

      // Validate data
      if (!eventId || !startTimeRaw || !durationHours) {
        Logger.log(`  Skipping row ${i + 1}: Missing required data`);
        activeStatusUpdates.push([isActive]);
        continue;
      }

      try {
        Logger.log(`  Processing event ${eventId}:`);

        // Parse start time
        let eventStartTime;
        if (startTimeRaw instanceof Date && !isNaN(startTimeRaw.getTime())) {
          eventStartTime = startTimeRaw;
        } else if (typeof startTimeRaw === 'string') {
          // Handle string formats
          if (startTimeRaw.includes('T')) {
            const normalized = startTimeRaw.substring(0, 16).replace('T', ' ');
            eventStartTime = Utilities.parseDate(normalized, 'America/Chicago', 'yyyy-MM-dd HH:mm');
          } else {
            eventStartTime = Utilities.parseDate(startTimeRaw, 'America/Chicago', 'yyyy-MM-dd HH:mm');
          }
        } else {
          Logger.log(`  Skipping event ${eventId}: Invalid start time format`);
          activeStatusUpdates.push([isActive]);
          continue;
        }

        // Calculate end time
        const eventEndTime = new Date(eventStartTime.getTime() + durationHours * 60 * 60 * 1000);

        // Determine if event is active (allow check-in 15 minutes before event start)
        const earlyStartTime = new Date(eventStartTime.getTime() - 15 * 60 * 1000);
        isActive = (now >= earlyStartTime && now <= eventEndTime);

        if (currentIsActive !== isActive) {
          updatesCount++;
          hasChanges = true;
          Logger.log(`    ✓ Status changing for ${eventId}: ${currentIsActive} -> ${isActive}`);
        }

        activeStatusUpdates.push([isActive]);
      } catch (e) {
        Logger.log(`  Error processing event ${eventId}: ${e.message}`);
        activeStatusUpdates.push([currentIsActive]);
      }
    }

    // Perform batch update if changes detected
    if (hasChanges && activeStatusUpdates.length > 0) {
      // Write the entire column at once (starting from row 2)
      eventsSheet.getRange(2, COL_IS_ACTIVE + 1, activeStatusUpdates.length, 1).setValues(activeStatusUpdates);
      Logger.log(`Batch updated ${activeStatusUpdates.length} rows.`);
    } else {
      Logger.log('No changes detected, skipping batch update.');
    }

    // Clear the events caches to force reload
    const cache = CacheService.getScriptCache();
    cache.remove('active_events_data');
    cache.remove('events_data');
    cache.remove('event_map_cache');

    Logger.log(`Active status update complete. ${updatesCount} events updated.`);
  } catch (e) {
    Logger.log(`Error in updateActiveEventStatus: ${e.message}`);
  }
}

function generateEventId(activityCode) {
  try {
    // Use cached events data (reduces Sheets API calls)
    const eventsData = getEventsData();

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
    // Use cached events data (reduces Sheets API calls)
    const data = getEventsData();

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
      // Cache miss: read from Sheets using cached data (reduces Sheets API calls)
      const eventsData = getEventsData();
      const activitiesData = getActivitiesData();

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
        const activityCode = String(eventsData[i][COL_ACTIVITY_CODE]).trim();

        // Only include events from the active season
        // NOTE: We now cache ALL season events and filter by time at runtime to avoid latency.
        const activity = activitiesMap[activityCode];
        if (activity && activity.season === activeSeason) {
          // Normalize startTime to prevent UTC conversion when caching
          let startTime = eventsData[i][COL_START_TIME];
          if (startTime instanceof Date) {
            // Convert Date object to Central Time string to avoid UTC conversion in JSON.stringify
            startTime = Utilities.formatDate(startTime, 'America/Chicago', 'yyyy-MM-dd HH:mm');
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

      // Cache for 10 minutes (600 seconds) - filtering happens at runtime
      cache.put(cacheKey, JSON.stringify(eventData), 600);
    } else {
      eventData = safeJSONParse(eventData, null, 'event data cache');
    }

    const activeEvents = [];
    const now = new Date();

    for (let i = 0; i < eventData.length; i++) {
      const item = eventData[i];

      // Parse start time for calculating end time
      let eventStartTime;
      let eventEndTime;

      try {
        eventStartTime = parseEventDate(item.startTime);
        if (!eventStartTime) continue;

        eventEndTime = new Date(eventStartTime.getTime() + item.durationHours * 60 * 60 * 1000);

        // Determine if event is active dynamically (allow check-in 15 minutes before event start)
        const earlyStartTime = new Date(eventStartTime.getTime() - 15 * 60 * 1000);
        const isActive = (now >= earlyStartTime && now <= eventEndTime);

        if (isActive) {
          Logger.log(`Active event found: ${item.eventName} (${item.eventCode})`);

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
      } catch (e) {
        Logger.log(`ERROR: Failed to parse date for event ${item.eventCode}: ${e.message}`);
        continue;
      }
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
    // Use cached events data (reduces Sheets API calls)
    const eventsData = getEventsData();

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
 * @param {string} category - Optional: filter events by activity/sport category
 * @return {Object} {status, events: [{eventId, name, sportArt, date, location, lat, lon, startTime, duration, isHomeGame, isSpotlight, theme}, ...]}
 */
function getEventsList(category) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Events');
    if (!sheet) {
      return { status: 'error', message: 'Events sheet not found' };
    }

    // Load Activities_Data to get activity names (uses cached data)
    const activitiesData = getActivitiesData();
    const activityMap = {};
    // Columns: Activity_Code, Activity_Name, Season, Location_Name, Event_Lat, Event_Lon
    for (let i = 1; i < activitiesData.length; i++) {
      if (activitiesData[i][0]) {
        activityMap[String(activitiesData[i][0]).trim()] = String(activitiesData[i][1] || '').trim();
      }
    }

    // Use cached events data (reduces Sheets API calls)
    const data = getEventsData();
    const events = [];
    const now = new Date();

    // Skip header row (row 0)
    // Columns: Event_ID, Activity_Code, Event_Name, Date, Location_Name, Event_Lat, Event_Lon, Start_Time, Duration_Hours, Is_Home_Game, Is_Spotlight_Game, Theme
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) { // If Event_ID exists
        // Format the date properly - data[i][3] may be a Date object from Sheets OR an ISO string from cache
        let eventDate = '';
        let eventDateObj = null;
        if (data[i][3]) {
          // Handle both Date objects and ISO strings from cache
          if (data[i][3] instanceof Date) {
            eventDateObj = data[i][3];
          } else {
            // String format - could be ISO string from cache or already formatted
            const dateStr = String(data[i][3]).trim();
            eventDateObj = new Date(dateStr);
          }

          // Always format date to ensure consistency (handles both fresh and cached data)
          if (eventDateObj && !isNaN(eventDateObj.getTime())) {
            eventDate = Utilities.formatDate(eventDateObj, 'America/Chicago', 'M/d/yyyy');
          }
        }
        let eventStartTime = data[i][7];

        // Handle different startTime formats (Date objects OR ISO strings from cache)
        let dateTimeCombined = '';
        let formattedStartTime = '';
        let hours = 0, minutes = 0;
        if (eventStartTime) {
          let startTimeObj = null;

          if (eventStartTime instanceof Date) {
            // Date object from Sheets
            startTimeObj = eventStartTime;
          } else {
            // String format - could be ISO, space-separated, or time-only
            const str = String(eventStartTime).trim();
            startTimeObj = new Date(str);

            // If parsing failed and it's a time-only string like "18:30"
            if (isNaN(startTimeObj.getTime()) && str.match(/^\d{1,2}:\d{2}/)) {
              if (eventDateObj) {
                // Combine with event date
                startTimeObj = new Date(eventDateObj);
                const [h, m] = str.split(':');
                startTimeObj.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
              }
            }
          }

          // Format using Utilities.formatDate for consistent timezone handling
          if (startTimeObj && !isNaN(startTimeObj.getTime())) {
            dateTimeCombined = Utilities.formatDate(startTimeObj, 'America/Chicago', "yyyy-MM-dd'T'HH:mm");
            formattedStartTime = Utilities.formatDate(startTimeObj, 'America/Chicago', 'h:mm a');
            hours = startTimeObj.getHours();
            minutes = startTimeObj.getMinutes();
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
          const activityName = activityMap[activityCode] || activityCode;

          // Filter by category if provided
          if (category && !activityName.toLowerCase().includes(category.toLowerCase())) {
            continue; // Skip this event if it doesn't match the category filter
          }

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
 * Adds a new event to Events sheet
 * @param {Object} eventData - {eventId, eventName, sportArt, date, location, lat, lon, startTime, isHomeGame, isSpotlightGame, theme}
 * @return {Object} {status, message}
 */
function addEvent(eventData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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

    // Check for duplicate event ID using cached data (should be unique by generateEventId, but good to double check)
    const data = getEventsData();
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
      2.5,                                          // I: Duration_Hours (default 2.5 hours)
      true,                                         // J: Is_Home_Game (hardcoded to true)
      eventData.isSpotlightGame || false,           // K: Is_Spotlight_Game
      eventData.theme || '',                        // L: Theme
      false                                         // M: Is_Active (starts as false, will be updated by trigger)
    ]);

    // Clear events caches so new event appears after trigger runs
    const cache = CacheService.getScriptCache();
    cache.remove('active_events_data');
    cache.remove('events_data');
    cache.remove('event_map_cache');

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
    // Use cached events data to find row (reduces Sheets API calls)
    const data = getEventsData();

    // Find the row with this event ID
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(eventId).trim()) {
        // Now get sheet reference for write operation
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
          2.5,                                          // I: Duration_Hours (default 2.5 hours)
          true,                                         // J: Is_Home_Game (hardcoded to true)
          eventData.isSpotlightGame || false,           // K: Is_Spotlight_Game
          eventData.theme || '',                        // L: Theme
          false                                         // M: Is_Active (reset to false, will be updated by trigger)
        ]]);

        // Clear events caches so updated event reflects after trigger runs
        const cache = CacheService.getScriptCache();
        cache.remove('active_events_data');
        cache.remove('events_data');
        cache.remove('event_map_cache');

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
    // Use cached events data to find row (reduces Sheets API calls)
    const data = getEventsData();

    // Find the row with this event ID
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(eventId).trim()) {
        // Now get sheet reference for delete operation
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        const sheet = ss.getSheetByName('Events');
        if (!sheet) {
          return { status: 'error', message: 'Events sheet not found' };
        }

        sheet.deleteRow(i + 1);

        // Clear events caches so deleted event is removed from active events
        const cache = CacheService.getScriptCache();
        cache.remove('active_events_data');
        cache.remove('events_data');
        cache.remove('event_map_cache');

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
    // Check eventCode is provided
    if (!eventCode || eventCode.trim() === '') {
      Logger.log('[validateEventSubmission] No eventCode provided');
      return { valid: false, message: 'No event code provided. Please try again from the Check-In button.' };
    }
    // Check location provided
    if (!userLocation || userLocation.lat === null || userLocation.lon === null) {
      return {
        valid: false,
        message: 'Location permission denied. Please enable location access.'
      };
    }

    // Find the active event matching this code
    const activeEvents = getActiveEvents();
    Logger.log(`[validateEventSubmission] Found ${activeEvents.length} active events, looking for: ${eventCode}`);

    let matchingEvent = null;

    for (let evt of activeEvents) {
      if (String(evt.eventCode).trim() === String(eventCode).trim()) {
        matchingEvent = evt;
        break;
      }
    }

    if (!matchingEvent) {
      const availableCodes = activeEvents.map(e => e.eventCode).join(', ');
      Logger.log(`[validateEventSubmission] Event code not found. Available codes: ${availableCodes}`);
      return {
        valid: false,
        message: 'Invalid event ID or no active event found for this code. Please try again from the Check-In button.'
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

    // Validate time is within window (allow 15 minutes before event start)
    const submissionTime = new Date(timestamp);
    const earlyStartTime = new Date(matchingEvent.startTime.getTime() - 15 * 60 * 1000);
    if (submissionTime < earlyStartTime || submissionTime > matchingEvent.endTime) {
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
    Logger.log(`Error in validateEventSubmission: ${e.message}`);
    return {
      valid: false,
      message: 'Error validating submission. Please try again.'
    };
  }
}

/**
 * Gets recent events within a specified time window for admin manual submissions.
 * Only accessible to admin users.
 * @param {number} daysBack - Number of days to look back (default: 7)
 * @return {Object} Response with status and array of recent events
 */
function getRecentEvents(daysBack = 7) {
  const email = Session.getActiveUser().getEmail();

  // Validate admin status
  if (!getAdminEmails().includes(email.toLowerCase())) {
    return { status: "error", message: "Access denied. You are not an admin." };
  }

  try {
    // Get all events from cached data
    const eventsData = getEventsData();
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

    // Filter to recent events (within specified days back to now)
    const recentEvents = [];
    for (let i = 1; i < eventsData.length; i++) {
      // Skip empty rows
      if (!eventsData[i][0]) continue;

      const eventDate = new Date(eventsData[i][7]); // Start_Time column (H)
      if (eventDate >= cutoffDate && eventDate <= now) {
        recentEvents.push({
          eventId: eventsData[i][0],       // Event_ID (A)
          eventName: eventsData[i][2],     // Event_Name (C)
          date: eventDate.toLocaleDateString(),
          locationName: eventsData[i][4] || 'Unknown Location'  // Location_Name (E)
        });
      }
    }

    // Sort by date (most recent first)
    recentEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      status: "success",
      events: recentEvents
    };

  } catch (e) {
    Logger.log('ERROR in getRecentEvents: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: "error",
      message: "Error fetching recent events: " + e.message
    };
  }
}

/**
 * Helper function to parse event start time from various formats.
 * Handles Date objects, ISO strings, and space-separated strings.
 * @param {string|Date} startTime - The start time to parse
 * @return {Date|null} The parsed Date object or null if invalid
 */
function parseEventDate(startTime) {
  if (!startTime) return null;

  try {
    if (startTime instanceof Date) {
      return startTime;
    }

    if (typeof startTime === 'string') {
      const str = startTime.trim();
      // Handle UTC ISO format (from JSON.stringify): "2025-11-06T01:25:00.000Z"
      if (str.endsWith('Z') || str.includes('+') || /\-\d{2}:\d{2}$/.test(str)) {
        const utcDate = new Date(str);
        const centralStr = Utilities.formatDate(utcDate, 'America/Chicago', 'yyyy-MM-dd HH:mm');
        return Utilities.parseDate(centralStr, 'America/Chicago', 'yyyy-MM-dd HH:mm');
      }
      // Handle local ISO format without timezone: "2025-11-06T18:30"
      else if (str.includes('T')) {
        const normalized = str.substring(0, 16).replace('T', ' ');
        return Utilities.parseDate(normalized, 'America/Chicago', 'yyyy-MM-dd HH:mm');
      }
      // Handle space-separated format: "2025-11-06 18:30"
      else {
        return Utilities.parseDate(str, 'America/Chicago', 'yyyy-MM-dd HH:mm');
      }
    }

    // Try standard constructor as fallback
    const d = new Date(startTime);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    Logger.log('Error parsing event date: ' + e.message);
    return null;
  }
}
