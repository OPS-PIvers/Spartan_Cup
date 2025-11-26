/**
 * Utils.gs
 *
 * Utility functions module for Spartan Cup application.
 * Contains helper functions for string manipulation, HTML escaping,
 * geolocation calculations, image handling, and URL generation.
 *
 * Functions:
 * - escapeJavaScriptString: Escapes strings for safe JavaScript embedding
 * - escapeHtml: Escapes HTML special characters
 * - toSnakeCase: Converts strings to snake_case format
 * - calculateDistance: Calculates distance between coordinates (Haversine formula)
 * - serveImage: Serves Drive images as base64 data URLs
 * - getDriveImageUrl: Generates Drive export URLs for images
 * - getWebAppUrl: Returns the web app's deployed URL
 */

/**
 * Escapes a string to be safely embedded in JavaScript without breaking syntax.
 * Handles quotes, apostrophes, backslashes, newlines, and other control characters.
 * @param {string} str - The string to escape
 * @return {string} JavaScript-safe escaped string
 */
function escapeJavaScriptString(str) {
  if (str === null || str === undefined) {
    return '';
  }

  return String(str)
    .replace(/\\/g, '\\\\')   // Backslash (must be first!)
    .replace(/"/g, '\\"')      // Double quotes
    .replace(/'/g, "\\'")      // Single quotes/apostrophes
    .replace(/\n/g, '\\n')     // Newlines
    .replace(/\r/g, '\\r')     // Carriage returns
    .replace(/\t/g, '\\t')     // Tabs
    .replace(/\f/g, '\\f')     // Form feeds
    .replace(/\v/g, '\\v')     // Vertical tabs
    .replace(/\u2028/g, '\\u2028')  // Line separator
    .replace(/\u2029/g, '\\u2029'); // Paragraph separator
}

/**
 * Helper function to escape HTML for dialog display.
 * @param {string} text - Text to escape
 * @return {string} Escaped text
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

/**
 * Converts a string to snake_case format by replacing spaces with underscores.
 * @param {string} str - The string to convert
 * @return {string} The snake_case formatted string
 */
function toSnakeCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '') // After lowercasing, remove all non-lowercase-alphanumeric characters except underscore
    .replace(/_+/g, '_'); // Collapse consecutive underscores into a single underscore
}

/**
 * Calculates distance between two coordinates using Haversine formula (in meters).
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function serveImage(fileId) {
  try {
    if (!fileId) {
      return { status: "error", message: "No file ID provided" };
    }
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    const dataUrl = 'data:' + blob.getContentType() + ';base64,' + base64;
    return { status: "success", dataUrl: dataUrl };
  } catch (e) {
    // Logger.log('Error serving image ' + fileId + ': ' + e.message);
    return { status: "error", message: "Image not found or access denied" };
  }
}

/**
 * Generates a Drive export URL for an image file.
 * Uses Google Drive's direct view URL with browser caching.
 * @param {string} fileId - Google Drive file ID
 * @return {string} Direct export URL
 */
function getDriveImageUrl(fileId) {
  if (!fileId) return '';
  return 'https://drive.google.com/uc?id=' + fileId + '&export=view';
}

/**
 * Returns the web app's URL.
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}
