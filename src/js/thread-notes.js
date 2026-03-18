/**
 * Thread Notes Module
 * X.com-style inline expandable notes for ideas
 * Supports inline expansion on mobile and detail pane on desktop
 */

import { subscribeToNotes, addNote, getNoteCount, getNotesFromLocal, deleteNote, updateNoteText } from '../lib/storage.js';
import { escapeHtml, formatTime } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';
import { initSwipeGestures, cleanupSwipeGestures } from './idea-bubble.js';
import { showConfirmDialog } from '../lib/confirm-dialog.js';

// State per idea: Map<ideaId, { isOpen, notes, unsubscribe, container }>
const threadStates = new Map();

// Track if module is initialized
let isInitialized = false;

// Desktop breakpoint (matches CSS)
const DESKTOP_BREAKPOINT = 1024;

// Detail pane state
let detailPaneState = {
    selectedIdeaId: null,
    detailPane: null,
    detailContent: null,
    closeBtn: null,
    clonedBubble: null
};

// Icons
const sendIcon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;

/**
 * Check if we're in desktop mode
 */
function isDesktop() {
    return window.innerWidth >= DESKTOP_BREAKPOINT;
}

/**
 * Initialize the thread notes module
 */
export function initThreadNotes() {
    if (isInitialized) return;
    isInitialized = true;

    // Add global styles if not already present
    if (!document.getElementById('thread-notes-styles')) {
        const style = document.createElement('style');
        style.id = 'thread-notes-styles';
        style.textContent = getThreadNotesStyles();
        document.head.appendChild(style);
    }

    // Setup detail pane references
    detailPaneState.detailPane = document.getElementById('detailPane');
    detailPaneState.detailContent = document.getElementById('detailContent');
    detailPaneState.closeBtn = document.querySelector('.detail-pane__close');

    // Bind close button
    detailPaneState.closeBtn?.addEventListener('click', closeDetailPane);

    // Handle resize - if switching from desktop to mobile, close detail pane
    window.addEventListener('resize', () => {
        if (!isDesktop() && detailPaneState.selectedIdeaId) {
            closeDetailPane();
        }
    });

    // Fix iOS Safari zoom: reset viewport scale when keyboard closes
    if (window.visualViewport) {
        let lastScale = 1;
        window.visualViewport.addEventListener('resize', () => {
            const currentScale = window.visualViewport.scale;
            // Keyboard closed — scale went back toward 1 but page is still zoomed
            if (lastScale > 1 && currentScale <= 1) {
                // Reset any residual pinch-zoom the keyboard caused
                const meta = document.querySelector('meta[name="viewport"]');
                if (meta) {
                    const original = meta.getAttribute('content');
                    meta.setAttribute('content', original + ', maximum-scale=1');
                    requestAnimationFrame(() => {
                        meta.setAttribute('content', original);
                    });
                }
            }
            lastScale = currentScale;
        });
    }
}

/**
 * Attach thread functionality to an idea element
 * @param {HTMLElement} ideaEl - The idea card element
 * @param {string} ideaId - The idea ID
 */
export function attachThread(ideaEl, ideaId) {
    if (!ideaEl || !ideaId) return;

    // Check if already attached
    if (ideaEl.dataset.threadAttached === 'true') return;
    ideaEl.dataset.threadAttached = 'true';

    // Create the thread container (hidden by default)
    const threadContainer = document.createElement('div');
    threadContainer.className = 'thread-notes';
    threadContainer.dataset.threadContainer = ideaId;
    threadContainer.innerHTML = `
        <div class="thread-notes-content" data-thread-content="${ideaId}"></div>
        <div class="thread-input-row">
            <textarea
                class="thread-input"
                placeholder="Add a note..."
                rows="1"
                data-thread-input="${ideaId}"
                aria-label="Add a note to this idea"
            ></textarea>
            <button 
                type="button" 
                class="thread-send-btn" 
                data-thread-send="${ideaId}"
                aria-label="Add note"
            >${sendIcon}</button>
        </div>
    `;

    // Find the idea body and append after it
    const ideaBody = ideaEl.querySelector('.idea-body');
    if (ideaBody) {
        ideaBody.after(threadContainer);
    } else {
        ideaEl.appendChild(threadContainer);
    }

    // Initialize state
    threadStates.set(ideaId, {
        isOpen: false,
        notes: getNotesFromLocal(ideaId),
        unsubscribe: null,
        container: threadContainer
    });

    // Update the thread button note count
    updateNoteCount(ideaEl, ideaId);

    // Bind events
    bindThreadEvents(ideaEl, ideaId);
}

