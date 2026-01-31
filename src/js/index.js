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
    getPendingMutationCount,
    getUserSettings
} from '../lib/storage.js';
import {
    escapeHtml,
    getReadableTextColor,
    getCategoryAppearance,
    formatTime,
    HEX_COLOR_PATTERN,
    normalizeCategories
} from '../lib/utils.js';
import { getCurrentUserId, ensureAuthSession } from '../lib/auth.js';
import { ThreadManager } from './thread-ui.js';
import { showToast } from '../lib/toast.js';
import { createCategoryDropdownController } from './category-dropdown.js';

// --- Constants & Config ---
const TAB_ORDER = ['focus', 'main', 'hidden'];
const FOCUS_CATEGORY_KEY = 'focus_feed_category_v1';
const CATEGORY_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });
const SWIPE_IGNORE_SELECTOR = 'button, a, input, textarea, select, label, [role="button"], .idea-pin, .idea-thread, .focus-category-toggle, .category-add-btn, .focus-category-menu, .category-add-menu, .category-chip, [data-category-chip]';

// --- DOM Elements ---
const $ = sel => document.querySelector(sel);

// Feeds & Containers
const pinnedContainer = $('#pinnedIdeaContainer');
const mainFeed = $('#ideasFeed');
const hiddenFeed = $('#hiddenIdeasFeed');
const focusFeed = $('#focusFeed');
const feedCarousel = $('#feedCarousel');
const feedSlider = $('#feedSlider');
const feedTabs = Array.from(document.querySelectorAll('.feed-tab'));
const feedPanels = Array.from(document.querySelectorAll('.feed-panel'));

// Capture Form
const textInput = $('#text');
const categorySelect = $('#categorySelect');
const categoryNew = $('#categoryNew');
const categoryRow = categoryNew?.closest('.category-row');
const categorySelectWrap = categorySelect?.closest('.select-wrap');
const categoryIcon = document.querySelector('.select-wrap.icon-only');
const saveBtn = document.querySelector('.save-btn');
const captureLayout = document.querySelector('.capture-layout');

// Notifications & Sync
const pendingSyncIndicator = document.getElementById('pendingSyncIndicator');
const pendingSyncCount = document.getElementById('pendingSyncCount');
const pendingSyncLabelText = document.getElementById('pendingSyncLabelText');
const syncStatusToast = document.getElementById('syncStatusToast');

// Focus Mode Elements
const focusCategoryToggle = document.getElementById('tab-focus');
const focusCategoryMenu = document.getElementById('focusCategoryMenu');
const focusTabLabel = document.getElementById('focusTabLabel');
const focusCategoryLabel = focusTabLabel;

// Category Edit Dropdown
const categoryEditDropdown = document.getElementById('categoryEditDropdown');
const categoryEditDropdownContent = document.getElementById('categoryEditDropdownContent');

// --- Global State ---
let state = {
    activeTab: 'main',
    focusCategory: '',
    allIdeas: [],
    availableCategories: [],
    categoryPalette: {},
    categoryUsage: {},
    syncStatusToastTimer: null,
    hadPendingMutations: false,
    userSettings: null,
    swipe: {
        startX: 0,
        currentX: 0,
        startTime: 0,
        active: false,
        pointerType: ''
    }
};

// --- Initialization ---
async function initialize() {
    const userId = await getCurrentUserId();
    if (!userId) {
        window.location.href = 'signin.html';
        return;
    }

    try {
        await ensureAuthSession({ requireAuth: true });
    } catch (error) {
        window.location.href = 'signin.html';
        return;
    }

    // Initial load
    const settings = await getUserSettings();
    state.userSettings = settings;

    await Promise.all([
        refreshCategoryPalette(),
        updateCategoryList(),
        loadExistingIdeas()
    ]);

    setActiveTab(state.activeTab);

    // Set up real-time listener for ideas
    const unsubscribe = subscribeToIdeas((ideas) => {
        state.allIdeas = ideas;
        renderFeeds(ideas);
    });

    window.addEventListener('beforeunload', () => unsubscribe());
}

// Load focus category from storage
try {
    const storedFocus = localStorage.getItem(FOCUS_CATEGORY_KEY);
    if (storedFocus) state.focusCategory = storedFocus;
} catch (e) {
    state.focusCategory = '';
}

// Ensure category suggestions container exists
let categorySuggestions = document.getElementById('categorySuggestions');
if (!categorySuggestions && categoryRow) {
    categorySuggestions = document.createElement('div');
    categorySuggestions.id = 'categorySuggestions';
    categorySuggestions.className = 'category-suggestions';
    categorySuggestions.hidden = true;
    categorySuggestions.setAttribute('role', 'listbox');
    categoryRow.appendChild(categorySuggestions);
}

