/**
 * Auth.gs
 * Authentication and User Profile Management Functions
 *
 * This module handles user authentication, profile data, and user settings.
 * Includes functions for:
 * - User email and identity verification
 * - Admin access control
 * - New user detection
 * - Profile data retrieval and display
 * - User settings management
 * - Profile photo and avatar generation
 */

/**
 * Gets the current user's email.
 * If running in API context, checks for explicitly set user.
 * @return {string} User's email
 */
function getUserEmail() {
  // Check if we are in an API execution context with a verified user
  if (typeof API_USER_EMAIL !== 'undefined' && API_USER_EMAIL) {
    return API_USER_EMAIL;
  }

  let email = Session.getActiveUser().getEmail();
  if (!email || email.trim() === '') {
    email = Session.getEffectiveUser().getEmail();
  }
  // Validate email format with basic but robust regex
  // Checks for: local-part @ domain . tld
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    // In some contexts (e.g. consumer accounts running as "Me"), getActiveUser might be empty if not logged in
    // But for this app's domain setup, it should work.
    // However, if we are in API mode and verification failed/wasn't done, this might throw.
    throw new Error('Unable to determine user email');
  }
  return email;
}

/**
 * Gets the current user's display name from the Student_Profiles sheet.
 * Uses cached data if available to avoid redundant Sheets API calls.
 * @param {string} [targetEmail] - Optional email to lookup. Defaults to current user.
 * @return {string} User's display name, or empty string if not found
 */
function getUserDisplayName(targetEmail) {
  const email = targetEmail || getUserEmail();

  try {
    // Try to use cached student data first
    const studentData = getStudentProfilesData();

    // Find user and get display name from column B (index 1)
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        return studentData[i][1] || ''; // Return display name or empty string
      }
    }
  } catch (e) {
    // Logger.log('Error reading user display name: ' + e.message);
  }

  return ''; // Default to empty if not found
}

/**
 * Checks if the current user has admin access.
 * Reads from Config_Admins sheet (same source as backend admin checks).
 * @param {string} [targetEmail] - Optional email to check. Defaults to current user.
 * @return {boolean} True if user is an admin, false otherwise
 */
function getUserIsAdmin(targetEmail) {
  const email = targetEmail || getUserEmail();
  const adminEmails = getAdminEmails(); // Uses Config_Admins sheet with caching
  return adminEmails.includes(email.toLowerCase());
}

/**
 * Checks if the current user is new (not in Student_Profiles sheet).
 * Used to determine if user should see welcome screen.
 * @param {string} [targetEmail] - Optional email to check. Defaults to current user.
 * @return {boolean} True if user is new, false if returning user
 */
function isNewUser(targetEmail) {
  const email = targetEmail || Session.getActiveUser().getEmail(); // Note: Session.getActiveUser() fallback might need adjustment for API

  try {
    const studentData = getStudentProfilesData();

    // Find user in Student_Profiles
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        // User exists in Student_Profiles = returning user (even if display name empty)
        return false;
      }
    }

    // User not found in sheet = definitely a new user
    return true;
  } catch (e) {
    // Logger.log('Error checking if user is new: ' + e.message);
    // On error, assume returning user to avoid unnecessary welcome screens
    return false;
  }
}

function extractInitials(displayName) {
  if (!displayName || displayName.trim() === '') {
    return '?';
  }

  const nameParts = displayName.trim().split(/\s+/); // Split on whitespace

  if (nameParts.length === 1) {
    // Single word name: use first letter twice or just first letter
    return nameParts[0].charAt(0).toUpperCase();
  } else {
    // Multiple words: first letter of first and last word
    const firstInitial = nameParts[0].charAt(0).toUpperCase();
    const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
    return firstInitial + lastInitial;
  }
}

/**
 * Gets user's profile photo from Google Drive or generates avatar with initials.
 * Results are cached for 1 hour to reduce Drive API calls.
 * @param {string} email - User email
 * @param {string} displayName - User's display name for generating initials
 * @return {string} URL to user's profile photo or avatar with initials
 */