/**
 * Update the note count badge on the thread button
 */
export function updateNoteCount(ideaEl, ideaId) {
    const count = getNoteCount(ideaId);
    const btn = ideaEl.querySelector(`.idea-thread[data-thread-id="${ideaId}"]`);
    if (!btn) return;

    btn.dataset.count = count.toString();
    btn.title = count > 0 ? `${count} note${count !== 1 ? 's' : ''}` : 'Add notes';
    btn.setAttribute('aria-label', count > 0 ? `Thread notes (${count})` : 'Thread notes');

    // Update or create inline badge span
    let badge = btn.querySelector('.thread-count-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'thread-count-badge';
            btn.appendChild(badge);
        }
        badge.textContent = count;
    } else if (badge) {
        badge.remove();
    }
}

/**
 * Bind events for the thread container
 */
function bindThreadEvents(ideaEl, ideaId) {
    const state = threadStates.get(ideaId);
    if (!state) return;

    const { container } = state;
    const input = container.querySelector(`[data-thread-input="${ideaId}"]`);
    const sendBtn = container.querySelector(`[data-thread-send="${ideaId}"]`);

    // Auto-resize textarea
    input?.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Reset iOS zoom on blur (keyboard dismiss)
    input?.addEventListener('blur', () => {
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
            setTimeout(() => {
                window.scrollTo({ top: window.scrollY, behavior: 'instant' });
            }, 50);
        }
    });

    // Submit on Enter (without Shift)
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(ideaEl, ideaId);
        }
    });

    // Submit on button click
    sendBtn?.addEventListener('click', () => {
        handleSubmit(ideaEl, ideaId);
    });
}

/**
 * Handle note submission
 */
async function handleSubmit(ideaEl, ideaId) {
    const state = threadStates.get(ideaId);
    if (!state) return;

    const { container } = state;
    const input = container.querySelector(`[data-thread-input="${ideaId}"]`);
    const sendBtn = container.querySelector(`[data-thread-send="${ideaId}"]`);

    const text = input?.value?.trim();
    if (!text) return;

    // Disable while submitting
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    try {
        await addNote(ideaId, text);

        // Clear input on success
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }

        // Note count will update via subscription
    } catch (error) {
        console.error('[ThreadNotes] Failed to add note:', error);
        showToast('Failed to add note. Please try again.', { tone: 'error' });
    } finally {
        if (input) input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        input?.focus();
    }
}

/**
 * Open/expand a thread inline
 */
export function openThread(ideaId) {
    const state = threadStates.get(ideaId);
    if (!state || state.isOpen) return;

    state.isOpen = true;
    state.container.classList.add('is-open');

    // Show loading state
    const contentEl = state.container.querySelector(`[data-thread-content="${ideaId}"]`);
    if (contentEl) {
        contentEl.innerHTML = '<div class="thread-loading">Loading notes...</div>';
    }

    // Subscribe to notes
    state.unsubscribe = subscribeToNotes(
        ideaId,
        (notes) => {
            state.notes = notes;
            renderNotes(ideaId, notes);

            // Update button count
            const ideaEl = state.container.closest('.idea-bubble, .swipe-item, .idea-row');
            if (ideaEl) updateNoteCount(ideaEl, ideaId);
        },
        (error) => {
            console.error('[ThreadNotes] Subscription error:', error);
            if (contentEl) {
                contentEl.innerHTML = '<div class="thread-error">Unable to load notes</div>';
            }
        }
    );

    // Focus input
    const input = state.container.querySelector(`[data-thread-input="${ideaId}"]`);
    setTimeout(() => input?.focus(), 100);
}

/**
 * Close/collapse a thread
 */
export function closeThread(ideaId) {
    const state = threadStates.get(ideaId);
    if (!state || !state.isOpen) return;

    state.isOpen = false;
    state.container.classList.remove('is-open');

    // Unsubscribe from Firestore
    if (state.unsubscribe) {
        state.unsubscribe();
        state.unsubscribe = null;
    }
}

/**
 * Open thread in the desktop detail pane
 * @param {string} ideaId - The idea ID
 * @param {HTMLElement} sourceEl - The source idea element to clone
 */
