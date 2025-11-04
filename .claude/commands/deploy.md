---
allowed-tools: Bash(clasp push --force), Bash(clasp deploy*), Bash(firebase deploy*)
description: Deploy Google Apps Script project using clasp push and deploy (project)
---

Deploy the Spartan Cup application by:
1. Running `clasp push` to upload local changes to Google Apps Script
2. Running `clasp deploy --deploymentId AKfycbzox9ZqfP5FWJrJUpBnpUdBT8PPnDl-NroRfCUbjpPnTpllVpZS__y3pKNV13j4CX_j --description "Production deployment"` to redeploy the web app (@79)
3. Running `firebase deploy --only hosting` to update the Firebase geolocation wrapper

**Alternative: Deploy to @6 (previous production):**
`clasp deploy --deploymentId AKfycbwpwlNmxO25IeWbtR7TkJOs48Uh189iQ1BjGWw9K1--4PVwq0z7Px9X1MOm6OvWbWkg --description "Legacy production deployment"`

Show the output of all commands and confirm successful deployment.