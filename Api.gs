/**
 * Api.gs
 * API Handler for Mobile Client
 *
 * This module handles JSON API requests from the mobile app (React Native).
 * It verifies ID tokens and routes requests to the appropriate backend logic.
 */

// Global variable to store the verified user email for the current execution
var API_USER_EMAIL = null;

/**
 * Main API request handler.
 * Routes based on 'endpoint' parameter.
 * @param {Object} e - Event object
 * @return {ContentService.TextOutput} JSON response
 */
function handleApiRequest(e) {
  const result = {
    status: 'error',
    data: null,
    message: ''
  };

  try {
    // 1. Verify Authentication
    // Token can be passed in 'token' parameter or POST body (though parsing body for it is extra work)
    // We'll stick to 'token' parameter for simplicity as GET/POST params are merged in 'e.parameter'
    const token = e.parameter.token;
    if (!token) {
      // Allow public endpoints if needed, but mostly we need auth
      // For now, enforce auth
      throw new Error('Missing authentication token. Please provide a valid ID token in the "token" parameter.');
    }

    const email = verifyGoogleIdToken(token);
    if (!email) {
      throw new Error('Invalid authentication token');
    }

    // Set global user email for Auth.gs functions to use
    API_USER_EMAIL = email;

    // 2. Route Request
    const endpoint = e.parameter.endpoint;

    switch (endpoint) {
      case 'profile':
        result.data = getProfileData(email);
        result.status = 'success';
        break;

      case 'events':
        // Optional location params
        const lat = e.parameter.lat ? parseFloat(e.parameter.lat) : null;
        const lon = e.parameter.lon ? parseFloat(e.parameter.lon) : null;

        if (lat && lon) {
             result.data = getEventsByDistance(lat, lon);
        } else {
             result.data = getActiveEvents();
        }
        result.status = 'success';
        break;

      case 'checkin':
        // Perform check-in validation
        // Expected params: eventCode, lat, lon
        const eventCode = e.parameter.eventCode;
        const userLat = parseFloat(e.parameter.lat);
        const userLon = parseFloat(e.parameter.lon);

        if (!eventCode || isNaN(userLat) || isNaN(userLon)) {
             throw new Error('Missing event code or location data');
        }

        const validation = validateEventSubmission(eventCode, {lat: userLat, lon: userLon}, new Date().getTime());
        result.data = validation;
        result.status = validation.valid ? 'success' : 'error';
        result.message = validation.message;
        break;

      case 'submit':
         // Handle photo submission (usually POST)
         // This needs more complex body parsing if JSON payload
         // But GAS doPost e.postData.contents is available
         const postData = e.postData ? JSON.parse(e.postData.contents) : {};
         // TODO: Implement submission logic calling Submissions.gs
         // For now, return stub
         result.status = 'error';
         result.message = 'Submission endpoint not implemented yet';
         break;

      default:
        throw new Error('Unknown endpoint: ' + endpoint);
    }

  } catch (error) {
    result.status = 'error';
    result.message = error.message;
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * Verifies a Google ID Token.
 * @param {string} token - The ID token string
 * @return {string|null} The email address if valid, null otherwise
 */
function verifyGoogleIdToken(token) {
  try {
    const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + token;
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());

    if (data.email && data.email_verified === 'true') {
      // Check audience (client ID) to ensure it was issued for YOUR app
      // Replace YOUR_CLIENT_ID with your actual OAuth 2.0 Client ID from Google Cloud Console
      const aud = data.aud;
      if (aud !== 'YOUR_CLIENT_ID') {
         Logger.log('Token audience mismatch: ' + aud);
         return null;
      }

      return data.email;
    }
  } catch (e) {
    Logger.log('Token verification failed: ' + e.message);
  }
  return null;
}
