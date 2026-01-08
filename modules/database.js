/**
 * AI Dictionary - Database Module
 * IndexedDB operations for word history and review data
 */

import {
    EXTENSION_NAME,
    DB_NAME,
    DB_VERSION,
    STORE_WORD_HISTORY,
    STORE_REVIEW_PENDING,
    STORE_REVIEW_PROGRESS,
    STORE_REVIEW_MASTERED,
    STORE_SESSION,
    STORE_FLASHCARD_PROGRESS,
    STORE_FLASHCARD_SESSION
} from './constants.js';

/** @type {IDBDatabase|null} */
let db = null;

/**
 * Initialize IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export function initDatabase() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(STORE_WORD_HISTORY)) {
                const ws = database.createObjectStore(STORE_WORD_HISTORY, { keyPath: 'word' });
                ws.createIndex('count', 'count', { unique: false });
            }

            if (!database.objectStoreNames.contains(STORE_REVIEW_PENDING)) {
                database.createObjectStore(STORE_REVIEW_PENDING, { keyPath: 'word' });
            }

            if (!database.objectStoreNames.contains(STORE_REVIEW_PROGRESS)) {
                database.createObjectStore(STORE_REVIEW_PROGRESS, { keyPath: 'word' });
            }

            if (!database.objectStoreNames.contains(STORE_REVIEW_MASTERED)) {
                database.createObjectStore(STORE_REVIEW_MASTERED, { keyPath: 'word' });
            }

            if (!database.objectStoreNames.contains(STORE_SESSION)) {
                database.createObjectStore(STORE_SESSION, { keyPath: 'id' });
            }

            if (!database.objectStoreNames.contains(STORE_FLASHCARD_PROGRESS)) {
                const fs = database.createObjectStore(STORE_FLASHCARD_PROGRESS, { keyPath: 'word' });
                fs.createIndex('masteryLevel', 'masteryLevel', { unique: false });
                fs.createIndex('lastReviewed', 'lastReviewed', { unique: false });
            }

            if (!database.objectStoreNames.contains(STORE_FLASHCARD_SESSION)) {
                database.createObjectStore(STORE_FLASHCARD_SESSION, { keyPath: 'id' });
            }
        };
    });
}

/**
 * Get all records from a store
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
export function dbGetAll(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('DB not initialized'));
            return;
        }

        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Get a single record from a store
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<any>}
 */
export function dbGet(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('DB not initialized'));
            return;
        }

        const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Put (insert or update) a record in a store
 * @param {string} storeName
 * @param {Object} data
 * @returns {Promise<void>}
 */
export function dbPut(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('DB not initialized'));
            return;
        }

        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(data);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

/**
 * Delete a record from a store
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<void>}
 */
export function dbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('DB not initialized'));
            return;
        }

        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

/**
 * Clear all records from a store
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export function dbClear(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('DB not initialized'));
            return;
        }

        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

/**
 * Check if database is initialized
 * @returns {boolean}
 */
export function isDatabaseReady() {
    return db !== null;
}