// --- UI Helper Functions ---

function showSyncStatusToast(message, variant = 'info') {
    if (!syncStatusToast) return;
    syncStatusToast.textContent = message;
    syncStatusToast.dataset.variant = variant;
    syncStatusToast.hidden = false;

    if (state.syncStatusToastTimer) clearTimeout(state.syncStatusToastTimer);
    state.syncStatusToastTimer = window.setTimeout(() => {
        syncStatusToast.hidden = true;
        delete syncStatusToast.dataset.variant;
    }, 2400);
}

function updatePendingSyncOfflineState() {
    if (!pendingSyncIndicator) return;
    const isOffline = navigator.onLine === false;
    pendingSyncIndicator.classList.toggle('is-offline', isOffline);
    if (!pendingSyncIndicator.hidden && pendingSyncLabelText) {
        pendingSyncLabelText.textContent = isOffline ? 'Offline changes' : 'Changes queued';
    }
}

function updatePendingSyncIndicator(count) {
    if (!pendingSyncIndicator || !pendingSyncCount) return;
    const pendingCount = Math.max(0, Number(count) || 0);
    const hasPending = pendingCount > 0;

    pendingSyncCount.textContent = pendingCount.toString();
    pendingSyncIndicator.hidden = !hasPending;
    pendingSyncIndicator.classList.toggle('has-pending', hasPending);

    if (hasPending && pendingSyncLabelText) {
        pendingSyncLabelText.textContent = navigator.onLine === false ? 'Offline changes' : 'Changes queued';
    }

    if (hasPending) {
        state.hadPendingMutations = true;
    } else if (state.hadPendingMutations) {
        state.hadPendingMutations = false;
        showSyncStatusToast('All changes synced', 'success');
    }
}

function setupPendingSyncUI() {
    if (!pendingSyncIndicator) return;
    updatePendingSyncIndicator(getPendingMutationCount());
    updatePendingSyncOfflineState();

    window.addEventListener('ideasMutationQueueChanged', (e) => {
        updatePendingSyncIndicator(e?.detail?.count ?? 0);
    });
    window.addEventListener('online', updatePendingSyncOfflineState);
    window.addEventListener('offline', () => {
        updatePendingSyncOfflineState();
        if (pendingSyncIndicator.hidden) {
            showSyncStatusToast('Offline mode – ideas will sync when you reconnect', 'info');
        }
    });
}

function toggleSaveButton() {
    if (saveBtn) {
        saveBtn.hidden = textInput.value.trim().length === 0;
    }
}

function refreshCategoryIndicator() {
    const manual = categoryNew.value.trim();
    const preset = categorySelect.value;
    const label = manual
        ? manual.slice(0, 2).toUpperCase()
        : (preset ? preset.slice(0, 2).toUpperCase() : '#');
    if (categoryIcon) {
        categoryIcon.dataset.label = label || '#';
    }
}

// --- Category Logic ---

function hideCategorySuggestions() {
    if (categorySuggestions) {
        categorySuggestions.hidden = true;
        categorySuggestions.innerHTML = '';
        categorySuggestions.removeAttribute('data-state');
    }
}

function getCategoryUsageScore(name) {
    const key = (name || '').trim().toLowerCase();
    if (!key) return 0;
    return state.categoryUsage[key] || 0;
}

function getMatchingCategories(query) {
    const trimmed = (query || '').trim().toLowerCase();
    if (!state.availableCategories.length) return [];

    const sortedByUsage = state.availableCategories.filter(Boolean).sort((a, b) => {
        const diff = getCategoryUsageScore(b) - getCategoryUsageScore(a);
        return diff !== 0 ? diff : CATEGORY_COLLATOR.compare(a, b);
    });

    if (!trimmed) return sortedByUsage;

    return sortedByUsage
        .filter(cat => cat.toLowerCase().includes(trimmed))
        .sort((a, b) => {
            const aStarts = a.toLowerCase().startsWith(trimmed);
            const bStarts = b.toLowerCase().startsWith(trimmed);
            if (aStarts !== bStarts) return aStarts ? -1 : 1;
            const diff = getCategoryUsageScore(b) - getCategoryUsageScore(a);
            return diff !== 0 ? diff : CATEGORY_COLLATOR.compare(a, b);
        });
}

