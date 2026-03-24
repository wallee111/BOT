# Storage Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 1867-line `src/lib/storage.js` god object into a domain-scoped data layer with dependency injection, enabling testability and clear separation of concerns.

**Architecture:** Factory-based DI (`createStorage(deps)`) with domain-scoped stores built on a shared `createDomainStore()` base for collection-type domains, bespoke stores for canvas and threadNotes, and a domain-agnostic mutation queue with registered executors. A compat shim enables incremental caller migration.

**Tech Stack:** Vanilla JS (ES Modules), Firebase Firestore v12.6, Vitest (new), localStorage

**Spec:** `docs/superpowers/specs/2026-03-24-storage-refactor-design.md`

---

## File Structure

```
src/lib/storage/
  index.js              # Production wiring — real deps, persistence setup, online listener
  create-storage.js     # Pure factory — createStorage(deps), cross-store wiring
  mutation-queue.js     # createMutationQueue(deps) — domain-agnostic enqueue/flush/register
  local-cache.js        # createLocalCache(config) — localStorage + in-memory + TTL
  auth-gate.js          # withAuthGate(auth, fn) — async auth guard utility
  utils.js              # generateLocalId(), isPermissionDenied(), shouldQueueMutationForError()
  domain-store.js       # createDomainStore(config, deps) — shared collection-based pattern
  domains/
    ideas.js            # createIdeasStore(deps, mutationQueue) + normalizeIdeaObject
    categories.js       # createCategoriesStore(deps) — palette, rename, visibility, usage
    page-notes.js       # createPageNotesStore(deps, mutationQueue)
    note-folders.js     # createNoteFoldersStore(deps, mutationQueue, pageNotesStore)
    canvas.js           # createCanvasStore(deps) — single-doc, debounced
    thread-notes.js     # createThreadNotesStore(deps) — subcollection, optimistic revert
  compat.js             # Shim: re-exports old flat API → new stores

tests/
  helpers/
    fake-firestore.js   # FakeFirestore — in-memory Map-backed
    fake-local-storage.js # FakeLocalStorage — Map-backed Storage interface
    create-test-storage.js # Helper to create storage with fakes
  storage/
    utils.test.js
    local-cache.test.js
    mutation-queue.test.js
    domain-store.test.js
    ideas.test.js
    categories.test.js
    page-notes.test.js
    note-folders.test.js
    canvas.test.js
    thread-notes.test.js
    compat.test.js
```

---

## Task 1: Set up Vitest and test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `tests/helpers/fake-local-storage.js`
- Create: `tests/helpers/fake-firestore.js`
- Create: `tests/helpers/create-test-storage.js`

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Create Vitest config**

Create `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create FakeLocalStorage**

Create `tests/helpers/fake-local-storage.js`:

```js
export class FakeLocalStorage {
  constructor() {
    this._store = new Map();
  }

  getItem(key) {
    return this._store.has(key) ? this._store.get(key) : null;
  }

  setItem(key, value) {
    this._store.set(key, String(value));
  }

  removeItem(key) {
    this._store.delete(key);
  }

  clear() {
    this._store.clear();
  }

  get length() {
    return this._store.size;
  }

  key(index) {
    return [...this._store.keys()][index] ?? null;
  }
}
```

- [ ] **Step 5: Create FakeFirestore**

Create `tests/helpers/fake-firestore.js`. This is the most complex test helper — an in-memory Map-backed fake that supports the Firestore SDK surface used by the storage module.

```js
import { vi } from 'vitest';

class FakeDocSnapshot {
  constructor(id, data) {
    this._id = id;
    this._data = data;
  }
  get id() { return this._id; }
  exists() { return this._data !== undefined; }
  data() { return this._data ? { ...this._data } : undefined; }
}

class FakeQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
  }
  forEach(fn) { this.docs.forEach(fn); }
}

class FakeCollectionRef {
  constructor(store, path) {
    this._store = store;
    this.path = path;
  }
  get id() { return this.path; }
}

class FakeDocRef {
  constructor(store, collectionPath, docId) {
    this._store = store;
    this.path = `${collectionPath}/${docId}`;
    this._collectionPath = collectionPath;
    this._docId = docId;
  }
  get id() { return this._docId; }
}

class FakeBatch {
  constructor(store) {
    this._store = store;
    this._ops = [];
  }
  set(docRef, data, opts) {
    this._ops.push({ type: 'set', docRef, data, opts });
    return this;
  }
  update(docRef, data) {
    this._ops.push({ type: 'update', docRef, data });
    return this;
  }
  delete(docRef) {
    this._ops.push({ type: 'delete', docRef });
    return this;
  }
  async commit() {
    for (const op of this._ops) {
      const key = op.docRef.path;
      if (op.type === 'delete') {
        this._store._data.delete(key);
      } else if (op.type === 'set') {
        const existing = this._store._data.get(key) || {};
        this._store._data.set(key, op.opts?.merge ? { ...existing, ...op.data } : { ...op.data });
      } else if (op.type === 'update') {
        const existing = this._store._data.get(key);
        if (existing) {
          this._store._data.set(key, { ...existing, ...op.data });
        }
      }
    }
    this._store._notifyListeners();
  }
}

export class FakeFirestore {
  constructor() {
    this._data = new Map();   // path -> data
    this._listeners = [];     // { path, callback, errorCallback }
    this._idCounter = 0;
  }

  // -- helpers for tests --
  _seed(collectionPath, docId, data) {
    this._data.set(`${collectionPath}/${docId}`, data);
  }

  _getAll(collectionPath) {
    const results = [];
    for (const [key, value] of this._data) {
      if (key.startsWith(`${collectionPath}/`) && key.split('/').length === collectionPath.split('/').length + 1) {
        const docId = key.slice(collectionPath.length + 1);
        results.push(new FakeDocSnapshot(docId, value));
      }
    }
    return results;
  }

  _notifyListeners() {
    for (const listener of this._listeners) {
      const docs = this._getAll(listener.collectionPath)
        .filter(doc => {
          if (!listener.filters) return true;
          return listener.filters.every(f => {
            const val = doc.data()?.[f.field];
            if (f.op === '==') return val === f.value;
            return true;
          });
        });
      listener.callback(new FakeQuerySnapshot(docs));
    }
  }

  // -- Firestore SDK surface --
  collection(path) {
    return new FakeCollectionRef(this, path);
  }

  doc(collectionRefOrPath, docId) {
    if (typeof collectionRefOrPath === 'string') {
      return new FakeDocRef(this, collectionRefOrPath, docId);
    }
    if (docId) {
      return new FakeDocRef(this, collectionRefOrPath.path, docId);
    }
    // Auto-generate ID
    const id = `auto-${++this._idCounter}`;
    return new FakeDocRef(this, collectionRefOrPath.path, id);
  }

  async getDoc(docRef) {
    const data = this._data.get(docRef.path);
    return new FakeDocSnapshot(docRef._docId, data);
  }

  async getDocs(queryRef) {
    const docs = this._getAll(queryRef._collectionPath || queryRef.path)
      .filter(doc => {
        if (!queryRef._filters) return true;
        return queryRef._filters.every(f => {
          const val = doc.data()?.[f.field];
          if (f.op === '==') return val === f.value;
          return true;
        });
      });
    return new FakeQuerySnapshot(docs);
  }

  async setDoc(docRef, data, opts) {
    const existing = this._data.get(docRef.path) || {};
    this._data.set(docRef.path, opts?.merge ? { ...existing, ...data } : { ...data });
    this._notifyListeners();
  }

  async updateDoc(docRef, data) {
    const existing = this._data.get(docRef.path);
    if (!existing) throw new Error(`Document ${docRef.path} does not exist`);
    this._data.set(docRef.path, { ...existing, ...data });
    this._notifyListeners();
  }

  async deleteDoc(docRef) {
    this._data.delete(docRef.path);
    this._notifyListeners();
  }

  async addDoc(collectionRef, data) {
    const id = `auto-${++this._idCounter}`;
    const docRef = new FakeDocRef(this, collectionRef.path, id);
    this._data.set(docRef.path, { ...data });
    this._notifyListeners();
    return docRef;
  }

  query(collectionRef, ...constraints) {
    const filters = constraints.filter(c => c._type === 'where');
    return {
      _collectionPath: collectionRef.path,
      _filters: filters.map(f => ({ field: f._field, op: f._op, value: f._value })),
    };
  }

  where(field, op, value) {
    return { _type: 'where', _field: field, _op: op, _value: value };
  }

  orderBy(field, direction) {
    return { _type: 'orderBy', _field: field, _direction: direction };
  }

  limit(n) {
    return { _type: 'limit', _n: n };
  }

