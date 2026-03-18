# Notes Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Notes page with three-panel desktop layout, mobile drill-down navigation, folder organization, rich text editor, and offline-first Firestore sync.

**Architecture:** New `notes.html` page entry point with `src/js/notes.js` controller managing three panels (folders, notes list, editor). Storage functions added to existing `storage.js` using the `runMutation` pattern. Firestore collections `notes` and `noteFolders` with user-scoped security rules.

**Tech Stack:** Vanilla JS (ES Modules), Vite, Firebase Firestore, contentEditable, CSS custom properties (MD3 tokens)

**Spec:** `docs/superpowers/specs/2026-03-18-notes-feature-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `notes.html` | Page entry point — sidebar, three-panel layout shell, bottom nav, script import |
| `src/js/notes.js` | Main controller — state management, panel rendering, event wiring, editor logic, auto-save |
| `src/styles/notes.css` | Three-panel layout, folder/list/editor panel styles, mobile responsive, editor formatting |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/storage.js` | Add collection refs, cache keys, mutation executors, and 6 CRUD functions for notes + folders |
| `firestore.rules` | Add `notes` and `noteFolders` collection rules inside the existing `match /databases/{database}/documents` block |
| `index.html` | Add "Notes" to sidebar nav + replace "Categories" with "Notes" in bottom nav |
| `review.html` | Same nav updates |
| `categories.html` | Same nav updates |
| `canvas.html` | Same nav updates |
| `account.html` | Same nav updates |
| `signin.html` | Same nav updates |

---

## Task 0: Create Feature Branch

**Files:** None (git only)

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feature/notes-page
```

- [ ] **Step 2: Verify branch**

```bash
git branch --show-current
```
Expected: `feature/notes-page`

---

## Task 1: Firestore Security Rules

**Files:**
- Modify: `firestore.rules:109` (before closing braces)

- [ ] **Step 1: Add notes and noteFolders rules**

Add the following inside the `match /databases/{database}/documents` block, before the final closing `}` braces (after the `canvasLayouts` rule block ending at line 109):

```javascript
    match /notes/{noteId} {
      allow create: if createsOwnResource(request.resource)
        && validStringLength(request.resource.data.title, 500)
        && validStringLength(request.resource.data.content, 100000)
        && request.resource.data.keys().hasAll(['userId', 'title', 'content', 'folderId', 'createdAt', 'updatedAt'])
        && validTimestamp(request.resource.data.createdAt)
        && validTimestamp(request.resource.data.updatedAt)
        && (request.resource.data.folderId == null || request.resource.data.folderId is string);
      allow read: if ownsResource(resource);
      allow delete: if ownsResource(resource);
      allow update: if ownsResource(resource)
        && request.resource.data.userId == resource.data.userId
        && validStringLength(request.resource.data.title, 500)
        && validStringLength(request.resource.data.content, 100000)
        && validTimestamp(request.resource.data.updatedAt)
        && (request.resource.data.folderId == null || request.resource.data.folderId is string);
    }

    match /noteFolders/{folderId} {
      allow create: if createsOwnResource(request.resource)
        && validStringLength(request.resource.data.name, 100)
        && request.resource.data.keys().hasAll(['userId', 'name', 'sortOrder', 'createdAt', 'updatedAt'])
        && validTimestamp(request.resource.data.createdAt)
        && validTimestamp(request.resource.data.updatedAt);
      allow read: if ownsResource(resource);
      allow delete: if ownsResource(resource);
      allow update: if ownsResource(resource)
        && request.resource.data.userId == resource.data.userId
        && validStringLength(request.resource.data.name, 100)
        && validTimestamp(request.resource.data.updatedAt);
    }
```

- [ ] **Step 2: Verify the rules file is valid syntax**

Run: `cat firestore.rules` and visually confirm proper nesting and no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(notes): add Firestore security rules for notes and noteFolders collections"
```

---

## Task 2: Storage Layer — Collection Refs, Cache Keys, Mutation Executors

**Files:**
- Modify: `src/lib/storage.js`

This task adds the foundation: collection references, localStorage cache helpers, and mutation executors. The exported CRUD functions come in the next task.

- [ ] **Step 1: Add collection refs and cache constants**

After line 32 (`const LOCAL_MUTATION_QUEUE_KEY = 'ideas_mutation_queue_v1';`), add:

```javascript
const LOCAL_PAGE_NOTES_CACHE_KEY = 'notes_v1_cache';
const LOCAL_NOTE_FOLDERS_CACHE_KEY = 'note_folders_v1';
```

After line 142 (`const ideasCollection = collection(db, 'ideas');`), add:

```javascript
const notesCollection = collection(db, 'notes');
const noteFoldersCollection = collection(db, 'noteFolders');
```

- [ ] **Step 2: Add localStorage cache helpers for page notes and folders**

Add before the `// ── Mutation executors ──` section (before line 145). These follow the same pattern as the existing `readNotesCache`/`writeNotesCache` helpers at line 1242:

```javascript
// ── Page Notes cache helpers ────────────────────────────────────

let pageNotesCache = null;
let noteFoldersCache = null;

function readPageNotesFromLocal() {
    try {
        const raw = localStorage.getItem(LOCAL_PAGE_NOTES_CACHE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn('[PageNotes] Unable to read cache', error);
        return [];
    }
}

function writePageNotesToLocal(notes) {
    try {
        localStorage.setItem(LOCAL_PAGE_NOTES_CACHE_KEY, JSON.stringify(notes));
    } catch (error) {
        console.warn('[PageNotes] Unable to write cache', error);
    }
}

function updatePageNotesCache(updater) {
    const current = pageNotesCache || readPageNotesFromLocal();
    const updated = updater(current);
    pageNotesCache = updated;
    writePageNotesToLocal(updated);
}

function readNoteFoldersFromLocal() {
    try {
        const raw = localStorage.getItem(LOCAL_NOTE_FOLDERS_CACHE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn('[NoteFolders] Unable to read cache', error);
        return [];
    }
}

function writeNoteFoldersToLocal(folders) {
    try {
        localStorage.setItem(LOCAL_NOTE_FOLDERS_CACHE_KEY, JSON.stringify(folders));
    } catch (error) {
        console.warn('[NoteFolders] Unable to write cache', error);
    }
}

function updateNoteFoldersCache(updater) {
    const current = noteFoldersCache || readNoteFoldersFromLocal();
    const updated = updater(current);
    noteFoldersCache = updated;
    writeNoteFoldersToLocal(updated);
}
```

