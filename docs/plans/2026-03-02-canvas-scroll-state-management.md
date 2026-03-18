# Canvas Scroll Reset & State Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix canvas card scroll position resetting on every Firestore update, and resolve two silent data bugs (bodyHeight not persisted, ideasCache storing raw Timestamps).

**Architecture:** Five targeted edits across three files. Fixes are independent and can be verified individually. No new abstractions, no new files. The scroll fix (Tasks 1–2) is self-contained in `canvas-cards.js`; the subscription guard (Task 3) is one line in `canvas.js`; the storage fixes (Tasks 4–5) are in `storage.js`. Each task commits independently.

**Tech Stack:** Vanilla JS (ES Modules), Firebase Firestore `onSnapshot`, Vite dev server (`npm run dev` on port 5173)

---

## Task 1: Save and restore `scrollTop` in `populateCardIdeas`

**Files:**
- Modify: `src/js/canvas-cards.js` — `populateCardIdeas` function (starts line ~176)

**Context:**
`populateCardIdeas` calls `container.innerHTML = ''` to clear `.canvas-card__ideas`. This collapses the element to 0 height, which causes the parent `.canvas-card__body` (the `overflow-y: auto` scroll container) to clamp `scrollTop` to 0 immediately. Content is then re-added but scroll is already gone.

**Step 1: Locate the function**

Open `src/js/canvas-cards.js`. Find `function populateCardIdeas(cardEl, categoryName, ideas, palette)` (around line 176). The function body starts with finding `container` and ends with the `appendAddIdeaButton` call.

**Step 2: Add scrollTop save at the top of the function**

After the `if (!container) return;` guard and the `cleanupCardSwipe(cardEl)` call, add:

```javascript
const bodyEl = cardEl.querySelector('.canvas-card__body');
const savedScroll = bodyEl ? bodyEl.scrollTop : 0;
```

The full block should look like:

```javascript
function populateCardIdeas(cardEl, categoryName, ideas, palette) {
    const container = cardEl.querySelector('.canvas-card__ideas');
    if (!container) return;

    // Save scroll position before clearing content
    const bodyEl = cardEl.querySelector('.canvas-card__body');
    const savedScroll = bodyEl ? bodyEl.scrollTop : 0;

    // Cleanup previous swipe gestures
    cleanupCardSwipe(cardEl);
    // ... rest unchanged
```

**Step 3: Restore scrollTop at the very end of the function**

Find the last line of `populateCardIdeas` — the `appendAddIdeaButton(container, categoryName)` call. After it, add the restore:

```javascript
    // Restore scroll position after re-render
    if (bodyEl && savedScroll > 0) {
        bodyEl.scrollTop = savedScroll;
    }
}
```

**Step 4: Verify the build starts without errors**

```bash
npm run dev
```
Expected: Vite starts on port 5173, no console errors.

**Step 5: Manual browser test**

1. Open `localhost:5173/canvas.html`
2. Add enough ideas to a category card so the list is scrollable
3. Scroll the card body partway down
4. In a second browser tab, change a completely different idea's priority (to force a Firestore snapshot)
5. Return to the canvas tab — scroll position should be preserved

**Step 6: Commit**

```bash
git add src/js/canvas-cards.js
git commit -m "fix: preserve canvas card scroll position across idea re-renders"
```

---

## Task 2: Pre-seed `prevCardIdeas` fingerprint inside `populateCardIdeas`

**Files:**
- Modify: `src/js/canvas-cards.js` — end of `populateCardIdeas`, after the scrollTop restore added in Task 1

**Context:**
`prevCardIdeas` is a `Map<categoryName, fingerprint>` used by `updateAllCards` to skip re-renders when ideas haven't changed. It is only written in `updateAllCards`. When `addCard` first calls `populateCardIdeas`, there is no entry. The very first `subscribeToIdeas` callback fires immediately after the subscription is set up and calls `updateAllCards` — which sees `undefined` for every card's fingerprint, re-renders all of them, and loses any scroll position the user built up between page load and the subscription firing (auth + Firestore round-trip = several seconds).

**Step 1: Locate `prevCardIdeas`**

Search for `const prevCardIdeas = new Map()` in `canvas-cards.js` — it is declared just above `updateAllCards`, inside the `createCardManager` closure. Both `populateCardIdeas` and `updateAllCards` are in the same closure, so `populateCardIdeas` can access it directly.

**Step 2: Add fingerprint seeding at the end of `populateCardIdeas`**

After the scrollTop restore (from Task 1), add:

```javascript
    // Pre-seed fingerprint so the first updateAllCards call skips this card
    const fingerprint = filtered.map(i => `${i.id}|${i.text}|${i.priority}|${i.pinned}`).join('\n');
    prevCardIdeas.set(categoryName, fingerprint);
}
```

