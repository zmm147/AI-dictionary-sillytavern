/**
 * AI Dictionary - Backup Module
 * JSON backup and restore functionality
 */

import { getRequestHeaders } from '../../../../../script.js';
import {
    EXTENSION_NAME,
    BACKUP_WORD_HISTORY_FILE,
    BACKUP_REVIEW_DATA_FILE,
    STORE_WORD_HISTORY,
    STORE_REVIEW_PENDING,
    STORE_REVIEW_PROGRESS,
    STORE_REVIEW_MASTERED,
    STORE_SESSION
} from './constants.js';
import { dbPut } from './database.js';
import { cleanWord } from './utils.js';

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
