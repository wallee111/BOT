import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    updateDoc,
    writeBatch,
    query,
    where,
    onSnapshot,
    deleteField,
    addDoc,
    orderBy
} from 'firebase/firestore';
import { app } from './firebase.js';
import { HEX_COLOR_PATTERN, normalizeCategories } from './utils.js';
import { getCurrentUserId } from './auth.js';

const LOCAL_CACHE_KEY = 'ideas_v1_cache';
const LOCAL_CATEGORY_SETTINGS_KEY = 'category_settings_v1';
const LOCAL_CATEGORY_USAGE_KEY = 'category_usage_v1';
const LOCAL_MUTATION_QUEUE_KEY = 'ideas_mutation_queue_v1';
const LOCAL_USER_SETTINGS_KEY = 'user_settings_v1';
const MUTATION_QUEUE_EVENT = 'ideasMutationQueueChanged';

const NETWORK_RETRYABLE_CODES = new Set(['unavailable', 'deadline-exceeded']);

const generateLocalId = (prefix = 'mutation') => {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `${prefix}-${crypto.randomUUID()}`;
        }
    } catch (error) {
        // Ignore crypto access errors and fall through to fallback
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const shouldQueueMutationForError = (error) => {
    if (!error) return false;
    const code = (error.code || error.name || '').toLowerCase();
    if (code.includes('permission')) {
        return false;
    }
    if (NETWORK_RETRYABLE_CODES.has(code)) {
        return true;
    }
    const message = (error.message || '').toLowerCase();
    return /network|fetch|offline|unreachable|timeout/.test(message);
};

const emitMutationQueueSize = (size) => {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(MUTATION_QUEUE_EVENT, {
            detail: { count: size }
        }));
    }
};

