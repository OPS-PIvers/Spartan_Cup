# Spartan Cup

A gamified attendance and participation system for student events at Orono High School.

## Quick Links

- **Firebase Hosting:** `https://the-spartan-cup.web.app` (main entry point with iOS geolocation support)
- **Documentation:** See [CLAUDE.md](CLAUDE.md) for development details
- **Schema:** See [SPREADSHEET_SCHEMA.md](SPREADSHEET_SCHEMA.md) for database structure

## Features

**Student Features:**
- Location-based event check-in with geofencing
- Photo submission for points
- Real-time season and all-time leaderboards
- Badge achievements system (13+ badge types)
- Event history and statistics
- Dark mode support
- Fan feed with community photos

**Admin Features:**
- Swipe-to-approve dashboard
- Event management (CRUD)
- Badge creation with Firebase Storage uploads
- Season/activity management
- Points configuration
- Prize management

**Technical Features:**
- iOS Safari geolocation support (via Firebase wrapper)
- Offline detection
- Pull-to-refresh
- Automatic retry for rate limits
- Client-side photo compression
- Extensive caching (server + client)

## Architecture Overview

```
Firebase Hosting (the-spartan-cup.web.app)
    │
    ↓ captures geolocation, redirects with params
    │
Google Apps Script (V8)
    ├── Backend: 6,460 lines / 99 functions / 13 modules
    │   ├── Auth, Events, Submissions, Badges
    │   ├── Admin, Config, Points, Prizes
    │   └── Activities, FanFeed, Notifications, Utils
    │
    └── Frontend: 2,576 lines + 17 page templates
        ├── SPA router with location preservation
        ├── CacheManager with TTL
        └── callWithRetry for rate limiting
    │
Google Sheets (Data Store)
    ├── Core: Student_Profiles, Events, Submissions
    └── Config: Points, Badges, Admins, Season
    │
Google Drive (Photo Storage)
Firebase Storage (Badge Images)
```

## Getting Started

### Prerequisites

- Google account with access to the Spartan Cup Google Sheets
- Node.js and npm (for Firebase CLI and Clasp)
- Firebase CLI: `npm install -g firebase-tools`
- Clasp CLI: `npm install -g @google/clasp`

### Initial Setup

1. **First-time database setup:**
   - In Google Sheets, click **"🏆 Spartan Cup Admin"** → **"1. Run First-Time Setup"**
   - Creates all spreadsheet tabs, Drive folders, and triggers

2. **Clone and configure:**
   ```bash
   git clone <repository-url>
   cd Spartan_Cup
   clasp login
   firebase login
   ```

3. **Deploy Google Apps Script:**
   ```bash
   clasp push
   ```

4. **Deploy Firebase Hosting:**
   ```bash
   firebase deploy --only hosting
   ```

### Configuration

**Firebase Storage (badge images):**
- See [docs/FIREBASE_STORAGE_SETUP.md](docs/FIREBASE_STORAGE_SETUP.md)
- Badge images auto-upload from admin UI

**Google Sheets API (Python scripts):**
- See [docs/SHEETS_API_SETUP.md](docs/SHEETS_API_SETUP.md)
- Service account: `claude-code@spartan-cup.iam.gserviceaccount.com`

## Development

### Deployment Commands

```bash
# Deploy Apps Script changes
clasp push

# Deploy Firebase Hosting (geolocation wrapper)
firebase deploy --only hosting

# Read sheet data directly
python3 scripts/read_sheet.py Events json

# Write sheet data
python3 scripts/write_sheet.py Student_Profiles append "email,Name,100,Gold"
```

### Project Structure

| Component | Lines | Description |
|-----------|-------|-------------|
| Backend (.gs) | 6,460 | 99 functions across 13 modules |
| JavaScript.html | 1,823 | Client-side SPA application |
| Page templates | 4,998 | 17 page components |
| Total | ~13,900 | Complete codebase |

### Key Files