function updateCategorySuggestions(query) {
    if (!categorySuggestions || (state.activeTab === 'focus' && state.focusCategory && state.focusCategory !== '__uncategorized__')) {
        hideCategorySuggestions();
        return [];
    }
    const matches = getMatchingCategories(query).slice(0, 6);
    if (!matches.length) {
        hideCategorySuggestions();
        return matches;
    }

    categorySuggestions.innerHTML = '';
    matches.forEach(category => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-suggestion';
        button.textContent = category;
        button.setAttribute('role', 'option');
        button.addEventListener('click', () => {
            categoryNew.value = category;
            categorySelect.value = '';
            refreshCategoryIndicator();
            hideCategorySuggestions();
            categoryNew.focus({ preventScroll: true });
        });
        categorySuggestions.appendChild(button);
    });
    categorySuggestions.hidden = false;
    categorySuggestions.setAttribute('data-state', 'visible');
    return matches;
}

function syncCategoryFormToFocus() {
    const shouldFix = state.activeTab === 'focus' && state.focusCategory && state.focusCategory !== '__uncategorized__';
    if (!shouldFix || !categorySelect) {
        hideCategorySuggestions();
        return;
    }

    const target = state.focusCategory.trim();
    const options = Array.from(categorySelect.options);
    let match = options.find(opt => opt.value.trim().toLowerCase() === target.toLowerCase());

    if (!match) {
        match = document.createElement('option');
        match.value = target;
        match.textContent = target;
        categorySelect.appendChild(match);
    }
    categorySelect.value = match.value;
    if (categoryNew) categoryNew.value = '';
    refreshCategoryIndicator();
    hideCategorySuggestions();
}

function updateCategoryFormVisibility() {
    const hideControls = state.activeTab === 'focus';
    if (categoryRow) categoryRow.hidden = hideControls;
    if (categorySelectWrap) categorySelectWrap.hidden = hideControls;

    if (categorySelect) {
        categorySelect.disabled = hideControls;
        hideControls ? categorySelect.setAttribute('aria-hidden', 'true') : categorySelect.removeAttribute('aria-hidden');
    }
    if (categoryNew) {
        categoryNew.disabled = hideControls;
        if (hideControls) {
            categoryNew.setAttribute('aria-hidden', 'true');
            hideCategorySuggestions();
        } else {
            categoryNew.removeAttribute('aria-hidden');
        }
    }
    refreshCategoryIndicator();
}

async function updateCategoryList(preferredCategory) {
    const categories = await getCategories();
    const paletteCategories = Object.keys(state.categoryPalette || {});
    const combined = Array.from(new Set([...categories, ...paletteCategories])).filter(Boolean);
    state.availableCategories = combined.slice();

    const sorted = getCategoriesByRecentUsage(combined);
    const current = preferredCategory !== undefined ? preferredCategory : categorySelect.value;

    categorySelect.innerHTML = '<option value="">Choose category…</option>';
    sorted.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
    });

    if (current && combined.includes(current)) {
        categorySelect.value = current;
    } else {
        categorySelect.value = '';
    }
    refreshCategoryIndicator();

    // Validate focus category exists
    const focusLower = state.focusCategory && state.focusCategory !== '__uncategorized__' ? state.focusCategory.toLowerCase() : null;
    if (focusLower) {
        const catSetLower = new Set(combined.map(c => c.toLowerCase()));
        if (!catSetLower.has(focusLower)) {
            state.focusCategory = '';
            try { localStorage.removeItem(FOCUS_CATEGORY_KEY); } catch (e) { }
        }
    }

    updateFocusCategoryLabel();
    if (state.allIdeas.length) renderFeeds(state.allIdeas);
    syncCategoryFormToFocus();

    if (categoryNew?.value.trim() && state.activeTab !== 'focus') {
        updateCategorySuggestions(categoryNew.value.trim());
    } else {
        hideCategorySuggestions();
    }
}

// --- Feed Rendering & Logic ---

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

function isCategoryHiddenOnActive(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return false;
    const entry = state.categoryPalette[trimmed];
    return entry && entry.visible === false;
}