function readMutationQueue() {
    try {
        const raw = localStorage.getItem(LOCAL_MUTATION_QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn('Unable to read offline mutation queue', error);
        return [];
    }
}

function writeMutationQueue(queue) {
    try {
        localStorage.setItem(LOCAL_MUTATION_QUEUE_KEY, JSON.stringify(queue));
        emitMutationQueueSize(queue.length);
    } catch (error) {
        console.warn('Unable to persist offline mutation queue', error);
    }
}

export function getPendingMutationCount() {
    return readMutationQueue().length;
}

let pendingFlushHandle = null;
function scheduleMutationFlush(delay = 1500) {
    if (pendingFlushHandle) {
        return;
    }
    pendingFlushHandle = setTimeout(() => {
        pendingFlushHandle = null;
        flushPendingMutations().catch(error => console.warn('Unable to flush pending mutations', error));
    }, delay);
}

const isPermissionDenied = (error) =>
    /permission[-_ ]denied/i.test(error?.code || error?.name || '') ||
    /insufficient permissions/i.test(error?.message || '');

const db = getFirestore(app);
const ideasCollection = collection(db, 'ideas');
const categorySettingsCollection = collection(db, 'categorySettings');
const userSettingsCollection = collection(db, 'userSettings');

const mutationExecutors = {
    saveIdea: async (payload = {}) => {
        if (!payload?.id) return;
        await setDoc(doc(ideasCollection, payload.id), payload);
    },
    setIdeaArchived: async ({ id, archived = true }) => {
        if (!id) return;
        const updatePayload = { archived };
        if (archived) {
            updatePayload.pinned = false;
        }
        await updateDoc(doc(ideasCollection, id), updatePayload);
    },
    setIdeaHidden: async ({ id, hidden = true }) => {
        if (!id) return;
        const updatePayload = { hidden };
        if (hidden) {
            updatePayload.pinned = false;
        }
        await updateDoc(doc(ideasCollection, id), updatePayload);
    },
    setIdeaPinned: async ({ id, pinned = true, unpinnedIds = [] }) => {
        if (!id) return;
        if (pinned) {
            const batch = writeBatch(db);
            batch.update(doc(ideasCollection, id), { pinned: true });
            (unpinnedIds || []).forEach(otherId => {
                if (otherId && otherId !== id) {
                    batch.update(doc(ideasCollection, otherId), { pinned: false });
                }
            });
            await batch.commit();
        } else {
            await updateDoc(doc(ideasCollection, id), { pinned: false });
        }
    },
    setIdeaCategories: async ({ id, categories = [], category = '' }) => {
        if (!id) return;
        await updateDoc(doc(ideasCollection, id), {
            category: category || categories[0] || '',
            categories
        });
    },
    deleteIdea: async ({ id }) => {
        if (!id) return;
        await deleteDoc(doc(ideasCollection, id));
    },
    updateIdeaText: async ({ id, text = '', tags }) => {
        if (!id) return;
        const payload = { text };
        if (Array.isArray(tags)) payload.tags = tags;
        await updateDoc(doc(ideasCollection, id), payload);
    },
    updateIdeaPriority: async ({ id, priority = '' }) => {
        if (!id) return;
        await updateDoc(doc(ideasCollection, id), { priority });
    },
    updateUserSettings: async ({ userId, settings = {} }) => {
        if (!userId) return;
        await setDoc(doc(userSettingsCollection, userId), { ...settings, userId }, { merge: true });
    }
};

async function runMutation({ type, payload, userId, applyLocal }) {
    if (!type || typeof mutationExecutors[type] !== 'function') {
        throw new Error(`Unsupported mutation type: ${type}`);
    }

    const entry = {
        id: generateLocalId(type),
        type,
        payload,
        userId,
        createdAt: Date.now()
    };

    const attempt = () => mutationExecutors[type](payload);

    if (isOffline()) {
        applyLocal?.();
        enqueueMutation(entry);
        scheduleMutationFlush();
        return { queued: true };
    }

    try {
        await attempt();
        applyLocal?.();
        return { queued: false };
    } catch (error) {
        if (shouldQueueMutationForError(error)) {
            console.warn(`[${type}] Network error detected; queuing mutation`, error);
            applyLocal?.();
            enqueueMutation(entry);
            scheduleMutationFlush();
            return { queued: true };
        }
        throw error;
    }
}

export async function flushPendingMutations({ force = false } = {}) {
    if (isFlushingMutations) {
        return false;
    }

    if (!force && isOffline()) {
        return false;
    }

    isFlushingMutations = true;
    try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return false;
        }

        const queue = readMutationQueue();
        if (!queue.length) {
            return true;
        }

        const remaining = [];
        let mutated = false;
        let encounteredNetworkError = false;

        for (const entry of queue) {
            if (encounteredNetworkError) {
                remaining.push(entry);
                continue;
            }

            if (entry.userId && entry.userId !== currentUserId) {
                remaining.push(entry);
                continue;
            }

            const executor = mutationExecutors[entry.type];
            if (typeof executor !== 'function') {
                console.warn('Skipping unknown mutation type', entry.type);
                mutated = true;
                continue;
            }

            try {
                await executor(entry.payload);
                mutated = true;
            } catch (error) {
                if (shouldQueueMutationForError(error)) {
                    remaining.push(entry);
                    encounteredNetworkError = true;
                } else {
                    console.error(`Dropping failed offline mutation (${entry.type})`, error);
                    mutated = true;
                }
            }
        }

        if (mutated || remaining.length !== queue.length) {
            writeMutationQueue(remaining);
        }

        return remaining.length === 0;
    } finally {
        isFlushingMutations = false;
    }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => {
        flushPendingMutations().catch(error => console.warn('Unable to flush pending mutations on reconnect', error));
    });
    // Attempt to flush shortly after load
    setTimeout(() => {
        flushPendingMutations().catch(error => console.warn('Initial mutation flush failed', error));
    }, 1000);
}



let ideasCache = null;
let categorySettingsCache = null;
const firestoreAccess = {
    _categorySettingsAllowed: true,
    disableCategorySettings() { this._categorySettingsAllowed = false; },
    get canFetchCategorySettings() { return this._categorySettingsAllowed; },
};
let isFlushingMutations = false;

function getIdeasCacheSnapshot() {
    if (!Array.isArray(ideasCache)) {
        ideasCache = readIdeasFromLocal();
    }
    return ideasCache || [];
}

function updateIdeasCache(mutator) {
    const snapshot = getIdeasCacheSnapshot();
    const working = Array.isArray(snapshot) ? [...snapshot] : [];
    const next = mutator(working) || [];
    ideasCache = next;
    writeIdeasToLocal(next);
    return ideasCache;
}

