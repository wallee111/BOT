# 📋 Deployment Checklist - Bucket of Thoughts iOS

## Backend Deployment (Do This First)

### Firebase Backend
- [ ] **Deploy Firestore security rules**
  ```bash
  firebase deploy --only firestore:rules
  ```
  ✅ Rules hardened with input validation

- [ ] **Deploy Firestore indexes**
  ```bash
  firebase deploy --only firestore:indexes
  ```
  ⏰ Takes 5-15 minutes to build

- [ ] **Verify indexes are building**
  https://console.firebase.google.com/project/bucket0f-thoughts/firestore/indexes

- [ ] **Test queries still work**
  ```bash
  npm run dev
  # Test: Create/edit/delete ideas, comments, categories
  ```

---

## iOS Build Preparation

### Capacitor Sync
- [ ] **Build web app**
  ```bash
  npm run build
  ```

- [ ] **Sync to iOS**
  ```bash
  npm run cap:sync
  ```
  ✅ New capacitor.config.json will be applied

- [ ] **Open in Xcode**
  ```bash
  npm run cap:open
  ```

### Xcode Project Configuration
- [ ] Set **Display Name**: "Bucket of Thoughts"
- [ ] Verify **Bundle ID**: com.bot.bucketofthoughts
- [ ] Set **Version**: 1.0.0
- [ ] Set **Build**: 1
- [ ] Configure **Signing & Capabilities**
  - [ ] Select Team (Apple Developer Account)
  - [ ] Enable Automatic Signing
  - [ ] Verify certificate is valid

### App Icon & Assets
- [ ] Create app icon (1024x1024 + all sizes)
  - Use: https://www.appicon.co/
- [ ] Add to Assets.xcassets/AppIcon.appiconset
- [ ] Design launch screen (use #18182d background)
- [ ] Add to LaunchScreen.storyboard

### Info.plist Updates
Add these entries in Xcode → Info.plist:
- [ ] NSUserTrackingUsageDescription
- [ ] URL Schemes: capacitor, com.bot.bucketofthoughts
- [ ] CFBundleURLTypes configured
- [ ] NSAppTransportSecurity exceptions for Firebase

See `IOS_APP_STORE_PREP.md` Phase 1.3 for exact XML.

---

## Device Testing

### Initial Tests
- [ ] Build and run on physical iPhone/iPad
- [ ] Test Google OAuth sign-in (redirect flow)
- [ ] Create/edit/delete ideas
- [ ] Test categories and colors
- [ ] Test thread notes/comments
- [ ] Test canvas view

### Offline Mode Tests
- [ ] Enable Airplane Mode
- [ ] Create ideas offline
- [ ] Edit existing ideas
- [ ] Disable Airplane Mode
- [ ] Verify sync happens automatically
- [ ] Check mutation queue cleared

### Performance Tests
- [ ] App launches in <3 seconds
- [ ] Smooth scrolling in review page
- [ ] Canvas panning is responsive
- [ ] No memory leaks (Instruments)

---

## App Store Connect

### Create App Record
- [ ] Go to https://appstoreconnect.apple.com
- [ ] Create new app
  - Platform: iOS
  - Name: Bucket of Thoughts
  - Bundle ID: com.bot.bucketofthoughts

### Prepare Metadata
- [ ] Write app description (see IOS_APP_STORE_PREP.md)
- [ ] Keywords: ideas,notes,organize,productivity,brainstorm,canvas
- [ ] Screenshots: 3-5 per device size
  - [ ] iPhone 6.7" (1290 x 2796)
  - [ ] iPhone 6.5" (1242 x 2688)
  - [ ] iPhone 5.5" (1242 x 2208)
  - [ ] iPad Pro 12.9" (2048 x 2732)
- [ ] Support URL
- [ ] Privacy Policy URL (required if collecting data)

### Privacy Nutrition Label
- [ ] Email address (sign-in)
- [ ] User content (ideas, notes)
- [ ] User ID (Google OAuth)
- [ ] No tracking ✓
- [ ] No third-party advertising ✓

---

## Archive & Upload

### Create Archive
- [ ] Select "Any iOS Device (arm64)" target
- [ ] Product → Archive in Xcode
- [ ] Wait for archive to complete

### Upload to App Store Connect
- [ ] Click "Distribute App"
- [ ] Select "App Store Connect"
- [ ] Upload
- [ ] Wait for processing (15-60 min)

---

## TestFlight (Recommended)

### Internal Testing
- [ ] Add internal testers
- [ ] Distribute build
- [ ] Get feedback on critical bugs
- [ ] Fix issues if found
- [ ] Upload new build if needed

---

## Submit for Review

### App Review Information
- [ ] Provide demo account
  - Username: (Google account email)
  - Password: (secure password)
- [ ] Age rating: 4+
- [ ] Content rights: Own all content
- [ ] Export compliance: No

### Final Submission
- [ ] Select build from TestFlight
- [ ] Add for Review
- [ ] Submit for Review
- [ ] Wait 24-48 hours for review

---

## Post-Launch

### Week 1
- [ ] Monitor crash reports
- [ ] Respond to user reviews
- [ ] Track sign-up conversion
- [ ] Check Firestore performance

### Month 1
- [ ] Analyze engagement metrics
- [ ] Collect feature requests
- [ ] Plan version 1.1.0
- [ ] Optimize expensive queries

---

## Quick Reference Commands

```bash
# Backend deployment
./deploy-backend.sh

# Or manual:
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes

# iOS build
npm run build
npm run cap:sync
npm run cap:open

# Check health
npx cap doctor
firebase use
```

---

## Files Created by Optimization

- ✅ `firestore.indexes.json` - Composite indexes
- ✅ `deploy-backend.sh` - Deployment script
- ✅ `IOS_APP_STORE_PREP.md` - Complete iOS guide
- ✅ `BACKEND_OPTIMIZATIONS.md` - Optimization summary
- ✅ `DEPLOYMENT_CHECKLIST.md` - This file

---

## Current Status

### ✅ Complete
- Firestore security rules hardened
- Firestore indexes defined
- Capacitor iOS config optimized
- Auth flow verified (iOS-ready)
- Offline architecture verified
- Documentation created

### 🔄 In Progress
- [ ] Deploy backend to Firebase
- [ ] Xcode project setup
- [ ] Device testing
- [ ] App Store Connect setup

### 📋 Next Step
**Deploy backend changes:**
```bash
./deploy-backend.sh
```

Then follow `IOS_APP_STORE_PREP.md` for complete iOS instructions.

---

**Need help?** Refer to `IOS_APP_STORE_PREP.md` troubleshooting section.