- [ ] **Step 3: Add mutation executors for notes and folders**

Add the following entries inside the `mutationExecutors` object (before the closing `};` of the `mutationExecutors` object — search for the line that is just `};` after `updateIdeaPriority`):

```javascript
    savePageNote: async (payload = {}) => {
        if (!payload?.id) return;
        const firestorePayload = { ...payload };
        if (typeof firestorePayload.createdAt === 'number') {
            firestorePayload.createdAt = Timestamp.fromMillis(firestorePayload.createdAt);
        }
        if (typeof firestorePayload.updatedAt === 'number') {
            firestorePayload.updatedAt = Timestamp.fromMillis(firestorePayload.updatedAt);
        }
        await setDoc(doc(notesCollection, payload.id), firestorePayload);
        perfMonitor.trackWrite(1);
    },
    deletePageNote: async ({ id }) => {
        if (!id) return;
        await deleteDoc(doc(notesCollection, id));
        perfMonitor.trackWrite(1);
    },
    saveNoteFolder: async (payload = {}) => {
        if (!payload?.id) return;
        const firestorePayload = { ...payload };
        if (typeof firestorePayload.createdAt === 'number') {
            firestorePayload.createdAt = Timestamp.fromMillis(firestorePayload.createdAt);
        }
        if (typeof firestorePayload.updatedAt === 'number') {
            firestorePayload.updatedAt = Timestamp.fromMillis(firestorePayload.updatedAt);
        }
        await setDoc(doc(noteFoldersCollection, payload.id), firestorePayload);
        perfMonitor.trackWrite(1);
    },
    deleteNoteFolder: async ({ id }) => {
        if (!id) return;
        await deleteDoc(doc(noteFoldersCollection, id));
        perfMonitor.trackWrite(1);
    },
```

- [ ] **Step 4: Verify no syntax errors**

Run: `npx vite build --mode development 2>&1 | head -20`
Expected: Build succeeds (no import/syntax errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.js
git commit -m "feat(notes): add collection refs, cache helpers, and mutation executors for notes storage"
```

---

## Task 3: Storage Layer — Exported CRUD Functions

**Files:**
- Modify: `src/lib/storage.js` (append after line 1571)

- [ ] **Step 1: Add subscribeToPageNotes function**

Append to the end of `storage.js`:

```javascript
// ══════════════════════════════════════════════════════════════════
// Page Notes & Folders — CRUD
// ══════════════════════════════════════════════════════════════════

/**
 * Subscribe to all page notes for the current user.
 * Returns an unsubscribe function.
 */
export function subscribeToPageNotes(callback) {
    let unsubscribe = () => {};

    // Immediately return cached notes
    const cached = readPageNotesFromLocal();
    if (cached.length > 0) {
        pageNotesCache = cached;
        callback(cached);
    }

    getCurrentUserId().then(userId => {
        if (!userId) {
            console.warn('[subscribeToPageNotes] No userId; skipping subscription.');
            return;
        }

        const q = query(notesCollection, where('userId', '==', userId));
        unsubscribe = onSnapshot(q, (snapshot) => {
            const notes = snapshot.docs.map(d => {
                const data = d.data() || {};
                return {
                    ...data,
                    id: d.id,
                    createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? 0,
                    updatedAt: data.updatedAt?.toMillis?.() ?? data.updatedAt ?? 0,
                };
            }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

            pageNotesCache = notes;
            writePageNotesToLocal(notes);
            callback(notes);
        }, (error) => {
            console.error('[subscribeToPageNotes] Snapshot error:', error);
            if (pageNotesCache) {
                callback([...pageNotesCache]);
            }
        });
    }).catch(error => {
        console.error('[subscribeToPageNotes] Error getting user ID:', error);
    });

    return () => unsubscribe();
}

/**
 * Create or update a page note. Generates an ID if not provided.
 */
export async function savePageNote(note) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated to save notes');

    const now = Date.now();
    const payload = {
        ...note,
        id: note.id || doc(notesCollection).id,
        userId,
        title: note.title ?? '',
        content: note.content ?? '',
        folderId: note.folderId ?? null,
        createdAt: note.createdAt ?? now,
        updatedAt: now,
    };

    const applyLocal = () => {
        updatePageNotesCache(current => {
            const filtered = current.filter(n => n.id !== payload.id);
            filtered.push(payload);
            return filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        });
    };

    await runMutation({
        type: 'savePageNote',
        payload,
        userId,
        applyLocal,
    });

    return payload;
}

/**
 * Delete a page note by ID.
 */
export async function deletePageNote(noteId) {
    if (!noteId) return false;

    const userId = await getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated to delete notes');

    const applyLocal = () => {
        updatePageNotesCache(current => current.filter(n => n.id !== noteId));
    };

    await runMutation({
        type: 'deletePageNote',
        payload: { id: noteId },
        userId,
        applyLocal,
    });

    return true;
}

/**
 * Subscribe to all note folders for the current user.
 * Returns an unsubscribe function.
 */
export function subscribeToNoteFolders(callback) {
    let unsubscribe = () => {};

    const cached = readNoteFoldersFromLocal();
    if (cached.length > 0) {
        noteFoldersCache = cached;
        callback(cached);
    }

    getCurrentUserId().then(userId => {
        if (!userId) {
            console.warn('[subscribeToNoteFolders] No userId; skipping subscription.');
            return;
        }

        const q = query(noteFoldersCollection, where('userId', '==', userId));
        unsubscribe = onSnapshot(q, (snapshot) => {
            const folders = snapshot.docs.map(d => {
                const data = d.data() || {};
                return {
                    ...data,
                    id: d.id,
                    createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? 0,
                    updatedAt: data.updatedAt?.toMillis?.() ?? data.updatedAt ?? 0,
                };
            }).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

            noteFoldersCache = folders;
            writeNoteFoldersToLocal(folders);
            callback(folders);
        }, (error) => {
            console.error('[subscribeToNoteFolders] Snapshot error:', error);
            if (noteFoldersCache) {
                callback([...noteFoldersCache]);
            }
        });
    }).catch(error => {
        console.error('[subscribeToNoteFolders] Error getting user ID:', error);
    });

    return () => unsubscribe();
}

/**
 * Create or update a note folder.
 */
export async function saveNoteFolder(folder) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated to save folders');

    const now = Date.now();
    const payload = {
        ...folder,
        id: folder.id || doc(noteFoldersCollection).id,
        userId,
        name: folder.name ?? 'Untitled Folder',
        sortOrder: folder.sortOrder ?? 0,
        createdAt: folder.createdAt ?? now,
        updatedAt: now,
    };

    const applyLocal = () => {
        updateNoteFoldersCache(current => {
            const filtered = current.filter(f => f.id !== payload.id);
            filtered.push(payload);
            return filtered.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        });
    };

    await runMutation({
        type: 'saveNoteFolder',
        payload,
        userId,
        applyLocal,
    });

    return payload;
}

