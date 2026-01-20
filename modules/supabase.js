/**
 * AI Dictionary - Supabase Module
 * Authentication and cloud sync for word history
 */

import { EXTENSION_NAME } from './constants.js';

// Supabase configuration
const SUPABASE_URL = 'https://qbqqqxoqliuiysxtqucn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ET2Ntni5q_qbWMG7AcYTnA_-5f0pF3d';

/** @type {any} */
let supabaseClient = null;

/** @type {any} */
let currentUser = null;

/** @type {Set<Function>} */
const authStateListeners = new Set();

/**
 * Load Supabase SDK dynamically
 * @returns {Promise<void>}
 */
async function loadSupabaseSDK() {
    if (window.supabase) {
        return;
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = () => {
            console.log(`[${EXTENSION_NAME}] Supabase SDK loaded`);
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load Supabase SDK'));
        document.head.appendChild(script);
    });
}

/**
 * Initialize Supabase client
 * @returns {Promise<boolean>}
 */
export async function initSupabase() {
    try {
        await loadSupabaseSDK();

        if (!window.supabase) {
            throw new Error('Supabase SDK not available');
        }

        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Listen for auth state changes
        supabaseClient.auth.onAuthStateChange((event, session) => {
            currentUser = session?.user || null;
            console.log(`[${EXTENSION_NAME}] Auth state changed:`, event, currentUser?.email);
            notifyAuthStateListeners(currentUser);
        });

        // Check current session
        const { data: { session } } = await supabaseClient.auth.getSession();
        currentUser = session?.user || null;

        console.log(`[${EXTENSION_NAME}] Supabase initialized, user:`, currentUser?.email || 'not logged in');
        return true;
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Supabase init error:`, e.message);
        return false;
    }
}

/**
 * Register auth state change listener
 * @param {Function} listener
 */
export function onAuthStateChange(listener) {
    authStateListeners.add(listener);
    // Immediately notify with current state
    listener(currentUser);
}

/**
 * Remove auth state change listener
 * @param {Function} listener
 */
export function offAuthStateChange(listener) {
    authStateListeners.delete(listener);
}

/**
 * Notify all auth state listeners
 * @param {any} user
 */
function notifyAuthStateListeners(user) {
    authStateListeners.forEach(listener => {
        try {
            listener(user);
        } catch (e) {
            console.error(`[${EXTENSION_NAME}] Auth listener error:`, e);
        }
    });
}

/**
 * Sign up with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signUp(email, password) {
    if (!supabaseClient) {
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password
        });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Sign in with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signIn(email, password) {
    if (!supabaseClient) {
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Sign out
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signOut() {
    if (!supabaseClient) {
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        const { error } = await supabaseClient.auth.signOut();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Get current user
 * @returns {any}
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Check if user is logged in
 * @returns {boolean}
 */
export function isLoggedIn() {
    return currentUser !== null;
}

// ==================== Cloud Sync Functions ====================

/**
 * Sync a word to cloud (real-time single word sync)
 * Local data is already complete (local updates first), so directly upsert to overwrite cloud
 * @param {string} word
 * @param {Object} data - { count, lookups, contexts }
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function syncWordToCloud(word, data) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        // Convert lookups to ISO strings
        const lookups = (data.lookups || []).map(ts => new Date(ts).toISOString());

        // Directly upsert with complete local data
        const { error } = await supabaseClient
            .from('words')
            .upsert({
                user_id: currentUser.id,
                word: word.toLowerCase(),
                lookup_count: data.count,
                last_lookup_at: new Date().toISOString(),
                is_blacklisted: false,
                lookups: lookups,
                contexts: data.contexts || []
            }, {
                onConflict: 'user_id,word'
            });

        if (error) {
            console.error(`[${EXTENSION_NAME}] Sync word error:`, error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Sync word exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Fetch all words from cloud
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function fetchWordsFromCloud() {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        // Fetch all words with embedded lookups and contexts arrays
        const { data: words, error: wordsError } = await supabaseClient
            .from('words')
            .select('word, lookup_count, lookups, contexts')
            .eq('user_id', currentUser.id)
            .eq('is_blacklisted', false);

        if (wordsError) {
            return { success: false, error: wordsError.message };
        }

        if (!words || words.length === 0) {
            return { success: true, data: {} };
        }

        // Build word history directly from words table
        const wordHistory = {};
        words.forEach(w => {
            // Convert ISO timestamps to milliseconds
            const lookups = (w.lookups || []).map(ts => new Date(ts).getTime());
            wordHistory[w.word] = {
                count: w.lookup_count,
                contexts: w.contexts || [],
                lookups: lookups
            };
        });

        return { success: true, data: wordHistory };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Fetch words exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Fetch words updated since a specific time (INCREMENTAL SYNC)
 * @param {number} sinceTimestamp - Timestamp in milliseconds
 * @returns {Promise<{success: boolean, data?: Object, latestUpdatedAt?: number, error?: string}>}
 */
export async function fetchWordsIncrementally(sinceTimestamp) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const sinceISO = new Date(sinceTimestamp).toISOString();

        // Fetch words updated since the given timestamp
        const { data: words, error: wordsError } = await supabaseClient
            .from('words')
            .select('word, lookup_count, lookups, contexts, updated_at')
            .eq('user_id', currentUser.id)
            .eq('is_blacklisted', false)
            .gt('updated_at', sinceISO);

        if (wordsError) {
            return { success: false, error: wordsError.message };
        }

        if (!words || words.length === 0) {
            return { success: true, data: {}, latestUpdatedAt: sinceTimestamp };
        }

        // Build word history and find latest updated_at
        const wordHistory = {};
        let latestUpdatedAt = sinceTimestamp;

        words.forEach(w => {
            // Convert ISO timestamps to milliseconds
            const lookups = (w.lookups || []).map(ts => new Date(ts).getTime());
            wordHistory[w.word] = {
                count: w.lookup_count,
                contexts: w.contexts || [],
                lookups: lookups
            };

            // Note: JavaScript Date only has millisecond precision, but Supabase has microsecond precision
            // Add 1ms to avoid re-fetching the same record due to precision loss
            const updatedAt = new Date(w.updated_at).getTime() + 1;
            if (updatedAt > latestUpdatedAt) {
                latestUpdatedAt = updatedAt;
            }
        });

        console.log(`[${EXTENSION_NAME}] Incremental fetch: ${words.length} words updated since ${sinceISO}`);

        return { success: true, data: wordHistory, latestUpdatedAt };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Incremental fetch exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Upload all local words to cloud (INCREMENTAL SYNC)
 * Only uploads words that are new or have higher lookup count than cloud
 * @param {Object} wordHistoryData - Local word history data
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @returns {Promise<{success: boolean, synced: number, skipped: number, error?: string}>}
 */
export async function uploadAllWordsToCloud(wordHistoryData, onProgress = null) {
    if (!supabaseClient || !currentUser) {
        return { success: false, synced: 0, skipped: 0, error: 'Not logged in' };
    }

    const localWords = Object.keys(wordHistoryData);
    if (localWords.length === 0) {
        return { success: true, synced: 0, skipped: 0 };
    }

    const BATCH_SIZE = 100;
    let synced = 0;
    let skipped = 0;

    try {
        // Step 1: Fetch existing cloud data for comparison
        if (onProgress) onProgress(0, 100, '检查云端数据...');

        const cloudWordMap = {};
        for (let i = 0; i < localWords.length; i += BATCH_SIZE) {
            const batchWords = localWords.slice(i, i + BATCH_SIZE).map(w => w.toLowerCase());
            const { data: cloudWords } = await supabaseClient
                .from('words')
                .select('word, lookup_count, lookups, contexts')
                .eq('user_id', currentUser.id)
                .in('word', batchWords);

            (cloudWords || []).forEach(row => {
                cloudWordMap[row.word] = {
                    count: row.lookup_count,
                    lookups: row.lookups || [],
                    contexts: row.contexts || []
                };
            });
        }

        // Step 2: Build records with merged arrays
        if (onProgress) onProgress(0, localWords.length, '准备同步数据...');

        const recordsToUpsert = [];

        for (const word of localWords) {
            const wordKey = word.toLowerCase();
            const localData = wordHistoryData[word];
            const cloudData = cloudWordMap[wordKey];

            if (!cloudData) {
                // New word - use local data directly
                const lookups = (localData.lookups || []).map(ts => new Date(ts).toISOString());
                recordsToUpsert.push({
                    user_id: currentUser.id,
                    word: wordKey,
                    lookup_count: localData.count || 1,
                    last_lookup_at: new Date().toISOString(),
                    is_blacklisted: false,
                    lookups: lookups,
                    contexts: localData.contexts || []
                });
            } else if (localData.count > cloudData.count) {
                // Local has more lookups - merge arrays
                const localLookups = (localData.lookups || []).map(ts => new Date(ts).toISOString());
                const mergedLookupsSet = new Set([...cloudData.lookups, ...localLookups]);
                const mergedLookups = [...mergedLookupsSet].sort();

                const mergedContextsSet = new Set([...cloudData.contexts, ...(localData.contexts || [])]);
                const mergedContexts = [...mergedContextsSet];

                recordsToUpsert.push({
                    user_id: currentUser.id,
                    word: wordKey,
                    lookup_count: localData.count,
                    last_lookup_at: new Date().toISOString(),
                    is_blacklisted: false,
                    lookups: mergedLookups,
                    contexts: mergedContexts
                });
            } else {
                // Cloud is up to date
                skipped++;
            }
        }

        if (recordsToUpsert.length === 0) {
            if (onProgress) onProgress(100, 100, `无需同步，${skipped} 词已是最新`);
            return { success: true, synced: 0, skipped };
        }

        // Step 3: Batch upsert words with embedded arrays
        if (onProgress) onProgress(0, recordsToUpsert.length, `同步 ${recordsToUpsert.length} 词...`);

        for (let i = 0; i < recordsToUpsert.length; i += BATCH_SIZE) {
            const batch = recordsToUpsert.slice(i, i + BATCH_SIZE);
            const { error } = await supabaseClient
                .from('words')
                .upsert(batch, { onConflict: 'user_id,word' });

            if (error) {
                console.error(`[${EXTENSION_NAME}] Batch upsert error:`, error);
            }

            synced = Math.min(i + BATCH_SIZE, recordsToUpsert.length);
            if (onProgress) onProgress(synced, recordsToUpsert.length, `上传单词 ${synced}/${recordsToUpsert.length}`);
        }

        if (onProgress) onProgress(recordsToUpsert.length, recordsToUpsert.length, `上传完成: ${synced} 新/更新, ${skipped} 跳过`);

        return { success: true, synced, skipped };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Upload exception:`, e);
        return { success: false, synced, skipped, error: e.message };
    }
}

