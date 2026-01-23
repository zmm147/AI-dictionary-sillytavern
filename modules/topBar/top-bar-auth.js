/**
 * AI Dictionary - Top Bar Auth Events
 * Authentication and cloud sync event handlers
 */

import { EXTENSION_NAME } from '../constants.js';
import {
    initSupabase,
    signIn,
    signUp,
    signOut,
    onAuthStateChange,
    getCurrentUser,
    isLoggedIn,
    uploadAllWordsToCloud,
    fetchWordsFromCloud,
    fetchWordsIncrementally,
    getCloudWordCount,
    syncWordToCloud,
    deleteWordFromCloud,
    blacklistWordInCloud,
    deleteAllWordsFromCloud,
    syncFlashcardProgressToCloud,
    fetchFlashcardProgressFromCloud,
    fetchFlashcardProgressIncrementally,
    uploadAllFlashcardProgressToCloud,
    syncImmersiveReviewToCloud,
    deleteImmersiveReviewFromCloud,
    deleteAllImmersiveReviewFromCloud,
    fetchImmersiveReviewFromCloud,
    fetchImmersiveReviewIncrementally,
    uploadAllImmersiveReviewToCloud,
    deleteAllFlashcardProgressFromCloud
} from '../supabase.js';
import { getAllWordHistory, mergeCloudData, enableCloudSync, disableCloudSync, replaceAllWordHistory, clearAllWordHistory } from '../wordHistory.js';
import { enableFlashcardCloudSync, disableFlashcardCloudSync, getAllFlashcardProgress, mergeCloudFlashcardData, clearAllFlashcardProgress, replaceAllFlashcardProgress } from '../flashcardProgress.js';
import { enableReviewCloudSync, disableReviewCloudSync, getReviewData, mergeCloudReviewData, replaceAllReviewData } from '../review.js';
import { getLastSyncTime, setLastSyncTime, clearAllSyncTimes } from '../database.js';

/** @type {boolean} */
let isInitialized = false;

/** @type {boolean} */
let cloudSyncSettingEnabled = false;

/** @type {Function|null} */
let saveSettingsCallback = null;

/** @type {boolean} */
let hasDownloadedOnce = false;  // 防止重复下载

/**
 * Set the save settings callback
 * @param {Function} callback
 */
export function setSaveSettingsCallback(callback) {
    saveSettingsCallback = callback;
    console.log(`[${EXTENSION_NAME}] setSaveSettingsCallback called, callback is ${callback ? 'set' : 'null'}`);
}

/**
 * Get cloud sync enabled setting
 * @returns {boolean}
 */
export function getCloudSyncEnabled() {
    return cloudSyncSettingEnabled;
}

/**
 * Set cloud sync enabled setting
 * @param {boolean} enabled
 */
export function setCloudSyncEnabled(enabled) {
    cloudSyncSettingEnabled = enabled;
}

/**
 * Initialize auth module and optionally wait for cloud data
 * @param {boolean} cloudSyncEnabled - Initial cloud sync setting value
 * @param {boolean} waitForCloudData - Whether to wait for cloud data download
 * @returns {Promise<void>}
 */
