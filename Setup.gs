/**
 * Setup.gs - First-time setup and initialization functions
 *
 * This module contains all setup, initialization, and configuration functions for the Spartan Cup application.
 * Extracted from Code.js into modular Google Apps Script file.
 *
 * Functions:
 * - onOpen: Creates admin menu on spreadsheet open
 * - setDataValidation: Sets dropdown validation for Config_Badges sheet
 * - firstTimeSetup: Main setup orchestrator (creates sheets, folders, and HTML files)
 * - installActiveEventsTrigger: Installs 10-minute timer trigger
 * - setupDriveFolders: Creates Drive folder structure
 * - setupSpreadsheet: Creates and validates all spreadsheet sheets
 * - setupBadgeDropdowns: Sets up data validation dropdowns (placeholder)
 * - generateSampleSubmissions: Generates test data for development
 * - populateSampleBadges: Populates sample badge definitions
 * - createHtmlFiles: Creates all HTML template files
 *
 * Dependencies:
 * - Points.gs: initializeConfigPoints()
 * - Auth.gs: getUserIsAdmin()
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏆 Spartan Cup Admin')
    .addItem('1. Run First-Time Setup (All Files)', 'firstTimeSetup')
    .addItem('2. Configure Points Values', 'openPointsConfigDialog')
    // .addItem('2b. Edit Rulebook Content', 'openRulebookEditor')  // DEPRECATED: Edit Page.rulebook.html directly
    .addItem('3. Generate Sample Submissions (For Testing)', 'generateSampleSubmissions')
    .addItem('4. Install Active Events Trigger (Run Once)', 'installActiveEventsTrigger')
    .addItem('5. Clear Cache (Development)', 'clearAllCaches')
    .addSeparator()
    .addItem('6. Populate Sample Badges', 'populateSampleBadges')
    .addItem('Set Data Validation', 'setDataValidation')
    .addItem('7. Award Retroactive Badges (Run Once)', 'awardRetroactiveBadges')
    .addItem('8. End Season & Award Final Badges', 'processSeasonEndBadges')
    .addToUi();
}

function setDataValidation() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Config_Badges');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Config_Badges" not found.');
    return;
  }

  // Set data validation for Category column (C)
  const categoryRange = sheet.getRange('C2:C');
  const categoryRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Points', 'Participation', 'Variety', 'Loyalty', 'Special', 'Career', 'Achievement', 'Activity'], true)
      .setAllowInvalid(false)
      .build();
  categoryRange.setDataValidation(categoryRule);

  // Set data validation for Trigger_Type column (D)
  const triggerTypeRange = sheet.getRange('D2:D');
  const triggerTypeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Points_Season', 'Submission_Count', 'Submission_Count_Week_1', 'Events_In_7_Days', 'Distinct_Sports', 'Activity_Pct', 'Activity_Event_Count', 'Home_Game_Pct', 'Activity_Pct_Season', 'Activity_Pct_Lifetime', 'Activity_Event_Count_Season', 'Season_Placement', 'AllTime_Placement_Reached', 'Career_Events_Attended', 'Career_Seasons_Participated', 'Career_Badges_Earned', 'Weekday_Coverage', 'Specific_Activities', 'manual', 'activity_pct_season', 'activity_count_season', 'career_seasons', 'alltime_placement', 'career_badges', 'career_events'], true)
      .setAllowInvalid(false)
      .build();
  triggerTypeRange.setDataValidation(triggerTypeRule);

  SpreadsheetApp.getUi().alert('Data validation rules have been set for Category and Trigger_Type columns in Config_Badges.');
}

/**
 * Main setup function: Creates Spreadsheet, Folders, and all HTML files.
 */
function firstTimeSetup() {
  setupSpreadsheet();
  setupDriveFolders();
  createHtmlFiles();
  SpreadsheetApp.getUi().alert('✅ Full Setup Complete!\n\nYour spreadsheet, Drive folders, and all HTML files have been created.\n\nDEPLOY this script as a Web App to get started.');
}

/**
 * Installs a time-based trigger to update active event status every 10 minutes.
 * Should only be run once. Checks for existing triggers to prevent duplicates.
 */
function installActiveEventsTrigger() {
  try {
    // Check if trigger already exists
    const triggers = ScriptApp.getProjectTriggers();
    const existingTrigger = triggers.find(t => t.getHandlerFunction() === 'updateActiveEventStatus');

    if (existingTrigger) {
      SpreadsheetApp.getUi().alert('⚠️ Trigger Already Exists\n\nThe Active Events trigger is already installed.\n\nIt will run every 10 minutes to update event status.');
      return;
    }

    // Create new time-based trigger (every 10 minutes)
    ScriptApp.newTrigger('updateActiveEventStatus')
      .timeBased()
      .everyMinutes(10)
      .create();

    SpreadsheetApp.getUi().alert('✅ Trigger Installed Successfully!\n\nThe Active Events trigger will now run every 10 minutes to automatically update which events are currently active.\n\nYou can see all triggers in Extensions > Apps Script > Triggers.');
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error Installing Trigger\n\n' + e.message);
    Logger.log('Error installing trigger: ' + e.message);
  }
}

/**
 * Creates all necessary Google Drive folders.
 */
function setupDriveFolders() {
  try {
    let parentFolder;
    const parentFolders = DriveApp.getFoldersByName('The Spartan Cup');
    if (parentFolders.hasNext()) {
      parentFolder = parentFolders.next();
    } else {
      parentFolder = DriveApp.createFolder('The Spartan Cup');
    }

    const submissionFolders = parentFolder.getFoldersByName('Submissions_Winter_25-26');
    if (!submissionFolders.hasNext()) {
      parentFolder.createFolder('Submissions_Winter_25-26');
    }

    const assetFolders = parentFolder.getFoldersByName('Assets_Badges');
    if (!assetFolders.hasNext()) {
      parentFolder.createFolder('Assets_Badges');
    }

    const profileFolders = parentFolder.getFoldersByName('Profile Pictures');
    if (!profileFolders.hasNext()) {
      parentFolder.createFolder('Profile Pictures');
    }

  } catch (e) {
    // Logger.log('Drive Folders already exist or error: ' + e.message);
  }
}

