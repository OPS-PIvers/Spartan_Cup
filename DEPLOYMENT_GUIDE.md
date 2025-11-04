# Deployment Guide - Spartan Cup

Complete deployment procedures, environment management, and troubleshooting for the Spartan Cup application.

---

## Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Current Deployments](#current-deployments)
3. [Deployment Procedures](#deployment-procedures)
4. [Environment Strategy](#environment-strategy)
5. [Rollback Procedures](#rollback-procedures)
6. [Troubleshooting](#troubleshooting)

---

## Deployment Overview

The Spartan Cup application consists of two deployment components:

1. **Google Apps Script (GAS)** - Backend and web app
2. **Firebase Hosting** - Geolocation wrapper for iOS Safari support

Both must be deployed together to ensure compatibility.

---

## Current Deployments

### Google Apps Script Deployments

| Deployment | ID | Description | Status |
|------------|------|-------------|--------|
| **@79** | `AKfycbzox9ZqfP5FWJrJUpBnpUdBT8PPnDl-NroRfCUbjpPnTpllVpZS__y3pKNV13j4CX_j` | **Production** - Fix postMessage origin mismatch | ✅ Active |
| @6 | `AKfycbwpwlNmxO25IeWbtR7TkJOs48Uh189iQ1BjGWw9K1--4PVwq0z7Px9X1MOm6OvWbWkg` | Legacy production | ⚠️ Archived |
| @HEAD | `AKfycbxnL_zYuhO3eT7rQ5MaJoKeibrd1_OHxJw0t1kSaUU` | Latest code (test deployment) | 🔧 Development |

**Script ID:** `1zBesihOJkPYyOXtKyISnhjvc50n78du4JvAm_8DPQr62QGAXrnn3H9kC`

**Production URL:**
```
https://script.google.com/a/macros/orono.k12.mn.us/s/AKfycbzox9ZqfP5FWJrJUpBnpUdBT8PPnDl-NroRfCUbjpPnTpllVpZS__y3pKNV13j4CX_j/exec
```

### Firebase Hosting

| Component | URL | Status |
|-----------|-----|--------|
| **Firebase Project** | `the-spartan-cup` | ✅ Active |
| **Hosting URL** | `https://the-spartan-cup.web.app` | ✅ Live |
| **Geolocation Wrapper** | `public/index.html` | ✅ Points to @79 |

---

## Deployment Procedures

### Quick Deploy (Both Components)

Use the `/deploy` slash command:

```bash
/deploy
```

This will:
1. Push code changes to Google Apps Script (`clasp push`)
2. Update deployment @79 (`clasp deploy --deploymentId ...`)
3. Deploy Firebase wrapper (`firebase deploy --only hosting`)

### Manual Deployment Steps

#### 1. Deploy Google Apps Script

```bash
# Navigate to project directory
cd /workspaces/Spartan_Cup

# Push code changes
clasp push

# Deploy to production (@79)
clasp deploy --deploymentId AKfycbzox9ZqfP5FWJrJUpBnpUdBT8PPnDl-NroRfCUbjpPnTpllVpZS__y3pKNV13j4CX_j --description "Production deployment"

# Verify deployment
clasp deployments
```

#### 2. Deploy Firebase Hosting

```bash
# Deploy geolocation wrapper
firebase deploy --only hosting

# Verify deployment
firebase hosting:channel:list
```

#### 3. Verify Integration

After deploying both components:

1. Open `https://the-spartan-cup.web.app` in a browser
2. Grant location permission when prompted
3. Verify redirect to GAS app with location parameters
4. Check browser console for `[Location]` logs
5. Navigate to profile page and verify data loads
6. Test auto-submit feature

---

## Environment Strategy

### Production Environment (@79)

**When to use:**
- All user-facing features
- Testing with real users
- Production data

**Deployment:** Versioned deployment @79

**URL:** `https://script.google.com/a/macros/orono.k12.mn.us/s/AKfycbzox9...4CX_j/exec`

### Development Environment (@HEAD)

**When to use:**
- Testing new features
- Debugging
- Breaking changes

**Deployment:** Test deployment (always latest code)

**URL:** Available via Google Apps Script editor → Deploy → Test deployments

### How to Switch Environments

**Switch Firebase wrapper to different deployment:**

1. Edit `public/index.html`
2. Update `GAS_APP_URL` constant (line 128)
3. Deploy: `firebase deploy --only hosting`

**Switch to @HEAD for testing:**

```javascript
// public/index.html line 128
const GAS_APP_URL = 'https://script.google.com/a/macros/orono.k12.mn.us/s/AKfycbxnL_zYuhO3eT7rQ5MaJoKeibrd1_OHxJw0t1kSaUU/dev';
```

**Switch back to production (@79):**

```javascript
// public/index.html line 128
const GAS_APP_URL = 'https://script.google.com/a/macros/orono.k12.mn.us/s/AKfycbzox9ZqfP5FWJrJUpBnpUdBT8PPnDl-NroRfCUbjpPnTpllVpZS__y3pKNV13j4CX_j/exec';
```

---

## Rollback Procedures

### Rollback Google Apps Script

If @79 has issues, rollback to @6:

```bash
# Option 1: Update Firebase wrapper to point to @6
# Edit public/index.html line 128
const GAS_APP_URL = 'https://script.google.com/a/macros/orono.k12.mn.us/s/AKfycbwpwlNmxO25IeWbtR7TkJOs48Uh189iQ1BjGWw9K1--4PVwq0z7Px9X1MOm6OvWbWkg/exec';

# Deploy Firebase wrapper
firebase deploy --only hosting

# Option 2: Create new deployment from working version
clasp deploy --versionNumber 6 --description "Rollback to v6"
```

### Rollback Firebase Hosting

Firebase Hosting maintains deployment history:

```bash
# List previous deployments
firebase hosting:clone SOURCE_SITE_ID:SOURCE_CHANNEL_ID TARGET_SITE_ID:live

# OR redeploy from git history
git checkout <previous-commit>
firebase deploy --only hosting
git checkout main
```

---

## Troubleshooting

### Common Issues

#### Issue: "Unsafe attempt to navigate" Error

**Symptoms:**
- Navigation fails after clicking buttons
- Console shows sandbox navigation error

**Cause:** User activation chain broken by async operations or browser dialogs

**Solution:**
- Remove `confirm()` dialogs before navigation
- Remove `setTimeout()` before navigation
- Use custom modals instead (see Modals.html)

#### Issue: Profile Data Never Loads (Perpetual "Loading...")

**Symptoms:**
- Profile page shows "Loading..." forever
- Console shows postMessage errors

**Cause:** Deployment ID mismatch between Firebase wrapper and GAS

**Solution:**
```bash
# 1. Verify Firebase wrapper points to correct deployment
cat public/index.html | grep GAS_APP_URL

# 2. Verify deployment is active
clasp deployments

# 3. Redeploy both components
clasp push
clasp deploy --deploymentId AKfycbzox9...4CX_j
firebase deploy --only hosting

# 4. Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)
```

#### Issue: Location Not Captured on iOS Safari

**Symptoms:**
- iOS Safari doesn't prompt for location
- Auto-submit shows "location permission denied"

**Causes & Solutions:**

1. **Firebase wrapper not deployed:**
   ```bash
   firebase deploy --only hosting
   ```

2. **Wrong URL in wrapper:**
   - Verify `GAS_APP_URL` in `public/index.html` points to @79
   - Redeploy: `firebase deploy --only hosting`

3. **iOS Settings:**
   - Settings → Safari → Location Services → While Using
   - Clear Safari cache and try again

4. **Browser cache:**
   - Clear Safari cache on iPhone
   - Try in private browsing mode

#### Issue: Auto-Submit Not Detecting Events

**Symptoms:**
- "No events found" message
- Events exist in Event_Schedule sheet

**Solutions:**

1. **Check event status:**
   - Open Event_Schedule sheet
   - Verify Status column = "Active"
   - Verify Date column is today or in the past

2. **Check location:**
   - Verify you're within 100m of event
   - Check event coordinates in Event_Schedule

3. **Check console logs:**
   - Open browser console
   - Look for `[Auto-Submit]` logs
   - Verify location is being passed correctly

#### Issue: Firebase Deployment Fails

**Symptoms:**
```
Error: HTTP Error: 403, The caller does not have permission
```

**Solutions:**

1. **Re-authenticate:**
   ```bash
   firebase logout
   firebase login
   ```

2. **Verify project:**
   ```bash
   firebase projects:list
   firebase use the-spartan-cup
   ```

3. **Check IAM permissions:**
   - Go to Firebase Console → Project Settings
   - Verify your account has "Editor" or "Owner" role

#### Issue: Clasp Push Fails

**Symptoms:**
```
Error: insufficient_scope
```

**Solutions:**

1. **Re-authenticate:**
   ```bash
   clasp logout
   clasp login
   ```

2. **Check .clasp.json:**
   ```bash
   cat .clasp.json
   # Verify scriptId matches your project
   ```

3. **Verify permissions:**
   - Open Google Apps Script editor
   - Verify you have edit access

---

## Deployment Checklist

Use this checklist when deploying to production:

### Pre-Deployment

- [ ] All tests passing (manual testing complete)
- [ ] Code changes reviewed
- [ ] No console errors in development
- [ ] Profile data loads correctly
- [ ] Auto-submit feature works
- [ ] Admin dashboard accessible

### Deployment

- [ ] Run `clasp push` - no errors
- [ ] Run `clasp deploy --deploymentId <ID>` - deployment successful
- [ ] Run `firebase deploy --only hosting` - deployment successful
- [ ] Verify `clasp deployments` shows updated deployment

### Post-Deployment

- [ ] Open `https://the-spartan-cup.web.app`
- [ ] Grant location permission
- [ ] Verify redirect to GAS app
- [ ] Check browser console - no errors
- [ ] Profile page loads real data
- [ ] Auto-submit detects events
- [ ] Submission workflow complete
- [ ] Admin dashboard works
- [ ] Test on iOS Safari (critical!)

---

## Maintenance

### Regular Maintenance Tasks

**Weekly:**
- Monitor submission logs in Sheets
- Check for console errors
- Verify profile data accuracy

**Monthly:**
- Review deployment history
- Clean up old deployments
- Update dependencies if needed

**As Needed:**
- Update event schedule
- Add/remove admin users
- Adjust geofence coordinates

### Monitoring

**Key Metrics to Monitor:**

1. **User Submissions:**
   - Check Submissions_Pending sheet
   - Verify submissions are being created

2. **Profile Data:**
   - Verify points are calculating correctly
   - Check leaderboard rankings

3. **Location Accuracy:**
   - Check submission locations in Drive
   - Verify geofence validation

4. **Error Logs:**
   - Check Apps Script execution logs
   - Monitor browser console errors

---

## Contact & Support

For deployment issues:

1. **Check this guide first** - Most issues are covered here
2. **Review [CLAUDE.md](CLAUDE.md)** - Development documentation
3. **Check [README.md](README.md)** - General troubleshooting
4. **Review recent commits** - May explain breaking changes

---

## Appendix: Deployment History

### Recent Deployments

| Date | Deployment | Changes | Notes |
|------|-----------|---------|-------|
| 2025-11-04 | @79 | Fix postMessage origin mismatch | Current production |
| Previous | @6 | Complete implementation with all features | Legacy production |

### Breaking Changes

**@79 (Current):**
- Fixed postMessage security error
- Added `isAdmin` to `getProfileData()` error handler
- Updated Firebase wrapper to point to @79

**@6 (Previous):**
- Auto-submit feature
- Client-side admin check
- Real profile data loading

---

**Last Updated:** 2025-11-04
**Maintained By:** Development Team
**Version:** 1.0
