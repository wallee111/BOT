# Idea Capture Skill

## Overview

Multi-page capture system for quickly recording ideas with category selection, priority levels, and instant new category creation. Synchronized idea bubbles ensure consistent display across all pages.

## Features

- ✅ **Quick Capture**: Modal form for capturing ideas fast
- ✅ **Categories**: Select from existing or create new inline
- ✅ **Priority Levels**: Urgent, High, Medium, Low
- ✅ **Synchronized Bubbles**: Consistent idea display everywhere
- ✅ **Pin Support**: Pin important ideas
- ✅ **Real-time**: Ideas appear immediately across all pages
- ✅ **Mobile Optimized**: Touch-friendly controls

## Key Files

- `src/js/index.js` — Dashboard & capture form
- `src/js/review.js` — Review page with idea list
- `src/js/canvas-cards.js` — Canvas card idea rendering
- `src/js/idea-bubble.js` — Swipe gestures (reference)
- `index.html` — Dashboard & capture form markup

## Pages

### 1. Capture Page (index.html)

Main dashboard showing:
- **Pinned Ideas**: Starred important items
- **Recent Ideas**: New captures, sorted by date
- **Resurfaced Section**: Algorithm-selected ideas
- **Hidden Section**: Archived/hidden ideas (collapsible)
- **Capture FAB**: Floating button to open capture form

### 2. Review Page (review.html)

Detailed view of all ideas:
- **Sortable List**: Click headers to sort
- **Filters**: Category, priority, archived, hidden
- **Inline Actions**: Pin, archive, delete via swipe
- **Full Text**: Complete idea content

### 3. Canvas Page (canvas.html)

Organizational view:
- **Draggable Cards**: Move category lists around
- **Header Navigation**: Jump to specific headers
- **Add Idea**: Quick capture from within cards
- **Thread Integration**: Notes on ideas

## Capture Form Structure

```html
<div class="capture-overlay" id="captureOverlay" hidden>
    <form id="ideaForm" class="capture-form">
        <!-- Text input -->
        <textarea id="text"
            placeholder="What's on your mind?..."
            maxlength="500" required></textarea>

        <!-- Tools -->
        <div class="capture-form__tools">
            <!-- Category selector -->
            <button id="categorySelectBtn"
                class="capture-form__category-btn">
                <span id="categoryLabel">Category</span>
            </button>

            <!-- New category input -->
            <input id="categoryNew" type="text"
                placeholder="New category..."
                autocomplete="off" />

            <!-- Hidden selects for menus -->
            <select id="categorySelect" hidden></select>
            <select id="prioritySelect" hidden></select>

            <!-- Submit button -->
            <button type="submit"
                class="capture-form__send">
                Send
            </button>
        </div>
    </form>
</div>
```

## Interaction Flow

### 1. Open Capture Form

```javascript
// Click FAB button
captureFAB.addEventListener('click', () => {
    captureOverlay.hidden = false
    textInput.focus()
})

// Or press keyboard shortcut
document.addEventListener('keydown', (e) => {
    if (e.key === 'n' && !textInput.contains(document.activeElement)) {
        openCaptureOverlay()
    }
})
```

### 2. Select Category

```javascript
categorySelectBtn.addEventListener('click', () => {
    // Open category menu with search
    inputCategoryMenu.classList.add('is-open')
    categoryMenuInput.focus()
})

// Filter categories as user types
categoryMenuInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase()
    filterCategoryOptions(query)
})
```

### 3. Create New Category

User can instantly create a new category:

```javascript
// Type in categoryNew input
categoryNew.addEventListener('input', (e) => {
    const value = e.target.value.trim()
    if (value && !existingCategories.includes(value)) {
        // Mark as new category
        addNewCategoryOption(value)
    }
})

// Or create via category menu search
categoryMenuInput.addEventListener('input', (e) => {
    const value = e.target.value.trim()
    if (value && !existingCategories.includes(value)) {
        showCreateOption(value)
    }
})
```

### 4. Set Priority

```javascript
prioritySelect.addEventListener('change', (e) => {
    formState.priority = e.target.value
})
```

### 5. Submit Form

```javascript
ideaForm.addEventListener('submit', async (e) => {
    e.preventDefault()

    const idea = {
        text: textInput.value,
        category: selectedCategory,
        categories: [selectedCategory],
        priority: prioritySelect.value || undefined,
        tags: [],
        createdAt: Date.now(),
    }

    try {
        await saveIdea(idea)
        showToast('Idea captured!')
        closeCaptureForm()
        clearForm()
    } catch (error) {
        showToast('Failed to capture idea', { tone: 'error' })
    }
})
```

