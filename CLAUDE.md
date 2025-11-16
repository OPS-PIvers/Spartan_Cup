# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Spartan Cup** is a Google Apps Script-based web application that gamifies student attendance and participation at school events. It's a single-page application (SPA) allowing students to check in at events via location-based detection, submit photos to earn points, and compete on leaderboards. The admin dashboard enables staff to review and approve submissions. The application is tailored for Orono High School with custom branding and geolocation verification to prevent cheating.

## Technology Stack

- **Runtime:** Google Apps Script (V8)
- **Database:** Google Sheets (via SpreadsheetApp API)
- **File Storage:** Google Drive (via DriveApp API)
- **Frontend Framework:** Vanilla JavaScript SPA with server-driven routing
- **CSS:** Tailwind CSS (CDN-hosted)
- **Libraries:**
  - Google Material Icons for icons
  - Google Fonts (Public Sans) for typography
- **Deployment Tools:** Clasp (Google Apps Script CLI), Firebase Hosting (geolocation wrapper)
- **Hosting:** Firebase Hosting (wrapper to capture geolocation for iOS Safari)

## Repository Structure

The project combines Google Apps Script files (flat structure required by GAS) with organized documentation and assets:

```
Spartan_Cup/
├── Code.js                 # Server-side business logic (V8 Apps Script)
├── Index.html              # Main SPA template entry point
├── JavaScript.html         # Client-side JS (SPA router, form handling, location services)
├── CSS.html                # Styling and theme configuration
├── Modals.html             # Modal dialog components
├── Page.*.html             # Modular page components (profile, history, submit, etc.)
│   ├── Page.admin.html              # Admin dashboard coordinator (278 lines)
│   ├── Page.admin.utils.html        # Shared admin utilities (escapeHTML, showToast, etc.)
│   ├── Page.admin.review.html       # Submission review tab (swipe interface)
│   ├── Page.admin.events.html       # Events management CRUD
│   ├── Page.admin.season.html       # Season & activities management
│   ├── Page.admin.badges.html       # Badge configuration (16+ templates)
│   ├── Page.admin.prizes.html       # Prizes management
│   └── Page.admin.points.html       # Points configuration
├── appsscript.json         # Apps Script runtime configuration
├── .clasp.json             # Clasp deployment configuration
├── firebase.json           # Firebase configuration
├── storage.rules           # Firebase Storage security rules
├── cors.json               # CORS configuration for Firebase Storage
├── README.md               # Main project documentation
├── CLAUDE.md               # This file - AI assistant instructions
├── SPREADSHEET_SCHEMA.md   # Complete Google Sheets backend schema
├── ADMIN_REFACTOR.md       # Admin dashboard refactoring documentation
├── docs/                   # Documentation folder
│   ├── SHEETS_API_SETUP.md         # Google Sheets API setup guide
│   ├── BADGE_DEPLOYMENT_GUIDE.md   # Badge deployment reference
│   ├── FIREBASE_STORAGE_SETUP.md   # Firebase Storage setup
│   ├── FIREBASE_STORAGE_CLI_SETUP.md # Firebase CLI setup
│   ├── ios_icon_image.md           # iOS icon configuration
│   ├── templates/                   # Template files
│   │   └── firebase-wrapper-index.html  # Firebase wrapper template
│   └── archive/                     # Archived/historical documentation
│       ├── DEPLOYMENT_COMPLETE.md
│       ├── BADGE_SYSTEM_IMPROVEMENTS.md
│       ├── IMPLEMENTATION_CHECKLIST.md
│       └── GEMINI.md
├── assets/                 # Image and media assets
│   ├── The Spartan Cup_logo_FINAL.svg
│   ├── The_Spartan_Cup-QR.svg
│   ├── spartan_cup_FINAL.png
│   └── spartan_cup_QR.png
├── scripts/                # Python utility scripts
│   ├── read_sheet.py       # Read Google Sheets data
│   └── write_sheet.py      # Write Google Sheets data
├── public/                 # Firebase Hosting public directory
│   └── index.html          # Geolocation wrapper (deployed to Firebase)
├── credentials.json        # Google service account credentials (in .gitignore)
└── .env                    # Environment configuration (in .gitignore)
```

