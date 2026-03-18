# Notes Feature — Design Spec

**Date:** 2026-03-18
**Status:** Approved
**Branch:** Create new feature branch before implementation

---

## Overview

Add a full-featured Notes page to the Bucket of Thoughts app, replicating core Apple Notes functionality. Users can create, edit, and delete notes organized into flat folders, with basic rich text formatting and client-side search. The feature follows existing app patterns: vanilla JS, multi-page architecture, offline-first with Firestore sync.

## Scope

### In Scope
- Notes page with three-panel desktop layout (folders, notes list, editor)
- Mobile drill-down navigation (folders → list → editor)
- Flat folder organization (no nesting)
- Rich text editor with basic formatting (bold, italic, H1/H2, bullet lists, numbered lists, checklists)
- Full CRUD for notes and folders
- Auto-save with debounced writes
- Client-side search across note titles and content
- Offline-first with localStorage cache + Firestore sync
- Navigation updates across all existing pages

### Out of Scope (Future)
- Nested folders
- Pinned notes
- Rich formatting (tables, inline images, code blocks, attachments)
- Drawing/sketching
- Document scanning, link previews
- Markdown storage format
- Note sharing or collaboration

---

## Data Model

### Firestore Collections

#### `noteFolders` Collection
```javascript
{
  id: string,            // Auto-generated
  name: string,          // Folder display name
  sortOrder: number,     // Position in folder list
  createdAt: Timestamp,
  updatedAt: Timestamp,
  userId: string         // Auth guard
}
```

#### `notes` Collection
```javascript
{
  id: string,            // Auto-generated
  title: string,         // Note title
  content: string,       // HTML content from contentEditable
  folderId: string|null, // null = unfiled (shows in "All Notes")
  createdAt: Timestamp,
  updatedAt: Timestamp,
  userId: string         // Auth guard
}
```

**Design decisions:**
- Separate top-level collections (not subcollections of folders) so notes can be queried across all folders for search and "All Notes" view
- `folderId` as a reference field keeps queries simple
- `sortOrder` on folders supports future drag-to-reorder

### localStorage Cache Keys
| Key | Purpose |
|-----|---------|
| `note_folders_v1` | Cached folders array |
| `notes_v1_cache` | Cached notes array |

### Firestore Security Rules
Follow existing `ownsResource()` / `createsOwnResource()` pattern:

```
match /notes/{noteId} {
  allow read, update, delete: if request.auth != null && ownsResource();
  allow create: if request.auth != null && createsOwnResource();
}

match /noteFolders/{folderId} {
  allow read, update, delete: if request.auth != null && ownsResource();
  allow create: if request.auth != null && createsOwnResource();
}
```

---

## UI Layout

### Desktop (>=1024px) — Three-Panel

```
┌──────────┬─────────────┬──────────────┬─────────────────────────────┐
│ App      │ Folders     │ Notes List   │ Editor                      │
│ Sidebar  │ Panel       │ Panel        │                             │
│ (existing)│            │              │ [Title]                     │
│          │ All Notes   │ Search...    │ [Toolbar: B I H1 H2 • 1. ☑]│
│ Capture  │ Work        │ Note 1 ←sel │ [Content area]              │
│ Review   │ Personal    │ Note 2       │                             │
│ Categor. │ Recipes     │ Note 3       │                             │
│ Canvas   │             │              │                             │
│ *Notes*  │ + New Folder│              │ [Saved indicator]           │
│ Account  │             │              │                             │
└──────────┴─────────────┴──────────────┴─────────────────────────────┘
```

- Folder panel: ~180px wide, lists folders with note counts, "All Notes" virtual folder at top, "+ New Folder" at bottom
- Notes list panel: ~240px wide, shows note previews (title, snippet, date, folder), search bar at top, "+ New" button
- Editor panel: flex-grows to fill remaining space, title + toolbar + contentEditable area + save status

### Mobile (<1024px) — Drill-Down Navigation

Three views managed by `state.mobileView`:

1. **Folders view** (`mobileView: 'folders'`): Full-screen folder list with note counts, "+ New Folder" at bottom
2. **Notes list view** (`mobileView: 'list'`): Back button → folders, folder name as title, search bar, "+ New" button, note previews
3. **Editor view** (`mobileView: 'editor'`): Back button → list, formatting toolbar, full-screen editor, Move/Delete actions in header

Transitions use the back button pattern (← Back) consistent with mobile navigation conventions.

---

## Interactions

### Note CRUD
| Action | Trigger | Behavior |
|--------|---------|----------|
| **Create** | "+ New" button in notes list header | Creates empty note in current folder, opens editor with title focused |
| **Read** | Click note in list | Opens note in editor panel (desktop) or navigates to editor view (mobile) |
| **Edit** | Type in editor | Auto-save via debounce (1s after last keystroke) |
| **Delete** | "Delete" button in editor header | Confirm dialog (`showConfirmDialog`) → remove from Firestore + cache → return to notes list |

