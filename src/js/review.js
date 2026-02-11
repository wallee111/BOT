import "../styles/main.css";
import "../styles/style.v1.css";
import {
    getIdeas,
    subscribeToIdeas,
    deleteIdea,
    getCategories,
    setIdeaCategories,
    getCategoryPalette,
    setIdeaArchived,
    updateIdeaText,
    updateIdeaPriority
} from '../lib/storage.js';
import { getCategoryAppearance, normalizeCategories, HEX_COLOR_PATTERN, escapeHtml, formatTime } from '../lib/utils.js';
import { getCurrentUserId, ensureAuthSession } from '../lib/auth.js';
import { initThreadNotes, attachThread, toggleThread, cleanupThreadNotes, closeDetailPane, openInDetailPane } from './thread-notes.js';
import { createCategoryDropdownController } from './category-dropdown.js';
import { showToast } from '../lib/toast.js';

// Priority constants
const PRIORITY_BADGES = {
    urgent: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '⚪'
};
const PRIORITY_CYCLE = ['', 'urgent', 'high', 'medium', 'low'];

const $ = s => document.querySelector(s);
const list = $('#list');
const q = $('#q');
const searchFab = $('#searchFab');
const searchToggle = searchFab?.querySelector('.search-fab__toggle');
const searchPanel = searchFab?.querySelector('.search-fab__panel');
const searchClear = searchFab?.querySelector('.search-fab__clear');
const cat = $('#cat');
const status = $('#status');
const CATEGORY_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });
const categoryFilterToggle = document.getElementById('categoryFilterToggle');
const categoryFilterToggleLabel = categoryFilterToggle?.querySelector('span') || categoryFilterToggle;
const categoryFilterPanel = document.getElementById('categoryFilterPanel');
const categoryFilterOptionsEl = document.getElementById('categoryFilterOptions');
if (categoryFilterOptionsEl) {
    categoryFilterOptionsEl.setAttribute('role', 'listbox');
    categoryFilterOptionsEl.setAttribute('aria-multiselectable', 'true');
}
const categoryFilterClearButton = categoryFilterPanel?.querySelector('[data-filter-clear]');
const CATEGORY_FILTER_STORAGE_KEY = 'review_category_filter_v1';
const categoryAddModal = document.getElementById('categoryAddModal');
const categoryModalContent = document.getElementById('categoryModalContent');
const categoryModalClose = categoryAddModal?.querySelector('.category-modal__close');
const categoryModalOverlay = categoryAddModal?.querySelector('.category-modal__overlay');
const categoryEditDropdown = document.getElementById('categoryEditDropdown');
const categoryEditDropdownContent = document.getElementById('categoryEditDropdownContent');
const sortBy = document.getElementById('sortBy');
const SORT_STORAGE_KEY = 'review_sort_preference_v1';
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, '': 4 };
let categoryOptions = [];
let categoryPalette = {};

let ideasCache = [];
let currentModalIdeaId = null;
let isSearchOpen = false;
let isCategoryFilterOpen = false;
const swipeState = {
    activeItem: null,
    contentEl: null,
    startX: 0,
    currentX: 0,
    pointerId: null,
    isDragging: false,
    openItem: null
};
const SWIPE_THRESHOLD = 80;
const MAX_ACTION_WIDTH = 140;
const MAX_RIGHT_DRAG = 60;

function getIdeaCategories(idea) {
    const base = idea?.categories || (idea?.category ? [idea.category] : []);
    return normalizeCategories(base);
}

function getSelectedCategoryFilterValues() {
    return Array.from(cat?.selectedOptions || []).map(option => option.value);
}

function updateCategoryFilterToggleLabel(selectedSet = new Set(getSelectedCategoryFilterValues())) {
    if (!categoryFilterToggle) return;
    const hasUncategorized = selectedSet.has('__uncategorized__');
    const selectedCategories = categoryOptions.filter(category => selectedSet.has(category));
    const count = selectedCategories.length + (hasUncategorized ? 1 : 0);
    let label = 'All categories';
    if (count === 1) {
        label = hasUncategorized ? 'Uncategorized' : selectedCategories[0];
    } else if (count > 1) {
        label = `${count} selected`;
    }
    categoryFilterToggleLabel.textContent = label;
}

