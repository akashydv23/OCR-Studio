/**
 * IndexedDB Storage Layer for Indic OCR Platform
 * 
 * Provides persistent storage for:
 * - Documents / Jobs (metadata, status, overall canonical model)
 * - Pages (page status, canonical JSON, rendered image blob/URL)
 * - Model Cache & Offline assets
 * 
 * Guarantees zero-data-loss resilience: if the tab is refreshed or closed mid-run,
 * the job state is safely stored in IndexedDB and can be resumed immediately.
 */

const DB_NAME = 'IndicOCR_Database_v2';
const DB_VERSION = 1;

class StorageEngine {
  constructor() {
    this.db = null;
    this._initPromise = null;
  }

  async init() {
    if (this.db) return this.db;
    if (this._initPromise) return this._initPromise;

    this._initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Documents / Jobs store
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'document_id' });
          docStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Pages store: compound key [document_id, page_number]
        if (!db.objectStoreNames.contains('pages')) {
          const pageStore = db.createObjectStore('pages', { keyPath: ['document_id', 'page_number'] });
          pageStore.createIndex('document_id', 'document_id', { unique: false });
          pageStore.createIndex('status', 'status', { unique: false });
        }

        // Image Cache (Blobs for original scanned pages & thumbnails)
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: ['document_id', 'page_number'] });
        }

        // Model / TrainedData Cache (offline support)
        if (!db.objectStoreNames.contains('model_cache')) {
          db.createObjectStore('model_cache', { keyPath: 'model_id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });

    return this._initPromise;
  }

  // --- Document Operations ---

  async saveDocument(document) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents'], 'readwrite');
      const store = tx.objectStore('documents');
      const data = document.toJSON ? document.toJSON() : document;
      const request = store.put(data);

      request.onsuccess = () => resolve(data.document_id);
      request.onerror = () => reject(request.error);
    });
  }

  async getDocument(documentId) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents'], 'readonly');
      const store = tx.objectStore('documents');
      const request = store.get(documentId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async listDocuments() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents'], 'readonly');
      const store = tx.objectStore('documents');
      const request = store.getAll();

      request.onsuccess = () => {
        const docs = request.result || [];
        docs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        resolve(docs);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteDocument(documentId) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents', 'pages', 'images'], 'readwrite');
      tx.objectStore('documents').delete(documentId);

      // Clean up associated pages
      const pageStore = tx.objectStore('pages');
      const pageIndex = pageStore.index('document_id');
      const pageReq = pageIndex.openKeyCursor(IDBKeyRange.only(documentId));
      pageReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          pageStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAll() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents', 'pages', 'images'], 'readwrite');
      tx.objectStore('documents').clear();
      tx.objectStore('pages').clear();
      tx.objectStore('images').clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Page Operations ---

  async savePageData(documentId, pageNumber, pageData) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['pages'], 'readwrite');
      const store = tx.objectStore('pages');
      const record = {
        document_id: documentId,
        page_number: pageNumber,
        ...pageData,
        updated_at: new Date().toISOString()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async getPageData(documentId, pageNumber) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['pages'], 'readonly');
      const store = tx.objectStore('pages');
      const req = store.get([documentId, pageNumber]);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllPagesForDoc(documentId) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['pages'], 'readonly');
      const store = tx.objectStore('pages');
      const index = store.index('document_id');
      const req = index.getAll(IDBKeyRange.only(documentId));

      req.onsuccess = () => {
        const pages = req.result || [];
        pages.sort((a, b) => a.page_number - b.page_number);
        resolve(pages);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // --- Image Cache Operations (Blob Storage) ---

  async savePageImage(documentId, pageNumber, imageBlob, thumbnailBlob = null) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['images'], 'readwrite');
      const store = tx.objectStore('images');
      const req = store.put({
        document_id: documentId,
        page_number: pageNumber,
        image_blob: imageBlob,
        thumbnail_blob: thumbnailBlob,
        timestamp: Date.now()
      });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async getPageImage(documentId, pageNumber) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['images'], 'readonly');
      const store = tx.objectStore('images');
      const req = store.get([documentId, pageNumber]);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Model Cache Operations ---

  async saveCachedModel(modelId, arrayBuffer) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['model_cache'], 'readwrite');
      const store = tx.objectStore('model_cache');
      const req = store.put({
        model_id: modelId,
        data: arrayBuffer,
        cached_at: Date.now()
      });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async getCachedModel(modelId) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['model_cache'], 'readonly');
      const store = tx.objectStore('model_cache');
      const req = store.get(modelId);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }
}

export const Storage = new StorageEngine();
