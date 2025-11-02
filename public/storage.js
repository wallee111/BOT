import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
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
    orderBy,
    query,
    where,
    onSnapshot,
    deleteField
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { HEX_COLOR_PATTERN, normalizeCategories } from './utils.js?v=2';
import { getCurrentUserId } from './auth.js';

const firebaseConfig = {
    apiKey: 'AIzaSyAQzyF1tkzPtmR3jTBaV5I5wZMrTdroX6A',
    authDomain: 'device-dev-1-c0700.firebaseapp.com',
    projectId: 'device-dev-1-c0700',
    storageBucket: 'device-dev-1-c0700.firebasestorage.app',
    messagingSenderId: '494337535749',
    appId: '1:494337535749:web:fb1c8bfb05b6364490916c'
};

const LOCAL_CACHE_KEY = 'ideas_v1_cache';
const LOCAL_CATEGORY_SETTINGS_KEY = 'category_settings_v1';
const LOCAL_CATEGORY_USAGE_KEY = 'category_usage_v1';

const isPermissionDenied = (error) => 
    /permission[-_ ]denied/i.test(error?.code || error?.name || '') || 
    /insufficient permissions/i.test(error?.message || '');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ideasCollection = collection(db, 'ideas');
const categorySettingsCollection = collection(db, 'categorySettings');

