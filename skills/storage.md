# Storage & Sync Skill

## Overview

Offline-first data layer using localStorage for instant access and Firestore as the authoritative source. Real-time subscriptions and optimistic updates ensure consistency across devices.

## Features

- ✅ **Offline First**: App works without internet via localStorage cache
- ✅ **Real-time Sync**: Firestore subscriptions update all pages instantly
- ✅ **Optimistic Updates**: Changes appear immediately, synced to Firestore
- ✅ **Mutation Queue**: Offline writes queued and synced when online
- ✅ **Cache Invalidation**: Auto-clear cache on auth changes
- ✅ **Conflict Resolution**: Server truth overrides local conflicts
- ✅ **Full CRUD**: Create, read, update, delete for all data types

## Key Files

- `src/lib/storage.js` — All CRUD operations (~1400 lines)
- `src/lib/firebase.js` — Firebase config
- `firestore.rules` — Security rules and validation

## Data Model

### Ideas Collection

```javascript
ideas/{ideaId}
├── id: string (document ID)
├── text: string (idea content, max 10000 chars)
├── category: string (primary category)
├── categories: string[] (all categories)
├── tags: string[] (optional tags)
├── priority: 'urgent' | 'high' | 'medium' | 'low' | undefined
├── pinned: boolean
├── archived: boolean
├── hidden: boolean
├── createdAt: timestamp
├── updatedAt: timestamp (optional)
└── userId: string (owner)
```

### Thread Notes (Comments)

```javascript
ideas/{ideaId}/comments/{commentId}
├── id: string
├── text: string (note content, max 5000 chars)
├── createdAt: timestamp
├── updatedAt: timestamp (optional)
└── userId: string (creator)
```

### Category Settings

```javascript
categorySettings/{settingId}
├── userId: string
├── name: string (category name, max 100 chars)
├── color: string (hex color, e.g. "#ffca28")
└── visible: boolean
```

### Canvas Layouts

```javascript
canvasLayouts/{userId}
├── userId: string
├── cards: array (category cards with positions)
├── headers: array (header elements)
└── viewport: { panX, panY, zoom }
```

### User Settings

```javascript
userSettings/{userId}
├── userId: string
├── theme: 'dark' | 'light'
├── pinnedCount: number
└── lastSyncAt: timestamp
```

## API Reference

### Ideas CRUD

```javascript
// Create
await saveIdea({ text, category, categories, priority, tags })

// Read
const idea = await getIdea(ideaId)
const ideas = await getAllIdeas()
const ideas = await getIdeasByCategory(categoryName)

// Update
await setIdeaArchived(ideaId, true)
await setIdeaHidden(ideaId, true)
await setIdeaPinned(ideaId, true)
await updateIdeaText(ideaId, newText)

// Delete
await deleteIdea(ideaId)

// Subscribe (real-time)
const unsubscribe = subscribeToIdeas((ideas) => {
    console.log('Ideas updated:', ideas)
})
```

### Thread Notes CRUD

```javascript
// Create
await addNote(ideaId, { text })

// Read
const notes = await getNotes(ideaId)
const note = await getNote(ideaId, noteId)

// Update
await updateNoteText(ideaId, noteId, newText)

// Delete
await deleteNote(ideaId, noteId)

// Subscribe (real-time)
const unsubscribe = subscribeToNotes(ideaId, (notes) => {
    console.log('Notes updated:', notes)
})
```

### Categories CRUD

```javascript
// Create
await saveCategorySettings({ userId, name, color, visible })

// Read
const categories = await getAllCategories()
const settings = await getCategorySettings(categoryName)

// Update
await setCategoryVisible(categoryName, true)
await setCategoryColor(categoryName, '#ffca28')

// Delete
await deleteCategorySettings(categoryName)

// Subscribe (real-time)
const unsubscribe = subscribeToCategories((categories) => {
    console.log('Categories updated:', categories)
})
```

## Implementation Pattern

All storage functions follow this pattern:

```javascript
export async function setIdeaArchived(ideaId, archived) {
    // 1. Optimistic: Update local cache immediately
    const cached = getFromLocalStorage('ideas_v1_cache') || {}
    if (cached[ideaId]) {
        cached[ideaId].archived = archived
        saveToLocalStorage('ideas_v1_cache', cached)
        notifySubscribers() // Update UI
    }

    // 2. Sync: Write to Firestore
    try {
        const docRef = doc(firestore, 'ideas', ideaId)
        await updateDoc(docRef, { archived })
    } catch (error) {
        // 3. Fallback: Revert cache on error
        if (cached[ideaId]) {
            cached[ideaId].archived = !archived
            saveToLocalStorage('ideas_v1_cache', cached)
            notifySubscribers()
        }
        throw error
    }
}
```

This ensures:
- **Fast**: UI updates instantly from cache
- **Reliable**: Firestore is source of truth
- **Resilient**: Reverts on failure

## Real-time Subscriptions

All data types have subscriptions:

```javascript
// Ideas
subscribeToIdeas(callback)

// Notes for a specific idea
subscribeToNotes(ideaId, callback)

// Categories
subscribeToCategories(callback)

// Canvas layout
subscribeToCanvasLayout(userId, callback)
```

Subscriptions automatically:
- Listen to Firestore changes
- Update local cache
- Notify all subscribers
- Handle offline/online transitions

## Cache Keys (localStorage)

```
ideas_v1_cache           → all ideas
category_settings_v1     → category settings
category_usage_v1        → category metadata
canvas_layouts           → canvas layouts
user_settings_v1         → user preferences
mutation_queue_v1        → offline mutations
```

## Security

Firestore Security Rules enforce:

```javascript
// Only owner can read/write
allow read, delete: if ownsResource(resource)
allow update: if ownsResource(resource)
  && request.resource.data.userId == resource.data.userId

// Only idea owner can manage comments
match /comments/{commentId} {
    allow CRUD: if ownsParentIdea()
}

// Validate input data
allow create: if validStringLength(request.resource.data.text, 10000)
  && request.resource.data.keys().hasAll(['userId', 'text', 'createdAt'])
  && request.resource.data.createdAt is timestamp
```

## Error Handling

```javascript
try {
    await saveIdea({ text, category })
} catch (error) {
    if (error.code === 'permission-denied') {
        console.error('Not authorized to save idea')
    } else if (error.code === 'unavailable') {
        console.error('Firestore unavailable, queued offline')
    } else {
        console.error('Save failed:', error)
    }
    throw error
}
```

## Performance Tips

1. **Minimize re-renders**: Subscribe once, store reference
2. **Batch updates**: Group multiple changes before Firestore writes
3. **Lazy load**: Don't fetch all ideas immediately
4. **Index queries**: Firestore auto-indexes common queries
5. **Unsubscribe**: Call unsubscribe() when component unmounts

## Testing Offline Mode

1. Open DevTools → Network tab
2. Set throttling to "Offline"
3. Make changes in app
4. Turn network back on
5. Verify mutations synced to Firestore

## Known Limitations

- [ ] Mutation queue doesn't persist across app restart yet
- [ ] Conflict resolution is simple (last-write-wins)
- [ ] No batch delete support yet
- [ ] Analytics not tracked yet

## Related Skills

- [Authentication](./authentication.md)
- [Idea Capture](./capture.md)
- [Thread Notes](./threads.md)
- [Search & Filter](./search.md)