/**
 * Delete a note folder. Reassigns its notes to folderId: null (All Notes).
 */
export async function deleteNoteFolder(folderId) {
    if (!folderId) return false;

    const userId = await getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated to delete folders');

    // Reassign notes in this folder to All Notes
    const allNotes = pageNotesCache || readPageNotesFromLocal();
    const notesInFolder = allNotes.filter(n => n.folderId === folderId);
    for (const note of notesInFolder) {
        await savePageNote({ ...note, folderId: null });
    }

    const applyLocal = () => {
        updateNoteFoldersCache(current => current.filter(f => f.id !== folderId));
    };

    await runMutation({
        type: 'deleteNoteFolder',
        payload: { id: folderId },
        userId,
        applyLocal,
    });

    return true;
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `npx vite build --mode development 2>&1 | head -20`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.js
git commit -m "feat(notes): add exported CRUD functions for page notes and note folders"
```

---

## Task 4: Notes Page HTML

**Files:**
- Create: `notes.html`

Reference `canvas.html` for the structural pattern. The Notes page replaces the canvas viewport with a three-panel notes layout.

- [ ] **Step 1: Create `notes.html`**

Create `notes.html` in the project root with the standard page structure. The main-content-wrap contains the three-panel layout (folders, notes list, editor):

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Notes - BOT</title>
    <meta name="theme-color" content="#ffca28">
    <link rel="manifest" href="/manifest.json">
    <script>
        (function() {
            var t = localStorage.getItem('bot_theme_v1') || 'dark';
            document.documentElement.setAttribute('data-theme', t);
        })();
    </script>
    <script src="/sw-register.js" defer></script>
</head>
<body>
    <a href="#notes-main" class="skip-link">Skip to main content</a>

    <main class="app-container">
        <!-- Desktop Sidebar (existing pattern) -->
        <aside class="desktop-sidebar" aria-label="Main Navigation">
            <div class="sidebar-header">
                <h2>BOT</h2>
                <button type="button" id="themeToggleSidebar" class="theme-toggle" aria-label="Toggle light/dark theme" title="Toggle theme">
                    <svg class="theme-toggle__sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="5"/>
                        <line x1="12" y1="1" x2="12" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="23"/>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                        <line x1="1" y1="12" x2="3" y2="12"/>
                        <line x1="21" y1="12" x2="23" y2="12"/>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                    <svg class="theme-toggle__moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                </button>
            </div>
            <nav class="sidebar-nav">
                <a href="index.html">Capture</a>
                <a href="review.html">Review</a>
                <a href="categories.html">Categories</a>
                <a href="canvas.html">Canvas</a>
                <a href="notes.html" class="is-active" aria-current="page">Notes</a>
                <a href="account.html">Account</a>
            </nav>
            <div class="sidebar-footer">
                <div id="sidebarSync" class="sync-indicator"></div>
            </div>
        </aside>

        <!-- Notes Three-Panel Layout -->
        <div class="main-content-wrap notes-layout" id="notes-main">

            <!-- Panel 1: Folders -->
            <div class="notes-folders-panel" id="notesFoldersPanel">
                <div class="notes-panel-header">
                    <h2 class="notes-panel-title">Folders</h2>
                </div>
                <div class="notes-folders-list" id="notesFoldersList">
                    <!-- "All Notes" is always first, rendered by JS -->
                </div>
                <div class="notes-folders-footer">
                    <button type="button" class="notes-new-folder-btn" id="newFolderBtn">+ New Folder</button>
                </div>
            </div>

            <!-- Panel 2: Notes List -->
            <div class="notes-list-panel" id="notesListPanel">
                <div class="notes-panel-header">
                    <div class="notes-list-header-row">
                        <button type="button" class="notes-back-btn" id="notesListBackBtn" aria-label="Back to folders">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <h2 class="notes-panel-title" id="notesListTitle">All Notes</h2>
                        <button type="button" class="notes-new-btn" id="newNoteBtn">+ New</button>
                    </div>
                    <div class="notes-search-wrap">
                        <input type="search" class="notes-search-input" id="notesSearchInput" placeholder="Search notes..." aria-label="Search notes">
                    </div>
                </div>
                <div class="notes-list" id="notesList">
                    <!-- Note preview cards rendered by JS -->
                </div>
            </div>

            <!-- Panel 3: Editor -->
            <div class="notes-editor-panel" id="notesEditorPanel">
                <div class="notes-editor-header" id="notesEditorHeader">
                    <div class="notes-editor-header-left">
                        <button type="button" class="notes-back-btn" id="notesEditorBackBtn" aria-label="Back to notes list">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <div class="notes-editor-meta">
                            <span class="notes-editor-folder" id="notesEditorFolder"></span>
                            <span class="notes-editor-date" id="notesEditorDate"></span>
                        </div>
                    </div>
                    <div class="notes-editor-actions">
                        <button type="button" class="notes-move-btn" id="notesMoveBtn">Move to...</button>
                        <button type="button" class="notes-delete-btn" id="notesDeleteBtn">Delete</button>
                    </div>
                </div>
                <!-- Formatting Toolbar -->
                <div class="notes-toolbar" id="notesToolbar">
                    <button type="button" data-command="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
                    <button type="button" data-command="italic" title="Italic (Ctrl+I)"><em>I</em></button>
                    <span class="notes-toolbar-divider"></span>
                    <button type="button" data-command="h1" title="Heading 1">H1</button>
                    <button type="button" data-command="h2" title="Heading 2">H2</button>
                    <span class="notes-toolbar-divider"></span>
                    <button type="button" data-command="ul" title="Bullet List">&#8226;</button>
                    <button type="button" data-command="ol" title="Numbered List">1.</button>
                    <button type="button" data-command="checklist" title="Checklist">&#9745;</button>
                </div>
                <!-- Title -->
                <div class="notes-editor-title" id="notesEditorTitle" contenteditable="true" data-placeholder="Note title..." role="textbox" aria-label="Note title"></div>
                <!-- Content -->
                <div class="notes-editor-content" id="notesEditorContent" contenteditable="true" data-placeholder="Start writing..." role="textbox" aria-label="Note content" aria-multiline="true"></div>
                <!-- Save Status -->
                <div class="notes-save-status" id="notesSaveStatus">
                    <span class="notes-save-dot"></span>
                    <span class="notes-save-text">Saved</span>
                </div>
                <!-- Empty state (no note selected) -->
                <div class="notes-editor-empty" id="notesEditorEmpty">
                    <p>Select a note or create a new one</p>
                </div>
            </div>

            <!-- Move-to-folder dropdown -->
            <div id="notesMoveMenu" class="md3-menu" hidden role="menu" aria-label="Move note to folder">
                <div id="notesMoveMenuContent" class="md3-menu__scroll"></div>
            </div>
        </div>
    </main>

    <!-- Mobile Bottom Navigation -->
    <nav class="bottom-nav" aria-label="App navigation">
        <a class="bottom-nav__item" href="index.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <span class="bottom-nav__label">Capture</span>
        </a>
        <a class="bottom-nav__item" href="review.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 7h12M6 12h12M6 17h8" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="4" cy="7" r="1" fill="currentColor" />
                <circle cx="4" cy="12" r="1" fill="currentColor" />
                <circle cx="4" cy="17" r="1" fill="currentColor" />
            </svg>
            <span class="bottom-nav__label">Review</span>
        </a>
        <a class="bottom-nav__item" href="canvas.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
            </svg>
            <span class="bottom-nav__label">Canvas</span>
        </a>
        <a class="bottom-nav__item is-active" href="notes.html" aria-current="page">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <line x1="8" y1="17" x2="13" y2="17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            <span class="bottom-nav__label">Notes</span>
        </a>
        <a class="bottom-nav__item" href="account.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2" />
                <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" />
            </svg>
            <span class="bottom-nav__label">Account</span>
        </a>
    </nav>

    <script type="module" src="/src/js/notes.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify Vite discovers the page**

Run: `npx vite build --mode development 2>&1 | grep notes`
Expected: Output includes `notes.html` in build entries.

- [ ] **Step 3: Commit**

```bash
git add notes.html
git commit -m "feat(notes): add notes.html page entry point with three-panel layout"
```

---

## Task 5: Notes CSS

**Files:**
- Create: `src/styles/notes.css`

- [ ] **Step 1: Create `src/styles/notes.css`**

This covers the three-panel layout, responsive breakpoints, editor styling, and formatting:

```css
/* ── Notes Page Layout ─────────────────────────────────────────── */

.notes-layout {
    display: flex;
    flex-direction: row;
    max-width: none;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
}

/* ── Panel Base ────────────────────────────────────────────────── */

.notes-panel-header {
    padding: 16px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
}

.notes-panel-title {
    font-size: var(--md-sys-typescale-title-medium-size, 16px);
    font-weight: var(--md-sys-typescale-title-medium-weight, 600);
    color: var(--md-sys-color-on-surface);
    margin: 0;
}

/* ── Folders Panel ─────────────────────────────────────────────── */

.notes-folders-panel {
    width: 200px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--md-sys-color-surface);
    border-right: 1px solid var(--md-sys-color-outline-variant);
}

