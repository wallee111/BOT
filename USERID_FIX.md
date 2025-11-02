# Google Sign-In Migration & Legacy User ID Mapping

The app now relies on Firebase Google authentication instead of anonymous IDs stored in Local Storage. This resolves the Safe Browsing warning and ensures every user session is tied to a verified Google account.

## What Changed

- **Anonymous Auth disabled** – every session must be a Google sign-in.
- **Firestore rules tightened** – reads/writes require `userId === request.auth.uid`.
- **Frontend updated** – the sign-in page prompts for Google auth, and all data queries use the authenticated UID.
- **Local userId cache removed** – the `app_persistent_userId` key is no longer used.

## Migrating Legacy Data

Existing notes that were written with the legacy “copy this User ID” flow still use the old identifier in the `userId` field. You need to copy those documents to the new Google UID before the stricter Firestore rules will allow access.

### 1. Gather the IDs

1. Ask the user to sign in with Google (new flow) and capture the UID from `/account.html`.
2. Locate their legacy userId (from support logs or the old account page).

### 2. Run the Admin Script

Use the Firebase Admin SDK once to migrate each user. Create `scripts/migrateLegacyUser.js` (or run the snippet below in a Node REPL with your service account credentials):

```js
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
});

const db = admin.firestore();

async function migrateLegacyUser(legacyId, newUid) {
  const ideasSnap = await db.collection('ideas').where('userId', '==', legacyId).get();
  const settingsSnap = await db.collection('categorySettings').where('userId', '==', legacyId).get();

  if (ideasSnap.empty && settingsSnap.empty) {
    console.log(`No documents found for legacy ID ${legacyId}`);
    return;
  }

  const batch = db.batch();

  ideasSnap.forEach(doc => {
    batch.update(doc.ref, { userId: newUid });
  });

  settingsSnap.forEach(doc => {
    batch.update(doc.ref, { userId: newUid });
  });

  await batch.commit();
  console.log(`Migrated ${ideasSnap.size} ideas and ${settingsSnap.size} settings from ${legacyId} → ${newUid}`);
}

// Example usage
migrateLegacyUser('LEGACY_ID_HERE', 'GOOGLE_UID_HERE')
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
```

### 3. Clear Caches

After migration, the user should:

1. Sign out (from `/account.html`).
2. Sign back in with Google.
3. The service worker will fetch fresh data, and the notes will appear under the new account.

## Re-Requesting Safe Browsing Review

Once all legacy users are migrated:

1. Deploy the updated build (`firebase deploy`).
2. In Firebase console → Hosting → “Abuse protection”, request a Safe Browsing review.
3. Document the changes in your release notes so reviewers see the new Google-auth-only flow.

## Troubleshooting

- Run the migration script with `--dry-run` logic first if you want to log matches without writing (copy the query and console.log the IDs).
- If a user never signs in with Google, their legacy data will remain inaccessible. Encourage them to migrate promptly.

This workflow keeps all existing notes, enforces stronger security guarantees, and satisfies Google Safe Browsing requirements.
