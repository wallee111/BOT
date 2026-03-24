import { describe, it, expect } from 'vitest';
import { createStorage } from '../../src/lib/storage/create-storage.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('compat mapping coverage', () => {
  it('createStorage returns all domains needed by compat', () => {
    const deps = createTestDeps();
    const storage = createStorage(deps);

    // Verify all domains exist
    expect(storage.ideas).toBeDefined();
    expect(storage.categories).toBeDefined();
    expect(storage.pageNotes).toBeDefined();
    expect(storage.noteFolders).toBeDefined();
    expect(storage.canvas).toBeDefined();
    expect(storage.threadNotes).toBeDefined();
    expect(storage.mutations).toBeDefined();

    // Verify ideas methods
    expect(typeof storage.ideas.save).toBe('function');
    expect(typeof storage.ideas.getAll).toBe('function');
    expect(typeof storage.ideas.subscribe).toBe('function');
    expect(typeof storage.ideas.setArchived).toBe('function');
    expect(typeof storage.ideas.setHidden).toBe('function');
    expect(typeof storage.ideas.setPinned).toBe('function');
    expect(typeof storage.ideas.setCategories).toBe('function');
    expect(typeof storage.ideas.delete).toBe('function');
    expect(typeof storage.ideas.updateText).toBe('function');
    expect(typeof storage.ideas.updatePriority).toBe('function');
    expect(typeof storage.ideas.getUniqueCategories).toBe('function');

    // Verify categories methods
    expect(typeof storage.categories.getPalette).toBe('function');
    expect(typeof storage.categories.setColor).toBe('function');
    expect(typeof storage.categories.setVisibility).toBe('function');
    expect(typeof storage.categories.renameCategory).toBe('function');
    expect(typeof storage.categories.subscribe).toBe('function');
    expect(typeof storage.categories.trackUsage).toBe('function');
    expect(typeof storage.categories.getByRecentUsage).toBe('function');
    expect(typeof storage.categories.cleanupUnused).toBe('function');

    // Verify pageNotes, noteFolders, canvas, threadNotes, mutations
    expect(typeof storage.pageNotes.subscribe).toBe('function');
    expect(typeof storage.pageNotes.save).toBe('function');
    expect(typeof storage.pageNotes.delete).toBe('function');
    expect(typeof storage.noteFolders.subscribe).toBe('function');
    expect(typeof storage.noteFolders.save).toBe('function');
    expect(typeof storage.noteFolders.delete).toBe('function');
    expect(typeof storage.canvas.load).toBe('function');
    expect(typeof storage.canvas.save).toBe('function');
    expect(typeof storage.canvas.subscribe).toBe('function');
    expect(typeof storage.threadNotes.subscribe).toBe('function');
    expect(typeof storage.threadNotes.add).toBe('function');
    expect(typeof storage.threadNotes.delete).toBe('function');
    expect(typeof storage.threadNotes.update).toBe('function');
    expect(typeof storage.threadNotes.getCached).toBe('function');
    expect(typeof storage.threadNotes.getCount).toBe('function');
    expect(typeof storage.mutations.getPendingCount).toBe('function');
    expect(typeof storage.mutations.flush).toBe('function');
  });

  it('cross-store wiring works', async () => {
    const deps = createTestDeps();
    const storage = createStorage(deps);

    // Verify onCategoriesOrphaned was wired
    deps.firestore._seed('ideas', 'i1', { text: 'test', userId: 'test-user', categories: ['work'], category: 'work' });
    storage.ideas._setCache([{ id: 'i1', text: 'test', userId: 'test-user', categories: ['work'], category: 'work', tags: [], priority: '', createdAt: 1, archived: false, hidden: false, pinned: false }]);
    await storage.ideas.delete('i1');
    // cleanupUnused is async and not awaited by delete — give it a tick
    await new Promise(r => setTimeout(r, 10));
    expect(deps.emitEvent).toHaveBeenCalledWith('categoryDeleted', expect.objectContaining({ category: 'work' }));
  });
});