function populateCategoryFilterOptions() {
    if (!categoryFilterOptionsEl) return;
    const selectedSet = new Set(getSelectedCategoryFilterValues());
    categoryFilterOptionsEl.innerHTML = '';

    const createOption = (value, label) => {
        const id = `filter-cat-${value.replace(/[^a-z0-9_-]/gi, '_')}`;
        const optionWrapper = document.createElement('label');
        optionWrapper.className = 'filter-multi-option';
        optionWrapper.setAttribute('role', 'option');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = value;
        input.checked = selectedSet.has(value);
        input.id = id;
        const span = document.createElement('span');
        span.textContent = label;
        optionWrapper.append(input, span);
        categoryFilterOptionsEl.appendChild(optionWrapper);
    };

    createOption('__uncategorized__', 'Uncategorized');
    categoryOptions
        .slice()
        .sort((a, b) => CATEGORY_COLLATOR.compare(a, b))
        .forEach(category => createOption(category, category));
}

function openCategoryFilter() {
    if (!categoryFilterPanel || !categoryFilterToggle) return;
    closeCategoryModal();
    populateCategoryFilterOptions();
    categoryFilterPanel.hidden = false;
    categoryFilterToggle.setAttribute('aria-expanded', 'true');
    isCategoryFilterOpen = true;
    const firstOption = categoryFilterOptionsEl?.querySelector('input');
    firstOption?.focus({ preventScroll: true });
}

function closeCategoryFilter() {
    if (!categoryFilterPanel || !categoryFilterToggle) return;
    categoryFilterPanel.hidden = true;
    categoryFilterToggle.setAttribute('aria-expanded', 'false');
    isCategoryFilterOpen = false;
}

function setCategoryFilterSelections(values = []) {
    const valueSet = new Set(values);
    Array.from(cat.options).forEach(option => {
        option.selected = valueSet.has(option.value);
    });
    updateCategoryFilterToggleLabel(valueSet);
    // Persist selection
    try {
        localStorage.setItem(CATEGORY_FILTER_STORAGE_KEY, JSON.stringify(values));
    } catch (e) {
        /* ignore storage errors */
    }
    render();
}

/**
 * Sort ideas based on the current sort preference
 * @param {Array} ideas - Array of ideas to sort
 * @returns {Array} - Sorted ideas
 */
function sortIdeas(ideas) {
    const sortMode = sortBy?.value || 'date';

    return ideas.slice().sort((a, b) => {
        if (sortMode === 'priority') {
            // Sort by priority (urgent first), then by date (newest first)
            const priorityA = PRIORITY_ORDER[a.priority || ''] ?? 4;
            const priorityB = PRIORITY_ORDER[b.priority || ''] ?? 4;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            return b.createdAt - a.createdAt;
        }
        // Default: sort by date (newest first)
        return b.createdAt - a.createdAt;
    });
}

function renderCategoryChipElements(container, categories) {
    if (!container) return;
    container.innerHTML = '';

    // Get the ideaId from the parent container
    const parentGroup = container.closest('.category-chip-group');
    const ideaId = parentGroup?.dataset.ideaId;

    if (!categories.length) {
        const chip = document.createElement('span');
        chip.className = 'category-chip uncategorized';
        chip.textContent = 'Uncategorized';
        chip.dataset.categoryChip = parentGroup?.dataset.ideaId || '';
        chip.dataset.ideaId = parentGroup?.dataset.ideaId || '';
        chip.dataset.categoryName = '__uncategorized__';
        chip.style.cursor = 'pointer';
        container.appendChild(chip);
        return;
    }
    categories.forEach(category => {
        const appearance = getCategoryAppearance(category, categoryPalette);
        const chip = document.createElement('span');
        chip.className = ['category-chip', appearance.classes].filter(Boolean).join(' ');
        applyAppearanceStyles(chip, appearance);
        chip.textContent = category;
        chip.dataset.categoryChip = ideaId || '';
        chip.dataset.ideaId = ideaId || '';
        chip.dataset.categoryName = category;
        chip.style.cursor = 'pointer';
        container.appendChild(chip);
    });
}

// --- Category Edit Dropdown (shared controller) ---

const categoryDropdown = createCategoryDropdownController({
    getDropdown: () => categoryEditDropdown,
    getContent: () => categoryEditDropdownContent,
    findIdea: (id) => ideasCache.find(entry => entry.id === id),
    getIdeaCategories: (idea) => getIdeaCategories(idea),
    getAvailableCategories: () => categoryOptions,
    onCategoriesChanged: () => Promise.all([
        refreshIdeas({ force: true }),
        updateCategoryList(),
        refreshCategoryPalette({ force: true })
    ]),
    collator: CATEGORY_COLLATOR,
});

