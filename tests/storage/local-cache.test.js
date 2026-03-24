import { describe, it, expect, beforeEach } from 'vitest';
import { createLocalCache } from '../../src/lib/storage/local-cache.js';
import { FakeLocalStorage } from '../helpers/fake-local-storage.js';

describe('createLocalCache', () => {
  let ls, cache;

  beforeEach(() => {
    ls = new FakeLocalStorage();
    cache = createLocalCache({ key: 'test_cache', timestampKey: 'test_cache_ts', ttl: 5000, localStorage: ls });
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
      key: 'db_cache', timestampKey: 'db_cache_ts', ttl: 5000, localStorage: ls, writeDebounce: 50,
    });
    debouncedCache.write([{ id: '1' }]);
    debouncedCache.write([{ id: '2' }]);
    debouncedCache.write([{ id: '3' }]);
    expect(ls.getItem('db_cache')).toBeNull();
    await new Promise(r => setTimeout(r, 100));
    expect(JSON.parse(ls.getItem('db_cache'))).toEqual([{ id: '3' }]);
  });
});
