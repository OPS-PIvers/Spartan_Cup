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

  // ADMIN PAGE: Build complete page with components injected in correct location
  if (page === 'admin') {
    const adminPageHtml = include('Page.admin');
    const adminComponents = getAdminComponents();
    // Inject components at marker position (inside the tab container div)
    template.adminPageContent = adminPageHtml.replace(
      '<!--ADMIN_COMPONENTS_INJECTION_POINT-->',
      adminComponents
    );
  } else {
    template.adminPageContent = ''; // Empty for non-admin pages
  }

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

  // DEBUG LOGGING: Log all template variable values to trace what's breaking JavaScript
  // Logger.log('=== TEMPLATE VARIABLES DEBUG ===');
  // Logger.log('page: ' + page);
  // Logger.log('userEmail: [' + template.userEmail + ']');
  // Logger.log('userName: [' + template.userName + ']');
  // Logger.log('userPhoto: [' + template.userPhoto + ']');
  // Logger.log('isAdmin: ' + template.isAdmin);
  // Logger.log('appUrl: [' + getWebAppUrl() + ']');
  // Logger.log('userLat: ' + template.userLat);
  // Logger.log('userLon: ' + template.userLon);
  // Logger.log('userAcc: ' + template.userAcc);
  // Logger.log('autoEventCode: [' + template.autoEventCode + ']');
  // Logger.log('autoEventName: [' + template.autoEventName + ']');
  // Logger.log('autoEventError: [' + template.autoEventError + ']');
  // Logger.log('userSettings: [' + template.userSettings + ']');

  return template.evaluate()
    .setTitle('The Spartan Cup')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * HTML template inclusion function.
 * Loads and returns the raw HTML content from a template file.
 * Used with HtmlService template system to include separate HTML components.
 *
 * @param {string} filename - Name of the HTML file to include (without .html extension)
 * @return {string} The raw HTML content from the specified file
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Builds the admin page content by including all modular components.
 *
 * This function solves a specific GAS limitation: When a file is included via
 * include(), any template directives within it become literal text. Additionally,
 * we need the admin components to render INSIDE the tab container div in
 * Page.admin.html for proper layout and functionality.
 *
 * The solution: In doGet(), when page === 'admin':
 * 1. Include Page.admin.html (contains navigation + empty container with marker)
 * 2. Call this function to get all component HTML
 * 3. Replace the marker comment with the components
 * 4. Pass the complete HTML as template.adminPageContent
 * 5. Index.html outputs this pre-built content
 *
 * This ensures components render in the correct location (inside the container div)
 * and all template directives are properly evaluated.
 *
 * Note: Page.admin.utils is loaded first as it contains shared utilities that
 * other components may reference.
 *
 * @return {string} The complete HTML content for all admin page components
 */
function getAdminComponents() {
  const components = [
    'Page.admin.utils',   // Shared utilities loaded first
    'Page.admin.review',
    'Page.admin.events',
    'Page.admin.season',
    'Page.admin.badges',
    'Page.admin.prizes',
    'Page.admin.points'
  ];

  return components.map(include).join('\n');
}