export async function initAuth(cloudSyncEnabled = false, waitForCloudData = false) {
    if (isInitialized) return;

    cloudSyncSettingEnabled = cloudSyncEnabled;

    const success = await initSupabase();
    if (!success) {
        console.warn(`[${EXTENSION_NAME}] Supabase initialization failed`);
        return;
    }

    // Listen for auth state changes (for future logins/logouts)
    onAuthStateChange(handleAuthStateChange);

    isInitialized = true;
    console.log(`[${EXTENSION_NAME}] Auth module initialized, cloudSyncEnabled: ${cloudSyncEnabled}`);

    // If cloud sync is enabled and user is already logged in, download cloud data
    // Note: handleAuthStateChange will be called immediately by onAuthStateChange,
    // which will trigger autoDownloadFromCloud if hasDownloadedOnce is false.
    // So we don't need to call it again here - just ensure the callbacks are set up.
    if (cloudSyncEnabled && waitForCloudData && isLoggedIn()) {
        console.log(`[${EXTENSION_NAME}] Cloud sync enabled and user logged in, waiting for auto download...`);

        // Enable real-time cloud sync callbacks (handleAuthStateChange may have already done this,
        // but it's idempotent so it's safe to call again)
        enableCloudSync({
            onSync: async (word, data) => {
                const result = await syncWordToCloud(word, data);
                if (result.success) {
                    await setLastSyncTime('words', Date.now());
                }
            },
            onDelete: async (word) => {
                await deleteWordFromCloud(word);
            },
            onBlacklist: async (word) => {
                await blacklistWordInCloud(word);
            }
        });

        enableFlashcardCloudSync(async (word, progress) => {
            const result = await syncFlashcardProgressToCloud(word, progress);
            if (result.success) {
                await setLastSyncTime('flashcard', Date.now());
            }
        });

        enableReviewCloudSync({
            onSync: async (word, status, data) => {
                const result = await syncImmersiveReviewToCloud(word, status, data);
                if (result.success) {
                    await setLastSyncTime('review', Date.now());
                }
            },
            onDelete: async (word) => {
                await deleteImmersiveReviewFromCloud(word);
            },
            onDeleteAll: async () => {
                await deleteAllImmersiveReviewFromCloud();
            }
        });

        // Wait for the download that was triggered by handleAuthStateChange
        // If it hasn't started yet (race condition), trigger it now
        if (!hasDownloadedOnce) {
            hasDownloadedOnce = true;
            await autoDownloadFromCloud();
        }
    }

    // Update UI based on initial setting
    updateCloudSyncUI();
}

/**
 * Update cloud sync UI based on setting
 */
export function updateCloudSyncUI() {
    const toggle = document.getElementById('ai-dict-cloud-sync-toggle');
    const authForm = document.getElementById('ai-dict-auth-form');
    const userInfo = document.getElementById('ai-dict-user-info');

    console.log(`[${EXTENSION_NAME}] updateCloudSyncUI: cloudSyncSettingEnabled=${cloudSyncSettingEnabled}, toggle=${!!toggle}`);

    if (toggle) {
        toggle.checked = cloudSyncSettingEnabled;
    }

    if (!cloudSyncSettingEnabled) {
        // Cloud sync disabled - hide both auth form and user info
        if (authForm) authForm.style.display = 'none';
        if (userInfo) userInfo.style.display = 'none';
    } else {
        // Cloud sync enabled - show appropriate UI based on login state
        if (isLoggedIn()) {
            if (authForm) authForm.style.display = 'none';
            if (userInfo) userInfo.style.display = 'flex';
        } else {
            if (authForm) authForm.style.display = 'flex';
            if (userInfo) userInfo.style.display = 'none';
        }
    }
}

/**
 * Handle cloud sync toggle change
 * @param {boolean} enabled
 */
