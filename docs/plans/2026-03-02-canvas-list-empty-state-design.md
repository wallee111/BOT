# Canvas List Empty State Design

**Date:** 2026-03-02
**Status:** Implemented

## Problem

When a canvas category card has no ideas, the list showed "No ideas yet" but no way to add one — the "+ Add idea" button was only rendered for non-empty lists due to an early `return` in `populateCardIdeas`.

## Design

Minimal approach: keep the existing "No ideas yet" text and add the standard "+ Add idea" button below it, matching the non-empty list layout exactly.

```
┌─────────────────────────┐
│  Category Name      ✕   │
├─────────────────────────┤
│                         │
│  No ideas yet           │
│                         │
├─────────────────────────┤
│  + Add idea             │
└─────────────────────────┘
```

## Change

**File:** `src/js/canvas-cards.js`

Removed the early `return` from the empty-state branch in `populateCardIdeas` so execution falls through to the existing `appendAddIdeaButton(container, categoryName)` call.

No CSS changes needed — `.canvas-card__empty` and `.canvas-card__add-idea` styles already coexist correctly.
