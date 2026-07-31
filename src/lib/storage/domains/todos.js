import { createDomainStore } from '../domain-store.js';

const COLLECTION = 'todos';
const CACHE_KEY = 'todos_v1_cache';
const CACHE_TS_KEY = 'todos_v1_cache_ts';
const CACHE_TTL = 5 * 60 * 1000;
const WRITE_DEBOUNCE = 150;

export const TODO_SLOTS = ['morning', 'afternoon', 'evening'];

function normalizeTodo(source = {}, fallbackId) {
  const data = source || {};
  const ts = data.createdAt ?? data.created_at;
  let createdAt = Date.now();
  if (typeof ts === 'number') createdAt = ts;
  else if (ts?.toMillis) createdAt = ts.toMillis();

  const slot = TODO_SLOTS.includes(data.slot) ? data.slot : 'morning';

  return {
    id: data.id || fallbackId,
    text: data.text ?? '',
    completed: Boolean(data.completed),
    slot,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : createdAt,
    createdAt,
  };
}

export function createTodosStore(deps, mutationQueue) {
  const { firestore, auth, perfMonitor } = deps;

  const store = createDomainStore({
    collectionName: COLLECTION,
    localCacheKey: CACHE_KEY,
    localTimestampKey: CACHE_TS_KEY,
    cacheTTL: CACHE_TTL,
    normalize: normalizeTodo,
    serialize: (item) => item,
    sortFn: (a, b) => a.sortOrder - b.sortOrder,
    emitCachedOnSubscribe: true,
    writeDebounce: WRITE_DEBOUNCE,
  }, deps);

  const collectionRef = firestore.collection(COLLECTION);

  mutationQueue.register('saveTodo', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    const fsPayload = { ...payload };
    if (typeof fsPayload.createdAt === 'number') {
      fsPayload.createdAt = firestore.Timestamp.fromMillis(fsPayload.createdAt);
    }
    await firestore.setDoc(docRef, fsPayload);
    perfMonitor.trackWrite(1);
  });

  mutationQueue.register('updateTodoText', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    await firestore.updateDoc(docRef, { text: payload.text });
    perfMonitor.trackWrite(1);
  });

  mutationQueue.register('updateTodoCompleted', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    await firestore.updateDoc(docRef, { completed: payload.completed });
    perfMonitor.trackWrite(1);
  });

  mutationQueue.register('deleteTodo', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    await firestore.deleteDoc(docRef);
    perfMonitor.trackWrite(1);
  });

  async function add({ slot, text = '' }) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');
    const id = firestore.doc(collectionRef).id;
    const createdAt = Date.now();
    const payload = {
      id, userId, text, completed: false, slot,
      sortOrder: createdAt, createdAt,
    };
    await mutationQueue.run({
      type: 'saveTodo',
      payload,
      userId,
      applyLocal: () => {
        store.updateCache((items) => {
          items.push(normalizeTodo(payload, id));
          return items;
        });
      },
    });
    return id;
  }

  async function updateText(id, text) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');
    await mutationQueue.run({
      type: 'updateTodoText',
      payload: { id, text },
      userId,
      applyLocal: () => {
        store.updateCache((items) => items.map((t) => t.id === id ? { ...t, text } : t));
      },
    });
  }

  async function setCompleted(id, completed) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');
    await mutationQueue.run({
      type: 'updateTodoCompleted',
      payload: { id, completed },
      userId,
      applyLocal: () => {
        store.updateCache((items) => items.map((t) => t.id === id ? { ...t, completed } : t));
      },
    });
  }

  async function deleteTodo(id) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');
    await mutationQueue.run({
      type: 'deleteTodo',
      payload: { id },
      userId,
      applyLocal: () => {
        store.updateCache((items) => items.filter((t) => t.id !== id));
      },
    });
  }

  return {
    subscribe: store.subscribe,
    getAll: store.getAll,
    getCached: store.getCached,
    add,
    updateText,
    setCompleted,
    delete: deleteTodo,
  };
}
