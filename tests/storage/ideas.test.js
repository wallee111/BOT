import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIdeasStore } from '../../src/lib/storage/domains/ideas.js';
import { createMutationQueue } from '../../src/lib/storage/mutation-queue.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createIdeasStore', () => {
  let deps, queue, ideas;

  beforeEach(() => {
    deps = createTestDeps();
    queue = createMutationQueue(deps);
    ideas = createIdeasStore(deps, queue);
  });

  it('save creates idea with normalized fields', async () => {
    await ideas.save({ id: 'i1', text: 'hello', category: 'work' });
    const snap = await deps.firestore.getDoc(deps.firestore.doc(deps.firestore.collection('ideas'), 'i1'));
    expect(snap.exists()).toBe(true);
    expect(snap.data().categories).toEqual(['work']);
    expect(snap.data().userId).toBe('test-user');
  });

  it('save returns true', async () => {
    const result = await ideas.save({ id: 'i1', text: 'hello' });
    expect(result).toBe(true);
  });

  it('setArchived updates archived field and clears pinned', async () => {
    deps.firestore._seed('ideas', 'i1', { text: 'hello', userId: 'test-user', archived: false, pinned: true });
    ideas._setCache([{ id: 'i1', text: 'hello', userId: 'test-user', archived: false, pinned: true, categories: [], category: '', tags: [], priority: '', createdAt: 1, hidden: false }]);
    await ideas.setArchived('i1', true);
    expect(ideas.getCached().find(i => i.id === 'i1').archived).toBe(true);
    expect(ideas.getCached().find(i => i.id === 'i1').pinned).toBe(false);
  });

  it('setCategories normalizes category array', async () => {
    deps.firestore._seed('ideas', 'i1', { text: 'hello', userId: 'test-user' });
    ideas._setCache([{ id: 'i1', text: 'hello', userId: 'test-user', categories: [], category: '', tags: [], priority: '', createdAt: 1, archived: false, hidden: false, pinned: false }]);
    await ideas.setCategories('i1', ['Work', ' work ', 'Personal']);
    const idea = ideas.getCached().find(i => i.id === 'i1');
    expect(idea.categories.length).toBeLessThanOrEqual(2);
  });

  it('getUniqueCategories returns distinct category names', async () => {
    ideas._setCache([
      { id: 'i1', categories: ['work', 'personal'], category: 'work', text: '', tags: [], priority: '', createdAt: 1, archived: false, hidden: false, pinned: false, userId: 'test-user' },
      { id: 'i2', categories: ['work'], category: 'work', text: '', tags: [], priority: '', createdAt: 2, archived: false, hidden: false, pinned: false, userId: 'test-user' },
    ]);
    // Make cache valid
    deps.localStorage.setItem('ideas_v1_cache_ts', Date.now().toString());
    const cats = await ideas.getUniqueCategories();
    expect(cats).toContain('work');
    expect(cats).toContain('personal');
    expect(cats.length).toBe(2);
  });

  it('delete calls onCategoriesOrphaned when category becomes unused', async () => {
    deps.firestore._seed('ideas', 'i1', { text: 'only idea with work', userId: 'test-user', categories: ['work'], category: 'work' });
    ideas._setCache([{ id: 'i1', text: 'only idea', userId: 'test-user', categories: ['work'], category: 'work', tags: [], priority: '', createdAt: 1, archived: false, hidden: false, pinned: false }]);
    const orphanSpy = vi.fn();
    ideas.onCategoriesOrphaned = orphanSpy;
    await ideas.delete('i1');
    expect(orphanSpy).toHaveBeenCalledWith(['work']);
  });

  it('delete returns true', async () => {
    deps.firestore._seed('ideas', 'i1', { text: 'bye', userId: 'test-user' });
    ideas._setCache([{ id: 'i1', text: 'bye', userId: 'test-user', categories: [], category: '', tags: [], priority: '', createdAt: 1, archived: false, hidden: false, pinned: false }]);
    const result = await ideas.delete('i1');
    expect(result).toBe(true);
  });
});
