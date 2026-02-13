# Pin & Priority System Skill

## Overview

System for marking important ideas as pinned and assigning priority levels (Urgent, High, Medium, Low) to control sorting and visual emphasis across the app.

## Features

- ✅ **Pinned Ideas**: Star important ideas for quick access
- ✅ **Priority Levels**: Urgent, High, Medium, Low
- ✅ **Smart Sorting**: Pinned items appear first
- ✅ **Visual Badges**: Priority shown with colors/icons
- ✅ **Quick Toggle**: Pin via button or swipe action
- ✅ **Persistent**: Saved to Firestore
- ✅ **Real-time**: Sync across devices

## Data Model

```javascript
idea: {
    id: string,
    text: string,
    pinned: boolean,
    priority: 'urgent' | 'high' | 'medium' | 'low' | undefined,
    category: string,
    createdAt: timestamp,
    userId: string
}
```

## API Reference

### Pin Management

```javascript
// Pin an idea
await setIdeaPinned(ideaId, true)

// Unpin an idea
await setIdeaPinned(ideaId, false)

// Get pinned count for user
const count = ideas.filter(i => i.pinned).length
```

### Priority Management

```javascript
// Set priority (when capturing)
const idea = {
    text: 'Launch product',
    priority: 'urgent',
    // ...
}
await saveIdea(idea)

// Update existing idea priority
await updateIdeaPriority(ideaId, 'high')
```

## Sorting Order

Ideas are displayed in this priority order:

1. **Pinned** (`pinned: true`)
2. **Urgent** (`priority: 'urgent'`)
3. **High** (`priority: 'high'`)
4. **Medium** (`priority: 'medium'`)
5. **Low** (`priority: 'low'`)
6. **None** (no priority)

Within each level, sort by date (newest first).

### Implementation

```javascript
function sortByPriorityAndDate(ideas) {
    const priorityOrder = {
        'urgent': 1,
        'high': 2,
        'medium': 3,
        'low': 4,
        undefined: 5
    }

    return ideas.sort((a, b) => {
        // Pinned first
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1

        // Then by priority
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
        if (priorityDiff !== 0) return priorityDiff

        // Finally by date (newest first)
        return b.createdAt - a.createdAt
    })
}
```

## Pin Button (Capture Page)

Pin button appears in idea bubbles:

```html
<div class="idea-bubble" data-id="${idea.id}">
    <!-- ... idea content ... -->

    <div class="idea-footer">
        <div class="idea-actions">
            <button class="idea-pin" data-id="${idea.id}"
                aria-label="Pin idea"
                title="${idea.pinned ? 'Unpin' : 'Pin'}">
                ${idea.pinned ? '📌' : '📍'}
            </button>

            <button class="idea-thread" data-id="${idea.id}"
                aria-label="Open thread">
                💬
            </button>
        </div>
    </div>
</div>
```

### Pin Button Handler

```javascript
pinBtn.addEventListener('click', async (e) => {
    e.stopPropagation()

    const ideaId = pinBtn.dataset.id
    const idea = ideas.find(i => i.id === ideaId)
    const newPinned = !idea.pinned

    try {
        // Optimistic update
        pinBtn.textContent = newPinned ? '📌' : '📍'
        idea.pinned = newPinned

        // Save to Firestore
        await setIdeaPinned(ideaId, newPinned)

        // Show feedback
        showToast(newPinned ? 'Pinned' : 'Unpinned', {
            timeout: 1000
        })
    } catch (error) {
        // Revert on error
        pinBtn.textContent = idea.pinned ? '📌' : '📍'
        showToast('Failed to update pin', { tone: 'error' })
    }
})
```

## Swipe Gesture Integration

Pin action available via swipe on canvas:

```javascript
// In canvas-cards.js or idea-bubble.js
row.innerHTML += `
    <div class="swipe-actions">
        <button class="swipe-btn swipe-btn--pin"
            data-action="pin">
            ${idea.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button class="swipe-btn swipe-btn--archive"
            data-action="archive">
            Archive
        </button>
        <button class="swipe-btn swipe-btn--delete"
            data-action="delete">
            Delete
        </button>
    </div>
`

// Handle swipe action
swipeBtn.addEventListener('click', async (e) => {
    const action = e.target.dataset.action

    if (action === 'pin') {
        await setIdeaPinned(ideaId, !idea.pinned)
        showToast(idea.pinned ? 'Pinned' : 'Unpinned')
    }
})
```

## Priority Levels (Capture Form)

Priority selector in capture form:

```html
<label for="prioritySelect" class="visually-hidden">
    Priority level
</label>
<select id="prioritySelect" hidden aria-label="Priority level">
    <option value="">No priority</option>
    <option value="urgent">Urgent</option>
    <option value="high">High</option>
    <option value="medium">Medium</option>
    <option value="low">Low</option>
</select>
```

### Priority Badge Styling

```css
.idea-priority-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
}

.idea-priority-badge.urgent {
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-error);
}

.idea-priority-badge.high {
    background: var(--md-sys-color-tertiary-container);
    color: var(--md-sys-color-tertiary);
}

.idea-priority-badge.medium {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-secondary);
}

.idea-priority-badge.low {
    background: var(--md-sys-color-outline-variant);
    color: var(--md-sys-color-on-surface-variant);
}

.idea-pin-icon.pinned {
    color: var(--md-sys-color-primary);
}
```

## Dashboard Pinned Section

Pinned ideas appear in dedicated section:

```javascript
function renderPinnedSection(ideas) {
    const pinnedIdeas = ideas.filter(i => i.pinned)

    if (pinnedIdeas.length === 0) {
        pinnedSection.hidden = true
        return
    }

    pinnedSection.hidden = false
    pinnedFeed.innerHTML = ''

    pinnedIdeas.forEach(idea => {
        const bubble = buildIdeaElement(idea)
        pinnedFeed.appendChild(bubble)
    })
}
```

HTML structure:

```html
<section class="dash-section" id="pinnedSection">
    <h2 class="dash-section__title">Pinned</h2>
    <div class="dash-section__body" id="pinnedFeed">
        <!-- Pinned ideas rendered here -->
    </div>
</section>
```

## Review Page Priority Sorting

Review page shows all ideas sorted by priority:

```javascript
async function renderReviewPage() {
    const ideas = await getAllIdeas()

    // Sort by priority
    const sorted = sortByPriorityAndDate(ideas)

    reviewList.innerHTML = ''
    sorted.forEach(idea => {
        const item = createReviewListItem(idea)
        reviewList.appendChild(item)
    })
}
```

## Canvas Integration

Canvas cards respect priority sorting within each category:

```javascript
async function renderCategoryCards() {
    const categories = await getAllCategories()

    Object.entries(categories).forEach(async ([categoryName, settings]) => {
        const ideas = await getIdeasByCategory(categoryName)

        // Sort ideas within card by priority
        const sorted = sortByPriorityAndDate(ideas)

        // Render sorted ideas in card
        renderCardIdeas(sorted)
    })
}
```

## Keyboard Shortcuts (Future)

```javascript
// P key to toggle pin
document.addEventListener('keydown', (e) => {
    if (e.key === 'p' && selectedIdea) {
        setIdeaPinned(selectedIdea.id, !selectedIdea.pinned)
    }
})

// 1-4 keys to set priority
document.addEventListener('keydown', (e) => {
    if (['1', '2', '3', '4'].includes(e.key) && selectedIdea) {
        const priorities = ['urgent', 'high', 'medium', 'low']
        updateIdeaPriority(selectedIdea.id, priorities[parseInt(e.key) - 1])
    }
})
```

## Performance Optimization

Pin state changes don't require full re-render:

```javascript
// Only update the specific button
function updatePinButton(ideaId, pinned) {
    const btn = document.querySelector(
        `.idea-pin[data-id="${ideaId}"]`
    )
    if (btn) {
        btn.textContent = pinned ? '📌' : '📍'
    }
}
```

## Accessibility

```html
<!-- Pin button with proper labels -->
<button class="idea-pin"
    data-id="${ideaId}"
    aria-label="${idea.pinned ? 'Unpin this idea' : 'Pin this idea'}"
    title="${idea.pinned ? 'Unpin' : 'Pin'}">
    ${idea.pinned ? '📌' : '📍'}
</button>

<!-- Priority badge as semantic markup -->
<span class="idea-priority-badge"
    role="status"
    aria-label="${priority} priority">
    ${priority}
</span>
```

## Storage Implementation

```javascript
export async function setIdeaPinned(ideaId, pinned) {
    // 1. Optimistic update
    const cached = getFromLocalStorage('ideas_v1_cache') || {}
    const oldPinned = cached[ideaId]?.pinned
    if (cached[ideaId]) {
        cached[ideaId].pinned = pinned
        saveToLocalStorage('ideas_v1_cache', cached)
        notifySubscribers()
    }

    // 2. Sync to Firestore
    try {
        const docRef = doc(firestore, 'ideas', ideaId)
        await updateDoc(docRef, { pinned })
    } catch (error) {
        // 3. Revert on error
        if (cached[ideaId]) {
            cached[ideaId].pinned = oldPinned
            saveToLocalStorage('ideas_v1_cache', cached)
            notifySubscribers()
        }
        throw error
    }
}
```

## Known Limitations

- [ ] Bulk pin/unpin not supported
- [ ] Smart priority suggestions not implemented
- [ ] Priority filtering on review page not implemented
- [ ] Priority history/changelog not tracked
- [ ] Auto-priority by keywords not implemented

## Related Skills

- [Idea Capture](./capture.md)
- [Storage & Sync](./storage.md)
- [Canvas System](./canvas.md)
- [Search & Filter](./search.md)
