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
    let momentumAnimationId = null;
    const HOLD_DURATION = 300; // ms to activate drag mode

    // Momentum tracking
    const positionHistory = []; // [{y, time}, ...]
    const MAX_HISTORY_AGE = 100; // ms to keep for velocity calculation
    const FRICTION = 0.85; // deceleration per frame (lower = faster stop)
    const MIN_VELOCITY = 0.1; // pixels/ms threshold to stop momentum
    const MAX_VELOCITY = 1.5; // pixels/ms cap to prevent flinging

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

    const isMobile = () => window.matchMedia('(max-width: 1023px)').matches;

    function getBounds() {
        const viewportRect = viewportEl.getBoundingClientRect();
        const overlayHeight = overlayEl.offsetHeight || 120;

        // Top bound: overlay must stay within viewport (with 16px padding)
        const maxBottom = viewportRect.height - overlayHeight - 16;

        // Bottom bound: account for fixed chrome on mobile
        let minBottom;
        if (isMobile()) {
            // Bottom nav (~68px) + safe area + header pills bar (~50px) + clearance
            const bottomNav = document.querySelector('.bottom-nav');
            const pillsBar = document.querySelector('.canvas-header-pills-bar');
            const navHeight = bottomNav ? bottomNav.offsetHeight : 68;
            const pillsHeight = (pillsBar && !pillsBar.matches(':empty')) ? pillsBar.offsetHeight : 0;
            minBottom = navHeight + pillsHeight + 20;
        } else {
            minBottom = 24; // Desktop: just some padding from bottom
        }

        return { minBottom, maxBottom };
    }

    function clampBottom(bottom) {
        const { minBottom, maxBottom } = getBounds();
        return Math.max(minBottom, Math.min(maxBottom, bottom));
    }

    function getComputedBottom() {
        const styles = window.getComputedStyle(overlayEl);
        return parseInt(styles.bottom, 10) || 0;
    }

    function recordPointerPosition(clientY) {
        const now = Date.now();
        positionHistory.push({ y: clientY, time: now });

        // Prune old entries
        const cutoffTime = now - MAX_HISTORY_AGE;
        while (positionHistory.length > 0 && positionHistory[0].time < cutoffTime) {
            positionHistory.shift();
        }
    }

    function calculateVelocity() {
        if (positionHistory.length < 2) return 0;

        const first = positionHistory[0];
        const last = positionHistory[positionHistory.length - 1];
        const deltaY = last.y - first.y;
        const deltaTime = last.time - first.time;

        if (deltaTime <= 0) return 0;

        // Cap velocity to prevent flinging
        const raw = deltaY / deltaTime;
        return Math.sign(raw) * Math.min(Math.abs(raw), MAX_VELOCITY);
    }

    function applyMomentum(velocityPixelsPerMs) {
        // Cancel any existing momentum animation
        if (momentumAnimationId) {
            cancelAnimationFrame(momentumAnimationId);
        }

        let velocity = velocityPixelsPerMs;
        let lastBottom = currentBottom;
        const cachedBounds = getBounds();
        let lastTimestamp = null;

        function clampWithCached(bottom) {
            return Math.max(cachedBounds.minBottom, Math.min(cachedBounds.maxBottom, bottom));
        }

        function animateMomentum(timestamp) {
            if (Math.abs(velocity) < MIN_VELOCITY) {
                momentumAnimationId = null;
                return;
            }

            const dt = lastTimestamp ? timestamp - lastTimestamp : 16;
            lastTimestamp = timestamp;

            // Apply velocity using actual frame time
            const deltaY = velocity * dt;
            const newBottom = clampWithCached(lastBottom - deltaY);
            applyBottom(newBottom);
            lastBottom = newBottom;

            // Apply friction
            velocity *= FRICTION;

            // Continue animation
            momentumAnimationId = requestAnimationFrame(animateMomentum);
        }

        requestAnimationFrame(animateMomentum);
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

        // Cancel any in-progress momentum
        if (momentumAnimationId) {
            cancelAnimationFrame(momentumAnimationId);
            momentumAnimationId = null;
        }

        overlayEl.classList.add('is-dragging');
        handle.setAttribute('aria-pressed', 'true');

        // Announce drag start
        announcer.textContent = 'Drag mode active. Move toolbar up or down, then release.';
    }

    function handleMove(clientY) {
        if (!isDragging) return;

        // Track position for momentum calculation
        recordPointerPosition(clientY);

        // Move the overlay WITH the finger (positive clientY delta = moving down)
        const deltaY = clientY - startY;
        const newBottom = clampBottom(currentBottom - deltaY);
        applyBottom(newBottom);
    }

    function endDrag(clientX) {
        if (!isDragging) return;

        isDragging = false;
        overlayEl.classList.remove('is-dragging');
        handle.setAttribute('aria-pressed', 'false');

        // Calculate velocity from position history for momentum
        const velocity = calculateVelocity();

        // Snap to nearest side based on final pointer X position
        const viewportRect = viewportEl.getBoundingClientRect();
        const centerX = viewportRect.left + viewportRect.width / 2;
        const newSide = clientX < centerX ? 'left' : 'right';

        if (newSide !== currentSide) {
            applySide(newSide);
        } else {
            announcer.textContent = `Toolbar position updated on ${currentSide} side`;
        }

        // Apply momentum only if velocity is significant (raised threshold)
        if (Math.abs(velocity) > 0.5) {
            applyMomentum(velocity);
        }

        // Clear position history after drag ends
        positionHistory.length = 0;
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

    const onWindowMove = (e) => {
        if (isDragging) {
            e.preventDefault();
            handleMove(e.clientY);
        }
    };

    const onWindowUp = (e) => {
        // Clear hold timer if release before hold duration
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }

        if (isDragging) {
            e.preventDefault();
            endDrag(e.clientX);
        }
    };

    const onWindowCancel = () => {
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
        // Clear position history
        positionHistory.length = 0;
    };

    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowCancel);

    // ── Keyboard Controls (WCAG 2.5.1 alternative) ──────────────────

    handle.addEventListener('keydown', (e) => {
        const step = 40; // px per arrow key press

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                applyBottom(clampBottom(getComputedBottom() + step));
                announcer.textContent = `Toolbar moved up`;
                break;
            case 'ArrowDown':
                e.preventDefault();
                applyBottom(clampBottom(getComputedBottom() - step));
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
            if (momentumAnimationId) cancelAnimationFrame(momentumAnimationId);
            window.removeEventListener('pointermove', onWindowMove);
            window.removeEventListener('pointerup', onWindowUp);
            window.removeEventListener('pointercancel', onWindowCancel);
            announcer.remove();
            handle.remove();
        },
    };
}