function getUserProfilePhoto(email, displayName) {
  // Check user-level cache first (1 hour TTL)
  const cache = CacheService.getUserCache(); // Note: UserCache is specific to the effective user (script owner in executeAs:Me)
  // Ideally for API we might want to use ScriptCache with a key prefix, but UserCache is okay if we accept it's shared for all API users if executeAs:Me
  // Actually, better to use ScriptCache for API users to avoid "UserCache" limits/confusion if running as owner.
  // But strictly, let's keep it simple.

  const cacheKey = 'profile_photo_' + email;
  const cachedUrl = cache.get(cacheKey);

  if (cachedUrl) {
    return cachedUrl;
  }

  let photoUrl;

  try {
    const parentFolders = DriveApp.getFoldersByName('The Spartan Cup');
    if (parentFolders.hasNext()) {
      const parentFolder = parentFolders.next();
      const profileFolders = parentFolder.getFoldersByName('Profile Pictures');
      if (profileFolders.hasNext()) {
        const folder = profileFolders.next();
        const files = folder.getFilesByName(email + '.jpg');
        if (files.hasNext()) {
          const file = files.next();
          // Note: Sharing permissions should be set once during upload, not on every read
          photoUrl = file.getDownloadUrl();
          // Cache Drive photo URL for 1 hour
          cache.put(cacheKey, photoUrl, 3600);
          return photoUrl;
        }
      }
    }
  } catch (e) {
    // Logger.log('Error fetching profile photo: ' + e.message);
  }

  // Fallback: Generate avatar with initials
  const initials = extractInitials(displayName);
  photoUrl = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(initials) + '&background=1b3b87&color=fff&bold=true&size=96';

  // Cache fallback avatar URL for 1 hour
  cache.put(cacheKey, photoUrl, 3600);

  return photoUrl;
}

function getUserSettings(targetEmail) {
  const email = targetEmail || getUserEmail();

  try {
    // Use cached student data to avoid redundant Sheets API calls
    const studentData = getStudentProfilesData();

    // Find user and get settings from column I (index 8)
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        let settingsJson = studentData[i][8];
        if (settingsJson && settingsJson.toString().trim()) {
          settingsJson = settingsJson.toString().trim();
          // Handle malformed JSON by removing extra quotes if present
          if (settingsJson.startsWith('""') && settingsJson.endsWith('""')) {
            settingsJson = settingsJson.slice(2, -2); // Remove outer quotes
          }
          // Logger.log('Raw settings from sheet: ' + settingsJson);
          const parsed = safeJSONParse(settingsJson, {}, 'user settings');
          if (parsed && Object.keys(parsed).length > 0) {
            // Logger.log('Successfully parsed settings: ' + JSON.stringify(parsed));
            return parsed;
          } else {
            // Logger.log('Failed to parse settings JSON or empty result');
            // Logger.log('Malformed JSON was: ' + settingsJson);
          }
        }
      }
    }
  } catch (e) {
    // Logger.log('Error reading user settings: ' + e.message);
  }

  // Return default settings if none found or on error
  const defaults = {
    darkMode: false,
    eventNotifications: true,
    approvalNotifications: true,
    badgeNotifications: true
  };
  // Logger.log('Returning default settings: ' + JSON.stringify(defaults));
  return defaults;
}

/**
 * Saves the current user's settings to the Student_Profiles sheet.
 * Settings are stored as JSON in column I (index 8).
 * @param {Object} settings - Settings object with darkMode, notifications, etc.
 * @param {string} [targetEmail] - Optional email override
 * @return {Object} Confirmation with status
 */
function saveUserSettings(settings, targetEmail) {
  const email = targetEmail || getUserEmail();

  // Logger.log('saveUserSettings called with: ' + JSON.stringify(settings));
  // Logger.log('User email: ' + email);

  try {
    // Use cached data to find user row (reduces Sheets API calls)
    const studentData = getStudentProfilesData();

    // Find user and update settings in column I (index 8)
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        // Logger.log('Found user at row ' + (i + 1));
        const settingsJson = JSON.stringify(settings);
        // Logger.log('Saving JSON: ' + settingsJson);

        // Now get sheet reference for the write operation
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        const studentSheet = ss.getSheetByName('Student_Profiles');
        studentSheet.getRange(i + 1, 9).setValue(settingsJson); // Column I = column 9
        SpreadsheetApp.flush(); // Force immediate write to sheet

        // Clear cache since we modified the data
        const cache = CacheService.getScriptCache();
        cache.remove('student_profiles_data');

        // Logger.log('Settings saved and flushed successfully');
        return { status: 'success', message: 'Settings saved' };
      }
    }

    // Logger.log('User not found in Student_Profiles sheet');
    return { status: 'error', message: 'User profile not found' };
  } catch (e) {
    // Logger.log('Error saving user settings: ' + e.message);
    return { status: 'error', message: 'Failed to save settings: ' + e.message };
  }
}

