# Search & Filter Skill

## Overview

Advanced filtering and search capabilities allowing users to discover ideas by category, priority, archived status, hidden status, and resurfacing algorithm that brings old ideas back to attention.

## Features

- ✅ **Filter by Category**: Show/hide categories
- ✅ **Filter by Priority**: Urgent, High, Medium, Low
- ✅ **Filter by Status**: Active, Archived, Hidden
- ✅ **Search Text**: Full-text search in idea content
- ✅ **Resurfacing**: Algorithm surfaces old ideas
- ✅ **Smart Sorting**: By date, priority, category
- ✅ **Real-time**: Filters update instantly
- ✅ **Persistent**: Save filter preferences

## Key Files

- `src/lib/storage.js` — Query and filter functions
- `src/js/review.js` — Review page with filters
- `src/js/index.js` — Dashboard filtering
- `src/lib/utils.js` — Filter helpers

## Filter Types

### 1. By Category

```javascript
// Get ideas in specific category
const ideas = await getIdeasByCategory(categoryName)

// Get all categories present in ideas
const categories = getAllCategories()

// Filter helper
function filterByCategory(ideas, categoryName) {
    if (!categoryName) return ideas
    return ideas.filter(idea =>
        idea.categories?.includes(categoryName)
    )
}
```

### 2. By Priority

```javascript
function filterByPriority(ideas, priority) {
    if (!priority) return ideas
    if (priority === 'none') {
        return ideas.filter(i => !i.priority)
    }
    return ideas.filter(i => i.priority === priority)
}

// Usage
const urgent = filterByPriority(ideas, 'urgent')
const noPriority = filterByPriority(ideas, 'none')
```

### 3. By Status

```javascript
function filterByStatus(ideas, status) {
    switch (status) {
        case 'archived':
            return ideas.filter(i => i.archived)
        case 'hidden':
            return ideas.filter(i => i.hidden)
        case 'active':
            return ideas.filter(i => !i.archived && !i.hidden)
        default:
            return ideas
    }
}

// Usage
const active = filterByStatus(ideas, 'active')
const archived = filterByStatus(ideas, 'archived')
```

### 4. Full-Text Search

```javascript
function searchIdeas(ideas, query) {
    if (!query) return ideas

    const lower = query.toLowerCase()

    return ideas.filter(idea =>
        idea.text.toLowerCase().includes(lower) ||
        idea.category.toLowerCase().includes(lower) ||
        idea.categories?.some(c =>
            c.toLowerCase().includes(lower)
        ) ||
        idea.tags?.some(t =>
            t.toLowerCase().includes(lower)
        )
    )
}

// Usage
const results = searchIdeas(ideas, 'design')
```

## Resurfacing Algorithm

Brings old ideas back to user attention:

```javascript
function selectResurfacedIdea(ideas) {
    // Filter to potential candidates
    const candidates = ideas.filter(idea => {
        // Don't resurface pinned, archived, or recent ideas
        if (idea.pinned || idea.archived || idea.hidden) return false

        const daysSince = Math.floor(
            (Date.now() - idea.createdAt) / (1000 * 60 * 60 * 24)
        )

        // At least 3 days old
        return daysSince >= 3
    })

    if (candidates.length === 0) return null

    // Score each idea
    const scored = candidates.map(idea => {
        const daysSince = Math.floor(
            (Date.now() - idea.createdAt) / (1000 * 60 * 60 * 24)
        )

        // Score favors older ideas, but with some randomness
        const ageScore = daysSince / 30 // Normalized to ~30 days
        const recencyBonus = Math.random() * 0.3 // 0-30% random boost
        const priorityBonus = {
            'urgent': 0.2,
            'high': 0.1,
            'medium': 0.05,
            'low': 0,
            undefined: 0
        }[idea.priority] || 0

        return {
            idea,
            score: ageScore + recencyBonus + priorityBonus
        }
    })

    // Return highest-scored idea
    return scored.sort((a, b) => b.score - a.score)[0]?.idea || null
}
```

Resurfaced idea shown in dedicated section on dashboard:

```html
<section class="dash-section">
    <h2 class="dash-section__title">Resurfaced</h2>
    <div class="dash-section__body" id="resurfaceFeed">
        <!-- Resurfaced idea rendered here -->
    </div>
</section>
```

## Review Page Filters

Review page shows all ideas with multiple filter controls:

```html
<div class="review-filters">
    <!-- Category filter -->
    <select id="categoryFilter" aria-label="Filter by category">
        <option value="">All categories</option>
    </select>

    <!-- Priority filter -->
    <select id="priorityFilter" aria-label="Filter by priority">
        <option value="">All priorities</option>
        <option value="urgent">Urgent</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="none">No priority</option>
    </select>

    <!-- Status filter -->
    <select id="statusFilter" aria-label="Filter by status">
        <option value="active">Active</option>
        <option value="archived">Archived</option>
        <option value="hidden">Hidden</option>
    </select>

    <!-- Search input -->
    <input type="search" id="searchInput"
        placeholder="Search ideas..."
        aria-label="Search ideas" />

    <!-- Sort control -->
    <select id="sortControl" aria-label="Sort by">
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="priority">Priority</option>
    </select>
</div>
```

### Implementation (review.js)

