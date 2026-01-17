/**
 * AI Dictionary - Backup Module
 * JSON backup and restore functionality
 */

import { getRequestHeaders } from '../../../../../script.js';
import {
    EXTENSION_NAME,
    BACKUP_WORD_HISTORY_FILE,
    BACKUP_REVIEW_DATA_FILE,
    BACKUP_FLASHCARD_DATA_FILE,
    STORE_WORD_HISTORY,
    STORE_REVIEW_PENDING,
    STORE_REVIEW_PROGRESS,
    STORE_REVIEW_MASTERED,
    STORE_SESSION,
    STORE_FLASHCARD_PROGRESS,
    STORE_FLASHCARD_SESSION
} from './constants.js';
import { dbPut } from './database.js';
import { cleanWord } from './utils.js';

/** @type {boolean} */
let cloudSyncMode = false;

/**
 * Set cloud sync mode (when enabled, skip local JSON backups)
 * @param {boolean} enabled
 */
export function setCloudSyncMode(enabled) {
    cloudSyncMode = enabled;
    console.log(`[${EXTENSION_NAME}] Backup cloud sync mode: ${enabled ? 'enabled (skip local backup)' : 'disabled (use local backup)'}`);
}

/**
 * Get cloud sync mode
 * @returns {boolean}
 */
export function getCloudSyncMode() {
    return cloudSyncMode;
}

/**
 * Load word history from JSON backup file
 * @returns {Promise<Object|null>}
 */
export async function loadWordHistoryFromJsonBackup() {
    try {
        const response = await fetch(`/user/files/${BACKUP_WORD_HISTORY_FILE}`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });

        if (response.ok) {
            const text = await response.text();
            if (text && text.trim()) {
                const data = JSON.parse(text);
                return data || {};
            }
        }
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] No backup file found:`, e.message);
    }
    return null;
}

/**
 * Backup word history to JSON file
 * @param {Object} wordHistoryData
 */
export async function backupWordHistoryToJson(wordHistoryData) {
    // Skip backup if cloud sync mode is enabled
    if (cloudSyncMode) {
        console.log(`[${EXTENSION_NAME}] Skipping word history backup (cloud sync mode)`);
        return;
    }

    try {
        const jsonData = JSON.stringify(wordHistoryData, null, 2);
        const base64Data = btoa(unescape(encodeURIComponent(jsonData)));

        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: BACKUP_WORD_HISTORY_FILE, data: base64Data }),
        });

        if (response.ok) {
            console.log(`[${EXTENSION_NAME}] Word history backed up to JSON (${Object.keys(wordHistoryData).length} words)`);
        }
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Backup word history error:`, e.message);
    }
}

/**
 * Restore word history from backup to IndexedDB
 * @param {Object} backupData
 */
export async function restoreWordHistoryFromBackup(backupData) {
    for (const [word, data] of Object.entries(backupData)) {
        await dbPut(STORE_WORD_HISTORY, {
            word: word,
            count: data.count || 0,
            lookups: data.lookups || [],
            contexts: data.contexts || []
        });
    }
    console.log(`[${EXTENSION_NAME}] Restored ${Object.keys(backupData).length} words from backup`);
}

/**
 * Load review data from JSON backup file
 * @returns {Promise<Object|null>}
 */
export async function loadReviewDataFromJsonBackup() {
    try {
        const response = await fetch(`/user/files/${BACKUP_REVIEW_DATA_FILE}`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });

        if (response.ok) {
            const text = await response.text();
            if (text && text.trim()) {
                return JSON.parse(text);
            }
        }
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] No review backup file found:`, e.message);
    }
    return null;
}

/**
 * Backup review data to JSON file
 * @param {Object} reviewData
 */
export async function backupReviewDataToJson(reviewData) {
    // Skip backup if cloud sync mode is enabled
    if (cloudSyncMode) {
        console.log(`[${EXTENSION_NAME}] Skipping review data backup (cloud sync mode)`);
        return;
    }

    try {
        const data = {
            pendingWords: reviewData.pendingWords,
            reviewingWords: reviewData.reviewingWords,
            masteredWords: reviewData.masteredWords,
            currentSession: reviewData.currentSession
        };

        const jsonData = JSON.stringify(data, null, 2);
        const base64Data = btoa(unescape(encodeURIComponent(jsonData)));

        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: BACKUP_REVIEW_DATA_FILE, data: base64Data }),
        });

        if (response.ok) {
            console.log(`[${EXTENSION_NAME}] Review data backed up to JSON`);
        }
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Backup review data error:`, e.message);
    }
}

