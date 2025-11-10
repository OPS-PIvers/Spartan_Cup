# Firebase Storage CLI Setup Instructions

## Files Created

I've created the necessary configuration files:
- ✅ `storage.rules` - Security rules for badge uploads
- ✅ `cors.json` - CORS configuration for browser uploads
- ✅ `firebase.json` - Updated with storage rules config

## Step 1: Get Your Firebase Config

1. Go to https://console.firebase.google.com/project/the-spartan-cup/settings/general
2. Scroll to "Your apps" section
3. Click on your web app (or create one if it doesn't exist)
4. Copy the `firebaseConfig` object

**It should look like this:**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "the-spartan-cup.firebaseapp.com",
  projectId: "the-spartan-cup",
  storageBucket: "the-spartan-cup.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

5. **Send me this config** so I can update `Index.html` with the real values

## Step 2: Enable Firebase Storage (via Console)

1. Go to https://console.firebase.google.com/project/the-spartan-cup/storage
2. Click "Get Started"
3. Choose "Start in production mode"
4. Select location (suggest: `us-central1`)
5. Click "Done"

## Step 3: Deploy Storage Rules (CLI)

Run these commands from your project directory:

```bash
# Make sure you're in the right project
firebase use the-spartan-cup

# Deploy storage rules
firebase deploy --only storage

# Set CORS configuration
gsutil cors set cors.json gs://the-spartan-cup.appspot.com
```

**Expected output:**
```
✔  Deploy complete!

Storage Security Rules:
✔  storage.rules deployed successfully
```

## Step 4: Update Index.html with Real Config

Once you send me your Firebase config, I'll update `Index.html` line 34-41 with your actual API key and settings.

## Step 5: Deploy to Google Apps Script

```bash
clasp push
```

## Step 6: Test Badge Upload

1. Open Admin Dashboard → Badges tab
2. Create a test badge with an image
3. Should see "✅ Badge saved successfully!"
4. Image should appear immediately in badge list

## Verification Commands

```bash
# Check if Storage is enabled
firebase projects:list

# View storage rules
firebase deploy --only storage --dry-run

# Test CORS (replace with actual file URL)
curl -I https://firebasestorage.googleapis.com/v0/b/the-spartan-cup.appspot.com/o/badges%2Ftest.svg
```

## Troubleshooting

**Error: "gsutil command not found"**
- Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
- Or skip CORS config for now (usually works without it)

**Error: "Permission denied"**
- Make sure you're logged in: `firebase login`
- Check project: `firebase use the-spartan-cup`

**Upload fails in browser:**
- Check browser console for specific error
- Verify Storage is enabled in Firebase Console
- Verify storage.rules deployed successfully

## What Happens Next

Once setup is complete:
1. Admins upload badge images in Admin Dashboard
2. Images automatically upload to Firebase Storage
3. Public URL returned immediately
4. Badge displays instantly (no deployment needed)
5. Backup copy saved to Google Drive

## Cost

FREE - Within Firebase free tier for your usage.
