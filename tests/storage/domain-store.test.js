import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDomainStore } from '../../src/lib/storage/domain-store.js';
import { FakeFirestore } from '../helpers/fake-firestore.js';
import { FakeLocalStorage } from '../helpers/fake-local-storage.js';

function makeDeps(overrides = {}) {
  const firestore = new FakeFirestore();
  const localStorage = new FakeLocalStorage();
  return {
    firestore, localStorage,
    auth: { getCurrentUserId: async () => 'user-1' },
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
      collectionName: 'items', localCacheKey: 'items_cache',
      localTimestampKey: 'items_cache_ts', cacheTTL: 5000,
      normalize, serialize,
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
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
    const items = callback.mock.calls[0][0];
    expect(items[0].id).toBe('item-1');
    expect(items[0].text).toBe('hello');
  });

  it('subscribe with no user returns no-op unsubscribe', async () => {
    deps.auth.getCurrentUserId = async () => null;
    store = createDomainStore({
      collectionName: 'items', localCacheKey: 'items_cache',
      localTimestampKey: 'items_cache_ts', cacheTTL: 5000,
      normalize, serialize,
    }, deps);
    const callback = vi.fn();
    const unsub = store.subscribe(callback);
    await new Promise(r => setTimeout(r, 10));
    expect(callback).not.toHaveBeenCalled();
    expect(typeof unsub).toBe('function');
  });

  it('emitCachedOnSubscribe fires cached data before listener', async () => {
    deps.localStorage.setItem('items_cache', JSON.stringify([{ id: 'c1', text: 'cached', userId: 'user-1' }]));
    store = createDomainStore({
      collectionName: 'items', localCacheKey: 'items_cache',
      localTimestampKey: 'items_cache_ts', cacheTTL: 5000,
      normalize, serialize, emitCachedOnSubscribe: true,
    }, deps);
    const callback = vi.fn();
    store.subscribe(callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0][0].id).toBe('c1');
  });

  it('getAll returns cached data when valid', async () => {
    store._setCache([{ id: 'i1', text: 'a', userId: 'user-1' }]);
    // Make cache valid by writing timestamp
    deps.localStorage.setItem('items_cache_ts', Date.now().toString());
    const result = await store.getAll();
    expect(result).toEqual([{ id: 'i1', text: 'a', userId: 'user-1' }]);
    expect(deps.perfMonitor.trackCacheHit).toHaveBeenCalledWith('items');
  });

  it('getAll fetches from Firestore when no cache', async () => {
    deps.firestore._seed('items', 'i1', { text: 'fresh', userId: 'user-1' });
    const result = await store.getAll();
    expect(result[0].text).toBe('fresh');
    expect(deps.perfMonitor.trackCacheMiss).toHaveBeenCalledWith('items');
  });

  it('getAll returns stale cache and refreshes in background', async () => {
    store._setCache([{ id: 'i1', text: 'stale', userId: 'user-1' }]);
    // Set an expired timestamp
    deps.localStorage.setItem('items_cache_ts', (Date.now() - 10000).toString());
    deps.firestore._seed('items', 'i1', { text: 'fresh', userId: 'user-1' });
    const result = await store.getAll();
    expect(result[0].text).toBe('stale');
    expect(deps.perfMonitor.trackCacheHit).toHaveBeenCalledWith('items-stale');
  });
});
