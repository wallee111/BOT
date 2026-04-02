// ── CSS imports ────────────────────────────────────────────────
import "../styles/main.css";
import "../styles/style.v1.css";
import "../styles/notes.css";

// ── Module imports ─────────────────────────────────────────────
import { storage } from '../lib/storage/index.js';
import { isDemo } from '../lib/demo/demo-mode.js';
import { getDemoStorage } from '../lib/demo/demo-storage.js';
const activeStorage = isDemo() ? getDemoStorage() : storage;
const { pageNotes, noteFolders } = activeStorage;
import { ensureAuthSession } from '../lib/auth.js';
import { showToast } from '../lib/toast.js';
import { showConfirmDialog } from '../lib/confirm-dialog.js';
import { escapeHtml } from '../lib/utils.js';

// ── DOM refs ───────────────────────────────────────────────────

const notesFoldersPanel   = document.getElementById('notesFoldersPanel');
const notesListPanel      = document.getElementById('notesListPanel');
const notesEditorPanel    = document.getElementById('notesEditorPanel');

const notesFolderList     = document.getElementById('notesFolderList');
const newFolderBtn        = document.getElementById('newFolderBtn');

const notesListBackBtn    = document.getElementById('notesListBackBtn');
const notesListTitle      = document.getElementById('notesListTitle');
const newNoteBtn          = document.getElementById('newNoteBtn');
const notesSearchInput    = document.getElementById('notesSearchInput');
const notesList           = document.getElementById('notesList');

const notesEditorBackBtn  = document.getElementById('notesEditorBackBtn');
const notesEditorFolder   = document.getElementById('notesEditorFolder');
const notesEditorDate     = document.getElementById('notesEditorDate');
const moveNoteBtn         = document.getElementById('moveNoteBtn');
const deleteNoteBtn       = document.getElementById('deleteNoteBtn');

const notesToolbar        = document.getElementById('notesToolbar');
const notesEditorBody     = document.getElementById('notesEditorBody');
const notesEditorTitle    = document.getElementById('notesEditorTitle');
const notesEditorContent  = document.getElementById('notesEditorContent');
const notesSaveStatus     = document.getElementById('notesSaveStatus');
const notesEditorEmpty    = document.getElementById('notesEditorEmpty');

const moveFolderMenu      = document.getElementById('moveFolderMenu');
const moveFolderMenuContent = document.getElementById('moveFolderMenuContent');

// ── State ──────────────────────────────────────────────────────

const state = {
    folders: [],
    notes: [],
    activeFolderId: null,  // null = "All Notes"
    activeNoteId: null,
    searchQuery: '',
    mobileView: 'folders', // 'folders' | 'list' | 'editor'
};

let isSaving = false;
let saveTimer = null;
let searchTimer = null;
let unsubscribeNotes = null;
let unsubscribeFolders = null;

// ── Helpers ────────────────────────────────────────────────────

