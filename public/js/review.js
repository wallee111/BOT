import {
  getIdeas,
  subscribeToIdeas,
  deleteIdea,
  getCategories,
  setIdeaCategories,
  getCategoryPalette,
  setIdeaArchived,
  updateIdeaText
} from '../storage.js?v=3';
import { getCategoryAppearance, normalizeCategories, HEX_COLOR_PATTERN } from '../utils.js?v=2';
import { getCurrentUserId, ensureAuthSession } from '../auth.js';

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
    let categoryDropdownAnchor = null;

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

        // Populate anchored dropdown content
        let categoryDropdownMode = 'multi'; // 'multi' | 'replace'
        let categoryDropdownTarget = null; // original category name when replacing

        function populateCategoryDropdown(ideaId, { mode = 'multi', targetCategory = null } = {}) {
            if (!categoryEditDropdownContent) return;
            const idea = ideasCache.find(entry => entry.id === ideaId);
            const currentCategories = idea ? getIdeaCategories(idea) : [];
            const normalized = normalizeCategories(currentCategories);
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
                        // if removing last, becomes uncategorized
                        await setIdeaCategories(ideaId, next);
                        await Promise.all([
                            refreshIdeas({ force: true }),
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
                const items = categoryOptions.slice();
                items.sort((a, b) => CATEGORY_COLLATOR.compare(a, b));
                items.forEach(category => {
                    if (category === '__uncategorized__') return;
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
                                // Was uncategorized or missing; add selected
                                next = [selected, ...next.filter(c => c.toLowerCase() !== selected.toLowerCase())];
                            }
                            // Deduplicate while preserving order
                            const seen = new Set();
                            next = next.filter(c => {
                                const key = c.toLowerCase();
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                            });
                            await setIdeaCategories(ideaId, next);
                            await Promise.all([
                                refreshIdeas({ force: true }),
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

            // Default: multi-select checkbox list (for + button)
            const items = [...categoryOptions];
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
                label.appendChild(checkbox);
                label.appendChild(span);
                categoryEditDropdownContent.appendChild(label);
            });

            // Live save on change for multi-select; use onchange to avoid duplicate listeners
            categoryEditDropdownContent.onchange = async (e) => {
                const target = e.target;
                if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
                const allCbs = Array.from(categoryEditDropdownContent.querySelectorAll('input[type="checkbox"]'));
                if (target.dataset.category === '__uncategorized__') {
                    if (target.checked) {
                        allCbs.forEach(cb => { if (cb !== target) cb.checked = false; });
                    }
                } else {
                    const uncCb = allCbs.find(cb => cb.dataset.category === '__uncategorized__');
                    if (uncCb) uncCb.checked = false;
                }
                const selected = allCbs
                    .filter(cb => cb.checked && cb.dataset.category && cb.dataset.category !== '__uncategorized__')
                    .map(cb => cb.dataset.category);
                try {
                    if (currentModalIdeaId) {
                        await setIdeaCategories(currentModalIdeaId, selected);
                        await Promise.all([
                            refreshIdeas({ force: true }),
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
                const panel = categoryEditDropdown;
                const panelRect = panel.getBoundingClientRect();
                const margin = 8;
                let top = rect.bottom + margin;
                let left = rect.left;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                if (top + panelRect.height > vh) {
                    top = Math.max(margin, rect.top - panelRect.height - margin);
                }
                if (left + panelRect.width > vw - margin) {
                    left = Math.max(margin, vw - panelRect.width - margin);
                }
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
            if (!categoryEditDropdown || categoryEditDropdown.hidden) return;
            const skipSave = Boolean(options.skipSave);
            if (!skipSave && currentModalIdeaId && categoryEditDropdownContent) {
                const checkboxes = categoryEditDropdownContent.querySelectorAll('input[type="checkbox"]');
                if (checkboxes.length) {
                    const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.dataset.category).filter(Boolean);
                    try {
                        await setIdeaCategories(currentModalIdeaId, selected);
                        await Promise.all([
                            refreshIdeas({ force: true }),
                            updateCategoryList(),
                            refreshCategoryPalette({ force: true })
                        ]);
                    } catch (e) {
                        console.error('Saving categories failed:', e);
                    }
                }
            }
            categoryEditDropdown.hidden = true;
            categoryEditDropdownContent.innerHTML = '';
            currentModalIdeaId = null;
            categoryDropdownAnchor = null;
        }

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

        function createIdeaListItem(idea) {
            const li = document.createElement('li');
            li.className = 'card swipe-item';
            if (idea.archived) {
                li.classList.add('is-archived');
            }
            li.dataset.id = idea.id;
            li.dataset.text = idea.text;

            const leftActions = document.createElement('div');
            leftActions.className = 'swipe-actions swipe-actions--left';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'swipe-btn swipe-btn--edit';
            editBtn.dataset.editIdea = idea.id;
            editBtn.setAttribute('aria-label', 'Edit idea');
            editBtn.innerHTML = '<span aria-hidden="true">✏️</span>';

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'swipe-btn swipe-btn--delete';
            deleteBtn.dataset.del = idea.id;
            deleteBtn.setAttribute('aria-label', 'Delete idea');
            deleteBtn.innerHTML = '<span aria-hidden="true">🗑</span>';

            leftActions.append(editBtn, deleteBtn);
            li.appendChild(leftActions);

            const content = document.createElement('div');
            content.className = 'swipe-item__content';

            const inner = document.createElement('div');
            inner.className = 'swipe-item__inner';

            const meta = document.createElement('div');
            meta.className = 'meta';

            const categories = getIdeaCategories(idea);
            const categoryGroup = document.createElement('div');
            categoryGroup.className = 'category-chip-group';
            categoryGroup.dataset.ideaId = idea.id;

            const categoryChipList = document.createElement('div');
            categoryChipList.className = 'category-chip-list';
            renderCategoryChipElements(categoryChipList, categories);

            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'category-add-btn';
            addButton.dataset.categoryAddTrigger = idea.id;
            addButton.setAttribute('aria-label', 'Add category');
            addButton.setAttribute('aria-haspopup', 'dialog');
            addButton.innerHTML = '<span aria-hidden="true">+</span>';

            categoryGroup.append(categoryChipList, addButton);
            meta.appendChild(categoryGroup);

            const timeEl = document.createElement('time');
            const timestamp = new Date(idea.createdAt);
            const datePart = timestamp.toLocaleDateString(undefined, {
                month: '2-digit',
                day: '2-digit',
                year: '2-digit'
            });
            const timePart = timestamp.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            timeEl.textContent = `${datePart} ${timePart}`;
            meta.appendChild(timeEl);

            if (idea.archived) {
                const statusSpan = document.createElement('span');
                statusSpan.className = 'status-pill';
                statusSpan.textContent = 'Archived';
                meta.appendChild(statusSpan);
            }

            inner.appendChild(meta);

            // Category add menu is appended within categoryGroup

            const textPara = document.createElement('p');
            textPara.className = 'idea-text';
            textPara.textContent = idea.text;
            inner.appendChild(textPara);

            const editPanel = document.createElement('div');
            editPanel.className = 'inline-edit';
            editPanel.hidden = true;

            const editLabel = document.createElement('label');
            editLabel.className = 'visually-hidden';
            editLabel.setAttribute('for', `edit-text-${idea.id}`);
            editLabel.textContent = 'Edit idea text';

            const textarea = document.createElement('textarea');
            textarea.id = `edit-text-${idea.id}`;
            textarea.className = 'inline-edit__input';
            textarea.maxLength = 500;
            textarea.value = idea.text;

            const editActions = document.createElement('div');
            editActions.className = 'inline-edit__actions';

            const inlineSaveButton = document.createElement('button');
            inlineSaveButton.type = 'button';
            inlineSaveButton.dataset.inlineSave = idea.id;
            inlineSaveButton.textContent = 'Save';

            const inlineCancelButton = document.createElement('button');
            inlineCancelButton.type = 'button';
            inlineCancelButton.className = 'btn-ghost';
            inlineCancelButton.dataset.inlineCancel = idea.id;
            inlineCancelButton.textContent = 'Cancel';

            editActions.append(inlineSaveButton, inlineCancelButton);
            editPanel.append(editLabel, textarea, editActions);
            inner.appendChild(editPanel);

            content.appendChild(inner);
            li.appendChild(content);

            return li;
        }

        function render() {
            // Close inline dropdown when re-rendering
            closeCategoryDropdown();
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
                console.log('[render] ideasCache not ready yet');
                list.innerHTML = '<p>Loading...</p>';
                return;
            }

            const ideas = ideasCache
                .slice()
                .sort((a, b) => b.createdAt - a.createdAt)
                .filter(idea => {
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
            if (!panel) return;
            const textarea = panel.querySelector('.inline-edit__input');
            panel.hidden = false;
            item.classList.add('is-editing');
            if (textarea) {
                textarea.value = item.dataset.text || '';
                requestAnimationFrame(() => {
                    textarea.focus();
                    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                });
            }
        }

        function closeInlineEditor(item) {
            if (!item) return;
            const panel = item.querySelector('.inline-edit');
            if (panel) {
                panel.hidden = true;
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
                openCategoryDropdown(ideaId, categoryChip, { mode: 'replace', targetCategory: catName });
                return;
            }

            // Handle + button clicks (multi-select add/remove)
            const addTrigger = e.target.closest('[data-category-add-trigger]');
            if (addTrigger) {
                const ideaId = addTrigger.dataset.categoryAddTrigger;
                openCategoryDropdown(ideaId, addTrigger, { mode: 'multi' });
                return;
            }
        });

        // Modal category option selection removed - now using checkboxes with auto-save on close

        // List click handlers for other actions
        list.addEventListener('click', async e => {

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
            if (event.target.closest('[data-category-add-trigger]') || event.target.closest('.inline-edit')) {
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
                const clickedAnchor = categoryDropdownAnchor && categoryDropdownAnchor.contains?.(event.target);
                if (!clickedInsideDropdown && !clickedAnchor) {
                    closeCategoryDropdown();
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
                    closeCategoryDropdown();
                }
            }
        });

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
        });

        // Periodic refresh for category palette (not real-time critical)
        setInterval(() => {
            updateCategoryList().catch(console.error);
            refreshCategoryPalette({ force: true }).catch(console.error);
        }, 30000);
