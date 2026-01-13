/**
 * AI Dictionary - Review Module
 * Immersive review system using Ebbinghaus intervals
 */

import {
    EXTENSION_NAME,
    EBBINGHAUS_INTERVALS,
    MAX_DAILY_REVIEW_WORDS,
    STORE_REVIEW_PENDING,
    STORE_REVIEW_PROGRESS,
    STORE_REVIEW_MASTERED,
    STORE_SESSION
} from './constants.js';
import {
    initDatabase,
    dbGetAll,
    dbGet,
    dbPut,
    dbDelete,
    dbClear
} from './database.js';
import {
    loadReviewDataFromJsonBackup,
    backupReviewDataToJson,
    restoreReviewDataFromBackup,
    deleteReviewDataJsonBackup
} from './backup.js';
import { debounce, cleanWord, ensureWordsArray } from './utils.js';

/** @type {Object} */
let reviewData = {
    pendingWords: [],
    reviewingWords: {},
    masteredWords: [],
    currentSession: { words: [], lastUpdated: null }
};

/**
 * Get the review data object
 * @returns {Object}
 */
export function getReviewData() {
    return reviewData;
}

/**
 * Save pending word to database
 * @param {string} word
 * @param {number} addedDate
 */
async function savePendingWordToDb(word, addedDate) {
    try {
        await dbPut(STORE_REVIEW_PENDING, { word: word.toLowerCase(), addedDate });
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Save pending error:`, e.message);
    }
}

/**
 * Delete pending word from database
 * @param {string} word
 */
async function deletePendingWordFromDb(word) {
    try {
        await dbDelete(STORE_REVIEW_PENDING, word.toLowerCase());
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Delete pending error:`, e.message);
    }
}

/**
 * Save progress word to database
 * @param {string} word
 * @param {Object} data
 */
async function saveProgressWordToDb(word, data) {
    try {
        await dbPut(STORE_REVIEW_PROGRESS, {
            word: word.toLowerCase(),
            stage: data.stage,
            nextReviewDate: data.nextReviewDate,
            lastUsedDate: data.lastUsedDate
        });
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Save progress error:`, e.message);
    }
}

/**
 * Delete progress word from database
 * @param {string} word
 */
async function deleteProgressWordFromDb(word) {
    try {
        await dbDelete(STORE_REVIEW_PROGRESS, word.toLowerCase());
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Delete progress error:`, e.message);
    }
}

/**
 * Save mastered word to database
 * @param {string} word
 * @param {number} masteredDate
 */
async function saveMasteredWordToDb(word, masteredDate) {
    try {
        await dbPut(STORE_REVIEW_MASTERED, { word: word.toLowerCase(), masteredDate });
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Save mastered error:`, e.message);
    }
}

/**
 * Delete mastered word from database
 * @param {string} word
 */
async function deleteMasteredWordFromDb(word) {
    try {
        await dbDelete(STORE_REVIEW_MASTERED, word.toLowerCase());
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Delete mastered error:`, e.message);
    }
}

/**
 * Save session to database
 */
async function saveSessionToDb() {
    try {
        await dbPut(STORE_SESSION, {
            id: 'current',
            words: reviewData.currentSession.words,
            lastUpdated: reviewData.currentSession.lastUpdated
        });
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Save session error:`, e.message);
    }
}

/**
 * Clear all review data from database
 */
export async function clearAllReviewDataFromDb() {
    try {
        await dbClear(STORE_REVIEW_PENDING);
        await dbClear(STORE_REVIEW_PROGRESS);
        await dbClear(STORE_REVIEW_MASTERED);
        await dbClear(STORE_SESSION);
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Clear review error:`, e.message);
    }
}

/**
 * Debounced save session function
 */
export const saveReviewDataDebounced = debounce(saveSessionToDb, 1000);

/**
 * Load review data from file/database
 * @returns {Promise<Object>}
 */
