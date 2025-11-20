/**
 * EmailNotifications.gs
 * Email Notification System for The Spartan Cup
 *
 * This module handles email notifications to students.
 * Uses Google Apps Script's MailApp service for sending emails.
 *
 * Key Functions:
 * - sendApprovalEmail(): Email when submission is approved
 * - sendDenialEmail(): Email when submission is denied
 * - sendBadgeAwardEmail(): Email when badge is earned
 * - sendEventReminderEmail(): Email for upcoming event reminders
 *
 * Most functions respect user notification preferences from Student_Profiles sheet.
 * Exception: sendDenialEmail() always sends regardless of preferences, as students
 * must be informed when their submissions are not approved.
 */

// School branding constants
const SCHOOL_NAME = 'Orono High School';
const APP_NAME = 'The Spartan Cup';
const PRIMARY_COLOR = '#1b3b87';
const SECONDARY_COLOR = '#b5121b';

/**
 * Builds a Map of student emails to their profile data for O(1) lookups.
 * @return {Map} Map of email -> {displayName, settings}
 */
function buildStudentProfileMap() {
  const studentData = getStudentProfilesData();
  const profileMap = new Map();

  for (let i = 1; i < studentData.length; i++) {
    const email = studentData[i][0];
    if (email) {
      let settings = {
        darkMode: false,
        eventNotifications: true,
        approvalNotifications: true,
        badgeNotifications: true
      };

      const settingsJson = studentData[i][8];
      if (settingsJson && settingsJson.toString().trim()) {
        const parsed = safeJSONParse(settingsJson.toString().trim(), {}, 'notification preferences');
        if (parsed && Object.keys(parsed).length > 0) {
          settings = parsed;
        }
      }

      profileMap.set(email, {
        displayName: studentData[i][1] || email.split('@')[0],
        settings: settings
      });
    }
  }

  return profileMap;
}

/**
 * Gets user's notification preferences from Student_Profiles.
 * Returns settings object with defaults if not found.
 * @param {string} email - Student email
 * @param {Map} profileMap - Optional pre-built profile map for batch operations
 * @return {Object} Settings object with notification preferences
 */
function getNotificationPreferences(email, profileMap) {
  try {
    // Use pre-built map if provided (for batch operations)
    if (profileMap && profileMap.has(email)) {
      return profileMap.get(email).settings;
    }

    // Otherwise do a single lookup
    const studentData = getStudentProfilesData();

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        const settingsJson = studentData[i][8];
        if (settingsJson && settingsJson.toString().trim()) {
          const parsed = safeJSONParse(settingsJson.toString().trim(), {}, 'notification preferences');
          if (parsed && Object.keys(parsed).length > 0) {
            return parsed;
          }
        }
        break;
      }
    }
  } catch (e) {
    Logger.log('Error reading notification preferences: ' + e.message);
  }

  // Return defaults if not found
  return {
    darkMode: false,
    eventNotifications: true,
    approvalNotifications: true,
    badgeNotifications: true
  };
}

/**
 * Gets user's display name from Student_Profiles.
 * @param {string} email - Student email
 * @param {Map} profileMap - Optional pre-built profile map for batch operations
 * @return {string} Display name or email prefix if not found
 */
function getStudentDisplayName(email, profileMap) {
  try {
    // Use pre-built map if provided (for batch operations)
    if (profileMap && profileMap.has(email)) {
      return profileMap.get(email).displayName;
    }

    // Otherwise do a single lookup
    const studentData = getStudentProfilesData();

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        return studentData[i][1] || email.split('@')[0];
      }
    }
  } catch (e) {
    Logger.log('Error reading student display name: ' + e.message);
  }

  return email.split('@')[0];
}

/**
 * Generates the common email header with branding.
 * @return {string} HTML header
 */
function getEmailHeader() {
  return `
    <div style="background-color: ${PRIMARY_COLOR}; padding: 20px; text-align: center;">
      <h1 style="color: white; margin: 0; font-family: 'Public Sans', Arial, sans-serif;">
        ${APP_NAME}
      </h1>
      <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0 0; font-size: 12px;">
        ${SCHOOL_NAME}
      </p>
    </div>
  `;
}

/**
 * Generates the common email footer.
 * @param {string} email - Student email for unsubscribe context
 * @return {string} HTML footer
 */
