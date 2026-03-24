# Design: Decompose storage.js into domain-scoped data layer with DI

**Date**: 2026-03-24
**Issue**: [#3 — refactor: deepen storage.js god object into domain-scoped data layer with DI](https://github.com/wallee111/BOT/issues/3)
**Status**: Approved

---

## Problem

`src/lib/storage.js` is an 1867-line god object with 40+ exports that conflates five responsibilities:

- Domain CRUD for 6 data types (ideas, categories, pageNotes, noteFolders, canvas, threadNotes)
- Offline mutation queue (localStorage-based enqueue, retry, flush)
- Caching (localStorage + in-memory, TTL, stale-while-revalidate)
- Firestore transport (SDK calls, `onSnapshot`, timestamp conversion, persistence setup)
- Data normalization (timestamp coercion, category dedup, defaults)

The module has 7 module-scope mutable variables, import-time side effects, and zero test coverage. The identical auth-guard + query + snapshot + normalize + cache pattern is duplicated 6 times.

## Design

### Factory + Dependency Injection

A `createStorage(deps)` factory receives all infrastructure dependencies and returns domain-scoped stores. The factory is pure — no global imports, no side effects.

```js
// src/lib/storage/create-storage.js
export function createStorage(deps) {
  // deps: { firestore, auth, localStorage, isOffline, perfMonitor }
  const mutationQueue = createMutationQueue(deps);

  const ideas       = createIdeasStore(deps, mutationQueue);
  const categories  = createCategoriesStore(deps);
  const pageNotes   = createPageNotesStore(deps, mutationQueue);
  const noteFolders = createNoteFoldersStore(deps, mutationQueue);
  const canvas      = createCanvasStore(deps);
  const threadNotes = createThreadNotesStore(deps);

  // Domain stores register their own executors with the queue
  // (happens inside each create*Store call)

  return {
    ideas,
    categories,
    pageNotes,
    noteFolders,
    canvas,
    threadNotes,
    mutations: {
      getPendingCount: () => mutationQueue.getPendingCount(),
      flush: (opts) => mutationQueue.flush(opts),
    },
  };
}
```

### Production Wiring

A single file touches real Firebase/DOM globals and passes them to the factory. Firestore persistence setup happens here, before factory creation.

```js
// src/lib/storage/index.js
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { app } from '../firebase.js';
import { getCurrentUserId } from '../auth.js';
import { perfMonitor } from '../performance.js';
import { createStorage } from './create-storage.js';

const db = getFirestore(app);
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  // fallback chain: multi-tab -> single-tab -> warn
});

export const storage = createStorage({
  firestore: db,
  auth: { getCurrentUserId },
  localStorage: window.localStorage,
  isOffline: () => navigator.onLine === false,
  perfMonitor,
});
```

### Test Wiring

Tests create storage with fakes — no Firebase, no browser APIs.

```js
const storage = createStorage({
  firestore: createFakeFirestore(),
  auth: { getCurrentUserId: async () => 'test-user' },
  localStorage: new FakeLocalStorage(),
  isOffline: () => false,
  perfMonitor: { trackWrite: () => {}, trackCacheHit: () => {}, trackCacheMiss: () => {} },
});
```

---

## Key Design Decisions

### 1. Compat shim for incremental migration

A `compat.js` re-exports the old flat API via the new stores, allowing callers to migrate one file at a time.

```js
// src/lib/storage/compat.js
import { storage } from './index.js';

export const saveIdea = (idea) => storage.ideas.save(idea);
export const subscribeToIdeas = (cb) => storage.ideas.subscribe(cb);
export const setIdeaArchived = (id, archived) => storage.ideas.setArchived(id, archived);
// ... all 40+ current exports mapped to new stores
```

**Migration path**: Update the old `src/lib/storage.js` to re-export from `compat.js`, then migrate each of the 8 consumer files one at a time. Delete `compat.js` once all consumers use the new API.

### 2. Factories throughout (no classes)

All constructs use closure-based factory functions, not classes. This keeps the style consistent across `createStorage`, `createMutationQueue`, `createDomainStore`, and all domain stores. Avoids `this`-binding issues when passing methods as callbacks.

### 3. Three domain shapes

The 6 domains fall into three distinct shapes. The shared `createDomainStore()` base handles only the collection shape. Canvas and threadNotes are bespoke, composing shared utilities where useful.

| Shape | Domains | Pattern |
|-------|---------|---------|
| **Collection** (user-scoped query) | ideas, pageNotes, noteFolders, categories | `query(where userId) → onSnapshot → normalize → cache` |
| **Single doc** (debounced) | canvas | `doc(collection, userId) → onSnapshot`, debounced `setDoc` |
| **Subcollection** (parent-scoped) | threadNotes | `collection(ideas/${ideaId}/comments)` — per-parent listener |

#### Shared base: `createDomainStore(config, deps)`

Encapsulates the repeated pattern for collection-based domains:

```js
// config shape:
{
  collectionName: string,
  localCacheKey: string,
  cacheTTL: number,
  normalize: (data, id) => T,
  serialize: (item) => FirestoreData,
  orderBy?: (a, b) => number,
}
```

Returns the standard interface:

```js
{
  subscribe(callback): () => void,   // onSnapshot with auth gate
  save(item): Promise,               // setDoc with optimistic update
  delete(id): Promise,               // deleteDoc with optimistic update
  update(id, fields): Promise,       // updateDoc with optimistic update
  getAll(opts?): Promise<T[]>,       // stale-while-revalidate
  getCached(): T[],                  // synchronous cache read
}
```

#### Shared utilities (used by all shapes)

- `createLocalCache(key, ttl, localStorage)` — read/write/TTL check/optimistic update for localStorage + in-memory cache
- `withAuthGate(deps.auth, fn)` — wraps a function to no-op if no user is authenticated

#### Canvas store (bespoke)

Single-document pattern with debounced saves. Uses `createLocalCache` for caching but has its own `onSnapshot` wiring (doc listener, not query listener) and fire-and-forget debounced `setDoc`.

```js
canvas.load(): Promise<CanvasLayout>
canvas.save(layout): void          // debounced, fire-and-forget
canvas.subscribe(cb): () => void
```

#### ThreadNotes store (bespoke)

Subcollection pattern scoped to a parent idea. Each `subscribe(ideaId, cb)` creates a separate listener on `ideas/${ideaId}/comments`. Uses `createLocalCache` keyed per ideaId.

```js
threadNotes.subscribe(ideaId, cb): () => void
threadNotes.add(ideaId, text): Promise
threadNotes.delete(ideaId, noteId): Promise
threadNotes.update(ideaId, noteId, text): Promise
threadNotes.getCount(ideaId): number
threadNotes.getCached(ideaId): Note[]
```

### 4. Domain-agnostic mutation queue with registered executors

The mutation queue is pure infrastructure. It stores `{ type, payload }` entries in localStorage and calls registered executor functions on flush. Each domain store registers its own executors during creation.

```js
function createMutationQueue(deps) {
  const executors = {};

  return {
    register(type, executor) { executors[type] = executor; },
    enqueue(entry) { /* persist to localStorage, emit count event */ },
    flush(opts) { /* iterate queue, call executors[entry.type](entry.payload) */ },
    getPendingCount() { /* read from localStorage */ },
    run({ type, payload, userId, applyLocal }) {
      // Try execute immediately; if offline or network error, enqueue + applyLocal
    },
    destroy() { /* clear timers */ },
  };
}
```

Domain stores register executors at creation time:

```js
function createIdeasStore(deps, mutationQueue) {
  const store = createDomainStore({ collectionName: 'ideas', ... }, deps);

  // Register mutation executors
  mutationQueue.register('saveIdea', async (payload) => { /* setDoc */ });
  mutationQueue.register('setIdeaArchived', async ({ id, archived }) => { /* updateDoc */ });
  // ...

  return {
    ...store,
    setArchived(id, archived) {
      return mutationQueue.run({ type: 'setIdeaArchived', payload: { id, archived }, ... });
    },
    // ...
  };
}
```

### 5. Firestore persistence in production wiring

Persistence setup (`enableMultiTabIndexedDbPersistence`) runs in the production wiring file (`src/lib/storage/index.js`) before `createStorage()` is called. The factory never touches persistence — keeps it pure and testable.

---

## Target File Structure

```
src/lib/storage/
  index.js              # Production wiring (real deps -> createStorage)
  create-storage.js     # Pure factory, no global imports
  mutation-queue.js     # createMutationQueue() — domain-agnostic
  local-cache.js        # createLocalCache() — localStorage + in-memory + TTL
  domain-store.js       # createDomainStore() — shared collection-based pattern
  auth-gate.js          # withAuthGate() utility
  domains/
    ideas.js            # createIdeasStore() + normalize + extensions
    categories.js       # createCategoriesStore() — palette, rename, visibility
    page-notes.js       # createPageNotesStore()
    note-folders.js     # createNoteFoldersStore()
    canvas.js           # createCanvasStore() — single-doc, debounced
    thread-notes.js     # createThreadNotesStore() — subcollection
  compat.js             # Shim: old flat API -> new stores (delete after migration)
```

---

## Testing Strategy

### Test environment

- `FakeFirestore`: in-memory Map-backed, supports `setDoc`/`updateDoc`/`deleteDoc`/`onSnapshot`/`query`/`where`
- `FakeLocalStorage`: Map-backed `Storage` interface

### Boundary tests to write

- **Mutation queue**: enqueue when offline, flush on reconnect, skip foreign user's mutations, drop non-retryable errors, handle localStorage quota errors, executor registration
- **Local cache**: TTL expiry, stale-while-revalidate, optimistic updates on mutate, cache cleared on auth change
- **Domain CRUD**: save/delete/update round-trip through cache and fake transport for each domain
- **Listener lifecycle**: subscribe returns unsubscribe, callback fires on snapshot, auth gating (no user -> no-op)
- **Canvas debounce**: rapid saves coalesce, pending save on destroy
- **Category rename**: updates all affected ideas + palette atomically
- **Compat shim**: old API calls delegate correctly to new stores

---

## Consumer Migration

8 files import from `storage.js`:

| File | Imports used |
|------|-------------|
| `src/js/index.js` | ideas CRUD, subscribe, categories |
| `src/js/review.js` | ideas CRUD, subscribe, categories |
| `src/js/categories.js` | category palette, rename, visibility, subscribe |
| `src/js/canvas.js` | canvas load/save/subscribe |
| `src/js/notes.js` | pageNotes, noteFolders CRUD + subscribe |
| `src/js/canvas-cards.js` | ideas CRUD (archive, pin, delete, text, priority, save) |
| `src/js/thread-notes.js` | threadNotes (subscribe, add, delete, update, count, cached) |
| `src/js/category-dropdown.js` | setIdeaCategories |

Migration order: one file at a time, from simplest (fewest imports) to most complex. After each migration, the compat shim covers the remaining callers.
