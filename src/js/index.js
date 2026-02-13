import "../styles/main.css";
import "../styles/style.v1.css";
import {
    saveIdea,
    getCategories,
    getIdeas,
    subscribeToIdeas,
    setIdeaArchived,
    setIdeaHidden,
    getCategoryPalette,
    setIdeaPinned,
    trackCategoryUsage,
    getCategoriesByRecentUsage,
    updateIdeaPriority,
    deleteIdea,
    updateIdeaText
} from '../lib/storage.js';
import {
    escapeHtml,
    getCategoryAppearance,
    formatTime,
    normalizeCategories,
    extractTags,
    formatTextContent
} from '../lib/utils.js';
import { getCurrentUserId, ensureAuthSession } from '../lib/auth.js';
import { initThreadNotes, attachThread, toggleThread, cleanupThreadNotes } from './thread-notes.js';
import { showToast } from '../lib/toast.js';
import { createCategoryDropdownController } from './category-dropdown.js';
import { initSwipeGestures } from './idea-bubble.js';

// --- Constants ---
const CATEGORY_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });
const RESURFACE_MIN_AGE_DAYS = 7;
const RESURFACE_SHOWN_KEY = 'resurface_shown_ids_v1';

// --- DOM Elements ---
const $ = sel => document.querySelector(sel);

// Dashboard sections
const pinnedSection = $('#pinnedSection');
const pinnedFeed = $('#pinnedFeed');
const pinnedCount = $('#pinnedCount');
const resurfaceSection = $('#resurfaceSection');
const resurfaceFeed = $('#resurfaceFeed');
const resurfaceRefresh = $('#resurfaceRefresh');
const hiddenSection = $('#hiddenSection');
const hiddenFeed = $('#hiddenFeed');
const hiddenCount = $('#hiddenCount');
const hiddenToggle = $('#hiddenToggle');

// Capture FAB + Overlay
const captureFab = $('#captureFab');
const captureOverlay = $('#captureOverlay');
const captureBackdrop = $('#captureBackdrop');
const textInput = $('#text');
const categorySelect = $('#categorySelect');
const prioritySelect = $('#prioritySelect');
const categoryNew = $('#categoryNew');
const categorySelectBtn = $('#categorySelectBtn');
const categoryLabel = $('#categoryLabel');
const saveBtn = $('.capture-form__send');

// Category Edit Dropdown
const categoryEditDropdown = document.getElementById('categoryEditDropdown');
const categoryEditDropdownContent = document.getElementById('categoryEditDropdownContent');

// --- Global State ---
let state = {
    allIdeas: [],
    availableCategories: [],
    categoryPalette: {},
    categoryUsage: {},
    resurfaceIdea: null,
    hiddenExpanded: false,
};