export function openInDetailPane(ideaId, sourceEl) {
    const { detailPane, detailContent } = detailPaneState;
    if (!detailPane || !detailContent || !sourceEl) return;

    // Close any existing selection
    if (detailPaneState.selectedIdeaId && detailPaneState.selectedIdeaId !== ideaId) {
        closeDetailPane();
    }

    // Find the idea bubble element
    const ideaBubble = sourceEl.classList.contains('idea-bubble')
        ? sourceEl
        : sourceEl.querySelector('.idea-bubble') || sourceEl;

    // Clone the bubble for the detail pane
    const clone = ideaBubble.cloneNode(true);
    clone.classList.remove('is-selected');
    clone.removeAttribute('data-thread-attached');

    // Clear the detail content and add clone
    detailContent.innerHTML = '';
    detailContent.appendChild(clone);

    // Attach thread to the cloned bubble
    attachThread(clone, ideaId);

    // Open thread immediately in detail pane
    const state = threadStates.get(ideaId);
    if (state) {
        openThread(ideaId);
    }

    // Mark as selected
    detailPaneState.selectedIdeaId = ideaId;
    detailPaneState.clonedBubble = clone;
    detailPane.classList.add('has-content');
    detailContent.hidden = false;

    // Add selected highlight to source
    ideaBubble.classList.add('is-selected');
    const swipeItem = sourceEl.closest('.swipe-item');
    if (swipeItem) swipeItem.classList.add('is-selected');
}

/**
 * Close the detail pane and deselect
 */
export function closeDetailPane() {
    const { detailPane, detailContent, selectedIdeaId } = detailPaneState;
    if (!detailPane) return;

    // Close thread subscription in detail pane
    if (selectedIdeaId) {
        closeThread(selectedIdeaId);
    }

    // Remove selected highlight from source
    document.querySelectorAll('.is-selected').forEach(el => {
        el.classList.remove('is-selected');
    });

    // Clear detail pane
    if (detailContent) {
        detailContent.innerHTML = '';
        detailContent.hidden = true;
    }
    detailPane.classList.remove('has-content');

    // Reset state
    detailPaneState.selectedIdeaId = null;
    detailPaneState.clonedBubble = null;
}

/**
 * Toggle thread open/closed
 * On desktop: Opens in detail pane
 * On mobile: Expands inline
 */
export function toggleThread(ideaId, sourceEl = null) {
    const state = threadStates.get(ideaId);
    if (!state) return;

    // On desktop, use detail pane
    if (isDesktop() && detailPaneState.detailPane) {
        // Find source element if not provided
        if (!sourceEl) {
            sourceEl = document.querySelector(`[data-thread-id="${ideaId}"]`)?.closest('.idea-bubble, .swipe-item, .idea-row');
        }

        if (detailPaneState.selectedIdeaId === ideaId) {
            closeDetailPane();
        } else {
            openInDetailPane(ideaId, sourceEl);
        }
        return;
    }

    // On mobile, use inline expansion
    if (state.isOpen) {
        closeThread(ideaId);
    } else {
        openThread(ideaId);
    }
}

/**
 * Render notes in the thread content area
 */