.notes-folders-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.notes-folder-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 14px;
    color: var(--md-sys-color-on-surface-variant);
    cursor: pointer;
    transition: background-color var(--md-sys-motion-duration-medium, 250ms);
    border: none;
    background: none;
    width: 100%;
    text-align: left;
}

.notes-folder-item:hover {
    background: rgba(var(--md-sys-color-on-surface-rgb, 255, 255, 255), var(--md-sys-state-hover-opacity, 0.08));
}

.notes-folder-item.is-active {
    background: rgba(255, 202, 40, 0.15);
    color: var(--md-sys-color-primary);
}

.notes-folder-count {
    margin-left: auto;
    font-size: 12px;
    opacity: 0.5;
}

.notes-folder-name-input {
    flex: 1;
    background: transparent;
    border: 1px solid var(--md-sys-color-primary);
    border-radius: 4px;
    color: var(--md-sys-color-on-surface);
    font-size: 14px;
    padding: 2px 6px;
    outline: none;
}

.notes-folders-footer {
    padding: 8px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
}

.notes-new-folder-btn {
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    border: none;
    background: rgba(255, 202, 40, 0.1);
    color: var(--md-sys-color-primary);
    font-size: 13px;
    cursor: pointer;
    transition: background-color var(--md-sys-motion-duration-medium, 250ms);
}

.notes-new-folder-btn:hover {
    background: rgba(255, 202, 40, 0.2);
}

/* ── Notes List Panel ──────────────────────────────────────────── */

.notes-list-panel {
    width: 260px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--md-sys-color-surface);
    border-right: 1px solid var(--md-sys-color-outline-variant);
}

.notes-list-header-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}

.notes-back-btn {
    display: none; /* Hidden on desktop */
    background: none;
    border: none;
    color: var(--md-sys-color-primary);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
}

.notes-new-btn {
    margin-left: auto;
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}

.notes-search-wrap {
    margin-top: 0;
}

.notes-search-input {
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface-variant);
    color: var(--md-sys-color-on-surface);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
}

.notes-search-input:focus {
    border-color: var(--md-sys-color-primary);
}

.notes-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.notes-list-item {
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color var(--md-sys-motion-duration-medium, 250ms);
    background: rgba(var(--md-sys-color-on-surface-rgb, 255, 255, 255), 0.03);
}

.notes-list-item:hover {
    background: rgba(var(--md-sys-color-on-surface-rgb, 255, 255, 255), 0.06);
}

.notes-list-item.is-active {
    background: rgba(255, 202, 40, 0.08);
    border-left: 3px solid var(--md-sys-color-primary);
}

.notes-list-item-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.notes-list-item-snippet {
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 3px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.3;
}

.notes-list-item-meta {
    font-size: 10px;
    opacity: 0.4;
    margin-top: 4px;
}

.notes-list-empty {
    text-align: center;
    padding: 32px 16px;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    opacity: 0.6;
}

/* ── Editor Panel ──────────────────────────────────────────────── */

.notes-editor-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--md-sys-color-surface);
    min-width: 0;
    position: relative;
}