function shouldHideFromActiveFeed(idea) {
    const cats = getIdeaCategoriesList(idea);
    if (!cats.length) return isCategoryHiddenOnActive('__uncategorized__');
    return cats.some(cat => isCategoryHiddenOnActive(cat));
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

function buildIdeaElement(idea, { hiddenView = false } = {}) {
    const ideaEl = document.createElement('div');
    ideaEl.className = 'idea-bubble';
    if (idea.pinned) ideaEl.classList.add('is-pinned');

    const createdAt = Number(idea.createdAt) || 0;
    const olderThanDay = (Date.now() - createdAt) > 24 * 60 * 60 * 1000;
    const timeMarkup = olderThanDay ? `${new Date(createdAt).toLocaleDateString([], { month: '2-digit', day: '2-digit' })} ${formatTime(createdAt)}` : formatTime(createdAt);

    const pinIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l3.5 3.5h-2v6l2.5 2.5v1.5l-4-2.3-4 2.3v-1.5L10.5 13V7H8.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"></path></svg>`;
    const threadIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-4.5L12 21l-2.5-3.5H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M8.5 9.5h7M8.5 13h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>`;

    ideaEl.innerHTML = `
        <div class="idea-body">
            <div class="idea-header">
                <div class="category-chip-group" data-idea-id="${idea.id}">
                    <div class="category-chip-list"></div>
                    <button type="button" class="category-add-btn" data-category-add-trigger="${idea.id}" aria-label="Add category" aria-haspopup="dialog"><span aria-hidden="true">+</span></button>
                </div>
                <div class="idea-time">${timeMarkup}</div>
            </div>
            <p class="idea-text">${escapeHtml(idea.text)}</p>
            <div class="idea-footer">
                <div class="idea-actions">
                    ${!hiddenView ? `<button type="button" class="idea-pin${idea.pinned ? ' is-active' : ''}" data-id="${idea.id}" data-pinned="${idea.pinned}" aria-pressed="${idea.pinned}" aria-label="${idea.pinned ? 'Unpin idea' : 'Pin idea'}">${pinIcon}</button>` : ''}
                    ${!hiddenView ? `<button type="button" class="idea-thread" data-thread-id="${idea.id}" aria-label="Open thread">${threadIcon}</button>` : ''}
                </div>
                <button type="button" class="idea-hide" data-id="${idea.id}" data-action="${hiddenView ? 'unhide' : 'hide'}" aria-label="${hiddenView ? 'Unhide idea' : 'Hide idea'}">${hiddenView ? 'Unhide' : 'Hide'}</button>
            </div>
        </div>`;

    renderCategoryChipElements(ideaEl.querySelector('.category-chip-list'), getIdeaCategoriesList(idea));
    return ideaEl;
}

function renderFeedList(container, list, { hiddenView = false, autoScroll = false, suppressEmpty = false } = {}) {
    categoryDropdown.close();
    const prevScrollTop = container.scrollTop;
    const isAtBottom = container.scrollHeight - (container.scrollTop + container.clientHeight) < 16;
    container.innerHTML = '';

    if (!list.length) {
        if (!suppressEmpty) {
            container.innerHTML = `<p class="feed-empty">${hiddenView ? 'Hidden items will appear here.' : 'Nothing here right now.'}</p>`;
        }
        return;
    }

    list.forEach(idea => {
        const bubble = buildIdeaElement(idea, { hiddenView });
        const row = document.createElement('div');
        row.className = 'idea-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'idea-complete';
        checkbox.dataset.id = idea.id;
        checkbox.setAttribute('aria-label', 'Mark idea as completed');
        row.append(checkbox, bubble);
        container.appendChild(row);
    });

    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    if (autoScroll && isAtBottom) {
        container.scrollTop = maxScroll;
    } else if (autoScroll || !hiddenView) {
        container.scrollTop = Math.min(prevScrollTop, maxScroll);
    }
}

function renderFocusFeed(activeIdeas, pinnedIdea) {
    if (!focusFeed) return;
    if (!state.focusCategory) {
        focusFeed.innerHTML = '<p class="feed-empty">Pick a category to focus.</p>';
        return;
    }

    const pinnedId = pinnedIdea?.id;
    const matchList = activeIdeas.filter(idea => {
        if (pinnedId && idea.id === pinnedId) return false;
        const cats = getIdeaCategoriesList(idea).map(c => (c || '').trim().toLowerCase());
        return state.focusCategory === '__uncategorized__' ? cats.length === 0 : cats.includes(state.focusCategory.toLowerCase());
    });

    if (!matchList.length) {
        focusFeed.innerHTML = '<p class="feed-empty">No notes in this category yet.</p>';
        return;
    }

    focusFeed.scrollTop = 0;
    renderFeedList(focusFeed, matchList, { hiddenView: false, autoScroll: state.activeTab === 'focus' });
}

function renderPinnedIdea(idea) {
    if (!pinnedContainer) return;
    pinnedContainer.innerHTML = '';
    if (!idea || idea.archived || idea.hidden) {
        pinnedContainer.hidden = true;
        return;
    }
    pinnedContainer.hidden = false;
    const row = document.createElement('div');
    row.className = 'idea-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'idea-complete';
    checkbox.dataset.id = idea.id;
    checkbox.setAttribute('aria-label', 'Mark idea as completed');
    row.append(checkbox, buildIdeaElement(idea));
    pinnedContainer.append(row);
}

function renderFeeds(ideas) {
    const ordered = [...ideas].sort((a, b) => a.createdAt - b.createdAt);
    const activePool = ordered.filter(i => !i.archived && !i.hidden);
    computeCategoryUsage(activePool);

    const pinnedIdea = activePool.find(i => i.pinned);
    renderPinnedIdea(pinnedIdea || null);

    const activeIdeasAll = activePool.filter(i => !shouldHideFromActiveFeed(i));
    const activeIdeas = pinnedIdea ? activeIdeasAll.filter(i => i.id !== pinnedIdea.id) : activeIdeasAll;
    const hiddenIdeas = ordered.filter(i => !i.archived && i.hidden);

    renderFocusFeed(ordered.filter(i => !i.archived), pinnedIdea);
    renderFeedList(mainFeed, activeIdeas, { hiddenView: false, autoScroll: state.activeTab === 'main', suppressEmpty: !!pinnedIdea });
    renderFeedList(hiddenFeed, hiddenIdeas, { hiddenView: true, autoScroll: state.activeTab === 'hidden' });
}

// --- Sync & Storage Calls ---

async function refreshCategoryPalette(options = {}) {
    try {
        state.categoryPalette = await getCategoryPalette({ force: !!options.force }) || {};
        if (state.allIdeas.length) renderFeeds(state.allIdeas);
    } catch (e) {
        console.error('Unable to load category palette', e);
    }
}

async function loadExistingIdeas(options = {}) {
    state.allIdeas = await getIdeas(options);
    renderFeeds(state.allIdeas);
}

// --- Tab & Focus Navigation ---

function updateFocusCategoryLabel() {
    if (!focusCategoryLabel || !focusTabLabel) return;
    const label = state.focusCategory === '__uncategorized__' ? 'Uncategorized' : (state.focusCategory || 'Select category');
    focusCategoryLabel.textContent = label;
    focusTabLabel.textContent = state.focusCategory ? label : 'Category';
    focusTabLabel.title = state.focusCategory ? label : 'Category';
    focusCategoryToggle?.setAttribute('title', label);
}

function setFocusCategory(value) {
    state.focusCategory = value || '';
    try {
        state.focusCategory ? localStorage.setItem(FOCUS_CATEGORY_KEY, state.focusCategory) : localStorage.removeItem(FOCUS_CATEGORY_KEY);
    } catch (e) { }
    updateFocusCategoryLabel();
    syncCategoryFormToFocus();
    renderFeeds(state.allIdeas);
}

function populateFocusCategoryMenu() {
    if (!focusCategoryMenu) return;
    focusCategoryMenu.innerHTML = '';
    const sorted = state.availableCategories.slice().sort((a, b) => CATEGORY_COLLATOR.compare(a, b));
    const options = ['__uncategorized__', ...sorted];

    if (!options.length) {
        focusCategoryMenu.innerHTML = '<p class="focus-menu-empty">No categories yet.</p>';
        return;
    }

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'focus-category-option';
        btn.dataset.focusCategory = opt;
        btn.textContent = opt === '__uncategorized__' ? 'Uncategorized' : opt;
        if (opt === state.focusCategory) btn.classList.add('is-selected');
        focusCategoryMenu.appendChild(btn);
    });
}

function openFocusCategoryMenu() {
    if (!focusCategoryMenu || !focusCategoryToggle) return;
    populateFocusCategoryMenu();
    const rect = focusCategoryToggle.getBoundingClientRect();
    focusCategoryMenu.style.top = `${rect.bottom + 8}px`;
    focusCategoryMenu.style.left = `${rect.left}px`;
    focusCategoryMenu.style.width = `${Math.max(200, rect.width)}px`;
    focusCategoryMenu.hidden = false;
    focusCategoryToggle.setAttribute('aria-expanded', 'true');
}

function closeFocusCategoryMenu() {
    if (focusCategoryMenu) focusCategoryMenu.hidden = true;
    if (focusCategoryToggle) focusCategoryToggle.setAttribute('aria-expanded', 'false');
}

function setActiveTab(tab) {
    if (!TAB_ORDER.includes(tab)) return;
    state.activeTab = tab;

    feedTabs.forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    feedPanels.forEach(panel => {
        panel.setAttribute('aria-hidden', panel.dataset.panel === tab ? 'false' : 'true');
    });

    if (feedCarousel) {
        feedCarousel.style.transform = `translateX(-${TAB_ORDER.indexOf(tab) * 100}%)`;
        feedCarousel.dataset.active = tab;
    }

    if (tab !== 'focus') closeFocusCategoryMenu();
    if (captureLayout) captureLayout.dataset.activeTab = tab;

    updateCategoryFormVisibility();
    syncCategoryFormToFocus();
}

// --- Category Edit Dropdown (shared controller) ---

const categoryDropdown = createCategoryDropdownController({
    getDropdown: () => categoryEditDropdown,
    getContent: () => categoryEditDropdownContent,
    findIdea: (id) => state.allIdeas.find(i => i.id === id),
    getIdeaCategories: (idea) => getIdeaCategoriesList(idea),
    getAvailableCategories: () => state.availableCategories,
    onCategoriesChanged: () => Promise.all([loadExistingIdeas({ force: true }), updateCategoryList(), refreshCategoryPalette({ force: true })]),
    collator: CATEGORY_COLLATOR,
});

// --- Event Handlers ---

const handlers = {
    async handleIdeaSave(e) {
        e.preventDefault();
        const text = textInput.value.trim();
        if (!text) return;

        const manual = categoryNew.value.trim();
        let cat = manual || categorySelect.value.trim();

        if (state.activeTab === 'focus') {
            cat = state.focusCategory === '__uncategorized__' ? '' : (state.focusCategory || '').trim();
        } else if (manual) {
            const matches = getMatchingCategories(manual);
            if (matches.length === 1) {
                cat = matches[0];
                categoryNew.value = matches[0];
            }
        }

        const categories = cat ? [cat] : [];
        const idea = {
            id: (window.crypto?.randomUUID?.()) || `idea-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            text,
            category: categories[0] || '',
            categories,
            createdAt: Date.now()
        };

        try {
            await saveIdea(idea);
            if (idea.category) trackCategoryUsage(idea.category);
            const manualVal = categoryNew.value.trim();
            textInput.value = '';
            categoryNew.value = '';
            await Promise.all([loadExistingIdeas({ force: true }), updateCategoryList(manualVal || idea.category), refreshCategoryPalette()]);
            refreshCategoryIndicator();
            showToast('Saved!', { tone: 'success', timeout: 1200 });
        } catch (err) { console.error('Unable to save idea', err); }
    },

    async handleIdeaInteraction(event) {
        const target = event.target;

        const checkbox = target.closest('.idea-complete');
        if (checkbox?.checked) {
            const id = checkbox.dataset.id;
            checkbox.disabled = true;
            try { await setIdeaArchived(id, true); await loadExistingIdeas({ force: true }); }
            catch (e) { console.error('Unable to archive', e); checkbox.checked = false; }
            finally { checkbox.disabled = false; }
            return;
        }

        const pinBtn = target.closest('.idea-pin');
        if (pinBtn) {
            const id = pinBtn.dataset.id;
            const isPinned = pinBtn.dataset.pinned === 'true';
            pinBtn.disabled = true;
            try { await setIdeaPinned(id, !isPinned); await loadExistingIdeas({ force: true }); }
            catch (e) { console.error('Unable to pin', e); }
            finally { pinBtn.disabled = false; }
            return;
        }

        const hideBtn = target.closest('.idea-hide');
        if (hideBtn) {
            const id = hideBtn.dataset.id;
            const action = hideBtn.dataset.action;
            hideBtn.disabled = true;
            try { await setIdeaHidden(id, action === 'hide'); await loadExistingIdeas({ force: true }); }
            catch (e) { console.error('Unable to hide', e); }
            finally { hideBtn.disabled = false; }
            return;
        }

        // Category clicks
        const chip = target.closest('[data-category-chip]');
        if (chip) {
            categoryDropdown.open(chip.dataset.categoryChip, chip, { mode: 'replace', targetCategory: chip.dataset.categoryName || '' });
            return;
        }
        const addTrig = target.closest('[data-category-add-trigger]');
        if (addTrig) {
            categoryDropdown.open(addTrig.dataset.categoryAddTrigger, addTrig, { mode: 'multi' });
        }
    },

    handleTabClick(e) {
        const tab = e.currentTarget.dataset.tab;
        if (!tab) return;
        if (tab === 'focus') {
            tab === state.activeTab ? (focusCategoryMenu?.hidden ? openFocusCategoryMenu() : closeFocusCategoryMenu()) : setActiveTab(tab);
        } else if (tab !== state.activeTab) {
            setActiveTab(tab);
        }
    },

    handleSwipeStart(e) {
        if (!e.isPrimary || e.pointerType === 'mouse' || e.target.closest(SWIPE_IGNORE_SELECTOR)) return;
        state.swipe = { active: true, startX: e.clientX, currentX: e.clientX, startTime: performance.now(), pointerType: e.pointerType };
        try { feedSlider?.setPointerCapture?.(e.pointerId); } catch (_) { }
    },
    handleSwipeMove(e) {
        if (state.swipe.active && (state.swipe.pointerType && e.pointerType === state.swipe.pointerType)) state.swipe.currentX = e.clientX;
    },
    handleSwipeEnd(e) {
        if (!state.swipe.active || (state.swipe.pointerType && e.pointerType !== state.swipe.pointerType)) return;
        state.swipe.active = false;
        const deltaX = state.swipe.currentX - state.swipe.startX;
        const elapsed = performance.now() - state.swipe.startTime;
        try { feedSlider?.releasePointerCapture?.(e.pointerId); } catch (_) { }
        if (Math.abs(deltaX) < 60 || elapsed > 600) return;
        const idx = TAB_ORDER.indexOf(state.activeTab);
        if (deltaX < 0 && idx < TAB_ORDER.length - 1) setActiveTab(TAB_ORDER[idx + 1]);
        else if (deltaX > 0 && idx > 0) setActiveTab(TAB_ORDER[idx - 1]);
    },

    handleKeyDown(e) {
        if (!state.userSettings?.shortcuts) return;

        const isEditing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;
        const keys = [];
        if (e.metaKey || e.ctrlKey) keys.push('meta');
        if (e.shiftKey) keys.push('shift');
        if (e.altKey) keys.push('alt');
        keys.push(e.key.toLowerCase());
        const combo = keys.join('+');

        const shortcuts = state.userSettings.shortcuts;

        // Save (Special case: global even if editing)
        if (combo === shortcuts.save) {
            e.preventDefault();
            $('#ideaForm')?.dispatchEvent(new Event('submit'));
            return;
        }

        // If editing, don't trigger other single-key navigation shortcuts
        if (isEditing) return;

        if (combo === shortcuts.focusInput) {
            e.preventDefault();
            textInput?.focus();
        } else if (combo === shortcuts.search) {
            e.preventDefault();
            const searchToggle = $('.search-fab__toggle');
            if (searchToggle) {
                searchToggle.click();
                $('.search-fab__panel input')?.focus();
            }
        } else if (combo === shortcuts.nextIdea || combo === shortcuts.prevIdea) {
            e.preventDefault();
            const ideas = Array.from(document.querySelectorAll('.idea-row'));
            if (!ideas.length) return;

            let currentIdx = ideas.findIndex(el => el.contains(document.activeElement));
            if (combo === shortcuts.nextIdea) {
                currentIdx = (currentIdx + 1) % ideas.length;
            } else {
                currentIdx = (currentIdx - 1 + ideas.length) % ideas.length;
            }
            ideas[currentIdx].querySelector('.idea-bubble')?.focus() || ideas[currentIdx].querySelector('input')?.focus();
        } else if (combo === shortcuts.hideUnhide) {
            const activeIdea = document.activeElement.closest('.idea-row');
            if (activeIdea) {
                activeIdea.querySelector('.idea-hide')?.click();
            }
        }
    }
};