/**
 * Delete a word from cloud
 * @param {string} word
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteWordFromCloud(word) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const { error } = await supabaseClient
            .from('words')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('word', word.toLowerCase());

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Delete all words from cloud for current user
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteAllWordsFromCloud() {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const { error } = await supabaseClient
            .from('words')
            .delete()
            .eq('user_id', currentUser.id);

        if (error) {
            console.error(`[${EXTENSION_NAME}] Delete all words error:`, error);
            return { success: false, error: error.message };
        }

        console.log(`[${EXTENSION_NAME}] Deleted all words from cloud`);
        return { success: true };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Delete all words exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Blacklist a word in cloud
 * @param {string} word
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function blacklistWordInCloud(word) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const { error } = await supabaseClient
            .from('words')
            .update({ is_blacklisted: true })
            .eq('user_id', currentUser.id)
            .eq('word', word.toLowerCase());

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Get cloud word count
 * @returns {Promise<number>}
 */
export async function getCloudWordCount() {
    if (!supabaseClient || !currentUser) {
        return 0;
    }

    try {
        const { count, error } = await supabaseClient
            .from('words')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id)
            .eq('is_blacklisted', false);

        if (error) {
            return 0;
        }

        return count || 0;
    } catch (e) {
        return 0;
    }
}

