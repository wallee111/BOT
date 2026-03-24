import { generateLocalId } from '../utils.js';

const LOCAL_CANVAS_KEY = 'canvas_layout_v1';
const SAVE_DEBOUNCE_MS = 1500;

const DEFAULT_CANVAS_LAYOUT = {
  cards: [],
  headers: [],
  viewport: { panX: 0, panY: 0, zoom: 1.0 },
};

function normalizeCanvasLayout(data) {
  return {
    cards: Array.isArray(data?.cards)
      ? data.cards.map(c => ({
          categoryName: (c.categoryName || '').trim(),
          x: Number(c.x) || 0, y: Number(c.y) || 0,
          width: Number(c.width) || 0, bodyHeight: Number(c.bodyHeight) || 0,
        })).filter(c => c.categoryName)
      : [],
    headers: Array.isArray(data?.headers)
      ? data.headers.map(h => ({
          id: h.id || generateLocalId('hdr'),
          text: (h.text || '').trim() || 'Header',
          x: Number(h.x) || 0, y: Number(h.y) || 0,
        }))
      : [],
    viewport: {
      panX: Number(data?.viewport?.panX) || 0,
      panY: Number(data?.viewport?.panY) || 0,
      zoom: Math.max(0.1, Math.min(3.0, Number(data?.viewport?.zoom) || 1.0)),
    },
  };
}

export function createCanvasStore(deps) {
  const { firestore, auth, localStorage } = deps;

  let _saveTimer = null;

  function readFromLocal() {
    try {
      const stored = localStorage.getItem(LOCAL_CANVAS_KEY);
      return stored ? normalizeCanvasLayout(JSON.parse(stored)) : null;
    } catch {
      return null;
    }
  }

  function writeToLocal(layout) {
    try {
      localStorage.setItem(LOCAL_CANVAS_KEY, JSON.stringify(layout));
    } catch {
      // ignore
    }
  }

  async function fetchFromFirestore() {
    const userId = await auth.getCurrentUserId();
    if (!userId) return null;
    const docRef = firestore.doc('canvasLayouts', userId);
    const snap = await firestore.getDoc(docRef);
    if (!snap.exists()) return null;
    return normalizeCanvasLayout(snap.data());
  }

  async function load() {
    const local = readFromLocal();
    try {
      const remote = await fetchFromFirestore();
      if (remote) return remote;
    } catch {
      // fall through to local
    }
    return local ?? normalizeCanvasLayout(DEFAULT_CANVAS_LAYOUT);
  }

  function save(layout) {
    const normalized = normalizeCanvasLayout(layout);
    writeToLocal(normalized);

    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      try {
        const userId = await auth.getCurrentUserId();
        if (!userId) return;
        const docRef = firestore.doc('canvasLayouts', userId);
        await firestore.setDoc(docRef, normalized);
      } catch {
        // ignore Firestore write failures; data is safe in localStorage
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function subscribe(callback) {
    let unsubscribe = () => {};

    auth.getCurrentUserId().then(userId => {
      if (!userId) return;
      const docRef = firestore.doc('canvasLayouts', userId);
      unsubscribe = firestore.onSnapshot(docRef, (snap) => {
        if (!snap.exists()) {
          callback(normalizeCanvasLayout(DEFAULT_CANVAS_LAYOUT));
          return;
        }
        callback(normalizeCanvasLayout(snap.data()));
      }, (error) => {
        console.warn('[canvasStore] snapshot listener error:', error);
      });
    }).catch(error => {
      console.error('[canvasStore] error getting user ID for subscription:', error);
    });

    return () => unsubscribe();
  }

  return { load, save, subscribe };
}