  onSnapshot(queryOrDocRef, callback, errorCallback) {
    // Doc listener
    if (queryOrDocRef instanceof FakeDocRef) {
      const listener = {
        type: 'doc',
        docPath: queryOrDocRef.path,
        callback,
        errorCallback,
      };
      this._listeners.push(listener);
      // Fire immediately with current state
      const data = this._data.get(queryOrDocRef.path);
      callback(new FakeDocSnapshot(queryOrDocRef._docId, data));
      return () => {
        const idx = this._listeners.indexOf(listener);
        if (idx >= 0) this._listeners.splice(idx, 1);
      };
    }

    // Query listener
    const listener = {
      type: 'query',
      collectionPath: queryOrDocRef._collectionPath || queryOrDocRef.path,
      filters: queryOrDocRef._filters || [],
      callback,
      errorCallback,
    };
    this._listeners.push(listener);
    // Fire immediately
    const docs = this._getAll(listener.collectionPath)
      .filter(doc => {
        if (!listener.filters?.length) return true;
        return listener.filters.every(f => {
          const val = doc.data()?.[f.field];
          if (f.op === '==') return val === f.value;
          return true;
        });
      });
    callback(new FakeQuerySnapshot(docs));
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  writeBatch() {
    return new FakeBatch(this);
  }

  deleteField() {
    return '__DELETE_FIELD__';
  }

  Timestamp = {
    fromMillis(ms) { return { toMillis: () => ms, _ms: ms }; },
  };
}
```

- [ ] **Step 6: Create test storage helper**

Create `tests/helpers/create-test-storage.js` (placeholder — will be updated once `createStorage` exists):

```js
import { FakeFirestore } from './fake-firestore.js';
import { FakeLocalStorage } from './fake-local-storage.js';

export function createTestDeps(overrides = {}) {
  return {
    firestore: new FakeFirestore(),
    auth: { getCurrentUserId: async () => 'test-user' },
    localStorage: new FakeLocalStorage(),
    isOffline: () => false,
    perfMonitor: {
      trackWrite: () => {},
      trackRead: () => {},
      trackCacheHit: () => {},
      trackCacheMiss: () => {},
      startTimer: () => {},
      endTimer: () => {},
    },
    emitEvent: () => {},
    ...overrides,
  };
}
```

- [ ] **Step 7: Verify test infrastructure works**

Create a smoke test `tests/storage/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { FakeLocalStorage } from '../helpers/fake-local-storage.js';
import { FakeFirestore } from '../helpers/fake-firestore.js';

describe('FakeLocalStorage', () => {
  it('stores and retrieves values', () => {
    const ls = new FakeLocalStorage();
    ls.setItem('key', 'value');
    expect(ls.getItem('key')).toBe('value');
  });

  it('returns null for missing keys', () => {
    const ls = new FakeLocalStorage();
    expect(ls.getItem('missing')).toBeNull();
  });
});

describe('FakeFirestore', () => {
  it('seeds and retrieves documents', async () => {
    const fs = new FakeFirestore();
    fs._seed('ideas', 'idea-1', { text: 'hello', userId: 'u1' });
    const ref = fs.doc(fs.collection('ideas'), 'idea-1');
    const snap = await fs.getDoc(ref);
    expect(snap.exists()).toBe(true);
    expect(snap.data().text).toBe('hello');
  });
});
```

- [ ] **Step 8: Run tests**

```bash
npm test
```

Expected: 3 tests pass.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.js package.json package-lock.json tests/
git commit -m "chore: add Vitest, FakeFirestore, FakeLocalStorage test infrastructure"
```

---

## Task 2: Shared utilities — `utils.js`, `auth-gate.js`, `local-cache.js`

**Files:**
- Create: `src/lib/storage/utils.js`
- Create: `src/lib/storage/auth-gate.js`
- Create: `src/lib/storage/local-cache.js`
- Create: `tests/storage/utils.test.js`
- Create: `tests/storage/local-cache.test.js`

- [ ] **Step 1: Write failing tests for utils**

Create `tests/storage/utils.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateLocalId, isPermissionDenied, shouldQueueMutationForError } from '../../src/lib/storage/utils.js';

describe('generateLocalId', () => {
  it('returns a string with the given prefix', () => {
    const id = generateLocalId('test');
    expect(id).toMatch(/^test-/);
  });

  it('generates unique IDs', () => {
    const a = generateLocalId('x');
    const b = generateLocalId('x');
    expect(a).not.toBe(b);
  });
});

describe('isPermissionDenied', () => {
  it('returns true for permission-denied code', () => {
    expect(isPermissionDenied({ code: 'permission-denied' })).toBe(true);
  });

  it('returns true for insufficient permissions message', () => {
    expect(isPermissionDenied({ message: 'Insufficient permissions' })).toBe(true);
  });

  it('returns false for network errors', () => {
    expect(isPermissionDenied({ code: 'unavailable' })).toBe(false);
  });
});

describe('shouldQueueMutationForError', () => {
  it('returns true for unavailable errors', () => {
    expect(shouldQueueMutationForError({ code: 'unavailable' })).toBe(true);
  });

  it('returns true for network message errors', () => {
    expect(shouldQueueMutationForError({ message: 'network error' })).toBe(true);
  });

  it('returns false for permission errors', () => {
    expect(shouldQueueMutationForError({ code: 'permission-denied' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(shouldQueueMutationForError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/storage/utils.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement utils.js**

Create `src/lib/storage/utils.js`:

```js
const NETWORK_RETRYABLE_CODES = new Set(['unavailable', 'deadline-exceeded']);

export const generateLocalId = (prefix = 'mutation') => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch (error) {
    // Ignore crypto access errors
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const isPermissionDenied = (error) =>
  /permission[-_ ]denied/i.test(error?.code || error?.name || '') ||
  /insufficient permissions/i.test(error?.message || '');

export const shouldQueueMutationForError = (error) => {
  if (!error) return false;
  const code = (error.code || error.name || '').toLowerCase();
  if (code.includes('permission')) return false;
  if (NETWORK_RETRYABLE_CODES.has(code)) return true;
  const message = (error.message || '').toLowerCase();
  return /network|fetch|offline|unreachable|timeout/.test(message);
};
```

- [ ] **Step 4: Run utils tests**

```bash
npx vitest run tests/storage/utils.test.js
```

Expected: PASS.

- [ ] **Step 5: Write failing tests for local-cache**

Create `tests/storage/local-cache.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLocalCache } from '../../src/lib/storage/local-cache.js';
import { FakeLocalStorage } from '../helpers/fake-local-storage.js';

describe('createLocalCache', () => {
  let ls;
  let cache;

  beforeEach(() => {
    ls = new FakeLocalStorage();
    cache = createLocalCache({
      key: 'test_cache',
      timestampKey: 'test_cache_ts',
      ttl: 5000,
      localStorage: ls,
    });
  });

  it('read returns empty array when no data', () => {
    expect(cache.read()).toEqual([]);
  });

  it('write + read round-trips data', () => {
    cache.write([{ id: '1', name: 'a' }]);
    expect(cache.read()).toEqual([{ id: '1', name: 'a' }]);
  });

  it('isValid returns true within TTL', () => {
    cache.write([{ id: '1' }]);
    expect(cache.isValid()).toBe(true);
  });

  it('isValid returns false after TTL expires', () => {
    cache.write([{ id: '1' }]);
    // Manually backdate the timestamp
    ls.setItem('test_cache_ts', (Date.now() - 10000).toString());
    expect(cache.isValid()).toBe(false);
  });

  it('getMemory returns null before first write', () => {
    expect(cache.getMemory()).toBeNull();
  });

  it('setMemory sets in-memory cache without touching localStorage', () => {
    cache.setMemory([{ id: '2' }]);
    expect(cache.getMemory()).toEqual([{ id: '2' }]);
    expect(ls.getItem('test_cache')).toBeNull();
  });

  it('update applies a mutator to in-memory + localStorage', () => {
    cache.write([{ id: '1' }, { id: '2' }]);
    cache.setMemory([{ id: '1' }, { id: '2' }]);
    cache.update(items => items.filter(i => i.id !== '1'));
    expect(cache.getMemory()).toEqual([{ id: '2' }]);
    expect(cache.read()).toEqual([{ id: '2' }]);
  });

  it('debounced write coalesces rapid calls', async () => {
    const debouncedCache = createLocalCache({
      key: 'db_cache',
      timestampKey: 'db_cache_ts',
      ttl: 5000,
      localStorage: ls,
      writeDebounce: 50,
    });
    debouncedCache.write([{ id: '1' }]);
    debouncedCache.write([{ id: '2' }]);
    debouncedCache.write([{ id: '3' }]);
    // Immediately, localStorage should not be updated yet
    expect(ls.getItem('db_cache')).toBeNull();
    // After debounce settles
    await new Promise(r => setTimeout(r, 100));
    expect(JSON.parse(ls.getItem('db_cache'))).toEqual([{ id: '3' }]);
  });
});
```

- [ ] **Step 6: Run local-cache tests to verify they fail**

```bash
npx vitest run tests/storage/local-cache.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement local-cache.js**

Create `src/lib/storage/local-cache.js`:

```js
/**
 * createLocalCache — localStorage + in-memory cache with TTL.
 *
 * @param {Object} config
 * @param {string} config.key - localStorage key for data
 * @param {string} config.timestampKey - localStorage key for write timestamp
 * @param {number} config.ttl - TTL in milliseconds
 * @param {Storage} config.localStorage - Storage interface
 * @param {number} [config.writeDebounce=0] - Debounce writes by this many ms (0 = sync)
 */
export function createLocalCache({ key, timestampKey, ttl, localStorage, writeDebounce = 0 }) {
  let memory = null;
  let pendingWrite = null;

  function read() {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.warn(`[LocalCache] Unable to read ${key}`, err);
      return [];
    }
  }

  function writeToStorage(data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(timestampKey, Date.now().toString());
    } catch (err) {
      console.warn(`[LocalCache] Unable to write ${key}`, err);
    }
  }

  function write(data) {
    if (writeDebounce > 0) {
      clearTimeout(pendingWrite);
      pendingWrite = setTimeout(() => writeToStorage(data), writeDebounce);
    } else {
      writeToStorage(data);
    }
  }

  function isValid() {
    try {
      const ts = localStorage.getItem(timestampKey);
      if (!ts) return false;
      return (Date.now() - parseInt(ts, 10)) < ttl;
    } catch {
      return false;
    }
  }

  function getMemory() {
    return memory;
  }

  function setMemory(data) {
    memory = data;
  }

  function update(mutator) {
    const current = memory || read();
    const working = Array.isArray(current) ? [...current] : [];
    const next = mutator(working) || [];
    memory = next;
    write(next);
    return next;
  }

  function clear() {
    memory = null;
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(timestampKey);
    } catch {
      // ignore
    }
  }

  return { read, write, isValid, getMemory, setMemory, update, clear };
}
```

- [ ] **Step 8: Implement auth-gate.js**

Create `src/lib/storage/auth-gate.js`:

```js
/**
 * withAuthGate — wraps an async function so it no-ops if no user is authenticated.
 *
 * @param {{ getCurrentUserId: () => Promise<string|null> }} auth
 * @param {Function} fn - receives userId as first arg, then remaining args
 * @returns {Function}
 */
export function withAuthGate(auth, fn) {
  return async (...args) => {
    const userId = await auth.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }
    return fn(userId, ...args);
  };
}
```

- [ ] **Step 9: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/lib/storage/utils.js src/lib/storage/auth-gate.js src/lib/storage/local-cache.js tests/storage/utils.test.js tests/storage/local-cache.test.js
git commit -m "feat(storage): add shared utilities — local-cache, auth-gate, utils"
```

---

## Task 3: Mutation queue — `mutation-queue.js`

**Files:**
- Create: `src/lib/storage/mutation-queue.js`
- Create: `tests/storage/mutation-queue.test.js`

- [ ] **Step 1: Write failing tests for mutation queue**

Create `tests/storage/mutation-queue.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMutationQueue } from '../../src/lib/storage/mutation-queue.js';
import { FakeLocalStorage } from '../helpers/fake-local-storage.js';