/**
 * Restore review data from backup to IndexedDB
 * @param {Object} backupData
 */
export async function restoreReviewDataFromBackup(backupData) {
    // Restore pending
    for (const item of (backupData.pendingWords || [])) {
        const word = cleanWord(item.word);
        if (word) {
            await dbPut(STORE_REVIEW_PENDING, { word, addedDate: item.addedDate });
        }
    }

    // Restore progress
    for (const [word, data] of Object.entries(backupData.reviewingWords || {})) {
        const w = cleanWord(word);
        if (w) {
            await dbPut(STORE_REVIEW_PROGRESS, {
                word: w,
                stage: data.stage,
                nextReviewDate: data.nextReviewDate,
                lastUsedDate: data.lastUsedDate
            });
        }
    }

    // Restore mastered
    for (const item of (backupData.masteredWords || [])) {
        const word = cleanWord(item.word);
        if (word) {
            await dbPut(STORE_REVIEW_MASTERED, { word, masteredDate: item.masteredDate });
        }
    }

    // Restore session
    if (backupData.currentSession) {
        await dbPut(STORE_SESSION, {
            id: 'current',
            words: backupData.currentSession.words || [],
            lastUpdated: backupData.currentSession.lastUpdated
        });
    }

    console.log(`[${EXTENSION_NAME}] Review data restored from backup`);
}

/**
 * Load flashcard data from JSON backup file
 * @returns {Promise<Object|null>}
 */
export async function loadFlashcardDataFromJsonBackup() {
    try {
        const response = await fetch(`/user/files/${BACKUP_FLASHCARD_DATA_FILE}`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });

        if (response.ok) {
            const text = await response.text();
            if (text && text.trim()) {
                return JSON.parse(text);
            }
        }
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] No flashcard backup file found:`, e.message);
    }
    return null;
}

/**
 * Backup flashcard data to JSON file
 * @param {Object} flashcardData - { progress: {}, session: {} }
 */
export async function backupFlashcardDataToJson(flashcardData) {
    // Skip backup if cloud sync mode is enabled
    if (cloudSyncMode) {
        console.log(`[${EXTENSION_NAME}] Skipping flashcard data backup (cloud sync mode)`);
        return;
    }

    try {
        const data = {
            progress: flashcardData.progress || {},
            session: flashcardData.session || null
        };

        const jsonData = JSON.stringify(data, null, 2);
        const base64Data = btoa(unescape(encodeURIComponent(jsonData)));

        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: BACKUP_FLASHCARD_DATA_FILE, data: base64Data }),
        });

        if (response.ok) {
            const progressCount = Object.keys(data.progress).length;
            console.log(`[${EXTENSION_NAME}] Flashcard data backed up to JSON (${progressCount} words)`);
        }
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Backup flashcard data error:`, e.message);
    }
}

/**
 * Delete review data JSON backup file
 * @returns {Promise<boolean>}
 */
export async function deleteReviewDataJsonBackup() {
    try {
        const response = await fetch('/api/files/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ path: `/user/files/${BACKUP_REVIEW_DATA_FILE}` }),
        });

        if (response.ok) {
            console.log(`[${EXTENSION_NAME}] Review data backup file deleted`);
            return true;
        }
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Delete review backup error:`, e.message);
    }
    return false;
}

/**
 * Restore flashcard data from backup to IndexedDB
 * @param {Object} backupData
 */
export async function restoreFlashcardDataFromBackup(backupData) {
    // Restore progress
    for (const [word, data] of Object.entries(backupData.progress || {})) {
        await dbPut(STORE_FLASHCARD_PROGRESS, {
            word: word,
            masteryLevel: data.masteryLevel || 0,
            easinessFactor: data.easinessFactor || 2.5,
            reviewCount: data.reviewCount || 0,
            lastReviewed: data.lastReviewed || 0,
            nextReview: data.nextReview || 0,
            context: data.context || ''
        });
    }

    // Restore session
    if (backupData.session) {
        await dbPut(STORE_FLASHCARD_SESSION, {
            id: 'current-session',
            deck: backupData.session.deck || [],
            currentIndex: backupData.session.currentIndex || 0,
            wordsCompleted: backupData.session.wordsCompleted || 0,
            progressScore: backupData.session.progressScore || 0,
            cardsSinceReview: backupData.session.cardsSinceReview || 0,
            totalWordsInHistory: backupData.session.totalWordsInHistory || 0
        });
    }

    const progressCount = Object.keys(backupData.progress || {}).length;
    console.log(`[${EXTENSION_NAME}] Flashcard data restored from backup (${progressCount} words)`);
}
