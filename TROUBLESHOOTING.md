# Troubleshooting: Data Not Showing After Migration

## What I Just Fixed

I found and fixed the issue where data wasn't showing after migration:

### **The Root Cause:**
The `auth.js` file was still checking localStorage for an override userId, but after migration, this was causing a mismatch. The migration updated documents to use the NEW Firebase Auth UID, but the app was querying with the OLD userId from localStorage.

### **Changes Made:**
1. ✅ Removed localStorage override from `getCurrentUserId()` 
2. ✅ Added extensive logging to track what's happening
3. ✅ The app now always uses the real Firebase Auth UID

## Steps to Fix Your Current Session

Since you already migrated your data, you need to clear your browser state:

### **Quick Fix (Do this now):**

1. **Open your browser console** (Press F12 or Cmd+Option+I)

2. **Clear localStorage** - Paste this in the console:
   ```javascript
   localStorage.clear();
   location.reload();
   ```

3. **Refresh the page** - Your data should now appear!

### **Alternative: Manual Clear**

1. Open Developer Tools (F12)
2. Go to **Application** tab
3. Click **Local Storage** → Your site URL
4. Right-click → **Clear**
5. Refresh the page

## Verify Migration Worked

### **Check Browser Console:**
After clearing localStorage and refreshing, open the console and look for these logs:

```
[fetchIdeasFromFirestore] Fetching with userId: abc123...
[fetchIdeasFromFirestore] Found X documents
[subscribeToIdeas] Subscribing with userId: abc123...
[subscribeToIdeas] Received snapshot with X documents
```

### **Check Firebase Console:**
1. Go to: https://console.firebase.google.com/project/device-dev-1-c0700/firestore
2. Click on the `ideas` collection
3. Open any document
4. Check the `userId` field
5. **Verify it matches your current Firebase Auth UID** (visible in Account tab)

## Debug Page

Visit: **https://device-dev-1-c0700.web.app/debug.html**

This will show you:
- ✅ Your current Firebase Auth UID
- ✅ Any stored userId in localStorage (should be empty now)
- ✅ What getCurrentUserId() returns
- ✅ Whether the query succeeds
- ✅ How many documents were found

## Still Not Working?

If you still don't see data after clearing localStorage:

### **Option 1: Check Firebase Console**
1. Go to Firestore console
2. Find one of your idea documents
3. Note the `userId` value
4. Go to the Account tab in your app
5. Copy your User ID
6. **Do they match?** If not, the migration didn't complete properly

### **Option 2: Re-migrate**
If the userIds don't match:

1. Note your current Firebase Auth UID from Account page
2. Go to Firebase Console → Firestore
3. Manually update a test document's userId to your current auth UID
4. Refresh your app - if that document appears, you need to re-run migration

### **Option 3: Check Browser Console for Errors**
Look for these error messages:
- `permission-denied` → Firestore rules issue (shouldn't happen with new rules)
- `No user ID available` → Auth not initialized properly
- `Error in snapshot listener` → Query failed

## What You Should See Now

After clearing localStorage:

1. **Console logs:**
   ```
   [fetchIdeasFromFirestore] Fetching with userId: <your-new-uid>
   [fetchIdeasFromFirestore] Found 10 documents
   [subscribeToIdeas] Subscribing with userId: <your-new-uid>
   [subscribeToIdeas] Received snapshot with 10 documents
   ```

2. **Your ideas appear on the page!** 🎉

3. **Account page shows your NEW User ID** (different from your old one)

## Firebase Console Quick Checks

### Check if Migration Actually Happened:

1. **Go to Firebase Console:**
   https://console.firebase.google.com/project/device-dev-1-c0700/firestore

2. **Click on `ideas` collection**

3. **Open any document**

4. **Check the `userId` field:**
   - If it still has your OLD userId → Migration failed
   - If it has a NEW userId → Migration succeeded, just clear localStorage

### If Migration Failed:

The batch update might have hit a permission issue. Try this:

1. Note your OLD userId (the one you entered in signin)
2. Note your NEW Firebase Auth UID (from Account page after signing in)
3. Use the recover.html page but modify it to update userId from OLD to NEW

## Prevention for Future

Going forward:
- ✅ Always save your User ID from the Account page (not localStorage)
- ✅ Don't sign in with an old userId again after migration
- ✅ Use the NEW userId for future device sign-ins

## Need More Help?

Share these with me:
1. Screenshot of the browser console after refreshing
2. Screenshot of one document from Firebase Firestore console
3. Your User ID from the Account page
4. Output from /debug.html page
