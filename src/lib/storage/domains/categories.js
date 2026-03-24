import { HEX_COLOR_PATTERN, normalizeCategories } from '../../utils.js';
import { isPermissionDenied } from '../utils.js';

const LOCAL_CATEGORY_SETTINGS_KEY = 'category_settings_v1';
const LOCAL_CATEGORY_SETTINGS_TIMESTAMP_KEY = 'category_settings_v1_ts';
const LOCAL_CATEGORY_USAGE_KEY = 'category_usage_v1';
const CACHE_TTL = 5 * 60 * 1000;
const BATCH_SIZE = 500;

function normalizePaletteSettings(source) {
  if (!source || typeof source !== 'object') return {};

  const normalized = {};
  Object.entries(source).forEach(([rawName, value]) => {
    const name = (rawName || '').trim();
    if (!name) return;

    const entry = {};
    const rawColor = typeof value?.color === 'string' ? value.color.trim().toLowerCase() : '';
    if (rawColor && HEX_COLOR_PATTERN.test(rawColor)) {
      entry.color = rawColor;
    }
    entry.visible = typeof value?.visible === 'boolean' ? value.visible : true;
    normalized[name] = entry;
  });

  return normalized;
}

const categoryDocId = (category) =>
  encodeURIComponent((category || '').trim().toLowerCase());

