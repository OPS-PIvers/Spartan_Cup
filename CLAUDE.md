# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Spartan Cup** is a Google Apps Script-based web application that gamifies student attendance and participation at school events. It's a single-page application (SPA) allowing students to check in at events via location-based detection, submit photos to earn points, and compete on leaderboards. The admin dashboard enables staff to review and approve submissions. The application is tailored for Orono High School with custom branding and geolocation verification to prevent cheating.

## Technology Stack

- **Runtime:** Google Apps Script (V8)
- **Database:** Google Sheets (via SpreadsheetApp API)
- **File Storage:** Google Drive (via DriveApp API), Firebase Storage (badge images)
- **Frontend Framework:** Vanilla JavaScript SPA with server-driven routing
- **CSS:** Tailwind CSS (CDN-hosted)
- **Libraries:**
  - Google Material Icons for icons
  - Google Fonts (Public Sans) for typography
  - Firebase SDK (Storage)
- **Deployment Tools:** Clasp (Google Apps Script CLI), Firebase Hosting (geolocation wrapper)
- **Hosting:** Firebase Hosting (wrapper to capture geolocation for iOS Safari)

## Codebase Statistics

- **Backend:** 6,447 lines across 13 .gs modules (96 functions)
- **Frontend:** 2,576 lines (Index.html, JavaScript.html, CSS.html, Modals.html)
- **Page Templates:** 4,981 lines across 17 page files
- **Total:** ~14,000+ lines of code

## Repository Structure

The project combines Google Apps Script files (flat structure required by GAS) with organized documentation and assets:

```
Spartan_Cup/
├── Code.js                 # Router only (157 lines) - doGet, include, getAdminTabHTML
├── *.gs                    # Backend modules (see Backend Architecture below)
├── Index.html              # Main SPA template entry point (205 lines)
├── JavaScript.html         # Client-side SPA application (1,823 lines)
├── CSS.html                # Styling and theme configuration (289 lines)
├── Modals.html             # Modal dialog components (102 lines)
│
├── Page.profile.html       # Dashboard - points, rank, badges, leaderboard
├── Page.submit.html        # Event submission form
├── Page.history.html       # Event history list
├── Page.welcome.html       # First-visit onboarding
├── Page.event-select.html  # Event picker with distance sorting
├── Page.prizes.html        # Season awards + upcoming events
├── Page.fanfeed.html       # Social feed - photos + badge awards
├── Page.rulebook.html      # Rules and point system
├── Page.all-badges.html    # Badge gallery
├── Page.settings.html      # Dark mode, notifications, logout
├── Page.admin.html         # Admin dashboard - swipe-to-approve
├── Page.admin.events.html  # Event CRUD
├── Page.admin.badges.html  # Badge management + Firebase uploads
├── Page.admin.season.html  # Season/activity management
├── Page.admin.prizes.html  # Prize configuration
├── Page.admin.points.html  # Points value configuration
├── Page.admin.utils.html   # Admin utilities (cache clear, debug)
│
├── appsscript.json         # Apps Script runtime configuration
├── .clasp.json             # Clasp deployment configuration
├── firebase.json           # Firebase configuration
├── storage.rules           # Firebase Storage security rules
├── cors.json               # CORS configuration for Firebase Storage
│
├── README.md               # Main project documentation
├── CLAUDE.md               # This file - AI assistant instructions
├── SPREADSHEET_SCHEMA.md   # Complete Google Sheets backend schema
│
├── docs/                   # Documentation folder
│   ├── SHEETS_API_SETUP.md
│   ├── BADGE_DEPLOYMENT_GUIDE.md
│   ├── FIREBASE_STORAGE_SETUP.md
│   ├── FIREBASE_STORAGE_CLI_SETUP.md
│   ├── ios_icon_image.md
│   ├── templates/
│   │   └── firebase-wrapper-index.html
│   └── archive/
│
├── assets/                 # Image and media assets
├── scripts/                # Python utility scripts
│   ├── read_sheet.py
│   └── write_sheet.py
├── public/                 # Firebase Hosting public directory
│   ├── index.html          # Geolocation wrapper
│   └── 404.html
├── credentials.json        # Service account credentials (gitignored)
└── .env                    # Environment configuration (gitignored)
```

## Backend Architecture

The backend is organized into 13 modular .gs files with 96 total functions:

| Module | Lines | Functions | Purpose |
|--------|-------|-----------|---------|
| **Code.js** | 157 | 3 | Router - doGet, include, getAdminTabHTML |
| **Setup.gs** | 1,690 | 10 | First-time setup, DB initialization, triggers |
| **Badges.gs** | 1,278 | 13 | Badge system, award logic, Firebase uploads |
| **Events.gs** | 898 | 12 | Event CRUD, scheduling, geofencing |
| **Auth.gs** | 536 | 9 | User authentication, profiles, permissions |
| **Config.gs** | 368 | 11 | Caching hub, data retrieval helpers |
| **Activities.gs** | 300+ | 8 | Season/activity management |
| **Submissions.gs** | 300+ | 7 | Photo submissions, Drive storage |
| **Points.gs** | 200+ | 5 | Point calculations and configuration |
| **Prizes.gs** | 150+ | 4 | Prize CRUD operations |
| **FanFeed.gs** | 150+ | 5 | Social feed data |
| **Admin.gs** | 100+ | 2 | Approval/denial workflow |
| **Notifications.gs** | 100+ | 3 | Notification system (UI only) |
| **Utils.gs** | 150+ | 7 | Utilities - distance calc, formatting |

### Key Backend Functions

**Auth.gs:**
- `getUserEmail()`, `getUserDisplayName()` - Current user info
- `getUserIsAdmin()` - Admin check (cached 6 hours)
- `getProfileData()` - Dashboard data (points, rank, badges, leaderboard, history)
- `saveUserSettings()` - Persist student preferences

**Events.gs:**
- `getActiveEvents()` - Events happening now/soon
- `getEventsByDistance()` - Sort by GPS distance
- `validateEventSubmission()` - Geofence validation
- `addEvent()`, `updateEvent()`, `deleteEvent()` - CRUD

**Submissions.gs:**
- `submitEvent()` - Main submission handler
- `savePhotoToDrive()` - Store image on Google Drive
- `getAdminQueue()` - Pending submissions list

**Badges.gs:**
- `calculateBadges()` - Check user against all badge triggers
- `uploadBadgeImage()` - Upload to Firebase Storage
- `createBadge()`, `updateBadge()`, `deleteBadge()` - CRUD

**Admin.gs:**
- `approveSubmission()` - Mark verified, award points, calculate badges
- `denySubmission()` - Reject submission

## Frontend Architecture

### JavaScript.html (1,823 lines)

The main client-side SPA application includes:

**Core Systems:**
- **CacheManager** - Session storage with TTL (profile 5min, events 30min, queue 30sec)
- **callWithRetry()** - Automatic retry for rate limits (429) with exponential backoff
- **Location Services** - Three-tier fallback: Firebase wrapper → cache → browser
- **Page Router** - `navigateToPage()` with location preservation

**UI Features:**
- Haptic feedback for mobile
- Toast notifications
- Offline detection banner
- Pull-to-refresh gesture
- Loading modal

**Page Functions:**
- `loadEventsByDistance()` - Event selection
- `populateProfile()`, `populateHistory()` - Dashboard rendering
- `handleFormSubmit()` - Photo submission
- `updateLeaderboardDisplay()` - Leaderboard UI

**Security:**
- `escapeHtml()` - XSS prevention
- Safe DOM construction (avoids innerHTML for user data)
- Input validation

### Frontend State

The app uses client-side caching via sessionStorage:
- Profile data (5 min TTL)
- Fan feed (15 min)
- Events list (30 min)
- Admin queue (30 sec)
- Location (2 min)

Persistent JavaScript variables hold form state and current user context.

## Common Commands

### Initial Setup (One-Time)

In Google Sheets where the script is bound, click **"🏆 Spartan Cup Admin"** → **"1. Run First-Time Setup"**. This creates all spreadsheet tabs, Drive folders, and HTML files.

### Deployment

**Google Apps Script:**
```bash
clasp push
```

**Firebase Hosting:**
```bash
firebase deploy --only hosting
```

### Direct Google Sheets Access (Python Scripts)

```bash
# Read data
python3 scripts/read_sheet.py Student_Profiles
python3 scripts/read_sheet.py Events json

# Write data
python3 scripts/write_sheet.py Student_Profiles append "email,Name,100,Gold"
python3 scripts/write_sheet.py Events update A2 "New Value"
```

**Service account:** `claude-code@spartan-cup.iam.gserviceaccount.com`

See [docs/SHEETS_API_SETUP.md](docs/SHEETS_API_SETUP.md) for setup.

### Testing

Manual testing required:
- Open `https://the-spartan-cup.web.app` in browser
- Test location-based check-in
- Verify spreadsheet updates
- Test admin approval workflow
- Test on iOS Safari for geolocation

## Important Implementation Notes

1. **Submission Workflow:** Pending → Verified (by admin) → Points awarded → Badges calculated

2. **Admin Access:** Email whitelist in **Config_Admins** sheet. `getUserIsAdmin()` checks with 6-hour caching.

3. **Dark Mode:** Implemented via Tailwind `dark:` classes. Toggle in settings persists via `saveUserSettings()`.