- **Code.js** - Router (doGet, include, getAdminTabHTML)
- **Auth.gs** - User authentication and profiles
- **Events.gs** - Event management and geofencing
- **Submissions.gs** - Photo submissions
- **Badges.gs** - Badge system and Firebase uploads
- **JavaScript.html** - Complete client-side SPA

### Styling

- **Framework:** Tailwind CSS (CDN)
- **Primary:** #1b3b87 (blue)
- **Secondary:** #b5121b (red)
- **Dark mode:** Tailwind `dark:` classes

### Testing

Manual testing workflow:
1. Open `https://the-spartan-cup.web.app`
2. Grant location permission
3. Test event check-in and photo submission
4. Verify admin approval workflow
5. Test on iOS Safari for geolocation

## How It Works

### Student Flow

1. Student opens Firebase wrapper URL
2. Wrapper captures geolocation (works on iOS Safari)
3. Redirects to GAS app with location params
4. Student selects event (sorted by distance)
5. Takes photo and submits
6. Admin reviews and approves
7. Points awarded, badges calculated
8. Leaderboard updates

### Geolocation (iOS Safari)

iOS Safari blocks geolocation in iframes. Solution:

```
User → Firebase Wrapper → Request Location Permission →
       Redirect to GAS with lat/lon/acc params →
       GAS receives location and displays verified UI
```

### Caching Strategy

**Server-side:**
- Admin emails: 6 hours
- Active season: 1 hour
- Event/badge maps: On-demand

**Client-side (sessionStorage):**
- Profile data: 5 minutes
- Fan feed: 15 minutes
- Events list: 30 minutes
- Admin queue: 30 seconds
- Location: 2 minutes

## Data Storage

### Google Sheets

**Core Data:**
- Student_Profiles - User accounts and stats
- Events - Event instances
- Submissions_Pending - Awaiting review
- Submissions_Verified - Approved submissions

**Configuration:**
- Config_Points - Point values
- Config_Badges - Badge definitions
- Config_Admins - Admin whitelist
- Config_Active_Season - Current season

See [SPREADSHEET_SCHEMA.md](SPREADSHEET_SCHEMA.md) for complete schema.

### Google Drive

Photo submissions stored as base64-encoded files with metadata (email, event, timestamp).

### Firebase Storage

Badge images uploaded automatically from admin badge creation UI.

## Troubleshooting

### Location not working on iOS Safari
- Use Firebase wrapper URL: `https://the-spartan-cup.web.app`
- Check Settings → Safari → Location Services
- Clear Safari cache

### Skeleton loaders stuck
- Clear browser cache (CTRL+Shift+Delete)
- Admin Utils → Clear All Caches

### Submission not saving
- Verify user is within geofence
- Check Sheets permissions
- Check browser console for errors

### Rate limit errors (429)
- Handled automatically by `callWithRetry()`
- Uses exponential backoff (1s, 2s, 4s)

### Navigation errors
- "Unsafe attempt to navigate" = broken user activation chain
- Don't use `confirm()` or `setTimeout()` before navigation
- Use custom modals instead (see Modals.html)

## Deployment Status

| Component | Status | URL |
|-----------|--------|-----|
| Google Apps Script | Active | (Google Drive) |
| Firebase Hosting | Active | `the-spartan-cup.web.app` |
| Firebase Storage | Active | Badge images |

## Documentation

- [CLAUDE.md](CLAUDE.md) - Development guide with architecture details
- [SPREADSHEET_SCHEMA.md](SPREADSHEET_SCHEMA.md) - Complete database schema
- [docs/FIREBASE_STORAGE_SETUP.md](docs/FIREBASE_STORAGE_SETUP.md) - Firebase Storage setup
- [docs/SHEETS_API_SETUP.md](docs/SHEETS_API_SETUP.md) - Google Sheets API setup
- [docs/ios_icon_image.md](docs/ios_icon_image.md) - iOS icon configuration

## License

This project is proprietary to Orono High School.
