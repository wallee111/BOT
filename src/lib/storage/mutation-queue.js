import { generateLocalId, shouldQueueMutationForError } from './utils.js';

const QUEUE_KEY = 'ideas_mutation_queue_v1';
const QUEUE_EVENT = 'ideasMutationQueueChanged';

export function createMutationQueue(deps) {
  const { localStorage, isOffline, auth, emitEvent } = deps;
  const executors = {};
  let isFlushing = false;
  let pendingFlushHandle = null;

  function readQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function writeQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      emitEvent(QUEUE_EVENT, { count: queue.length });
    } catch { /* ignore quota errors */ }
  }

  function enqueue(entry) {
    const queue = readQueue();
    queue.push(entry);
    writeQueue(queue);
  }

  function scheduleFlush(delay = 1500) {
    if (pendingFlushHandle) return;
    pendingFlushHandle = setTimeout(() => {
      pendingFlushHandle = null;
      flush().catch(err => console.warn('Scheduled mutation flush failed', err));
    }, delay);
  }

  function register(type, executor) { executors[type] = executor; }
  function getPendingCount() { return readQueue().length; }

  async function run({ type, payload, userId, applyLocal }) {
    if (!type || typeof executors[type] !== 'function') {
      throw new Error(`Unsupported mutation type: ${type}`);
    }
    const entry = {
      id: generateLocalId(type),
      type, payload, userId,
      createdAt: Date.now(),
    };

    if (isOffline()) {
      applyLocal?.();
      enqueue(entry);
      scheduleFlush();
      return { queued: true };
    }

    try {
      await executors[type](payload);
      applyLocal?.();
      return { queued: false };
    } catch (error) {
      if (shouldQueueMutationForError(error)) {
        applyLocal?.();
        enqueue(entry);
        scheduleFlush();
        return { queued: true };
      }
      throw error;
    }
  }

  async function flush({ force = false } = {}) {
    if (isFlushing) return false;
    if (!force && isOffline()) return false;

    isFlushing = true;
    try {
      const currentUserId = await auth.getCurrentUserId();
      if (!currentUserId) return false;

      const queue = readQueue();
      if (!queue.length) return true;

      const remaining = [];
      let mutated = false;
      let networkError = false;

      for (const entry of queue) {
        if (networkError) { remaining.push(entry); continue; }
        if (entry.userId && entry.userId !== currentUserId) { remaining.push(entry); continue; }
        const executor = executors[entry.type];
        if (typeof executor !== 'function') {
          console.warn('Skipping unknown mutation type', entry.type);
          mutated = true;
          continue;
        }
        try {
          await executor(entry.payload);
          mutated = true;
        } catch (error) {
          if (shouldQueueMutationForError(error)) {
            remaining.push(entry);
            networkError = true;
          } else {
            console.error(`Dropping failed offline mutation (${entry.type})`, error);
            mutated = true;
          }
        }
      }

      if (mutated || remaining.length !== queue.length) { writeQueue(remaining); }
      return remaining.length === 0;
    } finally { isFlushing = false; }
  }

  function destroy() {
    clearTimeout(pendingFlushHandle);
    pendingFlushHandle = null;
  }

  return { register, run, flush, getPendingCount, destroy };
}
