# Spartan Cup

A gamified attendance and participation system for student events at Orono High School.

## Quick Links

- **Google Apps Script Project:** The project is a Google Apps Script-based web application
- **Firebase Hosting:** `https://the-spartan-cup.web.app` (geolocation wrapper for iOS Safari)
- **Documentation:** See [CLAUDE.md](CLAUDE.md) for development notes

## Features

✅ QR code scanning at events
✅ Photo submission for points
✅ Real-time leaderboards
✅ Admin dashboard for submission review
✅ Badge management system (create, edit, delete badges with image upload)
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

4. **Badge Image Deployment:**
   - Create badges via Admin Dashboard → Badges tab
   - Images are uploaded to Google Drive ("The Spartan Cup" → "Assets_Badges")
   - Download images from Drive and add to `/public/badges/` folder
   - Deploy to Firebase: `firebase deploy --only hosting`
   - See [BADGE_DEPLOYMENT_GUIDE.md](BADGE_DEPLOYMENT_GUIDE.md) for detailed instructions

## Architecture

### Server-Side (Code.js)
- Router function `doGet(e)` serves the SPA based on `?page=` URL parameter
- Handles user authentication, sheet operations, and file storage
- Accepts location parameters from Firebase wrapper

### Client-Side (JavaScript.html)
- Single-page app router for navigation
- QR code scanning with html5-qrcode
- Location management with fallback strategy:
  1. Firebase wrapper location (iOS Safari support)
  2. Browser cache
  3. Fresh browser geolocation

### Firebase Wrapper
- Hosted at `https://the-spartan-cup.web.app`
- Captures geolocation permission BEFORE iframe load (fixes iOS Safari)
- Redirects to GAS app with location parameters

## Important Notes

### iOS Safari Geolocation
The app uses a Firebase Hosting wrapper to solve iOS Safari's geolocation blocking in iframes:
1. User scans QR code → Firebase wrapper loads
2. Wrapper requests location permission (works on iOS!)
3. Wrapper redirects to GAS with location params
4. GAS app displays location-verified interface

See [FIREBASE_SETUP_GUIDE.md](FIREBASE_SETUP_GUIDE.md) for technical details.

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
1. Open Firebase URL on iPhone Safari
2. Grant location permission (this now works!)
3. Verify app loads with location-verified status
4. Complete full submission workflow
5. Verify submission appears in Sheets
```

### QR Code Testing
1. Navigate to QR Code page (admin only)
2. Verify QR code displays correctly
3. Click "Test QR Code" to verify wrapper loads
4. Scan with phone to test full flow

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
| **QR Codes** | ✅ Updated | Point to `the-spartan-cup.web.app` |

## Troubleshooting

### Location not captured on iOS Safari
- Verify Firebase wrapper URL is correct: `https://the-spartan-cup.web.app`
- Check Settings → Safari → Location Services is enabled
- Clear Safari cache and try again

### QR code not redirecting
- Verify QR code was generated after deploying updated wrapper URL
- Test directly: open `https://the-spartan-cup.web.app` in browser
- Check browser console for errors

### Submission not saving
- Verify user is within geofence coordinates
- Check Sheets tab permissions (user must be able to edit)
- Check browser console for JavaScript errors

## References

- [Firebase Setup Guide](FIREBASE_SETUP_GUIDE.md)
- [Firebase Migration Plan](FIREBASE_MIGRATION_PLAN.md)
- [Implementation Checklist](IMPLEMENTATION_CHECKLIST.md)
- [Claude Development Notes](CLAUDE.md)

## License

This project is proprietary to Orono High School.
