# Spartan Cup - Performance Analysis Report

## Executive Summary

The Spartan Cup application exhibits several performance characteristics typical of Google Apps Script applications, with some significant bottlenecks that could impact user experience at scale. The architecture relies heavily on synchronous Sheets API calls and full-dataset reads, creating latency concerns during peak usage periods.

---

## 1. CRITICAL PERFORMANCE BOTTLENECKS

### A. Excessive Full-Spreadsheet Reads (PRIMARY ISSUE)

**Finding**: 33 instances of `getDataRange().getValues()` in Code.js

The application reads entire Sheets in multiple functions:

1. **getProfileData()** - Called on every profile/history page load
   - Reads: Student_Profiles (all rows), Config_Badges, Submissions_Verified, Submissions_Pending, Events
   - Operations: 5 full-sheet reads
   - Impact: Loads ALL student records, ALL badges, ALL submissions to build leaderboards
   - Scalability: O(n) where n = total students. With 200+ students, this becomes very slow

2. **getAdminQueue()** - Called when admin opens dashboard
   - Reads: Submissions_Pending (all), Events (all)
   - Impact: Retrieves every pending submission (no pagination)
   - Issue: Queue could become unwieldy with many submissions

3. **submitEvent()** - Called on every photo submission
   - Validates against: Config_Event_Codes (full read)
   - Searches for duplicate submissions by iterating all pending/verified records
   - Multiple database hits in sequence

4. **getEventsByDistance()** - Called when user selects "Find Events"
   - Reads: Config_Event_Codes (all events, all fields)
   - Searches through entire dataset to find active events
   - Calculates distance for every single event

5. **approveSubmission()** - Called by admin for each approval
   - Reads: Submissions_Pending (all), Student_Profiles (all), Events (all)
   - Updates Student_Profiles row-by-row

### B. Repeated Data Reads in Single Page Load

**getProfileData()** does 5 sequential Sheets API calls:
```
1. Student_Profiles full read (to find user + build leaderboard)
2. Config_Badges full read (to build badge map)
3. Submissions_Verified full read (to build history)
4. Events full read (to map event IDs to names)
5. Submissions_Pending full read (to add pending to history)
```

All these calls happen synchronously, blocking the page render.

### C. O(n) Linear Search Operations

Every function that needs to find a specific record uses a `for` loop:
- `getProfileData()` - Line 261: searches Student_Profiles for current user
- `findEventIdByCode()` - searches Events for specific event
- `approveSubmission()` - Line 2460: searches Submissions_Pending for submission ID
- `calculateBadges()` - Line 2673: searches Student_Profiles for student
- `getUserDisplayName()` - Line 56: searches Student_Profiles for user
- `getAdminEmails()` - Line 31: searches Config_Admins (small dataset, acceptable)

**Impact**: If Submissions_Pending grows to 1000 rows, each approval takes 1000 iterations to find the submission.

---

## 2. GAS REQUEST FREQUENCY ANALYSIS

### Peak Traffic Scenarios

**Scenario 1: Student browsing app (typical session)**
- Page load (profile): 1 `getProfileData()` call = 5 Sheets reads
- Switch to history: 1 `getProfileData()` call = 5 more Sheets reads (duplicate)
- Click submit: 1 `getEventDetails()` call
- View location status: 1 `testLocationAccess()` call (browser geolocation, not GAS)
- Submit photo: 1 `submitEvent()` call = multiple Sheets reads for validation

**Total per submission session**: 11+ Sheets API calls

**Scenario 2: Admin reviewing submissions**
- Open admin page: 1 `getAdminQueue()` call = 2 full Sheets reads
- Approve submission: 1 `approveSubmission()` call = 3 full Sheets reads
- Approve again: 1 more approval = 3 more reads (same data, no cache)

**Total per 10 approvals**: 32+ Sheets API calls

### Current Caching Status

**Frontend Caching (JavaScript.html)**:
- Location: 5-minute session cache via `sessionStorage` ✓ Good
- Dark mode preference: localStorage ✓ Good
- Other data: NO CACHING ✗

**Backend Caching (Code.js)**:
- NO CACHING - Every call reads from scratch

**Missing Cache Targets**:
- Student leaderboard data (static within session)
- Event list (static for hours)
- Badge definitions (static)
- Admin email list (read 3+ times per admin approval)

---

## 3. FRONTEND PERFORMANCE ISSUES

### A. DOM Manipulation Inefficiency

**File**: JavaScript.html, Lines 592-604