// ==================== Flashcard Progress Sync ====================

/**
 * Get or create word ID in cloud (single upsert call)
 * @param {string} word
 * @returns {Promise<string|null>}
 */
async function getOrCreateWordId(word) {
    if (!supabaseClient || !currentUser) return null;

    const wordLower = word.toLowerCase();

    // Upsert and return ID in one call
    const { data, error } = await supabaseClient
        .from('words')
        .upsert({
            user_id: currentUser.id,
            word: wordLower,
            lookup_count: 1,
            is_blacklisted: false
        }, {
            onConflict: 'user_id,word'
        })
        .select('id')
        .single();

    if (error) {
        console.error(`[${EXTENSION_NAME}] Get/create word error:`, error);
        return null;
    }

    return data?.id || null;
}

/**
 * Sync flashcard progress to cloud
 * @param {string} word
 * @param {Object} progress - { masteryLevel, easinessFactor, reviewCount, lastReviewed, nextReview }
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function syncFlashcardProgressToCloud(word, progress) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const wordId = await getOrCreateWordId(word);
        if (!wordId) {
            return { success: false, error: 'Failed to get word ID' };
        }

        const { error } = await supabaseClient
            .from('flashcard_progress')
            .upsert({
                user_id: currentUser.id,
                word_id: wordId,
                mastery_level: progress.masteryLevel || 0,
                easiness_factor: progress.easinessFactor || 2.5,
                review_count: progress.reviewCount || 0,
                last_reviewed_at: progress.lastReviewed ? new Date(progress.lastReviewed).toISOString() : null,
                next_review_at: progress.nextReview ? new Date(progress.nextReview).toISOString() : null,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,word_id'
            });

        if (error) {
            console.error(`[${EXTENSION_NAME}] Sync flashcard error:`, error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Sync flashcard exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Fetch all flashcard progress from cloud
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function fetchFlashcardProgressFromCloud() {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const { data, error } = await supabaseClient
            .from('flashcard_progress')
            .select(`
                *,
                words!inner(word)
            `)
            .eq('user_id', currentUser.id);

        if (error) {
            return { success: false, error: error.message };
        }

        // Convert to local format
        const progressData = {};
        for (const row of (data || [])) {
            const word = row.words?.word;
            if (word) {
                progressData[word] = {
                    word: word,
                    masteryLevel: row.mastery_level || 0,
                    easinessFactor: parseFloat(row.easiness_factor) || 2.5,
                    reviewCount: row.review_count || 0,
                    lastReviewed: row.last_reviewed_at ? new Date(row.last_reviewed_at).getTime() : 0,
                    nextReview: row.next_review_at ? new Date(row.next_review_at).getTime() : Date.now(),
                    context: ''
                };
            }
        }

        return { success: true, data: progressData };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Fetch flashcard exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Fetch flashcard progress updated since a specific time (INCREMENTAL SYNC)
 * @param {number} sinceTimestamp - Timestamp in milliseconds
 * @returns {Promise<{success: boolean, data?: Object, latestUpdatedAt?: number, error?: string}>}
 */
