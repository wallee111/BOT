const NETWORK_RETRYABLE_CODES = new Set(['unavailable', 'deadline-exceeded']);

export const generateLocalId = (prefix = 'mutation') => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch (error) {
    // Ignore crypto access errors
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const isPermissionDenied = (error) =>
  /permission[-_ ]denied/i.test(error?.code || error?.name || '') ||
  /insufficient permissions/i.test(error?.message || '');

export const shouldQueueMutationForError = (error) => {
  if (!error) return false;
  const code = (error.code || error.name || '').toLowerCase();
  if (code.includes('permission')) return false;
  if (NETWORK_RETRYABLE_CODES.has(code)) return true;
  const message = (error.message || '').toLowerCase();
  return /network|fetch|offline|unreachable|timeout/.test(message);
};