This exactly matches the fingerprint formula used in `updateAllCards` (check: `relevant.map(i => \`${i.id}|${i.text}|${i.priority}|${i.pinned}\`).join('\n')`).

**Step 3: Verify the build starts without errors**

```bash
npm run dev
```
Expected: Vite starts on port 5173, no console errors.

**Step 4: Manual browser test**

1. Open `localhost:5173/canvas.html`
2. Scroll a card body partway down immediately after page load (before Firestore data arrives — happens within first 2–5 seconds)
3. Wait ~5 seconds for the initial `subscribeToIdeas` callback to fire
4. Scroll position should be preserved (previously it would reset here)

**Step 5: Commit**

```bash
git add src/js/canvas-cards.js
git commit -m "fix: pre-seed prevCardIdeas fingerprint to prevent re-render on first subscription fire"
```

---

## Task 3: Guard `subscribeToCanvasLayout` against its initial unconditional fire

**Files:**
- Modify: `src/js/canvas.js` — the `subscribeToCanvasLayout` callback (around line 215)

**Context:**
Firestore's `onSnapshot` always fires once immediately when a subscription is set up. In `canvas.js`, `subscribeToCanvasLayout` is set up at step 9 — right after step 7 already fetched and rendered the exact same layout from Firestore. The callback has no diffing: it always does a complete teardown (`querySelectorAll('.canvas-card').forEach(el => el.remove())`) and rebuild of all cards, losing all scroll positions. The `isSavingLocally` guard only blocks echoes of own writes, not this initial fire.

**Step 1: Locate the callback**

Open `src/js/canvas.js`. Find `const unsubLayout = subscribeToCanvasLayout((remoteLayout) => {` (around line 215). The callback currently starts with:

```javascript
const unsubLayout = subscribeToCanvasLayout((remoteLayout) => {
    if (isSavingLocally) return;

    layout = remoteLayout;
    engine.setState(layout.viewport);
    // ... full card teardown and rebuild
});
```

**Step 2: Add the structural equality guard**

After `if (isSavingLocally) return;`, add:

```javascript
    // Skip rebuild if layout is structurally identical (covers initial subscription fire)
    if (JSON.stringify(remoteLayout) === JSON.stringify(layout)) return;
```

The full block should read:

```javascript
const unsubLayout = subscribeToCanvasLayout((remoteLayout) => {
    if (isSavingLocally) return;
    if (JSON.stringify(remoteLayout) === JSON.stringify(layout)) return;

    layout = remoteLayout;
    engine.setState(layout.viewport);
    // ... rest unchanged
```

**Why `JSON.stringify` is appropriate here:** The layout object is a plain serializable data structure (`cards`, `headers`, `viewport` with numbers/strings). Firestore-sourced layouts go through `normalizeCanvasLayout` before arriving here, so field order and types are stable. This is not comparing live DOM state — it is comparing two plain JS objects where stringify is a reliable equality check.

**Step 3: Verify build**

```bash
npm run dev
```
Expected: Vite starts on port 5173, no console errors.

**Step 4: Manual browser test**

1. Open `localhost:5173/canvas.html` with multiple cards
2. Scroll multiple cards to different positions
3. Wait 5–10 seconds for all subscriptions to fire
4. All scroll positions should remain intact after page settles
5. On a second device/tab, move a card to a new position — the first tab should update (rebuild fires for real change)

**Step 5: Commit**

```bash
git add src/js/canvas.js
git commit -m "fix: skip subscribeToCanvasLayout rebuild when layout is structurally unchanged"
```

---

## Task 4: Add `bodyHeight` to `normalizeCanvasLayout`

**Files:**
- Modify: `src/lib/storage.js` — `normalizeCanvasLayout` function (around line 1428)

**Context:**
`normalizeCanvasLayout` is used both when reading layout data from Firestore/localStorage AND as the normalization step inside `saveCanvasLayout`. Because `bodyHeight` is missing from the mapping, every call to `saveCanvasLayout` strips the field. The runtime `layout.cards` array has `bodyHeight` (it is written by `updateLayoutCardSize`), but it is silently dropped before writing to localStorage and Firestore. Users who resize a card body find their custom height gone on the next page load.

**Step 1: Locate the mapping**

Find `normalizeCanvasLayout` in `storage.js` (around line 1428). The cards array mapping currently reads:

```javascript
.map(c => ({
    categoryName: (c.categoryName || '').trim(),
    x: Number(c.x) || 0,
    y: Number(c.y) || 0,
    width: Number(c.width) || 0,
}))
```

**Step 2: Add `bodyHeight`**

```javascript
.map(c => ({
    categoryName: (c.categoryName || '').trim(),
    x: Number(c.x) || 0,
    y: Number(c.y) || 0,
    width: Number(c.width) || 0,
    bodyHeight: Number(c.bodyHeight) || 0,
}))
```

