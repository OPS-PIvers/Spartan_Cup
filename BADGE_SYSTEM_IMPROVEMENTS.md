# Badge System Improvements

## Overview
The badge creation system has been completely redesigned to be more intuitive and powerful, with support for activity-specific badges that were previously missing.

## What's New

### 1. **Template-Based Badge Creation**
Instead of manually configuring trigger types and values, you now select from pre-defined templates:

- **📊 Event Count** - Award after attending X total events
- **⭐ Season Points** - Award after earning X points this season
- **🏀 Activity Percentage** ← **NEW!** - Award after attending X% of specific sport games (e.g., 25% of basketball games)
- **🎯 Activity Event Count** ← **NEW!** - Award after attending X events of a specific sport
- **🎨 Distinct Sports** - Award after attending X different sports/activities
- **🔥 Weekly Streak** - Award after attending X events within any 7-day period
- **🏠 Home Games Percentage** - Award after attending X% of all home games
- **✋ Manual Award** - Custom badges awarded by admins only

### 2. **Dynamic Form Fields**
The form now adapts based on your selected template:
- Only shows relevant fields for each badge type
- Activity selector appears for activity-specific badges
- Percentage input uses intuitive 1-100 range (not 0-1)
- Clear help text and examples for each field

### 3. **Live Preview**
As you fill out the form, you see a preview of when the badge will be awarded:
> "Badge Will Be Awarded When: Student attends 25% or more of Basketball games"

### 4. **Better Badge Display**
The badge list now shows formatted, human-readable criteria:
- **Before:** `Activity_Pct: BB:0.25`
- **After:** `25% of BB games`

## New Badge Logic

### Activity Percentage Badges
**Problem Solved:** You can now create badges like "attend 25% of basketball games" - this was completely missing before!

**How it works:**
1. Select "Activity Percentage" template
2. Choose the sport/activity (e.g., Basketball)
3. Enter percentage (e.g., 25 for 25%)
4. System tracks attended games vs total games for that activity only

**Example Badge:**
- Name: "Basketball Superfan"
- Template: Activity Percentage
- Activity: Basketball (BB)
- Percentage: 50%
- Result: Awarded when student attends 50% or more of all basketball games

### Activity Event Count Badges
**New feature:** Award badges for attending a specific number of events for one sport.

**Example Badge:**
- Name: "Volleyball Regular"
- Template: Activity Event Count
- Activity: Volleyball (VB)
- Count: 5
- Result: Awarded when student attends 5 or more volleyball events

## Technical Details

### Data Storage Format
Activity-specific badges store their trigger value as a colon-separated string:

- **Activity Percentage:** `"ACTIVITY_CODE:DECIMAL"`
  - Example: `"BB:0.25"` for 25% of basketball games

- **Activity Event Count:** `"ACTIVITY_CODE:COUNT"`
  - Example: `"VB:5"` for 5 volleyball events

### Backend Logic (Code.js)
Two new trigger types added to `calculateBadges()` function:

1. **`Activity_Pct`** (lines 4201-4238)
   - Counts total events for the specified activity
   - Counts attended events for that activity
   - Calculates percentage and compares to requirement

2. **`Activity_Event_Count`** (lines 4239-4271)
   - Counts attended events for the specified activity
   - Compares count to requirement

### UI Implementation (Page.admin.html)
Complete redesign of the badge form:
- Template selector with 8 badge patterns
- Dynamic show/hide of form fields
- Template configuration object defining behavior
- Auto-population of trigger type and value based on template
- Reverse-engineering of template when editing existing badges

## Migration Notes

### Existing Badges
All existing badges continue to work! The system supports:
- New trigger types: `Activity_Pct`, `Activity_Event_Count`
- Existing trigger types: `Points_Season`, `event_count`, `Distinct_Sports`, etc.
- Legacy trigger types: `points_threshold`, `season_points`

### Editing Old Badges
When you edit a badge created with the old system, it will be mapped to the closest template. If the trigger type is unrecognized, you'll see a warning but can still edit it.

## Usage Examples

### Create "Basketball 25% Badge"
1. Go to Admin Dashboard → Badges tab
2. Select template: "Activity Percentage"
3. Badge Name: "Basketball Fan"
4. Select Activity: "Basketball (BB)"
5. Percentage: 25
6. Description: "Attended 25% of basketball games this season"
7. Upload badge image
8. Click "Create Badge"

### Create "3 Different Sports Badge"
1. Select template: "Distinct Sports"
2. Badge Name: "Sports Explorer"
3. Number of Different Sports: 3
4. Description: "Attended events from 3 different sports"
5. Click "Create Badge"

## Benefits

✅ **Easier to Use** - Templates guide you through badge creation
✅ **More Powerful** - Activity-specific badges now supported
✅ **Clearer Logic** - Preview shows exactly when badge is awarded
✅ **Better Validation** - Form prevents invalid configurations
✅ **Intuitive Percentages** - Enter 25 instead of 0.25
✅ **Flexible** - Still supports all original badge types

## Future Enhancements (Possible)

- Badge templates for specific time periods (e.g., "attend 3 events in October")
- Combo badges (e.g., "50 points AND 5 events")
- Tiered badges (Bronze/Silver/Gold versions)
- Badge prerequisites (must earn badge A before badge B)
