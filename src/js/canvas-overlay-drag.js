/**
 * Canvas Add Overlay Drag Controller
 *
 * Allows users to tap-and-hold the drag handle to reposition the add overlay
 * along the left or right edges of the canvas viewport.
 *
 * WCAG Compliance:
 * - 2.5.1: Provides keyboard alternative (arrow keys) to gesture-based repositioning
 * - 2.5.2: Up-event activation prevents accidental drags
 * - 2.5.4: Motion alternatives provided via keyboard controls
 * - 4.1.3: Position changes announced via aria-live region
 */

export function createOverlayDragController(overlayEl, viewportEl) {
    if (!overlayEl || !viewportEl) return null;

    // ── State ────────────────────────────────────────────────────────
    let isDragging = false;
    let startY = 0;
    let currentSide = 'right'; // 'left' or 'right'
    let currentBottom = null; // distance from bottom in px
    let holdTimer = null;
    const HOLD_DURATION = 150; // ms to activate drag mode (reduced for better responsiveness)

    // Create drag handle
    const handle = document.createElement('div');
    handle.className = 'canvas-add-overlay__drag-handle';
    handle.setAttribute('role', 'button');
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('aria-label', 'Move toolbar. Tap and hold to reposition, or use arrow keys.');
    handle.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="8" cy="6" r="1.5" fill="currentColor"/>
            <circle cx="16" cy="6" r="1.5" fill="currentColor"/>
            <circle cx="8" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="16" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="8" cy="18" r="1.5" fill="currentColor"/>
            <circle cx="16" cy="18" r="1.5" fill="currentColor"/>
        </svg>
    `;
    overlayEl.insertBefore(handle, overlayEl.firstChild);

    // Create aria-live region for position announcements
    const announcer = document.createElement('div');
    announcer.className = 'sr-only';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(announcer);

    // ── Helpers ──────────────────────────────────────────────────────

    function getComputedBottom() {
        const styles = window.getComputedStyle(overlayEl);
        return parseInt(styles.bottom, 10) || 0;
    }

    function applySide(side) {
        currentSide = side;
        overlayEl.style.left = side === 'left' ? '16px' : 'auto';
        overlayEl.style.right = side === 'right' ? '16px' : 'auto';
        overlayEl.dataset.side = side;

        // Announce position change
        announcer.textContent = `Toolbar moved to ${side} side`;
    }

    function applyBottom(bottom) {
        currentBottom = bottom;
        overlayEl.style.bottom = `${bottom}px`;
    }

    function startDrag(clientY) {
        isDragging = true;
        startY = clientY;
        currentBottom = getComputedBottom();
        overlayEl.classList.add('is-dragging');
        handle.setAttribute('aria-pressed', 'true');

        // Announce drag start
        announcer.textContent = 'Drag mode active. Move toolbar up or down, then release.';
    }

    function handleMove(clientY) {
        if (!isDragging) return;

        // Move the overlay WITH the finger (positive clientY delta = moving down)
        const deltaY = clientY - startY;
        const newBottom = Math.max(100, Math.min(window.innerHeight - 120, currentBottom - deltaY));
        applyBottom(newBottom);
    }

    function endDrag(clientX) {
        if (!isDragging) return;

        isDragging = false;
        overlayEl.classList.remove('is-dragging');
        handle.setAttribute('aria-pressed', 'false');

        // Snap to nearest side based on final pointer X position
        const viewportRect = viewportEl.getBoundingClientRect();
        const centerX = viewportRect.left + viewportRect.width / 2;
        const newSide = clientX < centerX ? 'left' : 'right';

        if (newSide !== currentSide) {
            applySide(newSide);
        } else {
            announcer.textContent = `Toolbar position updated on ${currentSide} side`;
        }
    }

    // ── Pointer Events (Touch + Mouse) ──────────────────────────────

    handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Start hold timer
        holdTimer = setTimeout(() => {
            startDrag(e.clientY);
        }, HOLD_DURATION);
    });

    window.addEventListener('pointermove', (e) => {
        if (isDragging) {
            e.preventDefault();
            handleMove(e.clientY);
        }
    });

    window.addEventListener('pointerup', (e) => {
        // Clear hold timer if release before hold duration
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }

        if (isDragging) {
            e.preventDefault();
            endDrag(e.clientX);
        }
    });

    window.addEventListener('pointercancel', () => {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        if (isDragging) {
            isDragging = false;
            overlayEl.classList.remove('is-dragging');
            handle.setAttribute('aria-pressed', 'false');
            announcer.textContent = 'Drag cancelled';
        }
    });

    // ── Keyboard Controls (WCAG 2.5.1 alternative) ──────────────────

    handle.addEventListener('keydown', (e) => {
        const step = 40; // px per arrow key press
        const current = getComputedBottom();

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                applyBottom(Math.min(window.innerHeight - 120, current + step));
                announcer.textContent = `Toolbar moved up`;
                break;
            case 'ArrowDown':
                e.preventDefault();
                applyBottom(Math.max(100, current - step));
                announcer.textContent = `Toolbar moved down`;
                break;
            case 'ArrowLeft':
                e.preventDefault();
                applySide('left');
                break;
            case 'ArrowRight':
                e.preventDefault();
                applySide('right');
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                // Toggle sides on Enter/Space
                applySide(currentSide === 'left' ? 'right' : 'left');
                break;
        }
    });

    // ── Init ─────────────────────────────────────────────────────────

    // Set initial side data attribute
    overlayEl.dataset.side = currentSide;

    return {
        getSide: () => currentSide,
        setSide: applySide,
        getBottom: () => currentBottom || getComputedBottom(),
        setBottom: applyBottom,
        destroy: () => {
            announcer.remove();
            handle.remove();
        },
    };
}