function enqueueMutation(entry) {
    const queue = readMutationQueue();
    queue.push(entry);
    writeMutationQueue(queue);
}

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
        primaryCategory
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
        pinned: Boolean(data.pinned)
    };
}

function readIdeasFromLocal() {
    try {
        const stored = localStorage.getItem(LOCAL_CACHE_KEY);
        return stored
            ? JSON.parse(stored).map(item => normalizeIdeaObject(item, item?.id || crypto.randomUUID?.()))
            : [];
    } catch (err) {
        console.warn('Unable to read local cache', err);
        return [];
    }
}

function writeIdeasToLocal(ideas) {
    try {
        const normalized = Array.isArray(ideas) ? ideas.map(item => normalizeIdeaObject(item, item?.id)) : [];
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(normalized));
    } catch (err) {
        console.warn('Unable to write to local cache', err);
    }
}

function normalizePaletteSettings(source) {
    if (!source || typeof source !== 'object') return {};

    const normalized = {};

    Object.entries(source).forEach(([rawName, value]) => {
        const name = (rawName || '').trim();
        if (!name) {
            return;
        }

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

function readCategorySettingsFromLocal() {
    try {
        const stored = localStorage.getItem(LOCAL_CATEGORY_SETTINGS_KEY);
        const parsed = stored ? JSON.parse(stored) : {};
        return normalizePaletteSettings(parsed);
    } catch (err) {
        console.warn('Unable to read category settings cache', err);
        return {};
    }
}

function writeCategorySettingsToLocal(settings) {
    try {
        const normalized = normalizePaletteSettings(settings);
        const compact = {};
        Object.entries(normalized).forEach(([name, meta]) => {
            const entry = {};
            if (meta.color) {
                entry.color = meta.color;
            }
            if (meta.visible === false) {
                entry.visible = false;
            }
            if (Object.keys(entry).length) {
                compact[name] = entry;
            }
        });
        localStorage.setItem(LOCAL_CATEGORY_SETTINGS_KEY, JSON.stringify(compact));
    } catch (err) {
        console.warn('Unable to write category settings cache', err);
    }
}

const categoryDocId = (category) => encodeURIComponent((category || '').trim().toLowerCase());

function ensureCategorySettingsCache() {
    categorySettingsCache = categorySettingsCache
        ? normalizePaletteSettings(categorySettingsCache)
        : readCategorySettingsFromLocal();
}

function normalizeIdea(docSnap) {
    return normalizeIdeaObject(docSnap.data() || {}, docSnap.id);
}

async function fetchIdeasFromFirestore() {
    const userId = await getCurrentUserId();
    if (!userId) {
        console.warn('[fetchIdeasFromFirestore] No user ID available, cannot fetch ideas');
        return [];
    }

    // Query without orderBy to avoid needing a composite index
    // We'll sort in memory instead
    const q = query(
        ideasCollection,
        where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    // Sort in memory
    ideasCache = snapshot.docs.map(normalizeIdea).sort((a, b) => a.createdAt - b.createdAt);
    writeIdeasToLocal(ideasCache);
    return [...ideasCache];
}

async function fetchCategorySettingsFromFirestore() {
    const userId = await getCurrentUserId();
    if (!userId) {
        console.warn('No user ID available, cannot fetch category settings');
        return {};
    }

    const q = query(categorySettingsCollection, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const settings = {};
    snapshot.forEach(docSnap => {
        const data = docSnap.data() || {};
        const name = (data.name || data.label || data.category || docSnap.id || '').trim();
        if (!name) {
            return;
        }
        const entry = {};
        const storedColour = typeof data.color === 'string' ? data.color.trim().toLowerCase() : '';
        if (storedColour) {
            entry.color = storedColour;
        }
        if (typeof data.visible === 'boolean') {
            entry.visible = data.visible;
        }
        settings[name] = entry;
    });
    const normalized = normalizePaletteSettings(settings);
    categorySettingsCache = normalized;
    writeCategorySettingsToLocal(normalized);
    return { ...normalized };
}

export async function getCategoryPalette({ force = false } = {}) {
    ensureCategorySettingsCache();

    // Always return localStorage data first (primary storage)
    const localSettings = { ...categorySettingsCache };

    // Only try Firestore if forced or local cache is empty
    const shouldAttemptFirestore = firestoreAccess.canFetchCategorySettings && (force || !Object.keys(localSettings).length);
    if (shouldAttemptFirestore) {
        try {
            const firestoreSettings = await fetchCategorySettingsFromFirestore();

            // Merge Firestore data with local data (local takes precedence)
            const mergedSettings = { ...firestoreSettings, ...localSettings };

            // Update local cache with merged data
            categorySettingsCache = normalizePaletteSettings(mergedSettings);
            writeCategorySettingsToLocal(categorySettingsCache);

            return { ...categorySettingsCache };
        } catch (error) {
            if (isPermissionDenied(error)) {
                firestoreAccess.disableCategorySettings();
                console.info('Firestore category settings access denied; continuing with local cache only.');
            } else {
                console.warn('Error fetching from Firestore, using localStorage only:', error);
            }
        }
    }

    return localSettings;
}

export async function setCategoryColor(category, color) {
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('User must be authenticated to set category colors');
    }

    const name = (category || '').trim();
    if (!name) {
        return;
    }
    const normalizedColor = (color || '').trim().toLowerCase();
    if (normalizedColor && !HEX_COLOR_PATTERN.test(normalizedColor)) {
        throw new Error('Invalid colour format.');
    }

    ensureCategorySettingsCache();
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
        categorySettingsCache[name] = normalizePaletteSettings({ [name]: { ...existing, color: normalizedColor } })[name];
    }

    categorySettingsCache = normalizePaletteSettings(categorySettingsCache);
    writeCategorySettingsToLocal(categorySettingsCache);

    // Try to sync to Firestore as backup (optional)
    if (firestoreAccess.canFetchCategorySettings) {
        try {
            const docRef = doc(categorySettingsCollection, categoryDocId(name));
            const payload = { userId, name };
            if (categorySettingsCache[name]?.color) {
                payload.color = categorySettingsCache[name].color;
            }
            if (typeof categorySettingsCache[name]?.visible === 'boolean') {
                payload.visible = categorySettingsCache[name].visible;
            }
            if (!normalizedColor) {
                if (payload.visible === false) {
                    await setDoc(docRef, { ...payload, color: deleteField() }, { merge: true });
                } else {
                    await deleteDoc(docRef);
                }
            } else {
                payload.color = normalizedColor;
                await setDoc(docRef, payload, { merge: true });
            }
        } catch (error) {
            if (isPermissionDenied(error)) {
                firestoreAccess.disableCategorySettings();
                console.info('Firestore category settings access denied; continuing with local cache only.');
            } else {
                console.warn('Unable to sync category color to Firestore (using localStorage only):', error);
            }
            // Don't throw error - localStorage save was successful
        }
    }
}

export async function setCategoryVisibility(category, visible = true) {
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('User must be authenticated to update category visibility');
    }

    const name = (category || '').trim();
    if (!name) {
        return;
    }

    ensureCategorySettingsCache();
    const existing = categorySettingsCache[name] || {};
    const updatedEntry = normalizePaletteSettings({ [name]: { ...existing, visible } })[name];

    if (updatedEntry.visible === true && !updatedEntry.color) {
        delete categorySettingsCache[name];
    } else {
        categorySettingsCache[name] = updatedEntry;
    }
    categorySettingsCache = normalizePaletteSettings(categorySettingsCache);
    writeCategorySettingsToLocal(categorySettingsCache);

    if (firestoreAccess.canFetchCategorySettings) {
        try {
            const docRef = doc(categorySettingsCollection, categoryDocId(name));
            const payload = { userId, name, visible };
            if (categorySettingsCache[name]?.color) {
                payload.color = categorySettingsCache[name].color;
            }
            if (visible === true && !payload.color) {
                await deleteDoc(docRef);
            } else {
                await setDoc(docRef, payload, { merge: true });
            }
        } catch (error) {
            if (isPermissionDenied(error)) {
                firestoreAccess.disableCategorySettings();
                console.info('Firestore category settings access denied; continuing with local cache only.');
            } else {
                console.warn('Unable to update category visibility (using local cache only):', error);
            }
        }
    }

    return true;
}

async function removeCategorySetting(category) {
    const name = (category || '').trim();
    if (!name) {
        return;
    }
    const docRef = doc(categorySettingsCollection, categoryDocId(name));
    try {
        await deleteDoc(docRef);
    } catch (error) {
        console.warn('Unable to remove category setting', error);
    }
    ensureCategorySettingsCache();
    if (categorySettingsCache && Object.prototype.hasOwnProperty.call(categorySettingsCache, name)) {
        delete categorySettingsCache[name];
        categorySettingsCache = normalizePaletteSettings(categorySettingsCache);
        writeCategorySettingsToLocal(categorySettingsCache);
    }
}

export async function renameCategory(currentName, nextName) {
    const current = (currentName || '').trim();
    const next = (nextName || '').trim();
    if (!current || !next || current === next) {
        return { updatedIdeas: 0 };
    }

    const ideas = await getIdeas();
    const matching = ideas.filter(idea => {
        const categories = idea.categories || (idea.category ? [idea.category] : []);
        return categories.some(cat => (cat || '').trim().toLowerCase() === current.toLowerCase());
    });

    if (matching.length) {
        const batch = writeBatch(db);
        matching.forEach(idea => {
            const updated = normalizeCategories(
                idea.categories.map(cat =>
                    cat.trim().toLowerCase() === current.toLowerCase() ? next : cat
                )
            );
            batch.update(doc(ideasCollection, idea.id), {
                category: updated[0] || '',
                categories: updated
            });
        });
        try {
            await batch.commit();
        } catch (error) {
            console.error('Unable to rename category ideas in Firestore', error);
            throw error;
        }
    }

    if (ideasCache) {
        ideasCache = ideasCache.map(idea => {
            const categories = idea.categories || (idea.category ? [idea.category] : []);
            if (!categories.some(cat => (cat || '').trim().toLowerCase() === current.toLowerCase())) {
                return idea;
            }
            const updated = normalizeCategories(
                categories.map(cat =>
                    (cat || '').trim().toLowerCase() === current.toLowerCase() ? next : (cat || '').trim()
                )
            );
            return {
                ...idea,
                category: updated[0] || '',
                categories: updated
            };
        });
        writeIdeasToLocal(ideasCache);
    }

    const oldRef = doc(categorySettingsCollection, categoryDocId(current));
    const newRef = doc(categorySettingsCollection, categoryDocId(next));
    let preservedColor = '';
    let newRefHasColor = false;
    try {
        const [oldSnapshot, newSnapshot] = await Promise.all([
            getDoc(oldRef),
            getDoc(newRef)
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
        await setDoc(newRef, payload, { merge: true });
        if (oldSnapshot.exists()) {
            await deleteDoc(oldRef);
        }
    } catch (error) {
        console.warn('Unable to migrate category settings during rename', error);
    }

    ensureCategorySettingsCache();
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
        writeCategorySettingsToLocal(categorySettingsCache);
    }

    return { updatedIdeas: matching.length };
}

export async function getIdeas({ force = false } = {}) {
    if (!force && ideasCache) {
        return [...ideasCache].sort((a, b) => a.createdAt - b.createdAt);
    }

    try {
        return await fetchIdeasFromFirestore();
    } catch (error) {
        console.error('Error fetching ideas from Firestore, using local cache', error);
        const localIdeas = readIdeasFromLocal().sort((a, b) => a.createdAt - b.createdAt);
        ideasCache = localIdeas;
        return [...localIdeas];
    }
}

export function subscribeToIdeas(callback) {
    let unsubscribe = () => { };

    getCurrentUserId().then(userId => {
        if (!userId) {
            console.warn('[subscribeToIdeas] No userId; skipping Firestore subscription.');
            return;
        }
        // Query without orderBy to avoid needing a composite index
        // We'll sort in memory instead
        const q = query(
            ideasCollection,
            where('userId', '==', userId)
        );
        unsubscribe = onSnapshot(q, (snapshot) => {
            const ideas = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                ideas.push({
                    id: doc.id,
                    ...data
                });
            });

            // Sort in memory by createdAt descending
            ideas.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            // Update cache and localStorage
            ideasCache = ideas;
            writeIdeasToLocal(ideas);

            // Notify subscriber
            callback(ideas);
        }, (error) => {
            console.error('[subscribeToIdeas] Error in snapshot listener:', error);
            // Fall back to cache on error
            if (ideasCache) {
                callback([...ideasCache]);
            }
        });
    }).catch(error => {
        console.error('[subscribeToIdeas] Error getting user ID:', error);
    });

    // Return unsubscribe function
    return () => unsubscribe();
}

export async function saveIdea(idea) {
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('User must be authenticated to save ideas');
    }

    const categories = normalizeCategories(
        idea.categories || (idea.category ? [idea.category] : [])
    );
    const payload = {
        ...idea,
        userId,
        createdAt: idea.createdAt ?? Date.now(),
        archived: idea.archived ?? false,
        hidden: idea.hidden ?? false,
        pinned: idea.pinned ?? false,
        category: categories[0] || '',
        categories
    };

    const applyLocal = () => {
        updateIdeasCache(existing => {
            const filtered = existing.filter(i => i.id !== payload.id);
            filtered.push(payload);
            return filtered.sort((a, b) => a.createdAt - b.createdAt);
        });
    };

    await runMutation({
        type: 'saveIdea',
        payload,
        userId,
        applyLocal
    });

    return true;
}

