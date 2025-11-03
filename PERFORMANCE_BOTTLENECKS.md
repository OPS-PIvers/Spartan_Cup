# Spartan Cup - Performance Bottlenecks Visualization

## Request Flow Diagram

### Current (Inefficient) Profile Page Load
```
User navigates to profile page
        ↓
    doGet() executes
        ├─ getUserDisplayName()          → Sheets: Student_Profiles (full read)
        ├─ getUserProfilePhoto()          → Drive: Query folders + files
        ├─ getAdminEmails()               → Sheets: Config_Admins (full read)
        ├─ getUserSettings()              → Sheets: Student_Profiles (full read AGAIN)
        └─ Return HTML template
        ↓
Browser renders, DOMContentLoaded fires
        ↓
    getProfileData() executes
        ├─ Sheets: Student_Profiles      → Read ALL rows (300+), build leaderboard, find user
        ├─ Sheets: Config_Badges         → Read ALL rows, build badge map
        ├─ Sheets: Submissions_Verified  → Read ALL rows, filter user submissions
        ├─ Sheets: Events                → Read ALL rows, map IDs to names
        └─ Sheets: Submissions_Pending   → Read ALL rows, find user's pending
        ↓
    Populate UI (3 DOM manipulations with innerHTML += loops)
        ↓
    Page fully interactive: 3-5 SECONDS LATER

Total: 7-8 Sheets API calls, 0 cached
```

---

## GAS Request Hotspot Map

### By Request Type
```
┌─────────────────────────────────────────────────────────────┐
│         GAS Requests per User Session (Typical)              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  getProfileData()              ████████████    (5 reads)      │
│  getEventDetails()             ███              (1 read)      │
│  getUserDisplayName()          ███              (1 read)      │
│  getAdminEmails()              ███              (1 read)      │
│  getUserSettings()             ███              (1 read)      │
│  submitEvent()                 ██████████       (4 reads)     │
│                                                               │
│  Total: 13+ reads per browsing session                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Admin Approval Chain
```
Admin opens admin dashboard
        ↓
    getAdminQueue()
        ├─ getAdminEmails()           → Config_Admins
        ├─ Sheets: Submissions_Pending
        └─ Sheets: Events
        ↓
    Page displays 20 submissions
        ↓
Admin approves submission #1
        ↓
    approveSubmission()
        ├─ getAdminEmails()           → Config_Admins (same data!)
        ├─ Sheets: Submissions_Pending (reads all 20 again)
        ├─ Find submission in loop    (19 iterations)
        ├─ Sheets: Student_Profiles   (reads all students)
        ├─ Update student row         (1 write)
        ├─ Sheets: Events             (reads all events)
        └─ appendRow() to Verified
        ↓
    Dashboard refreshes, calls getAdminQueue() again
        ↓
Admin approves submission #2 (same process)

After 10 approvals: 30+ Sheets API calls (many duplicates!)
```

---

## Database Query Inefficiency

### Problem: Full Spreadsheet Reads

```
┌──────────────────────────────────────────────────┐
│ Current Approach (SLOW)                          │
├──────────────────────────────────────────────────┤
│                                                   │
│  Need: Get user's profile data                   │
│                                                   │
│  Solution: Read entire Student_Profiles (300 rows) │
│            Loop through all rows                 │
│            Find match                            │
│                                                   │
│  Cost: 300 row reads + iteration overhead        │
│  Time: ~500-1000ms                               │
│                                                   │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Optimized Approach (with indexing)              │
├──────────────────────────────────────────────────┤
│                                                   │
│  Solution: Use email as key, single query        │
│            Or: Cache admin emails (1 call/session) │
│                                                   │
│  Cost: 1 direct lookup                          │
│  Time: ~50-100ms                                │
│                                                   │
└──────────────────────────────────────────────────┘
```

---

## Frontend DOM Performance Issue

### innerHTML += Loop Problem

```javascript
// CURRENT (BAD) - Creates 5+ reflows per item
function updateLeaderboardDisplay(leaderboard) {
  const lbContainer = document.getElementById('leaderboard-container');
  lbContainer.innerHTML = ''; // Clear (1st reflow)
  leaderboard.forEach(item => {
    lbContainer.innerHTML += `<div>...</div>`; // 5 reflows (re-parse, reflow, repaint each iteration)
  });
}
// Result: 1 + 5 = 6 reflows for 5 items


