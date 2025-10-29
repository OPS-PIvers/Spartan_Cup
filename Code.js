/**
 * ==============================================================================
 * THE SPARTAN CUP - SERVER-SIDE LOGIC (Code.gs)
 * ==============================================================================
 *
 * This file contains all server-side logic, including:
 * 1. A setup function to automatically create all spreadsheet tabs, folders, AND
 * all necessary .html files in your project.
 * 2. A `doGet(e)` router to serve the SPA (Single Page App).
 * 3. `include(filename)` function for templating HTML.
 * 4. `getUserDetails()` to pass user info to the client.
 * 5. All submission and backend logic.
 */

// --- GLOBAL CONFIGURATION ---------------------------------------------------
const CAMPUS_GEOFENCE = [
  [44.9702, -93.6300], [44.9702, -93.6180],
  [44.9630, -93.6180], [44.9630, -93.6300],
];
const ADMIN_EMAILS = ["your-admin-email@domain.com", "another-admin@domain.com"];

// --- 1. WEB APP ROUTER (doGet) ----------------------------------------------

/**
 * Main entry point for the web app. Acts as a router to serve the SPA.
 */
function doGet(e) {
  const page = e.parameter.page || 'profile'; // Default to profile page
  
  // Pass data to the HTML template
  const template = HtmlService.createTemplateFromFile('Index');
  template.page = page; // Tell the template which page to load

  const user = Session.getActiveUser();
  template.userEmail = user.getEmail();
  template.userName = user.getUsername(); // Or use People API for full name
  template.userPhoto = 'https://lh3.googleusercontent.com/a/ACg8ocJ9...[example_url]'; // TODO: Get user's real photo URL
  template.isAdmin = ADMIN_EMAILS.includes(user.getEmail());

  return template.evaluate()
    .setTitle('The Spartan Cup')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Utility function to include HTML content from other files (templating).
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Gets the current user's profile data to populate the page.
 * This is now simplified as we pass initial data in doGet.
 * We'll use this function to get DYNAMIC data (points, rank).
 */
function getProfileData() {
  const email = Session.getActiveUser().getEmail();
  
  // TODO: Fetch real data from 'Student_Profiles' sheet
  // This is mock data for now.
  const mockData = {
    seasonPoints: 150,
    seasonRank: 42,
    allTimePoints: 150,
    allTimeRank: 42,
    badges: [
      { name: 'Hot Streak', icon: 'local_fire_department', color: 'bg-gradient-to-br from-red-500 to-yellow-400' },
      { name: 'Hoops Fan', icon: 'sports_basketball', color: 'bg-gradient-to-br from-blue-500 to-cyan-400' },
      { name: 'Arts Patron', icon: 'theater_comedy', color: 'bg-gradient-to-br from-indigo-500 to-purple-400' }
    ],
    leaderboard: [
      { rank: 1, name: 'John Smith', points: 2100, icon: 'workspace_premium', color: 'text-gold' },
      { rank: 2, name: 'Emily Jones', points: 1980, icon: 'workspace_premium', color: 'text-silver' },
      { rank: 3, name: 'Michael Lee', points: 1850, icon: 'workspace_premium', color: 'text-bronze' },
      { rank: 4, name: 'Sarah Chen', points: 1760, icon: 'military_tech', color: 'text-gray-400' },
      { rank: 5, name: 'David Kim', points: 1600, icon: 'military_tech', color: 'text-gray-400' }
    ],
    history: [
      { name: 'Varsity Basketball vs. Eagles', date: 'Oct 28, 2025', points: 50, status: 'Approved', icon: 'sports_basketball', color: 'text-primary' },
      { name: 'Fall Play Opening Night', date: 'Oct 25, 2025', points: 0, status: 'Pending', icon: 'theater_comedy', color: 'text-gray-500' }
    ]
  };
  
  return mockData;
}


// --- 2. SETUP FUNCTIONS (RUN THIS FIRST) ------------------------------------

/**
 * Creates a menu item in the spreadsheet to run the setup functions.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏆 Spartan Cup Admin')
    .addItem('1. Run First-Time Setup (All Files)', 'firstTimeSetup')
    .addToUi();
}

/**
 * Main setup function: Creates Spreadsheet, Folders, and all HTML files.
 */
function firstTimeSetup() {
  setupSpreadsheet();
  setupDriveFolders();
  createHtmlFiles();
  SpreadsheetApp.getUi().alert('✅ Full Setup Complete!\n\nYour spreadsheet, Drive folders, and all HTML files have been created.\n\nDEPLOY this script as a Web App to get started.');
}

/**
 * Creates all necessary Google Drive folders.
 */
function setupDriveFolders() {
  try {
    DriveApp.createFolder('The Spartan Cup');
    DriveApp.getFoldersByName('The Spartan Cup').next().createFolder('Submissions_Winter_25-26');
    DriveApp.getFoldersByName('The Spartan Cup').next().createFolder('Assets_Badges');
  } catch (e) {
    Logger.log('Drive Folders already exist or error: ' + e.message);
  }
}

/**
 * Creates and formats the entire Google Sheet backend.
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setName('[The Spartan Cup] - MASTER');
  
  const sheets = {
    'Student_Profiles': ['Email', 'Display_Name', 'Total_Points_Season', 'Total_Points_AllTime', 'Badges_Earned', 'Loyalty_Stats_JSON', 'Variety_Stats_Set', 'Disqualified'],
    'Event_Schedule': ['Event_ID', 'Sport_Art', 'Event_Name', 'Date', 'Location_Name', 'Event_Lat', 'Event_Lon', 'Is_Home_Game', 'Is_Spotlight_Game', 'Theme'],
    'Submissions_Pending': ['Submission_ID', 'Timestamp', 'Email', 'Event_ID', 'Photo_URL', 'Photo_ID', 'Location_Data_JSON', 'Dressed_For_Theme', 'Notes'],
    'Submissions_Verified': ['Submission_ID', 'Timestamp_Submitted', 'Timestamp_Approved', 'Email', 'Event_ID', 'Admin_Email', 'Points_Base', 'Points_Theme', 'Points_Spotlight_Multiplier', 'Points_Total'],
    'Config_Badges': ['Badge_ID', 'Badge_Name', 'Category', 'Trigger_Type', 'Trigger_Value', 'Description', 'Badge_Image_URL'],
    'Config_Admins': ['Admin_Email', 'Role']
  };
  
  Object.keys(sheets).forEach((sheetName, index) => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = (index === 0 && ss.getSheetByName('Sheet1')) ? ss.getSheetByName('Sheet1').setName(sheetName) : ss.insertSheet(sheetName);
    }
    sheet.clear();
    sheet.appendRow(sheets[sheetName]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheets[sheetName].length).setFontWeight('bold');
  });

  // Add sample data
  ss.getSheetByName('Event_Schedule').appendRow(['GBB-01', 'Girls Basketball', 'vs. Edina', '2025-11-15', 'Orono High School Gym', 44.965, -93.625, true, true, 'White Out']);
  ss.getSheetByName('Config_Admins').appendRow([Session.getActiveUser().getEmail(), 'Owner']);
  ADMIN_EMAILS.forEach(email => {
    if (email !== Session.getActiveUser().getEmail()) {
      ss.getSheetByName('Config_Admins').appendRow([email, 'Student Admin']);
    }
  });
}

/**
 * Creates all the necessary HTML files in the Apps Script project.
 */
function createHtmlFiles() {
  const files = {
    'Index.html': `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Spartan Cup</title>
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <link href="https://fonts.googleapis.com" rel="preconnect"/>
  <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;900&amp;display=swap" rel="stylesheet"/>
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet"/>
  <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
  
  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "primary": "#1b3b87", "secondary": "#b5121b", "light-gray": "#cacbcd",
            "background-light": "#f6f6f8", "background-dark": "#0a1f47",
            "gold": "#FFD700", "silver": "#C0C0C0", "bronze": "#CD7F32",
          },
          fontFamily: { "display": ["Public Sans", "sans-serif"] },
          borderRadius: { "DEFAULT": "0.5rem", "lg": "0.75rem", "xl": "1rem", "full": "9999px" },
        },
      },
    }
  </script>
  <?!= include('CSS'); ?>
</head>

<body class="font-display bg-background-light dark:bg-background-dark">

  <!-- Main App Container -->
  <div class="max-w-md mx-auto bg-background-light dark:bg-background-dark min-h-screen shadow-lg">

    <!-- Header -->
    <header class="sticky top-0 z-10 flex h-16 items-center bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-sm px-4 justify-between border-b border-gray-200 dark:border-gray-800">
      <div class="flex size-10 shrink-0 items-center justify-start">
        <span id="header-back-button" class="material-symbols-outlined text-2xl text-[#111318] dark:text-white cursor-pointer hidden">arrow_back_ios_new</span>
      </div>
      <h1 id="page-title" class="text-lg font-bold leading-tight tracking-[-0.015em] text-[#111318] dark:text-white flex-1 text-center"></h1>
      <div class="flex size-10 shrink-0 items-center justify-end">
        <span id="settings-button" class="material-symbols-outlined text-2xl text-[#111318] dark:text-white cursor-pointer">settings</span>
      </div>
    </header>

    <!-- Page Content Area -->
    <main class="pb-24">
      <?!= include('Page.' + page); ?>
    </main>
  </div>

  <!-- Modals (Hidden by default) -->
  <?!= include('Modals'); ?>

  <!-- Main 4-Tab Navigation Bar -->
  <nav class="fixed bottom-0 left-0 right-0 max-w-md mx-auto h-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-800 flex justify-around">
    <a href="<?= getWebAppUrl() ?>?page=profile" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="profile">
      <span class="material-symbols-outlined text-2xl">person</span><span class="text-xs font-medium">Profile</span>
    </a>
    <a href="<?= getWebAppUrl() ?>?page=history" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="history">
      <span class="material-symbols-outlined text-2xl">event</span><span class="text-xs font-medium">History</span>
    </a>
    <a href="<?= getWebAppUrl() ?>?page=prizes" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="prizes">
      <span class="material-symbols-outlined text-2xl">emoji_events</span><span class="text-xs font-medium">Prizes</span>
    </a>
    <a href="<?= getWebAppUrl() ?>?page=fanfeed" class="nav-item flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-1/4" data-page="fanfeed">
      <span class="material-symbols-outlined text-2xl">dynamic_feed</span><span class="text-xs font-medium">Fan Feed</span>
    </a>
  </nav>

  <!-- Client-side JavaScript -->
  <script>
    // Pass server-side data to client-side JS
    const APP_DATA = {
      page: "<?= page ?>",
      userEmail: "<?= userEmail ?>",
      userName: "<?= userName ?>",
      userPhoto: "<?= userPhoto ?>",
      isAdmin: <?= isAdmin ?>,
      appUrl: "<?= getWebAppUrl() ?>"
    };
  </script>
  <?!= include('JavaScript'); ?>
</body>
</html>`,
    'CSS.html': `<style>
    body {
      font-family: 'display', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      padding-bottom: 80px; 
    }
    .material-symbols-outlined {
      font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24
    }
    .page {
      animation: fadeIn 0.3s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .nav-item.active .material-symbols-outlined { color: #1b3b87; }
    .nav-item.active span { color: #1b3b87; font-weight: 700; }
    #qr-reader video {
      width: 100% !important;
      height: auto !important;
      border-radius: 1.5rem;
    }
    @keyframes scan {
      0% { transform: translateY(0); }
      50% { transform: translateY(calc(280px - 2px)); }
      100% { transform: translateY(0); }
    }
  </style>`,
    'JavaScript.html': `<script>
    // --- STATE & PAGE ROUTING -----------------------------------------------
    let html5QrCode = null;
    
    const TITLES = {
      'profile': 'My Profile', 'history': 'Event History', 'prizes': 'Prizes & Awards',
      'fanfeed': 'Fan Feed', 'scanner': 'Scan Event Code', 'submit': 'Submit Attendance',
      'settings': 'Settings', 'all-badges': 'All Badges', 'admin': 'Admin Dashboard'
    };

    /**
     * Main function to navigate between pages using URL parameters
     */
    function navigateToPage(pageName) {
      if (pageName) {
        window.top.location.href = APP_DATA.appUrl + '?page=' + pageName;
      }
    }

    // --- QR SCANNER LOGIC ---------------------------------------------------
    function startScanner() {
      if (html5QrCode && html5QrCode.isScanning) return;
      
      html5QrCode = new Html5Qrcode("qr-reader");
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };

      html5QrCode.start(
        { facingMode: "environment" }, config,
        (decodedText, decodedResult) => { // onScanSuccess
          console.log(\`Scan result: \${decodedText}\`, decodedResult);
          stopScanner();
          
          try {
            const url = new URL(decodedText);
            const eventId = url.searchParams.get('event');
            if (eventId) {
              navigateToPage('submit&event=' + eventId);
            } else {
              alert('Invalid QR Code. No event ID found.');
            }
          } catch (e) {
            alert('Scanned code is not a valid event URL.');
          }
        },
        (error) => { /* onScanFailure, optional */ }
      );
    }
    
    function stopScanner() {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("Failed to stop QR scanner:", err));
        html5QrCode = null;
      }
    }

    function enterCodeManually() {
      stopScanner();
      const eventId = prompt("Please enter the 6-digit event code:");
      if (eventId && eventId.length > 3) { // Simple validation
        navigateToPage('submit&event=' + eventId);
      }
    }

    // --- EVENT LISTENERS ----------------------------------------------------
    document.addEventListener('DOMContentLoaded', () => {
      // 1. Set Page Title
      document.getElementById('page-title').innerText = TITLES[APP_DATA.page] || 'The Spartan Cup';
      
      // 2. Set Active Nav Item
      const activeNavItem = document.querySelector(\`.nav-item[data-page="\${APP_DATA.page}"]\`);
      if (activeNavItem) activeNavItem.classList.add('active');

      // 3. Handle Back/Settings Buttons
      const backButton = document.getElementById('header-back-button');
      const settingsButton = document.getElementById('settings-button');
      
      if (APP_DATA.page !== 'profile') {
        backButton.classList.remove('hidden');
        backButton.addEventListener('click', () => navigateToPage('profile'));
      }
      settingsButton.addEventListener('click', () => navigateToPage('settings'));

      // --- PAGE-SPECIFIC LOGIC ---
      
      if (APP_DATA.page === 'profile') {
        document.getElementById('scan-qr-button').addEventListener('click', () => navigateToPage('scanner'));
        document.getElementById('event-history-button').addEventListener('click', () => navigateToPage('history'));
        document.getElementById('view-all-badges-button').addEventListener('click', () => navigateToPage('all-badges'));
        if(APP_DATA.isAdmin) {
          document.getElementById('admin-button').addEventListener('click', () => navigateToPage('admin'));
        }
        
        // Leaderboard Toggle
        document.getElementById('leaderboard-toggle').addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') {
            document.querySelectorAll('#leaderboard-toggle button').forEach(btn => btn.classList.remove('active-toggle'));
            e.target.classList.add('active-toggle');
            // TODO: Add logic to fetch and display the correct leaderboard
            console.log("Leaderboard view changed to:", e.target.dataset.view);
          }
        });
        
        // Load dynamic profile data
        google.script.run.withSuccessHandler(populateProfile).getProfileData();
      }
      
      if (APP_DATA.page === 'scanner') {
        document.getElementById('scanner-close-button').addEventListener('click', () => navigateToPage('profile'));
        document.getElementById('manual-entry-button').addEventListener('click', enterCodeManually);
        startScanner(); // Auto-start scanner
      }
      
      if (APP_DATA.page === 'history') {
        google.script.run.withSuccessHandler(populateHistory).getProfileData(); // Re-using getProfileData
      }

      if (APP_DATA.page === 'submit') {
        document.getElementById('submission-form').addEventListener('submit', handleFormSubmit);
        // TODO: Get event name from eventId passed in URL
        // const urlParams = new URLSearchParams(window.location.search);
        // const eventId = urlParams.get('event');
        // google.script.run.withSuccessHandler(populateEventDetails).getEventDetails(eventId);
      }
      
      // Onboarding
      // TODO: Use google.script.run to check PropertiesService
      // document.getElementById('onboarding-modal').classList.remove('hidden');
      document.getElementById('onboarding-agree').addEventListener('click', () => {
        document.getElementById('onboarding-modal').classList.add('hidden');
      });
      
      // Modal Buttons
      document.getElementById('modal-cancel').addEventListener('click', () => {
        document.getElementById('confirm-modal').classList.add('hidden');
      });
      document.getElementById('modal-proceed').addEventListener('click', () => {
        document.getElementById('confirm-modal').classList.add('hidden');
        // Resubmit logic here
      });
    });

    // --- DATA POPULATION ---
    function populateProfile(data) {
      document.getElementById('profile-name').innerText = APP_DATA.userName;
      document.getElementById('profile-email').innerText = APP_DATA.userEmail;
      document.getElementById('profile-points').innerText = data.seasonPoints;
      document.getElementById('profile-rank').innerText = \`#\${data.seasonRank}\`;
      document.getElementById('profile-alltime').innerText = \`\${data.allTimePoints} PTS / Rank #\${data.allTimeRank}\`;
      
      // Populate Badges
      const badgeContainer = document.getElementById('badge-container');
      badgeContainer.innerHTML = ''; // Clear
      data.badges.forEach(badge => {
        badgeContainer.innerHTML += \`
          <div class="flex flex-col items-center gap-1 shrink-0">
            <div class="flex items-center justify-center w-14 h-14 rounded-full \${badge.color} text-white shadow-md">
              <span class="material-symbols-outlined text-3xl">\${badge.icon}</span>
            </div>
            <span class="text-xs font-medium text-gray-600 dark:text-gray-300">\${badge.name}</span>
          </div>\`;
      });
      badgeContainer.innerHTML += document.getElementById('view-all-badges-template').innerHTML; // Add back the 'View All'
      // Re-add listener for the new 'View All' button
      badgeContainer.querySelector('#view-all-badges-button').addEventListener('click', () => navigateToPage('all-badges'));

      // Populate Leaderboard
      const lbContainer = document.getElementById('leaderboard-container');
      lbContainer.innerHTML = ''; // Clear
      data.leaderboard.forEach(item => {
        lbContainer.innerHTML += \`
          <div class="flex items-center gap-3 rounded-lg p-3 \${item.rank === 1 ? 'bg-primary/10 dark:bg-primary/20' : ''}">
            <span class="font-bold text-lg \${item.rank === 1 ? 'text-primary dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'} w-5 text-center">\${item.rank}</span>
            <span class="material-symbols-outlined text-2xl \${item.color}">\${item.icon}</span>
            <span class="flex-1 truncate font-medium text-[#111318] dark:text-white">\${item.name}</span>
            <span class="font-bold \${item.rank === 1 ? 'text-primary dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'}">\${item.points} PTS</span>
          </div>\`;
      });
    }
    
    function populateHistory(data) {
      document.getElementById('history-points').innerText = data.seasonPoints;
      const historyContainer = document.getElementById('history-container');
      historyContainer.innerHTML = ''; // Clear
      data.history.forEach(item => {
        let statusColor = item.status === 'Approved' ? 'text-green-600' : (item.status === 'Pending' ? 'text-gray-500' : 'text-red-600');
        historyContainer.innerHTML += \`
          <div class="flex items-center gap-4 rounded-xl bg-white dark:bg-gray-800/50 p-4 shadow-sm \${item.status !== 'Approved' ? 'opacity-60' : ''}">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
              <span class="material-symbols-outlined text-3xl \${item.color}">\${item.icon}</span>
            </div>
            <div class="flex-1">
              <p class="font-bold text-[#111318] dark:text-white">\${item.name}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">\${item.date}</p>
            </div>
            <div class="text-right">
              <p class="text-lg font-bold \${item.color}">\${item.status === 'Approved' ? '+' + item.points + ' PTS' : '+0 PTS'}</p>
              <span class="text-xs font-semibold \${statusColor}">\${item.status}</span>
            </div>
          </div>\`;
      });
    }

    // --- FORM SUBMISSION ---
    let pendingFormData = null;
    let pendingPhotoBlob = null;
    
    function handleFormSubmit(e) {
      e.preventDefault();
      document.getElementById('loading-modal').classList.remove('hidden');
      
      const photoFile = document.getElementById('photo-input').files[0];
      if (!photoFile) {
        alert('Please select a photo!');
        document.getElementById('loading-modal').classList.add('hidden');
        return;
      }
      
      const formData = {
        eventId: new URLSearchParams(window.location.search).get('event'),
        theme: document.getElementById('theme-check').checked,
        notes: document.getElementById('notes').value,
        location: null
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          formData.location = {
            lat: position.coords.latitude, lon: position.coords.longitude, acc: position.coords.accuracy
          };
          
          const reader = new FileReader();
          reader.onload = (e) => {
            const photoBlob = e.target.result;
            pendingFormData = formData;
            pendingPhotoBlob = photoBlob;

            google.script.run
              .withSuccessHandler(handleSubmissionResponse)
              .withFailureHandler(handleFailure)
              .submitEvent(formData, photoBlob);
          };
          reader.readAsDataURL(photoFile);
        },
        (error) => {
          alert(\`Error: Location services are required. \${error.message}\`);
          document.getElementById('loading-modal').classList.add('hidden');
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }

    function handleSubmissionResponse(response) {
      document.getElementById('loading-modal').classList.add('hidden');
      
      if (response.status === "success") {
        alert(response.message);
        navigateToPage('profile');
        
      } else if (response.status === "pending_conflict") {
        document.getElementById('modal-message').innerText = response.message;
        document.getElementById('confirm-modal').classList.remove('hidden');
        // Add logic to modal-proceed to call resubmitEvent
        
      } else if (response.status === "error") {
        alert(response.message);
      }
    }

    function handleFailure(error) {
      document.getElementById('loading-modal').classList.add('hidden');
      alert('A critical error occurred: ' + error.message);
    }
  </script>`,
    'Modals.html': `<!-- Onboarding Modal -->
  <div id="onboarding-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 hidden">
    <div class="bg-background-light dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
      <h3 class="text-2xl font-bold text-primary dark:text-blue-300">Welcome to The Spartan Cup!</h3>
      <p class="py-4 text-gray-600 dark:text-gray-300">Earn points by supporting Orono events!</p>
      <ol class="list-decimal list-inside text-sm space-y-2 text-gray-600 dark:text-gray-300">
        <li>Tap "Scan QR" on your profile to attend an event.</li>
        <li>Scan the event's QR code & submit your photo.</li>
        <li>Earn points, get badges, and climb the leaderboard!</li>
      </ol>
      <p class="text-xs text-secondary dark:text-red-400 bg-secondary/10 p-2 rounded mt-4">
        **Heads Up:** Cheating (fake photos, etc.) will result in disqualification.
      </p>
      <button id="onboarding-agree" class="w-full bg-primary text-white font-bold py-2 px-4 rounded-lg mt-4 active:scale-95 transition-transform">
        I Understand & Agree
      </button>
    </div>
  </div>

  <!-- Confirmation (Overwrite) Modal -->
  <div id="confirm-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
    <div class="bg-background-light dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
      <h3 class="text-lg font-bold text-[#111318] dark:text-white">Are you sure?</h3>
      <p id="modal-message" class="py-4 text-gray-700 dark:text-gray-300">This will delete your current submission for this event. Do you want to proceed?</p>
      <div class="flex justify-end space-x-2">
        <button id="modal-cancel" class="px-4 py-2 rounded bg-gray-200 text-gray-800 font-semibold">Cancel</button>
        <button id="modal-proceed" class="px-4 py-2 rounded bg-secondary text-white font-semibold">Yes, Proceed</button>
      </div>
    </div>
  </div>
  
  <!-- Loading Spinner Modal -->
  <div id="loading-modal" class="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center p-4 z-50 hidden">
    <div class="bg-background-light dark:bg-gray-800 p-6 rounded-lg shadow-xl flex items-center space-x-4">
      <svg class="animate-spin h-6 w-6 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="font-semibold text-gray-600 dark:text-gray-300">Submitting...</span>
    </div>
  </div>`,
    'Page.profile.html': `<div class="p-4 pt-6 @container">
    <div class="flex w-full flex-col gap-4">
      <div class="flex gap-4 items-center">
        <div id="profile-photo" class="bg-center bg-no-repeat aspect-square bg-cover rounded-full h-24 w-24 shrink-0 border-4 border-white dark:border-gray-700 shadow-md" style='background-image: url("https://lh3.googleusercontent.com/a/ACg8ocJ9...[example_url]");'></div>
        <div class="flex flex-col justify-center">
          <p id="profile-name" class="text-[#111318] dark:text-white text-[22px] font-bold leading-tight tracking-[-0.015em]">Student Name</p>
          <p id="profile-email" class="text-[#616f89] dark:text-gray-400 text-base font-normal leading-normal">student.email@domain.com</p>
        </div>
      </div>
    </div>
  </div>
  <div class="px-4 mt-2">
    <h3 class="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Earned Badges</h3>
    <div id="badge-container" class="flex items-center gap-4 overflow-x-auto pb-2 -mb-2">
      <!-- Badges populated by JavaScript -->
      <div class="text-xs text-gray-500">Loading badges...</div>
    </div>
    <!-- This template is grabbed by JS and re-added after populating badges -->
    <template id="view-all-badges-template">
      <div id="view-all-badges-button" class="flex flex-col items-center gap-1 shrink-0 cursor-pointer">
        <div class="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-gray-500 to-gray-400 text-white shadow-md">
          <span class="material-symbols-outlined text-3xl">more_horiz</span>
        </div>
        <span class="text-xs font-medium text-gray-600 dark:text-gray-300">View All</span>
      </div>
    </template>
  </div>
  <div class="flex flex-col gap-3 px-4 mt-6">
    <button id="scan-qr-button" class="flex min-w-[84px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg h-14 px-5 bg-gradient-button text-white text-base font-bold leading-normal tracking-[0.015em] w-full shadow-lg shadow-primary/30 active:scale-95 transition-transform" style="background-image: linear-gradient(to right, #b5121b, #1b3b87)">
      <span class="material-symbols-outlined text-2xl">qr_code_scanner</span>
      <span class="truncate">Scan QR to Earn Points</span>
    </button>
    <button id="event-history-button" class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-gray-200 dark:bg-gray-700/50 text-[#111318] dark:text-white text-base font-bold leading-normal tracking-[0.015em] w-full active:scale-95 transition-transform">
      <span class="truncate">Previously Attended Events &amp; Point Earnings</span>
    </button>
  </div>
  <div class="flex flex-col gap-2 px-4 mt-6">
    <div class="flex w-full flex-col gap-4 rounded-xl p-4 bg-white dark:bg-gray-800/50 shadow-sm">
      <p class="text-base font-bold text-primary dark:text-blue-300 leading-normal">Current Season: Winter 25-26</p>
      <div class="flex">
        <div class="flex-1">
          <p class="text-base font-medium leading-normal text-gray-500 dark:text-gray-400">Points</p>
          <p id="profile-points" class="text-primary dark:text-white tracking-[-0.02em] text-5xl font-black leading-tight">...</p>
        </div>
        <div class="border-l border-gray-200 dark:border-gray-700 mx-4"></div>
        <div class="flex-1">
          <p class="text-base font-medium leading-normal text-gray-500 dark:text-gray-400">Rank</p>
          <p id="profile-rank" class="text-secondary dark:text-red-400 tracking-[-0.02em] text-5xl font-black leading-tight">...</p>
        </div>
      </div>
      <div class="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between items-center text-sm">
        <p class="text-gray-500 dark:text-gray-400 font-medium">All Time:</p>
        <p id="profile-alltime" class="text-gray-600 dark:text-gray-300 font-bold">... PTS / Rank ...</p>
      </div>
    </div>
  </div>
  <div class="mt-4">
    <div class="px-4 pb-3">
      <style> .active-toggle { background-color: white; color: #1b3b87; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1); } .dark .active-toggle { background-color: #374151; color: white; } </style>
      <div id="leaderboard-toggle" class="bg-gray-200 dark:bg-gray-800 p-1 rounded-lg flex items-center">
        <button data-view="season" class="flex-1 py-2 px-3 text-center text-sm font-bold rounded-md active-toggle">Current Season</button>
        <button data-view="all-time" class="flex-1 py-2 px-3 text-center text-sm font-bold rounded-md text-gray-600 dark:text-gray-400">All Time</button>
      </div>
    </div>
    <h3 class="text-[#111318] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] px-4 pb-2 pt-2">Top 5 Spartans</h3>
    <div class="flex flex-col gap-2 px-4">
      <div id="leaderboard-container" class="flex flex-col gap-2 rounded-xl bg-white dark:bg-gray-800/50 p-2 shadow-sm">
        <p class="p-4 text-center text-gray-500">Loading leaderboard...</p>
      </div>
    </div>
  </div>
  <div id="admin-button-container" class="px-4 mt-6">
    <!-- Admin button will be shown/hidden by JS based on APP_DATA.isAdmin -->
    <button id="admin-button" class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-secondary/10 dark:bg-secondary/20 text-secondary dark:text-red-400 text-base font-bold leading-normal tracking-[0.015em] w-full active:scale-95 transition-transform">
      <span class="truncate">Admin Dashboard</span>
    </button>
  </div>`,
    'Page.history.html': `<div class="p-4 pt-6">
    <div class="rounded-xl bg-gradient-total-points p-6 text-white shadow-lg shadow-primary/30" style="background-image: linear-gradient(to right, #b5121b, #1b3b87)">
      <p class="text-base font-medium leading-normal opacity-80">Total Points Earned</p>
      <p id="history-points" class="mt-1 tracking-[-0.02em] text-5xl font-black leading-tight">...</p>
    </div>
  </div>
  <div id="history-container" class="flex flex-col gap-3 px-4 mt-4">
    <p class="p-4 text-center text-gray-500">Loading history...</p>
  </div>`,
    'Page.prizes.html': `<div class="p-4">
    <div class="bg-white dark:bg-gray-800/50 p-4 rounded-xl shadow-sm space-y-4">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 border-b-2 border-gray-200 dark:border-gray-700 pb-2">🏆 Season Awards</h2>
      <p class="text-[#111318] dark:text-white">The top 3 fans at the end of the season win!</p>
      <ul class="list-disc list-inside space-y-1 text-[#111318] dark:text-white">
        <li><span class="font-bold">1st Place:</span> [TBD Prize]</li>
        <li><span class="font-bold">2nd Place:</span> [TBD Prize]</li>
        <li><span class="font-bold">3rd Place:</span> [TBD Prize]</li>
      </ul>
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 border-b-2 border-gray-200 dark:border-gray-700 pb-2 mt-6">🏅 Sport Superfan Awards</h2>
      <p class="text-[#111318] dark:text-white">The top fan for each individual sport or art wins a booster-sponsored prize!</p>
      <div class="flex flex-wrap gap-2 text-sm">
        <span class="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-300 font-semibold px-3 py-1 rounded-full">Girls Basketball</span>
        <span class="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-300 font-semibold px-3 py-1 rounded-full">Boys Basketball</span>
        <span class="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-300 font-semibold px-3 py-1 rounded-full">Girls Hockey</span>
      </div>
    </div>
  </div>`,
    'Page.fanfeed.html': `<div class="p-4">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm text-center">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300">Fan Feed</h2>
      <p class="text-[#111318] dark:text-white mt-4">The Fan Feed is coming soon! This is where you'll see a live feed of approved event photos.</p>
    </div>
  </div>`,
    'Page.scanner.html': `<div class="page fixed inset-0 z-50 bg-background-dark text-white">
    <div class="relative flex h-full min-h-screen w-full flex-col overflow-hidden">
      <div class="relative z-10 flex h-full min-h-screen flex-col">
        <header class="flex items-center justify-between p-4">
          <button id="scanner-close-button" aria-label="Go back" class="flex size-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
            <span class="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
        </header>
        <main class="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <h1 class="text-xl font-bold">Scan Event QR Code</h1>
          <p class="mt-2 text-light-gray">Position the QR code within the frame to check in.</p>
          <div class="relative mt-8 flex aspect-square w-full max-w-[280px] items-center justify-center">
            <div id="qr-reader" class="w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden"></div>
            <div class="scanner-overlay absolute h-[280px] w-[280px] rounded-2xl" style="box-shadow: 0 0 0 9999px rgba(18, 18, 18, 0.7);"></div>
            <div class="absolute w-[280px] h-[280px]">
              <div class="scanning-frame-corner" style="position: absolute; width: 48px; height: 48px; border-style: solid; border-color: #ffffff; top: -4px; left: -4px; border-width: 4px 0 0 4px; border-top-left-radius: 1.75rem;"></div>
              <div class="scanning-frame-corner" style="position: absolute; width: 48px; height: 48px; border-style: solid; border-color: #ffffff; top: -4px; right: -4px; border-width: 4px 4px 0 0; border-top-right-radius: 1.75rem;"></div>
              <div class="scanning-frame-corner" style="position: absolute; width: 48px; height: 48px; border-style: solid; border-color: #ffffff; bottom: -4px; left: -4px; border-width: 0 0 4px 4px; border-bottom-left-radius: 1.75rem;"></div>
              <div class="scanning-frame-corner" style="position: absolute; width: 48px; height: 48px; border-style: solid; border-color: #ffffff; bottom: -4px; right: -4px; border-width: 0 4px 4px 0; border-bottom-right-radius: 1.75rem;"></div>
              <div class="scan-line" style="position: absolute; top: 0; left: 5%; right: 5%; height: 2px; background: linear-gradient(90deg, transparent, rgba(181, 18, 27, 0.8), transparent); box-shadow: 0 0 10px 1px #b5121b; animation: scan 2.5s infinite cubic-bezier(0.4, 0, 0.2, 1);"></div>
            </div>
          </div>
        </main>
        <footer class="flex flex-col items-center gap-6 p-6 pb-12">
          <button id="manual-entry-button" class="flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/30 backdrop-blur-sm px-6 py-4 text-center">
            <span class="material-symbols-outlined text-3xl">edit_document</span>
            <span class="text-sm font-medium">Enter Code Manually</span>
          </button>
        </footer>
      </div>
    </div>
  </div>`,
    'Page.submit.html': `<div class="p-4">
    <form id="submission-form" class="space-y-4">
      <div>
        <label class="font-bold text-[#111318] dark:text-white">Event</label>
        <input type="text" id="event-name" value="Loading event..." readonly class="w-full p-3 border rounded-lg bg-gray-200 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
      </div>
      <div>
        <label class="font-bold text-[#111318] dark:text-white">Take a Photo</label>
        <input type="file" id="photo-input" accept="image/*" capture="environment" required class="w-full text-sm file:mr-4 file:py-3 file:px-5 file:rounded-lg file:border-0 file:font-bold file:bg-primary/10 file:text-primary dark:file:bg-primary/20 dark:file:text-blue-300 hover:file:bg-primary/20">
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Tip: Use your camera! Old photos may be denied.</p>
      </div>
      <div class="flex items-center">
        <input type="checkbox" id="theme-check" class="h-5 w-5 rounded text-primary focus:ring-primary">
        <label for="theme-check" class="ml-2 font-bold text-[#111318] dark:text-white">I'm dressed for the theme!</label>
      </div>
      <div>
        <label for="notes" class="font-bold text-[#111318] dark:text-white">Notes (Optional)</label>
        <textarea id="notes" rows="3" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary dark:bg-gray-800/50 dark:border-gray-700 dark:text-white" placeholder="e.g., My face is painted!"></textarea>
      </div>
      <button type="submit" class="w-full bg-secondary text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors active:scale-95">
        Submit Attendance
      </button>
    </form>
  </div>`,
    'Page.settings.html': `<div class="p-4">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300">Settings</h2>
      <p class="text-[#111318] dark:text-white mt-4">App settings and account information will go here.</p>
      <!-- TODO: Add dark mode toggle, notification preferences, etc. -->
    </div>
  </div>`,
    'Page.all-badges.html': `<div class="p-4">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
      <h2 class="text-2xl font-bold text-primary dark:text-blue-300 mb-4">All Earned Badges</h2>
      <p class="text-[#111318] dark:text-white">A full grid or list of all earned badges will go here.</p>
      <!-- TODO: Populate with a grid of all badges from user's profile -->
    </div>
  </div>`,
    'Page.admin.html': `<div class="p-4">
    <div class="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-sm">
      <h2 class="text-2xl font-bold text-secondary dark:text-red-400 mb-4">Admin Dashboard</h2>
      <p class="text-[#111318] dark:text-white">This page is only visible to admins.</p>
      <h3 class="text-lg font-bold text-[#111318] dark:text-white mt-6">Pending Submissions</h3>
      <p class="text-gray-500 dark:text-gray-400">The "swipe-to-approve" UI will go here.</p>
      <!-- TODO: Build admin verification queue -->
    </div>
  </div>`
  };

  Object.keys(files).forEach(filename => {
    // Check if file already exists
    const existingFiles = DriveApp.getFilesByName(filename);
    let found = false;
    while (existingFiles.hasNext()) {
      const file = existingFiles.next();
      if (file.getOwner().getEmail() === Session.getEffectiveUser().getEmail()) {
        found = true;
        break;
      }
    }
    
    // If not found, create it
    if (!found) {
      try {
        Logger.log('Creating file: ' + filename);
        const blob = Utilities.newBlob(files[filename], 'text/html', filename);
        DriveApp.getRootFolder().createFile(blob);
      } catch (e) {
        Logger.log(`Failed to create file ${filename}: ${e.message}`);
        // This can fail if it's not in the root folder, but it's the only way
        // to programmatically add files to an Apps Script project.
        // The user may need to create them manually if this fails.
      }
    } else {
      Logger.log('File already exists: ' + filename);
    }
  });
  
  // After trying to create, we can't be 100% sure they were added to the project
  // So we provide instructions.
  SpreadsheetApp.getUi().alert('HTML File Creation Attempted', 'The script tried to create all .html files. If they do not appear in the editor on the left, please reload this page. If they are still missing, you may need to create them manually and copy the content from the "Code.gs" file.', SpreadsheetApp.getUi().ButtonSet.OK);
}


// --- 3. SUBMISSION LOGIC (STUDENT) ------------------------------------------

/**
 * Returns the web app's URL.
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/** Utility function to find a pending submission. */
function findPendingSubmission(email, eventId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Submissions_Pending');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === email && data[i][3] === eventId) {
      return { row: i + 1, photoId: data[i][5] };
    }
  }
  return null;
}

