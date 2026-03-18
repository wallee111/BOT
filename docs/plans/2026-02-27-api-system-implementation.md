# API System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Firebase Cloud Functions HTTP API so an external AI app (openclaw) can read and write ideas and categories in Firestore.

**Architecture:** A single Express app exported as a Firebase Cloud Function v2 (`onRequest`). All routes are prefixed `/api/`. An API key stored in Firebase Secret Manager protects every endpoint. The owner's Firebase UID is also stored as a secret so the server always queries only that user's data.

**Tech Stack:** Firebase Functions v2 (Node.js 20), Express.js, firebase-admin SDK, Jest (unit tests), curl (smoke tests)

**Firebase Project ID:** `device-dev-1-c0700`

---

## Pre-requisite: Find Your Firebase UID

Before starting, you need your Firebase UID (the `userId` stored on all your ideas).

**Option 1 — Firebase Console:**
1. Go to [Firebase Console](https://console.firebase.google.com) → project `device-dev-1-c0700`
2. Authentication → Users → copy your UID

**Option 2 — From the app:**
Open the app, open DevTools Console, run:
```javascript
firebase.auth().currentUser.uid
```

Save this UID — you'll need it in Task 9.

---

## Task 1: Create the functions directory structure

**Files to create:**
- `functions/package.json`
- `functions/.gitignore`
- `functions/src/lib/.gitkeep`
- `functions/src/middleware/.gitkeep`
- `functions/src/routes/.gitkeep`

**Step 1: Create directories**

```bash
mkdir -p functions/src/lib functions/src/middleware functions/src/routes
```

**Step 2: Create `functions/package.json`**

```json
{
  "name": "bot-api-functions",
  "description": "Bucket of Thoughts Cloud Functions API",
  "scripts": {
    "serve": "firebase emulators:start --only functions",
    "test": "jest --runInBand",
    "lint": "eslint ."
  },
  "engines": {
    "node": "20"
  },
  "main": "index.js",
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^6.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  },
  "private": true
}
```

**Step 3: Create `functions/.gitignore`**

```
node_modules/
```

**Step 4: Install dependencies**

```bash
cd functions && npm install
```

Expected: `node_modules/` created, no errors.

**Step 5: Commit**

```bash
cd ..
git add functions/
git commit -m "chore: scaffold functions directory with dependencies"
```

---

## Task 2: Create the Firestore lib

**Files:**
- Create: `functions/src/lib/firestore.js`

**Step 1: Write `functions/src/lib/firestore.js`**

```javascript
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();

module.exports = { db };
```

> Note: No credentials needed — Cloud Functions runs inside Firebase and gets Admin access automatically.

**Step 2: Commit**

```bash
git add functions/src/lib/firestore.js
git commit -m "feat: add Firebase Admin SDK init"
```

---

## Task 3: Create the transform utility

Converts raw Firestore document snapshots into plain JSON the API returns.

**Files:**
- Create: `functions/src/lib/transform.js`
- Test: `functions/src/lib/transform.test.js`

**Step 1: Write the failing test — `functions/src/lib/transform.test.js`**

```javascript
const { transformIdea, transformCategory } = require('./transform');
const { Timestamp } = require('firebase-admin/firestore');

describe('transformIdea', () => {
  it('converts a Firestore doc snapshot to a plain idea object', () => {
    const ts = Timestamp.fromDate(new Date('2026-02-27T10:00:00.000Z'));
    const fakeDoc = {
      id: 'idea-abc',
      data: () => ({
        text: 'Build search filter',
        categories: ['Updates'],
        tags: ['ux'],
        priority: 0,
        pinned: false,
        archived: false,
        hidden: false,
        userId: 'user-123',
        createdAt: ts,
      }),
    };

    const result = transformIdea(fakeDoc);

    expect(result).toEqual({
      id: 'idea-abc',
      text: 'Build search filter',
      categories: ['Updates'],
      tags: ['ux'],
      priority: 0,
      pinned: false,
      archived: false,
      createdAt: '2026-02-27T10:00:00.000Z',
    });
    // userId is NOT exposed in the response
    expect(result.userId).toBeUndefined();
  });

  it('handles missing optional fields gracefully', () => {
    const fakeDoc = {
      id: 'idea-xyz',
      data: () => ({
        text: 'Minimal idea',
        userId: 'user-123',
        createdAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')),
      }),
    };

    const result = transformIdea(fakeDoc);

    expect(result.categories).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.pinned).toBe(false);
    expect(result.archived).toBe(false);
    expect(result.priority).toBe(0);
  });
});

describe('transformCategory', () => {
  it('converts a Firestore category doc to a plain object', () => {
    const fakeDoc = {
      id: 'cat-123',
      data: () => ({
        name: 'Updates',
        color: '#ffca28',
        userId: 'user-123',
      }),
    };

    const result = transformCategory(fakeDoc);

    expect(result).toEqual({
      id: 'cat-123',
      name: 'Updates',
      color: '#ffca28',
    });
    expect(result.userId).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd functions && npm test -- --testPathPattern=transform
```

Expected: FAIL — `Cannot find module './transform'`

**Step 3: Write `functions/src/lib/transform.js`**

```javascript
function transformIdea(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    text: data.text,
    categories: data.categories || [],
    tags: data.tags || [],
    priority: data.priority || 0,
    pinned: data.pinned || false,
    archived: data.archived || false,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
  };
}

function transformCategory(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name,
    color: data.color || null,
  };
}

module.exports = { transformIdea, transformCategory };
```

**Step 4: Run test to verify it passes**

```bash
cd functions && npm test -- --testPathPattern=transform
```

Expected: PASS — 4 tests passing

**Step 5: Commit**

```bash
git add functions/src/lib/transform.js functions/src/lib/transform.test.js
git commit -m "feat: add Firestore document transform utilities"
```

---

## Task 4: Create the API key auth middleware

**Files:**
- Create: `functions/src/middleware/auth.js`
- Test: `functions/src/middleware/auth.test.js`

**Step 1: Write the failing test — `functions/src/middleware/auth.test.js`**

```javascript
const { validateApiKey } = require('./auth');

function makeReqRes(headerValue) {
  const req = { headers: { 'x-api-key': headerValue } };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('validateApiKey', () => {
  const REAL_KEY = 'test-secret-key-abc123';

  beforeEach(() => {
    process.env.API_KEY = REAL_KEY;
  });

  afterEach(() => {
    delete process.env.API_KEY;
  });

  it('calls next() when API key matches', () => {
    const { req, res, next } = makeReqRes(REAL_KEY);
    validateApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it('returns 401 when API key is wrong', () => {
    const { req, res, next } = makeReqRes('wrong-key');
    validateApiKey(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when API key is missing', () => {
    const { req, res, next } = makeReqRes(undefined);
    validateApiKey(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd functions && npm test -- --testPathPattern=auth
```

Expected: FAIL — `Cannot find module './auth'`

**Step 3: Write `functions/src/middleware/auth.js`**

```javascript
function validateApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

module.exports = { validateApiKey };
```

**Step 4: Run test to verify it passes**

```bash
cd functions && npm test -- --testPathPattern=auth
```

Expected: PASS — 3 tests passing

**Step 5: Commit**

```bash
git add functions/src/middleware/auth.js functions/src/middleware/auth.test.js
git commit -m "feat: add API key validation middleware"
```

---

## Task 5: Create the ideas routes

**Files:**
- Create: `functions/src/routes/ideas.js`

**Step 1: Write `functions/src/routes/ideas.js`**

```javascript
const { Router } = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('../lib/firestore');
const { transformIdea } = require('../lib/transform');

const router = Router();

// GET /api/ideas
// Query params: category, pinned, archived, tags, search, limit
router.get('/', async (req, res) => {
  try {
    const { category, pinned, archived, tags, search, limit } = req.query;
    const userId = process.env.OWNER_USER_ID;

    const snapshot = await db.collection('ideas').where('userId', '==', userId).get();
    let ideas = snapshot.docs.map(transformIdea);

    if (category) {
      ideas = ideas.filter(i => i.categories.includes(category));
    }
    if (pinned !== undefined) {
      ideas = ideas.filter(i => i.pinned === (pinned === 'true'));
    }
    if (archived !== undefined) {
      ideas = ideas.filter(i => i.archived === (archived === 'true'));
    } else {
      ideas = ideas.filter(i => !i.archived); // default: exclude archived
    }
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim());
      ideas = ideas.filter(i => tagList.some(t => i.tags.includes(t)));
    }
    if (search) {
      const term = search.toLowerCase();
      ideas = ideas.filter(i => i.text.toLowerCase().includes(term));
    }
    if (limit) {
      ideas = ideas.slice(0, parseInt(limit, 10));
    }

    res.json({ success: true, data: ideas });
  } catch (err) {
    console.error('GET /ideas error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/ideas/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('ideas').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Idea not found' });
    }
    res.json({ success: true, data: transformIdea(doc) });
  } catch (err) {
    console.error('GET /ideas/:id error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/ideas
// Body: { text, categories?, tags?, priority?, pinned? }
router.post('/', async (req, res) => {
  try {
    const { text, categories, tags, priority, pinned } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    const userId = process.env.OWNER_USER_ID;
    const { Timestamp } = require('firebase-admin/firestore');

    const newIdea = {
      text: text.trim(),
      categories: categories || [],
      tags: tags || [],
      priority: priority || 0,
      pinned: pinned || false,
      archived: false,
      hidden: false,
      userId,
      createdAt: Timestamp.now(),
    };

    const ref = await db.collection('ideas').add(newIdea);
    const doc = await ref.get();

    res.status(201).json({ success: true, data: transformIdea(doc) });
  } catch (err) {
    console.error('POST /ideas error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PATCH /api/ideas/:id
// Body: any of { text, pinned, archived, priority }
router.patch('/:id', async (req, res) => {
  try {
    const ref = db.collection('ideas').doc(req.params.id);
    const existing = await ref.get();

    if (!existing.exists) {
      return res.status(404).json({ success: false, error: 'Idea not found' });
    }

    const allowed = ['text', 'pinned', 'archived', 'priority'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    await ref.update(updates);
    const updated = await ref.get();
    res.json({ success: true, data: transformIdea(updated) });
  } catch (err) {
    console.error('PATCH /ideas/:id error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/ideas/:id/categories
// Body: { categories: ["Updates", "Design"] }
router.post('/:id/categories', async (req, res) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ success: false, error: 'categories must be a non-empty array' });
    }

    const ref = db.collection('ideas').doc(req.params.id);
    const existing = await ref.get();
    if (!existing.exists) {
      return res.status(404).json({ success: false, error: 'Idea not found' });
    }

    await ref.update({ categories: FieldValue.arrayUnion(...categories) });
    const updated = await ref.get();
    res.json({ success: true, data: transformIdea(updated) });
  } catch (err) {
    console.error('POST /ideas/:id/categories error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/ideas/:id/tags
// Body: { tags: ["ux", "design"] }
router.post('/:id/tags', async (req, res) => {
  try {
    const { tags } = req.body;
    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ success: false, error: 'tags must be a non-empty array' });
    }

    const ref = db.collection('ideas').doc(req.params.id);
    const existing = await ref.get();
    if (!existing.exists) {
      return res.status(404).json({ success: false, error: 'Idea not found' });
    }

    await ref.update({ tags: FieldValue.arrayUnion(...tags) });
    const updated = await ref.get();
    res.json({ success: true, data: transformIdea(updated) });
  } catch (err) {
    console.error('POST /ideas/:id/tags error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
```

**Step 2: Commit**

```bash
git add functions/src/routes/ideas.js
git commit -m "feat: add ideas API routes"
```

---

## Task 6: Create the categories routes

**Files:**
- Create: `functions/src/routes/categories.js`

**Step 1: Write `functions/src/routes/categories.js`**

```javascript
const { Router } = require('express');
const { Timestamp } = require('firebase-admin/firestore');
const { db } = require('../lib/firestore');
const { transformCategory } = require('../lib/transform');

const router = Router();

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const userId = process.env.OWNER_USER_ID;
    const snapshot = await db.collection('categorySettings')
      .where('userId', '==', userId)
      .get();

    const categories = snapshot.docs.map(transformCategory);
    res.json({ success: true, data: categories });
  } catch (err) {
    console.error('GET /categories error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/categories
// Body: { name, color? }
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const userId = process.env.OWNER_USER_ID;
    const newCategory = {
      name: name.trim(),
      userId,
      createdAt: Timestamp.now(),
    };
    if (color) newCategory.color = color;

    const ref = await db.collection('categorySettings').add(newCategory);
    const doc = await ref.get();

    res.status(201).json({ success: true, data: transformCategory(doc) });
  } catch (err) {
    console.error('POST /categories error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
```

**Step 2: Commit**

```bash
git add functions/src/routes/categories.js
git commit -m "feat: add categories API routes"
```

---

## Task 7: Create the main entry point

**Files:**
- Create: `functions/index.js`

**Step 1: Write `functions/index.js`**

```javascript
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const express = require('express');
const cors = require('cors');

const { validateApiKey } = require('./src/middleware/auth');
const ideasRouter = require('./src/routes/ideas');
const categoriesRouter = require('./src/routes/categories');

// Declare secrets so Firebase makes them available as env vars at runtime
const API_KEY = defineSecret('API_KEY');
const OWNER_USER_ID = defineSecret('OWNER_USER_ID');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(validateApiKey);

app.use('/api/ideas', ideasRouter);
app.use('/api/categories', categoriesRouter);

// Health check (no auth needed — useful for testing the function is live)
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

exports.api = onRequest(
  { secrets: [API_KEY, OWNER_USER_ID], region: 'us-central1' },
  app
);
```

> Note: The health check endpoint is BEFORE `validateApiKey` — move it above the middleware line if you want it to be public, or leave it after if you want it key-protected. As written above it IS key-protected (the middleware runs on all routes).

**Step 2: Run all tests**

```bash
cd functions && npm test
```

Expected: All tests pass (transform + auth).

**Step 3: Commit**

```bash
git add functions/index.js
git commit -m "feat: add Cloud Function entry point with Express routing"
```

---

## Task 8: Update firebase.json

**Files:**
- Modify: `firebase.json`

**Step 1: Add the `functions` key to `firebase.json`**

Open `firebase.json` and add this block alongside the existing `"hosting"` and `"firestore"` keys:

```json
"functions": [
  {
    "source": "functions",
    "codebase": "bot-api",
    "ignore": [
      "node_modules",
      ".git",
      "firebase-debug.log",
      "firebase-debug.*.log"
    ]
  }
]
```

The full `firebase.json` `functions` section sits at the top level alongside `hosting` and `firestore`.

**Step 2: Commit**

```bash
git add firebase.json
git commit -m "chore: add functions config to firebase.json"
```

---

## Task 9: Set up Firebase secrets

You need to run these commands once. They store secrets in Firebase Secret Manager — they are never in your code or git.

**Step 1: Generate a strong API key**

Run this in your terminal to generate a random key:

```bash
openssl rand -hex 32
```

Copy the output — this is your `API_KEY`. Save it somewhere safe (e.g., in your password manager). You'll put this same value in openclaw's config.

**Step 2: Store the API key in Firebase Secret Manager**

```bash
firebase functions:secrets:set API_KEY
```

Paste your generated key when prompted.

**Step 3: Store your owner user ID**

```bash
firebase functions:secrets:set OWNER_USER_ID
```

Paste your Firebase UID when prompted (found in Firebase Console → Authentication → Users).

**Step 4: Verify secrets exist**

```bash
firebase functions:secrets:access API_KEY
firebase functions:secrets:access OWNER_USER_ID
```

Both should print the values you set.

---

## Task 10: Deploy

**Step 1: Deploy the function**

```bash
firebase deploy --only functions
```

Expected output includes something like:
```
✔  functions[api(us-central1)]: Successful create operation.
Function URL (api(us-central1)): https://api-XXXXXXXX-us-central1.a.run.app
```

Copy the Function URL — this is your API base URL.

**Step 2: Smoke test — health check**

```bash
curl https://api-XXXXXXXX-us-central1.a.run.app/api/health \
  -H "X-API-Key: <your-api-key>"
```

Expected:
```json
{ "success": true, "status": "ok" }
```

**Step 3: Smoke test — list ideas**

```bash
curl "https://api-XXXXXXXX-us-central1.a.run.app/api/ideas?limit=5" \
  -H "X-API-Key: <your-api-key>"
```

Expected:
```json
{ "success": true, "data": [ ...your ideas ] }
```

**Step 4: Smoke test — create an idea**

```bash
curl -X POST https://api-XXXXXXXX-us-central1.a.run.app/api/ideas \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{ "text": "Test idea from API", "categories": ["Updates"] }'
```

Expected:
```json
{ "success": true, "data": { "id": "...", "text": "Test idea from API", ... } }
```

**Step 5: Smoke test — search + assign category**

```bash
# Search for the idea
curl "https://api-XXXXXXXX-us-central1.a.run.app/api/ideas?search=test+idea" \
  -H "X-API-Key: <your-api-key>"

# Assign a category (use the id from search result)
curl -X POST https://api-XXXXXXXX-us-central1.a.run.app/api/ideas/<id>/categories \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{ "categories": ["Updates"] }'
```

**Step 6: Smoke test — list categories**

```bash
curl https://api-XXXXXXXX-us-central1.a.run.app/api/categories \
  -H "X-API-Key: <your-api-key>"
```

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: final deploy smoke tests complete"
```

---

## Task 11: Configure openclaw

In your openclaw app on the second machine, set:

```
API_BASE_URL = https://api-XXXXXXXX-us-central1.a.run.app
API_KEY = <the key you generated>
```

All requests from openclaw should include the header:
```
X-API-Key: <your-api-key>
```

---

## Quick Reference — All Endpoints

```
GET    /api/ideas                      List ideas (params: category, pinned, archived, tags, search, limit)
GET    /api/ideas/:id                  Get single idea
POST   /api/ideas                      Create idea  { text, categories?, tags?, priority?, pinned? }
PATCH  /api/ideas/:id                  Update idea  { text?, pinned?, archived?, priority? }
POST   /api/ideas/:id/categories       Assign categories  { categories: ["Name"] }
POST   /api/ideas/:id/tags             Add tags  { tags: ["tag1"] }
GET    /api/categories                 List categories
POST   /api/categories                 Create category  { name, color? }
GET    /api/health                     Health check
```
