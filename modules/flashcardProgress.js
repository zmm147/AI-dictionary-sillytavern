/**
 * AI Dictionary - Flashcard Progress Module
 * Manages flashcard learning progress with SM-2 algorithm
 */

import {
    EXTENSION_NAME,
    FLASHCARD_DECK_SIZE,
    FLASHCARD_NEW_WORD_RATIO,
    STORE_FLASHCARD_PROGRESS,
    STORE_FLASHCARD_SESSION
} from './constants.js';
import { initDatabase, dbGetAll, dbPut, dbGet, dbDelete } from './database.js';
import {
    loadFlashcardDataFromJsonBackup,
    backupFlashcardDataToJson,
    restoreFlashcardDataFromBackup
} from './backup.js';

/**
 * Flashcard progress data structure:
 * {
 *   word: string,
 *   masteryLevel: number (0-5), // 熟练度等级
 *   easinessFactor: number (1.3-2.5), // SM-2 易度因子
 *   reviewCount: number, // 复习次数
 *   lastReviewed: number, // 上次复习时间戳
 *   nextReview: number, // 下次应复习时间戳
 *   context: string
 * }
 */

/** @type {Object<string, Object>} */
let flashcardProgress = {};

/** @type {Object|null} */
let currentSession = null;

/**
 * Load flashcard progress from database
 */
export async function loadFlashcardProgress() {
    try {
        await initDatabase();
        const records = await dbGetAll(STORE_FLASHCARD_PROGRESS);

        flashcardProgress = {};
        for (const record of records) {
            flashcardProgress[record.word] = record;
        }

        // Load current session
        const session = await dbGet(STORE_FLASHCARD_SESSION, 'current-session');
        if (session && session.deck && session.deck.length > 0) {
            currentSession = session;
            console.log(`[${EXTENSION_NAME}] Loaded ongoing session with ${session.deck.length} remaining cards`);
        } else {
            currentSession = null;
        }

        // If IndexedDB is empty, try to restore from JSON backup
        if (records.length === 0) {
            console.log(`[${EXTENSION_NAME}] IndexedDB empty, trying to restore flashcard data from backup...`);
            const backup = await loadFlashcardDataFromJsonBackup();

            if (backup && Object.keys(backup.progress || {}).length > 0) {
                await restoreFlashcardDataFromBackup(backup);
                // Reload after restoration
                const restored = await dbGetAll(STORE_FLASHCARD_PROGRESS);
                for (const r of restored) {
                    flashcardProgress[r.word] = r;
                }
                console.log(`[${EXTENSION_NAME}] Restored ${Object.keys(flashcardProgress).length} flashcard progress from backup`);
            }
        } else {
            console.log(`[${EXTENSION_NAME}] Loaded ${Object.keys(flashcardProgress).length} flashcard progress records`);
        }

        // Backup to JSON on startup (刷新网页时备份)
        await backupFlashcardDataToJson({
            progress: flashcardProgress,
            session: currentSession
        });
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Load flashcard progress error:`, e);
        flashcardProgress = {};
        currentSession = null;
    }
}

/**
 * Save word progress to database
 * @param {string} word
 * @param {Object} progress
 */
async function saveWordProgress(word, progress) {
    try {
        await dbPut(STORE_FLASHCARD_PROGRESS, progress);
        flashcardProgress[word] = progress;
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Save word progress error:`, e);
    }
}

/**
 * Save current session to database
 * @param {Object} session
 */
