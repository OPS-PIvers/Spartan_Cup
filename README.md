# Spartan Cup

A gamified attendance and participation system for student events at Orono High School.

## Quick Links

- **Google Apps Script Project:** The project is a Google Apps Script-based web application
- **Firebase Hosting:** `https://the-spartan-cup.web.app` (geolocation wrapper for iOS Safari)
- **Documentation:** See [CLAUDE.md](CLAUDE.md) for development notes

## Features

✅ Location-based event check-in
✅ Photo submission for points
✅ Real-time leaderboards
✅ **Modular admin dashboard** with 6 management tabs
  - Swipe-based submission review with optimistic updates
  - Events CRUD with activity management
  - Season & activities configuration
  - Badge system with 16+ templates
  - Prizes management
  - Points configuration
✅ Badge management system with automated Firebase Storage uploads
✅ iOS Safari geolocation support (via Firebase wrapper)
✅ Dark mode theme
✅ Badge achievements system

## Getting Started

### Prerequisites

- Google account with access to the Spartan Cup Google Sheets document
- GitHub Codespaces or local development environment with Node.js
- Firebase CLI installed: `npm install -g firebase-tools`

### Setup

1. **First-time setup (one-time):**
   - In the bound Google Sheets, click **"🏆 Spartan Cup Admin"** → **"1. Run First-Time Setup"**
   - This creates all spreadsheet tabs, Drive folders, and HTML files

2. **Deploy updates to Google Apps Script:**
   ```bash
   clasp push
   ```

3. **Deploy updates to Firebase (geolocation wrapper & badge images):**
   ```bash
   firebase deploy --only hosting
   ```

4. **Firebase Storage Setup (for automated badge uploads):**
   - Enable Firebase Storage in Firebase Console
   - Configure storage security rules
   - Update Firebase config in `Index.html` with your API key
   - Badge images auto-upload to Firebase Storage (no manual steps!)
   - See [docs/FIREBASE_STORAGE_SETUP.md](docs/FIREBASE_STORAGE_SETUP.md) for setup guide

5. **Legacy: Manual Badge Deployment (optional):**
   - Alternative to Firebase Storage for badge images
   - See [docs/BADGE_DEPLOYMENT_GUIDE.md](docs/BADGE_DEPLOYMENT_GUIDE.md) if needed

**Note on Python Scripts:**
The `scripts/` directory contains deprecated Python utilities (`read_sheet.py`, `write_sheet.py`) that are no longer actively used. These were previously used for direct Google Sheets access but have been superseded by the modular Google Apps Script architecture. They are kept for historical reference only.

## Architecture

### Server-Side (Modular .gs files)
- **Code.js**: Main router with `doGet(e)` function serves the SPA based on `?page=` URL parameter
- **Auth.gs**: User authentication and authorization logic
- **Events.gs**: Event management and active status updates
- **Badges.gs**: Badge system calculations and award processing
- **Submissions.gs**: Submission handling and approval workflow
- **Activities.gs**: Activity and schedule management
- **Points.gs**: Points calculation and tracking
- **Admin.gs**: Admin dashboard functions
- **Config.gs**: Configuration constants and settings
- **FanFeed.gs**: Social feed features
- **Notifications.gs**: User notification system
- **Prizes.gs**: Prize management
- **Setup.gs**: First-time setup and initialization
- **Utils.gs**: Utility helper functions
- All modules accept location parameters from Firebase wrapper and handle Google Sheets operations
- `include()` template function for modular HTML components

### Client-Side (JavaScript.html)
- Single-page app router for navigation
- Location-based event detection
- Location management with fallback strategy:
  1. Firebase wrapper location (iOS Safari support)
  2. Browser cache
  3. Fresh browser geolocation

### Admin Dashboard (Modular Architecture)
- **8 component files** instead of monolithic single file
- **Lazy loading**: Only active tab loads data (reduces API calls from 6+ to 1)
- **Component caching**: Each module cached independently by Google Apps Script
- **Security**: XSS prevention with safe DOM methods
- **Components**: Main coordinator, shared utils, review, events, season, badges, prizes, points
- See [ADMIN_REFACTOR.md](ADMIN_REFACTOR.md) for architecture details