let ideasCache = null;
let categorySettingsCache = null;
let categorySettingsFetchDisabled = false;

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
    console.log('[fetchIdeasFromFirestore] Fetching with userId:', userId);
    
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
    console.log('[fetchIdeasFromFirestore] Found', snapshot.size, 'documents');
    
    snapshot.docs.forEach(doc => {
        console.log('[fetchIdeasFromFirestore] Document:', doc.id, 'userId:', doc.data().userId);
    });
    
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
    const shouldAttemptFirestore = !categorySettingsFetchDisabled && (force || !Object.keys(localSettings).length);
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
                categorySettingsFetchDisabled = true;
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
    if (!categorySettingsFetchDisabled) {
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
                categorySettingsFetchDisabled = true;
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

    if (!categorySettingsFetchDisabled) {
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
                categorySettingsFetchDisabled = true;
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
    let unsubscribe = () => {};
    
    getCurrentUserId().then(userId => {
        if (!userId) {
            console.warn('[subscribeToIdeas] No userId; skipping Firestore subscription.');
            return;
        }
        console.log('[subscribeToIdeas] Subscribing with userId:', userId);
        
        // Query without orderBy to avoid needing a composite index
        // We'll sort in memory instead
        const q = query(
            ideasCollection,
            where('userId', '==', userId)
        );
        
        unsubscribe = onSnapshot(q, (snapshot) => {
            console.log('[subscribeToIdeas] Received snapshot with', snapshot.size, 'documents');
            
            const ideas = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                console.log('[subscribeToIdeas] Document:', doc.id, 'userId:', data.userId);
                ideas.push({
                    id: doc.id,
                    ...data
                });
            });
            
            // Sort in memory by createdAt descending
            ideas.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            
            console.log('[subscribeToIdeas] Total ideas after sorting:', ideas.length);
            
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

    try {
        await setDoc(doc(ideasCollection, payload.id), payload);
        if (ideasCache) {
            ideasCache = [...ideasCache.filter(i => i.id !== payload.id), payload]
                .sort((a, b) => a.createdAt - b.createdAt);
            writeIdeasToLocal(ideasCache);
        } else {
            await fetchIdeasFromFirestore();
        }
        return true;
    } catch (error) {
        console.error('Error saving idea to Firestore:', error);
        throw error;
    }
}

export async function setIdeaArchived(id, archived = true) {
    try {
        const updatePayload = { archived };
        if (archived) {
            updatePayload.pinned = false;
        }
        await updateDoc(doc(ideasCollection, id), updatePayload);
        if (ideasCache) {
            ideasCache = ideasCache.map(idea =>
                idea.id === id
                    ? { ...idea, archived, pinned: archived ? false : idea.pinned }
                    : idea
            );
            writeIdeasToLocal(ideasCache);
        }
        return true;
    } catch (error) {
        console.error('Error updating idea archive status:', error);
        throw error;
    }
}

export async function setIdeaHidden(id, hidden = true) {
    try {
        const updatePayload = { hidden };
        if (hidden) {
            updatePayload.pinned = false;
        }
        await updateDoc(doc(ideasCollection, id), updatePayload);
        if (ideasCache) {
            ideasCache = ideasCache.map(idea =>
                idea.id === id
                    ? { ...idea, hidden, pinned: hidden ? false : idea.pinned }
                    : idea
            );
            writeIdeasToLocal(ideasCache);
        }
        return true;
    } catch (error) {
        console.error('Error updating idea hidden status:', error);
        throw error;
    }
}

export async function setIdeaPinned(id, pinned = true) {
    const targetId = (id || '').trim();
    if (!targetId) {
        return false;
    }
    const targetRef = doc(ideasCollection, targetId);
    try {
        if (pinned) {
            const existingIdeas = ideasCache ?? await getIdeas({ force: true });
            const batch = writeBatch(db);
            batch.update(targetRef, { pinned: true });
            existingIdeas.forEach(idea => {
                if (idea.id !== targetId && idea.pinned) {
                    batch.update(doc(ideasCollection, idea.id), { pinned: false });
                }
            });
            await batch.commit();
        } else {
            await updateDoc(targetRef, { pinned: false });
        }

        if (!ideasCache) {
            await fetchIdeasFromFirestore();
        }
        if (ideasCache) {
            ideasCache = ideasCache.map(idea => {
                if (idea.id === targetId) {
                    return { ...idea, pinned };
                }
                if (pinned && idea.pinned) {
                    return { ...idea, pinned: false };
                }
                return idea;
            });
            writeIdeasToLocal(ideasCache);
        }

        return true;
    } catch (error) {
        console.error('Error updating idea pinned status:', error);
        throw error;
    }
}

export async function setIdeaCategories(id, categoriesInput = []) {
    const targetId = (id || '').trim();
    if (!targetId) return false;
    
    const normalized = normalizeCategories(
        Array.isArray(categoriesInput) ? categoriesInput : [categoriesInput]
    );
    try {
        await updateDoc(doc(ideasCollection, targetId), {
            category: normalized[0] || '',
            categories: normalized
        });
        if (ideasCache) {
            ideasCache = ideasCache.map(idea =>
                idea.id === targetId
                    ? { ...idea, category: normalized[0] || '', categories: normalized }
                    : idea
            );
            writeIdeasToLocal(ideasCache);
        } else {
            await fetchIdeasFromFirestore();
        }
        return true;
    } catch (error) {
        console.error('Error updating idea categories:', error);
        throw error;
    }
}

export async function deleteIdea(id) {
    const existingIdeas = await getIdeas();
    const ideaToDelete = existingIdeas.find(i => i.id === id);

    try {
        await deleteDoc(doc(ideasCollection, id));
        if (ideasCache) {
            ideasCache = ideasCache.filter(i => i.id !== id);
            writeIdeasToLocal(ideasCache);
        } else {
            await fetchIdeasFromFirestore();
        }

        const deletedCategories = ideaToDelete
            ? normalizeCategories(ideaToDelete.categories || (ideaToDelete.category ? [ideaToDelete.category] : []))
            : [];

        for (const category of deletedCategories) {
            const categoryStillExists = ideasCache?.some(idea => {
                const categories = idea.categories || (idea.category ? [idea.category] : []);
                return categories.some(cat => (cat || '').trim().toLowerCase() === category.toLowerCase());
            });

            if (!categoryStillExists) {
                await removeCategorySetting(category);
                const event = new CustomEvent('categoryDeleted', {
                    detail: { category }
                });
                window.dispatchEvent(event);
            }
        }
    } catch (error) {
        console.error('Error deleting idea from Firestore:', error);
        throw error;
    }
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

export async function updateIdeaText(id, text = '') {
    const newText = (text || '').trim();
    try {
        await updateDoc(doc(ideasCollection, id), { text: newText });
        if (ideasCache) {
            ideasCache = ideasCache.map(idea =>
                idea.id === id ? { ...idea, text: newText } : idea
            );
            writeIdeasToLocal(ideasCache);
        }
        return true;
    } catch (error) {
        console.error('Error updating idea text:', error);
        throw error;
    }
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
