# Google Sheets API Setup Guide

This guide will help you set up direct access to your Google Sheets from Claude Code and the command line.

## Current Status

The following have been set up:
- Service account credentials stored in `credentials.json`
- Python scripts for reading and writing to Google Sheets
- Environment configuration in `.env`
- All sensitive files are in `.gitignore`

## Required: Grant Service Account Access

**IMPORTANT:** You must share your Google Spreadsheet with the service account to allow access.

1. Open your Google Spreadsheet: [The Spartan Cup] - MASTER
   - URL: https://docs.google.com/spreadsheets/d/1kaXx2iYHdhgQ7K-If17C8zLw9EaR_TSaIm8C75irqS4/edit

2. Click the **Share** button in the top right

3. Add this email address as an **Editor**:
   ```
   claude-code@spartan-cup.iam.gserviceaccount.com
   ```

4. Make sure the permission is set to **Editor** (not just Viewer)

5. Click **Send** or **Done**

That's it! Once you've shared the spreadsheet, the scripts will work.

## Usage

### Reading from Google Sheets

Read and display sheet data in various formats:

```bash
# Read as CSV (default)
python3 scripts/read_sheet.py Student_Profiles

# Read as JSON
python3 scripts/read_sheet.py Events json

# Read as formatted table
python3 scripts/read_sheet.py Config_Badges table

# Available sheet names:
# - Student_Profiles
# - Events
# - Submissions_Pending
# - Submissions_Verified
# - Config_Badges
# - Config_Admins
# - Config_Points
# - Config_Active_Season
# - Activities_Data
```

### Writing to Google Sheets

Modify sheet data using various operations:

```bash
# Append a new row (CSV format)
python3 scripts/write_sheet.py Student_Profiles append "john@example.com,John Doe,100,Gold"

# Update a specific cell
python3 scripts/write_sheet.py Events update A2 "New Event Name"

# Update a range of cells
python3 scripts/write_sheet.py Config_Badges update_range "A2:C2" "Badge1,Description,100"

# Clear all data in a sheet (use with caution!)
python3 scripts/write_sheet.py Test_Sheet clear
```

## Testing the Setup

After granting access, test that everything works:

```bash
# Test reading data
python3 scripts/read_sheet.py Student_Profiles table

# You should see your data displayed in a table format
```

## Troubleshooting

### Error: "The caller does not have permission"
- Make sure you've shared the spreadsheet with the service account email
- Verify the permission is set to **Editor**, not just Viewer

### Error: "Spreadsheet not found"
- Check that the `SPREADSHEET_ID` in `.env` is correct
- Verify you can access the spreadsheet URL yourself

### Error: "Worksheet not found"
- Check the available worksheets by running the script with an invalid name
- The error message will list all available worksheets

### Error: "credentials.json not found"
- Make sure `credentials.json` exists in the project root
- Verify it contains valid service account credentials

## Security Notes

- `credentials.json` contains sensitive credentials and is in `.gitignore`
- Never commit `credentials.json` or `.env` to git
- The service account only has access to spreadsheets you explicitly share with it
- Revoke access anytime by removing the service account from the spreadsheet's share settings

## For Claude Code

Once setup is complete, Claude can:
- Read any sheet tab to analyze data
- Write updates to sheets
- Append new rows
- Update specific cells or ranges

Example Claude commands after setup:
- "Read the Student_Profiles sheet and show me the top 10 students by points"
- "Add a new event to the Events sheet"
- "Update the Config_Points sheet with new point values"