```javascript
let allIdeas = []
let filteredIdeas = []

async function loadIdeas() {
    allIdeas = await getAllIdeas()
    applyFilters()
}

function applyFilters() {
    let filtered = [...allIdeas]

    // Apply category filter
    const category = categoryFilter.value
    if (category) {
        filtered = filterByCategory(filtered, category)
    }

    // Apply priority filter
    const priority = priorityFilter.value
    if (priority) {
        filtered = filterByPriority(filtered, priority)
    }

    // Apply status filter
    const status = statusFilter.value
    filtered = filterByStatus(filtered, status)

    // Apply search
    const query = searchInput.value
    if (query) {
        filtered = searchIdeas(filtered, query)
    }

    // Apply sort
    const sort = sortControl.value
    filtered = sortIdeas(filtered, sort)

    filteredIdeas = filtered
    renderReviewList(filteredIdeas)
}

// Attach listeners
categoryFilter.addEventListener('change', applyFilters)
priorityFilter.addEventListener('change', applyFilters)
statusFilter.addEventListener('change', applyFilters)
searchInput.addEventListener('input', applyFilters)
sortControl.addEventListener('change', applyFilters)
```

## Sorting Functions

```javascript
function sortIdeas(ideas, sortBy) {
    const sorted = [...ideas]

    switch (sortBy) {
        case 'newest':
            sorted.sort((a, b) => b.createdAt - a.createdAt)
            break

        case 'oldest':
            sorted.sort((a, b) => a.createdAt - b.createdAt)
            break

        case 'priority':
            // Pinned first, then by priority level, then by date
            const priorityOrder = {
                'urgent': 1,
                'high': 2,
                'medium': 3,
                'low': 4,
                undefined: 5
            }

            sorted.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1
                if (!a.pinned && b.pinned) return 1

                const pDiff =
                    priorityOrder[a.priority] -
                    priorityOrder[b.priority]
                if (pDiff !== 0) return pDiff

                return b.createdAt - a.createdAt
            })
            break

        default:
            // Default: by date, newest first
            sorted.sort((a, b) => b.createdAt - a.createdAt)
    }

    return sorted
}
```

## Search Performance

### Optimization Tips

1. **Debounce search input:**
```javascript
let searchTimeout
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
        applyFilters()
    }, 300) // Wait 300ms after user stops typing
})
```

2. **Memoize results:**
```javascript
const filterCache = new Map()

function searchIdeasCached(ideas, query) {
    const key = `${ideas.length}-${query}`
    if (filterCache.has(key)) {
        return filterCache.get(key)
    }

    const results = searchIdeas(ideas, query)
    filterCache.set(key, results)
    return results
}
```

3. **Lazy render large lists:**
```javascript
function renderReviewListLazy(ideas) {
    // Only render visible items + buffer
    const itemHeight = 80
    const containerHeight = reviewList.clientHeight
    const visibleCount = Math.ceil(containerHeight / itemHeight) + 5

    const fragment = document.createDocumentFragment()
    ideas.slice(0, visibleCount).forEach(idea => {
        const item = createReviewListItem(idea)
        fragment.appendChild(item)
    })

    reviewList.innerHTML = ''
    reviewList.appendChild(fragment)

    // Load more on scroll
    reviewList.addEventListener('scroll', () => {
        if (reviewList.scrollTop + reviewList.clientHeight
            >= reviewList.scrollHeight - 200) {
            loadMoreIdeas()
        }
    })
}
```

## Filter Persistence

Save user's last-used filters:

```javascript
function saveFilterPreferences() {
    const prefs = {
        category: categoryFilter.value,
        priority: priorityFilter.value,
        status: statusFilter.value,
        sort: sortControl.value,
        searchQuery: searchInput.value
    }
    localStorage.setItem('review_filters', JSON.stringify(prefs))
}

function loadFilterPreferences() {
    const prefs = localStorage.getItem('review_filters')
    if (!prefs) return

    const { category, priority, status, sort, searchQuery } =
        JSON.parse(prefs)

    categoryFilter.value = category
    priorityFilter.value = priority
    statusFilter.value = status
    sortControl.value = sort
    searchInput.value = searchQuery

    applyFilters()
}

// Listen to filter changes
document.addEventListener('change', saveFilterPreferences)
searchInput.addEventListener('input', saveFilterPreferences)
```

## Keyboard Shortcuts

```javascript
// Ctrl+F to focus search
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        searchInput.focus()
    }
})

// Escape to clear search
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        searchInput.value = ''
        applyFilters()
    }
})
```

## Advanced Queries (Future)

```javascript
// Example: Find all urgent work items from last week
function advancedQuery(ideas, criteria) {
    return ideas.filter(idea => {
        const daysSince = Math.floor(
            (Date.now() - idea.createdAt) / (1000 * 60 * 60 * 24)
        )

        return (
            (!criteria.category ||
                idea.categories?.includes(criteria.category)) &&
            (!criteria.priority ||
                idea.priority === criteria.priority) &&
            (!criteria.status ||
                filterByStatus([idea], criteria.status).length > 0) &&
            (!criteria.daysSince ||
                daysSince <= criteria.daysSince)
        )
    })
}

// Usage
const urgentWork = advancedQuery(allIdeas, {
    category: 'Work',
    priority: 'urgent',
    daysSince: 7
})
```

## Known Limitations

- [ ] Faceted search (count by filter) not implemented
- [ ] Saved searches/filters not supported
- [ ] Filter presets not available
- [ ] Search doesn't index historical/archived ideas by default
- [ ] No fuzzy matching or typo tolerance

## Related Skills

- [Idea Capture](./capture.md)
- [Storage & Sync](./storage.md)
- [Categories & Organization](./categories.md)
- [Pin & Priority System](./priority.md)
