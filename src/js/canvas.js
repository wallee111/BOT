import "../styles/main.css";
import "../styles/style.v1.css";
import "../styles/canvas.css";
import { storage } from '../lib/storage/index.js';
const { ideas, categories, canvas } = storage;
import { getCategoryAppearance, escapeHtml } from '../lib/utils.js';
import { getCurrentUserId, ensureAuthSession } from '../lib/auth.js';
import { showToast } from '../lib/toast.js';
import { createCanvasEngine } from './canvas-engine.js';
import { createCardManager } from './canvas-cards.js';
import { createHeaderManager } from './canvas-headers.js';
import { createSelectionManager } from './canvas-selection.js';
import { initThreadNotes, attachThread, openThread, closeThread } from './thread-notes.js';
import { createOverlayDragController } from './canvas-overlay-drag.js';

// ── DOM refs ────────────────────────────────────────────────────

const viewportEl = document.getElementById('canvasViewport');
const surfaceEl = document.getElementById('canvasSurface');
const addCategoryBtn = document.getElementById('addCategoryBtn');
const addHeaderBtn = document.getElementById('addHeaderBtn');
const addOverlay = document.querySelector('.canvas-add-overlay');
const categoryMenu = document.getElementById('canvasCategoryMenu');
const categoryMenuContent = document.getElementById('canvasCategoryMenuContent');
const headerPillsContainer = document.getElementById('headerPills');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomLevelDisplay = document.getElementById('zoomLevel');
const threadPanel = document.getElementById('canvasThreadPanel');
const threadPanelBody = document.getElementById('canvasThreadBody');
const threadPanelClose = document.getElementById('threadPanelClose');

// ── State ───────────────────────────────────────────────────────

let allIdeas = [];
let categoryPalette = {};
let layout = { cards: [], headers: [], viewport: { panX: 0, panY: 0, zoom: 1.0 } };
let engine = null;
let cardManager = null;
let headerManager = null;
let selectionMgr = null;
let saveTimer = null;
let activeThreadIdeaId = null;
let threadPanelTrigger = null;
let closePanelTimer = null;
let overlayDragCtrl = null;
// Guard flag: true while we are flushing a save to Firestore so the echoed
// snapshot from subscribeToCanvasLayout does not trigger a redundant re-render.
let isSavingLocally = false;
// Guard flag: prevents debouncedSave from overwriting Firestore data with an
// empty layout before the initial Firestore load has completed.
let layoutLoaded = false;

