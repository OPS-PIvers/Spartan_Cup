// ==============================================================================
// FAN FEED FUNCTIONS
// ==============================================================================
// Extracted from Code.js - Lines 5741-6021
// Functions for fan feed display, caching, and bonus calculations

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
      const photoUrl = verifiedData[i][10]; // Photo_URL (column K, index 10)
      const photoId = verifiedData[i][11]; // Photo_ID (column L, index 11)

      // Skip if no photo URL or ID
      if (!photoUrl && !photoId) continue;

      feedItems.push({
        type: 'photo',
        submissionId: verifiedData[i][0],
        timestamp: timestamp.getTime(), // Convert to milliseconds (serializable)
        _time: timestamp.getTime(), // Cache parsed time for efficient sorting
        studentEmail: verifiedData[i][3],
        studentName: studentMap[verifiedData[i][3]] || verifiedData[i][3],
        eventName: eventInfo.eventName,
        eventId: verifiedData[i][4],
        imageUrl: photoUrl || '', // Use Photo_URL directly (Google Drive export link)
        photoId: photoId || '', // Include Photo_ID for fallback/regeneration if needed
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