```javascript
function updateLeaderboardDisplay(leaderboard) {
  const lbContainer = document.getElementById('leaderboard-container');
  lbContainer.innerHTML = ''; // Clear
  leaderboard.forEach(item => {
    lbContainer.innerHTML += `...`; // INEFFICIENT: Creates 5+ DOM reflows
  });
}
```

**Problem**: Using `innerHTML +=` causes browser to:
1. Serialize existing DOM to string
2. Concatenate new HTML
3. Parse entire string back to DOM
4. Reflow/repaint

**Impact per call**: 10 DOM reflows (once per item)
**Frequency**: Every time leaderboard toggles or page loads

Similarly in Lines 621 (badges) and 642 (history).

### B. Photo Compression on Frontend

**File**: JavaScript.html, Lines 803-828

The form submission handler performs:
1. FileReader.readAsDataURL() - full file to memory
2. Image.onload - decode image
3. Canvas render - resize image
4. canvas.toDataURL() - re-encode as JPEG
5. Base64 encode - bloats size by 33%

**Impact**:
- 3MB photo becomes 4MB base64 string in memory
- Sent to GAS, then base64 decoded, re-encoded to Drive
- Total processing time: 2-5 seconds on mobile

---

## 4. DATA FLOW BOTTLENECKS

### Request Flow for Common Operations

**User views profile page:**
```
1. Page load
2. doGet() called
   - getUserDisplayName() → reads Student_Profiles
   - getUserProfilePhoto() → queries Drive
   - getAdminEmails() → reads Config_Admins
   - getUserSettings() → reads Student_Profiles again
3. DOMContentLoaded fires
4. getProfileData() called → reads 5 sheets (Students, Badges, Verified, Events, Pending)
Total: 6-7 Sheets API calls in ~2 seconds
```

**User submits photo:**
```
1. handleFormSubmit() starts
2. requestLocation() - browser geolocation (may cache)
3. Photo resize loop
4. submitEvent() called
   - validateEventSubmission()
     - getActiveEvents() → reads Config_Event_Codes
   - findVerifiedSubmission() → reads Submissions_Verified
   - findPendingSubmission() → reads Submissions_Pending
   - savePhotoToDrive() → DriveApp calls (slower)
5. appendRow() to Submissions_Pending
Total: 4 Sheets API calls + Drive I/O (5-10 seconds total)
```

---

## 5. PHOTO/IMAGE HANDLING PERFORMANCE

### Issues

1. **Base64 Encoding**: All photos sent as base64 strings, inflating size by 33%
2. **No Compression**: Client resizes to 800x600 but doesn't optimize
3. **Sequential Processing**:
   - Client resizes → Server receives → Server base64 decodes → Server saves to Drive
4. **Drive File Operations**: `DriveApp.createFile()` is slow for large uploads
5. **No Concurrent Uploads**: Single-threaded JavaScript blocks on photo save

### Typical Photo Flow Time
- Select 3MB photo: 0.5s
- Resize to 800x600: 1-2s
- Base64 encode: 1s
- Transmit to GAS: 2-3s
- Save to Drive: 2-5s
- **Total**: 7-12 seconds for one submission

---

## 6. IDENTIFIED REPEATED/REDUNDANT QUERIES

### getAdminEmails() - Called 3+ times per operation
- Line 84 (doGet - every page load)
- Line 2447 (approveSubmission check)
- Line 2554 (denySubmission check)