function populateCategoryModal(ideaId) {
    if (!categoryModalContent) return;
    const idea = ideasCache.find(entry => entry.id === ideaId);
    if (!idea) {
        categoryModalContent.innerHTML = '<p class="category-modal__empty">Idea not found.</p>';
        return;
    }
    const assigned = getIdeaCategories(idea);
    const assignedLowerCase = assigned.map(cat => cat.toLowerCase());
    const allCategories = categoryOptions.sort((a, b) => CATEGORY_COLLATOR.compare(a, b));

    categoryModalContent.innerHTML = '';

    if (!allCategories.length) {
        const empty = document.createElement('p');
        empty.className = 'category-modal__empty';
        empty.textContent = 'No categories available. Create one by saving an idea with a category.';
        categoryModalContent.appendChild(empty);
        return;
    }

    // Create checkbox items for each category
    allCategories.forEach(category => {
        const isChecked = assignedLowerCase.includes(category.toLowerCase());

        const label = document.createElement('label');
        label.className = 'category-modal__checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isChecked;
        checkbox.dataset.category = category;
        checkbox.dataset.ideaId = ideaId;

        const labelText = document.createElement('span');
        labelText.className = 'category-modal__checkbox-label';
        labelText.textContent = category;

        label.appendChild(checkbox);
        label.appendChild(labelText);
        categoryModalContent.appendChild(label);
    });
}

function openCategoryModal(ideaId) {
    if (!categoryAddModal) return;
    closeCategoryFilter();
    currentModalIdeaId = ideaId;
    populateCategoryModal(ideaId);
    categoryAddModal.hidden = false;
    requestAnimationFrame(() => {
        categoryAddModal.classList.add('is-open');
        // Focus first checkbox for accessibility
        const firstInput = categoryModalContent?.querySelector('input[type="checkbox"]');
        firstInput?.focus?.({ preventScroll: true });
    });
}

async function closeCategoryModal() {
    if (!categoryAddModal) return;

    // Auto-save: Collect checked categories
    if (currentModalIdeaId && categoryModalContent) {
        const checkboxes = categoryModalContent.querySelectorAll('input[type="checkbox"]');
        const selectedCategories = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.dataset.category);

        try {
            await setIdeaCategories(currentModalIdeaId, selectedCategories);
            // Refresh the UI to show updated categories
            await Promise.all([
                refreshIdeas({ force: true }),
                updateCategoryList(),
                refreshCategoryPalette({ force: true })
            ]);
        } catch (error) {
            console.error('Error updating categories:', error);
        }
    }

    categoryAddModal.classList.remove('is-open');
    setTimeout(() => {
        categoryAddModal.hidden = true;
        currentModalIdeaId = null;
        categoryModalContent.innerHTML = '';
    }, 200);
}

async function updateCategoryList() {
    const previouslySelected = new Set(Array.from(cat?.selectedOptions || []).map(opt => opt.value));
    const categories = normalizeCategories(await getCategories()).sort((a, b) => CATEGORY_COLLATOR.compare(a, b));
    cat.innerHTML = '';

    const uncategorizedOption = document.createElement('option');
    uncategorizedOption.value = '__uncategorized__';
    uncategorizedOption.textContent = 'Uncategorized';
    uncategorizedOption.selected = previouslySelected.has('__uncategorized__');
    cat.appendChild(uncategorizedOption);

    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        if (previouslySelected.has(category)) {
            option.selected = true;
        }
        cat.appendChild(option);
    });

    categoryOptions = categories;
    updateCategoryFilterToggleLabel(new Set(getSelectedCategoryFilterValues()));
    if (isCategoryFilterOpen) {
        populateCategoryFilterOptions();
    }
    // Only render if ideas are loaded
    if (ideasCache && ideasCache.length >= 0) {
        render();
    }
}

function applyAppearanceStyles(target, appearance) {
    if (!appearance.style) return;
    appearance.style.split(';').forEach(rule => {
        const [prop, value] = rule.split(':');
        if (prop && value) {
            target.style.setProperty(prop.trim(), value.trim());
        }
    });
}