// --- Lifecycle & Event Binding ---

document.addEventListener('DOMContentLoaded', () => {
    setupPendingSyncUI();
    setActiveTab(state.activeTab);
    initialize().catch(console.error);
});

$('#ideaForm').addEventListener('submit', handlers.handleIdeaSave);
textInput.addEventListener('input', toggleSaveButton);
textInput.addEventListener('change', toggleSaveButton);
toggleSaveButton(); // Init state

categorySelect.addEventListener('change', () => {
    if (categorySelect.value) categoryNew.value = '';
    refreshCategoryIndicator();
});

categoryNew.addEventListener('input', () => {
    if (categoryNew.value.trim()) {
        categorySelect.value = '';
        updateCategorySuggestions(categoryNew.value);
    } else {
        hideCategorySuggestions();
    }
    refreshCategoryIndicator();
});

categoryNew.addEventListener('focus', () => {
    updateCategorySuggestions(categoryNew.value.trim() || '');
});

categoryNew.addEventListener('blur', () => setTimeout(hideCategorySuggestions, 120));

document.addEventListener('keydown', handlers.handleKeyDown);

feedTabs.forEach(btn => btn.addEventListener('click', handlers.handleTabClick));

if (feedSlider) {
    feedSlider.addEventListener('pointerdown', handlers.handleSwipeStart);
    feedSlider.addEventListener('pointermove', handlers.handleSwipeMove);
    feedSlider.addEventListener('pointerup', handlers.handleSwipeEnd);
    feedSlider.addEventListener('pointercancel', handlers.handleSwipeEnd);
    feedSlider.addEventListener('pointerleave', handlers.handleSwipeEnd);
}