export async function setIdeaArchived(id, archived = true) {
    const targetId = (id || '').trim();
    if (!targetId) {
        return false;
    }
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('User must be authenticated to update ideas');
    }

    const applyLocal = () => {
        updateIdeasCache(existing => existing.map(idea =>
            idea.id === targetId
                ? { ...idea, archived, pinned: archived ? false : idea.pinned }
                : idea
        ));
    };

    await runMutation({
        type: 'setIdeaArchived',
        payload: { id: targetId, archived },
        userId,
        applyLocal
    });

    return true;
}

export async function setIdeaHidden(id, hidden = true) {
    const targetId = (id || '').trim();
    if (!targetId) {
        return false;
    }
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('User must be authenticated to update ideas');
    }

    const applyLocal = () => {
        updateIdeasCache(existing => existing.map(idea =>
            idea.id === targetId
                ? { ...idea, hidden, pinned: hidden ? false : idea.pinned }
                : idea
        ));
    };

    await runMutation({
        type: 'setIdeaHidden',
        payload: { id: targetId, hidden },
        userId,
        applyLocal
    });

    return true;
}

export async function setIdeaPinned(id, pinned = true) {
    const targetId = (id || '').trim();
    if (!targetId) {
        return false;
    }
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('User must be authenticated to update ideas');
    }

    let snapshot = getIdeasCacheSnapshot();
    if (!snapshot.length) {
        snapshot = await getIdeas();
    }
    const unpinnedIds = pinned
        ? snapshot.filter(idea => idea.id !== targetId && idea.pinned).map(idea => idea.id)
        : [];

    const applyLocal = () => {
        updateIdeasCache(existing => existing.map(idea => {
            if (idea.id === targetId) {
                return { ...idea, pinned };
            }
            if (pinned && idea.pinned) {
                return { ...idea, pinned: false };
            }
            return idea;
        }));
    };

    await runMutation({
        type: 'setIdeaPinned',
        payload: { id: targetId, pinned, unpinnedIds },
        userId,
        applyLocal
    });

    return true;
}

