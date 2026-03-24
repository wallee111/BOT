import { createDomainStore } from '../domain-store.js';

const COLLECTION = 'notes';
const CACHE_KEY = 'notes_v1_cache';

function normalizePageNote(source = {}, fallbackId) {
  const data = source || {};

  let createdAt = Date.now();
  const rawCreatedAt = data.createdAt;
  if (typeof rawCreatedAt === 'number') {
    createdAt = rawCreatedAt;
  } else if (rawCreatedAt?.toMillis) {
    createdAt = rawCreatedAt.toMillis();
  }

  let updatedAt = createdAt;
  const rawUpdatedAt = data.updatedAt;
  if (typeof rawUpdatedAt === 'number') {
    updatedAt = rawUpdatedAt;
  } else if (rawUpdatedAt?.toMillis) {
    updatedAt = rawUpdatedAt.toMillis();
  }

  return {
    id: data.id || fallbackId,
    title: data.title ?? '',
    content: data.content ?? '',
    folderId: data.folderId ?? null,
    createdAt,
    updatedAt,
    userId: data.userId,
  };
}

export function createPageNotesStore(deps, mutationQueue) {
  const { firestore, auth } = deps;

  const store = createDomainStore({
    collectionName: COLLECTION,
    localCacheKey: CACHE_KEY,
    normalize: normalizePageNote,
    serialize: (item) => item,
    sortFn: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    emitCachedOnSubscribe: true,
  }, deps);

  const collectionRef = firestore.collection(COLLECTION);

  // --- Mutation executors ---

  mutationQueue.register('savePageNote', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    const firestorePayload = { ...payload };
    if (typeof firestorePayload.createdAt === 'number') {
      firestorePayload.createdAt = firestore.Timestamp.fromMillis(firestorePayload.createdAt);
    }
    if (typeof firestorePayload.updatedAt === 'number') {
      firestorePayload.updatedAt = firestore.Timestamp.fromMillis(firestorePayload.updatedAt);
    }
    await firestore.setDoc(docRef, firestorePayload);
  });

  mutationQueue.register('deletePageNote', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    await firestore.deleteDoc(docRef);
  });

  // --- Public API ---

  async function save(note) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    const now = Date.now();
    const id = note.id || firestore.doc(collectionRef).id;
    const payload = {
      id,
      title: note.title ?? '',
      content: note.content ?? '',
      folderId: note.folderId ?? null,
      createdAt: note.createdAt ?? now,
      updatedAt: note.updatedAt ?? now,
      userId,
    };

    await mutationQueue.run({
      type: 'savePageNote',
      payload,
      userId,
      applyLocal: () => {
        store.updateCache((items) => {
          const idx = items.findIndex((i) => i.id === id);
          if (idx >= 0) {
            items[idx] = normalizePageNote(payload, id);
          } else {
            items.push(normalizePageNote(payload, id));
          }
          return items;
        });
      },
    });

    return payload;
  }

  async function deleteNote(id) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    await mutationQueue.run({
      type: 'deletePageNote',
      payload: { id },
      userId,
      applyLocal: () => {
        store.updateCache((items) => items.filter((i) => i.id !== id));
      },
    });

    return true;
  }

  return {
    subscribe: store.subscribe,
    getAll: store.getAll,
    getCached: store.getCached,
    updateCache: store.updateCache,
    _setCache: store._setCache,
    save,
    delete: deleteNote,
  };
}
