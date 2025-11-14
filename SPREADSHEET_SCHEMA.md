# The Spartan Cup - Spreadsheet Schema Documentation

**Last Updated:** November 2025  
**Version:** 1.0  
**App:** The Spartan Cup (Orono K-12 Education)

---

## Overview

This document maps all Google Sheets tabs in the "[The Spartan Cup] - MASTER" spreadsheet, including column headers, data types, relationships, and usage notes.

### Sheet Categories

- **Core Data**: Student profiles, activities, events, submissions
- **Configuration**: Points, badges, admins, seasons, prizes
- **Operational**: Active events, badge awards, fan feed
- **Deprecated**: Legacy sheets no longer in active use

---

## Core Data SHEETS

### 1. Student_Profiles
**Purpose:** Central student record with points, badges, and settings  
**Access Level:** Read by students (own record), read/write by admins

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Email | String | Student email (unique key) | Primary key; set on first login |
| B | 2 | Display_Name | String | Student's full name | Auto-populated by formula from Google Account or manually set |
| C | 3 | Total_Points_Season | Number | Current season points | Updated when submissions approved |
| D | 4 | Total_Points_AllTime | Number | All-time cumulative points | Never decreases; carried forward across seasons |
| E | 5 | Badges_Earned | JSON Array | Array of badge IDs earned | Format: `["badge_001", "badge_003", ...]` |
| F | 6 | Loyalty_Stats_JSON | JSON Object | Loyalty badge tracking data | Reserved for future loyalty badge system |
| G | 7 | Variety_Stats_Set | JSON Array | Unique activities attended | Format: `["GBB", "BBB", "BAND"]` |
| H | 8 | Disqualified | Boolean | Disqualification flag | `TRUE` = user banned from competition |
| I | 9 | Student_Settings | JSON Object | User preferences | Format: `{"darkMode": true, "eventNotifications": false, ...}` |

**Sample Data:**
```
email@orono.k12.mn.us | Alex Johnson | 250 | 1250 | ["badge_001","badge_005"] | {} | ["GBB","BAND"] | FALSE | {"darkMode":true,...}
```

**Relationships:**
- Foreign key to Submissions_Pending (Email)
- Foreign key to Submissions_Verified (Email)
- Referenced by Student_Profiles calculations

---

### 2. Activities_Data
**Purpose:** Master list of sports/arts activities by season  
**Access Level:** Read-only for students, read/write for admins  
**Updated By:** Admin management UI

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Activity_Code | String | Unique activity identifier | E.g., "GBB", "BBB", "BAND", "PLAY" |
| B | 2 | Activity_Name | String | Display name | E.g., "Girls Basketball" |
| C | 3 | Season | String | Season assignment | E.g., "Winter", "Fall", "Spring" |
| D | 4 | Location_Name | String | Primary location for activity | E.g., "Orono High School Gym" |
| E | 5 | Event_Lat | Number | Latitude of location | Decimal format (e.g., 44.9650) |
| F | 6 | Event_Lon | Number | Longitude of location | Decimal format (e.g., -93.6250) |

**Sample Data:**
```
GBB | Girls Basketball | Winter | Orono High School Gym | 44.965 | -93.625
BBB | Boys Basketball | Winter | Orono High School Gym | 44.965 | -93.625
BAND | Band Concert | Spring | Orono High School Auditorium | 44.966 | -93.624
```

**Relationships:**
- Foreign key referenced by Events (Activity_Code in column B)
- Used to populate activity dropdowns in admin UI
- Coordinates used for location-based event filtering

**Notes:**
- Activities are season-specific; moving an activity to a new season involves updating column C
- Coordinates must be within campus geofence bounds for geolocation features to work properly
- All activities in a given season are displayed on Prizes & Events page

---