## Architecture

**Pattern: Server-Driven SPA Router**
- Single entry point: `doGet(e)` in Code.js routes based on `?page=` URL parameter
- HTML templates are modular: each Page.*.html is a self-contained component
- Server injects page content via the `include()` template function
- Client-side navigation handled via JavaScript without full page reloads
- Communication between frontend and backend via `google.script.run` (Apps Script AJAX)

**Data Layer:**
- **Backend storage:** Google Sheets with tabs (see [SPREADSHEET_SCHEMA.md](SPREADSHEET_SCHEMA.md) for complete schema)
  - **Core Data:** Student_Profiles, Activities_Data, Events, Submissions_Pending, Submissions_Verified
  - **Configuration:** Config_Points, Config_Badges, Config_Admins, Config_Active_Season
  - **Operational:** Active_Season_Prizes, Badge_Awards
- **File storage:** Google Drive for photo submissions (base64-encoded, saved with metadata)
- **Frontend state:** Minimal client-side state; mostly stateless per request

**Key Components:**
- `Code.js` (944 lines): All backend functions, spreadsheet operations, Drive API, authentication, photo handling
- `JavaScript.html` (337 lines): Client-side routing, page navigation, location services, form submission handlers
- `Page.profile.html`: Main dashboard showing student stats, badges, leaderboard
- `Page.submit.html`: Event submission form with location-based check-in
- **`Page.admin.html`**: Admin dashboard (modular architecture - see below)

**Admin Dashboard Architecture (Modular):**

The admin dashboard has been refactored into 8 focused components for better maintainability, performance, and security:

1. **Page.admin.html** (278 lines) - Main coordinator
   - Tab navigation (desktop sidebar + mobile dropdown)
   - Lazy loading implementation (reduces initial API calls from 6+ to 1)
   - Includes all component files via `include()` template function

2. **Page.admin.utils.html** (163 lines) - Shared utilities
   - `escapeHTML()` - XSS prevention helper
   - `showToast()` - Non-blocking toast notifications (error/success/info)
   - `format24To12Hour()` - Time formatting
   - `formatISOToDatetimeLocal()` - Date formatting
   - `showMessage()`, `clearForm()`, `setButtonLoading()`, `generateUUID()`

3. **Page.admin.review.html** (544 lines) - Submission review
   - Swipe-based interface (mobile + desktop)
   - Optimistic UI updates for instant feedback
   - Image preloading (3 cards ahead) to reduce API calls
   - Theme bonus toggle (double-tap photo)
   - Touch and mouse gesture support

4. **Page.admin.events.html** (293 lines) - Events management
   - Create/edit/delete events
   - Activity dropdown (dynamic from Activities_Data)
   - Date/time picker with 12-hour display
   - Spotlight game toggle, theme assignment

5. **Page.admin.season.html** (429 lines) - Season management
   - Display/set active season
   - Assign activities to seasons (checkbox UI)
   - Add new activities with geolocation

6. **Page.admin.badges.html** (1,180 lines) - Badge configuration
   - 16+ badge templates organized by scope
   - Scope-based template selection (current season/lifetime/special)
   - Multi-select activity assignment
   - Dynamic form fields, live criteria preview
   - Image upload with Firebase Storage integration

7. **Page.admin.prizes.html** (226 lines) - Prizes management
   - Create/edit/delete season prizes
   - Rank and description fields

8. **Page.admin.points.html** (249 lines) - Points configuration
   - Configure base points (with/without theme)
   - Configure theme bonus and spotlight multiplier
   - Reset to defaults

**Benefits of Modular Architecture:**
- **Better caching**: Each component cached independently by Google Apps Script
- **Lazy loading**: Only 1 tab loads data initially (vs 6+ in monolithic version)
- **Reduced rate limiting**: Image preloading limited to 3 cards ahead
- **Security**: All XSS vulnerabilities fixed with safe DOM methods
- **Maintainability**: Clear separation of concerns, easier debugging
- **Code quality**: No console.log statements, consistent error handling, programmatic event listeners

