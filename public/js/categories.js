import {
  getIdeas,
  getCategoryPalette,
  renameCategory,
  setCategoryColor,
  setCategoryVisibility
} from '../storage.js?v=3';
import { getReadableTextColor, HEX_COLOR_PATTERN, escapeHtml } from '../utils.js?v=2';
import { getCurrentUserId, ensureAuthSession } from '../auth.js';

        const categoryList = document.getElementById('categoryList');
        const statusEl = document.getElementById('categoryStatus');
        const totalCategoriesEl = document.getElementById('totalCategories');
    const totalNotesEl = document.getElementById('totalNotes');
    const totalArchivedEl = document.getElementById('totalArchived');
        const uncategorizedEl = document.getElementById('uncategorizedCount');
        const categorySortSelect = document.getElementById('categorySortSelect');
        const notesSummaryCard = document.getElementById('notesSummaryCard');
    const notesOverlay = document.getElementById('notesBreakdownOverlay');
        const notesOverlayCloseBtn = document.getElementById('notesOverlayCloseBtn');
        const notesOverlayLegendWrap = document.getElementById('notesBreakdownLegendWrap');
        const notesOverlayLegend = document.getElementById('notesBreakdownLegend');
        const notesOverlayCanvas = document.getElementById('notesBreakdownChart');
        const notesOverlayEmptyState = document.getElementById('notesOverlayEmptyState');
        const notesOverlayPanel = notesOverlay ? notesOverlay.querySelector('.notes-overlay__panel') : null;

    // Archived overlay elements
    const archivedSummaryCard = document.getElementById('archivedSummaryCard');
    const archivedOverlay = document.getElementById('archivedBreakdownOverlay');
    const archivedOverlayCloseBtn = document.getElementById('archivedOverlayCloseBtn');
    const archivedOverlayLegendWrap = document.getElementById('archivedBreakdownLegendWrap');
    const archivedOverlayLegend = document.getElementById('archivedBreakdownLegend');
    const archivedOverlayCanvas = document.getElementById('archivedBreakdownChart');
    const archivedOverlayEmptyState = document.getElementById('archivedOverlayEmptyState');
    const archivedOverlayPanel = archivedOverlay ? archivedOverlay.querySelector('.notes-overlay__panel') : null;

        const FALLBACK_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeead', '#d4a5a5', '#9b89b3', '#77dd77'];
        const CATEGORY_SORT_STORAGE_KEY = 'category_sort_preference_v1';
        const DEFAULT_CATEGORY_SORT = 'count-desc';
        const ALLOWED_CATEGORY_SORTS = ['count-desc', 'count-asc', 'name-asc', 'name-desc'];
        const NAME_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: false });

        let paletteCache = {};
        let statusTimer = null;
    let notesBreakdown = { items: [], total: 0 };
    let archivedBreakdown = { items: [], total: 0 };
        let notesOverlayPreviousFocus = null;
    let archivedOverlayPreviousFocus = null;
        let activeSegmentIndex = -1;
        let activeSegmentLabel = null;
        let notesBreakdownSlices = [];
    let archivedBreakdownSlices = [];
        let notesChartMeta = null;
    let archivedChartMeta = null;
        let categoryItemsCache = [];
    let archivedCategoryItemsCache = [];

        function getFallbackIndex(name) {
            const safe = (name || '').trim();
            if (!safe) {
                return 0;
            }
            const sum = safe.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            return sum % FALLBACK_COLORS.length;
        }

        function getCategoryDisplay(name) {
            const index = getFallbackIndex(name);
            const fallbackColor = FALLBACK_COLORS[index].toLowerCase();
            const paletteEntry = paletteCache[name];
            const paletteColour = (paletteEntry?.color || '').trim();
            const customColor = paletteColour && HEX_COLOR_PATTERN.test(paletteColour)
                ? paletteColour.toLowerCase()
                : '';
            const activeColor = customColor || fallbackColor;
            const visible = paletteEntry?.visible !== false; // Default to true if not set
            return {
                className: `category-${index + 1}`,
                fallbackColor,
                customColor,
                activeColor,
                textColor: getReadableTextColor(activeColor),
                hasCustom: Boolean(customColor),
                visible
            };
        }



        function resetStatusAfter(delay = 2600) {
            if (!statusEl) return;
            if (statusTimer) {
                clearTimeout(statusTimer);
            }
            statusTimer = window.setTimeout(() => {
                statusEl.hidden = true;
                statusEl.textContent = '';
            }, delay);
        }

        function showStatus(message, tone = 'info') {
            if (!statusEl) return;
            statusEl.textContent = message;
            statusEl.dataset.tone = tone;
            statusEl.hidden = false;
            resetStatusAfter(tone === 'error' ? 5200 : 2800);
        }

        function updateSummary(totalCategories, totalNotes, uncategorizedCount) {
            if (totalCategoriesEl) {
                totalCategoriesEl.textContent = totalCategories.toString();
            }
            if (totalNotesEl) {
                totalNotesEl.textContent = totalNotes.toString();
            }
            if (uncategorizedEl) {
                uncategorizedEl.textContent = uncategorizedCount.toString();
            }
        }

        function isValidSortKey(value) {
            return ALLOWED_CATEGORY_SORTS.includes(value);
        }

        function getStoredSortPreference() {
            try {
                const stored = localStorage.getItem(CATEGORY_SORT_STORAGE_KEY);
                return isValidSortKey(stored) ? stored : DEFAULT_CATEGORY_SORT;
            } catch (error) {
                console.warn('Unable to read category sort preference; using default.', error);
                return DEFAULT_CATEGORY_SORT;
            }
        }

        function setSortPreference(value) {
            if (!isValidSortKey(value)) {
                return;
            }
            try {
                localStorage.setItem(CATEGORY_SORT_STORAGE_KEY, value);
            } catch (error) {
                console.warn('Unable to store category sort preference.', error);
            }
        }

        function getCurrentSortKey() {
            const selected = categorySortSelect?.value;
            if (isValidSortKey(selected)) {
                return selected;
            }
            return DEFAULT_CATEGORY_SORT;
        }

        function sortCategoryItems(items, sortKey = getCurrentSortKey()) {
            const list = Array.isArray(items) ? [...items] : [];
            const compareByName = (a, b) => NAME_COLLATOR.compare((a.name || '').trim(), (b.name || '').trim());
            switch (sortKey) {
                case 'count-asc':
                    list.sort((a, b) => (a.count - b.count) || compareByName(a, b));
                    break;
                case 'name-asc':
                    list.sort(compareByName);
                    break;
                case 'name-desc':
                    list.sort((a, b) => compareByName(b, a));
                    break;
                case 'count-desc':
                default:
                    list.sort((a, b) => (b.count - a.count) || compareByName(a, b));
                    break;
            }
            return list;
        }

        function formatPercentage(count, total) {
            if (!total) {
                return '0%';
            }
            const value = (count / total) * 100;
            const decimals = value >= 10 ? 0 : 1;
            return `${value.toFixed(decimals)}%`;
        }

        function isOverlayVisible() {
            return Boolean(notesOverlay && !notesOverlay.hidden);
        }
        function isArchivedOverlayVisible() {
            return Boolean(archivedOverlay && !archivedOverlay.hidden);
        }

        function prepareOverlayCanvas(canvas) {
            if (!canvas) return null;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            const ratio = window.devicePixelRatio || 1;
            const displayWidth = canvas.clientWidth || canvas.width || 320;
            const displayHeight = canvas.clientHeight || canvas.height || 320;
            canvas.width = displayWidth * ratio;
            canvas.height = displayHeight * ratio;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(ratio, ratio);
            ctx.clearRect(0, 0, displayWidth, displayHeight);
            return { ctx, width: displayWidth, height: displayHeight };
        }

        function drawNotesChart() {
            if (!notesOverlayCanvas) return;
            const { items, total } = notesBreakdown;
            const setup = prepareOverlayCanvas(notesOverlayCanvas);
            if (!setup || !total) {
                notesBreakdownSlices = [];
                notesChartMeta = null;
                return;
            }
            const { ctx, width, height } = setup;
            const radius = Math.min(width, height) / 2 - 12;
            const centerX = width / 2;
            const centerY = height / 2;
            let startAngle = -Math.PI / 2;

            notesBreakdownSlices = [];
            notesChartMeta = { centerX, centerY, radius };
            ctx.lineJoin = 'round';

            items.forEach((item, index) => {
                const sliceAngle = (item.count / total) * Math.PI * 2;
                if (!sliceAngle) {
                    return;
                }
                const endAngle = startAngle + sliceAngle;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, endAngle);
                ctx.closePath();
                ctx.fillStyle = item.color;
                ctx.fill();

                notesBreakdownSlices.push({ startAngle, endAngle, index });
                startAngle = endAngle;
            });

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(21, 21, 33, 0.7)';
            ctx.stroke();

            if (activeSegmentIndex >= 0 && notesBreakdownSlices[activeSegmentIndex]) {
                const slice = notesBreakdownSlices[activeSegmentIndex];
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, slice.startAngle, slice.endAngle);
                ctx.closePath();
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#ffca28';
                ctx.stroke();
            }
        }

        function drawArchivedChart() {
            if (!archivedOverlayCanvas) return;
            const { items, total } = archivedBreakdown;
            const setup = prepareOverlayCanvas(archivedOverlayCanvas);
            if (!setup || !total) {
                archivedBreakdownSlices = [];
                archivedChartMeta = null;
                return;
            }
            const { ctx, width, height } = setup;
            const radius = Math.min(width, height) / 2 - 12;
            const centerX = width / 2;
            const centerY = height / 2;
            let startAngle = -Math.PI / 2;

            archivedBreakdownSlices = [];
            archivedChartMeta = { centerX, centerY, radius };
            ctx.lineJoin = 'round';

            items.forEach((item, index) => {
                const sliceAngle = (item.count / total) * Math.PI * 2;
                if (!sliceAngle) return;
                const endAngle = startAngle + sliceAngle;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, endAngle);
                ctx.closePath();
                ctx.fillStyle = item.color;
                ctx.fill();
                archivedBreakdownSlices.push({ startAngle, endAngle, index });
                startAngle = endAngle;
            });

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(21, 21, 33, 0.7)';
            ctx.stroke();
        }

        function updateNotesBreakdown(categoryItems, totalNotes, uncategorizedCount) {
            if (!notesOverlayLegend || !notesOverlayEmptyState || !notesOverlayLegendWrap) {
                return;
            }

            const items = categoryItems
                .filter(item => item.count > 0)
                .map(item => {
                    const display = getCategoryDisplay(item.name);
                    return {
                        label: item.name,
                        count: item.count,
                        color: display.activeColor
                    };
                });

            if (uncategorizedCount > 0) {
                items.push({
                    label: 'Uncategorized',
                    count: uncategorizedCount,
                    color: '#3a3a50'
                });
            }

            items.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

            notesBreakdown = { items, total: totalNotes };

            notesOverlayLegend.innerHTML = '';
            if (notesOverlayLegendWrap) {
                notesOverlayLegendWrap.hidden = !totalNotes;
            }

            if (!totalNotes) {
                notesOverlayLegend.hidden = true;
                notesOverlayEmptyState.hidden = false;
                activeSegmentIndex = -1;
                activeSegmentLabel = null;
                notesBreakdownSlices = [];
                notesChartMeta = null;
                if (notesOverlayLegendWrap) {
                    notesOverlayLegendWrap.scrollTop = 0;
                }
                if (isOverlayVisible()) {
                    drawNotesChart();
                }
                return;
            }

            const previousActiveLabel = activeSegmentLabel;
            activeSegmentIndex = -1;
            activeSegmentLabel = null;

            const fragment = document.createDocumentFragment();
            items.forEach((item, index) => {
                const listItem = document.createElement('li');
                listItem.className = 'notes-overlay__legend-item';
                listItem.dataset.index = index.toString();
                listItem.tabIndex = 0;
                listItem.setAttribute('role', 'button');
                listItem.setAttribute('aria-pressed', 'false');

                const swatch = document.createElement('span');
                swatch.className = 'notes-overlay__legend-swatch';
                swatch.style.background = item.color;

                const label = document.createElement('span');
                label.className = 'notes-overlay__legend-label';
                label.textContent = item.label;

                const value = document.createElement('span');
                value.className = 'notes-overlay__legend-value';
                value.textContent = `${item.count} • ${formatPercentage(item.count, totalNotes)}`;

                listItem.append(swatch, label, value);
                listItem.addEventListener('click', () => {
                    setActiveSegment(index, { focusLegend: false });
                });
                listItem.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setActiveSegment(index, { focusLegend: false });
                    }
                });
                fragment.appendChild(listItem);
            });

            notesOverlayLegend.appendChild(fragment);
            notesOverlayLegend.hidden = false;
            notesOverlayEmptyState.hidden = true;

            if (previousActiveLabel) {
                const matchedIndex = items.findIndex(item => item.label === previousActiveLabel);
                if (matchedIndex !== -1) {
                    activeSegmentIndex = matchedIndex;
                    activeSegmentLabel = previousActiveLabel;
                }
            }

            updateLegendActiveState({ focusLegend: false });

            if (isOverlayVisible()) {
                drawNotesChart();
            }
        }

        function updateArchivedBreakdown(categoryItems, totalNotes, uncategorizedCount) {
            if (!archivedOverlayLegend || !archivedOverlayEmptyState || !archivedOverlayLegendWrap) return;

            const items = categoryItems
                .filter(item => item.count > 0)
                .map(item => {
                    const display = getCategoryDisplay(item.name);
                    return { label: item.name, count: item.count, color: display.activeColor };
                });

            if (uncategorizedCount > 0) {
                items.push({ label: 'Uncategorized', count: uncategorizedCount, color: '#3a3a50' });
            }

            items.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

            archivedBreakdown = { items, total: totalNotes };

            archivedOverlayLegend.innerHTML = '';
            archivedOverlayLegendWrap.hidden = !totalNotes;

            if (!totalNotes) {
                archivedOverlayLegend.hidden = true;
                archivedOverlayEmptyState.hidden = false;
                archivedBreakdownSlices = [];
                archivedChartMeta = null;
                archivedOverlayLegendWrap.scrollTop = 0;
                if (isArchivedOverlayVisible()) drawArchivedChart();
                return;
            }

            const fragment = document.createDocumentFragment();
            items.forEach((item, index) => {
                const li = document.createElement('li');
                li.className = 'notes-overlay__legend-item';
                li.dataset.index = index.toString();
                li.tabIndex = 0;
                li.setAttribute('role', 'button');

                const swatch = document.createElement('span');
                swatch.className = 'notes-overlay__legend-swatch';
                swatch.style.background = item.color;

                const label = document.createElement('span');
                label.className = 'notes-overlay__legend-label';
                label.textContent = item.label;

                const value = document.createElement('span');
                value.className = 'notes-overlay__legend-value';
                value.textContent = `${item.count} • ${formatPercentage(item.count, totalNotes)}`;

                li.append(swatch, label, value);
                fragment.appendChild(li);
            });

            archivedOverlayLegend.appendChild(fragment);
            archivedOverlayLegend.hidden = false;
            archivedOverlayEmptyState.hidden = true;

            if (isArchivedOverlayVisible()) drawArchivedChart();
        }

        function updateLegendActiveState({ focusLegend = false } = {}) {
            if (!notesOverlayLegend) return;
            const legendItems = notesOverlayLegend.querySelectorAll('.notes-overlay__legend-item');
            legendItems.forEach(item => {
                const index = Number(item.dataset.index ?? '-1');
                const isActive = index === activeSegmentIndex;
                item.classList.toggle('is-active', isActive);
                item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                if (isActive && focusLegend) {
                    item.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
            });
        }

        function setActiveSegment(index, { focusLegend = false, toggle = true } = {}) {
            if (!notesBreakdown.items.length) {
                activeSegmentIndex = -1;
                activeSegmentLabel = null;
                updateLegendActiveState({ focusLegend: false });
                return;
            }

            const isSame = index === activeSegmentIndex;
            let nextIndex = index;
            if (toggle && isSame) {
                nextIndex = -1;
            }

            activeSegmentIndex = nextIndex;
            activeSegmentLabel = nextIndex >= 0 && notesBreakdown.items[nextIndex]
                ? notesBreakdown.items[nextIndex].label
                : null;

            updateLegendActiveState({ focusLegend });

            if (isOverlayVisible()) {
                drawNotesChart();
            }
        }

        function handleCanvasPointer(event) {
            if (!notesOverlayCanvas || !notesChartMeta || !notesBreakdownSlices.length) {
                return;
            }
            const rect = notesOverlayCanvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const dx = x - notesChartMeta.centerX;
            const dy = y - notesChartMeta.centerY;
            const distance = Math.hypot(dx, dy);

            if (distance > notesChartMeta.radius || distance < 8) {
                if (activeSegmentIndex !== -1) {
                    setActiveSegment(-1, { toggle: false });
                }
                return;
            }

            let angle = Math.atan2(dy, dx);
            if (angle < -Math.PI / 2) {
                angle += Math.PI * 2;
            }

            const sliceIndex = notesBreakdownSlices.findIndex((slice, idx, arr) => {
                if (!slice) return false;
                const isLast = idx === arr.length - 1;
                if (angle < slice.startAngle) {
                    return false;
                }
                if (isLast) {
                    return angle <= slice.endAngle + 1e-6;
                }
                return angle < slice.endAngle;
            });

            if (sliceIndex !== -1) {
                setActiveSegment(sliceIndex, { focusLegend: true });
            } else if (activeSegmentIndex !== -1) {
                setActiveSegment(-1, { toggle: false });
            }
        }

        function openNotesOverlay() {
            if (!notesOverlay) {
                return;
            }
            notesOverlayPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if (notesOverlay.hidden) {
                notesOverlay.hidden = false;
            }
            window.requestAnimationFrame(() => {
                notesOverlay.classList.add('notes-overlay--visible');
                if (notesOverlayCloseBtn) {
                    notesOverlayCloseBtn.focus({ preventScroll: true });
                } else if (notesOverlayPanel instanceof HTMLElement) {
                    notesOverlayPanel.focus({ preventScroll: true });
                }
                drawNotesChart();
            });
        }

        function closeNotesOverlay() {
            if (!notesOverlay || notesOverlay.hidden) {
                return;
            }

            const finishClose = () => {
                notesOverlay.hidden = true;
            };

            notesOverlay.classList.remove('notes-overlay--visible');

            const handleTransitionEnd = (event) => {
                if (event.target === notesOverlay) {
                    notesOverlay.removeEventListener('transitionend', handleTransitionEnd);
                    finishClose();
                }
            };

            notesOverlay.addEventListener('transitionend', handleTransitionEnd);

            window.setTimeout(() => {
                notesOverlay.removeEventListener('transitionend', handleTransitionEnd);
                if (!notesOverlay.classList.contains('notes-overlay--visible') && !notesOverlay.hidden) {
                    finishClose();
                }
            }, 240);

            if (notesOverlayPreviousFocus && typeof notesOverlayPreviousFocus.focus === 'function') {
                notesOverlayPreviousFocus.focus({ preventScroll: true });
            }
            notesOverlayPreviousFocus = null;
            setActiveSegment(-1, { toggle: false });
        }

        function openArchivedOverlay() {
            if (!archivedOverlay) return;
            archivedOverlayPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if (archivedOverlay.hidden) archivedOverlay.hidden = false;
            window.requestAnimationFrame(() => {
                archivedOverlay.classList.add('notes-overlay--visible');
                if (archivedOverlayCloseBtn) {
                    archivedOverlayCloseBtn.focus({ preventScroll: true });
                } else if (archivedOverlayPanel instanceof HTMLElement) {
                    archivedOverlayPanel.focus({ preventScroll: true });
                }
                drawArchivedChart();
            });
        }

        function closeArchivedOverlay() {
            if (!archivedOverlay || archivedOverlay.hidden) return;
            const finishClose = () => { archivedOverlay.hidden = true; };
            archivedOverlay.classList.remove('notes-overlay--visible');
            const handleEnd = (event) => {
                if (event.target === archivedOverlay) {
                    archivedOverlay.removeEventListener('transitionend', handleEnd);
                    finishClose();
                }
            };
            archivedOverlay.addEventListener('transitionend', handleEnd);
            window.setTimeout(() => {
                archivedOverlay.removeEventListener('transitionend', handleEnd);
                if (!archivedOverlay.classList.contains('notes-overlay--visible') && !archivedOverlay.hidden) {
                    finishClose();
                }
            }, 240);
            if (archivedOverlayPreviousFocus && typeof archivedOverlayPreviousFocus.focus === 'function') {
                archivedOverlayPreviousFocus.focus({ preventScroll: true });
            }
            archivedOverlayPreviousFocus = null;
        }


        function createCategoryItem({ name, count }) {
            let currentName = name;
            const li = document.createElement('li');
            li.className = 'category-item';

            // Main container matching Figma design
            const container = document.createElement('div');
            container.className = 'category-item-container';

            // Left side: count badge + editable name
            const leftSide = document.createElement('div');
            leftSide.className = 'category-left-side';

            const countBadge = document.createElement('div');
            countBadge.className = 'category-count-badge';
            countBadge.textContent = count.toString();
            countBadge.setAttribute('aria-hidden', 'true');

            const categoryNameInput = document.createElement('input');
            categoryNameInput.type = 'text';
            categoryNameInput.className = 'category-name-input';
            categoryNameInput.value = currentName;
            categoryNameInput.dataset.originalName = currentName;

            leftSide.append(countBadge, categoryNameInput);

            // Right side: color picker + visibility toggle + save button
            const rightSide = document.createElement('div');
            rightSide.className = 'category-right-side';

            const display = getCategoryDisplay(currentName);
            
            const categoryColorPicker = document.createElement('input');
            categoryColorPicker.type = 'color';
            categoryColorPicker.value = (display.customColor || display.fallbackColor).toLowerCase();
            categoryColorPicker.className = 'category-color-picker';

            // Visibility toggle button
            const visibilityBtn = document.createElement('button');
            visibilityBtn.type = 'button';
            visibilityBtn.className = 'category-visibility-btn';
            visibilityBtn.setAttribute('aria-label', display.visible ? 'Hide from active feed' : 'Show in active feed');
            visibilityBtn.title = display.visible ? 'Hide from active feed' : 'Show in active feed';
            visibilityBtn.innerHTML = display.visible 
                ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
                : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

            const categorySaveButton = document.createElement('button');
            categorySaveButton.type = 'button';
            categorySaveButton.className = 'category-save-btn';
            categorySaveButton.textContent = 'Save';
            categorySaveButton.disabled = true; // Initially disabled

            rightSide.append(categoryColorPicker, visibilityBtn, categorySaveButton);
            container.append(leftSide, rightSide);
            li.appendChild(container);

            // Set initial styling
            countBadge.style.background = display.activeColor;
            countBadge.style.color = display.textColor;

            // Enable/disable save button based on changes
            function checkForChanges() {
                const nameChanged = categoryNameInput.value.trim() !== currentName;
                const colorChanged = categoryColorPicker.value.toLowerCase() !== (display.customColor || display.fallbackColor).toLowerCase();
                categorySaveButton.disabled = !(nameChanged || colorChanged);
            }

            // Name input event handlers
            categoryNameInput.addEventListener('input', checkForChanges);
            categoryNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!categorySaveButton.disabled) {
                        categorySaveButton.click();
                    }
                }
            });

            // Color picker event handlers
            categoryColorPicker.addEventListener('input', () => {
                checkForChanges();
                // Update count badge preview
                const previewColor = categoryColorPicker.value.toLowerCase();
                countBadge.style.background = previewColor;
                countBadge.style.color = getReadableTextColor(previewColor);
            });

            // Save button handler
            categorySaveButton.addEventListener('click', async () => {
                const newName = categoryNameInput.value.trim();
                const newColor = categoryColorPicker.value.toLowerCase();
                
                if (!newName) {
                    showStatus('Please enter a category name.', 'error');
                    categoryNameInput.focus();
                    return;
                }

                categorySaveButton.disabled = true;
                categorySaveButton.textContent = 'Saving...';
                
                try {
                    // Handle name change
                    if (newName !== currentName) {
                        await renameCategory(currentName, newName);
                        currentName = newName;
                        categoryNameInput.dataset.originalName = newName;
                    }

                    // Handle color change
                    const originalColor = (display.customColor || display.fallbackColor).toLowerCase();
                    if (newColor !== originalColor) {
                        await setCategoryColor(currentName, newColor);
                    }

                    await loadData({ force: true });
                    showStatus(`Updated "${currentName}".`, 'success');
                    categorySaveButton.textContent = 'Save';
                    checkForChanges(); // This will disable the button
                } catch (error) {
                    console.error('Unable to save category changes', error);
                    showStatus('Unable to save changes.', 'error');
                    categorySaveButton.disabled = false;
                    categorySaveButton.textContent = 'Save';
                }
            });

            // Visibility toggle handler
            visibilityBtn.addEventListener('click', async () => {
                const currentDisplay = getCategoryDisplay(currentName);
                const newVisibility = !currentDisplay.visible;
                
                try {
                    await setCategoryVisibility(currentName, newVisibility);
                    
                    // Update button state
                    visibilityBtn.setAttribute('aria-label', newVisibility ? 'Hide from active feed' : 'Show in active feed');
                    visibilityBtn.title = newVisibility ? 'Hide from active feed' : 'Show in active feed';
                    visibilityBtn.innerHTML = newVisibility
                        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
                        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
                    
                    await loadData({ force: true });
                    showStatus(`"${currentName}" is now ${newVisibility ? 'visible' : 'hidden'} in the active feed.`, 'success');
                } catch (error) {
                    console.error('Unable to toggle category visibility', error);
                    showStatus('Unable to toggle visibility.', 'error');
                }
            });

            return li;
        }

        function renderCategoryList(items) {
            categoryList.innerHTML = '';
            if (!items.length) {
                const empty = document.createElement('li');
                empty.className = 'category-empty';
                empty.textContent = 'No categories yet. Create one from the capture screen to get started.';
                categoryList.appendChild(empty);
                return;
            }
            const fragment = document.createDocumentFragment();
            items.forEach(item => {
                fragment.appendChild(createCategoryItem(item));
            });
            categoryList.appendChild(fragment);
        }

        async function loadData(options = {}) {
            try {
                // Get all ideas and build category stats
                const rawIdeas = await getIdeas({ force: options.force });
                const ideas = Array.isArray(rawIdeas) ? rawIdeas : [];
                // Split active vs archived
                const activeIdeas = ideas.filter(i => !i.archived);
                const archivedIdeas = ideas.filter(i => i.archived);

                const activeCategoryStats = {};
                const archivedCategoryStats = {};
                let uncategorizedActive = 0;
                let uncategorizedArchived = 0;

                activeIdeas.forEach(idea => {
                    const category = (idea.category || '').trim();
                    if (category) {
                        activeCategoryStats[category] = (activeCategoryStats[category] || 0) + 1;
                    } else {
                        uncategorizedActive++;
                    }
                });

                archivedIdeas.forEach(idea => {
                    const category = (idea.category || '').trim();
                    if (category) {
                        archivedCategoryStats[category] = (archivedCategoryStats[category] || 0) + 1;
                    } else {
                        uncategorizedArchived++;
                    }
                });

                // Get category palette (colors)
                paletteCache = await getCategoryPalette({ force: options.force });

                // Create category list items
                const categoryItems = Object.entries(activeCategoryStats).map(([name, count]) => ({ name, count }));
                const archivedCategoryItems = Object.entries(archivedCategoryStats).map(([name, count]) => ({ name, count }));
                categoryItemsCache = categoryItems;
                archivedCategoryItemsCache = archivedCategoryItems;

                const sortedItems = sortCategoryItems(categoryItemsCache);

                // Update UI
                renderCategoryList(sortedItems);
                updateSummary(sortedItems.length, activeIdeas.length, uncategorizedActive);
                if (totalArchivedEl) totalArchivedEl.textContent = archivedIdeas.length.toString();
                updateNotesBreakdown(categoryItemsCache, activeIdeas.length, uncategorizedActive);
                updateArchivedBreakdown(archivedCategoryItemsCache, archivedIdeas.length, uncategorizedArchived);

            } catch (error) {
                console.error('Error loading category data:', error);
                showStatus('Failed to load category data.', 'error');
            }
        }

        if (categorySortSelect) {
            const storedSort = getStoredSortPreference();
            if (isValidSortKey(storedSort)) {
                categorySortSelect.value = storedSort;
            }
            categorySortSelect.addEventListener('change', () => {
                const sortKey = getCurrentSortKey();
                setSortPreference(sortKey);
                renderCategoryList(sortCategoryItems(categoryItemsCache, sortKey));
            });
        }

        if (notesSummaryCard) {
            const openOverlayFromCard = () => {
                openNotesOverlay();
            };
            notesSummaryCard.addEventListener('click', openOverlayFromCard);
            notesSummaryCard.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openOverlayFromCard();
                }
            });
        }

        if (notesOverlayCloseBtn) {
            notesOverlayCloseBtn.addEventListener('click', () => {
                closeNotesOverlay();
            });
        }

        if (notesOverlay) {
            notesOverlay.addEventListener('click', (event) => {
                if (event.target === notesOverlay) {
                    closeNotesOverlay();
                }
            });
        }

        if (notesOverlayCanvas) {
            notesOverlayCanvas.addEventListener('pointerup', handleCanvasPointer);
        }

        // Archived overlay wiring
        if (archivedSummaryCard) {
            const openArchivedFromCard = () => { openArchivedOverlay(); };
            archivedSummaryCard.addEventListener('click', openArchivedFromCard);
            archivedSummaryCard.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openArchivedFromCard();
                }
            });
        }

        if (archivedOverlayCloseBtn) {
            archivedOverlayCloseBtn.addEventListener('click', () => {
                closeArchivedOverlay();
            });
        }

        if (archivedOverlay) {
            archivedOverlay.addEventListener('click', (event) => {
                if (event.target === archivedOverlay) {
                    closeArchivedOverlay();
                }
            });
        }

        if (archivedOverlayCanvas) {
            archivedOverlayCanvas.addEventListener('pointerup', (event) => {
                if (!archivedOverlayCanvas || !archivedChartMeta || !archivedBreakdownSlices.length) return;
                const rect = archivedOverlayCanvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                const dx = x - archivedChartMeta.centerX;
                const dy = y - archivedChartMeta.centerY;
                const distance = Math.hypot(dx, dy);
                if (distance > archivedChartMeta.radius || distance < 8) return;
                let angle = Math.atan2(dy, dx);
                if (angle < -Math.PI / 2) angle += Math.PI * 2;
                const sliceIndex = archivedBreakdownSlices.findIndex((slice, idx, arr) => {
                    if (!slice) return false;
                    const isLast = idx === arr.length - 1;
                    if (angle < slice.startAngle) return false;
                    return isLast ? angle <= slice.endAngle + 1e-6 : angle < slice.endAngle;
                });
                if (sliceIndex !== -1) {
                    // no active highlighting for archived; just noop
                }
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (isOverlayVisible()) {
                    event.preventDefault();
                    closeNotesOverlay();
                } else if (isArchivedOverlayVisible()) {
                    event.preventDefault();
                    closeArchivedOverlay();
                }
            }
        });

        window.addEventListener('resize', () => {
            if (isOverlayVisible()) drawNotesChart();
            if (isArchivedOverlayVisible()) drawArchivedChart();
        });

        // Initialize the page
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
            await loadData();
        });

        // Listen for updates from other pages
        window.addEventListener('storage', () => {
            loadData({ force: true });
        });