### Folder CRUD
| Action | Trigger | Behavior |
|--------|---------|----------|
| **Create** | "+ New Folder" button | Inline text input in folder panel |
| **Rename** | Long-press or right-click folder | Inline edit of folder name |
| **Delete** | Context action on folder | Confirm dialog → reassign folder's notes to `folderId: null` (All Notes) → delete folder |

### Search
- Search bar at top of notes list panel
- Client-side filtering over cached notes array
- Matches against `title` and stripped `content` text (HTML tags removed for matching)
- Results shown across all folders when searching
- Debounced input (300ms)

### Editor
- `contentEditable` div for note body
- Formatting toolbar buttons:
  - **Bold** (B) — `document.execCommand('bold')`
  - **Italic** (I) — `document.execCommand('italic')`
  - **Heading 1** (H1) — `document.execCommand('formatBlock', false, 'h1')`
  - **Heading 2** (H2) — `document.execCommand('formatBlock', false, 'h2')`
  - **Bullet list** (•) — `document.execCommand('insertUnorderedList')`
  - **Numbered list** (1.) — `document.execCommand('insertOrderedList')`
  - **Checklist** (☑) — Custom HTML insertion (`<div class="checklist-item">`)
- Title is a separate editable element above the toolbar
- "Move to..." dropdown to reassign note to a different folder

### Auto-Save
```
User types → debounce(1000ms) → update localStorage → fire Firestore write
```
- Status indicator in editor footer: "Saving..." → "Saved" (or "Offline — saved locally")
- Save triggers on both title and content changes

---

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `notes.html` | Page entry point (Vite auto-discovers via glob) |
| `src/js/notes.js` | Main controller — panel management, state, event handling |
| `src/styles/notes.css` | Three-panel layout, editor styles, mobile responsive breakpoints |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/storage.js` | Add notes & folder CRUD functions |
| `firestore.rules` | Add `notes` and `noteFolders` collection rules |
| `index.html` | Add "Notes" to sidebar nav + bottom nav |
| `review.html` | Add "Notes" to sidebar nav + bottom nav |
| `categories.html` | Add "Notes" to sidebar nav + bottom nav |
| `canvas.html` | Add "Notes" to sidebar nav + bottom nav |
| `account.html` | Add "Notes" to sidebar nav + bottom nav |
| `signin.html` | Add "Notes" to sidebar nav + bottom nav |

### Storage Functions (added to `storage.js`)
```javascript
// Notes
subscribeToNotes(callback)        // Real-time listener, returns unsubscribe fn
saveNote(note)                    // Create or update (upsert)
deleteNote(noteId)                // Delete from Firestore + cache

// Folders
subscribeToNoteFolders(callback)  // Real-time listener, returns unsubscribe fn
saveNoteFolder(folder)            // Create or update (upsert)
deleteNoteFolder(folderId)        // Delete folder, reassign notes to null
```

All functions follow existing patterns: optimistic localStorage update → Firestore write → mutation queue for offline.

---

## State Management

```javascript
let state = {
  folders: [],              // All user's folders
  notes: [],                // All user's notes
  activeFolderId: null,     // null = "All Notes" selected
  activeNoteId: null,       // Currently open note
  searchQuery: '',          // Current search filter
  mobileView: 'folders'    // 'folders' | 'list' | 'editor'
};
```

### Derived State
- **Filtered notes**: `state.notes` filtered by `activeFolderId` (or all if null), then by `searchQuery`
- **Folder note counts**: computed from `state.notes` grouped by `folderId`
- **Active note**: `state.notes.find(n => n.id === state.activeNoteId)`

---

## Offline & Sync Strategy

### Read Path
1. On page load, hydrate `state.notes` and `state.folders` from localStorage
2. Render immediately from cache
3. Set up Firestore `onSnapshot` listeners
4. When snapshots arrive, merge into state, update localStorage, re-render

### Write Path
1. Optimistic update: immediately update state + localStorage + re-render
2. Fire Firestore write in background
3. If offline, write queues via existing mutation queue in `storage.js`

### Conflict Handling
Last-write-wins (consistent with existing app behavior). Single-user app, so conflicts are unlikely.

---

## Navigation Updates

Add "Notes" link to both navigation components across all 6 existing HTML pages:

**Desktop sidebar** (`.sidebar-nav`):
```html
<a href="notes.html">Notes</a>
```
Positioned after "Canvas" and before "Account".

**Mobile bottom nav** (`.bottom-nav`):
This changes the bottom nav from 5 items to 6. The "Categories" item will be removed from the bottom nav (still accessible via sidebar on desktop and could be added to a "More" menu later) to keep 5 items on mobile:
- Capture, Review, Canvas, Notes, Account

---

## Testing Considerations

- Note creation, editing, deletion
- Folder creation, rename, deletion (with note reassignment)
- Search filtering across titles and content
- Mobile view transitions (folders → list → editor → back)
- Offline: create/edit note while offline, verify sync on reconnect
- Auto-save debounce behavior
- contentEditable formatting commands
- Empty states (no folders, no notes, no search results)