### 3. Events
**Purpose:** Individual event instances (games, performances, competitions)  
**Access Level:** Read-only for students, read/write for admins  
**Updated By:** Admin management UI + `updateActiveEventStatus()` trigger (every 10 minutes)

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Event_ID | String | Unique event identifier | Format: `ACTIVITYCODE-NNN` (e.g., "GBB-001") |
| B | 2 | Activity_Code | String | Foreign key to Activities_Data | Links event to activity master record |
| C | 3 | Event_Name | String | Display name for event | E.g., "Girls Basketball vs. Hopkins" |
| D | 4 | Date | Date | Event date | Format: YYYY-MM-DD |
| E | 5 | Location_Name | String | Event location | Pulled from Activities_Data; can override |
| F | 6 | Event_Lat | Number | Event latitude | Pulled from Activities_Data; can override |
| G | 7 | Event_Lon | Number | Event longitude | Pulled from Activities_Data; can override |
| H | 8 | Start_Time | DateTime | Event start time | Format: "YYYY-MM-DD HH:mm" or ISO 8601 |
| I | 9 | Duration_Hours | Number | Event duration | Hours (e.g., 2 for 2-hour event) |
| J | 10 | Is_Home_Game | Boolean | Home game indicator | Currently hardcoded to TRUE |
| K | 11 | Is_Spotlight_Game | Boolean | Spotlight event flag | TRUE = 1.5x points multiplier applied |
| L | 12 | Theme | String | Event theme | E.g., "White Out", "Throwback Night"; can be blank |
| M | 13 | Is_Active | Boolean | Active status (auto-updated) | TRUE = current time falls within event window |

**Sample Data:**
```
GBB-001 | GBB | Girls Basketball vs. Hopkins | 2025-11-15 | Orono HS Gym | 44.965 | -93.625 | 2025-11-15 19:00 | 2 | TRUE | TRUE | White Out | FALSE
```

**Relationships:**
- Foreign key to Activities_Data (Activity_Code)
- Referenced by Submissions_Pending/Verified (Event_ID)
- Referenced by badge calculations (distinct sports, event counts)
- Used in leaderboard and history displays

**Auto-Update Mechanism:**
- `updateActiveEventStatus()` trigger runs every 10 minutes
- Compares current time (Central timezone) to Start_Time + Duration_Hours
- Sets Is_Active = TRUE if current time falls within event window
- Cache clears after each update to ensure fresh data

**Notes:**
- Event_ID must be unique across all seasons
- Start_Time must be parseable as Central Time (not UTC)
- Is_Spotlight_Game affects points multiplier in submission approval
- Theme field is optional; leave blank if no theme

---

### 4. Submissions_Pending
**Purpose:** Queue of submissions awaiting admin review  
**Access Level:** Read/write by students (own submissions), read by admins  
**Updated By:** `submitEvent()` function, admin approval/denial

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Submission_ID | String | Unique submission identifier | UUID format; auto-generated |
| B | 2 | Timestamp | DateTime | When student submitted | Auto-set to `new Date()` on submission |
| C | 3 | Email | String | Student email | Links to Student_Profiles |
| D | 4 | Event_ID | String | Event attended | Foreign key to Events |
| E | 5 | Photo_URL | String | URL to submission photo | Google Drive export link |
| F | 6 | Photo_ID | String | Google Drive file ID | Used for cleanup if submission denied |
| G | 7 | Location_Data_JSON | JSON Object | Geolocation at submission | Format: `{"lat": 44.965, "lon": -93.625, "acc": 15}` |
| H | 8 | Dressed_For_Theme | String | Theme compliance | "Yes" or "No" |
| I | 9 | Notes | String | Student comment | Optional; max ~500 chars |

**Sample Data:**
```
a1b2c3d4-e5f6... | 2025-11-15 19:30:00 | student@orono.k12.mn.us | GBB-001 | https://drive.google.com/uc?... | abc123def456 | {"lat":44.965,"lon":-93.625,"acc":12} | Yes | Cool game! Great crowd.
```

**Relationships:**
- Foreign key to Student_Profiles (Email)
- Foreign key to Events (Event_ID)
- Moved to Submissions_Verified when approved
- Deleted if denied

