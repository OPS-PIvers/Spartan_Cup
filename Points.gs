// ===============================================
// POINTS CONFIGURATION FUNCTIONS
// ===============================================
// Extracted from Code.js - Lines 1519-1769
// Functions for managing the points configuration system

function initializeConfigPoints() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const pointsSheet = ss.getSheetByName('Config_Points');

    // Only initialize if empty (no data rows beyond header)
    const data = pointsSheet.getDataRange().getValues();
    if (data.length > 1) {
      return; // Sheet already has data, don't overwrite
    }

    // Default point values
    const defaults = [
      ['Base_Points_With_Theme', 75, 'Points for attending event with theme dress'],
      ['Base_Points_Without_Theme', 50, 'Points for attending event without theme dress'],
      ['Theme_Bonus', 25, 'Additional points for dressing according to theme'],
      ['Spotlight_Game_Multiplier', 1.5, 'Points multiplier for spotlight games']
    ];

    defaults.forEach(row => {
      pointsSheet.appendRow(row);
    });

    CacheService.getScriptCache().remove('points_config');
  } catch (e) {
    Logger.log('Error initializing Config_Points: ' + e.message);
  }
}

/**
 * Gets the current points configuration from the Config_Points sheet.
 * Results are cached for 1 hour.
 * @return {Object} Object with keys like 'Base_Points_With_Theme', etc.
 */
function getPointsConfig() {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'points_config';
    const cached = cache.get(cacheKey);

    if (cached) {
      return safeJSONParse(cached, null, 'points config cache');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const pointsSheet = ss.getSheetByName('Config_Points');
    const data = pointsSheet.getDataRange().getValues();

    const config = {};
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        config[data[i][0]] = parseFloat(data[i][1]) || 0;
      }
    }

    // Cache for 1 hour (3600 seconds)
    cache.put(cacheKey, JSON.stringify(config), 3600);
    return config;
  } catch (e) {
    Logger.log('Error reading points config: ' + e.message);
    // Return defaults as fallback
    return {
      'Base_Points_With_Theme': 75,
      'Base_Points_Without_Theme': 50,
      'Theme_Bonus': 25,
      'Spotlight_Game_Multiplier': 1.5
    };
  }
}

/**
 * Opens a dialog for editing points configuration.
 * Creates a simple UI to update points values.
 */
function openPointsConfigDialog() {
  try {
    const config = getPointsConfig();

    let html = '<style>';
    html += 'body { font-family: Arial, sans-serif; padding: 15px; }';
    html += 'label { display: block; margin-top: 12px; font-weight: bold; }';
    html += 'input { width: 100%; padding: 6px; margin-top: 4px; box-sizing: border-box; }';
    html += 'button { margin-top: 20px; padding: 10px 20px; background: #1b3b87; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }';
    html += 'button:hover { background: #0f2550; }';
    html += '.description { font-size: 12px; color: #666; margin-top: 2px; }';
    html += '</style>';

    html += '<h2>⚙️ Points Configuration</h2>';
    html += '<p>Edit the point values used in the app:</p>';

    html += '<form id="pointsForm">';

    html += '<label>Base Points (With Theme):</label>';
    html += '<input type="number" id="Base_Points_With_Theme" value="' + config['Base_Points_With_Theme'] + '" step="0.1" />';
    html += '<div class="description">Points for attending event with theme dress</div>';

    html += '<label>Base Points (Without Theme):</label>';
    html += '<input type="number" id="Base_Points_Without_Theme" value="' + config['Base_Points_Without_Theme'] + '" step="0.1" />';
    html += '<div class="description">Points for attending event without theme dress</div>';

    html += '<label>Theme Bonus:</label>';
    html += '<input type="number" id="Theme_Bonus" value="' + config['Theme_Bonus'] + '" step="0.1" />';
    html += '<div class="description">Additional points for dressing according to theme</div>';

    html += '<label>Spotlight Game Multiplier:</label>';
    html += '<input type="number" id="Spotlight_Game_Multiplier" value="' + config['Spotlight_Game_Multiplier'] + '" step="0.1" />';
    html += '<div class="description">Points multiplier for spotlight games (e.g., 1.5 = 50% more)</div>';

    html += '<label>Home Game Bonus:</label>';
    html += '<input type="number" id="Home_Game_Bonus" value="' + config['Home_Game_Bonus'] + '" step="0.1" />';
    html += '<div class="description">Bonus points for home games</div>';

    html += '<button type="button" onclick="submitForm()">Save Changes</button>';
    html += '<button type="button" onclick="google.script.host.close()" style="margin-left: 8px; background: #999;">Cancel</button>';

    html += '</form>';

    html += '<script>';
    html += 'function submitForm() {';
    html += '  const config = {';
    html += '    "Base_Points_With_Theme": parseFloat(document.getElementById("Base_Points_With_Theme").value),';
    html += '    "Base_Points_Without_Theme": parseFloat(document.getElementById("Base_Points_Without_Theme").value),';
    html += '    "Theme_Bonus": parseFloat(document.getElementById("Theme_Bonus").value),';
    html += '    "Spotlight_Game_Multiplier": parseFloat(document.getElementById("Spotlight_Game_Multiplier").value),';
    html += '    "Home_Game_Bonus": parseFloat(document.getElementById("Home_Game_Bonus").value)';
    html += '  };';
    html += '  google.script.run.updatePointsConfig(config);';
    html += '  google.script.host.close();';
    html += '}';
    html += '</script>';

    const ui = SpreadsheetApp.getUi();
    const dialog = HtmlService.createHtmlOutput(html).setWidth(400).setHeight(500);
    ui.showModalDialog(dialog, 'Points Configuration');

  } catch (e) {
    SpreadsheetApp.getUi().alert('Error opening dialog: ' + e.message);
  }
}

