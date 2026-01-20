/**
 * AI Dictionary - Word History Module
 * Word lookup history management
 */

import {
    EXTENSION_NAME,
    WORD_HISTORY_MAX_CONTEXTS,
    WORD_HISTORY_MAX_CONTEXT_LENGTH,
    STORE_WORD_HISTORY,
    STORE_SESSION
} from './constants.js';
import { initDatabase, dbGetAll, dbPut, dbDelete, dbGet } from './database.js';
import {
    loadWordHistoryFromJsonBackup,
    backupWordHistoryToJson,
    restoreWordHistoryFromBackup
} from './backup.js';
import { debounce } from './utils.js';

/** @type {Object} */
let wordHistoryData = {};

/** @type {Set<string>} */
let pendingWordSaves = new Set();

/** @type {Set<string>} */
let pendingCloudSyncs = new Set();

/** @type {Set<string>} */
let blacklistedWords = new Set();

/** @type {boolean} */
let cloudSyncEnabled = false;

/** @type {Function|null} */
let cloudSyncCallback = null;

/** @type {Function|null} */
let cloudDeleteCallback = null;

/** @type {Function|null} */
let cloudBlacklistCallback = null;

/**
 * Enable cloud sync with callbacks
 * @param {Object} callbacks
 * @param {Function} callbacks.onSync - Called when a word needs to sync (word, data)
 * @param {Function} callbacks.onDelete - Called when a word is deleted (word)
 * @param {Function} callbacks.onBlacklist - Called when a word is blacklisted (word)
 */
export function enableCloudSync(callbacks) {
    cloudSyncEnabled = true;
    cloudSyncCallback = callbacks.onSync || null;
    cloudDeleteCallback = callbacks.onDelete || null;
    cloudBlacklistCallback = callbacks.onBlacklist || null;
    console.log(`[${EXTENSION_NAME}] Cloud sync enabled`);
}

/**
 * Disable cloud sync
 */
export function disableCloudSync() {
    cloudSyncEnabled = false;
    cloudSyncCallback = null;
    cloudDeleteCallback = null;
    cloudBlacklistCallback = null;
    console.log(`[${EXTENSION_NAME}] Cloud sync disabled`);
}

/**
 * Load blacklisted words from database
 */
async function loadBlacklist() {
    try {
        const data = await dbGet(STORE_SESSION, 'word-blacklist');
        if (data && Array.isArray(data.words)) {
            blacklistedWords = new Set(data.words);
        }
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] Load blacklist error:`, e.message);
    }
}

/**
 * Save blacklisted words to database
 */
async function saveBlacklist() {
    try {
        await dbPut(STORE_SESSION, {
            id: 'word-blacklist',
            words: [...blacklistedWords]
        });
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Save blacklist error:`, e.message);
    }
}

/**
 * Save a single word to database
 * @param {string} word
 */
async function saveWordToDb(word) {
    try {
        const key = word.toLowerCase();
        const data = wordHistoryData[key];
        if (data) {
            await dbPut(STORE_WORD_HISTORY, {
                word: key,
                count: data.count,
                lookups: data.lookups || [],
                contexts: data.contexts || []
            });
        }
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Save word error:`, e.message);
    }
}

/**
 * Delete a word from database
 * @param {string} word
 */
async function deleteWordFromDb(word) {
    try {
        await dbDelete(STORE_WORD_HISTORY, word.toLowerCase());
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Delete word error:`, e.message);
    }
}

/**
 * Debounced save function
 */
const saveWordHistoryDebounced = debounce(async () => {
    const words = [...pendingWordSaves];
    pendingWordSaves.clear();
    for (const w of words) {
        await saveWordToDb(w);
    }
}, 1000);

/**
 * Debounced cloud sync function
 */
const syncToCloudDebounced = debounce(async () => {
    if (!cloudSyncEnabled || !cloudSyncCallback) return;

    const words = [...pendingCloudSyncs];
    pendingCloudSyncs.clear();

    // Fire-and-forget: sync all words in parallel without blocking
    for (const word of words) {
        const data = wordHistoryData[word];
        if (data) {
            cloudSyncCallback(word, data).catch(e => {
                console.error(`[${EXTENSION_NAME}] Cloud sync error for ${word}:`, e.message);
            });
        }
    }
}, 2000); // 2 second debounce for cloud sync

/**
 * Mark a word for deferred save
 * @param {string} word
 */
function markWordForSave(word) {
    const wordKey = word.toLowerCase();
    pendingWordSaves.add(wordKey);
    saveWordHistoryDebounced();

    // Also mark for cloud sync
    if (cloudSyncEnabled) {
        pendingCloudSyncs.add(wordKey);
        syncToCloudDebounced();
    }
}

/**
 * Load word history from file/database
 * @returns {Promise<Object>}
 */