export async function setIdeaCategories(id, categoriesInput = []) {
    const targetId = (id || '').trim();
    if (!targetId) return false;

    const normalized = normalizeCategories(
        Array.isArray(categoriesInput) ? categoriesInput : [categoriesInput]
    );
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('User must be authenticated to update ideas');
    }

    const applyLocal = () => {
        updateIdeasCache(existing => existing.map(idea =>
            idea.id === targetId
                ? { ...idea, category: normalized[0] || '', categories: normalized }
                : idea
        ));
    };

    await runMutation({
        type: 'setIdeaCategories',
        payload: { id: targetId, categories: normalized, category: normalized[0] || '' },
        userId,
        applyLocal
    });

    return true;
}

async function cleanupUnusedCategories(categories = []) {
    if (!Array.isArray(categories) || !categories.length) {
        return;
    }
    const snapshot = getIdeasCacheSnapshot();
    for (const category of categories) {
        if (!category) continue;
        const categoryStillExists = snapshot.some(idea => {
            const ideaCategories = idea.categories || (idea.category ? [idea.category] : []);
            return ideaCategories.some(cat => (cat || '').trim().toLowerCase() === category.toLowerCase());
        });

        if (!categoryStillExists) {
            try {
                await removeCategorySetting(category);
            } catch (error) {
                console.warn('Unable to remove unused category setting', error);
            }
            if (typeof window !== 'undefined') {
                const event = new CustomEvent('categoryDeleted', {
                    detail: { category }
                });
                window.dispatchEvent(event);
            }
        }
    }
}

