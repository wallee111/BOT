import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCategoriesStore } from '../../src/lib/storage/domains/categories.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createCategoriesStore', () => {
  let deps, categories;

  beforeEach(() => {
    deps = createTestDeps();
    categories = createCategoriesStore(deps);
  });

  it('getPalette returns empty object when no settings exist', async () => {
    const palette = await categories.getPalette();
    expect(palette).toEqual({});
  });

  it('setColor stores color in localStorage and Firestore', async () => {
    await categories.setColor('work', '#ff0000');
    const palette = await categories.getPalette();
    expect(palette.work?.color).toBe('#ff0000');
  });

  it('setVisibility updates visibility flag', async () => {
    await categories.setVisibility('work', false);
    const palette = await categories.getPalette();
    expect(palette.work?.visible).toBe(false);
  });

  it('circuit breaker disables Firestore after permission-denied', async () => {
    const origSetDoc = deps.firestore.setDoc.bind(deps.firestore);
    deps.firestore.setDoc = vi.fn().mockRejectedValue({ code: 'permission-denied' });
    await categories.setColor('work', '#ff0000');
    deps.firestore.setDoc = vi.fn().mockResolvedValue(undefined);
    await categories.setColor('personal', '#00ff00');
    expect(deps.firestore.setDoc).not.toHaveBeenCalled();
  });

  it('trackUsage records timestamp in localStorage', () => {
    categories.trackUsage('work');
    const raw = deps.localStorage.getItem('category_usage_v1');
    const usage = JSON.parse(raw);
    expect(typeof usage.work).toBe('number');
  });

  it('getByRecentUsage sorts by most recent first', () => {
    deps.localStorage.setItem('category_usage_v1', JSON.stringify({
      work: 100, personal: 200, school: 50,
    }));
    const sorted = categories.getByRecentUsage(['work', 'personal', 'school']);
    expect(sorted[0]).toBe('personal');
    expect(sorted[2]).toBe('school');
  });

  it('subscribe calls back with palette on snapshot', async () => {
    deps.firestore._seed('categorySettings', 'work', { name: 'work', color: '#ff0000', userId: 'test-user' });
    const callback = vi.fn();
    categories.subscribe(callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
    const palette = callback.mock.calls[0][0];
    expect(palette.work?.color).toBe('#ff0000');
  });

  it('cleanupUnused removes setting and emits event', async () => {
    deps.firestore._seed('categorySettings', 'orphan', { name: 'orphan', userId: 'test-user' });
    await categories.cleanupUnused(['orphan']);
    expect(deps.emitEvent).toHaveBeenCalledWith('categoryDeleted', expect.objectContaining({ category: 'orphan' }));
  });
});
