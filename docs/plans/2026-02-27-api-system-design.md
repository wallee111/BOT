# API System Design — Bucket of Thoughts

**Date**: 2026-02-27
**Status**: Approved
**Scope**: Firebase Cloud Functions HTTP API for external AI access (personal use)

---

## Overview

Add a Firebase Cloud Functions API layer so an external AI app (running on a second local machine via openclaw) can read and write ideas and categories in Firestore.

The app is already hosted on Firebase. The API slots into the existing Firebase project — no new infrastructure needed.

---

## Architecture

```
[openclaw — 2nd machine]
       |
       | HTTPS + X-API-Key header
       |
[Firebase Cloud Functions]
  ├── validateApiKey middleware
  ├── GET    /api/ideas                → list ideas
  ├── GET    /api/ideas/:id            → get single idea
  ├── POST   /api/ideas                → create idea
  ├── PATCH  /api/ideas/:id            → update idea
  ├── GET    /api/categories           → list categories
  ├── POST   /api/categories           → create category
  ├── POST   /api/ideas/:id/categories → assign categories to idea
  ├── POST   /api/ideas/:id/tags       → add tags to idea
  └── GET    /api/ideas?search=...     → search ideas by text
       |
       | Firebase Admin SDK
       |
[Firestore]
  ├── ideas          (filtered to owner userId)
  └── categorySettings
```

**Key decisions:**
- Single Cloud Function handles all routes (one function = simpler, cheaper than one per endpoint)
- `userId` is hardcoded server-side — API only ever touches owner's data
- No per-request user auth needed beyond the API key
- Timestamps converted to ISO strings in all responses

---

## Endpoints

### Ideas

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/ideas` | List ideas. Query params: `category`, `pinned`, `archived`, `tags`, `search`, `limit` |
| `GET` | `/api/ideas/:id` | Get a single idea by ID |
| `POST` | `/api/ideas` | Create a new idea |
| `PATCH` | `/api/ideas/:id` | Update idea fields (text, pinned, archived, priority) |

### Categories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/categories` | List all categories |
| `POST` | `/api/categories` | Create a new category |

### Relationships

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ideas/:id/categories` | Assign one or more categories to an idea |
| `POST` | `/api/ideas/:id/tags` | Add tags to an idea |

### Intentionally excluded

- `DELETE /api/ideas/:id` — too destructive for AI use; use `PATCH` to archive instead
- Canvas layouts — UI state, not meaningful to external AI

---

## Auth & Security

- **Mechanism**: Static API key in `X-API-Key` request header
- **Storage**: Firebase Secret Manager — never in code or committed `.env` files
- **Generation**: 32-byte random hex string, generated once
- **Validation**: Middleware runs before every route handler; returns `401` on mismatch

```
Request → validateApiKey middleware → route handler
                    ↓ fail
               401 { success: false, error: "Unauthorized" }
```

---

## Response Format

All endpoints return a consistent JSON envelope.

**Success — list:**
```json
{ "success": true, "data": [ ...items ] }
```

**Success — single:**
```json
{ "success": true, "data": { ...item } }
```

**Error:**
```json
{ "success": false, "error": "Idea not found" }
```

**Idea shape:**
```json
{
  "id": "abc123",
  "text": "Build search filter",
  "categories": ["Updates"],
  "tags": ["ux"],
  "priority": 0,
  "pinned": false,
  "archived": false,
  "createdAt": "2026-02-27T10:30:00.000Z"
}
```

**Category shape:**
```json
{
  "id": "xyz789",
  "name": "Updates",
  "color": "#ffca28"
}
```

---

## Example AI Workflow

Assigning an idea to a category by name ("add 'build search filter' to Updates"):

```
1. GET /api/ideas?search=build search filter  →  find idea, get its ID
2. GET /api/categories                         →  find "Updates", confirm it exists
3. POST /api/ideas/{id}/categories             →  assign category
   Body: { "categories": ["Updates"] }
```

---

## File Structure

```
functions/
  index.js          ← Cloud Function entry point, route registration
  src/
    middleware/
      auth.js       ← API key validation middleware
    routes/
      ideas.js      ← All /api/ideas routes
      categories.js ← All /api/categories routes
    lib/
      firestore.js  ← Admin SDK init, shared db reference
      transform.js  ← Firestore doc → plain JSON (timestamp conversion etc.)
  package.json
```

---

## Deployment

- Uses Firebase Functions v2 (2nd gen) with Node.js 20
- Deployed via `firebase deploy --only functions`
- API key stored via `firebase functions:secrets:set API_KEY`
- CORS configured to allow requests from any origin (personal tool, no browser restriction needed)
- Region: `us-central1` (default, matches existing Firebase project)
