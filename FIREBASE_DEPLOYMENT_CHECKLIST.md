# Firebase Wrapper Deployment & Monitoring Checklist

## Deployment Verification

### ✅ Pre-Deployment Checklist

- [ ] Firebase project created: `the-spartan-cup`
- [ ] Firebase CLI authenticated with correct Google account
- [ ] GAS wrapper code updated with correct GAS_APP_URL
- [ ] QR code page updated to point to Firebase URL
- [ ] All code pushed to remote with `clasp push`
- [ ] Firebase wrapper deployed with `firebase deploy --only hosting`

### ✅ Post-Deployment Verification

**Test on Desktop:**
- [ ] Open https://the-spartan-cup.web.app in Chrome
- [ ] Location permission prompt appears
- [ ] Grant permission
- [ ] Status updates to "✓ Location obtained! Loading app..."
- [ ] Browser redirects to GAS app
- [ ] URL contains `?lat=` `lon=` `acc=` parameters
- [ ] Browser console shows `[Wrapper] Location obtained, redirecting:` logs
- [ ] Browser console shows `[Location] Using location from Firebase wrapper` logs
- [ ] App loads and displays correctly
- [ ] Dark mode toggle works
- [ ] Navigation between pages works

**Test on iOS Safari:**
- [ ] Open https://the-spartan-cup.web.app on iPhone
- [ ] Location permission prompt appears (this is the fix!)
- [ ] Grant permission
- [ ] Status updates to "✓ Location obtained! Loading app..."
- [ ] Browser redirects to GAS app
- [ ] App loads and displays correctly
- [ ] Submit page shows location-verified status
- [ ] Can complete full submission workflow
- [ ] Photo uploads successfully
- [ ] Submission appears in Sheets

**Admin QR Code Verification:**
- [ ] Navigate to QR Code page (admin only)
- [ ] QR code displays correctly
- [ ] URL shown matches: `https://the-spartan-cup.web.app`
- [ ] Click "Test QR Code" button
- [ ] New window opens Firebase wrapper
- [ ] Can grant location and verify redirect works

## Monitoring First Week

### Daily Checks

**Firebase Console:**
1. Go to https://console.firebase.google.com/project/the-spartan-cup
2. Check **Hosting → Analytics:**
   - [ ] Verify requests are coming in
   - [ ] Expected bandwidth: ~200MB/day (well under free tier 1GB/day)
   - [ ] Check for any errors or failures
3. Check **Hosting → Errors:**
   - [ ] Should be minimal to none
   - [ ] If errors appear, check error details

**GAS Logs:**
1. Open Google Apps Script editor
2. Check execution logs for location-related errors
3. Look for patterns in `requestLocation()` calls

### Weekly Checklist (End of Week)

- [ ] Compile submissions from the week
- [ ] Check how many were from iOS Safari (verify improvement)
- [ ] Review any error reports from users
- [ ] Compare submission success rate to pre-deployment baseline
- [ ] Test on multiple iOS/Android devices if available

### Metrics to Track

Create a simple monitoring sheet with these columns:
| Date | iOS Submissions | Android Submissions | Desktop Submissions | Success Rate | Notes |
|------|-----------------|---------------------|-------------------|-------------|-------|
| Nov 3 | ? | ? | ? | % | First day |
| ... | ... | ... | ... | ... | ... |

**Target metrics:**
- iOS submissions should increase (fix was for iOS)
- Overall success rate: >95%
- Geolocation capture: >90% of users grant permission
- Wrapper load time: <2 seconds

## Rollback Procedure

### Instant Rollback (If wrapper breaks)

**Option 1: Use direct GAS URL (immediate)**
1. Edit [Page.qr-code.html](Page.qr-code.html) line 79:
   ```javascript
   const firebaseUrl = 'https://script.google.com/macros/d/1zBesihOJkPYyOXtKyISnhjvc50n78du4JvAm_8DPQr62QGAXrnn3H9kC/usercopy';
   ```
2. Run `clasp push`
3. Generate new QR codes
4. Done! App works immediately (but iOS Safari loses geolocation)