function getEmailFooter(email) {
  return `
    <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 11px; color: #666;">
      <p style="margin: 0 0 5px 0;">
        You received this email because you're participating in ${APP_NAME}.
      </p>
      <p style="margin: 0;">
        To manage your email preferences, visit your Settings page in the app.
      </p>
    </div>
  `;
}

/**
 * Sends an email notification when a submission is approved.
 * Respects user's approvalNotifications preference.
 * @param {string} studentEmail - Student email address
 * @param {string} eventName - Name of the event
 * @param {number} pointsAwarded - Total points awarded
 * @param {Object} pointsBreakdown - Optional breakdown {base, theme, multiplier}
 */
function sendApprovalEmail(studentEmail, eventName, pointsAwarded, pointsBreakdown) {
  try {
    // Check user preferences
    const prefs = getNotificationPreferences(studentEmail);
    if (!prefs.approvalNotifications) {
      Logger.log('Approval email skipped - user disabled notifications: ' + studentEmail);
      return;
    }

    // Sanitize all inputs
    const safeDisplayName = escapeHtml(getStudentDisplayName(studentEmail));
    const safeEventName = escapeHtml(eventName);
    const safePoints = sanitizeNumber(pointsAwarded);
    const subject = `Submission Approved! You earned ${safePoints} points`;

    // Build points breakdown HTML if provided
    let breakdownHtml = '';
    if (pointsBreakdown) {
      const safeBase = sanitizeNumber(pointsBreakdown.base);
      const safeTheme = sanitizeNumber(pointsBreakdown.theme);
      const safeMultiplier = sanitizeNumber(pointsBreakdown.multiplier);

      breakdownHtml = `
        <div style="background-color: #f0f7ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h4 style="margin: 0 0 10px 0; color: ${PRIMARY_COLOR};">Points Breakdown:</h4>
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="padding: 3px 0;">Base Points:</td>
              <td style="text-align: right; font-weight: bold;">${safeBase}</td>
            </tr>
            ${safeTheme ? `
            <tr>
              <td style="padding: 3px 0;">Theme Bonus:</td>
              <td style="text-align: right; font-weight: bold; color: #22c55e;">+${safeTheme}</td>
            </tr>
            ` : ''}
            ${safeMultiplier && safeMultiplier > 1 ? `
            <tr>
              <td style="padding: 3px 0;">Spotlight Multiplier:</td>
              <td style="text-align: right; font-weight: bold; color: #f59e0b;">x${safeMultiplier}</td>
            </tr>
            ` : ''}
            <tr style="border-top: 1px solid #ddd;">
              <td style="padding: 8px 0 3px 0; font-weight: bold;">Total:</td>
              <td style="text-align: right; font-weight: bold; font-size: 18px; color: ${PRIMARY_COLOR};">${safePoints}</td>
            </tr>
          </table>
        </div>
      `;
    }

    const htmlBody = `
      <div style="font-family: 'Public Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        ${getEmailHeader()}

        <div style="padding: 25px;">
          <h2 style="color: #22c55e; margin: 0 0 15px 0;">
            Submission Approved!
          </h2>

          <p style="font-size: 16px; color: #333; margin: 0 0 15px 0;">
            Hi ${safeDisplayName},
          </p>

          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Great news! Your submission for <strong>${safeEventName}</strong> has been approved.
          </p>

          <div style="text-align: center; padding: 20px; background-color: #f8fafc; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 5px 0; font-size: 14px; color: #666;">Points Earned</p>
            <p style="margin: 0; font-size: 36px; font-weight: bold; color: ${PRIMARY_COLOR};">
              +${safePoints}
            </p>
          </div>

          ${breakdownHtml}

          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Keep attending events to earn more points and climb the leaderboard!
          </p>
        </div>

        ${getEmailFooter(studentEmail)}
      </div>
    `;

    MailApp.sendEmail({
      to: studentEmail,
      subject: subject,
      htmlBody: htmlBody,
      name: APP_NAME
    });

    Logger.log('Approval email sent to: ' + studentEmail);

  } catch (e) {
    Logger.log('Error sending approval email to ' + studentEmail + ': ' + e.message);
  }
}

/**
 * Sends an email notification when a submission is denied.
 * Always sends (no preference check - students need to know about denials).
 * @param {string} studentEmail - Student email address
 * @param {string} eventName - Name of the event
 * @param {string} reason - Reason for denial
 */
