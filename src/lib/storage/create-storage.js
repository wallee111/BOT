import { createMutationQueue } from './mutation-queue.js';
import { createIdeasStore } from './domains/ideas.js';
import { createCategoriesStore } from './domains/categories.js';
import { createPageNotesStore } from './domains/page-notes.js';
import { createNoteFoldersStore } from './domains/note-folders.js';
import { createCanvasStore } from './domains/canvas.js';
import { createThreadNotesStore } from './domains/thread-notes.js';
import { createTodosStore } from './domains/todos.js';

export function createStorage(deps) {
  const mutationQueue = createMutationQueue(deps);

  const ideas = createIdeasStore(deps, mutationQueue);
  const categories = createCategoriesStore(deps);
  const pageNotes = createPageNotesStore(deps, mutationQueue);
  const noteFolders = createNoteFoldersStore(deps, mutationQueue, pageNotes);
  const canvas = createCanvasStore(deps);
  const threadNotes = createThreadNotesStore(deps);
  const todos = createTodosStore(deps, mutationQueue);

  // Cross-store wiring
  ideas.onCategoriesOrphaned = (cats) => categories.cleanupUnused(cats);
  categories.getIdeasForRename = () => ideas.getCached();

  return {
    ideas, categories, pageNotes, noteFolders, canvas, threadNotes, todos,
    mutations: {
      getPendingCount: () => mutationQueue.getPendingCount(),
      flush: (opts) => mutationQueue.flush(opts),
    },
  };
}
