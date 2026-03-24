import { createDomainStore } from '../domain-store.js';

const COLLECTION = 'noteFolders';
const CACHE_KEY = 'note_folders_v1';

function normalizeNoteFolder(source = {}, fallbackId) {
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
    name: data.name ?? 'Untitled Folder',
    sortOrder: data.sortOrder ?? 0,
    createdAt,
    updatedAt,
    userId: data.userId,
  };
}

export function createNoteFoldersStore(deps, mutationQueue, pageNotesStore) {
  const { firestore, auth } = deps;

  const store = createDomainStore({
    collectionName: COLLECTION,
    localCacheKey: CACHE_KEY,
    normalize: normalizeNoteFolder,
    serialize: (item) => item,
    sortFn: (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    emitCachedOnSubscribe: true,
  }, deps);

  const collectionRef = firestore.collection(COLLECTION);

  // --- Mutation executors ---

  mutationQueue.register('saveNoteFolder', async (payload) => {
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

  mutationQueue.register('deleteNoteFolder', async (payload) => {
    const docRef = firestore.doc(collectionRef, payload.id);
    await firestore.deleteDoc(docRef);
  });

  // --- Public API ---

  async function save(folder) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    const now = Date.now();
    const id = folder.id || firestore.doc(collectionRef).id;
    const payload = {
      id,
      name: folder.name ?? 'Untitled Folder',
      sortOrder: folder.sortOrder ?? 0,
      createdAt: folder.createdAt ?? now,
      updatedAt: folder.updatedAt ?? now,
      userId,
    };

    await mutationQueue.run({
      type: 'saveNoteFolder',
      payload,
      userId,
      applyLocal: () => {
        store.updateCache((items) => {
          const idx = items.findIndex((i) => i.id === id);
          if (idx >= 0) {
            items[idx] = normalizeNoteFolder(payload, id);
          } else {
            items.push(normalizeNoteFolder(payload, id));
          }
          return items;
        });
      },
    });

    return payload;
  }

  async function deleteFolder(id) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated');

    // CASCADE: move all notes in this folder to root (folderId: null)
    const notes = pageNotesStore.getCached();
    const notesInFolder = notes.filter((n) => n.folderId === id);
    for (const note of notesInFolder) {
      await pageNotesStore.save({ ...note, folderId: null });
    }

    await mutationQueue.run({
      type: 'deleteNoteFolder',
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
    delete: deleteFolder,
  };
}
