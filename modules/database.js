/**
 * AI Dictionary - Database Module
 * IndexedDB operations and JSON backup/restore
 */

import { getRequestHeaders } from '../../../../script.js';
import { EXTENSION_NAME } from './utils.js';

// --- IndexedDB Configuration ---
const DB_NAME = 'ai-dictionary-db';
const DB_VERSION = 1;
export const STORE_WORD_HISTORY = 'wordHistory';
export const STORE_REVIEW_PENDING = 'reviewPending';
export const STORE_REVIEW_PROGRESS = 'reviewProgress';
export const STORE_REVIEW_MASTERED = 'reviewMastered';
export const STORE_SESSION = 'sessionData';

// --- JSON Backup File Names ---
export const BACKUP_WORD_HISTORY_FILE = 'ai-dictionary-word-history.json';
export const BACKUP_REVIEW_DATA_FILE = 'ai-dictionary-review-data.json';

/** @type {IDBDatabase|null} */
let db = null;

/**
 * Initialize IndexedDB database
 */
export function initDatabase() {
    return new Promise((resolve, reject) => {
        if (db) { resolve(db); return; }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { db = request.result; resolve(db); };
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
        };
    });
}

export function dbGetAll(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not init')); return; }
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

export function dbGet(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not init')); return; }
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export function dbPut(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not init')); return; }
        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(data);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export function dbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not init')); return; }
        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export function dbClear(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not init')); return; }
        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// --- JSON Backup/Restore Functions ---

/**
 * Load word history from JSON backup file
 */
export async function loadWordHistoryFromJsonBackup() {
    try {
        const response = await fetch(`/user/files/${BACKUP_WORD_HISTORY_FILE}`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });
        if (response.ok) {
            const data = await response.json();
            return data || {};
        }
    } catch (e) {
        console.log(`[${EXTENSION_NAME}] No word history backup found`);
    }
    return null;
}

/**
 * Backup word history to JSON file
 */
export async function backupWordHistoryToJson(wordHistoryData) {
    try {
        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                name: BACKUP_WORD_HISTORY_FILE,
                data: JSON.stringify(wordHistoryData, null, 2)
            })
        });
        if (response.ok) {
            console.log(`[${EXTENSION_NAME}] Word history backed up to JSON`);
        }
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] Word history backup failed:`, e.message);
    }
}

/**
 * Restore word history from backup data
 */
export async function restoreWordHistoryFromBackup(backupData) {
    try {
        await initDatabase();
        for (const [word, record] of Object.entries(backupData)) {
            await dbPut(STORE_WORD_HISTORY, { word, ...record });
        }
        console.log(`[${EXTENSION_NAME}] Word history restored from backup`);
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Restore word history failed:`, e.message);
    }
}

/**
 * Load review data from JSON backup file
 */
export async function loadReviewDataFromJsonBackup() {
    try {
        const response = await fetch(`/user/files/${BACKUP_REVIEW_DATA_FILE}`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });
        if (response.ok) {
            const data = await response.json();
            return data;
        }
    } catch (e) {
        console.log(`[${EXTENSION_NAME}] No review data backup found`);
    }
    return null;
}

/**
 * Backup review data to JSON file
 */
export async function backupReviewDataToJson(reviewData) {
    try {
        const backup = {
            pendingWords: reviewData.pendingWords,
            reviewingWords: reviewData.reviewingWords,
            masteredWords: reviewData.masteredWords,
            currentSession: reviewData.currentSession,
            backupTime: Date.now()
        };
        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                name: BACKUP_REVIEW_DATA_FILE,
                data: JSON.stringify(backup, null, 2)
            })
        });
        if (response.ok) {
            console.log(`[${EXTENSION_NAME}] Review data backed up to JSON`);
        }
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] Review data backup failed:`, e.message);
    }
}

/**
 * Restore review data from backup
 */
export async function restoreReviewDataFromBackup(backupData) {
    try {
        await initDatabase();
        // Restore pending words
        if (backupData.pendingWords && Array.isArray(backupData.pendingWords)) {
            for (const item of backupData.pendingWords) {
                if (item.word) {
                    await dbPut(STORE_REVIEW_PENDING, { word: item.word.toLowerCase(), addedDate: item.addedDate });
                }
            }
        }
        // Restore progress words
        if (backupData.reviewingWords && typeof backupData.reviewingWords === 'object') {
            for (const [word, data] of Object.entries(backupData.reviewingWords)) {
                await dbPut(STORE_REVIEW_PROGRESS, { word: word.toLowerCase(), stage: data.stage, nextReviewDate: data.nextReviewDate, lastUsedDate: data.lastUsedDate });
            }
        }
        // Restore mastered words
        if (backupData.masteredWords && Array.isArray(backupData.masteredWords)) {
            for (const item of backupData.masteredWords) {
                if (item.word) {
                    await dbPut(STORE_REVIEW_MASTERED, { word: item.word.toLowerCase(), masteredDate: item.masteredDate });
                }
            }
        }
        // Restore session
        if (backupData.currentSession) {
            await dbPut(STORE_SESSION, { id: 'current', words: backupData.currentSession.words, lastUpdated: backupData.currentSession.lastUpdated });
        }
        console.log(`[${EXTENSION_NAME}] Review data restored from backup`);
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Restore review data failed:`, e.message);
    }
}
