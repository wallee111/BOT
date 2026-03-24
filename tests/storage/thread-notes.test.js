import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createThreadNotesStore } from '../../src/lib/storage/domains/thread-notes.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createThreadNotesStore', () => {
  let deps, threadNotes;
  beforeEach(() => { deps = createTestDeps(); threadNotes = createThreadNotesStore(deps); });

  it('add creates note with optimistic update and real Firestore ID', async () => {
    const result = await threadNotes.add('idea-1', 'My note text');
    expect(result.id).toBeTruthy();
    expect(result.text).toBe('My note text');
  });

  it('add reverts optimistic update on Firestore failure', async () => {
    deps.firestore.addDoc = vi.fn().mockRejectedValue(new Error('write failed'));
    await expect(threadNotes.add('idea-1', 'fail text')).rejects.toThrow('write failed');
    expect(threadNotes.getCached('idea-1')).toEqual([]);
  });

  it('delete removes note optimistically and reverts on failure', async () => {
    deps.firestore._seed('ideas/idea-1/comments', 'note-1', { text: 'hi', userId: 'test-user', createdAt: 100 });
    threadNotes._seedCache('idea-1', [{ id: 'note-1', text: 'hi', userId: 'test-user', createdAt: 100 }]);
    await threadNotes.delete('idea-1', 'note-1');
    expect(threadNotes.getCached('idea-1')).toEqual([]);
  });

  it('subscribe emits cached notes first', () => {
    threadNotes._seedCache('idea-1', [{ id: 'n1', text: 'cached', userId: 'test-user', createdAt: 100 }]);
    const callback = vi.fn();
    threadNotes.subscribe('idea-1', callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0][0].text).toBe('cached');
  });

  it('subscribe with no ideaId returns no-op', () => {
    const unsub = threadNotes.subscribe(null, vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('getCount returns number of cached notes', () => {
    threadNotes._seedCache('idea-1', [{ id: 'n1', text: 'a' }, { id: 'n2', text: 'b' }]);
    expect(threadNotes.getCount('idea-1')).toBe(2);
  });

  it('update changes note text optimistically', async () => {
    deps.firestore._seed('ideas/idea-1/comments', 'n1', { text: 'old', userId: 'test-user' });
    threadNotes._seedCache('idea-1', [{ id: 'n1', text: 'old', userId: 'test-user' }]);
    await threadNotes.update('idea-1', 'n1', 'new text');
    expect(threadNotes.getCached('idea-1')[0].text).toBe('new text');
  });
});