function stripHtml(html = '') {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function formatDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
        return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getFolderName(folderId) {
    if (!folderId) return '';
    const f = state.folders.find(f => f.id === folderId);
    return f ? f.name : '';
}

function getFilteredNotes() {
    let notes = state.notes;

    // Filter by folder
    if (state.activeFolderId !== null) {
        notes = notes.filter(n => n.folderId === state.activeFolderId);
    }

    // Filter by search query
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
    notesFoldersPanel.removeAttribute('data-mobile-active');
    notesListPanel.removeAttribute('data-mobile-active');
    notesEditorPanel.removeAttribute('data-mobile-active');

    if (view === 'folders') {
        notesFoldersPanel.setAttribute('data-mobile-active', 'true');
    } else if (view === 'list') {
        notesListPanel.setAttribute('data-mobile-active', 'true');
    } else if (view === 'editor') {
        notesEditorPanel.setAttribute('data-mobile-active', 'true');
    }
}

// ── Render functions ───────────────────────────────────────────

function renderFolders() {
    const allCount = state.notes.length;
    let html = `
        <li class="notes-folder-item${state.activeFolderId === null ? ' is-active' : ''}"
            role="option"
            aria-selected="${state.activeFolderId === null}"
            data-folder-id="__all__"
            tabindex="0">
            <svg class="notes-folder-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
            <span class="notes-folder-item__name">All Notes</span>
            <span class="notes-folder-item__count">${allCount}</span>
        </li>
    `;

    for (const folder of state.folders) {
        const count = state.notes.filter(n => n.folderId === folder.id).length;
        const isActive = state.activeFolderId === folder.id;
        html += `
            <li class="notes-folder-item${isActive ? ' is-active' : ''}"
                role="option"
                aria-selected="${isActive}"
                data-folder-id="${escapeHtml(folder.id)}"
                tabindex="0"
                title="${escapeHtml(folder.name)}">
                <svg class="notes-folder-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span class="notes-folder-item__name">${escapeHtml(folder.name)}</span>
                <span class="notes-folder-item__count">${count}</span>
            </li>
        `;
    }

    notesFolderList.innerHTML = html;
}

function renderNotesList() {
    const filtered = getFilteredNotes();

    // Update panel title
    if (state.activeFolderId === null) {
        notesListTitle.textContent = 'All Notes';
    } else {
        notesListTitle.textContent = getFolderName(state.activeFolderId) || 'Notes';
    }

    if (filtered.length === 0) {
        notesList.innerHTML = `<li class="notes-list-empty">${state.searchQuery ? 'No notes match your search.' : 'No notes yet. Create one!'}</li>`;
        return;
    }

    let html = '';
    for (const note of filtered) {
        const isActive = note.id === state.activeNoteId;
        const title = note.title || 'Untitled';
        const snippet = stripHtml(note.content || '');
        const dateStr = formatDate(note.updatedAt || note.createdAt);
        const folderName = getFolderName(note.folderId);

        html += `
            <li class="notes-list-item${isActive ? ' is-active' : ''}"
                role="option"
                aria-selected="${isActive}"
                data-note-id="${escapeHtml(note.id)}"
                draggable="true"
                tabindex="0">
                <div class="notes-list-item__title">${escapeHtml(title)}</div>
                <div class="notes-list-item__snippet">${escapeHtml(snippet || 'No content')}</div>
                <div class="notes-list-item__meta">
                    <span>${escapeHtml(dateStr)}</span>
                    ${folderName ? `<span>· ${escapeHtml(folderName)}</span>` : ''}
                </div>
            </li>
        `;
    }
    notesList.innerHTML = html;
}

function renderEditor() {
    const note = state.notes.find(n => n.id === state.activeNoteId);

    if (!note) {
        notesEditorPanel.classList.remove('has-note');
        notesEditorEmpty.removeAttribute('aria-hidden');
        notesEditorContent.removeAttribute('data-note-id');
        notesEditorContent.removeAttribute('data-loaded');
        notesEditorTitle.removeAttribute('data-note-id');
        return;
    }

    notesEditorPanel.classList.add('has-note');
    notesEditorEmpty.setAttribute('aria-hidden', 'true');

    // Update meta
    const folderName = getFolderName(note.folderId);
    notesEditorFolder.textContent = folderName || '';
    notesEditorDate.textContent = note.updatedAt
        ? `Updated ${formatDate(note.updatedAt)}`
        : note.createdAt ? `Created ${formatDate(note.createdAt)}` : '';

    // Only update DOM if the content has changed or it's a different note
    const loadedNoteId = notesEditorContent.dataset.noteId;
    if (loadedNoteId !== note.id) {
        // Different note — replace content entirely
        notesEditorTitle.textContent = note.title || '';
        notesEditorContent.innerHTML = note.content || '';
        notesEditorContent.dataset.noteId = note.id;
        notesEditorTitle.dataset.noteId = note.id;
        notesEditorContent.dataset.loaded = '1';
    } else {
        // Same note — only update if not currently editing (avoid clobbering cursor)
        const focusedEl = document.activeElement;
        const isEditingTitle = focusedEl === notesEditorTitle;
        const isEditingContent = focusedEl === notesEditorContent;

        if (!isEditingTitle) {
            const currentTitle = notesEditorTitle.textContent;
            if (currentTitle !== (note.title || '')) {
                notesEditorTitle.textContent = note.title || '';
            }
        }
        if (!isEditingContent) {
            const currentContent = notesEditorContent.innerHTML;
            if (currentContent !== (note.content || '')) {
                notesEditorContent.innerHTML = note.content || '';
            }
        }
        // Refresh meta even when same note
        notesEditorDate.textContent = note.updatedAt
            ? `Updated ${formatDate(note.updatedAt)}`
            : note.createdAt ? `Created ${formatDate(note.createdAt)}` : '';
    }
}

// ── Save status ────────────────────────────────────────────────

function setSaveStatus(text) {
    notesSaveStatus.textContent = text;
}

// ── Auto-save ──────────────────────────────────────────────────

function scheduleSave() {
    clearTimeout(saveTimer);
    setSaveStatus('Saving…');
    saveTimer = setTimeout(async () => {
        const noteId = notesEditorContent.dataset.noteId;
        if (!noteId) return;

        const note = state.notes.find(n => n.id === noteId);
        if (!note) return;

        isSaving = true;
        try {
            await pageNotes.save({
                ...note,
                title: notesEditorTitle.textContent.trim(),
                content: notesEditorContent.innerHTML,
            });
            setSaveStatus('Saved');
            setTimeout(() => setSaveStatus(''), 2000);
        } catch (err) {
            console.error('[notes] auto-save error:', err);
            setSaveStatus('Offline — saved locally');
            setTimeout(() => setSaveStatus(''), 3000);
        } finally {
            isSaving = false;
        }
    }, 1000);
}

// ── Actions ────────────────────────────────────────────────────

function selectFolder(folderId) {
    state.activeFolderId = folderId === '__all__' ? null : folderId;
    renderFolders();
    renderNotesList();
    setMobileView('list');
}

function selectNote(noteId) {
    state.activeNoteId = noteId;
    renderNotesList();
    renderEditor();
    setMobileView('editor');
    // Focus title if new/empty, otherwise content
    requestAnimationFrame(() => {
        const note = state.notes.find(n => n.id === noteId);
        if (note && !note.title) {
            notesEditorTitle.focus();
        } else {
            notesEditorContent.focus();
        }
    });
}

async function createNote() {
    try {
        const newNote = await pageNotes.save({
            title: '',
            content: '',
            folderId: state.activeFolderId,
        });
        // Add to state immediately so renderEditor can find it
        // (subscription callback may not have fired yet)
        if (!state.notes.find(n => n.id === newNote.id)) {
            state.notes.unshift(newNote);
        }
        state.activeNoteId = newNote.id;
        renderNotesList();
        renderEditor();
        setMobileView('editor');
        requestAnimationFrame(() => notesEditorTitle.focus());
    } catch (err) {
        console.error('[notes] createNote error:', err);
        showToast('Could not create note', { tone: 'error' });
    }
}

async function deleteCurrentNote() {
    const noteId = state.activeNoteId;
    if (!noteId) return;

    const confirmed = await showConfirmDialog('Delete this note? This cannot be undone.');
    if (!confirmed) return;

    try {
        await pageNotes.delete(noteId);
        state.activeNoteId = null;
        notesEditorContent.removeAttribute('data-note-id');
        notesEditorContent.removeAttribute('data-loaded');
        notesEditorTitle.removeAttribute('data-note-id');
        renderNotesList();
        renderEditor();
        setMobileView('list');
        showToast('Note deleted');
    } catch (err) {
        console.error('[notes] deleteNote error:', err);
        showToast('Could not delete note', { tone: 'error' });
    }
}

async function createFolder() {
    const name = prompt('Folder name:');
    if (!name || !name.trim()) return;
    try {
        await noteFolders.save({ name: name.trim(), sortOrder: state.folders.length });
        showToast(`Folder "${name.trim()}" created`);
    } catch (err) {
        console.error('[notes] createFolder error:', err);
        showToast('Could not create folder', { tone: 'error' });
    }
}

async function renameFolder(folderId) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return;
    const newName = prompt('Rename folder:', folder.name);
    if (!newName || !newName.trim() || newName.trim() === folder.name) return;
    try {
        await noteFolders.save({ ...folder, name: newName.trim() });
        showToast(`Renamed to "${newName.trim()}"`);
    } catch (err) {
        console.error('[notes] renameFolder error:', err);
        showToast('Could not rename folder', { tone: 'error' });
    }
}

