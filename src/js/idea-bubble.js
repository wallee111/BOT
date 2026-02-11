/**
 * Idea Bubble - Swipe Actions Module
 * Provides swipe-to-reveal functionality for idea bubbles on the main feed
 * - Swipe Left: Reveal Edit + Delete buttons
 * - Swipe Right: Archive the idea
 */

// Swipe configuration
const SWIPE_THRESHOLD = 60;
const REVEAL_DISTANCE = 120;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

// Swipe state per container
const containerStates = new WeakMap();

// Ignore these elements for swipe (clickable items)
const SWIPE_IGNORE_SELECTOR = 'button, a, input, textarea, select, label, .category-chip, .priority-dot, .idea-thread, .idea-pin, .swipe-btn, .inline-edit, .inline-edit__input, .inline-edit__save, .inline-edit__cancel';

/**
 * Initialize swipe gestures on a container
 * @param {HTMLElement} container - The container element with swipe items
 * @param {Object} handlers - Callback handlers
 * @param {Function} handlers.onEdit - Called when edit button clicked
 * @param {Function} handlers.onDelete - Called when delete button clicked
 * @param {Function} handlers.onArchive - Called when swiped right to archive
 */
export function initSwipeGestures(container, handlers = {}) {
    if (!container) return;

    // Initialize state for this container
    const state = {
        isDragging: false,
        hasMoved: false,
        pointerId: null,
        activeItem: null,
        contentEl: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        startTime: 0,
        openItem: null,
        handlers
    };
    containerStates.set(container, state);

    // Bind handlers with container context
    const onPointerDown = (e) => handlePointerDown(e, container);
    const onPointerMove = (e) => handlePointerMove(e, container);
    const onPointerUp = (e) => handlePointerUp(e, container);
    const onClickActions = (e) => handleActionClick(e, container);

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('click', onClickActions);

    // Store cleanup references
    container._swipeCleanup = () => {
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerup', onPointerUp);
        container.removeEventListener('pointercancel', onPointerUp);
        container.removeEventListener('click', onClickActions);
    };
}

function handlePointerDown(e, container) {
    const state = containerStates.get(container);
    if (!state) return;

    // Only handle primary pointer
    if (!e.isPrimary) return;

    // Ignore clicks on interactive elements
    if (e.target.closest(SWIPE_IGNORE_SELECTOR)) return;

    // Find the swipeable content element
    const swipeContent = e.target.closest('.idea-bubble');
    if (!swipeContent) return;

    // Find the row container
    const swipeItem = swipeContent.closest('.idea-row');
    if (!swipeItem) return;

    // Set up swipe tracking but DO NOT capture yet (wait for move direction)
    state.isDragging = true;
    state.hasMoved = false;
    state.pointerId = e.pointerId;
    state.activeItem = swipeItem;
    state.contentEl = swipeContent;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.currentX = e.clientX;
    state.startTime = performance.now();

    // We don't capture here to allow vertical scrolling to start
}

function handlePointerMove(e, container) {
    const state = containerStates.get(container);
    if (!state || !state.isDragging || state.pointerId !== e.pointerId) return;

    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // If this is the first significant movement
    if (!state.hasMoved) {
        // Hysteresis: wait for small movement before deciding
        if (absX < 5 && absY < 5) return;

        // If moving more vertically, this is a scroll - cancel swipe
        if (absY > absX) {
            resetSwipe(container);
            return;
        }

        // Horizontal move confirmed - start capturing
        state.hasMoved = true;
        try {
            state.activeItem.setPointerCapture(e.pointerId);
        } catch (err) { /* ignore */ }
    }

    if (state.hasMoved) {
        // Prevent default to stop browser navigation/scrolling behaviors
        if (e.cancelable) e.preventDefault();

        state.currentX = e.clientX;

        // Clamp translation
        let translateX = deltaX;
        if (deltaX < 0) {
            // Left swipe - reveal buttons
            translateX = Math.max(-REVEAL_DISTANCE, deltaX);
        } else {
            // Right swipe - archive
            translateX = Math.min(REVEAL_DISTANCE * 0.6, deltaX);
        }

        // Apply transform
        if (state.contentEl) {
            state.contentEl.style.transition = 'none';
            state.contentEl.style.transform = `translateX(${translateX}px)`;
        }

        // Update visual state for feedback
        state.activeItem?.classList.toggle('swiping-left', deltaX < -20);
        state.activeItem?.classList.toggle('swiping-right', deltaX > 20);
    }
}

