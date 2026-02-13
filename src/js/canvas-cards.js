/**
 * Canvas Cards — category card with full idea-bubble components.
 *
 * Features:
 * - Immediate drag from card header (no hold delay)
 * - Full idea-bubble with swipe gestures (archive, edit, delete)
 * - Category chips, priority dots
 * - Resizable by dragging corner handles
 * - Snap-to-grid on drop
 */

import { getCategoryAppearance, escapeHtml, normalizeCategories, formatTime, extractTags, highlightTags } from '../lib/utils.js';
import { setIdeaArchived, setIdeaPinned, deleteIdea, updateIdeaText, updateIdeaPriority, saveIdea } from '../lib/storage.js';
import { initSwipeGestures, cleanupSwipeGestures } from './idea-bubble.js';
import { updateNoteCount } from './thread-notes.js';
import { showToast } from '../lib/toast.js';

const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 240;
const MAX_WIDTH = 600;
const DEFAULT_BODY_HEIGHT = 400;
const MIN_BODY_HEIGHT = 120;
const MAX_BODY_HEIGHT = 800;

const PRIORITY_BADGES = {
    'urgent': '🔴',
    'high': '🟠',
    'medium': '🟡',
    'low': '⚪',
    '': '⚫',
};

const PRIORITY_CYCLE = ['', 'urgent', 'high', 'medium', 'low'];

