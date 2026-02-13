# Account Page Cleanup - Backend Tasks

## Overview
The account page has been simplified to show only:
- User's email address
- Sign out button

All other features have been removed from the frontend.

## Features Removed from Frontend

### 1. User ID Display & Copy Button
- **Removed UI**: User ID display field, "Copy User ID" button
- **Frontend changes**: Removed from `account.html` and `account.js`
- **Status**: ✅ Complete

### 2. Display Name
- **Removed UI**: Display name field showing Firebase `displayName`
- **Frontend changes**: Removed from `account.html` and `account.js`
- **Status**: ✅ Complete

### 3. Keyboard Shortcuts Customization
- **Removed UI**: Entire keyboard shortcuts section with interactive shortcut recording
- **Frontend changes**:
  - Removed shortcut list rendering
  - Removed recording functionality
  - Removed shortcut editing UI
- **Backend impact**: `getUserSettings()` and `updateUserSettings()` are no longer called from account page
- **Status**: ✅ Complete (frontend only)

### 4. Account Switching
- **Removed UI**: "Switch Google Account" button that redirected to signin.html
- **Frontend changes**: Removed from `account.html`
- **Status**: ✅ Complete

### 5. Legacy User ID Migration Section
- **Removed UI**: Entire legacy migration help section with instructions
- **Frontend changes**: Removed from `account.html`
- **Status**: ✅ Complete

## Backend Functions That May Need Review

### getUserSettings() & updateUserSettings()
**Location**: `src/lib/storage.js` (lines 1309-1354)

**Current usage analysis needed**:
- These functions are still used elsewhere in the app (e.g., keyboard shortcuts may be used on other pages)
- The account page NO LONGER calls these functions
- **Recommendation**: Keep these functions if keyboard shortcuts are used on other pages (e.g., capture page, review page)
- **Action needed**: Backend engineer should verify if these are still needed for other features

### userSettings Firestore Collection
**Collection**: `userSettings/{userId}`

**Fields that were managed from account page**:
- `shortcuts` object (keyboard shortcut mappings)

**Current status**:
- Collection still exists
- Account page no longer reads or writes to it
- **Recommendation**: Keep if shortcuts are used elsewhere in the app
- **Action needed**: Verify if this collection is accessed by other pages

### Mutation Queue
**Mutation type**: `updateUserSettings`

**Location**: `src/lib/storage.js` line 154, 1350

**Current status**:
- Mutation handler still exists in storage.js
- No longer triggered from account page
- **Recommendation**: Keep if shortcuts functionality is used elsewhere
- **Action needed**: Confirm whether this mutation type is still needed

## Code That Can Be Safely Removed

### None at this time
All backend code related to user settings should be **kept** because:
1. Keyboard shortcuts may still be used on other pages (needs verification)
2. The storage.js functions are generic and may support future features
3. No database security rules or schemas need to change

## Verification Checklist for Backend Engineer

- [ ] Verify if keyboard shortcuts are used on pages other than account page
- [ ] Search codebase for `getUserSettings()` and `updateUserSettings()` calls
- [ ] Confirm whether `userSettings` Firestore collection is accessed elsewhere
- [ ] If shortcuts are NOT used anywhere else:
  - [ ] Remove `getUserSettings()` function
  - [ ] Remove `updateUserSettings()` function
  - [ ] Remove `updateUserSettings` mutation handler
  - [ ] Remove `userSettings` collection from Firestore (or archive existing data)
  - [ ] Update Firestore security rules if needed
- [ ] If shortcuts ARE used elsewhere:
  - [ ] Keep all existing backend code
  - [ ] No further action needed

## Frontend Files Modified

### ✅ Completed Changes
1. **account.html** - Simplified to show only email and sign out button
2. **src/js/account.js** - Removed all logic except email display and sign out
3. **src/styles/account.css** - Simplified styles for minimal design

## Next Steps

1. **Backend Engineer**: Review this document and complete verification checklist
2. **Backend Engineer**: If shortcuts are unused elsewhere, remove backend components
3. **Backend Engineer**: Report back on findings and any cleanup actions taken
4. **Both teams**: Update project documentation to reflect changes

## Questions?

Contact the frontend team if clarification is needed on any removed features or their previous functionality.
