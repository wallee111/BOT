# Canvas Card Focus State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a focus gate to canvas cards so users must tap a card to focus it before its interactive elements respond, preventing accidental interactions during pan/zoom.

**Architecture:** A centralized focus manager inside `canvas-cards.js` tracks the single focused card. All card interactions (drag, swipe, buttons, resize) check focus state before activating. The canvas engine and selection manager notify the focus system when gestures start so it can auto-unfocus.

**Tech Stack:** Vanilla JS (ES Modules), CSS custom properties, pointer events API

---

## Task 1: Add `.is-focused` CSS styles

**Files:**
- Modify: `src/styles/canvas.css` (after line 398, the `.canvas-card.is-dragging` block)

**Step 1: Add the focused card styles**

Add these rules after the `.canvas-card.is-resizing` block (line 408):

```css
/* Focused state — card is interactive, shows primary border */
.canvas-card.is-focused {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
    border-radius: 12px;
    z-index: 10;
}

/* Unfocused cards on canvas suppress pointer events on interactive children */
.canvas-card:not(.is-focused) .canvas-card__body {
    pointer-events: none;
}

.canvas-card:not(.is-focused) .canvas-card__resize-handle {
    pointer-events: none;
}

/* Unfocused card header: pointer cursor instead of grab (indicates "tap to focus") */
.canvas-card:not(.is-focused) .canvas-card__header {
    cursor: pointer;
}

/* Keep remove button always accessible even when unfocused */
.canvas-card:not(.is-focused) .canvas-card__remove {
    pointer-events: auto;
}
```

**Step 2: Verify styles don't break existing `.is-selected` outline**

The existing `.canvas-card.is-selected` rule (line 366) also uses `outline`. When a card is both focused and selected, focused style should win since it has a higher z-index context. No conflict since selection is desktop-only marquee and focus is a separate concern.

**Step 3: Commit**

```bash
git add src/styles/canvas.css
git commit -m "style: add .is-focused CSS for canvas card focus state"
```

---

## Task 2: Add focus state management to `canvas-cards.js`

**Files:**
- Modify: `src/js/canvas-cards.js`

**Step 1: Add focus state tracking**

At the top of `createCardManager` (after line 38, `let selectionManager = null;`), add:

```javascript
let focusedCard = null;

function focusCard(cardEl) {
    if (focusedCard === cardEl) return;
    unfocusCard();
    focusedCard = cardEl;
    cardEl.classList.add('is-focused');
}

function unfocusCard() {
    if (!focusedCard) return;
    focusedCard.classList.remove('is-focused');
    focusedCard = null;
}

function isFocused(cardEl) {
    return focusedCard === cardEl;
}
```

**Step 2: Gate card drag behind focus state**

In `initCardDrag` (line 535), modify the `pointerdown` handler on the header. Replace the existing handler body with focus-aware logic:

```javascript
headerEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.canvas-card__remove')) return;
    if (!e.isPrimary) return;

    e.stopPropagation(); // prevent canvas pan/marquee

    // If card is not focused, focus it but don't start drag
    if (!isFocused(cardEl)) {
        focusCard(cardEl);
        return;
    }

    // Card is focused — proceed with drag as normal
    // If part of a multi-selection, delegate to group drag
    if (selectionManager && selectionManager.startGroupDrag(e, cardEl)) {
        ds.isDragging = false;
        return;
    }

    ds.isDragging = true;
    ds.pointerId = e.pointerId;
    ds.startX = e.clientX;
    ds.startY = e.clientY;

    const pos = parseTranslate(cardEl);
    ds.cardStartX = pos.x;
    ds.cardStartY = pos.y;

    headerEl.setPointerCapture(e.pointerId);
    cardEl.classList.add('is-dragging');
});
```

**Step 3: Add a tap-to-focus listener on the card body**

In `addCard` (after `initCardResize(el);` at line 86), add a click listener that focuses the card when tapping the body area:

```javascript
// Tap anywhere on card to focus it
el.addEventListener('click', (e) => {
    // Don't re-focus if already focused (let the click reach child elements)
    if (isFocused(el)) return;
    // Don't focus from remove button
    if (e.target.closest('.canvas-card__remove')) return;
    focusCard(el);
});
```

**Step 4: Export focus API from the returned object**

Add to the return object (line 703):

```javascript
return {
    addCard,
    removeCard,
    updateAllCards,
    setSelectionManager: (sm) => { selectionManager = sm; },
    focusCard,
    unfocusCard,
    isFocused,
    getFocusedCard: () => focusedCard,
    destroy,
};
```

**Step 5: Clean up focus when a focused card is removed**

In `removeCard` (line 92), add unfocus before removal:

```javascript
function removeCard(categoryName) {
    const el = surfaceEl.querySelector(`.canvas-card[data-category="${CSS.escape(categoryName)}"]`);
    if (el) {
        if (focusedCard === el) unfocusCard();
        cleanupCardSwipe(el);
        el.remove();
    }
}
```

**Step 6: Commit**

```bash
git add src/js/canvas-cards.js
git commit -m "feat: add focus state management to canvas card manager"
```

---

## Task 3: Add `onGestureStart` callback to `canvas-engine.js`

**Files:**
- Modify: `src/js/canvas-engine.js`

**Step 1: Fire callback when pan starts**

In `onPointerDown` (line 87), after `state.isPanning = true;` is set (line 114), add:

```javascript
options.onGestureStart?.();
```

**Step 2: Fire callback when two-finger gesture starts**

In `startGestureDetection` (line 193), at the top of the function add:

```javascript
options.onGestureStart?.();
```

