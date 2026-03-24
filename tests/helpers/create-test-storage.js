import { FakeFirestore } from './fake-firestore.js';
import { FakeLocalStorage } from './fake-local-storage.js';
import { vi } from 'vitest';

export function createTestDeps(overrides = {}) {
  return {
    firestore: new FakeFirestore(),
    auth: { getCurrentUserId: async () => 'test-user' },
    localStorage: new FakeLocalStorage(),
    isOffline: () => false,
    perfMonitor: {
      trackWrite: vi.fn(),
      trackRead: vi.fn(),
      trackCacheHit: vi.fn(),
      trackCacheMiss: vi.fn(),
      startTimer: vi.fn(),
      endTimer: vi.fn(),
    },
    emitEvent: vi.fn(),
    ...overrides,
  };
}