4. **Photo Handling:** Client-side compression (800x600, 65-75% JPEG quality) → base64 → Google Drive with metadata.

5. **Geolocation with Firebase Wrapper:** iOS Safari blocks geolocation in iframes. Solution: Firebase wrapper at `https://the-spartan-cup.web.app` captures location BEFORE loading GAS, passes via URL params.

6. **Google Apps Script Navigation (IMPORTANT):** Navigation requires user activation chain:
   - **DO NOT** use `confirm()` dialogs before navigation
   - **DO NOT** use `setTimeout()` before navigation
   - **USE** custom modals instead (see Modals.html)
   - If you see "Unsafe attempt to navigate" errors, you've broken the activation chain

7. **Rate Limiting:** `callWithRetry()` handles 429 errors with exponential backoff (1s, 2s, 4s).

## Feature Status

### Fully Implemented

- Location-based check-in with geofencing
- Photo submissions with compression
- Real-time leaderboards (season + all-time)
- Admin swipe-to-approve dashboard
- Badge system with 13+ triggers
- Event management (CRUD + spotlight games)
- Dark mode toggle
- iOS Safari support via Firebase wrapper
- Offline detection
- Pull-to-refresh
- Fan feed with photos + badge awards

### Partially Implemented

- **Settings Page:** Dark mode works; notifications and logout are UI-only (no backend)
- **Notifications:** Functions exist in Notifications.gs but are no-ops

## Adding Features

**Create a new page:**
1. Create `Page.newpage.html` with UI markup
2. Add navigation in JavaScript.html
3. Add case in router switch
4. Add backend functions in appropriate .gs file
5. Call via `google.script.run.functionName()`

**Add backend functionality:**
1. Define function in appropriate .gs module
2. Add `@param` and `@return` JSDoc comments
3. Call from frontend via `google.script.run`

**Styling:**
- Tailwind CSS classes from CDN
- Custom CSS in `CSS.html`
- School colors: Primary #1b3b87, Secondary #b5121b

## Performance Optimizations

**Server-side Caching:**
- Admin emails: 6 hours
- Active season: 1 hour
- Badge/event maps: On-demand with cache

**Client-side Caching:**
- sessionStorage with TTL
- Cache invalidation on relevant actions

**Photo Compression:**
- Canvas-based JPEG compression (65-75% quality)
- Max dimensions: 800x600

**Database:**
- O(n) badge calculation
- Pre-calculated aggregates
- Batch caching

## Troubleshooting

### Skeleton loaders stuck
Clear browser cache (CTRL+Shift+Delete) or use Admin Utils → Clear All Caches

### Location not working on iOS
Ensure using Firebase wrapper URL (`https://the-spartan-cup.web.app`), not direct GAS URL

### 429 rate limit errors
Handled automatically by `callWithRetry()` with exponential backoff

### Admin queue not updating
30-second cache TTL; pull-to-refresh or wait

### Navigation errors
"Unsafe attempt to navigate" = broken user activation chain. Remove async delays/dialogs before `navigateToPage()`

## Spreadsheet Schema Reference

For complete schema documentation, see [SPREADSHEET_SCHEMA.md](SPREADSHEET_SCHEMA.md).

### Core Data Sheets

- **Student_Profiles:** Email, Display_Name, Total_Points_Season, Total_Points_AllTime, Badges_Earned (JSON), Loyalty_Stats_JSON, Variety_Stats_Set (JSON), Disqualified, Student_Settings (JSON)
- **Activities_Data:** Activity_Code, Activity_Name, Season, Location_Name, Event_Lat, Event_Lon
- **Events:** Event_ID, Activity_Code, Event_Name, Date, Location, Lat/Lon, Start_Time, Duration_Hours, Is_Home_Game, Is_Spotlight_Game, Theme, Is_Active
- **Submissions_Pending:** Submission_ID, Timestamp, Email, Event_ID, Photo_URL, Photo_ID, Location_Data_JSON, Dressed_For_Theme, Notes
- **Submissions_Verified:** Submission_ID, Timestamps, Email, Event_ID, Admin_Email, Points_Base/Theme/Multiplier/Total, Photo_URL

### Configuration Sheets

- **Config_Points:** Point values for submission types
- **Config_Badges:** Badge definitions with triggers
- **Config_Admins:** Admin email whitelist
- **Config_Active_Season:** Current season setting

### Operational Sheets

- **Active_Season_Prizes:** Prize definitions
- **Badge_Awards:** Badge award history log

### Important Notes

- All sheets 1-indexed (headers row 1, data starts row 2)
- Foreign keys: Email, Event_ID, Activity_Code, Badge_ID
- JSON fields store stringified arrays/objects
- `updateActiveEventStatus()` trigger runs every 10 minutes
