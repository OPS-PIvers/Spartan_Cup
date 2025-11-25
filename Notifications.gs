/**
 * Notifications.gs
 * In-App Notification Management Functions
 *
 * This module handles in-app notifications stored in UserProperties.
 * NOTE: Email notifications are handled by EmailNotifications.gs.
 *
 * This module is currently reserved for future in-app notification features
 * (e.g., notification bell in the UI, unread badges, notification center).
 *
 * For current email notification functionality, see EmailNotifications.gs.
 */

/**
 * Stores an in-app notification in UserProperties for later retrieval.
 * Reserved for future notification center feature.
 *
 * @param {string} studentEmail - Student email.
 * @param {string} type - Notification type (e.g., 'approved', 'badge', 'event').
 * @param {string} message - Notification message.
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
