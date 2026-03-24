import { storage } from './index.js';

// Build the mapping
const COMPAT_MAP = {
  // Ideas
  saveIdea: (idea) => storage.ideas.save(idea),
  getIdeas: (opts) => storage.ideas.getAll(opts),
  subscribeToIdeas: (cb) => storage.ideas.subscribe(cb),
  setIdeaArchived: (id, archived) => storage.ideas.setArchived(id, archived),
  setIdeaHidden: (id, hidden) => storage.ideas.setHidden(id, hidden),
  setIdeaPinned: (id, pinned) => storage.ideas.setPinned(id, pinned),
  setIdeaCategories: (id, cats) => storage.ideas.setCategories(id, cats),
  deleteIdea: (id) => storage.ideas.delete(id),
  updateIdeaText: (id, text, tags) => storage.ideas.updateText(id, text, tags),
  updateIdeaPriority: (id, priority) => storage.ideas.updatePriority(id, priority),
  getCategories: async (opts) => storage.ideas.getUniqueCategories(opts),

  // Categories
  getCategoryPalette: (opts) => storage.categories.getPalette(opts),
  setCategoryColor: (name, hex) => storage.categories.setColor(name, hex),
  setCategoryVisibility: (name, visible) => storage.categories.setVisibility(name, visible),
  renameCategory: (from, to) => storage.categories.renameCategory(from, to),
  subscribeToCategorySettings: (cb) => storage.categories.subscribe(cb),
  trackCategoryUsage: (cat) => storage.categories.trackUsage(cat),
  getCategoriesByRecentUsage: (cats) => storage.categories.getByRecentUsage(cats),

  // Page Notes
  subscribeToPageNotes: (cb) => storage.pageNotes.subscribe(cb),
  savePageNote: (note) => storage.pageNotes.save(note),
  deletePageNote: (id) => storage.pageNotes.delete(id),

  // Note Folders
  subscribeToNoteFolders: (cb) => storage.noteFolders.subscribe(cb),
  saveNoteFolder: (folder) => storage.noteFolders.save(folder),
  deleteNoteFolder: (id) => storage.noteFolders.delete(id),

  // Canvas
  loadCanvasLayout: () => storage.canvas.load(),
  saveCanvasLayout: (layout) => storage.canvas.save(layout),
  subscribeToCanvasLayout: (cb) => storage.canvas.subscribe(cb),

  // Thread Notes
  subscribeToNotes: (ideaId, cb, onError) => storage.threadNotes.subscribe(ideaId, cb, onError),
  addNote: (ideaId, text) => storage.threadNotes.add(ideaId, text),
  deleteNote: (ideaId, noteId) => storage.threadNotes.delete(ideaId, noteId),
  updateNoteText: (ideaId, noteId, text) => storage.threadNotes.update(ideaId, noteId, text),
  getNotesFromLocal: (ideaId) => storage.threadNotes.getCached(ideaId),
  getNoteCount: (ideaId) => storage.threadNotes.getCount(ideaId),

  // Legacy aliases
  addComment: (ideaId, text) => storage.threadNotes.add(ideaId, text),
  subscribeToComments: (ideaId, cb, onError) => storage.threadNotes.subscribe(ideaId, cb, onError),

  // Mutation queue
  getPendingMutationCount: () => storage.mutations.getPendingCount(),
  flushPendingMutations: (opts) => storage.mutations.flush(opts),
};

// Named exports for existing callers
export const {
  saveIdea, getIdeas, subscribeToIdeas, setIdeaArchived, setIdeaHidden,
  setIdeaPinned, setIdeaCategories, deleteIdea, updateIdeaText, updateIdeaPriority,
  getCategories,
  getCategoryPalette, setCategoryColor, setCategoryVisibility, renameCategory,
  subscribeToCategorySettings, trackCategoryUsage, getCategoriesByRecentUsage,
  subscribeToPageNotes, savePageNote, deletePageNote,
  subscribeToNoteFolders, saveNoteFolder, deleteNoteFolder,
  loadCanvasLayout, saveCanvasLayout, subscribeToCanvasLayout,
  subscribeToNotes, addNote, deleteNote, updateNoteText,
  getNotesFromLocal, getNoteCount,
  addComment, subscribeToComments,
  getPendingMutationCount, flushPendingMutations,
} = COMPAT_MAP;

export { COMPAT_MAP };
