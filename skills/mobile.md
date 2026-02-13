# Mobile (iOS/Android) Skill

## Overview

Native mobile app support via Capacitor 8.0.2, enabling deployment to iOS and Android app stores with hybrid authentication and offline-first capabilities.

## Features

- ✅ **Native Wrapper**: Capacitor 8.0.2 bridge
- ✅ **iOS Support**: App runs on iPhone/iPad via Xcode
- ✅ **Android Ready**: Infrastructure for Android deployment
- ✅ **Hybrid Auth**: Platform-specific OAuth flows
- ✅ **Offline First**: Works without internet
- ✅ **Touch Optimized**: Swipe gestures, tap targets
- ✅ **Status Bar**: Native status bar integration
- ✅ **Deep Links**: Navigate via URLs
- ✅ **Splash Screen**: Branded app launch screen

## Setup

### 1. Capacitor Installation

```bash
npm install @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android

# Initialize Capacitor
npx cap init
```

### 2. Build Web Assets

```bash
npm run build
```

### 3. Add Platforms

```bash
npx cap add ios
npx cap add android
```

## Configuration (capacitor.config.json)

```json
{
  "appId": "com.bot.bucketofthoughts",
  "appName": "Bucket of Thoughts",
  "webDir": "dist",

  "ios": {
    "contentInset": "always",
    "backgroundColor": "#18182d",
    "scheme": "capacitor",
    "limitsNavigationsToAppBoundDomains": true
  },

  "server": {
    "iosScheme": "capacitor",
    "hostname": "app.bucketofthoughts.com",
    "allowNavigation": [
      "accounts.google.com",
      "*.firebaseapp.com",
      "*.firebaseio.com",
      "firestore.googleapis.com",
      "www.googleapis.com",
      "securetoken.googleapis.com",
      "identitytoolkit.googleapis.com",
      "firebaseinstallations.googleapis.com"
    ]
  },

  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2000,
      "backgroundColor": "#18182d",
      "showSpinner": false,
      "androidSpinnerStyle": "small",
      "iosSpinnerStyle": "small"
    }
  }
}
```

### Key Settings

- **webDir**: Points to built app (`dist`)
- **contentInset**: Respects safe area on notched phones
- **limitsNavigationsToAppBoundDomains**: Security - only allow domains in allowNavigation
- **iosScheme**: Custom URL scheme for OAuth redirects
- **allowNavigation**: Firebase domains for auth and Firestore

## iOS Development

### Open Xcode

```bash
npx cap open ios
```

### Build & Run

1. Select simulator or device
2. Click Play button in Xcode
3. App launches on device/simulator

### Debugging

**JavaScript Console:**
- Open Safari
- Develop menu → Select device → Select app
- Inspect JavaScript console

**Native Logs:**
- Xcode Console (bottom panel)
- Shows native iOS logs

### Common iOS Issues

| Issue | Solution |
|-------|----------|
| App crashes on launch | Check Xcode console for errors |
| Auth doesn't work | Check Firebase config + allowNavigation |
| Blank white screen | Clear DerivedData: Xcode → Preferences → Locations |
| Old version running | Clean build: Cmd+Shift+K, rebuild |

## Android Development

### Open Android Studio

```bash
npx cap open android
```

### Build & Run

1. Select emulator or device
2. Click Run button in Android Studio
3. App builds and launches

### Debugging

```bash
adb logcat | grep "chromium"
```

View JavaScript console logs.

## Hybrid Authentication

Platform detection:

```javascript
const isCapacitor = () => {
    try {
        return window.Capacitor?.isNativePlatform?.() ?? false
    } catch {
        return false
    }
}
```

Different auth flows:

```javascript
if (isCapacitor()) {
    // Mobile: Use redirect flow
    await signInWithRedirect(auth, provider)
} else {
    // Web: Use popup flow
    const result = await signInWithPopup(auth, provider)
}
```

## Sync Web and Native