function render() {
    // Close inline dropdown when re-rendering
    categoryDropdown.close();
    const term = q.value.trim().toLowerCase();
    const selectedCategoryValues = cat
        ? Array.from(cat.selectedOptions).map(option => option.value)
        : [];
    const includeUncategorized = selectedCategoryValues.includes('__uncategorized__');
    const categoryFilters = normalizeCategories(
        selectedCategoryValues.filter(value => value !== '__uncategorized__')
    ).map(value => value.toLowerCase());
    const statusFilter = status.value;

    // Check if ideasCache is initialized
    if (!ideasCache || !Array.isArray(ideasCache)) {
        list.innerHTML = '<p>Loading...</p>';
        return;
    }

    // Filter first, then sort
    const filteredIdeas = ideasCache.filter(idea => {
        const textMatch = !term || idea.text.toLowerCase().includes(term);
        if (!textMatch) {
            return false;
        }

        const categories = getIdeaCategories(idea).map(catName => catName.toLowerCase());
        let categoryMatch = true;
        if (categoryFilters.length || includeUncategorized) {
            categoryMatch = false;
            if (categoryFilters.length && categories.some(catName => categoryFilters.includes(catName))) {
                categoryMatch = true;
            }
            if (!categoryMatch && includeUncategorized && categories.length === 0) {
                categoryMatch = true;
            }
        }
        if (!categoryMatch) {
            return false;
        }

        const statusMatch = statusFilter === 'all' ||
            (statusFilter === 'archived' ? idea.archived : !idea.archived);
        return statusMatch;
    });

    // Apply current sort preference
    const ideas = sortIdeas(filteredIdeas);

    list.innerHTML = '';
    swipeState.openItem = null;
    if (!ideas.length) {
        list.innerHTML = `<p>No ideas yet.</p>`;
        return;
    }
    const fragment = document.createDocumentFragment();
    ideas.forEach(idea => fragment.appendChild(createIdeaListItem(idea)));
    list.appendChild(fragment);
}

async function refreshIdeas(options = {}) {
    ideasCache = await getIdeas(options);
    render();
}

async function refreshCategoryPalette(options = {}) {
    try {
        const palette = await getCategoryPalette({ force: Boolean(options.force) });
        categoryPalette = palette || {};
        // Only render if ideas are loaded
        if (ideasCache && ideasCache.length >= 0) {
            render();
        }
    } catch (error) {
        console.error('Unable to load category palette', error);
    }
}

function setSearchOpen(open) {
    if (!searchFab || !searchPanel || !searchToggle) {
        return;
    }
    isSearchOpen = open;
    searchFab.classList.toggle('is-open', open);
    searchPanel.hidden = !open;
    searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
        window.requestAnimationFrame(() => {
            q.focus();
            q.select();
        });
    } else if (searchFab.contains(document.activeElement)) {
        searchToggle.focus();
    }
}

function toggleSearch() {
    setSearchOpen(!isSearchOpen);
}

function handleDocumentClick(event) {
    if (!isSearchOpen || !searchFab) {
        return;
    }
    if (searchFab.contains(event.target)) {
        return;
    }
    setSearchOpen(false);
}

function clearSearch() {
    if (!q) return;
    q.value = '';
    render();
    setSearchOpen(true);
}

function closeSwipeItem(item, { animate = true } = {}) {
    if (!item) return;
    item.classList.remove('swipe-item--open');
    const content = item.querySelector('.swipe-item__content');
    if (content) {
        content.style.transition = animate ? 'transform 0.2s ease' : 'none';
        content.style.transform = '';
        if (!animate) {
            requestAnimationFrame(() => {
                content.style.transition = '';
            });
        }
    }
    if (swipeState.openItem === item) {
        swipeState.openItem = null;
    }
}

function openSwipeItem(item) {
    const content = item?.querySelector('.swipe-item__content');
    if (!content) return;
    content.style.transition = 'transform 0.2s ease';
    content.style.transform = 'translateX(-140px)';
    item.classList.add('swipe-item--open');
    swipeState.openItem = item;
}

function resetSwipeState() {
    swipeState.isDragging = false;
    swipeState.pointerId = null;
    swipeState.activeItem = null;
    swipeState.contentEl = null;
    swipeState.startX = 0;
    swipeState.currentX = 0;
}

function openInlineEditor(item) {
    if (!item) return;
    const panel = item.querySelector('.inline-edit');
    const preview = item.querySelector('.idea-text-preview');
    if (!panel) return;
    const textarea = panel.querySelector('.inline-edit__input');

    panel.hidden = false;
    if (preview) preview.hidden = true;

    item.classList.add('is-editing');
    if (textarea) {
        textarea.value = item.dataset.text || '';
        // Auto-resize textarea to fit content
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight + 10) + 'px';

        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        });
    }
}

