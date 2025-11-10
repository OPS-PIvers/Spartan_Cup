# GEMINI.md

## Project Overview

This project, "The Spartan Cup," is a Google Apps Script web application designed as a student engagement platform. It allows students to check in at school events, submit photos for verification, earn points, and track their progress on a leaderboard. The application is structured as a Single Page App (SPA) and utilizes Google Sheets as a backend for data storage.

**Key Technologies:**

*   **Backend:** Google Apps Script (`Code.js`)
*   **Frontend:** HTML, CSS, JavaScript
*   **Styling:** Tailwind CSS
*   **Data Storage:** Google Sheets
*   **Deployment:** Google Apps Script Web App

**Architecture:**

*   A single `doGet(e)` function in `Code.js` serves as a router, loading different pages into the main `Index.html` template.
*   HTML content for different pages is modularized into separate files (e.g., `Page.profile.html`, `Page.history.html`).
*   Client-side JavaScript (`JavaScript.html`) handles user interactions, page navigation, and communication with the server-side Apps Script functions.
*   Google Sheets is used to manage student profiles, event schedules, submissions, and application configuration.

## Building and Running

This is a Google Apps Script project. It is managed using the command-line tool `clasp`.

**First-Time Setup:**

1.  Open the project in the Google Apps Script editor.
2.  Open the `Code.js` file.
3.  From the "Run" menu, select the `firstTimeSetup` function to initialize the required Google Sheets, Drive folders, and HTML files.

**Deployment:**

1.  **Enable the Apps Script API:** Make sure the Google Apps Script API is enabled in your Google Cloud Platform project.
2.  **Login to clasp:**
    ```bash
    clasp login
    ```
3.  **Push files:**
    ```bash
    clasp push
    ```
4.  **Deploy as a web app:**
    *   In the Apps Script editor, click "Deploy" > "New deployment".
    *   Select "Web app" as the deployment type.
    *   Configure the web app settings (e.g., "Execute as: User deploying", "Who has access: Anyone within your domain").
    *   Copy the web app URL.

## Development Conventions

*   **Server-Side Logic:** All server-side logic is contained in `Code.js`.
*   **Client-Side Logic:** Client-side JavaScript is located in `JavaScript.html`.
*   **Styling:** Styling is done using Tailwind CSS. Custom styles are in `CSS.html`.
*   **HTML Structure:** The main HTML structure is in `Index.html`. Individual pages are in `Page.*.html` files and are included dynamically.
*   **Modals:** Modals are defined in `Modals.html`.
*   **Naming Conventions:**
    *   Server-side functions are camelCase (e.g., `getUserDetails`).
    *   HTML files for pages are prefixed with `Page.` (e.g., `Page.profile.html`).
*   **Data Handling:** Data is passed from the server to the client using template variables in `Index.html` and then accessed via the `APP_DATA` JavaScript object. Dynamic data is fetched using `google.script.run`.