async function handleCloudSyncToggle(enabled) {
    cloudSyncSettingEnabled = enabled;

    // Save setting
    if (saveSettingsCallback) {
        console.log(`[${EXTENSION_NAME}] Saving cloudSyncEnabled: ${enabled}`);
        saveSettingsCallback('cloudSyncEnabled', enabled);
    } else {
        console.warn(`[${EXTENSION_NAME}] saveSettingsCallback is not set!`);
    }

    updateCloudSyncUI();

    const loggedIn = isLoggedIn();

    if (enabled && loggedIn) {
        // Enable real-time cloud sync callbacks
        enableCloudSync({
            onSync: async (word, data) => {
                const result = await syncWordToCloud(word, data);
                if (result.success) {
                    await setLastSyncTime('words', Date.now());
                }
            },
            onDelete: async (word) => {
                await deleteWordFromCloud(word);
            },
            onBlacklist: async (word) => {
                await blacklistWordInCloud(word);
            }
        });

        enableFlashcardCloudSync(async (word, progress) => {
            const result = await syncFlashcardProgressToCloud(word, progress);
            if (result.success) {
                await setLastSyncTime('flashcard', Date.now());
            }
        });

        enableReviewCloudSync({
            onSync: async (word, status, data) => {
                const result = await syncImmersiveReviewToCloud(word, status, data);
                if (result.success) {
                    await setLastSyncTime('review', Date.now());
                }
            },
            onDelete: async (word) => {
                await deleteImmersiveReviewFromCloud(word);
            },
            onDeleteAll: async () => {
                await deleteAllImmersiveReviewFromCloud();
            }
        });

        console.log(`[${EXTENSION_NAME}] Real-time cloud sync enabled`);

        hasDownloadedOnce = true;
        // Cloud sync just enabled and user is logged in - download cloud data
        await autoDownloadFromCloud();
    } else if (!enabled) {
        // Disable real-time cloud sync callbacks
        disableCloudSync();
        disableFlashcardCloudSync();
        disableReviewCloudSync();
        hasDownloadedOnce = false;

        // Cloud sync disabled - clear sync times
        await clearAllSyncTimes();
    }

    console.log(`[${EXTENSION_NAME}] Cloud sync ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Auto download from cloud using incremental sync
 * First sync: full download and replace
 * Subsequent syncs: only download changes since last sync
 */
async function autoDownloadFromCloud() {
    console.log(`[${EXTENSION_NAME}] Auto downloading from cloud...`);

    showSyncProgress(0, 100, '检查同步状态...');

    try {
        // Get last sync times
        const lastWordSync = await getLastSyncTime('words');
        const lastFlashcardSync = await getLastSyncTime('flashcard');
        const lastReviewSync = await getLastSyncTime('review');

        const isFirstSync = lastWordSync === 0 && lastFlashcardSync === 0 && lastReviewSync === 0;

        if (isFirstSync) {
            // First sync: full download
            console.log(`[${EXTENSION_NAME}] First sync detected, performing full download...`);
            await performFullDownload();
        } else {
            // Incremental sync
            console.log(`[${EXTENSION_NAME}] Incremental sync, last sync times: words=${new Date(lastWordSync).toISOString()}, flashcard=${new Date(lastFlashcardSync).toISOString()}, review=${new Date(lastReviewSync).toISOString()}`);
            await performIncrementalSync(lastWordSync, lastFlashcardSync, lastReviewSync);
        }

        showSyncProgress(100, 100, '同步完成');
        setTimeout(hideSyncProgress, 2000);
        updateWordCounts();

        console.log(`[${EXTENSION_NAME}] Auto download from cloud completed`);
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Auto download error:`, e);
        showSyncProgress(100, 100, '同步失败: ' + e.message);
        setTimeout(hideSyncProgress, 3000);
    }
}

/**
 * Perform full download from cloud (first sync)
 */
async function performFullDownload() {
    showSyncProgress(10, 100, '首次同步，下载全部数据...');

    // 1. Download word history
    showSyncProgress(10, 100, '下载单词数据...');
    const wordResult = await fetchWordsFromCloud();

    if (wordResult.success && wordResult.data && Object.keys(wordResult.data).length > 0) {
        const cloudWordCount = Object.keys(wordResult.data).length;
        showSyncProgress(30, 100, `替换 ${cloudWordCount} 词...`);
        await replaceAllWordHistory(wordResult.data);
        await setLastSyncTime('words', Date.now());
    } else {
        console.log(`[${EXTENSION_NAME}] Cloud word history is empty, keeping local data`);
        await setLastSyncTime('words', Date.now());
    }

    // 2. Download flashcard progress
    showSyncProgress(40, 100, '下载闪卡数据...');
    const flashcardResult = await fetchFlashcardProgressFromCloud();

    if (flashcardResult.success && flashcardResult.data && Object.keys(flashcardResult.data).length > 0) {
        const cloudFlashcardCount = Object.keys(flashcardResult.data).length;
        showSyncProgress(60, 100, `替换 ${cloudFlashcardCount} 闪卡...`);
        await replaceAllFlashcardProgress(flashcardResult.data);
        await setLastSyncTime('flashcard', Date.now());
    } else {
        console.log(`[${EXTENSION_NAME}] Cloud flashcard data is empty, keeping local data`);
        await setLastSyncTime('flashcard', Date.now());
    }

    // 3. Download immersive review data
    showSyncProgress(70, 100, '下载复习数据...');
    const reviewResult = await fetchImmersiveReviewFromCloud();

    if (reviewResult.success && reviewResult.data) {
        const reviewCount = (reviewResult.data.pendingWords?.length || 0) +
                           Object.keys(reviewResult.data.reviewingWords || {}).length +
                           (reviewResult.data.masteredWords?.length || 0);
        if (reviewCount > 0) {
            showSyncProgress(90, 100, '替换复习数据...');
            await replaceAllReviewData(reviewResult.data);
        } else {
            console.log(`[${EXTENSION_NAME}] Cloud review data is empty, keeping local data`);
        }
        await setLastSyncTime('review', Date.now());
    }
}