**Lifecycle:**
1. Student submits → row created with UUID
2. Admin reviews in Admin Dashboard
3. Admin clicks "Approve" → moved to Submissions_Verified, points updated
4. Admin clicks "Deny" → deleted, photo trashed

**Notes:**
- Photo_URL is pre-signed Google Drive link; expires but can be re-generated
- Location_Data_JSON used for geofence validation (100m radius)
- If student resubmits for same event, old pending submission is replaced
- Cannot resubmit if already verified (immutable)

---

### 5. Submissions_Verified
**Purpose:** Archive of approved submissions; source of points and fan feed  
**Access Level:** Read-only for students, read/append by admins  
**Updated By:** `approveSubmission()` function

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Submission_ID | String | Unique submission identifier | UUID; copied from Submissions_Pending |
| B | 2 | Timestamp_Submitted | DateTime | When student submitted | Copied from Submissions_Pending |
| C | 3 | Timestamp_Approved | DateTime | When admin approved | Auto-set to `new Date()` on approval |
| D | 4 | Email | String | Student email | Links to Student_Profiles |
| E | 5 | Event_ID | String | Event attended | Foreign key to Events |
| F | 6 | Admin_Email | String | Approving admin's email | For audit trail |
| G | 7 | Points_Base | Number | Base points awarded | Admin decides; typically 50-75 |
| H | 8 | Points_Theme | Number | Theme bonus points | Admin decides; typically 0 or 25 |
| I | 9 | Points_Spotlight_Multiplier | Number | Spotlight multiplier | Typically 1.0 or 1.5 |
| J | 10 | Points_Total | Number | Final calculated points | (Points_Base + Points_Theme) × Points_Spotlight_Multiplier |
| K | 11 | Photo_URL | String | URL to submission photo | Google Drive export link; used for fan feed |

**Sample Data:**
```
a1b2c3d4-e5f6... | 2025-11-15 19:30:00 | 2025-11-16 09:15:00 | student@orono.k12.mn.us | GBB-001 | admin@orono.k12.mn.us | 75 | 25 | 1.5 | 150 | https://drive.google.com/uc?...
```

**Relationships:**
- Foreign key to Student_Profiles (Email)
- Foreign key to Events (Event_ID)
- Used to calculate badges (event counts, distinct sports, etc.)
- Displayed in student History page (filtered by Email)
- Used in Fan Feed (most recent 50 entries)
- Used in leaderboard calculations

**Points Calculation Formula:**
```
Points_Total = (Points_Base + Points_Theme) × Points_Spotlight_Multiplier
Example: (75 + 25) × 1.5 = 150 points
```

**Notes:**
- Immutable once created; no updates or deletions
- Photo_URL may expire; can be regenerated from Photo_ID in Submissions_Pending archive
- Used as canonical record for points distribution
- Admin email stored for transparency and auditing

---

## Configuration Sheets

### 6. Config_Points
**Purpose:** Centralized point value configuration  
**Access Level:** Read-only for students, read/write for admins via UI dialog  
**Updated By:** Admin "Configure Points Values" menu → `openPointsConfigDialog()` → `updatePointsConfig()`

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Setting_Name | String | Setting identifier | Unique key |
| B | 2 | Points_Value | Number | Numeric value | Decimal allowed |
| C | 3 | Description | String | Human-readable description | What this setting controls |

**Default Rows:**
```
Base_Points_With_Theme | 75 | Points for attending event with theme dress
Base_Points_Without_Theme | 50 | Points for attending event without theme dress
Theme_Bonus | 25 | Additional points for dressing according to theme
Spotlight_Game_Multiplier | 1.5 | Points multiplier for spotlight games
Home_Game_Bonus | 10 | Bonus points for home games (currently unused)
```

**Relationships:**
- Referenced by `getPointsConfig()` (cached for 1 hour)
- Used in Admin Dashboard submission approval form
- Used in `approveSubmission()` points calculation

