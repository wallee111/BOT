import { vi } from 'vitest';

class FakeDocSnapshot {
  constructor(id, data) {
    this._id = id;
    this._data = data;
  }
  get id() { return this._id; }
  exists() { return this._data !== undefined; }
  data() { return this._data ? { ...this._data } : undefined; }
}

class FakeQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
  }
  forEach(fn) { this.docs.forEach(fn); }
}

class FakeCollectionRef {
  constructor(store, path) {
    this._store = store;
    this.path = path;
  }
  get id() { return this.path; }
}

class FakeDocRef {
  constructor(store, collectionPath, docId) {
    this._store = store;
    this.path = `${collectionPath}/${docId}`;
    this._collectionPath = collectionPath;
    this._docId = docId;
  }
  get id() { return this._docId; }
}

class FakeBatch {
  constructor(store) {
    this._store = store;
    this._ops = [];
  }
  set(docRef, data, opts) {
    this._ops.push({ type: 'set', docRef, data, opts });
    return this;
  }
  update(docRef, data) {
    this._ops.push({ type: 'update', docRef, data });
    return this;
  }
  delete(docRef) {
    this._ops.push({ type: 'delete', docRef });
    return this;
  }
  async commit() {
    for (const op of this._ops) {
      const key = op.docRef.path;
      if (op.type === 'delete') {
        this._store._data.delete(key);
      } else if (op.type === 'set') {
        const existing = this._store._data.get(key) || {};
        this._store._data.set(key, op.opts?.merge ? { ...existing, ...op.data } : { ...op.data });
      } else if (op.type === 'update') {
        const existing = this._store._data.get(key);
        if (existing) {
          this._store._data.set(key, { ...existing, ...op.data });
        }
      }
    }
    this._store._notifyListeners();
  }
}

export class FakeFirestore {
  constructor() {
    this._data = new Map();
    this._listeners = [];
    this._idCounter = 0;
  }

  _seed(collectionPath, docId, data) {
    this._data.set(`${collectionPath}/${docId}`, data);
  }

  _getAll(collectionPath) {
    const results = [];
    for (const [key, value] of this._data) {
      if (key.startsWith(`${collectionPath}/`) && key.split('/').length === collectionPath.split('/').length + 1) {
        const docId = key.slice(collectionPath.length + 1);
        results.push(new FakeDocSnapshot(docId, value));
      }
    }
    return results;
  }

  _notifyListeners() {
    for (const listener of this._listeners) {
      if (listener.type === 'doc') {
        const data = this._data.get(listener.docPath);
        listener.callback(new FakeDocSnapshot(listener.docPath.split('/').pop(), data));
        continue;
      }
      const docs = this._getAll(listener.collectionPath)
        .filter(doc => {
          if (!listener.filters) return true;
          return listener.filters.every(f => {
            const val = doc.data()?.[f.field];
            if (f.op === '==') return val === f.value;
            return true;
          });
        });
      listener.callback(new FakeQuerySnapshot(docs));
    }
  }

  collection(path) {
    return new FakeCollectionRef(this, path);
  }

  doc(collectionRefOrPath, docId) {
    if (typeof collectionRefOrPath === 'string') {
      return new FakeDocRef(this, collectionRefOrPath, docId);
    }
    if (docId) {
      return new FakeDocRef(this, collectionRefOrPath.path, docId);
    }
    const id = `auto-${++this._idCounter}`;
    return new FakeDocRef(this, collectionRefOrPath.path, id);
  }

  async getDoc(docRef) {
    const data = this._data.get(docRef.path);
    return new FakeDocSnapshot(docRef._docId, data);
  }

  async getDocs(queryRef) {
    const docs = this._getAll(queryRef._collectionPath || queryRef.path)
      .filter(doc => {
        if (!queryRef._filters) return true;
        return queryRef._filters.every(f => {
          const val = doc.data()?.[f.field];
          if (f.op === '==') return val === f.value;
          return true;
        });
      });
    return new FakeQuerySnapshot(docs);
  }

  async setDoc(docRef, data, opts) {
    const existing = this._data.get(docRef.path) || {};
    this._data.set(docRef.path, opts?.merge ? { ...existing, ...data } : { ...data });
    this._notifyListeners();
  }

  async updateDoc(docRef, data) {
    const existing = this._data.get(docRef.path);
    if (!existing) throw new Error(`Document ${docRef.path} does not exist`);
    this._data.set(docRef.path, { ...existing, ...data });
    this._notifyListeners();
  }

  async deleteDoc(docRef) {
    this._data.delete(docRef.path);
    this._notifyListeners();
  }

  async addDoc(collectionRef, data) {
    const id = `auto-${++this._idCounter}`;
    const docRef = new FakeDocRef(this, collectionRef.path, id);
    this._data.set(docRef.path, { ...data });
    this._notifyListeners();
    return docRef;
  }

  query(collectionRef, ...constraints) {
    const filters = constraints.filter(c => c._type === 'where');
    return {
      _collectionPath: collectionRef.path,
      _filters: filters.map(f => ({ field: f._field, op: f._op, value: f._value })),
    };
  }

  where(field, op, value) {
    return { _type: 'where', _field: field, _op: op, _value: value };
  }

  orderBy(field, direction) {
    return { _type: 'orderBy', _field: field, _direction: direction };
  }

  limit(n) {
    return { _type: 'limit', _n: n };
  }

  onSnapshot(queryOrDocRef, callback, errorCallback) {
    if (queryOrDocRef instanceof FakeDocRef) {
      const listener = {
        type: 'doc',
        docPath: queryOrDocRef.path,
        callback,
        errorCallback,
      };
      this._listeners.push(listener);
      const data = this._data.get(queryOrDocRef.path);
      callback(new FakeDocSnapshot(queryOrDocRef._docId, data));
      return () => {
        const idx = this._listeners.indexOf(listener);
        if (idx >= 0) this._listeners.splice(idx, 1);
      };
    }

    const listener = {
      type: 'query',
      collectionPath: queryOrDocRef._collectionPath || queryOrDocRef.path,
      filters: queryOrDocRef._filters || [],
      callback,
      errorCallback,
    };
    this._listeners.push(listener);
    const docs = this._getAll(listener.collectionPath)
      .filter(doc => {
        if (!listener.filters?.length) return true;
        return listener.filters.every(f => {
          const val = doc.data()?.[f.field];
          if (f.op === '==') return val === f.value;
          return true;
        });
      });
    callback(new FakeQuerySnapshot(docs));
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  writeBatch() {
    return new FakeBatch(this);
  }

  deleteField() {
    return '__DELETE_FIELD__';
  }

  Timestamp = {
    fromMillis(ms) { return { toMillis: () => ms, _ms: ms }; },
  };
}
