import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageNotesStore } from '../../src/lib/storage/domains/page-notes.js';
import { createMutationQueue } from '../../src/lib/storage/mutation-queue.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createPageNotesStore', () => {
  let deps, queue, pageNotes;

  beforeEach(() => {
    deps = createTestDeps();
    queue = createMutationQueue(deps);
    pageNotes = createPageNotesStore(deps, queue);
  });

  it('save creates a page note with defaults', async () => {
    const result = await pageNotes.save({ title: 'Test Note', content: 'Body' });
    expect(result.id).toBeTruthy();
    expect(result.userId).toBe('test-user');
    expect(result.folderId).toBeNull();
  });

  it('subscribe emits cached data first', () => {
    deps.localStorage.setItem('notes_v1_cache', JSON.stringify([
      { id: 'n1', title: 'cached', userId: 'test-user', createdAt: 100, updatedAt: 200 }
    ]));
    const callback = vi.fn();
    pageNotes.subscribe(callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0][0].id).toBe('n1');
  });

  it('delete removes note via mutation queue', async () => {
    deps.firestore._seed('notes', 'n1', { title: 'note', userId: 'test-user' });
    pageNotes._setCache([{ id: 'n1', title: 'note', userId: 'test-user' }]);
    await pageNotes.delete('n1');
    expect(pageNotes.getCached().find(n => n.id === 'n1')).toBeUndefined();
  });
});
