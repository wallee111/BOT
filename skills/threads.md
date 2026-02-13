# Thread Notes Skill

## Overview

Threaded comments system allowing users to add notes, edit, and delete comments on ideas. Available across all pages with swipe gestures for quick actions.

## Features

- ✅ **Add Notes**: Comment on any idea
- ✅ **Edit Notes**: Modify comment text
- ✅ **Delete Notes**: Remove with undo option
- ✅ **Swipe Gestures**: Quick edit/delete via swipe
- ✅ **Real-time Sync**: Changes sync across devices
- ✅ **Timestamps**: Creation and edit dates
- ✅ **User Attribution**: Show who wrote each note

## Key Files

- `src/js/thread-notes.js` — Thread notes controller
- `src/lib/storage.js` — Notes CRUD operations
- `src/js/idea-bubble.js` — Swipe gesture reference
- `firestore.rules` — Comment access control

## Data Model

### Comments Collection (Firestore)

```javascript
ideas/{ideaId}/comments/{commentId}
├── id: string (document ID)
├── text: string (comment content, max 5000 chars)
├── userId: string (author ID)
├── createdAt: timestamp
├── updatedAt: timestamp (if edited)
└── authorName: string (optional, cached)
```

Comments are nested under ideas in Firestore. Only the idea owner can manage all comments on their ideas.

## API Reference

### Notes CRUD

```javascript
// Create note
await addNote(ideaId, { text })

// Get all notes for an idea
const notes = await getNotes(ideaId)

// Get specific note
const note = await getNote(ideaId, noteId)

// Update note text
await updateNoteText(ideaId, noteId, newText)

// Delete note
await deleteNote(ideaId, noteId)

// Real-time subscription
const unsubscribe = subscribeToNotes(ideaId, (notes) => {
    console.log('Notes updated:', notes)
})
```

## Usage Example

### Basic Thread Display

```html
<div class="idea-thread-panel" id="threadPanel" hidden>
    <!-- Thread header -->
    <div class="thread-header">
        <button class="thread-close">&times;</button>
        <h3>Notes</h3>
    </div>

    <!-- Idea being commented on -->
    <div class="thread-idea" id="threadIdea"></div>

    <!-- Notes feed -->
    <div class="thread-notes" id="threadNotes">
        <!-- Notes rendered here -->
    </div>

    <!-- Note input -->
    <div class="thread-input" id="threadInput">
        <textarea id="noteText"
            placeholder="Add a note..."
            maxlength="5000"></textarea>
        <button class="thread-submit">Add Note</button>
    </div>
</div>
```

### Open Thread (index.js)

```javascript
ideaBubble.addEventListener('click', (e) => {
    if (e.target.closest('.idea-thread')) {
        const ideaId = e.target.dataset.threadId
        openThread(ideaId)
    }
})

async function openThread(ideaId) {
    const idea = await getIdea(ideaId)
    const notes = await getNotes(ideaId)

    // Show panel
    threadPanel.hidden = false

    // Render idea
    const ideaEl = buildIdeaElement(idea)
    threadIdea.innerHTML = ''
    threadIdea.appendChild(ideaEl)

    // Render notes
    renderNotes(notes)

    // Setup input
    setupNoteInput(ideaId)
}
```

### Render Notes

```javascript
function renderNotes(notes) {
    threadNotes.innerHTML = ''

    notes.forEach(note => {
        const row = document.createElement('div')
        row.className = 'thread-note-row'
        row.dataset.noteId = note.id
        row.dataset.ideaId = ideaId

        row.innerHTML = `
            <div class="thread-note">
                <div class="thread-note-text">${escapeHtml(note.text)}</div>
                <div class="thread-note-meta">
                    <span class="thread-note-author">${note.authorName}</span>
                    <span class="thread-note-date">${formatDate(note.createdAt)}</span>
                </div>
            </div>
            <div class="swipe-actions">
                <button class="swipe-btn swipe-btn--edit">✏️</button>
                <button class="swipe-btn swipe-btn--delete">🗑️</button>
            </div>
        `

        threadNotes.appendChild(row)
    })

    // Attach swipe gestures
    attachSwipeGestures()
}
```

### Add Note

```javascript
function setupNoteInput(ideaId) {
    const noteText = document.getElementById('noteText')
    const submitBtn = threadPanel.querySelector('.thread-submit')

    submitBtn.addEventListener('click', async () => {
        const text = noteText.value.trim()
        if (!text) return

        try {
            await addNote(ideaId, { text })
            noteText.value = ''
            showToast('Note added')
            // Notes automatically refresh via subscription
        } catch (error) {
            showToast('Failed to add note', { tone: 'error' })
        }
    })

    // Ctrl+Enter to submit
    noteText.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            submitBtn.click()
        }
    })
}
```