function handlePointerUp(e, container) {
    const state = containerStates.get(container);
    if (!state || !state.isDragging || state.pointerId !== e.pointerId) return;

    const deltaX = state.currentX - state.startX;
    const elapsed = performance.now() - state.startTime;
    const velocity = Math.abs(deltaX) / elapsed;

    // Determine action based on swipe distance and velocity
    // More lenient thresholds for easier activation
    const isQuickSwipe = velocity > 0.3 && Math.abs(deltaX) > 20;
    const isFullSwipe = Math.abs(deltaX) > 40; // Reduced from original high threshold

    if (state.hasMoved && (isQuickSwipe || isFullSwipe)) {
        if (deltaX < 0) {
            // Swiped left - reveal edit/delete buttons (keep open)
            openSwipeItem(container, state.activeItem);
        } else {
            // Swiped right - archive (needs slightly more intent)
            if (Math.abs(deltaX) > 60) {
                if (state.handlers.onArchive) {
                    state.handlers.onArchive(state.activeItem);
                }
                closeSwipeItem(container, state.activeItem);
            } else {
                closeSwipeItem(container, state.activeItem);
            }
        }
    } else {
        // Not a full swipe - close
        closeSwipeItem(container, state.activeItem);
    }

    // Clean up visual states
    state.activeItem?.classList.remove('swiping-left', 'swiping-right');

    resetSwipe(container);
}

function openSwipeItem(container, item) {
    const state = containerStates.get(container);
    if (!state) return;

    // Close any previously open item
    if (state.openItem && state.openItem !== item) {
        closeSwipeItem(container, state.openItem);
    }

    const content = item?.querySelector('.idea-bubble');
    if (content) {
        content.style.transition = 'transform 0.2s ease';
        content.style.transform = `translateX(-${REVEAL_DISTANCE}px)`;
    }

    item?.classList.add('idea-row--open');
    state.openItem = item;
}

export function closeSwipeItem(container, item) {
    const state = containerStates.get(container);

    const content = item?.querySelector('.idea-bubble');
    if (content) {
        content.style.transition = 'transform 0.2s ease';
        content.style.transform = '';
    }

    item?.classList.remove('idea-row--open');

    if (state && state.openItem === item) {
        state.openItem = null;
    }
}

function resetSwipe(container) {
    const state = containerStates.get(container);
    if (!state) return;

    if (state.activeItem && state.pointerId !== null) {
        try {
            state.activeItem.releasePointerCapture(state.pointerId);
        } catch (err) { /* ignore */ }
    }

    state.isDragging = false;
    state.hasMoved = false;
    state.pointerId = null;
    state.activeItem = null;
    state.contentEl = null;
    state.startX = 0;
    state.startY = 0;
    state.currentX = 0;
    state.startTime = 0;
}

function handleActionClick(e, container) {
    const state = containerStates.get(container);
    if (!state) return;

    // Handle edit button
    const editBtn = e.target.closest('[data-edit-idea]');
    if (editBtn) {
        e.stopPropagation();
        const ideaId = editBtn.dataset.editIdea;
        const row = editBtn.closest('.idea-row');
        closeSwipeItem(container, row);
        // Wait for close animation before opening editor
        if (state.handlers.onEdit) {
            setTimeout(() => {
                state.handlers.onEdit(row, ideaId);
            }, 220); // Slightly longer than the 0.2s transition
        }
        return;
    }

    // Handle delete button
    const deleteBtn = e.target.closest('[data-del-idea]');
    if (deleteBtn) {
        e.stopPropagation();
        const ideaId = deleteBtn.dataset.delIdea;
        const row = deleteBtn.closest('.idea-row');
        if (state.handlers.onDelete) {
            state.handlers.onDelete(row, ideaId);
        }
        return;
    }

    // Close open item when clicking elsewhere
    if (state.openItem && !e.target.closest('.idea-row--open')) {
        closeSwipeItem(container, state.openItem);
    }
}

/**
 * Cleanup function to remove event listeners
 * @param {HTMLElement} container - The container with swipe gestures
 */
export function cleanupSwipeGestures(container) {
    if (!container) return;
    if (container._swipeCleanup) {
        container._swipeCleanup();
        delete container._swipeCleanup;
    }
    containerStates.delete(container);
}