function renderNotes(ideaId, notes) {
    const state = threadStates.get(ideaId);
    if (!state) return;

    const contentEl = state.container.querySelector(`[data-thread-content="${ideaId}"]`);
    if (!contentEl) return;

    // Cleanup previous swipe gestures
    cleanupSwipeGestures(contentEl);

    if (!notes || notes.length === 0) {
        contentEl.innerHTML = '<div class="thread-empty">No notes yet. Add one below.</div>';
        return;
    }

    contentEl.innerHTML = '';

    notes.forEach(note => {
        const row = document.createElement('div');
        row.className = 'thread-note-row';
        row.dataset.id = note.id;
        row.dataset.noteId = note.id;
        row.dataset.ideaId = ideaId;
        if (note.pending) row.classList.add('is-pending');

        // Swipe action buttons (revealed on left swipe)
        const actions = document.createElement('div');
        actions.className = 'swipe-actions';
        actions.innerHTML = `
            <button type="button" class="swipe-btn swipe-btn--edit" data-edit-idea="${note.id}" aria-label="Edit note">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button type="button" class="swipe-btn swipe-btn--delete" data-del-idea="${note.id}" aria-label="Delete note">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        `;
        row.appendChild(actions);

        const noteEl = document.createElement('div');
        noteEl.className = 'thread-note';
        noteEl.innerHTML = `
            <div class="thread-note-text">${escapeHtml(note.text)}</div>
            <div class="thread-note-meta">${formatTime(note.createdAt)}</div>
        `;
        row.appendChild(noteEl);

        contentEl.appendChild(row);
    });

    // Init swipe gestures for edit/delete (no archive for notes)
    initSwipeGestures(contentEl, {
        onEdit: (row) => {
            const noteId = row?.dataset?.noteId;
            const rowIdeaId = row?.dataset?.ideaId;
            if (!noteId || !rowIdeaId) return;
            openNoteInlineEditor(row, rowIdeaId, noteId);
        },
        onDelete: async (row) => {
            const noteId = row?.dataset?.noteId;
            const rowIdeaId = row?.dataset?.ideaId;
            if (!noteId || !rowIdeaId) return;
            const confirmed = await showConfirmDialog('Delete this note?');
            if (!confirmed) return;
            row.style.opacity = '0.5';
            row.style.pointerEvents = 'none';
            try {
                await deleteNote(rowIdeaId, noteId);
                showToast('Note deleted', {
                    timeout: 5000,
                    action: {
                        label: 'Undo',
                        onClick: async () => {
                            // Re-add note (find from before-delete state if possible)
                            showToast('Cannot undo — note removed', { timeout: 2000 });
                        }
                    }
                });
            } catch (err) {
                console.error('Failed to delete note:', err);
                row.style.opacity = '';
                row.style.pointerEvents = '';
                showToast('Failed to delete note', { tone: 'error' });
            }
        },
    });

    // Scroll to bottom
    contentEl.scrollTop = contentEl.scrollHeight;
}

/**
 * Open inline editor for a thread note
 */
function openNoteInlineEditor(row, ideaId, noteId) {
    const noteEl = row.querySelector('.thread-note');
    if (!noteEl || noteEl.querySelector('.thread-note-inline-edit')) return;

    const textEl = noteEl.querySelector('.thread-note-text');
    if (!textEl) return;

    const originalText = textEl.textContent;
    const editor = document.createElement('div');
    editor.className = 'thread-note-inline-edit';
    editor.innerHTML = `
        <textarea class="thread-note-edit-input" rows="2" aria-label="Edit note text">${escapeHtml(originalText)}</textarea>
        <div class="thread-note-edit-actions">
            <button type="button" class="thread-note-edit-save">Save</button>
            <button type="button" class="thread-note-edit-cancel">Cancel</button>
        </div>
    `;

    textEl.hidden = true;
    textEl.after(editor);

    const textarea = editor.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const closeEditor = () => {
        editor.remove();
        textEl.hidden = false;
    };

    editor.querySelector('.thread-note-edit-save').addEventListener('click', async () => {
        const newText = textarea.value.trim();
        if (!newText || newText === originalText) { closeEditor(); return; }

        try {
            await updateNoteText(ideaId, noteId, newText);
            textEl.textContent = newText;
            showToast('Note updated', { timeout: 1500 });
        } catch (err) {
            console.error('Failed to update note:', err);
            showToast('Failed to update note', { tone: 'error' });
        }
        closeEditor();
    });

    editor.querySelector('.thread-note-edit-cancel').addEventListener('click', closeEditor);

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeEditor();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            editor.querySelector('.thread-note-edit-save').click();
        }
    });
}

/**
 * Get the inline CSS styles for thread notes
 */
