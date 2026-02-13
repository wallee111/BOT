# Canvas System Skill

## Overview

Interactive infinite canvas for visualizing and organizing ideas into draggable cards grouped by category, with pan, zoom, and multi-select support.

## Features

- ✅ **Pan & Zoom**: Drag to pan, scroll wheel to zoom
- ✅ **Infinite Canvas**: Viewport + surface transform model
- ✅ **Draggable Cards**: Move category cards across canvas
- ✅ **Header Navigation**: Dynamic header pills for quick navigation
- ✅ **Idea Lists**: Scrollable idea-bubbles within cards
- ✅ **Smart Scroll**: Wheel scroll on cards doesn't trigger zoom
- ✅ **Auto-scroll**: "Add Idea" button scrolls card to show input
- ✅ **Overlays**: Zoom controls, add buttons, navigation pills
- ✅ **Responsive**: Works on desktop and mobile

## Key Files

- `src/js/canvas.js` — Main canvas controller
- `src/js/canvas-engine.js` — Pan/zoom physics and transforms
- `src/js/canvas-cards.js` — Card rendering and drag
- `src/js/canvas-headers.js` — Header rendering and navigation
- `src/js/canvas-selection.js` — Multi-select system
- `src/styles/canvas.css` — Canvas layout and styling
- `canvas.html` — Canvas page HTML

## Architecture

### Viewport + Surface Model

```
Viewport (position: fixed, visible area)
    ↓
Surface (position: absolute, transformed)
    ↓
Cards & Headers (position: absolute within surface)
```

The viewport is the browser's visible area. The surface is transformed with CSS `translate(panX, panY) scale(zoom)`, allowing infinite panning and zooming.

### State Management

```javascript
const state = {
    panX: 0,           // Horizontal pan position
    panY: 0,           // Vertical pan position
    zoom: 1,           // Zoom level (1.0 = 100%)
    cards: [],         // Card layout data
    headers: [],       // Header layout data
    selectedCards: [], // Multi-selected card IDs
};
```

### Canvas Engine

The engine handles all physics and transforms:

```javascript
engine.pan(dx, dy)           // Pan by delta
engine.zoom(factor, centerX, centerY) // Zoom at point
engine.animateTo(x, y, zoom) // Animated transition
engine.screenToSurface(x, y) // Convert screen → canvas coords
engine.surfaceToScreen(x, y) // Convert canvas → screen coords
```

## Interaction Patterns

### Desktop

- **Drag on empty space**: Select cards (marquee selection) *planned*
- **Middle-click drag**: Pan canvas
- **Space + drag**: Pan canvas
- **Wheel scroll**: Zoom
- **Drag card**: Move card
- **Drag inside card**: No-op (bubbles don't drag)

### Mobile

- **Single-finger drag**: Pan
- **Two-finger pinch**: Zoom
- **Drag card**: Move card
- **Tap card**: Select/open
- **Swipe on idea**: Archive/pin/open thread

## Key Interactions

### 1. Card Dragging

Cards are draggable via pointer events:

```javascript
card.addEventListener('pointerdown', (e) => {
    const startX = card.offsetLeft;
    const startY = card.offsetTop;

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
});
```

### 2. Scroll vs Zoom

Wheel scrolling inside card bodies doesn't trigger zoom:

```javascript
function onWheel(e) {
    // Never zoom when mouse is over a canvas card
    if (e.target.closest('.canvas-card')) {
        return; // Let native scroll handle it
    }
    // ... zoom logic
}
```

### 3. Auto-scroll "Add Idea"

When adding an idea, scroll card to bottom to show input:

```javascript
requestAnimationFrame(() => {
    bodyEl.scrollTop = bodyEl.scrollHeight;
});
```

### 4. Header Navigation

Clicking a header pill scrolls canvas to show that header:

```javascript
engine.animateTo(headerX, headerY, 1); // Animate to header position
```

## Overlays

### 1. Zoom Overlay (top-right)
```html
<div class="canvas-zoom-overlay">
    <button class="canvas-zoom__in">+</button>
    <span class="canvas-zoom__level">100%</span>
    <button class="canvas-zoom__out">−</button>
</div>
```

### 2. Add Overlay (bottom-right)
```html
<div class="canvas-add-overlay">
    <button class="canvas-add__list-btn">Add List</button>
    <button class="canvas-add__header-btn">Add Header</button>
</div>
```

### 3. Header Pills Bar (bottom)
```html
<div class="canvas-header-pills-bar">
    <button class="canvas-header-pill">Work</button>
    <button class="canvas-header-pill">Personal</button>
</div>
```

## Styling (canvas.css)

Key CSS classes:

```css
.canvas-viewport          /* Main container, fixed */
.canvas-surface           /* Transformed element with translate/scale */
.canvas-card              /* Draggable category card */
.canvas-card__header      /* Card title */
.canvas-card__ideas       /* Scrollable idea list */
.canvas-card__body        /* Card content area */
.canvas-header            /* Header element on canvas */
.canvas-zoom-overlay      /* Zoom controls */
.canvas-add-overlay       /* Add buttons */
.canvas-header-pills-bar  /* Navigation pills */
```

## Coordinate System

Screen coordinates (pixel position on viewport) must be converted to surface coordinates (position on infinite canvas):

```javascript
function screenToSurface(screenX, screenY) {
    const viewportX = screenX;
    const viewportY = screenY;
    const surfaceX = (viewportX - panX) / zoom;
    const surfaceY = (viewportY - panY) / zoom;
    return { x: surfaceX, y: surfaceY };
}
```

## Data Persistence

Canvas layout is saved to Firestore:

```javascript
canvasLayouts/{userId}
├── cards[] → { categoryName, x, y, width, height }
├── headers[] → { id, text, x, y }
└── viewport → { panX, panY, zoom }
```

Real-time subscription updates local state when other devices make changes.

## Performance Considerations

- ✅ Card rendering is virtualized (only visible cards rendered)
- ✅ Idea lists use scrollable containers (not all ideas rendered)
- ✅ Transform changes use CSS transform (GPU-accelerated)
- ✅ Pointer events throttled via requestAnimationFrame

## Known Limitations & TODOs

- [ ] Desktop marquee selection not yet implemented
- [ ] Multi-card drag (select → drag all) not yet implemented
- [ ] Undo on archive toast action not yet implemented
- [ ] Threads integration on canvas not yet implemented
- [ ] Canvas touch gestures not yet optimized for mobile

## Related Skills

- [Idea Capture](./capture.md)
- [Categories & Organization](./categories.md)
- [Thread Notes](./threads.md)
- [Mobile (iOS/Android)](./mobile.md)
