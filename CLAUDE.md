# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Spartan Cup** is a Google Apps Script-based web application that gamifies student attendance and participation at school events. It's a single-page application (SPA) that uses automatic location-based event detection to allow students to check in at events, submit photos to earn points, and compete on leaderboards. The admin dashboard enables staff to review and approve submissions. The application is tailored for Orono High School with custom branding and geofencing to prevent cheating.

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

This is a flat, single-folder Google Apps Script project with no subdirectories:

```
Spartan_Cup/
├── Code.js                 # Server-side business logic (V8 Apps Script)
├── Index.html              # Main SPA template entry point
├── JavaScript.html         # Client-side JS (SPA router, location handling, form handling)
├── CSS.html                # Styling and theme configuration
├── Modals.html             # Modal dialog components
├── Page.*.html             # Modular page components (profile, history, auto-submit, etc.)
│   ├── Page.profile.html   # Main dashboard with stats and leaderboard
│   ├── Page.auto-submit.html  # Auto-detect event based on location
│   ├── Page.event-select.html # Manual event selection by distance
│   ├── Page.submit.html    # Event submission form with photo upload
│   └── ...                 # Other page components
├── public/                 # Firebase hosting files
│   └── index.html          # Geolocation wrapper for iOS Safari fix
├── appsscript.json         # Apps Script runtime configuration
├── .clasp.json             # Clasp deployment configuration
└── README.md               # Project documentation
```

## Architecture

**Pattern: Server-Driven SPA Router**
- Single entry point: `doGet(e)` in Code.js routes based on `?page=` URL parameter
- HTML templates are modular: each Page.*.html is a self-contained component
- Server injects page content via the `include()` template function
- Client-side navigation handled via JavaScript without full page reloads
- Communication between frontend and backend via `google.script.run` (Apps Script AJAX)

**Data Layer:**
- **Backend storage:** Google Sheets with tabs: Student_Profiles, Event_Schedule, Submissions_Pending, Submissions_Verified, Config_Badges, Config_Admins
- **File storage:** Google Drive for photo submissions (base64-encoded, saved with metadata)
- **Frontend state:** Minimal client-side state; mostly stateless per request

**Key Components:**
- `Code.js`: All backend functions, spreadsheet operations, Drive API, authentication, photo handling, profile data
- `JavaScript.html`: Client-side routing, page navigation, location caching, form submission handlers
- `Page.profile.html`: Main dashboard showing student stats, badges, leaderboard (loads real data via `getProfileData()`)
- `Page.auto-submit.html`: Automatic event detection based on user location
- `Page.event-select.html`: Manual event selection showing events sorted by distance
- `Page.submit.html`: Event submission form with photo upload and location verification
- `Page.admin.html`: Admin approval dashboard

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

**Current Deployment:** @79 - `AKfycbzox9ZqfP5FWJrJUpBnpUdBT8PPnDl-NroRfCUbjpPnTpllVpZS__y3pKNV13j4CX_j`

### Testing

There is no automated test framework configured. Testing is manual:
- Open the deployed web app URL in a browser
- Test automatic event detection by checking in at campus locations
- Test event selection by distance feature
- Verify spreadsheet data updates correctly (Student_Profiles, Submissions_Pending)
- Test admin approval workflow
- Test on iOS Safari to verify geolocation wrapper works correctly
- Verify profile page loads real data from `getProfileData()`

### Linting

No linting is configured. Google Apps Script Editor provides basic syntax checking. Consider using a local linter if making significant changes to Code.js.

## Important Implementation Notes

1. **Profile Data:** Profile and history pages load real data from Google Sheets via `getProfileData()` function. Data includes season/all-time points, rank, badges, submission history, and admin status. The profile page in `JavaScript.html` line 499 calls this function on page load.

2. **Auto-Submit Feature:** Replaced QR code scanning with automatic location-based event detection. Flow: User taps "Check In" → redirects to Firebase wrapper → captures location → auto-submit page detects closest event within 100m → auto-redirects to submission form. See `Page.auto-submit.html` and `JavaScript.html` lines 545-607.