function closeInlineEditor(item) {
    if (!item) return;
    const panel = item.querySelector('.inline-edit');
    const preview = item.querySelector('.idea-text-preview');

    if (panel) {
        panel.hidden = true;
    }
    if (preview) {
        preview.hidden = false;
    }
    item.classList.remove('is-editing');
}

async function archiveIdeaFromSwipe(item) {
    if (!item) return;
    const ideaId = item.dataset.id;
    if (!ideaId) return;
    const currentlyArchived = item.classList.contains('is-archived');
    item.classList.add('swipe-item--archiving');
    closeSwipeItem(item);
    try {
        await setIdeaArchived(ideaId, !currentlyArchived);
        await refreshIdeas({ force: true });
        await updateCategoryList();
    } catch (error) {
        console.error('Unable to archive idea', error);
    } finally {
        item.classList.remove('swipe-item--archiving');
    }
}

list.addEventListener('click', async e => {
    // Handle category chip clicks (single-select replace)
    const categoryChip = e.target.closest('[data-category-chip]');
    if (categoryChip) {
        const ideaId = categoryChip.dataset.categoryChip;
        const catName = categoryChip.dataset.categoryName || '';
        categoryDropdown.open(ideaId, categoryChip, { mode: 'replace', targetCategory: catName });
        return;
    }

    // Handle + button clicks (multi-select add/remove)
    const addTrigger = e.target.closest('[data-category-add-trigger]');
    if (addTrigger) {
        const ideaId = addTrigger.dataset.categoryAddTrigger;
        categoryDropdown.open(ideaId, addTrigger, { mode: 'multi' });
        return;
    }

    // Handle priority dot clicks - cycle through priorities
    const priorityDot = e.target.closest('.priority-dot');
    if (priorityDot) {
        const id = priorityDot.dataset.id;
        const currentPriority = priorityDot.dataset.priority || '';
        const currentIndex = PRIORITY_CYCLE.indexOf(currentPriority);
        const nextIndex = (currentIndex + 1) % PRIORITY_CYCLE.length;
        const nextPriority = PRIORITY_CYCLE[nextIndex];

        priorityDot.disabled = true;
        try {
            await updateIdeaPriority(id, nextPriority);
            // Update UI immediately
            priorityDot.textContent = PRIORITY_BADGES[nextPriority] || '⚫';
            priorityDot.dataset.priority = nextPriority;
            const priorityTitle = nextPriority
                ? `${nextPriority.charAt(0).toUpperCase() + nextPriority.slice(1)} priority - click to change`
                : 'No priority - click to set';
            priorityDot.title = priorityTitle;
            priorityDot.setAttribute('aria-label', priorityTitle);
            showToast(nextPriority ? `Priority: ${nextPriority}` : 'Priority cleared', { timeout: 1000 });
        } catch (err) {
            console.error('Unable to update priority', err);
        } finally {
            priorityDot.disabled = false;
        }
        return;
    }
});

// Modal category option selection removed - now using checkboxes with auto-save on close

// List click handlers for other actions
list.addEventListener('click', async e => {
    // Thread button click - toggle inline notes / detail pane
    const threadBtn = e.target.closest('.idea-thread');
    if (threadBtn && threadBtn.dataset.threadId) {
        e.stopPropagation();
        const swipeItem = threadBtn.closest('.swipe-item');
        toggleThread(threadBtn.dataset.threadId, swipeItem);
        return;
    }

    // Swipe item content click (on desktop) - Open in detail pane
    const swipeContent = e.target.closest('.swipe-item__content');
    if (swipeContent && window.innerWidth >= 1024) {
        // Don't trigger on buttons or interactive elements
        if (e.target.closest('button, a, input, textarea, select, .category-chip')) {
            return;
        }
        const swipeItem = swipeContent.closest('.swipe-item');
        const threadBtn = swipeItem?.querySelector('.idea-thread');
        if (threadBtn && threadBtn.dataset.threadId) {
            e.stopPropagation();
            toggleThread(threadBtn.dataset.threadId, swipeItem);
            return;
        }
    }

    const editBtn = e.target.closest('[data-edit-idea]');
    if (editBtn) {
        const item = editBtn.closest('.swipe-item');
        closeSwipeItem(item);
        openInlineEditor(item);
        return;
    }

    const saveBtn = e.target.closest('[data-inline-save]');
    if (saveBtn) {
        const item = saveBtn.closest('.swipe-item');
        if (!item) return;
        const ideaId = saveBtn.dataset.inlineSave;
        const textarea = item.querySelector('.inline-edit__input');
        const cancelBtn = item.querySelector('[data-inline-cancel]');
        if (!textarea) return;
        const newValue = textarea.value.trim();
        if (!newValue) {
            textarea.focus();
            return;
        }
        saveBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;
        try {
            await updateIdeaText(ideaId, newValue);
            ideasCache = ideasCache.map(idea =>
                idea.id === ideaId ? { ...idea, text: newValue } : idea
            );
            item.dataset.text = newValue;
            closeInlineEditor(item);
            closeSwipeItem(item);
            render();
        } catch (error) {
            console.error('Unable to update idea text', error);
            saveBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
        }
        return;
    }

    const cancelBtn = e.target.closest('[data-inline-cancel]');
    if (cancelBtn) {
        const item = cancelBtn.closest('.swipe-item');
        closeInlineEditor(item);
        return;
    }

    const deleteBtn = e.target.closest('[data-del]');
    if (deleteBtn) {
        const del = deleteBtn.dataset.del;
        try {
            await deleteIdea(del);
            await Promise.all([updateCategoryList(), refreshIdeas({ force: true })]);
            await refreshCategoryPalette({ force: true });
        } catch (error) {
            console.error('Unable to delete idea', error);
        }
        return;
    }
});

