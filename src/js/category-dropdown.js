import { normalizeCategories } from '../lib/utils.js';
import { setIdeaCategories } from '../lib/storage.js';

/**
 * Creates a category dropdown controller that manages positioning, populating,
 * opening, and closing an anchored category edit dropdown.
 *
 * @param {object} config
 * @param {() => HTMLElement} config.getDropdown - returns the dropdown container element
 * @param {() => HTMLElement} config.getContent - returns the dropdown content element
 * @param {(id: string) => object|null} config.findIdea - lookup idea by id
 * @param {(idea: object) => string[]} config.getIdeaCategories - extract categories from idea
 * @param {() => string[]} config.getAvailableCategories - all available categories
 * @param {() => Promise<void>} config.onCategoriesChanged - called after categories are saved
 * @param {Intl.Collator} config.collator - for sorting category names
 */
export function createCategoryDropdownController(config) {
    let currentIdeaId = null;
    let anchor = null;
    let mode = 'multi';
    let target = null;

    function position(anchorEl) {
        const dropdown = config.getDropdown();
        if (!dropdown || !anchorEl) return;

        // Remove hidden so we can measure, but keep menu visually closed
        dropdown.hidden = false;
        dropdown.classList.remove('is-open');

        requestAnimationFrame(() => {
            const rect = anchorEl.getBoundingClientRect();
            const margin = 8;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // Temporarily show to measure
            dropdown.style.visibility = 'hidden';
            dropdown.style.opacity = '0';
            dropdown.classList.add('is-open');
            const panelRect = dropdown.getBoundingClientRect();
            dropdown.classList.remove('is-open');
            dropdown.style.visibility = '';
            dropdown.style.opacity = '';

            let top = rect.bottom + margin;
            let left = rect.left;

            if (top + panelRect.height > vh) {
                top = Math.max(margin, rect.top - panelRect.height - margin);
            }
            if (left + panelRect.width > vw - margin) {
                left = Math.max(margin, vw - panelRect.width - margin);
            }

            dropdown.style.top = `${Math.round(top)}px`;
            dropdown.style.left = `${Math.round(left)}px`;

            // Now open with animation
            requestAnimationFrame(() => {
                dropdown.classList.add('is-open');
            });
        });
    }

    function populate(ideaId, options = {}) {
        const content = config.getContent();
        if (!content) return;

        const populateMode = options.mode || 'multi';
        const targetCategory = options.targetCategory || null;

        const idea = config.findIdea(ideaId);
        const currentCategories = idea ? config.getIdeaCategories(idea) : [];
        const normalized = normalizeCategories(currentCategories);

        content.innerHTML = '';
        content.onchange = null;
        mode = populateMode;
        target = targetCategory;

        if (populateMode === 'replace') {
            populateReplaceMode(content, ideaId, normalized, targetCategory);
            return;
        }

        populateMultiMode(content, ideaId, normalized);
    }

    function populateReplaceMode(content, ideaId, normalized, targetCategory) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'md3-menu__item md3-menu__item--danger';
        removeBtn.textContent = 'Remove category';
        removeBtn.addEventListener('click', async () => {
            try {
                const targetLower = (targetCategory || '').trim().toLowerCase();
                const next = normalized.filter(c => (c || '').trim().toLowerCase() !== targetLower);
                await setIdeaCategories(ideaId, next);
                await config.onCategoriesChanged();
            } catch (e) {
                console.error('Failed to remove category', e);
            } finally {
                close({ skipSave: true });
            }
        });
        content.appendChild(removeBtn);

        // Divider between remove action and category list
        const divider = document.createElement('div');
        divider.className = 'md3-menu__divider';
        content.appendChild(divider);

        const items = config.getAvailableCategories().slice();
        items.sort((a, b) => config.collator.compare(a, b));

        items.forEach(category => {
            if (category === '__uncategorized__') return;
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'md3-menu__item';
            if ((targetCategory || '').trim().toLowerCase() === category.toLowerCase()) {
                row.classList.add('is-selected');
            }

            const span = document.createElement('span');
            span.textContent = category;
            row.appendChild(span);

            const applySelection = async () => {
                if ((targetCategory || '').trim().toLowerCase() === category.toLowerCase()) {
                    close({ skipSave: true });
                    return;
                }
                try {
                    const idx = normalized.findIndex(c => (c || '').trim().toLowerCase() === (targetCategory || '').trim().toLowerCase());
                    let next = normalized.slice();
                    if (idx >= 0) {
                        next[idx] = category;
                    } else {
                        next = [category, ...normalized.filter(c => c.toLowerCase() !== category.toLowerCase())];
                    }
                    const seen = new Set();
                    next = next.filter(c => {
                        const key = c.toLowerCase();
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                    await setIdeaCategories(ideaId, next);
                    await config.onCategoriesChanged();
                } catch (e) {
                    console.error('Failed to replace category', e);
                } finally {
                    close({ skipSave: true });
                }
            };
            row.addEventListener('click', applySelection);
            row.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    applySelection();
                }
            });
            content.appendChild(row);
        });
    }

    function populateMultiMode(content, ideaId, normalized) {
        const items = [...config.getAvailableCategories()];
        if (!items.includes('__uncategorized__')) items.unshift('__uncategorized__');

        items.forEach(category => {
            const isUncategorized = category === '__uncategorized__';
            const label = document.createElement('label');
            label.className = 'md3-menu__item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.category = category;
            checkbox.checked = isUncategorized ? normalized.length === 0 : normalized.includes(category);

            const span = document.createElement('span');
            span.textContent = isUncategorized ? 'Uncategorized' : category;

            label.appendChild(checkbox);
            label.appendChild(span);
            content.appendChild(label);
        });

        content.onchange = async (e) => {
            const inputTarget = e.target;
            if (!(inputTarget instanceof HTMLInputElement) || inputTarget.type !== 'checkbox') return;

            const allCbs = Array.from(content.querySelectorAll('input[type="checkbox"]'));
            if (inputTarget.dataset.category === '__uncategorized__') {
                if (inputTarget.checked) {
                    allCbs.forEach(cb => { if (cb !== inputTarget) cb.checked = false; });
                }
            } else {
                const uncCb = allCbs.find(cb => cb.dataset.category === '__uncategorized__');
                if (uncCb) uncCb.checked = false;
            }

            const selected = allCbs
                .filter(cb => cb.checked && cb.dataset.category && cb.dataset.category !== '__uncategorized__')
                .map(cb => cb.dataset.category);

            try {
                if (currentIdeaId) {
                    await setIdeaCategories(currentIdeaId, selected);
                    await config.onCategoriesChanged();
                    if (anchor) position(anchor);
                }
            } catch (err) {
                console.error('Category update failed', err);
            }
        };
    }

    function open(ideaId, anchorEl, options = {}) {
        currentIdeaId = ideaId;
        anchor = anchorEl || null;
        populate(ideaId, options);
        config.getDropdown().hidden = false;
        position(anchorEl);
    }

    async function close(options = {}) {
        const dropdown = config.getDropdown();
        const content = config.getContent();
        if (!dropdown || dropdown.hidden) return;

        const skipSave = Boolean(options.skipSave);
        if (!skipSave && currentIdeaId && content && mode === 'multi') {
            const checkboxes = content.querySelectorAll('input[type="checkbox"]');
            if (checkboxes.length > 0) {
                const selected = Array.from(checkboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.dataset.category)
                    .filter(c => c && c !== '__uncategorized__');
                try {
                    await setIdeaCategories(currentIdeaId, selected);
                    await config.onCategoriesChanged();
                } catch (e) {
                    console.error('Saving categories failed:', e);
                }
            }
        }

        dropdown.classList.remove('is-open');
        dropdown.hidden = true;
        content.innerHTML = '';
        currentIdeaId = null;
        anchor = null;
    }

    return {
        position,
        populate,
        open,
        close,
        getCurrentIdeaId() { return currentIdeaId; },
        getAnchor() { return anchor; },
        getMode() { return mode; },
        getTarget() { return target; },
    };
}