See [ADMIN_REFACTOR.md](ADMIN_REFACTOR.md) for complete refactoring documentation.

**Geofencing:** Location verification is hardcoded (coordinates in Code.js lines 16-19) to prevent cheating submissions from outside campus.

## Common Commands

### Initial Setup (One-Time)

In Google Sheets where the script is bound, click the **"🏆 Spartan Cup Admin"** menu and select **"1. Run First-Time Setup"**. This creates all spreadsheet tabs, Drive folders, and dynamically generates all HTML page files.

### Firebase Deployment (For iOS Safari Geolocation)

The project uses Firebase Hosting to host a geolocation wrapper that fixes iOS Safari's iframe geolocation blocking.

**Deployed Firebase Project:**
- **Project ID:** `the-spartan-cup`
- **Firebase Hosting URL:** `https://the-spartan-cup.web.app`
- **Wrapper location:** `/public/index.html`

**To deploy updates to the wrapper:**
```bash
firebase deploy --only hosting
```

**To verify wrapper is live:**
1. Open `https://the-spartan-cup.web.app` in a browser
2. Grant location permission when prompted
3. Browser should redirect to GAS app with location params in URL

See [docs/FIREBASE_STORAGE_SETUP.md](docs/FIREBASE_STORAGE_SETUP.md) for Firebase Storage setup and the wrapper template in [docs/templates/firebase-wrapper-index.html](docs/templates/firebase-wrapper-index.html).

### Direct Google Sheets Access (Python Scripts)

The project includes Python scripts for reading and writing to Google Sheets directly via service account authentication. This allows Claude Code and CLI users to query and modify sheet data without going through the Apps Script API.

**Setup Status:**
- Service account: `claude-code@spartan-cup.iam.gserviceaccount.com`
- Credentials: `credentials.json` (in .gitignore)
- Spreadsheet ID configured in `.env`

**Reading from Sheets:**
```bash
# Read as CSV (default)
python3 scripts/read_sheet.py Student_Profiles

# Read as JSON
python3 scripts/read_sheet.py Events json

# Read as formatted table
python3 scripts/read_sheet.py Config_Badges table
```

**Writing to Sheets:**
```bash
# Append a new row
python3 scripts/write_sheet.py Student_Profiles append "email@example.com,Name,100,Gold"

# Update a specific cell
python3 scripts/write_sheet.py Events update A2 "New Value"

# Update a range
python3 scripts/write_sheet.py Config_Badges update_range "A2:C2" "Badge,Description,Points"

# Clear a sheet (use with caution!)
python3 scripts/write_sheet.py Test_Sheet clear
```

**Available Sheet Tabs:**
- Student_Profiles
- Events
- Submissions_Pending
- Submissions_Verified
- Config_Badges
- Config_Admins
- Config_Points
- Config_Active_Season
- Activities_Data

**Note:** The service account must have Editor access to the spreadsheet. See [docs/SHEETS_API_SETUP.md](docs/SHEETS_API_SETUP.md) for complete setup instructions.

### Testing

There is no automated test framework configured. Testing is manual:
- Open the deployed web app URL in a browser
- Test location-based check-in at events
- Verify spreadsheet data updates correctly
- Test admin approval workflow
- Test on iOS Safari to verify geolocation works via Firebase wrapper

### Linting

No linting is configured. Google Apps Script Editor provides basic syntax checking. Consider using a local linter if making significant changes to Code.js.

## Important Implementation Notes

1. **Mock Data:** Profile and history pages currently return mock/placeholder data. Real student data needs to be fetched from the Sheets tabs.

2. **Submission Workflow:** Submissions follow: Pending → Verified (by admin) → Archived. The verification system prevents duplicate approvals.