// ── Init ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Init engine immediately (no data dependency)
    engine = createCanvasEngine(viewportEl, surfaceEl, {
        onViewportChange: ({ zoom }) => {
            zoomLevelDisplay.textContent = `${Math.round(zoom * 100)}%`;
            zoomLevelDisplay.setAttribute('aria-label', `Zoom level: ${Math.round(zoom * 100)}%`);
            debouncedSave();
        },
        onGestureStart: () => {
            cardManager?.unfocusCard();
        },
    });

    // 2. Render cached data INSTANTLY (before auth resolves)
    const cachedLayout = JSON.parse(localStorage.getItem('canvas_layout_v1') || 'null');
    const cachedIdeas = JSON.parse(localStorage.getItem('ideas_v1_cache') || '[]');
    const cachedPalette = JSON.parse(localStorage.getItem('category_settings_v1') || '{}');

    if (cachedLayout) {
        layout = {
            cards: Array.isArray(cachedLayout.cards) ? cachedLayout.cards : [],
            headers: Array.isArray(cachedLayout.headers) ? cachedLayout.headers : [],
            viewport: cachedLayout.viewport || { panX: 0, panY: 0, zoom: 1.0 },
        };
        allIdeas = cachedIdeas;
        categoryPalette = cachedPalette;

        engine.setState(layout.viewport);
        zoomLevelDisplay.textContent = `${Math.round(layout.viewport.zoom * 100)}%`;
        zoomLevelDisplay.setAttribute('aria-label', `Zoom level: ${Math.round(layout.viewport.zoom * 100)}%`);
    }

    // 3. Init managers (needed for both cached and fresh render)
    cardManager = createCardManager(surfaceEl, engine, {
        onCardMoved: (categoryName, x, y) => {
            updateLayoutCard(categoryName, x, y);
            debouncedSave();
        },
        onCardRemoved: (categoryName) => {
            removeLayoutCard(categoryName);
            updateCanvasEmptyState();
            debouncedSave();
        },
        onCardResized: (categoryName, width, bodyHeight) => {
            updateLayoutCardSize(categoryName, width, bodyHeight);
            debouncedSave();
        },
    });

    headerManager = createHeaderManager(surfaceEl, headerPillsContainer, engine, {
        onHeaderMoved: (id, x, y) => {
            updateLayoutHeader(id, { x, y });
            debouncedSave();
        },
        onHeaderTextChanged: (id, text) => {
            updateLayoutHeader(id, { text });
            debouncedSave();
        },
        onHeaderDeleted: (id) => {
            removeLayoutHeader(id);
            updateCanvasEmptyState();
            debouncedSave();
        },
    });

    selectionMgr = createSelectionManager(viewportEl, surfaceEl, engine, {
        onGroupMoved: (movedItems) => {
            movedItems.forEach(({ el, x, y }) => {
                if (el.classList.contains('canvas-card')) {
                    updateLayoutCard(el.dataset.category, x, y);
                } else if (el.classList.contains('canvas-header')) {
                    updateLayoutHeader(el.dataset.headerId, { x, y });
                }
            });
            debouncedSave();
        },
    });
    cardManager.setSelectionManager(selectionMgr);
    headerManager.setSelectionManager(selectionMgr);

    // 4. Render cached cards + headers instantly (before auth)
    if (layout) {
        layout.cards.forEach(card => {
            cardManager.addCard(card.categoryName, card.x, card.y, allIdeas, categoryPalette, card.width, card.bodyHeight);
        });
        layout.headers.forEach(header => {
            headerManager.addHeader(header.id, header.text, header.x, header.y);
        });
        console.log('[canvas] Rendered cached layout instantly');
    }
    updateCanvasEmptyState();

    // 5. Wire up toolbar + thread panel (no data dependency)
    // Unfocus card when tapping empty canvas
    viewportEl.addEventListener('click', (e) => {
        if (e.target === viewportEl || e.target === surfaceEl) {
            cardManager?.unfocusCard();
        }
    });

    initToolbar();
    initThreadNotes();
    initThreadPanel();
    overlayDragCtrl = createOverlayDragController(addOverlay, viewportEl);

    // 6. Auth check (UI is already showing cached data)
    try {
        const user = await ensureAuthSession({ requireAuth: true });
        if (!user) {
            window.location.href = 'signin.html';
            return;
        }
    } catch (error) {
        console.error('[canvas] Auth required but failed:', error);
        window.location.href = 'signin.html';
        return;
    }

    // 7. Load fresh data from Firestore (reconcile with cache)
    const [savedLayout, palette] = await Promise.all([
        canvas.load(),
        categories.getPalette(),
    ]);

    // Update layout if Firestore has newer data
    const layoutChanged = JSON.stringify(savedLayout) !== JSON.stringify(layout);
    if (layoutChanged) {
        layout = savedLayout;
        engine.setState(layout.viewport);
        zoomLevelDisplay.textContent = `${Math.round(layout.viewport.zoom * 100)}%`;
        zoomLevelDisplay.setAttribute('aria-label', `Zoom level: ${Math.round(layout.viewport.zoom * 100)}%`);

        // Clear and re-render cards/headers with fresh layout
        cardManager.unfocusCard();
        surfaceEl.querySelectorAll('.canvas-card').forEach(el => el.remove());
        surfaceEl.querySelectorAll('.canvas-header').forEach(el => el.remove());
        headerPillsContainer.innerHTML = '';
        layout.cards.forEach(card => {
            cardManager.addCard(card.categoryName, card.x, card.y, allIdeas, categoryPalette, card.width, card.bodyHeight);
        });
        layout.headers.forEach(header => {
            headerManager.addHeader(header.id, header.text, header.x, header.y);
        });
        updateCanvasEmptyState();
    }

    categoryPalette = palette;

    // Firestore data loaded — safe to allow saves now
    layoutLoaded = true;

    // 8. Real-time listeners as single source of truth
    const unsubscribe = ideas.subscribe((ideas) => {
        allIdeas = ideas;
        cardManager.updateAllCards(ideas, categoryPalette);
    });

    // 9. Real-time canvas layout listener — receives changes from other devices.
    //    The isSavingLocally guard suppresses the echo of our own writes.
    const unsubLayout = canvas.subscribe((remoteLayout) => {
        if (isSavingLocally) return;
        if (JSON.stringify(remoteLayout) === JSON.stringify(layout)) return;

        layout = remoteLayout;
        engine.setState(layout.viewport);
        zoomLevelDisplay.textContent = `${Math.round(layout.viewport.zoom * 100)}%`;
        zoomLevelDisplay.setAttribute('aria-label', `Zoom level: ${Math.round(layout.viewport.zoom * 100)}%`);

        cardManager.unfocusCard();
        surfaceEl.querySelectorAll('.canvas-card').forEach(el => el.remove());
        surfaceEl.querySelectorAll('.canvas-header').forEach(el => el.remove());
        headerPillsContainer.innerHTML = '';
        layout.cards.forEach(card => {
            cardManager.addCard(card.categoryName, card.x, card.y, allIdeas, categoryPalette, card.width, card.bodyHeight);
        });
        layout.headers.forEach(header => {
            headerManager.addHeader(header.id, header.text, header.x, header.y);
        });
        updateCanvasEmptyState();
    });

    // 10. Real-time category settings listener — keeps palette current across devices.
    const unsubCategorySettings = categories.subscribe((palette) => {
        categoryPalette = palette;
        cardManager.updateAllCards(allIdeas, categoryPalette);
    });

    window.addEventListener('beforeunload', () => {
        unsubscribe();
        unsubLayout();
        unsubCategorySettings();
    });
});