**Step 3: Fire callback when wheel zoom starts**

In `onWheel` (line 273), after the early return for `.canvas-card` (line 276) and `e.preventDefault()` (line 279), add:

```javascript
options.onGestureStart?.();
```

**Step 4: Commit**

```bash
git add src/js/canvas-engine.js
git commit -m "feat: add onGestureStart callback to canvas engine"
```

---

## Task 4: Wire unfocus triggers in `canvas.js`

**Files:**
- Modify: `src/js/canvas.js`

**Step 1: Add `onGestureStart` to engine options**

In the `createCanvasEngine` call (line 54), add the new callback:

```javascript
engine = createCanvasEngine(viewportEl, surfaceEl, {
    onViewportChange: ({ zoom }) => {
        zoomLevelDisplay.textContent = `${Math.round(zoom * 100)}%`;
        debouncedSave();
    },
    onGestureStart: () => {
        cardManager?.unfocusCard();
    },
});
```

**Step 2: Add click-on-empty-canvas to unfocus**

After the `initToolbar()` call (line 137), add a click listener on the viewport:

```javascript
// Unfocus card when tapping empty canvas
viewportEl.addEventListener('click', (e) => {
    // Only unfocus if clicking directly on viewport or surface (not on a card/header)
    if (e.target === viewportEl || e.target === surfaceEl) {
        cardManager?.unfocusCard();
    }
});
```

**Step 3: Commit**

```bash
git add src/js/canvas.js
git commit -m "feat: wire canvas card unfocus to pan/zoom gestures and empty canvas tap"
```

---

## Task 5: Gate swipe gestures behind focus state

**Files:**
- Modify: `src/js/idea-bubble.js`

**Step 1: Add focus check to swipe pointerdown handler**

In `handlePointerDown` (line 68), after the `if (!e.isPrimary) return;` check (line 73), add:

```javascript
// Inside a canvas card, only allow swipe if the card is focused
const canvasCard = container.closest('.canvas-card');
if (canvasCard && !canvasCard.classList.contains('is-focused')) {
    return;
}
```

This is a defense-in-depth check. The CSS `pointer-events: none` on `.canvas-card:not(.is-focused) .canvas-card__body` already blocks pointer events from reaching the swipe container, but this JS check ensures correctness even if CSS is overridden.

**Step 2: Commit**

```bash
git add src/js/idea-bubble.js
git commit -m "feat: gate swipe gestures behind canvas card focus state"
```

---

## Task 6: Handle edge cases

**Files:**
- Modify: `src/js/canvas-cards.js`
- Modify: `src/js/canvas.js`

**Step 1: Unfocus when Escape is pressed**

In `canvas.js`, in the existing keydown handler for thread panel close (line 376), extend it:

```javascript
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (activeThreadIdeaId) {
            closeThreadPanel();
        }
        cardManager?.unfocusCard();
    }
});
```

Note: This replaces the existing Escape handler at line 376-380. The thread panel close should still fire first, then unfocus.

**Step 2: Unfocus when card is removed via the X button**

Already handled in Task 2, Step 5 (the `removeCard` function). The remove button click handler at line 75 calls `el.remove()` directly though, not `removeCard()`. Update the remove button handler in `addCard` (line 75):

```javascript
el.querySelector('.canvas-card__remove').addEventListener('click', (e) => {
    e.stopPropagation();
    if (focusedCard === el) unfocusCard();
    cleanupCardSwipe(el);
    el.remove();
    options.onCardRemoved?.(categoryName);
});
```

**Step 3: Auto-unfocus on `updateAllCards` re-render**

In `updateAllCards` (line 496), when a focused card gets re-rendered, the focus visual persists since we only re-populate the ideas inside the card (not the card element itself). No change needed here — the `.is-focused` class stays on the outer `.canvas-card` element which is not replaced during updates.

**Step 4: Commit**

```bash
git add src/js/canvas-cards.js src/js/canvas.js
git commit -m "feat: handle focus edge cases (Escape, card removal)"
```

---

## Task 7: Manual testing checklist

**No code changes — verify behavior.**

**Test on mobile (or Chrome DevTools touch simulation):**

1. Open canvas page with at least 2 category cards
2. Pan the canvas by dragging on empty space — should work, no card gets focused
3. Tap on a card body — card should show primary outline, no other interaction fires
4. While focused, tap a button (pin, thread, priority) — should work normally
5. While focused, swipe an idea bubble left — edit/delete should reveal
6. While focused, drag the card header — card should move
7. Tap empty canvas — focus should clear (outline disappears)
8. Focus a card, then start panning — focus should clear
9. Focus a card, then pinch-to-zoom — focus should clear
10. Focus card A, then tap card B — card A unfocuses, card B focuses
11. Press Escape — focused card should unfocus
12. Click the X remove button on an unfocused card — card should be removed (no focus needed)

**Test on desktop:**

13. Click a card — should focus it
14. Click empty canvas — should unfocus
15. Middle-mouse or Space+drag to pan — should unfocus
16. Scroll wheel to zoom — should unfocus
17. Marquee selection still works on empty canvas — focus unrelated
18. Multi-select cards (marquee), then drag — group drag still works when cards are focused

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/styles/canvas.css` | Add `.is-focused` styles, pointer-events gating |
| `src/js/canvas-cards.js` | Focus state tracking, gate drag behind focus, export focus API |
| `src/js/canvas-engine.js` | Add `onGestureStart` callback on pan/zoom/wheel |
| `src/js/canvas.js` | Wire unfocus to gesture start, empty canvas tap, Escape key |
| `src/js/idea-bubble.js` | Defense-in-depth focus check on swipe |