/**
 * Creates and formats the entire Google Sheet backend.
 * Updated to validate and repair existing sheets rather than clearing them.
 *
 * For each sheet:
 * - If sheet exists: validates all required headers are present and adds any missing ones
 * - If sheet doesn't exist: creates it with all required headers
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ss.setName('[The Spartan Cup] - MASTER');

  // Define ALL sheets with their required headers
  const sheets = {
    'Student_Profiles': ['Email', 'Display_Name', 'Total_Points_Season', 'Total_Points_AllTime', 'Badges_Earned', 'Loyalty_Stats_JSON', 'Variety_Stats_Set', 'Disqualified', 'Student_Settings'],
    'Activities_Data': ['Activity_Code', 'Activity_Name', 'Season', 'Location_Name', 'Event_Lat', 'Event_Lon'],
    'Events': ['Event_ID', 'Activity_Code', 'Event_Name', 'Date', 'Location_Name', 'Event_Lat', 'Event_Lon', 'Start_Time', 'Duration_Hours', 'Is_Home_Game', 'Is_Spotlight_Game', 'Theme', 'Is_Active'],
    'Config_Active_Season': ['Setting_Name', 'Setting_Value'],
    'Submissions_Pending': ['Submission_ID', 'Timestamp', 'Email', 'Event_ID', 'Photo_URL', 'Photo_ID', 'Location_Data_JSON', 'Dressed_For_Theme', 'Notes'],
    'Submissions_Verified': ['Submission_ID', 'Timestamp_Submitted', 'Timestamp_Approved', 'Email', 'Event_ID', 'Admin_Email', 'Points_Base', 'Points_Theme', 'Points_Spotlight_Multiplier', 'Points_Total', 'Photo_URL', 'Photo_ID'],
    'Submissions_Denied': ['Submission_ID', 'Timestamp_Submitted', 'Timestamp_Denied', 'Email', 'Event_ID', 'Admin_Email', 'Denial_Reason', 'Is_Resubmittable', 'Photo_URL', 'Photo_ID'],
    'Config_Badges': ['Badge_ID', 'Badge_Name', 'Category', 'Trigger_Type', 'Trigger_Value', 'Description', 'Badge_Image_URL'],
    'Config_Admins': ['Admin_Email', 'Role'],
    'Config_Points': ['Setting_Name', 'Points_Value', 'Description'],
    'Config_Denial_Reasons': ['Reason_ID', 'Reason_Text', 'Description', 'Is_Active'],
    'Active_Season_Prizes': ['Rank', 'Description'],
    'Badge_Awards': ['Award_ID', 'Timestamp', 'Email', 'Display_Name', 'Badge_ID', 'Badge_Name', 'Badge_Image_URL']
  };

  const sheetsCreated = [];
  const sheetsValidated = [];
  const headersAdded = [];

  Object.keys(sheets).forEach((sheetName, index) => {
    const requiredHeaders = sheets[sheetName];
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      // Sheet doesn't exist - create it
      if (index === 0 && ss.getSheetByName('Sheet1')) {
        sheet = ss.getSheetByName('Sheet1').setName(sheetName);
      } else {
        sheet = ss.insertSheet(sheetName);
      }
      // Add headers to new sheet
      sheet.appendRow(requiredHeaders);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold');
      sheetsCreated.push(sheetName);
    } else {
      // Sheet exists - validate headers

      // Handle completely empty sheets (no rows at all)
      if (sheet.getLastRow() < 1) {
        sheet.appendRow(requiredHeaders);
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold');
        headersAdded.push(`${sheetName} (was empty - added headers)`);
      } else {
        // Sheet has at least one row and one column - check existing headers
        const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const existingHeaderSet = new Set(existingHeaders);

        // Find headers that are required but missing from existing sheet
        const missingHeaders = requiredHeaders.filter(h => !existingHeaderSet.has(h));

        if (missingHeaders.length > 0) {
          // IMPORTANT: Append missing headers to END of sheet to avoid data corruption
          // Inserting columns mid-sheet would shift existing data and misalign it with headers
          //
          // NOTE: Any code relying on specific column positions (rather than header names)
          // may need updates when missing headers are appended to the end.
          // Best practice: Always reference columns by header name lookup, not by hardcoded indices.
          const firstNewCol = sheet.getLastColumn() + 1;
          sheet.getRange(1, firstNewCol, 1, missingHeaders.length).setValues([missingHeaders]).setFontWeight('bold');
          headersAdded.push(`${sheetName} (appended ${missingHeaders.length} header(s) to end: ${missingHeaders.join(', ')})`);
        } else {
          sheetsValidated.push(sheetName);
        }

        // Ensure frozen rows and bold headers for all columns
        sheet.setFrozenRows(1);
        if (sheet.getLastColumn() > 0) {
          sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
        }
      }
    }
  });

  // Add sample data only for newly created sheets
  if (sheetsCreated.includes('Activities_Data')) {
    const activitiesSheet = ss.getSheetByName('Activities_Data');
    if (activitiesSheet.getLastRow() === 1) { // Only header row exists (no data rows)
      activitiesSheet.appendRow(['GBB', 'Girls Basketball', 'Winter', 'Orono High School Gym', 44.965, -93.625]);
      activitiesSheet.appendRow(['BBB', 'Boys Basketball', 'Winter', 'Orono High School Gym', 44.965, -93.625]);
      activitiesSheet.appendRow(['GVBB', 'Girls Volleyball', 'Fall', 'Orono High School Gym', 44.965, -93.625]);
    }
  }

  if (sheetsCreated.includes('Events')) {
    const eventsSheet = ss.getSheetByName('Events');
    if (eventsSheet.getLastRow() === 1) { // Only header row exists (no data rows)
      // Use dynamic date (7 days from now) for sample event
      const sampleDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const dateStr = Utilities.formatDate(sampleDate, 'America/Chicago', 'yyyy-MM-dd');
      const dateTimeStr = Utilities.formatDate(sampleDate, 'America/Chicago', 'yyyy-MM-dd') + 'T19:00';
      eventsSheet.appendRow(['GBB-001', 'GBB', 'Girls Basketball vs. Hopkins', dateStr, 'Orono High School Gym', 44.965, -93.625, dateTimeStr, 2, true, true, 'White Out', false]);
    }
  }

  if (sheetsCreated.includes('Config_Active_Season')) {
    const seasonSheet = ss.getSheetByName('Config_Active_Season');
    if (seasonSheet.getLastRow() === 1) { // Only header row exists (no data rows)
      seasonSheet.appendRow(['Active_Season', 'Winter']);
    }
  }

  if (sheetsCreated.includes('Config_Admins')) {
    const adminsSheet = ss.getSheetByName('Config_Admins');
    if (adminsSheet.getLastRow() === 1) { // Only header row exists (no data rows)
      adminsSheet.appendRow([Session.getActiveUser().getEmail(), 'Owner']);
    }
  }

  if (sheetsCreated.includes('Config_Denial_Reasons')) {
    const reasonsSheet = ss.getSheetByName('Config_Denial_Reasons');
    if (reasonsSheet.getLastRow() === 1) { // Only header row exists (no data rows)
      // Add default denial reasons
      reasonsSheet.appendRow([1, 'Photo quality too low', 'Image is blurry, too dark, or hard to read', true]);
      reasonsSheet.appendRow([2, 'Not at event location', 'Location verification failed or photo taken elsewhere', true]);
      reasonsSheet.appendRow([3, 'Missing event theme', 'Student did not follow the event theme/dress code', true]);
      reasonsSheet.appendRow([4, 'Duplicate submission', 'This event/submission was already approved', true]);
      reasonsSheet.appendRow([5, 'Off-topic/inappropriate content', 'Photo does not meet community standards', true]);
    }
  }

  // Initialize Config_Points with default values (this function already checks if data exists)
  initializeConfigPoints();

  // Initialize Config_Rulebook with default content (this function already checks if data exists)
  // DEPRECATED: Rulebook is now static HTML in Page.rulebook.html
  // initializeConfigRulebook();

  // Log summary
  Logger.log('=== Spreadsheet Setup Summary ===');
  if (sheetsCreated.length > 0) {
    Logger.log(`Sheets created: ${sheetsCreated.join(', ')}`);
  }
  if (sheetsValidated.length > 0) {
    Logger.log(`Sheets validated (no changes needed): ${sheetsValidated.join(', ')}`);
  }
  if (headersAdded.length > 0) {
    Logger.log(`Sheets with headers added: ${headersAdded.join(', ')}`);
  }
  if (sheetsCreated.length === 0 && headersAdded.length === 0 && sheetsValidated.length === 0) {
    Logger.log('No changes needed: all sheets and headers are already set up correctly');
  }

  // Note: Config_Event_Codes has been removed - Events tab is now the single source of truth
  // Is_Active status is updated by the updateActiveEventStatus() trigger
}

function setupBadgeDropdowns() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const badgesSheet = ss.getSheetByName('Config_Badges');

  if (!badgesSheet) {
    SpreadsheetApp.getUi().alert('Error: Config_Badges sheet not found. Please run First-Time Setup first.');
    return;
  }

  // TODO: Implement data validation dropdowns for badge configuration
  // This function is a placeholder for future implementation
}

/**
 * Generates sample submissions for testing the admin workflow.
 * Creates sample students, pending submissions, and verified submissions.
 * Safe to run multiple times - clears old test data first.
 */