function sendDenialEmail(studentEmail, eventName, reason) {
  try {
    // Sanitize all inputs
    const safeDisplayName = escapeHtml(getStudentDisplayName(studentEmail));
    const safeEventName = escapeHtml(eventName);
    const safeReason = escapeHtml(reason) || 'No specific reason provided';
    const subject = `Submission Not Approved - ${safeEventName}`;

    const htmlBody = `
      <div style="font-family: 'Public Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        ${getEmailHeader()}

        <div style="padding: 25px;">
          <h2 style="color: ${SECONDARY_COLOR}; margin: 0 0 15px 0;">
            Submission Not Approved
          </h2>

          <p style="font-size: 16px; color: #333; margin: 0 0 15px 0;">
            Hi ${safeDisplayName},
          </p>

          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Unfortunately, your submission for <strong>${safeEventName}</strong> was not approved.
          </p>

          <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid ${SECONDARY_COLOR}; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #7f1d1d;">
              <strong>Reason:</strong> ${safeReason}
            </p>
          </div>

          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Common reasons for denial include:
          </p>
          <ul style="font-size: 14px; color: #555; line-height: 1.8; padding-left: 20px;">
            <li>Photo doesn't clearly show attendance at the event</li>
            <li>Location verification failed (not at event venue)</li>
            <li>Submission was a duplicate</li>
            <li>Photo quality was too poor to verify</li>
          </ul>

          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Don't worry! You can still attend future events and submit again. Make sure to take a clear photo that shows you're at the event location.
          </p>

          <p style="font-size: 14px; color: #555; line-height: 1.6; margin-top: 15px;">
            If you believe this was a mistake, please speak with a staff member.
          </p>
        </div>

        ${getEmailFooter(studentEmail)}
      </div>
    `;

    MailApp.sendEmail({
      to: studentEmail,
      subject: subject,
      htmlBody: htmlBody,
      name: APP_NAME
    });

    Logger.log('Denial email sent to: ' + studentEmail);

  } catch (e) {
    Logger.log('Error sending denial email to ' + studentEmail + ': ' + e.message);
  }
}

/**
 * Sends an email notification when a badge is earned.
 * Respects user's badgeNotifications preference.
 * @param {string} studentEmail - Student email address
 * @param {string} badgeName - Name of the badge earned
 * @param {string} badgeDescription - Description of the badge
 * @param {string} badgeImageUrl - URL to badge image (optional)
 */
function sendBadgeAwardEmail(studentEmail, badgeName, badgeDescription, badgeImageUrl) {
  try {
    // Check user preferences
    const prefs = getNotificationPreferences(studentEmail);
    if (!prefs.badgeNotifications) {
      Logger.log('Badge email skipped - user disabled notifications: ' + studentEmail);
      return;
    }

    // Sanitize all inputs
    const safeDisplayName = escapeHtml(getStudentDisplayName(studentEmail));
    const safeBadgeName = escapeHtml(badgeName);
    const safeDescription = escapeHtml(badgeDescription) || 'A special achievement badge';
    const safeImageUrl = sanitizeUrl(badgeImageUrl);
    const subject = `New Badge Earned: ${safeBadgeName}`;

    // Badge image HTML (if URL provided and valid)
    let badgeImageHtml = '';
    if (safeImageUrl) {
      badgeImageHtml = `
        <div style="text-align: center; margin: 20px 0;">
          <img src="${safeImageUrl}" alt="${safeBadgeName}" style="width: 120px; height: 120px; object-fit: contain;" />
        </div>
      `;
    } else {
      // Fallback decorative element
      badgeImageHtml = `
        <div style="text-align: center; margin: 20px 0;">
          <div style="display: inline-block; width: 100px; height: 100px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; line-height: 100px; font-size: 48px;">
            &#127942;
          </div>
        </div>
      `;
    }

    const htmlBody = `
      <div style="font-family: 'Public Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        ${getEmailHeader()}

        <div style="padding: 25px;">
          <h2 style="color: #8b5cf6; margin: 0 0 15px 0; text-align: center;">
            New Badge Earned!
          </h2>

          <p style="font-size: 16px; color: #333; margin: 0 0 15px 0;">
            Hi ${safeDisplayName},
          </p>

          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Congratulations! You've earned a new badge:
          </p>

          ${badgeImageHtml}

          <div style="text-align: center; padding: 15px; background-color: #f5f3ff; border-radius: 8px; margin: 15px 0;">
            <h3 style="margin: 0 0 8px 0; color: #6d28d9; font-size: 20px;">
              ${safeBadgeName}
            </h3>
            <p style="margin: 0; font-size: 14px; color: #7c3aed;">
              ${safeDescription}
            </p>
          </div>

          <p style="font-size: 14px; color: #555; line-height: 1.6; text-align: center;">
            Keep up the great work! View all your badges in the app.
          </p>
        </div>

        ${getEmailFooter(studentEmail)}
      </div>
    `;

    MailApp.sendEmail({
      to: studentEmail,
      subject: subject,
      htmlBody: htmlBody,
      name: APP_NAME
    });

    Logger.log('Badge email sent to: ' + studentEmail);

  } catch (e) {
    Logger.log('Error sending badge email to ' + studentEmail + ': ' + e.message);
  }
}

