#!/usr/bin/env python3
"""
Write data to Google Sheets using a service account.
Usage:
    python write_sheet.py <sheet_name> <operation> [args...]

Operations:
    append <csv_data>           - Append a row from CSV data
    update <cell> <value>       - Update a specific cell (e.g., A1, B2)
    update_range <range> <data> - Update a range (e.g., A1:B2) with CSV data
    clear                       - Clear all data in the worksheet

Examples:
    python write_sheet.py Student_Profiles append "john@example.com,John Doe,100,Gold"
    python write_sheet.py Events update A2 "New Event Name"
    python write_sheet.py Config_Badges update_range "A2:C2" "Badge1,Description,100"
    python write_sheet.py Student_Profiles clear
"""

import gspread
import sys
import csv
from io import StringIO
from pathlib import Path

# Get the project root directory
PROJECT_ROOT = Path(__file__).parent.parent

def load_env():
    """Load environment variables from .env file"""
    env_path = PROJECT_ROOT / '.env'
    env_vars = {}
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
    return env_vars

def get_spreadsheet(gc):
    """Get the spreadsheet using ID or name from .env"""
    env_vars = load_env()

    spreadsheet_id = env_vars.get('SPREADSHEET_ID', '').strip()
    spreadsheet_name = env_vars.get('SPREADSHEET_NAME', '[The Spartan Cup] - MASTER').strip()

    try:
        if spreadsheet_id:
            print(f"Opening spreadsheet by ID: {spreadsheet_id}", file=sys.stderr)
            return gc.open_by_key(spreadsheet_id)
        else:
            print(f"Opening spreadsheet by name: {spreadsheet_name}", file=sys.stderr)
            return gc.open(spreadsheet_name)
    except gspread.exceptions.SpreadsheetNotFound:
        print(f"ERROR: Spreadsheet not found. Make sure:", file=sys.stderr)
        print(f"  1. The spreadsheet ID or name in .env is correct", file=sys.stderr)
        print(f"  2. The service account (claude-code@spartan-cup.iam.gserviceaccount.com) has been granted access", file=sys.stderr)
        print(f"     to the spreadsheet with Editor permissions", file=sys.stderr)
        sys.exit(1)

def parse_csv_row(csv_string):
    """Parse a CSV string into a list of values"""
    reader = csv.reader(StringIO(csv_string))
    return next(reader)

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    sheet_name = sys.argv[1]
    operation = sys.argv[2]

    # Authenticate with service account
    credentials_path = PROJECT_ROOT / 'credentials.json'
    if not credentials_path.exists():
        print(f"ERROR: credentials.json not found at {credentials_path}", file=sys.stderr)
        sys.exit(1)

    gc = gspread.service_account(filename=str(credentials_path))

    # Open the spreadsheet
    sh = get_spreadsheet(gc)

    # Get the specified worksheet
    try:
        worksheet = sh.worksheet(sheet_name)
    except gspread.exceptions.WorksheetNotFound:
        print(f"ERROR: Worksheet '{sheet_name}' not found", file=sys.stderr)
        print(f"Available worksheets:", file=sys.stderr)
        for ws in sh.worksheets():
            print(f"  - {ws.title}", file=sys.stderr)
        sys.exit(1)

    # Perform the requested operation
    if operation == 'append':
        if len(sys.argv) < 4:
            print("ERROR: Missing CSV data for append operation", file=sys.stderr)
            sys.exit(1)
        csv_data = sys.argv[3]
        row_data = parse_csv_row(csv_data)
        worksheet.append_row(row_data)
        print(f"Successfully appended row to {sheet_name}", file=sys.stderr)

    elif operation == 'update':
        if len(sys.argv) < 5:
            print("ERROR: Missing cell and value for update operation", file=sys.stderr)
            print("Usage: python write_sheet.py <sheet_name> update <cell> <value>", file=sys.stderr)
            sys.exit(1)
        cell = sys.argv[3]
        value = sys.argv[4]
        worksheet.update(values=[[value]], range_name=cell)
        print(f"Successfully updated {cell} in {sheet_name}", file=sys.stderr)

    elif operation == 'update_range':
        if len(sys.argv) < 5:
            print("ERROR: Missing range and data for update_range operation", file=sys.stderr)
            print("Usage: python write_sheet.py <sheet_name> update_range <range> <csv_data>", file=sys.stderr)
            sys.exit(1)
        cell_range = sys.argv[3]
        csv_data = sys.argv[4]
        row_data = parse_csv_row(csv_data)
        # Convert single row to 2D array for range update
        worksheet.update(cell_range, [row_data])
        print(f"Successfully updated range {cell_range} in {sheet_name}", file=sys.stderr)

    elif operation == 'clear':
        worksheet.clear()
        print(f"Successfully cleared all data in {sheet_name}", file=sys.stderr)

    else:
        print(f"ERROR: Unknown operation '{operation}'", file=sys.stderr)
        print(__doc__)
        sys.exit(1)

if __name__ == '__main__':
    main()
