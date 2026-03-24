import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNoteFoldersStore } from '../../src/lib/storage/domains/note-folders.js';
import { createPageNotesStore } from '../../src/lib/storage/domains/page-notes.js';
import { createMutationQueue } from '../../src/lib/storage/mutation-queue.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createNoteFoldersStore', () => {
  let deps, queue, pageNotes, noteFolders;

  beforeEach(() => {
    deps = createTestDeps();
    queue = createMutationQueue(deps);
    pageNotes = createPageNotesStore(deps, queue);
    noteFolders = createNoteFoldersStore(deps, queue, pageNotes);
  });

  it('save creates folder with defaults', async () => {
    const result = await noteFolders.save({ name: 'My Folder' });
    expect(result.name).toBe('My Folder');
    expect(result.sortOrder).toBe(0);
  });

  it('subscribe emits cached data first', () => {
    deps.localStorage.setItem('note_folders_v1', JSON.stringify([
      { id: 'f1', name: 'Folder', userId: 'test-user', createdAt: 100, updatedAt: 200, sortOrder: 0 }
    ]));
    const callback = vi.fn();
    noteFolders.subscribe(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('delete moves notes in folder to root before deleting folder', async () => {
    deps.firestore._seed('noteFolders', 'f1', { name: 'Folder', userId: 'test-user' });
    deps.firestore._seed('notes', 'n1', { title: 'note in folder', folderId: 'f1', userId: 'test-user' });
    noteFolders._setCache([{ id: 'f1', name: 'Folder', userId: 'test-user' }]);
    pageNotes._setCache([{ id: 'n1', title: 'note in folder', folderId: 'f1', userId: 'test-user' }]);

    const saveSpy = vi.spyOn(pageNotes, 'save');
    await noteFolders.delete('f1');

    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1', folderId: null }));
  });
});