function getThreadNotesStyles() {
    return `
        /* Inline Thread Notes (X.com style) */
        .thread-notes {
            margin-top: 0;
            border-top: 1px solid var(--md-sys-color-outline-variant);
            overflow: hidden;
            max-height: 0;
            opacity: 0;
            transition: max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease, padding 0.3s ease;
            padding: 0;
        }

        .thread-notes.is-open {
            max-height: 400px;
            opacity: 1;
            margin-top: 0.75rem;
            padding-top: 0.75rem;
        }

        .thread-notes-content {
            max-height: 250px;
            overflow-y: auto;
        }

        .thread-note {
            padding: 0.5rem 0;
            border-bottom: 1px solid var(--md-sys-color-outline-variant);
        }

        .thread-note:last-of-type {
            border-bottom: none;
        }

        .thread-note.is-pending {
            opacity: 0.6;
        }

        .thread-note-text {
            font-size: 0.875rem;
            line-height: 1.5;
            color: var(--md-sys-color-on-surface);
            white-space: pre-wrap;
            word-break: break-word;
        }

        .thread-note-meta {
            font-size: 0.7rem;
            color: var(--md-sys-color-on-surface-variant);
            margin-top: 0.25rem;
        }

        .thread-input-row {
            display: flex;
            gap: 0.5rem;
            margin-top: 0.75rem;
            align-items: flex-end;
        }

        .thread-input {
            flex: 1;
            background: var(--md-sys-color-surface-container);
            border: 1px solid var(--md-sys-color-outline-variant);
            border-radius: 1rem;
            padding: 0.6rem 1rem;
            color: inherit;
            font-family: inherit;
            font-size: 16px; /* Prevents iOS Safari auto-zoom on focus */
            resize: none;
            min-height: 38px;
            max-height: 120px;
        }

        .thread-input:focus {
            outline: none;
            border-color: var(--md-sys-color-primary);
            background: var(--md-sys-color-surface-container-high);
        }

        .thread-input:disabled {
            opacity: 0.6;
            cursor: wait;
        }

        .thread-send-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            flex-shrink: 0;
            transition: transform 0.15s ease, opacity 0.15s ease;
        }

        .thread-send-btn:hover {
            transform: scale(1.05);
        }

        .thread-send-btn:active {
            transform: scale(0.95);
        }

        .thread-send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .thread-loading,
        .thread-empty,
        .thread-error {
            font-size: 0.85rem;
            color: var(--md-sys-color-on-surface-variant);
            padding: 0.5rem 0;
            text-align: center;
        }

        .thread-error {
            color: var(--md-sys-color-error);
        }

        /* Thread button with inline note count */
        .idea-thread {
            position: relative;
            gap: 0.15rem;
        }

        /* When count is present, let button grow to fit */
        .idea-thread[data-count]:not([data-count="0"]) {
            width: auto;
            padding: 0.35rem 0.5rem 0.35rem 0.4rem;
        }

        .idea-thread .thread-count-badge {
            font-size: 0.65rem;
            font-weight: 700;
            color: var(--md-sys-color-primary);
            line-height: 1;
        }

        /* Swipeable thread note rows */
        .thread-note-row {
            position: relative;
            overflow: hidden;
            touch-action: pan-y;
        }

        .thread-note-row .swipe-actions {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            gap: 0;
            pointer-events: none;
            z-index: 1;
        }

        .thread-note-row .swipe-btn {
            width: 52px;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            cursor: pointer;
            color: var(--md-sys-color-on-primary);
        }

        .thread-note-row .swipe-btn--edit {
            background: var(--md-sys-color-primary);
        }

        .thread-note-row .swipe-btn--delete {
            background: var(--md-sys-color-error);
        }

        .thread-note-row .thread-note {
            position: relative;
            z-index: 2;
            background: inherit;
            transition: transform 0.2s ease;
        }

        .thread-note-row--open .thread-note {
            transform: translateX(-104px);
        }

        .thread-note-row--open .swipe-actions {
            pointer-events: auto;
        }

        .thread-note-row.is-pending {
            opacity: 0.6;
        }

        /* Thread note inline editor */
        .thread-note-inline-edit {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 4px 0;
        }

        .thread-note-edit-input {
            width: 100%;
            background: var(--md-sys-color-surface-container);
            border: 1px solid var(--md-sys-color-outline-variant);
            border-radius: 8px;
            padding: 8px 10px;
            color: inherit;
            font-family: inherit;
            font-size: 0.875rem;
            resize: none;
            min-height: 48px;
        }

        .thread-note-edit-input:focus {
            outline: none;
            border-color: var(--md-sys-color-primary);
        }

        .thread-note-edit-actions {
            display: flex;
            gap: 6px;
            justify-content: flex-end;
        }

        .thread-note-edit-actions button {
            padding: 4px 14px;
            border-radius: 999px;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            border: none;
        }

        .thread-note-edit-save {
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
        }

        .thread-note-edit-cancel {
            background: transparent;
            color: var(--md-sys-color-on-surface-variant);
            border: 1px solid var(--md-sys-color-outline-variant) !important;
        }
    `;
}

/**
 * Cleanup all thread subscriptions (call on page unload)
 */
export function cleanupThreadNotes() {
    threadStates.forEach((state, ideaId) => {
        if (state.unsubscribe) {
            state.unsubscribe();
        }
    });
    threadStates.clear();
}
