# Demo Mode — Design Spec

**Date**: 2026-04-02
**Status**: Approved
**Scope**: Portfolio-ready demo mode for Bucket of Thoughts

## Goal

Add a demo mode that lets visitors explore the app without signing in. Pre-filled with realistic content, fully interactive, and ephemeral — nothing persists after the tab closes. Intended for sharing via portfolio, resume, or LinkedIn.

## Pages Included

- Capture (`index.html`)
- Review (`review.html`)
- Canvas (`canvas.html`)
- Notes (`notes.html`)

Pages NOT included: Account, Categories, Sign-in (Account and Categories redirect to Capture if accessed in demo mode).

---

## 1. Demo Entry Points

### `demo.html` — Dedicated Landing Page

A lightweight page at `/demo.html` on the Firebase-hosted app. Contains:

- App name/logo
- Brief tagline: "Capture and organize your thoughts"
- "Start Demo" button

On click:
1. Sets `sessionStorage.setItem('bot_demo_mode', 'true')`
2. Redirects to `index.html`

### Sign-in Page — "Try Demo" Button

Add a "Try Demo" link/button below the existing Google sign-in button on `signin.html`. Same behavior: sets the session flag and redirects to `index.html`.

---

## 2. Session Lifecycle

- **Flag**: `sessionStorage.bot_demo_mode === 'true'`
- **Helper**: `isDemo()` function in `src/lib/demo/demo-storage.js`
- **Lifetime**: `sessionStorage` — dies when the tab/window closes (truly ephemeral)
- **Refresh**: Flag survives page refresh within the same tab. Seed data resets to defaults on refresh (intentional — fresh start).
- **Exit**: Clicking "Sign up" in the demo banner navigates to `signin.html`. Signing in clears the demo flag and starts the real app.

---

## 3. Mock Storage Layer

### File: `src/lib/demo/demo-storage.js`

A mock storage module that mirrors the real `storage` API shape but keeps everything in memory. No Firestore, no localStorage, no mutation queue.

### API Surface (matches real storage)

```javascript
export function getDemoStorage() {
  return {
    ideas,       // in-memory store
    categories,  // in-memory store
    canvas,      // in-memory store
    pageNotes,   // in-memory store
    mutations: {
      getPendingCount() { return 0; },
      flush() { /* no-op */ }
    }
  };
}
```

### Per-Domain Mock Behavior

Each domain store implements the same interface as the real domain stores:

| Method | Behavior |
|--------|----------|
| `subscribe(callback)` | Fires callback immediately with seed data, re-fires on any mutation |
| `getCached()` | Returns current in-memory array |
| `save(item)` | Adds/updates item in memory, notifies subscribers |
| `update(id, fields)` | Partial update in memory, notifies subscribers |
| `deleteItem(id)` | Removes from memory, notifies subscribers |

**Ideas**: Full CRUD — add, edit, archive, pin, change categories, delete. Domain-specific methods (`setIdeaArchived`, `setIdeaPinned`, etc.) all work in-memory.

**Categories**: `getPalette()` returns seed palette. `setPaletteForCategory()` updates in-memory.

**Canvas**: `load()` returns seed layout. `save(layout)` updates in-memory.

**Page Notes**: Full CRUD in-memory with folder support.

---

## 4. Seed Data

### File: `src/lib/demo/seed-data.js`

Exports pre-built demo content with realistic timestamps spread over the past few weeks. All items use `userId: 'demo-user'`.

### Ideas (~12-15 items)

| Category | Examples |
|----------|----------|
| **Projects** | "Build a personal portfolio website", "Create a habit tracking app", "Design a reading list dashboard" |
| **Creative** | "Write a short story about time travel", "Learn watercolor painting basics", "Start a photo-a-day challenge" |
| **Learning** | "Deep dive into WebSocket protocols", "Read 'Designing Data-Intensive Applications'", "Take an online course on system design" |
| **Life** | "Plan a weekend hiking trip", "Try a new recipe every week", "Organize the garage" |

State variety: a couple pinned, one or two archived, varying priorities (1-5), some with multiple categories, some with tags.

### Category Palette (5-6 categories)

Projects, Creative, Learning, Life, Random — each with a distinct MD3 palette color.

### Canvas Layout

Pre-arranged layout with ~8 of the seed ideas positioned on the canvas, demonstrating spatial organization.

### Page Notes (2-3 notes)

Sample notes in a "Demo" folder. Example: "Ideas for the weekend" with a few lines of content.

---

## 5. Page Integration

### Boot Sequence Change (4 pages)

Each included page (index.js, review.js, canvas.js, notes.js) gets a small change at the top of its boot sequence:

```javascript
import { isDemo, getDemoStorage } from '../lib/demo/demo-storage.js';

// Before auth guard:
if (!isDemo()) {
  const user = await ensureAuthSession({ requireAuth: true });
  if (!user) { window.location.href = '/signin.html'; return; }
}
const store = isDemo() ? getDemoStorage() : storage;
```

All `storage.ideas.subscribe(...)` calls become `store.ideas.subscribe(...)`, etc.

### Demo Banner

A shared function `injectDemoBanner()` in `demo-storage.js`:
- Appends a fixed-position pill/banner at the top of the page
- Text: "Demo Mode" with a "Sign up for full experience" link to `signin.html`
- Styled to match the dark theme (`#18182d` base, `#ffca28` accent)
- Self-contained HTML/styles (no external CSS dependency)
- Called at the top of each page's init if `isDemo()` is true

### Navigation Guard

- Nav links to Account and Categories: if `isDemo()`, redirect to `index.html`
- Alternatively, hide these nav items entirely in demo mode

---

## 6. Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Page refresh** | Demo flag survives (sessionStorage). Seed data resets to defaults. |
| **Direct URL without flag** | Normal auth guard kicks in, redirects to sign-in. No leakage. |
| **Sign-in from demo** | Banner links to `signin.html`. Successful sign-in clears demo flag, starts real app. |
| **Browser back button** | Works naturally — real page navigation. |
| **Sync indicator** | `getPendingCount()` returns 0. No "pending changes" UI. |

### Not Mocked (works as-is)

- **Service worker** — left as-is, won't interfere
- **Theme switching** — reads from localStorage directly, works in demo
- **Toast notifications** — still fire normally for user actions

---

## 7. File Inventory

| File | Type | Description |
|------|------|-------------|
| `demo.html` | New | Demo landing page |
| `src/lib/demo/demo-storage.js` | New | Mock storage + `isDemo()` + `injectDemoBanner()` |
| `src/lib/demo/seed-data.js` | New | Filler content for all domains |
| `src/js/index.js` | Modified | Demo-aware boot sequence |
| `src/js/review.js` | Modified | Demo-aware boot sequence |
| `src/js/canvas.js` | Modified | Demo-aware boot sequence |
| `src/js/notes.js` | Modified | Demo-aware boot sequence |
| `src/js/signin.js` | Modified | "Try Demo" button |
| `signin.html` | Modified | "Try Demo" button markup |