After code changes:

```bash
npm run build          # Build web assets
npx cap sync ios      # Sync to iOS
npx cap sync android  # Sync to Android
npx cap open ios      # Open Xcode
```

Or in one command:

```bash
npm run cap:sync      # Alias in package.json
npm run cap:run       # Build + sync + open Xcode
```

## Capacitor Plugins

Plugins available for additional features:

```bash
# Camera
npm install @capacitor/camera

# Geolocation
npm install @capacitor/geolocation

# Push notifications
npm install @capacitor/push-notifications

# File system
npm install @capacitor/filesystem
```

Usage example:

```javascript
import { Camera, CameraResultType } from '@capacitor/camera'

async function takePhoto() {
    const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri
    })
    console.log('Photo:', photo.webPath)
}
```

## Touch Optimization

### 1. Tap Targets

Minimum 44x44px for touch targets:

```css
button {
    min-width: 44px;
    min-height: 44px;
    padding: 8px;
}
```

### 2. Viewport

```html
<meta name="viewport"
      content="width=device-width,
               initial-scale=1.0,
               viewport-fit=cover">
```

### 3. No 300ms Tap Delay

Capacitor handles this automatically. Touch events fire immediately.

### 4. Prevent Zoom on Input

```html
<input type="text"
       style="font-size: 16px;">
```

Font size < 16px triggers zoom on iOS input focus.

## Splash Screen

Customize app launch screen:

```json
{
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2000,
      "backgroundColor": "#18182d",
      "showSpinner": false
    }
  }
}
```

Hide splash in code:

```javascript
import { SplashScreen } from '@capacitor/splash-screen'

// After app initialization
await SplashScreen.hide()
```

## Deep Links

Register URL scheme:

```javascript
// capacitor://app/note/123 → open note detail

import { App } from '@capacitor/app'

App.addListener('appUrlOpen', ({ url }) => {
    const slug = url.split('.app').pop()
    // Navigate based on URL
    router.navigate(slug)
})
```

## App Metadata

Edit `ios/App/App.xcodeproj`:

1. Select project in Xcode
2. General tab
3. Update Bundle ID, version, build number
4. Update app icon and launch screen

## Publishing

### iOS App Store

1. Create Apple Developer account
2. Generate signing certificates in Xcode
3. Create app in App Store Connect
4. Archive app in Xcode
5. Submit via Transporter

### Android Play Store

1. Generate signed APK/AAB
2. Create Google Play Developer account
3. Create app in Play Console
4. Upload signed APK/AAB
5. Submit for review

## Troubleshooting

### App Not Prompting Login

**Symptom**: Fresh install doesn't ask for sign-in

**Fix**:
1. Clear localStorage: `localStorage.clear()`
2. Clear Capacitor storage: `npx cap sync ios`
3. Rebuild: `npx cap build ios`

### Can't See JavaScript Logs

**Use Safari Web Inspector:**
1. Safari → Develop → [Device] → [App]
2. Console tab shows JavaScript logs

### Auth Returning Null

**Check**:
1. Firebase config is correct
2. Google auth enabled in Firebase Console
3. Authorized domains include your app's domain
4. allowNavigation includes Google domains

### Blank White Screen

**Try**:
1. Check Xcode console for errors
2. Hard refresh: Cmd+Option+R
3. Clean build folder: Cmd+Shift+K
4. Rebuild

## Current Status

- ✅ iOS app builds and runs
- ⏳ iOS authentication pending Firebase config
- ⏳ Android build ready, not tested
- 🔧 Capacitor 8.0.2 integrated

## Next Steps

1. Configure Firebase OAuth redirect URLs for iOS
2. Test full login flow on physical iOS device
3. Publish to TestFlight for beta testing
4. Build and test Android version
5. Submit to App Store / Play Store

## Related Skills

- [Authentication](./authentication.md)
- [Storage & Sync](./storage.md)
- [Canvas System](./canvas.md)