/**
 * Perform incremental sync from cloud
 * @param {number} lastWordSync
 * @param {number} lastFlashcardSync
 * @param {number} lastReviewSync
 */
async function performIncrementalSync(lastWordSync, lastFlashcardSync, lastReviewSync) {
    let totalUpdated = 0;

    // 1. Incremental word sync
    showSyncProgress(10, 100, '检查单词更新...');
    const wordResult = await fetchWordsIncrementally(lastWordSync);

    if (wordResult.success && wordResult.data && Object.keys(wordResult.data).length > 0) {
        const updateCount = Object.keys(wordResult.data).length;
        showSyncProgress(30, 100, `合并 ${updateCount} 词更新...`);
        await mergeCloudData(wordResult.data);
        totalUpdated += updateCount;
        await setLastSyncTime('words', wordResult.latestUpdatedAt || Date.now());
    } else if (wordResult.success) {
        console.log(`[${EXTENSION_NAME}] No word updates since last sync`);
        await setLastSyncTime('words', Date.now());
    }

    // 2. Incremental flashcard sync
    showSyncProgress(40, 100, '检查闪卡更新...');
    const flashcardResult = await fetchFlashcardProgressIncrementally(lastFlashcardSync);

    if (flashcardResult.success && flashcardResult.data && Object.keys(flashcardResult.data).length > 0) {
        const updateCount = Object.keys(flashcardResult.data).length;
        showSyncProgress(60, 100, `合并 ${updateCount} 闪卡更新...`);
        await mergeCloudFlashcardData(flashcardResult.data);
        totalUpdated += updateCount;
        await setLastSyncTime('flashcard', flashcardResult.latestUpdatedAt || Date.now());
    } else if (flashcardResult.success) {
        console.log(`[${EXTENSION_NAME}] No flashcard updates since last sync`);
        await setLastSyncTime('flashcard', Date.now());
    }

    // 3. Incremental review sync
    showSyncProgress(70, 100, '检查复习更新...');
    const reviewResult = await fetchImmersiveReviewIncrementally(lastReviewSync);

    if (reviewResult.success && reviewResult.data) {
        const reviewCount = (reviewResult.data.pendingWords?.length || 0) +
                           Object.keys(reviewResult.data.reviewingWords || {}).length +
                           (reviewResult.data.masteredWords?.length || 0);
        if (reviewCount > 0) {
            showSyncProgress(90, 100, `合并 ${reviewCount} 复习更新...`);
            await mergeCloudReviewData(reviewResult.data);
            totalUpdated += reviewCount;
        } else {
            console.log(`[${EXTENSION_NAME}] No review updates since last sync`);
        }
        await setLastSyncTime('review', reviewResult.latestUpdatedAt || Date.now());
    }

    if (totalUpdated === 0) {
        showSyncProgress(100, 100, '数据已是最新');
    } else {
        showSyncProgress(100, 100, `同步完成，更新 ${totalUpdated} 条`);
    }
}