export async function fetchFlashcardProgressIncrementally(sinceTimestamp) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const sinceISO = new Date(sinceTimestamp).toISOString();

        const { data, error } = await supabaseClient
            .from('flashcard_progress')
            .select(`
                *,
                words!inner(word)
            `)
            .eq('user_id', currentUser.id)
            .gt('updated_at', sinceISO);

        if (error) {
            return { success: false, error: error.message };
        }

        if (!data || data.length === 0) {
            return { success: true, data: {}, latestUpdatedAt: sinceTimestamp };
        }

        // Convert to local format and find latest updated_at
        const progressData = {};
        let latestUpdatedAt = sinceTimestamp;

        for (const row of data) {
            const word = row.words?.word;
            if (word) {
                progressData[word] = {
                    word: word,
                    masteryLevel: row.mastery_level || 0,
                    easinessFactor: parseFloat(row.easiness_factor) || 2.5,
                    reviewCount: row.review_count || 0,
                    lastReviewed: row.last_reviewed_at ? new Date(row.last_reviewed_at).getTime() : 0,
                    nextReview: row.next_review_at ? new Date(row.next_review_at).getTime() : Date.now(),
                    context: ''
                };

                // Add 1ms to avoid re-fetching due to precision loss (JS ms vs Supabase microseconds)
                const updatedAt = new Date(row.updated_at).getTime() + 1;
                if (updatedAt > latestUpdatedAt) {
                    latestUpdatedAt = updatedAt;
                }
            }
        }

        console.log(`[${EXTENSION_NAME}] Incremental flashcard fetch: ${data.length} records updated since ${sinceISO}`);

        return { success: true, data: progressData, latestUpdatedAt };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Incremental flashcard fetch exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Upload all flashcard progress to cloud (INCREMENTAL SYNC)
 * Only uploads progress that is newer or has higher review count
 * @param {Object} flashcardProgress - Local flashcard progress data
 * @param {Function} onProgress
 * @returns {Promise<{success: boolean, synced: number, skipped: number, error?: string}>}
 */