## Unified Idea Bubble Component

All pages use the same idea bubble structure:

```html
<div class="idea-bubble" data-id="${idea.id}">
    <div class="idea-body">
        <div class="idea-header">
            <span class="idea-category">${idea.category}</span>
            <span class="idea-date">${formatDate(idea.createdAt)}</span>
        </div>

        <div class="idea-text">${escapeHtml(idea.text)}</div>

        <div class="idea-footer">
            <div class="idea-actions">
                <!-- Pin button -->
                <button class="idea-pin" data-id="${idea.id}">
                    ${idea.pinned ? '📌' : '📍'}
                </button>
                <!-- Thread button -->
                <button class="idea-thread" data-id="${idea.id}">
                    💬
                </button>
            </div>
        </div>
    </div>

    <!-- Swipe actions (hidden, revealed on swipe) -->
    <div class="swipe-actions">
        <button class="swipe-btn swipe-btn--archive">Archive</button>
        <button class="swipe-btn swipe-btn--pin">Pin</button>
        <button class="swipe-btn swipe-btn--delete">Delete</button>
    </div>
</div>
```

## Swipe Gestures

Swipe left/right on idea bubbles:

```javascript
// Swipe gestures via pointerdown/pointermove/pointerup
const startX = e.clientX

document.addEventListener('pointermove', (e) => {
    const deltaX = e.clientX - startX

    if (deltaX < -60) {
        // Swipe left → show delete
        showAction('delete')
    } else if (deltaX > 60) {
        // Swipe right → show archive
        showAction('archive')
    }
})

// Execute action on button click
deleteBtn.addEventListener('click', async () => {
    await deleteIdea(ideaId)
    showToast('Idea deleted', {
        action: {
            label: 'Undo',
            onClick: async () => {
                // Restore from Firestore backup
            }
        }
    })
})
```

## Pin System

Pin button indicates and toggles pinned status:

```javascript
const pinBtn = ideaBubble.querySelector('.idea-pin')

pinBtn.addEventListener('click', async (e) => {
    e.stopPropagation()
    const ideaId = pinBtn.dataset.id
    const currentPinned = idea.pinned

    try {
        await setIdeaPinned(ideaId, !currentPinned)
        pinBtn.textContent = !currentPinned ? '📌' : '📍'
        showToast(!currentPinned ? 'Pinned' : 'Unpinned')
    } catch (error) {
        showToast('Failed to update pin', { tone: 'error' })
    }
})
```

## Resurfacing Algorithm

Ideas are resurfaced based on:

1. **Date decay**: Older ideas prioritized
2. **View count**: Less viewed ideas prioritized
3. **Random**: Seeded randomness for variety

```javascript
function selectResurfacedIdea(ideas) {
    const scored = ideas
        .filter(i => !i.pinned && !i.archived)
        .map(idea => ({
            idea,
            daysSinceCreated: daysSince(idea.createdAt),
            score: calculateScore(idea),
        }))
        .sort((a, b) => b.score - a.score)

    return scored[0]?.idea || null
}
```

## Form State Management

```javascript
const formState = {
    text: '',
    selectedCategory: null,
    priority: null,
    tags: [],
}

function clearForm() {
    textInput.value = ''
    categorySelect.value = ''
    prioritySelect.value = ''
    formState = { text: '', selectedCategory: null, priority: null, tags: [] }
}
```

## Mobile Considerations

- ✅ Full-screen capture overlay on mobile
- ✅ Keyboard doesn't push form off screen
- ✅ Touch-friendly buttons and inputs
- ✅ Swipe actions intuitive on mobile

## Accessibility

- ✅ Form labels linked to inputs
- ✅ Required fields marked
- ✅ Error messages announced
- ✅ Keyboard navigation supported
- ✅ Skip link to main content

## Known Limitations

- [ ] Character limit enforced only client-side (server validates)
- [ ] No draft saving yet
- [ ] No bulk import/export
- [ ] Mobile keyboard can obscure form

## Related Skills

- [Storage & Sync](./storage.md)
- [Categories & Organization](./categories.md)
- [Canvas System](./canvas.md)
- [Thread Notes](./threads.md)
- [Accessibility](./accessibility.md)
