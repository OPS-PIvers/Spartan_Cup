# Badge Images

This folder contains badge images displayed in the Spartan Cup app.

## Adding Badge Images

1. **Upload images directly to this folder** via GitHub or local file system
2. **Recommended format:** PNG with transparent background
3. **Recommended size:** 256x256px (or any square dimensions)
4. **File naming:** Use lowercase with hyphens (e.g., `first-event.png`, `super-fan.png`)

## Updating Badge URLs in Google Sheets

After uploading images to this folder and deploying to Firebase:

1. Go to your Google Sheet's `Config_Badges` tab
2. In column G (`Badge_Image_URL`), enter the Firebase URL:
   ```
   https://the-spartan-cup.web.app/badges/YOUR-IMAGE-NAME.png
   ```

## Example Badge URLs

```
https://the-spartan-cup.web.app/badges/first-event.png
https://the-spartan-cup.web.app/badges/super-fan.png
https://the-spartan-cup.web.app/badges/perfect-attendance.png
https://the-spartan-cup.web.app/badges/default-badge.png
```

## Deploying Changes

After adding or updating badge images:

```bash
firebase deploy --only hosting
```

This uploads the images to Firebase's global CDN for fast loading.

## Default Badge

If a badge doesn't have an image URL or the image fails to load, the app will:
1. Try to load `default-badge.svg` (a generic Spartan Cup themed badge)
2. Fall back to a Material Icon if the default badge doesn't load

## Badge Image Tips

- Use transparent backgrounds for best appearance
- Keep file sizes under 100KB for fast loading
- Square dimensions work best (circular container will crop)
- High contrast designs show better on both light/dark modes
