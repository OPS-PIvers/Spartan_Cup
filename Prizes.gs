// =====================================================================
// SEASON PRIZES MANAGEMENT (Admin Dashboard)
// =====================================================================
// Extracted from Code.js - Lines 6508-6675
// Functions for managing season prizes in the Active_Season_Prizes sheet

/**
 * Gets all season prizes from Active_Season_Prizes sheet.
 * @return {Object} Response with prizes array
 */
function getAllSeasonPrizes() {
  try {
    Logger.log('[getAllSeasonPrizes] Starting');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const prizesSheet = ss.getSheetByName('Active_Season_Prizes');

    if (!prizesSheet) {
      Logger.log('[getAllSeasonPrizes] ERROR: Active_Season_Prizes sheet not found');
      return { status: 'error', message: 'Active_Season_Prizes sheet not found' };
    }

    const data = prizesSheet.getDataRange().getValues();
    Logger.log('[getAllSeasonPrizes] Found ' + (data.length - 1) + ' prizes');

    // Skip header row, map to objects with row indices
    const prizes = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) { // Only include rows with data in column A
        prizes.push({
          rowIndex: i + 1, // 1-indexed for sheet operations
          rank: data[i][0],
          description: data[i][1] || ''
        });
      }
    }

    return {
      status: 'success',
      prizes: prizes
    };
  } catch (e) {
    Logger.log('[getAllSeasonPrizes] ERROR: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: 'error',
      message: 'Error fetching prizes: ' + e.message
    };
  }
}

/**
 * Creates a new prize in Active_Season_Prizes sheet.
 * @param {string} rank - Prize rank/placement (e.g., "1st Place", "Most Spirited")
 * @param {string} description - Prize description
 * @return {Object} Response with status
 */
function createPrize(rank, description) {
  try {
    Logger.log('[createPrize] Rank: ' + rank + ' | Description: ' + description);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const prizesSheet = ss.getSheetByName('Active_Season_Prizes');

    if (!prizesSheet) {
      return { status: 'error', message: 'Active_Season_Prizes sheet not found' };
    }

    // Validate required fields
    if (!rank || !rank.trim()) {
      return { status: 'error', message: 'Rank/placement is required' };
    }
    if (!description || !description.trim()) {
      return { status: 'error', message: 'Prize description is required' };
    }

    // Append new row
    prizesSheet.appendRow([rank.trim(), description.trim()]);
    Logger.log('[createPrize] Prize added successfully');

    return {
      status: 'success',
      message: 'Prize created successfully!'
    };
  } catch (e) {
    Logger.log('[createPrize] ERROR: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: 'error',
      message: 'Error creating prize: ' + e.message
    };
  }
}

/**
 * Updates an existing prize in Active_Season_Prizes sheet.
 * @param {number} rowIndex - Row index (1-based) to update
 * @param {string} rank - Updated rank/placement
 * @param {string} description - Updated prize description
 * @return {Object} Response with status
 */
function updatePrize(rowIndex, rank, description) {
  try {
    Logger.log('[updatePrize] Row: ' + rowIndex + ' | Rank: ' + rank + ' | Description: ' + description);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const prizesSheet = ss.getSheetByName('Active_Season_Prizes');

    if (!prizesSheet) {
      return { status: 'error', message: 'Active_Season_Prizes sheet not found' };
    }

    // Validate required fields
    if (!rank || !rank.trim()) {
      return { status: 'error', message: 'Rank/placement is required' };
    }
    if (!description || !description.trim()) {
      return { status: 'error', message: 'Prize description is required' };
    }

    // Validate row index
    const lastRow = prizesSheet.getLastRow();
    if (rowIndex < 2 || rowIndex > lastRow) {
      return { status: 'error', message: 'Invalid row index' };
    }

    // Update the row
    prizesSheet.getRange(rowIndex, 1, 1, 2).setValues([[rank.trim(), description.trim()]]);
    Logger.log('[updatePrize] Prize updated successfully');

    return {
      status: 'success',
      message: 'Prize updated successfully!'
    };
  } catch (e) {
    Logger.log('[updatePrize] ERROR: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: 'error',
      message: 'Error updating prize: ' + e.message
    };
  }
}

/**
 * Deletes a prize from Active_Season_Prizes sheet.
 * @param {number} rowIndex - Row index (1-based) to delete
 * @return {Object} Response with status
 */
function deletePrize(rowIndex) {
  try {
    Logger.log('[deletePrize] Deleting row: ' + rowIndex);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const prizesSheet = ss.getSheetByName('Active_Season_Prizes');

    if (!prizesSheet) {
      return { status: 'error', message: 'Active_Season_Prizes sheet not found' };
    }

    // Validate row index (must be > 1 to protect header)
    const lastRow = prizesSheet.getLastRow();
    if (rowIndex < 2 || rowIndex > lastRow) {
      return { status: 'error', message: 'Invalid row index or cannot delete header row' };
    }

    // Delete the row
    prizesSheet.deleteRow(rowIndex);
    Logger.log('[deletePrize] Prize deleted successfully');

    return {
      status: 'success',
      message: 'Prize deleted successfully!'
    };
  } catch (e) {
    Logger.log('[deletePrize] ERROR: ' + e.message + ' | Stack: ' + e.stack);
    return {
      status: 'error',
      message: 'Error deleting prize: ' + e.message
    };
  }
}