describe('createMutationQueue', () => {
  let ls, queue, emitEvent;

  beforeEach(() => {
    ls = new FakeLocalStorage();
    emitEvent = vi.fn();
    queue = createMutationQueue({
      localStorage: ls,
      isOffline: () => false,
      auth: { getCurrentUserId: async () => 'user-1' },
      emitEvent,
    });
  });

  it('starts with zero pending', () => {
    expect(queue.getPendingCount()).toBe(0);
  });

  describe('register + run (online)', () => {
    it('calls executor immediately when online', async () => {
      const executor = vi.fn().mockResolvedValue(undefined);
      queue.register('testOp', executor);
      await queue.run({ type: 'testOp', payload: { x: 1 }, userId: 'user-1' });
      expect(executor).toHaveBeenCalledWith({ x: 1 });
      expect(queue.getPendingCount()).toBe(0);
    });
  });

  describe('run (offline)', () => {
    it('enqueues mutation when offline', async () => {
      queue = createMutationQueue({
        localStorage: ls,
        isOffline: () => true,
        auth: { getCurrentUserId: async () => 'user-1' },
        emitEvent,
      });
      const executor = vi.fn();
      queue.register('testOp', executor);
      const applyLocal = vi.fn();
      const result = await queue.run({ type: 'testOp', payload: { x: 1 }, userId: 'user-1', applyLocal });
      expect(result.queued).toBe(true);
      expect(executor).not.toHaveBeenCalled();
      expect(applyLocal).toHaveBeenCalled();
      expect(queue.getPendingCount()).toBe(1);
    });
  });

  describe('run (network error)', () => {
    it('enqueues on retryable network error', async () => {
      const executor = vi.fn().mockRejectedValue({ code: 'unavailable' });
      queue.register('testOp', executor);
      const applyLocal = vi.fn();
      const result = await queue.run({ type: 'testOp', payload: { x: 1 }, userId: 'user-1', applyLocal });
      expect(result.queued).toBe(true);
      expect(applyLocal).toHaveBeenCalled();
    });

    it('throws on permission error', async () => {
      const executor = vi.fn().mockRejectedValue({ code: 'permission-denied' });
      queue.register('testOp', executor);
      await expect(queue.run({ type: 'testOp', payload: { x: 1 }, userId: 'user-1' }))
        .rejects.toEqual({ code: 'permission-denied' });
    });
  });

  describe('flush', () => {
    it('executes queued mutations on flush', async () => {
      // Enqueue while offline
      const offlineQueue = createMutationQueue({
        localStorage: ls,
        isOffline: () => true,
        auth: { getCurrentUserId: async () => 'user-1' },
        emitEvent,
      });
      const executor = vi.fn().mockResolvedValue(undefined);
      offlineQueue.register('testOp', executor);
      await offlineQueue.run({ type: 'testOp', payload: { x: 1 }, userId: 'user-1' });
      expect(offlineQueue.getPendingCount()).toBe(1);

      // Create a new online queue with the same localStorage and executor
      const onlineQueue = createMutationQueue({
        localStorage: ls,
        isOffline: () => false,
        auth: { getCurrentUserId: async () => 'user-1' },
        emitEvent,
      });
      onlineQueue.register('testOp', executor);
      await onlineQueue.flush();
      expect(onlineQueue.getPendingCount()).toBe(0);
      expect(executor).toHaveBeenCalledWith({ x: 1 });
    });

    it('skips mutations from a different user', async () => {
      // Enqueue as user-2
      ls.setItem('ideas_mutation_queue_v1', JSON.stringify([
        { id: 'm1', type: 'testOp', payload: { x: 1 }, userId: 'user-2', createdAt: Date.now() }
      ]));
      const executor = vi.fn().mockResolvedValue(undefined);
      queue.register('testOp', executor);
      await queue.flush();
      // Should skip user-2's mutation
      expect(executor).not.toHaveBeenCalled();
      expect(queue.getPendingCount()).toBe(1);
    });

    it('drops non-retryable failures', async () => {
      ls.setItem('ideas_mutation_queue_v1', JSON.stringify([
        { id: 'm1', type: 'testOp', payload: { x: 1 }, userId: 'user-1', createdAt: Date.now() }
      ]));
      const executor = vi.fn().mockRejectedValue({ code: 'not-found' });
      queue.register('testOp', executor);
      await queue.flush();
      expect(queue.getPendingCount()).toBe(0);
    });
  });

  describe('event emission', () => {
    it('emits queue size on enqueue', async () => {
      queue = createMutationQueue({
        localStorage: ls,
        isOffline: () => true,
        auth: { getCurrentUserId: async () => 'user-1' },
        emitEvent,
      });
      queue.register('testOp', vi.fn());
      await queue.run({ type: 'testOp', payload: {}, userId: 'user-1' });
      expect(emitEvent).toHaveBeenCalledWith('ideasMutationQueueChanged', { count: 1 });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/storage/mutation-queue.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement mutation-queue.js**

Create `src/lib/storage/mutation-queue.js`:

```js
import { generateLocalId, shouldQueueMutationForError } from './utils.js';

const QUEUE_KEY = 'ideas_mutation_queue_v1';
const QUEUE_EVENT = 'ideasMutationQueueChanged';

export function createMutationQueue(deps) {
  const { localStorage, isOffline, auth, emitEvent } = deps;
  const executors = {};
  let isFlushing = false;
  let pendingFlushHandle = null;

  function readQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function writeQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      emitEvent(QUEUE_EVENT, { count: queue.length });
    } catch {
      // ignore quota errors
    }
  }

  function enqueue(entry) {
    const queue = readQueue();
    queue.push(entry);
    writeQueue(queue);
  }

  function scheduleFlush(delay = 1500) {
    if (pendingFlushHandle) return;
    pendingFlushHandle = setTimeout(() => {
      pendingFlushHandle = null;
      flush().catch(err => console.warn('Scheduled mutation flush failed', err));
    }, delay);
  }

  function register(type, executor) {
    executors[type] = executor;
  }

  function getPendingCount() {
    return readQueue().length;
  }

  async function run({ type, payload, userId, applyLocal }) {
    if (!type || typeof executors[type] !== 'function') {
      throw new Error(`Unsupported mutation type: ${type}`);
    }

    const entry = {
      id: generateLocalId(type),
      type,
      payload,
      userId,
      createdAt: Date.now(),
    };

    if (isOffline()) {
      applyLocal?.();
      enqueue(entry);
      scheduleFlush();
      return { queued: true };
    }

    try {
      await executors[type](payload);
      applyLocal?.();
      return { queued: false };
    } catch (error) {
      if (shouldQueueMutationForError(error)) {
        applyLocal?.();
        enqueue(entry);
        scheduleFlush();
        return { queued: true };
      }
      throw error;
    }
  }

  async function flush({ force = false } = {}) {
    if (isFlushing) return false;
    if (!force && isOffline()) return false;

    isFlushing = true;
    try {
      const currentUserId = await auth.getCurrentUserId();
      if (!currentUserId) return false;

      const queue = readQueue();
      if (!queue.length) return true;

      const remaining = [];
      let mutated = false;
      let networkError = false;

      for (const entry of queue) {
        if (networkError) {
          remaining.push(entry);
          continue;
        }
        if (entry.userId && entry.userId !== currentUserId) {
          remaining.push(entry);
          continue;
        }
        const executor = executors[entry.type];
        if (typeof executor !== 'function') {
          console.warn('Skipping unknown mutation type', entry.type);
          mutated = true;
          continue;
        }
        try {
          await executor(entry.payload);
          mutated = true;
        } catch (error) {
          if (shouldQueueMutationForError(error)) {
            remaining.push(entry);
            networkError = true;
          } else {
            console.error(`Dropping failed offline mutation (${entry.type})`, error);
            mutated = true;
          }
        }
      }

      if (mutated || remaining.length !== queue.length) {
        writeQueue(remaining);
      }
      return remaining.length === 0;
    } finally {
      isFlushing = false;
    }
  }

  function destroy() {
    clearTimeout(pendingFlushHandle);
    pendingFlushHandle = null;
  }

  return { register, run, flush, getPendingCount, destroy };
}
```

- [ ] **Step 4: Run mutation queue tests**

```bash
npx vitest run tests/storage/mutation-queue.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/mutation-queue.js tests/storage/mutation-queue.test.js
git commit -m "feat(storage): add domain-agnostic mutation queue with registered executors"
```

---

## Task 4: Domain store base — `domain-store.js`

**Files:**
- Create: `src/lib/storage/domain-store.js`
- Create: `tests/storage/domain-store.test.js`

- [ ] **Step 1: Write failing tests for domain-store**

Create `tests/storage/domain-store.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDomainStore } from '../../src/lib/storage/domain-store.js';
import { FakeFirestore } from '../helpers/fake-firestore.js';
import { FakeLocalStorage } from '../helpers/fake-local-storage.js';
import { createLocalCache } from '../../src/lib/storage/local-cache.js';

function makeDeps(overrides = {}) {
  const firestore = new FakeFirestore();
  const localStorage = new FakeLocalStorage();
  return {
    firestore,
    auth: { getCurrentUserId: async () => 'user-1' },
    localStorage,
    perfMonitor: {
      trackRead: vi.fn(), trackWrite: vi.fn(),
      trackCacheHit: vi.fn(), trackCacheMiss: vi.fn(),
      startTimer: vi.fn(), endTimer: vi.fn(),
    },
    ...overrides,
  };
}

const normalize = (data, id) => ({ id, text: data.text || '', userId: data.userId });
const serialize = (item) => ({ text: item.text, userId: item.userId });

describe('createDomainStore', () => {
  let deps, store;

  beforeEach(() => {
    deps = makeDeps();
    store = createDomainStore({
      collectionName: 'items',
      localCacheKey: 'items_cache',
      localTimestampKey: 'items_cache_ts',
      cacheTTL: 5000,
      normalize,
      serialize,
      sortFn: (a, b) => a.text.localeCompare(b.text),
    }, deps);
  });

  it('getCached returns empty array initially', () => {
    expect(store.getCached()).toEqual([]);
  });

  it('save persists to Firestore and updates cache', async () => {
    await store.save({ id: 'item-1', text: 'hello', userId: 'user-1' });
    const snap = await deps.firestore.getDoc(deps.firestore.doc(deps.firestore.collection('items'), 'item-1'));
    expect(snap.exists()).toBe(true);
    expect(snap.data().text).toBe('hello');
  });

  it('delete removes from Firestore and cache', async () => {
    deps.firestore._seed('items', 'item-1', { text: 'hello', userId: 'user-1' });
    store._setCache([{ id: 'item-1', text: 'hello', userId: 'user-1' }]);
    await store.delete('item-1');
    const snap = await deps.firestore.getDoc(deps.firestore.doc(deps.firestore.collection('items'), 'item-1'));
    expect(snap.exists()).toBe(false);
    expect(store.getCached().find(i => i.id === 'item-1')).toBeUndefined();
  });

  it('subscribe calls back with normalized data', async () => {
    deps.firestore._seed('items', 'item-1', { text: 'hello', userId: 'user-1' });
    const callback = vi.fn();
    store.subscribe(callback);
    // onSnapshot fires synchronously in FakeFirestore
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
    const items = callback.mock.calls[0][0];
    expect(items[0].id).toBe('item-1');
    expect(items[0].text).toBe('hello');
  });

  it('subscribe with no user returns no-op unsubscribe', async () => {
    deps.auth.getCurrentUserId = async () => null;
    store = createDomainStore({
      collectionName: 'items',
      localCacheKey: 'items_cache',
      localTimestampKey: 'items_cache_ts',
      cacheTTL: 5000,
      normalize,
      serialize,
    }, deps);
    const callback = vi.fn();
    const unsub = store.subscribe(callback);
    // Give the async auth check time to resolve
    await new Promise(r => setTimeout(r, 10));
    expect(callback).not.toHaveBeenCalled();
    expect(typeof unsub).toBe('function');
  });

  it('emitCachedOnSubscribe fires cached data before listener', async () => {
    deps.localStorage.setItem('items_cache', JSON.stringify([{ id: 'c1', text: 'cached', userId: 'user-1' }]));
    store = createDomainStore({
      collectionName: 'items',
      localCacheKey: 'items_cache',
      localTimestampKey: 'items_cache_ts',
      cacheTTL: 5000,
      normalize,
      serialize,
      emitCachedOnSubscribe: true,
    }, deps);
    const callback = vi.fn();
    store.subscribe(callback);
    // First call should be cached data (synchronous)
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0][0].id).toBe('c1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/storage/domain-store.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement domain-store.js**

Create `src/lib/storage/domain-store.js`:

```js
import { createLocalCache } from './local-cache.js';

/**
 * createDomainStore — shared base for collection-type domain stores.
 *
 * @param {Object} config
 * @param {string} config.collectionName
 * @param {string} config.localCacheKey
 * @param {string} config.localTimestampKey
 * @param {number} config.cacheTTL
 * @param {Function} config.normalize - (data, id) => T
 * @param {Function} config.serialize - (item) => FirestoreData
 * @param {Function} [config.sortFn] - (a, b) => number
 * @param {boolean} [config.emitCachedOnSubscribe=false]
 * @param {number} [config.writeDebounce=0]
 * @param {Object} deps
 */
export function createDomainStore(config, deps) {
  const {
    collectionName,
    localCacheKey,
    localTimestampKey,
    cacheTTL,
    normalize,
    serialize,
    sortFn,
    emitCachedOnSubscribe = false,
    writeDebounce = 0,
  } = config;

  const { firestore, auth, localStorage, perfMonitor } = deps;

  const cache = createLocalCache({
    key: localCacheKey,
    timestampKey: localTimestampKey,
    ttl: cacheTTL,
    localStorage,
    writeDebounce,
  });

  const collectionRef = firestore.collection(collectionName);

  function getCached() {
    const mem = cache.getMemory();
    if (mem) return [...mem];
    const local = cache.read().map(item => normalize(item, item?.id));
    cache.setMemory(local);
    return [...local];
  }

  function _setCache(items) {
    cache.setMemory(items);
    cache.write(items);
  }

  function updateCache(mutator) {
    const current = cache.getMemory() || cache.read().map(item => normalize(item, item?.id));
    const working = Array.isArray(current) ? [...current] : [];
    const next = mutator(working) || [];
    const sorted = sortFn ? next.sort(sortFn) : next;
    cache.setMemory(sorted);
    cache.write(sorted);
    return sorted;
  }

  function subscribe(callback) {
    let unsubscribe = () => {};

    if (emitCachedOnSubscribe) {
      const cached = cache.read().map(item => normalize(item, item?.id));
      if (cached.length > 0) {
        cache.setMemory(cached);
        callback(cached);
      }
    }

    auth.getCurrentUserId().then(userId => {
      if (!userId) return;

      const q = firestore.query(
        collectionRef,
        firestore.where('userId', '==', userId),
      );

      unsubscribe = firestore.onSnapshot(q, (snapshot) => {
        const items = snapshot.docs
          .map(doc => normalize(doc.data() || {}, doc.id));
        const sorted = sortFn ? items.sort(sortFn) : items;
        cache.setMemory(sorted);
        cache.write(sorted);
        callback(sorted);
      }, (error) => {
        console.error(`[${collectionName}] Snapshot error:`, error);
        const mem = cache.getMemory();
        if (mem) callback([...mem]);
      });
    }).catch(error => {
      console.error(`[${collectionName}] Auth error in subscribe:`, error);
    });

    return () => unsubscribe();
  }

  async function save(item) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    const id = item.id || firestore.doc(collectionRef).id;
    const payload = serialize({ ...item, id, userId });
    const docRef = firestore.doc(collectionRef, id);
    await firestore.setDoc(docRef, payload);
    perfMonitor.trackWrite(1);
    return { ...item, id, userId };
  }

  async function deleteItem(id) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    const docRef = firestore.doc(collectionRef, id);
    await firestore.deleteDoc(docRef);
    perfMonitor.trackWrite(1);
    updateCache(items => items.filter(i => i.id !== id));
    return true;
  }

  async function update(id, fields) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    const docRef = firestore.doc(collectionRef, id);
    await firestore.updateDoc(docRef, fields);
    perfMonitor.trackWrite(1);
    updateCache(items => items.map(i => i.id === id ? { ...i, ...fields } : i));
    return true;
  }

  async function getAll({ force = false } = {}) {
    const valid = cache.isValid();
    const mem = cache.getMemory();

    if (!force && mem && valid) {
      perfMonitor.trackCacheHit(collectionName);
      return [...mem];
    }

    if (!force && mem && !valid) {
      perfMonitor.trackCacheHit(`${collectionName}-stale`);
      fetchFromFirestore().catch(err => {
        console.warn(`[${collectionName}] Background refresh failed`, err);
      });
      return [...mem];
    }

    perfMonitor.trackCacheMiss(collectionName);
    try {
      return await fetchFromFirestore();
    } catch (error) {
      console.error(`[${collectionName}] Firestore fetch failed, using cache`, error);
      const local = cache.read().map(item => normalize(item, item?.id));
      cache.setMemory(local);
      return [...local];
    }
  }

  async function fetchFromFirestore() {
    perfMonitor.startTimer(`fetch_${collectionName}`);
    const userId = await auth.getCurrentUserId();
    if (!userId) return [];

    const q = firestore.query(collectionRef, firestore.where('userId', '==', userId));
    const snapshot = await firestore.getDocs(q);
    perfMonitor.trackRead(snapshot.size);
    const items = snapshot.docs.map(doc => normalize(doc.data() || {}, doc.id));
    const sorted = sortFn ? items.sort(sortFn) : items;
    cache.setMemory(sorted);
    cache.write(sorted);
    perfMonitor.endTimer(`fetch_${collectionName}`);
    return [...sorted];
  }

  return {
    subscribe,
    save,
    delete: deleteItem,
    update,
    getAll,
    getCached,
    updateCache,
    _setCache,
  };
}
```

- [ ] **Step 4: Run domain-store tests**

```bash
npx vitest run tests/storage/domain-store.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/domain-store.js tests/storage/domain-store.test.js
git commit -m "feat(storage): add createDomainStore base for collection-type domains"
```

---

## Task 5: Ideas store — `domains/ideas.js`

**Files:**
- Create: `src/lib/storage/domains/ideas.js`
- Create: `tests/storage/ideas.test.js`
- Reference: `src/lib/storage.js:446-475` (normalizeIdeaObject), `src/lib/storage.js:1023-1304` (ideas CRUD)

- [ ] **Step 1: Write failing tests**

Create `tests/storage/ideas.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIdeasStore } from '../../src/lib/storage/domains/ideas.js';
import { createMutationQueue } from '../../src/lib/storage/mutation-queue.js';
import { FakeFirestore } from '../helpers/fake-firestore.js';
import { FakeLocalStorage } from '../helpers/fake-local-storage.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createIdeasStore', () => {
  let deps, queue, ideas;

  beforeEach(() => {
    deps = createTestDeps();
    queue = createMutationQueue(deps);
    ideas = createIdeasStore(deps, queue);
  });

  it('save creates idea with normalized fields', async () => {
    await ideas.save({ id: 'i1', text: 'hello', category: 'work' });
    const snap = await deps.firestore.getDoc(deps.firestore.doc(deps.firestore.collection('ideas'), 'i1'));
    expect(snap.exists()).toBe(true);
    expect(snap.data().categories).toEqual(['work']);
    expect(snap.data().userId).toBe('test-user');
  });

  it('setArchived updates archived field and clears pinned', async () => {
    deps.firestore._seed('ideas', 'i1', { text: 'hello', userId: 'test-user', archived: false, pinned: true });
    ideas._setCache([{ id: 'i1', text: 'hello', userId: 'test-user', archived: false, pinned: true, categories: [], category: '', tags: [], priority: '', createdAt: 1, hidden: false }]);
    await ideas.setArchived('i1', true);
    expect(ideas.getCached().find(i => i.id === 'i1').archived).toBe(true);
    expect(ideas.getCached().find(i => i.id === 'i1').pinned).toBe(false);
  });

  it('setCategories normalizes category array', async () => {
    deps.firestore._seed('ideas', 'i1', { text: 'hello', userId: 'test-user' });
    ideas._setCache([{ id: 'i1', text: 'hello', userId: 'test-user', categories: [], category: '', tags: [], priority: '', createdAt: 1, archived: false, hidden: false, pinned: false }]);
    await ideas.setCategories('i1', ['Work', ' work ', 'Personal']);
    const idea = ideas.getCached().find(i => i.id === 'i1');
    // normalizeCategories deduplicates trimmed lowercase
    expect(idea.categories.length).toBeLessThanOrEqual(2);
  });

  it('getUniqueCategories returns distinct category names', async () => {
    ideas._setCache([
      { id: 'i1', categories: ['work', 'personal'], category: 'work', text: '', tags: [], priority: '', createdAt: 1, archived: false, hidden: false, pinned: false, userId: 'test-user' },
      { id: 'i2', categories: ['work'], category: 'work', text: '', tags: [], priority: '', createdAt: 2, archived: false, hidden: false, pinned: false, userId: 'test-user' },
    ]);
    const cats = ideas.getUniqueCategories();
    expect(cats).toContain('work');
    expect(cats).toContain('personal');
    expect(cats.length).toBe(2);
  });

  it('delete calls onCategoriesOrphaned when category becomes unused', async () => {
    deps.firestore._seed('ideas', 'i1', { text: 'only idea with work', userId: 'test-user', categories: ['work'], category: 'work' });
    ideas._setCache([{ id: 'i1', text: 'only idea', userId: 'test-user', categories: ['work'], category: 'work', tags: [], priority: '', createdAt: 1, archived: false, hidden: false, pinned: false }]);
    const orphanSpy = vi.fn();
    ideas.onCategoriesOrphaned = orphanSpy;
    await ideas.delete('i1');
    expect(orphanSpy).toHaveBeenCalledWith(['work']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/storage/ideas.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ideas.js**

Create `src/lib/storage/domains/ideas.js`. Port `normalizeIdeaObject` from `storage.js:446-475`, and build the store using `createDomainStore` + mutation queue registration. Include all idea-specific methods: `setArchived`, `setHidden`, `setPinned`, `setCategories`, `updateText`, `updatePriority`, `getUniqueCategories`, and the category orphan cleanup callback on `delete`.

Key implementation notes from the current code:
- `normalizeIdeaObject` (storage.js:446-475) — handles Firestore Timestamp → millis, deduplicates categories
- Import `normalizeCategories` from `../../utils.js` (the app's shared utils, not the storage utils)
- `save` (storage.js:1023-1059) — uses `runMutation` with optimistic local update
- `delete` (storage.js:1201-1232) — after mutation, calls `cleanupUnusedCategories` → wire via `onCategoriesOrphaned`
- Ideas cache write debounce: 150ms
- Sort order: `(a, b) => a.createdAt - b.createdAt`

- [ ] **Step 4: Run ideas tests**

```bash
npx vitest run tests/storage/ideas.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/domains/ideas.js tests/storage/ideas.test.js
git commit -m "feat(storage): add ideas domain store with mutation queue integration"
```

---

## Task 6: Categories store — `domains/categories.js`

**Files:**
- Create: `src/lib/storage/domains/categories.js`
- Create: `tests/storage/categories.test.js`
- Reference: `src/lib/storage.js:515-946` (all category code), `src/lib/storage.js:1307-1331` (usage tracking)

- [ ] **Step 1: Write failing tests**

Create `tests/storage/categories.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCategoriesStore } from '../../src/lib/storage/domains/categories.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createCategoriesStore', () => {
  let deps, categories;

  beforeEach(() => {
    deps = createTestDeps();
    categories = createCategoriesStore(deps);
  });

  it('getPalette returns empty object when no settings exist', async () => {
    const palette = await categories.getPalette();
    expect(palette).toEqual({});
  });

  it('setColor stores color in localStorage and Firestore', async () => {
    await categories.setColor('work', '#ff0000');
    const palette = await categories.getPalette();
    expect(palette.work?.color).toBe('#ff0000');
  });

  it('setVisibility updates visibility flag', async () => {
    await categories.setVisibility('work', false);
    const palette = await categories.getPalette();
    expect(palette.work?.visible).toBe(false);
  });

  it('circuit breaker disables Firestore after permission-denied', async () => {
    // Make Firestore throw permission-denied on setDoc
    const origSetDoc = deps.firestore.setDoc.bind(deps.firestore);
    deps.firestore.setDoc = vi.fn().mockRejectedValue({ code: 'permission-denied' });
    // Should not throw — falls back to localStorage
    await categories.setColor('work', '#ff0000');
    // Subsequent calls should skip Firestore entirely
    deps.firestore.setDoc = vi.fn().mockResolvedValue(undefined);
    await categories.setColor('personal', '#00ff00');
    expect(deps.firestore.setDoc).not.toHaveBeenCalled();
  });

  it('trackUsage records timestamp in localStorage', () => {
    categories.trackUsage('work');
    const raw = deps.localStorage.getItem('category_usage_v1');
    const usage = JSON.parse(raw);
    expect(typeof usage.work).toBe('number');
  });

  it('getByRecentUsage sorts by most recent first', () => {
    deps.localStorage.setItem('category_usage_v1', JSON.stringify({
      work: 100,
      personal: 200,
      school: 50,
    }));
    const sorted = categories.getByRecentUsage(['work', 'personal', 'school']);
    expect(sorted[0]).toBe('personal');
    expect(sorted[2]).toBe('school');
  });

  it('subscribe calls back with palette on snapshot', async () => {
    deps.firestore._seed('categorySettings', 'work', { name: 'work', color: '#ff0000', userId: 'test-user' });
    const callback = vi.fn();
    categories.subscribe(callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
    const palette = callback.mock.calls[0][0];
    expect(palette.work?.color).toBe('#ff0000');
  });

  it('cleanupUnused removes setting and emits event', async () => {
    deps.firestore._seed('categorySettings', 'orphan', { name: 'orphan', userId: 'test-user' });
    await categories.cleanupUnused(['orphan']);
    expect(deps.emitEvent).toHaveBeenCalledWith('categoryDeleted', expect.objectContaining({ category: 'orphan' }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/storage/categories.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement categories.js**

Create `src/lib/storage/domains/categories.js`. Port from `storage.js:515-946,1173-1199,1307-1331,1628-1664`.

Key implementation notes:
- `normalizePaletteSettings` (storage.js:515-536) — validates hex colors, defaults `visible: true`
- `categoryDocId` (storage.js:572) — `encodeURIComponent(name.trim().toLowerCase())`
- Circuit breaker: `firestoreAllowed` flag, disabled on `isPermissionDenied`
- `renameCategory` (storage.js:835-946) — needs `getIdeasForRename` callback (wired in `createStorage`), uses `writeBatch` with 500-op chunks
- `subscribeToCategorySettings` (storage.js:1628-1664) — snapshot-only, no cached-first
- Import `HEX_COLOR_PATTERN` from `../../utils.js`
- Import `normalizeCategories` from `../../utils.js` (used in rename)
- `trackUsage`/`getByRecentUsage` — pure localStorage, key `category_usage_v1`

- [ ] **Step 4: Run categories tests**

```bash
npx vitest run tests/storage/categories.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/domains/categories.js tests/storage/categories.test.js
git commit -m "feat(storage): add categories domain store with palette, rename, circuit breaker"
```

---

## Task 7: Page notes + note folders stores — `domains/page-notes.js`, `domains/note-folders.js`

**Files:**
- Create: `src/lib/storage/domains/page-notes.js`
- Create: `src/lib/storage/domains/note-folders.js`
- Create: `tests/storage/page-notes.test.js`
- Create: `tests/storage/note-folders.test.js`
- Reference: `src/lib/storage.js:1670-1867`

- [ ] **Step 1: Write failing tests for page-notes**

Create `tests/storage/page-notes.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageNotesStore } from '../../src/lib/storage/domains/page-notes.js';
import { createMutationQueue } from '../../src/lib/storage/mutation-queue.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createPageNotesStore', () => {
  let deps, queue, pageNotes;

  beforeEach(() => {
    deps = createTestDeps();
    queue = createMutationQueue(deps);
    pageNotes = createPageNotesStore(deps, queue);
  });

  it('save creates a page note with defaults', async () => {
    const result = await pageNotes.save({ title: 'Test Note', content: 'Body' });
    expect(result.id).toBeTruthy();
    expect(result.userId).toBe('test-user');
    expect(result.folderId).toBeNull();
  });

  it('subscribe emits cached data first', () => {
    deps.localStorage.setItem('notes_v1_cache', JSON.stringify([
      { id: 'n1', title: 'cached', userId: 'test-user', createdAt: 100, updatedAt: 200 }
    ]));
    const callback = vi.fn();
    pageNotes.subscribe(callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0][0].id).toBe('n1');
  });

  it('delete removes note via mutation queue', async () => {
    deps.firestore._seed('notes', 'n1', { title: 'note', userId: 'test-user' });
    pageNotes._setCache([{ id: 'n1', title: 'note', userId: 'test-user' }]);
    await pageNotes.delete('n1');
    expect(pageNotes.getCached().find(n => n.id === 'n1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write failing tests for note-folders**

Create `tests/storage/note-folders.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNoteFoldersStore } from '../../src/lib/storage/domains/note-folders.js';
import { createPageNotesStore } from '../../src/lib/storage/domains/page-notes.js';
import { createMutationQueue } from '../../src/lib/storage/mutation-queue.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createNoteFoldersStore', () => {
  let deps, queue, pageNotes, noteFolders;

  beforeEach(() => {
    deps = createTestDeps();
    queue = createMutationQueue(deps);
    pageNotes = createPageNotesStore(deps, queue);
    noteFolders = createNoteFoldersStore(deps, queue, pageNotes);
  });

  it('save creates folder with defaults', async () => {
    const result = await noteFolders.save({ name: 'My Folder' });
    expect(result.name).toBe('My Folder');
    expect(result.sortOrder).toBe(0);
  });

  it('subscribe emits cached data first', () => {
    deps.localStorage.setItem('note_folders_v1', JSON.stringify([
      { id: 'f1', name: 'Folder', userId: 'test-user', createdAt: 100, updatedAt: 200, sortOrder: 0 }
    ]));
    const callback = vi.fn();
    noteFolders.subscribe(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('delete moves notes in folder to root before deleting folder', async () => {
    // Set up a folder and a note in it
    deps.firestore._seed('noteFolders', 'f1', { name: 'Folder', userId: 'test-user' });
    deps.firestore._seed('notes', 'n1', { title: 'note in folder', folderId: 'f1', userId: 'test-user' });
    noteFolders._setCache([{ id: 'f1', name: 'Folder', userId: 'test-user' }]);
    pageNotes._setCache([{ id: 'n1', title: 'note in folder', folderId: 'f1', userId: 'test-user' }]);

    const saveSpy = vi.spyOn(pageNotes, 'save');
    await noteFolders.delete('f1');

    // Should have called pageNotes.save to move note to root
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1', folderId: null }));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/storage/page-notes.test.js tests/storage/note-folders.test.js
```

Expected: FAIL.

- [ ] **Step 4: Implement page-notes.js**

Create `src/lib/storage/domains/page-notes.js`. Uses `createDomainStore` with `emitCachedOnSubscribe: true`. Normalizer converts Firestore Timestamps to millis. Sort: `(a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)`. Registers `savePageNote` and `deletePageNote` executors with mutation queue.

Key references from storage.js:
- `savePageNote` (storage.js:1713-1745) — generates ID via `doc(notesCollection).id`, defaults fields
- `deletePageNote` (storage.js:1747-1765) — via mutation queue
- `subscribeToPageNotes` (storage.js:1670-1711) — cached-first, then onSnapshot

- [ ] **Step 5: Implement note-folders.js**

Create `src/lib/storage/domains/note-folders.js`. Uses `createDomainStore` with `emitCachedOnSubscribe: true`. Sort: `(a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)`. Overrides `delete` to cascade: moves notes in deleted folder to `folderId: null` via `pageNotesStore.save()` before deleting folder.

Key references:
- `saveNoteFolder` (storage.js:1810-1841) — defaults name, sortOrder
- `deleteNoteFolder` (storage.js:1843-1867) — cascade to pageNotes
- `subscribeToNoteFolders` (storage.js:1767-1808) — cached-first

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/storage/page-notes.test.js tests/storage/note-folders.test.js
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/domains/page-notes.js src/lib/storage/domains/note-folders.js tests/storage/page-notes.test.js tests/storage/note-folders.test.js
git commit -m "feat(storage): add page-notes and note-folders domain stores"
```

---

## Task 8: Canvas store — `domains/canvas.js`

**Files:**
- Create: `src/lib/storage/domains/canvas.js`
- Create: `tests/storage/canvas.test.js`
- Reference: `src/lib/storage.js:1501-1618`

- [ ] **Step 1: Write failing tests**

Create `tests/storage/canvas.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCanvasStore } from '../../src/lib/storage/domains/canvas.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createCanvasStore', () => {
  let deps, canvas;

  beforeEach(() => {
    deps = createTestDeps();
    canvas = createCanvasStore(deps);
  });

  it('load returns default layout when no data exists', async () => {
    const layout = await canvas.load();
    expect(layout.cards).toEqual([]);
    expect(layout.headers).toEqual([]);
    expect(layout.viewport).toEqual({ panX: 0, panY: 0, zoom: 1.0 });
  });

  it('load returns Firestore data when it exists', async () => {
    deps.firestore._seed('canvasLayouts', 'test-user', {
      cards: [{ categoryName: 'work', x: 10, y: 20, width: 100, bodyHeight: 50 }],
      headers: [],
      viewport: { panX: 5, panY: 10, zoom: 1.5 },
    });
    const layout = await canvas.load();
    expect(layout.cards[0].categoryName).toBe('work');
    expect(layout.viewport.zoom).toBe(1.5);
  });

  it('save writes to localStorage immediately and debounces Firestore', async () => {
    const layout = {
      cards: [{ categoryName: 'work', x: 0, y: 0, width: 100, bodyHeight: 50 }],
      headers: [],
      viewport: { panX: 0, panY: 0, zoom: 1 },
    };
    canvas.save(layout);
    // localStorage should be written immediately
    const stored = JSON.parse(deps.localStorage.getItem('canvas_layout_v1'));
    expect(stored.cards[0].categoryName).toBe('work');
  });

  it('subscribe calls back when Firestore doc changes', async () => {
    deps.firestore._seed('canvasLayouts', 'test-user', {
      cards: [], headers: [], viewport: { panX: 0, panY: 0, zoom: 1 },
    });
    const callback = vi.fn();
    canvas.subscribe(callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
  });

  it('normalizes viewport zoom to valid range', async () => {
    deps.firestore._seed('canvasLayouts', 'test-user', {
      cards: [], headers: [], viewport: { panX: 0, panY: 0, zoom: 999 },
    });
    const layout = await canvas.load();
    expect(layout.viewport.zoom).toBeLessThanOrEqual(3.0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/storage/canvas.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement canvas.js**

Create `src/lib/storage/domains/canvas.js`. Bespoke store — single-doc pattern with debounced save. Port `normalizeCanvasLayout` from `storage.js:1513-1540`, `loadCanvasLayout` from `storage.js:1560-1580`, `saveCanvasLayout` from `storage.js:1582-1598`, `subscribeToCanvasLayout` from `storage.js:1600-1618`.

Key notes:
- Save debounce: 1500ms (`CANVAS_SAVE_DEBOUNCE_MS`)
- Doc path: `canvasLayouts/{userId}`
- `normalizeCanvasLayout` uses `generateLocalId('hdr')` for headers without IDs
- localStorage key: `canvas_layout_v1`

- [ ] **Step 4: Run canvas tests**

```bash
npx vitest run tests/storage/canvas.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/domains/canvas.js tests/storage/canvas.test.js
git commit -m "feat(storage): add canvas domain store with debounced save"
```

---

## Task 9: Thread notes store — `domains/thread-notes.js`

**Files:**
- Create: `src/lib/storage/domains/thread-notes.js`
- Create: `tests/storage/thread-notes.test.js`
- Reference: `src/lib/storage.js:1335-1498`

- [ ] **Step 1: Write failing tests**

Create `tests/storage/thread-notes.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createThreadNotesStore } from '../../src/lib/storage/domains/thread-notes.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createThreadNotesStore', () => {
  let deps, threadNotes;

  beforeEach(() => {
    deps = createTestDeps();
    threadNotes = createThreadNotesStore(deps);
  });

  it('add creates note with optimistic update and real Firestore ID', async () => {
    const result = await threadNotes.add('idea-1', 'My note text');
    expect(result.id).toBeTruthy();
    expect(result.text).toBe('My note text');
  });

  it('add reverts optimistic update on Firestore failure', async () => {
    deps.firestore.addDoc = vi.fn().mockRejectedValue(new Error('write failed'));
    await expect(threadNotes.add('idea-1', 'fail text')).rejects.toThrow('write failed');
    expect(threadNotes.getCached('idea-1')).toEqual([]);
  });

  it('delete removes note optimistically and reverts on failure', async () => {
    // Seed a note
    deps.firestore._seed('ideas/idea-1/comments', 'note-1', { text: 'hi', userId: 'test-user', createdAt: 100 });
    threadNotes._seedCache('idea-1', [{ id: 'note-1', text: 'hi', userId: 'test-user', createdAt: 100 }]);
    await threadNotes.delete('idea-1', 'note-1');
    expect(threadNotes.getCached('idea-1')).toEqual([]);
  });

  it('subscribe emits cached notes first', () => {
    threadNotes._seedCache('idea-1', [{ id: 'n1', text: 'cached', userId: 'test-user', createdAt: 100 }]);
    const callback = vi.fn();
    threadNotes.subscribe('idea-1', callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0][0].text).toBe('cached');
  });

  it('subscribe with no ideaId returns no-op', () => {
    const unsub = threadNotes.subscribe(null, vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('getCount returns number of cached notes', () => {
    threadNotes._seedCache('idea-1', [
      { id: 'n1', text: 'a' },
      { id: 'n2', text: 'b' },
    ]);
    expect(threadNotes.getCount('idea-1')).toBe(2);
  });

  it('update changes note text optimistically', async () => {
    deps.firestore._seed('ideas/idea-1/comments', 'n1', { text: 'old', userId: 'test-user' });
    threadNotes._seedCache('idea-1', [{ id: 'n1', text: 'old', userId: 'test-user' }]);
    await threadNotes.update('idea-1', 'n1', 'new text');
    expect(threadNotes.getCached('idea-1')[0].text).toBe('new text');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/storage/thread-notes.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement thread-notes.js**

Create `src/lib/storage/domains/thread-notes.js`. Bespoke store — subcollection pattern. Port from `storage.js:1335-1498`.

Key notes:
- Collection path: `ideas/{ideaId}/comments`
- Per-ideaId localStorage cache via `notes_v1_cache` (JSON object keyed by ideaId)
- Optimistic add + revert on failure (storage.js:1372-1412)
- Optimistic delete + revert on failure (storage.js:1458-1475)
- Optimistic update + revert on failure (storage.js:1477-1498)
- `subscribe(ideaId, cb, onError?)` — cached-first, then `onSnapshot` with `orderBy('createdAt', 'asc')`
- Uses `addDoc` (not `setDoc`) for new notes
- Uses `generateLocalId('note')` for optimistic IDs
- Does NOT use mutation queue

- [ ] **Step 4: Run thread-notes tests**

```bash
npx vitest run tests/storage/thread-notes.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/domains/thread-notes.js tests/storage/thread-notes.test.js
git commit -m "feat(storage): add thread-notes domain store with optimistic updates"
```

---

## Task 10: Factory + production wiring — `create-storage.js`, `index.js`

**Files:**
- Create: `src/lib/storage/create-storage.js`
- Create: `src/lib/storage/index.js`
- Update: `tests/helpers/create-test-storage.js`

- [ ] **Step 1: Implement create-storage.js**

Create `src/lib/storage/create-storage.js`:

```js
import { createMutationQueue } from './mutation-queue.js';
import { createIdeasStore } from './domains/ideas.js';
import { createCategoriesStore } from './domains/categories.js';
import { createPageNotesStore } from './domains/page-notes.js';
import { createNoteFoldersStore } from './domains/note-folders.js';
import { createCanvasStore } from './domains/canvas.js';
import { createThreadNotesStore } from './domains/thread-notes.js';

export function createStorage(deps) {
  const mutationQueue = createMutationQueue(deps);

  const ideas = createIdeasStore(deps, mutationQueue);
  const categories = createCategoriesStore(deps);
  const pageNotes = createPageNotesStore(deps, mutationQueue);
  const noteFolders = createNoteFoldersStore(deps, mutationQueue, pageNotes);
  const canvas = createCanvasStore(deps);
  const threadNotes = createThreadNotesStore(deps);

  // Cross-store wiring
  ideas.onCategoriesOrphaned = (cats) => categories.cleanupUnused(cats);
  categories.getIdeasForRename = () => ideas.getCached();

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

- [ ] **Step 2: Implement index.js (production wiring)**

Create `src/lib/storage/index.js`:

```js
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  onSnapshot,
  deleteField,
  addDoc,
  orderBy,
  limit,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence,
  Timestamp,
} from 'firebase/firestore';
import { app } from '../firebase.js';
import { getCurrentUserId } from '../auth.js';
import { perfMonitor } from '../performance.js';
import { createStorage } from './create-storage.js';

const db = getFirestore(app);

// Persistence setup — full fallback chain
try {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('[Firestore] Multi-tab persistence unavailable, trying single-tab');
      enableIndexedDbPersistence(db).catch((innerErr) => {
        if (innerErr.code === 'unimplemented') {
          console.warn('[Firestore] Persistence not available in this browser');
        } else {
          console.error('[Firestore] Error enabling persistence:', innerErr);
        }
      });
    } else if (err.code === 'unimplemented') {
      console.warn('[Firestore] Persistence not available in this browser');
    } else {
      console.error('[Firestore] Error enabling multi-tab persistence:', err);
    }
  });
} catch (err) {
  console.error('[Firestore] Persistence setup error:', err);
}

// Wrap Firestore SDK into the interface expected by domain stores
const firestoreAdapter = {
  collection: (name) => collection(db, name),
  doc: (collRef, id) => {
    if (typeof collRef === 'string') return doc(db, collRef, id);
    return id ? doc(collRef, id) : doc(collRef);
  },
  getDoc: (docRef) => getDoc(docRef),
  getDocs: (q) => getDocs(q),
  setDoc: (docRef, data, opts) => setDoc(docRef, data, opts),
  updateDoc: (docRef, data) => updateDoc(docRef, data),
  deleteDoc: (docRef) => deleteDoc(docRef),
  addDoc: (collRef, data) => addDoc(collRef, data),
  writeBatch: () => writeBatch(db),
  query: (collRef, ...constraints) => query(collRef, ...constraints),
  where: (field, op, value) => where(field, op, value),
  orderBy: (field, dir) => orderBy(field, dir),
  limit: (n) => limit(n),
  onSnapshot: (ref, cb, errCb) => onSnapshot(ref, cb, errCb),
  deleteField: () => deleteField(),
  Timestamp,
};

export const storage = createStorage({
  firestore: firestoreAdapter,
  auth: { getCurrentUserId },
  localStorage: window.localStorage,
  isOffline: () => navigator.onLine === false,
  perfMonitor,
  emitEvent: (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail })),
});

// Side effects that were previously at module scope in storage.js
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    storage.mutations.flush().catch(err =>
      console.warn('Unable to flush pending mutations on reconnect', err)
    );
  });
  setTimeout(() => {
    storage.mutations.flush().catch(err =>
      console.warn('Initial mutation flush failed', err)
    );
  }, 1000);
}
```

- [ ] **Step 3: Update test helper to use createStorage**

Update `tests/helpers/create-test-storage.js`:

```js
import { FakeFirestore } from './fake-firestore.js';
import { FakeLocalStorage } from './fake-local-storage.js';
import { vi } from 'vitest';

export function createTestDeps(overrides = {}) {
  return {
    firestore: new FakeFirestore(),
    auth: { getCurrentUserId: async () => 'test-user' },
    localStorage: new FakeLocalStorage(),
    isOffline: () => false,
    perfMonitor: {
      trackWrite: vi.fn(),
      trackRead: vi.fn(),
      trackCacheHit: vi.fn(),
      trackCacheMiss: vi.fn(),
      startTimer: vi.fn(),
      endTimer: vi.fn(),
    },
    emitEvent: vi.fn(),
    ...overrides,
  };
}

export { createStorage } from '../../src/lib/storage/create-storage.js';
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/create-storage.js src/lib/storage/index.js tests/helpers/create-test-storage.js
git commit -m "feat(storage): add createStorage factory and production wiring"
```

---

## Task 11: Compat shim — `compat.js`

**Files:**
- Create: `src/lib/storage/compat.js`
- Create: `tests/storage/compat.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/storage/compat.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';

// We test that the compat module re-exports the right shape.
// Since it imports from ./index.js which needs real Firebase,
// we test the mapping logic by importing the function map directly.
import { COMPAT_MAP } from '../../src/lib/storage/compat.js';

describe('compat shim', () => {
  it('maps all 40+ original exports', () => {
    const expectedExports = [
      'saveIdea', 'getIdeas', 'subscribeToIdeas', 'setIdeaArchived', 'setIdeaHidden',
      'setIdeaPinned', 'setIdeaCategories', 'deleteIdea', 'updateIdeaText', 'updateIdeaPriority',
      'getCategories',
      'getCategoryPalette', 'setCategoryColor', 'setCategoryVisibility', 'renameCategory',
      'subscribeToCategorySettings',
      'trackCategoryUsage', 'getCategoriesByRecentUsage',
      'subscribeToPageNotes', 'savePageNote', 'deletePageNote',
      'subscribeToNoteFolders', 'saveNoteFolder', 'deleteNoteFolder',
      'loadCanvasLayout', 'saveCanvasLayout', 'subscribeToCanvasLayout',
      'subscribeToNotes', 'addNote', 'deleteNote', 'updateNoteText',
      'getNotesFromLocal', 'getNoteCount',
      'addComment', 'subscribeToComments',
      'getPendingMutationCount', 'flushPendingMutations',
    ];
    for (const name of expectedExports) {
      expect(COMPAT_MAP).toHaveProperty(name);
      expect(typeof COMPAT_MAP[name]).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/storage/compat.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement compat.js**

Create `src/lib/storage/compat.js`. This maps every old export name to the corresponding method on the new storage object. Export both individually (for existing callers) and as `COMPAT_MAP` (for testing).

Key mappings:
- `saveIdea` → `storage.ideas.save`
- `getIdeas` → `storage.ideas.getAll`
- `subscribeToIdeas` → `storage.ideas.subscribe`
- `setIdeaArchived` → `storage.ideas.setArchived`
- `setIdeaHidden` → `storage.ideas.setHidden`
- `setIdeaPinned` → `storage.ideas.setPinned`
- `setIdeaCategories` → `storage.ideas.setCategories`
- `deleteIdea` → `storage.ideas.delete`
- `updateIdeaText` → `storage.ideas.updateText`
- `updateIdeaPriority` → `storage.ideas.updatePriority`
- `getCategories` → `storage.ideas.getUniqueCategories`
- `getCategoryPalette` → `storage.categories.getPalette`
- `setCategoryColor` → `storage.categories.setColor`
- `setCategoryVisibility` → `storage.categories.setVisibility`
- `renameCategory` → `storage.categories.rename`
- `subscribeToCategorySettings` → `storage.categories.subscribe`
- `trackCategoryUsage` → `storage.categories.trackUsage`
- `getCategoriesByRecentUsage` → `storage.categories.getByRecentUsage`
- `subscribeToPageNotes` → `storage.pageNotes.subscribe`
- `savePageNote` → `storage.pageNotes.save`
- `deletePageNote` → `storage.pageNotes.delete`
- `subscribeToNoteFolders` → `storage.noteFolders.subscribe`
- `saveNoteFolder` → `storage.noteFolders.save`
- `deleteNoteFolder` → `storage.noteFolders.delete`
- `loadCanvasLayout` → `storage.canvas.load`
- `saveCanvasLayout` → `storage.canvas.save`
- `subscribeToCanvasLayout` → `storage.canvas.subscribe`
- `subscribeToNotes` → `storage.threadNotes.subscribe`
- `addNote` → `storage.threadNotes.add`
- `deleteNote` → `storage.threadNotes.delete`
- `updateNoteText` → `storage.threadNotes.update`
- `getNotesFromLocal` → `storage.threadNotes.getCached`
- `getNoteCount` → `storage.threadNotes.getCount`
- `addComment` → `storage.threadNotes.add` (alias)
- `subscribeToComments` → `storage.threadNotes.subscribe` (alias)
- `getPendingMutationCount` → `storage.mutations.getPendingCount`
- `flushPendingMutations` → `storage.mutations.flush`

- [ ] **Step 4: Run compat tests**

```bash
npx vitest run tests/storage/compat.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/compat.js tests/storage/compat.test.js
git commit -m "feat(storage): add compat shim mapping old flat API to new domain stores"
```

---

## Task 12: Swap old storage.js to re-export from compat

**Files:**
- Modify: `src/lib/storage.js`

- [ ] **Step 1: Replace storage.js contents**

Replace the entire 1867-line `src/lib/storage.js` with re-exports from the compat shim:

```js
// This file is a bridge during migration.
// All exports delegate to the new domain-scoped storage layer via the compat shim.
// Once all consumers import from 'src/lib/storage/index.js' directly, delete this file.
export {
  saveIdea,
  getIdeas,
  subscribeToIdeas,
  setIdeaArchived,
  setIdeaHidden,
  setIdeaPinned,
  setIdeaCategories,
  deleteIdea,
  updateIdeaText,
  updateIdeaPriority,
  getCategories,
  getCategoryPalette,
  setCategoryColor,
  setCategoryVisibility,
  renameCategory,
  subscribeToCategorySettings,
  trackCategoryUsage,
  getCategoriesByRecentUsage,
  subscribeToPageNotes,
  savePageNote,
  deletePageNote,
  subscribeToNoteFolders,
  saveNoteFolder,
  deleteNoteFolder,
  loadCanvasLayout,
  saveCanvasLayout,
  subscribeToCanvasLayout,
  subscribeToNotes,
  addNote,
  deleteNote,
  updateNoteText,
  getNotesFromLocal,
  getNoteCount,
  addComment,
  subscribeToComments,
  getPendingMutationCount,
  flushPendingMutations,
} from './storage/compat.js';
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Open `localhost:5173` and verify:
- Ideas load on the capture page
- Can create/archive/delete an idea
- Canvas loads and saves
- Notes page works (create/delete note, create/delete folder)
- Categories page shows palette

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage.js
git commit -m "refactor(storage): swap storage.js to re-export from compat shim"
```

---

## Task 13: Migrate consumers (8 files)

**Files:**
- Modify: `src/js/category-dropdown.js`
- Modify: `src/js/thread-notes.js`
- Modify: `src/js/canvas-cards.js`
- Modify: `src/js/canvas.js`
- Modify: `src/js/notes.js`
- Modify: `src/js/categories.js`
- Modify: `src/js/review.js`
- Modify: `src/js/index.js`

Migrate one file at a time, test after each. Each sub-step follows the same pattern: replace `import { ... } from '../lib/storage.js'` with `import { storage } from '../lib/storage/index.js'` and destructure the needed stores.

- [ ] **Step 1: Migrate category-dropdown.js**

```js
// BEFORE:
import { setIdeaCategories } from '../lib/storage.js';

// AFTER:
import { storage } from '../lib/storage/index.js';
const { ideas } = storage;
// Then replace: setIdeaCategories(id, cats) → ideas.setCategories(id, cats)
```

Smoke test: open capture page, verify category dropdown works.

- [ ] **Step 2: Migrate thread-notes.js**

```js
// BEFORE:
import { subscribeToNotes, addNote, getNoteCount, getNotesFromLocal, deleteNote, updateNoteText } from '../lib/storage.js';

// AFTER:
import { storage } from '../lib/storage/index.js';
const { threadNotes } = storage;
// Replace: subscribeToNotes → threadNotes.subscribe
// Replace: addNote → threadNotes.add
// Replace: getNoteCount → threadNotes.getCount
// Replace: getNotesFromLocal → threadNotes.getCached
// Replace: deleteNote → threadNotes.delete
// Replace: updateNoteText → threadNotes.update
```

- [ ] **Step 3: Migrate canvas-cards.js**

```js
// BEFORE:
import { setIdeaArchived, setIdeaPinned, deleteIdea, updateIdeaText, updateIdeaPriority, saveIdea } from '../lib/storage.js';

// AFTER:
import { storage } from '../lib/storage/index.js';
const { ideas } = storage;
// Replace: setIdeaArchived → ideas.setArchived
// Replace: setIdeaPinned → ideas.setPinned
// Replace: deleteIdea → ideas.delete
// Replace: updateIdeaText → ideas.updateText
// Replace: updateIdeaPriority → ideas.updatePriority
// Replace: saveIdea → ideas.save
```

- [ ] **Step 4: Migrate canvas.js**

```js
// BEFORE:
import { getCategoryPalette, subscribeToIdeas, loadCanvasLayout, saveCanvasLayout, subscribeToCanvasLayout, subscribeToCategorySettings } from '../lib/storage.js';

// AFTER:
import { storage } from '../lib/storage/index.js';
const { ideas, categories, canvas } = storage;
// Replace: getCategoryPalette → categories.getPalette
// Replace: subscribeToIdeas → ideas.subscribe
// Replace: loadCanvasLayout → canvas.load
// Replace: saveCanvasLayout → canvas.save
// Replace: subscribeToCanvasLayout → canvas.subscribe
// Replace: subscribeToCategorySettings → categories.subscribe
```

- [ ] **Step 5: Migrate notes.js**

```js
// BEFORE:
import { subscribeToPageNotes, savePageNote, deletePageNote, subscribeToNoteFolders, saveNoteFolder, deleteNoteFolder } from '../lib/storage.js';

// AFTER:
import { storage } from '../lib/storage/index.js';
const { pageNotes, noteFolders } = storage;
// Replace: subscribeToPageNotes → pageNotes.subscribe
// Replace: savePageNote → pageNotes.save
// Replace: deletePageNote → pageNotes.delete
// Replace: subscribeToNoteFolders → noteFolders.subscribe
// Replace: saveNoteFolder → noteFolders.save
// Replace: deleteNoteFolder → noteFolders.delete
```

- [ ] **Step 6: Migrate categories.js**

```js
// BEFORE:
import { getIdeas, getCategoryPalette, renameCategory, setCategoryColor, setCategoryVisibility, subscribeToIdeas } from '../lib/storage.js';

// AFTER:
import { storage } from '../lib/storage/index.js';
const { ideas, categories } = storage;
// Replace: getIdeas → ideas.getAll
// Replace: getCategoryPalette → categories.getPalette
// Replace: renameCategory → categories.rename
// Replace: setCategoryColor → categories.setColor
// Replace: setCategoryVisibility → categories.setVisibility
// Replace: subscribeToIdeas → ideas.subscribe
```

- [ ] **Step 7: Migrate review.js**

```js
// BEFORE:
import { getIdeas, subscribeToIdeas, deleteIdea, getCategories, setIdeaCategories, getCategoryPalette, setIdeaArchived, setIdeaPinned, updateIdeaText, updateIdeaPriority, subscribeToCategorySettings } from '../lib/storage.js';

// AFTER:
import { storage } from '../lib/storage/index.js';
const { ideas, categories } = storage;
// Replace all named imports with ideas.* and categories.* calls
```

- [ ] **Step 8: Migrate index.js**

```js
// BEFORE:
import { saveIdea, getCategories, subscribeToIdeas, setIdeaArchived, setIdeaHidden, getCategoryPalette, setIdeaPinned, trackCategoryUsage, getCategoriesByRecentUsage, updateIdeaPriority, deleteIdea, updateIdeaText, subscribeToCategorySettings } from '../lib/storage.js';

// AFTER:
import { storage } from '../lib/storage/index.js';
const { ideas, categories } = storage;
// Replace all named imports
```

- [ ] **Step 9: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 10: Full smoke test**

```bash
npm run dev
```

Test all 6 pages: capture, review, categories, canvas, notes, signin. Verify all CRUD operations work.

- [ ] **Step 11: Commit**

```bash
git add src/js/category-dropdown.js src/js/thread-notes.js src/js/canvas-cards.js src/js/canvas.js src/js/notes.js src/js/categories.js src/js/review.js src/js/index.js
git commit -m "refactor(storage): migrate all 8 consumers to new domain-scoped storage API"
```

---

## Task 14: Cleanup — delete compat shim and old storage.js

**Files:**
- Delete: `src/lib/storage/compat.js`
- Delete: `src/lib/storage.js`
- Delete: `tests/storage/compat.test.js`
- Delete: `tests/storage/smoke.test.js`

- [ ] **Step 1: Verify no remaining imports from old paths**

```bash
grep -r "from.*lib/storage\.js" src/ --include="*.js"
grep -r "from.*storage/compat" src/ --include="*.js"
```

Expected: No matches.

- [ ] **Step 2: Delete old files**

```bash
rm src/lib/storage.js
rm src/lib/storage/compat.js
rm tests/storage/compat.test.js
rm tests/storage/smoke.test.js
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All remaining tests pass.

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Quick check: capture page, create idea, archive it, canvas loads.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(storage): remove compat shim and old storage.js — migration complete"
```

---

## Task 15: Build and final verification

- [ ] **Step 1: Production build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Preview production build**

```bash
npm run preview
```

Test capture page, review page, canvas page.

- [ ] **Step 3: Run full test suite one final time**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit build artifacts if needed**

```bash
git add dist/
git commit -m "chore: rebuild dist after storage refactor"
```