/**
 * Sends an email reminder about upcoming events.
 * Respects user's eventNotifications preference.
 * @param {string} studentEmail - Student email address
 * @param {Array} events - Array of event objects to include in reminder
 * @param {Map} profileMap - Optional pre-built profile map for batch operations
 * @param {number} spotlightMultiplier - Multiplier for spotlight events (default 1.5)
 */
function sendEventReminderEmail(studentEmail, events, profileMap, spotlightMultiplier) {
  try {
    // Check user preferences
    const prefs = getNotificationPreferences(studentEmail, profileMap);
    if (!prefs.eventNotifications) {
      Logger.log('Event reminder skipped - user disabled notifications: ' + studentEmail);
      return;
    }

    // Sanitize display name
    const safeDisplayName = escapeHtml(getStudentDisplayName(studentEmail, profileMap));

    // Determine if any events are spotlight events
    const hasSpotlight = events.some(e => e.isSpotlight);
    const subject = hasSpotlight
      ? `Spotlight Event${events.length > 1 ? 's' : ''} Tomorrow!`
      : `${events.length} Event${events.length > 1 ? 's' : ''} Tomorrow`;

    // Build events list HTML
    let eventsHtml = '';
    for (const event of events) {
      const safeEventName = escapeHtml(event.eventName);
      const safeLocation = escapeHtml(event.location);
      const safeTheme = escapeHtml(event.theme);
      const safeDate = escapeHtml(event.formattedDate);
      const safeTime = escapeHtml(event.formattedTime);

      // Spotlight badge for this event
      let spotlightBadge = '';
      if (event.isSpotlight) {
        const multiplierText = spotlightMultiplier ? `${spotlightMultiplier}x` : 'BONUS';
        spotlightBadge = `
          <span style="background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; margin-left: 8px;">
            ${multiplierText} POINTS
          </span>
        `;
      }

      // Theme info for this event
      let themeHtml = '';
      if (safeTheme && safeTheme.trim() !== '') {
        themeHtml = `
          <tr>
            <td style="padding: 3px 0;"><strong>Theme:</strong></td>
            <td>${safeTheme} <span style="font-size: 11px; color: #22c55e;">(bonus points!)</span></td>
          </tr>
        `;
      }

      eventsHtml += `
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid ${event.isSpotlight ? '#f59e0b' : PRIMARY_COLOR};">
          <h4 style="margin: 0 0 10px 0; color: ${PRIMARY_COLOR};">
            ${safeEventName}${spotlightBadge}
          </h4>
          <table style="width: 100%; font-size: 13px; color: #555;">
            <tr>
              <td style="padding: 3px 0; width: 70px;"><strong>Date:</strong></td>
              <td>${safeDate}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0;"><strong>Time:</strong></td>
              <td>${safeTime}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0;"><strong>Location:</strong></td>
              <td>${safeLocation}</td>
            </tr>
            ${themeHtml}
          </table>
        </div>
      `;
    }

    const htmlBody = `
      <div style="font-family: 'Public Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        ${getEmailHeader()}

        <div style="padding: 25px;">
          <h2 style="color: ${PRIMARY_COLOR}; margin: 0 0 15px 0;">
            ${events.length > 1 ? "Don't Miss These Events!" : "Don't Miss This Event!"}
          </h2>

          <p style="font-size: 16px; color: #333; margin: 0 0 15px 0;">
            Hi ${safeDisplayName},
          </p>

          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Reminder: ${events.length > 1 ? 'There are ' + events.length + ' events' : "There's an event"} coming up tomorrow!
          </p>

          ${eventsHtml}

          <p style="font-size: 14px; color: #555; line-height: 1.6; margin-top: 15px;">
            Remember to check in via the app and submit your photo to earn points!
          </p>
        </div>

        ${getEmailFooter(studentEmail)}
      </div>
    `;

    MailApp.sendEmail({
      to: studentEmail,
      subject: subject,
      htmlBody: htmlBody,
      name: APP_NAME
    });

    Logger.log('Event reminder email sent to: ' + studentEmail);

  } catch (e) {
    Logger.log('Error sending event reminder email to ' + studentEmail + ': ' + e.message);
  }
}