.notes-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
}

.notes-editor-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
}

.notes-editor-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.notes-editor-folder {
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant);
}

.notes-editor-date {
    font-size: 10px;
    opacity: 0.4;
}

.notes-editor-actions {
    display: flex;
    gap: 8px;
}

.notes-move-btn {
    background: rgba(var(--md-sys-color-on-surface-rgb, 255, 255, 255), 0.08);
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant);
    cursor: pointer;
}

.notes-delete-btn {
    background: rgba(255, 77, 77, 0.12);
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 11px;
    color: #ff6b6b;
    cursor: pointer;
}

/* ── Toolbar ───────────────────────────────────────────────────── */

.notes-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 20px;
    border-bottom: 1px solid rgba(var(--md-sys-color-on-surface-rgb, 255, 255, 255), 0.05);
    flex-shrink: 0;
}

.notes-toolbar button {
    background: rgba(var(--md-sys-color-on-surface-rgb, 255, 255, 255), 0.08);
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    color: var(--md-sys-color-on-surface);
    cursor: pointer;
    min-width: 28px;
    text-align: center;
}

.notes-toolbar button:hover {
    background: rgba(var(--md-sys-color-on-surface-rgb, 255, 255, 255), 0.15);
}

.notes-toolbar button.is-active {
    background: rgba(255, 202, 40, 0.2);
    color: var(--md-sys-color-primary);
}

.notes-toolbar-divider {
    width: 1px;
    height: 16px;
    background: rgba(var(--md-sys-color-on-surface-rgb, 255, 255, 255), 0.1);
    margin: 0 4px;
}

/* ── Editor Content ────────────────────────────────────────────── */

.notes-editor-title {
    padding: 20px 20px 8px;
    font-size: 22px;
    font-weight: 700;
    color: var(--md-sys-color-on-surface);
    outline: none;
    flex-shrink: 0;
    min-height: 36px;
}

.notes-editor-title:empty::before {
    content: attr(data-placeholder);
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.5;
}

.notes-editor-content {
    flex: 1;
    padding: 8px 20px 20px;
    font-size: 14px;
    line-height: 1.7;
    color: var(--md-sys-color-on-surface);
    outline: none;
    overflow-y: auto;
}

.notes-editor-content:empty::before {
    content: attr(data-placeholder);
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.5;
}

.notes-editor-content h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 16px 0 8px;
}

.notes-editor-content h2 {
    font-size: 17px;
    font-weight: 600;
    margin: 12px 0 6px;
}

.notes-editor-content ul,
.notes-editor-content ol {
    margin-left: 20px;
    margin-bottom: 8px;
}

.notes-editor-content li {
    margin-bottom: 2px;
}

/* Checklist items */
.checklist-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 4px;
}

.checklist-item input[type="checkbox"] {
    margin-top: 3px;
    accent-color: var(--md-sys-color-primary);
    width: 16px;
    height: 16px;
    cursor: pointer;
}

.checklist-item.is-checked span {
    text-decoration: line-through;
    opacity: 0.5;
}

/* ── Save Status ───────────────────────────────────────────────── */

.notes-save-status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 20px;
    border-top: 1px solid rgba(var(--md-sys-color-on-surface-rgb, 255, 255, 255), 0.05);
    flex-shrink: 0;
}

.notes-save-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4caf50;
}

.notes-save-dot.is-saving {
    background: var(--md-sys-color-primary);
    animation: pulse 1s infinite;
}

.notes-save-dot.is-offline {
    background: #ff9800;
}

.notes-save-text {
    font-size: 10px;
    opacity: 0.4;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

/* ── Empty State ───────────────────────────────────────────────── */

.notes-editor-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 14px;
    opacity: 0.5;
}

/* When a note is active, hide empty state and show editor elements */
.notes-editor-panel.has-note .notes-editor-empty {
    display: none;
}

.notes-editor-panel:not(.has-note) .notes-editor-header,
.notes-editor-panel:not(.has-note) .notes-toolbar,
.notes-editor-panel:not(.has-note) .notes-editor-title,
.notes-editor-panel:not(.has-note) .notes-editor-content,
.notes-editor-panel:not(.has-note) .notes-save-status {
    display: none;
}

/* ── Mobile Responsive ─────────────────────────────────────────── */

@media (max-width: 1023px) {
    .notes-layout {
        flex-direction: column;
        height: calc(100vh - 68px - env(safe-area-inset-bottom, 0px));
        height: calc(100dvh - 68px - env(safe-area-inset-bottom, 0px));
    }

    .notes-folders-panel,
    .notes-list-panel,
    .notes-editor-panel {
        width: 100%;
        height: 100%;
        border-right: none;
    }

    /* Only show active mobile view */
    .notes-folders-panel,
    .notes-list-panel,
    .notes-editor-panel {
        display: none;
    }

    .notes-layout[data-mobile-view="folders"] .notes-folders-panel {
        display: flex;
    }

    .notes-layout[data-mobile-view="list"] .notes-list-panel {
        display: flex;
    }

    .notes-layout[data-mobile-view="editor"] .notes-editor-panel {
        display: flex;
    }

    .notes-back-btn {
        display: flex;
    }

    .notes-folders-panel {
        width: 100%;
    }

    .notes-list-panel {
        width: 100%;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/notes.css
git commit -m "feat(notes): add notes page CSS with three-panel layout and mobile responsive"
```

---

## Task 6: Notes Page Controller (notes.js)

**Files:**
- Create: `src/js/notes.js`

This is the main controller. It manages state, renders all three panels, handles events, and wires up the editor with auto-save.

- [ ] **Step 1: Create `src/js/notes.js`**

```javascript
import "../styles/main.css";
import "../styles/style.v1.css";
import "../styles/notes.css";

import {
    subscribeToPageNotes,
    savePageNote,
    deletePageNote,
    subscribeToNoteFolders,
    saveNoteFolder,
    deleteNoteFolder,
} from '../lib/storage.js';
import { getCurrentUserId, ensureAuthSession } from '../lib/auth.js';
import { showToast } from '../lib/toast.js';
import { showConfirmDialog } from '../lib/confirm-dialog.js';
import { escapeHtml } from '../lib/utils.js';

// ── DOM Refs ────────────────────────────────────────────────────

const notesLayout = document.querySelector('.notes-layout');
const foldersList = document.getElementById('notesFoldersList');
const newFolderBtn = document.getElementById('newFolderBtn');
const notesListEl = document.getElementById('notesList');
const notesListTitle = document.getElementById('notesListTitle');
const notesListBackBtn = document.getElementById('notesListBackBtn');
const newNoteBtn = document.getElementById('newNoteBtn');
const searchInput = document.getElementById('notesSearchInput');
const editorPanel = document.getElementById('notesEditorPanel');
const editorBackBtn = document.getElementById('notesEditorBackBtn');
const editorTitle = document.getElementById('notesEditorTitle');
const editorContent = document.getElementById('notesEditorContent');
const editorFolder = document.getElementById('notesEditorFolder');
const editorDate = document.getElementById('notesEditorDate');
const editorEmpty = document.getElementById('notesEditorEmpty');
const moveBtn = document.getElementById('notesMoveBtn');
const deleteBtn = document.getElementById('notesDeleteBtn');
const moveMenu = document.getElementById('notesMoveMenu');
const moveMenuContent = document.getElementById('notesMoveMenuContent');
const saveDot = document.querySelector('.notes-save-dot');
const saveText = document.querySelector('.notes-save-text');
const toolbar = document.getElementById('notesToolbar');

// ── State ───────────────────────────────────────────────────────

let state = {
    folders: [],
    notes: [],
    activeFolderId: null,
    activeNoteId: null,
    searchQuery: '',
    mobileView: 'folders',
};

let saveTimer = null;
let isSaving = false;

// ── Helpers ─────────────────────────────────────────────────────

function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) return 'Today, ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isYesterday) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getFolderName(folderId) {
    if (!folderId) return 'All Notes';
    const folder = state.folders.find(f => f.id === folderId);
    return folder ? folder.name : 'All Notes';
}

