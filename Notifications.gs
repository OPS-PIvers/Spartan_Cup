/**
 * Notifications.gs
 * Notification Management Functions
 *
 * This module handles user notifications.
 * Includes functions for:
 * - Sending notifications to users
 * - Notifying users when submissions are approved
 * - Notifying users when badges are earned
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
 * Sends both in-app notification and email notification.
 * @param {string} studentEmail - Student email
 * @param {string} eventName - Event name
 * @param {number} pointsAwarded - Points awarded
 * @param {Object} pointsBreakdown - Optional breakdown {base, theme, multiplier}
 */
function notifySubmissionApproved(studentEmail, eventName, pointsAwarded, pointsBreakdown) {
  // Send in-app notification
  const message = 'Your submission for ' + eventName + ' was approved! You earned ' + pointsAwarded + ' points.';
  sendNotification(studentEmail, 'approved', message);

  // Send email notification (respects user preferences)
  try {
    sendApprovalEmail(studentEmail, eventName, pointsAwarded, pointsBreakdown);
  } catch (e) {
    Logger.log('Error sending approval email: ' + e.message);
  }
}

/**
 * Called when a badge is earned - sends notification to student.
 * Sends both in-app notification and email notification.
 * @param {string} studentEmail - Student email
 * @param {string} badgeName - Badge name
 * @param {string} badgeDescription - Badge description (optional)
 * @param {string} badgeImageUrl - Badge image URL (optional)
 */
function notifyBadgeEarned(studentEmail, badgeName, badgeDescription, badgeImageUrl) {
  // Send in-app notification
  const message = 'You earned the "' + badgeName + '" badge!';
  sendNotification(studentEmail, 'badge', message);

  // Send email notification (respects user preferences)
  try {
    sendBadgeAwardEmail(studentEmail, badgeName, badgeDescription, badgeImageUrl);
  } catch (e) {
    Logger.log('Error sending badge email: ' + e.message);
  }
}

/**
 * Called when a submission is denied - sends notification to student.
 * Sends both in-app notification and email notification.
 * @param {string} studentEmail - Student email
 * @param {string} eventName - Event name
 * @param {string} reason - Denial reason
 */
function notifySubmissionDenied(studentEmail, eventName, reason) {
  // Send in-app notification
  const message = 'Your submission for ' + eventName + ' was not approved. Reason: ' + (reason || 'No reason provided');
  sendNotification(studentEmail, 'denied', message);

  // Send email notification (always sends - students need to know about denials)
  try {
    sendDenialEmail(studentEmail, eventName, reason);
  } catch (e) {
    Logger.log('Error sending denial email: ' + e.message);
  }
}