**Option 2: Disable wrapper in Firebase (if infrastructure broken)**
1. Delete public/index.html from Firebase
2. Run `firebase deploy --only hosting`
3. User hit to wrapper: will get 404
4. Meanwhile, use Option 1 above to direct QR codes to GAS

### Partial Rollback (Keep GAS updates, revert wrapper)

1. Open `/public/index.html` in this repo
2. Compare with backup from working deployment
3. Or deploy from a git tag: `git checkout tags/v1.0 -- public/index.html`
4. Run `firebase deploy --only hosting`

### Full Rollback (Revert all changes)

1. Revert to last known good commit:
   ```bash
   git revert <commit-hash>
   # OR
   git checkout <last-good-commit> -- .
   ```
2. Run both deployments:
   ```bash
   clasp push
   firebase deploy --only hosting
   ```

## Troubleshooting During Monitoring

### Problem: iOS users still not getting location

**Check these:**
1. Verify wrapper URL is correct in QR codes (should be `https://the-spartan-cup.web.app`)
2. Verify user has Safari Location Services enabled:
   - Settings → Safari → Location Services → "While Using" for Spartan Cup
3. Verify user is granting permission when prompt appears
4. Check browser console for error messages
5. Try clearing Safari cache on iPhone

**If still broken:**
- Check Firebase console for 5xx errors
- Verify GAS_APP_URL in `/public/index.html` is correct
- Check GAS script is deployed and accessible at that URL

### Problem: Wrapper loads but location not captured

**Check:**
1. User granted permission when prompt appeared
2. Browser console shows location logs
3. URL parameters (?lat=, ?lon=, ?acc=) are in the GAS URL
4. Check JavaScript.html `requestLocation()` function is properly checking APP_DATA

**Fix:**
- Clear browser cache and try again
- Try different browser/device to isolate issue
- Check browser console for JavaScript errors

### Problem: High error rate in Firebase console

**Common causes:**
- User denied location permission (expected, not an error)
- Timeout (user slow to grant permission)
- Geolocation unavailable (user in poor GPS area)

**Check:**
1. Look at actual error messages in Firebase logs
2. Review `/public/index.html` error handling
3. Verify GAS URL is still accessible
4. Check if GAS deployment has issues

## Performance Targets

| Metric | Target | Acceptable | Action if exceeded |
|--------|--------|-----------|-------------------|
| Wrapper load time | <1s | <2s | Optimize wrapper code |
| Location capture | >90% | >85% | Improve user instructions |
| Redirect success | >95% | >90% | Debug permission flow |
| Overall success rate | >95% | >90% | Investigate errors |
| GAS response time | <2s | <3s | Check GAS quota/performance |

## First Day Expectations

**Expected behavior:**
- Wrapper deploys successfully
- QR code points to wrapper
- Location permission works on desktop
- iOS Safari location permission works (the main fix)
- Android Chrome location works (unchanged)
- Some users might not grant permission (that's okay)
- Submissions without location should still work (fallback to cache)

**Early indicators it's working:**
- iOS users reporting "finally works!" messages
- More submissions from iOS devices
- Fewer geolocation-related errors in Sheets

## Long-term Maintenance

### Monthly Tasks
- [ ] Review Firebase bandwidth usage
- [ ] Check for any deprecation warnings
- [ ] Verify nothing changed with location permissions handling
- [ ] Keep wrapper code up to date with GAS changes

### Quarterly Tasks
- [ ] Review logs for patterns/issues
- [ ] Update monitoring sheet
- [ ] Test on new iOS/Android versions if available
- [ ] Document any lessons learned

### If Things Break
1. Check Firebase console for errors
2. Check GAS logs
3. Verify URLs are still correct
4. Test wrapper directly: https://the-spartan-cup.web.app
5. Use rollback procedure if needed
6. Contact Firebase support if infrastructure issue

## Emergency Contacts

- **Firebase Console:** https://console.firebase.google.com/project/the-spartan-cup
- **GAS Editor:** https://script.google.com (project 1zBesihOJkPYyOXtKyISnhjvc50n78du4JvAm_8DPQr62QGAXrnn3H9kC)
- **GitHub Repo:** Check git history for deployment status
- **Documentation:** See [FIREBASE_SETUP_GUIDE.md](FIREBASE_SETUP_GUIDE.md) and [README.md](README.md)