function getFilteredNotes() {
    let notes = state.notes;
    if (state.activeFolderId) {
        notes = notes.filter(n => n.folderId === state.activeFolderId);
    }
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        notes = notes.filter(n =>
            (n.title || '').toLowerCase().includes(q) ||
            stripHtml(n.content || '').toLowerCase().includes(q)
        );
    }
    return notes;
}

function setMobileView(view) {
    state.mobileView = view;
    if (notesLayout) {
        notesLayout.setAttribute('data-mobile-view', view);
    }
}

// ── Render: Folders ─────────────────────────────────────────────

function renderFolders() {
    if (!foldersList) return;

    const allNotesCount = state.notes.length;
    let html = `
        <button class="notes-folder-item ${state.activeFolderId === null ? 'is-active' : ''}"
                data-folder-id="">
            All Notes
            <span class="notes-folder-count">${allNotesCount}</span>
        </button>
    `;

    for (const folder of state.folders) {
        const count = state.notes.filter(n => n.folderId === folder.id).length;
        html += `
            <button class="notes-folder-item ${state.activeFolderId === folder.id ? 'is-active' : ''}"
                    data-folder-id="${escapeHtml(folder.id)}"
                    data-folder-name="${escapeHtml(folder.name)}">
                ${escapeHtml(folder.name)}
                <span class="notes-folder-count">${count}</span>
            </button>
        `;
    }

    foldersList.innerHTML = html;
}

// ── Render: Notes List ──────────────────────────────────────────

function renderNotesList() {
    if (!notesListEl) return;

    const filtered = getFilteredNotes();
    notesListTitle.textContent = getFolderName(state.activeFolderId);

    if (filtered.length === 0) {
        const msg = state.searchQuery ? 'No notes match your search' : 'No notes yet';
        notesListEl.innerHTML = `<div class="notes-list-empty">${msg}</div>`;
        return;
    }

    let html = '';
    for (const note of filtered) {
        const snippet = stripHtml(note.content || '').slice(0, 100);
        const folderName = getFolderName(note.folderId);
        html += `
            <div class="notes-list-item ${state.activeNoteId === note.id ? 'is-active' : ''}"
                 data-note-id="${escapeHtml(note.id)}">
                <div class="notes-list-item-title">${escapeHtml(note.title || 'Untitled')}</div>
                <div class="notes-list-item-snippet">${escapeHtml(snippet)}</div>
                <div class="notes-list-item-meta">${formatDate(note.updatedAt)}${note.folderId ? ' · ' + escapeHtml(folderName) : ''}</div>
            </div>
        `;
    }

    notesListEl.innerHTML = html;
}

// ── Render: Editor ──────────────────────────────────────────────

function renderEditor() {
    const note = state.notes.find(n => n.id === state.activeNoteId);

    if (!note) {
        editorPanel.classList.remove('has-note');
        return;
    }

    editorPanel.classList.add('has-note');
    editorFolder.textContent = getFolderName(note.folderId);
    editorDate.textContent = 'Last edited: ' + formatDate(note.updatedAt);

    // Only update DOM if content differs (avoid clobbering cursor)
    if (editorTitle.textContent !== note.title) {
        editorTitle.textContent = note.title || '';
    }
    if (!editorContent.dataset.loaded || editorContent.dataset.noteId !== note.id) {
        editorContent.innerHTML = note.content || '';
        editorContent.dataset.loaded = 'true';
        editorContent.dataset.noteId = note.id;
    }
}

// ── Auto-Save ───────────────────────────────────────────────────

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);

    // Show saving indicator
    saveDot?.classList.add('is-saving');
    if (saveText) saveText.textContent = 'Saving...';
    isSaving = true;

    saveTimer = setTimeout(async () => {
        const note = state.notes.find(n => n.id === state.activeNoteId);
        if (!note) return;

        try {
            await savePageNote({
                ...note,
                title: editorTitle.textContent || '',
                content: editorContent.innerHTML || '',
            });

            saveDot?.classList.remove('is-saving', 'is-offline');
            if (saveText) saveText.textContent = 'Saved';
        } catch (error) {
            console.error('[Notes] Save failed:', error);
            saveDot?.classList.remove('is-saving');
            saveDot?.classList.add('is-offline');
            if (saveText) saveText.textContent = 'Offline — saved locally';
        }
        isSaving = false;
    }, 1000);
}

// ── Actions ─────────────────────────────────────────────────────

function selectFolder(folderId) {
    state.activeFolderId = folderId || null;
    state.activeNoteId = null;
    state.searchQuery = '';
    if (searchInput) searchInput.value = '';
    editorContent.dataset.loaded = '';

    renderFolders();
    renderNotesList();
    renderEditor();
    setMobileView('list');
}

