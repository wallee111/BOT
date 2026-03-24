export function createLocalCache({ key, timestampKey, ttl, localStorage, writeDebounce = 0 }) {
  let memory = null;
  let pendingWrite = null;

  function read() {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.warn(`[LocalCache] Unable to read ${key}`, err);
      return [];
    }
  }

  function writeToStorage(data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(timestampKey, Date.now().toString());
    } catch (err) {
      console.warn(`[LocalCache] Unable to write ${key}`, err);
    }
  }

  function write(data) {
    if (writeDebounce > 0) {
      clearTimeout(pendingWrite);
      pendingWrite = setTimeout(() => writeToStorage(data), writeDebounce);
    } else {
      writeToStorage(data);
    }
  }

  function isValid() {
    try {
      const ts = localStorage.getItem(timestampKey);
      if (!ts) return false;
      return (Date.now() - parseInt(ts, 10)) < ttl;
    } catch {
      return false;
    }
  }

  function getMemory() { return memory; }
  function setMemory(data) { memory = data; }

  function update(mutator) {
    const current = memory || read();
    const working = Array.isArray(current) ? [...current] : [];
    const next = mutator(working) || [];
    memory = next;
    write(next);
    return next;
  }

  function clear() {
    memory = null;
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(timestampKey);
    } catch { /* ignore */ }
  }

  return { read, write, isValid, getMemory, setMemory, update, clear };
}
