/**
 * Canvas Selection — marquee (lasso) selection for desktop.
 *
 * On desktop, primary click+drag on empty canvas draws a selection rectangle.
 * Selected cards/headers get `.is-selected` and can be moved as a group.
 * On mobile this is a no-op — touch panning is handled by the engine.
 */

export function createSelectionManager(viewportEl, surfaceEl, engine, options = {}) {
    const selectedItems = new Set(); // DOM elements

    // Marquee state
    let marqueeEl = null;
    let isMarquee = false;
    let marqueePointerId = null;
    let marqueeStartX = 0;
    let marqueeStartY = 0;

    // Group drag state
    let isGroupDrag = false;
    let groupDragPointerId = null;
    let groupDragStartX = 0;
    let groupDragStartY = 0;
    let groupDragStartPositions = new Map(); // element → { x, y }

    // ── Marquee selection ────────────────────────────────────────

    function onPointerDown(e) {
        if (!engine.isDesktop()) return;

        // Only primary button on empty canvas space
        if (e.button !== 0) return;
        if (e.target !== viewportEl && e.target !== surfaceEl) return;

        // Space+click is for panning — don't start marquee
        if (engine.isSpaceHeld()) return;

        // Start marquee
        isMarquee = true;
        marqueePointerId = e.pointerId;
        marqueeStartX = e.clientX;
        marqueeStartY = e.clientY;

        viewportEl.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
        if (isMarquee && e.pointerId === marqueePointerId) {
            const dx = Math.abs(e.clientX - marqueeStartX);
            const dy = Math.abs(e.clientY - marqueeStartY);

            // Only show marquee after a small threshold to distinguish from click
            if (!marqueeEl && (dx > 4 || dy > 4)) {
                marqueeEl = document.createElement('div');
                marqueeEl.className = 'canvas-marquee';
                viewportEl.appendChild(marqueeEl);
            }

            if (marqueeEl) {
                const rect = viewportEl.getBoundingClientRect();
                const left = Math.min(marqueeStartX, e.clientX) - rect.left;
                const top = Math.min(marqueeStartY, e.clientY) - rect.top;
                const width = Math.abs(e.clientX - marqueeStartX);
                const height = Math.abs(e.clientY - marqueeStartY);

                marqueeEl.style.left = `${left}px`;
                marqueeEl.style.top = `${top}px`;
                marqueeEl.style.width = `${width}px`;
                marqueeEl.style.height = `${height}px`;
            }
            return;
        }

        if (isGroupDrag && e.pointerId === groupDragPointerId) {
            const zoom = engine.getState().zoom;
            const dx = (e.clientX - groupDragStartX) / zoom;
            const dy = (e.clientY - groupDragStartY) / zoom;

            groupDragStartPositions.forEach((startPos, el) => {
                el.style.transform = `translate(${startPos.x + dx}px, ${startPos.y + dy}px)`;
            });
            return;
        }
    }

    function onPointerUp(e) {
        if (isMarquee && e.pointerId === marqueePointerId) {
            if (marqueeEl) {
                // Compute selection from marquee rectangle
                selectItemsInMarquee(e);
                marqueeEl.remove();
                marqueeEl = null;
            } else {
                // Was a click (no drag) — deselect all
                deselectAll();
            }

            isMarquee = false;
            marqueePointerId = null;
            try { viewportEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            return;
        }

        if (isGroupDrag && e.pointerId === groupDragPointerId) {
            finishGroupDrag();
            return;
        }
    }

    function onPointerCancel(e) {
        if (isMarquee && e.pointerId === marqueePointerId) {
            if (marqueeEl) { marqueeEl.remove(); marqueeEl = null; }
            isMarquee = false;
            marqueePointerId = null;
        }
        if (isGroupDrag && e.pointerId === groupDragPointerId) {
            finishGroupDrag();
        }
    }

    function selectItemsInMarquee(e) {
        const viewRect = viewportEl.getBoundingClientRect();
        const { panX, panY, zoom } = engine.getState();

        // Marquee bounds in viewport-relative pixels
        const mLeft = Math.min(marqueeStartX, e.clientX) - viewRect.left;
        const mTop = Math.min(marqueeStartY, e.clientY) - viewRect.top;
        const mRight = Math.max(marqueeStartX, e.clientX) - viewRect.left;
        const mBottom = Math.max(marqueeStartY, e.clientY) - viewRect.top;

        // Convert marquee to surface coordinates
        const surfLeft = (mLeft - panX) / zoom;
        const surfTop = (mTop - panY) / zoom;
        const surfRight = (mRight - panX) / zoom;
        const surfBottom = (mBottom - panY) / zoom;

        deselectAll();

        // Check cards
        surfaceEl.querySelectorAll('.canvas-card, .canvas-header').forEach(el => {
            const pos = parseTranslate(el);
            const w = el.offsetWidth;
            const h = el.offsetHeight;

            // Check if element rect intersects with marquee rect
            if (pos.x + w > surfLeft && pos.x < surfRight &&
                pos.y + h > surfTop && pos.y < surfBottom) {
                selectItem(el);
            }
        });
    }

    // ── Selection management ─────────────────────────────────────

    function selectItem(el) {
        selectedItems.add(el);
        el.classList.add('is-selected');
        options.onSelectionChange?.(selectedItems.size);
    }

    function deselectItem(el) {
        if (!selectedItems.has(el)) return;
        selectedItems.delete(el);
        el.classList.remove('is-selected');
        options.onSelectionChange?.(selectedItems.size);
    }

    function deselectAll() {
        selectedItems.forEach(el => el.classList.remove('is-selected'));
        selectedItems.clear();
        options.onSelectionChange?.(0);
    }

    function isSelected(el) {
        return selectedItems.has(el);
    }

    // ── Group drag ──────────────────────────────────────────────

    /**
     * Called by card/header drag handlers when a selected item starts dragging.
     * Returns true if group drag was initiated (caller should skip its own drag).
     */
    function startGroupDrag(e, triggerEl) {
        if (selectedItems.size < 2) return false;
        if (!selectedItems.has(triggerEl)) return false;

        isGroupDrag = true;
        groupDragPointerId = e.pointerId;
        groupDragStartX = e.clientX;
        groupDragStartY = e.clientY;
        groupDragStartPositions.clear();

        selectedItems.forEach(el => {
            groupDragStartPositions.set(el, parseTranslate(el));
            el.classList.add('is-dragging');
        });

        viewportEl.setPointerCapture(e.pointerId);
        return true;
    }

    function isGroupDragging() {
        return isGroupDrag;
    }

    function handleGroupDragMove(e) {
        if (!isGroupDrag || e.pointerId !== groupDragPointerId) return false;

        const zoom = engine.getState().zoom;
        const dx = (e.clientX - groupDragStartX) / zoom;
        const dy = (e.clientY - groupDragStartY) / zoom;

        groupDragStartPositions.forEach((startPos, el) => {
            el.style.transform = `translate(${startPos.x + dx}px, ${startPos.y + dy}px)`;
        });
        return true;
    }

    function finishGroupDrag() {
        if (!isGroupDrag) return;

        const movedItems = [];
        groupDragStartPositions.forEach((startPos, el) => {
            const pos = parseTranslate(el);
            const snapped = engine.snapToGrid(pos.x, pos.y);
            el.style.transform = `translate(${snapped.x}px, ${snapped.y}px)`;
            el.classList.remove('is-dragging');
            movedItems.push({ el, x: snapped.x, y: snapped.y });
        });

        try { viewportEl.releasePointerCapture(groupDragPointerId); } catch (_) { /* ignore */ }
        isGroupDrag = false;
        groupDragPointerId = null;
        groupDragStartPositions.clear();

        options.onGroupMoved?.(movedItems);
    }

    // ── Escape to deselect ──────────────────────────────────────

    function onKeyDown(e) {
        if (e.key === 'Escape' && selectedItems.size > 0) {
            deselectAll();
        }
    }

    // ── Helpers ──────────────────────────────────────────────────

    function parseTranslate(el) {
        const match = el.style.transform.match(/translate\(\s*([^,]+),\s*([^)]+)\)/);
        return {
            x: parseFloat(match?.[1]) || 0,
            y: parseFloat(match?.[2]) || 0,
        };
    }

    // ── Lifecycle ───────────────────────────────────────────────

    viewportEl.addEventListener('pointerdown', onPointerDown);
    viewportEl.addEventListener('pointermove', onPointerMove);
    viewportEl.addEventListener('pointerup', onPointerUp);
    viewportEl.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('keydown', onKeyDown);

    function destroy() {
        viewportEl.removeEventListener('pointerdown', onPointerDown);
        viewportEl.removeEventListener('pointermove', onPointerMove);
        viewportEl.removeEventListener('pointerup', onPointerUp);
        viewportEl.removeEventListener('pointercancel', onPointerCancel);
        document.removeEventListener('keydown', onKeyDown);
        if (marqueeEl) { marqueeEl.remove(); marqueeEl = null; }
        deselectAll();
    }

    return {
        deselectAll,
        isSelected,
        selectItem,
        deselectItem,
        startGroupDrag,
        isGroupDragging,
        handleGroupDragMove,
        finishGroupDrag,
        getSelectedItems: () => selectedItems,
        destroy,
    };
}
