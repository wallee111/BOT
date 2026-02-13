# Authentication Skill

## Overview

Hybrid Firebase Google OAuth supporting both web (Chrome) and mobile (Capacitor/iOS) platforms. The system uses conditional authentication methods to ensure compatibility across all environments.

## Features

- ✅ Web popup authentication via `signInWithPopup()`
- ✅ Mobile redirect authentication via `signInWithRedirect()`
- ✅ Automatic platform detection (Capacitor vs web)
- ✅ Session persistence with localStorage
- ✅ Auth guards on all protected pages
- ✅ Detailed error handling and user feedback
- ✅ Redirect result handling for OAuth callback

## Key Files

- `src/lib/auth.js` — Core authentication module
- `src/lib/firebase.js` — Firebase configuration
- `src/js/signin.js` — Sign-in page controller
- `src/js/account.js` — Account settings with sign out

## How It Works

### 1. Platform Detection

```javascript
const isCapacitor = () => {
    try {
        return window.Capacitor?.isNativePlatform?.() ?? false;
    } catch {
        return false;
    }
};
```

Detects if app is running in Capacitor (mobile) or browser (web).

### 2. Sign In Flow

```javascript
export async function signInWithGoogle() {
    if (isCapacitor()) {
        // Mobile: Use redirect flow
        await signInWithRedirect(auth, provider);
    } else {
        // Web: Use popup flow
        const result = await signInWithPopup(auth, provider);
        currentUser = result.user;
        return result.user;
    }
}
```

### 3. Handle Redirect Result

```javascript
export async function handleSignInRedirect() {
    if (auth.currentUser) {
        currentUser = auth.currentUser;
        authInitialized = true;
        return auth.currentUser;
    }
    const result = await getRedirectResult(auth);
    if (result?.user) {
        currentUser = result.user;
        authInitialized = true;
        return result.user;
    }
    return null;
}
```

Called on signin.html page load to catch OAuth redirects.

### 4. Auth Guards

All protected pages check auth on load:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
    const user = await ensureAuthSession({ requireAuth: true });
    if (!user) {
        window.location.href = 'signin.html';
        return;
    }
    // Page initialization
});
```

## Configuration

### Firebase Console
1. Enable Google sign-in in **Authentication > Sign-in method**
2. Add authorized domains in **Authentication > Settings > Authorized domains**
3. For mobile: Register `https://app.bucketofthoughts.com` as authorized domain

### Capacitor Config (`capacitor.config.json`)

```json
{
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
  }
}
```

## Error Handling

Sign-in errors are caught and displayed with specific messages:

| Error Code | Message |
|-----------|---------|
| `auth/popup-closed-by-user` | "Popup closed before completing sign in. Please try again." |
| `auth/popup-blocked` | "Pop-up blocked. Allow pop-ups for this site and try again." |
| `auth/network-request-failed` | "Network error. Check your connection and try again." |
| `auth/unauthorized-domain` | "This domain isn't authorized for sign-in." |
| `auth/operation-not-allowed` | "Google sign-in isn't enabled for this project." |

## Current Status

- ✅ Web authentication working
- ⏳ iOS authentication pending Firebase configuration
- 🔧 Hybrid auth system implemented and ready

## Next Steps

1. Configure redirect URLs in Firebase Console for iOS
2. Test full auth flow on physical iOS device via Xcode
3. Verify localStorage cache clearing on app reinstall
4. Add support for Android via Capacitor

## Related Skills

- [Mobile (iOS/Android)](./mobile.md)
- [Storage & Sync](./storage.md)
- [Accessibility](./accessibility.md)