list.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        const inlinePanel = event.target.closest('.inline-edit');
        if (inlinePanel) {
            const cancelBtn = inlinePanel.querySelector('[data-inline-cancel]');
            cancelBtn?.click();
        }
    }
});

function handleSwipeStart(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
    }
    if (event.target.closest('[data-category-add-trigger]') || event.target.closest('[data-category-chip]') || event.target.closest('.inline-edit')) {
        return;
    }
    const content = event.target.closest('.swipe-item__content');
    if (!content) {
        if (swipeState.openItem && !swipeState.openItem.contains(event.target)) {
            closeSwipeItem(swipeState.openItem);
        }
        return;
    }
    const item = content.closest('.swipe-item');
    if (!item || item.classList.contains('is-editing')) {
        return;
    }
    swipeState.isDragging = true;
    swipeState.activeItem = item;
    swipeState.contentEl = content;
    swipeState.pointerId = event.pointerId;
    swipeState.startX = event.clientX;
    swipeState.currentX = event.clientX;
    content.style.transition = 'none';
    try {
        content.setPointerCapture?.(event.pointerId);
    } catch (_) {
        /* noop */
    }
    if (swipeState.openItem && swipeState.openItem !== item) {
        closeSwipeItem(swipeState.openItem);
    }
}

function handleSwipeMove(event) {
    if (!swipeState.isDragging || event.pointerId !== swipeState.pointerId) {
        return;
    }
    swipeState.currentX = event.clientX;
    if (!swipeState.contentEl) {
        return;
    }
    const delta = swipeState.currentX - swipeState.startX;
    if (delta < 0) {
        const translate = Math.max(delta, -MAX_ACTION_WIDTH);
        swipeState.contentEl.style.transform = `translateX(${translate}px)`;
    } else {
        const translate = Math.min(delta, MAX_RIGHT_DRAG);
        swipeState.contentEl.style.transform = `translateX(${translate}px)`;
    }
}

function handleSwipeEnd(event) {
    if (!swipeState.isDragging || event.pointerId !== swipeState.pointerId) {
        return;
    }
    if (swipeState.contentEl) {
        try {
            swipeState.contentEl.releasePointerCapture?.(event.pointerId);
        } catch (_) {
            /* noop */
        }
    }
    const delta = swipeState.currentX - swipeState.startX;
    const absDelta = Math.abs(delta);
    const item = swipeState.activeItem;
    if (delta <= -SWIPE_THRESHOLD && item) {
        openSwipeItem(item);
    } else if (delta >= SWIPE_THRESHOLD && item) {
        archiveIdeaFromSwipe(item);
    } else if (item) {
        if (absDelta < 10 && swipeState.openItem === item) {
            closeSwipeItem(item);
        } else {
            closeSwipeItem(item);
        }
    }
    resetSwipeState();
}

list.addEventListener('pointerdown', handleSwipeStart);
list.addEventListener('pointermove', handleSwipeMove);
list.addEventListener('pointerup', handleSwipeEnd);
list.addEventListener('pointercancel', handleSwipeEnd);