/**
 * Handle auth state changes
 * Note: This is called on SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED
 * We should only trigger sync on actual login, not on token refresh
 * @param {any} user
 */
function handleAuthStateChange(user) {
    const authForm = document.getElementById('ai-dict-auth-form');
    const userInfo = document.getElementById('ai-dict-user-info');
    const userEmail = document.getElementById('ai-dict-user-email');

    // Update UI if elements exist
    if (authForm && userInfo) {
        // Only show auth UI if cloud sync is enabled
        if (!cloudSyncSettingEnabled) {
            authForm.style.display = 'none';
            userInfo.style.display = 'none';
        } else if (user) {
            // User is logged in
            authForm.style.display = 'none';
            userInfo.style.display = 'flex';
            if (userEmail) {
                userEmail.textContent = user.email;
            }
            // Update word counts
            updateWordCounts();
        } else {
            // User is logged out
            authForm.style.display = 'flex';
            userInfo.style.display = 'none';
        }
    }

    // Handle cloud sync logic regardless of UI elements
    if (user && cloudSyncSettingEnabled) {
        // Enable real-time cloud sync
        enableCloudSync({
            onSync: async (word, data) => {
                const result = await syncWordToCloud(word, data);
                if (result.success) {
                    await setLastSyncTime('words', Date.now());
                }
            },
            onDelete: async (word) => {
                await deleteWordFromCloud(word);
            },
            onBlacklist: async (word) => {
                await blacklistWordInCloud(word);
            }
        });

        // Enable flashcard cloud sync
        enableFlashcardCloudSync(async (word, progress) => {
            const result = await syncFlashcardProgressToCloud(word, progress);
            if (result.success) {
                await setLastSyncTime('flashcard', Date.now());
            }
        });

        // Enable immersive review cloud sync
        enableReviewCloudSync({
            onSync: async (word, status, data) => {
                const result = await syncImmersiveReviewToCloud(word, status, data);
                if (result.success) {
                    await setLastSyncTime('review', Date.now());
                }
            },
            onDelete: async (word) => {
                await deleteImmersiveReviewFromCloud(word);
            },
            onDeleteAll: async () => {
                await deleteAllImmersiveReviewFromCloud();
            }
        });

        console.log(`[${EXTENSION_NAME}] Real-time cloud sync enabled`);

        // Only auto download once per session to avoid repeated downloads on token refresh
        if (!hasDownloadedOnce) {
            hasDownloadedOnce = true;
            autoDownloadFromCloud();
        }
    } else if (!user) {
        // Disable real-time cloud sync
        disableCloudSync();
        disableFlashcardCloudSync();
        disableReviewCloudSync();
        // Reset flag so next login will trigger download
        hasDownloadedOnce = false;
    }
}

/**
 * Update local and cloud word counts
 */
async function updateWordCounts() {
    const localCountEl = document.getElementById('ai-dict-local-count');
    const cloudCountEl = document.getElementById('ai-dict-cloud-count');

    if (localCountEl) {
        const localData = getAllWordHistory();
        localCountEl.textContent = Object.keys(localData).length;
    }

    if (cloudCountEl && isLoggedIn()) {
        const cloudCount = await getCloudWordCount();
        cloudCountEl.textContent = cloudCount;
    }
}

/**
 * Show error message
 * @param {string} message
 */