/**
 * Updates the points configuration in the Config_Points sheet.
 * Called from the dialog UI.
 * @param {Object} config - Object with point settings
 */
function updatePointsConfig(config) {
  try {
    // Admin check
    if (!getUserIsAdmin()) {
      return { status: 'error', message: 'Unauthorized: Admin access required' };
    }

    // Validate all values are numbers and non-negative
    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== 'number' || isNaN(value)) {
        return { status: 'error', message: `Invalid value for ${key}: must be a number` };
      }
      if (value < 0) {
        return { status: 'error', message: `Invalid value for ${key}: must be non-negative` };
      }
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const pointsSheet = ss.getSheetByName('Config_Points');
    const data = pointsSheet.getDataRange().getValues();

    // Update each row based on setting name
    let updatedCount = 0;
    for (let i = 1; i < data.length; i++) {
      const settingName = data[i][0];
      if (config[settingName] !== undefined) {
        pointsSheet.getRange(i + 1, 2).setValue(config[settingName]);
        updatedCount++;
      }
    }

    // Clear cache so new values are picked up
    CacheService.getScriptCache().remove('points_config');

    Logger.log(`Points config updated: ${updatedCount} values changed by ${Session.getActiveUser().getEmail()}`);

    // For menu-based dialog (backward compatibility)
    if (typeof SpreadsheetApp.getUi === 'function') {
      try {
        SpreadsheetApp.getUi().alert('✅ Points configuration updated successfully!');
      } catch (uiError) {
        // UI alert not available in web app context, that's ok
      }
    }

    return { status: 'success', message: `Updated ${updatedCount} point values` };
  } catch (e) {
    Logger.log('Error updating points config: ' + e.message);

    // For menu-based dialog (backward compatibility)
    if (typeof SpreadsheetApp.getUi === 'function') {
      try {
        SpreadsheetApp.getUi().alert('❌ Error updating config: ' + e.message);
      } catch (uiError) {
        // UI alert not available in web app context, that's ok
      }
    }

    return { status: 'error', message: e.message };
  }
}

/**
 * Resets points configuration to default values.
 * @return {Object} Status object with success/error
 */
function resetPointsToDefaults() {
  try {
    // Admin check
    if (!getUserIsAdmin()) {
      return { status: 'error', message: 'Unauthorized: Admin access required' };
    }

    // Default point values (same as initializeConfigPoints)
    const defaults = {
      'Base_Points_With_Theme': 75,
      'Base_Points_Without_Theme': 50,
      'Theme_Bonus': 25,
      'Spotlight_Game_Multiplier': 1.5
    };

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const pointsSheet = ss.getSheetByName('Config_Points');
    const data = pointsSheet.getDataRange().getValues();

    // Update each row to default value
    let resetCount = 0;
    for (let i = 1; i < data.length; i++) {
      const settingName = data[i][0];
      if (defaults[settingName] !== undefined) {
        pointsSheet.getRange(i + 1, 2).setValue(defaults[settingName]);
        resetCount++;
      }
    }

    // Clear cache so new values are picked up
    CacheService.getScriptCache().remove('points_config');

    Logger.log(`Points config reset to defaults: ${resetCount} values reset by ${Session.getActiveUser().getEmail()}`);

    return { status: 'success', message: `Reset ${resetCount} point values to defaults` };
  } catch (e) {
    Logger.log('Error resetting points config: ' + e.message);
    return { status: 'error', message: e.message };
  }
}
