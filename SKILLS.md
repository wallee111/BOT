# BOT Skills & Features

A comprehensive guide to the capabilities and features of Bucket of Thoughts (BOT).

## Core Features

### 🔐 [Authentication](skills/authentication.md)
Hybrid Firebase Google OAuth with support for web and mobile (Capacitor/iOS). Includes redirect flows, session management, and auth guards.

### 💾 [Storage & Sync](skills/storage.md)
Offline-first data layer with localStorage cache and Firestore as authoritative source. Real-time subscriptions and optimistic updates.

### 📝 [Idea Capture](skills/capture.md)
Multi-page capture system with category selection, priority levels, inline new category creation, and synchronized idea bubbles across app.

### 🎨 [Canvas System](skills/canvas.md)
Interactive infinite canvas with pan, zoom, draggable cards, header navigation, and multi-select support.

### 🏷️ [Categories & Organization](skills/categories.md)
Dynamic category management with color customization, visibility toggles, and category-based card organization on canvas.

### 💬 [Thread Notes](skills/threads.md)
Threaded comments/notes on ideas with edit, delete, and swipe gestures. Accessible across all pages.

### 📱 [Mobile (iOS/Android)](skills/mobile.md)
Native mobile apps via Capacitor with hybrid auth, offline support, and touch-optimized UI.

### 🔍 [Search & Filter](skills/search.md)
Advanced filtering by category, priority, archived status, and hidden ideas. Resurfacing algorithm.

### 📌 [Pin & Priority System](skills/priority.md)
Pinned ideas, priority levels, and smart sorting across dashboard, review, and canvas.

### ♿ [Accessibility](skills/accessibility.md)
WCAG compliance with skip links, ARIA labels, keyboard navigation, and screen reader support.

---

## Technology Stack

- **Frontend**: Vanilla JavaScript (Vite) + React 19 (Phase 1)
- **Styling**: Tailwind CSS v3/v4 + MD3 Design System
- **Backend**: Firebase (Firestore + Auth)
- **Mobile**: Capacitor 8.0.2
- **Build**: Vite 7.2.7
- **Hosting**: Firebase Hosting

---

## Architecture Patterns

- **Auth Guard**: `getCurrentUserId()` → redirect to signin.html → `ensureAuthSession({ requireAuth: true })`
- **Pointer Events**: WeakMap-based state tracking for gestures (not touch events)
- **Storage**: localStorage first (fast) → Firestore (authoritative) with mutation queue
- **Styling**: CSS custom properties for MD3 tokens, Tailwind utilities for layout
- **Real-time**: Firestore subscriptions with local cache invalidation
- **Gestures**: Swipe, drag, pinch, pan using `pointerdown`/`pointermove`/`pointerup`

---

## Getting Started

See individual feature files for implementation details, code examples, and usage patterns.
