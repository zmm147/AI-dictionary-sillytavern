/**
 * AI Dictionary - Word History Module
 * Word lookup history management
 */

import {
    EXTENSION_NAME,
    WORD_HISTORY_MAX_CONTEXTS,
    WORD_HISTORY_MAX_CONTEXT_LENGTH,
    STORE_WORD_HISTORY
} from './constants.js';
import { initDatabase, dbGetAll, dbPut, dbDelete } from './database.js';
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
 * Mark a word for deferred save
 * @param {string} word
 */
function markWordForSave(word) {
    pendingWordSaves.add(word.toLowerCase());
    saveWordHistoryDebounced();
}

/**
 * Load word history from file/database
 * @returns {Promise<Object>}
 */
export async function loadWordHistoryFromFile() {
    try {
        await initDatabase();
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
export function clearWordHistory(word) {
    if (!word) return;
    const wordKey = word.toLowerCase().trim();
    if (wordHistoryData[wordKey]) {
        delete wordHistoryData[wordKey];
        deleteWordFromDb(wordKey);
    }
}