**Notes:**
- Cached by Apps Script; changes reflected after 1 hour or manual cache clear
- Admin dialog provides user-friendly UI for updates
- Reset to defaults available via `resetPointsToDefaults()` function

---

### 7. Config_Badges
**Purpose:** Badge definition library; controls how badges are earned  
**Access Level:** Read-only for students, read/write for admins via Admin Dashboard  
**Updated By:** `createBadge()`, `updateBadge()`, `deleteBadge()` functions

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Badge_ID | String | Unique badge identifier | Format: "badge_NNN" (e.g., "badge_001") |
| B | 2 | Badge_Name | String | Display name | E.g., "Rookie Fan", "Super Fan" |
| C | 3 | Category | String | Badge category | Points, Participation, Variety, Loyalty, Special, Career, Achievement, Activity |
| D | 4 | Trigger_Type | String | How badge is earned | See trigger types list below |
| E | 5 | Trigger_Value | String/Number | Threshold or condition | Format depends on trigger type |
| F | 6 | Description | String | Badge description | Displayed in UI; explains how to earn |
| G | 7 | Badge_Image_URL | String | URL to badge image | Firebase Storage URL or Google Drive link |

**Trigger Types Reference:**

**Naming Convention:** Trigger types with `_Season` suffix filter to current season only. Trigger types with `_Lifetime` suffix count across all seasons (or omit a suffix variant for all-time).

| Trigger Type | Trigger_Value Format | Example | Notes |
|--------------|---------------------|---------|-------|
| Points_Season | Number | 100 | Earned when season points ≥ value |
| Submission_Count | Number | 5 | Earned when lifetime submissions ≥ value |
| Submission_Count_Week_1 | Number | 3 | Earned if 3+ submissions in first week |
| Events_In_7_Days | Number | 4 | Earned when 4+ events attended in rolling 7 days |
| Distinct_Sports | Number | 3 | Earned when attended 3+ different activities |
| Activity_Pct_Season | "CODE:0.25" | "BB:0.25" | 25% of Basketball games THIS season |
| Activity_Pct_Lifetime | "CODE:0.50" | "BB:0.50" | 50% of ALL Basketball games across all seasons |
| Activity_Event_Count_Season | "CODE:5" | "VB:5" | Attended 5+ Volleyball events THIS season |
| Activity_Event_Count_Lifetime | "CODE:5" | "VB:5" | Attended 5+ Volleyball events ACROSS ALL SEASONS (lifetime) |
| Home_Game_Pct | Number (0-1) | 0.5 | Attended 50% of all home games (all-time) |
| Season_Placement | 1, 2, or 3 | 1 | 1st, 2nd, or 3rd place badge (end-of-season only) |
| AllTime_Placement_Reached | Number | 10 | Reached Top 10 on all-time leaderboard |
| Career_Events_Attended | Number | 50 | Lifetime attendance milestone (50 events) |
| Career_Seasons_Participated | Number | 3 | Multi-season participation (3 seasons) |
| Career_Badges_Earned | Number | 10 | Badge collector (10 total badges) |
| Weekday_Coverage | Number | 5 | Attended at least 1 event on all 5 weekdays (M-F) |
| Specific_Activities | "CODE1,CODE2,CODE3" | "ART,BAND,SING" | Arts Patron: attended all required activities |
| manual | (none) | (none) | Awarded manually by admin only |

**Sample Data:**
```
badge_001 | First Event | Participation | Submission_Count | 1 | Attended your first Spartan event | https://the-spartan-cup.web.app/badges/first_event.svg
badge_006 | Century Club | Points | Points_Season | 100 | Earned 100 points in a single season | https://the-spartan-cup.web.app/badges/century_club.svg
badge_020 | Sports Superfan | Career | Specific_Activities | GBB,BBB,VBALL | Attended basketball games across all levels | https://the-spartan-cup.web.app/badges/sports_superfan.svg
```