### Edit Note

```javascript
function setupEditNote(row, ideaId, noteId, currentText) {
    const editBtn = row.querySelector('.swipe-btn--edit')

    editBtn.addEventListener('click', async () => {
        // Transform row into edit mode
        const textarea = document.createElement('textarea')
        textarea.value = currentText
        textarea.maxLength = 5000

        const saveBtn = document.createElement('button')
        saveBtn.className = 'thread-note-save'
        saveBtn.textContent = 'Save'

        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'thread-note-cancel'
        cancelBtn.textContent = 'Cancel'

        row.innerHTML = ''
        row.appendChild(textarea)
        row.appendChild(saveBtn)
        row.appendChild(cancelBtn)

        saveBtn.addEventListener('click', async () => {
            const newText = textarea.value.trim()
            if (newText) {
                try {
                    await updateNoteText(ideaId, noteId, newText)
                    showToast('Note updated')
                    // Notes refresh via subscription
                } catch (error) {
                    showToast('Failed to update note', { tone: 'error' })
                }
            }
        })

        cancelBtn.addEventListener('click', () => {
            renderNotes(currentNotes) // Re-render
        })

        textarea.focus()
    })
}
```

### Delete Note

```javascript
function setupDeleteNote(row, ideaId, noteId) {
    const deleteBtn = row.querySelector('.swipe-btn--delete')

    deleteBtn.addEventListener('click', async () => {
        if (!confirm('Delete this note?')) return

        try {
            await deleteNote(ideaId, noteId)
            showToast('Note deleted', {
                timeout: 5000,
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        // TODO: Restore from backup
                    }
                }
            })
        } catch (error) {
            showToast('Failed to delete note', { tone: 'error' })
        }
    })
}
```

## Swipe Gestures

Swipe left/right on notes:

```javascript
function attachSwipeGestures() {
    const rows = threadNotes.querySelectorAll('.thread-note-row')

    rows.forEach(row => {
        let startX = 0

        row.addEventListener('pointerdown', (e) => {
            startX = e.clientX
        })

        row.addEventListener('pointermove', (e) => {
            const deltaX = e.clientX - startX

            if (deltaX < -60) {
                row.classList.add('swipe-left')
            } else if (deltaX > 60) {
                row.classList.add('swipe-right')
            } else {
                row.classList.remove('swipe-left', 'swipe-right')
            }
        })

        row.addEventListener('pointerup', (e) => {
            row.classList.remove('swipe-left', 'swipe-right')
        })
    })
}
```

## Styling

```css
.thread-note-row {
    position: relative;
    display: flex;
    overflow: hidden;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    padding: 12px;
}

.thread-note {
    flex: 1;
}

.thread-note-text {
    margin-bottom: 8px;
    word-break: break-word;
}

.thread-note-meta {
    font-size: 12px;
    color: var(--md-sys-color-on-surface-variant);
}

.swipe-actions {
    position: absolute;
    right: -60px;
    top: 0;
    height: 100%;
    display: flex;
    background: var(--md-sys-color-error-container);
    transition: right 0.2s ease;
}

.thread-note-row.swipe-left .swipe-actions {
    right: 0;
}

.swipe-btn {
    background: transparent;
    border: none;
    color: var(--md-sys-color-error);
    cursor: pointer;
    width: 30px;
    padding: 0;
}
```

## Security (firestore.rules)

```javascript
match /comments/{commentId} {
    function ownsParentIdea() {
        return isSignedIn() &&
            get(/databases/$(database)/documents/ideas/$(ideaId)).data.userId == request.auth.uid;
    }

    allow read: if ownsParentIdea();
    allow create: if ownsParentIdea()
        && validStringLength(request.resource.data.text, 5000)
        && request.resource.data.keys().hasAll(['userId', 'text', 'createdAt']);
    allow update: if ownsParentIdea()
        && validStringLength(request.resource.data.text, 5000)
        && request.resource.data.userId == resource.data.userId;
    allow delete: if ownsParentIdea();
}
```

Only the idea owner can manage all comments on their ideas.

## Real-time Updates

Notes automatically refresh via subscriptions:

```javascript
const unsubscribe = subscribeToNotes(ideaId, (notes) => {
    renderNotes(notes)
})

// When component unmounts
window.addEventListener('beforeunload', () => {
    unsubscribe()
})
```

## Known Limitations

- [ ] Mention users with @ not supported
- [ ] Threaded replies (nested comments) not supported
- [ ] Rich text formatting not supported
- [ ] Reactions/emojis not supported
- [ ] Undo on delete not fully implemented

## Related Skills

- [Idea Capture](./capture.md)
- [Storage & Sync](./storage.md)
- [Canvas System](./canvas.md)
