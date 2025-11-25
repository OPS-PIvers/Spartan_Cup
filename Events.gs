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
    Logger.log('Error generating event ID: ' + e.message);
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
    Logger.log('Error in getEventDetails: ' + e.message);
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
      // NOTE: We check date/time dynamically now to avoid latency issues with the Is_Active column update trigger.
      // The trigger still runs to update the sheet for admin visibility, but we don't rely on it for check-ins.
      const now = new Date();

      eventData = [];
      for (let i = 1; i < eventsData.length; i++) {
        const activityCode = String(eventsData[i][COL_ACTIVITY_CODE]).trim();

        // Only include events from the active season
        const activity = activitiesMap[activityCode];
        if (activity && activity.season === activeSeason) {
          // Normalize startTime to prevent UTC conversion when caching
          let startTime = eventsData[i][COL_START_TIME];
          if (startTime instanceof Date) {
            // Convert Date object to Central Time string to avoid UTC conversion in JSON.stringify
            startTime = Utilities.formatDate(startTime, 'America/Chicago', 'yyyy-MM-dd HH:mm');
          } else if (typeof startTime === 'string') {
            // Keep string as-is
            startTime = startTime;
          }

          // Check if event is currently active (time-based)
          // This duplicates the logic from updateActiveEventStatus but runs on-demand
          let eventStartTime;
          let eventEndTime;

          try {
            if (startTime instanceof Date) {
              eventStartTime = startTime;
              // If it's a date object, format it for cache storage (consistent string format)
              startTime = Utilities.formatDate(startTime, 'America/Chicago', 'yyyy-MM-dd HH:mm');
            } else if (typeof startTime === 'string') {
              // Handle various string formats
              const str = startTime;
              if (str.includes('T')) {
                const normalized = str.substring(0, 16).replace('T', ' ');
                eventStartTime = Utilities.parseDate(normalized, 'America/Chicago', 'yyyy-MM-dd HH:mm');
              } else {
                eventStartTime = Utilities.parseDate(str, 'America/Chicago', 'yyyy-MM-dd HH:mm');
              }
            } else {
              // Invalid date format
              continue;
            }

            const duration = eventsData[i][COL_DURATION_HOURS] || 2;
            eventEndTime = new Date(eventStartTime.getTime() + duration * 60 * 60 * 1000);

            // Is it active right now?
            const now = new Date();
            const isActive = (now >= eventStartTime && now <= eventEndTime);

            if (isActive) {
              eventData.push({
                eventCode: eventsData[i][COL_EVENT_ID],
                eventName: eventsData[i][COL_EVENT_NAME] || activity.activityName,
                locationName: eventsData[i][COL_LOCATION_NAME],
                eventLat: eventsData[i][COL_EVENT_LAT],
                eventLon: eventsData[i][COL_EVENT_LON],
                startTime: startTime, // Stored as string
                durationHours: eventsData[i][COL_DURATION_HOURS],
                season: activity.season
              });
            }

          } catch (e) {
             Logger.log('Error parsing date for event check: ' + e.message);
          }
        }
      }

      // Cache for 2 minutes (120 seconds) - strict cache since we want near-real-time activation
      cache.put(cacheKey, JSON.stringify(eventData), 120);
    } else {
      eventData = safeJSONParse(eventData, null, 'event data cache');
    }

    const activeEvents = [];

    for (let i = 0; i < eventData.length; i++) {
      const item = eventData[i];

      // Parse start time again from the cached object to build the runtime object
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
    Logger.log('Error in getEventsByDistance: ' + e.message);
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
    Logger.log('Error in getClosestEvent: ' + e.message);
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
    Logger.log('Error in findEventIdByCode: ' + e.message);
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
    Logger.log('Error in getEventsList: ' + e.message);
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
      2,                                            // I: Duration_Hours (hardcoded to 2)
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
    Logger.log('Error in addEvent: ' + e.message);
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
          2,                                            // I: Duration_Hours (hardcoded to 2)
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
    Logger.log('Error in updateEvent: ' + e.message);
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
    Logger.log('Error in deleteEvent: ' + e.message);
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
    Logger.log(`Error in validateEventSubmission: ${e.message}`);
    return {
      valid: false,
      message: 'Error validating submission. Please try again.'
    };
  }
}
