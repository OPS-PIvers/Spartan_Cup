# Firebase Setup Guide for Spartan Cup Wrapper

This guide walks you through setting up Firebase Hosting for the iOS Safari location wrapper.

## Prerequisites

- A Google account (use the same one as your Google Apps Script project)
- Node.js installed (v14+)
- The wrapper HTML file: `firebase-wrapper-index.html`
- Your Google Apps Script web app URL (you'll get this during deployment)

## Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

Verify it installed:
```bash
firebase --version
```

## Step 2: Login to Firebase

```bash
firebase login
```

This will open a browser window. Sign in with your Google account (same one as your GAS project).

## Step 3: Create Firebase Project

Go to [Firebase Console](https://console.firebase.google.com):

1. Click "Add project"
2. Enter project name: `spartan-cup` (or your school name)
3. Uncheck "Enable Google Analytics" (not needed for static hosting)
4. Click "Create project"
5. Wait for it to finish (~30 seconds)

Once created, you'll see your **Project ID** in the project settings. Note this down.

## Step 4: Initialize Firebase Hosting in a New Directory

Create a new directory for the Firebase wrapper (separate from your GAS project):

```bash
mkdir spartan-cup-wrapper
cd spartan-cup-wrapper
```

Initialize Firebase Hosting:

```bash
firebase init hosting
```

When prompted:
- **Select project:** Choose the `spartan-cup` project you just created
- **Public directory:** Type `public` and press Enter
- **Configure as single-page app?** Type `n` (no)
- **Set up automatic builds?** Type `n` (no)
- **Overwrite public/index.html?** Type `y` (yes)

This creates:
- `firebase.json` - Firebase configuration
- `.firebaserc` - Project reference
- `public/` - Your hosting directory
- `public/index.html` - Default file (we'll replace this)

## Step 5: Copy Wrapper HTML

Replace the `public/index.html` with the wrapper:

**On macOS/Linux:**
```bash
cp ../Spartan_Cup/firebase-wrapper-index.html public/index.html
```

**On Windows (PowerShell):**
```powershell
Copy-Item ..\Spartan_Cup\firebase-wrapper-index.html public\index.html
```

## Step 6: Update GAS_APP_URL in the Wrapper

Edit `public/index.html`:

1. Find line 106: `const GAS_APP_URL = 'YOUR_GAS_WEB_APP_URL_HERE';`
2. Replace with your actual Google Apps Script web app URL

**How to find your GAS web app URL:**
1. Open your Google Apps Script project
2. Click "Deploy" → "New deployment"
3. Select "Web app"
4. In "Execute as" select your email
5. In "Who has access" select "Anyone" (or "Anyone with the link")
6. Click "Deploy"
7. Copy the displayed URL (looks like: `https://script.google.com/macros/s/YOUR_ID/exec`)
8. Paste it into `public/index.html` replacing `YOUR_GAS_WEB_APP_URL_HERE`

## Step 7: Test Locally (Optional but Recommended)

```bash
firebase serve
```

This starts a local Firebase server at `http://localhost:5000`

**Test it:**
1. Open http://localhost:5000 in Chrome (desktop)
2. Grant location permission when prompted
3. You should see "Location obtained! Loading app..." and redirect

**Don't worry if it fails on the redirect** — the GAS URL won't work locally, but location permission should work.

Press `Ctrl+C` to stop the local server.

## Step 8: Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

This uploads your wrapper to Firebase Hosting.

**Output will show:**
```
Hosting URL: https://spartan-cup.web.app
Also accessible at:
- https://spartan-cup.firebaseapp.com
```

**Save this URL** — this is what your users will visit!

## Step 9: Test on Real Devices

**Desktop Testing (Chrome/Safari):**
1. Open https://spartan-cup.web.app
2. Grant location permission
3. Should redirect to your GAS app with location in URL params

**iOS Safari Testing (CRITICAL):**
1. Get an iPhone
2. Open https://spartan-cup.web.app in Safari
3. When prompted, grant location permission ✅ **This should work now!**
4. Should redirect to GAS app
5. Navigate to submit page
6. Should show "✅ Location Enabled"

## Step 10: Update QR Codes

If you generate QR codes for events:
1. Update them to point to `https://spartan-cup.web.app` instead of the direct GAS URL
2. Users scan QR → wrapper → geolocation → GAS app

## Troubleshooting

### Firebase deploy fails: "Not logged in"
```bash
firebase logout
firebase login
firebase deploy --only hosting
```

### Can't find Google Apps Script URL
Make sure you've deployed the GAS project as a "Web app" (not just "New script")

### Wrapper shows location error on desktop but works on mobile
Normal! Desktop may block geolocation until you grant permission in browser settings

### iOS Safari still shows "Location blocked"
- Make sure user has iOS 15+ (earlier versions have issues)
- Try using Chrome on iPhone as fallback
- Check that user granted location permission at the OS level (Settings → Privacy → Location Services)

## Redeployment

If you make changes to the wrapper later:
```bash
# Edit public/index.html
nano public/index.html

# Deploy changes
firebase deploy --only hosting
```

## Custom Domain (Optional)

To use a custom domain like `spartancup.oronohighschool.org`:

1. In [Firebase Console](https://console.firebase.google.com)
2. Go to Hosting section
3. Click "Add custom domain"
4. Enter your domain
5. Follow DNS verification instructions
6. Wait for SSL certificate (auto-issued)

---

**Next Steps:**
1. Complete this Firebase setup
2. Test on desktop and iOS Safari
3. Update QR codes to new Firebase URL
4. Deploy updated GAS code with `clasp push`
5. Users will use new wrapper URL going forward
