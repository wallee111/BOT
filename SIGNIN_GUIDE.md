# Sign-In Guide

## Overview
Your app now supports signing in with a User ID, which allows you to access your data from any device or browser.

## How to Access Your Data

### Option 1: Sign In with Your User ID (Recommended)

1. **Visit the sign-in page**: https://device-dev-1-c0700.web.app/signin.html

2. **Enter your User ID**: Paste your User ID into the form

3. **Click "Sign In"**: You'll be redirected to the main app with your data loaded

### Option 2: Find Your User ID from Account Settings

If you're already signed in:

1. Click the **Account** tab in the bottom navigation
2. Your User ID will be displayed at the top
3. Click **Copy User ID** to copy it to your clipboard
4. Save this ID somewhere safe (password manager, notes app, etc.)

## Real-Time Updates

The app now uses **real-time listeners** for ideas:
- ✅ New ideas appear instantly on all pages
- ✅ No need to refresh the page manually
- ✅ Works on both the Capture page and Review page

## Account Management

Visit `/account.html` to:
- **View your User ID**: See and copy your unique identifier
- **Sign Out**: Clear your session (make sure to save your User ID first!)
- **Switch Accounts**: Sign in with a different User ID

## Important Notes

⚠️ **Save Your User ID**: This is the ONLY way to access your data from other devices. If you lose it, you won't be able to recover your data.

✅ **Privacy**: Each User ID has its own isolated data storage. No one else can see your ideas.

✅ **No Password Required**: The app uses Firebase Anonymous Authentication with User IDs as the identifier.

## Recovering Old Data

If your old data disappeared after the multi-user update, use the recovery tool:

1. Visit `/recover.html`
2. Enter your User ID
3. Click "Recover My Data"

This will add your User ID to all your old ideas so they become visible again.

## Technical Details

- **Authentication**: Firebase Anonymous Authentication
- **Data Storage**: Firestore with user-based security rules
- **Real-Time Updates**: Firestore onSnapshot listeners
- **User ID Storage**: Stored in localStorage as `firebase_auth_userId`
