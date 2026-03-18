/**
 * Canvas Headers — editable text headers with pill navigation.
 *
 * Usage:
 *   const headers = createHeaderManager(surfaceEl, pillContainerEl, engine, { ... });
 *   headers.addHeader('hdr-1', 'Section Title', 400, 100);
 *   headers.destroy();
 */

import { escapeHtml } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';

export function createHeaderManager(surfaceEl, pillContainerEl, engine, options = {}) {
    const dragStates = new WeakMap();
    const viewportEl = surfaceEl.parentElement;
    let selectionManager = null;
    const LONG_PRESS_MS = 450;
    const LONG_PRESS_MOVE_TOLERANCE = 10;

    /** Track which header is currently "selected" (focused, drag-ready) */
    let selectedHeader = null;

    function addHeader(id, text, x, y) {
        // Create header element on canvas
        const el = document.createElement('div');
        el.className = 'canvas-header';
        el.dataset.headerId = id;
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', `${text} section header`);
        el.setAttribute('tabindex', '0');

        // Start with contenteditable OFF — text editing requires two clicks
        el.innerHTML = `
            <div class="canvas-header__text" contenteditable="false" spellcheck="false">${escapeHtml(text)}</div>
            <button type="button" class="canvas-header__delete" aria-label="Delete header">&times;</button>
        `;

        const textEl = el.querySelector('.canvas-header__text');
        const deleteBtn = el.querySelector('.canvas-header__delete');

        // Save text on blur and exit edit mode
        textEl.addEventListener('blur', () => {
            const newText = textEl.textContent.trim() || 'Header';
            textEl.textContent = newText;
            textEl.contentEditable = 'false';
            updatePillText(id, newText);
            options.onHeaderTextChanged?.(id, newText);
        });

        // Prevent Enter from creating new lines — blur instead
        textEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                textEl.blur();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                textEl.blur();
            }
        });

        // Delete
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            el.remove();
            removePill(id);
            if (selectedHeader === el) selectedHeader = null;
            options.onHeaderDeleted?.(id);
        });

        // Drag + selection
        initHeaderDrag(el, textEl);
        attachLongPressSelection(el, textEl);

        surfaceEl.appendChild(el);

        // Create pill
        addPill(id, text);

        return el;
    }

    function removeHeader(id) {
        const el = surfaceEl.querySelector(`.canvas-header[data-header-id="${CSS.escape(id)}"]`);
        if (el) el.remove();
        removePill(id);
    }

    // ── Pills ───────────────────────────────────────────────────

    function addPill(id, text) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'canvas-header-pill';
        pill.dataset.headerId = id;
        pill.textContent = text;
        pill.setAttribute('aria-label', `Navigate to ${text} section`);

        pill.addEventListener('click', () => navigateToHeader(id));
        pillContainerEl.appendChild(pill);
    }

    function removePill(id) {
        const pill = pillContainerEl.querySelector(`.canvas-header-pill[data-header-id="${CSS.escape(id)}"]`);
        if (pill) pill.remove();
    }

    function updatePillText(id, text) {
        const pill = pillContainerEl.querySelector(`.canvas-header-pill[data-header-id="${CSS.escape(id)}"]`);
        if (pill) {
            pill.textContent = text;
            pill.setAttribute('aria-label', `Navigate to ${text} section`);
        }
    }

    function navigateToHeader(id) {
        const headerEl = surfaceEl.querySelector(`.canvas-header[data-header-id="${CSS.escape(id)}"]`);
        if (!headerEl) return;

        const match = headerEl.style.transform.match(/translate\(\s*([^,]+),\s*([^)]+)\)/);
        const hx = parseFloat(match?.[1]) || 0;
        const hy = parseFloat(match?.[2]) || 0;

        const currentZoom = engine.getState().zoom;
        const pad = 24;
        const targetPanX = pad - hx * currentZoom;
        const targetPanY = pad - hy * currentZoom;

        engine.animateTo(targetPanX, targetPanY, currentZoom);
    }

    // ── Drag ────────────────────────────────────────────────────

    function parseTranslate(el) {
        const match = el.style.transform.match(/translate\(\s*([^,]+),\s*([^)]+)\)/);
        return {
            x: parseFloat(match?.[1]) || 0,
            y: parseFloat(match?.[2]) || 0,
        };
    }

    /**
     * Two-click interaction model:
     *   1st click  → select header (outline, drag-ready)
     *   drag       → move header (when selected)
     *   2nd click  → enter text editing mode (contenteditable on)
     *   click away → deselect
     */
    function initHeaderDrag(headerEl, textEl) {
        const ds = {
            isPointerDown: false,
            isDragging: false,
            didDrag: false,
            pointerId: null,
            startX: 0,
            startY: 0,
            headerStartX: 0,
            headerStartY: 0,
        };
        dragStates.set(headerEl, ds);

        headerEl.addEventListener('pointerdown', (e) => {
            // If currently editing text, let native behavior handle it
            if (textEl.contentEditable === 'true' && document.activeElement === textEl) return;
            if (e.target.closest('.canvas-header__delete')) return;
            if (!e.isPrimary) return;

            e.stopPropagation(); // prevent canvas pan/marquee

            const ds = dragStates.get(headerEl);
            if (!ds) return;

            // If part of a multi-selection, delegate to group drag
            if (selectionManager && selectionManager.startGroupDrag(e, headerEl)) {
                ds.isPointerDown = false;
                ds.pointerId = null;
                return;
            }

            ds.isPointerDown = true;
            ds.pointerId = e.pointerId;
            ds.startX = e.clientX;
            ds.startY = e.clientY;
            ds.didDrag = false;
            const pos = parseTranslate(headerEl);
            ds.headerStartX = pos.x;
            ds.headerStartY = pos.y;

            // If header is already selected, allow immediate drag
            if (selectedHeader === headerEl) {
                ds.isDragging = true;
                headerEl.setPointerCapture(e.pointerId);
                headerEl.classList.add('is-dragging');
            }
        });

        headerEl.addEventListener('pointermove', (e) => {
            // Check if group drag is active
            if (selectionManager?.isGroupDragging()) {
                selectionManager.handleGroupDragMove(e);
                return;
            }
            const ds = dragStates.get(headerEl);
            if (!ds || !ds.isPointerDown || e.pointerId !== ds.pointerId) return;

            // If not yet selected, check if user is dragging to select+drag in one motion
            if (!ds.isDragging && selectedHeader !== headerEl) {
                const moveThreshold = 6;
                if (Math.abs(e.clientX - ds.startX) > moveThreshold || Math.abs(e.clientY - ds.startY) > moveThreshold) {
                    // Select and start drag in one gesture
                    selectHeader(headerEl);
                    ds.isDragging = true;
                    headerEl.setPointerCapture(e.pointerId);
                    headerEl.classList.add('is-dragging');
                }
            }

            if (!ds.isDragging) return;

            ds.didDrag = true;
            const zoom = engine.getState().zoom;
            const dx = (e.clientX - ds.startX) / zoom;
            const dy = (e.clientY - ds.startY) / zoom;
            headerEl.style.transform = `translate(${ds.headerStartX + dx}px, ${ds.headerStartY + dy}px)`;
        });

        headerEl.addEventListener('pointerup', (e) => {
            // Check if group drag is active
            if (selectionManager?.isGroupDragging()) {
                selectionManager.finishGroupDrag();
                return;
            }
            const ds = dragStates.get(headerEl);
            if (!ds || e.pointerId !== ds.pointerId) return;

            ds.isPointerDown = false;

            if (ds.isDragging) {
                const pos = parseTranslate(headerEl);
                const snapped = engine.snapToGrid(pos.x, pos.y);
                headerEl.style.transform = `translate(${snapped.x}px, ${snapped.y}px)`;

                try { headerEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
                headerEl.classList.remove('is-dragging');
                ds.isDragging = false;

                if (ds.didDrag) {
                    ds.didDrag = false;
                    options.onHeaderMoved?.(headerEl.dataset.headerId, snapped.x, snapped.y);
                    return; // was a drag — don't enter edit mode
                }
            }

            // Tap (no drag) — handle selection / edit transitions
            ds.didDrag = false;

            if (selectedHeader === headerEl) {
                // Already selected → 2nd tap → enter edit mode
                enterEditMode(textEl);
            } else {
                // Not selected → 1st tap → select it
                selectHeader(headerEl);
            }
        });

        headerEl.addEventListener('pointercancel', (e) => {
            const ds = dragStates.get(headerEl);
            if (!ds || e.pointerId !== ds.pointerId) return;

            ds.isPointerDown = false;

            if (ds.isDragging) {
                try { headerEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
                headerEl.classList.remove('is-dragging');
                ds.isDragging = false;
            }
        });
    }

    function attachLongPressSelection(headerEl, textEl) {
        if (!headerEl) return;

        let timer = null;
        let startX = 0;
        let startY = 0;

        const clearTimer = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };

        headerEl.addEventListener('pointerdown', (e) => {
            if (!selectionManager) return;
            if (e.pointerType !== 'touch') return;
            if (textEl?.contentEditable === 'true') return;
            if (e.target.closest('.canvas-header__delete')) return;

            startX = e.clientX;
            startY = e.clientY;
            clearTimer();
            timer = setTimeout(() => {
                timer = null;
                const alreadySelected = selectionManager.isSelected(headerEl);
                if (alreadySelected) {
                    selectionManager.deselectItem?.(headerEl);
                    showToast('Removed from selection', { timeout: 900 });
                } else {
                    selectionManager.selectItem(headerEl);
                    if (navigator.vibrate) navigator.vibrate(10);
                    showToast('Selected for group move', { timeout: 900 });
                }
            }, LONG_PRESS_MS);
        });

        headerEl.addEventListener('pointermove', (e) => {
            if (!timer) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) {
                clearTimer();
            }
        });

        ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => {
            headerEl.addEventListener(evt, clearTimer);
        });
    }

    function selectHeader(headerEl) {
        // Deselect previous
        if (selectedHeader && selectedHeader !== headerEl) {
            selectedHeader.classList.remove('is-selected');
            const prevText = selectedHeader.querySelector('.canvas-header__text');
            if (prevText) {
                prevText.contentEditable = 'false';
                if (document.activeElement === prevText) prevText.blur();
            }
        }
        selectedHeader = headerEl;
        headerEl.classList.add('is-selected');
    }

    function deselectAll() {
        if (selectedHeader) {
            selectedHeader.classList.remove('is-selected');
            const textEl = selectedHeader.querySelector('.canvas-header__text');
            if (textEl) {
                textEl.contentEditable = 'false';
                if (document.activeElement === textEl) textEl.blur();
            }
            selectedHeader = null;
        }
    }

    function enterEditMode(textEl) {
        textEl.contentEditable = 'true';
        textEl.focus();
        // Place caret at end
        const range = document.createRange();
        range.selectNodeContents(textEl);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    // Deselect when clicking empty canvas space
    function onViewportPointerDown(e) {
        if (e.target === viewportEl || e.target === surfaceEl) {
            deselectAll();
        }
    }
    viewportEl.addEventListener('pointerdown', onViewportPointerDown);

    // ── Lifecycle ───────────────────────────────────────────────

    function destroy() {
        viewportEl.removeEventListener('pointerdown', onViewportPointerDown);
        pillContainerEl.innerHTML = '';
        selectedHeader = null;
    }

    return {
        addHeader,
        removeHeader,
        deselectAll,
        setSelectionManager: (sm) => { selectionManager = sm; },
        destroy,
    };
}
