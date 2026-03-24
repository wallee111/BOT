import { createDomainStore } from '../domain-store.js';
import { normalizeCategories } from '../../utils.js';

const COLLECTION = 'ideas';
const CACHE_KEY = 'ideas_v1_cache';
const CACHE_TS_KEY = 'ideas_v1_cache_ts';
const CACHE_TTL = 5 * 60 * 1000;
const WRITE_DEBOUNCE = 150;

function normalizeIdeaObject(source = {}, fallbackId) {
  const data = source || {};
  const timestamp = data.createdAt ?? data.created_at;
  let createdAt = Date.now();
  if (typeof timestamp === 'number') {
    createdAt = timestamp;
  } else if (timestamp?.toMillis) {
    createdAt = timestamp.toMillis();
  }
  const primaryCategory = (data.category || '').trim();
  const categories = normalizeCategories([
    ...(Array.isArray(data.categories) ? data.categories : []),
    primaryCategory,
  ]);
  return {
    id: data.id || fallbackId,
    text: data.text ?? '',
    category: categories[0] || '',
    categories,
    tags: Array.isArray(data.tags) ? data.tags : [],
    priority: data.priority || '',
    createdAt,
    archived: Boolean(data.archived),
    hidden: Boolean(data.hidden),
    pinned: Boolean(data.pinned),
  };
}