export async function deleteIdea(id) {
    const targetId = (id || '').trim();
    if (!targetId) {
        return false;
    }

    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('User must be authenticated to delete ideas');
    }

    const existingIdeas = await getIdeas();
    const ideaToDelete = existingIdeas.find(i => i.id === targetId);
    const deletedCategories = ideaToDelete
        ? normalizeCategories(ideaToDelete.categories || (ideaToDelete.category ? [ideaToDelete.category] : []))
        : [];

    const applyLocal = () => {
        updateIdeasCache(current => current.filter(i => i.id !== targetId));
    };

    await runMutation({
        type: 'deleteIdea',
        payload: { id: targetId },
        userId,
        applyLocal
    });

    await cleanupUnusedCategories(deletedCategories);

    return true;
}

export async function getCategories() {
    const ideas = await getIdeas();
    const collected = new Set();
    ideas.forEach(idea => {
        const categories = idea.categories || (idea.category ? [idea.category] : []);
        categories.forEach(category => {
            const value = (category || '').trim();
            if (value) collected.add(value);
        });
    });
    return Array.from(collected);
}

export async function updateIdeaText(id, text = '', tags) {
    const targetId = (id || '').trim();
    if (!targetId) {
        return false;
    }
    const newText = (text || '').trim();
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('User must be authenticated to update ideas');
    }

    const applyLocal = () => {
        updateIdeasCache(existing => existing.map(idea =>
            idea.id === targetId ? { ...idea, text: newText, ...(tags ? { tags } : {}) } : idea
        ));
    };

    const payload = { id: targetId, text: newText };
    if (Array.isArray(tags)) {
        payload.tags = tags;
    }

    await runMutation({
        type: 'updateIdeaText',
        payload,
        userId,
        applyLocal
    });

    return true;
}

