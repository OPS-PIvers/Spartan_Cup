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
├── Code.js                 # Main router module (entry point with doGet())
├── Admin.gs                # Admin dashboard and management functions
├── Auth.gs                 # Authentication and authorization
├── Activities.gs           # Activity and schedule management
├── Badges.gs               # Badge system and award logic
├── Config.gs               # Configuration and constants
├── Events.gs               # Event management and lookup
├── FanFeed.gs              # Social feed features
├── Notifications.gs        # User notifications
├── Points.gs               # Points calculation and tracking
├── Prizes.gs               # Prize management
├── Setup.gs                # First-time setup functions
├── Submissions.gs          # Submission handling
├── Utils.gs                # Utility helpers
├── Index.html              # Main SPA template entry point
├── JavaScript.html         # Client-side JS (SPA router, form handling, location services)
├── CSS.html                # Styling and theme configuration
├── Modals.html             # Modal dialog components
├── Page.profile.html       # Main dashboard
├── Page.history.html       # Submission history
├── Page.submit.html        # Event submission form
├── Page.admin.html         # Admin approval dashboard
├── Page.welcome.html       # New user welcome
├── Page.event-select.html  # Event selection
├── Page.all-badges.html    # Badge gallery
├── Page.prizes.html        # Prizes & Events
├── Page.rulebook.html      # Points and rules guide
├── Page.fanfeed.html       # Social feed
├── Page.settings.html      # User settings, dark mode
├── appsscript.json         # Apps Script runtime configuration
├── .clasp.json             # Clasp deployment configuration
├── firebase.json           # Firebase configuration
├── storage.rules           # Firebase Storage security rules
├── cors.json               # CORS configuration for Firebase Storage
├── README.md               # Main project documentation
├── CLAUDE.md               # This file - AI assistant instructions
├── SPREADSHEET_SCHEMA.md   # Complete Google Sheets backend schema
├── .claude/                # Claude Code custom commands
│   └── commands/
│       └── deploy.md       # Deploy command for clasp & Firebase
├── .gemini/                # Gemini configuration
│   └── commands/
│       └── deploy.toml     # Deploy configuration
├── docs/                   # Documentation folder
│   ├── SHEETS_API_SETUP.md         # Google Sheets API setup guide (legacy)
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
├── assets/                 # Logo and QR code images (source files)
│   ├── The Spartan Cup_logo_FINAL.svg
│   ├── The_Spartan_Cup-QR.svg
│   ├── spartan_cup_FINAL.png
│   └── spartan_cup_QR.png
├── scripts/                # Deprecated Python utilities (not in active use)
│   ├── read_sheet.py       # Legacy: Read Google Sheets data via service account
│   └── write_sheet.py      # Legacy: Write Google Sheets data via service account
└── public/                 # Firebase Hosting public directory
    ├── index.html          # Geolocation wrapper (deployed to Firebase)
    ├── 404.html            # Firebase 404 page
    ├── spartan_cup_FINAL.png           # Logo (deployed copy)
    ├── spartan_cup_FINALtransparent.png # Logo transparent variant
    ├── spartan_cup_QR.png              # QR code (deployed copy)
    ├── The_Spartan_Cup-QR.svg          # QR code SVG (deployed copy)
    └── badges/             # Badge achievement images (note: mixed naming conventions)
        ├── default-badge.svg        # Uses hyphen
        ├── explorer.svg
        ├── first_timer.svg          # Uses underscore
        ├── hattrick.svg
        ├── bronze_points.svg        # Uses underscore
        ├── silver_points.svg
        ├── gold_points.svg
        ├── diamond_fan.svg          # Uses underscore
        ├── platinum_fan.svg
        ├── 2nd_place_finish.svg     # Uses underscore
        ├── 3rd_place_finish.svg
        ├── season_champ.svg
        ├── season_champ.png
        └── README.md
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

