#!/usr/bin/env python3
"""
Read data from Google Sheets using a service account.
Usage:
    python read_sheet.py [sheet_name] [output_format]

Arguments:
    sheet_name: Name of the worksheet tab (default: Student_Profiles)
    output_format: csv, json, or table (default: csv)

Examples:
    python read_sheet.py Student_Profiles csv
    python read_sheet.py Events json
    python read_sheet.py Config_Badges table
"""

import gspread
import json
import sys
import os
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

def main():
    # Parse command line arguments
    sheet_name = sys.argv[1] if len(sys.argv) > 1 else 'Student_Profiles'
    output_format = sys.argv[2] if len(sys.argv) > 2 else 'csv'

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

    # Get all values
    data = worksheet.get_all_values()

    if not data:
        print(f"No data found in worksheet '{sheet_name}'", file=sys.stderr)
        sys.exit(0)

    # Output in requested format
    if output_format == 'json':
        # First row is headers
        headers = data[0]
        rows = []
        for row in data[1:]:
            rows.append(dict(zip(headers, row)))
        print(json.dumps(rows, indent=2))

    elif output_format == 'table':
        # Pretty print as table
        if data:
            # Calculate column widths
            col_widths = [max(len(str(row[i])) for row in data) for i in range(len(data[0]))]

            # Print header
            header_row = data[0]
            print("| " + " | ".join(str(cell).ljust(width) for cell, width in zip(header_row, col_widths)) + " |")
            print("|" + "|".join("-" * (width + 2) for width in col_widths) + "|")

            # Print data rows
            for row in data[1:]:
                print("| " + " | ".join(str(cell).ljust(width) for cell, width in zip(row, col_widths)) + " |")

    else:  # csv (default)
        for row in data:
            # Escape commas and quotes in CSV
            escaped_row = []
            for cell in row:
                cell_str = str(cell)
                if ',' in cell_str or '"' in cell_str or '\n' in cell_str:
                    cell_str = '"' + cell_str.replace('"', '""') + '"'
                escaped_row.append(cell_str)
            print(",".join(escaped_row))

if __name__ == '__main__':
    main()
