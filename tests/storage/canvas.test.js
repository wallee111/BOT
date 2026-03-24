import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCanvasStore } from '../../src/lib/storage/domains/canvas.js';
import { createTestDeps } from '../helpers/create-test-storage.js';

describe('createCanvasStore', () => {
  let deps, canvas;
  beforeEach(() => { deps = createTestDeps(); canvas = createCanvasStore(deps); });

  it('load returns default layout when no data exists', async () => {
    const layout = await canvas.load();
    expect(layout.cards).toEqual([]);
    expect(layout.headers).toEqual([]);
    expect(layout.viewport).toEqual({ panX: 0, panY: 0, zoom: 1.0 });
  });

  it('load returns Firestore data when it exists', async () => {
    deps.firestore._seed('canvasLayouts', 'test-user', {
      cards: [{ categoryName: 'work', x: 10, y: 20, width: 100, bodyHeight: 50 }],
      headers: [], viewport: { panX: 5, panY: 10, zoom: 1.5 },
    });
    const layout = await canvas.load();
    expect(layout.cards[0].categoryName).toBe('work');
    expect(layout.viewport.zoom).toBe(1.5);
  });

  it('save writes to localStorage immediately', () => {
    canvas.save({
      cards: [{ categoryName: 'work', x: 0, y: 0, width: 100, bodyHeight: 50 }],
      headers: [], viewport: { panX: 0, panY: 0, zoom: 1 },
    });
    const stored = JSON.parse(deps.localStorage.getItem('canvas_layout_v1'));
    expect(stored.cards[0].categoryName).toBe('work');
  });

  it('subscribe calls back when Firestore doc changes', async () => {
    deps.firestore._seed('canvasLayouts', 'test-user', {
      cards: [], headers: [], viewport: { panX: 0, panY: 0, zoom: 1 },
    });
    const callback = vi.fn();
    canvas.subscribe(callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
  });

  it('normalizes viewport zoom to valid range', async () => {
    deps.firestore._seed('canvasLayouts', 'test-user', {
      cards: [], headers: [], viewport: { panX: 0, panY: 0, zoom: 999 },
    });
    const layout = await canvas.load();
    expect(layout.viewport.zoom).toBeLessThanOrEqual(3.0);
  });
});
