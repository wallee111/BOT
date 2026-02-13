# Categories & Organization Skill

## Overview

Dynamic category management system with color customization, visibility controls, and automatic derivation from ideas. Categories organize ideas on the canvas into draggable cards.

## Features

- ✅ **Auto-derived**: Categories created from captured ideas
- ✅ **Color Customization**: Set unique colors for each category
- ✅ **Visibility Toggle**: Show/hide categories
- ✅ **Persistent Settings**: Saved to Firestore
- ✅ **Canvas Integration**: Category cards on canvas
- ✅ **Real-time Updates**: Changes sync across devices
- ✅ **Search & Filter**: Find categories by name

## Key Files

- `src/lib/storage.js` — Category CRUD operations
- `src/js/categories.js` — Categories page controller
- `src/js/index.js` — Category menu in capture form
- `src/lib/utils.js` — Category appearance helpers
- `categories.html` — Categories management page

## Data Model

### Category Settings (Firestore)

```javascript
categorySettings/{settingId}
├── userId: string
├── name: string (category name, max 100 chars)
├── color: string (hex color, e.g. "#ffca28")
└── visible: boolean (shown in UI)
```

### Derived from Ideas

Categories are automatically created when first idea captures them:

```javascript
idea: {
    category: "Work",      // Primary category
    categories: ["Work", "Urgent"], // Can be in multiple
    // ...
}
```

## API Reference

### Category CRUD

```javascript
// Get all categories with settings
const categories = await getAllCategories()
// Returns: { "Work": { color: "#ffca28", visible: true }, ... }

// Get specific category settings
const settings = await getCategorySettings("Work")
// Returns: { name: "Work", color: "#ffca28", visible: true }

// Save/update category settings
await saveCategorySettings({
    userId: getCurrentUserId(),
    name: "Work",
    color: "#4CAF50",
    visible: true
})

// Toggle visibility
await setCategoryVisible("Work", false)

// Change color
await setCategoryColor("Work", "#FF6B6B")

// Delete category
await deleteCategorySettings("Work")

// Real-time subscription
const unsubscribe = subscribeToCategories((categories) => {
    console.log('Categories updated:', categories)
})
```

## Categories Page (categories.html)

Main management interface:

```html
<main class="app-container">
    <aside class="desktop-sidebar">
        <!-- Navigation -->
    </aside>

    <div class="category-list" id="categoryList">
        <!-- Category items rendered here -->
    </div>

    <nav class="bottom-nav">
        <!-- Mobile navigation -->
    </nav>
</main>
```

### Category Item Structure

```html
<div class="category-item" data-category="${category}">
    <div class="category-color-preview"
        style="background-color: ${color}">
    </div>

    <div class="category-info">
        <h3 class="category-name">${category}</h3>
        <span class="category-count">${ideas.length} ideas</span>
    </div>

    <div class="category-actions">
        <!-- Visibility toggle -->
        <input type="checkbox" class="category-visibility"
            aria-label="Show ${category}"
            ${visible ? 'checked' : ''} />

        <!-- Color picker -->
        <input type="color" class="category-color"
            value="${color}"
            aria-label="Color for ${category}" />

        <!-- Delete button -->
        <button class="category-delete"
            aria-label="Delete ${category}">
            ×
        </button>
    </div>
</div>
```

## Implementation (categories.js)

### Load Categories

```javascript
async function loadCategories() {
    const categories = await getAllCategories()
    const categoryList = document.getElementById('categoryList')

    Object.entries(categories).forEach(([name, settings]) => {
        const item = createCategoryItem(name, settings)
        categoryList.appendChild(item)
    })
}
```

### Handle Color Change

```javascript
colorInput.addEventListener('change', async (e) => {
    const color = e.target.value
    const category = e.target.closest('.category-item').dataset.category

    try {
        await setCategoryColor(category, color)
        showToast(`Color updated for ${category}`)
    } catch (error) {
        showToast('Failed to update color', { tone: 'error' })
    }
})
```

### Handle Visibility Toggle

```javascript
visibilityInput.addEventListener('change', async (e) => {
    const visible = e.target.checked
    const category = e.target.closest('.category-item').dataset.category

    try {
        await setCategoryVisible(category, visible)
        showToast(`${category} ${visible ? 'shown' : 'hidden'}`)
    } catch (error) {
        showToast('Failed to update visibility', { tone: 'error' })
    }
})
```