export function createCardManager(surfaceEl, engine, options = {}) {
    const dragStates = new WeakMap();
    const resizeStates = new WeakMap();
    let selectionManager = null;

    // ── Add Card ────────────────────────────────────────────────

    function addCard(categoryName, x, y, ideas, palette, savedWidth, savedBodyHeight) {
        const el = document.createElement('div');
        el.className = 'canvas-card';
        el.dataset.category = categoryName;
        el.style.transform = `translate(${x}px, ${y}px)`;

        const width = savedWidth || DEFAULT_WIDTH;
        el.style.width = `${width}px`;

        const appearance = getCategoryAppearance(categoryName, palette);

        el.innerHTML = `
            <div class="canvas-card__header">
                <span class="canvas-card__color ${escapeHtml(appearance.classes)}" ${appearance.style ? `style="${escapeHtml(appearance.style)}"` : ''}></span>
                <span class="canvas-card__title">${escapeHtml(categoryName)}</span>
                <button type="button" class="canvas-card__remove" aria-label="Remove ${escapeHtml(categoryName)} from canvas">&times;</button>
            </div>
            <div class="canvas-card__body">
                <div class="canvas-card__ideas"></div>
            </div>
            <div class="canvas-card__resize-handle canvas-card__resize-handle--se" data-resize="se"></div>
        `;

        // Apply saved body height
        const bodyEl = el.querySelector('.canvas-card__body');
        if (bodyEl && savedBodyHeight) {
            bodyEl.style.maxHeight = `${savedBodyHeight}px`;
        }

        // Populate with full idea-bubbles
        populateCardIdeas(el, categoryName, ideas, palette);

        // Remove button
        el.querySelector('.canvas-card__remove').addEventListener('click', (e) => {
            e.stopPropagation();
            cleanupCardSwipe(el);
            el.remove();
            options.onCardRemoved?.(categoryName);
        });

        // Drag from header only — immediate, no hold delay
        initCardDrag(el);

        // Resize from corner handle
        initCardResize(el);

        surfaceEl.appendChild(el);
        return el;
    }

    function removeCard(categoryName) {
        const el = surfaceEl.querySelector(`.canvas-card[data-category="${CSS.escape(categoryName)}"]`);
        if (el) {
            cleanupCardSwipe(el);
            el.remove();
        }
    }

    // ── Idea Bubbles ────────────────────────────────────────────

    function populateCardIdeas(cardEl, categoryName, ideas, palette) {
        const container = cardEl.querySelector('.canvas-card__ideas');
        if (!container) return;

        // Cleanup previous swipe gestures
        cleanupCardSwipe(cardEl);

        const lowerName = categoryName.trim().toLowerCase();
        const filtered = ideas.filter(idea => {
            if (idea.archived || idea.hidden) return false;
            const cats = idea.categories || (idea.category ? [idea.category] : []);
            return cats.some(c => c.trim().toLowerCase() === lowerName);
        });

        container.innerHTML = '';

        if (filtered.length === 0) {
            container.innerHTML = '<p class="canvas-card__empty">No ideas yet</p>';
            return;
        }

        filtered.forEach(idea => {
            const row = document.createElement('div');
            row.className = 'idea-row';
            row.dataset.id = idea.id;

            // Swipe action buttons (revealed on left swipe)
            const actions = document.createElement('div');
            actions.className = 'swipe-actions';
            actions.innerHTML = `
                <button type="button" class="swipe-btn swipe-btn--edit" data-edit-idea="${idea.id}" aria-label="Edit idea">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button type="button" class="swipe-btn swipe-btn--delete" data-del-idea="${idea.id}" aria-label="Delete idea">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            `;
            row.appendChild(actions);

            // Build full idea-bubble
            const bubble = buildIdeaBubble(idea, palette);
            row.appendChild(bubble);
            container.appendChild(row);

            // Show persistent note count badge
            updateNoteCount(bubble, idea.id);
        });

        // Init swipe gestures on the ideas container
        initSwipeGestures(container, {
            onEdit: (row, ideaId) => {
                openInlineEditor(row, ideaId);
            },
            onDelete: async (row, ideaId) => {
                if (!ideaId) return;
                if (!confirm('Delete this idea permanently?')) return;
                row.style.opacity = '0.5';
                row.style.pointerEvents = 'none';
                try {
                    await deleteIdea(ideaId);
                    showToast('Idea deleted', { timeout: 2000 });
                } catch (err) {
                    console.error('Failed to delete idea:', err);
                    row.style.opacity = '';
                    row.style.pointerEvents = '';
                    showToast('Failed to delete', { tone: 'error' });
                }
            },
            onArchive: async (row) => {
                const ideaId = row?.dataset?.id;
                if (!ideaId) return;
                row.style.opacity = '0.5';
                row.style.pointerEvents = 'none';
                try {
                    await setIdeaArchived(ideaId, true);
                    showToast('Idea archived', {
                        timeout: 5000,
                        action: {
                            label: 'Undo',
                            onClick: async () => {
                                try {
                                    await setIdeaArchived(ideaId, false);
                                    showToast('Restored', { timeout: 1500 });
                                } catch (undoErr) {
                                    console.error('Failed to undo archive:', undoErr);
                                    showToast('Failed to undo', { tone: 'error' });
                                }
                            }
                        }
                    });
                } catch (err) {
                    console.error('Failed to archive idea:', err);
                    row.style.opacity = '';
                    row.style.pointerEvents = '';
                    showToast('Failed to archive', { tone: 'error' });
                }
            },
        });

        // "+ Add Idea" button at bottom of list
        appendAddIdeaButton(container, categoryName);
    }

    function appendAddIdeaButton(container, categoryName) {
        const addRow = document.createElement('div');
        addRow.className = 'canvas-card__add-idea';
        addRow.innerHTML = '<button type="button" class="canvas-card__add-btn">+ Add idea</button>';

        const btn = addRow.querySelector('.canvas-card__add-btn');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openAddIdeaInput(addRow, categoryName);
        });

        container.appendChild(addRow);
    }

    function openAddIdeaInput(addRow, categoryName) {
        if (addRow.classList.contains('is-editing')) return;
        addRow.classList.add('is-editing');
        addRow.innerHTML = `
            <textarea class="canvas-card__add-input" placeholder="New idea..." rows="2"></textarea>
            <div class="canvas-card__add-actions">
                <button type="button" class="canvas-card__add-save">Add</button>
                <button type="button" class="canvas-card__add-cancel">Cancel</button>
            </div>
        `;

        const textarea = addRow.querySelector('.canvas-card__add-input');
        const saveBtn = addRow.querySelector('.canvas-card__add-save');
        const cancelBtn = addRow.querySelector('.canvas-card__add-cancel');

        textarea.focus();

        // Auto-scroll the card body to show the full input area
        const bodyEl = addRow.closest('.canvas-card__body');
        if (bodyEl) {
            requestAnimationFrame(() => { bodyEl.scrollTop = bodyEl.scrollHeight; });
        }

        const closeInput = () => {
            addRow.classList.remove('is-editing');
            addRow.innerHTML = '<button type="button" class="canvas-card__add-btn">+ Add idea</button>';
            addRow.querySelector('.canvas-card__add-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openAddIdeaInput(addRow, categoryName);
            });
        };

        const submitIdea = async () => {
            const text = textarea.value.trim();
            if (!text) { closeInput(); return; }

            saveBtn.disabled = true;
            textarea.disabled = true;

            try {
                const id = crypto.randomUUID?.() || `idea-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                const tags = extractTags(text);
                await saveIdea({
                    id,
                    text,
                    category: categoryName,
                    categories: [categoryName],
                    tags,
                    priority: '',
                    createdAt: Date.now()
                });
                showToast('Idea added', { timeout: 1500 });
                closeInput();
            } catch (err) {
                console.error('Failed to add idea:', err);
                showToast('Failed to add idea', { tone: 'error' });
                saveBtn.disabled = false;
                textarea.disabled = false;
            }
        };

        saveBtn.addEventListener('click', submitIdea);
        cancelBtn.addEventListener('click', closeInput);

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeInput();
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitIdea();
            }
        });
    }

    const PIN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l3.5 3.5h-2v6l2.5 2.5v1.5l-4-2.3-4 2.3v-1.5L10.5 13V7H8.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"></path></svg>`;
    const THREAD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-4.5L12 21l-2.5-3.5H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M8.5 9.5h7M8.5 13h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>`;

    function buildIdeaBubble(idea, palette) {
        const el = document.createElement('div');
        el.className = 'idea-bubble';
        if (idea.pinned) el.classList.add('is-pinned');
        if (idea.priority) el.classList.add(`priority-${idea.priority}`);

        const createdAt = Number(idea.createdAt) || 0;
        const olderThanDay = (Date.now() - createdAt) > 24 * 60 * 60 * 1000;
        const timeMarkup = olderThanDay
            ? `${new Date(createdAt).toLocaleDateString([], { month: '2-digit', day: '2-digit' })} ${formatTime(createdAt)}`
            : formatTime(createdAt);

        const currentPriority = idea.priority || '';
        const priorityEmoji = PRIORITY_BADGES[currentPriority] || '⚫';
        const priorityTitle = currentPriority
            ? `${currentPriority.charAt(0).toUpperCase() + currentPriority.slice(1)} priority - click to change`
            : 'No priority - click to set';

        el.innerHTML = `
            <div class="idea-body">
                <div class="idea-header">
                    <div class="category-chip-group" data-idea-id="${idea.id}">
                        <div class="category-chip-list"></div>
                    </div>
                    <div class="idea-meta">
                        <button type="button" class="priority-dot" data-id="${idea.id}" data-priority="${currentPriority}" title="${priorityTitle}" aria-label="${priorityTitle}">${priorityEmoji}</button>
                        <div class="idea-time">${timeMarkup}</div>
                    </div>
                </div>
                <p class="idea-text">${highlightTags(idea.text)}</p>
                <div class="idea-footer">
                    <div class="idea-actions">
                        <button type="button" class="idea-pin${idea.pinned ? ' is-active' : ''}" data-id="${idea.id}" data-pinned="${!!idea.pinned}" aria-pressed="${!!idea.pinned}" aria-label="${idea.pinned ? 'Unpin idea' : 'Pin idea'}">${PIN_ICON}</button>
                        <button type="button" class="idea-thread" data-thread-id="${idea.id}" aria-label="Toggle notes">${THREAD_ICON}</button>
                    </div>
                </div>
            </div>
        `;

        // Render category chips
        const chipList = el.querySelector('.category-chip-list');
        const categories = Array.isArray(idea.categories)
            ? idea.categories.filter(Boolean)
            : (idea.category ? [idea.category] : []);
        const normalized = normalizeCategories(categories);

        if (!normalized.length) {
            const chip = document.createElement('span');
            chip.className = 'category-chip uncategorized';
            chip.textContent = 'Uncategorized';
            chipList.appendChild(chip);
        } else {
            normalized.forEach(cat => {
                const appearance = getCategoryAppearance(cat, palette);
                const chip = document.createElement('span');
                chip.className = ['category-chip', appearance.classes].filter(Boolean).join(' ');
                if (appearance.style) {
                    appearance.style.split(';').forEach(rule => {
                        const [p, v] = rule.split(':');
                        if (p && v) chip.style.setProperty(p.trim(), v.trim());
                    });
                }
                chip.textContent = cat;
                chipList.appendChild(chip);
            });
        }

        // Priority dot cycling
        const priorityDot = el.querySelector('.priority-dot');
        if (priorityDot) {
            priorityDot.addEventListener('click', async (e) => {
                e.stopPropagation();
                const dot = e.currentTarget;
                const current = dot.dataset.priority || '';
                const idx = PRIORITY_CYCLE.indexOf(current);
                const next = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];

                dot.dataset.priority = next;
                dot.textContent = PRIORITY_BADGES[next] || '⚫';

                const bubble = dot.closest('.idea-bubble');
                if (bubble) {
                    PRIORITY_CYCLE.forEach(p => bubble.classList.remove(`priority-${p}`));
                    if (next) bubble.classList.add(`priority-${next}`);
                }

                try {
                    await updateIdeaPriority(dot.dataset.id, next);
                } catch (err) {
                    console.error('Failed to update priority:', err);
                }
            });
        }

        // Pin button
        const pinBtn = el.querySelector('.idea-pin');
        if (pinBtn) {
            pinBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                const isPinned = btn.dataset.pinned === 'true';
                btn.disabled = true;
                try {
                    await setIdeaPinned(btn.dataset.id, !isPinned);
                    btn.dataset.pinned = String(!isPinned);
                    btn.setAttribute('aria-pressed', String(!isPinned));
                    btn.classList.toggle('is-active', !isPinned);
                    showToast(isPinned ? 'Unpinned' : 'Pinned!', { timeout: 1200 });
                } catch (err) {
                    console.error('Failed to pin idea:', err);
                }
                btn.disabled = false;
            });
        }

        return el;
    }

    // ── Inline Editor ───────────────────────────────────────────

    function openInlineEditor(row, ideaId) {
        const bubble = row.querySelector('.idea-bubble');
        if (!bubble || bubble.querySelector('.inline-edit')) return;

        const textEl = bubble.querySelector('.idea-text');
        if (!textEl) return;

        const originalText = textEl.textContent;
        const editor = document.createElement('div');
        editor.className = 'inline-edit';
        editor.innerHTML = `
            <textarea class="inline-edit__input" rows="3">${escapeHtml(originalText)}</textarea>
            <div class="inline-edit__actions">
                <button type="button" class="inline-edit__save" data-save-idea="${ideaId}">Save</button>
                <button type="button" class="inline-edit__cancel" data-cancel-edit>Cancel</button>
            </div>
        `;

        textEl.hidden = true;
        textEl.after(editor);

        const textarea = editor.querySelector('textarea');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        editor.querySelector('[data-save-idea]').addEventListener('click', async () => {
            const newText = textarea.value.trim();
            if (!newText || newText === originalText) {
                closeInlineEditor(row);
                return;
            }
            try {
                const tags = extractTags(newText);
                await updateIdeaText(ideaId, newText, tags);
                textEl.innerHTML = highlightTags(newText);
                showToast('Saved', { timeout: 1500 });
            } catch (err) {
                console.error('Failed to update idea:', err);
                showToast('Failed to save', { tone: 'error' });
            }
            closeInlineEditor(row);
        });

        editor.querySelector('[data-cancel-edit]').addEventListener('click', () => {
            closeInlineEditor(row);
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeInlineEditor(row);
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                editor.querySelector('[data-save-idea]').click();
            }
        });
    }

    function closeInlineEditor(row) {
        const bubble = row.querySelector('.idea-bubble');
        const editor = bubble?.querySelector('.inline-edit');
        const textEl = bubble?.querySelector('.idea-text');
        if (editor) editor.remove();
        if (textEl) textEl.hidden = false;
    }

    function cleanupCardSwipe(cardEl) {
        const container = cardEl.querySelector('.canvas-card__ideas');
        if (container) cleanupSwipeGestures(container);
    }

    // ── Update all cards ────────────────────────────────────────

    function updateAllCards(ideas, palette) {
        const cards = surfaceEl.querySelectorAll('.canvas-card');
        cards.forEach(cardEl => {
            const categoryName = cardEl.dataset.category;
            if (categoryName) {
                populateCardIdeas(cardEl, categoryName, ideas, palette || {});
            }
        });
    }

    // ── Drag (header only, immediate — no hold delay) ───────────

    function initCardDrag(cardEl) {
        const headerEl = cardEl.querySelector('.canvas-card__header');
        if (!headerEl) return;

        const ds = {
            isDragging: false,
            pointerId: null,
            startX: 0,
            startY: 0,
            cardStartX: 0,
            cardStartY: 0,
        };
        dragStates.set(cardEl, ds);

        headerEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.canvas-card__remove')) return;
            if (!e.isPrimary) return;

            e.stopPropagation(); // prevent canvas pan/marquee

            // If part of a multi-selection, delegate to group drag
            if (selectionManager && selectionManager.startGroupDrag(e, cardEl)) {
                ds.isDragging = false; // group drag takes over
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

        headerEl.addEventListener('pointermove', (e) => {
            // Check if group drag is active
            if (selectionManager?.isGroupDragging()) {
                selectionManager.handleGroupDragMove(e);
                return;
            }
            if (!ds.isDragging || e.pointerId !== ds.pointerId) return;

            const zoom = engine.getState().zoom;
            const dx = (e.clientX - ds.startX) / zoom;
            const dy = (e.clientY - ds.startY) / zoom;
            cardEl.style.transform = `translate(${ds.cardStartX + dx}px, ${ds.cardStartY + dy}px)`;
        });

        headerEl.addEventListener('pointerup', (e) => {
            // Check if group drag is active
            if (selectionManager?.isGroupDragging()) {
                selectionManager.finishGroupDrag();
                return;
            }
            if (!ds.isDragging || e.pointerId !== ds.pointerId) return;

            const pos = parseTranslate(cardEl);
            const snapped = engine.snapToGrid(pos.x, pos.y);
            cardEl.style.transform = `translate(${snapped.x}px, ${snapped.y}px)`;

            try { headerEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            cardEl.classList.remove('is-dragging');
            ds.isDragging = false;
            ds.pointerId = null;

            options.onCardMoved?.(cardEl.dataset.category, snapped.x, snapped.y);
        });

        headerEl.addEventListener('pointercancel', (e) => {
            if (!ds.isDragging) return;
            try { headerEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            cardEl.classList.remove('is-dragging');
            ds.isDragging = false;
            ds.pointerId = null;
        });
    }

    // ── Resize (SE corner handle) ───────────────────────────────

    function initCardResize(cardEl) {
        const handle = cardEl.querySelector('.canvas-card__resize-handle--se');
        if (!handle) return;

        const bodyEl = cardEl.querySelector('.canvas-card__body');

        const rs = {
            isResizing: false,
            pointerId: null,
            startX: 0,
            startY: 0,
            startWidth: 0,
            startBodyHeight: 0,
        };
        resizeStates.set(handle, rs);

        handle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (!e.isPrimary) return;

            rs.isResizing = true;
            rs.pointerId = e.pointerId;
            rs.startX = e.clientX;
            rs.startY = e.clientY;
            rs.startWidth = cardEl.offsetWidth;
            rs.startBodyHeight = bodyEl ? bodyEl.offsetHeight : DEFAULT_BODY_HEIGHT;

            handle.setPointerCapture(e.pointerId);
            cardEl.classList.add('is-resizing');
        });

        handle.addEventListener('pointermove', (e) => {
            if (!rs.isResizing || e.pointerId !== rs.pointerId) return;

            const zoom = engine.getState().zoom;
            const dx = (e.clientX - rs.startX) / zoom;
            const dy = (e.clientY - rs.startY) / zoom;

            const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, rs.startWidth + dx));
            cardEl.style.width = `${newWidth}px`;

            if (bodyEl) {
                const newHeight = Math.max(MIN_BODY_HEIGHT, Math.min(MAX_BODY_HEIGHT, rs.startBodyHeight + dy));
                bodyEl.style.maxHeight = `${newHeight}px`;
            }
        });

        handle.addEventListener('pointerup', (e) => {
            if (!rs.isResizing || e.pointerId !== rs.pointerId) return;

            try { handle.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            cardEl.classList.remove('is-resizing');
            rs.isResizing = false;
            rs.pointerId = null;

            // Snap width to grid
            const gridSize = engine.getGridSize();
            const rawWidth = cardEl.offsetWidth;
            const snappedWidth = Math.round(rawWidth / gridSize) * gridSize;
            const finalWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, snappedWidth));
            cardEl.style.width = `${finalWidth}px`;

            // Snap body height to grid
            let finalBodyHeight = null;
            if (bodyEl) {
                const rawHeight = bodyEl.offsetHeight;
                const snappedHeight = Math.round(rawHeight / gridSize) * gridSize;
                finalBodyHeight = Math.max(MIN_BODY_HEIGHT, Math.min(MAX_BODY_HEIGHT, snappedHeight));
                bodyEl.style.maxHeight = `${finalBodyHeight}px`;
            }

            options.onCardResized?.(cardEl.dataset.category, finalWidth, finalBodyHeight);
        });

        handle.addEventListener('pointercancel', (e) => {
            if (!rs.isResizing) return;
            try { handle.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            cardEl.classList.remove('is-resizing');
            rs.isResizing = false;
            rs.pointerId = null;
        });
    }

    function parseTranslate(el) {
        const match = el.style.transform.match(/translate\(\s*([^,]+),\s*([^)]+)\)/);
        return {
            x: parseFloat(match?.[1]) || 0,
            y: parseFloat(match?.[2]) || 0,
        };
    }

    // ── Lifecycle ───────────────────────────────────────────────

    function destroy() {
        const cards = surfaceEl.querySelectorAll('.canvas-card');
        cards.forEach(cardEl => cleanupCardSwipe(cardEl));
    }

    return {
        addCard,
        removeCard,
        updateAllCards,
        setSelectionManager: (sm) => { selectionManager = sm; },
        destroy,
    };
}
