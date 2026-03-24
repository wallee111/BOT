export function withAuthGate(auth, fn) {
  return async (...args) => {
    const userId = await auth.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }
    return fn(userId, ...args);
  };
}
