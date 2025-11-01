# Spartan Cup: Firebase + Sheets/Drive Migration Plan

**Status:** Planning & Preparation
**Last Updated:** November 1, 2025
**Author:** Claude Code Analysis
**Version:** 1.0 (Refined for iOS Safari Geolocation Fix)

---

## Executive Summary

Spartan Cup is migrating from Google Apps Script to **Firebase Hosting + Cloud Functions** with Google Sheets/Drive as the persistent backend. The **primary objective** is solving the iOS Safari geolocation blocking issue, which prevents iOS users from attending events.

### The Problem
iOS Safari blocks geolocation requests in sandboxed iframes (which is what Google Apps Script web apps run in). Users on iOS must currently use Chrome Mobile instead of Safari, creating friction and limiting adoption.

### The Solution
By hosting the frontend on Firebase Hosting (not in an iframe), iOS Safari will allow geolocation permissions naturally, eliminating the friction.

### Why Firebase + Sheets/Drive (Not Pure Firebase)?
- ✅ iOS geolocation problem solved
- ✅ All data stays in Google Workspace (secure, compliant, editable)
- ✅ Reduced development effort (~35 hours vs ~60+ hours for pure migration)
- ✅ Familiar data layer (no schema changes needed)
- ✅ Free-tier compatible (Spark plan covers your 10-200 user scale)
- ✅ You keep direct Sheets editing as super admin

### Key Metrics

| Metric | Value |
|--------|-------|
| **Primary Blocker** | iOS Safari geolocation in iframe |
| **Expected Scale** | 10-200 concurrent users (peak ~500) |
| **API Quota Risk** | Low (well under free tier limits) |
| **Infrastructure Cost** | $0/month (Spark plan) |
| **Total Development Effort** | 30-35 hours |
| **Timeline** | 3-6 weeks part-time, 2 weeks full-time |
| **Downtime Required** | ~10 minutes (acceptable for your scale) |
| **Breaking Changes** | None (user experience identical) |

---

## Why iOS Safari Matters

**Current Situation:**
- Android Chrome users: ✅ Works perfectly
- iOS Safari users: ❌ "Location is disabled" error (cannot be fixed in GAS)
- iOS Chrome users: ✅ Works, but requires users to switch browsers

**Root Cause:** iOS Safari considers iframes as a security boundary and blocks geolocation permission prompts in sandboxed environments. Google Apps Script runs in a sandboxed iframe, so iOS Safari never prompts for location permission.

**After Migration:**
- iOS Safari: ✅ Works perfectly (direct hosting, not in iframe)
- All other browsers: ✅ Continue working as before
- User experience: Seamless location-based attendance verification

---

## Architecture Overview

### Current Architecture (Google Apps Script)
```
┌─────────────────────────┐
│   iOS Safari Client     │
│   (Location blocked)    │
└────────────┬────────────┘
             │
             │ google.script.run
             │ (sandboxed iframe)
             ▼
┌─────────────────────────────┐
│   GAS Web App (Iframe)      │
│   (iOS Safari blocks here)  │
└────────────┬────────────────┘
             │
      ┌──────┴────────┐
      │               │
      ▼               ▼
  Sheets API     Drive API
      │               │
      ▼               ▼
   Sheets         Drive
```

### New Architecture (Firebase + Sheets/Drive)
```
┌──────────────────────────┐
│   iOS Safari Client      │
│   (Location enabled!)    │
└────────────┬─────────────┘
             │
             │ fetch()
             │ (direct URL, not iframe)
             ▼
┌──────────────────────────┐
│  Firebase Hosting        │
│  (Static Frontend SPA)   │
└────────────┬─────────────┘
             │
             │ Firebase SDK
             │ callable functions
             ▼
┌──────────────────────────────┐
│  Cloud Functions (Node.js)   │
│  (Your 41 backend functions) │
└────────────┬─────────────────┘
             │
      ┌──────┴────────┐
      │               │
      ▼               ▼
Sheets API      Drive API
(via service    (via service
 account)        account)
      │               │
      ▼               ▼
   Sheets         Drive
```

### Data Flow
```
1. User clicks "Check In"
   ↓
2. Browser requests geolocation
   ↓ (iOS Safari now ALLOWS this!)
3. User grants permission
   ↓
4. Frontend calls: firebase.functions().httpsCallable('submitEvent')({eventId, location})
   ↓
5. Cloud Function receives call
   ↓
6. Function validates location (geofence check)
   ↓
7. Function saves to Sheets: Submissions_Pending tab
   ↓
8. Function saves photo to Drive
   ↓
9. Frontend shows "Submission received"
   ↓
10. Super admin reviews in Sheets, approves/denies
```

---

## Phase Breakdown

### Phase 0: Audit & Planning (3 hours)
**Status:** NOT STARTED
**Duration:** 1 week (async work)
**Owner:** [TO BE ASSIGNED]

#### Task 0.1: Code Inventory & Function Audit (1 hour)
**Objective:** Create a comprehensive list of all 41 functions with dependencies and complexity

- [ ] Read Code.js in full
- [ ] List all 41 functions with:
  - Function name
  - Purpose/description
  - Parameters
  - Return type
  - Dependencies (which other functions it calls)
  - Complexity level (simple/medium/complex)
  - Sheets tabs used
  - Drive operations
- [ ] Note any time-based triggers or onEdit/onOpen handlers
- [ ] Document error handling patterns

**Deliverable:** `FUNCTION_AUDIT.md` with complete function inventory

**Success Criteria:**
- All 41 functions listed
- Dependencies mapped
- Complexity assessed
- No functions missed

---

#### Task 0.2: Spreadsheet Formula Audit (0.5 hours)
**Objective:** Identify spreadsheet formulas that contain business logic

**Current Knowledge:** Student display name creation uses formulas

- [ ] Check Student_Profiles tab for formulas
- [ ] Check Event_Schedule tab for formulas
- [ ] Check Config_Badges tab for formulas
- [ ] Check all other tabs for formulas
- [ ] Document each formula's purpose
- [ ] Plan conversion to Node.js logic

**Deliverable:** List of all formulas and their logic

**Success Criteria:**
- All formulas identified
- Logic understood
- Conversion plan documented

---

#### Task 0.3: Data Schema Documentation (0.5 hours)
**Objective:** Document exact Sheets structure for reference during conversion

- [ ] Document each Sheets tab:
  - Tab name
  - All column names
  - Data types
  - Which functions read it
  - Which functions write it
- [ ] Document Drive folder structure
- [ ] Document file naming conventions

**Deliverable:** `DATA_SCHEMA.md`

**Success Criteria:**
- All tabs documented
- All columns listed with types
- All drive operations documented

---

#### Task 0.4: Create GCP/Firebase Projects (1 hour)
**Objective:** Set up infrastructure

**Steps:**
1. Create new Google Cloud Project (or use existing)
2. Link Firebase to GCP project
3. Create service account with Sheets/Drive access
4. Download service account key (secure location!)
5. Enable required APIs:
   - Google Sheets API
   - Google Drive API
6. Create Firebase project (console.firebase.google.com)
7. Enable Hosting and Cloud Functions
8. Note Project ID for .env configuration

**Deliverable:** Service account JSON key, Firebase Project ID

**Success Criteria:**
- GCP project created
- Firebase project created
- Service account created and key downloaded
- All APIs enabled
- Can list Sheets via API (test)

---

### Phase 1: Local Development Setup (2-3 hours)
**Status:** NOT STARTED
**Duration:** 1-2 days
**Owner:** [TO BE ASSIGNED]

#### Task 1.1: Install Firebase CLI & Initialize Project (0.5 hours)

