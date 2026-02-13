/**
 * Canvas Engine — pan, zoom, grid, coordinate transforms.
 *
 * Usage:
 *   const engine = createCanvasEngine(viewportEl, surfaceEl, { onViewportChange });
 *   engine.setState({ panX, panY, zoom });
 *   engine.destroy();
 */

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.1;
const GRID_SIZE = 40;
const ZOOM_ANIMATION_MS = 300;

// Gesture detection thresholds for mobile touch
const PINCH_DETECTION_THRESHOLD = 10; // pixels change in distance to detect pinch (reduced for faster detection)
const TWO_FINGER_PAN_THRESHOLD = 15; // pixels movement before confirming pan (increased to prevent accidental pan during pinch)
const PINCH_ZOOM_SENSITIVITY = 0.8; // Sensitivity factor for pinch zoom (0.8 = 80% of distance change applied to zoom)

export function createCanvasEngine(viewportEl, surfaceEl, options = {}) {
    const state = {
        panX: 0,
        panY: 0,
        zoom: 1.0,
        isPanning: false,
        panPointerId: null,
        panStartX: 0,
        panStartY: 0,
        panStartPanX: 0,
        panStartPanY: 0,
    };

    // Multi-touch pinch and two-finger pan tracking
    const activePointers = new Map();
    let pinchState = null; // { initialDist, initialZoom, initialPanX, initialPanY, mode: 'detecting'|'pinch'|'pan', startMid }
    let twoFingerPanState = null; // { startMidX, startMidY, startPanX, startPanY }

    let animationId = null;

    // Desktop vs mobile detection
    const isDesktop = () => window.matchMedia('(pointer: fine)').matches;

    // Space key held = pan mode on desktop
    let spaceHeld = false;

    function onKeyDown(e) {
        if (e.code === 'Space' && !e.repeat && !e.target.closest('input, textarea, [contenteditable]')) {
            spaceHeld = true;
            viewportEl.classList.add('is-space-pan');
            e.preventDefault();
        }
    }

    function onKeyUp(e) {
        if (e.code === 'Space') {
            spaceHeld = false;
            viewportEl.classList.remove('is-space-pan');
        }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // ── Transform ───────────────────────────────────────────────

    function applyTransform() {
        surfaceEl.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
        updateGridBackground();
        options.onViewportChange?.({
            panX: state.panX,
            panY: state.panY,
            zoom: state.zoom,
        });
    }

    function updateGridBackground() {
        const scaledSize = GRID_SIZE * state.zoom;
        const offsetX = state.panX % scaledSize;
        const offsetY = state.panY % scaledSize;
        viewportEl.style.backgroundSize = `${scaledSize}px ${scaledSize}px`;
        viewportEl.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
    }

    // ── Pan (pointer events) ────────────────────────────────────

    function onPointerDown(e) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Two fingers → gesture detection mode (pinch vs two-finger pan)
        if (activePointers.size === 2) {
            cancelPan();
            startGestureDetection();
            return;
        }

        // More than two fingers → ignore
        if (activePointers.size > 2) {
            return;
        }

        // Only pan on empty space (not cards/headers)
        if (e.target !== viewportEl && e.target !== surfaceEl) return;
        if (!e.isPrimary) return;

        // Desktop: primary click is reserved for marquee selection.
        // Pan only via middle-mouse (button 1) or Space+primary click.
        if (isDesktop()) {
            const isMiddleMouse = e.button === 1;
            const isSpaceDrag = spaceHeld && e.button === 0;
            if (!isMiddleMouse && !isSpaceDrag) return; // let selection manager handle primary click
        }

        state.isPanning = true;
        state.panPointerId = e.pointerId;
        state.panStartX = e.clientX;
        state.panStartY = e.clientY;
        state.panStartPanX = state.panX;
        state.panStartPanY = state.panY;

        viewportEl.setPointerCapture(e.pointerId);
        viewportEl.classList.add('is-panning');
    }

    function onPointerMove(e) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Two-finger gesture handling (pinch or pan)
        if (activePointers.size === 2 && pinchState) {
            handleTwoFingerGesture();
            return;
        }

        // Single-finger or mouse pan
        if (!state.isPanning || e.pointerId !== state.panPointerId) return;

        const dx = e.clientX - state.panStartX;
        const dy = e.clientY - state.panStartY;
        state.panX = state.panStartPanX + dx;
        state.panY = state.panStartPanY + dy;
        applyTransform();
    }

    function onPointerUp(e) {
        activePointers.delete(e.pointerId);

        if (activePointers.size < 2) {
            pinchState = null;
            twoFingerPanState = null;
        }

        if (e.pointerId === state.panPointerId) {
            state.isPanning = false;
            state.panPointerId = null;
            try { viewportEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            viewportEl.classList.remove('is-panning');
        }
    }

    function onPointerCancel(e) {
        onPointerUp(e);
    }

    function cancelPan() {
        if (state.isPanning && state.panPointerId != null) {
            try { viewportEl.releasePointerCapture(state.panPointerId); } catch (_) { /* ignore */ }
        }
        state.isPanning = false;
        state.panPointerId = null;
        viewportEl.classList.remove('is-panning');
        viewportEl.classList.remove('is-pinching');
    }

    // ── Two-finger gesture detection (pinch vs pan) ────────────

    function getPointerDistance() {
        const pts = Array.from(activePointers.values());
        if (pts.length < 2) return 0;
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getPointerMidpoint() {
        const pts = Array.from(activePointers.values());
        if (pts.length < 2) return { x: 0, y: 0 };
        return {
            x: (pts[0].x + pts[1].x) / 2,
            y: (pts[0].y + pts[1].y) / 2,
        };
    }

    function startGestureDetection() {
        const mid = getPointerMidpoint();
        pinchState = {
            initialDist: getPointerDistance(),
            initialZoom: state.zoom,
            initialPanX: state.panX,
            initialPanY: state.panY,
            mode: 'detecting', // 'detecting' | 'pinch' | 'pan'
            startMid: mid,
        };
    }

    function handleTwoFingerGesture() {
        if (!pinchState) return;

        const currentDist = getPointerDistance();
        const currentMid = getPointerMidpoint();

        // Still detecting which gesture
        if (pinchState.mode === 'detecting') {
            const distChange = Math.abs(currentDist - pinchState.initialDist);
            const midChange = Math.sqrt(
                Math.pow(currentMid.x - pinchState.startMid.x, 2) +
                Math.pow(currentMid.y - pinchState.startMid.y, 2)
            );

            // If distance between fingers changes significantly → pinch
            if (distChange > PINCH_DETECTION_THRESHOLD) {
                pinchState.mode = 'pinch';
                viewportEl.classList.add('is-pinching');
            }
            // If midpoint moves significantly without distance change → pan
            else if (midChange > TWO_FINGER_PAN_THRESHOLD) {
                pinchState.mode = 'pan';
                twoFingerPanState = {
                    startMidX: pinchState.startMid.x,
                    startMidY: pinchState.startMid.y,
                    startPanX: state.panX,
                    startPanY: state.panY,
                };
                viewportEl.classList.add('is-panning');
            }
        }

        // Execute pinch zoom
        if (pinchState.mode === 'pinch') {
            if (pinchState.initialDist === 0) return;

            // Calculate zoom based on distance change between fingers
            const distanceRatio = currentDist / pinchState.initialDist;
            // Apply sensitivity: blend between no zoom (1.0) and full ratio (distanceRatio)
            const targetZoom = pinchState.initialZoom * distanceRatio;
            const smoothedZoom = pinchState.initialZoom + (targetZoom - pinchState.initialZoom) * PINCH_ZOOM_SENSITIVITY;
            const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, smoothedZoom));

            // Zoom toward the midpoint between fingers
            const rect = viewportEl.getBoundingClientRect();
            const cursorX = currentMid.x - rect.left;
            const cursorY = currentMid.y - rect.top;

            const zoomRatio = newZoom / state.zoom;
            state.panX = cursorX - zoomRatio * (cursorX - state.panX);
            state.panY = cursorY - zoomRatio * (cursorY - state.panY);
            state.zoom = newZoom;

            applyTransform();
        }

        // Execute two-finger pan
        if (pinchState.mode === 'pan' && twoFingerPanState) {
            const dx = currentMid.x - twoFingerPanState.startMidX;
            const dy = currentMid.y - twoFingerPanState.startMidY;
            state.panX = twoFingerPanState.startPanX + dx;
            state.panY = twoFingerPanState.startPanY + dy;
            applyTransform();
        }
    }

    // ── Zoom (wheel) ────────────────────────────────────────────

    function onWheel(e) {
        // Never zoom when mouse is over a canvas card — let native scroll handle it
        if (e.target.closest('.canvas-card')) {
            return;
        }

        e.preventDefault();

        // Reduce sensitivity: use smaller step for trackpad precision
        const wheelZoomStep = ZOOM_STEP * 0.5; // 50% of button zoom for smoother wheel/trackpad zoom
        const delta = e.deltaY > 0 ? -wheelZoomStep : wheelZoomStep;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom + delta));
        if (newZoom === state.zoom) return;

        const rect = viewportEl.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const scale = newZoom / state.zoom;
        state.panX = cursorX - scale * (cursorX - state.panX);
        state.panY = cursorY - scale * (cursorY - state.panY);
        state.zoom = newZoom;

        applyTransform();
    }

    // ── Animated transitions ────────────────────────────────────

    function animateTo(targetPanX, targetPanY, targetZoom, durationMs = ZOOM_ANIMATION_MS) {
        if (animationId) cancelAnimationFrame(animationId);

        const startPanX = state.panX;
        const startPanY = state.panY;
        const startZoom = state.zoom;
        const startTime = performance.now();

        function step(now) {
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / durationMs);
            // easeInOutQuad
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            state.panX = startPanX + (targetPanX - startPanX) * ease;
            state.panY = startPanY + (targetPanY - startPanY) * ease;
            state.zoom = startZoom + (targetZoom - startZoom) * ease;
            applyTransform();

            if (t < 1) {
                animationId = requestAnimationFrame(step);
            } else {
                animationId = null;
            }
        }
        animationId = requestAnimationFrame(step);
    }

    // ── Public API helpers ──────────────────────────────────────

    function snapToGrid(x, y) {
        return {
            x: Math.round(x / GRID_SIZE) * GRID_SIZE,
            y: Math.round(y / GRID_SIZE) * GRID_SIZE,
        };
    }

    function viewportToSurface(clientX, clientY) {
        const rect = viewportEl.getBoundingClientRect();
        return {
            x: (clientX - rect.left - state.panX) / state.zoom,
            y: (clientY - rect.top - state.panY) / state.zoom,
        };
    }

    function zoomIn() {
        const newZoom = Math.min(ZOOM_MAX, state.zoom + ZOOM_STEP);
        const rect = viewportEl.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const scale = newZoom / state.zoom;
        animateTo(
            cx - scale * (cx - state.panX),
            cy - scale * (cy - state.panY),
            newZoom,
            150
        );
    }

    function zoomOut() {
        const newZoom = Math.max(ZOOM_MIN, state.zoom - ZOOM_STEP);
        const rect = viewportEl.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const scale = newZoom / state.zoom;
        animateTo(
            cx - scale * (cx - state.panX),
            cy - scale * (cy - state.panY),
            newZoom,
            150
        );
    }

    function zoomReset() {
        animateTo(0, 0, 1.0);
    }

    // ── Lifecycle ───────────────────────────────────────────────

    viewportEl.addEventListener('pointerdown', onPointerDown);
    viewportEl.addEventListener('pointermove', onPointerMove);
    viewportEl.addEventListener('pointerup', onPointerUp);
    viewportEl.addEventListener('pointercancel', onPointerCancel);
    viewportEl.addEventListener('wheel', onWheel, { passive: false });

    // Apply initial transform
    applyTransform();

    function destroy() {
        viewportEl.removeEventListener('pointerdown', onPointerDown);
        viewportEl.removeEventListener('pointermove', onPointerMove);
        viewportEl.removeEventListener('pointerup', onPointerUp);
        viewportEl.removeEventListener('pointercancel', onPointerCancel);
        viewportEl.removeEventListener('wheel', onWheel);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        if (animationId) cancelAnimationFrame(animationId);
    }

    return {
        getState: () => ({ panX: state.panX, panY: state.panY, zoom: state.zoom }),
        isDesktop,
        isSpaceHeld: () => spaceHeld,
        setState: ({ panX, panY, zoom }) => {
            state.panX = panX ?? state.panX;
            state.panY = panY ?? state.panY;
            state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom ?? state.zoom));
            applyTransform();
        },
        animateTo,
        zoomIn,
        zoomOut,
        zoomReset,
        snapToGrid,
        viewportToSurface,
        getGridSize: () => GRID_SIZE,
        destroy,
    };
}