// --- Initialization ---
async function initialize() {
    console.log('[index] Initializing page, checking auth...');

    try {
        // First, ensure auth session is established and user must be logged in
        const user = await ensureAuthSession({ requireAuth: true });
        console.log('[index] Auth check result:', user?.email || 'no user');
        if (!user) {
            console.log('[index] No user found, clearing cache and redirecting to signin.html');
            // Clear any stale cache that might be keeping the user on the dashboard
            try {
                localStorage.removeItem('ideas_v1_cache');
                localStorage.removeItem('category_settings_v1');
                localStorage.removeItem('category_usage_v1');
                localStorage.removeItem('canvas_layouts');
            } catch (e) {
                console.log('[index] Error clearing localStorage:', e);
            }
            window.location.href = 'signin.html';
            return;
        }
        console.log('[index] User authenticated:', user.email);
    } catch (error) {
        console.error('[index] Auth required but failed:', error);
        console.log('[index] Redirecting to signin.html due to auth error');
        // Clear cache on auth error too
        try {
            localStorage.removeItem('ideas_v1_cache');
            localStorage.removeItem('category_settings_v1');
            localStorage.removeItem('category_usage_v1');
            localStorage.removeItem('canvas_layouts');
        } catch (e) {
            console.log('[index] Error clearing localStorage:', e);
        }
        window.location.href = 'signin.html';
        return;
    }

    initThreadNotes();

    await Promise.all([
        refreshCategoryPalette(),
        updateCategoryList(),
        loadExistingIdeas()
    ]);

    // Real-time listener
    const unsubscribe = subscribeToIdeas((ideas) => {
        state.allIdeas = ideas;
        renderDashboard(ideas);
    });

    window.addEventListener('beforeunload', () => {
        unsubscribe();
        cleanupThreadNotes();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initialize().catch(console.error);
    initCaptureFab();
    initHiddenToggle();
    initResurfaceRefresh();
});

// --- Capture FAB + Overlay ---

function initCaptureFab() {
    captureFab?.addEventListener('click', openCaptureOverlay);
    captureBackdrop?.addEventListener('click', closeCaptureOverlay);

    // Form submit
    $('#ideaForm')?.addEventListener('submit', handleIdeaSave);

    // Auto-resize textarea
    textInput?.addEventListener('input', () => {
        textInput.style.height = 'auto';
        const newHeight = Math.min(Math.max(textInput.scrollHeight, 60), 200);
        textInput.style.height = `${newHeight}px`;
        // Toggle send button visibility
        if (saveBtn) saveBtn.hidden = !textInput.value.trim();
    });

    // Category button (opens dropdown)
    categorySelectBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInputCategoryMenu();
    });

    // Inline category text input — typing directly sets the category
    categoryNew?.addEventListener('input', () => {
        updateCategoryLabel();
    });

    // Close overlay on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && captureOverlay && !captureOverlay.hidden) {
            // If category menu is open, close that first
            const inputCategoryMenu = document.getElementById('inputCategoryMenu');
            if (inputCategoryMenu?.classList.contains('is-open')) {
                closeInputCategoryMenu();
                return;
            }
            closeCaptureOverlay();
        }
    });
}

function openCaptureOverlay() {
    if (!captureOverlay) return;
    captureOverlay.hidden = false;
    captureFab?.classList.add('is-hidden');
    requestAnimationFrame(() => {
        captureOverlay.classList.add('is-open');
        textInput?.focus();
    });
}

function closeCaptureOverlay() {
    if (!captureOverlay) return;
    captureOverlay.classList.remove('is-open');
    captureFab?.classList.remove('is-hidden');
    setTimeout(() => {
        if (!captureOverlay.classList.contains('is-open')) {
            captureOverlay.hidden = true;
        }
    }, 250);
}