```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login to your Google account
firebase login

# Create new directory for Firebase project
mkdir spartan-cup-firebase
cd spartan-cup-firebase

# Initialize Firebase project
firebase init

# Select these options:
# - Hosting ✓
# - Functions ✓
# - JavaScript ✓
# - ESLint? No (optional)
# - Overwrite? No (when asked about existing files)
```

**Deliverable:** Firebase project initialized locally

**Success Criteria:**
- firebase.json created
- .firebaserc created
- functions/ directory created

---

#### Task 1.2: Install Dependencies (0.5 hours)

```bash
cd functions

# Install required npm packages
npm install googleapis google-auth-library firebase-admin firebase-functions

# Optional but helpful
npm install dotenv --save-dev
```

**Deliverable:** All dependencies installed

**Success Criteria:**
- node_modules/ populated
- package.json updated with dependencies
- No installation errors

---

#### Task 1.3: Configure Service Account (0.5 hours)

**Steps:**
1. Place service account JSON key in `functions/` directory
   - Name it `service-account-key.json`
2. Create `functions/.env` file:
   ```
   SPREADSHEET_ID=your_spreadsheet_id_here
   FIREBASE_PROJECT_ID=your_firebase_project_id
   SERVICE_ACCOUNT_KEY_PATH=./service-account-key.json
   ```
3. Create `functions/.env.example`:
   ```
   SPREADSHEET_ID=
   FIREBASE_PROJECT_ID=
   SERVICE_ACCOUNT_KEY_PATH=
   ```
4. Create `functions/.gitignore`:
   ```
   node_modules/
   service-account-key.json
   .env
   .runtimeconfig.json
   ```

**Deliverable:** Environment variables configured

**Success Criteria:**
- .env file created with correct values
- service-account-key.json in place
- .gitignore prevents credential leakage
- .env.example created for team

---

#### Task 1.4: Share Sheets & Drive with Service Account (0.5 hours)

**Steps:**
1. In GCP console, find service account email: `spartan-cup-functions@[PROJECT_ID].iam.gserviceaccount.com`
2. Open your Spartan Cup Sheets
3. Click Share, add service account email as **Editor**
4. Open your Spartan Cup Drive folder
5. Right-click → Share, add service account email as **Editor**
6. Confirm sharing is complete

**Note:** Sharing can take a few minutes to propagate

**Deliverable:** Service account has Editor access to Sheets and Drive

**Success Criteria:**
- Service account email added to Sheets
- Service account email added to Drive
- Can read from Sheets (test below)
- Can write to Drive (test below)

---

#### Task 1.5: Create Directory Structure (0.5 hours)

Create this folder structure:

```
functions/
├── config.js              # Firebase & API initialization
├── index.js               # Cloud Functions entry point
├── controllers/
│   ├── profile.js         # Profile, badges, leaderboard
│   ├── submissions.js     # Event submissions, resubmissions
│   ├── admin.js           # Admin queue, approvals, denials
│   └── events.js          # Event details, lists
├── utils/
│   ├── sheets.js          # Sheets API wrapper functions
│   ├── drive.js           # Drive API wrapper functions
│   ├── auth.js            # Authentication checks
│   ├── validation.js      # Data validation
│   └── formulas.js        # Ported spreadsheet formulas
├── tests/
│   ├── utils.test.js      # Utility function tests
│   └── functions.test.js  # Cloud function tests
├── .env                   # Environment variables (gitignored)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

**Deliverable:** Directory structure created

**Success Criteria:**
- All directories created
- All files created (empty for now)
- Structure matches above

---

#### Task 1.6: Test Service Account Access (0.5 hours)

Create `functions/test-access.js`:

```javascript
const {google} = require('googleapis');
const fs = require('fs');
require('dotenv').config();

async function testAccess() {
  try {
    // Load service account key
    const serviceAccountKey = JSON.parse(
      fs.readFileSync('./service-account-key.json', 'utf8')
    );

    // Create sheets client
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets',
               'https://www.googleapis.com/auth/drive']
    });

    const sheets = google.sheets({version: 'v4', auth});

    // Try to read a cell from your Sheets
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Student_Profiles!A1:A5'
    });

    console.log('✅ Successfully accessed Sheets!');
    console.log('First few rows:', response.data.values);
  } catch (error) {
    console.error('❌ Error accessing Sheets:', error.message);
  }
}

testAccess();
```

Run it:
```bash
node test-access.js
```

**Expected Output:**
```
✅ Successfully accessed Sheets!
First few rows: [['User ID'], ['john@school.edu'], ...]
```

**Success Criteria:**
- No authentication errors
- Can read data from Sheets
- Service account permissions working

---

### Phase 2: Helper Utilities & API Wrappers (3-4 hours)
**Status:** NOT STARTED
**Duration:** 2-3 days
**Owner:** [TO BE ASSIGNED]

These utilities will be used by all controller functions in Phase 3. Build and test each before moving forward.

---

#### Task 2.1: Create config.js (0.5 hours)

**File:** `functions/config.js`

```javascript
const {google} = require('googleapis');
const fs = require('fs');
require('dotenv').config();

// Load service account key
const serviceAccountKey = JSON.parse(
  fs.readFileSync('./service-account-key.json', 'utf8')
);

// Create authenticated client
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountKey,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
  ]
});

// Export configured clients
module.exports = {
  auth,
  sheets: google.sheets({version: 'v4', auth}),
  drive: google.drive({version: 'v3', auth}),
  spreadsheetId: process.env.SPREADSHEET_ID
};
```

**Success Criteria:**
- config.js loads without errors
- auth client created
- sheets and drive clients available

---

#### Task 2.2: Create sheets.js Utility Wrapper (1 hour)

**File:** `functions/utils/sheets.js`

```javascript
const {sheets, spreadsheetId} = require('../config');

/**
 * Get all data from a specific sheet tab
 * @param {string} tabName - Sheet tab name (e.g., 'Student_Profiles')
 * @returns {Promise<Array>} Array of rows
 */
async function getSheetData(tabName) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:Z` // Adjust range as needed
    });
    return response.data.values || [];
  } catch (error) {
    console.error(`Error reading ${tabName}:`, error.message);
    throw error;
  }
}

/**
 * Append a row to a sheet
 * @param {string} tabName - Sheet tab name
 * @param {Array} row - Data to append
 * @returns {Promise}
 */
async function appendToSheet(tabName, row) {
  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row]
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error appending to ${tabName}:`, error.message);
    throw error;
  }
}

/**
 * Update a specific cell range
 * @param {string} range - A1 notation (e.g., 'Sheet!A1:B2')
 * @param {Array<Array>} values - 2D array of values
 * @returns {Promise}
 */
async function updateSheet(range, values) {
  try {
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {values}
    });
    return response.data;
  } catch (error) {
    console.error(`Error updating ${range}:`, error.message);
    throw error;
  }
}

/**
 * Find a row in a sheet by column value
 * @param {string} tabName - Sheet tab name
 * @param {number} columnIndex - 0-based column index
 * @param {string} searchValue - Value to find
 * @returns {Promise<Object>} Row object with index and data
 */
async function findInSheet(tabName, columnIndex, searchValue) {
  try {
    const data = await getSheetData(tabName);
    for (let i = 0; i < data.length; i++) {
      if (data[i][columnIndex] === searchValue) {
        return {index: i, data: data[i]};
      }
    }
    return null;
  } catch (error) {
    console.error(`Error finding ${searchValue} in ${tabName}:`, error.message);
    throw error;
  }
}

/**
 * Get the column index by header name
 * @param {string} tabName - Sheet tab name
 * @param {string} columnName - Header name to find
 * @returns {Promise<number>} 0-based column index
 */
