/**
 * EmailNotifications.gs
 *
 * Manages email notifications sent to students via Gmail API with a no-reply service account.
 * Handles approval notifications, denial notifications, badge awards, and event reminders.
 * Respects user notification preferences stored in Student_Profiles.
 *
 * Key Functions:
 * - sendApprovalEmail(): Notifies student when submission is approved with points breakdown
 * - sendDenialEmail(): Notifies student when submission is denied with reason (always sent)
 * - sendBadgeAwardEmail(): Notifies student when badge is earned
 * - sendEventReminderEmail(): Sends consolidated daily reminder of upcoming events
 * - getDenialReasons(): Fetches stock denial reasons from Config_Denial_Reasons sheet
 *
 * Configuration:
 * - Gmail service account credentials stored in .env (GMAIL_SERVICE_ACCOUNT)
 * - Display name: "Spartan Cup Notifications"
 * - Always sent from no-reply service account email
 */

/**
 * Sends approval email to student with points breakdown
 * @param {string} studentEmail - Student email address
 * @param {string} eventName - Name of the event
 * @param {number} basePoints - Base points awarded
 * @param {number} themePoints - Theme bonus points
 * @param {number} spotlightMultiplier - Spotlight multiplier applied
 * @return {boolean} Success status
 */
function sendApprovalEmail(studentEmail, eventName, basePoints, themePoints, spotlightMultiplier) {
  try {
    // Check user notification preferences
    const preferences = getNotificationPreferences(studentEmail);
    if (preferences && !preferences.approvalNotifications) {
      Logger.log(`Skipped approval email for ${studentEmail} - preferences disabled`);
      return false;
    }

    const pointsTotal = Math.round(basePoints * spotlightMultiplier + themePoints);
    const studentName = getStudentNameByEmail(studentEmail);

    const subject = `Your ${eventName} submission was approved! +${pointsTotal} points`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
        <div style="background-color: #1b3b87; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Submission Approved!</h1>
        </div>

        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
          <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
            Hi ${escapeHtml(studentName)},
          </p>

          <p style="color: #333; font-size: 16px; margin-bottom: 30px;">
            Your submission for <strong>${escapeHtml(eventName)}</strong> was reviewed and approved! You've earned points for your participation.
          </p>

          <div style="background-color: #f3f4f6; padding: 20px; border-left: 4px solid #1b3b87; border-radius: 4px; margin-bottom: 30px;">
            <h3 style="color: #1b3b87; margin-top: 0; margin-bottom: 15px;">Points Breakdown</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 14px;">
              <div>
                <p style="color: #666; margin: 0;">Base Points</p>
                <p style="color: #333; font-weight: bold; font-size: 18px; margin: 5px 0 0 0;">+${basePoints}</p>
              </div>
              <div>
                <p style="color: #666; margin: 0;">Theme Bonus</p>
                <p style="color: #333; font-weight: bold; font-size: 18px; margin: 5px 0 0 0;">+${themePoints}</p>
              </div>
              ${spotlightMultiplier > 1 ? `
              <div>
                <p style="color: #666; margin: 0;">Spotlight Multiplier</p>
                <p style="color: #333; font-weight: bold; font-size: 18px; margin: 5px 0 0 0;">×${spotlightMultiplier}</p>
              </div>
              ` : ''}
            </div>
            <div style="border-top: 1px solid #ddd; margin-top: 15px; padding-top: 15px;">
              <p style="color: #666; margin: 0;">Total Points</p>
              <p style="color: #1b3b87; font-weight: bold; font-size: 24px; margin: 5px 0 0 0;">+${pointsTotal}</p>
            </div>
          </div>

          <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
            Keep earning points by attending more events and supporting Orono athletics and activities!
          </p>

          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              This is an automated message from The Spartan Cup. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    `;

    return sendEmailViaGmail(studentEmail, subject, htmlBody);

  } catch (e) {
    Logger.log(`ERROR in sendApprovalEmail: ${e.message}`);
    return false;
  }
}

/**
 * Sends denial email to student with reason
 * NOTE: Denial emails are ALWAYS sent regardless of preferences
 * @param {string} studentEmail - Student email address
 * @param {string} eventName - Name of the event
 * @param {string} denialReason - Reason for denial
 * @param {boolean} isResubmittable - Whether student can resubmit
 * @return {boolean} Success status
 */
function sendDenialEmail(studentEmail, eventName, denialReason, isResubmittable) {
  try {
    const studentName = getStudentNameByEmail(studentEmail);

    const subject = `Your ${eventName} submission was not approved`;

    const resubmitMessage = isResubmittable
      ? `<p style="color: #333; font-size: 16px; background-color: #eff6ff; padding: 15px; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 20px 0;">
           <strong>✓ You can resubmit:</strong> Please try again with the feedback below in mind. Your submission has been reset and is ready for resubmission.
         </p>`
      : `<p style="color: #333; font-size: 14px; margin: 20px 0; padding: 10px; background-color: #fee2e2; border-left: 4px solid #dc2626; border-radius: 4px;">
           Please contact an administrator if you believe this is in error.
         </p>`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
        <div style="background-color: #b5121b; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Submission Not Approved</h1>
        </div>

        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
          <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
            Hi ${escapeHtml(studentName)},
          </p>

          <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
            Your submission for <strong>${escapeHtml(eventName)}</strong> was reviewed and could not be approved at this time.
          </p>

          <div style="background-color: #f3f4f6; padding: 20px; border-left: 4px solid #b5121b; border-radius: 4px; margin-bottom: 20px;">
            <h3 style="color: #b5121b; margin-top: 0;">Reason</h3>
            <p style="color: #333; font-size: 16px; margin: 0;">
              ${escapeHtml(denialReason)}
            </p>
          </div>

          ${resubmitMessage}

          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              This is an automated message from The Spartan Cup. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    `;

    // Denial emails are ALWAYS sent, regardless of preferences
    return sendEmailViaGmail(studentEmail, subject, htmlBody);

  } catch (e) {
    Logger.log(`ERROR in sendDenialEmail: ${e.message}`);
    return false;
  }
}

