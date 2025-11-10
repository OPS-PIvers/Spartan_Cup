# Firebase Storage Setup for Badge Images

This guide explains how to configure Firebase Storage for automated badge image uploads directly from the Admin Dashboard.

## Overview

With Firebase Storage configured, admins can upload badge images that are **automatically and immediately available** without any manual deployment steps. Images are uploaded to Firebase Storage and also backed up to Google Drive.

## Prerequisites

- Firebase project already set up (`the-spartan-cup`)
- Firebase CLI installed
- Admin access to Firebase Console

## Step 1: Enable Firebase Storage

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **the-spartan-cup**
3. Click **Build** → **Storage** in the left sidebar
4. Click **Get Started**
5. Choose **Start in production mode** (we'll configure rules next)
6. Select your preferred Cloud Storage location (e.g., `us-central1`)
7. Click **Done**

## Step 2: Configure Storage Security Rules

1. In Firebase Console → Storage → **Rules** tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Public read access for badge images
    match /badges/{imageFile} {
      allow read: if true;  // Anyone can view badges
      allow write: if request.auth != null;  // Only authenticated users can upload
    }

    // Block all other access
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

3. Click **Publish**

**What this does:**
- Badge images in `/badges/` folder are publicly readable (required for app to display them)
- Only authenticated users can upload (optional security layer)
- All other paths are blocked

## Step 3: Get Firebase Configuration

1. In Firebase Console, click the **gear icon** ⚙️ → **Project settings**
2. Scroll down to **Your apps** section
3. If no web app exists, click **Add app** → **Web** (</>) icon
4. Register app name: "Spartan Cup Web App"
5. Copy the **firebaseConfig** object:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "the-spartan-cup.firebaseapp.com",
  projectId: "the-spartan-cup",
  storageBucket: "the-spartan-cup.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

## Step 4: Update Firebase Config in Code

1. Open `/home/user/Spartan_Cup/Index.html`
2. Find the Firebase configuration section (around line 34)
3. Replace the placeholder values with your actual config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY_HERE",
  authDomain: "the-spartan-cup.firebaseapp.com",
  projectId: "the-spartan-cup",
  storageBucket: "the-spartan-cup.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

4. Save the file
5. Deploy to Google Apps Script: `clasp push`

## Step 5: Configure CORS (Optional)

If you encounter CORS errors, configure Cloud Storage CORS:

1. Create a file `cors.json`:

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "PUT", "POST"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"]
  }
]
```

2. Install Google Cloud SDK if not installed
3. Run:

```bash
gsutil cors set cors.json gs://the-spartan-cup.appspot.com
```

## Step 6: Test the Upload

1. Deploy code to Google Apps Script: `clasp push`
2. Open Admin Dashboard → Badges tab
3. Fill out badge form and upload an image
4. Click "Create Badge"
5. You should see: "✅ Badge saved successfully!"

### Verification:

**Check Firebase Storage:**
1. Go to Firebase Console → Storage
2. Navigate to `badges/` folder
3. You should see your uploaded image (e.g., `first_timer.svg`)

**Check in App:**
1. Refresh the Admin Dashboard
2. Badge should display with uploaded image
3. Check browser console - no 404 errors for badge images

## How It Works

### Upload Flow:

1. **Admin uploads image** in badge form
2. **JavaScript converts** base64 to blob
3. **Firebase Storage SDK uploads** directly to Cloud Storage at `badges/{filename}`
4. **Firebase returns** public download URL
5. **Backend saves** badge with Firebase URL + backup to Google Drive
6. **Image is immediately available** - no deployment needed!

### File Naming:

Badge names are automatically converted to snake_case:

| Badge Name | Filename |
|------------|----------|
| First Timer | first_timer.svg |
| Super Fan 100 | super_fan_100.png |
| Season Champ! | season_champ.svg |

### Storage Structure:

```
gs://the-spartan-cup.appspot.com/
└── badges/
    ├── first_timer.svg
    ├── super_fan.svg
    ├── bronze_points.png
    └── season_champ.svg
```

## Troubleshooting

### Error: "Firebase Storage: Object 'badges/...' does not exist"

**Cause:** Image hasn't been uploaded yet or upload failed

**Solution:**
1. Check browser console for upload errors
2. Verify Firebase Storage is enabled
3. Check security rules allow writes

### Error: "Permission denied. Could not perform this operation"

**Cause:** Storage security rules blocking upload

**Solution:**
1. Check storage rules in Firebase Console
2. Temporarily set to test mode for debugging:
```javascript
match /badges/{imageFile} {
  allow read, write: if true;
}
```
3. Test upload
4. Restore production rules after testing

### Error: "CORS policy blocked"

**Cause:** Cross-origin request blocked by Cloud Storage

**Solution:**
1. Configure CORS using gsutil (see Step 5 above)
2. Or set rules via Firebase Console

### Image not displaying

**Cause:** Various potential issues

**Solution:**
1. Check browser console for 404 or CORS errors
2. Verify image URL in Config_Badges sheet
3. Check image exists in Firebase Storage
4. Clear browser cache
5. Check image is publicly readable (test URL in incognito)

## Cost Considerations

Firebase Storage free tier (Spark plan):
- **Storage:** 5 GB (plenty for thousands of badge images)
- **Downloads:** 1 GB/day (sufficient for typical usage)
- **Uploads:** 20k/day (more than enough)

For Spartan Cup usage (hundreds of students, dozens of badges):
- **Expected usage:** < 50 MB storage
- **Expected cost:** $0/month (within free tier)

## Security Best Practices

1. **Read access:** Keep badge images publicly readable (required for app)
2. **Write access:** Require authentication or remove after initial setup
3. **API key:** Safe to include in client code (restricted by Firebase rules)
4. **Storage rules:** Review regularly, follow principle of least privilege

## Backup Strategy

Badge images are stored in **two locations**:

1. **Primary: Firebase Storage** (`gs://the-spartan-cup.appspot.com/badges/`)
   - Fast CDN delivery
   - Automatic scaling
   - Direct admin uploads

2. **Backup: Google Drive** ("The Spartan Cup" → "Assets_Badges")
   - Automatic backup on every upload
   - Manual recovery if needed
   - Historical versions available

## Migration from Manual Deployment

If you previously used the manual Firebase Hosting deployment:

1. **New badges:** Automatically use Firebase Storage (no action needed)
2. **Existing badges:** Can continue using Hosting URLs or re-upload
3. **Hybrid approach:** Both systems work simultaneously

**To migrate existing badges:**
1. Open Admin Dashboard → Badges tab
2. Click "Edit" on existing badge
3. Re-upload the image (downloads from Drive, uploads to Storage)
4. Firebase Storage URL replaces Hosting URL

## Support

If you encounter issues:
1. Check Firebase Console → Storage → Files (verify upload)
2. Check browser console (F12) for JavaScript errors
3. Check Google Apps Script logs for backend errors
4. Verify Firebase config values are correct
5. Test with a minimal image (< 100 KB SVG)

---

**Last Updated:** 2025-11-08
