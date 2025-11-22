# iOS Configuration Instructions

To successfully build the iOS app and enable Google Sign-In, you must perform the following configuration steps in your XCode project or `Info.plist`.

## 1. Configure URL Types for Google Sign-In

1. Open your project in Xcode.
2. Select the app target in the left navigator.
3. Click on the **Info** tab.
4. Scroll down to **URL Types**.
5. Click the **+** button.
6. In the **URL Schemes** field, paste your **iOS URL scheme**.
   - You can find this in the Google Cloud Console or Firebase Console.
   - It looks like a reversed client ID, e.g., `com.googleusercontent.apps.1234567890-abcdefg`.

Alternatively, manually edit `mobile/ios/SpartanCup/Info.plist` and replace `YOUR_IOS_REVERSED_CLIENT_ID` with your actual reversed client ID:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>com.googleusercontent.apps.YOUR-CLIENT-ID-HERE</string>
        </array>
    </dict>
</array>
```

## 2. Configure `GoogleService-Info.plist`

1. Download the `GoogleService-Info.plist` file from your Firebase/Google Cloud project settings.
2. Drag and drop this file into the root of your Xcode project (inside the `SpartanCup` folder).
3. Ensure "Copy items if needed" is checked and the target is selected.

## 3. Install Pods

Navigate to the `ios` directory and install the necessary CocoaPods:

```bash
cd mobile/ios
pod install
```

## 4. Run the App

```bash
cd mobile
npm run ios
```