export async function updateIdeaPriority(id, priority = '') {
    const targetId = (id || '').trim();
    if (!targetId) {
        return false;
    }
    const newPriority = (priority || '').trim();
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('User must be authenticated to update ideas');
    }

    const applyLocal = () => {
        updateIdeasCache(existing => existing.map(idea =>
            idea.id === targetId ? { ...idea, priority: newPriority } : idea
        ));
    };

    await runMutation({
        type: 'updateIdeaPriority',
        payload: { id: targetId, priority: newPriority },
        userId,
        applyLocal
    });

    return true;
}

// Category usage tracking for most recently used sorting
export function trackCategoryUsage(category) {
    if (!category) return;

    try {
        const usage = JSON.parse(localStorage.getItem(LOCAL_CATEGORY_USAGE_KEY) || '{}');
        usage[category] = Date.now();
        localStorage.setItem(LOCAL_CATEGORY_USAGE_KEY, JSON.stringify(usage));
    } catch (error) {
        console.error('Error tracking category usage:', error);
    }
}

export function getCategoriesByRecentUsage(categories) {
    try {
        const usage = JSON.parse(localStorage.getItem(LOCAL_CATEGORY_USAGE_KEY) || '{}');
        return categories.slice().sort((a, b) => {
            const timeA = usage[a] || 0;
            const timeB = usage[b] || 0;
            return timeB - timeA; // Most recent first
        });
    } catch (error) {
        console.error('Error getting categories by usage:', error);
        return categories;
    }
}

// --- Thread Notes (Comments) ---

const LOCAL_NOTES_CACHE_KEY = 'thread_notes_cache_v1';