export function createIdeasStore(deps, mutationQueue) {
  const { firestore, auth, perfMonitor } = deps;

  const store = createDomainStore({
    collectionName: COLLECTION,
    localCacheKey: CACHE_KEY,
    localTimestampKey: CACHE_TS_KEY,
    cacheTTL: CACHE_TTL,
    normalize: normalizeIdeaObject,
    serialize: (item) => item,
    sortFn: (a, b) => a.createdAt - b.createdAt,
    emitCachedOnSubscribe: true,
    writeDebounce: WRITE_DEBOUNCE,
  }, deps);

  const collectionRef = firestore.collection(COLLECTION);

  // --- Mutation executors ---

  mutationQueue.register('saveIdea', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    const firestorePayload = { ...payload };
    if (typeof firestorePayload.createdAt === 'number') {
      firestorePayload.createdAt = firestore.Timestamp.fromMillis(firestorePayload.createdAt);
    }
    await firestore.setDoc(docRef, firestorePayload);
    perfMonitor.trackWrite(1);
  });

  mutationQueue.register('setIdeaArchived', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    const update = { archived: payload.archived };
    if (payload.archived) update.pinned = false;
    await firestore.updateDoc(docRef, update);
    perfMonitor.trackWrite(1);
  });

  mutationQueue.register('setIdeaHidden', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    const update = { hidden: payload.hidden };
    if (payload.hidden) update.pinned = false;
    await firestore.updateDoc(docRef, update);
    perfMonitor.trackWrite(1);
  });

  mutationQueue.register('setIdeaPinned', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    await firestore.updateDoc(docRef, { pinned: payload.pinned });
    perfMonitor.trackWrite(1);
  });

  mutationQueue.register('setIdeaCategories', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    await firestore.updateDoc(docRef, {
      category: payload.category,
      categories: payload.categories,
    });
    perfMonitor.trackWrite(1);
  });

  mutationQueue.register('deleteIdea', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    await firestore.deleteDoc(docRef);
    perfMonitor.trackWrite(1);
  });

  mutationQueue.register('updateIdeaText', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    const update = { text: payload.text };
    if (payload.tags !== undefined) update.tags = payload.tags;
    await firestore.updateDoc(docRef, update);
    perfMonitor.trackWrite(1);
  });

  mutationQueue.register('updateIdeaPriority', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    await firestore.updateDoc(docRef, { priority: payload.priority });
    perfMonitor.trackWrite(1);
  });

  // --- Public API ---

  async function save(idea) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    const id = idea.id || firestore.doc(collectionRef).id;
    const normalized = normalizeIdeaObject({ ...idea, id, userId });
    const payload = {
      id: normalized.id,
      text: normalized.text,
      category: normalized.category,
      categories: normalized.categories,
      tags: normalized.tags,
      priority: normalized.priority,
      createdAt: normalized.createdAt,
      archived: normalized.archived,
      hidden: normalized.hidden,
      pinned: normalized.pinned,
      userId,
    };

    await mutationQueue.run({
      type: 'saveIdea',
      payload,
      userId,
      applyLocal: () => {
        store.updateCache((items) => {
          const idx = items.findIndex((i) => i.id === id);
          if (idx >= 0) {
            items[idx] = normalizeIdeaObject(payload, id);
          } else {
            items.push(normalizeIdeaObject(payload, id));
          }
          return items;
        });
      },
    });

    return true;
  }

  async function setArchived(id, archived) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    await mutationQueue.run({
      type: 'setIdeaArchived',
      payload: { id, archived },
      userId,
      applyLocal: () => {
        store.updateCache((items) =>
          items.map((i) => {
            if (i.id !== id) return i;
            const updated = { ...i, archived };
            if (archived) updated.pinned = false;
            return updated;
          })
        );
      },
    });

    return true;
  }

  async function setHidden(id, hidden) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    await mutationQueue.run({
      type: 'setIdeaHidden',
      payload: { id, hidden },
      userId,
      applyLocal: () => {
        store.updateCache((items) =>
          items.map((i) => {
            if (i.id !== id) return i;
            const updated = { ...i, hidden };
            if (hidden) updated.pinned = false;
            return updated;
          })
        );
      },
    });

    return true;
  }

  async function setPinned(id, pinned) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    await mutationQueue.run({
      type: 'setIdeaPinned',
      payload: { id, pinned },
      userId,
      applyLocal: () => {
        store.updateCache((items) =>
          items.map((i) => (i.id === id ? { ...i, pinned } : i))
        );
      },
    });

    return true;
  }

  async function setCategories(id, categoryArray) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    const categories = normalizeCategories(categoryArray);
    const category = categories[0] || '';

    await mutationQueue.run({
      type: 'setIdeaCategories',
      payload: { id, category, categories },
      userId,
      applyLocal: () => {
        store.updateCache((items) =>
          items.map((i) => (i.id === id ? { ...i, category, categories } : i))
        );
      },
    });

    return true;
  }

  async function updateText(id, text, tags) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    const payload = { id, text };
    if (tags !== undefined) payload.tags = tags;

    await mutationQueue.run({
      type: 'updateIdeaText',
      payload,
      userId,
      applyLocal: () => {
        store.updateCache((items) =>
          items.map((i) => {
            if (i.id !== id) return i;
            const updated = { ...i, text };
            if (tags !== undefined) updated.tags = tags;
            return updated;
          })
        );
      },
    });

    return true;
  }

  async function updatePriority(id, priority) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    await mutationQueue.run({
      type: 'updateIdeaPriority',
      payload: { id, priority },
      userId,
      applyLocal: () => {
        store.updateCache((items) =>
          items.map((i) => (i.id === id ? { ...i, priority } : i))
        );
      },
    });

    return true;
  }

  async function deleteIdea(id) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    // Capture categories before deletion for orphan check
    const cached = store.getCached();
    const deletedItem = cached.find((i) => i.id === id);
    const deletedCategories = deletedItem?.categories || [];

    await mutationQueue.run({
      type: 'deleteIdea',
      payload: { id },
      userId,
      applyLocal: () => {
        store.updateCache((items) => items.filter((i) => i.id !== id));
      },
    });

    // Check for orphaned categories
    if (deletedCategories.length > 0 && api.onCategoriesOrphaned) {
      const remaining = store.getCached();
      const usedCategories = new Set();
      for (const item of remaining) {
        for (const cat of item.categories || []) {
          usedCategories.add(cat.toLowerCase());
        }
      }
      const orphaned = deletedCategories.filter(
        (cat) => !usedCategories.has(cat.toLowerCase())
      );
      if (orphaned.length > 0) {
        api.onCategoriesOrphaned(orphaned);
      }
    }

    return true;
  }

  async function getUniqueCategories() {
    const allIdeas = await store.getAll();
    const seen = new Set();
    const result = [];
    for (const idea of allIdeas) {
      for (const cat of idea.categories || []) {
        const lower = cat.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          result.push(cat);
        }
      }
    }
    return result;
  }

  const api = {
    // Base store methods
    subscribe: store.subscribe,
    getAll: store.getAll,
    getCached: store.getCached,
    updateCache: store.updateCache,
    _setCache: store._setCache,

    // Ideas-specific mutations
    save,
    setArchived,
    setHidden,
    setPinned,
    setCategories,
    updateText,
    updatePriority,
    delete: deleteIdea,

    // Queries
    getUniqueCategories,

    // Cross-store wiring (set by createStorage)
    onCategoriesOrphaned: null,
  };

  return api;
}
