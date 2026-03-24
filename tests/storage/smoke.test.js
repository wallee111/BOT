import { describe, it, expect } from 'vitest';
import { FakeLocalStorage } from '../helpers/fake-local-storage.js';
import { FakeFirestore } from '../helpers/fake-firestore.js';

describe('FakeLocalStorage', () => {
  it('stores and retrieves values', () => {
    const ls = new FakeLocalStorage();
    ls.setItem('key', 'value');
    expect(ls.getItem('key')).toBe('value');
  });

  it('returns null for missing keys', () => {
    const ls = new FakeLocalStorage();
    expect(ls.getItem('missing')).toBeNull();
  });
});

describe('FakeFirestore', () => {
  it('seeds and retrieves documents', async () => {
    const fs = new FakeFirestore();
    fs._seed('ideas', 'idea-1', { text: 'hello', userId: 'u1' });
    const ref = fs.doc(fs.collection('ideas'), 'idea-1');
    const snap = await fs.getDoc(ref);
    expect(snap.exists()).toBe(true);
    expect(snap.data().text).toBe('hello');
  });
});