document.addEventListener('click', event => {
    // Close category filter if open and clicked outside
    if (isCategoryFilterOpen) {
        const clickedInsideFilter = categoryFilterPanel?.contains(event.target) || categoryFilterToggle?.contains(event.target);
        if (!clickedInsideFilter) {
            closeCategoryFilter();
        }
    }

    // Close inline category dropdown if clicking outside
    if (!categoryEditDropdown?.hidden) {
        const clickedInsideDropdown = categoryEditDropdown.contains(event.target);
        const dropdownAnchor = categoryDropdown.getAnchor();
        const clickedAnchor = dropdownAnchor && dropdownAnchor.contains?.(event.target);
        if (!clickedInsideDropdown && !clickedAnchor) {
            categoryDropdown.close();
        }
    }

    // Close swipe item if clicking outside
    if (!swipeState.openItem) return;
    if (event.target.closest('.swipe-item') === swipeState.openItem) {
        return;
    }
    closeSwipeItem(swipeState.openItem);
});

document.addEventListener('DOMContentLoaded', async () => {
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

    // Initialize thread notes module
    initThreadNotes();

    try {
        // Restore category filter selection
        try {
            const stored = localStorage.getItem(CATEGORY_FILTER_STORAGE_KEY);
            const values = stored ? JSON.parse(stored) : [];
            if (Array.isArray(values) && values.length) {
                setCategoryFilterSelections(values);
            }
        } catch (e) { /* ignore */ }

        // Load initial data
        await Promise.all([
            updateCategoryList(),
            refreshIdeas({ force: true }),
            refreshCategoryPalette()
        ]);
    } catch (error) {
        console.error('[DOMContentLoaded] Error loading initial data:', error);
    }

    if (q.value) {
        setSearchOpen(true);
    }
});

if (searchToggle) {
    searchToggle.addEventListener('click', toggleSearch);
}

if (searchClear) {
    searchClear.addEventListener('click', clearSearch);
}

document.addEventListener('click', handleDocumentClick);

// Modal close handlers
if (categoryModalClose) {
    categoryModalClose.addEventListener('click', closeCategoryModal);
}

if (categoryModalOverlay) {
    categoryModalOverlay.addEventListener('click', closeCategoryModal);
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        if (isCategoryFilterOpen) {
            closeCategoryFilter();
            categoryFilterToggle?.focus({ preventScroll: true });
        }
        if (!categoryAddModal?.hidden) {
            closeCategoryModal();
        }
        if (!categoryEditDropdown?.hidden) {
            categoryDropdown.close();
        }
    }
});