export async function saveCurrentSession(session) {
    try {
        if (!session || !session.deck || session.deck.length === 0) {
            // Session completed, remove from database
            await dbDelete(STORE_FLASHCARD_SESSION, 'current-session');
            currentSession = null;
        } else {
            await dbPut(STORE_FLASHCARD_SESSION, {
                id: 'current-session',
                ...session
            });
            currentSession = session;
        }
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Save session error:`, e);
    }
}

/**
 * Get current session
 * @returns {Object|null}
 */
export function getCurrentSession() {
    return currentSession;
}

/**
 * Calculate SM-2 algorithm updates
 * @param {number} quality - Answer quality (0=wrong, 1=correct)
 * @param {number} currentEF - Current easiness factor
 * @param {number} currentLevel - Current mastery level
 * @returns {{newEF: number, newLevel: number}}
 */
function calculateSM2(quality, currentEF, currentLevel) {
    // SM-2 algorithm for EF calculation
    let newEF = currentEF + (0.1 - (1 - quality) * (0.08 + (1 - quality) * 0.02));

    // Clamp EF between 1.3 and 2.5
    newEF = Math.max(1.3, Math.min(2.5, newEF));

    // Update mastery level
    let newLevel = currentLevel;
    if (quality === 1) {
        // Correct answer: increase level
        newLevel = Math.min(5, currentLevel + 1);
    } else {
        // Wrong answer: decrease level
        newLevel = Math.max(0, currentLevel - 1);
    }

    return { newEF, newLevel };
}

/**
 * Update word progress after review
 * @param {string} word
 * @param {boolean} remembered - Whether the word was remembered
 * @param {string} context
 */
export async function updateWordProgress(word, remembered, context = '') {
    const quality = remembered ? 1 : 0;
    const now = Date.now();

    let progress = flashcardProgress[word] || {
        word: word,
        masteryLevel: 0,
        easinessFactor: 2.5,
        reviewCount: 0,
        lastReviewed: 0,
        nextReview: now,
        context: context
    };

    // Update context if provided
    if (context && context.trim()) {
        progress.context = context.trim();
    }

    // Calculate new values using SM-2
    const { newEF, newLevel } = calculateSM2(quality, progress.easinessFactor, progress.masteryLevel);

    progress.easinessFactor = newEF;
    progress.masteryLevel = newLevel;
    progress.reviewCount += 1;
    progress.lastReviewed = now;

    // Calculate next review time (simplified SM-2 interval)
    const intervals = [0, 1, 3, 7, 14, 30]; // days
    const intervalDays = intervals[newLevel] || 30;
    progress.nextReview = now + intervalDays * 24 * 60 * 60 * 1000;

    await saveWordProgress(word, progress);
}

/**
 * Generate a balanced deck of words (new + review)
 * @param {Object} wordHistoryData - All available words from word history
 * @returns {Array} Deck of words
 */
export function generateBalancedDeck(wordHistoryData) {
    const now = Date.now();
    const allWords = [];
    const newWords = [];
    const reviewWords = [];

    // Categorize words
    for (const [word, data] of Object.entries(wordHistoryData)) {
        if (data.count < 1) continue;

        const context = data.contexts && data.contexts.length > 0
            ? data.contexts[data.contexts.length - 1]
            : '';

        const progress = flashcardProgress[word];

        if (!progress) {
            // Never studied before: new word
            newWords.push({ word, context, correctCount: 0 });
        } else if (progress.nextReview <= now || progress.masteryLevel < 3) {
            // Due for review or low mastery
            reviewWords.push({ word, context, correctCount: 0 });
        }
    }

    // Shuffle arrays
    const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    shuffle(newWords);
    shuffle(reviewWords);

    // Calculate target counts (60% new, 40% review)
    const targetNewCount = Math.ceil(FLASHCARD_DECK_SIZE * FLASHCARD_NEW_WORD_RATIO);
    const targetReviewCount = FLASHCARD_DECK_SIZE - targetNewCount;

    // Build balanced deck
    const selectedNew = newWords.slice(0, Math.min(targetNewCount, newWords.length));
    const selectedReview = reviewWords.slice(0, Math.min(targetReviewCount, reviewWords.length));

    // If not enough of one type, fill with the other
    const remaining = FLASHCARD_DECK_SIZE - selectedNew.length - selectedReview.length;
    if (remaining > 0) {
        if (selectedNew.length < targetNewCount) {
            selectedReview.push(...reviewWords.slice(selectedReview.length, selectedReview.length + remaining));
        } else {
            selectedNew.push(...newWords.slice(selectedNew.length, selectedNew.length + remaining));
        }
    }

    // Combine and shuffle
    const deck = [...selectedNew, ...selectedReview];
    shuffle(deck);

    return deck;
}

/**
 * Get flashcard statistics
 * @returns {Object}
 */
export function getFlashcardStats() {
    const stats = {
        total: Object.keys(flashcardProgress).length,
        mastered: 0, // Level 4-5
        learning: 0, // Level 1-3
        new: 0       // Level 0
    };

    for (const progress of Object.values(flashcardProgress)) {
        if (progress.masteryLevel >= 4) {
            stats.mastered++;
        } else if (progress.masteryLevel >= 1) {
            stats.learning++;
        } else {
            stats.new++;
        }
    }

    return stats;
}

/**
 * Clear all flashcard progress (for testing/reset)
 */
export async function clearAllFlashcardProgress() {
    try {
        await initDatabase();
        const db = await initDatabase();
        const tx = db.transaction(STORE_FLASHCARD_PROGRESS, 'readwrite');
        const store = tx.objectStore(STORE_FLASHCARD_PROGRESS);
        await new Promise((resolve, reject) => {
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        flashcardProgress = {};
        console.log(`[${EXTENSION_NAME}] Cleared all flashcard progress`);
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Clear flashcard progress error:`, e);
    }
}