[feedCarousel, pinnedContainer].forEach(el => {
    if (el) {
        el.addEventListener('change', handlers.handleIdeaInteraction);
        el.addEventListener('click', handlers.handleIdeaInteraction);
    }
});

if (focusCategoryMenu) {
    focusCategoryMenu.addEventListener('click', (e) => {
        const opt = e.target.closest('.focus-category-option');
        if (opt) { setFocusCategory(opt.dataset.focusCategory || ''); closeFocusCategoryMenu(); focusCategoryToggle?.focus({ preventScroll: true }); }
    });
}

document.addEventListener('click', (e) => {
    // Focus menu outside click
    if (focusCategoryMenu && !focusCategoryMenu.hidden) {
        const isToggle = focusCategoryToggle?.contains(e.target) || e.target.closest('#tab-focus');
        const isOtherTab = e.target.closest('.feed-tab') && !e.target.closest('#tab-focus');
        if (isOtherTab || (!isToggle && !focusCategoryMenu.contains(e.target))) closeFocusCategoryMenu();
    }
    // Category dropdown outside click
    if (categoryEditDropdown && !categoryEditDropdown.hidden) {
        const dropdownAnchor = categoryDropdown.getAnchor();
        const isAnchor = dropdownAnchor && (dropdownAnchor === e.target || dropdownAnchor.contains?.(e.target));
        if (!categoryEditDropdown.contains(e.target) && !isAnchor) categoryDropdown.close();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (focusCategoryMenu && !focusCategoryMenu.hidden) {
            closeFocusCategoryMenu();
            focusCategoryToggle?.focus({ preventScroll: true });
        }
        if (categoryEditDropdown && !categoryEditDropdown.hidden) {
            categoryDropdown.close();
        }
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        loadExistingIdeas({ force: true }).catch(console.error);
        updateCategoryList().catch(console.error);
        refreshCategoryPalette({ force: true }).catch(console.error);
    }
});

