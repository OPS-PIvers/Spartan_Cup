# Badge Image Deployment Guide

This guide explains how to deploy badge images from Google Drive to Firebase Hosting after creating them in the Admin Dashboard.

## Overview

When you create or edit a badge in the Admin Dashboard:
1. The image is uploaded to **Google Drive** (folder: "The Spartan Cup" → "Assets_Badges")
2. The filename is automatically converted to **snake_case** (e.g., "First Timer" → "first_timer.svg")
3. The Firebase URL is automatically generated and saved in the Config_Badges sheet
4. You manually deploy the image to Firebase Hosting

## Step-by-Step Deployment Process

### 1. Create/Edit Badge in Admin Dashboard

1. Open the Spartan Cup app and navigate to **Admin → Badges tab**
2. Fill out the badge form:
   - Badge Name (e.g., "First Timer")
   - Category (Participation, Points, Special, Season)
   - Trigger Type (event_count, points_threshold, season_points, manual)
   - Trigger Value (numeric threshold)
   - Description
   - Upload badge image (SVG or PNG recommended, max 2MB)
3. Click **"Create Badge"** or **"Update Badge"**
4. Note the Firebase URL shown in the success message

### 2. Download Badge Image from Google Drive

1. Go to [Google Drive](https://drive.google.com)
2. Navigate to: **"The Spartan Cup"** → **"Assets_Badges"**
3. Find your badge image file (it will be named in snake_case, e.g., `first_timer.svg`)
4. Right-click the file and select **"Download"**
5. Save it to your local computer

### 3. Add Image to Firebase Project

1. Open your local Spartan Cup project folder
2. Navigate to the `/public/badges/` folder
3. Copy the downloaded badge image into this folder
4. Verify the filename matches the snake_case format (e.g., `first_timer.svg`)

### 4. Deploy to Firebase Hosting

1. Open a terminal/command prompt in your project folder
2. Run the Firebase deployment command:
   ```bash
   firebase deploy --only hosting
   ```
3. Wait for deployment to complete (usually 10-30 seconds)
4. Verify deployment success message

### 5. Verify Badge is Live

1. Open the Firebase URL in a browser to test:
   ```
   https://the-spartan-cup.web.app/badges/your_badge_name.svg
   ```
2. The image should display correctly
3. Refresh the Spartan Cup app to see the badge with its proper image

## Automated Snake Case Naming

Badge names are automatically converted to snake_case filenames:

| Badge Name | Filename |
|------------|----------|
| First Timer | first_timer.svg |
| Super Fan | super_fan.svg |
| 100 Points! | 100_points.svg |
| Season Champ | season_champ.svg |

Special characters are removed, spaces become underscores, and everything is lowercase.

## Image Format Recommendations

**Best Practices:**
- **Format:** SVG (vector) for best quality at any size, or PNG with transparent background
- **Size:** 256x256px minimum (square dimensions)
- **File Size:** Under 100KB for fast loading
- **Background:** Transparent backgrounds work best
- **Colors:** High contrast designs show better on both light/dark modes

## Troubleshooting

### Badge Image Not Showing

**Problem:** Badge displays with default/broken image icon

**Solutions:**
1. Check if image exists in `/public/badges/` folder
2. Verify filename matches snake_case format exactly
3. Ensure Firebase deployment completed successfully
4. Check browser console for 404 errors
5. Clear browser cache and refresh

### Upload Failed

**Problem:** Badge creation fails during image upload

**Solutions:**
1. Verify image is under 2MB
2. Check file format is SVG, PNG, or JPG
3. Ensure Google Drive folder "Assets_Badges" exists
4. Check admin permissions in Google Drive

### Wrong Filename

**Problem:** Downloaded file doesn't match expected snake_case name

**Solutions:**
1. Manually rename the file to match the pattern
2. The Config_Badges sheet has the expected Firebase URL - extract the filename from there
3. Use all lowercase, underscores instead of spaces, no special characters

## Batch Deployment

If you have multiple badges to deploy:

1. Download all badge images from Drive "Assets_Badges" folder
2. Copy all images to `/public/badges/` at once
3. Run `firebase deploy --only hosting` once
4. All badges will be deployed together

## Alternative: Direct Firebase Storage (Future Enhancement)

Currently, badge images are deployed via Firebase Hosting (static files requiring CLI deployment). A future enhancement could use Firebase Storage with automatic uploads, eliminating the manual deployment step. However, this would require:
- Firebase Storage setup
- Cloud Function for upload handling
- Service account credentials
- Additional Firebase project configuration

The current Google Drive + manual deployment approach is simpler for small teams and doesn't require additional Firebase services.

## Quick Reference Commands

```bash
# Check Firebase project status
firebase projects:list

# Deploy only hosting (recommended for badges)
firebase deploy --only hosting

# View deployed badge
# Replace {badge_name} with actual filename
open https://the-spartan-cup.web.app/badges/{badge_name}.svg

# Example
open https://the-spartan-cup.web.app/badges/first_timer.svg
```

## Support

If you encounter issues:
1. Check the Google Apps Script execution logs
2. Verify Google Drive permissions
3. Ensure Firebase CLI is up to date: `npm install -g firebase-tools`
4. Check the Firebase Hosting status dashboard

---

**Last Updated:** 2025-11-08
