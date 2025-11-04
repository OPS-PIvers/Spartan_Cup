# Spartan Cup

A gamified attendance and participation system for student events at Orono High School.

## Quick Links

- **Google Apps Script Project:** The project is a Google Apps Script-based web application
- **Firebase Hosting:** `https://the-spartan-cup.web.app` (geolocation wrapper for iOS Safari)
- **Documentation:** See [CLAUDE.md](CLAUDE.md) for development notes

## Features

✅ Automatic location-based event detection (check in within 100m of events)
✅ Photo submission for points
✅ Real-time leaderboards (season and all-time)
✅ Admin dashboard for submission review
✅ iOS Safari geolocation support (via Firebase wrapper)
✅ Dark mode theme
✅ Badge achievements system
✅ Real profile data from Google Sheets

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

3. **Deploy updates to Firebase (geolocation wrapper):**
   ```bash
   firebase deploy --only hosting
   ```

## Architecture

### Server-Side (Code.js)
- Router function `doGet(e)` serves the SPA based on `?page=` URL parameter
- Handles user authentication, sheet operations, and file storage
- Accepts location parameters from Firebase wrapper

### Client-Side (JavaScript.html)
- Single-page app router for navigation
- Automatic event detection based on proximity
- Location management with fallback strategy:
  1. Firebase wrapper location (iOS Safari support)
  2. Browser cache (5-minute TTL)
  3. Fresh browser geolocation
- Real-time profile data loading via `google.script.run`

### Firebase Wrapper
- Hosted at `https://the-spartan-cup.web.app`
- Captures geolocation permission BEFORE iframe load (fixes iOS Safari)
- Redirects to GAS app with location parameters

## Important Notes

### iOS Safari Geolocation
The app uses a Firebase Hosting wrapper to solve iOS Safari's geolocation blocking in iframes:
1. User clicks "Check In" → Redirects to Firebase wrapper
2. Wrapper requests location permission (works on iOS!)
3. Wrapper redirects to GAS app with location params
4. GAS app auto-detects closest event based on location

**Technical:** Firebase wrapper at `public/index.html` captures location before GAS iframe loads. GAS deployment @79 receives location via URL params and passes to frontend via `APP_DATA`.

### Navigation Safety
Google Apps Script requires user activation for navigation. Never use `confirm()` dialogs or `setTimeout()` before navigation—use custom modals instead. See [CLAUDE.md](CLAUDE.md#important-implementation-notes) for details.

### Data Storage
- **Sheets tabs:** Student_Profiles, Event_Schedule, Submissions_Pending, Submissions_Verified, Config_Badges, Config_Admins
- **Google Drive:** Photo submissions (base64-encoded with metadata)
- **Geofencing:** Hardcoded campus coordinates validate submission location

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
1. Open Firebase URL on iPhone Safari: https://the-spartan-cup.web.app
2. Grant location permission (this now works!)
3. Verify app loads with location data in URL
4. Tap "Check In at Event" button
5. Verify auto-detection or manual event selection
6. Complete full submission workflow
7. Verify submission appears in Submissions_Pending sheet
```

### Event Detection Testing
1. Navigate to campus location within 100m of an active event
2. Tap "Check In at Event"
3. Verify auto-submit redirects to submission form for closest event
4. Try from >100m away to verify "too far" message

## Development

- **No linting configured** - Use Google Apps Script Editor's built-in syntax checking
- **No automated tests** - Manual testing required
- **Dark mode** - Use Tailwind `dark:` classes
- **Styling** - Tailwind CSS CDN + custom CSS in CSS.html
- **Colors** - Primary blue (#1b3b87), Secondary red (#b5121b)

## Deployment Status

| Component | Status | Details |
|-----------|--------|---------|
| **Google Apps Script** | ✅ Active | Deployment @79 (Production) |
| **Deployment ID** | — | `AKfycbzox9ZqfP5FWJrJUpBnpUdBT8PPnDl-NroRfCUbjpPnTpllVpZS__y3pKNV13j4CX_j` |
| **Firebase Hosting** | ✅ Active | `the-spartan-cup.web.app` |
| **Geolocation Wrapper** | ✅ Working | Points to @79 deployment |
| **Profile Data** | ✅ Live | Real data from Student_Profiles sheet |

## Troubleshooting

### Location not captured on iOS Safari
- Verify Firebase wrapper URL is correct: `https://the-spartan-cup.web.app`
- Check Settings → Safari → Location Services is enabled
- Clear Safari cache and try again

### Auto-submit not detecting events
- Verify you're within 100m of an active event
- Check Event_Schedule sheet has events with "Active" status
- Test directly: open `https://the-spartan-cup.web.app` in browser
- Check browser console for [Auto-Submit] logs

### Submission not saving
- Verify user is within geofence coordinates
- Check Sheets tab permissions (user must be able to edit)
- Check browser console for JavaScript errors

## References

- [Claude Development Notes](CLAUDE.md) - Comprehensive development guide
- [Implementation Checklist](IMPLEMENTATION_CHECKLIST.md) - Setup completion status
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Deployment procedures and troubleshooting

## License

This project is proprietary to Orono High School.
