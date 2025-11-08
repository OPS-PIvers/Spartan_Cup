---
allowed-tools: Bash(clasp push --force), Bash(clasp deploy*), Bash(firebase deploy --only storage,hosting)
description: Deploy Google Apps Script project using clasp push and deploy (project)
---

Deploy the Google Apps Script project and Firebase resources by:
1. Running `clasp push --force` to upload local changes
2. Running `clasp deploy --deploymentId AKfycbzox9ZqfP5FWJrJUpBnpUdBT8PPnDl-NroRfCUbjpPnTpllVpZS__y3pKNV13j4CX_j` to redeploy the web app
3. Running `firebase deploy --only storage,hosting` to deploy Firebase Storage rules and static assets (geolocation wrapper) to Firebase

Show the output of all commands and confirm successful deployment.