**Backend (.gs files):**
- `Code.js`: Main router module with `doGet()` entry point
- `Auth.gs`: Authentication and authorization, admin access control
- `Events.gs`: Event management, active event status updates
- `Badges.gs`: Badge system logic, calculations, and award processing
- `Activities.gs`: Activity and schedule management
- `Submissions.gs`: Submission handling and approval workflow
- `Points.gs`: Points calculation and tracking
- `Admin.gs`: Admin dashboard functions
- `Config.gs`: Configuration constants and settings
- `FanFeed.gs`: Social feed features
- `Notifications.gs`: User notification system
- `Prizes.gs`: Prize management
- `Setup.gs`: First-time setup and initialization
- `Utils.gs`: Utility helper functions

**Frontend (HTML files):**
- `Index.html`: Main SPA template entry point
- `JavaScript.html`: Client-side routing, page navigation, location services, form submission handlers
- `CSS.html`: Styling and theme configuration
- `Modals.html`: Modal dialog components

**Page Components:**
- `Page.profile.html`: Main dashboard showing student stats, badges, leaderboard
- `Page.submit.html`: Event submission form with location-based check-in
- `Page.admin.html`: Admin approval dashboard (Note: Large file, may benefit from refactoring)
- `Page.history.html`: Submission history
- `Page.welcome.html`: New user welcome
- `Page.event-select.html`: Event selection
- `Page.all-badges.html`: Badge gallery
- `Page.prizes.html`: Prizes & Events
- `Page.rulebook.html`: Points and rules guide
- `Page.fanfeed.html`: Social feed
- `Page.settings.html`: User settings, dark mode

**Geofencing:** Location verification uses coordinates stored in Activities_Data and Events sheets to prevent cheating submissions from outside campus.

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

### Deployment Using Custom Commands

The project includes custom deployment commands for both Claude Code and Gemini:

**Using the /deploy command:**
```bash
/deploy
```

This command will:
1. Push updates to Google Apps Script using `clasp push`
2. Deploy updates to Firebase Hosting using `firebase deploy`

See `.claude/commands/deploy.md` for Claude Code configuration or `.gemini/commands/deploy.toml` for Gemini configuration.

### Legacy Python Scripts (Deprecated)

The `scripts/` directory contains Python utilities (`read_sheet.py`, `write_sheet.py`) that were previously used for direct Google Sheets access via service account authentication. These scripts are **no longer actively maintained** and are kept for historical reference only. All sheet operations should now be performed through the Google Apps Script modules (.gs files) or the Apps Script editor.

### Testing

There is no automated test framework configured. Testing is manual:
- Open the deployed web app URL in a browser
- Test location-based check-in at events
- Verify spreadsheet data updates correctly
- Test admin approval workflow
- Test on iOS Safari to verify geolocation works via Firebase wrapper

### Linting

No linting is configured. Google Apps Script Editor provides basic syntax checking. Consider using a local linter if making significant changes to any .gs files.

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
- Build admin verification queue UI (swipe-to-approve interface planned)
- Implement badge system calculation logic
- Complete settings page (dark mode toggle, notification preferences)
- Populate event details dynamically from Event_Schedule tab
- Add fan feed/social interaction features
- Implement real leaderboard data fetching

## Adding Features

**Create a new page:**
1. Create `Page.newpage.html` with UI markup
2. Add navigation link in `JavaScript.html` navbar
3. Add case in the router switch statement in `JavaScript.html`
4. Add backend functions in the appropriate .gs file (or create a new one) if needed
5. Call backend functions via `google.script.run.functionName()`

**Add backend functionality:**
1. Choose the appropriate .gs file for your function:
   - `Auth.gs`: Authentication and authorization logic
   - `Events.gs`: Event-related operations
   - `Badges.gs`: Badge calculations and awards
   - `Submissions.gs`: Submission handling
   - `Points.gs`: Points calculations
   - `Admin.gs`: Admin-only operations
   - Or create a new .gs file for new feature domains
2. Define function with `@param` and `@return` JSDoc comments
3. Call from frontend via `google.script.run.functionName(args, callback)`
4. If returning data to a spreadsheet tab, follow existing patterns in the relevant .gs file for reading/writing

**Styling:**
- Use existing Tailwind CSS classes from the CDN
- Add custom CSS to `CSS.html` for non-Tailwind styles
- School colors: Primary blue (#1b3b87), Secondary red (#b5121b)

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