**Potential**: Cache for session (doesn't change during user session)

### Student_Profiles reads
- Line 53 (getUserDisplayName)
- Line 169 (getUserSettings)
- Line 223 (saveUserSettings)
- Line 258 (getProfileData)
- Line 2498 (approveSubmission - to update points)
- Line 2632 (getBadgeData)
- Line 2668 (calculateBadges)

**Pattern**: User data read separately 7 times when one read could serve all needs

### Event data reads
- Line 390 (getProfileData)
- Line 2390 (getAdminQueue)
- Line 2517 (approveSubmission)

**Pattern**: Same static event data read 3+ times per admin operation

---

## 7. FIREBASE WRAPPER IMPACT (POSITIVE)

**Finding**: Location geofencing is correctly optimized
- Firebase wrapper captures location BEFORE GAS iframe loads
- Location cached 5 minutes in sessionStorage
- Prevents repeated geolocation requests
- iOS Safari compatibility workaround

**Performance Gain**: Saves geolocation request on repeat submissions (within 5-min window)

---

## 8. POTENTIAL SCALING ISSUES

### Current Architecture Limits

**At 300+ students**:
- `getProfileData()` reads 300+ rows, sorts all students, builds leaderboards
- Every profile page load: 300+ row iteration
- Response time: 3-5 seconds

**At 500+ pending submissions**:
- Admin queue page: reads 500+ pending rows
- Each approval: 500+ iteration to find submission
- Admin dashboard becomes unusable

**At 1000+ verified submissions**:
- History page: iterates 1000+ rows to build user history
- User experiences 5-10 second delay

---

## 9. WHERE GAS REQUESTS HAPPEN MOST

### High-Frequency Operations (per session)
1. **getProfileData()** - Every profile/history page visit (5 sheets reads each)
2. **submitEvent()** - Every submission (4+ Sheets reads)
3. **getAdminQueue()** - Every admin dashboard open (2 sheets reads)

### Medium-Frequency
4. **getEventsByDistance()** - When user selects event-select page
5. **getEventDetails()** - When event code populated (1 sheet read)
6. **updateLocationStatus()** - Browser geolocation test (no GAS)

### Low-Frequency
7. **approveSubmission()** / **denySubmission()** - Admin actions (3+ reads each)
8. **getUserProfilePhoto()** - Page load (1 Drive query)

---

## 10. CACHING OPPORTUNITIES FOR FIREBASE CLOUD FUNCTIONS

Without moving data, Firebase Cloud Functions could optimize by:

1. **Location verification caching**
   - Currently: Geofence check done in GAS for each submission
   - Opportunity: Firebase caches campus coordinates, performs local distance check
   - Benefit: Faster geofence validation (Firebase edge vs. GAS cold start)

2. **Event data caching**
   - Currently: Config_Event_Codes read from Sheets repeatedly
   - Opportunity: Firebase Cloud Function fetches once/hour, caches in Firestore
   - Benefit: 10x faster event lookups without Sheets API hits

3. **Leaderboard pre-computation**
   - Currently: Calculated on-demand from Student_Profiles (slow for 300+ students)
   - Opportunity: Firebase function pre-sorts/ranks nightly, stores in Firestore
   - Benefit: Profile page loads in <500ms instead of 3-5s

4. **Admin approval workflows**
   - Currently: Approval reads 3 sheets sequentially
   - Opportunity: Firebase function orchestrates approval atomically, caches admin emails
   - Benefit: Admin operations are instant

5. **Photo metadata indexing**
   - Currently: No way to quickly search submissions by date/event
   - Opportunity: Firebase indexes submissions, enables pagination in admin queue
   - Benefit: Large admin queues become manageable

### Firebase Advantage: No data movement needed
- Firebase Cloud Functions call same Sheets API
- Add caching layer WITHOUT replacing Sheets
- Hybrid approach: Sheets as source-of-truth, Firebase as cache

---

## SUMMARY TABLE

| Metric | Current | Issue | Impact |
|--------|---------|-------|--------|
| Full-sheet reads per profile load | 5 | No indexing | 2-5s latency |
| GAS calls per submission | 4+ | Sequential | 5-10s submission time |
| Admin approvals (sheets reads) | 3 per action | Repeated reads | Slow admin workflow |
| Photo processing | 7-12s | Base64 encoding, client resize | Poor mobile UX |
| Leaderboard DOM updates | 10 reflows | innerHTML += | 200ms rendering |
| Frontend data caching | 2/10 metrics | Missing cache strategy | Page thrashing |
| Backend data caching | 0/10 metrics | No caching layer | Repeated DB hits |
| Scaling limit | ~300 students | O(n) queries | Unusable at scale |

---

## RECOMMENDATIONS

1. **Immediate (Easy wins)**
   - Fix DOM innerHTML += usage, batch updates
   - Add sheet read caching to doGet() using CacheService
   - Batch multiple User_Profiles reads into one call

2. **Short-term (Moderate effort)**
   - Implement Firebase Cloud Functions for event/admin caching
   - Paginate admin queue (20 submissions per load)
   - Use Sheets batchGet API instead of full getDataRange()

3. **Medium-term (Significant effort)**
   - Move frequently-read data to Firestore cache layer
   - Pre-compute leaderboards nightly
   - Implement efficient photo storage with CDN

4. **Long-term (Architecture changes)**
   - Consider moving to full Cloud Functions + Firestore architecture
   - Implement real-time updates via Firestore listeners
   - Add background job queue for submission processing