export async function loadReviewDataFromFile() {
    try {
        await initDatabase();
        const pending = await dbGetAll(STORE_REVIEW_PENDING);
        const progress = await dbGetAll(STORE_REVIEW_PROGRESS);
        const mastered = await dbGetAll(STORE_REVIEW_MASTERED);

        const hasData = pending.length > 0 || progress.length > 0 || mastered.length > 0;

        if (!hasData) {
            // IndexedDB is empty, try to restore from JSON backup
            console.log(`[${EXTENSION_NAME}] Review IndexedDB empty, trying to restore from backup...`);
            const backup = await loadReviewDataFromJsonBackup();

            if (backup) {
                await restoreReviewDataFromBackup(backup);

                // Reload after restoration
                const restoredPending = await dbGetAll(STORE_REVIEW_PENDING);
                reviewData.pendingWords = restoredPending
                    .map(r => ({ word: cleanWord(r.word), addedDate: r.addedDate }))
                    .filter(i => i.word);

                const restoredProgress = await dbGetAll(STORE_REVIEW_PROGRESS);
                reviewData.reviewingWords = {};
                for (const r of restoredProgress) {
                    const w = cleanWord(r.word);
                    if (w) {
                        reviewData.reviewingWords[w] = {
                            stage: r.stage,
                            nextReviewDate: r.nextReviewDate,
                            lastUsedDate: r.lastUsedDate
                        };
                    }
                }

                const restoredMastered = await dbGetAll(STORE_REVIEW_MASTERED);
                reviewData.masteredWords = restoredMastered
                    .map(r => ({ word: cleanWord(r.word), masteredDate: r.masteredDate }))
                    .filter(i => i.word);

                const session = await dbGet(STORE_SESSION, 'current');
                if (session) {
                    reviewData.currentSession = {
                        words: ensureWordsArray(session.words),
                        lastUpdated: session.lastUpdated
                    };
                }

                console.log(`[${EXTENSION_NAME}] Restored review data from backup`);
            }
        } else {
            // IndexedDB has data, load and backup
            reviewData.pendingWords = pending
                .map(r => ({ word: cleanWord(r.word), addedDate: r.addedDate }))
                .filter(i => i.word);

            reviewData.reviewingWords = {};
            for (const r of progress) {
                const w = cleanWord(r.word);
                if (w) {
                    reviewData.reviewingWords[w] = {
                        stage: r.stage,
                        nextReviewDate: r.nextReviewDate,
                        lastUsedDate: r.lastUsedDate
                    };
                }
            }

            reviewData.masteredWords = mastered
                .map(r => ({ word: cleanWord(r.word), masteredDate: r.masteredDate }))
                .filter(i => i.word);

            const session = await dbGet(STORE_SESSION, 'current');
            if (session) {
                reviewData.currentSession = {
                    words: ensureWordsArray(session.words),
                    lastUpdated: session.lastUpdated
                };
            }

            console.log(`[${EXTENSION_NAME}] Loaded review: ${reviewData.pendingWords.length} pending, ${Object.keys(reviewData.reviewingWords).length} reviewing`);
            // Backup to JSON on startup
            backupReviewDataToJson(reviewData);
        }

        return reviewData;
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] Review load error:`, e.message);
        return reviewData;
    }
}

/**
 * Add a word to the pending review list
 * @param {string} word
 * @param {boolean} isEnabled - Whether immersive review is enabled
 */
export function addWordToPendingReview(word, isEnabled = true) {
    if (!isEnabled) return;

    const wordLower = word.toLowerCase().trim().replace(/[\r\n]+/g, '');
    if (!wordLower) return;

    // Check if already in pending, reviewing, or mastered
    if (reviewData.pendingWords.some(w => w.word === wordLower)) return;
    if (reviewData.reviewingWords[wordLower]) return;
    if (reviewData.masteredWords.some(w => w.word === wordLower)) return;

    const addedDate = Date.now();
    reviewData.pendingWords.push({
        word: wordLower,
        addedDate: addedDate
    });

    console.log(`[${EXTENSION_NAME}] Word added to pending review: ${wordLower}`);
    savePendingWordToDb(wordLower, addedDate);
}

/**
 * Get today's date at midnight
 * @returns {number}
 */
function getTodayMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Get words that need to be reviewed today
 * @returns {string[]}
 */
export function getWordsToReviewToday() {
    const todayMidnight = getTodayMidnight();
    const wordsToReview = [];

    // Get pending words that were added before today
    for (const item of reviewData.pendingWords) {
        if (item.addedDate < todayMidnight) {
            wordsToReview.push(item.word);
        }
    }

    // Get reviewing words whose next review date is today or earlier
    for (const [word, data] of Object.entries(reviewData.reviewingWords)) {
        if (data.nextReviewDate <= todayMidnight + 24 * 60 * 60 * 1000) {
            wordsToReview.push(word);
        }
    }

    return wordsToReview.slice(0, MAX_DAILY_REVIEW_WORDS);
}

/**
 * Build the current session's word list for review
 * @returns {string[]}
 */
export function buildCurrentSessionWords() {
    if (reviewData.currentSession.words.length > 0) {
        reviewData.currentSession.words = reviewData.currentSession.words
            .map(w => w.trim().replace(/[\r\n]+/g, ''))
            .filter(w => w.length > 0);
        return reviewData.currentSession.words;
    }

    const todayWords = getWordsToReviewToday();
    reviewData.currentSession.words = todayWords
        .map(w => w.trim().replace(/[\r\n]+/g, ''))
        .filter(w => w.length > 0);
    reviewData.currentSession.lastUpdated = Date.now();
    saveReviewDataDebounced();

    return reviewData.currentSession.words;
}

/**
 * Process a word that was successfully used by AI
 * @param {string} word
 */
function processWordUsed(word) {
    const wordLower = word.toLowerCase();
    const now = Date.now();

    // Check if it's in pending
    const pendingIndex = reviewData.pendingWords.findIndex(w => w.word === wordLower);
    if (pendingIndex !== -1) {
        reviewData.pendingWords.splice(pendingIndex, 1);
        deletePendingWordFromDb(wordLower);

        const reviewingData = {
            stage: 0,
            nextReviewDate: now + EBBINGHAUS_INTERVALS[0] * 24 * 60 * 60 * 1000,
            lastUsedDate: now
        };
        reviewData.reviewingWords[wordLower] = reviewingData;
        saveProgressWordToDb(wordLower, reviewingData);
        console.log(`[${EXTENSION_NAME}] Word moved to reviewing: ${wordLower}, next review in ${EBBINGHAUS_INTERVALS[0]} day(s)`);
        return;
    }

    // Check if it's in reviewing
    if (reviewData.reviewingWords[wordLower]) {
        const wordData = reviewData.reviewingWords[wordLower];
        wordData.lastUsedDate = now;
        wordData.stage += 1;

        if (wordData.stage >= EBBINGHAUS_INTERVALS.length) {
            delete reviewData.reviewingWords[wordLower];
            deleteProgressWordFromDb(wordLower);
            reviewData.masteredWords.push({
                word: wordLower,
                masteredDate: now
            });
            saveMasteredWordToDb(wordLower, now);
            console.log(`[${EXTENSION_NAME}] Word mastered: ${wordLower}`);
        } else {
            const nextInterval = EBBINGHAUS_INTERVALS[wordData.stage];
            wordData.nextReviewDate = now + nextInterval * 24 * 60 * 60 * 1000;
            saveProgressWordToDb(wordLower, wordData);
            console.log(`[${EXTENSION_NAME}] Word advanced to stage ${wordData.stage}: ${wordLower}, next review in ${nextInterval} day(s)`);
        }
    }
}

/**
 * Check AI response and mark words as used
 * @param {string} aiResponse
 * @param {boolean} isEnabled
 */
export function checkAIResponseForReviewWords(aiResponse, isEnabled = true) {
    if (!isEnabled) return;
    if (!aiResponse || reviewData.currentSession.words.length === 0) return;

    const responseLower = aiResponse.toLowerCase();
    const usedWords = [];
    const remainingWords = [];

    const wordsArray = ensureWordsArray(reviewData.currentSession.words);

    console.log(`[${EXTENSION_NAME}] Words to check (${wordsArray.length}): ${wordsArray.join(', ')}`);

    for (const word of wordsArray) {
        if (!word) continue;

        const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
        const found = wordRegex.test(responseLower);
        console.log(`[${EXTENSION_NAME}] Checking word "${word}": ${found ? 'FOUND' : 'not found'}`);

        if (found) {
            usedWords.push(word);
        } else {
            remainingWords.push(word);
        }
    }

    for (const word of usedWords) {
        processWordUsed(word);
    }

    reviewData.currentSession.words = remainingWords;
    reviewData.currentSession.lastUpdated = Date.now();

    console.log(`[${EXTENSION_NAME}] Used words: ${usedWords.length > 0 ? usedWords.join(', ') : 'none'}`);
    console.log(`[${EXTENSION_NAME}] Remaining words: ${remainingWords.length > 0 ? remainingWords.join(', ') : 'none'}`);

    if (usedWords.length > 0) {
        saveReviewDataDebounced();
    }
}

/**
 * Generate the review prompt to inject into user message
 * @param {boolean} isEnabled
 * @param {string} promptTemplate
 * @returns {string}
 */
export function generateReviewPrompt(isEnabled, promptTemplate) {
    if (!isEnabled) return '';

    const sessionWords = buildCurrentSessionWords();
    if (sessionWords.length === 0) return '';

    const cleanedWords = sessionWords
        .map(w => w.trim().replace(/[\r\n]+/g, ''))
        .filter(w => w.length > 0);

    if (cleanedWords.length === 0) return '';

    const wordsList = cleanedWords.join(', ');
    return promptTemplate.replace(/%words%/g, wordsList);
}

/**
 * Check if a word is in the immersive review system
 * @param {string} word
 * @returns {boolean}
 */
export function isWordInReview(word) {
    const wordLower = word.toLowerCase().trim();
    if (reviewData.pendingWords.some(w => w.word === wordLower)) return true;
    if (reviewData.reviewingWords[wordLower]) return true;
    if (reviewData.masteredWords.some(w => w.word === wordLower)) return true;
    return false;
}

/**
 * Toggle a word in/out of the immersive review system
 * @param {string} word
 */
export function toggleWordInReview(word) {
    const wordLower = word.toLowerCase().trim();

    const pendingIndex = reviewData.pendingWords.findIndex(w => w.word === wordLower);
    if (pendingIndex !== -1) {
        reviewData.pendingWords.splice(pendingIndex, 1);
        deletePendingWordFromDb(wordLower);
        console.log(`[${EXTENSION_NAME}] Removed "${wordLower}" from pending review`);
        return;
    }

    if (reviewData.reviewingWords[wordLower]) {
        delete reviewData.reviewingWords[wordLower];
        deleteProgressWordFromDb(wordLower);
        console.log(`[${EXTENSION_NAME}] Removed "${wordLower}" from reviewing`);
        return;
    }

    const masteredIndex = reviewData.masteredWords.findIndex(w => w.word === wordLower);
    if (masteredIndex !== -1) {
        reviewData.masteredWords.splice(masteredIndex, 1);
        deleteMasteredWordFromDb(wordLower);
        console.log(`[${EXTENSION_NAME}] Removed "${wordLower}" from mastered`);
        return;
    }

    // Not in any list, add to pending
    const addedDate = Date.now();
    reviewData.pendingWords.push({
        word: wordLower,
        addedDate: addedDate
    });
    savePendingWordToDb(wordLower, addedDate);
    console.log(`[${EXTENSION_NAME}] Added "${wordLower}" to pending review`);
}

/**
 * Clear current session words and reset today's reviewed words
 */
export function clearCurrentSession() {
    // Get today's midnight timestamp
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    // Save current session words (not yet used by AI)
    const currentSessionWords = [...reviewData.currentSession.words];

    // Find words that were used today and undo their progress
    const wordsToReset = [];

    // Check reviewing words
    for (const [word, data] of Object.entries(reviewData.reviewingWords)) {
        if (data.lastUsedDate && data.lastUsedDate >= todayStart) {
            // Undo: stage -= 1
            data.stage -= 1;

            if (data.stage < 0) {
                // Move back to pending
                delete reviewData.reviewingWords[word];
                deleteProgressWordFromDb(word);
                const addedDate = todayStart - 1; // Yesterday
                reviewData.pendingWords.push({ word, addedDate });
                savePendingWordToDb(word, addedDate);
            } else {
                // Stay in reviewing but reset
                data.nextReviewDate = todayStart; // Today
                data.lastUsedDate = todayStart - 1; // Yesterday
                saveProgressWordToDb(word, data);
            }
            wordsToReset.push(word);
        }
    }

    // Check mastered words that were mastered today
    const masteredToUndo = [];
    for (let i = reviewData.masteredWords.length - 1; i >= 0; i--) {
        const item = reviewData.masteredWords[i];
        if (item.masteredDate && item.masteredDate >= todayStart) {
            masteredToUndo.push(item.word);
            reviewData.masteredWords.splice(i, 1);
            deleteMasteredWordFromDb(item.word);

            // Move back to reviewing at last stage
            const lastStage = EBBINGHAUS_INTERVALS.length - 1;
            const data = {
                stage: lastStage,
                nextReviewDate: todayStart,
                lastUsedDate: todayStart - 1
            };
            reviewData.reviewingWords[item.word] = data;
            saveProgressWordToDb(item.word, data);
            wordsToReset.push(item.word);
        }
    }

    // Combine: current session words + reset words (avoid duplicates)
    const allWords = [...currentSessionWords];
    for (const word of wordsToReset) {
        if (!allWords.includes(word)) {
            allWords.push(word);
        }
    }

    // Rebuild session with combined words
    reviewData.currentSession.words = allWords;
    reviewData.currentSession.lastUpdated = Date.now();

    saveReviewDataDebounced();

    console.log(`[${EXTENSION_NAME}] Reset today's session, ${wordsToReset.length} words reset, ${allWords.length} words in session`);
}

/**
 * Force all words to be reviewable today (for testing)
 */
export function forceAllWordsReviewable() {
    const allWords = [];

    for (const item of reviewData.pendingWords) {
        allWords.push(item.word);
    }

    for (const word of Object.keys(reviewData.reviewingWords)) {
        allWords.push(word);
    }

    reviewData.currentSession.words = allWords;
    reviewData.currentSession.lastUpdated = Date.now();
    saveReviewDataDebounced();

    return allWords.length;
}

/**
 * Clear all review data
 */
export async function clearAllReviewData() {
    reviewData.pendingWords = [];
    reviewData.reviewingWords = {};
    reviewData.masteredWords = [];
    reviewData.currentSession.words = [];
    reviewData.currentSession.lastUpdated = null;

    await clearAllReviewDataFromDb();
    await deleteReviewDataJsonBackup();
}
