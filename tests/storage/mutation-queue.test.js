import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMutationQueue } from '../../src/lib/storage/mutation-queue.js';
import { FakeLocalStorage } from '../helpers/fake-local-storage.js';

describe('createMutationQueue', () => {
  let ls, queue, emitEvent;

  beforeEach(() => {
    ls = new FakeLocalStorage();
    emitEvent = vi.fn();
    queue = createMutationQueue({
      localStorage: ls, isOffline: () => false,
      auth: { getCurrentUserId: async () => 'user-1' }, emitEvent,
    });
  });

  it('starts with zero pending', () => {
    expect(queue.getPendingCount()).toBe(0);
  });

  describe('register + run (online)', () => {
    it('calls executor immediately when online', async () => {
      const executor = vi.fn().mockResolvedValue(undefined);
      queue.register('testOp', executor);
      await queue.run({ type: 'testOp', payload: { x: 1 }, userId: 'user-1' });
      expect(executor).toHaveBeenCalledWith({ x: 1 });
      expect(queue.getPendingCount()).toBe(0);
    });
  });

  describe('run (offline)', () => {
    it('enqueues mutation when offline', async () => {
      queue = createMutationQueue({
        localStorage: ls, isOffline: () => true,
        auth: { getCurrentUserId: async () => 'user-1' }, emitEvent,
      });
      const executor = vi.fn();
      queue.register('testOp', executor);
      const applyLocal = vi.fn();
      const result = await queue.run({ type: 'testOp', payload: { x: 1 }, userId: 'user-1', applyLocal });
      expect(result.queued).toBe(true);
      expect(executor).not.toHaveBeenCalled();
      expect(applyLocal).toHaveBeenCalled();
      expect(queue.getPendingCount()).toBe(1);
    });
  });

  describe('run (network error)', () => {
    it('enqueues on retryable network error', async () => {
      const executor = vi.fn().mockRejectedValue({ code: 'unavailable' });
      queue.register('testOp', executor);
      const applyLocal = vi.fn();
      const result = await queue.run({ type: 'testOp', payload: { x: 1 }, userId: 'user-1', applyLocal });
      expect(result.queued).toBe(true);
      expect(applyLocal).toHaveBeenCalled();
    });

    it('throws on permission error', async () => {
      const executor = vi.fn().mockRejectedValue({ code: 'permission-denied' });
      queue.register('testOp', executor);
      await expect(queue.run({ type: 'testOp', payload: { x: 1 }, userId: 'user-1' }))
        .rejects.toEqual({ code: 'permission-denied' });
    });
  });

  describe('flush', () => {
    it('executes queued mutations on flush', async () => {
      const offlineQueue = createMutationQueue({
        localStorage: ls, isOffline: () => true,
        auth: { getCurrentUserId: async () => 'user-1' }, emitEvent,
      });
      const executor = vi.fn().mockResolvedValue(undefined);
      offlineQueue.register('testOp', executor);
      await offlineQueue.run({ type: 'testOp', payload: { x: 1 }, userId: 'user-1' });
      expect(offlineQueue.getPendingCount()).toBe(1);

      const onlineQueue = createMutationQueue({
        localStorage: ls, isOffline: () => false,
        auth: { getCurrentUserId: async () => 'user-1' }, emitEvent,
      });
      onlineQueue.register('testOp', executor);
      await onlineQueue.flush();
      expect(onlineQueue.getPendingCount()).toBe(0);
      expect(executor).toHaveBeenCalledWith({ x: 1 });
    });

    it('skips mutations from a different user', async () => {
      ls.setItem('ideas_mutation_queue_v1', JSON.stringify([
        { id: 'm1', type: 'testOp', payload: { x: 1 }, userId: 'user-2', createdAt: Date.now() }
      ]));
      const executor = vi.fn().mockResolvedValue(undefined);
      queue.register('testOp', executor);
      await queue.flush();
      expect(executor).not.toHaveBeenCalled();
      expect(queue.getPendingCount()).toBe(1);
    });

    it('drops non-retryable failures', async () => {
      ls.setItem('ideas_mutation_queue_v1', JSON.stringify([
        { id: 'm1', type: 'testOp', payload: { x: 1 }, userId: 'user-1', createdAt: Date.now() }
      ]));
      const executor = vi.fn().mockRejectedValue({ code: 'not-found' });
      queue.register('testOp', executor);
      await queue.flush();
      expect(queue.getPendingCount()).toBe(0);
    });
  });

  describe('event emission', () => {
    it('emits queue size on enqueue', async () => {
      queue = createMutationQueue({
        localStorage: ls, isOffline: () => true,
        auth: { getCurrentUserId: async () => 'user-1' }, emitEvent,
      });
      queue.register('testOp', vi.fn());
      await queue.run({ type: 'testOp', payload: {}, userId: 'user-1' });
      expect(emitEvent).toHaveBeenCalledWith('ideasMutationQueueChanged', { count: 1 });
    });
  });
});
