import { describe, it, expect } from 'vitest';
import { generateLocalId, isPermissionDenied, shouldQueueMutationForError } from '../../src/lib/storage/utils.js';
import { withAuthGate } from '../../src/lib/storage/auth-gate.js';

describe('generateLocalId', () => {
  it('returns a string with the given prefix', () => {
    const id = generateLocalId('test');
    expect(id).toMatch(/^test-/);
  });
  it('generates unique IDs', () => {
    const a = generateLocalId('x');
    const b = generateLocalId('x');
    expect(a).not.toBe(b);
  });
});

describe('isPermissionDenied', () => {
  it('returns true for permission-denied code', () => {
    expect(isPermissionDenied({ code: 'permission-denied' })).toBe(true);
  });
  it('returns true for insufficient permissions message', () => {
    expect(isPermissionDenied({ message: 'Insufficient permissions' })).toBe(true);
  });
  it('returns false for network errors', () => {
    expect(isPermissionDenied({ code: 'unavailable' })).toBe(false);
  });
});

describe('shouldQueueMutationForError', () => {
  it('returns true for unavailable errors', () => {
    expect(shouldQueueMutationForError({ code: 'unavailable' })).toBe(true);
  });
  it('returns true for network message errors', () => {
    expect(shouldQueueMutationForError({ message: 'network error' })).toBe(true);
  });
  it('returns false for permission errors', () => {
    expect(shouldQueueMutationForError({ code: 'permission-denied' })).toBe(false);
  });
  it('returns false for null', () => {
    expect(shouldQueueMutationForError(null)).toBe(false);
  });
});

describe('withAuthGate', () => {
  it('calls fn with userId when authenticated', async () => {
    const auth = { getCurrentUserId: async () => 'user-1' };
    const fn = withAuthGate(auth, (userId, x) => `${userId}:${x}`);
    const result = await fn('hello');
    expect(result).toBe('user-1:hello');
  });
  it('throws when not authenticated', async () => {
    const auth = { getCurrentUserId: async () => null };
    const fn = withAuthGate(auth, () => {});
    await expect(fn()).rejects.toThrow('User must be authenticated');
  });
});