3. **Admin Access:** Based on email whitelist in the **Config_Admins** sheet. Add user email addresses to this sheet to grant admin dashboard access. The `getUserIsAdmin()` function checks this sheet (with caching) for both UI visibility and backend permission enforcement.

4. **Dark Mode:** Implemented via Tailwind's `dark:` classes and CSS variables. Toggle is planned in settings page.

5. **Photo Handling:** Photos are base64-encoded in client and saved to Google Drive with metadata. Large photo sizes may impact quota.

6. **Geolocation with Firebase Wrapper:** iOS Safari blocks geolocation in iframes (GAS runs in an iframe). Solution: Firebase Hosting wrapper captures location BEFORE loading GAS. Flow: Firebase wrapper → requests location permission (works on iOS!) → passes location via URL params → GAS receives it in `doGet(e)` and passes to frontend via `APP_DATA`. See [FIREBASE_SETUP_GUIDE.md](FIREBASE_SETUP_GUIDE.md) for setup instructions. The wrapper location is checked first in `requestLocation()` (JavaScript.html), with fallback to cache/browser geolocation.

7. **Google Apps Script Navigation (IMPORTANT):** Navigation in Google Apps Script web apps requires user activation. This means you MUST navigate in direct response to user interactions (click handlers, form submissions) without breaking the activation chain. Common pitfalls:
   - **DO NOT use `confirm()` dialogs before navigation** - Browser dialogs break the user activation chain, causing "Unsafe attempt to navigate" errors
   - **DO NOT use `setTimeout()` before navigation** - Async delays break the activation chain
   - **USE custom modals instead** - See Modals.html for the pattern (show modal on click, then navigate when button clicked within modal)
   - **The Index.html `<base target="_top">` is required** for proper frame navigation
   - If you see the error: "The frame attempting navigation of the top-level window is sandboxed with the 'allow-top-navigation-by-user-activation' flag, but has no user activation" - you've broken the user activation chain. Fix by removing async delays and browser dialogs between the user click and `navigateToPage()`.

## Key Known TODOs

From in-code comments, these features need completion:
- Connect real student profile data from Sheets (currently returns mock data)
- Implement badge system calculation logic (backend badge awarding automation)
- Complete settings page (dark mode toggle, notification preferences)
- Populate event details dynamically from Event_Schedule tab
- Add fan feed/social interaction features
- Implement real leaderboard data fetching

**Completed (as of this refactoring):**
- ✅ Admin verification queue UI (swipe-to-approve interface) - Implemented in Page.admin.review.html
- ✅ Badge management system - Fully implemented in Page.admin.badges.html with 16+ templates
- ✅ Events management - CRUD operations in Page.admin.events.html
- ✅ Season management - Season/activity assignment in Page.admin.season.html
- ✅ Points configuration - Dynamic config UI in Page.admin.points.html

## Adding Features

**Create a new page:**
1. Create `Page.newpage.html` with UI markup
2. Add navigation link in `JavaScript.html` navbar
3. Add case in the router switch statement in `JavaScript.html`
4. Add backend functions in `Code.js` if needed
5. Call backend functions via `google.script.run.functionName()`

**Add a new admin tab:**
1. Create `Page.admin.newtab.html` with HTML and JavaScript (wrapped in IIFE)
2. Add tab button to `Page.admin.html` navigation sidebar and mobile dropdown
3. Include the component in `Page.admin.html` tab content container: `<?!= include('Page.admin.newtab') ?>`
4. Export load function: `window.loadNewTab = function() { ... }`
5. Add tab config to `switchTab()` function with `loadFunc: window.loadNewTab`
6. Use shared utilities from `Page.admin.utils.html` (escapeHTML, showToast, etc.)
7. Follow patterns: safe DOM methods (textContent), programmatic event listeners, showToast for errors

**Add backend functionality:**
1. Define function in `Code.js` with `@param` and `@return` JSDoc comments
2. Call from frontend via `google.script.run.functionName(args, callback)`
3. If returning data to a spreadsheet tab, follow existing patterns in Code.js for reading/writing

