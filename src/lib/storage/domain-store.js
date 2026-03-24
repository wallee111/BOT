import { createLocalCache } from './local-cache.js';

export function createDomainStore(config, deps) {
  const {
    collectionName, localCacheKey, localTimestampKey, cacheTTL,
    normalize, serialize, sortFn,
    emitCachedOnSubscribe = false, writeDebounce = 0,
  } = config;
  const { firestore, auth, localStorage, perfMonitor } = deps;

  const cache = createLocalCache({
    key: localCacheKey, timestampKey: localTimestampKey,
    ttl: cacheTTL, localStorage, writeDebounce,
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
      const q = firestore.query(collectionRef, firestore.where('userId', '==', userId));
      unsubscribe = firestore.onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => normalize(doc.data() || {}, doc.id));
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

  // Base save — domain stores that use mutation queue will override this
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
    subscribe, save, delete: deleteItem, update, getAll, getCached,
    updateCache, _setCache,
  };
}