async function getColumnIndex(tabName, columnName) {
  try {
    const data = await getSheetData(tabName);
    if (data.length === 0) throw new Error(`Sheet ${tabName} is empty`);

    const headers = data[0];
    const index = headers.indexOf(columnName);
    if (index === -1) throw new Error(`Column "${columnName}" not found in ${tabName}`);

    return index;
  } catch (error) {
    console.error(`Error getting column index:`, error.message);
    throw error;
  }
}

module.exports = {
  getSheetData,
  appendToSheet,
  updateSheet,
  findInSheet,
  getColumnIndex
};
```

**Success Criteria:**
- All functions export correctly
- No syntax errors
- Functions can be imported and called

---

#### Task 2.3: Create drive.js Utility Wrapper (0.5 hours)

**File:** `functions/utils/drive.js`

```javascript
const {drive, auth} = require('../config');

/**
 * Upload a file to Google Drive
 * @param {string} fileName - Name for the file
 * @param {Buffer} fileData - File content (base64 or buffer)
 * @param {string} folderName - Target folder name (will search for it)
 * @returns {Promise<string>} File ID of uploaded file
 */
async function uploadFile(fileName, fileData, folderName) {
  try {
    // Find folder by name
    const folderSearch = await drive.files.list({
      auth,
      q: `name="${folderName}" and mimeType="application/vnd.google-apps.folder" and trashed=false`,
      spaces: 'drive',
      pageSize: 1
    });

    if (folderSearch.data.files.length === 0) {
      throw new Error(`Folder "${folderName}" not found`);
    }

    const folderId = folderSearch.data.files[0].id;

    // Upload file to folder
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const response = await drive.files.create({
      auth,
      resource: fileMetadata,
      media: {
        mimeType: 'image/jpeg',
        body: fileData
      }
    });

    return response.data.id;
  } catch (error) {
    console.error(`Error uploading file:`, error.message);
    throw error;
  }
}

/**
 * Delete a file from Drive
 * @param {string} fileId - File ID to delete
 * @returns {Promise}
 */
async function deleteFile(fileId) {
  try {
    await drive.files.delete({
      auth,
      fileId
    });
  } catch (error) {
    console.error(`Error deleting file:`, error.message);
    throw error;
  }
}

/**
 * Get file download URL
 * @param {string} fileId - File ID
 * @returns {string} Download URL
 */
function getFileUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

module.exports = {
  uploadFile,
  deleteFile,
  getFileUrl
};
```

**Success Criteria:**
- All functions export
- No syntax errors

---

#### Task 2.4: Create auth.js Utility (0.5 hours)

**File:** `functions/utils/auth.js`

```javascript
const {getSheetData, getColumnIndex} = require('./sheets');

/**
 * Get list of admin emails from Config_Admins tab
 * @returns {Promise<Array<string>>} Array of admin emails
 */
async function getAdminEmails() {
  try {
    const data = await getSheetData('Config_Admins');
    // Assuming first column is email
    return data.slice(1).map(row => row[0]).filter(email => email);
  } catch (error) {
    console.error('Error getting admin emails:', error.message);
    throw error;
  }
}

/**
 * Check if an email is an admin
 * @param {string} email - Email to check
 * @returns {Promise<boolean>}
 */
async function isAdmin(email) {
  try {
    const admins = await getAdminEmails();
    return admins.includes(email);
  } catch (error) {
    console.error('Error checking admin status:', error.message);
    throw error;
  }
}

/**
 * Get current user email from Firebase context
 * @param {Object} context - Firebase context from callable function
 * @returns {string} User email or null
 */
function getCurrentUserEmail(context) {
  if (!context.auth) {
    throw new Error('User not authenticated');
  }
  return context.auth.token.email;
}

module.exports = {
  getAdminEmails,
  isAdmin,
  getCurrentUserEmail
};
```

**Success Criteria:**
- Functions export
- Admin email list can be read

---

#### Task 2.5: Create validation.js Utility (0.5 hours)

**File:** `functions/utils/validation.js`

```javascript
/**
 * Validate photo file
 * @param {Buffer|string} photoData - Photo data (base64 or buffer)
 * @returns {boolean} True if valid
 */
function validatePhotoData(photoData) {
  // Check if it's valid base64 or buffer
  if (!photoData) return false;
  if (typeof photoData === 'string') {
    // Check if valid base64
    return /^[A-Za-z0-9+/=]+$/.test(photoData);
  }
  return Buffer.isBuffer(photoData);
}

/**
 * Validate geolocation coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if valid
 */