**Styling:**
- Use existing Tailwind CSS classes from the CDN
- Add custom CSS to `CSS.html` for non-Tailwind styles
- School colors: Primary blue (#1b3b87), Secondary red (#b5121b)

**Admin Component Best Practices:**
- Wrap JavaScript in IIFE: `(function() { 'use strict'; ... })();`
- Export only necessary functions to `window` scope
- Use `textContent` instead of `innerHTML` for dynamic data (XSS prevention)
- Use `showToast()` for user feedback, not `alert()`
- Keep `confirm()` for delete/destructive confirmations
- Add JSDoc comments to all functions
- No `console.log` statements in production code

## Spreadsheet Schema Reference

For complete schema documentation with column definitions, data types, relationships, and caching strategy, see [SPREADSHEET_SCHEMA.md](SPREADSHEET_SCHEMA.md).

### Core Data Sheets

- **Student_Profiles:** Student records with Email (unique key), Display_Name, Total_Points_Season, Total_Points_AllTime, Badges_Earned (JSON array), Loyalty_Stats_JSON, Variety_Stats_Set (JSON array), Disqualified flag, Student_Settings (JSON object)
- **Activities_Data:** Master list of sports/arts activities by season. Columns: Activity_Code (unique key), Activity_Name, Season, Location_Name, Event_Lat, Event_Lon
- **Events:** Individual event instances (games, performances). Columns: Event_ID (unique key, format "ACTIVITYCODE-NNN"), Activity_Code (FK to Activities_Data), Event_Name, Date, Location_Name, Event_Lat, Event_Lon, Start_Time, Duration_Hours, Is_Home_Game, Is_Spotlight_Game, Theme, Is_Active (auto-updated by trigger)
- **Submissions_Pending:** User submissions awaiting admin review. Columns: Submission_ID (UUID), Timestamp, Email (FK to Student_Profiles), Event_ID (FK to Events), Photo_URL, Photo_ID, Location_Data_JSON, Dressed_For_Theme, Notes
- **Submissions_Verified:** Approved submissions archive (immutable). Columns: Submission_ID, Timestamp_Submitted, Timestamp_Approved, Email, Event_ID, Admin_Email, Points_Base, Points_Theme, Points_Spotlight_Multiplier, Points_Total, Photo_URL

### Configuration Sheets

- **Config_Points:** Point value configuration. Columns: Setting_Name (unique key), Points_Value, Description. Updated via admin UI dialog `openPointsConfigDialog()`
- **Config_Badges:** Badge definition library. Columns: Badge_ID (unique key, format "badge_NNN"), Badge_Name, Category, Trigger_Type, Trigger_Value, Description, Badge_Image_URL. See SPREADSHEET_SCHEMA.md for complete trigger type reference
- **Config_Admins:** Admin access control list (single source of truth). Columns: Admin_Email (unique key), Role. Checked by `getUserIsAdmin()` (cached 6 hours)
- **Config_Active_Season:** Single-value store for current season. Columns: Setting_Name ("Active_Season"), Setting_Value (e.g., "Winter", "Spring", "Fall"). Referenced by `getActiveSeason()` (cached 1 hour)

### Operational Sheets

- **Active_Season_Prizes:** Prize definitions for current season. Columns: Rank (e.g., "1st Place", "Most Spirited"), Description. Displayed on Prizes & Events page
- **Badge_Awards:** Historical log of badge awards (optional). Columns: Award_ID (UUID), Timestamp, Email, Display_Name, Badge_ID, Badge_Name, Badge_Image_URL. Used for fan feed and analytics

### Important Notes

- All sheets use 1-indexed row numbers (row 1 = headers, data starts row 2)
- Foreign keys use Email (Student_Profiles), Event_ID (Events), Activity_Code (Activities_Data), Badge_ID (Config_Badges)
- JSON fields store arrays and objects as stringified JSON
- Caching is used extensively (see SPREADSHEET_SCHEMA.md for TTL values)
- The `updateActiveEventStatus()` trigger runs every 10 minutes to update Events.Is_Active based on current time vs. Start_Time + Duration_Hours
