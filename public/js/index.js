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
  setIdeaCategories
} from '../storage.js?v=3';
import {
  escapeHtml,
  getReadableTextColor,
  getCategoryAppearance,
  formatTime,
  HEX_COLOR_PATTERN,
  normalizeCategories
} from '../utils.js?v=2';
import { getCurrentUserId, ensureAuthSession } from '../auth.js';

        const $ = sel => document.querySelector(sel);

        const pinnedContainer = $('#pinnedIdeaContainer');
        const mainFeed = $('#ideasFeed');
        const hiddenFeed = $('#hiddenIdeasFeed');
        const focusFeed = $('#focusFeed');
        const focusCategoryToggle = document.getElementById('tab-focus');
        const focusCategoryMenu = document.getElementById('focusCategoryMenu');
        const focusTabLabel = document.getElementById('focusTabLabel');
        const focusCategoryLabel = focusTabLabel;
        const feedCarousel = $('#feedCarousel');
        const feedSlider = $('#feedSlider');
        const feedTabs = Array.from(document.querySelectorAll('.feed-tab'));
        const feedPanels = Array.from(document.querySelectorAll('.feed-panel'));
        const textInput = $('#text');
        const categorySelect = $('#categorySelect');
        const categoryNew = $('#categoryNew');
        const categoryIcon = document.querySelector('.select-wrap.icon-only');
        const toast = $('#toast');
    const categoryEditDropdown = document.getElementById('categoryEditDropdown');
    const categoryEditDropdownContent = document.getElementById('categoryEditDropdownContent');
    let categoryDropdownAnchor = null;
    let currentModalIdeaId = null;

        const TAB_ORDER = ['focus', 'main', 'hidden'];
        const FOCUS_CATEGORY_KEY = 'focus_feed_category_v1';
        const CATEGORY_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });

        let categoryPalette = {};
        let availableCategories = [];
        let activeTab = 'main';
        let focusCategory = '';
        let allIdeas = [];
        let categoryUsage = {};
        let swipeStartX = 0;
        let swipeCurrentX = 0;
        let swipeStartTime = 0;
        let swipeActive = false;
        let swipePointerType = '';

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

        async function updateCategoryList(preferredCategory) {
            const categories = await getCategories();
            const paletteCategories = Object.keys(categoryPalette || {});
            const combinedCategories = Array.from(new Set([...categories, ...paletteCategories])).filter(Boolean);
            availableCategories = combinedCategories.slice();
            
            // Sort by most recently used
            const sortedCategories = getCategoriesByRecentUsage(combinedCategories);
            
            const current = preferredCategory !== undefined ? preferredCategory : categorySelect.value;
            categorySelect.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Choose category…';
            categorySelect.appendChild(placeholder);

            sortedCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categorySelect.appendChild(option);
            });

            if (current && combinedCategories.includes(current)) {
                categorySelect.value = current;
            } else {
                categorySelect.value = '';
            }
            refreshCategoryIndicator();

            const focusLower = focusCategory && focusCategory !== '__uncategorized__' ? focusCategory.toLowerCase() : focusCategory;
            if (focusLower && focusLower !== '__uncategorized__') {
                const categoriesLower = new Set(combinedCategories.map(cat => cat.toLowerCase()));
                if (!categoriesLower.has(focusLower)) {
                    focusCategory = '';
                    try {
                        localStorage.removeItem(FOCUS_CATEGORY_KEY);
                    } catch (error) {
                        /* noop */
                    }
                }
            }
            updateFocusCategoryLabel();
            if (allIdeas.length) {
                renderFeeds(allIdeas);
            }
        }

        categorySelect.addEventListener('change', () => {
            if (categorySelect.value) {
                categoryNew.value = '';
            }
            refreshCategoryIndicator();
        });

        categoryNew.addEventListener('input', () => {
            if (categoryNew.value.trim()) {
                categorySelect.value = '';
            }
            refreshCategoryIndicator();
        });

        function applyAppearanceStyles(target, appearance) {
            if (!appearance?.style) return;
            appearance.style.split(';').forEach(rule => {
                const [prop, value] = rule.split(':');
                if (prop && value) target.style.setProperty(prop.trim(), value.trim());
            });
        }

        function renderCategoryChipElements(container, categories) {
            if (!container) return;
            container.innerHTML = '';
            const normalized = normalizeCategories(categories || []);
            const ideaGroup = container.closest('.category-chip-group');
            const ideaId = ideaGroup?.dataset.ideaId;
            if (!normalized.length) {
                const chip = document.createElement('span');
                chip.className = 'category-chip uncategorized';
                chip.textContent = 'Uncategorized';
                chip.dataset.categoryChip = ideaId || '';
                chip.dataset.ideaId = ideaId || '';
                chip.dataset.categoryName = '__uncategorized__';
                chip.style.cursor = 'pointer';
                container.appendChild(chip);
                return;
            }
            normalized.forEach(category => {
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

        function getIdeaCategoriesList(idea) {
            return Array.isArray(idea?.categories)
                ? idea.categories.filter(Boolean)
                : (idea?.category ? [idea.category] : []);
        }

        function computeCategoryUsage(ideas) {
            categoryUsage = {};
            ideas.forEach(idea => {
                const timestamp = Number(idea.createdAt) || 0;
                const categories = getIdeaCategoriesList(idea);
                if (!categories.length) {
                    categoryUsage['__uncategorized__'] = Math.max(categoryUsage['__uncategorized__'] || 0, timestamp);
                }
                categories.forEach(category => {
                    const key = (category || '').trim().toLowerCase();
                    if (!key) return;
                    categoryUsage[key] = Math.max(categoryUsage[key] || 0, timestamp);
                });
            });
        }

        function getCategoryUsageScore(name) {
            const key = (name || '').trim().toLowerCase();
            if (!key) return 0;
            if (key === '__uncategorized__') {
                return categoryUsage['__uncategorized__'] || 0;
            }
            return categoryUsage[key] || 0;
        }

        function updateFocusCategoryLabel() {
            if (!focusCategoryLabel || !focusTabLabel) return;
            let label = 'Select category';
            if (focusCategory === '__uncategorized__') {
                label = 'Uncategorized';
            } else if (focusCategory) {
                label = focusCategory;
            }
            focusCategoryLabel.textContent = label;
            focusTabLabel.textContent = focusCategory ? label : 'Category';
            focusTabLabel.title = focusCategory ? label : 'Category';
            focusCategoryToggle?.setAttribute('title', label);
        }

        function isCategoryHiddenOnActive(name) {
            const trimmed = (name || '').trim();
            if (!trimmed) {
                return false;
            }
            const entry = categoryPalette[trimmed];
            if (entry && entry.visible === false) {
                return true;
            }
            return false;
        }

        function shouldHideFromActiveFeed(idea) {
            const categories = getIdeaCategoriesList(idea);
            if (!categories.length) {
                return isCategoryHiddenOnActive('__uncategorized__');
            }
            return categories.some(category => isCategoryHiddenOnActive(category));
        }

        function setFocusCategory(value) {
            focusCategory = value === '__uncategorized__' ? '__uncategorized__' : (value || '');
            try {
                if (focusCategory) {
                    localStorage.setItem(FOCUS_CATEGORY_KEY, focusCategory);
                } else {
                    localStorage.removeItem(FOCUS_CATEGORY_KEY);
                }
            } catch (error) {
                /* noop */
            }
            updateFocusCategoryLabel();
            renderFeeds(allIdeas);
        }

        function populateFocusCategoryMenu() {
            if (!focusCategoryMenu) return;
            focusCategoryMenu.innerHTML = '';
            const sortedCategories = availableCategories.slice().sort((a, b) => CATEGORY_COLLATOR.compare(a, b));
            const options = ['__uncategorized__', ...sortedCategories];
            if (!options.length) {
                const empty = document.createElement('p');
                empty.className = 'focus-menu-empty';
                empty.textContent = 'No categories yet.';
                focusCategoryMenu.appendChild(empty);
                return;
            }
            options.forEach(optionValue => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'focus-category-option';
                button.dataset.focusCategory = optionValue;
                button.textContent = optionValue === '__uncategorized__' ? 'Uncategorized' : optionValue;
                if (optionValue === focusCategory) {
                    button.classList.add('is-selected');
                }
                focusCategoryMenu.appendChild(button);
            });
        }

        function openFocusCategoryMenu() {
            if (!focusCategoryMenu || !focusCategoryToggle) return;
            populateFocusCategoryMenu();
            
            // Position the dropdown relative to the button
            const buttonRect = focusCategoryToggle.getBoundingClientRect();
            focusCategoryMenu.style.top = `${buttonRect.bottom + 8}px`;
            focusCategoryMenu.style.left = `${buttonRect.left}px`;
            focusCategoryMenu.style.width = `${Math.max(200, buttonRect.width)}px`;
            
            focusCategoryMenu.hidden = false;
            focusCategoryToggle.setAttribute('aria-expanded', 'true');
        }

        function closeFocusCategoryMenu() {
            if (!focusCategoryMenu || !focusCategoryToggle) return;
            focusCategoryMenu.hidden = true;
            focusCategoryToggle.setAttribute('aria-expanded', 'false');
        }

        function renderFocusFeed(activeIdeas, pinnedIdea) {
            if (!focusFeed) return;
            const pinnedId = pinnedIdea?.id;

            if (!focusCategory) {
                focusFeed.innerHTML = '<p class="feed-empty">Pick a category to focus.</p>';
                return;
            }

            const matchList = activeIdeas.filter(idea => {
                if (pinnedId && idea.id === pinnedId) {
                    return false;
                }
                const categories = getIdeaCategoriesList(idea).map(cat => (cat || '').trim().toLowerCase());
                if (focusCategory === '__uncategorized__') {
                    return categories.length === 0;
                }
                return categories.includes(focusCategory.toLowerCase());
            });

            if (!matchList.length) {
                focusFeed.innerHTML = '<p class="feed-empty">No notes in this category yet.</p>';
                return;
            }

            focusFeed.scrollTop = 0;
            renderFeedList(focusFeed, matchList, { hiddenView: false, autoScroll: activeTab === 'focus' });
        }

        try {
            const storedFocus = localStorage.getItem(FOCUS_CATEGORY_KEY);
            if (storedFocus) {
                focusCategory = storedFocus;
            }
        } catch (error) {
            focusCategory = '';
        }
        updateFocusCategoryLabel();

        function renderPinnedIdea(idea) {
            if (!pinnedContainer) {
                return;
            }
            pinnedContainer.innerHTML = '';
            if (!idea || idea.archived || idea.hidden) {
                pinnedContainer.hidden = true;
                return;
            }
            pinnedContainer.hidden = false;
            const bubble = buildIdeaElement(idea);
            const row = document.createElement('div');
            row.className = 'idea-row';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'idea-complete';
            checkbox.dataset.id = idea.id;
            checkbox.setAttribute('aria-label', 'Mark idea as completed');
            row.append(checkbox, bubble);
            pinnedContainer.append(row);
        }

        // Format date as MM/DD
        function formatDateMMDD(ts) {
            const d = new Date(ts);
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${mm}/${dd}`;
        }

        function buildIdeaElement(idea, { hiddenView = false } = {}) {
            const ideaEl = document.createElement('div');
            ideaEl.className = 'idea-bubble';
            const isPinned = Boolean(idea.pinned);
            if (isPinned) {
                ideaEl.classList.add('is-pinned');
            }
            const now = Date.now();
            const createdAt = Number(idea.createdAt) || 0;
            const olderThanDay = createdAt && (now - createdAt) > 24 * 60 * 60 * 1000;
            const timeMarkup = olderThanDay
                ? `${formatDateMMDD(createdAt)} ${formatTime(createdAt)}`
                : formatTime(createdAt);
            const buttonLabel = hiddenView ? 'Unhide' : 'Hide';
            const buttonAction = hiddenView ? 'unhide' : 'hide';
            const buttonAria = hiddenView ? 'Unhide idea' : 'Hide idea';
            const showPinControl = !hiddenView;
            const pinIcon = `
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 3.5h8l-1 6h3l-5.5 5.5V21l-2.5-1.5v-4L5 9.5h3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"></path>
                </svg>
            `;
            const pinButtonMarkup = showPinControl
                ? `<button type="button" class="idea-pin${isPinned ? ' is-active' : ''}" data-id="${idea.id}" data-pinned="${isPinned ? 'true' : 'false'}" aria-pressed="${isPinned ? 'true' : 'false'}" aria-label="${isPinned ? 'Unpin idea' : 'Pin idea'}">${pinIcon}</button>`
                : '';
            ideaEl.innerHTML = `
            ${pinButtonMarkup}
            <div class="idea-body">
                <div class="idea-categories"></div>
                <p class="idea-text">${escapeHtml(idea.text)}</p>
                <div class="idea-footer">
                    <div class="idea-time">${timeMarkup}</div>
                    <button type="button" class="idea-hide" data-id="${idea.id}" data-action="${buttonAction}" aria-label="${buttonAria}">${buttonLabel}</button>
                </div>
            </div>`;

            // Replace categories section with interactive chip group + add button
            const body = ideaEl.querySelector('.idea-body');
            const oldCats = body?.querySelector('.idea-categories');
            const categoryGroup = document.createElement('div');
            categoryGroup.className = 'category-chip-group';
            categoryGroup.dataset.ideaId = idea.id;

            const chipList = document.createElement('div');
            chipList.className = 'category-chip-list';
            const cats = Array.isArray(idea.categories) && idea.categories.length ? idea.categories : (idea.category ? [idea.category] : []);
            renderCategoryChipElements(chipList, cats);

            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'category-add-btn';
            addButton.dataset.categoryAddTrigger = idea.id;
            addButton.setAttribute('aria-label', 'Add category');
            addButton.setAttribute('aria-haspopup', 'dialog');
            addButton.innerHTML = '<span aria-hidden="true">+</span>';

            categoryGroup.append(chipList, addButton);
            if (oldCats && oldCats.parentNode) {
                oldCats.parentNode.replaceChild(categoryGroup, oldCats);
            } else {
                body?.insertBefore(categoryGroup, body.firstChild);
            }
            return ideaEl;
        }

        // Anchored dropdown for category editing (matches review with one addition: Remove button)
        let categoryDropdownMode = 'multi';
        let categoryDropdownTarget = null;

        function populateCategoryDropdown(ideaId, { mode = 'multi', targetCategory = null } = {}) {
            if (!categoryEditDropdownContent) return;
            const idea = allIdeas.find(entry => entry.id === ideaId);
            const currentCategories = idea ? (Array.isArray(idea.categories) && idea.categories.length ? idea.categories : (idea.category ? [idea.category] : [])) : [];
            const normalized = normalizeCategories(currentCategories);
            const items = [...availableCategories];
            categoryEditDropdownContent.innerHTML = '';
            categoryEditDropdownContent.onchange = null;
            categoryDropdownMode = mode;
            categoryDropdownTarget = targetCategory;

            if (mode === 'replace') {
                // Remove at top
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'category-modal__action-remove';
                removeBtn.textContent = 'Remove category';
                removeBtn.addEventListener('click', async () => {
                    try {
                        let next = normalized.slice();
                        const targetLower = (targetCategory || '').trim().toLowerCase();
                        if (targetLower) {
                            next = next.filter(c => (c || '').trim().toLowerCase() !== targetLower);
                        }
                        await setIdeaCategories(ideaId, next);
                        await Promise.all([
                            loadExistingIdeas({ force: true }),
                            updateCategoryList(),
                            refreshCategoryPalette({ force: true })
                        ]);
                    } catch (e) {
                        console.error('Failed to remove category', e);
                    } finally {
                        closeCategoryDropdown({ skipSave: true });
                    }
                });
                categoryEditDropdownContent.appendChild(removeBtn);

                // Single-select list (tap-to-apply, no radio)
                const list = document.createElement('div');
                const radioItems = items.slice().filter(c => c !== '__uncategorized__').sort((a, b) => CATEGORY_COLLATOR.compare(a, b));
                radioItems.forEach(category => {
                    const row = document.createElement('div');
                    row.className = 'category-modal__checkbox-item';
                    if ((targetCategory || '').trim().toLowerCase() === category.toLowerCase()) {
                        row.classList.add('is-active');
                    }
                    row.setAttribute('role', 'button');
                    row.tabIndex = 0;
                    const span = document.createElement('span');
                    span.className = 'category-modal__checkbox-label';
                    span.textContent = category;
                    row.append(span);
                    const applySelection = async () => {
                        const selected = category;
                        if ((targetCategory || '').trim().toLowerCase() === selected.toLowerCase()) {
                            closeCategoryDropdown();
                            return;
                        }
                        try {
                            const idx = normalized.findIndex(c => (c || '').trim().toLowerCase() === (targetCategory || '').trim().toLowerCase());
                            let next = normalized.slice();
                            if (idx >= 0) {
                                next[idx] = selected;
                            } else {
                                next = [selected, ...next.filter(c => c.toLowerCase() !== selected.toLowerCase())];
                            }
                            const seen = new Set();
                            next = next.filter(c => { const k = c.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
                            await setIdeaCategories(ideaId, next);
                            await Promise.all([
                                loadExistingIdeas({ force: true }),
                                updateCategoryList(),
                                refreshCategoryPalette({ force: true })
                            ]);
                        } catch (e) {
                            console.error('Failed to replace category', e);
                        } finally {
                            closeCategoryDropdown({ skipSave: true });
                        }
                    };
                    row.addEventListener('click', applySelection);
                    row.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            applySelection();
                        }
                    });
                    list.appendChild(row);
                });
                categoryEditDropdownContent.appendChild(list);
                return;
            }

            // Multi-select for + button (unchanged from earlier)
            if (!items.includes('__uncategorized__')) items.unshift('__uncategorized__');
            items.forEach(category => {
                const isUncategorized = category === '__uncategorized__';
                const label = document.createElement('label');
                label.className = 'category-modal__checkbox-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.dataset.category = isUncategorized ? '__uncategorized__' : category;
                checkbox.checked = isUncategorized ? normalized.length === 0 : normalized.includes(category);
                const span = document.createElement('span');
                span.className = 'category-modal__checkbox-label';
                span.textContent = isUncategorized ? 'Uncategorized' : category;
                label.append(checkbox, span);
                categoryEditDropdownContent.appendChild(label);
            });
            categoryEditDropdownContent.onchange = async (e) => {
                const target = e.target;
                if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
                const allCbs = Array.from(categoryEditDropdownContent.querySelectorAll('input[type="checkbox"]'));
                if (target.dataset.category === '__uncategorized__') {
                    if (target.checked) allCbs.forEach(cb => { if (cb !== target) cb.checked = false; });
                } else {
                    const unc = allCbs.find(cb => cb.dataset.category === '__uncategorized__');
                    if (unc) unc.checked = false;
                }
                const selected = allCbs.filter(cb => cb.checked && cb.dataset.category && cb.dataset.category !== '__uncategorized__').map(cb => cb.dataset.category);
                try {
                    if (currentModalIdeaId) {
                        await setIdeaCategories(currentModalIdeaId, selected);
                        await Promise.all([
                            loadExistingIdeas({ force: true }),
                            updateCategoryList(),
                            refreshCategoryPalette({ force: true })
                        ]);
                        if (categoryDropdownAnchor) positionCategoryDropdown(categoryDropdownAnchor);
                    }
                } catch (err) {
                    console.error('Category update failed', err);
                }
            };
        }

        function positionCategoryDropdown(anchorEl) {
            if (!categoryEditDropdown || !anchorEl) return;
            const rect = anchorEl.getBoundingClientRect();
            categoryEditDropdown.hidden = false;
            categoryEditDropdown.style.visibility = 'hidden';
            categoryEditDropdown.style.top = '0px';
            categoryEditDropdown.style.left = '0px';
            requestAnimationFrame(() => {
                const panelRect = categoryEditDropdown.getBoundingClientRect();
                const margin = 8;
                let top = rect.bottom + margin;
                let left = rect.left;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                if (top + panelRect.height > vh) top = Math.max(margin, rect.top - panelRect.height - margin);
                if (left + panelRect.width > vw - margin) left = Math.max(margin, vw - panelRect.width - margin);
                categoryEditDropdown.style.top = `${Math.round(top)}px`;
                categoryEditDropdown.style.left = `${Math.round(left)}px`;
                categoryEditDropdown.style.visibility = 'visible';
            });
        }

        function openCategoryDropdown(ideaId, anchorEl, options = {}) {
            currentModalIdeaId = ideaId;
            categoryDropdownAnchor = anchorEl || null;
            populateCategoryDropdown(ideaId, options);
            categoryEditDropdown.hidden = false;
            positionCategoryDropdown(anchorEl);
        }

        async function closeCategoryDropdown(options = {}) {
            const { overrideCategories, skipSave = false } = options || {};
            if (!categoryEditDropdown || categoryEditDropdown.hidden) return;
            if (!skipSave && currentModalIdeaId) {
                let selected = Array.isArray(overrideCategories) ? overrideCategories : null;
                if (!selected && categoryEditDropdownContent) {
                    const checkboxes = categoryEditDropdownContent.querySelectorAll('input[type="checkbox"]');
                    if (checkboxes.length) {
                        selected = Array.from(checkboxes)
                            .filter(cb => cb.checked)
                            .map(cb => cb.dataset.category)
                            .filter(Boolean);
                    }
                }
                try {
                    if (selected) {
                        await setIdeaCategories(currentModalIdeaId, selected);
                        await Promise.all([
                            loadExistingIdeas({ force: true }),
                            updateCategoryList(),
                            refreshCategoryPalette({ force: true })
                        ]);
                    }
                } catch (e) {
                    console.error('Saving categories failed:', e);
                }
            }
            categoryEditDropdown.hidden = true;
            categoryEditDropdownContent.innerHTML = '';
            currentModalIdeaId = null;
            categoryDropdownAnchor = null;
        }

        function renderFeedList(container, list, { hiddenView = false, autoScroll = false, suppressEmpty = false } = {}) {
            // Close inline dropdown when re-rendering
            try { closeCategoryDropdown(); } catch (_) {}
            const previousScrollTop = container.scrollTop;
            const isAtBottom = container.scrollHeight - (container.scrollTop + container.clientHeight) < 16;
            container.innerHTML = '';
            if (!list.length) {
                if (suppressEmpty) {
                    return;
                }
                const message = hiddenView
                    ? 'Hidden items will appear here.'
                    : 'Nothing here right now.';
                container.innerHTML = `<p class="feed-empty">${message}</p>`;
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
            if (autoScroll) {
                container.scrollTop = container.scrollHeight;
            } else if (!hiddenView && !isAtBottom) {
                container.scrollTop = Math.min(previousScrollTop, container.scrollHeight - container.clientHeight);
            }
        }

        function renderFeeds(ideas) {
            const ordered = [...ideas].sort((a, b) => a.createdAt - b.createdAt);
            const activePool = ordered.filter(idea => !idea.archived && !idea.hidden);
            const allNonArchived = ordered.filter(idea => !idea.archived); // Include hidden ideas for focus feed
            computeCategoryUsage(activePool);

            const pinnedIdea = activePool.find(idea => idea.pinned);
            renderPinnedIdea(pinnedIdea || null);

            const activeIdeasAll = activePool.filter(idea => !shouldHideFromActiveFeed(idea));
            const activeIdeas = pinnedIdea
                ? activeIdeasAll.filter(idea => idea.id !== pinnedIdea.id)
                : activeIdeasAll;
            const hiddenIdeas = ordered.filter(idea => !idea.archived && idea.hidden);

            renderFocusFeed(allNonArchived, pinnedIdea);
            renderFeedList(mainFeed, activeIdeas, { hiddenView: false, autoScroll: activeTab === 'main', suppressEmpty: Boolean(pinnedIdea) });
            renderFeedList(hiddenFeed, hiddenIdeas, { hiddenView: true, autoScroll: activeTab === 'hidden' });
        }

        async function refreshCategoryPalette(options = {}) {
            try {
                const palette = await getCategoryPalette({ force: Boolean(options.force) });
                categoryPalette = palette || {};
                if (allIdeas.length) {
                    renderFeeds(allIdeas);
                }
            } catch (error) {
                console.error('Unable to load category palette', error);
            }
        }

        async function loadExistingIdeas(options = {}) {
            const ideas = await getIdeas(options);
            allIdeas = ideas;
            renderFeeds(ideas);
        }

        async function initialize() {
            // Require a cached user session; otherwise redirect to signin
            const userId = await getCurrentUserId();
            if (!userId) {
                // Do not create an anonymous session implicitly
                window.location.href = 'signin.html';
                return;
            }
            // Ensure we have a Firebase auth session for Firestore rules
            try {
                await ensureAuthSession({ requireAuth: true });
            } catch (error) {
                window.location.href = 'signin.html';
                return;
            }
            await Promise.all([
                refreshCategoryPalette(),
                updateCategoryList(),
                loadExistingIdeas()
            ]);
            setActiveTab(activeTab);
            
            // Set up real-time listener for ideas
            const unsubscribe = subscribeToIdeas((ideas) => {
                allIdeas = ideas;
                renderFeeds(ideas);
            });
            
            // Clean up listener when page unloads
            window.addEventListener('beforeunload', () => {
                unsubscribe();
            });
        }

        function setActiveTab(tab) {
            if (!TAB_ORDER.includes(tab)) {
                return;
            }
            activeTab = tab;
            feedTabs.forEach(btn => {
                const isActive = btn.dataset.tab === tab;
                btn.classList.toggle('is-active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
            feedPanels.forEach(panel => {
                const isActive = panel.dataset.panel === tab;
                panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
            });
            if (feedCarousel) {
                const index = TAB_ORDER.indexOf(tab);
                feedCarousel.style.transform = `translateX(-${index * 100}%)`;
                feedCarousel.dataset.active = tab;
            }
            if (tab !== 'focus') {
                closeFocusCategoryMenu();
            }
        }

        function handleTabClick(event) {
            const tab = event.currentTarget.dataset.tab;
            if (!tab) {
                return;
            }
            if (tab === 'focus') {
                if (tab === activeTab) {
                    // Already on focus tab, toggle the dropdown
                    if (focusCategoryMenu?.hidden) {
                        openFocusCategoryMenu();
                    } else {
                        closeFocusCategoryMenu();
                    }
                } else {
                    // Switch to focus tab but don't open dropdown yet
                    setActiveTab(tab);
                }
                return;
            }
            if (tab !== activeTab) {
                setActiveTab(tab);
            }
        }

        feedTabs.forEach(btn => btn.addEventListener('click', handleTabClick));

        const SWIPE_IGNORE_SELECTOR = 'button, a, input, textarea, select, label, [role="button"], .idea-pin, .focus-category-toggle, .category-add-btn, .focus-category-menu, .category-add-menu';

        function handleSwipeStart(event) {
            if (!event.isPrimary) return;
            if (event.pointerType === 'mouse') return;
            if (event.target.closest(SWIPE_IGNORE_SELECTOR)) return;
            swipeActive = true;
            swipeStartX = event.clientX;
            swipeCurrentX = event.clientX;
            swipeStartTime = performance.now();
            swipePointerType = event.pointerType;
            try {
                feedSlider?.setPointerCapture?.(event.pointerId);
            } catch (_) {
                /* noop */
            }
        }

        function handleSwipeMove(event) {
            if (!swipeActive || (swipePointerType && event.pointerType !== swipePointerType)) return;
            swipeCurrentX = event.clientX;
        }

        function handleSwipeEnd(event) {
            if (!swipeActive || (swipePointerType && event.pointerType !== swipePointerType)) return;
            swipeActive = false;
            const deltaX = swipeCurrentX - swipeStartX;
            const elapsed = performance.now() - swipeStartTime;
            swipeStartX = 0;
            swipeCurrentX = 0;
            swipeStartTime = 0;
            swipePointerType = '';
            try {
                feedSlider?.releasePointerCapture?.(event.pointerId);
            } catch (_) {
                /* noop */
            }
            if (Math.abs(deltaX) < 60 || elapsed > 600) {
                return;
            }
            const currentIndex = TAB_ORDER.indexOf(activeTab);
            if (deltaX < 0 && currentIndex < TAB_ORDER.length - 1) {
                setActiveTab(TAB_ORDER[currentIndex + 1]);
            } else if (deltaX > 0 && currentIndex > 0) {
                setActiveTab(TAB_ORDER[currentIndex - 1]);
            }
        }

        if (focusCategoryMenu) {
            focusCategoryMenu.addEventListener('click', (event) => {
                const option = event.target.closest('.focus-category-option');
                if (!option) return;
                const value = option.dataset.focusCategory || '';
                setFocusCategory(value);
                closeFocusCategoryMenu();
                focusCategoryToggle?.focus({ preventScroll: true });
            });
        }

        document.addEventListener('click', (event) => {
            if (focusCategoryMenu && !focusCategoryMenu.hidden) {
                const isToggle = focusCategoryToggle?.contains(event.target) || event.target.closest('#tab-focus');
                const isOtherTab = event.target.closest('.feed-tab') && !event.target.closest('#tab-focus');
                if (isOtherTab || (!isToggle && !focusCategoryMenu.contains(event.target))) {
                    closeFocusCategoryMenu();
                }
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                let handled = false;
                if (focusCategoryMenu && !focusCategoryMenu.hidden) {
                    closeFocusCategoryMenu();
                    focusCategoryToggle?.focus({ preventScroll: true });
                    handled = true;
                }
                if (handled) {
                    event.preventDefault();
                }
            }
        });

        if (feedSlider) {
            feedSlider.addEventListener('pointerdown', handleSwipeStart);
            feedSlider.addEventListener('pointermove', handleSwipeMove);
            feedSlider.addEventListener('pointerup', handleSwipeEnd);
            feedSlider.addEventListener('pointercancel', handleSwipeEnd);
            feedSlider.addEventListener('pointerleave', handleSwipeEnd);
        }

        document.addEventListener('DOMContentLoaded', () => {
            setActiveTab(activeTab);
            initialize().catch(console.error);
        });

        $('#ideaForm').addEventListener('submit', async e => {
            e.preventDefault();
            const text = textInput.value.trim();
            if (!text) return;

            const manualCategory = categoryNew.value.trim();
            const selectedCategory = manualCategory || (categorySelect.value || '').trim();
            const categories = selectedCategory ? [selectedCategory] : [];

            const idea = {
                id: (window.crypto && typeof window.crypto.randomUUID === 'function')
                    ? window.crypto.randomUUID()
                    : `idea-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                text,
                category: categories[0] || '',
                categories,
                createdAt: Date.now()
            };

            try {
                await saveIdea(idea);
                
                // Track category usage for MRU sorting
                if (idea.category) {
                    trackCategoryUsage(idea.category);
                }
                
                await loadExistingIdeas({ force: true });
                const catJustAdded = categoryNew.value.trim();
                categoryNew.value = '';
                textInput.value = '';
                await updateCategoryList(catJustAdded || idea.category);
                await refreshCategoryPalette();
                refreshCategoryIndicator();
                if (toast) {
                    toast.hidden = false;
                    setTimeout(() => { toast.hidden = true; }, 1200);
                }
            } catch (error) {
                console.error('Unable to save idea', error);
            }
        });

        window.addEventListener('categoryDeleted', async () => {
            await updateCategoryList();
            await loadExistingIdeas({ force: true });
            await refreshCategoryPalette({ force: true });
        });

        window.addEventListener('categoryPaletteUpdated', async () => {
            await refreshCategoryPalette({ force: true });
        });

        // Unified event handler for idea interactions
        async function handleIdeaInteraction(event, container) {
            const checkbox = event.target.closest('.idea-complete');
            if (checkbox?.checked) {
                const ideaId = checkbox.dataset.id;
                if (!ideaId) return;
                checkbox.disabled = true;
                try {
                    await setIdeaArchived(ideaId, true);
                    await loadExistingIdeas({ force: true });
                } catch (error) {
                    console.error('Unable to archive idea', error);
                    checkbox.checked = false;
                } finally {
                    checkbox.disabled = false;
                }
                return;
            }

            const pinButton = event.target.closest('.idea-pin');
            if (pinButton) {
                const ideaId = pinButton.dataset.id;
                if (!ideaId) return;
                const currentlyPinned = pinButton.dataset.pinned === 'true';
                pinButton.disabled = true;
                try {
                    await setIdeaPinned(ideaId, !currentlyPinned);
                    await loadExistingIdeas({ force: true });
                } catch (error) {
                    console.error('Unable to update idea pinned state', error);
                } finally {
                    pinButton.disabled = false;
                }
                return;
            }

            const hideButton = event.target.closest('.idea-hide');
            if (hideButton) {
                const ideaId = hideButton.dataset.id;
                const action = hideButton.dataset.action;
                if (!ideaId || !action) return;
                hideButton.disabled = true;
                try {
                    await setIdeaHidden(ideaId, action === 'hide');
                    await loadExistingIdeas({ force: true });
                } catch (error) {
                    console.error('Unable to update idea visibility', error);
                } finally {
                    hideButton.disabled = false;
                }
            }
        }

        if (feedCarousel) {
            feedCarousel.addEventListener('change', (e) => handleIdeaInteraction(e, feedCarousel));
            feedCarousel.addEventListener('click', (e) => handleIdeaInteraction(e, feedCarousel));
            // Open dropdown from chip (replace) or + button (multi)
            feedCarousel.addEventListener('click', (e) => {
                const chip = e.target.closest('[data-category-chip]');
                if (chip) {
                    const ideaId = chip.dataset.categoryChip;
                    const catName = chip.dataset.categoryName || '';
                    openCategoryDropdown(ideaId, chip, { mode: 'replace', targetCategory: catName });
                    return;
                }
                const addTrigger = e.target.closest('[data-category-add-trigger]');
                if (addTrigger) {
                    const ideaId = addTrigger.dataset.categoryAddTrigger;
                    openCategoryDropdown(ideaId, addTrigger, { mode: 'multi' });
                }
            });
        }

        if (pinnedContainer) {
            pinnedContainer.addEventListener('change', (e) => handleIdeaInteraction(e, pinnedContainer));
            pinnedContainer.addEventListener('click', (e) => handleIdeaInteraction(e, pinnedContainer));
            pinnedContainer.addEventListener('click', (e) => {
                const chip = e.target.closest('[data-category-chip]');
                if (chip) {
                    const ideaId = chip.dataset.categoryChip;
                    const catName = chip.dataset.categoryName || '';
                    openCategoryDropdown(ideaId, chip, { mode: 'replace', targetCategory: catName });
                    return;
                }
                const addTrigger = e.target.closest('[data-category-add-trigger]');
                if (addTrigger) {
                    const ideaId = addTrigger.dataset.categoryAddTrigger;
                    openCategoryDropdown(ideaId, addTrigger, { mode: 'multi' });
                }
            });
        }

        // Close dropdown on outside click
        document.addEventListener('click', (event) => {
            if (!categoryEditDropdown || categoryEditDropdown.hidden) return;
            const within = categoryEditDropdown.contains(event.target);
            const isAnchor = categoryDropdownAnchor && (categoryDropdownAnchor === event.target || categoryDropdownAnchor.contains?.(event.target));
            if (!within && !isAnchor) {
                closeCategoryDropdown();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && categoryEditDropdown && !categoryEditDropdown.hidden) {
                event.preventDefault();
                closeCategoryDropdown();
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                loadExistingIdeas({ force: true }).catch(console.error);
                updateCategoryList().catch(console.error);
                refreshCategoryPalette({ force: true }).catch(console.error);
            }
        });