/** Utility function to find a verified submission. */
function findVerifiedSubmission(email, eventId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Submissions_Verified');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === email && data[i][4] === eventId) {
      return { row: i + 1 };
    }
  }
  return null;
}

/** Utility function to save the uploaded photo to Google Drive. */
function savePhotoToDrive(photoBlob, eventId, email) {
  const folder = DriveApp.getFoldersByName('The Spartan Cup').next().getFoldersByName('Submissions_Winter_25-26').next();
  const contentType = photoBlob.split(';')[0].replace('data:', '');
  const bytes = Utilities.base64Decode(photoBlob.split(',')[1]);
  const blob = Utilities.newBlob(bytes, contentType, `SUB_${eventId}_${email}_${new Date().getTime()}.jpg`);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return { id: file.getId(), url: file.getDownloadUrl() };
}

/**
 * STEP 1: Called when a user first hits "Submit".
 */
function submitEvent(formObject, photoBlob) {
  const email = Session.getActiveUser().getEmail();
  const eventId = formObject.eventId;

  try {
    if (findVerifiedSubmission(email, eventId)) {
      return { status: "error", message: "Your submission for this event has already been verified by an admin and cannot be changed." };
    }
    if (findPendingSubmission(email, eventId)) {
      return { status: "pending_conflict", message: "This will delete your current submission for this event. Do you want to proceed?" };
    }
    
    const file = savePhotoToDrive(photoBlob, eventId, email);
    
    const pendingSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Submissions_Pending');
    pendingSheet.appendRow([
      Utilities.getUuid(), new Date(), email, eventId,
      file.url, file.id, JSON.stringify(formObject.location),
      formObject.theme, formObject.notes
    ]);
    
    return { status: "success", message: "Submission received! You can view it in your 'My History' page." };

  } catch (e) {
    Logger.log(e);
    return { status: "error", message: "An error occurred: " + e.message };
  }
}

