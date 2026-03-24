import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc,
  writeBatch, query, where, onSnapshot, deleteField, addDoc, orderBy, limit,
  enableIndexedDbPersistence, enableMultiTabIndexedDbPersistence, Timestamp,
} from 'firebase/firestore';
import { app } from '../firebase.js';
import { getCurrentUserId } from '../auth.js';
import { perfMonitor } from '../performance.js';
import { createStorage } from './create-storage.js';

const db = getFirestore(app);

// Persistence setup — full fallback chain
try {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('[Firestore] Multi-tab persistence unavailable, trying single-tab');
      enableIndexedDbPersistence(db).catch((innerErr) => {
        if (innerErr.code === 'unimplemented') {
          console.warn('[Firestore] Persistence not available in this browser');
        } else {
          console.error('[Firestore] Error enabling persistence:', innerErr);
        }
      });
    } else if (err.code === 'unimplemented') {
      console.warn('[Firestore] Persistence not available in this browser');
    } else {
      console.error('[Firestore] Error enabling multi-tab persistence:', err);
    }
  });
} catch (err) {
  console.error('[Firestore] Persistence setup error:', err);
}

// Wrap Firestore SDK into adapter
const firestoreAdapter = {
  collection: (name) => collection(db, name),
  doc: (collRef, id) => {
    if (typeof collRef === 'string') return doc(db, collRef, id);
    return id ? doc(collRef, id) : doc(collRef);
  },
  getDoc: (docRef) => getDoc(docRef),
  getDocs: (q) => getDocs(q),
  setDoc: (docRef, data, opts) => setDoc(docRef, data, opts),
  updateDoc: (docRef, data) => updateDoc(docRef, data),
  deleteDoc: (docRef) => deleteDoc(docRef),
  addDoc: (collRef, data) => addDoc(collRef, data),
  writeBatch: () => writeBatch(db),
  query: (collRef, ...constraints) => query(collRef, ...constraints),
  where: (field, op, value) => where(field, op, value),
  orderBy: (field, dir) => orderBy(field, dir),
  limit: (n) => limit(n),
  onSnapshot: (ref, cb, errCb) => onSnapshot(ref, cb, errCb),
  deleteField: () => deleteField(),
  Timestamp,
};

export const storage = createStorage({
  firestore: firestoreAdapter,
  auth: { getCurrentUserId },
  localStorage: window.localStorage,
  isOffline: () => navigator.onLine === false,
  perfMonitor,
  emitEvent: (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail })),
});

// Side effects previously at module scope in storage.js
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    storage.mutations.flush().catch(err =>
      console.warn('Unable to flush pending mutations on reconnect', err)
    );
  });
  setTimeout(() => {
    storage.mutations.flush().catch(err =>
      console.warn('Initial mutation flush failed', err)
    );
  }, 1000);
}