function showAuthError(message) {
    const errorEl = document.getElementById('ai-dict-auth-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
}

/**
 * Clear error message
 */
function clearAuthError() {
    const errorEl = document.getElementById('ai-dict-auth-error');
    if (errorEl) {
        errorEl.style.display = 'none';
    }
}

/**
 * Set button loading state
 * @param {HTMLElement} button
 * @param {boolean} loading
 * @param {string} originalIcon
 */
function setButtonLoading(button, loading, originalIcon = '') {
    if (!button) return;

    const icon = button.querySelector('i');
    if (loading) {
        button.classList.add('loading');
        if (icon) {
            icon.dataset.originalClass = icon.className;
            icon.className = 'fa-solid fa-spinner';
        }
    } else {
        button.classList.remove('loading');
        if (icon && icon.dataset.originalClass) {
            icon.className = icon.dataset.originalClass;
        }
    }
}

/**
 * Show sync progress
 * @param {number} current
 * @param {number} total
 * @param {string} text
 */
function showSyncProgress(current, total, text = '') {
    const progressEl = document.getElementById('ai-dict-sync-progress');
    const fillEl = document.getElementById('ai-dict-progress-fill');
    const textEl = document.getElementById('ai-dict-progress-text');

    if (progressEl) {
        progressEl.style.display = 'flex';
    }
    if (fillEl) {
        const percent = total > 0 ? (current / total) * 100 : 0;
        fillEl.style.width = `${percent}%`;
    }
    if (textEl) {
        textEl.textContent = text || `${current}/${total}`;
    }
}

/**
 * Hide sync progress
 */
function hideSyncProgress() {
    const progressEl = document.getElementById('ai-dict-sync-progress');
    if (progressEl) {
        progressEl.style.display = 'none';
    }
}

/**
 * Handle login button click
 */
async function handleLogin() {
    const emailInput = document.getElementById('ai-dict-auth-email');
    const passwordInput = document.getElementById('ai-dict-auth-password');
    const loginBtn = document.getElementById('ai-dict-auth-login-btn');

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
        showAuthError('请输入邮箱和密码');
        return;
    }

    clearAuthError();
    setButtonLoading(loginBtn, true);

    const result = await signIn(email, password);

    setButtonLoading(loginBtn, false);

    if (!result.success) {
        showAuthError(result.error || '登录失败');
    } else {
        // Clear inputs on success
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
    }
}

/**
 * Handle register button click
 */
async function handleRegister() {
    const emailInput = document.getElementById('ai-dict-auth-email');
    const passwordInput = document.getElementById('ai-dict-auth-password');
    const registerBtn = document.getElementById('ai-dict-auth-register-btn');

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
        showAuthError('请输入邮箱和密码');
        return;
    }

    if (password.length < 6) {
        showAuthError('密码至少需要6个字符');
        return;
    }

    clearAuthError();
    setButtonLoading(registerBtn, true);

    const result = await signUp(email, password);

    setButtonLoading(registerBtn, false);

    if (!result.success) {
        showAuthError(result.error || '注册失败');
    } else {
        // Clear inputs on success
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
        // Note: Supabase may auto-login after signup if email verification is disabled
    }
}

/**
 * Handle logout button click
 */
async function handleLogout() {
    const logoutBtn = document.getElementById('ai-dict-auth-logout-btn');

    setButtonLoading(logoutBtn, true);

    await signOut();

    setButtonLoading(logoutBtn, false);
}

/**
 * Handle upload to cloud
 */
async function handleUpload() {
    const uploadBtn = document.getElementById('ai-dict-sync-upload-btn');

    if (!isLoggedIn()) {
        showAuthError('请先登录');
        return;
    }

    setButtonLoading(uploadBtn, true);

    // 1. Upload word history
    const localData = getAllWordHistory();
    const wordCount = Object.keys(localData).length;

    if (wordCount > 0) {
        showSyncProgress(0, 100, '上传单词数据...');
        await uploadAllWordsToCloud(localData, (current, total, message) => {
            showSyncProgress(current, total, message || `上传单词 ${current}/${total}`);
        });
    }

    // 2. Upload flashcard progress
    const flashcardData = getAllFlashcardProgress();
    const flashcardCount = Object.keys(flashcardData).length;

    if (flashcardCount > 0) {
        showSyncProgress(0, 100, '上传闪卡数据...');
        await uploadAllFlashcardProgressToCloud(flashcardData, (current, total, message) => {
            showSyncProgress(current, total, message || `上传闪卡 ${current}/${total}`);
        });
    }

    // 3. Upload immersive review data
    const reviewData = getReviewData();
    const reviewCount = (reviewData.pendingWords?.length || 0) +
                        Object.keys(reviewData.reviewingWords || {}).length +
                        (reviewData.masteredWords?.length || 0);

    if (reviewCount > 0) {
        showSyncProgress(0, 100, '上传复习数据...');
        await uploadAllImmersiveReviewToCloud(reviewData, (current, total, message) => {
            showSyncProgress(current, total, message || `上传复习 ${current}/${total}`);
        });
    }

    setButtonLoading(uploadBtn, false);
    showSyncProgress(100, 100, `上传完成: ${wordCount}词 ${flashcardCount}闪卡 ${reviewCount}复习`);
    setTimeout(hideSyncProgress, 3000);
    updateWordCounts();
}