function createIdeaListItem(idea) {
    const item = document.createElement('div');
    item.className = 'swipe-item';
    item.dataset.id = idea.id;
    if (idea.archived) item.classList.add('is-archived');

    // Swipe actions (background)
    const actions = document.createElement('div');
    actions.className = 'swipe-actions swipe-actions--left';
    actions.innerHTML = `
        <button type="button" class="swipe-btn" data-edit-idea="${idea.id}" aria-label="Edit idea">
            <span aria-hidden="true" style="pointer-events: none">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </span>
        </button>
        <button type="button" class="swipe-btn" data-del="${idea.id}" aria-label="Delete idea">
            <span aria-hidden="true" style="pointer-events: none">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </span>
        </button>
    `;
    item.appendChild(actions);

    // Main content
    const content = document.createElement('div');
    content.className = 'swipe-item__content';

    // Idea text/header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'flex-start';
    header.style.marginBottom = '0.5rem';
    header.style.gap = '0.5rem';

    const time = document.createElement('div');
    time.className = 'idea-time';
    time.textContent = formatTime(idea.createdAt);
    time.style.fontSize = '0.75rem';
    time.style.color = 'var(--muted-foreground)';
    time.style.whiteSpace = 'nowrap';

    // Priority dot button
    const currentPriority = idea.priority || '';
    const priorityEmoji = PRIORITY_BADGES[currentPriority] || '⚫';
    const priorityTitle = currentPriority
        ? `${currentPriority.charAt(0).toUpperCase() + currentPriority.slice(1)} priority - click to change`
        : 'No priority - click to set';
    const priorityDot = document.createElement('button');
    priorityDot.type = 'button';
    priorityDot.className = 'priority-dot';
    priorityDot.dataset.id = idea.id;
    priorityDot.dataset.priority = currentPriority;
    priorityDot.title = priorityTitle;
    priorityDot.setAttribute('aria-label', priorityTitle);
    priorityDot.textContent = priorityEmoji;

    // Thread button
    const threadBtn = document.createElement('button');
    threadBtn.type = 'button';
    threadBtn.className = 'idea-thread';
    threadBtn.dataset.threadId = idea.id;
    threadBtn.setAttribute('aria-label', 'Toggle notes');
    threadBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-4.5L12 21l-2.5-3.5H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M8.5 9.5h7M8.5 13h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>`;

    // Meta container for priority + thread + time
    const meta = document.createElement('div');
    meta.className = 'idea-meta';
    meta.appendChild(priorityDot);
    meta.appendChild(threadBtn);
    meta.appendChild(time);

    const textEl = document.createElement('div');
    textEl.className = 'idea-text-preview';
    textEl.innerHTML = escapeHtml(idea.text).replace(/\n/g, '<br>');

    // Categories
    const catGroup = document.createElement('div');
    catGroup.className = 'category-chip-group';
    catGroup.dataset.ideaId = idea.id;
    catGroup.style.marginTop = '0'; // Reset potential margins
    // Allow wrapping if many categories
    catGroup.style.flexWrap = 'wrap';

    const catList = document.createElement('div');
    catList.className = 'category-chip-list';
    renderCategoryChipElements(catList, getIdeaCategories(idea));

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'category-add-btn';
    addBtn.dataset.categoryAddTrigger = idea.id;
    addBtn.setAttribute('aria-label', 'Add category');
    addBtn.innerHTML = '<span aria-hidden="true">+</span>';

    catGroup.appendChild(catList);
    catGroup.appendChild(addBtn);

    // Assemble Header: Categories (Left) | Meta (Right)
    header.appendChild(catGroup);
    header.appendChild(meta);

    content.appendChild(header);
    content.appendChild(textEl);

    item.appendChild(content);

    // Inline Editor (hidden by default)
    const editor = document.createElement('div');
    editor.className = 'inline-edit';
    editor.hidden = true;
    editor.innerHTML = `
        <textarea class="inline-edit__input" rows="3"></textarea>
        <div class="inline-edit__actions">
            <button type="button" data-inline-cancel>Cancel</button>
            <button type="button" data-inline-save="${idea.id}">Save</button>
        </div>
    `;
    item.appendChild(editor);

    // Attach thread notes (inline expandable notes)
    attachThread(item, idea.id);

    return item;
}


q.addEventListener('input', render);
q.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        event.preventDefault();
        if (q.value) {
            q.value = '';
            render();
        }
        setSearchOpen(false);
    }
});

if (categoryFilterToggle) {
    categoryFilterToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isCategoryFilterOpen) {
            closeCategoryFilter();
        } else {
            openCategoryFilter();
        }
    });
}

// Apply immediately on checkbox toggle
if (categoryFilterOptionsEl) {
    categoryFilterOptionsEl.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
        const selectedValues = Array.from(categoryFilterOptionsEl.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
        setCategoryFilterSelections(selectedValues);
    });
}

if (categoryFilterClearButton) {
    categoryFilterClearButton.addEventListener('click', (e) => {
        e.stopPropagation();
        setCategoryFilterSelections([]);
        closeCategoryFilter();
        categoryFilterToggle?.focus({ preventScroll: true });
    });
}

cat.addEventListener('change', render);
status.addEventListener('change', render);

// Sort preference handler with persistence
if (sortBy) {
    // Restore saved preference
    try {
        const saved = localStorage.getItem(SORT_STORAGE_KEY);
        if (saved && (saved === 'date' || saved === 'priority')) {
            sortBy.value = saved;
        }
    } catch (e) { /* ignore */ }

    sortBy.addEventListener('change', () => {
        try {
            localStorage.setItem(SORT_STORAGE_KEY, sortBy.value);
        } catch (e) { /* ignore */ }
        render();
    });
}

window.addEventListener('categoryDeleted', () => {
    Promise.all([
        updateCategoryList(),
        refreshIdeas({ force: true }),
        refreshCategoryPalette({ force: true })
    ]).catch(console.error);
});

window.addEventListener('categoryPaletteUpdated', () => {
    refreshCategoryPalette({ force: true }).catch(console.error);
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        Promise.all([
            updateCategoryList(),
            refreshIdeas({ force: true }),
            refreshCategoryPalette({ force: true })
        ]).catch(console.error);
    }
});

// Set up real-time listener for ideas
const unsubscribe = subscribeToIdeas((ideas) => {
    ideasCache = ideas;
    render();
});

// Clean up listener when page unloads
window.addEventListener('beforeunload', () => {
    unsubscribe();
    cleanupThreadNotes();
});

// Periodic refresh for category palette (not real-time critical)
setInterval(() => {
    updateCategoryList().catch(console.error);
    refreshCategoryPalette({ force: true }).catch(console.error);
}, 30000);