function getProfileData(targetEmail) {
  const email = targetEmail || getUserEmail();

  try {
    // --- FETCH USER PROFILE DATA ---
    // Use cached data for existing users (99% of cases) - only hit Sheets API for new users
    let studentData = getStudentProfilesData();
    let userProfile = null;

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        userProfile = {
          email: studentData[i][0],
          displayName: studentData[i][1],
          seasonPoints: studentData[i][2] || 0,
          allTimePoints: studentData[i][3] || 0,
          badgesEarned: studentData[i][4] ? safeJSONParse(studentData[i][4], [], 'student badges') : [],
          disqualified: studentData[i][7] || false
        };
        break;
      }
    }

    // If user not in sheet, create a new profile entry (rare case - new user)
    if (!userProfile) {
      // Only now do we need direct sheet access
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const studentSheet = ss.getSheetByName('Student_Profiles');

      const defaultSettings = { darkMode: false, eventNotifications: true, approvalNotifications: true, badgeNotifications: true };
      studentSheet.appendRow([email, '', 0, 0, JSON.stringify([]), '', '', false, JSON.stringify(defaultSettings)]);

      // Clear the cache since we added a new user
      const cache = CacheService.getScriptCache();
      cache.remove('student_profiles_data');

      // Read the newly added row using cached function (rebuilds cache with new user)
      const updatedData = getStudentProfilesData();
      const newRowIndex = updatedData.length - 1;
      const newRow = updatedData[newRowIndex];

      userProfile = {
        email: newRow[0],
        displayName: newRow[1], // Will have the formula-populated value now
        seasonPoints: 0,
        allTimePoints: 0,
        badgesEarned: [],
        disqualified: false
      };

      // Update studentData with the new row included for leaderboard building
      studentData = updatedData;
    }

    // --- BUILD LEADERBOARDS (Season + All-Time) ---
    const seasonLeaderboard = [];
    const allTimeLeaderboard = [];

    for (let i = 1; i < studentData.length; i++) {
      const student = {
        email: studentData[i][0],
        name: studentData[i][1],
        seasonPoints: studentData[i][2] || 0,
        allTimePoints: studentData[i][3] || 0
      };
      seasonLeaderboard.push(student);
      allTimeLeaderboard.push(student);
    }

    // Sort by points (descending)
    seasonLeaderboard.sort((a, b) => b.seasonPoints - a.seasonPoints);
    allTimeLeaderboard.sort((a, b) => b.allTimePoints - a.allTimePoints);

    // Find user's rank
    let seasonRank = 1;
    let allTimeRank = 1;
    for (let i = 0; i < seasonLeaderboard.length; i++) {
      if (seasonLeaderboard[i].email === email) {
        seasonRank = i + 1;
        break;
      }
    }
    for (let i = 0; i < allTimeLeaderboard.length; i++) {
      if (allTimeLeaderboard[i].email === email) {
        allTimeRank = i + 1;
        break;
      }
    }

    // Build top 10 leaderboards with user highlighting
    // If user is in top 10, show top 10
    // If user is outside top 10, show top 9 + user's position with gap indicator

    function buildLeaderboardWithUser(leaderboard, userEmail, pointsKey) {
      const result = [];
      const userIndex = leaderboard.findIndex(s => s.email === userEmail);
      const userRank = userIndex + 1; // userRank = 0 if user not found

      // Helper function to create entry object (reduces duplication)
      function createEntry(index, isCurrentUser, showGapBefore) {
        const student = leaderboard[index];
        return {
          rank: index + 1,
          name: student.name,
          // Use the correct points field based on leaderboard type
          points: student[pointsKey] ?? 0,
          icon: index < 3 ? 'workspace_premium' : 'military_tech',
          color: index === 0 ? 'text-gold' : (index === 1 ? 'text-silver' : (index === 2 ? 'text-bronze' : 'text-gray-400')),
          isCurrentUser: isCurrentUser,
          showGapBefore: showGapBefore
        };
      }

      // Fixed bug: check userRank > 0 to ensure user is on leaderboard
      if (userRank > 0 && userRank <= 10) {
        // User is in top 10, show top 10
        for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
          result.push(createEntry(i, leaderboard[i].email === userEmail, false));
        }
      } else if (userRank > 10) {
        // User is outside top 10, show top 9 + gap + user
        for (let i = 0; i < Math.min(9, leaderboard.length); i++) {
          result.push(createEntry(i, false, false));
        }

        // Add user's position with gap indicator
        result.push(createEntry(userIndex, true, true));
      } else {
        // User not on leaderboard (userRank = 0), just show top 10
        for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
          result.push(createEntry(i, false, false));
        }
      }

      return result;
    }

    const topSeasonLeaderboard = buildLeaderboardWithUser(seasonLeaderboard, email, 'seasonPoints');
    const topAllTimeLeaderboard = buildLeaderboardWithUser(allTimeLeaderboard, email, 'allTimePoints');

    // --- FETCH BADGES ---
    // Use cached badge data (static, doesn't change frequently)
    const badgeMap = getBadgeMapCache();

    // Map earned badge IDs to full badge objects
    const earnedBadges = userProfile.badgesEarned.map(badgeId => {
      const badge = badgeMap[badgeId];
      if (!badge) return null;

      // Determine badge image URL with multiple fallback options:
      // 1. Use badge.imageUrl if provided in Config_Badges sheet
      // 2. Use badge.imageFile if custom filename is specified (supports different extensions)
      // 3. Generate filename from badge name using snake_case convention + .svg
      let imageUrl;
      if (badge.imageUrl) {
        imageUrl = badge.imageUrl;
      } else {
        const imageName = badge.imageFile || (toSnakeCase(badge.name) + '.svg');
        imageUrl = BADGE_BASE_URL + imageName;
      }

      return {
        name: badge.name,
        description: badge.description,
        imageUrl: imageUrl,
        icon: 'military_tech', // Fallback icon if image fails to load
        color: 'bg-gradient-to-br from-indigo-500 to-purple-400' // Fallback color
      };
    }).filter(b => b !== null);

    // --- FETCH SUBMISSION HISTORY ---
    // Use cached verified submissions data (reduces Sheets API calls)
    const verifiedData = getVerifiedSubmissionsData();
    const userSubmissions = [];

    for (let i = 1; i < verifiedData.length; i++) {
      if (verifiedData[i][3] === email) {
        userSubmissions.push({
          submissionId: verifiedData[i][0],
          timestampSubmitted: new Date(verifiedData[i][1]),
          eventId: verifiedData[i][4],
          pointsBase: verifiedData[i][6] || 0,
          pointsTheme: verifiedData[i][7] || 0,
          pointsMultiplier: verifiedData[i][8] || 0,
          pointsTotal: verifiedData[i][9] || 0
        });
      }
    }

    // Fetch event details for history display (cached)
    const eventMap = getEventMapCache();

    // Build history with event names
    const history = userSubmissions.map(submission => {
      const eventInfo = eventMap[submission.eventId] || { name: 'Unknown Event', date: 'N/A', sportArt: 'Other' };

      // Format the date properly - handle both Date objects and ISO strings from cache
      let formattedDate = 'N/A';
      if (eventInfo.date && eventInfo.date !== 'N/A') {
        try {
          const dateObj = eventInfo.date instanceof Date ? eventInfo.date : new Date(eventInfo.date);
          formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) {
          formattedDate = String(eventInfo.date);
        }
      }

      return {
        name: eventInfo.name,
        date: formattedDate,
        points: submission.pointsTotal,
        status: 'Approved',
        icon: eventInfo.sportArt.toLowerCase().includes('basketball') ? 'sports_basketball' :
               eventInfo.sportArt.toLowerCase().includes('hockey') ? 'sports_hockey' :
               eventInfo.sportArt.toLowerCase().includes('art') || eventInfo.sportArt.toLowerCase().includes('play') ? 'theater_comedy' : 'event',
        color: 'text-primary'
      };
    });

    // Fetch pending submissions for history
    // Use cached pending submissions data (reduces Sheets API calls)
    const pendingData = getPendingSubmissionsData();

    for (let i = 1; i < pendingData.length; i++) {
      // Skip empty rows (cleared submissions)
      if (!pendingData[i][0] || pendingData[i][0] === '') {
        continue;
      }

      if (pendingData[i][2] === email) {
        const eventInfo = eventMap[pendingData[i][3]] || { name: 'Unknown Event', date: 'N/A', sportArt: 'Other' };

        // Format submission date consistently with approved submissions
        let submissionDate = 'N/A';
        try {
          const dateObj = new Date(pendingData[i][1]);
          submissionDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) {
          submissionDate = 'N/A';
        }

        history.push({
          name: eventInfo.name,
          date: submissionDate,
          points: 0,
          status: 'Pending',
          icon: eventInfo.sportArt.toLowerCase().includes('basketball') ? 'sports_basketball' :
                 eventInfo.sportArt.toLowerCase().includes('hockey') ? 'sports_hockey' :
                 eventInfo.sportArt.toLowerCase().includes('art') || eventInfo.sportArt.toLowerCase().includes('play') ? 'theater_comedy' : 'event',
          color: 'text-gray-500'
        });
      }
    }

    // Sort history by date (most recent first)
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    // --- RETURN COMBINED DATA ---
    return {
      seasonPoints: userProfile.seasonPoints,
      seasonRank: seasonRank,
      allTimePoints: userProfile.allTimePoints,
      allTimeRank: allTimeRank,
      badges: earnedBadges,
      leaderboard: topSeasonLeaderboard, // Default to season; will swap on toggle
      allTimeLeaderboard: topAllTimeLeaderboard,
      history: history,
      isAdmin: getUserIsAdmin(email) // Return admin status from Config_Admins sheet
    };

  } catch (e) {
    // Logger.log('Error in getProfileData: ' + e.message);
    // Return empty/default data on error
    return {
      seasonPoints: 0,
      seasonRank: 0,
      allTimePoints: 0,
      allTimeRank: 0,
      badges: [],
      leaderboard: [],
      allTimeLeaderboard: [],
      history: []
    };
  }
}