function readNotesCache() {
    try {
        const raw = localStorage.getItem(LOCAL_NOTES_CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.warn('[Notes] Unable to read notes cache', error);
        return {};
    }
}

function writeNotesCache(cache) {
    try {
        localStorage.setItem(LOCAL_NOTES_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.warn('[Notes] Unable to write notes cache', error);
    }
}

export function getNotesFromLocal(ideaId) {
    if (!ideaId) return [];
    const cache = readNotesCache();
    return cache[ideaId] || [];
}

function writeNotesToLocal(ideaId, notes) {
    if (!ideaId) return;
    const cache = readNotesCache();
    cache[ideaId] = notes;
    writeNotesCache(cache);
}

export function getNoteCount(ideaId) {
    return getNotesFromLocal(ideaId).length;
}

export async function addNote(ideaId, text) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("User not authenticated");
    if (!ideaId) throw new Error("Idea ID is required");
    if (!text?.trim()) throw new Error("Note text is required");

    const noteData = {
        text: text.trim(),
        userId,
        createdAt: Date.now()
    };

    // Optimistic UI: Add to local cache immediately
    const localId = generateLocalId('note');
    const optimisticNote = { id: localId, ...noteData, pending: true };
    const currentNotes = getNotesFromLocal(ideaId);
    writeNotesToLocal(ideaId, [...currentNotes, optimisticNote]);

    try {
        // Write to Firestore
        const coll = collection(db, 'ideas', ideaId, 'comments');
        const docRef = await addDoc(coll, noteData);

        // Update local cache with real ID
        const updatedNotes = getNotesFromLocal(ideaId).map(note =>
            note.id === localId ? { ...note, id: docRef.id, pending: false } : note
        );
        writeNotesToLocal(ideaId, updatedNotes);

        return { id: docRef.id, ...noteData };
    } catch (error) {
        console.error('[Notes] Failed to add note:', error);

        // Remove optimistic note on failure
        const revertedNotes = getNotesFromLocal(ideaId).filter(note => note.id !== localId);
        writeNotesToLocal(ideaId, revertedNotes);

        throw error;
    }
}

// Legacy alias for backwards compatibility
export const addComment = addNote;

export function subscribeToNotes(ideaId, callback, onError) {
    // Return a no-op unsubscribe if no ideaId
    if (!ideaId) return () => { };

    // Immediately return cached notes while loading from Firestore
    const cachedNotes = getNotesFromLocal(ideaId);
    if (cachedNotes.length > 0) {
        callback(cachedNotes);
    }

    const coll = collection(db, 'ideas', ideaId, 'comments');
    const q = query(coll, orderBy('createdAt', 'asc'));

    return onSnapshot(q, (snapshot) => {
        const notes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Update local cache
        writeNotesToLocal(ideaId, notes);

        callback(notes);
    }, (error) => {
        console.error('[Notes] Subscription error:', error);

        // On error, return cached data if available
        const fallbackNotes = getNotesFromLocal(ideaId);
        if (fallbackNotes.length > 0) {
            callback(fallbackNotes);
        }

        if (onError) {
            onError(error);
        }
    });
}

// Legacy alias for backwards compatibility
export const subscribeToComments = subscribeToNotes;

/**
 * User Settings
 */

const DEFAULT_USER_SETTINGS = {
    shortcuts: {
        save: 'meta+enter',
        focusInput: 'n',
        search: '/',
        nextIdea: 'j',
        prevIdea: 'k',
        hideUnhide: 'h'
    }
};

let userSettingsCache = null;

export async function getUserSettings() {
    if (userSettingsCache) return userSettingsCache;

    // Try local storage first
    try {
        const stored = localStorage.getItem(LOCAL_USER_SETTINGS_KEY);
        if (stored) {
            userSettingsCache = JSON.parse(stored);
            return userSettingsCache;
        }
    } catch (e) {
        console.warn('Unable to read user settings from local storage', e);
    }

    // Try Firestore
    const userId = await getCurrentUserId();
    if (userId) {
        try {
            const docSnap = await getDoc(doc(userSettingsCollection, userId));
            if (docSnap.exists()) {
                userSettingsCache = { ...DEFAULT_USER_SETTINGS, ...docSnap.data() };
                localStorage.setItem(LOCAL_USER_SETTINGS_KEY, JSON.stringify(userSettingsCache));
                return userSettingsCache;
            }
        } catch (e) {
            console.warn('Unable to fetch user settings from Firestore', e);
        }
    }

    userSettingsCache = DEFAULT_USER_SETTINGS;
    return userSettingsCache;
}

export async function updateUserSettings(settings) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    userSettingsCache = { ...userSettingsCache, ...settings };
    localStorage.setItem(LOCAL_USER_SETTINGS_KEY, JSON.stringify(userSettingsCache));

    await runMutation({
        type: 'updateUserSettings',
        payload: { userId, settings: userSettingsCache },
        userId
    });
}