// ── Visibility Change ────────────────────────────────────────────
// Force palette refresh when the tab/app returns from the background.
// The real-time layout listener handles idea/layout sync automatically;
// this only needs to cover the palette (category settings).

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        categories.getPalette({ force: true }).then(palette => {
            categoryPalette = palette;
            cardManager?.updateAllCards(allIdeas, categoryPalette);
        }).catch(console.error);
    }
});

// ── Canvas Empty State ───────────────────────────────────────────

function updateCanvasEmptyState() {
    const hasContent = layout && (layout.cards.length > 0 || layout.headers.length > 0);
    const existing = viewportEl?.querySelector('.canvas-empty-state');

    if (!hasContent) {
        if (!existing && viewportEl) {
            const el = document.createElement('div');
            el.className = 'canvas-empty-state';
            el.setAttribute('aria-live', 'polite');
            el.innerHTML = `
                <p class="canvas-empty-state__headline">Your canvas is empty</p>
                <p class="canvas-empty-state__hint">Tap <strong>Add List</strong> to place a category on the canvas.</p>
            `;
            viewportEl.appendChild(el);
        }
    } else {
        existing?.remove();
    }
}

// ── Layout mutations ────────────────────────────────────────────

function updateLayoutCard(categoryName, x, y) {
    const card = layout.cards.find(c => c.categoryName === categoryName);
    if (card) {
        card.x = x;
        card.y = y;
    }
}

function removeLayoutCard(categoryName) {
    layout.cards = layout.cards.filter(c => c.categoryName !== categoryName);
}

function updateLayoutCardSize(categoryName, width, bodyHeight) {
    const card = layout.cards.find(c => c.categoryName === categoryName);
    if (card) {
        card.width = width;
        if (bodyHeight != null) card.bodyHeight = bodyHeight;
    }
}

function updateLayoutHeader(id, updates) {
    const header = layout.headers.find(h => h.id === id);
    if (header) Object.assign(header, updates);
}

function removeLayoutHeader(id) {
    layout.headers = layout.headers.filter(h => h.id !== id);
}

function debouncedSave() {
    if (!layoutLoaded) return; // Don't save until Firestore data is loaded
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        layout.viewport = engine.getState();
        isSavingLocally = true;
        canvas.save(layout);
        // Reset the guard after the Firestore round-trip completes.
        // saveCanvasLayout has its own 1500 ms internal debounce before the write fires,
        // leaving only ~500 ms of this 2 s window for the actual network round-trip.
        // The JSON.stringify equality guard in subscribeToCanvasLayout acts as a
        // secondary safety net if the snapshot arrives after this flag resets.
        setTimeout(() => { isSavingLocally = false; }, 4000);
    }, 800);
}

// ── Toolbar ─────────────────────────────────────────────────────