/**
 * Handle download from cloud
 */
async function handleDownload() {
    const downloadBtn = document.getElementById('ai-dict-sync-download-btn');

    if (!isLoggedIn()) {
        showAuthError('请先登录');
        return;
    }

    setButtonLoading(downloadBtn, true);

    // 1. Download word history
    showSyncProgress(0, 100, '下载单词数据...');
    const wordResult = await fetchWordsFromCloud();

    if (wordResult.success && wordResult.data) {
        const cloudWordCount = Object.keys(wordResult.data).length;
        showSyncProgress(33, 100, `合并 ${cloudWordCount} 词...`);
        await mergeCloudData(wordResult.data);
    }

    // 2. Download flashcard progress
    showSyncProgress(33, 100, '下载闪卡数据...');
    const flashcardResult = await fetchFlashcardProgressFromCloud();

    if (flashcardResult.success && flashcardResult.data) {
        const cloudFlashcardCount = Object.keys(flashcardResult.data).length;
        showSyncProgress(66, 100, `合并 ${cloudFlashcardCount} 闪卡...`);
        await mergeCloudFlashcardData(flashcardResult.data);
    }

    // 3. Download immersive review data
    showSyncProgress(66, 100, '下载复习数据...');
    const reviewResult = await fetchImmersiveReviewFromCloud();

    if (reviewResult.success && reviewResult.data) {
        const cloudReviewCount = (reviewResult.data.pendingWords?.length || 0) +
                                 Object.keys(reviewResult.data.reviewingWords || {}).length +
                                 (reviewResult.data.masteredWords?.length || 0);
        showSyncProgress(100, 100, `合并 ${cloudReviewCount} 复习...`);
        await mergeCloudReviewData(reviewResult.data);
    }

    setButtonLoading(downloadBtn, false);
    showSyncProgress(100, 100, '下载完成');
    setTimeout(hideSyncProgress, 3000);
    updateWordCounts();
}

/**
 * Handle clear flashcard button click
 */
async function handleClearFlashcard() {
    const flashcardData = getAllFlashcardProgress();
    const count = Object.keys(flashcardData).length;

    if (count === 0) {
        alert('没有闪卡记录可清空');
        return;
    }

    const loggedIn = isLoggedIn();
    const deleteCloud = loggedIn && cloudSyncSettingEnabled;
    const confirmMsg = deleteCloud
        ? `确定要清空所有 ${count} 条闪卡背单词记录吗？\n\n此操作将删除：\n- 本地 IndexedDB 数据\n- 本地备份文件\n- 云端数据\n\n此操作不可恢复！`
        : `确定要清空所有 ${count} 条闪卡背单词记录吗？\n\n此操作将删除：\n- 本地 IndexedDB 数据\n- 本地备份文件\n\n此操作不可恢复！`;

    const confirmed = confirm(confirmMsg);

    if (!confirmed) {
        return;
    }

    const clearBtn = document.getElementById('ai-dict-clear-flashcard-btn');
    if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>清空中...</span>';
    }

    try {
        // Delete from cloud first if logged in
        if (deleteCloud) {
            const cloudResult = await deleteAllFlashcardProgressFromCloud();
            if (!cloudResult.success) {
                console.warn('Cloud delete failed:', cloudResult.error);
            }
        }

        // Then delete local data
        await clearAllFlashcardProgress();
        alert(`已清空 ${count} 条闪卡记录` + (deleteCloud ? '（含云端）' : ''));
    } catch (e) {
        alert('清空失败: ' + e.message);
    }

    if (clearBtn) {
        clearBtn.disabled = false;
        clearBtn.innerHTML = '<i class="fa-solid fa-trash-alt"></i> <span>清空闪卡记录</span>';
    }
}