export async function uploadAllFlashcardProgressToCloud(flashcardProgress, onProgress = null) {
    if (!supabaseClient || !currentUser) {
        return { success: false, synced: 0, skipped: 0, error: 'Not logged in' };
    }

    const words = Object.keys(flashcardProgress);
    if (words.length === 0) {
        return { success: true, synced: 0, skipped: 0 };
    }

    let synced = 0;
    let skipped = 0;

    try {
        // Fetch existing cloud flashcard data
        if (onProgress) onProgress(0, 100, '检查云端闪卡数据...');

        const { data: cloudData } = await supabaseClient
            .from('flashcard_progress')
            .select(`
                mastery_level,
                review_count,
                words!inner(word)
            `)
            .eq('user_id', currentUser.id);

        const cloudMap = {};
        (cloudData || []).forEach(row => {
            if (row.words?.word) {
                cloudMap[row.words.word] = {
                    masteryLevel: row.mastery_level,
                    reviewCount: row.review_count
                };
            }
        });

        // Filter words that need sync
        const wordsToSync = [];
        for (const word of words) {
            const local = flashcardProgress[word];
            const cloud = cloudMap[word.toLowerCase()];

            if (!cloud) {
                wordsToSync.push(word);
            } else if (local.reviewCount > cloud.reviewCount ||
                       local.masteryLevel > cloud.masteryLevel) {
                wordsToSync.push(word);
            } else {
                skipped++;
            }
        }

        if (wordsToSync.length === 0) {
            if (onProgress) onProgress(100, 100, `无需同步，${skipped} 条已是最新`);
            return { success: true, synced: 0, skipped };
        }

        // Sync only changed items
        for (let i = 0; i < wordsToSync.length; i++) {
            const word = wordsToSync[i];
            const progress = flashcardProgress[word];
            await syncFlashcardProgressToCloud(word, progress);
            synced++;

            if (onProgress && (i + 1) % 10 === 0) {
                onProgress(i + 1, wordsToSync.length, `同步闪卡 ${i + 1}/${wordsToSync.length}`);
            }
        }

        if (onProgress) onProgress(wordsToSync.length, wordsToSync.length, `闪卡完成: ${synced} 新/更新, ${skipped} 跳过`);
        return { success: true, synced, skipped };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Upload flashcard exception:`, e);
        return { success: false, synced, skipped, error: e.message };
    }
}

/**
 * Delete all flashcard progress from cloud for current user
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteAllFlashcardProgressFromCloud() {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const { error } = await supabaseClient
            .from('flashcard_progress')
            .delete()
            .eq('user_id', currentUser.id);

        if (error) {
            console.error(`[${EXTENSION_NAME}] Delete flashcard progress error:`, error);
            return { success: false, error: error.message };
        }

        console.log(`[${EXTENSION_NAME}] Deleted all flashcard progress from cloud`);
        return { success: true };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Delete flashcard exception:`, e);
        return { success: false, error: e.message };
    }
}

// ==================== Immersive Review Sync ====================