function generateSampleSubmissions() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  try {
    // Sample student data
    const sampleStudents = [
      { email: 'testuser1@orono.k12.mn.us', name: 'Sarah Johnson', grade: 12 },
      { email: 'testuser2@orono.k12.mn.us', name: 'Marcus Davis', grade: 11 },
      { email: 'testuser3@orono.k12.mn.us', name: 'Emma Wilson', grade: 10 },
      { email: 'testuser4@orono.k12.mn.us', name: 'James Chen', grade: 11 },
      { email: 'testuser5@orono.k12.mn.us', name: 'Olivia Martinez', grade: 12 },
      { email: 'testuser6@orono.k12.mn.us', name: 'Lucas Thompson', grade: 9 },
      { email: 'testuser7@orono.k12.mn.us', name: 'Sophia Anderson', grade: 10 },
      { email: 'testuser8@orono.k12.mn.us', name: 'Noah Garcia', grade: 11 },
      { email: 'testuser9@orono.k12.mn.us', name: 'Isabella Lee', grade: 12 },
      { email: 'testuser10@orono.k12.mn.us', name: 'Ethan Brown', grade: 9 }
    ];

    // Add students to Student_Profiles (skip if already exist)
    const studentSheet = ss.getSheetByName('Student_Profiles');
    const studentData = studentSheet.getDataRange().getValues();
    const existingEmails = new Set(studentData.slice(1).map(row => row[0]));

    sampleStudents.forEach(student => {
      if (!existingEmails.has(student.email)) {
        studentSheet.appendRow([
          student.email,
          student.name,
          0, // Total_Points_Season (will be updated when submissions approved)
          0, // Total_Points_AllTime
          '', // Badges_Earned
          '{}', // Loyalty_Stats_JSON
          '[]', // Variety_Stats_Set
          false, // Disqualified
          '{}' // Student_Settings
        ]);
      }
    });

    // Placeholder image URL (300x400 placeholder)
    const placeholderImageUrl = 'https://via.placeholder.com/300x400/1b3b87/ffffff?text=Student+Photo';

    // Location data (within campus geofence bounds, slightly varied)
    const locationVariations = [
      { lat: 44.9660, lon: -93.6250 },
      { lat: 44.9670, lon: -93.6240 },
      { lat: 44.9680, lon: -93.6260 },
      { lat: 44.9650, lon: -93.6270 },
      { lat: 44.9665, lon: -93.6220 },
    ];

    // Sample notes (realistic student comments)
    const sampleNotes = [
      'Great game! Amazing support from the crowd.',
      'So excited to be here supporting the team!',
      'Love the white out theme - everyone looked great.',
      'Awesome atmosphere tonight. Go Spartans!',
      'Had a blast at the game with friends.',
      'Best school spirit event of the year!',
      'Supporting our athletes all the way!',
      'Cheering loud for the team!',
      ''
    ];

    // Create 10 pending submissions
    const pendingSheet = ss.getSheetByName('Submissions_Pending');
    const now = new Date();

    // Clear old test submissions first (optional - helps avoid duplicates)
    const pendingDataBefore = pendingSheet.getDataRange().getValues();
    for (let i = pendingDataBefore.length - 1; i > 0; i--) {
      if (pendingDataBefore[i][2] && pendingDataBefore[i][2].includes('testuser')) {
        pendingSheet.deleteRow(i + 1);
      }
    }

    for (let i = 0; i < 10; i++) {
      const student = sampleStudents[i];
      const hoursAgo = Math.floor(Math.random() * 48) + 1; // 1-48 hours ago
      const submissionTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
      const location = locationVariations[i % locationVariations.length];
      const dressedForTheme = Math.random() > 0.3; // 70% chance of theme
      const notes = sampleNotes[Math.floor(Math.random() * sampleNotes.length)];

      pendingSheet.appendRow([
        Utilities.getUuid(), // Submission_ID
        submissionTime, // Timestamp
        student.email, // Email
        'GBB-01', // Event_ID
        placeholderImageUrl, // Photo_URL
        'placeholder_' + i, // Photo_ID
        JSON.stringify(location), // Location_Data_JSON
        dressedForTheme ? 'Yes' : 'No', // Dressed_For_Theme
        notes // Notes
      ]);
    }

    // Create 5 verified submissions (approved examples)
    const verifiedSheet = ss.getSheetByName('Submissions_Verified');

    // Clear old test verified submissions first
    const verifiedDataBefore = verifiedSheet.getDataRange().getValues();
    for (let i = verifiedDataBefore.length - 1; i > 0; i--) {
      if (verifiedDataBefore[i][3] && verifiedDataBefore[i][3].includes('testuser')) {
        verifiedSheet.deleteRow(i + 1);
      }
    }

    const currentAdminEmail = Session.getActiveUser().getEmail();

    // Get points configuration
    const pointsConfig = getPointsConfig();

    for (let i = 0; i < 5; i++) {
      const student = sampleStudents[i];
      const hoursAgo = Math.floor(Math.random() * 72) + 1; // 1-72 hours ago
      const submittedTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
      const approvedTime = new Date(submittedTime.getTime() + Math.floor(Math.random() * 3600000)); // 0-1hr after submission
      const dressedForTheme = Math.random() > 0.3;
      const basePoints = dressedForTheme ? pointsConfig['Base_Points_With_Theme'] : pointsConfig['Base_Points_Without_Theme'];
      const themeBonus = dressedForTheme ? pointsConfig['Theme_Bonus'] : 0;
      const spotlightMultiplier = pointsConfig['Spotlight_Game_Multiplier']; // GBB-01 is a spotlight game
      const totalPoints = Math.round(basePoints * spotlightMultiplier + themeBonus);

      verifiedSheet.appendRow([
        Utilities.getUuid(), // Submission_ID
        submittedTime, // Timestamp_Submitted
        approvedTime, // Timestamp_Approved
        student.email, // Email
        'GBB-01', // Event_ID
        currentAdminEmail, // Admin_Email
        basePoints, // Points_Base
        themeBonus, // Points_Theme
        spotlightMultiplier, // Points_Spotlight_Multiplier
        totalPoints, // Points_Total
        placeholderImageUrl // Photo_URL
      ]);

      // Update student points
      const studentDataCurrent = studentSheet.getDataRange().getValues();
      for (let j = 1; j < studentDataCurrent.length; j++) {
        if (studentDataCurrent[j][0] === student.email) {
          const newSeasonPoints = (studentDataCurrent[j][2] || 0) + totalPoints;
          const newAllTimePoints = (studentDataCurrent[j][3] || 0) + totalPoints;
          // Batch update both columns in single API call for better performance
          studentSheet.getRange(j + 1, 3, 1, 2).setValues([[newSeasonPoints, newAllTimePoints]]);
          break;
        }
      }
    }

    SpreadsheetApp.getUi().alert(
      '✅ Sample Data Generated!\n\n' +
      '• Created 10 sample students\n' +
      '• Added 10 pending submissions (for admin review)\n' +
      '• Added 5 verified submissions (approved examples)\n' +
      '• Updated student points\n\n' +
      'Go to the Admin page to review submissions or check the Student_Profiles sheet to see updated points.'
    );

  } catch (e) {
    // Logger.log('Error generating sample submissions: ' + e.message);
    SpreadsheetApp.getUi().alert('❌ Error: ' + e.message);
  }
}

/**
 * Populates the Config_Badges sheet with sample badge definitions.
 * This creates a tiered badge system based on points and event attendance.
 */
function populateSampleBadges() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const badgesSheet = ss.getSheetByName('Config_Badges');

    // Clear existing badges (except header)
    const existingData = badgesSheet.getDataRange().getValues();
    if (existingData.length > 1) {
      badgesSheet.deleteRows(2, existingData.length - 1);
    }

    // Sample badge definitions
    // Structure: Badge_ID, Badge_Name, Category, Trigger_Type, Trigger_Value, Description, Badge_Image_URL
    const sampleBadges = [
      ['badge_001', 'First Event', 'Participation', 'event_count', 1, 'Attended your first Spartan event', 'https://the-spartan-cup.web.app/badges/first_event.svg'],
      ['badge_002', 'Rookie Fan', 'Points', 'points_threshold', 50, 'Earned your first 50 points', 'https://the-spartan-cup.web.app/badges/rookie_fan.svg'],
      ['badge_003', 'Regular', 'Participation', 'event_count', 5, 'Attended 5 events this season', 'https://the-spartan-cup.web.app/badges/regular.svg'],
      ['badge_004', 'Committed Fan', 'Points', 'points_threshold', 100, 'Reached 100 total points', 'https://the-spartan-cup.web.app/badges/committed_fan.svg'],
      ['badge_005', 'Super Fan', 'Participation', 'event_count', 10, 'Attended 10 events - true dedication!', 'https://the-spartan-cup.web.app/badges/super_fan.svg'],
      ['badge_006', 'Century Club', 'Points', 'season_points', 100, 'Earned 100 points in a single season', 'https://the-spartan-cup.web.app/badges/century_club.svg'],
      ['badge_007', 'Point Collector', 'Points', 'points_threshold', 200, 'Accumulated 200 total points', 'https://the-spartan-cup.web.app/badges/point_collector.svg'],
      ['badge_008', 'Elite Supporter', 'Participation', 'event_count', 15, 'Attended 15+ events - elite status!', 'https://the-spartan-cup.web.app/badges/elite_supporter.svg'],
      ['badge_009', 'Triple Threat', 'Points', 'points_threshold', 300, 'Reached the 300 point milestone', 'https://the-spartan-cup.web.app/badges/triple_threat.svg'],
      ['badge_010', 'Spartan Legend', 'Points', 'points_threshold', 500, 'Legendary dedication - 500 points!', 'https://the-spartan-cup.web.app/badges/spartan_legend.svg']
    ];

    // Append all badges
    sampleBadges.forEach(badge => {
      badgesSheet.appendRow(badge);
    });

    SpreadsheetApp.getUi().alert(
      '✅ Sample Badges Created!\n\n' +
      'Created ' + sampleBadges.length + ' badge definitions:\n\n' +
      '• First Event (1 event)\n' +
      '• Rookie Fan (50 pts)\n' +
      '• Regular (5 events)\n' +
      '• Committed Fan (100 pts)\n' +
      '• Super Fan (10 events)\n' +
      '• Century Club (100 season pts)\n' +
      '• Point Collector (200 pts)\n' +
      '• Elite Supporter (15 events)\n' +
      '• Triple Threat (300 pts)\n' +
      '• Spartan Legend (500 pts)\n\n' +
      'Now run "6. Award Retroactive Badges" to award badges to existing students!'
    );

  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error creating badges:\n\n' + e.message);
    Logger.log('Error in populateSampleBadges: ' + e.message);
  }
}

