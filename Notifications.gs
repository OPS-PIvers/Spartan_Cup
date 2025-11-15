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
