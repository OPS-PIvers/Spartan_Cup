/**
 * SPARTAN CUP - MAIN ROUTER MODULE
 *
 * This file contains ONLY the essential router functions for the Spartan Cup web application.
 * All business logic has been modularized into separate .gs files for better maintainability.
 *
 * Modular Architecture:
 * - This file: Main web app entry point and HTML template routing
 * - Admin.gs: Admin dashboard functions
 * - Auth.gs: Authentication and authorization functions
 * - Submissions.gs: Submission handling and validation
 * - Events.gs: Event management and lookup functions
 * - Activities.gs: Activity and schedule management
 * - Points.gs: Points calculation and tracking
 * - Badges.gs: Badge system and award logic
 * - Notifications.gs: User notification functions
 * - FanFeed.gs: Social feed and engagement features
 * - Prizes.gs: Prize management functions
 * - Utils.gs: Utility and helper functions
 * - Config.gs: Configuration and constants
 *
 * Entry Point:
 * - doGet(e) - Main web app router, handles page routing and template variable injection
 * - include(filename) - HTML template file inclusion function
 */

/**
 * Main entry point for the Spartan Cup web app.
 * Routes the request based on the ?page= URL parameter and renders the appropriate page.
 * Handles:
 * - User authentication and profile data loading
 * - Page routing and template variable injection
 * - Location data capture from Firebase wrapper
 * - Auto-event detection based on geolocation
 * - New user welcome flow
 *
 * @param {Object} e - Event object from Apps Script containing URL parameters
 * @return {HtmlOutput} The rendered HTML template with injected variables
 */
function doGet(e) {
  // Check for API request
  if (e.parameter.api === 'true' || e.parameter.endpoint) {
    return handleApiRequest(e);
  }

  let page = e.parameter.page || 'profile'; // Default to profile page

  const user = Session.getActiveUser();

  // NEW USER WELCOME SCREEN: Redirect new users to welcome page on first visit
  // This gives time for the Display Name formula in Student_Profiles to populate
  if (page === 'profile' && isNewUser() && !e.parameter.skip_welcome) {
    page = 'welcome';
  }

  // Pass data to the HTML template
  const template = HtmlService.createTemplateFromFile('Index');
  template.page = page; // Tell the template which page to load

  // Escape all string values for safe JavaScript embedding
  const rawEmail = user.getEmail();
  const rawUserName = getUserDisplayName(); // Fetch from Student_Profiles sheet (will be empty until formula populates it)
  const rawUserPhoto = getUserProfilePhoto(rawEmail, rawUserName); // Pass display name for initials

  template.userEmail = escapeJavaScriptString(rawEmail);
  template.userName = escapeJavaScriptString(rawUserName);
  template.userPhoto = escapeJavaScriptString(rawUserPhoto);
  template.isAdmin = getUserIsAdmin(); // Read from Student_Profiles isAdmin column (J)
  template.userSettings = JSON.stringify(getUserSettings()); // Pass settings as JSON string
  template.firebaseWrapperUrl = escapeJavaScriptString('https://the-spartan-cup.web.app/?target=submit');
  template.badgeBaseUrl = escapeJavaScriptString(BADGE_BASE_URL);

  // NEW: Accept location from Firebase wrapper via URL parameters
  // These are passed from the wrapper: ?lat=X&lon=Y&acc=Z
  template.userLat = e.parameter.lat || null;
  template.userLon = e.parameter.lon || null;
  template.userAcc = e.parameter.acc || null;

  // AUTO-EVENT DETECTION: If submit page with location but no eventCode, auto-select closest event
  // Initialize as empty strings (not null) for safe template rendering
  template.autoEventCode = '';
  template.autoEventName = '';
  template.autoEventError = '';
  if (page === 'submit' && !e.parameter.eventCode && !e.parameter.event) {
    // User came to submit page without an event (direct from Firebase wrapper)
    if (template.userLat && template.userLon) {
      // Location available - validate and try to auto-select closest event
      const lat = parseFloat(template.userLat);
      const lon = parseFloat(template.userLon);
      if (isNaN(lat) || isNaN(lon)) {
        template.autoEventError = escapeJavaScriptString('Invalid location data');
      } else {
        const closestEvent = getClosestEvent(lat, lon);
        if (closestEvent.status === 'success') {
          template.autoEventCode = escapeJavaScriptString(closestEvent.eventCode);
          template.autoEventName = escapeJavaScriptString(closestEvent.eventName);
        } else {
          template.autoEventError = escapeJavaScriptString(closestEvent.message);
        }
      }
    } else {
      template.autoEventError = escapeJavaScriptString('Location is required to check in. Please enable location access.');
    }
  }

  return template.evaluate()
    .setTitle('The Spartan Cup')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
;
}

/**
 * HTML template inclusion function.
 * Loads and returns the raw HTML content from a template file.
 * Used with HtmlService template system to include separate HTML components.
 *
 * @param {string} filename - Name of the HTML file to include (without .html extension)
 * @return {string} The raw HTML content from the specified file
 */
function doPost(e) {
  // Check for API request
  if (e.parameter.api === 'true' || e.parameter.endpoint) {
    return handleApiRequest(e);
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Dynamically loads admin tab HTML content for Phase 3 optimization.
 * Returns the HTML content for a specific admin dashboard tab on-demand,
 * reducing initial page load size by ~70%.
 *
 * @param {string} tabName - The tab name to load ('events', 'season', 'badges', 'prizes', 'points')
 * @return {Object} Response object with status and HTML content
 */
function getAdminTabHTML(tabName) {
  const tabFiles = {
    'events': 'Page.admin.events',
    'season': 'Page.admin.season',
    'badges': 'Page.admin.badges',
    'prizes': 'Page.admin.prizes',
    'points': 'Page.admin.points'
  };

  if (!tabFiles[tabName]) {
    return {
      status: 'error',
      message: 'Invalid tab name: ' + tabName
    };
  }

  try {
    const html = include(tabFiles[tabName]);
    return {
      status: 'success',
      html: html
    };
  } catch (error) {
    Logger.log('Error loading admin tab ' + tabName + ': ' + error);
    return {
      status: 'error',
      message: 'Failed to load tab content: ' + error.message
    };
  }
}