export async function loadWordHistoryFromFile() {
    try {
        await initDatabase();

        // Load blacklist
        await loadBlacklist();

        const records = await dbGetAll(STORE_WORD_HISTORY);

        if (records.length === 0) {
            // IndexedDB is empty, try to restore from JSON backup
            console.log(`[${EXTENSION_NAME}] IndexedDB empty, trying to restore from backup...`);
            const backup = await loadWordHistoryFromJsonBackup();

            if (backup && Object.keys(backup).length > 0) {
                await restoreWordHistoryFromBackup(backup);
                // Reload after restoration
                const restored = await dbGetAll(STORE_WORD_HISTORY);
                for (const r of restored) {
                    wordHistoryData[r.word] = {
                        count: r.count,
                        lookups: r.lookups || [],
                        contexts: r.contexts || []
                    };
                }
                console.log(`[${EXTENSION_NAME}] Restored ${Object.keys(wordHistoryData).length} words from backup`);
            }
        } else {
            // IndexedDB has data, load and backup
            for (const r of records) {
                wordHistoryData[r.word] = {
                    count: r.count,
                    lookups: r.lookups || [],
                    contexts: r.contexts || []
                };
            }
            console.log(`[${EXTENSION_NAME}] Loaded ${Object.keys(wordHistoryData).length} words from IndexedDB`);
            // Backup to JSON on startup
            backupWordHistoryToJson(wordHistoryData);
        }

        return wordHistoryData;
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] IndexedDB load error:`, e.message);
        wordHistoryData = {};
        return wordHistoryData;
    }
}

/**
 * Save word lookup record
 * @param {string} word The word being looked up
 * @param {string} context The context paragraph containing the word
 * @param {function} onSecondLookup Callback when word is looked up for the second time
 */
export function saveWordHistory(word, context, onSecondLookup = null) {
    if (!word || !word.trim()) return;

    // Only save single words or short phrases (no sentences)
    const trimmedWord = word.trim();
    // Skip if it looks like a sentence
    if (/[.!?。！？]/.test(trimmedWord) || trimmedWord.split(/\s+/).length > 5) {
        return;
    }

    const wordKey = trimmedWord.toLowerCase();

    // Check if word is blacklisted
    if (blacklistedWords.has(wordKey)) {
        return;
    }

    const now = Date.now();

    if (!wordHistoryData[wordKey]) {
        wordHistoryData[wordKey] = {
            count: 0,
            contexts: [],
            lookups: []
        };
    }

    // Ensure lookups array exists (for backward compatibility)
    if (!wordHistoryData[wordKey].lookups) {
        wordHistoryData[wordKey].lookups = [];
    }

    // Increment count
    wordHistoryData[wordKey].count += 1;

    // Add timestamp for this lookup
    wordHistoryData[wordKey].lookups.push(now);

    // Check if this is the second lookup - trigger callback
    if (wordHistoryData[wordKey].count === 2 && onSecondLookup) {
        onSecondLookup(trimmedWord);
    }

    // Add context if provided and not already saved
    if (context && context.trim()) {
        let trimmedContext = context.trim();
        if (trimmedContext.length > WORD_HISTORY_MAX_CONTEXT_LENGTH) {
            trimmedContext = trimmedContext.substring(0, WORD_HISTORY_MAX_CONTEXT_LENGTH) + '...';
        }

        if (!wordHistoryData[wordKey].contexts.includes(trimmedContext)) {
            if (wordHistoryData[wordKey].contexts.length >= WORD_HISTORY_MAX_CONTEXTS) {
                wordHistoryData[wordKey].contexts.shift(); // Remove oldest
            }
            wordHistoryData[wordKey].contexts.push(trimmedContext);
        }
    }

    // Save to IndexedDB (debounced)
    markWordForSave(wordKey);
}

/**
 * Get word history for a specific word
 * @param {string} word
 * @returns {{count: number, contexts: string[], lookups: number[]} | null}
 */
export function getWordHistory(word) {
    if (!word) return null;
    const wordKey = word.toLowerCase().trim();
    return wordHistoryData[wordKey] || null;
}

/**
 * Get all word history data
 * @returns {Object}
 */
export function getAllWordHistory() {
    return wordHistoryData;
}

/**
 * Remove a specific context from word history
 * @param {string} word
 * @param {number} contextIndex
 */
export function removeWordHistoryContext(word, contextIndex) {
    if (!word) return;
    const wordKey = word.toLowerCase().trim();
    if (wordHistoryData[wordKey] && wordHistoryData[wordKey].contexts[contextIndex] !== undefined) {
        wordHistoryData[wordKey].contexts.splice(contextIndex, 1);
        markWordForSave(wordKey);
    }
}

/**
 * Clear all history for a specific word
 * @param {string} word
 */
export async function clearWordHistory(word) {
    if (!word) return;
    const wordKey = word.toLowerCase().trim();
    if (wordHistoryData[wordKey]) {
        delete wordHistoryData[wordKey];
        await deleteWordFromDb(wordKey);

        // Sync deletion to cloud (fire-and-forget)
        if (cloudSyncEnabled && cloudDeleteCallback) {
            cloudDeleteCallback(wordKey).catch(e => {
                console.error(`[${EXTENSION_NAME}] Cloud delete error:`, e.message);
            });
        }
    }
}

/**
 * Clear all word history
 * @returns {Promise<number>} Number of words cleared
 */
export async function clearAllWordHistory() {
    const count = Object.keys(wordHistoryData).length;

    // Clear in-memory data
    wordHistoryData = {};

    // Clear IndexedDB
    const { dbClear } = await import('./database.js');
    await dbClear(STORE_WORD_HISTORY);

    console.log(`[${EXTENSION_NAME}] Cleared ${count} words from history`);

    return count;
}

/**
 * Delete a word permanently and add to blacklist
 * @param {string} word
 */
export async function deleteWordPermanently(word) {
    if (!word) return;
    const wordKey = word.toLowerCase().trim();

    // Remove from history
    if (wordHistoryData[wordKey]) {
        delete wordHistoryData[wordKey];
        await deleteWordFromDb(wordKey);
    }

    // Add to blacklist
    blacklistedWords.add(wordKey);
    await saveBlacklist();

    // Sync blacklist to cloud (fire-and-forget)
    if (cloudSyncEnabled && cloudBlacklistCallback) {
        cloudBlacklistCallback(wordKey).catch(e => {
            console.error(`[${EXTENSION_NAME}] Cloud blacklist error:`, e.message);
        });
    }
}

/**
 * Merge cloud data with local data
 * Keeps the higher count and merges contexts
 * @param {Object} cloudData - Word history data from cloud
 * @returns {Promise<{merged: number, added: number}>}
 */
export async function mergeCloudData(cloudData) {
    if (!cloudData || typeof cloudData !== 'object') {
        return { merged: 0, added: 0 };
    }

    let merged = 0;
    let added = 0;

    for (const [word, cloudEntry] of Object.entries(cloudData)) {
        const wordKey = word.toLowerCase();

        // Skip blacklisted words
        if (blacklistedWords.has(wordKey)) {
            continue;
        }

        if (wordHistoryData[wordKey]) {
            // Word exists locally - merge
            const localEntry = wordHistoryData[wordKey];

            // Keep the higher count
            if (cloudEntry.count > localEntry.count) {
                localEntry.count = cloudEntry.count;
            }

            // Merge contexts (avoid duplicates)
            if (cloudEntry.contexts && Array.isArray(cloudEntry.contexts)) {
                for (const ctx of cloudEntry.contexts) {
                    if (!localEntry.contexts.includes(ctx)) {
                        if (localEntry.contexts.length >= WORD_HISTORY_MAX_CONTEXTS) {
                            localEntry.contexts.shift();
                        }
                        localEntry.contexts.push(ctx);
                    }
                }
            }

            merged++;
        } else {
            // Word doesn't exist locally - add it
            wordHistoryData[wordKey] = {
                count: cloudEntry.count || 1,
                contexts: cloudEntry.contexts || [],
                lookups: cloudEntry.lookups || []
            };
            added++;
        }

        // Save to IndexedDB
        await saveWordToDb(wordKey);
    }

    console.log(`[${EXTENSION_NAME}] Cloud merge complete: ${added} added, ${merged} merged`);

    // Backup to JSON after merge
    backupWordHistoryToJson(wordHistoryData);

    return { merged, added };
}

/**
 * Replace all local word history with cloud data
 * @param {Object} cloudData - Word history data from cloud
 * @returns {Promise<number>} Number of words replaced
 */
export async function replaceAllWordHistory(cloudData) {
    if (!cloudData || typeof cloudData !== 'object') {
        return 0;
    }

    // Clear existing data
    wordHistoryData = {};

    // Clear IndexedDB
    const { dbClear } = await import('./database.js');
    await dbClear(STORE_WORD_HISTORY);

    // Load cloud data
    for (const [word, cloudEntry] of Object.entries(cloudData)) {
        const wordKey = word.toLowerCase();

        // Skip blacklisted words
        if (blacklistedWords.has(wordKey)) {
            continue;
        }

        wordHistoryData[wordKey] = {
            count: cloudEntry.count || 1,
            contexts: cloudEntry.contexts || [],
            lookups: cloudEntry.lookups || []
        };

        // Save to IndexedDB
        await saveWordToDb(wordKey);
    }

    const count = Object.keys(wordHistoryData).length;
    console.log(`[${EXTENSION_NAME}] Replaced word history with ${count} words from cloud`);

    return count;
}