window.addEventListener('categoryDeleted', () => Promise.all([updateCategoryList(), loadExistingIdeas({ force: true }), refreshCategoryPalette({ force: true })]));
window.addEventListener('categoryPaletteUpdated', () => refreshCategoryPalette({ force: true }));

// Thread UI Integration
const overlayThreadManager = new ThreadManager({ mode: 'overlay' });
const detailThreadManager = new ThreadManager({ mode: 'embedded' });

// Detail Pane Logic
async function openDetailView(ideaId) {
    const idea = state.allIdeas.find(i => i.id === ideaId);
    if (!idea) return;

    const detailPane = document.getElementById('detailContent');
    const emptyState = document.querySelector('.detail-pane-empty');
    if (!detailPane || !emptyState) return;

    // Show detail pane, hide empty state
    detailPane.hidden = false;
    emptyState.hidden = true;

    // Render Idea Details
    const createdAt = Number(idea.createdAt) || 0;
    const timeFull = new Date(createdAt).toLocaleString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
    });

    // Create container structure
    detailPane.innerHTML = `
        <div class="detail-header">
            <div class="detail-categories"></div>
            <div class="detail-info-group">
                <div class="detail-meta">${escapeHtml(timeFull)}</div>
                <div class="detail-actions">
                    ${idea.pinned ? '<span class="detail-badge is-pinned">Pinned</span>' : ''}
                    ${idea.archived ? '<span class="detail-badge is-archived">Archived</span>' : ''}
                </div>
            </div>
        </div>
        <div class="detail-body">
            <p class="detail-text">${escapeHtml(idea.text)}</p>
        </div>
        <div class="detail-comments" id="detailComments"></div>
    `;

    // Render Categories
    const catContainer = detailPane.querySelector('.detail-categories');
    renderCategoryChipElements(catContainer, getIdeaCategoriesList(idea));

    // Mount Embedded Thread
    const commentsContainer = detailPane.querySelector('#detailComments');
    if (commentsContainer) {
        detailThreadManager.mount(commentsContainer, ideaId);
    }

    // Highlight selected idea in feed
    document.querySelectorAll('.idea-bubble.is-selected').forEach(el => el.classList.remove('is-selected'));
    document.querySelectorAll(`.idea-row [data-id="${idea.id}"]`).forEach(cb => {
        const bubble = cb.closest('.idea-row')?.querySelector('.idea-bubble');
        if (bubble) bubble.classList.add('is-selected');
    });
}

document.addEventListener('click', (e) => {
    // 1. Thread Icon Click (Overlay Fallback / Mobile)
    const trigger = e.target.closest('.idea-thread');
    if (trigger && trigger.dataset.threadId) {
        e.stopPropagation();
        overlayThreadManager.open(trigger.dataset.threadId);
        return;
    }

    // 2. Idea Bubble Interaction (Select for Detail View)
    // Ignore clicks on buttons, inputs, etc. inside the bubble
    if (e.target.closest('button, input, a, label, .category-chip')) return;

    const ideaBubble = e.target.closest('.idea-bubble');
    if (ideaBubble) {
        const row = ideaBubble.closest('.idea-row');
        const id = row?.querySelector('.idea-complete')?.dataset.id;
        if (id) {
            openDetailView(id);
        }
    }
});