/**
 * Sends daily event reminder emails to all students with eventNotifications enabled.
 * Consolidates all events into a single email per student.
 * This should be set up as a daily trigger (e.g., 4 PM the day before events).
 */
function sendDailyEventReminders() {
  try {
    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    // Get all events
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Get spotlight multiplier from Config_Points
    let spotlightMultiplier = 1.5; // Default
    const configSheet = ss.getSheetByName('Config_Points');
    if (configSheet) {
      const configData = configSheet.getDataRange().getValues();
      for (let i = 1; i < configData.length; i++) {
        if (configData[i][0] === 'Spotlight_Game_Multiplier') {
          spotlightMultiplier = configData[i][1] || 1.5;
          break;
        }
      }
    }
    const eventsSheet = ss.getSheetByName('Events');
    if (!eventsSheet) {
      Logger.log('Events sheet not found');
      return;
    }

    const eventsData = eventsSheet.getDataRange().getValues();
    const tomorrowEvents = [];

    // Find events happening tomorrow
    for (let i = 1; i < eventsData.length; i++) {
      const eventDate = new Date(eventsData[i][3]); // Date column
      eventDate.setHours(0, 0, 0, 0);

      if (eventDate.getTime() === tomorrow.getTime() && eventsData[i][12]) { // Is_Active check
        // Format date nicely
        const dateObj = new Date(eventsData[i][3]);
        const formattedDate = dateObj.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        });

        // Format time
        let formattedTime = 'TBD';
        if (eventsData[i][6]) {
          try {
            const timeDate = new Date(eventsData[i][6]);
            formattedTime = timeDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit'
            });
          } catch (e) {
            formattedTime = String(eventsData[i][6]);
          }
        }

        tomorrowEvents.push({
          eventId: eventsData[i][0],
          eventName: eventsData[i][2],
          formattedDate: formattedDate,
          formattedTime: formattedTime,
          location: eventsData[i][4],
          isSpotlight: eventsData[i][11],
          theme: eventsData[i][10]
        });
      }
    }

    if (tomorrowEvents.length === 0) {
      Logger.log('No events tomorrow - skipping reminders');
      return;
    }

    // Build profile map for O(1) lookups during batch processing
    const profileMap = buildStudentProfileMap();
    let emailsSent = 0;

    // Send one consolidated email per student
    for (const [studentEmail, profile] of profileMap) {
      // Check preferences using the map
      if (!profile.settings.eventNotifications) continue;

      // Send single email with all events
      sendEventReminderEmail(studentEmail, tomorrowEvents, profileMap, spotlightMultiplier);
      emailsSent++;

      // Rate limiting - avoid hitting email quota
      if (emailsSent % 50 === 0) {
        Utilities.sleep(1000);
      }
    }

    Logger.log('Daily event reminders sent: ' + emailsSent + ' emails for ' + tomorrowEvents.length + ' events');

  } catch (e) {
    Logger.log('Error in sendDailyEventReminders: ' + e.message);
  }
}

/**
 * Sends a test email to verify the email system is working.
 * Admin function for testing.
 */
function sendTestEmail() {
  const email = Session.getActiveUser().getEmail();

  try {
    MailApp.sendEmail({
      to: email,
      subject: 'Test Email - The Spartan Cup',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Email System Test</h2>
          <p>This is a test email from The Spartan Cup email notification system.</p>
          <p>If you received this, the email system is working correctly!</p>
          <p><small>Sent at: ${new Date().toLocaleString()}</small></p>
        </div>
      `,
      name: APP_NAME
    });

    return { status: 'success', message: 'Test email sent to ' + email };
  } catch (e) {
    return { status: 'error', message: 'Failed to send test email: ' + e.message };
  }
}