**Relationships:**
- Referenced by Student_Profiles (Badges_Earned column stores badge IDs)
- Used in `calculateBadges()` function to determine when students qualify
- Badge images stored on Firebase Storage or Google Drive
- Badge awards trigger notifications via `notifyBadgeEarned()`

**Notes:**
- Badge IDs must be unique; used as immutable references
- Trigger calculations are performance-optimized (batch Sheets API reads)
- Season-specific badges (Activity_Pct_Season, etc.) use `getActiveSeason()` for filtering
- End-of-season badges (Season_Placement) only awarded by `processSeasonEndBadges()`
- Image URLs should resolve to PNG or SVG files on Firebase Storage

---

### 8. Config_Admins
**Purpose:** Access control list for admin functions  
**Access Level:** Read-only for students, read/write for account owner only

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Admin_Email | String | Admin's email (unique key) | Must be organization email |
| B | 2 | Role | String | Role assignment | E.g., "Owner", "Moderator", "Reviewer" |

**Sample Data:**
```
principal@orono.k12.mn.us | Owner
admin1@orono.k12.mn.us | Moderator
admin2@orono.k12.mn.us | Reviewer
```

**Relationships:**
- Checked by `getUserIsAdmin()` function (cached 6 hours)
- Checked by `getAdminEmails()` function (cached 6 hours)
- Determines access to Admin Dashboard and all admin functions

**Access Control:**
- Only users in this sheet can:
  - View Admin Dashboard (`getAdminQueue()`)
  - Approve/deny submissions (`approveSubmission()`, `denySubmission()`)
  - Create/edit/delete badges
  - Configure point values
  - Manage events
  - Award retroactive badges
  - Process season-end badges

**Notes:**
- At least one admin must be configured for app to function
- Multiple admins can have different roles (currently roles are informational only)
- Cache invalidates when Config_Admins sheet is edited
- Email format validated with regex before use

---

### 9. Config_Active_Season
**Purpose:** Single-value store for current active season  
**Access Level:** Read-only for students, read/write for admins  
**Updated By:** Admin via season management UI

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Setting_Name | String | Setting key | Always "Active_Season" |
| B | 2 | Setting_Value | String | Current season name | E.g., "Winter", "Spring", "Fall" |

**Sample Data:**
```
Active_Season | Winter
```

**Relationships:**
- Referenced by `getActiveSeason()` (cached 1 hour)
- Filters active events in `getActiveEvents()`
- Filters activities in activity dropdowns
- Used in season-specific badge calculations
- Used in leaderboard displays (top 5 season rankings)

**Notes:**
- Single value; update the one row in this sheet
- Value should match season names used in Activities_Data and Events
- Cache clears when value changes

---

### 10. Config_Rulebook
**Purpose:** Editable rulebook content for the Official Rulebook page
**Access Level:** Read-only for students, read/write for admins via Rulebook Editor
**Updated By:** Admin "Edit Rulebook Content" menu → `openRulebookEditor()` → `updateRulebookContent()`

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Section_ID | String | Unique section identifier | Format: lowercase_with_underscores (e.g., "photo_submission") |
| B | 2 | Section_Title | String | Display title for section | E.g., "Photo Submission", "Awards" |
| C | 3 | Content_HTML | String (long text) | HTML content for section | Supports HTML and Tailwind CSS classes |
| D | 4 | Display_Order | Number | Sort order for display | Lower numbers appear first (1, 2, 3, ...) |
| E | 5 | Is_Active | Boolean | Section visibility | TRUE = visible, FALSE = hidden |

**Sample Data:**
```
photo_submission | Photo Submission | <div class="space-y-2">...</div> | 1 | TRUE
base_points | Base Points | <div class="bg-gradient-to-r...">...</div> | 2 | TRUE
misconduct | Misconduct & Cheating | <div class="space-y-3">...</div> | 5 | TRUE
```