async function deleteFolderAction(folderId) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return;
    const confirmed = await showConfirmDialog(
        `Delete folder "${folder.name}"? Notes in this folder will be moved to All Notes.`
    );
    if (!confirmed) return;
    try {
        await noteFolders.delete(folderId);
        if (state.activeFolderId === folderId) {
            state.activeFolderId = null;
        }
        renderFolders();
        renderNotesList();
        showToast('Folder deleted');
    } catch (err) {
        console.error('[notes] deleteFolder error:', err);
        showToast('Could not delete folder', { tone: 'error' });
    }
}

function showMoveMenu() {
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (!note) return;

    // Build menu items
    let html = '';

    // "No folder" option
    html += `
        <button type="button" class="md3-menu__item${note.folderId === null ? ' is-active' : ''}"
                data-move-folder-id="__none__">
            No folder
        </button>
    `;

    for (const folder of state.folders) {
        html += `
            <button type="button" class="md3-menu__item${note.folderId === folder.id ? ' is-active' : ''}"
                    data-move-folder-id="${escapeHtml(folder.id)}">
                ${escapeHtml(folder.name)}
            </button>
        `;
    }

    moveFolderMenuContent.innerHTML = html;
    moveFolderMenu.removeAttribute('hidden');

    // Position near the button
    const rect = moveNoteBtn.getBoundingClientRect();
    moveFolderMenu.style.top = `${rect.bottom + 4}px`;
    moveFolderMenu.style.left = `${rect.left}px`;

    // Trigger open after removing hidden so the CSS transition plays
    requestAnimationFrame(() => moveFolderMenu.classList.add('is-open'));
    moveNoteBtn.setAttribute('aria-expanded', 'true');
}

