import {
  SEED_IDEAS,
  SEED_CATEGORY_PALETTE,
  SEED_CANVAS_LAYOUT,
  SEED_PAGE_NOTES,
  SEED_NOTE_FOLDERS,
  SEED_THREAD_NOTES,
} from './seed-data.js';

let instance = null;

function createMemoryStore(initialItems, { sortFn } = {}) {
  let items = [...initialItems];
  const listeners = new Set();

  function sorted(arr) {
    return sortFn ? arr.sort(sortFn) : arr;
  }

  function notify() {
    const snapshot = [...items];
    for (const cb of listeners) cb(snapshot);
  }

  function subscribe(callback) {
    listeners.add(callback);
    callback([...items]);
    return () => listeners.delete(callback);
  }

  function getCached() {
    return [...items];
  }

  function getAll() {
    return Promise.resolve([...items]);
  }

  function updateCache(mutator) {
    items = sorted(mutator([...items]));
    notify();
  }

  function _setCache(newItems) {
    items = sorted([...newItems]);
    notify();
  }

  function save(item) {
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      items[idx] = { ...items[idx], ...item };
    } else {
      items.push({ ...item, id: item.id || 'demo-' + Date.now() });
    }
    items = sorted([...items]);
    notify();
    return Promise.resolve(item);
  }

  function update(id, fields) {
    const idx = items.findIndex((i) => i.id === id);
    if (idx >= 0) {
      items[idx] = { ...items[idx], ...fields };
      notify();
    }
    return Promise.resolve();
  }

  function deleteItem(id) {
    items = items.filter((i) => i.id !== id);
    notify();
    return Promise.resolve();
  }

  return { subscribe, getCached, getAll, updateCache, _setCache, save, update, delete: deleteItem };
}

function createDemoIdeas() {
  const store = createMemoryStore(SEED_IDEAS, {
    sortFn: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
  });

  function setArchived(id, archived) {
    return store.update(id, { archived, pinned: false });
  }
  function setHidden(id, hidden) {
    return store.update(id, { hidden, pinned: false });
  }
  function setPinned(id, pinned) {
    return store.update(id, { pinned });
  }
  function setCategories(id, categories) {
    return store.update(id, { categories, category: categories[0] || '' });
  }
  function updateText(id, text, tags) {
    return store.update(id, { text, tags: tags || [] });
  }
  function updatePriority(id, priority) {
    return store.update(id, { priority });
  }
  function deleteIdea(id) {
    return store.delete(id);
  }
  function getUniqueCategories() {
    const cats = new Set();
    for (const idea of store.getCached()) {
      for (const c of idea.categories || []) cats.add(c);
    }
    return [...cats];
  }

  return {
    subscribe: store.subscribe,
    getCached: store.getCached,
    getAll: store.getAll,
    updateCache: store.updateCache,
    _setCache: store._setCache,
    save: store.save,
    setArchived,
    setHidden,
    setPinned,
    setCategories,
    updateText,
    updatePriority,
    delete: deleteIdea,
    deleteIdea,
    getUniqueCategories,
    onCategoriesOrphaned: null,
  };
}

function createDemoCategories() {
  let palette = { ...SEED_CATEGORY_PALETTE };
  const listeners = new Set();

  function notify() {
    for (const cb of listeners) cb({ ...palette });
  }

  function subscribe(callback) {
    listeners.add(callback);
    callback({ ...palette });
    return () => listeners.delete(callback);
  }

  function getPalette() {
    return Promise.resolve({ ...palette });
  }

  function setColor(category, color) {
    palette[category] = { ...(palette[category] || { visible: true }), color };
    notify();
    return Promise.resolve();
  }

  function setVisibility(category, visible) {
    palette[category] = { ...(palette[category] || { color: '#9e9e9e' }), visible };
    notify();
    return Promise.resolve();
  }

  function removeCategorySetting(category) {
    delete palette[category];
    notify();
    return Promise.resolve();
  }

  function renameCategory(currentName, nextName) {
    if (palette[currentName]) {
      palette[nextName] = palette[currentName];
      delete palette[currentName];
    }
    notify();
    return Promise.resolve();
  }

  function cleanupUnused() { return Promise.resolve(); }

  function trackUsage() {}

  function getByRecentUsage(categories) {
    return categories;
  }

  return {
    subscribe,
    getPalette,
    setColor,
    setVisibility,
    removeCategorySetting,
    renameCategory,
    cleanupUnused,
    trackUsage,
    getByRecentUsage,
    getIdeasForRename: null,
  };
}