async function handleIdeaSave(e) {
    e.preventDefault();
    const text = textInput.value.trim();
    if (!text) return;

    const cat = categoryNew?.value?.trim() || categorySelect?.value?.trim() || '';
    const categories = cat ? [cat] : [];
    const priority = prioritySelect?.value || '';
    const tags = extractTags(text);
    const idea = {
        id: (window.crypto?.randomUUID?.()) || `idea-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text,
        category: categories[0] || '',
        categories,
        tags,
        priority,
        createdAt: Date.now()
    };

    try {
        await saveIdea(idea);
        if (idea.category) trackCategoryUsage(idea.category);
        const manualVal = categoryNew?.value?.trim() || '';
        textInput.value = '';
        textInput.style.height = 'auto';
        if (categoryNew) categoryNew.value = '';
        if (prioritySelect) prioritySelect.value = '';
        updateCategoryLabel();
        await Promise.all([loadExistingIdeas({ force: true }), updateCategoryList(manualVal || idea.category), refreshCategoryPalette()]);
        showToast('Saved!', { tone: 'success', timeout: 1200 });
        closeCaptureOverlay();
    } catch (err) {
        console.error('Unable to save idea', err);
        showToast('Failed to save', { tone: 'error' });
    }
}

// --- Input Category Menu ---

const inputCategoryMenu = document.getElementById('inputCategoryMenu');

function toggleInputCategoryMenu() {
    if (!inputCategoryMenu || !categorySelectBtn) return;
    const isOpen = inputCategoryMenu.classList.contains('is-open');
    if (isOpen) { closeInputCategoryMenu(); return; }
    populateInputCategoryMenu();

    const rect = categorySelectBtn.getBoundingClientRect();
    const availableHeight = rect.top - 16;
    const menuHeight = Math.min(340, availableHeight);
    inputCategoryMenu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    inputCategoryMenu.style.left = `${rect.left}px`;
    inputCategoryMenu.style.top = 'auto';
    inputCategoryMenu.style.maxHeight = `${menuHeight}px`;
    inputCategoryMenu.style.zIndex = '250'; // above capture overlay (z-index: 100)
    inputCategoryMenu.classList.add('is-open');
}

function closeInputCategoryMenu() {
    inputCategoryMenu?.classList.remove('is-open');
}

function populateInputCategoryMenu() {
    if (!inputCategoryMenu) return;
    inputCategoryMenu.innerHTML = '';

    // New category search/create input
    const searchDiv = document.createElement('div');
    searchDiv.className = 'md3-menu__search';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'md3-menu__search-input';
    searchInput.placeholder = 'Search or create category...';
    searchInput.autocomplete = 'off';
    searchDiv.appendChild(searchInput);
    inputCategoryMenu.appendChild(searchDiv);

    const scrollArea = document.createElement('div');
    scrollArea.className = 'md3-menu__scroll';

    const currentCat = categoryNew?.value || '';

    function renderOptions(filter = '') {
        scrollArea.innerHTML = '';
        const term = filter.trim().toLowerCase();

        // Uncategorized option (only when no filter)
        if (!term) {
            const uncatBtn = document.createElement('button');
            uncatBtn.type = 'button';
            uncatBtn.className = 'md3-menu__item';
            uncatBtn.textContent = 'Uncategorized';
            if (!currentCat) uncatBtn.classList.add('is-selected');
            uncatBtn.onclick = () => selectInputCategory('');
            scrollArea.appendChild(uncatBtn);
        }

        const sorted = state.availableCategories
            .filter(c => c !== '__uncategorized__')
            .filter(c => !term || c.toLowerCase().includes(term))
            .sort((a, b) => CATEGORY_COLLATOR.compare(a, b));

        sorted.forEach(cat => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'md3-menu__item';
            btn.textContent = cat;
            if (currentCat === cat) btn.classList.add('is-selected');
            btn.onclick = () => selectInputCategory(cat);
            scrollArea.appendChild(btn);
        });

        // If typed text doesn't match any existing category, show "Create" option
        const exactMatch = term && sorted.some(c => c.toLowerCase() === term);
        if (term && !exactMatch) {
            const divider = document.createElement('div');
            divider.className = 'md3-menu__divider';
            scrollArea.appendChild(divider);

            const createBtn = document.createElement('button');
            createBtn.type = 'button';
            createBtn.className = 'md3-menu__item';
            createBtn.innerHTML = `<strong>Create &ldquo;${escapeHtml(filter.trim())}&rdquo;</strong>`;
            createBtn.onclick = () => selectInputCategory(filter.trim());
            scrollArea.appendChild(createBtn);
        }
    }

    renderOptions();
    inputCategoryMenu.appendChild(scrollArea);

    // Wire up search input
    searchInput.addEventListener('input', () => renderOptions(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = searchInput.value.trim();
            if (val) {
                selectInputCategory(val);
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeInputCategoryMenu();
        }
    });
    // Prevent click from propagating (which would close the menu)
    searchInput.addEventListener('click', (e) => e.stopPropagation());

    // Focus the search input after menu opens
    requestAnimationFrame(() => searchInput.focus());
}

function selectInputCategory(category) {
    if (categoryNew) categoryNew.value = category;
    if (categorySelect) categorySelect.value = category;
    updateCategoryLabel();
    closeInputCategoryMenu();
    textInput?.focus();
}

function updateCategoryLabel() {
    const cat = categoryNew?.value?.trim() || categorySelect?.value?.trim() || '';
    if (categoryLabel) categoryLabel.textContent = cat || 'Category';
    if (categorySelectBtn) {
        categorySelectBtn.classList.toggle('has-category', !!cat);
    }
}

// Close input menu on global click
document.addEventListener('click', (e) => {
    if (inputCategoryMenu?.classList.contains('is-open')) {
        if (!inputCategoryMenu.contains(e.target) && !categorySelectBtn?.contains(e.target)) {
            closeInputCategoryMenu();
        }
    }
    // Category dropdown outside click
    if (categoryEditDropdown && !categoryEditDropdown.hidden) {
        const dropdownAnchor = categoryDropdown.getAnchor();
        const isAnchor = dropdownAnchor && (dropdownAnchor === e.target || dropdownAnchor.contains?.(e.target));
        if (!categoryEditDropdown.contains(e.target) && !isAnchor) categoryDropdown.close();
    }
});

// --- Hidden Section Toggle ---

function initHiddenToggle() {
    hiddenToggle?.addEventListener('click', () => {
        state.hiddenExpanded = !state.hiddenExpanded;
        hiddenToggle.setAttribute('aria-expanded', state.hiddenExpanded ? 'true' : 'false');
        hiddenFeed.hidden = !state.hiddenExpanded;
        hiddenToggle.closest('.dash-section')?.classList.toggle('is-expanded', state.hiddenExpanded);
    });
}

// --- Resurface ---

function initResurfaceRefresh() {
    resurfaceRefresh?.addEventListener('click', () => {
        pickResurfaceIdea(true);
        renderResurfaceSection();
    });
}

function getResurfaceShownIds() {
    try {
        return JSON.parse(localStorage.getItem(RESURFACE_SHOWN_KEY) || '[]');
    } catch { return []; }
}

function addResurfaceShownId(id) {
    try {
        const shown = getResurfaceShownIds();
        shown.push(id);
        // Keep last 50 to avoid stale data
        localStorage.setItem(RESURFACE_SHOWN_KEY, JSON.stringify(shown.slice(-50)));
    } catch { /* ignore */ }
}

function pickResurfaceIdea(forceNew = false) {
    const now = Date.now();
    const minAge = RESURFACE_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
    const candidates = state.allIdeas.filter(i =>
        !i.archived && !i.hidden && !i.pinned &&
        (now - (Number(i.createdAt) || 0)) >= minAge
    );

    if (!candidates.length) {
        state.resurfaceIdea = null;
        return;
    }

    const shownIds = new Set(getResurfaceShownIds());
    let pool = candidates.filter(i => !shownIds.has(i.id));

    // If all have been shown, reset
    if (!pool.length) {
        try { localStorage.removeItem(RESURFACE_SHOWN_KEY); } catch { /* ignore */ }
        pool = candidates;
    }

    // Pick a random one
    const idx = Math.floor(Math.random() * pool.length);
    state.resurfaceIdea = pool[idx];

    if (state.resurfaceIdea && forceNew) {
        addResurfaceShownId(state.resurfaceIdea.id);
    }
}

// --- Dashboard Rendering ---

function renderDashboard(ideas) {
    const ordered = [...ideas].sort((a, b) => a.createdAt - b.createdAt);
    const activePool = ordered.filter(i => !i.archived && !i.hidden);
    computeCategoryUsage(activePool);

    const pinnedIdeas = activePool.filter(i => i.pinned);
    const hiddenIdeas = ordered.filter(i => !i.archived && i.hidden);

    renderPinnedSection(pinnedIdeas);

    // Pick resurface idea if we don't have one yet
    if (!state.resurfaceIdea) pickResurfaceIdea();
    renderResurfaceSection();

    renderHiddenSection(hiddenIdeas);
}

function renderPinnedSection(pinnedIdeas) {
    if (!pinnedFeed || !pinnedSection) return;

    // Sort: most recently pinned/created first
    const sorted = [...pinnedIdeas].sort((a, b) => (b.pinnedAt || b.createdAt) - (a.pinnedAt || a.createdAt));

    if (pinnedCount) pinnedCount.textContent = sorted.length ? `${sorted.length}` : '';

    if (!sorted.length) {
        pinnedFeed.innerHTML = '<p class="dash-empty">Pin your important ideas to see them here.</p>';
        return;
    }

    renderIdeaList(pinnedFeed, sorted, { hiddenView: false });
}

function renderResurfaceSection() {
    if (!resurfaceFeed || !resurfaceSection) return;

    if (!state.resurfaceIdea) {
        resurfaceSection.hidden = true;
        return;
    }

    resurfaceSection.hidden = false;
    resurfaceFeed.innerHTML = '';

    const idea = state.resurfaceIdea;
    const daysAgo = Math.floor((Date.now() - (Number(idea.createdAt) || 0)) / (24 * 60 * 60 * 1000));
    const timeLabel = daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;

    // Wrap idea-bubble in a resurface card container
    const card = document.createElement('div');
    card.className = 'resurface-card';

    // Days-ago badge
    const timeBadge = document.createElement('div');
    timeBadge.className = 'resurface-card__time';
    timeBadge.textContent = timeLabel;
    card.appendChild(timeBadge);

    // Build idea-bubble (same component as pinned/hidden sections)
    const bubble = buildIdeaElement(idea, { hiddenView: false });
    card.appendChild(bubble);

    // Dismiss button at bottom of resurface card
    const actionsBar = document.createElement('div');
    actionsBar.className = 'resurface-card__actions';
    actionsBar.innerHTML = `<button type="button" class="md3-button-text resurface-card__dismiss" data-id="${idea.id}">Dismiss</button>`;
    card.appendChild(actionsBar);

    // Dismiss handler
    actionsBar.querySelector('.resurface-card__dismiss')?.addEventListener('click', () => {
        addResurfaceShownId(idea.id);
        pickResurfaceIdea(true);
        renderResurfaceSection();
    });

    resurfaceFeed.appendChild(card);

    // Attach thread after appending to DOM
    attachThread(bubble, idea.id);
}

function renderHiddenSection(hiddenIdeas) {
    if (!hiddenFeed || !hiddenSection) return;

    if (!hiddenIdeas.length) {
        hiddenSection.hidden = true;
        return;
    }

    hiddenSection.hidden = false;
    if (hiddenCount) hiddenCount.textContent = `${hiddenIdeas.length}`;

    if (state.hiddenExpanded) {
        renderIdeaList(hiddenFeed, hiddenIdeas, { hiddenView: true });
    }
}

// --- Shared Idea List Renderer ---

function getIdeaCategoriesList(idea) {
    return Array.isArray(idea?.categories)
        ? idea.categories.filter(Boolean)
        : (idea?.category ? [idea.category] : []);
}

function computeCategoryUsage(ideas) {
    state.categoryUsage = {};
    ideas.forEach(idea => {
        const ts = Number(idea.createdAt) || 0;
        const cats = getIdeaCategoriesList(idea);
        if (!cats.length) {
            state.categoryUsage['__uncategorized__'] = Math.max(state.categoryUsage['__uncategorized__'] || 0, ts);
        }
        cats.forEach(cat => {
            const key = (cat || '').trim().toLowerCase();
            if (key) state.categoryUsage[key] = Math.max(state.categoryUsage[key] || 0, ts);
        });
    });
}

const PRIORITY_BADGES = {
    urgent: '\u{1F534}',
    high: '\u{1F7E0}',
    medium: '\u{1F7E1}',
    low: '\u26AA'
};
const PRIORITY_CYCLE = ['', 'urgent', 'high', 'medium', 'low'];

function buildIdeaElement(idea, { hiddenView = false } = {}) {
    const ideaEl = document.createElement('div');
    ideaEl.className = 'idea-bubble';
    if (idea.pinned) ideaEl.classList.add('is-pinned');
    if (idea.priority) ideaEl.classList.add(`priority-${idea.priority}`);

    const createdAt = Number(idea.createdAt) || 0;
    const olderThanDay = (Date.now() - createdAt) > 24 * 60 * 60 * 1000;
    const timeMarkup = olderThanDay
        ? `${new Date(createdAt).toLocaleDateString([], { month: '2-digit', day: '2-digit' })} ${formatTime(createdAt)}`
        : formatTime(createdAt);

    const currentPriority = idea.priority || '';
    const priorityEmoji = PRIORITY_BADGES[currentPriority] || '\u26AB';
    const priorityTitle = currentPriority
        ? `${currentPriority.charAt(0).toUpperCase() + currentPriority.slice(1)} priority - click to change`
        : 'No priority - click to set';
    const priorityButton = `<button type="button" class="priority-dot" data-id="${idea.id}" data-priority="${currentPriority}" title="${priorityTitle}" aria-label="${priorityTitle}">${priorityEmoji}</button>`;

    const pinIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l3.5 3.5h-2v6l2.5 2.5v1.5l-4-2.3-4 2.3v-1.5L10.5 13V7H8.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"></path></svg>`;
    const threadIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-4.5L12 21l-2.5-3.5H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M8.5 9.5h7M8.5 13h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>`;

    ideaEl.innerHTML = `
        <div class="idea-body">
            <div class="idea-header">
                <div class="category-chip-group" data-idea-id="${idea.id}">
                    <div class="category-chip-list"></div>
                    <button type="button" class="category-add-btn" data-category-add-trigger="${idea.id}" aria-label="Add category" aria-haspopup="dialog"><span aria-hidden="true">+</span></button>
                </div>
                <div class="idea-meta">
                    ${priorityButton}
                    <div class="idea-time">${timeMarkup}</div>
                </div>
            </div>
            <p class="idea-text">${formatTextContent(idea.text)}</p>
            <div class="idea-footer">
                <div class="idea-actions">
                    <button type="button" class="idea-pin${idea.pinned ? ' is-active' : ''}" data-id="${idea.id}" data-pinned="${idea.pinned}" aria-pressed="${idea.pinned}" aria-label="${idea.pinned ? 'Unpin idea' : 'Pin idea'}">${pinIcon}</button>
                    <button type="button" class="idea-thread" data-thread-id="${idea.id}" aria-label="Toggle notes">${threadIcon}</button>
                </div>
                <button type="button" class="idea-hide" data-id="${idea.id}" data-action="${hiddenView ? 'unhide' : 'hide'}" aria-label="${hiddenView ? 'Unhide idea' : 'Hide idea'}">${hiddenView ? 'Unhide' : 'Hide'}</button>
            </div>
        </div>`;

    renderCategoryChipElements(ideaEl.querySelector('.category-chip-list'), getIdeaCategoriesList(idea));
    attachThread(ideaEl, idea.id);

    return ideaEl;
}

function renderCategoryChipElements(container, categories) {
    if (!container) return;
    container.innerHTML = '';
    const normalized = normalizeCategories(categories || []);
    const ideaId = container.closest('.category-chip-group')?.dataset.ideaId || '';

    if (!normalized.length) {
        const chip = document.createElement('span');
        chip.className = 'category-chip uncategorized';
        chip.textContent = 'Uncategorized';
        chip.dataset.categoryChip = ideaId;
        chip.dataset.ideaId = ideaId;
        chip.dataset.categoryName = '__uncategorized__';
        chip.style.cursor = 'pointer';
        container.appendChild(chip);
        return;
    }

    normalized.forEach(cat => {
        const appearance = getCategoryAppearance(cat, state.categoryPalette);
        const chip = document.createElement('span');
        chip.className = ['category-chip', appearance.classes].filter(Boolean).join(' ');
        if (appearance?.style) {
            appearance.style.split(';').forEach(rule => {
                const [p, v] = rule.split(':');
                if (p && v) chip.style.setProperty(p.trim(), v.trim());
            });
        }
        chip.textContent = cat;
        chip.dataset.categoryChip = ideaId;
        chip.dataset.ideaId = ideaId;
        chip.dataset.categoryName = cat;
        chip.style.cursor = 'pointer';
        container.appendChild(chip);
    });
}

function renderIdeaList(container, list, { hiddenView = false } = {}) {
    categoryDropdown.close();
    container.innerHTML = '';

    if (!list.length) {
        container.innerHTML = `<p class="dash-empty">${hiddenView ? 'Hidden items will appear here.' : 'Nothing here yet.'}</p>`;
        return;
    }

    container.setAttribute('data-swipe-container', 'true');

    list.forEach(idea => {
        const row = document.createElement('div');
        row.className = 'idea-row';
        row.dataset.id = idea.id;

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

        const bubble = buildIdeaElement(idea, { hiddenView });
        row.appendChild(bubble);
        container.appendChild(row);
    });

    initSwipeGestures(container, {
        onEdit: (row, ideaId) => openInlineEditor(row, ideaId),
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
                            } catch { showToast('Failed to undo', { tone: 'error' }); }
                        }
                    }
                });
            } catch (err) {
                console.error('Failed to archive idea:', err);
                row.style.opacity = '';
                row.style.pointerEvents = '';
                showToast('Failed to archive', { tone: 'error' });
            }
        }
    });
}

// --- Inline Editor ---

function openInlineEditor(row, ideaId) {
    const bubble = row.querySelector('.idea-bubble');
    if (!bubble) return;
    if (bubble.querySelector('.inline-edit')) return;

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
            textEl.innerHTML = formatTextContent(newText);
            showToast('Saved', { timeout: 1500 });
        } catch (err) {
            console.error('Failed to update idea:', err);
            showToast('Failed to save', { tone: 'error' });
        }
        closeInlineEditor(row);
    });

    editor.querySelector('[data-cancel-edit]').addEventListener('click', () => closeInlineEditor(row));

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeInlineEditor(row);
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) editor.querySelector('[data-save-idea]').click();
    });
}

function closeInlineEditor(row) {
    const bubble = row.querySelector('.idea-bubble');
    const editor = bubble?.querySelector('.inline-edit');
    const textEl = bubble?.querySelector('.idea-text');
    if (editor) editor.remove();
    if (textEl) textEl.hidden = false;
}

// --- Category Dropdown Controller ---

const categoryDropdown = createCategoryDropdownController({
    getDropdown: () => categoryEditDropdown,
    getContent: () => categoryEditDropdownContent,
    findIdea: (id) => state.allIdeas.find(i => i.id === id),
    getIdeaCategories: (idea) => getIdeaCategoriesList(idea),
    getAvailableCategories: () => state.availableCategories,
    onCategoriesChanged: () => Promise.all([loadExistingIdeas({ force: true }), updateCategoryList(), refreshCategoryPalette({ force: true })]),
    collator: CATEGORY_COLLATOR,
});

// --- Storage / Data ---

async function refreshCategoryPalette(options = {}) {
    try {
        state.categoryPalette = await getCategoryPalette({ force: !!options.force }) || {};
        if (state.allIdeas.length) renderDashboard(state.allIdeas);
    } catch (e) {
        console.error('Unable to load category palette', e);
    }
}

async function updateCategoryList() {
    const categories = await getCategories();
    const paletteCategories = Object.keys(state.categoryPalette || {});
    const combined = Array.from(new Set([...categories, ...paletteCategories])).filter(Boolean);
    state.availableCategories = combined.slice();

    const sorted = getCategoriesByRecentUsage(combined);
    const current = categorySelect?.value;

    if (categorySelect) {
        categorySelect.innerHTML = '<option value="">Choose category...</option>';
        sorted.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            categorySelect.appendChild(opt);
        });
        if (current && combined.includes(current)) categorySelect.value = current;
        else categorySelect.value = '';
    }

    updateCategoryLabel();
}

async function loadExistingIdeas(options = {}) {
    state.allIdeas = await getIdeas(options);
    renderDashboard(state.allIdeas);
}

// --- Event Delegation for Idea Interactions ---

document.addEventListener('click', (e) => {
    const target = e.target;

    // Pin button
    const pinBtn = target.closest('.idea-pin');
    if (pinBtn) {
        const id = pinBtn.dataset.id;
        const isPinned = pinBtn.dataset.pinned === 'true';
        pinBtn.disabled = true;
        setIdeaPinned(id, !isPinned)
            .then(() => loadExistingIdeas({ force: true }))
            .catch(err => console.error('Unable to pin', err))
            .finally(() => { pinBtn.disabled = false; });
        return;
    }

    // Hide/Unhide button
    const hideBtn = target.closest('.idea-hide');
    if (hideBtn) {
        const id = hideBtn.dataset.id;
        const action = hideBtn.dataset.action;
        hideBtn.disabled = true;
        setIdeaHidden(id, action === 'hide')
            .then(() => loadExistingIdeas({ force: true }))
            .catch(err => console.error('Unable to hide', err))
            .finally(() => { hideBtn.disabled = false; });
        return;
    }

    // Priority dot click
    const priorityDot = target.closest('.priority-dot');
    if (priorityDot) {
        const id = priorityDot.dataset.id;
        const currentPriority = priorityDot.dataset.priority || '';
        const currentIndex = PRIORITY_CYCLE.indexOf(currentPriority);
        const nextIndex = (currentIndex + 1) % PRIORITY_CYCLE.length;
        const nextPriority = PRIORITY_CYCLE[nextIndex];

        priorityDot.disabled = true;
        updateIdeaPriority(id, nextPriority)
            .then(() => {
                priorityDot.textContent = PRIORITY_BADGES[nextPriority] || '\u26AB';
                priorityDot.dataset.priority = nextPriority;
                const bubble = priorityDot.closest('.idea-bubble');
                if (bubble) {
                    PRIORITY_CYCLE.forEach(p => bubble.classList.remove(`priority-${p}`));
                    if (nextPriority) bubble.classList.add(`priority-${nextPriority}`);
                }
                showToast(nextPriority ? `Priority: ${nextPriority}` : 'Priority cleared', { timeout: 1000 });
            })
            .catch(err => console.error('Unable to update priority', err))
            .finally(() => { priorityDot.disabled = false; });
        return;
    }

    // Category chip click
    const chip = target.closest('[data-category-chip]');
    if (chip) {
        categoryDropdown.open(chip.dataset.categoryChip, chip, { mode: 'replace', targetCategory: chip.dataset.categoryName || '' });
        return;
    }
    const addTrig = target.closest('[data-category-add-trigger]');
    if (addTrig) {
        categoryDropdown.open(addTrig.dataset.categoryAddTrigger, addTrig, { mode: 'multi' });
        return;
    }
});

// Thread click handler
document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.idea-thread');
    if (trigger && trigger.dataset.threadId) {
        e.stopPropagation();
        const ideaEl = trigger.closest('.idea-bubble, .idea-row');
        toggleThread(trigger.dataset.threadId, ideaEl);
        return;
    }

    // Desktop: click idea bubble → open in detail pane
    if (window.innerWidth < 1024) return;
    const ideaBubble = e.target.closest('.idea-bubble');
    if (!ideaBubble) return;
    const interactiveElement = e.target.closest('button, a, input, textarea, select, .category-chip, .inline-edit, .swipe-btn');
    if (interactiveElement) return;
    const threadBtn = ideaBubble.querySelector('.idea-thread');
    if (threadBtn && threadBtn.dataset.threadId) {
        toggleThread(threadBtn.dataset.threadId, ideaBubble);
    }
});

// --- Keyboard Shortcuts ---

document.addEventListener('keydown', (e) => {
    const isMeta = e.metaKey || e.ctrlKey;

    // Cmd/Ctrl + Enter - Save idea
    if (isMeta && e.key === 'Enter' && textInput && document.activeElement === textInput) {
        e.preventDefault();
        document.querySelector('#ideaForm')?.requestSubmit();
        return;
    }

    // Cmd/Ctrl + N - Open capture overlay
    if (isMeta && e.key === 'n') {
        e.preventDefault();
        openCaptureOverlay();
        return;
    }

    // Escape is handled in initCaptureFab
    if (e.key === 'Escape') {
        if (!categoryEditDropdown?.hidden) {
            categoryDropdown.close();
            return;
        }
    }
});

// --- Visibility Change ---

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        loadExistingIdeas({ force: true }).catch(console.error);
        updateCategoryList().catch(console.error);
        refreshCategoryPalette({ force: true }).catch(console.error);
    }
});

window.addEventListener('categoryDeleted', () => Promise.all([updateCategoryList(), loadExistingIdeas({ force: true }), refreshCategoryPalette({ force: true })]));
window.addEventListener('categoryPaletteUpdated', () => refreshCategoryPalette({ force: true }));

// --- Theme Toggle ---
const THEME_KEY = 'bot_theme_v1';

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
}

function initThemeToggle() {
    // Restore saved preference, default to dark
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);

    const btn = document.getElementById('themeToggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });
}

initThemeToggle();