function hideMoveMenu() {
    moveFolderMenu.classList.remove('is-open');
    // Wait for close transition before hiding
    setTimeout(() => moveFolderMenu.setAttribute('hidden', ''), 150);
    moveNoteBtn.setAttribute('aria-expanded', 'false');
}

async function moveNoteToFolder(targetFolderId) {
    const noteId = state.activeNoteId;
    if (!noteId) return;
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;

    const newFolderId = targetFolderId === '__none__' ? null : targetFolderId;
    hideMoveMenu();

    try {
        await pageNotes.save({ ...note, folderId: newFolderId });
        const folderName = getFolderName(newFolderId);
        showToast(folderName ? `Moved to "${folderName}"` : 'Moved to All Notes');
    } catch (err) {
        console.error('[notes] moveNote error:', err);
        showToast('Could not move note', { tone: 'error' });
    }
}

// ── Toolbar ─────────────────────────────────────────────────────

function insertChecklist() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const node = container.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : container;

    // Check if cursor is already inside a checklist item → toggle off
    const existingItem = node.closest('.notes-checklist-item');
    if (existingItem) {
        removeChecklistItem(existingItem);
        return;
    }

    // Find the current block element (div, p, or direct child of editor)
    let block = node;
    while (block && block !== notesEditorContent && block.parentElement !== notesEditorContent) {
        block = block.parentElement;
    }
    if (!block || block === notesEditorContent) {
        // Cursor is directly in the editor with no block wrapper — use the range container
        block = null;
    }

    // Create the checklist item
    const li = document.createElement('div');
    li.className = 'notes-checklist-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const span = document.createElement('span');
    span.setAttribute('contenteditable', 'true');

    if (block) {
        // Preserve existing text content from the current block
        span.innerHTML = block.innerHTML || '\u200B';
        li.appendChild(checkbox);
        li.appendChild(span);
        block.replaceWith(li);
    } else {
        span.innerHTML = '\u200B';
        li.appendChild(checkbox);
        li.appendChild(span);
        range.deleteContents();
        range.insertNode(li);
    }

    // Place cursor in span
    placeCursorInSpan(span);
}