/**
 * Handle clear word history button click
 */
async function handleClearWordHistory() {
    const wordHistoryData = getAllWordHistory();
    const count = Object.keys(wordHistoryData).length;

    if (count === 0) {
        alert('没有查词记录可清空');
        return;
    }

    const loggedIn = isLoggedIn();
    const deleteCloud = loggedIn && cloudSyncSettingEnabled;
    const confirmMsg = deleteCloud
        ? `确定要清空所有 ${count} 条查词记录吗？\n\n此操作将删除：\n- 本地 IndexedDB 数据\n- 本地备份文件\n- 云端数据\n\n此操作不可恢复！`
        : `确定要清空所有 ${count} 条查词记录吗？\n\n此操作将删除：\n- 本地 IndexedDB 数据\n- 本地备份文件\n\n此操作不可恢复！`;

    const confirmed = confirm(confirmMsg);

    if (!confirmed) {
        return;
    }

    const clearBtn = document.getElementById('ai-dict-clear-word-history-btn');
    if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>清空中...</span>';
    }

    try {
        // Delete from cloud first if logged in
        if (deleteCloud) {
            const cloudResult = await deleteAllWordsFromCloud();
            if (!cloudResult.success) {
                console.warn('Cloud delete failed:', cloudResult.error);
            }
        }

        // Then delete local data
        await clearAllWordHistory();
        alert(`已清空 ${count} 条查词记录` + (deleteCloud ? '（含云端）' : ''));
    } catch (e) {
        alert('清空失败: ' + e.message);
    }

    if (clearBtn) {
        clearBtn.disabled = false;
        clearBtn.innerHTML = '<i class="fa-solid fa-trash-alt"></i> <span>清空查词记录</span>';
    }
}

/**
 * Bind auth events to UI elements
 */
export function bindAuthEvents() {
    // Cloud sync toggle
    const cloudSyncToggle = document.getElementById('ai-dict-cloud-sync-toggle');
    if (cloudSyncToggle) {
        console.log(`[${EXTENSION_NAME}] Binding cloud sync toggle event`);
        cloudSyncToggle.addEventListener('change', (e) => {
            handleCloudSyncToggle(e.target.checked);
        });
    } else {
        console.warn(`[${EXTENSION_NAME}] Cloud sync toggle element not found!`);
    }

    // Login button
    const loginBtn = document.getElementById('ai-dict-auth-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }

    // Register button
    const registerBtn = document.getElementById('ai-dict-auth-register-btn');
    if (registerBtn) {
        registerBtn.addEventListener('click', handleRegister);
    }

    // Logout button
    const logoutBtn = document.getElementById('ai-dict-auth-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Upload button
    const uploadBtn = document.getElementById('ai-dict-sync-upload-btn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', handleUpload);
    }

    // Download button
    const downloadBtn = document.getElementById('ai-dict-sync-download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', handleDownload);
    }

    // Enter key on password field triggers login
    const passwordInput = document.getElementById('ai-dict-auth-password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });
    }

    // Clear flashcard button
    const clearFlashcardBtn = document.getElementById('ai-dict-clear-flashcard-btn');
    if (clearFlashcardBtn) {
        clearFlashcardBtn.addEventListener('click', handleClearFlashcard);
    }

    // Clear word history button
    const clearWordHistoryBtn = document.getElementById('ai-dict-clear-word-history-btn');
    if (clearWordHistoryBtn) {
        clearWordHistoryBtn.addEventListener('click', handleClearWordHistory);
    }
}