/**
 * Sync immersive review to cloud
 * @param {string} word
 * @param {string} status - 'pending', 'reviewing', 'mastered'
 * @param {Object} data - { stage, addedAt, nextReviewAt, lastUsedAt, masteredAt }
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function syncImmersiveReviewToCloud(word, status, data = {}) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const wordId = await getOrCreateWordId(word);
        if (!wordId) {
            return { success: false, error: 'Failed to get word ID' };
        }

        const record = {
            user_id: currentUser.id,
            word_id: wordId,
            status: status,
            stage: data.stage || 0,
            updated_at: new Date().toISOString()
        };

        if (data.addedAt) record.added_at = new Date(data.addedAt).toISOString();
        if (data.nextReviewAt) record.next_review_at = new Date(data.nextReviewAt).toISOString();
        if (data.lastUsedAt) record.last_used_at = new Date(data.lastUsedAt).toISOString();
        if (data.masteredAt) record.mastered_at = new Date(data.masteredAt).toISOString();

        const { error } = await supabaseClient
            .from('immersive_review')
            .upsert(record, {
                onConflict: 'user_id,word_id'
            });

        if (error) {
            console.error(`[${EXTENSION_NAME}] Sync review error:`, error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Sync review exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Delete immersive review from cloud
 * @param {string} word
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteImmersiveReviewFromCloud(word) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        // Get word_id (maybeSingle returns null if not found)
        const { data: wordData } = await supabaseClient
            .from('words')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('word', word.toLowerCase())
            .maybeSingle();

        if (!wordData) {
            return { success: true }; // Word doesn't exist, nothing to delete
        }

        const { error } = await supabaseClient
            .from('immersive_review')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('word_id', wordData.id);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Delete all immersive review data from cloud for current user
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteAllImmersiveReviewFromCloud() {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const { error } = await supabaseClient
            .from('immersive_review')
            .delete()
            .eq('user_id', currentUser.id);

        if (error) {
            console.error(`[${EXTENSION_NAME}] Delete all immersive review error:`, error);
            return { success: false, error: error.message };
        }

        console.log(`[${EXTENSION_NAME}] Deleted all immersive review from cloud`);
        return { success: true };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Delete all immersive review exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Fetch all immersive review data from cloud
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function fetchImmersiveReviewFromCloud() {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const { data, error } = await supabaseClient
            .from('immersive_review')
            .select(`
                *,
                words!inner(word)
            `)
            .eq('user_id', currentUser.id);

        if (error) {
            return { success: false, error: error.message };
        }

        // Convert to local format
        const reviewData = {
            pendingWords: [],
            reviewingWords: {},
            masteredWords: []
        };

        for (const row of (data || [])) {
            const word = row.words?.word;
            if (!word) continue;

            if (row.status === 'pending') {
                reviewData.pendingWords.push({
                    word: word,
                    addedDate: row.added_at ? new Date(row.added_at).getTime() : Date.now()
                });
            } else if (row.status === 'reviewing') {
                reviewData.reviewingWords[word] = {
                    stage: row.stage || 0,
                    nextReviewDate: row.next_review_at ? new Date(row.next_review_at).getTime() : Date.now(),
                    lastUsedDate: row.last_used_at ? new Date(row.last_used_at).getTime() : null
                };
            } else if (row.status === 'mastered') {
                reviewData.masteredWords.push({
                    word: word,
                    masteredDate: row.mastered_at ? new Date(row.mastered_at).getTime() : Date.now()
                });
            }
        }

        return { success: true, data: reviewData };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Fetch review exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Fetch immersive review data updated since a specific time (INCREMENTAL SYNC)
 * @param {number} sinceTimestamp - Timestamp in milliseconds
 * @returns {Promise<{success: boolean, data?: Object, latestUpdatedAt?: number, error?: string}>}
 */
export async function fetchImmersiveReviewIncrementally(sinceTimestamp) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const sinceISO = new Date(sinceTimestamp).toISOString();

        const { data, error } = await supabaseClient
            .from('immersive_review')
            .select(`
                *,
                words!inner(word)
            `)
            .eq('user_id', currentUser.id)
            .gt('updated_at', sinceISO);

        if (error) {
            return { success: false, error: error.message };
        }

        if (!data || data.length === 0) {
            return { success: true, data: { pendingWords: [], reviewingWords: {}, masteredWords: [] }, latestUpdatedAt: sinceTimestamp };
        }

        // Convert to local format and find latest updated_at
        const reviewData = {
            pendingWords: [],
            reviewingWords: {},
            masteredWords: []
        };
        let latestUpdatedAt = sinceTimestamp;

        for (const row of data) {
            const word = row.words?.word;
            if (!word) continue;

            if (row.status === 'pending') {
                reviewData.pendingWords.push({
                    word: word,
                    addedDate: row.added_at ? new Date(row.added_at).getTime() : Date.now()
                });
            } else if (row.status === 'reviewing') {
                reviewData.reviewingWords[word] = {
                    stage: row.stage || 0,
                    nextReviewDate: row.next_review_at ? new Date(row.next_review_at).getTime() : Date.now(),
                    lastUsedDate: row.last_used_at ? new Date(row.last_used_at).getTime() : null
                };
            } else if (row.status === 'mastered') {
                reviewData.masteredWords.push({
                    word: word,
                    masteredDate: row.mastered_at ? new Date(row.mastered_at).getTime() : Date.now()
                });
            }

            // Add 1ms to avoid re-fetching due to precision loss (JS ms vs Supabase microseconds)
            const updatedAt = new Date(row.updated_at).getTime() + 1;
            if (updatedAt > latestUpdatedAt) {
                latestUpdatedAt = updatedAt;
            }
        }

        console.log(`[${EXTENSION_NAME}] Incremental review fetch: ${data.length} records updated since ${sinceISO}`);

        return { success: true, data: reviewData, latestUpdatedAt };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Incremental review fetch exception:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Upload all immersive review data to cloud (INCREMENTAL SYNC)
 * Only uploads items that don't exist in cloud or have higher stage
 * @param {Object} reviewData - { pendingWords, reviewingWords, masteredWords }
 * @param {Function} onProgress
 * @returns {Promise<{success: boolean, synced: number, skipped: number, error?: string}>}
 */