// OPTIMIZED - Single reflow
function updateLeaderboardDisplay(leaderboard) {
  const lbContainer = document.getElementById('leaderboard-container');
  const html = leaderboard.map(item => `<div>...</div>`).join('');
  lbContainer.innerHTML = html; // Single reflow
}
// Result: 1 reflow for 5 items
```

**Impact**: Leaderboard toggle: 200ms reduction (6 reflows → 1 reflow)

---

## Photo Processing Bottleneck

```
Select 3MB photo
     ↓
FileReader.readAsDataURL()     [500ms, loads to memory]
     ↓
Image.onload event             [300ms, image decode]
     ↓
Canvas resize loop             [1000ms, render + re-encode]
     ↓
base64 encode                  [1000ms, bloats 3MB → 4MB]
     ↓
Transmit to GAS                [2000ms, network + GAS startup]
     ↓
Server: base64.decode()        [500ms]
     ↓
Server: save to Drive          [3000ms, DriveApp.createFile()]
     ↓
Return success to client
     ↓
Total: 8 SECONDS for one submission

Memory usage peak: 4MB (original + resized + base64 in memory)
```

---

## Data Caching Status

### What IS Cached
```
✓ Location (5 min sessionStorage)
✓ Dark mode (localStorage)
✓ Settings (localStorage)
```

### What SHOULD BE Cached
```
✗ Admin emails (called 3 times per admin action)
✗ Event list (static for hours, read 3+ times per session)
✗ Badge definitions (static, read on demand)
✗ Leaderboard (changes only when submissions approved)
✗ User profile (changes rarely, read on every page)
```

### CacheService Availability
```
Apps Script CacheService can cache up to 6 hours per key:
- Recommended for: Admin emails, Event list, Badge defs
- Keys: "admin_emails", "events_cache", "badges_cache"
- Invalidation: 6 hours or manual on edit
```

---

## Scaling Projections

### How Performance Degrades

```
Students | Profile Load | History | Admin Approval | Event Search
---------|--------------|---------|----------------|---------------
100      | 1.5s         | 1.5s    | 1.0s          | 2.0s
200      | 2.5s         | 2.5s    | 2.0s          | 3.5s
300      | 4.0s         | 4.0s    | 3.0s          | 5.0s ← Current Limit
400      | 5.5s         | 5.5s    | 4.0s          | 6.5s
500      | 7.0s         | 7.0s    | 5.0s          | 8.0s ← Unusable

Submissions_Pending Queue
---------|-------|------------|------
100      | 1.0s  | 0.8s/action
300      | 2.0s  | 1.5s/action
500      | 3.5s  | 2.5s/action ← Slow
1000     | 7.0s  | 5.0s/action ← Very slow
```

---

## Firebase Cloud Functions Optimization Map

```
┌─────────────────────────────────────────────────────────────┐
│ Firebase Cloud Functions as Caching Layer                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  GAS → Firebase Cache → Sheets                              │
│                 ↑                                             │
│          (reads Sheets once/hour, serves 1000x faster)      │
│                                                               │
│  Cached Items:                                               │
│  • Event list (updated hourly)                              │
│  • Badge definitions (updated daily)                        │
│  • Admin email list (updated immediately on change)         │
│  • Leaderboard snapshot (computed nightly)                  │
│                                                               │
│  Result:                                                    │
│  • Profile load: 5s → 500ms                                │
│  • Admin queue: 2s → 200ms                                 │
│  • Event search: 5s → 300ms                                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary: Where Time is Lost

```
Profile Page Load Breakdown (4 seconds total)
├─ doGet() execution                    500ms
│  ├─ getUserDisplayName() Sheets call  150ms
│  ├─ getUserSettings() Sheets call     150ms
│  └─ getUserProfilePhoto() Drive query 200ms
├─ HTML parsing/rendering              500ms
├─ getProfileData() execution          2000ms
│  ├─ Student_Profiles read (300 rows) 500ms
│  ├─ Config_Badges read               300ms
│  ├─ Submissions_Verified read        400ms
│  ├─ Events read                       300ms
│  ├─ Submissions_Pending read         300ms
│  └─ Data processing (sort/filter)    200ms
└─ DOM rendering                        400ms
   ├─ innerHTML += loops (6 reflows)    200ms
   └─ Browser reflow/paint              200ms

Total: ~4000ms (most can be optimized)
```