export function createCategoriesStore(deps) {
  const { firestore, auth, localStorage, perfMonitor, emitEvent } = deps;

  const collectionRef = firestore.collection('categorySettings');

  let categorySettingsCache = null;
  let firestoreAllowed = true;

  // --- Cross-store wiring (set externally by createStorage) ---
  let getIdeasForRename = null;

  // --- Local cache helpers ---

  function readFromLocal() {
    try {
      const stored = localStorage.getItem(LOCAL_CATEGORY_SETTINGS_KEY);
      const parsed = stored ? JSON.parse(stored) : {};
      return normalizePaletteSettings(parsed);
    } catch (err) {
      console.warn('Unable to read category settings cache', err);
      return {};
    }
  }

  function writeToLocal(settings) {
    try {
      const normalized = normalizePaletteSettings(settings);
      const compact = {};
      Object.entries(normalized).forEach(([name, meta]) => {
        const entry = {};
        if (meta.color) entry.color = meta.color;
        if (meta.visible === false) entry.visible = false;
        if (Object.keys(entry).length) compact[name] = entry;
      });
      localStorage.setItem(LOCAL_CATEGORY_SETTINGS_KEY, JSON.stringify(compact));
      localStorage.setItem(LOCAL_CATEGORY_SETTINGS_TIMESTAMP_KEY, Date.now().toString());
    } catch (err) {
      console.warn('Unable to write category settings cache', err);
    }
  }

  function ensureCache() {
    categorySettingsCache = categorySettingsCache
      ? normalizePaletteSettings(categorySettingsCache)
      : readFromLocal();
  }

  function isCacheValid() {
    try {
      const ts = localStorage.getItem(LOCAL_CATEGORY_SETTINGS_TIMESTAMP_KEY);
      if (!ts) return false;
      return Date.now() - Number(ts) < CACHE_TTL;
    } catch {
      return false;
    }
  }

  function handlePermissionError(error) {
    if (isPermissionDenied(error)) {
      firestoreAllowed = false;
      console.info('Firestore category settings access denied; continuing with local cache only.');
      return true;
    }
    return false;
  }

  // --- Firestore fetch ---

  async function fetchFromFirestore() {
    perfMonitor.startTimer('fetchCategorySettings');
    const userId = await auth.getCurrentUserId();
    if (!userId) {
      console.warn('No user ID available, cannot fetch category settings');
      return {};
    }

    const q = firestore.query(collectionRef, firestore.where('userId', '==', userId));
    const snapshot = await firestore.getDocs(q);
    perfMonitor.trackRead(snapshot.size);

    const settings = {};
    snapshot.forEach(docSnap => {
      const data = docSnap.data() || {};
      const name = (data.name || data.label || data.category || docSnap.id || '').trim();
      if (!name) return;
      const entry = {};
      const storedColour = typeof data.color === 'string' ? data.color.trim().toLowerCase() : '';
      if (storedColour) entry.color = storedColour;
      if (typeof data.visible === 'boolean') entry.visible = data.visible;
      settings[name] = entry;
    });

    const normalized = normalizePaletteSettings(settings);
    categorySettingsCache = normalized;
    writeToLocal(normalized);
    perfMonitor.endTimer('fetchCategorySettings');
    return { ...normalized };
  }

  // --- Public API ---

  async function getPalette({ force = false } = {}) {
    ensureCache();
    const localSettings = { ...categorySettingsCache };
    const cacheValid = isCacheValid();

    if (!force && Object.keys(localSettings).length && !cacheValid) {
      if (firestoreAllowed) {
        fetchFromFirestore()
          .then(firestoreSettings => {
            const merged = { ...localSettings, ...firestoreSettings };
            categorySettingsCache = normalizePaletteSettings(merged);
            writeToLocal(categorySettingsCache);
          })
          .catch(error => {
            if (!handlePermissionError(error)) {
              console.warn('Background category settings fetch failed:', error);
            }
          });
      }
      return localSettings;
    }

    if (force || (!cacheValid && firestoreAllowed)) {
      try {
        const fresh = await fetchFromFirestore();
        return { ...localSettings, ...fresh };
      } catch (error) {
        if (!handlePermissionError(error)) {
          console.warn('Unable to fetch category settings from Firestore:', error);
        }
      }
    }

    return localSettings;
  }

  async function setColor(category, color) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated to set category colors');

    const name = (category || '').trim();
    if (!name) return;

    const normalizedColor = (color || '').trim().toLowerCase();
    if (normalizedColor && !HEX_COLOR_PATTERN.test(normalizedColor)) {
      throw new Error('Invalid colour format.');
    }

    ensureCache();
    const existing = categorySettingsCache[name] || { visible: true };

    if (!normalizedColor) {
      if (existing) {
        delete existing.color;
        const normalizedEntry = normalizePaletteSettings({ [name]: existing })[name];
        if (normalizedEntry && (normalizedEntry.color || normalizedEntry.visible === false)) {
          categorySettingsCache[name] = normalizedEntry;
        } else {
          delete categorySettingsCache[name];
        }
      }
    } else {
      categorySettingsCache[name] = normalizePaletteSettings({
        [name]: { ...existing, color: normalizedColor },
      })[name];
    }

    categorySettingsCache = normalizePaletteSettings(categorySettingsCache);
    writeToLocal(categorySettingsCache);

    if (firestoreAllowed) {
      try {
        const docRef = firestore.doc(collectionRef, categoryDocId(name));
        const payload = { userId, name };
        if (categorySettingsCache[name]?.color) {
          payload.color = categorySettingsCache[name].color;
        }
        if (typeof categorySettingsCache[name]?.visible === 'boolean') {
          payload.visible = categorySettingsCache[name].visible;
        }
        if (!normalizedColor) {
          if (payload.visible === false) {
            await firestore.setDoc(docRef, { ...payload, color: firestore.deleteField() }, { merge: true });
          } else {
            await firestore.deleteDoc(docRef);
          }
        } else {
          payload.color = normalizedColor;
          await firestore.setDoc(docRef, payload, { merge: true });
        }
      } catch (error) {
        if (!handlePermissionError(error)) {
          console.warn('Unable to sync category color to Firestore (using localStorage only):', error);
        }
      }
    }
  }

  async function setVisibility(category, visible = true) {
    const userId = await auth.getCurrentUserId();
    if (!userId) throw new Error('User must be authenticated to update category visibility');

    const name = (category || '').trim();
    if (!name) return;

    ensureCache();
    const existing = categorySettingsCache[name] || {};
    const updatedEntry = normalizePaletteSettings({ [name]: { ...existing, visible } })[name];

    if (updatedEntry.visible === true && !updatedEntry.color) {
      delete categorySettingsCache[name];
    } else {
      categorySettingsCache[name] = updatedEntry;
    }
    categorySettingsCache = normalizePaletteSettings(categorySettingsCache);
    writeToLocal(categorySettingsCache);

    if (firestoreAllowed) {
      try {
        const docRef = firestore.doc(collectionRef, categoryDocId(name));
        const payload = { userId, name, visible };
        if (categorySettingsCache[name]?.color) {
          payload.color = categorySettingsCache[name].color;
        }
        if (visible === true && !payload.color) {
          await firestore.deleteDoc(docRef);
        } else {
          await firestore.setDoc(docRef, payload, { merge: true });
        }
      } catch (error) {
        if (!handlePermissionError(error)) {
          console.warn('Unable to update category visibility (using local cache only):', error);
        }
      }
    }

    return true;
  }

  async function removeCategorySetting(category) {
    const name = (category || '').trim();
    if (!name) return;

    const docRef = firestore.doc(collectionRef, categoryDocId(name));
    try {
      await firestore.deleteDoc(docRef);
    } catch (error) {
      console.warn('Unable to remove category setting', error);
    }

    ensureCache();
    if (categorySettingsCache && Object.prototype.hasOwnProperty.call(categorySettingsCache, name)) {
      delete categorySettingsCache[name];
      categorySettingsCache = normalizePaletteSettings(categorySettingsCache);
      writeToLocal(categorySettingsCache);
    }
  }

  async function renameCategory(currentName, nextName) {
    const current = (currentName || '').trim();
    const next = (nextName || '').trim();
    if (!current || !next || current === next) {
      return { updatedIdeas: 0 };
    }

    const ideas = getIdeasForRename?.() || [];
    const matching = ideas.filter(idea => {
      const categories = idea.categories || (idea.category ? [idea.category] : []);
      return categories.some(cat => (cat || '').trim().toLowerCase() === current.toLowerCase());
    });

    if (matching.length) {
      const ideasCollectionRef = firestore.collection('ideas');
      const chunks = [];
      for (let i = 0; i < matching.length; i += BATCH_SIZE) {
        chunks.push(matching.slice(i, i + BATCH_SIZE));
      }

      try {
        for (const chunk of chunks) {
          const batch = firestore.writeBatch();
          chunk.forEach(idea => {
            const updated = normalizeCategories(
              idea.categories.map(cat =>
                cat.trim().toLowerCase() === current.toLowerCase() ? next : cat
              )
            );
            batch.update(firestore.doc(ideasCollectionRef, idea.id), {
              category: updated[0] || '',
              categories: updated,
            });
          });
          await batch.commit();
        }
      } catch (error) {
        console.error('Unable to rename category ideas in Firestore', error);
        throw error;
      }
    }

    // Migrate category setting doc
    const oldRef = firestore.doc(collectionRef, categoryDocId(current));
    const newRef = firestore.doc(collectionRef, categoryDocId(next));
    let preservedColor = '';
    let newRefHasColor = false;
    try {
      const [oldSnapshot, newSnapshot] = await Promise.all([
        firestore.getDoc(oldRef),
        firestore.getDoc(newRef),
      ]);
      if (oldSnapshot.exists()) {
        preservedColor = (oldSnapshot.data()?.color || '').trim().toLowerCase();
      }
      if (newSnapshot.exists()) {
        const existingColour = (newSnapshot.data()?.color || '').trim();
        newRefHasColor = Boolean(existingColour);
        if (!preservedColor && existingColour) {
          preservedColor = existingColour.toLowerCase();
        }
      }
      const payload = { name: next };
      if (preservedColor && !newRefHasColor) {
        payload.color = preservedColor;
      }
      await firestore.setDoc(newRef, payload, { merge: true });
      if (oldSnapshot.exists()) {
        await firestore.deleteDoc(oldRef);
      }
    } catch (error) {
      console.warn('Unable to migrate category settings during rename', error);
    }

    // Update local cache
    ensureCache();
    if (categorySettingsCache) {
      const existingNew = categorySettingsCache[next] || {};
      const finalColor = (existingNew.color || preservedColor || '').toLowerCase();
      if (finalColor) {
        categorySettingsCache[next] = { color: finalColor };
      } else if (Object.prototype.hasOwnProperty.call(categorySettingsCache, next)) {
        delete categorySettingsCache[next];
      }
      if (Object.prototype.hasOwnProperty.call(categorySettingsCache, current)) {
        delete categorySettingsCache[current];
      }
      categorySettingsCache = normalizePaletteSettings(categorySettingsCache);
      writeToLocal(categorySettingsCache);
    }

    return { updatedIdeas: matching.length };
  }

  async function cleanupUnused(categories = []) {
    if (!Array.isArray(categories) || !categories.length) return;

    for (const category of categories) {
      if (!category) continue;
      try {
        await removeCategorySetting(category);
      } catch (error) {
        console.warn('Unable to remove unused category setting', error);
      }
      emitEvent('categoryDeleted', { category });
    }
  }

  function subscribe(callback) {
    let unsubscribe = () => {};

    auth.getCurrentUserId().then(userId => {
      if (!userId) {
        console.warn('[subscribeToCategorySettings] No userId; skipping Firestore subscription.');
        return;
      }

      const q = firestore.query(collectionRef, firestore.where('userId', '==', userId));
      unsubscribe = firestore.onSnapshot(q, (snapshot) => {
        const settings = {};
        snapshot.forEach(docSnap => {
          const data = docSnap.data() || {};
          const name = (data.name || data.label || data.category || docSnap.id || '').trim();
          if (!name) return;
          const entry = {};
          const storedColour = typeof data.color === 'string' ? data.color.trim().toLowerCase() : '';
          if (storedColour) entry.color = storedColour;
          if (typeof data.visible === 'boolean') entry.visible = data.visible;
          settings[name] = entry;
        });

        const normalized = normalizePaletteSettings(settings);
        categorySettingsCache = normalized;
        writeToLocal(normalized);
        callback(normalized);
      }, (error) => {
        console.warn('[subscribeToCategorySettings] Listener error:', error);
      });
    }).catch(error => {
      console.error('[subscribeToCategorySettings] Error getting user ID:', error);
    });

    return () => unsubscribe();
  }

  function trackUsage(category) {
    if (!category) return;
    try {
      const usage = JSON.parse(localStorage.getItem(LOCAL_CATEGORY_USAGE_KEY) || '{}');
      usage[category] = Date.now();
      localStorage.setItem(LOCAL_CATEGORY_USAGE_KEY, JSON.stringify(usage));
    } catch (error) {
      console.error('Error tracking category usage:', error);
    }
  }

  function getByRecentUsage(categories) {
    try {
      const usage = JSON.parse(localStorage.getItem(LOCAL_CATEGORY_USAGE_KEY) || '{}');
      return categories.slice().sort((a, b) => {
        const timeA = usage[a] || 0;
        const timeB = usage[b] || 0;
        return timeB - timeA;
      });
    } catch (error) {
      console.error('Error getting categories by usage:', error);
      return categories;
    }
  }

  const store = {
    getPalette,
    setColor,
    setVisibility,
    renameCategory,
    cleanupUnused,
    subscribe,
    trackUsage,
    getByRecentUsage,

    // Allow external wiring of cross-store dependency
    get getIdeasForRename() { return getIdeasForRename; },
    set getIdeasForRename(fn) { getIdeasForRename = fn; },
  };

  return store;
}