function selectNote(noteId) {
    state.activeNoteId = noteId;
    editorContent.dataset.loaded = '';

    renderNotesList();
    renderEditor();
    setMobileView('editor');
}

async function createNote() {
    try {
        const note = await savePageNote({
            title: '',
            content: '',
            folderId: state.activeFolderId,
        });
        selectNote(note.id);
        // Focus title for immediate editing
        setTimeout(() => editorTitle?.focus(), 50);
    } catch (error) {
        console.error('[Notes] Create failed:', error);
        showToast('Failed to create note', { tone: 'error' });
    }
}

async function deleteCurrentNote() {
    if (!state.activeNoteId) return;

    const note = state.notes.find(n => n.id === state.activeNoteId);
    const title = note?.title || 'Untitled';

    const confirmed = await showConfirmDialog(
        `Are you sure you want to delete "${title}"?`
    );
    if (!confirmed) return;

    try {
        await deletePageNote(state.activeNoteId);
        state.activeNoteId = null;
        editorContent.dataset.loaded = '';
        renderNotesList();
        renderEditor();
        setMobileView('list');
        showToast('Note deleted');
    } catch (error) {
        console.error('[Notes] Delete failed:', error);
        showToast('Failed to delete note', { tone: 'error' });
    }
}

async function createFolder() {
    const name = prompt('Folder name:');
    if (!name?.trim()) return;

    try {
        const maxSort = state.folders.reduce((max, f) => Math.max(max, f.sortOrder || 0), 0);
        await saveNoteFolder({
            name: name.trim(),
            sortOrder: maxSort + 1,
        });
        showToast('Folder created');
    } catch (error) {
        console.error('[Notes] Create folder failed:', error);
        showToast('Failed to create folder', { tone: 'error' });
    }
}

async function renameFolder(folderId) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return;

    const name = prompt('Rename folder:', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;

    try {
        await saveNoteFolder({ ...folder, name: name.trim() });
        renderFolders();
    } catch (error) {
        console.error('[Notes] Rename folder failed:', error);
        showToast('Failed to rename folder', { tone: 'error' });
    }
}

async function deleteFolderAction(folderId) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return;

    const notesInFolder = state.notes.filter(n => n.folderId === folderId).length;
    const msg = notesInFolder > 0
        ? `Delete "${folder.name}"? Its ${notesInFolder} note(s) will be moved to All Notes.`
        : `Delete "${folder.name}"?`;

    const confirmed = await showConfirmDialog(msg);
    if (!confirmed) return;

    try {
        await deleteNoteFolder(folderId);
        if (state.activeFolderId === folderId) {
            state.activeFolderId = null;
        }
        renderFolders();
        renderNotesList();
        showToast('Folder deleted');
    } catch (error) {
        console.error('[Notes] Delete folder failed:', error);
        showToast('Failed to delete folder', { tone: 'error' });
    }
}

function showMoveMenu() {
    if (!state.activeNoteId) return;

    let html = `<button class="md3-menu__item" data-move-folder="">All Notes</button>`;
    for (const folder of state.folders) {
        html += `<button class="md3-menu__item" data-move-folder="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</button>`;
    }
    moveMenuContent.innerHTML = html;
    moveMenu.hidden = false;
    moveMenu.classList.add('is-open');
}

async function moveNoteToFolder(folderId) {
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (!note) return;

    try {
        await savePageNote({ ...note, folderId: folderId || null });
        moveMenu.hidden = true;
        moveMenu.classList.remove('is-open');
        renderEditor();
        showToast('Note moved');
    } catch (error) {
        console.error('[Notes] Move failed:', error);
        showToast('Failed to move note', { tone: 'error' });
    }
}

// ── Toolbar Commands ────────────────────────────────────────────

function execToolbarCommand(command) {
    editorContent.focus();
    switch (command) {
        case 'bold':
            document.execCommand('bold');
            break;
        case 'italic':
            document.execCommand('italic');
            break;
        case 'h1':
            document.execCommand('formatBlock', false, 'h1');
            break;
        case 'h2':
            document.execCommand('formatBlock', false, 'h2');
            break;
        case 'ul':
            document.execCommand('insertUnorderedList');
            break;
        case 'ol':
            document.execCommand('insertOrderedList');
            break;
        case 'checklist':
            insertChecklist();
            break;
    }
    scheduleSave();
}

function insertChecklist() {
    const item = document.createElement('div');
    item.className = 'checklist-item';
    item.innerHTML = '<input type="checkbox"><span contenteditable="true">Item</span>';

    const sel = window.getSelection();
    if (sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(item);
        // Move cursor into the span
        const span = item.querySelector('span');
        if (span) {
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
    }
}

// ── Event Wiring ────────────────────────────────────────────────

function wireEvents() {
    // Folder clicks
    foldersList?.addEventListener('click', (e) => {
        const item = e.target.closest('.notes-folder-item');
        if (!item) return;
        selectFolder(item.dataset.folderId || null);
    });

    // Folder context menu (rename/delete)
    foldersList?.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.notes-folder-item');
        if (!item || !item.dataset.folderId) return; // Can't rename/delete "All Notes"
        e.preventDefault();

        const action = prompt(`Folder: "${item.dataset.folderName}"\nType "rename" or "delete":`);
        if (action === 'rename') renameFolder(item.dataset.folderId);
        else if (action === 'delete') deleteFolderAction(item.dataset.folderId);
    });

    // New folder
    newFolderBtn?.addEventListener('click', createFolder);

    // Note clicks
    notesListEl?.addEventListener('click', (e) => {
        const item = e.target.closest('.notes-list-item');
        if (!item) return;
        selectNote(item.dataset.noteId);
    });

    // New note
    newNoteBtn?.addEventListener('click', createNote);

    // Search
    let searchTimer;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.searchQuery = searchInput.value;
            renderNotesList();
        }, 300);
    });

    // Editor input (auto-save)
    editorTitle?.addEventListener('input', scheduleSave);
    editorContent?.addEventListener('input', scheduleSave);

    // Checklist checkbox toggle
    editorContent?.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const item = e.target.closest('.checklist-item');
            if (item) {
                item.classList.toggle('is-checked', e.target.checked);
                scheduleSave();
            }
        }
    });

    // Toolbar
    toolbar?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-command]');
        if (!btn) return;
        execToolbarCommand(btn.dataset.command);
    });

    // Delete note
    deleteBtn?.addEventListener('click', deleteCurrentNote);

    // Move note
    moveBtn?.addEventListener('click', showMoveMenu);
    moveMenuContent?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-move-folder]');
        if (!btn) return;
        moveNoteToFolder(btn.dataset.moveFolder || null);
    });

    // Close move menu on outside click
    document.addEventListener('click', (e) => {
        if (!moveMenu.hidden && !moveMenu.contains(e.target) && e.target !== moveBtn) {
            moveMenu.hidden = true;
            moveMenu.classList.remove('is-open');
        }
    });

    // Mobile back buttons
    notesListBackBtn?.addEventListener('click', () => setMobileView('folders'));
    editorBackBtn?.addEventListener('click', () => {
        state.activeNoteId = null;
        editorContent.dataset.loaded = '';
        renderEditor();
        setMobileView('list');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            execToolbarCommand('bold');
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            execToolbarCommand('italic');
        }
    });
}

