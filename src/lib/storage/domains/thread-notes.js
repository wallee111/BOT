import { generateLocalId } from '../utils.js';

const CACHE_KEY = 'notes_v1_cache';

function readCache(localStorage) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeCache(localStorage, data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function getCacheForIdea(localStorage, ideaId) {
  const all = readCache(localStorage);
  return Array.isArray(all[ideaId]) ? all[ideaId] : [];
}

function setCacheForIdea(localStorage, ideaId, notes) {
  const all = readCache(localStorage);
  all[ideaId] = notes;
  writeCache(localStorage, all);
}

export function createThreadNotesStore(deps) {
  const { firestore, auth, localStorage } = deps;

  function collectionPath(ideaId) {
    return `ideas/${ideaId}/comments`;
  }

  function getCached(ideaId) {
    return getCacheForIdea(localStorage, ideaId);
  }

  function getCount(ideaId) {
    return getCacheForIdea(localStorage, ideaId).length;
  }

  function _seedCache(ideaId, notes) {
    setCacheForIdea(localStorage, ideaId, notes);
  }

  function subscribe(ideaId, callback, onError) {
    if (!ideaId) {
      return () => {};
    }

    // Emit cached notes immediately if available
    const cached = getCacheForIdea(localStorage, ideaId);
    let skipFirst = false;
    if (cached.length > 0) {
      callback(cached);
      skipFirst = true;
    }

    const collRef = firestore.collection(collectionPath(ideaId));
    const q = firestore.query(collRef, firestore.orderBy('createdAt', 'asc'));

    const unsub = firestore.onSnapshot(
      q,
      (snapshot) => {
        if (skipFirst) {
          skipFirst = false;
          return;
        }
        const notes = snapshot.docs.map((doc) => {
          const data = doc.data();
          let createdAt = data.createdAt;
          if (createdAt?.toMillis) createdAt = createdAt.toMillis();
          return {
            id: doc.id,
            text: data.text ?? '',
            userId: data.userId,
            createdAt: createdAt ?? Date.now(),
          };
        });
        setCacheForIdea(localStorage, ideaId, notes);
        callback(notes);
      },
      onError,
    );

    return unsub;
  }

  async function add(ideaId, text) {
    const userId = await auth.getCurrentUserId();
    const localId = generateLocalId('note');
    const createdAt = Date.now();

    const optimistic = { id: localId, text, userId, createdAt };

    // Apply optimistic update
    const before = getCacheForIdea(localStorage, ideaId);
    setCacheForIdea(localStorage, ideaId, [...before, optimistic]);

    try {
      const collRef = firestore.collection(collectionPath(ideaId));
      const docRef = await firestore.addDoc(collRef, { text, userId, createdAt });

      // Replace local id with real Firestore id
      const current = getCacheForIdea(localStorage, ideaId);
      const updated = current.map((n) => (n.id === localId ? { ...n, id: docRef.id } : n));
      setCacheForIdea(localStorage, ideaId, updated);

      return { ...optimistic, id: docRef.id };
    } catch (err) {
      // Revert optimistic update
      setCacheForIdea(localStorage, ideaId, before);
      throw err;
    }
  }

  async function deleteNote(ideaId, noteId) {
    const before = getCacheForIdea(localStorage, ideaId);

    // Apply optimistic removal
    setCacheForIdea(localStorage, ideaId, before.filter((n) => n.id !== noteId));

    try {
      const collRef = firestore.collection(collectionPath(ideaId));
      const docRef = firestore.doc(collRef, noteId);
      await firestore.deleteDoc(docRef);
    } catch (err) {
      // Revert
      setCacheForIdea(localStorage, ideaId, before);
      throw err;
    }
  }

  async function update(ideaId, noteId, text) {
    const before = getCacheForIdea(localStorage, ideaId);

    // Apply optimistic text update
    setCacheForIdea(
      localStorage,
      ideaId,
      before.map((n) => (n.id === noteId ? { ...n, text } : n)),
    );

    try {
      const collRef = firestore.collection(collectionPath(ideaId));
      const docRef = firestore.doc(collRef, noteId);
      await firestore.updateDoc(docRef, { text });
    } catch (err) {
      // Revert
      setCacheForIdea(localStorage, ideaId, before);
      throw err;
    }
  }

  return {
    subscribe,
    add,
    delete: deleteNote,
    update,
    getCached,
    getCount,
    _seedCache,
  };
}