/**
 * Sends badge award notification to student
 * @param {string} studentEmail - Student email address
 * @param {string} badgeName - Name of the badge
 * @param {string} badgeDescription - Description of badge
 * @param {string} badgeImageUrl - URL to badge image
 * @return {boolean} Success status
 */
function sendBadgeAwardEmail(studentEmail, badgeName, badgeDescription, badgeImageUrl) {
  try {
    // Check user notification preferences
    const preferences = getNotificationPreferences(studentEmail);
    if (preferences && !preferences.badgeNotifications) {
      Logger.log(`Skipped badge email for ${studentEmail} - preferences disabled`);
      return false;
    }

    const studentName = getStudentNameByEmail(studentEmail);

    const subject = `You earned a badge: ${badgeName}!`;

    const badgeImageHtml = badgeImageUrl
      ? `<img src="${escapeHtml(badgeImageUrl)}" alt="${escapeHtml(badgeName)}" style="width: 120px; height: 120px; margin: 20px auto; display: block; border-radius: 8px;">`
      : '';

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
        <div style="background-color: #1b3b87; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🏆 Badge Earned!</h1>
        </div>

        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; text-align: center;">
          <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
            Congratulations, ${escapeHtml(studentName)}!
          </p>

          <h2 style="color: #1b3b87; margin: 20px 0;">${escapeHtml(badgeName)}</h2>
          ${badgeImageHtml}

          <p style="color: #666; font-size: 14px; margin: 20px 0;">
            ${escapeHtml(badgeDescription)}
          </p>

          <p style="color: #333; font-size: 14px; margin: 20px 0;">
            Keep supporting Orono events to earn more badges and climb the leaderboard!
          </p>

          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee; margin-top: 30px;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              This is an automated message from The Spartan Cup. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    `;

    return sendEmailViaGmail(studentEmail, subject, htmlBody);

  } catch (e) {
    Logger.log(`ERROR in sendBadgeAwardEmail: ${e.message}`);
    return false;
  }
}

/**
 * Sends event reminder email with upcoming events
 * @param {string} studentEmail - Student email address
 * @param {Array} upcomingEvents - Array of event objects with eventName, date, time, location
 * @return {boolean} Success status
 */
function sendEventReminderEmail(studentEmail, upcomingEvents) {
  try {
    // Check user notification preferences
    const preferences = getNotificationPreferences(studentEmail);
    if (preferences && !preferences.eventNotifications) {
      Logger.log(`Skipped event reminder for ${studentEmail} - preferences disabled`);
      return false;
    }

    const studentName = getStudentNameByEmail(studentEmail);

    const subject = `Upcoming Orono Events - Don't Miss Out!`;

    let eventsHtml = '';
    if (upcomingEvents && upcomingEvents.length > 0) {
      eventsHtml = upcomingEvents.map(event => `
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin-bottom: 10px;">
          <p style="margin: 0 0 5px 0; color: #333; font-weight: bold; font-size: 15px;">${escapeHtml(event.eventName)}</p>
          <p style="margin: 2px 0; color: #666; font-size: 13px;">📅 ${escapeHtml(event.date)} at ${escapeHtml(event.time)}</p>
          <p style="margin: 2px 0; color: #666; font-size: 13px;">📍 ${escapeHtml(event.location)}</p>
          ${event.theme ? `<p style="margin: 5px 0 0 0; color: #1b3b87; font-size: 13px; font-weight: bold;">Theme: ${escapeHtml(event.theme)}</p>` : ''}
          ${event.isSpotlight ? `<p style="margin: 5px 0 0 0; color: #b5121b; font-size: 13px; font-weight: bold;">⭐ Spotlight Event (2x points!)</p>` : ''}
        </div>
      `).join('');
    } else {
      eventsHtml = '<p style="color: #666; font-size: 14px; text-align: center;">No upcoming events at this time.</p>';
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
        <div style="background-color: #1b3b87; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Upcoming Events</h1>
        </div>

        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
          <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
            Hi ${escapeHtml(studentName)},
          </p>

          <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
            Here are the upcoming Orono events you can attend to earn points:
          </p>

          <div style="margin: 20px 0;">
            ${eventsHtml}
          </div>

          <p style="color: #666; font-size: 14px; margin: 20px 0;">
            Check in at events to earn points, unlock achievements, and compete on the leaderboard!
          </p>

          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              This is an automated message from The Spartan Cup. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    `;

    return sendEmailViaGmail(studentEmail, subject, htmlBody);

  } catch (e) {
    Logger.log(`ERROR in sendEventReminderEmail: ${e.message}`);
    return false;
  }
}

/**
 * Core function to send email via Gmail API using service account
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML email body
 * @return {boolean} Success status
 * @private
 */
function sendEmailViaGmail(to, subject, htmlBody) {
  try {
    // Get service account credentials from .env
    const serviceAccountJson = PropertiesService.getScriptProperties().getProperty('GMAIL_SERVICE_ACCOUNT');
    if (!serviceAccountJson) {
      Logger.log('ERROR: GMAIL_SERVICE_ACCOUNT not configured in .env');
      return false;
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const senderEmail = serviceAccount.client_email;
    const displayName = 'Spartan Cup Notifications';

    // Create JWT token for authentication
    const token = getGmailAccessToken(serviceAccount);
    if (!token) {
      Logger.log('ERROR: Failed to obtain Gmail API access token');
      return false;
    }

    // Build RFC 2822 formatted email
    const emailMessage = buildEmailMessage(
      `"${displayName}" <${senderEmail}>`,
      to,
      subject,
      htmlBody
    );

    // Send via Gmail API
    const response = UrlFetchApp.fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        raw: Utilities.base64Encode(emailMessage, Utilities.Charset.UTF_8)
      }),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200) {
      Logger.log(`Email sent successfully to ${to}`);
      return true;
    } else {
      Logger.log(`ERROR sending email to ${to}: ${response.getResponseCode()} - ${response.getContentText()}`);
      return false;
    }

  } catch (e) {
    Logger.log(`ERROR in sendEmailViaGmail: ${e.message}`);
    return false;
  }
}

/**
 * Obtains an access token for Gmail API using service account JWT
 * @param {Object} serviceAccount - Service account object from JSON
 * @return {string|null} Access token or null if failed
 * @private
 */
function getGmailAccessToken(serviceAccount) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600;

    // Create JWT header and payload
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };

    const payload = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/gmail.send',
      aud: 'https://oauth2.googleapis.com/token',
      exp: expiresAt,
      iat: now
    };

    // Encode JWT
    const encodedHeader = Utilities.base64Encode(JSON.stringify(header)).replace(/[=+/]/g, match => ({
      '=': '', '+': '-', '/': '_'
    }[match]));
    const encodedPayload = Utilities.base64Encode(JSON.stringify(payload)).replace(/[=+/]/g, match => ({
      '=': '', '+': '-', '/': '_'
    }[match]));
    const unsignedToken = encodedHeader + '.' + encodedPayload;

    // Sign JWT with private key
    const signature = Utilities.computeRsaSha256Signature(
      unsignedToken,
      serviceAccount.private_key
    );
    const encodedSignature = Utilities.base64Encode(signature).replace(/[=+/]/g, match => ({
      '=': '', '+': '-', '/': '_'
    }[match]));

    const signedJwt = unsignedToken + '.' + encodedSignature;

    // Exchange JWT for access token
    const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
      method: 'post',
      payload: {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedJwt
      },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200) {
      const result = JSON.parse(response.getContentText());
      return result.access_token;
    } else {
      Logger.log(`ERROR getting access token: ${response.getResponseCode()}`);
      return null;
    }

  } catch (e) {
    Logger.log(`ERROR in getGmailAccessToken: ${e.message}`);
    return null;
  }
}

/**
 * Builds an RFC 2822 formatted email message
 * @param {string} from - From address with display name
 * @param {string} to - To address
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML email body
 * @return {string} RFC 2822 formatted email
 * @private
 */
function buildEmailMessage(from, to, subject, htmlBody) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=UTF-8',
    'MIME-Version: 1.0'
  ].join('\r\n');

  return headers + '\r\n\r\n' + htmlBody;
}

/**
 * Gets notification preferences for a student
 * @param {string} studentEmail - Student email address
 * @return {Object|null} Preferences object or null
 * @private
 */
function getNotificationPreferences(studentEmail) {
  try {
    const studentData = getStudentProfilesData();
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === studentEmail) {
        const settingsJson = studentData[i][9]; // Column J: Student_Settings
        if (settingsJson) {
          return JSON.parse(settingsJson);
        }
      }
    }
    return null;
  } catch (e) {
    Logger.log(`ERROR in getNotificationPreferences: ${e.message}`);
    return null;
  }
}

/**
 * Gets student display name by email
 * @param {string} studentEmail - Student email address
 * @return {string} Student display name or email if not found
 * @private
 */
function getStudentNameByEmail(studentEmail) {
  try {
    const studentData = getStudentProfilesData();
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === studentEmail) {
        return studentData[i][1] || studentEmail;
      }
    }
    return studentEmail;
  } catch (e) {
    Logger.log(`ERROR in getStudentNameByEmail: ${e.message}`);
    return studentEmail;
  }
}

/**
 * Escapes HTML special characters for safe display in emails
 * @param {string} text - Text to escape
 * @return {string} Escaped text
 * @private
 */
function escapeHtml(text) {
  if (text === null || text === undefined || text === '') return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
