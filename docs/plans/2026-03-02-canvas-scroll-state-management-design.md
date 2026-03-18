# Canvas Scroll Reset & State Management Design

**Date:** 2026-03-02
**Status:** Approved — ready for implementation

## Problem

Canvas card scroll position resets to the top whenever Firestore pushes a new snapshot, on initial subscription fire, and on any card re-render. Separately, two storage bugs cause silent data loss: resized card body heights are never persisted, and the in-memory ideas cache stores raw Firestore Timestamp objects instead of normalized numbers.

---

## Fix 1 — Save/restore `scrollTop` in `populateCardIdeas` (`canvas-cards.js`)

Before `container.innerHTML = ''` clears the ideas list, capture `bodyEl.scrollTop`. After all ideas and the Add Idea button are appended, restore it. This makes scroll position survive any re-render triggered by `subscribeToIdeas` or `subscribeToCategorySettings`.

```javascript
const bodyEl = cardEl.querySelector('.canvas-card__body');
const savedScroll = bodyEl ? bodyEl.scrollTop : 0;

// ... clear and re-render ...

if (bodyEl && savedScroll > 0) bodyEl.scrollTop = savedScroll;
```

---

## Fix 2 — Pre-seed `prevCardIdeas` inside `populateCardIdeas` (`canvas-cards.js`)

`prevCardIdeas` is only written in `updateAllCards`, so cards added via `addCard` have no fingerprint entry. The first `subscribeToIdeas` fire sees a mismatch on every card and re-renders all of them, losing any scroll accumulated before the subscription fires.

At the end of `populateCardIdeas`, compute the same fingerprint that `updateAllCards` uses and store it. The first subscription fire will then see a match and skip the re-render.

```javascript
// At end of populateCardIdeas, after all content is appended:
const fingerprint = filtered.map(i => `${i.id}|${i.text}|${i.priority}|${i.pinned}`).join('\n');
prevCardIdeas.set(categoryName, fingerprint);
```

---

## Fix 3 — Guard `subscribeToCanvasLayout` initial fire (`canvas.js`)

Firestore's `onSnapshot` always fires once immediately on setup. In `canvas.js`, this happens right after step 7 already fetched and rendered the same layout. The first fire triggers a complete teardown and rebuild of all cards with no diffing.

In the `subscribeToCanvasLayout` callback, serialize the incoming layout and compare it to the current `layout` state. Skip the rebuild if identical. Remote device changes will always differ and still trigger correctly.

```javascript
const unsubLayout = subscribeToCanvasLayout((remoteLayout) => {
    if (isSavingLocally) return;
    if (JSON.stringify(remoteLayout) === JSON.stringify(layout)) return; // ← guard
    // ... full rebuild ...
});
```

---

## Fix 4 — `normalizeCanvasLayout` drops `bodyHeight` (`storage.js`)

`normalizeCanvasLayout` is used both for reading incoming data and as the save path inside `saveCanvasLayout`. It maps cards without `bodyHeight`, stripping user-resized card heights on every save. Heights reset on every page reload.

Add `bodyHeight` to the card mapping:

```javascript
.map(c => ({
    categoryName: (c.categoryName || '').trim(),
    x: Number(c.x) || 0,
    y: Number(c.y) || 0,
    width: Number(c.width) || 0,
    bodyHeight: Number(c.bodyHeight) || 0,   // ← add this
}))
```

---

## Fix 5 — `subscribeToIdeas` stores un-normalized data in `ideasCache` (`storage.js`)

The snapshot callback stores raw Firestore documents in the module-level `ideasCache`. Raw docs have `createdAt` as a Firestore `Timestamp` object. Any code reading the in-memory cache (e.g. `getIdeas()` cache hit, `cleanupUnusedCategories()`) gets un-normalized data. Sort comparisons and `formatTime()` silently misbehave.

Normalize each document in the snapshot callback, matching `fetchIdeasFromFirestore`:

```javascript
onSnapshot(q, (snapshot) => {
    const ideas = snapshot.docs
        .map(doc => normalizeIdeaObject(doc.data() || {}, doc.id))  // ← normalize
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    ideasCache = ideas;
    writeIdeasToLocal(ideas);
    callback(ideas);
});
```

---

## Files Changed

| File | Fixes |
|------|-------|
| `src/js/canvas-cards.js` | Fix 1 (scrollTop save/restore), Fix 2 (prevCardIdeas pre-seed) |
| `src/js/canvas.js` | Fix 3 (subscribeToCanvasLayout guard) |
| `src/lib/storage.js` | Fix 4 (bodyHeight in normalizeCanvasLayout), Fix 5 (normalize ideasCache) |