function createHtmlFiles() {
  const files = {
    'Index.html': `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Spartan Cup</title>
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <link href="https://fonts.googleapis.com" rel="preconnect"/>
  <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;900&amp;display=swap" rel="stylesheet"/>
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet"/>

  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "primary": "#1b3b87", "secondary": "#b5121b", "light-gray": "#cacbcd",
            "background-light": "#f6f6f8", "background-dark": "#0a1f47",
            "gold": "#FFD700", "silver": "#C0C0C0", "bronze": "#CD7F32",
          },
          fontFamily: { "display": ["Public Sans", "sans-serif"] },
          borderRadius: { "DEFAULT": "0.5rem", "lg": "0.75rem", "xl": "1rem", "full": "9999px" },
        },
      },
    }
  </script>
  <?!= include('CSS'); ?>
</head>

<body class="font-display bg-background-light dark:bg-background-dark">

  <!-- Main App Container -->
  <div class="max-w-md mx-auto bg-background-light dark:bg-background-dark min-h-screen shadow-lg">

    <!-- Header -->
    <header class="sticky top-0 z-10 flex h-16 items-center bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-sm px-4 justify-between border-b border-gray-200 dark:border-gray-800">
      <div class="flex size-10 shrink-0 items-center justify-start">
        <span id="header-back-button" class="material-symbols-outlined text-2xl text-[#111318] dark:text-white cursor-pointer hidden">arrow_back_ios_new</span>
      </div>
      <h1 id="page-title" class="text-lg font-bold leading-tight tracking-[-0.015em] text-[#111318] dark:text-white flex-1 text-center"></h1>
      <div class="flex size-10 shrink-0 items-center justify-end">
        <span id="settings-button" class="material-symbols-outlined text-2xl text-[#111318] dark:text-white cursor-pointer">settings</span>
      </div>
    </header>

    <!-- Page Content Area -->
    <main class="pb-24">
      <?!= include('Page.' + page); ?>
    </main>
  </div>

  <!-- Modals (Hidden by default) -->
  <?!= include('Modals'); ?>

  <!-- Main 4-Tab Navigation Bar -->
  <nav class="fixed bottom-0 left-0 right-0 max-w-md mx-auto h-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-800 flex justify-around">
    <a href="<?= getWebAppUrl() ?>?page=profile" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="profile">
      <span class="material-symbols-outlined text-2xl">person</span><span class="text-xs font-medium">Profile</span>
    </a>
    <a href="<?= getWebAppUrl() ?>?page=history" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="history">
      <span class="material-symbols-outlined text-2xl">event</span><span class="text-xs font-medium">History</span>
    </a>
    <a href="<?= getWebAppUrl() ?>?page=prizes" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="prizes">
      <span class="material-symbols-outlined text-2xl">emoji_events</span><span class="text-xs font-medium">Prizes</span>
    </a>
    <a href="<?= getWebAppUrl() ?>?page=fanfeed" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="fanfeed">
      <span class="material-symbols-outlined text-2xl">dynamic_feed</span><span class="text-xs font-medium">Fan Feed</span>
    </a>
  </nav>

  <!-- Client-side JavaScript -->
  <script>
    // Pass server-side data to client-side JS
    const APP_DATA = {
      page: "<?= page ?>",
      userEmail: "<?= userEmail ?>",
      userName: "<?= userName ?>",
      userPhoto: "<?= userPhoto ?>",
      isAdmin: <?= isAdmin ?>,
      appUrl: "<?= getWebAppUrl() ?>",
      badgeBaseUrl: "<?= badgeBaseUrl ?>"
    };
  </script>
  <?!= include('JavaScript'); ?>
</body>
</html>`,
    'CSS.html': `<style>
    body {
      font-family: 'display', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      padding-bottom: 80px;
    }
    .material-symbols-outlined {
      font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24
    }
    .page {
      animation: fadeIn 0.3s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .nav-item.active .material-symbols-outlined { color: #1b3b87; }
    .nav-item.active span { color: #1b3b87; font-weight: 700; }
  </style>`,
    'JavaScript.html': `<script>
    // --- STATE & PAGE ROUTING -----------------------------------------------
    let currentProfileData = null; // Store full profile data for leaderboard toggling

    const TITLES = {
      'profile': 'My Profile', 'history': 'Event History', 'prizes': 'Prizes & Awards',
      'fanfeed': 'Fan Feed', 'submit': 'Submit Attendance',
      'settings': 'Settings', 'all-badges': 'All Badges', 'admin': 'Admin Dashboard'
    };

    /**
     * Main function to navigate between pages using URL parameters
     */
    function navigateToPage(pageName) {
      if (pageName) {
        window.top.location.href = APP_DATA.appUrl + '?page=' + pageName;
      }
    }

    // NOTE: All event listeners and page-specific logic have been moved to JavaScript.html
    // This includes page routing, button event handlers, and modal management

    // --- DATA POPULATION ---

    // Helper function to escape HTML to prevent XSS
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function updateLeaderboardDisplay(leaderboard) {
      const lbContainer = document.getElementById('leaderboard-container');

      // Build complete HTML string first (performance optimization - single DOM update)
      let htmlContent = '';

      leaderboard.forEach(item => {
        // Add gap indicator if needed (with accessibility attributes)
        if (item.showGapBefore) {
          htmlContent += \`
            <div class="flex items-center justify-center py-2" role="separator" aria-label="Gap in rankings">
              <span class="text-gray-400 dark:text-gray-500 text-sm">···</span>
            </div>\`;
        }

        // Determine if this is the first place for special styling
        const isFirstPlace = item.rank === 1;

        // Escape user name to prevent XSS
        const escapedName = escapeHtml(item.name);

        // Fix: Combine first place and current user styling when both apply
        const backgroundClass = item.isCurrentUser
          ? (isFirstPlace ? 'bg-primary/15 dark:bg-primary/25 border-l-4 border-primary' : 'bg-primary/5 dark:bg-primary/10 border-l-4 border-primary')
          : (isFirstPlace ? 'bg-primary/10 dark:bg-primary/20' : '');

        // Build row HTML with conditional user highlighting
        htmlContent += \`
          <div class="flex items-center gap-3 rounded-lg p-3 \${backgroundClass}" \${item.isCurrentUser ? 'aria-current="true"' : ''}>
            <span class="font-bold text-lg \${isFirstPlace ? 'text-primary dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'} w-5 text-center">\${item.rank}</span>
            <span class="material-symbols-outlined text-2xl \${item.color}">\${item.icon}</span>
            <span class="flex-1 truncate font-medium text-[#111318] dark:text-white \${item.isCurrentUser ? 'font-semibold' : ''}">\${escapedName}\${item.isCurrentUser ? ' <span class="text-primary dark:text-blue-300 text-sm">(You)</span>' : ''}</span>
            <span class="font-bold \${isFirstPlace ? 'text-primary dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'}">\${item.points} PTS</span>
          </div>\`;
      });

      // Set innerHTML once (performance optimization)
      lbContainer.innerHTML = htmlContent;
    }

    function populateProfile(data) {
      // Store data for leaderboard toggling
      currentProfileData = data;

      document.getElementById('profile-name').innerText = APP_DATA.userName;
      document.getElementById('profile-email').innerText = APP_DATA.userEmail;
      document.getElementById('profile-points').innerText = data.seasonPoints;
      document.getElementById('profile-rank').innerText = \`#\${data.seasonRank}\`;
      document.getElementById('profile-alltime').innerText = \`\${data.allTimePoints} PTS / Rank #\${data.allTimeRank}\`;

      // Populate Badges
      const badgeContainer = document.getElementById('badge-container');
      badgeContainer.innerHTML = ''; // Clear
      data.badges.forEach(badge => {
        badgeContainer.innerHTML += \`
          <div class="flex flex-col items-center gap-1 shrink-0">
            <div class="flex items-center justify-center w-14 h-14 rounded-full \${badge.color} text-white shadow-md">
              <span class="material-symbols-outlined text-3xl">\${badge.icon}</span>
            </div>
            <span class="text-xs font-medium text-gray-600 dark:text-gray-300">\${badge.name}</span>
          </div>\`;
      });
      badgeContainer.innerHTML += document.getElementById('view-all-badges-template').innerHTML; // Add back the 'View All'
      // Re-add listener for the new 'View All' button
      badgeContainer.querySelector('#view-all-badges-button').addEventListener('click', () => navigateToPage('all-badges'));

      // Populate Leaderboard (season by default)
      updateLeaderboardDisplay(data.leaderboard);
    }

    function populateHistory(data) {
      document.getElementById('history-points').innerText = data.seasonPoints;
      const historyContainer = document.getElementById('history-container');
      historyContainer.innerHTML = ''; // Clear
      data.history.forEach(item => {
        let statusColor = item.status === 'Approved' ? 'text-green-600' : (item.status === 'Pending' ? 'text-gray-500' : 'text-red-600');
        historyContainer.innerHTML += \`
          <div class="flex items-center gap-4 rounded-xl bg-white dark:bg-gray-800/50 p-4 shadow-sm \${item.status !== 'Approved' ? 'opacity-60' : ''}">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
              <span class="material-symbols-outlined text-3xl \${item.color}">\${item.icon}</span>
            </div>
            <div class="flex-1">
              <p class="font-bold text-[#111318] dark:text-white">\${item.name}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">\${item.date}</p>
            </div>
            <div class="text-right">
              <p class="text-lg font-bold \${item.color}">\${item.status === 'Approved' ? '+' + item.points + ' PTS' : '+0 PTS'}</p>
              <span class="text-xs font-semibold \${statusColor}">\${item.status}</span>
            </div>
          </div>\`;
      });
    }

    function populateEventDetails(eventData) {
      if (eventData.status === 'error') {
        alert('Error: ' + eventData.message);
        navigateToPage('profile');
        return;
      }

      // Populate event name field
      document.getElementById('event-name').value = eventData.eventName;

      // Store event data for submission
      window.currentEventData = eventData;

      // Optionally show event details like location and theme
      // console.log('Event loaded:', eventData.eventName, 'Theme:', eventData.theme);
    }

    // --- FORM SUBMISSION ---
    let pendingFormData = null;
    let pendingPhotoBlob = null;

    function handleFormSubmit(e) {
      e.preventDefault();
      document.getElementById('loading-modal').classList.remove('hidden');

      const photoFile = document.getElementById('photo-input').files[0];
      if (!photoFile) {
        alert('Please select a photo!');
        document.getElementById('loading-modal').classList.add('hidden');
        return;
      }

      const formData = {
        eventId: new URLSearchParams(window.location.search).get('event'),
        theme: document.getElementById('theme-check').checked,
        notes: document.getElementById('notes').value,
        location: null
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          formData.location = {
            lat: position.coords.latitude, lon: position.coords.longitude, acc: position.coords.accuracy
          };

          const reader = new FileReader();
          reader.onload = (e) => {
            const photoBlob = e.target.result;
            pendingFormData = formData;
            pendingPhotoBlob = photoBlob;

            google.script.run
              .withSuccessHandler(handleSubmissionResponse)
              .withFailureHandler(handleFailure)
              .submitEvent(formData, photoBlob);
          };
          reader.readAsDataURL(photoFile);
        },
        (error) => {
          alert(\`Error: Location services are required. \${error.message}\`);
          document.getElementById('loading-modal').classList.add('hidden');
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }

    function handleSubmissionResponse(response) {
      document.getElementById('loading-modal').classList.add('hidden');

      if (response.status === "success") {
        alert(response.message);
        navigateToPage('profile');

      } else if (response.status === "pending_conflict") {
        document.getElementById('modal-message').innerText = response.message;
        document.getElementById('confirm-modal').classList.remove('hidden');
        // Add logic to modal-proceed to call resubmitEvent

      } else if (response.status === "error") {
        alert(response.message);
      }
    }

    function handleFailure(error) {
      document.getElementById('loading-modal').classList.add('hidden');
      alert('A critical error occurred: ' + error.message);
    }
  </script>`,
    'Modals.html': `<!-- Onboarding Modal -->
  <div id="onboarding-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 hidden">
    <div class="bg-background-light dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
      <h3 class="text-2xl font-bold text-primary dark:text-blue-300">Welcome to The Spartan Cup!</h3>
      <p class="py-4 text-gray-600 dark:text-gray-300">Earn points by supporting Orono events!</p>
      <ol class="list-decimal list-inside text-sm space-y-2 text-gray-600 dark:text-gray-300">
        <li>Tap "Check In" on your profile to attend an event.</li>
        <li>Your location will be detected automatically and you can submit your photo.</li>
        <li>Earn points, get badges, and climb the leaderboard!</li>
      </ol>
      <p class="text-xs text-secondary dark:text-red-400 bg-secondary/10 p-2 rounded mt-4">
        **Heads Up:** Cheating (fake photos, etc.) will result in disqualification.
      </p>
      <button id="onboarding-agree" class="w-full bg-primary text-white font-bold py-2 px-4 rounded-lg mt-4 active:scale-95 transition-transform">
        I Understand & Agree
      </button>
    </div>
  </div>

  <!-- Confirmation (Overwrite) Modal -->
  <div id="confirm-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
    <div class="bg-background-light dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
      <h3 class="text-lg font-bold text-[#111318] dark:text-white">Are you sure?</h3>
      <p id="modal-message" class="py-4 text-gray-700 dark:text-gray-300">This will delete your current submission for this event. Do you want to proceed?</p>
      <div class="flex justify-end space-x-2">
        <button id="modal-cancel" class="px-4 py-2 rounded bg-gray-200 text-gray-800 font-semibold">Cancel</button>
        <button id="modal-proceed" class="px-4 py-2 rounded bg-secondary text-white font-semibold">Yes, Proceed</button>
      </div>
    </div>
  </div>

  <!-- Loading Spinner Modal -->
  <div id="loading-modal" class="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center p-4 z-50 hidden">
    <div class="bg-background-light dark:bg-gray-800 p-6 rounded-lg shadow-xl flex items-center space-x-4">
      <svg class="animate-spin h-6 w-6 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="font-semibold text-gray-600 dark:text-gray-300">Submitting...</span>
    </div>
  </div>`,
    'Page.profile.html': `<div class="p-4 pt-6 @container">
    <div class="flex w-full flex-col gap-4">
      <div class="flex gap-4 items-center">
        <div id="profile-photo" class="bg-center bg-no-repeat aspect-square bg-cover rounded-full h-24 w-24 shrink-0 border-4 border-white dark:border-gray-700 shadow-md" style='background-image: url("https://lh3.googleusercontent.com/a/ACg8ocJ9...[example_url]");'></div>
        <div class="flex flex-col justify-center">
          <p id="profile-name" class="text-[#111318] dark:text-white text-[22px] font-bold leading-tight tracking-[-0.015em]">Student Name</p>
          <p id="profile-email" class="text-[#616f89] dark:text-gray-400 text-base font-normal leading-normal">student.email@domain.com</p>
        </div>
      </div>
    </div>
  </div>
  <div class="px-4 mt-2">
    <h3 class="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Earned Badges</h3>
    <div id="badge-container" class="flex items-center gap-4 overflow-x-auto pb-2 -mb-2">
      <!-- Badges populated by JavaScript -->
      <div class="text-xs text-gray-500">Loading badges...</div>
    </div>
    <!-- This template is grabbed by JS and re-added after populating badges -->
    <template id="view-all-badges-template">
      <div id="view-all-badges-button" class="flex flex-col items-center gap-1 shrink-0 cursor-pointer">
        <div class="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-gray-500 to-gray-400 text-white shadow-md">
          <span class="material-symbols-outlined text-3xl">more_horiz</span>
        </div>
        <span class="text-xs font-medium text-gray-600 dark:text-gray-300">View All</span>
      </div>
    </template>
  </div>
  <div class="flex flex-col gap-3 px-4 mt-6">
    <button id="event-history-button" class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-gray-200 dark:bg-gray-700/50 text-[#111318] dark:text-white text-base font-bold leading-normal tracking-[0.015em] w-full active:scale-95 transition-transform">
      <span class="truncate">Previously Attended Events &amp; Point Earnings</span>
    </button>
  </div>
  <div class="flex flex-col gap-2 px-4 mt-6">
    <div class="flex w-full flex-col gap-4 rounded-xl p-4 bg-white dark:bg-gray-800/50 shadow-sm">
      <p class="text-base font-bold text-primary dark:text-blue-300 leading-normal">Current Season: Winter 25-26</p>
      <div class="flex">
        <div class="flex-1">
          <p class="text-base font-medium leading-normal text-gray-500 dark:text-gray-400">Points</p>
          <p id="profile-points" class="text-primary dark:text-white tracking-[-0.02em] text-5xl font-black leading-tight">...</p>
        </div>
        <div class="border-l border-gray-200 dark:border-gray-700 mx-4"></div>
        <div class="flex-1">
          <p class="text-base font-medium leading-normal text-gray-500 dark:text-gray-400">Rank</p>
          <p id="profile-rank" class="text-secondary dark:text-red-400 tracking-[-0.02em] text-5xl font-black leading-tight">...</p>
        </div>
      </div>
      <div class="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between items-center text-sm">
        <p class="text-gray-500 dark:text-gray-400 font-medium">All Time:</p>
        <p id="profile-alltime" class="text-gray-600 dark:text-gray-300 font-bold">... PTS / Rank ...</p>
      </div>
    </div>
  </div>
  <div class="mt-4">
    <div class="px-4 pb-3">
      <style> .active-toggle { background-color: white; color: #1b3b87; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1); } .dark .active-toggle { background-color: #374151; color: white; } </style>
      <div id="leaderboard-toggle" class="bg-gray-200 dark:bg-gray-800 p-1 rounded-lg flex items-center">
        <button data-view="season" class="flex-1 py-2 px-3 text-center text-sm font-bold rounded-md active-toggle">Current Season</button>
        <button data-view="all-time" class="flex-1 py-2 px-3 text-center text-sm font-bold rounded-md text-gray-600 dark:text-gray-400">All Time</button>
      </div>
    </div>
    <h3 class="text-[#111318] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] px-4 pb-2 pt-2">Top 5 Spartans</h3>
    <div class="flex flex-col gap-2 px-4">
      <div id="leaderboard-container" class="flex flex-col gap-2 rounded-xl bg-white dark:bg-gray-800/50 p-2 shadow-sm">
        <p class="p-4 text-center text-gray-500">Loading leaderboard...</p>
      </div>
    </div>
  </div>
  <?if (isAdmin) ?>
  <div id="admin-button-container" class="px-4 mt-6">
    <!-- Admin-only button: only renders for admin users -->
    <button id="admin-button" class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-secondary/10 dark:bg-secondary/20 text-secondary dark:text-red-400 text-base font-bold leading-normal tracking-[0.015em] w-full active:scale-95 transition-transform">
      <span class="truncate">Admin Dashboard</span>
    </button>
  </div>
  <?endif?>`,
    'Page.history.html': `<div class="p-4 pt-6">
    <div class="rounded-xl bg-gradient-total-points p-6 text-white shadow-lg shadow-primary/30" style="background-image: linear-gradient(to right, #b5121b, #1b3b87)">
      <p class="text-base font-medium leading-normal opacity-80">Total Points Earned</p>
      <p id="history-points" class="mt-1 tracking-[-0.02em] text-5xl font-black leading-tight">...</p>
    </div>
  </div>
  <div id="history-container" class="flex flex-col gap-3 px-4 mt-4">
    <p class="p-4 text-center text-gray-500">Loading history...</p>
  </div>`,
    'Page.prizes.html': `<div class="p-4 pt-6">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm mb-4">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 mb-2">Prizes & Events</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">Earn points by attending events!</p>
    </div>

    <div class="bg-white dark:bg-gray-800/50 p-4 rounded-xl shadow-sm space-y-4 mb-4">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 border-b-2 border-gray-200 dark:border-gray-700 pb-2">🏆 Season Awards</h2>
      <p class="text-[#111318] dark:text-white">The top 3 fans at the end of the season win!</p>
      <ul class="list-disc list-inside space-y-1 text-[#111318] dark:text-white">
        <li><span class="font-bold">1st Place:</span> [TBD Prize]</li>
        <li><span class="font-bold">2nd Place:</span> [TBD Prize]</li>
        <li><span class="font-bold">3rd Place:</span> [TBD Prize]</li>
      </ul>
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 border-b-2 border-gray-200 dark:border-gray-700 pb-2 mt-6">🏅 Sport Superfan Awards</h2>
      <p class="text-[#111318] dark:text-white text-sm">The top fan for each individual sport or art wins a booster-sponsored prize!</p>
      <div id="sport-categories-container" class="flex flex-wrap gap-2 text-sm">
        <p class="text-gray-500">Loading categories...</p>
      </div>
    </div>

    <h2 class="text-2xl font-bold text-primary dark:text-blue-300 px-4 mb-3">Upcoming Events</h2>
    <div id="events-container" class="space-y-3 px-4">
      <p class="text-center text-gray-500 py-8">Loading events...</p>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      google.script.run.withSuccessHandler(populateEvents).getEventsList();
    });

    function populateEvents(response) {
      if (response.status === 'error') {
        document.getElementById('events-container').innerHTML = '<p class="text-center text-red-600">Error loading events</p>';
        return;
      }

      const events = response.events || [];
      const container = document.getElementById('events-container');

      if (events.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">No events scheduled.</p>';
      } else {
        container.innerHTML = '';
        events.forEach(event => {
          const card = document.createElement('div');
          card.className = 'bg-white dark:bg-gray-800/50 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700';
          card.innerHTML = \`
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1">
                <p class="font-bold text-[#111318] dark:text-white text-lg">\${event.eventName}</p>
                <p class="text-sm text-gray-600 dark:text-gray-400">\${event.sportArt}</p>
              </div>
              \${event.isSpotlightGame ? '<span class="bg-secondary/20 text-secondary dark:text-red-400 px-2 py-1 rounded text-xs font-bold">SPOTLIGHT</span>' : ''}
            </div>

            <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
              <p><span class="material-symbols-outlined text-sm align-middle mr-1">event</span>\${typeof event.date === 'string' ? event.date : new Date(event.date).toLocaleDateString()}</p>
              <p><span class="material-symbols-outlined text-sm align-middle mr-1">location_on</span>\${event.locationName || 'TBD'}</p>
              \${event.theme && event.theme !== 'None' ? '<p><span class="material-symbols-outlined text-sm align-middle mr-1">style</span>Theme: ' + event.theme + '</p>' : ''}
            </div>
          \`;
          container.appendChild(card);
        });
      }

      // Extract and display unique categories
      const categories = new Set();
      events.forEach(event => categories.add(event.sportArt));

      const categoriesContainer = document.getElementById('sport-categories-container');
      if (categories.size === 0) {
        categoriesContainer.innerHTML = '<p class="text-gray-500">No categories</p>';
      } else {
        categoriesContainer.innerHTML = '';
        categories.forEach(category => {
          const tag = document.createElement('span');
          tag.className = 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-300 font-semibold px-3 py-1 rounded-full text-sm';
          tag.innerText = category;
          categoriesContainer.appendChild(tag);
        });
      }
    }
  </script>`,
    'Page.fanfeed.html': `<div class="p-4 pt-6">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm mb-4">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 mb-2">Fan Feed</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">Check out the latest approved event photos from your classmates!</p>
    </div>

    <div id="fanfeed-container" class="space-y-3">
      <p class="text-center text-gray-500 py-8">Loading photos...</p>
    </div>
  </div>

  <script>
    let refreshInterval = null;
    const REFRESH_INTERVAL_MS = 10000; // 10 seconds

    // Helper function to start auto-refresh
    function startRefresh() {
      if (!refreshInterval) {
        refreshInterval = setInterval(loadFanFeed, REFRESH_INTERVAL_MS);
      }
    }

    // Helper function to stop auto-refresh
    function stopRefresh() {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      loadFanFeed();
      startRefresh();

      // Pause refresh when page is hidden to reduce API calls
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          stopRefresh();
        } else {
          // Resume refresh when page becomes visible
          loadFanFeed(); // Load immediately
          startRefresh();
        }
      });
    });

    function loadFanFeed() {
      const container = document.getElementById('fanfeed-container');
      container.innerHTML = '<p class="text-center text-gray-500 py-4">Loading...</p>';

      google.script.run.withSuccessHandler((response) => {
        if (response.status === 'error') {
          container.innerHTML = '<p class="text-center text-red-600">Error loading feed</p>';
          return;
        }

        const photos = response.photos || [];
        if (photos.length === 0) {
          container.innerHTML = '<p class="text-center text-gray-500 py-8">No approved photos yet. Check in at an event to get started!</p>';
          return;
        }

        container.innerHTML = '';
        photos.forEach(photo => {
          const card = document.createElement('div');
          card.className = 'bg-white dark:bg-gray-800/50 rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700';

          // Create img element directly for better security instead of innerHTML
          const img = document.createElement('img');
          img.src = photo.photoUrl;
          img.alt = 'Event photo';
          img.className = 'w-full h-64 object-cover';

          // Create content div
          const contentDiv = document.createElement('div');
          contentDiv.innerHTML = \`
            <div class="p-4">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <p class="font-bold text-[#111318] dark:text-white">\${photo.eventName}</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">\${photo.studentEmail}</p>
                </div>
              </div>

              <p class="text-xs text-gray-500 dark:text-gray-500 mb-2">
                <span class="material-symbols-outlined text-xs align-middle">schedule</span>
                \${new Date(photo.timestamp).toLocaleDateString()}
              </p>

              <div class="flex gap-2">
                <div class="flex-1 flex items-center justify-center gap-1 bg-gray-100 dark:bg-gray-700/50 rounded py-2 px-3">
                  <span class="material-symbols-outlined text-sm">favorite</span>
                  <span class="text-sm font-semibold text-gray-600 dark:text-gray-300">\${photo.likes || 0}</span>
                </div>
                <button onclick="toggleLike('\${photo.submissionId}')" class="flex-1 flex items-center justify-center gap-1 bg-primary/10 dark:bg-primary/20 rounded py-2 px-3 active:scale-95 transition-transform">
                  <span class="material-symbols-outlined text-sm">favorite_border</span>
                  <span class="text-sm font-semibold text-primary dark:text-blue-300">Like</span>
                </button>
              </div>
            </div>
          \`;

          card.appendChild(img);
          card.appendChild(contentDiv);
          container.appendChild(card);
        });
      }).getFanFeed();
    }

    function toggleLike(submissionId) {
      // This can be extended to implement actual like functionality
      // console.log('Liked submission:', submissionId);
    }
  </script>`,
    'Page.submit.html': `<div class="p-4">
    <form id="submission-form" class="space-y-4">
      <div>
        <label class="font-bold text-[#111318] dark:text-white">Event</label>
        <input type="text" id="event-name" value="Loading event..." readonly class="w-full p-3 border rounded-lg bg-gray-200 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
      </div>
      <div>
        <label class="font-bold text-[#111318] dark:text-white">Take a Photo</label>
        <input type="file" id="photo-input" accept="image/*" capture="environment" required class="w-full text-sm file:mr-4 file:py-3 file:px-5 file:rounded-lg file:border-0 file:font-bold file:bg-primary/10 file:text-primary dark:file:bg-primary/20 dark:file:text-blue-300 hover:file:bg-primary/20">
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Tip: Use your camera! Old photos may be denied.</p>
      </div>
      <div class="flex items-center">
        <input type="checkbox" id="theme-check" class="h-5 w-5 rounded text-primary focus:ring-primary">
        <label for="theme-check" class="ml-2 font-bold text-[#111318] dark:text-white">I'm dressed for the theme!</label>
      </div>
      <div>
        <label for="notes" class="font-bold text-[#111318] dark:text-white">Notes (Optional)</label>
        <textarea id="notes" rows="3" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary dark:bg-gray-800/50 dark:border-gray-700 dark:text-white" placeholder="e.g., My face is painted!"></textarea>
      </div>
      <button type="submit" class="w-full bg-secondary text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors active:scale-95">
        Submit Attendance
      </button>
    </form>
  </div>`,
    'Page.settings.html': `<div class="p-4 pt-6 pb-24">
    <div class="space-y-4">
      <!-- Display Settings -->
      <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
        <h2 class="text-xl font-bold text-[#111318] dark:text-white mb-4">Display Settings</h2>

        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
          <div class="flex-1">
            <p class="font-semibold text-[#111318] dark:text-white">Dark Mode</p>
            <p class="text-sm text-gray-600 dark:text-gray-400">Enable dark theme</p>
          </div>
          <div class="flex items-center">
            <input type="checkbox" id="dark-mode-toggle" class="h-6 w-11 rounded-full bg-gray-300 relative appearance-none cursor-pointer transition-colors" style="background-color: var(--toggle-color, #ccc);">
          </div>
        </div>
      </div>

      <!-- Notification Settings -->
      <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
        <h2 class="text-xl font-bold text-[#111318] dark:text-white mb-4">Notifications</h2>

        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
          <div class="flex-1">
            <p class="font-semibold text-[#111318] dark:text-white">Submission Approved</p>
            <p class="text-sm text-gray-600 dark:text-gray-400">Notify when admin approves</p>
          </div>
          <input type="checkbox" id="notif-approved" class="h-5 w-5 rounded text-primary cursor-pointer" checked>
        </div>

        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
          <div class="flex-1">
            <p class="font-semibold text-[#111318] dark:text-white">New Event Posted</p>
            <p class="text-sm text-gray-600 dark:text-gray-400">Notify about new events</p>
          </div>
          <input type="checkbox" id="notif-events" class="h-5 w-5 rounded text-primary cursor-pointer" checked>
        </div>

        <div class="flex items-center justify-between py-3">
          <div class="flex-1">
            <p class="font-semibold text-[#111318] dark:text-white">Badge Unlocked</p>
            <p class="text-sm text-gray-600 dark:text-gray-400">Notify when you earn badges</p>
          </div>
          <input type="checkbox" id="notif-badges" class="h-5 w-5 rounded text-primary cursor-pointer" checked>
        </div>
      </div>

      <!-- Account Info -->
      <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
        <h2 class="text-xl font-bold text-[#111318] dark:text-white mb-4">Account</h2>

        <div class="space-y-3">
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Email</p>
            <p class="font-semibold text-[#111318] dark:text-white" id="account-email">Loading...</p>
          </div>

          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Name</p>
            <p class="font-semibold text-[#111318] dark:text-white" id="account-name">Loading...</p>
          </div>

          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Account Status</p>
            <p id="account-status" class="font-semibold text-green-600">Active</p>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
        <h2 class="text-xl font-bold text-[#111318] dark:text-white mb-4">About</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400">The Spartan Cup v1.0</p>
        <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">Gamify your school spirit and earn points by supporting Orono events!</p>
      </div>

      <!-- Save Button -->
      <button id="settings-save-btn" class="w-full bg-primary text-white font-bold py-3 px-4 rounded-lg active:scale-95 transition-transform">
        Save Settings
      </button>
    </div>
  </div>

  <style>
    #dark-mode-toggle {
      width: 44px;
      height: 24px;
      padding: 2px;
    }
    #dark-mode-toggle:checked {
      background-color: #1b3b87;
    }
    #dark-mode-toggle::after {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background-color: white;
      top: 2px;
      left: 2px;
      transition: left 0.3s;
    }
    #dark-mode-toggle:checked::after {
      left: 22px;
    }
  </style>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // Load settings
      loadSettings();

      // Account info
      document.getElementById('account-email').innerText = APP_DATA.userEmail;
      document.getElementById('account-name').innerText = APP_DATA.userName;

      // Dark mode toggle
      const darkModeToggle = document.getElementById('dark-mode-toggle');
      const isDarkMode = localStorage.getItem('spartan-cup-dark-mode') === 'true' || document.documentElement.classList.contains('dark');
      darkModeToggle.checked = isDarkMode;
      updateDarkMode(isDarkMode);

      darkModeToggle.addEventListener('change', (e) => {
        updateDarkMode(e.target.checked);
      });

      // Save button
      document.getElementById('settings-save-btn').addEventListener('click', saveSettings);
    });

    function loadSettings() {
      // Load notification settings from localStorage
      document.getElementById('notif-approved').checked = localStorage.getItem('notif-approved') !== 'false';
      document.getElementById('notif-events').checked = localStorage.getItem('notif-events') !== 'false';
      document.getElementById('notif-badges').checked = localStorage.getItem('notif-badges') !== 'false';
    }

    function saveSettings() {
      // Save dark mode
      const isDarkMode = document.getElementById('dark-mode-toggle').checked;
      localStorage.setItem('spartan-cup-dark-mode', isDarkMode);
      updateDarkMode(isDarkMode);

      // Save notification settings
      localStorage.setItem('notif-approved', document.getElementById('notif-approved').checked);
      localStorage.setItem('notif-events', document.getElementById('notif-events').checked);
      localStorage.setItem('notif-badges', document.getElementById('notif-badges').checked);

      // Show confirmation
      const btn = document.getElementById('settings-save-btn');
      const originalText = btn.innerText;
      btn.innerText = '✓ Settings Saved';
      setTimeout(() => {
        btn.innerText = originalText;
      }, 2000);
    }

    function updateDarkMode(isDark) {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('spartan-cup-dark-mode', isDark);
    }
  </script>`,
    'Page.all-badges.html': `<div class="p-4 pt-6">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm mb-4">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 mb-2">All Badges</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">Earn badges by achieving milestones!</p>
    </div>

    <h3 class="text-lg font-bold text-[#111318] dark:text-white px-4 mb-3">Earned Badges</h3>
    <div id="earned-badges-grid" class="grid grid-cols-3 gap-3 px-4 mb-6">
      <p class="col-span-3 text-center text-gray-500 py-8">Loading badges...</p>
    </div>

    <h3 class="text-lg font-bold text-[#111318] dark:text-white px-4 mb-3">Locked Badges</h3>
    <div id="locked-badges-grid" class="grid grid-cols-3 gap-3 px-4">
      <p class="col-span-3 text-center text-gray-500 py-8">Loading badges...</p>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      google.script.run.withSuccessHandler(populateAllBadges).getBadgeData();
    });

    function populateAllBadges(response) {
      if (response.status === 'error') {
        document.getElementById('earned-badges-grid').innerHTML = '<p class="col-span-3 text-center text-red-600">Error loading badges</p>';
        return;
      }

      const earnedBadgeIds = response.earnedBadgeIds || [];
      const allBadges = response.allBadges || [];

      const earnedBadges = allBadges.filter(b => earnedBadgeIds.includes(b.badgeId));
      const lockedBadges = allBadges.filter(b => !earnedBadgeIds.includes(b.badgeId));

      // Populate earned badges
      const earnedGrid = document.getElementById('earned-badges-grid');
      if (earnedBadges.length === 0) {
        earnedGrid.innerHTML = '<p class="col-span-3 text-center text-gray-500 py-4">No badges earned yet. Keep going!</p>';
      } else {
        earnedGrid.innerHTML = '';
        earnedBadges.forEach(badge => {
          earnedGrid.innerHTML += createBadgeCard(badge, true);
        });
      }

      // Populate locked badges
      const lockedGrid = document.getElementById('locked-badges-grid');
      if (lockedBadges.length === 0) {
        lockedGrid.innerHTML = '<p class="col-span-3 text-center text-gray-500 py-4">You\'ve unlocked all badges!</p>';
      } else {
        lockedGrid.innerHTML = '';
        lockedBadges.forEach(badge => {
          lockedGrid.innerHTML += createBadgeCard(badge, false);
        });
      }
    }

    function createBadgeCard(badge, isEarned) {
      const bgColor = isEarned ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-gray-300 dark:bg-gray-600';
      const opacity = isEarned ? '' : 'opacity-50';
      const lockIcon = isEarned ? '' : '<span class="material-symbols-outlined text-2xl absolute top-1 right-1 text-gray-500">lock</span>';

      return \`
        <div class="flex flex-col items-center gap-2 cursor-pointer group" title="\${badge.badgeName}">
          <div class="relative w-16 h-16 rounded-full flex items-center justify-center \${bgColor} \${opacity} shadow-md">
            <span class="material-symbols-outlined text-3xl text-white">achievement</span>
            \${lockIcon}
          </div>
          <p class="text-xs font-semibold text-center text-[#111318] dark:text-white group-hover:text-primary transition">\${badge.badgeName}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 text-center max-w-[70px]">\${badge.description || ''}</p>
        </div>
      \`;
    }
  </script>`,
    'Page.admin.html': `<div class="p-4 pt-6">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm mb-4">
      <h2 class="text-2xl font-bold text-secondary dark:text-red-400 mb-2">Admin Dashboard</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">Review and approve pending student submissions.</p>
    </div>

    <div class="flex gap-2 mb-4 sticky top-16 z-10">
      <button id="admin-refresh-btn" class="flex-1 bg-primary text-white font-bold py-2 px-4 rounded-lg active:scale-95 transition-transform">
        <span class="material-symbols-outlined text-xl align-middle mr-1">refresh</span>Refresh
      </button>
    </div>

    <div id="admin-queue-container" class="space-y-3">
      <p class="text-center text-gray-500 dark:text-gray-400 py-8">Loading pending submissions...</p>
    </div>

    <!-- Submission Approval Modal -->
    <div id="approval-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
      <div class="bg-background-light dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-sm w-full max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-[#111318] dark:text-white mb-4">Approve Submission</h3>

        <div id="approval-submission-details" class="space-y-3 mb-4"></div>

        <div class="space-y-3">
          <div>
            <label class="font-bold text-[#111318] dark:text-white text-sm">Base Points</label>
            <input type="number" id="approval-base-points" value="0" min="0" class="w-full p-2 border rounded-lg bg-gray-100 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white">
          </div>

          <div>
            <label class="flex items-center gap-2">
              <input type="checkbox" id="approval-theme-bonus" class="h-4 w-4 text-primary">
              <span class="font-bold text-[#111318] dark:text-white text-sm">Theme Bonus (+25 pts)</span>
            </label>
          </div>

          <div>
            <label class="flex items-center gap-2">
              <input type="checkbox" id="approval-spotlight-multiplier" class="h-4 w-4 text-primary">
              <span class="font-bold text-[#111318] dark:text-white text-sm">Spotlight Event (2x multiplier)</span>
            </label>
          </div>

          <p id="approval-total-points" class="text-lg font-bold text-primary dark:text-blue-300 text-center py-2">Total: 50 PTS</p>
        </div>

        <div class="flex gap-2 mt-6">
          <button id="approval-cancel-btn" class="flex-1 px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold">Cancel</button>
          <button id="approval-approve-btn" class="flex-1 px-4 py-2 rounded bg-green-600 text-white font-semibold">Approve</button>
        </div>
      </div>
    </div>

    <!-- Denial Reason Modal -->
    <div id="denial-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
      <div class="bg-background-light dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-sm w-full">
        <h3 class="text-lg font-bold text-[#111318] dark:text-white mb-4">Deny Submission</h3>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Are you sure you want to deny this submission?</p>

        <textarea id="denial-reason" placeholder="Optional: Reason for denial" rows="3" class="w-full p-2 border rounded-lg bg-gray-100 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white text-sm"></textarea>

        <div class="flex gap-2 mt-6">
          <button id="denial-cancel-btn" class="flex-1 px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold">Cancel</button>
          <button id="denial-confirm-btn" class="flex-1 px-4 py-2 rounded bg-red-600 text-white font-semibold">Deny</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Store current submission being reviewed
    let currentSubmission = null;

    // Store points config globally for access in functions
    let pointsConfig = {
      'Base_Points_With_Theme': 75,
      'Base_Points_Without_Theme': 50,
      'Theme_Bonus': 25,
      'Spotlight_Game_Multiplier': 1.5,
      'Home_Game_Bonus': 10
    };

    document.addEventListener('DOMContentLoaded', () => {
      // Load points configuration
      google.script.run.getPointsConfig((config) => {
        pointsConfig = config;
        // Update default values in the form
        document.getElementById('approval-base-points').placeholder = 'e.g. ' + pointsConfig['Base_Points_Without_Theme'];
      });

      // Load admin queue on page load
      loadAdminQueue();

      // Refresh button
      document.getElementById('admin-refresh-btn').addEventListener('click', loadAdminQueue);

      // Modal close buttons
      document.getElementById('approval-cancel-btn').addEventListener('click', closeApprovalModal);
      document.getElementById('denial-cancel-btn').addEventListener('click', closeDenialModal);

      // Calculate points
      document.getElementById('approval-base-points').addEventListener('change', updateTotalPoints);
      document.getElementById('approval-theme-bonus').addEventListener('change', updateTotalPoints);
      document.getElementById('approval-spotlight-multiplier').addEventListener('change', updateTotalPoints);

      // Approve/Deny buttons
      document.getElementById('approval-approve-btn').addEventListener('click', confirmApproval);
      document.getElementById('denial-confirm-btn').addEventListener('click', confirmDenial);
    });

    function loadAdminQueue() {
      const container = document.getElementById('admin-queue-container');
      container.innerHTML = '<p class="text-center text-gray-500 py-4">Loading...</p>';

      google.script.run.withSuccessHandler((response) => {
        if (response.status === 'error') {
          container.innerHTML = '<p class="text-center text-red-600">' + response.message + '</p>';
          return;
        }

        if (!response.queue || response.queue.length === 0) {
          container.innerHTML = '<p class="text-center text-gray-500 py-8">No pending submissions to review.</p>';
          return;
        }

        container.innerHTML = '';
        response.queue.forEach(submission => {
          const card = document.createElement('div');
          card.className = 'bg-white dark:bg-gray-800/50 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700';
          card.innerHTML = \`
            <div class="flex gap-3 mb-3">
              <img src="\${submission.photoUrl}" alt="Submission" class="w-16 h-16 rounded-lg object-cover">
              <div class="flex-1">
                <p class="font-bold text-[#111318] dark:text-white truncate">\${submission.email}</p>
                <p class="text-sm text-gray-600 dark:text-gray-400">\${submission.eventName}</p>
                <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">\${new Date(submission.timestamp).toLocaleDateString()}</p>
              </div>
            </div>

            <div class="bg-gray-100 dark:bg-gray-700/50 p-2 rounded mb-3 text-sm">
              <p class="font-semibold text-[#111318] dark:text-white">\${submission.sportArt}</p>
              \${submission.dressedForTheme ? '<p class="text-xs text-primary dark:text-blue-300">✓ Dressed for theme</p>' : ''}
              \${submission.notes ? '<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">"' + submission.notes + '"</p>' : ''}
            </div>

            <div class="flex gap-2">
              <button class="flex-1 py-2 px-3 bg-green-600 text-white font-bold rounded-lg text-sm active:scale-95" onclick="openApprovalModal('\${submission.submissionId}', '\${submission.email}', '\${submission.eventName}')">
                Approve
              </button>
              <button class="flex-1 py-2 px-3 bg-red-600 text-white font-bold rounded-lg text-sm active:scale-95" onclick="openDenialModal('\${submission.submissionId}', '\${submission.eventName}')">
                Deny
              </button>
            </div>
          \`;
          container.appendChild(card);
        });
      }).getAdminQueue();
    }

    function openApprovalModal(submissionId, email, eventName) {
      currentSubmission = { submissionId, email, eventName };
      document.getElementById('approval-submission-details').innerHTML = \`
        <div class="text-sm">
          <p><span class="font-bold">Student:</span> \${email}</p>
          <p><span class="font-bold">Event:</span> \${eventName}</p>
        </div>
      \`;
      document.getElementById('approval-modal').classList.remove('hidden');
      updateTotalPoints();
    }

    function closeApprovalModal() {
      document.getElementById('approval-modal').classList.add('hidden');
      currentSubmission = null;
    }

    function updateTotalPoints() {
      const basePoints = parseInt(document.getElementById('approval-base-points').value) || 0;
      const themeBonus = document.getElementById('approval-theme-bonus').checked ? pointsConfig['Theme_Bonus'] : 0;
      const multiplier = document.getElementById('approval-spotlight-multiplier').checked ? pointsConfig['Spotlight_Game_Multiplier'] : 1;
      const total = Math.round(basePoints * multiplier + themeBonus);

      document.getElementById('approval-total-points').innerText = 'Total: ' + total + ' PTS';
    }

    function confirmApproval() {
      const basePoints = parseInt(document.getElementById('approval-base-points').value) || 0;
      const themeBonus = document.getElementById('approval-theme-bonus').checked ? pointsConfig['Theme_Bonus'] : 0;
      const multiplier = document.getElementById('approval-spotlight-multiplier').checked ? pointsConfig['Spotlight_Game_Multiplier'] : 1;

      google.script.run.withSuccessHandler((response) => {
        alert(response.message);
        closeApprovalModal();
        loadAdminQueue();
      }).approveSubmission(currentSubmission.submissionId, basePoints, themeBonus, multiplier);
    }

    function openDenialModal(submissionId, eventName) {
      currentSubmission = { submissionId, eventName };
      document.getElementById('denial-reason').value = '';
      document.getElementById('denial-modal').classList.remove('hidden');
    }

    function closeDenialModal() {
      document.getElementById('denial-modal').classList.add('hidden');
      currentSubmission = null;
    }

    function confirmDenial() {
      const reason = document.getElementById('denial-reason').value;
      google.script.run.withSuccessHandler((response) => {
        alert(response.message);
        closeDenialModal();
        loadAdminQueue();
      }).denySubmission(currentSubmission.submissionId, reason);
    }
  </script>`
  };

  Object.keys(files).forEach(filename => {
    // Check if file already exists
    const existingFiles = DriveApp.getFilesByName(filename);
    let found = false;
    while (existingFiles.hasNext()) {
      const file = existingFiles.next();
      if (file.getOwner().getEmail() === Session.getEffectiveUser().getEmail()) {
        found = true;
        break;
      }
    }

    // If not found, create it
    if (!found) {
      try {
        // Logger.log('Creating file: ' + filename);
        const blob = Utilities.newBlob(files[filename], 'text/html', filename);
        DriveApp.getRootFolder().createFile(blob);
      } catch (e) {
        // Logger.log(`Failed to create file ${filename}: ${e.message}`);
        // This can fail if it's not in the root folder, but it's the only way
        // to programmatically add files to an Apps Script project.
        // The user may need to create them manually if this fails.
      }
    } else {
      // Logger.log('File already exists: ' + filename);
    }
  });

  // After trying to create, we can't be 100% sure they were added to the project
  // So we provide instructions.
  SpreadsheetApp.getUi().alert('HTML File Creation Attempted', 'The script tried to create all .html files. If they do not appear in the editor on the left, please reload this page. If they are still missing, you may need to create them manually and copy the content from the "Code.gs" file.', SpreadsheetApp.getUi().ButtonSet.OK);
}