function initToolbar() {
    // Zoom controls
    zoomInBtn.addEventListener('click', () => engine.zoomIn());
    zoomOutBtn.addEventListener('click', () => engine.zoomOut());

    // Add Category
    addCategoryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!categoryMenu.hidden) {
            closeCategoryMenu();
            return;
        }
        openCategoryMenu();
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!categoryMenu.hidden && !categoryMenu.contains(e.target) && !addCategoryBtn.contains(e.target)) {
            closeCategoryMenu();
        }
    });

    // Add Header
    addHeaderBtn.addEventListener('click', () => {
        const rect = viewportEl.getBoundingClientRect();
        const center = engine.viewportToSurface(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const snapped = engine.snapToGrid(center.x - 60, center.y - 20);
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `hdr-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        layout.headers.push({ id, text: 'New Header', x: snapped.x, y: snapped.y });
        headerManager.addHeader(id, 'New Header', snapped.x, snapped.y);
        updateCanvasEmptyState();
        debouncedSave();
    });
}

// ── Category dropdown ───────────────────────────────────────────

function openCategoryMenu() {
    const onCanvas = new Set(layout.cards.map(c => c.categoryName.toLowerCase()));
    const available = new Set();

    allIdeas.forEach(idea => {
        if (idea.archived) return;
        const cats = idea.categories || (idea.category ? [idea.category] : []);
        cats.forEach(c => {
            const trimmed = c.trim();
            if (trimmed && !onCanvas.has(trimmed.toLowerCase())) {
                available.add(trimmed);
            }
        });
    });

    categoryMenuContent.innerHTML = '';

    if (available.size === 0) {
        const empty = document.createElement('div');
        empty.className = 'md3-menu__empty';
        empty.textContent = available.size === 0 && layout.cards.length > 0
            ? 'All categories are on canvas'
            : 'No categories found';
        categoryMenuContent.appendChild(empty);
    } else {
        Array.from(available).sort().forEach(cat => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'md3-menu__item';
            btn.setAttribute('role', 'menuitem');

            const appearance = getCategoryAppearance(cat, categoryPalette);
            const dot = document.createElement('span');
            dot.className = `canvas-category-dot ${appearance.classes}`;
            if (appearance.style) {
                appearance.style.split(';').forEach(rule => {
                    const [p, v] = rule.split(':');
                    if (p && v) dot.style.setProperty(p.trim(), v.trim());
                });
            }
            btn.appendChild(dot);

            const label = document.createElement('span');
            label.textContent = cat;
            btn.appendChild(label);

            btn.addEventListener('click', () => {
                addCategoryToCanvas(cat);
                closeCategoryMenu();
            });
            categoryMenuContent.appendChild(btn);
        });
    }

    // Position above the add button (opens upward since button is at bottom-right)
    // Use visualViewport when available — on mobile with keyboard open, innerHeight
    // includes the hidden area behind the keyboard, causing the menu to misposition.
    const rect = addCategoryBtn.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    categoryMenu.style.position = 'fixed';
    categoryMenu.style.bottom = `${vh - rect.top + 4}px`;
    categoryMenu.style.right = `${vw - rect.right}px`;
    categoryMenu.style.top = 'auto';
    categoryMenu.style.left = 'auto';
    categoryMenu.hidden = false;
    addCategoryBtn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => categoryMenu.classList.add('is-open'));
}

function closeCategoryMenu() {
    categoryMenu.classList.remove('is-open');
    addCategoryBtn.setAttribute('aria-expanded', 'false');
    // Delay hiding until the CSS close transition completes (~200 ms)
    setTimeout(() => {
        if (!categoryMenu.classList.contains('is-open')) {
            categoryMenu.hidden = true;
        }
    }, 200);
}

function addCategoryToCanvas(categoryName) {
    const rect = viewportEl.getBoundingClientRect();
    const center = engine.viewportToSurface(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const snapped = engine.snapToGrid(center.x - 160, center.y - 100);

    layout.cards.push({ categoryName, x: snapped.x, y: snapped.y, width: 0, bodyHeight: 0 });
    const newCard = cardManager.addCard(categoryName, snapped.x, snapped.y, allIdeas, categoryPalette, 0);
    if (newCard) {
        cardManager.focusCard?.(newCard);
        centerOnCard(newCard, snapped);
    }
    updateCanvasEmptyState();
    debouncedSave();
    showToast(`Added "${categoryName}" to canvas`, { timeout: 1500 });
}

function centerOnCard(cardEl, coords) {
    if (!cardEl || !engine) return;

    const { zoom } = engine.getState();
    const viewportRect = viewportEl.getBoundingClientRect();
    const width = cardEl.offsetWidth || 320;
    const height = cardEl.offsetHeight || 240;
    const surfaceCenterX = (coords?.x ?? 0) + width / 2;
    const surfaceCenterY = (coords?.y ?? 0) + height / 2;

    const targetPanX = (viewportRect.width / 2) - surfaceCenterX * zoom;
    const targetPanY = (viewportRect.height / 2) - surfaceCenterY * zoom;

    engine.animateTo(targetPanX, targetPanY, zoom, 220);
}

// ── Thread Panel ─────────────────────────────────────────────────

function initThreadPanel() {
    // Close panel button
    threadPanelClose?.addEventListener('click', closeThreadPanel);

    // Delegated click on thread icons inside canvas cards
    surfaceEl.addEventListener('click', (e) => {
        const trigger = e.target.closest('.idea-thread');
        if (!trigger || !trigger.dataset.threadId) return;

        e.stopPropagation();
        const ideaId = trigger.dataset.threadId;

        // If same idea is already open, close panel
        if (activeThreadIdeaId === ideaId) {
            closeThreadPanel();
            return;
        }

        openThreadPanel(ideaId, trigger);
    });

    // Close panel on Escape — prioritise thread panel over card unfocus
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (activeThreadIdeaId) {
                closeThreadPanel();
                return; // Don't also unfocus the card
            }
            cardManager?.unfocusCard();
        }
    });
}

function openThreadPanel(ideaId, triggerEl) {
    if (closePanelTimer) {
        clearTimeout(closePanelTimer);
        closePanelTimer = null;
    }

    // Always unsubscribe any existing Firestore listener for this ideaId before
    // re-attaching, to prevent duplicate subscriptions when the same idea is
    // reopened (Fix 3 + Fix 7 combined).
    if (activeThreadIdeaId) {
        closeThread(activeThreadIdeaId);
    }
    // Also clean up the target ideaId's subscription if it differs from the
    // previously active one (e.g. panel was closed mid-animation).
    if (ideaId !== activeThreadIdeaId) {
        closeThread(ideaId);
    }

    activeThreadIdeaId = ideaId;

    // Find the idea data
    const idea = allIdeas.find(i => i.id === ideaId);
    if (!idea) return;

    // Build panel content: show idea text + thread notes
    threadPanelBody.innerHTML = '';

    // Idea preview
    const preview = document.createElement('div');
    preview.className = 'canvas-thread-panel__preview';
    preview.innerHTML = `<p class="canvas-thread-panel__idea-text">${escapeHtml(idea.text)}</p>`;
    threadPanelBody.appendChild(preview);

    // Thread notes container (attachThread will add the thread UI here)
    const threadHost = document.createElement('div');
    threadHost.className = 'canvas-thread-panel__thread-host';
    threadPanelBody.appendChild(threadHost);

    // Attach and open thread
    attachThread(threadHost, ideaId);
    openThread(ideaId);

    // Store trigger for focus return on close
    threadPanelTrigger = triggerEl || null;

    // Show panel
    threadPanel.hidden = false;
    requestAnimationFrame(() => {
        threadPanel.classList.add('is-open');
        threadPanelClose?.focus();
    });
}

function closeThreadPanel() {
    const triggerToReturn = threadPanelTrigger;
    threadPanelTrigger = null;

    if (activeThreadIdeaId) {
        closeThread(activeThreadIdeaId);
        activeThreadIdeaId = null;
    }

    threadPanel.classList.remove('is-open');
    // Wait for CSS close transition to finish before hiding
    closePanelTimer = setTimeout(() => {
        if (!threadPanel.classList.contains('is-open')) {
            threadPanel.hidden = true;
            threadPanelBody.innerHTML = '';
        }
        closePanelTimer = null;
    }, 260);

    // Return focus to the element that triggered the panel
    if (triggerToReturn && typeof triggerToReturn.focus === 'function') {
        triggerToReturn.focus();
    }
}

// --- Theme Toggle ---
(function() {
    const THEME_KEY = 'bot_theme_v1';
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', saved);

    const toggle = () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(THEME_KEY, next);
    };

    document.getElementById('themeToggleSidebar')?.addEventListener('click', toggle);
    document.getElementById('themeToggle')?.addEventListener('click', toggle);
})();