function removeChecklistItem(item) {
    const span = item.querySelector('span');
    const text = span ? span.innerHTML : '';
    const div = document.createElement('div');
    // If the span only had a zero-width space, make it a true empty line
    div.innerHTML = (text === '\u200B' || text === '') ? '<br>' : text;
    item.replaceWith(div);

    // Place cursor in the new div
    const sel = window.getSelection();
    const newRange = document.createRange();
    if (div.firstChild) {
        if (div.firstChild.nodeType === Node.TEXT_NODE) {
            newRange.setStart(div.firstChild, div.firstChild.textContent.length);
        } else {
            newRange.setStart(div, 0);
        }
    } else {
        newRange.setStart(div, 0);
    }
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
}

function placeCursorInSpan(span) {
    const sel = window.getSelection();
    const newRange = document.createRange();
    // Place cursor at end of span content
    if (span.firstChild) {
        newRange.setStart(span.firstChild, span.firstChild.nodeType === Node.TEXT_NODE ? span.firstChild.textContent.length : 0);
    } else {
        newRange.setStart(span, 0);
    }
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
}

function handleChecklistEnter(e) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;

    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const node = container.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : container;

    const checklistItem = node.closest('.notes-checklist-item');
    if (!checklistItem) return false;

    e.preventDefault();

    const span = checklistItem.querySelector('span');
    const textContent = span ? span.textContent.replace(/\u200B/g, '').trim() : '';

    // If the current item is empty, remove it and exit checklist mode (double-Enter)
    if (!textContent) {
        removeChecklistItem(checklistItem);
        return true;
    }

    // Split content at cursor position: keep text before cursor in current item,
    // move text after cursor to new item
    const currentRange = sel.getRangeAt(0);
    let afterContent = '';
    if (span && span.contains(currentRange.startContainer)) {
        const afterRange = document.createRange();
        afterRange.setStart(currentRange.startContainer, currentRange.startOffset);
        afterRange.setEndAfter(span.lastChild || span);
        const fragment = afterRange.extractContents();
        const temp = document.createElement('div');
        temp.appendChild(fragment);
        afterContent = temp.innerHTML;
    }

    // Create new checklist item
    const newItem = document.createElement('div');
    newItem.className = 'notes-checklist-item';
    const newCheckbox = document.createElement('input');
    newCheckbox.type = 'checkbox';
    const newSpan = document.createElement('span');
    newSpan.setAttribute('contenteditable', 'true');
    newSpan.innerHTML = afterContent || '\u200B';
    newItem.appendChild(newCheckbox);
    newItem.appendChild(newSpan);

    // Insert after current item
    checklistItem.after(newItem);

    // Place cursor at start of new span
    const newRange = document.createRange();
    if (newSpan.firstChild) {
        newRange.setStart(newSpan.firstChild, 0);
    } else {
        newRange.setStart(newSpan, 0);
    }
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    return true;
}

function execToolbarCommand(cmd) {
    notesEditorContent.focus();

    switch (cmd) {
        case 'bold':
            document.execCommand('bold', false, null);
            break;
        case 'italic':
            document.execCommand('italic', false, null);
            break;
        case 'h1':
            document.execCommand('formatBlock', false, 'h1');
            break;
        case 'h2':
            document.execCommand('formatBlock', false, 'h2');
            break;
        case 'ul':
            document.execCommand('insertUnorderedList', false, null);
            break;
        case 'ol':
            document.execCommand('insertOrderedList', false, null);
            break;
        case 'checklist':
            insertChecklist();
            break;
        default:
            break;
    }

    // Trigger auto-save after formatting
    scheduleSave();
}