### Firebase Wrapper
- Hosted at `https://the-spartan-cup.web.app`
- Captures geolocation permission BEFORE iframe load (fixes iOS Safari)
- Redirects to GAS app with location parameters

## Important Notes

### iOS Safari Geolocation
The app uses a Firebase Hosting wrapper to solve iOS Safari's geolocation blocking in iframes:
1. User accesses the app via Firebase wrapper URL
2. Wrapper requests location permission (works on iOS!)
3. Wrapper redirects to GAS with location params
4. GAS app displays location-verified interface

The geolocation wrapper is deployed to Firebase Hosting. See the wrapper template in [docs/templates/firebase-wrapper-index.html](docs/templates/firebase-wrapper-index.html).

### Navigation Safety
Google Apps Script requires user activation for navigation. Never use `confirm()` dialogs or `setTimeout()` before navigation—use custom modals instead. See [CLAUDE.md](CLAUDE.md#important-implementation-notes) for details.

### Data Storage

For complete spreadsheet schema documentation, see [SPREADSHEET_SCHEMA.md](SPREADSHEET_SCHEMA.md).

**Google Sheets Backend:**
- **Core Data Sheets:** Student_Profiles, Activities_Data, Events, Submissions_Pending, Submissions_Verified
- **Configuration Sheets:** Config_Points, Config_Badges, Config_Admins, Config_Active_Season
- **Operational Sheets:** Active_Season_Prizes, Badge_Awards

**Additional Storage:**
- **Google Drive:** Photo submissions (base64-encoded with metadata)
- **Firebase Storage:** Badge images (auto-uploaded via admin UI)
- **Geofencing:** Campus coordinates stored in Activities_Data and Events sheets

## Testing

### Desktop Browser Testing
```
1. Open: https://the-spartan-cup.web.app
2. Grant location permission
3. Verify redirect to GAS with location parameters
4. Check browser console for [Wrapper] and [Location] logs
```

### iOS Safari Testing
```
1. Open Firebase URL on iPhone Safari
2. Grant location permission (this now works!)
3. Verify app loads with location-verified status
4. Complete full submission workflow
5. Verify submission appears in Sheets
```

## Development

- **No linting configured** - Use Google Apps Script Editor's built-in syntax checking
- **No automated tests** - Manual testing required
- **Dark mode** - Use Tailwind `dark:` classes
- **Styling** - Tailwind CSS CDN + custom CSS in CSS.html
- **Colors** - Primary blue (#1b3b87), Secondary red (#b5121b)

## Deployment Status

| Component | Status | Location |
|-----------|--------|----------|
| **Google Apps Script** | ✅ Active | Google Drive (bound to Sheets) |
| **Firebase Hosting** | ✅ Active | `the-spartan-cup.web.app` |
| **Geolocation Wrapper** | ✅ Working | Firebase public/index.html |

## Troubleshooting

### Location not captured on iOS Safari
- Verify Firebase wrapper URL is correct: `https://the-spartan-cup.web.app`
- Check Settings → Safari → Location Services is enabled
- Clear Safari cache and try again

### Submission not saving
- Verify user is within geofence coordinates
- Check Sheets tab permissions (user must be able to edit)
- Check browser console for JavaScript errors

## References

- [Spreadsheet Schema](SPREADSHEET_SCHEMA.md) - Complete Google Sheets backend schema documentation
- [Admin Dashboard Refactoring](ADMIN_REFACTOR.md) - Modular admin architecture documentation
- [Firebase Storage Setup](docs/FIREBASE_STORAGE_SETUP.md) - Badge image storage configuration
- [Claude Development Notes](CLAUDE.md) - AI assistant instructions
- [iOS Icon Setup](docs/ios_icon_image.md) - Home screen icon configuration
- [Badge Deployment Guide](docs/BADGE_DEPLOYMENT_GUIDE.md) - Badge deployment reference (legacy)

### Archived Documentation
- [Deployment History](docs/archive/) - Historical deployment notes and checklists

## License

This project is proprietary to Orono High School.