**Relationships:**
- Content fetched by `getRulebookContent()` (cached 1 hour)
- Displayed on Rulebook page (Page.rulebook.html)
- Admin editor dialog loads from this sheet via `openRulebookEditor()`

**Content Guidelines:**
- HTML content supports full Tailwind CSS utility classes
- Use semantic HTML for accessibility
- Icons via Material Symbols: `<span class="material-symbols-outlined">icon_name</span>`
- Links should use `target="_blank" rel="noopener noreferrer"` for external sites
- Keep content concise and scannable

**Admin Workflow:**
1. Open Google Sheet → "🏆 Spartan Cup Admin" menu → "2b. Edit Rulebook Content"
2. Edit section titles, content, display order, or active status
3. Click "Save All Changes" to update sheet
4. Cache automatically clears; changes visible immediately on next page load

**Notes:**
- Sections can be temporarily hidden by setting Is_Active to FALSE
- Display_Order determines visual stacking (use 1, 2, 3, etc.)
- HTML content should be escaped properly when editing via dialog
- Badge system information is NOT stored here (it's dynamically loaded from Config_Badges)
- Admins can also edit the sheet directly for advanced formatting
- Season names are case-sensitive in lookups

---

## Operational Sheets

### 10. Active_Season_Prizes
**Purpose:** Prize definitions for current season (1st place, most spirited, etc.)  
**Access Level:** Read by students (Prizes page), read/write by admins  
**Updated By:** Admin prize management functions

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Rank | String | Prize placement or category | E.g., "1st Place", "Most Spirited", "Comeback" |
| B | 2 | Description | String | Prize description | What the winner receives |

**Sample Data:**
```
1st Place | $50 Gift Card to Orono Theater
2nd Place | $30 Gift Card to School Store
3rd Place | $20 Gift Card to School Store
Most Spirited | Personalized trophy + bragging rights
```

**Relationships:**
- Displayed on Prizes & Events page
- Admin functions: `getAllSeasonPrizes()`, `createPrize()`, `updatePrize()`, `deletePrize()`
- Not linked to specific students (awards determined manually at season end)

**Notes:**
- Sheet must exist; create manually if not auto-generated
- Header row: Row 1 = [Rank, Description]
- Data rows: Row 2 onward
- Can add as many prize categories as needed
- Update before season ends to show prizes to students

---

### 11. Badge_Awards
**Purpose:** Historical log of badge awards (for fan feed and analytics)  
**Access Level:** Read-only for students (via fan feed), read/append by system  
**Updated By:** `calculateBadges()` → `notifyBadgeEarned()` (optional logging)

| # | Column | Header | Type | Purpose | Notes |
|---|--------|--------|------|---------|-------|
| A | 1 | Award_ID | String | Unique award identifier | UUID; auto-generated |
| B | 2 | Timestamp | DateTime | When badge was awarded | Auto-set on award |
| C | 3 | Email | String | Student email | Links to Student_Profiles |
| D | 4 | Display_Name | String | Student name | Snapshot for fan feed |
| E | 5 | Badge_ID | String | Badge awarded | Foreign key to Config_Badges |
| F | 6 | Badge_Name | String | Badge display name | Snapshot for fan feed |
| G | 7 | Badge_Image_URL | String | Badge image URL | Snapshot for fan feed display |

**Sample Data:**
```
badge_award_001 | 2025-11-16 10:30:00 | student@orono.k12.mn.us | Alex Johnson | badge_005 | Super Fan | https://the-spartan-cup.web.app/badges/super_fan.svg
```

**Relationships:**
- Referenced by `getFanFeed()` to show badge awards in activity feed
- Optional logging; current implementation doesn't populate this sheet
- Could be used for achievement analytics and historical reporting

**Notes:**
- Sheet must exist for `getFanFeed()` to work without errors
- Currently optional; not populated by default
- Could be auto-populated by modifying `calculateBadges()` to log awards
- Useful for historical analytics and achievement tracking

---

## Supporting/Deprecated Sheets

### 12. Student_Loyalty_History (Proposed)
**Purpose:** Track loyalty metrics over time (not currently used)  
**Status:** Planned for future implementation  
**Columns:** TBD

**Note:** Referenced in Student_Profiles as "Loyalty_Stats_JSON" (column F) but no sheet currently exists.

---

### 13. Activity_Attendance_History (Proposed)
**Purpose:** Per-activity attendance tracking  
**Status:** Planned for future implementation  
**Columns:** TBD

**Note:** Could be used for advanced analytics (% attendance by activity, trends, etc.)

---

## Caching Strategy

The following sheets are cached by Apps Script to reduce API calls:

| Sheet | Function | Cache Key | TTL | Invalidated By |
|-------|----------|-----------|-----|----------------|
| Config_Admins | `getAdminEmails()` | admin_emails | 6 hours | Sheet edit |
| Student_Profiles | `getStudentProfilesData()` | student_profiles_data | 10 minutes | Sheet edit |
| Config_Badges | `getBadgeMapCache()` | badge_map_cache | 24 hours | Badge CRUD operations |
| Events + Activities_Data | `getEventMapCache()` | event_map_cache | 1 hour | Event edit |
| Events + Activities_Data | `getActiveEvents()` | active_events_data | 10 minutes | `updateActiveEventStatus()` trigger |
| Config_Points | `getPointsConfig()` | points_config | 1 hour | Admin config update |
| Config_Active_Season | `getActiveSeason()` | active_season | 1 hour | Season change |

**Cache Management:**
- Clear cache via Admin Menu → "5. Clear Cache (Development)"
- Cache clears automatically after TTL expires
- Manual edits don't trigger cache invalidation (use menu option after editing sheets)

---

## Data Relationships Diagram

```
Student_Profiles (Email)
├── Badges_Earned → Config_Badges (Badge_ID)
├── Points_Season ← Submissions_Verified (Points_Total sum)
├── Points_AllTime ← Submissions_Verified (Points_Total sum)
└── linked from Submissions_Pending/Verified (Email FK)

Activities_Data (Activity_Code)
└── Activity_Code → Events (Activity_Code FK)
    └── Event_ID → Submissions_Pending/Verified (Event_ID FK)
        └── Email → Student_Profiles (Email FK)

Config_Badges (Badge_ID)
├── referenced by Student_Profiles (Badges_Earned array)
└── Trigger_Type determines badge earning logic
    └── References Events, Activities_Data, Submissions_Verified

Config_Points
└── Point values used by approveSubmission() for calculations

Config_Admins (Admin_Email)
└── Access control for all admin functions

Config_Active_Season
└── Filters Activities_Data and Events by season
    └── Affects badge calculations and leaderboards

Active_Season_Prizes
└── Displayed on Prizes page (informational)

Badge_Awards (optional)
└── Historical log for analytics and fan feed
```

---

## Setup Process

### Sheets Auto-Created by `firstTimeSetup()`

The following sheets are automatically created and configured:

1. Student_Profiles ✓
2. Activities_Data ✓ (with sample data: GBB, BBB, GVBB)
3. Events ✓ (with sample event: GBB-001)
4. Config_Active_Season ✓ (set to "Winter")
5. Submissions_Pending ✓
6. Submissions_Verified ✓
7. Config_Badges ✓
8. Config_Admins ✓ (current user added)
9. Config_Points ✓ (with default values)

### Sheets That Must Be Created Manually

The following sheets are referenced but not auto-created:

1. **Active_Season_Prizes** - Create with headers: [Rank, Description]
2. **Badge_Awards** - Create with headers: [Award_ID, Timestamp, Email, Display_Name, Badge_ID, Badge_Name, Badge_Image_URL]

---

## Data Validation Rules

### Recommended Data Validation (To Set in Google Sheets UI)

#### Config_Badges Sheet

**Column C (Category):**
```
List: Points, Participation, Variety, Loyalty, Special, Career, Achievement, Activity
```

**Column D (Trigger_Type):**
```
List: Points_Season, Submission_Count, Submission_Count_Week_1, Events_In_7_Days,
Distinct_Sports, Activity_Pct_Season, Activity_Pct_Lifetime, Home_Game_Pct,
Activity_Event_Count_Season, Activity_Event_Count_Lifetime,
Season_Placement, AllTime_Placement_Reached, Career_Events_Attended,
Career_Seasons_Participated, Career_Badges_Earned, Weekday_Coverage,
Specific_Activities, manual
```

#### Student_Profiles Sheet

**Column H (Disqualified):**
```
List: TRUE, FALSE
```

#### Submissions_Pending Sheet

**Column H (Dressed_For_Theme):**
```
List: Yes, No
```

#### Events Sheet

**Column J (Is_Home_Game):**
```
List: TRUE, FALSE
```

**Column K (Is_Spotlight_Game):**
```
List: TRUE, FALSE
```

**Column M (Is_Active):**
```
List: TRUE, FALSE
```

---

## Common Queries

### Get all active events for current season
```javascript
getActiveEvents(); // Returns array of active events with location data
```

### Get student's earned badges
```javascript
getProfileData(); // Returns badges array for current user
```

### Calculate student's points
```javascript
// Sum of Points_Total in Submissions_Verified where Email = student email
// Filtered by season in column C (Timestamp_Approved)
```

### Find events attended by student
```javascript
// Query Submissions_Verified where Email = student email
// Join with Events to get event details
```

### Get badge trigger conditions
```javascript
getBadgeMapCache(); // Returns all badge definitions with trigger types/values
```

---

## Best Practices

### Do's ✓
- Use email as primary key (immutable across G Suite)
- Store JSON in cells for complex data (array/object fields)
- Use UTC timestamps internally; convert to Central Time for display
- Use 1-indexed row numbers in Apps Script (not 0-indexed)
- Cache frequently-accessed data (Config_Badges, Config_Admins, etc.)
- Validate email format before using as FK
- Use descriptive column headers (no abbreviations)

### Don'ts ✗
- Don't directly edit JSON cells without re-stringifying
- Don't assume Is_Active is always current (refresh with trigger or manual call)
- Don't mix UUID formats (always use `Utilities.getUuid()`)
- Don't store plain text passwords or secrets
- Don't delete header rows from any sheet
- Don't rely on row numbers as primary keys (use Column A unique values)
- Don't hardcode season names (use Config_Active_Season instead)

---

## Troubleshooting

### Event not appearing in active events
1. Check Events sheet: Is_Active = TRUE?
2. Check current time (Central timezone) falls within Start_Time to Start_Time + Duration_Hours
3. Check Activity_Code exists in Activities_Data
4. Check activity's Season matches Config_Active_Season value
5. Run Admin → "4. Install Active Events Trigger" to refresh

### Student's points not updating
1. Check Submissions_Verified sheet for student's approved submissions
2. Verify Points_Total is calculated correctly: (Base + Theme) × Multiplier
3. Check Student_Profiles columns C & D are sum of Points_Total from Submissions_Verified
4. Try refreshing via Admin → "5. Clear Cache"

### Badges not appearing
1. Check Config_Badges has entries with valid Trigger_Types
2. Run Admin → "6. Award Retroactive Badges (Run Once)"
3. Check Student_Profiles column E (Badges_Earned) is JSON array
4. Verify badge trigger conditions are met (points, submission count, etc.)

### Admin functions returning errors
1. Check user email is in Config_Admins
2. Verify admin email hasn't changed in Google Account
3. Try logging out/in to refresh session
4. Check Config_Admins email matches exactly (case-sensitive)

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-13 | 1.0 | Initial comprehensive schema documentation |

---

**Document Created:** November 13, 2025  
**Maintained By:** Paul (Orono Technology)  
**Contact:** For schema questions or updates, refer to Code.gs comments or this document