// ── Init ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const userId = getCurrentUserId();
    if (!userId) {
        window.location.href = '/signin.html';
        return;
    }

    await ensureAuthSession({ requireAuth: true });

    // Set initial mobile view
    setMobileView('folders');

    // Subscribe to data
    subscribeToNoteFolders((folders) => {
        state.folders = folders;
        renderFolders();
        renderNotesList();
        renderEditor();
    });

    subscribeToPageNotes((notes) => {
        state.notes = notes;
        renderFolders();
        renderNotesList();
        // Only re-render editor if not currently editing (avoid clobbering)
        if (!isSaving) {
            renderEditor();
        }
    });

    wireEvents();
});
```

- [ ] **Step 2: Verify the page loads**

Run: `npm run dev &` then open `http://localhost:5173/notes.html` in a browser.
Expected: Page loads with three panels, no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/js/notes.js
git commit -m "feat(notes): add notes page controller with CRUD, editor, search, and auto-save"
```

---

## Task 7: Update Navigation Across All Pages

**Files:**
- Modify: `index.html`, `review.html`, `categories.html`, `canvas.html`, `account.html`, `signin.html`

Two changes per file:
1. **Sidebar nav**: Add "Notes" link after "Canvas", before "Account"
2. **Bottom nav**: Replace "Categories" with "Notes" (keeping 5 items for mobile)

- [ ] **Step 1: Update sidebar nav in all 6 HTML files**

In each file, find the `<nav class="sidebar-nav">` block and add the Notes link. The sidebar nav block looks like:

```html
<nav class="sidebar-nav">
    <a href="index.html" ...>Capture</a>
    <a href="review.html" ...>Review</a>
    <a href="categories.html" ...>Categories</a>
    <a href="canvas.html" ...>Canvas</a>
    <a href="account.html" ...>Account</a>
</nav>
```

Add this line between Canvas and Account:
```html
                <a href="notes.html">Notes</a>
```

Do this in all 6 files: `index.html`, `review.html`, `categories.html`, `canvas.html`, `account.html`, `signin.html`.

- [ ] **Step 2: Update bottom nav in all 6 HTML files**

In each file, find the Categories `<a class="bottom-nav__item" href="categories.html">` block and replace it with the Notes item:

```html
        <a class="bottom-nav__item" href="notes.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <line x1="8" y1="17" x2="13" y2="17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            <span class="bottom-nav__label">Notes</span>
        </a>
```

Remember to set the correct `is-active` and `aria-current="page"` on whichever page is current. On `notes.html` the Notes bottom nav item has `is-active`, on all other pages it doesn't.

- [ ] **Step 3: Verify navigation works**

Run dev server and click through all pages to confirm:
- Sidebar shows Notes link on every page
- Bottom nav shows Notes instead of Categories on mobile
- Active states are correct on each page

- [ ] **Step 4: Commit**

```bash
git add index.html review.html categories.html canvas.html account.html signin.html
git commit -m "feat(notes): add Notes to sidebar and bottom navigation across all pages"
```

---

## Task 8: Manual Testing & Polish

**Files:** Potentially any of the files created/modified above

- [ ] **Step 1: Test folder CRUD**

On the Notes page:
1. Click "+ New Folder" → enter "Work" → verify it appears in folder list
2. Create another folder "Personal"
3. Right-click "Work" → type "rename" → rename to "Work Notes"
4. Right-click "Personal" → type "delete" → confirm deletion
5. Verify folder counts update correctly

- [ ] **Step 2: Test note CRUD**

1. Click "All Notes" folder → click "+ New" → verify editor opens with title focused
2. Type a title and some content → verify "Saving..." → "Saved" status
3. Navigate away and back → verify content persisted
4. Click "Delete" → confirm → verify note removed from list
5. Create notes in different folders → verify they appear in correct folder and in "All Notes"

- [ ] **Step 3: Test editor formatting**

1. Select text → click Bold (B) → verify bold applied
2. Select text → click Italic (I) → verify italic applied
3. Click H1 → type heading → verify heading size
4. Click bullet list → type items → verify list formatting
5. Click checklist → verify checkbox appears → toggle checkbox
6. Test Ctrl+B and Ctrl+I keyboard shortcuts

- [ ] **Step 4: Test search**

1. Create several notes with different titles and content
2. Type in search bar → verify results filter in real-time
3. Clear search → verify all notes return
4. Search shows results across all folders

- [ ] **Step 5: Test mobile view**

1. Resize browser to < 1024px width
2. Verify folders view shows first
3. Tap folder → verify notes list view with back button
4. Tap note → verify editor view with back button
5. Tap back → verify navigation returns correctly

- [ ] **Step 6: Test move note between folders**

1. Create a note in "All Notes"
2. Click "Move to..." → select a folder → verify note moves
3. Check the folder → verify note appears there

- [ ] **Step 7: Fix any issues found during testing**

Address any bugs, styling issues, or edge cases discovered during manual testing.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "fix(notes): polish and bug fixes from manual testing"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 0 | Create feature branch | git |
| 1 | Firestore security rules | `firestore.rules` |
| 2 | Storage layer — refs, cache, executors | `src/lib/storage.js` |
| 3 | Storage layer — CRUD functions | `src/lib/storage.js` |
| 4 | Notes page HTML | `notes.html` |
| 5 | Notes CSS | `src/styles/notes.css` |
| 6 | Notes page controller | `src/js/notes.js` |
| 7 | Navigation updates (6 files) | All `*.html` |
| 8 | Manual testing & polish | Various |