/**
 * STEP 2: Called only if the user confirms an overwrite.
 */
function resubmitEvent(formObject, photoBlob) {
  const email = Session.getActiveUser().getEmail();
  const eventId = formObject.eventId;

  try {
    const oldSubmission = findPendingSubmission(email, eventId);
    
    if (oldSubmission) {
      try {
        DriveApp.getFileById(oldSubmission.photoId).setTrashed(true);
      } catch (e) {
        Logger.log("Could not find old photo to delete: " + oldSubmission.photoId);
      }
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Submissions_Pending').deleteRow(oldSubmission.row);
    }

    const file = savePhotoToDrive(photoBlob, eventId, email);
    
    const pendingSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Submissions_Pending');
    pendingSheet.appendRow([
      Utilities.getUuid(), new Date(), email, eventId,
      file.url, file.id, JSON.stringify(formObject.location),
      formObject.theme, formObject.notes
    ]);
    
    return { status: "success", message: "Your previous submission has been replaced." };

  } catch (e) {
    Logger.log(e);
    return { status: "error", message: "An error occurred: " + e.message };
  }
}

// --- 4. ADMIN & NIGHTLY JOB STUBS -----------------------------------------

function getAdminQueue() { /* ... */ }
function approveSubmission(submissionId, themeBonus) { /* ... */ }
function denySubmission(submissionId, reason) { /* ... */ }
function calculateComplexBonuses() { /* ... */ }