function validateCoordinates(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' &&
         lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Check if coordinates are within geofence
 * @param {number} userLat - User latitude
 * @param {number} userLon - User longitude
 * @param {number} eventLat - Event latitude
 * @param {number} eventLon - Event longitude
 * @param {number} radiusMeters - Geofence radius in meters
 * @returns {boolean}
 */
function isWithinGeofence(userLat, userLon, eventLat, eventLon, radiusMeters) {
  // Haversine formula for distance
  const R = 6371000; // Earth radius in meters
  const φ1 = userLat * Math.PI / 180;
  const φ2 = eventLat * Math.PI / 180;
  const Δφ = (eventLat - userLat) * Math.PI / 180;
  const Δλ = (eventLon - userLon) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance <= radiusMeters;
}

module.exports = {
  validatePhotoData,
  validateCoordinates,
  isWithinGeofence
};
```

**Success Criteria:**
- All validation functions work
- Can test with sample data

---

#### Task 2.6: Create formulas.js (Port Spreadsheet Formulas) (0.5 hours)

**File:** `functions/utils/formulas.js`

Based on Task 0.2 audit, port spreadsheet formulas here. For example:

```javascript
/**
 * Create student display name (replaces spreadsheet formula)
 * Based on spreadsheet: =CONCATENATE(FirstName," ",LastName)
 * @param {string} firstName
 * @param {string} lastName
 * @returns {string}
 */
function createDisplayName(firstName, lastName) {
  if (!firstName || !lastName) return '';
  return `${firstName} ${lastName}`;
}

// Add all other formulas here as Node.js functions

module.exports = {
  createDisplayName
  // Export other formula functions
};
```

**Success Criteria:**
- All formulas from audit ported to Node.js
- Functions tested against original spreadsheet results
- Output matches exactly

---

#### Task 2.7: Test All Utilities (0.5 hours)

Create `functions/test-utils.js`:

```javascript
const sheets = require('./utils/sheets');
const drive = require('./utils/drive');
const auth = require('./utils/auth');
const validation = require('./utils/validation');
const formulas = require('./utils/formulas');

async function testAll() {
  console.log('Testing utilities...\n');

  try {
    // Test Sheets
    console.log('Testing sheets utility...');
    const data = await sheets.getSheetData('Student_Profiles');
    console.log(`✅ Read ${data.length} rows from Student_Profiles`);

    // Test Auth
    console.log('\nTesting auth utility...');
    const admins = await auth.getAdminEmails();
    console.log(`✅ Found ${admins.length} admins`);

    // Test Validation
    console.log('\nTesting validation utility...');
    const coordsValid = validation.validateCoordinates(44.8, -93.3);
    console.log(`✅ Coordinates validation: ${coordsValid}`);

    // Test Formulas
    console.log('\nTesting formulas utility...');
    const displayName = formulas.createDisplayName('John', 'Doe');
    console.log(`✅ Display name: ${displayName}`);

    console.log('\n✅ All utilities working!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAll();
```

Run with:
```bash
node test-utils.js
```

**Success Criteria:**
- All utilities test successfully
- No errors in logs
- Can proceed to Phase 3

---

### Phase 3: Backend Function Conversion (15-18 hours)
**Status:** NOT STARTED
**Duration:** 1-2 weeks
**Owner:** [TO BE ASSIGNED]

This phase converts your 41 GAS functions to Node.js Cloud Functions. Break this into tiers by complexity.

**Important:** Refer to the `FUNCTION_AUDIT.md` created in Phase 0 for dependency mapping.

---

#### Tier 1: Simple Read Functions (3-4 hours)

These functions only read from Sheets, no writes or complex logic.

##### Task 3.1: Convert `getProfileData()` (1 hour)

**Location:** `functions/controllers/profile.js`

```javascript
const functions = require('firebase-functions');
const {getSheetData, findInSheet, getColumnIndex} = require('../utils/sheets');
const {getCurrentUserEmail, isAdmin} = require('../utils/auth');
const {createDisplayName} = require('../utils/formulas');

/**
 * Get student profile data
 */
exports.getProfileData = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    const userEmail = getCurrentUserEmail(context);

    // Get student record from Sheets
    const studentData = await findInSheet('Student_Profiles', 0, userEmail);
    if (!studentData) {
      throw new Error('Student profile not found');
    }

    // Extract columns (adjust indices based on your Sheets structure)
    const row = studentData.data;
    const profile = {
      email: row[0],
      firstName: row[1],
      lastName: row[2],
      displayName: createDisplayName(row[1], row[2]),
      points: parseInt(row[3]) || 0,
      grade: row[4],
      badges: row[5] ? row[5].split(',') : [],
      photoUrl: row[6] || null,
      joinDate: row[7]
    };

    return profile;
  } catch (error) {
    console.error('Error in getProfileData:', error.message);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
```

**Unit Test:** `functions/tests/profile.test.js` (excerpt)

```javascript
// Mock data for testing
const mockProfileData = [
  ['john@school.edu', 'John', 'Doe', '250', '10', 'Badge1,Badge2', null, '2024-09-01']
];

test('getProfileData returns correct profile', async () => {
  // This would use Firebase emulator or Jest mocks
  // Just verify the function doesn't crash
  expect(profile.displayName).toBe('John Doe');
  expect(profile.points).toBe(250);
});
```

**Success Criteria:**
- Function converts without errors
- Handles missing student profile gracefully
- Returns correct data structure
- Unit test passes

---

##### Task 3.2: Convert `getEventList()` (0.5 hours)

**Location:** `functions/controllers/events.js`

```javascript
const functions = require('firebase-functions');
const {getSheetData} = require('../utils/sheets');

/**
 * Get list of active events
 */
exports.getEventList = functions.https.onCall(async (data, context) => {
  try {
    const events = await getSheetData('Event_Schedule');
    // Skip header row and filter by status
    return events.slice(1).map(row => ({
      eventId: row[0],
      name: row[1],
      date: row[2],
      location: row[3],
      latitude: parseFloat(row[4]),
      longitude: parseFloat(row[5]),
      geofenceRadius: parseFloat(row[6]) || 100,
      status: row[7],
      qrCode: row[8]
    })).filter(event => event.status === 'ACTIVE');
  } catch (error) {
    console.error('Error in getEventList:', error.message);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
```

**Success Criteria:**
- Returns list of active events
- Correctly parses coordinates
- Handles empty event list

---

##### Task 3.3 & 3.4: Other Simple Read Functions (1 hour)

Convert remaining simple read functions:
- `getBadgeData()`
- `getAdminEmails()`
- `getUserDisplayName()`

(Follow same pattern as above)

---

#### Tier 2: Complex Read Functions (3-4 hours)

These read from multiple tabs and perform calculations.

##### Task 3.5: Convert `getAdminQueue()` (1 hour)

**Location:** `functions/controllers/admin.js`

```javascript
const functions = require('firebase-functions');
const {getSheetData, getColumnIndex} = require('../utils/sheets');
const {isAdmin, getCurrentUserEmail} = require('../utils/auth');

/**
 * Get pending submissions for admin review
 */
exports.getAdminQueue = functions.https.onCall(async (data, context) => {
  try {
    // Check if user is admin
    const userEmail = getCurrentUserEmail(context);
    const adminStatus = await isAdmin(userEmail);
    if (!adminStatus) {
      throw new Error('User is not an admin');
    }

    // Get pending submissions
    const pending = await getSheetData('Submissions_Pending');

    return pending.slice(1).map(row => ({
      submissionId: row[0],
      studentEmail: row[1],
      eventId: row[2],
      photoUrl: row[3],
      timestamp: row[4],
      location: row[5],
      status: row[6]
    }));
  } catch (error) {
    console.error('Error in getAdminQueue:', error.message);
    throw new functions.https.HttpsError('permission-denied', error.message);
  }
});
```

**Success Criteria:**
- Verifies admin status
- Returns only pending submissions
- Rejects non-admins

---

##### Task 3.6 & 3.7: Other Complex Read Functions (2 hours)

Convert:
- `getFanFeed()`
- `getEventsList()`
- `getLeaderboard()`

(Follow same pattern)

---

#### Tier 3: Write Functions (3-4 hours)

These create or modify data.

##### Task 3.8: Convert `submitEvent()` (2 hours)

**Location:** `functions/controllers/submissions.js`

```javascript
const functions = require('firebase-functions');
const {appendToSheet, findInSheet} = require('../utils/sheets');
const {uploadFile} = require('../utils/drive');
const {getCurrentUserEmail} = require('../utils/auth');
const {validatePhotoData, validateCoordinates, isWithinGeofence} = require('../utils/validation');

/**
 * Submit event attendance with photo
 */
exports.submitEvent = functions.https.onCall(async (data, context) => {
  try {
    // Validate input
    if (!data.eventId || !data.photoData || !data.latitude || !data.longitude) {
      throw new Error('Missing required fields');
    }

    // Verify authentication
    const userEmail = getCurrentUserEmail(context);

    // Validate photo
    if (!validatePhotoData(data.photoData)) {
      throw new Error('Invalid photo data');
    }

    // Validate coordinates
    if (!validateCoordinates(data.latitude, data.longitude)) {
      throw new Error('Invalid coordinates');
    }

    // Get event details to check geofence
    const eventData = await findInSheet('Event_Schedule', 0, data.eventId);
    if (!eventData) {
      throw new Error('Event not found');
    }

    const event = eventData.data;
    const eventLat = parseFloat(event[4]);
    const eventLon = parseFloat(event[5]);
    const geofenceRadius = parseFloat(event[6]) || 100;

    // Check geofence
    if (!isWithinGeofence(data.latitude, data.longitude, eventLat, eventLon, geofenceRadius)) {
      throw new Error('Location is outside geofence. Are you at the event?');
    }

    // Upload photo to Drive
    const buffer = Buffer.from(data.photoData, 'base64');
    const fileName = `submission_${userEmail}_${Date.now()}.jpg`;
    const photoUrl = await uploadFile(fileName, buffer, 'Spartan_Cup_Submissions');

    // Create submission record
    const timestamp = new Date().toISOString();
    const submissionRow = [
      `${Date.now()}`, // Submission ID
      userEmail,
      data.eventId,
      photoUrl,
      timestamp,
      `${data.latitude},${data.longitude}`,
      'PENDING'
    ];

    // Append to Submissions_Pending
    await appendToSheet('Submissions_Pending', submissionRow);

    return {
      success: true,
      message: 'Submission received! An admin will review shortly.',
      submissionId: submissionRow[0]
    };
  } catch (error) {
    console.error('Error in submitEvent:', error.message);
    throw new functions.https.HttpsError('failed-precondition', error.message);
  }
});
```

**Success Criteria:**
- Validates all inputs
- Checks geofence before accepting
- Uploads photo successfully
- Creates pending submission
- Returns submission ID

---

##### Task 3.9 & 3.10: Other Write Functions (2 hours)

Convert:
- `approveSubmission()` - Updates points, moves to Verified tab, triggers badge calculation
- `denySubmission()` - Rejects, moves to archive
- `saveUserSettings()`
- `updateEvent()` (for admin)

(Follow same pattern)

---

#### Tier 4: Calculation Functions (2-3 hours)

Complex logic for points, badges, streaks.

##### Task 3.11: Convert `calculateBadges()` (1 hour)

Port the badge calculation logic from Code.js to Node.js:

```javascript
const functions = require('firebase-functions');
const {getSheetData, updateSheet, findInSheet} = require('../utils/sheets');

/**
 * Calculate earned badges for a student
 */
exports.calculateBadges = functions.https.onCall(async (data, context) => {
  try {
    const {studentEmail} = data;

    // Get student record
    const student = await findInSheet('Student_Profiles', 0, studentEmail);
    if (!student) throw new Error('Student not found');

    // Get badge definitions
    const badgeConfig = await getSheetData('Config_Badges');

    // Get student's submissions
    const verified = await getSheetData('Submissions_Verified');
    const studentSubmissions = verified.slice(1).filter(row => row[1] === studentEmail);

    // Calculate points from submissions
    let totalPoints = 0;
    studentSubmissions.forEach(row => {
      totalPoints += parseInt(row[5]) || 0; // Assuming column 5 is points
    });

    // Determine which badges are earned based on point thresholds
    const earnedBadges = badgeConfig.slice(1)
      .filter(badge => totalPoints >= parseInt(badge[2])) // badge[2] is point threshold
      .map(badge => badge[0]); // badge[0] is badge ID

    // Update student record with badges
    const studentRow = student.index + 2; // +2 because of 1-based row numbers and header
    await updateSheet(`Student_Profiles!F${studentRow}`, [[earnedBadges.join(',')]]);

    return {
      badges: earnedBadges,
      totalPoints
    };
  } catch (error) {
    console.error('Error in calculateBadges:', error.message);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
```

**Success Criteria:**
- Reads badge thresholds
- Calculates earned badges correctly
- Updates Sheets with new badges

---

##### Task 3.12 & 3.13: Other Calculation Functions (1-2 hours)

Convert:
- `calculateStreakBonus()`
- `calculateComplexBonuses()`
- Any other point/streak logic

---

#### Tier 5: Remaining Helper Functions (1-2 hours)

Convert any remaining functions not covered above:
- Event code generation
- Notification functions (email/in-app)
- Image serving (use Drive file URLs)
- Settings management

---

#### Task 3.14: Quality Assurance (2-3 hours)

Once all functions converted:

- [ ] Review all 41 functions are converted
- [ ] Check error handling on all functions
- [ ] Verify all dependencies met
- [ ] Test functions locally with `firebase emulators:start`
- [ ] Create unit tests for each function (at least success path)
- [ ] Integration tests for multi-function workflows
- [ ] Compare output with GAS version side-by-side

**Success Criteria:**
- All 41 functions converted
- All functions have error handling
- All unit tests pass
- Integration tests pass
- Output matches GAS behavior

---

### Phase 4: Frontend Migration (3-4 hours)
**Status:** NOT STARTED
**Duration:** 2-3 days
**Owner:** [TO BE ASSIGNED]

Convert all `google.script.run` calls to Firebase callable functions.

#### Task 4.1: Set Up Firebase SDK in Index.html (0.5 hours)

Add to the `<head>` section of Index.html:

```html
<!-- Firebase SDK -->
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-functions-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js"></script>

<script>
  // Initialize Firebase with your project config
  // Get this from Firebase Console → Project Settings
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    projectId: "YOUR_PROJECT_ID",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    functionsRegion: "us-central1"
  };

  firebase.initializeApp(firebaseConfig);
  window.fbFunctions = firebase.functions();
</script>
```

**Steps:**
1. Go to Firebase Console
2. Select your project
3. Click Settings (gear icon) → Project settings
4. Copy the config object
5. Paste into Index.html above

**Success Criteria:**
- Firebase SDK loads without errors
- `window.fbFunctions` available in console

---

#### Task 4.2: Replace google.script.run Calls (1.5-2 hours)

**Before (GAS):**
```javascript
google.script.run.withSuccessHandler((result) => {
  populateProfile(result);
}).withFailureHandler((error) => {
  console.error('Error:', error.message);
}).getProfileData();
```

**After (Firebase):**
```javascript
const getProfileData = firebase.functions().httpsCallable('getProfileData');

getProfileData({})
  .then((result) => {
    populateProfile(result.data);
  })
  .catch((error) => {
    console.error('Error:', error.message);
  });
```

**Find all google.script.run calls:**

```bash
grep -n "google.script.run" JavaScript.html
```

Replace each one systematically. Example replacements:

```javascript
// Replace all of these patterns in JavaScript.html:

// Pattern 1: Simple callback
// BEFORE:
google.script.run.withSuccessHandler(callback).functionName();
// AFTER:
firebase.functions().httpsCallable('functionName')({})
  .then(result => callback(result.data))
  .catch(error => console.error(error));

// Pattern 2: With parameters
// BEFORE:
google.script.run.withSuccessHandler(callback).functionName(param1, param2);
// AFTER:
firebase.functions().httpsCallable('functionName')({param1, param2})
  .then(result => callback(result.data))
  .catch(error => console.error(error));

// Pattern 3: With failure handler
// BEFORE:
google.script.run
  .withSuccessHandler(onSuccess)
  .withFailureHandler(onFailure)
  .functionName();
// AFTER:
firebase.functions().httpsCallable('functionName')({})
  .then(result => onSuccess(result.data))
  .catch(error => onFailure({message: error.message}));
```

**Create helper function in JavaScript.html to simplify calls:**

```javascript
// Add this helper at the top of JavaScript.html
async function callFunction(functionName, data = {}) {
  try {
    const result = await firebase.functions().httpsCallable(functionName)(data);
    return result.data;
  } catch (error) {
    console.error(`Error calling ${functionName}:`, error.message);
    throw error;
  }
}

// Now calls are simpler:
// BEFORE: google.script.run.withSuccessHandler(callback).getProfileData();
// AFTER: callFunction('getProfileData').then(callback);
```

**Success Criteria:**
- All google.script.run calls replaced
- No references to google.script.run remain
- All functions called with correct parameters
- Error handling in place

---

#### Task 4.3: Update Error Messages (0.5 hours)

Google Apps Script errors vs Firebase errors have different formats.

**Create error handler:**

```javascript
function handleFunctionError(error) {
  console.error('Function error:', error);

  let userMessage = 'Something went wrong. Please try again.';

  if (error.code === 'failed-precondition') {
    // Location-based error (geofence)
    userMessage = error.message; // "Location is outside geofence..."
  } else if (error.code === 'permission-denied') {
    // Authentication error
    userMessage = 'You do not have permission for this action.';
  } else if (error.code === 'internal') {
    userMessage = 'Server error. Please contact support.';
  }

  // Show error to user (modal or toast)
  showError(userMessage);
}
```

Update all `.catch()` handlers to use this function.

**Success Criteria:**
- Error messages are user-friendly
- Different error types handled appropriately
- No exposing internal error details

---

#### Task 4.4: Test Frontend (1 hour)

**Test Checklist:**
- [ ] Page loads without console errors
- [ ] Profile page displays correctly
- [ ] Event list loads
- [ ] QR scanning works
- [ ] Photo capture works
- [ ] Submit button triggers function call
- [ ] Admin page loads (if admin user)
- [ ] Admin approve/deny works
- [ ] Error handling triggers on failure
- [ ] Mobile responsive on iOS Safari

**Manual Testing:**
1. Deploy functions: `firebase deploy --only functions`
2. Deploy frontend: `firebase deploy --only hosting`
3. Test on real iOS Safari device (THIS IS CRITICAL)
4. Verify geolocation permission prompt appears
5. Verify submission goes through

**Success Criteria:**
- All pages functional
- All buttons responsive
- Error messages appear correctly
- iOS Safari geolocation works ✅

---

### Phase 5: Testing & QA (4-5 hours)
**Status:** NOT STARTED
**Duration:** 1 week
**Owner:** [TO BE ASSIGNED]

#### Task 5.1: Unit Tests (1.5 hours)

Create tests for each controller module:

**Example: `functions/tests/profile.test.js`**

```javascript
const test = require('firebase-functions-test')();
const myFunctions = require('../index');

describe('Profile Functions', () => {
  it('getProfileData returns correct structure', async () => {
    const wrapped = test.wrap(myFunctions.getProfileData);
    const context = {auth: {token: {email: 'test@school.edu'}}};

    const result = await wrapped({}, context);

    expect(result).toHaveProperty('email');
    expect(result).toHaveProperty('displayName');
    expect(result).toHaveProperty('points');
    expect(result).toHaveProperty('badges');
  });

  it('calculateBadges returns array', async () => {
    const wrapped = test.wrap(myFunctions.calculateBadges);
    const context = {auth: {token: {email: 'test@school.edu'}}};

    const result = await wrapped({studentEmail: 'test@school.edu'}, context);

    expect(Array.isArray(result.badges)).toBe(true);
    expect(typeof result.totalPoints).toBe('number');
  });
});
```

Run tests:
```bash
cd functions
npm test
```

**Success Criteria:**
- Unit tests written for all 41 functions
- Tests cover success and failure cases
- 80%+ code coverage
- All tests passing

---

#### Task 5.2: Integration Tests (1.5 hours)

Test functions that call each other:

**Example:** submitEvent → calculateBadges workflow

```javascript
describe('Submission Workflow', () => {
  it('submitEvent creates record and triggers badge calculation', async () => {
    // 1. Submit event
    // 2. Verify record in Sheets
    // 3. Approve submission
    // 4. Verify badges calculated
    // 5. Verify student points updated
  });
});
```

**Success Criteria:**
- Workflow tests for all major flows
- Data consistency verified
- Error cases tested

---

#### Task 5.3: End-to-End Tests on Staging (1 hour)

**Test Plan:**
1. Load app in browser (staging URL)
2. Log in as student
3. Submit event (complete flow with photo)
4. Verify submission appears in admin queue
5. Log in as admin
6. Approve submission
7. Verify points updated in student profile
8. Test on iOS Safari specifically

**Success Criteria:**
- Complete workflows function
- Data flows correctly through all systems
- iOS Safari geolocation works ✅

---

#### Task 5.4: Performance Testing (0.5 hours)

**Check:**
- Page load time (target: < 2 sec)
- Function execution time (target: < 1 sec)
- API quota usage (should be well under limits)
- Concurrent user handling (test with multiple tabs)

**Tools:**
- Firebase Console → Functions → Performance
- Chrome DevTools → Network/Performance tabs
- Google Sheets API quota dashboard

**Success Criteria:**
- Load times acceptable
- No API quota exceeded
- Handles concurrent requests

---

### Phase 6: Staging Deployment & QA (3-4 hours)
**Status:** NOT STARTED
**Duration:** 1-2 days
**Owner:** [TO BE ASSIGNED]

#### Task 6.1: Deploy to Staging (0.5 hours)

**Prerequisites:**
- All tests passing
- No console errors locally

**Deploy commands:**

```bash
# Deploy Cloud Functions to staging
firebase deploy --only functions --project YOUR_PROJECT_ID-staging

# Deploy Frontend to staging
firebase deploy --only hosting --project YOUR_PROJECT-staging

# Verify deployment
firebase functions:list --project YOUR_PROJECT_ID-staging
firebase hosting:list --project YOUR_PROJECT_ID-staging
```

**Staging URL:** `https://YOUR_PROJECT_ID.web.app` (from Firebase Hosting)

**Success Criteria:**
- Functions deployed without errors
- Frontend accessible at staging URL
- No errors in Functions logs

---

#### Task 6.2: QA Testing on Staging (2 hours)

**Manual QA Checklist:**

**Core Functionality:**
- [ ] Login works
- [ ] Profile page loads
- [ ] Event list shows
- [ ] QR code scanner page loads
- [ ] Photo capture/upload works
- [ ] Submit button sends data
- [ ] Submission appears in admin queue
- [ ] Admin can approve submission
- [ ] Admin can deny submission
- [ ] Points update correctly
- [ ] Badges appear correctly
- [ ] Leaderboard displays
- [ ] User settings save

**Mobile Testing (CRITICAL):**
- [ ] Test on iOS Safari - Verify geolocation permission prompt appears ✅
- [ ] Test on iOS Chrome
- [ ] Test on Android Chrome
- [ ] Test on Android Firefox
- [ ] Portrait orientation works
- [ ] Landscape orientation works
- [ ] Touch interactions responsive

**Edge Cases:**
- [ ] Network timeout (submit while offline)
- [ ] Very large photo
- [ ] Photo upload fails → retry
- [ ] Invalid location (outside geofence)
- [ ] Duplicate submission attempt
- [ ] Admin approval twice (should reject)

**Data Integrity:**
- [ ] Data saves to Sheets correctly
- [ ] Photos save to Drive correctly
- [ ] No data loss on errors
- [ ] Correct Sheets tabs updated

**Success Criteria:**
- All QA tests passing
- No crashes or errors
- iOS Safari geolocation working ✅

---

#### Task 6.3: Security Testing (1 hour)

- [ ] Verify only authenticated users access
- [ ] Verify users can only see their own data
- [ ] Verify only admins access admin functions
- [ ] Verify no data leaks in error messages
- [ ] Verify API key restrictions (Firebase console)
- [ ] Check for console.log() statements with sensitive data

**Firebase Security Rules (add to firebase.json):**

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

**Success Criteria:**
- No security vulnerabilities found
- Data access controlled properly
- No sensitive data in logs

---

#### Task 6.4: Performance Monitoring (0.5 hours)

**Baseline Measurements:**
- Average function execution time: _____ ms
- P95 function execution time: _____ ms
- API calls per submission: _____
- API quota usage (% of free tier): ____%

**Record these** as baseline for comparison after production deployment.

**Success Criteria:**
- Performance acceptable
- Quota usage well under limits

---

### Phase 7: Cutover Planning (2-3 hours)
**Status:** NOT STARTED
**Duration:** 1-2 weeks before go-live
**Owner:** [TO BE ASSIGNED]

#### Task 7.1: Create Cutover Plan (1 hour)

**Cutover Window:** Saturday afternoon (low-usage time, ~15 minutes)

**Cutover Procedure:**

```
T-24 hours:
  - Final QA on production data in staging
  - Team briefing on cutover plan

T-12 hours:
  - Email notification to all users
  - Remind admin staff

T-0:00 (Cutover Start):
  - Announce maintenance window in app (if possible)
  - Backup current Sheets
  - Backup current Drive

T-0:05:
  - Disable GAS web app (or hide nav link)
  - Stop accepting new submissions

T-0:10:
  - Deploy Cloud Functions to production
  - Deploy Frontend to Firebase Hosting
  - Update navigation links to new Firebase URL

T-0:12:
  - Test critical workflows:
    - Profile page load
    - Submit event
    - Admin queue
    - Admin approval

T-0:15:
  - Re-enable submissions
  - Cutover complete
  - Monitor errors closely

T+30 min:
  - Send "all systems normal" notification
  - Celebrate! 🎉
```

**Rollback Procedure (if critical issues found within 1 hour):**

1. Alert stakeholders
2. Disable Firebase Hosting
3. Re-enable GAS web app
4. Update nav links back to GAS
5. Post-mortem on issue
6. Fix and redeploy

**Success Criteria:**
- Plan documented
- All stakeholders aware
- Rollback procedures tested

---

#### Task 7.2: Communication Plan (1 hour)

**Email to All Users (48 hours before):**

```
Subject: Spartan Cup Maintenance - Saturday 2-3pm

We're upgrading Spartan Cup to improve your experience!

What's changing:
✅ iOS Safari now works (no more Chrome requirement!)
✅ Faster performance
✅ Same features you know

What's NOT changing:
- Your data is safe
- Same leaderboards and badges
- Same admin approval process

Timeline:
- Maintenance: Saturday 2:00-2:15pm
- Downtime: ~10 minutes
- Apps may be slow during upgrade (normal)

Questions? Contact: [ADMIN EMAIL]

Thank you,
IT Team
```

**Email to Admin Staff (24 hours before):**

```
Subject: Spartan Cup Maintenance - Admin Briefing

On Saturday 2-3pm, we're upgrading Spartan Cup.

For admins:
- Admin dashboard remains the same
- Approval process unchanged
- Sheets still updated with new submissions

During maintenance:
- You may see brief "not available" message
- Nothing to do on your end

If issues:
- Contact [ADMIN EMAIL]
- We have rollback plan ready

Thank you,
IT Team
```

**Success Criteria:**
- Users notified
- Expectations set
- Support plan in place

---

#### Task 7.3: Data Backup (0.5 hours)

**Before cutover:**

1. Backup Sheets:
   - File → Download as → Excel
   - Save to Drive backup folder
   - Label: `Spartan_Cup_Backup_[DATE]`

2. Backup Drive:
   - Download all submission photos to local storage
   - Label folders with date

3. Store backups:
   - Keep for 30 days
   - Have access to quickly restore if needed

**Success Criteria:**
- Sheets backed up
- Drive backed up
- Backups stored safely

---

### Phase 8: Production Deployment (0.5 hours)
**Status:** NOT STARTED
**Duration:** 1 day
**Owner:** [TO BE ASSIGNED]

#### Task 8.1: Pre-Flight Checks (0.25 hours)

**Before deploying:**

```bash
# Verify all functions compile
firebase functions:list --project spartan-cup-prod

# Check no errors in logs
firebase functions:log --limit 50 --project spartan-cup-prod

# Verify API quotas not exceeded
# (Check in Firebase Console → Cloud Functions → Quotas)

# Check Sheets/Drive sharing still in place
# (Verify service account is Editor on both)

# Run final smoke tests locally
npm test
```

**Pre-Deployment Checklist:**
- [ ] All functions deployed
- [ ] Firebase Hosting ready
- [ ] Environment variables correct
- [ ] Service account verified
- [ ] Error logging enabled
- [ ] Monitoring alerts configured
- [ ] Support team briefed
- [ ] Rollback plan reviewed
- [ ] Data backed up

---

#### Task 8.2: Execute Cutover (0.25 hours)

**Follow cutover plan from Task 7.1:**

```bash
# At T-0:10, deploy to production:

# Deploy functions
firebase deploy --only functions --project spartan-cup-prod

# Deploy hosting
firebase deploy --only hosting --project spartan-cup-prod

# At T-0:12, run smoke tests:
# 1. Load main page in browser
# 2. Log in
# 3. View profile
# 4. Submit test event (use test geofence)
# 5. Check admin queue
# 6. Approve test submission

# Monitor logs for errors
firebase functions:log --limit 100 --follow --project spartan-cup-prod
```

**Success Criteria:**
- All systems deployed
- Smoke tests pass
- No errors in logs
- Users report access works

---

### Phase 9: Post-Launch Monitoring (2-3 hours ongoing)
**Status:** NOT STARTED
**Duration:** 1-2 weeks after launch
**Owner:** [TO BE ASSIGNED]

#### Task 9.1: Daily Monitoring (1 hour daily for 3 days)

**Daily Checks:**

```bash
# Check error logs
firebase functions:log --project spartan-cup-prod

# Check quota usage
# (Firebase Console → Cloud Functions → Quotas)

# Check response times
# (Firebase Console → Cloud Functions → Metrics)

# Look for patterns:
# - Error rate normal?
# - No timeout errors?
# - API quota healthy?
```

**What to Look For:**
- Unexpected errors
- High error rate (> 1%)
- Timeout errors
- Quota warnings

**Action if Issues Found:**
1. Document issue
2. Check logs for root cause
3. Fix code or configuration
4. Deploy fix
5. Verify resolution

**Success Criteria:**
- No critical errors for 24 hours
- Error rate < 0.1%
- All workflows function

---

#### Task 9.2: Performance Monitoring (1 hour for first week)

**Compare to baselines from Phase 6:**

| Metric | Phase 6 | Now | Status |
|--------|---------|-----|--------|
| Avg function time | ___ms | ___ms | ✓ |
| P95 function time | ___ms | ___ms | ✓ |
| API quota usage | ___% | ___% | ✓ |
| Error rate | ___% | ___% | ✓ |

**Actions if degradation found:**
- Identify slow function
- Add caching if needed
- Optimize query
- Redeploy

---

#### Task 9.3: Gather User Feedback (ongoing)

**Survey users:** "How is the new Spartan Cup?"

- What did you like?
- What needs improvement?
- Any issues you experienced?

Document feedback and plan improvements for next phase.

---

## Success Criteria Summary

### Functional ✅
- [ ] iOS Safari geolocation works (PRIMARY GOAL)
- [ ] All 41 functions converted and working
- [ ] All workflows identical to GAS version
- [ ] No data loss or corruption
- [ ] Error handling comprehensive
- [ ] Mobile responsive

### Performance ✅
- [ ] Page load < 2 seconds
- [ ] Function execution < 1 second average
- [ ] No API quota exceeded
- [ ] Handles 10-200 concurrent users

### Data Integrity ✅
- [ ] All submissions saved to correct Sheets tab
- [ ] Photos saved to Drive with metadata
- [ ] Points calculated correctly
- [ ] Badges awarded correctly
- [ ] Admin approvals update data correctly

### Security ✅
- [ ] Only authenticated users access
- [ ] Users can only see own data
- [ ] Only admins access admin functions
- [ ] No data leaks in logs
- [ ] Service account credentials secure

### User Experience ✅
- [ ] No breaking changes
- [ ] Same workflows as before
- [ ] Better performance than GAS
- [ ] Mobile works great
- [ ] Clear error messages

---

## Risk Register

### High Risk

**Risk 1: iOS Safari Still Doesn't Work**
- **Probability:** Very low (Firebase Hosting should solve iframe issue)
- **Impact:** Critical (defeats entire migration purpose)
- **Mitigation:**
  - [ ] Test extensively on actual iOS Safari devices early
  - [ ] Have geolocation fallback (PIN code?) if needed
  - [ ] Contact Firebase support if issues

**Risk 2: Function Logic Errors After Conversion**
- **Probability:** Medium (converting 41 functions is complex)
- **Impact:** High (users see wrong data/points)
- **Mitigation:**
  - [ ] Thorough code review before cutover
  - [ ] Side-by-side comparison of GAS vs Node.js output
  - [ ] Unit tests for all functions
  - [ ] Staged rollout (test with subset first)

### Medium Risk

**Risk 3: Data Integrity Issues During Cutover**
- **Probability:** Low (cutover is brief)
- **Impact:** Medium (submissions lost during window)
- **Mitigation:**
  - [ ] Schedule cutover during low-usage time
  - [ ] Disable submissions 5 min before cutover
  - [ ] Brief window (10-15 min acceptable)

**Risk 4: Service Account Key Compromise**
- **Probability:** Very low (your personal account)
- **Impact:** High (API access exposed)
- **Mitigation:**
  - [ ] Don't commit key to Git (use .gitignore)
  - [ ] Store key securely (Firebase Functions env vars)
  - [ ] Plan key rotation strategy

### Low Risk

**Risk 5: Performance Degradation**
- **Probability:** Low (Firebase Hosting is fast)
- **Impact:** Low (acceptable slowdown)
- **Mitigation:**
  - [ ] Performance baseline established
  - [ ] Monitor after launch
  - [ ] Optimize if needed

---

## Technology Stack Reference

### Frontend (No Changes)
- HTML5 / CSS3
- Vanilla JavaScript
- Tailwind CSS (CDN)
- html5-qrcode library
- **New:** Firebase SDK

### Backend (Complete Change)
- **Old:** Google Apps Script (GAS)
- **New:** Node.js 16+ running on Cloud Functions
- **Libraries:**
  - firebase-functions
  - firebase-admin
  - googleapis
  - google-auth-library

### Infrastructure
- **Hosting:** Firebase Hosting (replaces GAS web app)
- **Compute:** Cloud Functions (replaces GAS execution)
- **Database:** Google Sheets API (via service account)
- **Storage:** Google Drive API (via service account)
- **Authentication:** Firebase Auth (Google OAuth)

### Deployment
- **Tool:** Firebase CLI
- **CI/CD:** Manual `firebase deploy` commands
  - Future: Could add GitHub Actions automation

---

## Team & Responsibilities

### Roles Needed

| Role | Name | Hours | Responsibilities |
|------|------|-------|------------------|
| **Backend Developer** | [TO ASSIGN] | 20 hrs | Phases 2-3: Function conversion, utilities, Cloud Functions |
| **Frontend Developer** | [TO ASSIGN] | 5 hrs | Phase 4: Firebase SDK integration, API call updates |
| **QA Tester** | [TO ASSIGN] | 4 hrs | Phases 5-6: Testing, iOS Safari verification |
| **Project Owner** | [YOU] | 3 hrs | Oversight, data backup, Sheets editing |
| **DevOps/Setup** | [YOU] | 2 hrs | GCP/Firebase setup, credentials management |

**Total Team Hours:** ~34 hours

---

## Timeline Options

### Option A: Full-Time (2 weeks)
```
Week 1:
- Days 1-2: Phases 0-1 (planning, setup)
- Days 3-5: Phases 2-3 (utilities, functions)

Week 2:
- Days 1-2: Phase 3 (finish functions)
- Days 3-4: Phase 4 (frontend)
- Days 5: Phase 5-6 (testing, staging)

Week 3:
- Days 1-2: Phase 7-8 (cutover, deployment)
- Days 3+: Phase 9 (monitoring)
```

### Option B: Part-Time (4-6 weeks)
```
Week 1: Phases 0-1 (5 hrs)
Week 2-3: Phase 2-3 part 1 (10 hrs)
Week 4: Phase 3 part 2 (8 hrs)
Week 5: Phase 4 (5 hrs)
Week 6: Phase 5-6 (3 hrs)
Week 7: Phase 7-8 (2 hrs)
Week 8+: Phase 9 (ongoing)
```

---

## Key Files to Create

### Code Files
- [ ] `functions/config.js` - Firebase & API initialization
- [ ] `functions/index.js` - Cloud Functions entry point
- [ ] `functions/utils/sheets.js` - Sheets API wrapper
- [ ] `functions/utils/drive.js` - Drive API wrapper
- [ ] `functions/utils/auth.js` - Authentication utilities
- [ ] `functions/utils/validation.js` - Data validation
- [ ] `functions/utils/formulas.js` - Ported spreadsheet formulas
- [ ] `functions/controllers/profile.js` - Profile functions
- [ ] `functions/controllers/submissions.js` - Submission functions
- [ ] `functions/controllers/admin.js` - Admin functions
- [ ] `functions/controllers/events.js` - Event functions

### Configuration Files
- [ ] `.firebaserc` - Firebase project mapping
- [ ] `firebase.json` - Firebase configuration
- [ ] `functions/.env` - Environment variables (gitignored)
- [ ] `functions/.env.example` - Env variable template
- [ ] `functions/.gitignore` - Git ignore rules

### Documentation Files
- [ ] `FUNCTION_AUDIT.md` - List of all 41 functions
- [ ] `DATA_SCHEMA.md` - Sheets structure documentation
- [ ] `FIREBASE_MIGRATION_PLAN.md` - This document
- [ ] `API_DOCUMENTATION.md` - Cloud Functions API docs
- [ ] `DEPLOYMENT_GUIDE.md` - How to deploy
- [ ] `TROUBLESHOOTING.md` - Common issues and fixes

### Test Files
- [ ] `functions/tests/utils.test.js` - Utility tests
- [ ] `functions/tests/functions.test.js` - Function tests
- [ ] `functions/test-access.js` - API access verification

---

## Known Limitations & Future Improvements

### Current Implementation (Phase 1)
- Basic Firebase Hosting (no custom domain initially)
- Manual deployment via CLI (no CI/CD)
- Simple email/in-app notifications only
- No offline support
- No caching layer (could add later)

### Future Improvements (Phase 2+)
- [ ] Custom domain (spartan-cup.oronohighschool.org)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Push notifications (Firebase Cloud Messaging)
- [ ] Offline support (Service Workers)
- [ ] Caching layer (Firebase Realtime DB)
- [ ] Real-time leaderboard updates
- [ ] More sophisticated badge system
- [ ] Fan feed with images

---

## Go/No-Go Decision Criteria

**Before starting Phase 0:**
- [ ] Executive approval for timeline
- [ ] Team members assigned
- [ ] Budget approved ($0/month ongoing)
- [ ] Stakeholders briefed

**Before Phase 1 (Infrastructure):**
- [ ] GCP/Firebase projects created
- [ ] Service account ready

**Before Phase 2 (Utilities):**
- [ ] Code repository initialized
- [ ] Team can access codebase
- [ ] Firebase CLI working locally

**Before Phase 3 (Function Conversion):**
- [ ] All utilities tested and working
- [ ] Code audit completed (all 41 functions listed)
- [ ] Function dependency mapping documented

**Before Phase 4 (Frontend):**
- [ ] All 41 functions converted and unit tested
- [ ] No console errors in Cloud Functions logs

**Before Phase 5 (Testing):**
- [ ] All frontend calls migrated to Firebase
- [ ] No google.script.run references remain

**Before Phase 6 (Staging):**
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code reviewed

**Before Phase 7 (Cutover Planning):**
- [ ] QA testing complete and passing
- [ ] No blocking bugs found
- [ ] Performance acceptable

**Before Phase 8 (Production):**
- [ ] Cutover plan reviewed and approved
- [ ] All stakeholders briefed
- [ ] Rollback plan tested
- [ ] Data backed up

**GO DECISION:** All above checkboxes must be checked before proceeding to next phase.

---

## Document Control

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 1.0 | 2025-11-01 | Claude Code | Initial plan, refined for your scale & context |
| TBD | TBD | [You] | Updates as work progresses |

---

## Questions or Clarifications?

This plan was designed specifically for your Spartan Cup app context:
- Scale: 10-200 users (max ~500)
- Primary blocker: iOS Safari geolocation in GAS iframe
- Your role: Service account owner, super admin
- Duration: 3-6 weeks part-time, 2 weeks full-time
- Cost: $0/month (Spark plan)

If anything needs clarification, refer back to Phase 0 (Audit & Planning) to update assumptions.

---

**Ready to begin Phase 0? Start by assigning the Backend Developer role and creating the FUNCTION_AUDIT.md document.**