### Handle Delete

```javascript
deleteBtn.addEventListener('click', async (e) => {
    const category = e.target.closest('.category-item').dataset.category

    if (!confirm(`Delete category "${category}"? Ideas remain, only the category is deleted.`)) {
        return
    }

    try {
        await deleteCategorySettings(category)
        showToast(`${category} deleted`)
    } catch (error) {
        showToast('Failed to delete category', { tone: 'error' })
    }
})
```

## Capture Form Integration (index.js)

Categories appear in the capture form:

```javascript
// Populate category menu
function populateInputCategoryMenu() {
    const categories = await getAllCategories()
    const menu = document.getElementById('inputCategoryMenu')

    Object.keys(categories).forEach(name => {
        const option = document.createElement('div')
        option.className = 'md3-menu__item'
        option.textContent = name
        option.dataset.value = name
        menu.appendChild(option)
    })
}

// Handle selection
menu.addEventListener('click', (e) => {
    if (e.target.classList.contains('md3-menu__item')) {
        selectedCategory = e.target.dataset.value
        categoryLabel.textContent = selectedCategory
        menu.classList.remove('is-open')
    }
})
```

## Canvas Integration (canvas-cards.js)

Categories display as draggable cards:

```javascript
function renderCategoryCards() {
    const categories = await getAllCategories()

    Object.entries(categories).forEach(([name, settings]) => {
        const card = document.createElement('div')
        card.className = 'canvas-card'
        card.dataset.category = name
        card.style.backgroundColor = settings.color

        // Header
        const header = document.createElement('div')
        header.className = 'canvas-card__header'
        header.textContent = name

        // Ideas list
        const ideas = await getIdeasByCategory(name)
        const list = renderIdeasList(ideas)

        card.appendChild(header)
        card.appendChild(list)
        surface.appendChild(card)
    })
}
```

## Color Picker (utils.js)

Helper function for category appearance:

```javascript
export function getCategoryAppearance(categoryName) {
    const settings = categorySettings[categoryName]
    return {
        color: settings?.color || '#808080',
        visible: settings?.visible !== false,
        label: capitalizeWords(categoryName)
    }
}

export function getCategoryColor(categoryName) {
    return getCategoryAppearance(categoryName).color
}
```

## Bulk Import

Future feature to import categories:

```javascript
async function importCategories(categoryList) {
    const promises = categoryList.map(cat => {
        return saveCategorySettings({
            userId: getCurrentUserId(),
            name: cat.name,
            color: cat.color,
            visible: cat.visible
        })
    })

    await Promise.all(promises)
}
```

## Styling (CSS)

```css
.category-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 8px;
    margin-bottom: 8px;
}

.category-color-preview {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    cursor: pointer;
}

.category-color {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
}

.category-visibility {
    cursor: pointer;
}

.category-delete {
    width: 32px;
    height: 32px;
    border: none;
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-error);
    border-radius: 8px;
    cursor: pointer;
    font-size: 20px;
    padding: 0;
}
```

## Security (firestore.rules)

```javascript
match /categorySettings/{settingId} {
  allow create: if createsOwnResource(request.resource)
    && validStringLength(request.resource.data.name, 100);
  allow read, delete: if ownsResource(resource);
  allow update: if ownsResource(resource)
    && request.resource.data.userId == resource.data.userId
    && validStringLength(request.resource.data.name, 100);
}
```

Only users can read/write their own category settings.

## Performance Tips

1. **Cache categories**: Subscribe once on app init
2. **Avoid re-renders**: Only update changed items
3. **Batch color updates**: Use Promise.all for multiple saves
4. **Index queries**: Firestore auto-indexes by userId + name

## Known Limitations

- [ ] Merging duplicate categories not supported
- [ ] Bulk category operations not supported
- [ ] Category templates/presets not available
- [ ] Emoji category icons not implemented yet

## Related Skills

- [Storage & Sync](./storage.md)
- [Idea Capture](./capture.md)
- [Canvas System](./canvas.md)
- [Search & Filter](./search.md)