3. **Submission Workflow:** Submissions follow: Pending → Verified (by admin) → Archived. The verification system prevents duplicate approvals.

4. **Admin Access:** Determined by `isAdmin` column (Column J) in Student_Profiles sheet. This column uses a formula to check if user email is in Config_Admins. Admin status is returned by `getProfileData()` and checked client-side in `JavaScript.html` lines 738-744.

5. **Dark Mode:** Implemented via Tailwind's `dark:` classes and CSS variables. Toggle is available in settings page.

6. **Photo Handling:** Photos are base64-encoded in client and saved to Google Drive with metadata. Optimized compression reduces file size (see `JavaScript.html` lines 941-980).

7. **Geolocation with Firebase Wrapper:** iOS Safari blocks geolocation in iframes (GAS runs in an iframe). Solution: Firebase Hosting wrapper (`public/index.html`) captures location BEFORE loading GAS. Flow: Firebase wrapper → requests location permission (works on iOS!) → passes location via URL params → GAS receives it in `doGet(e)` and passes to frontend via `APP_DATA`. The wrapper location is checked first in `requestLocation()` (JavaScript.html lines 186-202), with fallback to cache/browser geolocation.

8. **Google Apps Script Navigation (IMPORTANT):** Navigation in Google Apps Script web apps requires user activation. This means you MUST navigate in direct response to user interactions (click handlers, form submissions) without breaking the activation chain. Common pitfalls:
   - **DO NOT use `confirm()` dialogs before navigation** - Browser dialogs break the user activation chain, causing "Unsafe attempt to navigate" errors
   - **DO NOT use `setTimeout()` before navigation** - Async delays break the activation chain
   - **USE custom modals instead** - See Modals.html for the pattern (show modal on click, then navigate when button clicked within modal)
   - **The Index.html `<base target="_top">` is required** for proper frame navigation
   - If you see the error: "The frame attempting navigation of the top-level window is sandboxed with the 'allow-top-navigation-by-user-activation' flag, but has no user activation" - you've broken the user activation chain. Fix by removing async delays and browser dialogs between the user click and `navigateToPage()`.

## Key Known TODOs

From in-code comments, these features need completion:
- Build admin verification queue UI (swipe-to-approve interface planned)
- Implement badge system calculation logic and auto-awarding
- Complete settings page (add more preference options beyond dark mode)
- Add fan feed/social interaction features
- Implement notifications system (email/push for approvals, badges)
- Add event photo gallery view
- Optimize performance for large datasets (caching, pagination)

## Adding Features

**Create a new page:**
1. Create `Page.newpage.html` with UI markup
2. Add navigation link in `JavaScript.html` navbar
3. Add case in the router switch statement in `JavaScript.html`
4. Add backend functions in `Code.js` if needed
5. Call backend functions via `google.script.run.functionName()`

**Add backend functionality:**
1. Define function in `Code.js` with `@param` and `@return` JSDoc comments
2. Call from frontend via `google.script.run.functionName(args, callback)`
3. If returning data to a spreadsheet tab, follow existing patterns in Code.js for reading/writing

**Styling:**
- Use existing Tailwind CSS classes from the CDN
- Add custom CSS to `CSS.html` for non-Tailwind styles
- School colors: Primary blue (#1b3b87), Secondary red (#b5121b)

## Spreadsheet Schema Reference

- **Student_Profiles:** Columns for user ID, name, grade, points, badges, photo URL
- **Event_Schedule:** Event metadata including name, date, location, geofence coordinates, QR code
- **Submissions_Pending:** User submissions awaiting admin review
- **Submissions_Verified:** Approved submissions with calculated points
- **Config_Badges:** Badge definitions, point thresholds, icons
- **Config_Admins:** Email whitelist for administrative access

Check Code.js for the exact column names and data structure used in each tab.
