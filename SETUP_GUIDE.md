# Multi-User Setup Guide

This guide will help you set up the app so each user has their own private data storage.

## Option 1: Anonymous Authentication (Recommended - Easiest)

### Step 1: Enable Anonymous Authentication in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **device-dev-1-c0700**
3. Click **Authentication** in left sidebar
4. Click **Get Started** (if first time)
5. Click **Sign-in method** tab
6. Click **Anonymous**
7. Toggle **Enable** and click **Save**

### Step 2: Set Up Firestore Security Rules

1. In Firebase Console, click **Firestore Database** in left sidebar
2. Click **Rules** tab
3. Replace the existing rules with this content:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check if user is authenticated
    function isSignedIn() {
      return request.auth != null;
    }
    
    // Helper function to check if user owns the document
    function isOwner(userId) {
      return request.auth.uid == userId;
    }
    
    // Ideas collection - each user can only access their own ideas
    match /ideas/{ideaId} {
      allow read: if isSignedIn() && isOwner(resource.data.userId);
      allow create: if isSignedIn() && isOwner(request.resource.data.userId);
      allow update, delete: if isSignedIn() && isOwner(resource.data.userId);
    }
    
    // Category settings - each user can only access their own settings
    match /categorySettings/{settingId} {
      allow read: if isSignedIn() && isOwner(resource.data.userId);
      allow create: if isSignedIn() && isOwner(request.resource.data.userId);
      allow update, delete: if isSignedIn() && isOwner(resource.data.userId);
    }
  }
}
```

4. Click **Publish**

### Step 3: Update Your Code

The code has been updated in `storage.js` and `auth.js` to:
- Automatically sign in users anonymously on first visit
- Add `userId` to all documents
- Filter queries to only show user's own data

### Step 4: Deploy

Run:
```bash
firebase deploy
```

### Step 5: Migrate Existing Data (Your Personal Data)

Since your existing data doesn't have a `userId`, you need to either:

**Option A: Delete old data** (if you don't mind losing it)
1. Go to Firestore Database in Firebase Console
2. Delete all documents in `ideas` and `categorySettings` collections

**Option B: Add your userId to existing data**
1. Sign in to the app once (it will create your user)
2. Copy your userId from browser console (it will be logged)
3. In Firestore Console, manually add `userId: "your-user-id"` field to all your existing documents

---

## Option 2: Email/Password Authentication (More Features)

If you want users to have accounts they can access from multiple devices:

### Step 1: Enable Email/Password Authentication

1. Go to Firebase Console → Authentication → Sign-in method
2. Click **Email/Password**
3. Toggle **Enable** and click **Save**

### Step 2: Add Login UI

You'll need to create login/signup forms in your HTML files.

### Step 3: Use the same Firestore Security Rules as above

---

## Testing Multi-User Setup

1. Open your app in a normal browser window
2. Open your app in an incognito/private window
3. Add ideas in both windows
4. Verify that ideas in one window don't appear in the other

---

## Important Notes

- **Anonymous auth**: Users get a permanent ID stored in browser. If they clear browser data, they lose access.
- **Email auth**: Users can sign in from any device with their email/password.
- **Data privacy**: With security rules, users cannot see each other's data.
- **Your existing data**: Needs userId added or will be inaccessible after security rules are applied.

---

## Troubleshooting

### "Permission denied" errors after setup
- Make sure anonymous auth is enabled
- Make sure security rules are published
- Check browser console for auth status
- Try clearing browser cache and reloading

### Users can still see each other's data
- Verify security rules are published
- Make sure `userId` field is being added to all documents
- Check that queries include `where('userId', '==', userId)` filter

---

## Need Help?

Check the Firebase documentation:
- [Anonymous Authentication](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
