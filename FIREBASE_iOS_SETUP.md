# Firebase iOS Authentication Setup

This guide explains how to properly configure Firebase for iOS OAuth redirects in Capacitor.

## Problem
When running the app on iOS via Xcode, users are not prompted to log in because Firebase OAuth redirect URIs are not configured for the native app.

## Solution

### Step 1: Add iOS App to Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project `bucket0f-thoughts`
3. Go to **Project Settings** (⚙️ gear icon, top-left)
4. Click the **Apps** tab
5. Click **Add app** → **iOS**

### Step 2: Register iOS App

- **iOS bundle ID**: `com.bot.bucketofthoughts`
- **App nickname**: `Bucket of Thoughts iOS` (or any name)
- Click **Register app**

### Step 3: Download GoogleService-Info.plist

1. Firebase will show a **GoogleService-Info.plist** file
2. Click **Download GoogleService-Info.plist**
3. In Xcode:
   - Right-click on `App` folder in Project Navigator
   - **Add Files to "App"...**
   - Select the downloaded `GoogleService-Info.plist`
   - ✅ Check **Copy items if needed**
   - ✅ Check **Add to targets: App**
   - Click **Add**

### Step 4: Configure OAuth Consent (if not already done)

1. In Firebase Console, go to **Authentication** → **Settings** → **Authorized domains**
2. Add these domains (they may already be listed):
   - `bucket0f-thoughts.firebaseapp.com` ✅
   - `localhost` (for web dev)
   - Any custom domains

### Step 5: Set Up OAuth Redirect URIs

1. In Firebase Console, go to **Authentication** → **Settings** → **Authorized domains**
2. Scroll to **Additional settings** section
3. Under **Authorized redirect URIs**, add:
   - `capacitor://localhost/signin.html` (OAuth redirect for Capacitor)
   - `capacitor://localhost/index.html` (Fallback redirect)

**Note**: Firebase may not have a specific UI for Capacitor redirect URIs yet. If the above doesn't work:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select project `bucket0f-thoughts`
3. Go to **APIs & Services** → **Credentials**
4. Find OAuth 2.0 Client ID for iOS (auto-created by Firebase)
5. Click to edit and add to **Authorized redirect URIs**:
   ```
   capacitor://localhost/signin.html
   ```

### Step 6: Enable Google Sign-In in Firebase

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Click **Google**
3. Toggle **Enable** ✅
4. Select a **Project support email** (required)
5. Click **Save**

## Testing

### Web (localhost:5173)
- Should work with popup OAuth (tested ✅)

### iOS Simulator/Device
1. Build and run via Xcode
2. App should now:
   - ✅ Prompt for login on fresh install
   - ✅ Handle OAuth redirect from Google
   - ✅ Store session in localStorage
   - ✅ Auto-login on subsequent launches

## Verification Checklist

- [ ] iOS app registered in Firebase Console
- [ ] GoogleService-Info.plist added to Xcode project
- [ ] Google Sign-In enabled in Firebase Authentication
- [ ] Capacitor redirect URIs added to OAuth client
- [ ] `capacitor.config.json` has `bucket0f-thoughts.firebaseapp.com` in allowNavigation
- [ ] Run `npm run cap:sync` after any config changes
- [ ] Run `npm run cap:open` and rebuild in Xcode

## Debugging

### Check logs in Xcode Console:
```
[auth] Capacitor detected - checking for redirect result on startup
[auth] User authenticated via redirect: user@example.com
```

### If redirect fails:
1. Clear app cache: Xcode → Product → Clean Build Folder
2. Delete derived data: `~/Library/Developer/Xcode/DerivedData/App*`
3. Reinstall on simulator/device
4. Try again

### Common errors:

**"Unauthorized redirect_uri"**
- Check Google Cloud Console OAuth URIs are correct
- Wait ~5 minutes for changes to propagate

**"User already signed in"**
- This is normal if user is in localStorage
- Clear app data to test fresh login

## Architecture

```
App Launch
  ↓
auth.js initializes (module load)
  ↓
initializeAuthOnStartup() runs
  ↓
[iOS only] getRedirectResult() checks for OAuth callback
  ↓
If OAuth result found → set currentUser
Else → waitForAuthState() checks localStorage
  ↓
ensureAuthSession() waits for startup promise
  ↓
Auth guard redirects if needed
```

## References

- [Firebase iOS Setup Guide](https://firebase.google.com/docs/auth/web)
- [Google OAuth for iOS](https://developers.google.com/identity/sign-in/ios)
- [Capacitor Deep Links](https://capacitorjs.com/docs/guides/deep-links)