`Number(c.bodyHeight) || 0` correctly handles `undefined`, `null`, and `NaN` — all become `0`, which `addCard` already treats as "no saved height" (the `if (bodyEl && savedBodyHeight)` check in `canvas-cards.js:addCard`).

**Step 3: Verify build**

```bash
npm run dev
```
Expected: Vite starts on port 5173, no console errors.

**Step 4: Manual browser test**

1. Open `localhost:5173/canvas.html`
2. Resize a card body by dragging the SE corner handle — make it notably taller or shorter
3. Reload the page
4. The card body height should be restored to the resized height (previously it always reset to the CSS default of 400px)

**Step 5: Commit**

```bash
git add src/lib/storage.js
git commit -m "fix: persist canvas card bodyHeight through normalizeCanvasLayout"
```

---

## Task 5: Normalize ideas in `subscribeToIdeas` snapshot callback

**Files:**
- Modify: `src/lib/storage.js` — `subscribeToIdeas` function, inside the `onSnapshot` callback (around line 904)

**Context:**
The snapshot callback currently builds ideas as `{ id: doc.id, ...doc.data() }`. Raw Firestore documents have `createdAt` as a `Firestore.Timestamp` object, not a number. The module-level `ideasCache` is then set to these un-normalized objects. Any code that hits the in-memory cache (e.g. `getIdeas()` returning a cache hit, `cleanupUnusedCategories()`) receives Timestamp objects instead of numbers. `formatTime(idea.createdAt)` does `Number(idea.createdAt)` — which gives `NaN` for a Timestamp. Sort comparisons also break silently. `fetchIdeasFromFirestore` already uses `normalizeIdeaObject` — `subscribeToIdeas` should too.

**Step 1: Locate the snapshot callback**

Find `unsubscribe = onSnapshot(q, (snapshot) => {` inside `subscribeToIdeas` (around line 904). The current block:

```javascript
unsubscribe = onSnapshot(q, (snapshot) => {
    const ideas = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        ideas.push({
            id: doc.id,
            ...data
        });
    });

    // Sort in memory by createdAt ascending (matches getIdeas())
    ideas.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    // Update cache and localStorage
    ideasCache = ideas;
    writeIdeasToLocal(ideas);

    // Notify subscriber
    callback(ideas);
}, (error) => {
```

**Step 2: Replace with normalized version**

```javascript
unsubscribe = onSnapshot(q, (snapshot) => {
    const ideas = snapshot.docs
        .map(doc => normalizeIdeaObject(doc.data() || {}, doc.id))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    // Update cache and localStorage
    ideasCache = ideas;
    writeIdeasToLocal(ideas);

    // Notify subscriber
    callback(ideas);
}, (error) => {
```

`normalizeIdeaObject` is already defined earlier in the same file (around line 353). It handles Timestamp-to-millis conversion, normalizes `categories`, coerces booleans, and returns a clean plain object.

**Step 3: Verify build**

```bash
npm run dev
```
Expected: Vite starts on port 5173, no console errors.

**Step 4: Manual browser test**

1. Open `localhost:5173/canvas.html`
2. Open browser DevTools console
3. After ideas load, run: `JSON.stringify(window.__ideas?.slice(0,2))` — if you expose `allIdeas`, check that `createdAt` is a number not an object. Otherwise, check the "Ideas" timestamp display on cards matches the expected format and doesn't show "Invalid Date" or NaN.
4. Add an idea from the capture page in another tab — the canvas should update with correct timestamps displayed

**Step 5: Final verification — run dev build once more and check console**

```bash
npm run dev
```

Open `localhost:5173/canvas.html`. Let the page settle (5–10 seconds). Check browser console — should be zero errors or warnings related to Timestamp, NaN, or re-renders.

**Step 6: Commit**

```bash
git add src/lib/storage.js
git commit -m "fix: normalize Firestore Timestamps in subscribeToIdeas snapshot callback"
```

---

## Summary

| Task | File | Change | Commit message |
|------|------|--------|----------------|
| 1 | `canvas-cards.js` | Save/restore `scrollTop` around innerHTML reset | `fix: preserve canvas card scroll position across idea re-renders` |
| 2 | `canvas-cards.js` | Pre-seed `prevCardIdeas` in `populateCardIdeas` | `fix: pre-seed prevCardIdeas fingerprint to prevent re-render on first subscription fire` |
| 3 | `canvas.js` | Equality guard in `subscribeToCanvasLayout` callback | `fix: skip subscribeToCanvasLayout rebuild when layout is structurally unchanged` |
| 4 | `storage.js` | Add `bodyHeight` to `normalizeCanvasLayout` | `fix: persist canvas card bodyHeight through normalizeCanvasLayout` |
| 5 | `storage.js` | Normalize snapshot docs in `subscribeToIdeas` | `fix: normalize Firestore Timestamps in subscribeToIdeas snapshot callback` |