function createDemoCanvas() {
  let layout = JSON.parse(JSON.stringify(SEED_CANVAS_LAYOUT));
  const listeners = new Set();

  function notify() {
    for (const cb of listeners) cb(JSON.parse(JSON.stringify(layout)));
  }

  function subscribe(callback) {
    listeners.add(callback);
    callback(JSON.parse(JSON.stringify(layout)));
    return () => listeners.delete(callback);
  }

  function load() {
    return Promise.resolve(JSON.parse(JSON.stringify(layout)));
  }

  function save(newLayout) {
    layout = JSON.parse(JSON.stringify(newLayout));
    return Promise.resolve();
  }

  return { load, save, subscribe };
}

function createDemoThreadNotes() {
  const threads = JSON.parse(JSON.stringify(SEED_THREAD_NOTES));
  const listenersByIdea = new Map();

  function notifyIdea(ideaId) {
    const notes = threads[ideaId] || [];
    const listeners = listenersByIdea.get(ideaId);
    if (listeners) {
      for (const cb of listeners) cb([...notes]);
    }
  }

  function subscribe(ideaId, callback) {
    if (!listenersByIdea.has(ideaId)) listenersByIdea.set(ideaId, new Set());
    listenersByIdea.get(ideaId).add(callback);
    callback([...(threads[ideaId] || [])]);
    return () => listenersByIdea.get(ideaId)?.delete(callback);
  }

  function add(ideaId, text) {
    if (!threads[ideaId]) threads[ideaId] = [];
    const note = {
      id: 'demo-thread-' + Date.now(),
      text,
      createdAt: Date.now(),
      userId: 'demo-user',
    };
    threads[ideaId].push(note);
    notifyIdea(ideaId);
    return Promise.resolve(note);
  }

  function deleteNote(ideaId, noteId) {
    if (threads[ideaId]) {
      threads[ideaId] = threads[ideaId].filter((n) => n.id !== noteId);
      notifyIdea(ideaId);
    }
    return Promise.resolve();
  }

  function update(ideaId, noteId, text) {
    const notes = threads[ideaId];
    if (notes) {
      const note = notes.find((n) => n.id === noteId);
      if (note) note.text = text;
      notifyIdea(ideaId);
    }
    return Promise.resolve();
  }

  function getCached(ideaId) {
    return [...(threads[ideaId] || [])];
  }

  function getCount(ideaId) {
    return (threads[ideaId] || []).length;
  }

  function _seedCache(ideaId, notes) {
    threads[ideaId] = [...notes];
  }

  return { subscribe, add, delete: deleteNote, update, getCached, getCount, _seedCache };
}

export function getDemoStorage() {
  if (instance) return instance;

  const ideas = createDemoIdeas();
  const categories = createDemoCategories();
  const pageNotes = createMemoryStore(SEED_PAGE_NOTES, {
    sortFn: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  });
  const noteFolders = createMemoryStore(SEED_NOTE_FOLDERS, {
    sortFn: (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  });
  const canvas = createDemoCanvas();
  const threadNotes = createDemoThreadNotes();

  ideas.onCategoriesOrphaned = (cats) => categories.cleanupUnused(cats);
  categories.getIdeasForRename = () => ideas.getCached();

  instance = {
    ideas,
    categories,
    pageNotes,
    noteFolders,
    canvas,
    threadNotes,
    mutations: {
      getPendingCount: () => 0,
      flush: () => Promise.resolve(),
    },
  };

  return instance;
}