// ── Event wiring ───────────────────────────────────────────────

function wireEvents() {
    // New folder
    newFolderBtn.addEventListener('click', createFolder);

    // Folder list — click to select, right-click for context menu
    notesFolderList.addEventListener('click', (e) => {
        const item = e.target.closest('.notes-folder-item');
        if (!item) return;
        selectFolder(item.dataset.folderId);
    });

    notesFolderList.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const item = e.target.closest('.notes-folder-item');
        if (!item) return;
        e.preventDefault();
        selectFolder(item.dataset.folderId);
    });

    notesFolderList.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.notes-folder-item');
        if (!item) return;
        const folderId = item.dataset.folderId;
        if (folderId === '__all__') return;
        e.preventDefault();
        const action = prompt('Type "rename" or "delete":');
        if (!action) return;
        const normalized = action.trim().toLowerCase();
        if (normalized === 'rename') renameFolder(folderId);
        else if (normalized === 'delete') deleteFolderAction(folderId);
    });

    // New note
    newNoteBtn.addEventListener('click', createNote);

    // Notes list — click to select
    notesList.addEventListener('click', (e) => {
        const item = e.target.closest('.notes-list-item');
        if (!item) return;
        selectNote(item.dataset.noteId);
    });

    notesList.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const item = e.target.closest('.notes-list-item');
        if (!item) return;
        e.preventDefault();
        selectNote(item.dataset.noteId);
    });

    // Search with 300ms debounce
    notesSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.searchQuery = e.target.value.trim();
            renderNotesList();
        }, 300);
    });

    // Editor: title input triggers auto-save
    notesEditorTitle.addEventListener('input', () => {
        scheduleSave();
    });

    // Prevent Enter key in title (single line)
    notesEditorTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            notesEditorContent.focus();
        }
    });

    // Editor content: input triggers auto-save
    notesEditorContent.addEventListener('input', () => {
        scheduleSave();
    });

    // Checklist checkbox toggle (delegated)
    notesEditorContent.addEventListener('change', (e) => {
        if (e.target.type !== 'checkbox') return;
        const li = e.target.closest('.notes-checklist-item');
        if (!li) return;
        li.classList.toggle('is-checked', e.target.checked);
        scheduleSave();
    });

    // Toolbar buttons
    notesToolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('.notes-toolbar__btn');
        if (!btn) return;
        execToolbarCommand(btn.dataset.cmd);
    });

    // Keyboard shortcuts: Enter (checklist), Ctrl/Cmd+B, Ctrl/Cmd+I, Tab indent
    notesEditorContent.addEventListener('keydown', (e) => {
        // Enter inside checklist item → continue or exit checklist
        if (e.key === 'Enter' && !e.shiftKey) {
            if (handleChecklistEnter(e)) {
                scheduleSave();
                return;
            }
        }

        // Tab / Shift+Tab → indent / outdent (desktop only)
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                document.execCommand('outdent', false, null);
            } else {
                document.execCommand('indent', false, null);
            }
            scheduleSave();
            return;
        }

        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;
        if (e.key === 'b' || e.key === 'B') {
            e.preventDefault();
            execToolbarCommand('bold');
        } else if (e.key === 'i' || e.key === 'I') {
            e.preventDefault();
            execToolbarCommand('italic');
        }
    });

    notesEditorTitle.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;
        if (e.key === 'b' || e.key === 'B') {
            e.preventDefault();
            execToolbarCommand('bold');
        } else if (e.key === 'i' || e.key === 'I') {
            e.preventDefault();
            execToolbarCommand('italic');
        }
    });

    // Delete note
    deleteNoteBtn.addEventListener('click', deleteCurrentNote);

    // Move note button
    moveNoteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (moveFolderMenu.hasAttribute('hidden')) {
            showMoveMenu();
        } else {
            hideMoveMenu();
        }
    });

    // Move-to-folder menu items
    moveFolderMenuContent.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-move-folder-id]');
        if (!btn) return;
        moveNoteToFolder(btn.dataset.moveFolderId);
    });

    // Close move menu on outside click
    document.addEventListener('click', (e) => {
        if (!moveFolderMenu.hasAttribute('hidden') &&
            !moveFolderMenu.contains(e.target) &&
            e.target !== moveNoteBtn) {
            hideMoveMenu();
        }
    });

    // Mobile back buttons
    notesListBackBtn.addEventListener('click', () => setMobileView('folders'));
    notesEditorBackBtn.addEventListener('click', () => setMobileView('list'));

    // ── Drag-and-drop notes to folders (desktop only) ───────────
    notesList.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.notes-list-item');
        if (!item) return;
        e.dataTransfer.setData('text/plain', item.dataset.noteId);
        e.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => item.classList.add('is-dragging'));
    });

    notesList.addEventListener('dragend', (e) => {
        const item = e.target.closest('.notes-list-item');
        if (item) item.classList.remove('is-dragging');
        // Clean up any lingering drag-over highlights
        notesFolderList.querySelectorAll('.is-drag-over').forEach(el =>
            el.classList.remove('is-drag-over')
        );
    });

    notesFolderList.addEventListener('dragover', (e) => {
        const item = e.target.closest('.notes-folder-item');
        if (!item) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Highlight only the hovered folder
        notesFolderList.querySelectorAll('.is-drag-over').forEach(el =>
            el.classList.remove('is-drag-over')
        );
        item.classList.add('is-drag-over');
    });

    notesFolderList.addEventListener('dragleave', (e) => {
        const item = e.target.closest('.notes-folder-item');
        if (item && !item.contains(e.relatedTarget)) {
            item.classList.remove('is-drag-over');
        }
    });

    notesFolderList.addEventListener('drop', async (e) => {
        e.preventDefault();
        const item = e.target.closest('.notes-folder-item');
        if (!item) return;
        item.classList.remove('is-drag-over');

        const noteId = e.dataTransfer.getData('text/plain');
        if (!noteId) return;

        const note = state.notes.find(n => n.id === noteId);
        if (!note) return;

        const folderId = item.dataset.folderId;
        const newFolderId = (folderId === '__all__' || folderId === '__none__') ? null : folderId;

        if (note.folderId === newFolderId) return; // already in this folder

        try {
            await pageNotes.save({ ...note, folderId: newFolderId });
            const folderName = getFolderName(newFolderId);
            showToast(folderName ? `Moved to "${folderName}"` : 'Moved to All Notes');
        } catch (err) {
            console.error('[notes] drag-move error:', err);
            showToast('Could not move note', { tone: 'error' });
        }
    });
}

// ── Init ───────────────────────────────────────────────────────

async function init() {
    // Auth guard
    if (!isDemo()) {
        const user = await ensureAuthSession({ requireAuth: true });
        if (!user) {
            window.location.href = '/signin.html';
            return;
        }
    }

    if (isDemo()) {
        const { injectDemoBanner } = await import('../lib/demo/demo-mode.js');
        injectDemoBanner();
    }

    // Start with folders view on mobile
    setMobileView('folders');

    // Subscribe to folders
    unsubscribeFolders = noteFolders.subscribe((folders) => {
        state.folders = folders;
        renderFolders();
        renderNotesList();
        // Re-render editor meta in case folder name changed
        renderEditor();
    });

    // Subscribe to notes — skip editor re-render while saving
    unsubscribeNotes = pageNotes.subscribe((notes) => {
        state.notes = notes;
        renderFolders();
        renderNotesList();
        if (!isSaving) {
            renderEditor();
        }
    });

    wireEvents();
}

document.addEventListener('DOMContentLoaded', init);
