const { transformIdea, transformCategory } = require('./transform');

// Stub Timestamp — avoids firebase-admin credential requirement in tests
function makeTimestamp(isoString) {
  return { toDate: () => new Date(isoString) };
}

describe('transformIdea', () => {
  it('converts a Firestore doc snapshot to a plain idea object', () => {
    const ts = makeTimestamp('2026-02-27T10:00:00.000Z');
    const fakeDoc = {
      id: 'idea-abc',
      data: () => ({
        text: 'Build search filter',
        categories: ['Updates'],
        tags: ['ux'],
        priority: 0,
        pinned: false,
        archived: false,
        hidden: false,
        userId: 'user-123',
        createdAt: ts,
      }),
    };

    const result = transformIdea(fakeDoc);

    expect(result).toEqual({
      id: 'idea-abc',
      text: 'Build search filter',
      categories: ['Updates'],
      tags: ['ux'],
      priority: 0,
      pinned: false,
      archived: false,
      createdAt: '2026-02-27T10:00:00.000Z',
    });
    // userId is NOT exposed in the response
    expect(result.userId).toBeUndefined();
  });

  it('handles missing optional fields gracefully', () => {
    const fakeDoc = {
      id: 'idea-xyz',
      data: () => ({
        text: 'Minimal idea',
        userId: 'user-123',
        createdAt: makeTimestamp('2026-01-01T00:00:00.000Z'),
      }),
    };

    const result = transformIdea(fakeDoc);

    expect(result.categories).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.pinned).toBe(false);
    expect(result.archived).toBe(false);
    expect(result.priority).toBe(0);
  });

  it('preserves explicit priority 0 as 0', () => {
    const fakeDoc = {
      id: 'idea-p0',
      data: () => ({ text: 'Zero priority idea', priority: 0, userId: 'u', createdAt: null }),
    };
    expect(transformIdea(fakeDoc).priority).toBe(0);
  });
});

describe('transformCategory', () => {
  it('converts a Firestore category doc to a plain object', () => {
    const fakeDoc = {
      id: 'cat-123',
      data: () => ({
        name: 'Updates',
        color: '#ffca28',
        userId: 'user-123',
      }),
    };

    const result = transformCategory(fakeDoc);

    expect(result).toEqual({
      id: 'cat-123',
      name: 'Updates',
      color: '#ffca28',
    });
    expect(result.userId).toBeUndefined();
  });

  it('returns null color when color field is absent', () => {
    const fakeDoc = {
      id: 'cat-456',
      data: () => ({ name: 'General', userId: 'user-123' }),
    };
    const result = transformCategory(fakeDoc);
    expect(result.color).toBeNull();
  });
});