export async function uploadAllImmersiveReviewToCloud(reviewData, onProgress = null) {
    if (!supabaseClient || !currentUser) {
        return { success: false, synced: 0, skipped: 0, error: 'Not logged in' };
    }

    const localTotal = (reviewData.pendingWords?.length || 0) +
                       Object.keys(reviewData.reviewingWords || {}).length +
                       (reviewData.masteredWords?.length || 0);

    if (localTotal === 0) {
        return { success: true, synced: 0, skipped: 0 };
    }

    let synced = 0;
    let skipped = 0;

    try {
        // Fetch existing cloud review data
        if (onProgress) onProgress(0, 100, '检查云端复习数据...');

        const { data: cloudData } = await supabaseClient
            .from('immersive_review')
            .select(`
                status,
                stage,
                words!inner(word)
            `)
            .eq('user_id', currentUser.id);

        const cloudMap = {};
        (cloudData || []).forEach(row => {
            if (row.words?.word) {
                cloudMap[row.words.word] = {
                    status: row.status,
                    stage: row.stage || 0
                };
            }
        });

        // Helper to check if local is newer
        const statusOrder = { 'pending': 0, 'reviewing': 1, 'mastered': 2 };

        const needsSync = (word, localStatus, localStage = 0) => {
            const cloud = cloudMap[word.toLowerCase()];
            if (!cloud) return true;

            const localOrder = statusOrder[localStatus];
            const cloudOrder = statusOrder[cloud.status];

            if (localOrder > cloudOrder) return true;
            if (localOrder === cloudOrder && localStatus === 'reviewing' && localStage > cloud.stage) return true;

            return false;
        };

        // Sync pending words
        for (const item of (reviewData.pendingWords || [])) {
            if (needsSync(item.word, 'pending')) {
                await syncImmersiveReviewToCloud(item.word, 'pending', {
                    addedAt: item.addedDate
                });
                synced++;
            } else {
                skipped++;
            }
            if (onProgress) onProgress(synced + skipped, localTotal, `同步复习 ${synced + skipped}/${localTotal}`);
        }

        // Sync reviewing words
        for (const [word, data] of Object.entries(reviewData.reviewingWords || {})) {
            if (needsSync(word, 'reviewing', data.stage)) {
                await syncImmersiveReviewToCloud(word, 'reviewing', {
                    stage: data.stage,
                    nextReviewAt: data.nextReviewDate,
                    lastUsedAt: data.lastUsedDate
                });
                synced++;
            } else {
                skipped++;
            }
            if (onProgress) onProgress(synced + skipped, localTotal, `同步复习 ${synced + skipped}/${localTotal}`);
        }

        // Sync mastered words
        for (const item of (reviewData.masteredWords || [])) {
            if (needsSync(item.word, 'mastered')) {
                await syncImmersiveReviewToCloud(item.word, 'mastered', {
                    masteredAt: item.masteredDate
                });
                synced++;
            } else {
                skipped++;
            }
            if (onProgress) onProgress(synced + skipped, localTotal, `同步复习 ${synced + skipped}/${localTotal}`);
        }

        if (onProgress) onProgress(localTotal, localTotal, `复习完成: ${synced} 新/更新, ${skipped} 跳过`);
        return { success: true, synced, skipped };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Upload review exception:`, e);
        return { success: false, synced, skipped, error: e.message };
    }
}
