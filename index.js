import { extension_settings, getContext } from '../../../extensions.js';
import { getRequestHeaders, eventSource, event_types, generateRaw, saveSettingsDebounced, setExtensionPrompt, extension_prompt_types } from '../../../../script.js';
import { oai_settings, chat_completion_sources, sendOpenAIRequest } from '../../../openai.js';

const EXTENSION_NAME = 'ai-dictionary';

// Dynamically determine extension path
const getExtensionUrl = () => {
    try {
        const url = new URL(import.meta.url);
        return url.pathname.substring(0, url.pathname.lastIndexOf('/'));
    } catch {
        return `scripts/extensions/${EXTENSION_NAME}`;
    }
};
const EXTENSION_URL = getExtensionUrl();

// Helper to detect mobile device
function isMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|ipad|iphone|ipod/i.test(userAgent.toLowerCase()) || window.innerWidth <= 800;
}

// Helper to detect Android device specifically
function isAndroid() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android/i.test(userAgent.toLowerCase());
}

const defaultSettings = {
    enabled: true,
    systemPrompt: 'You are a professional English teacher.',
    userPrompt: `输入：%word%
上下文：%context%

请根据输入内容进行处理：
1. 如果是单词：给出基础释义（用【解释性描述】），然后分析在上下文中的具体含义。
2. 如果是短语或句子：先给出中文翻译再分析句子结构。`,
    contextRange: 'all', // 'all' = 全段, 'single' = 单段, 'sentence' = 一句
    connectionProfile: '', // Connection Profile ID, empty means use current
    enableDirectLookup: false,
    iconPosition: 'bottom-left',
    mobileTogglePosition: null, // Will be set to default on first load
    deepStudyPrompt: `请帮我深度学习单词 "%word%"：
1. 词根词缀分析（如有）
2. 常见搭配和用法
3. 同义词/反义词/易混淆单词
4. 记忆技巧建议`,
    confusableWordsPrompt: `请列出与单词 "%word%" 形近易混淆的单词（拼写相似但意思不同的词）。

请严格按照以下格式输出：
【形近词列表】word1, word2, word3
【释义】
- word1: 释义
- word2: 释义
- word3: 释义

注意：
1. 只列出拼写相似、容易混淆的单词
2. 每个单词给出简短的中文释义
3. 如果没有常见的形近词，请说明`,
    confusableWords: {}, // 存储收藏的形近词 { "word": [{ word: "xxx", meaning: "xxx" }] }
    highlightConfusables: false, // 是否高亮收藏的形近词
    highlightColor: '#e0a800', // 高亮字体颜色
    autoCollapseYoudao: false, // 是否自动折叠有道词典释义
    autoFetchAI: true, // 是否自动获取AI释义
    fetchAIOnYoudaoExpand: true, // 折叠有道释义时自动获取AI（当AI释义为空时）
    // 沉浸式复习设置
    immersiveReview: true, // 是否开启沉浸式复习（默认开启）
    reviewPrompt: `Naturally incorporate the following words into the narrative at least once, without making the story feel forced or awkward: [%words%]. If the current part of the story does not naturally fit these words, you may develop the scene to make their use plausible.`, // 复习提示词
};

/** @type {Object} */
let settings = { ...defaultSettings };
/** @type {HTMLElement} */
let panelElement = null;
/** @type {HTMLElement} */
let toggleElement = null;
/** @type {HTMLElement} */
let iconElement = null;
/** @type {string} */
let selectedText = '';
/** @type {string} */
let selectedContext = '';
/** @type {boolean} */
let isPanelPinned = false;
/** @type {Array} */
let chatHistory = [];
/** @type {string} */
let currentWord = '';

/**
 * Settings UI Class
 * mimicking Quick Reply's SettingsUi structure
 */
class SettingsUi {
    constructor() {
        this.dom = null;
        this.template = null;
    }

    async render() {
        if (!this.dom) {
            // Fetch the HTML template using dynamic path
            const response = await fetch(`${EXTENSION_URL}/index.html`);
            if (response.ok) {
                const text = await response.text();
                // Create a document fragment
                this.template = document.createRange().createContextualFragment(text);
                // We expect the first child or the one with id 'ai-dictionary-extension-settings'
                this.dom = this.template.querySelector('#ai-dictionary-extension-settings');
                this.prepareDom();
            } else {
                console.error(`[${EXTENSION_NAME}] Failed to fetch settings template from ${EXTENSION_URL}/index.html`);
            }
        }
        return this.dom;
    }

    prepareDom() {
        if (!this.dom) return;

        // Enabled Toggle
        const enabledInput = this.dom.querySelector('#ai-dict-enabled');
        if (enabledInput) {
            enabledInput.checked = settings.enabled;
            enabledInput.addEventListener('change', () => {
                settings.enabled = enabledInput.checked;
                saveSettings();
            });
        }

        // Connection Profile
        const profileSelect = this.dom.querySelector('#ai-dict-connection-profile');
        if (profileSelect) {
            // Populate connection profiles
            populateConnectionProfiles(profileSelect);
            profileSelect.value = settings.connectionProfile || '';
            profileSelect.addEventListener('change', () => {
                settings.connectionProfile = profileSelect.value;
                saveSettings();
            });
        }

        // System Prompt
        const promptInput = this.dom.querySelector('#ai-dict-system-prompt');
        if (promptInput) {
            promptInput.value = settings.systemPrompt;
            promptInput.addEventListener('change', () => {
                settings.systemPrompt = promptInput.value;
                saveSettings();
            });
        }

        // User Prompt
        const userPromptInput = this.dom.querySelector('#ai-dict-user-prompt');
        if (userPromptInput) {
            userPromptInput.value = settings.userPrompt;
            userPromptInput.addEventListener('change', () => {
                settings.userPrompt = userPromptInput.value;
                saveSettings();
            });
        }

        // Context Range
        const rangeSelect = this.dom.querySelector('#ai-dict-context-range');

        if (rangeSelect) {
            rangeSelect.value = settings.contextRange;
            rangeSelect.addEventListener('change', () => {
                settings.contextRange = rangeSelect.value;
                saveSettings();
            });
        }

        // Direct Lookup
        const directLookupInput = this.dom.querySelector('#ai-dict-direct-lookup');
        if (directLookupInput) {
            directLookupInput.checked = settings.enableDirectLookup;
            directLookupInput.addEventListener('change', () => {
                settings.enableDirectLookup = directLookupInput.checked;
                saveSettings();
            });
        }

        // Icon Position
        const iconPosSelect = this.dom.querySelector('#ai-dict-icon-position');
        if (iconPosSelect) {
            iconPosSelect.value = settings.iconPosition;
            iconPosSelect.addEventListener('change', () => {
                settings.iconPosition = iconPosSelect.value;
                saveSettings();
            });
        }

        // Auto Collapse Youdao
        const autoCollapseYoudaoInput = this.dom.querySelector('#ai-dict-auto-collapse-youdao');
        if (autoCollapseYoudaoInput) {
            autoCollapseYoudaoInput.checked = settings.autoCollapseYoudao;
            autoCollapseYoudaoInput.addEventListener('change', () => {
                settings.autoCollapseYoudao = autoCollapseYoudaoInput.checked;
                saveSettings();
            });
        }

        // Auto Fetch AI
        const autoFetchAIInput = this.dom.querySelector('#ai-dict-auto-fetch-ai');
        if (autoFetchAIInput) {
            autoFetchAIInput.checked = settings.autoFetchAI;
            autoFetchAIInput.addEventListener('change', () => {
                settings.autoFetchAI = autoFetchAIInput.checked;
                saveSettings();
            });
        }

        // Fetch AI on Youdao Expand
        const fetchAIOnYoudaoExpandInput = this.dom.querySelector('#ai-dict-fetch-ai-on-youdao-expand');
        if (fetchAIOnYoudaoExpandInput) {
            fetchAIOnYoudaoExpandInput.checked = settings.fetchAIOnYoudaoExpand;
            fetchAIOnYoudaoExpandInput.addEventListener('change', () => {
                settings.fetchAIOnYoudaoExpand = fetchAIOnYoudaoExpandInput.checked;
                saveSettings();
            });
        }

        // Deep Study Prompt
        const deepStudyPromptInput = this.dom.querySelector('#ai-dict-deep-study-prompt');
        if (deepStudyPromptInput) {
            deepStudyPromptInput.value = settings.deepStudyPrompt;
            deepStudyPromptInput.addEventListener('change', () => {
                settings.deepStudyPrompt = deepStudyPromptInput.value;
                saveSettings();
            });
        }

        // Highlight Confusables
        const highlightConfusablesInput = this.dom.querySelector('#ai-dict-highlight-confusables');
        const highlightColorContainer = this.dom.querySelector('#ai-dict-highlight-color-container');
        const highlightColorInput = this.dom.querySelector('#ai-dict-highlight-color');

        if (highlightConfusablesInput) {
            highlightConfusablesInput.checked = settings.highlightConfusables;

            // Show/hide color picker based on checkbox state
            if (highlightColorContainer) {
                highlightColorContainer.style.display = settings.highlightConfusables ? 'block' : 'none';
            }

            highlightConfusablesInput.addEventListener('change', () => {
                settings.highlightConfusables = highlightConfusablesInput.checked;
                saveSettings();

                // Show/hide color picker
                if (highlightColorContainer) {
                    highlightColorContainer.style.display = settings.highlightConfusables ? 'block' : 'none';
                }

                // Remove existing highlights when disabled, or apply when enabled
                if (!settings.highlightConfusables) {
                    removeConfusableHighlights();
                } else {
                    highlightAllConfusableWords();
                }
            });
        }

        // Highlight Color
        if (highlightColorInput) {
            highlightColorInput.value = settings.highlightColor;
            highlightColorInput.addEventListener('input', () => {
                settings.highlightColor = highlightColorInput.value;
                saveSettings();
                // Update CSS variable for highlight color
                updateHighlightColor();
                // Re-apply highlights with new color
                if (settings.highlightConfusables) {
                    highlightAllConfusableWords();
                }
            });
        }

        // Statistics Button
        const statsBtn = this.dom.querySelector('#ai-dict-stats-btn');
        if (statsBtn) {
            statsBtn.addEventListener('click', () => {
                showStatisticsPanel();
            });
        }

        // Immersive Review Toggle
        const immersiveReviewInput = this.dom.querySelector('#ai-dict-immersive-review');
        const reviewPromptContainer = this.dom.querySelector('#ai-dict-review-prompt-container');
        if (immersiveReviewInput) {
            immersiveReviewInput.checked = settings.immersiveReview;
            // 初始化时显示/隐藏 prompt container
            if (reviewPromptContainer) {
                reviewPromptContainer.style.display = settings.immersiveReview ? 'block' : 'none';
            }
            immersiveReviewInput.addEventListener('change', () => {
                settings.immersiveReview = immersiveReviewInput.checked;
                // 显示/隐藏 prompt container
                if (reviewPromptContainer) {
                    reviewPromptContainer.style.display = immersiveReviewInput.checked ? 'block' : 'none';
                }
                saveSettings();
            });
        }

        // Review Prompt Textarea
        const reviewPromptInput = this.dom.querySelector('#ai-dict-review-prompt');
        if (reviewPromptInput) {
            reviewPromptInput.value = settings.reviewPrompt || defaultSettings.reviewPrompt;
            reviewPromptInput.addEventListener('input', () => {
                settings.reviewPrompt = reviewPromptInput.value;
                saveSettings();
            });
        }

        const resetReviewPromptBtn = this.dom.querySelector('#ai-dict-reset-review-prompt');
        if (resetReviewPromptBtn) {
            resetReviewPromptBtn.addEventListener('click', () => {
                const promptInput = this.dom.querySelector('#ai-dict-review-prompt');
                if (promptInput) {
                    promptInput.value = defaultSettings.reviewPrompt;
                    settings.reviewPrompt = defaultSettings.reviewPrompt;
                    saveSettings();
                }
            });
        }

        // Reset Buttons for Prompts
        const resetSystemPromptBtn = this.dom.querySelector('#ai-dict-reset-system-prompt');
        if (resetSystemPromptBtn) {
            resetSystemPromptBtn.addEventListener('click', () => {
                const promptInput = this.dom.querySelector('#ai-dict-system-prompt');
                if (promptInput) {
                    promptInput.value = defaultSettings.systemPrompt;
                    settings.systemPrompt = defaultSettings.systemPrompt;
                    saveSettings();
                }
            });
        }

        const resetUserPromptBtn = this.dom.querySelector('#ai-dict-reset-user-prompt');
        if (resetUserPromptBtn) {
            resetUserPromptBtn.addEventListener('click', () => {
                const promptInput = this.dom.querySelector('#ai-dict-user-prompt');
                if (promptInput) {
                    promptInput.value = defaultSettings.userPrompt;
                    settings.userPrompt = defaultSettings.userPrompt;
                    saveSettings();
                }
            });
        }

        const resetDeepStudyPromptBtn = this.dom.querySelector('#ai-dict-reset-deep-study-prompt');
        if (resetDeepStudyPromptBtn) {
            resetDeepStudyPromptBtn.addEventListener('click', () => {
                const promptInput = this.dom.querySelector('#ai-dict-deep-study-prompt');
                if (promptInput) {
                    promptInput.value = defaultSettings.deepStudyPrompt;
                    settings.deepStudyPrompt = defaultSettings.deepStudyPrompt;
                    saveSettings();
                }
            });
        }

        // Farm Game Button
        const farmBtn = this.dom.querySelector('#ai-dict-farm-btn');
        if (farmBtn) {
            farmBtn.addEventListener('click', () => {
                showFarmGamePanel();
            });
        }
    }
}

/**
 * Populate connection profiles dropdown
 * @param {HTMLSelectElement} selectElement
 */
function populateConnectionProfiles(selectElement) {
    // Clear existing options except the first one
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    // Get connection profiles from extension_settings
    const connectionManager = extension_settings.connectionManager;
    if (connectionManager && Array.isArray(connectionManager.profiles)) {
        for (const profile of connectionManager.profiles) {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            selectElement.appendChild(option);
        }
    }
}

async function loadSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = { ...defaultSettings };
    }
    // Merge loaded settings with defaults to ensure all keys exist
    settings = { ...defaultSettings, ...extension_settings[EXTENSION_NAME] };
}

function saveSettings() {
    extension_settings[EXTENSION_NAME] = { ...settings };
    saveSettingsDebounced();
}

// --- Word History Functions ---

// Word history limits
const WORD_HISTORY_MAX_CONTEXTS = 10;       // 每个单词最多保存多少条上下文
const WORD_HISTORY_MAX_CONTEXT_LENGTH = 500; // 每条上下文最大字符数

// 艾宾浩斯复习间隔（天数）：1, 2, 4, 7, 15, 30
const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];
const MAX_DAILY_REVIEW_WORDS = 20; // 每次最多复习20个单词

// --- IndexedDB 数据库配置 ---
const DB_NAME = 'ai-dictionary-db';
const DB_VERSION = 1;
const STORE_WORD_HISTORY = 'wordHistory';
const STORE_REVIEW_PENDING = 'reviewPending';
const STORE_REVIEW_PROGRESS = 'reviewProgress';
const STORE_REVIEW_MASTERED = 'reviewMastered';
const STORE_SESSION = 'sessionData';

// --- JSON 备份文件名 ---
const BACKUP_WORD_HISTORY_FILE = 'ai-dictionary-word-history.json';
const BACKUP_REVIEW_DATA_FILE = 'ai-dictionary-review-data.json';

/** @type {IDBDatabase|null} */
let db = null;

/** @type {Object} */
let wordHistoryData = {}; // 内存中的查词记录缓存

/** @type {Object} */
let reviewData = {
    pendingWords: [],
    reviewingWords: {},
    masteredWords: [],
    currentSession: { words: [], lastUpdated: null }
};

/**
 * 初始化 IndexedDB 数据库
 */
function initDatabase() {
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

function dbGetAll(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not init')); return; }
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

function dbGet(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not init')); return; }
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function dbPut(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not init')); return; }
        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(data);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function dbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not init')); return; }
        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function dbClear(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not init')); return; }
        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// --- JSON 备份/恢复函数 ---

/**
 * 从 JSON 文件加载查词历史（用于恢复）
 */
async function loadWordHistoryFromJsonBackup() {
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
        console.warn(`[${EXTENSION_NAME}] No backup file found:`, e.message);
    }
    return null;
}

/**
 * 备份查词历史到 JSON 文件
 */
async function backupWordHistoryToJson() {
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
 * 从 JSON 备份恢复查词历史到 IndexedDB
 */
async function restoreWordHistoryFromBackup(backupData) {
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
 * 从 JSON 文件加载复习数据（用于恢复）
 */
async function loadReviewDataFromJsonBackup() {
    try {
        const response = await fetch(`/user/files/${BACKUP_REVIEW_DATA_FILE}`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] No review backup file found:`, e.message);
    }
    return null;
}

/**
 * 备份复习数据到 JSON 文件
 */
async function backupReviewDataToJson() {
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
 * 从 JSON 备份恢复复习数据到 IndexedDB
 */
async function restoreReviewDataFromBackup(backupData) {
    // 恢复 pending
    for (const item of (backupData.pendingWords || [])) {
        const word = cleanWord(item.word);
        if (word) await dbPut(STORE_REVIEW_PENDING, { word, addedDate: item.addedDate });
    }
    // 恢复 progress
    for (const [word, data] of Object.entries(backupData.reviewingWords || {})) {
        const w = cleanWord(word);
        if (w) await dbPut(STORE_REVIEW_PROGRESS, { word: w, stage: data.stage, nextReviewDate: data.nextReviewDate, lastUsedDate: data.lastUsedDate });
    }
    // 恢复 mastered
    for (const item of (backupData.masteredWords || [])) {
        const word = cleanWord(item.word);
        if (word) await dbPut(STORE_REVIEW_MASTERED, { word, masteredDate: item.masteredDate });
    }
    // 恢复 session
    if (backupData.currentSession) {
        await dbPut(STORE_SESSION, { id: 'current', words: backupData.currentSession.words || [], lastUpdated: backupData.currentSession.lastUpdated });
    }
    console.log(`[${EXTENSION_NAME}] Review data restored from backup`);
}

// --- 主加载函数（带备份/恢复逻辑）---

async function loadWordHistoryFromFile() {
    try {
        await initDatabase();
        const records = await dbGetAll(STORE_WORD_HISTORY);

        if (records.length === 0) {
            // IndexedDB 为空，尝试从 JSON 恢复
            console.log(`[${EXTENSION_NAME}] IndexedDB empty, trying to restore from backup...`);
            const backup = await loadWordHistoryFromJsonBackup();
            if (backup && Object.keys(backup).length > 0) {
                await restoreWordHistoryFromBackup(backup);
                // 重新加载
                const restored = await dbGetAll(STORE_WORD_HISTORY);
                for (const r of restored) {
                    wordHistoryData[r.word] = { count: r.count, lookups: r.lookups || [], contexts: r.contexts || [] };
                }
                console.log(`[${EXTENSION_NAME}] Restored ${Object.keys(wordHistoryData).length} words from backup`);
            }
        } else {
            // IndexedDB 有数据，加载并备份
            for (const r of records) {
                wordHistoryData[r.word] = { count: r.count, lookups: r.lookups || [], contexts: r.contexts || [] };
            }
            console.log(`[${EXTENSION_NAME}] Loaded ${Object.keys(wordHistoryData).length} words from IndexedDB`);
            // 启动时备份到 JSON
            backupWordHistoryToJson();
        }
        return wordHistoryData;
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] IndexedDB load error:`, e.message);
        wordHistoryData = {};
        return wordHistoryData;
    }
}

async function saveWordToDb(word) {
    try {
        const key = word.toLowerCase();
        const data = wordHistoryData[key];
        if (data) {
            await dbPut(STORE_WORD_HISTORY, {
                word: key, count: data.count,
                lookups: data.lookups || [], contexts: data.contexts || []
            });
        }
    } catch (e) { console.error(`[${EXTENSION_NAME}] Save word error:`, e.message); }
}

async function deleteWordFromDb(word) {
    try { await dbDelete(STORE_WORD_HISTORY, word.toLowerCase()); }
    catch (e) { console.error(`[${EXTENSION_NAME}] Delete word error:`, e.message); }
}

let pendingWordSaves = new Set();
const saveWordHistoryDebounced = debounce(async () => {
    const words = [...pendingWordSaves];
    pendingWordSaves.clear();
    for (const w of words) await saveWordToDb(w);
}, 1000);

function markWordForSave(word) {
    pendingWordSaves.add(word.toLowerCase());
    saveWordHistoryDebounced();
}

// --- Immersive Review Functions ---

function cleanWord(word) {
    if (typeof word !== 'string') return '';
    return word.trim().replace(/[\r\n]+/g, '');
}

function ensureWordsArray(words) {
    if (!words) return [];
    let result = [];
    if (typeof words === 'string') {
        result = words.split(/[\s,]+/).map(w => cleanWord(w)).filter(w => w.length > 0);
    } else if (Array.isArray(words)) {
        for (const item of words) {
            if (typeof item === 'string') {
                result.push(...item.split(/[\s,]+/).map(w => cleanWord(w)).filter(w => w.length > 0));
            }
        }
    }
    return result;
}

async function loadReviewDataFromFile() {
    try {
        await initDatabase();
        const pending = await dbGetAll(STORE_REVIEW_PENDING);
        const progress = await dbGetAll(STORE_REVIEW_PROGRESS);
        const mastered = await dbGetAll(STORE_REVIEW_MASTERED);

        const hasData = pending.length > 0 || progress.length > 0 || mastered.length > 0;

        if (!hasData) {
            // IndexedDB 为空，尝试从 JSON 恢复
            console.log(`[${EXTENSION_NAME}] Review IndexedDB empty, trying to restore from backup...`);
            const backup = await loadReviewDataFromJsonBackup();
            if (backup) {
                await restoreReviewDataFromBackup(backup);
                // 重新加载
                const restoredPending = await dbGetAll(STORE_REVIEW_PENDING);
                reviewData.pendingWords = restoredPending.map(r => ({ word: cleanWord(r.word), addedDate: r.addedDate })).filter(i => i.word);

                const restoredProgress = await dbGetAll(STORE_REVIEW_PROGRESS);
                reviewData.reviewingWords = {};
                for (const r of restoredProgress) {
                    const w = cleanWord(r.word);
                    if (w) reviewData.reviewingWords[w] = { stage: r.stage, nextReviewDate: r.nextReviewDate, lastUsedDate: r.lastUsedDate };
                }

                const restoredMastered = await dbGetAll(STORE_REVIEW_MASTERED);
                reviewData.masteredWords = restoredMastered.map(r => ({ word: cleanWord(r.word), masteredDate: r.masteredDate })).filter(i => i.word);

                const session = await dbGet(STORE_SESSION, 'current');
                if (session) reviewData.currentSession = { words: ensureWordsArray(session.words), lastUpdated: session.lastUpdated };

                console.log(`[${EXTENSION_NAME}] Restored review data from backup`);
            }
        } else {
            // IndexedDB 有数据，加载并备份
            reviewData.pendingWords = pending.map(r => ({ word: cleanWord(r.word), addedDate: r.addedDate })).filter(i => i.word);

            reviewData.reviewingWords = {};
            for (const r of progress) {
                const w = cleanWord(r.word);
                if (w) reviewData.reviewingWords[w] = { stage: r.stage, nextReviewDate: r.nextReviewDate, lastUsedDate: r.lastUsedDate };
            }

            reviewData.masteredWords = mastered.map(r => ({ word: cleanWord(r.word), masteredDate: r.masteredDate })).filter(i => i.word);

            const session = await dbGet(STORE_SESSION, 'current');
            if (session) reviewData.currentSession = { words: ensureWordsArray(session.words), lastUpdated: session.lastUpdated };

            console.log(`[${EXTENSION_NAME}] Loaded review: ${reviewData.pendingWords.length} pending, ${Object.keys(reviewData.reviewingWords).length} reviewing`);
            // 启动时备份到 JSON
            backupReviewDataToJson();
        }
        return reviewData;
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] Review load error:`, e.message);
        return reviewData;
    }
}

async function savePendingWordToDb(word, addedDate) {
    try { await dbPut(STORE_REVIEW_PENDING, { word: word.toLowerCase(), addedDate }); }
    catch (e) { console.error(`[${EXTENSION_NAME}] Save pending error:`, e.message); }
}

async function deletePendingWordFromDb(word) {
    try { await dbDelete(STORE_REVIEW_PENDING, word.toLowerCase()); }
    catch (e) { console.error(`[${EXTENSION_NAME}] Delete pending error:`, e.message); }
}

async function saveProgressWordToDb(word, data) {
    try { await dbPut(STORE_REVIEW_PROGRESS, { word: word.toLowerCase(), stage: data.stage, nextReviewDate: data.nextReviewDate, lastUsedDate: data.lastUsedDate }); }
    catch (e) { console.error(`[${EXTENSION_NAME}] Save progress error:`, e.message); }
}

async function deleteProgressWordFromDb(word) {
    try { await dbDelete(STORE_REVIEW_PROGRESS, word.toLowerCase()); }
    catch (e) { console.error(`[${EXTENSION_NAME}] Delete progress error:`, e.message); }
}

async function saveMasteredWordToDb(word, masteredDate) {
    try { await dbPut(STORE_REVIEW_MASTERED, { word: word.toLowerCase(), masteredDate }); }
    catch (e) { console.error(`[${EXTENSION_NAME}] Save mastered error:`, e.message); }
}

async function deleteMasteredWordFromDb(word) {
    try { await dbDelete(STORE_REVIEW_MASTERED, word.toLowerCase()); }
    catch (e) { console.error(`[${EXTENSION_NAME}] Delete mastered error:`, e.message); }
}

async function saveSessionToDb() {
    try { await dbPut(STORE_SESSION, { id: 'current', words: reviewData.currentSession.words, lastUpdated: reviewData.currentSession.lastUpdated }); }
    catch (e) { console.error(`[${EXTENSION_NAME}] Save session error:`, e.message); }
}

async function clearAllReviewDataFromDb() {
    try {
        await dbClear(STORE_REVIEW_PENDING);
        await dbClear(STORE_REVIEW_PROGRESS);
        await dbClear(STORE_REVIEW_MASTERED);
        await dbClear(STORE_SESSION);
    } catch (e) { console.error(`[${EXTENSION_NAME}] Clear review error:`, e.message); }
}

const saveSessionDebounced = debounce(saveSessionToDb, 1000);
const saveReviewDataDebounced = saveSessionDebounced;

/**
 * Add a word to the pending review list (triggered when lookup count reaches 2)
 * @param {string} word The word to add
 */
function addWordToPendingReview(word) {
    if (!settings.immersiveReview) return;

    // Clean the word: lowercase, trim, remove newlines
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
 * Get today's date at midnight (for day comparison)
 * @returns {number} Timestamp of today at 00:00:00
 */
function getTodayMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Get words that need to be reviewed today
 * Includes: pending words (added before today) + reviewing words (nextReviewDate <= today)
 * @returns {string[]} Array of words to review (max 20)
 */
function getWordsToReviewToday() {
    const todayMidnight = getTodayMidnight();
    const wordsToReview = [];

    // 1. Get pending words that were added before today (at least 1 day old)
    for (const item of reviewData.pendingWords) {
        if (item.addedDate < todayMidnight) {
            wordsToReview.push(item.word);
        }
    }

    // 2. Get reviewing words whose next review date is today or earlier
    for (const [word, data] of Object.entries(reviewData.reviewingWords)) {
        if (data.nextReviewDate <= todayMidnight + 24 * 60 * 60 * 1000) { // Include today
            wordsToReview.push(word);
        }
    }

    // Sort by oldest first (pending words by addedDate, reviewing words by nextReviewDate)
    // For simplicity, just return as-is (pending first, then reviewing)

    // Limit to max 20 words
    return wordsToReview.slice(0, MAX_DAILY_REVIEW_WORDS);
}

/**
 * Build the current session's word list for review
 * This should be called before each user message is sent
 * @returns {string[]} Words for this session
 */
function buildCurrentSessionWords() {
    // If there are remaining words from last session, continue with those
    if (reviewData.currentSession.words.length > 0) {
        // Clean the words in case they have newlines
        reviewData.currentSession.words = reviewData.currentSession.words
            .map(w => w.trim().replace(/[\r\n]+/g, ''))
            .filter(w => w.length > 0);
        return reviewData.currentSession.words;
    }

    // Otherwise, get fresh words for today
    const todayWords = getWordsToReviewToday();
    // Clean the words
    reviewData.currentSession.words = todayWords
        .map(w => w.trim().replace(/[\r\n]+/g, ''))
        .filter(w => w.length > 0);
    reviewData.currentSession.lastUpdated = Date.now();
    saveReviewDataDebounced();

    return reviewData.currentSession.words;
}

/**
 * Check AI response and mark words as used
 * @param {string} aiResponse The AI's response text
 */
function checkAIResponseForReviewWords(aiResponse) {
    if (!settings.immersiveReview) return;
    if (!aiResponse || reviewData.currentSession.words.length === 0) return;

    const responseLower = aiResponse.toLowerCase();
    const usedWords = [];
    const remainingWords = [];

    // Ensure words is a proper array of individual words
    const wordsArray = ensureWordsArray(reviewData.currentSession.words);

    console.log(`[${EXTENSION_NAME}] Words to check (${wordsArray.length}): ${wordsArray.join(', ')}`);

    for (const word of wordsArray) {
        if (!word) continue;

        // Check if the word appears in the response (as a whole word)
        const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
        const found = wordRegex.test(responseLower);
        console.log(`[${EXTENSION_NAME}] Checking word "${word}": ${found ? 'FOUND' : 'not found'}`);

        if (found) {
            usedWords.push(word);
        } else {
            remainingWords.push(word);
        }
    }

    // Process used words
    for (const word of usedWords) {
        processWordUsed(word);
    }

    // Update current session with remaining words (as proper array)
    reviewData.currentSession.words = remainingWords;
    reviewData.currentSession.lastUpdated = Date.now();

    console.log(`[${EXTENSION_NAME}] Used words: ${usedWords.length > 0 ? usedWords.join(', ') : 'none'}`);
    console.log(`[${EXTENSION_NAME}] Remaining words: ${remainingWords.length > 0 ? remainingWords.join(', ') : 'none'}`);

    if (usedWords.length > 0) {
        saveReviewDataDebounced();
    }
}

/**
 * Process a word that was successfully used by AI
 * Move from pending to reviewing, or advance stage in reviewing
 * @param {string} word The word that was used
 */
function processWordUsed(word) {
    const wordLower = word.toLowerCase();
    const now = Date.now();

    // Check if it's in pending
    const pendingIndex = reviewData.pendingWords.findIndex(w => w.word === wordLower);
    if (pendingIndex !== -1) {
        // Remove from pending
        reviewData.pendingWords.splice(pendingIndex, 1);
        deletePendingWordFromDb(wordLower);

        // Add to reviewing with stage 0
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

        // Check if mastered (completed all stages)
        if (wordData.stage >= EBBINGHAUS_INTERVALS.length) {
            // Move to mastered
            delete reviewData.reviewingWords[wordLower];
            deleteProgressWordFromDb(wordLower);
            reviewData.masteredWords.push({
                word: wordLower,
                masteredDate: now
            });
            saveMasteredWordToDb(wordLower, now);
            console.log(`[${EXTENSION_NAME}] Word mastered: ${wordLower}`);
        } else {
            // Schedule next review
            const nextInterval = EBBINGHAUS_INTERVALS[wordData.stage];
            wordData.nextReviewDate = now + nextInterval * 24 * 60 * 60 * 1000;
            saveProgressWordToDb(wordLower, wordData);
            console.log(`[${EXTENSION_NAME}] Word advanced to stage ${wordData.stage}: ${wordLower}, next review in ${nextInterval} day(s)`);
        }
    }
}

/**
 * Generate the review prompt to inject into user message
 * @returns {string} The prompt to append, or empty string if no words to review
 */
function generateReviewPrompt() {
    if (!settings.immersiveReview) return '';

    const sessionWords = buildCurrentSessionWords();
    if (sessionWords.length === 0) return '';

    // Clean words: trim whitespace and filter empty
    const cleanedWords = sessionWords
        .map(w => w.trim().replace(/[\r\n]+/g, ''))
        .filter(w => w.length > 0);

    if (cleanedWords.length === 0) return '';

    const wordsList = cleanedWords.join(', ');

    // Use custom prompt with %words% variable substitution
    const promptTemplate = settings.reviewPrompt || defaultSettings.reviewPrompt;
    return promptTemplate.replace(/%words%/g, wordsList);
}

/**
 * Save word lookup record
 * @param {string} word The word being looked up
 * @param {string} context The context paragraph containing the word
 */
function saveWordHistory(word, context) {
    if (!word || !word.trim()) return;

    // Only save single words or short phrases (no sentences)
    const trimmedWord = word.trim();
    // Skip if it looks like a sentence (contains punctuation marks typical of sentences)
    if (/[.!?。！？]/.test(trimmedWord) || trimmedWord.split(/\s+/).length > 5) {
        return;
    }

    const wordKey = trimmedWord.toLowerCase();
    const now = Date.now();

    if (!wordHistoryData[wordKey]) {
        wordHistoryData[wordKey] = {
            count: 0,
            contexts: [],
            lookups: [] // 记录每次查词的时间戳
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

    // Check if this is the second lookup - trigger immersive review
    if (wordHistoryData[wordKey].count === 2) {
        addWordToPendingReview(trimmedWord);
    }

    // Add context if provided and not already saved
    if (context && context.trim()) {
        // Truncate context if too long
        let trimmedContext = context.trim();
        if (trimmedContext.length > WORD_HISTORY_MAX_CONTEXT_LENGTH) {
            trimmedContext = trimmedContext.substring(0, WORD_HISTORY_MAX_CONTEXT_LENGTH) + '...';
        }

        // Only save if this exact context doesn't already exist
        if (!wordHistoryData[wordKey].contexts.includes(trimmedContext)) {
            // Keep max N contexts per word to avoid storage bloat
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
 * @param {string} word The word to look up
 * @returns {{count: number, contexts: string[]} | null} Word history or null
 */
function getWordHistory(word) {
    if (!word) return null;
    const wordKey = word.toLowerCase().trim();
    return wordHistoryData[wordKey] || null;
}

/**
 * Remove a specific context from word history
 * @param {string} word The word
 * @param {number} contextIndex The index of context to remove
 */
function removeWordHistoryContext(word, contextIndex) {
    if (!word) return;
    const wordKey = word.toLowerCase().trim();
    if (wordHistoryData[wordKey] && wordHistoryData[wordKey].contexts[contextIndex] !== undefined) {
        wordHistoryData[wordKey].contexts.splice(contextIndex, 1);
        markWordForSave(wordKey);
    }
}

/**
 * Clear all history for a specific word
 * @param {string} word The word to clear
 */
function clearWordHistory(word) {
    if (!word) return;
    const wordKey = word.toLowerCase().trim();
    if (wordHistoryData[wordKey]) {
        delete wordHistoryData[wordKey];
        deleteWordFromDb(wordKey);
    }
}

// --- Word Statistics Functions ---

/**
 * Get time range start timestamp
 * @param {'today' | 'week' | 'month' | 'all'} range
 * @returns {number} Start timestamp
 */
function getTimeRangeStart(range) {
    const now = new Date();
    switch (range) {
        case 'today':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        case 'week':
            const dayOfWeek = now.getDay();
            const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff).getTime();
        case 'month':
            return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        case 'all':
        default:
            return 0;
    }
}

/**
 * Get word statistics for a time range
 * @param {'today' | 'week' | 'month' | 'all'} range
 * @returns {Array<{word: string, count: number, totalCount: number}>}
 */
function getWordStatistics(range) {
    const startTime = getTimeRangeStart(range);
    const stats = [];

    for (const [word, data] of Object.entries(wordHistoryData)) {
        const lookups = data.lookups || [];
        // Count lookups within the time range
        const rangeCount = lookups.filter(ts => ts >= startTime).length;

        if (rangeCount > 0) {
            stats.push({
                word: word,
                count: rangeCount,
                totalCount: data.count || rangeCount
            });
        }
    }

    // Sort by count descending
    stats.sort((a, b) => b.count - a.count);
    return stats;
}

/**
 * Group words by lookup count
 * @param {Array<{word: string, count: number, totalCount: number}>} stats
 * @returns {Object} Grouped words { '5+': [...], '3-4': [...], '2': [...], '1': [...] }
 */
function groupWordsByCount(stats) {
    const groups = {
        'high': { label: '高频 (5次+)', words: [] },
        'medium': { label: '中频 (3-4次)', words: [] },
        'low': { label: '低频 (2次)', words: [] },
        'once': { label: '仅一次', words: [] }
    };

    for (const item of stats) {
        if (item.count >= 5) {
            groups.high.words.push(item);
        } else if (item.count >= 3) {
            groups.medium.words.push(item);
        } else if (item.count === 2) {
            groups.low.words.push(item);
        } else {
            groups.once.words.push(item);
        }
    }

    return groups;
}

/**
 * Get daily lookup counts for trend chart
 * @param {'week' | 'month' | 'all'} range
 * @returns {Array<{date: string, count: number}>}
 */
function getDailyLookupCounts(range) {
    const now = Date.now();
    let days;

    switch (range) {
        case 'week':
            days = 7;
            break;
        case 'month':
            days = 30;
            break;
        case 'all':
            days = 90; // Show last 90 days for 'all'
            break;
        default:
            days = 7;
    }

    // Create a map for each day
    const dailyCounts = {};
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        dailyCounts[dateStr] = 0;
    }

    // Count lookups per day
    for (const data of Object.values(wordHistoryData)) {
        const lookups = data.lookups || [];
        for (const ts of lookups) {
            const date = new Date(ts);
            const dateStr = date.toISOString().split('T')[0];
            if (dateStr in dailyCounts) {
                dailyCounts[dateStr]++;
            }
        }
    }

    // Convert to array
    return Object.entries(dailyCounts).map(([date, count]) => ({
        date,
        count,
        displayDate: formatDateForChart(date)
    }));
}

/**
 * Format date for chart display
 * @param {string} dateStr - YYYY-MM-DD format
 * @returns {string}
 */
function formatDateForChart(dateStr) {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

/**
 * Create SVG trend chart
 * @param {Array<{date: string, count: number, displayDate: string}>} data
 * @returns {string} SVG HTML
 */
function createTrendChart(data) {
    if (!data || data.length === 0) {
        return '<div class="ai-dict-chart-empty">暂无数据</div>';
    }

    const width = 520;
    const height = 150;
    const padding = { top: 20, right: 20, bottom: 35, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxCount = Math.max(...data.map(d => d.count), 1);
    const minCount = 0;

    // Calculate points
    const points = data.map((d, i) => ({
        x: padding.left + (i / (data.length - 1 || 1)) * chartWidth,
        y: padding.top + chartHeight - ((d.count - minCount) / (maxCount - minCount || 1)) * chartHeight,
        count: d.count,
        date: d.displayDate
    }));

    // Create path for the line
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Create path for the area fill
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

    // Generate Y-axis labels (5 levels)
    const yLabels = [];
    for (let i = 0; i <= 4; i++) {
        const value = Math.round(minCount + (maxCount - minCount) * (i / 4));
        const y = padding.top + chartHeight - (chartHeight * i / 4);
        yLabels.push({ value, y });
    }

    // Generate X-axis labels (show every few days depending on data length)
    const xLabelInterval = data.length <= 7 ? 1 : data.length <= 14 ? 2 : Math.ceil(data.length / 7);
    const xLabels = points.filter((_, i) => i % xLabelInterval === 0 || i === points.length - 1);

    return `
        <svg class="ai-dict-trend-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.3" />
                    <stop offset="100%" style="stop-color:#667eea;stop-opacity:0.05" />
                </linearGradient>
            </defs>

            <!-- Grid lines -->
            ${yLabels.map(l => `
                <line x1="${padding.left}" y1="${l.y}" x2="${width - padding.right}" y2="${l.y}"
                      stroke="var(--SmartThemeBorderColor, #444)" stroke-width="0.5" stroke-dasharray="3,3" opacity="0.5"/>
            `).join('')}

            <!-- Y-axis labels -->
            ${yLabels.map(l => `
                <text x="${padding.left - 8}" y="${l.y + 4}" text-anchor="end"
                      fill="var(--SmartThemeBodyColor, #999)" font-size="10">${l.value}</text>
            `).join('')}

            <!-- X-axis labels -->
            ${xLabels.map(p => `
                <text x="${p.x}" y="${height - 8}" text-anchor="middle"
                      fill="var(--SmartThemeBodyColor, #999)" font-size="10">${p.date}</text>
            `).join('')}

            <!-- Area fill -->
            <path d="${areaPath}" fill="url(#areaGradient)" />

            <!-- Line -->
            <path d="${linePath}" fill="none" stroke="#667eea" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

            <!-- Data points -->
            ${points.map(p => `
                <circle cx="${p.x}" cy="${p.y}" r="4" fill="#667eea" stroke="#fff" stroke-width="2">
                    <title>${p.date}: ${p.count}次</title>
                </circle>
            `).join('')}

            <!-- Hover areas for tooltips -->
            ${points.map(p => `
                <circle cx="${p.x}" cy="${p.y}" r="12" fill="transparent" class="ai-dict-chart-hover-area">
                    <title>${p.date}: ${p.count}次</title>
                </circle>
            `).join('')}
        </svg>
    `;
}

/**
 * Load farm game script dynamically
 */
async function loadFarmGameScript() {
    if (window.FarmGame) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${EXTENSION_URL}/farm-game.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load farm game'));
        document.head.appendChild(script);
    });
}

/**
 * Show farm game in a popup panel
 */
async function showFarmGamePanel() {
    // Remove existing panel if any
    const existingPanel = document.getElementById('ai-dict-farm-panel');
    if (existingPanel) {
        existingPanel.remove();
        return; // Toggle off
    }

    // Load game script if needed
    try {
        await loadFarmGameScript();
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Failed to load farm game:`, e);
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'ai-dict-farm-panel';
    panel.className = 'ai-dict-farm-panel';
    panel.innerHTML = `
        <div class="ai-dict-farm-panel-content">
            <div class="ai-dict-farm-panel-header">
                <span>🌾 开心农场</span>
                <div class="ai-dict-farm-panel-btns">
                    <button class="ai-dict-farm-reset-btn menu_button" title="重置游戏">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                    <button class="ai-dict-farm-close-btn menu_button" title="关闭">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="farm-game-container"></div>
        </div>
    `;

    document.body.appendChild(panel);

    // Initialize game
    if (window.FarmGame) {
        window.FarmGame.init();
    }

    // Bind events
    const closeBtn = panel.querySelector('.ai-dict-farm-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => panel.remove());
    }

    const resetBtn = panel.querySelector('.ai-dict-farm-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (window.FarmGame) {
                window.FarmGame.reset();
            }
        });
    }

    // Click outside to close
    panel.addEventListener('click', (e) => {
        if (e.target === panel) {
            panel.remove();
        }
    });
}

/**
 * Create and show the statistics panel
 */
function showStatisticsPanel() {
    // Remove existing panel if any
    const existingPanel = document.getElementById('ai-dict-stats-panel');
    if (existingPanel) {
        existingPanel.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'ai-dict-stats-panel';
    panel.className = 'ai-dict-stats-panel';
    panel.innerHTML = createStatisticsPanelContent('today');

    document.body.appendChild(panel);

    // Bind events
    bindStatisticsPanelEvents();
}

/**
 * Create statistics panel HTML content
 * @param {'today' | 'week' | 'month' | 'all' | 'review'} range
 * @returns {string}
 */
function createStatisticsPanelContent(range) {
    // If review tab, show review status instead
    if (range === 'review') {
        return createReviewStatusContent();
    }

    const stats = getWordStatistics(range);
    const groups = groupWordsByCount(stats);
    const totalWords = stats.length;
    const totalLookups = stats.reduce((sum, item) => sum + item.count, 0);

    // Get daily data for trend chart (not for 'today' since it's just one day)
    const chartRange = range === 'today' ? 'week' : range;
    const dailyData = getDailyLookupCounts(chartRange);
    const trendChartHtml = createTrendChart(dailyData);

    let groupsHtml = '';
    for (const [key, group] of Object.entries(groups)) {
        if (group.words.length > 0) {
            groupsHtml += `
                <div class="ai-dict-stats-group" data-group="${key}">
                    <div class="ai-dict-stats-group-header">
                        <span class="ai-dict-stats-group-label">${group.label}</span>
                        <span class="ai-dict-stats-group-count">${group.words.length} 词</span>
                    </div>
                    <div class="ai-dict-stats-group-words">
                        ${group.words.map(item => `
                            <div class="ai-dict-stats-word-item" data-word="${escapeHtml(item.word)}">
                                <span class="ai-dict-stats-word">${escapeHtml(item.word)}</span>
                                <span class="ai-dict-stats-word-count">${item.count}次</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }

    if (!groupsHtml) {
        groupsHtml = '<div class="ai-dict-stats-empty">该时间段内暂无查词记录</div>';
    }

    return `
        <div class="ai-dict-stats-inner">
            <div class="ai-dict-stats-header">
                <h3><i class="fa-solid fa-chart-bar"></i> 查词统计</h3>
                <button class="ai-dict-stats-close-btn" title="关闭">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            <div class="ai-dict-stats-tabs">
                <button class="ai-dict-stats-tab ${range === 'today' ? 'active' : ''}" data-range="today">今日</button>
                <button class="ai-dict-stats-tab ${range === 'week' ? 'active' : ''}" data-range="week">本周</button>
                <button class="ai-dict-stats-tab ${range === 'month' ? 'active' : ''}" data-range="month">本月</button>
                <button class="ai-dict-stats-tab ${range === 'all' ? 'active' : ''}" data-range="all">全部</button>
                <button class="ai-dict-stats-tab ${range === 'review' ? 'active' : ''}" data-range="review">复习</button>
            </div>
            <div class="ai-dict-stats-summary">
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${totalWords}</span>
                    <span class="ai-dict-stats-summary-label">单词数</span>
                </div>
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${totalLookups}</span>
                    <span class="ai-dict-stats-summary-label">查词次数</span>
                </div>
            </div>
            <div class="ai-dict-stats-chart-section">
                <div class="ai-dict-stats-chart-title">
                    <i class="fa-solid fa-chart-line"></i>
                    每日查词趋势 ${range === 'today' ? '(近7天)' : range === 'week' ? '(本周)' : range === 'month' ? '(近30天)' : '(近90天)'}
                </div>
                <div class="ai-dict-stats-chart-container">
                    ${trendChartHtml}
                </div>
            </div>
            <div class="ai-dict-stats-content">
                ${groupsHtml}
            </div>
        </div>
    `;
}

/**
 * Create review status content for statistics panel
 * @returns {string}
 */
function createReviewStatusContent() {
    const pendingCount = reviewData.pendingWords.length;
    const reviewingCount = Object.keys(reviewData.reviewingWords).length;
    const masteredCount = reviewData.masteredWords.length;
    const sessionCount = reviewData.currentSession.words.length;

    // Get today's words
    const todayWords = getWordsToReviewToday();

    // Format pending words
    let pendingHtml = '';
    if (pendingCount > 0) {
        pendingHtml = `
            <div class="ai-dict-stats-group">
                <div class="ai-dict-stats-group-header">
                    <span class="ai-dict-stats-group-label">待复习 (查2次待加入)</span>
                    <span class="ai-dict-stats-group-count">${pendingCount} 词</span>
                </div>
                <div class="ai-dict-stats-group-words">
                    ${reviewData.pendingWords.slice(0, 20).map(item => `
                        <div class="ai-dict-stats-word-item">
                            <span class="ai-dict-stats-word">${escapeHtml(item.word)}</span>
                            <span class="ai-dict-stats-word-count">${formatDate(item.addedDate)}</span>
                        </div>
                    `).join('')}
                    ${pendingCount > 20 ? `<div class="ai-dict-stats-more">... 还有 ${pendingCount - 20} 个</div>` : ''}
                </div>
            </div>
        `;
    }

    // Format reviewing words
    let reviewingHtml = '';
    if (reviewingCount > 0) {
        const reviewingEntries = Object.entries(reviewData.reviewingWords);
        reviewingHtml = `
            <div class="ai-dict-stats-group">
                <div class="ai-dict-stats-group-header">
                    <span class="ai-dict-stats-group-label">复习中 (艾宾浩斯周期)</span>
                    <span class="ai-dict-stats-group-count">${reviewingCount} 词</span>
                </div>
                <div class="ai-dict-stats-group-words">
                    ${reviewingEntries.slice(0, 20).map(([word, data]) => `
                        <div class="ai-dict-stats-word-item">
                            <span class="ai-dict-stats-word">${escapeHtml(word)}</span>
                            <span class="ai-dict-stats-word-count">阶段${data.stage + 1}/6 | ${formatDate(data.nextReviewDate)}</span>
                        </div>
                    `).join('')}
                    ${reviewingCount > 20 ? `<div class="ai-dict-stats-more">... 还有 ${reviewingCount - 20} 个</div>` : ''}
                </div>
            </div>
        `;
    }

    // Format mastered words
    let masteredHtml = '';
    if (masteredCount > 0) {
        masteredHtml = `
            <div class="ai-dict-stats-group">
                <div class="ai-dict-stats-group-header">
                    <span class="ai-dict-stats-group-label">已掌握</span>
                    <span class="ai-dict-stats-group-count">${masteredCount} 词</span>
                </div>
                <div class="ai-dict-stats-group-words">
                    ${reviewData.masteredWords.slice(0, 20).map(item => `
                        <div class="ai-dict-stats-word-item">
                            <span class="ai-dict-stats-word">${escapeHtml(item.word)}</span>
                            <span class="ai-dict-stats-word-count">${formatDate(item.masteredDate)}</span>
                        </div>
                    `).join('')}
                    ${masteredCount > 20 ? `<div class="ai-dict-stats-more">... 还有 ${masteredCount - 20} 个</div>` : ''}
                </div>
            </div>
        `;
    }

    // Current session
    let sessionHtml = '';
    if (sessionCount > 0) {
        sessionHtml = `
            <div class="ai-dict-stats-group" style="background: var(--SmartThemeBlurTintColor, rgba(100,100,255,0.1)); border-radius: 8px; padding: 10px;">
                <div class="ai-dict-stats-group-header">
                    <span class="ai-dict-stats-group-label">当前会话待用词</span>
                    <span class="ai-dict-stats-group-count">${sessionCount} 词</span>
                </div>
                <div class="ai-dict-stats-group-words">
                    ${reviewData.currentSession.words.map(word => `
                        <div class="ai-dict-stats-word-item">
                            <span class="ai-dict-stats-word">${escapeHtml(word)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const noDataHtml = (!pendingCount && !reviewingCount && !masteredCount)
        ? '<div class="ai-dict-stats-empty">暂无复习数据。查询单词2次后会自动加入复习。</div>'
        : '';

    return `
        <div class="ai-dict-stats-inner">
            <div class="ai-dict-stats-header">
                <h3><i class="fa-solid fa-brain"></i> 沉浸式复习</h3>
                <button class="ai-dict-stats-close-btn" title="关闭">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            <div class="ai-dict-stats-tabs">
                <button class="ai-dict-stats-tab" data-range="today">今日</button>
                <button class="ai-dict-stats-tab" data-range="week">本周</button>
                <button class="ai-dict-stats-tab" data-range="month">本月</button>
                <button class="ai-dict-stats-tab" data-range="all">全部</button>
                <button class="ai-dict-stats-tab active" data-range="review">复习</button>
            </div>
            <div class="ai-dict-stats-summary">
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${pendingCount}</span>
                    <span class="ai-dict-stats-summary-label">待复习</span>
                </div>
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${reviewingCount}</span>
                    <span class="ai-dict-stats-summary-label">复习中</span>
                </div>
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${masteredCount}</span>
                    <span class="ai-dict-stats-summary-label">已掌握</span>
                </div>
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${todayWords.length}</span>
                    <span class="ai-dict-stats-summary-label">今日待复习</span>
                </div>
            </div>
            <div class="ai-dict-review-actions" style="padding: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="menu_button" id="ai-dict-clear-session" title="清空当前会话，重新获取今日词汇">
                    <i class="fa-solid fa-rotate"></i> 刷新会话
                </button>
                <button class="menu_button" id="ai-dict-force-today" title="强制将所有待复习词设为今日可复习（测试用）">
                    <i class="fa-solid fa-forward"></i> 立即可复习
                </button>
                <button class="menu_button" id="ai-dict-clear-all-review" title="清空所有复习数据" style="color: #ff6b6b;">
                    <i class="fa-solid fa-trash"></i> 清空全部
                </button>
            </div>
            <div class="ai-dict-stats-content">
                ${sessionHtml}
                ${noDataHtml}
                ${pendingHtml}
                ${reviewingHtml}
                ${masteredHtml}
            </div>
        </div>
    `;
}

/**
 * Format timestamp to readable date (absolute date)
 * @param {number} timestamp
 * @returns {string}
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

/**
 * Check if a word is in the immersive review system
 * @param {string} word The word to check
 * @returns {boolean}
 */
function isWordInReview(word) {
    const wordLower = word.toLowerCase().trim();
    // Check pending, reviewing, or mastered
    if (reviewData.pendingWords.some(w => w.word === wordLower)) return true;
    if (reviewData.reviewingWords[wordLower]) return true;
    if (reviewData.masteredWords.some(w => w.word === wordLower)) return true;
    return false;
}

/**
 * Toggle a word in/out of the immersive review system
 * @param {string} word The word to toggle
 */
function toggleWordInReview(word) {
    const wordLower = word.toLowerCase().trim();

    // Check if already in any list
    const pendingIndex = reviewData.pendingWords.findIndex(w => w.word === wordLower);
    if (pendingIndex !== -1) {
        // Remove from pending
        reviewData.pendingWords.splice(pendingIndex, 1);
        deletePendingWordFromDb(wordLower);
        console.log(`[${EXTENSION_NAME}] Removed "${wordLower}" from pending review`);
        return;
    }

    if (reviewData.reviewingWords[wordLower]) {
        // Remove from reviewing
        delete reviewData.reviewingWords[wordLower];
        deleteProgressWordFromDb(wordLower);
        console.log(`[${EXTENSION_NAME}] Removed "${wordLower}" from reviewing`);
        return;
    }

    const masteredIndex = reviewData.masteredWords.findIndex(w => w.word === wordLower);
    if (masteredIndex !== -1) {
        // Remove from mastered
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
 * Bind statistics panel events
 */
function bindStatisticsPanelEvents() {
    const panel = document.getElementById('ai-dict-stats-panel');
    if (!panel) return;

    // Close button
    const closeBtn = panel.querySelector('.ai-dict-stats-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.remove();
        });
    }

    // Tab switching
    const tabs = panel.querySelectorAll('.ai-dict-stats-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const range = tab.getAttribute('data-range');
            panel.innerHTML = createStatisticsPanelContent(range);
            bindStatisticsPanelEvents();
        });
    });

    // Click outside to close
    panel.addEventListener('click', (e) => {
        if (e.target === panel) {
            panel.remove();
        }
    });

    // Review tab specific buttons
    const clearSessionBtn = panel.querySelector('#ai-dict-clear-session');
    if (clearSessionBtn) {
        clearSessionBtn.addEventListener('click', () => {
            reviewData.currentSession.words = [];
            reviewData.currentSession.lastUpdated = null;
            saveReviewDataDebounced();
            alert('已清空当前会话，下次发消息时会重新获取今日词汇');
            // Refresh panel
            panel.innerHTML = createStatisticsPanelContent('review');
            bindStatisticsPanelEvents();
        });
    }

    const forceTodayBtn = panel.querySelector('#ai-dict-force-today');
    if (forceTodayBtn) {
        forceTodayBtn.addEventListener('click', () => {
            // Collect all words that should be reviewed
            const allWords = [];

            // Add pending words
            for (const item of reviewData.pendingWords) {
                allWords.push(item.word);
            }

            // Add reviewing words
            for (const word of Object.keys(reviewData.reviewingWords)) {
                allWords.push(word);
            }

            // Set as current session words (without modifying original dates)
            reviewData.currentSession.words = allWords;
            reviewData.currentSession.lastUpdated = Date.now();

            saveReviewDataDebounced();
            alert(`已将 ${allWords.length} 个单词加入当前会话，下次发消息时生效`);
            // Refresh panel
            panel.innerHTML = createStatisticsPanelContent('review');
            bindStatisticsPanelEvents();
        });
    }

    const clearAllBtn = panel.querySelector('#ai-dict-clear-all-review');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async () => {
            if (!confirm('确定要清空所有复习数据吗？此操作不可恢复。')) {
                return;
            }

            // Clear all review data
            reviewData.pendingWords = [];
            reviewData.reviewingWords = {};
            reviewData.masteredWords = [];
            reviewData.currentSession.words = [];
            reviewData.currentSession.lastUpdated = null;

            await clearAllReviewDataFromDb();
            alert('已清空所有复习数据');
            // Refresh panel
            panel.innerHTML = createStatisticsPanelContent('review');
            bindStatisticsPanelEvents();
        });
    }
}

// --- Core Functionality ---

/**
 * Store the parent element of the selected text for context extraction
 * @type {HTMLElement}
 */
let selectedParentElement = null;

/**
 * Store the current prompt for display purposes
 * @type {string}
 */
let currentPrompt = '';

/**
 * Check if text is a single word (no spaces)
 * @param {string} text
 * @returns {boolean}
 */
function isSingleWord(text) {
    return text && !text.trim().includes(' ');
}

/**
 * Store the selection range info for marking position in context
 * @type {{startOffset: number, endOffset: number, startContainer: Node, endContainer: Node} | null}
 */
let selectionRangeInfo = null;

/**
 * Mark the selected text position in context with special markers
 * @param {string} context The context text
 * @param {string} selected The selected text
 * @returns {string} Context with marked selection
 */
function markSelectionInContext(context, selected) {
    if (!selected || !context) return context;

    // Use 【】 to mark the selected text position
    const marker = `【${selected}】`;

    // If we have range info, try to find the exact position
    if (selectionRangeInfo && selectedParentElement) {
        const parentText = selectedParentElement.textContent || '';

        // First, find where the parent element's text appears in the full context
        // The context may have multiple paragraphs joined by \n\n
        const parentTextTrimmed = parentText.trim();
        const parentIndexInContext = context.indexOf(parentTextTrimmed);

        if (parentIndexInContext !== -1) {
            // Calculate the absolute position of the selected word in the full context
            // selectionRangeInfo.startOffset is relative to parentText
            // But parentText might have leading whitespace that was trimmed

            // Find leading whitespace length difference
            const leadingWhitespace = parentText.length - parentText.trimStart().length;
            const adjustedOffset = selectionRangeInfo.startOffset - leadingWhitespace;

            if (adjustedOffset >= 0) {
                const absolutePosition = parentIndexInContext + adjustedOffset;

                // Verify the word at this position matches
                const wordAtPosition = context.substring(absolutePosition, absolutePosition + selected.length);

                if (wordAtPosition === selected) {
                    return context.substring(0, absolutePosition) + marker + context.substring(absolutePosition + selected.length);
                }
            }
        }

        // Fallback: Use surrounding text pattern matching
        const beforeTextInParagraph = parentText.substring(0, selectionRangeInfo.startOffset);
        const afterTextInParagraph = parentText.substring(selectionRangeInfo.endOffset);

        // Try different window sizes for pattern matching
        for (let windowSize = 30; windowSize >= 5; windowSize -= 5) {
            const beforePattern = beforeTextInParagraph.slice(-windowSize);
            const afterPattern = afterTextInParagraph.slice(0, windowSize);

            if (beforePattern.length === 0 && afterPattern.length === 0) continue;

            const uniquePattern = beforePattern + selected + afterPattern;
            const patternIndex = context.indexOf(uniquePattern);

            if (patternIndex !== -1) {
                const selectStart = patternIndex + beforePattern.length;
                return context.substring(0, selectStart) + marker + context.substring(selectStart + selected.length);
            }
        }
    }

    // Alternative approach: use selectedContext (single paragraph) to locate in full context
    if (selectedParentElement && selectedContext) {
        const parentText = selectedParentElement.textContent || '';
        const parentTextTrimmed = parentText.trim();

        // Find the paragraph in the full context
        const parentIndexInContext = context.indexOf(parentTextTrimmed);

        if (parentIndexInContext !== -1) {
            // Find all occurrences of the selected word within this paragraph's range in context
            const paragraphEndInContext = parentIndexInContext + parentTextTrimmed.length;

            // Search for the word only within this paragraph's bounds
            let searchStart = parentIndexInContext;
            let foundPositions = [];

            while (searchStart < paragraphEndInContext) {
                const pos = context.indexOf(selected, searchStart);
                if (pos === -1 || pos >= paragraphEndInContext) break;
                foundPositions.push(pos);
                searchStart = pos + 1;
            }

            if (foundPositions.length === 1) {
                // Only one occurrence in this paragraph - use it
                return context.substring(0, foundPositions[0]) + marker + context.substring(foundPositions[0] + selected.length);
            } else if (foundPositions.length > 1) {
                // Multiple occurrences - need to use selectedContext to narrow down
                // selectedContext should be the same as parentTextTrimmed
                // Just mark the first one in this paragraph (better than marking in wrong paragraph)
                return context.substring(0, foundPositions[0]) + marker + context.substring(foundPositions[0] + selected.length);
            }
        }
    }

    // Fallback: find first occurrence and mark it
    const index = context.indexOf(selected);
    if (index !== -1) {
        return context.substring(0, index) + marker + context.substring(index + selected.length);
    }

    // If not found, just append the marker info
    return context + `\n\n[用户选中的文本: ${marker}]`;
}

function extractContext(text) {
    const range = settings.contextRange;
    let context = '';

    if (range === 'sentence') {
        // 一句 - 段落中的一个句子
        const sentences = selectedContext.split(/[.!?。！？]+/);
        for (const sentence of sentences) {
            if (sentence.includes(selectedText)) {
                context = sentence.trim();
                break;
            }
        }
        if (!context) context = selectedContext;
    } else if (range === 'single') {
        // 单段 - 只有选中文本所在的一段
        context = selectedContext;
    } else if (range === 'all') {
        // 全段 - 所有同级标签的全部段落
        if (selectedParentElement && selectedParentElement.parentElement) {
            const parent = selectedParentElement.parentElement;
            const siblings = parent.querySelectorAll(':scope > p, :scope > div');
            if (siblings.length > 0) {
                context = Array.from(siblings).map(el => el.textContent.trim()).filter(t => t).join('\n\n');
            }
        }
        if (!context) context = selectedContext;
    } else {
        context = selectedContext;
    }

    // Mark the selected text position in context
    return markSelectionInContext(context, selectedText);
}

async function performDictionaryLookup(skipSaveHistory = false) {
    // Remove icon if present
    hideIcon();

    // Save selection range info before clearing selection
    // (clearing selection triggers selectionchange which would reset selectionRangeInfo)
    const savedSelectionRangeInfo = selectionRangeInfo;
    const savedSelectedParentElement = selectedParentElement;

    // Clear text selection
    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }

    // Restore the saved values after selection is cleared
    selectionRangeInfo = savedSelectionRangeInfo;
    selectedParentElement = savedSelectedParentElement;

    if (!selectedText.trim()) {
        showPanel('No word selected', 'Please select a word on the page first.', 'error');
        return;
    }

    // Check if the selected text is a phrase or sentence (not a single word)
    const isPhrase = !isSingleWord(selectedText);
    // Auto fetch AI if: setting is enabled OR it's a phrase/sentence
    const shouldAutoFetchAI = settings.autoFetchAI || isPhrase;

    try {
        // Show loading state and ensure panel is expanded
        showPanel('Looking up...', `Fetching definitions for: "${selectedText}"...`, 'loading');

        // Force expand if mobile (desktop popup is always 'expanded' effectively)
        if (isMobile()) {
            expandPanel();
        }

        // Save word history with the single paragraph context (selectedContext)
        // Note: selectedContext contains only the paragraph where the word was found
        // Skip saving history if called from flashcard (skipSaveHistory = true)
        if (!skipSaveHistory) {
            saveWordHistory(selectedText, selectedContext);
        }

        // Show panel immediately with loading states for both sections
        // Pass shouldAutoFetchAI to createMergedContent
        const initialHtmlContent = createMergedContent(selectedText, null, shouldAutoFetchAI);
        showPanelHtml(`${selectedText}`, initialHtmlContent, 'success');

        // Clear chat history for new word
        chatHistory = [];
        currentWord = selectedText;

        // Bind deep study button event if it exists
        bindDeepStudyButton(selectedText);

        // Bind confusable words button event if it exists
        bindConfusableButton(selectedText);

        // Highlight all confusable words in the page content
        highlightAllConfusableWords();

        // Bind chat input events
        bindChatInputEvents(selectedText);

        // Bind word history events
        bindWordHistoryEvents(selectedText);

        // Bind manual AI fetch button if auto fetch is disabled and it's a single word
        if (!shouldAutoFetchAI) {
            bindManualAIFetchButton(selectedText);
        }

        // Start Youdao lookup (only for single words)
        let youdaoPromise = Promise.resolve(null);
        if (!isPhrase) {
            youdaoPromise = fetchYoudaoDictionary(selectedText).catch(error => {
                console.warn('Youdao dictionary fetch failed:', error);
                return null;
            });
        }

        // Start AI lookup if should auto fetch
        let aiPromise = Promise.resolve();
        if (shouldAutoFetchAI) {
            aiPromise = fetchAIDefinition(selectedText).catch(error => {
                console.error('AI definition fetch error:', error);
                const aiContentElement = document.getElementById('ai-definition-content');
                if (aiContentElement) {
                    aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
                }
            });
        }

        // Wait for Youdao results and update the panel
        const youdaoResults = await youdaoPromise;
        if (youdaoResults) {
            updateYoudaoSection(selectedText, youdaoResults);
        }

        // Wait for AI to complete (it updates UI via streaming) if auto fetch is enabled
        if (shouldAutoFetchAI) {
            await aiPromise;
        }

    } catch (error) {
        console.error('AI Dictionary lookup error:', error);
        showPanel('Error', `Failed to lookup word: ${error.message}`, 'error');
    }
}

/**
 * Bind manual AI fetch button event
 * @param {string} word The word to lookup
 */
function bindManualAIFetchButton(word) {
    const aiContentElement = document.getElementById('ai-definition-content');
    if (!aiContentElement || !aiContentElement.classList.contains('ai-dict-clickable')) return;

    const handleClick = async () => {
        // Remove clickable class and event listener after first click
        aiContentElement.classList.remove('ai-dict-clickable');
        aiContentElement.removeEventListener('click', handleClick);

        // Show loading state
        aiContentElement.innerHTML = '<p class="ai-dict-loading-text">正在获取 AI 定义...</p>';

        try {
            await fetchAIDefinition(word);
        } catch (error) {
            console.error('AI definition fetch error:', error);
            aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
        }
    };

    aiContentElement.addEventListener('click', handleClick);
}

/**
 * Trigger AI fetch if the AI content area is still empty/clickable
 * Used when collapsing Youdao definitions with fetchAIOnYoudaoExpand enabled
 */
function triggerAIFetchIfEmpty() {
    const aiContentElement = document.getElementById('ai-definition-content');
    if (!aiContentElement) return;

    // Check if AI content is still in "click to fetch" state
    if (aiContentElement.classList.contains('ai-dict-clickable')) {
        // Remove clickable class
        aiContentElement.classList.remove('ai-dict-clickable');

        // Show loading state
        aiContentElement.innerHTML = '<p class="ai-dict-loading-text">正在获取 AI 定义...</p>';

        // Fetch AI definition
        fetchAIDefinition(currentWord).catch(error => {
            console.error('AI definition fetch error:', error);
            aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
        });
    }
}

// Cache for proxy availability check
let proxyAvailable = null;

/**
 * Create an AbortSignal with timeout (compatible with older browsers)
 * @param {number} ms Timeout in milliseconds
 * @returns {AbortSignal}
 */
function createTimeoutSignal(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
}

/**
 * Check if local SillyTavern proxy is available
 * @returns {Promise<boolean>}
 */
async function checkProxyAvailable() {
    if (proxyAvailable !== null) {
        return proxyAvailable;
    }

    let errorMsg = '';
    try {
        // Try a simple request to the proxy endpoint
        // Use Youdao itself to test - avoids issues with blocked sites like Google
        const response = await fetch('/proxy/https://dict.youdao.com/', {
            method: 'HEAD',
            signal: createTimeoutSignal(3000)
        });
        proxyAvailable = response.ok || response.status !== 404;
        errorMsg = `status: ${response.status}`;
    } catch (error) {
        proxyAvailable = false;
        errorMsg = error.message || String(error);
    }

    console.log(`[${EXTENSION_NAME}] Local proxy available:`, proxyAvailable, errorMsg);
    return proxyAvailable;
}

/**
 * Public CORS proxies as fallback
 */
const PUBLIC_CORS_PROXIES = [
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://test.cors.workers.dev/?${encodeURIComponent(url)}`,
];

async function fetchYoudaoDictionary(word) {
    try {
        console.log(`[${EXTENSION_NAME}] Fetching Youdao dictionary for: ${word}`);

        const youdaoUrl = `https://dict.youdao.com/w/${encodeURIComponent(word)}`;
        let response = null;
        let proxyUsed = '';

        // Check if local proxy is available
        const useLocalProxy = await checkProxyAvailable();

        if (useLocalProxy) {
            // Use SillyTavern's built-in CORS proxy
            const proxyUrl = `/proxy/${youdaoUrl}`;
            proxyUsed = 'local';
            console.log(`[${EXTENSION_NAME}] Using local proxy:`, proxyUrl);

            response = await fetch(proxyUrl, { method: 'GET' });
        } else {
            // Try public CORS proxies
            for (const getProxyUrl of PUBLIC_CORS_PROXIES) {
                try {
                    const proxyUrl = getProxyUrl(youdaoUrl);
                    proxyUsed = proxyUrl.split('?')[0];
                    console.log(`[${EXTENSION_NAME}] Trying public proxy:`, proxyUsed);

                    response = await fetch(proxyUrl, {
                        method: 'GET',
                        signal: createTimeoutSignal(10000)
                    });

                    if (response.ok) {
                        console.log(`[${EXTENSION_NAME}] Public proxy succeeded:`, proxyUsed);
                        break;
                    }
                } catch (proxyError) {
                    console.warn(`[${EXTENSION_NAME}] Public proxy failed:`, proxyUsed, proxyError.message);
                    response = null;
                }
            }
        }

        if (!response || !response.ok) {
            console.warn(`[${EXTENSION_NAME}] All proxies failed for Youdao`);
            // Return special error object to indicate proxy failure
            return { proxyError: true };
        }

        console.log(`[${EXTENSION_NAME}] Proxy response status:`, response.status);

        const html = await response.text();
        console.log(`[${EXTENSION_NAME}] Received HTML, length:`, html.length);

        // Parse the HTML content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const results = parseYoudaoHtml(doc, word);

        if (results && results.length > 0) {
            console.log(`[${EXTENSION_NAME}] Found ${results.length} Youdao result(s)`);
            return results;
        }

        console.log(`[${EXTENSION_NAME}] No Youdao results found`);
        return null;
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Youdao dictionary lookup error:`, error.message);
        console.log(`[${EXTENSION_NAME}] Will show AI definition instead`);
        return null;
    }
}

function parseYoudaoHtml(doc, word) {
    const results = [];

    // Try Collins dictionary first
    const collinsResult = parseCollinsHtml(doc);
    if (collinsResult) {
        results.push(collinsResult);
    }

    // If no Collins, try EC dictionary
    if (results.length === 0) {
        const ecResult = parseYoudaoEcHtml(doc);
        if (ecResult) {
            results.push(ecResult);
        }
    }

    // If still nothing, try web definitions
    if (results.length === 0) {
        const webResult = parseWebDefinitionsHtml(doc);
        if (webResult) {
            results.push(webResult);
        }
    }

    return results;
}

function parseCollinsHtml(doc) {
    try {
        const defNodes = doc.querySelectorAll('#collinsResult .ol li');
        if (!defNodes || !defNodes.length) return null;

        const expression = getText(doc.querySelector('#collinsResult h4 .title'));
        const reading = getText(doc.querySelector('#collinsResult h4 .phonetic'));

        if (!expression) return null;

        // Get extra info (star rating, exam cert)
        let extrainfo = '';
        const starNode = doc.querySelector('#collinsResult h4 .star');
        if (starNode) {
            const starClass = starNode.className.split(' ')[1];
            if (starClass) {
                const starCount = starClass.substring(4, 5);
                if (starCount) {
                    extrainfo += `<span class="star">${'★'.repeat(Number(starCount))}</span>`;
                }
            }
        }

        const cets = getText(doc.querySelector('#collinsResult h4 .rank'));
        if (cets) {
            const cetTags = cets.split(' ').map(c => `<span class="cet">${c}</span>`).join('');
            extrainfo += cetTags;
        }

        // Build definitions with proper example sentences
        const definitions = [];
        for (const defNode of defNodes) {
            let def = '<div class="odh-definition">';

            // Get POS (Part of Speech)
            const posNode = defNode.querySelector('.collinsMajorTrans p .additional');
            if (posNode) {
                const pos = getText(posNode);
                def += `<span class="pos">${escapeHtml(pos)}</span>`;
            }

            // Get English and Chinese translation
            const tranNode = defNode.querySelector('.collinsMajorTrans p');
            if (tranNode) {
                // Clone to avoid modifying original
                const clonedNode = tranNode.cloneNode(true);

                // Remove POS nodes
                clonedNode.querySelectorAll('.additional').forEach(n => n.remove());

                const fullText = clonedNode.innerText;

                // Try to extract Chinese translation
                const chnMatch = fullText.match(/[\u4e00-\u9fa5\uff0c\u3002]+/g);
                const chnTran = chnMatch ? chnMatch.join('').trim() : '';

                // Extract English translation (remove Chinese parts)
                const engTran = fullText.replace(/[\u4e00-\u9fa5\uff0c\u3002]+/g, '').trim();

                def += '<span class="tran">';
                if (engTran) {
                    def += `<span class="eng_tran">${escapeHtml(engTran)}</span>`;
                }
                if (chnTran) {
                    def += `<span class="chn_tran">${escapeHtml(chnTran)}</span>`;
                }
                def += '</span>';
            }

            // Get example sentences
            const exampleNodes = defNode.querySelectorAll('.exampleLists');
            if (exampleNodes && exampleNodes.length > 0) {
                def += '<ul class="sents">';
                for (let i = 0; i < Math.min(exampleNodes.length, 2); i++) {
                    const example = exampleNodes[i];
                    const engSent = getText(example.querySelector('p'));
                    const chnSent = getText(example.querySelector('p+p'));

                    def += '<li class="sent">';
                    if (engSent) {
                        def += `<span class="eng_sent">${escapeHtml(engSent)}</span>`;
                    }
                    def += ' - ';
                    if (chnSent) {
                        def += `<span class="chn_sent">${escapeHtml(chnSent)}</span>`;
                    }
                    def += '</li>';
                }
                def += '</ul>';
            }

            def += '</div>';
            definitions.push(def);
        }

        if (definitions.length === 0) return null;

        return {
            expression,
            reading: reading || '',
            extrainfo: extrainfo || '',
            definitions: definitions,
            audios: [
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=1`,
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=2`
            ]
        };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Error parsing Collins:`, error.message);
        return null;
    }
}

function parseYoudaoEcHtml(doc) {
    try {
        const defNodes = doc.querySelectorAll('#phrsListTab .trans-container ul li');
        if (!defNodes || !defNodes.length) return null;

        const expression = getText(doc.querySelector('#phrsListTab .wordbook-js .keyword'));
        if (!expression) return null;

        let definition = '<ul class="ec">';
        for (const defNode of defNodes) {
            const text = getText(defNode);
            if (text) {
                definition += `<li>${escapeHtml(text)}</li>`;
            }
        }
        definition += '</ul>';

        return {
            expression,
            reading: '',
            definitions: [definition],
            audios: [
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=1`,
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=2`
            ]
        };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Error parsing EC:`, error.message);
        return null;
    }
}

function parseWebDefinitionsHtml(doc) {
    try {
        const webNode = doc.querySelector('#webResult');
        if (!webNode) return null;

        const expression = getText(doc.querySelector('h1'));
        if (!expression) return null;

        let definition = '<div>';
        const items = doc.querySelectorAll('#webResult .web-item, #webResult .web-section');
        if (items && items.length > 0) {
            definition += '<ul class="web">';
            for (let i = 0; i < Math.min(items.length, 5); i++) {
                const text = getText(items[i]);
                if (text) {
                    definition += `<li>${escapeHtml(text)}</li>`;
                }
            }
            definition += '</ul>';
        }
        definition += '</div>';

        return {
            expression,
            reading: '',
            definitions: [definition]
        };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Error parsing web definitions:`, error.message);
        return null;
    }
}

function getText(node) {
    if (!node) return '';
    return node.innerText.trim();
}

/**
 * Bind deep study button click event
 * @param {string} word
 */
function bindDeepStudyButton(word) {
    const btn = document.getElementById('ai-dict-deep-study-btn');
    if (btn) {
        btn.addEventListener('click', () => performDeepStudy(word));
    }
}

/**
 * Bind chat input events
 * @param {string} word The word being looked up
 */
function bindChatInputEvents(word) {
    const chatTrigger = document.getElementById('ai-dict-chat-trigger');
    const chatBubble = document.getElementById('ai-dict-chat-bubble');
    const chatInput = document.getElementById('ai-dict-chat-input');
    const sendBtn = document.getElementById('ai-dict-chat-send-btn');

    if (!chatTrigger || !chatBubble) return;

    // Toggle bubble on trigger click
    chatTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = chatBubble.style.display !== 'none';
        chatBubble.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            chatInput?.focus();
        }
    });

    // Prevent bubble clicks from closing
    chatBubble.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    if (!chatInput || !sendBtn) return;

    // Send on button click
    sendBtn.addEventListener('click', () => sendChatMessage(word));

    // Send on Enter
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage(word);
        }
    });
}

/**
 * Send message to AI within the dictionary panel
 * @param {string} word The word being looked up
 */
async function sendChatMessage(word) {
    const chatInput = document.getElementById('ai-dict-chat-input');
    const sendBtn = document.getElementById('ai-dict-chat-send-btn');
    const chatBubble = document.getElementById('ai-dict-chat-bubble');
    const aiContentElement = document.getElementById('ai-definition-content');

    if (!chatInput || !aiContentElement) return;

    const userMessage = chatInput.value.trim();
    if (!userMessage) return;

    // Disable input while processing
    chatInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    // Clear input and hide bubble
    chatInput.value = '';
    if (chatBubble) {
        chatBubble.style.display = 'none';
    }

    // Add user question to AI content area
    const userQuestionEl = document.createElement('div');
    userQuestionEl.className = 'ai-dict-chat-question';
    userQuestionEl.innerHTML = `<i class="fa-solid fa-user"></i> ${escapeHtml(userMessage)}`;
    aiContentElement.appendChild(userQuestionEl);

    // Add AI response placeholder
    const aiResponseEl = document.createElement('div');
    aiResponseEl.className = 'ai-dict-chat-response';
    aiResponseEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    aiContentElement.appendChild(aiResponseEl);

    // Scroll AI content area
    aiContentElement.scrollTop = aiContentElement.scrollHeight;

    try {
        // Initialize chat history if this is first message
        if (chatHistory.length === 0 || currentWord !== word) {
            currentWord = word;

            // Get existing AI definition content as context (before we added the question)
            const existingContent = Array.from(aiContentElement.children)
                .filter(el => !el.classList.contains('ai-dict-chat-question') && !el.classList.contains('ai-dict-chat-response'))
                .map(el => el.innerText)
                .join('\n');

            // Get deep study content if available
            const deepStudyElement = document.getElementById('ai-dict-deep-study-content');
            const deepStudyContent = deepStudyElement && deepStudyElement.style.display !== 'none'
                ? deepStudyElement.innerText
                : '';

            // Build initial context
            let contextInfo = `关于单词 "${word}" 的查词结果：\n`;
            if (existingContent) {
                contextInfo += `\nAI释义:\n${existingContent}\n`;
            }
            if (deepStudyContent) {
                contextInfo += `\n深度学习内容:\n${deepStudyContent}\n`;
            }

            chatHistory = [
                { role: 'system', content: settings.systemPrompt + '\n\n以下是之前的查词结果，用户可能会基于这些内容继续提问：\n' + contextInfo },
            ];
        }

        // Add user message to history
        chatHistory.push({ role: 'user', content: userMessage });

        // Check if streaming is enabled
        const streamEnabled = oai_settings.stream_openai;

        if (streamEnabled) {
            // Use streaming
            await fetchChatWithStreaming(chatHistory, aiResponseEl);
        } else {
            // Use non-streaming (generateRaw)
            const response = await generateRaw({
                prompt: userMessage,
                systemPrompt: chatHistory[0].content,
            });

            if (response) {
                aiResponseEl.innerHTML = response.replace(/\n/g, '<br>');
                // Add AI response to history
                chatHistory.push({ role: 'assistant', content: response });
            } else {
                aiResponseEl.innerHTML = '<span class="ai-dict-error-text">无法获取回复，请重试。</span>';
            }
        }
    } catch (error) {
        console.error('Chat error:', error);
        aiResponseEl.innerHTML = '<span class="ai-dict-error-text">发生错误，请重试。</span>';
    } finally {
        // Re-enable input
        chatInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';

        // Scroll to bottom
        aiContentElement.scrollTop = aiContentElement.scrollHeight;
    }
}

/**
 * Fetch chat response with streaming
 * @param {Array} messages Messages array
 * @param {HTMLElement} bubbleElement Element to display content
 */
async function fetchChatWithStreaming(messages, bubbleElement) {
    const abortController = new AbortController();

    try {
        const generator = await sendOpenAIRequest('normal', messages, abortController.signal);

        if (typeof generator === 'function') {
            // Streaming mode
            bubbleElement.innerHTML = '';
            let fullText = '';

            for await (const data of generator()) {
                if (data.text) {
                    fullText = data.text;
                    bubbleElement.innerHTML = fullText.replace(/\n/g, '<br>');
                }
            }

            if (fullText) {
                // Add AI response to history
                chatHistory.push({ role: 'assistant', content: fullText });
            } else {
                bubbleElement.innerHTML = '<span class="ai-dict-error-text">无法获取回复，请重试。</span>';
            }
        } else if (typeof generator === 'string') {
            // Non-streaming response
            bubbleElement.innerHTML = generator.replace(/\n/g, '<br>');
            chatHistory.push({ role: 'assistant', content: generator });
        }
    } catch (error) {
        console.error('Streaming chat error:', error);
        throw error;
    }
}

/**
 * Perform deep study for a word
 * @param {string} word
 */
async function performDeepStudy(word) {
    const btn = document.getElementById('ai-dict-deep-study-btn');
    const contentElement = document.getElementById('ai-dict-deep-study-content');

    if (!contentElement) return;

    // Disable button and show loading
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>正在生成深度学习内容...</span>';
    }

    contentElement.style.display = 'block';
    contentElement.innerHTML = '<p class="ai-dict-loading-text">正在获取深度学习内容...</p>';

    try {
        // Build the deep study prompt
        const deepStudyPrompt = settings.deepStudyPrompt.replace(/%word%/g, word);

        // Build messages array
        const messages = [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: deepStudyPrompt }
        ];

        // Check if streaming is enabled
        const streamEnabled = oai_settings.stream_openai;

        if (streamEnabled) {
            // Use streaming
            await fetchWithStreaming(messages, contentElement);
        } else {
            // Use non-streaming
            const definition = await generateRaw({
                prompt: deepStudyPrompt,
                systemPrompt: settings.systemPrompt,
            });

            if (definition) {
                contentElement.innerHTML = `<p>${definition.replace(/\n/g, '<br>')}</p>`;
            } else {
                contentElement.innerHTML = '<p class="ai-dict-error-text">无法获取深度学习内容，请稍后重试。</p>';
            }
        }

        // Update button to show completion
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>深度学习完成</span>';
        }
    } catch (error) {
        console.error('Deep study error:', error);
        contentElement.innerHTML = '<p class="ai-dict-error-text">无法获取深度学习内容，请稍后重试。</p>';
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-graduation-cap"></i> <span>重试深度学习</span>';
        }
    }
}

/**
 * Perform confusable words lookup for a word
 * @param {string} word
 */
async function performConfusableLookup(word) {
    const btn = document.getElementById('ai-dict-confusable-btn');
    const contentElement = document.getElementById('ai-dict-confusable-content');

    if (!contentElement) return;

    // Disable button and show loading
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>正在查找形近词...</span>';
    }

    contentElement.style.display = 'block';
    contentElement.innerHTML = '<p class="ai-dict-loading-text">正在获取形近词...</p>';

    try {
        // Build the confusable words prompt
        const confusablePrompt = settings.confusableWordsPrompt.replace(/%word%/g, word);

        // Build messages array
        const messages = [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: confusablePrompt }
        ];

        // Check if streaming is enabled
        const streamEnabled = oai_settings.stream_openai;

        let fullResponse = '';

        if (streamEnabled) {
            // Use streaming but capture the full response
            fullResponse = await fetchConfusableWithStreaming(messages, contentElement);
        } else {
            // Use non-streaming
            fullResponse = await generateRaw({
                prompt: confusablePrompt,
                systemPrompt: settings.systemPrompt,
            });

            if (fullResponse) {
                contentElement.innerHTML = `<p>${fullResponse.replace(/\n/g, '<br>')}</p>`;
            } else {
                contentElement.innerHTML = '<p class="ai-dict-error-text">无法获取形近词，请稍后重试。</p>';
            }
        }

        // Parse the response and add save buttons
        if (fullResponse) {
            const parsed = parseConfusableResponse(fullResponse);
            if (parsed && parsed.length > 0) {
                displayParsedConfusables(parsed, word, contentElement, fullResponse);
            } else {
                // Parsing failed, show error with refresh button
                displayConfusableParseError(word, fullResponse, contentElement);
            }
        }

        // Update button to show completion
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>形近词查找完成</span>';
            // Keep button enabled for re-lookup
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Confusable lookup error:', error);
        contentElement.innerHTML = `
            <div class="ai-dict-confusable-error-container">
                <p class="ai-dict-error-text">无法获取形近词，请稍后重试。</p>
                <button class="ai-dict-confusable-refresh-btn" title="重新获取" data-word="${escapeHtml(word)}">
                    <i class="fa-solid fa-rotate"></i> 重试
                </button>
            </div>
        `;
        bindConfusableRefreshButton(contentElement, word);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-shuffle"></i> <span>重试形近词</span>';
        }
    }
}

/**
 * Display error when confusable parsing fails
 * @param {string} word The word being looked up
 * @param {string} response The original AI response
 * @param {HTMLElement} contentElement Element to display content
 */
function displayConfusableParseError(word, response, contentElement) {
    contentElement.innerHTML = `
        <div class="ai-dict-confusable-parse-error">
            <div class="ai-dict-confusable-ai-title-row">
                <span class="ai-dict-confusable-ai-title">
                    <i class="fa-solid fa-triangle-exclamation"></i> AI 返回格式有误
                </span>
                <button class="ai-dict-confusable-refresh-btn" title="重新获取" data-word="${escapeHtml(word)}">
                    <i class="fa-solid fa-rotate"></i>
                </button>
            </div>
            <div class="ai-dict-confusable-raw-response">
                ${escapeHtml(response).replace(/\n/g, '<br>')}
            </div>
        </div>
    `;
    bindConfusableRefreshButton(contentElement, word);
}

/**
 * Bind refresh button event in confusable content
 * @param {HTMLElement} contentElement The content element
 * @param {string} word The word to refresh
 */
function bindConfusableRefreshButton(contentElement, word) {
    const refreshBtn = contentElement.querySelector('.ai-dict-confusable-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            performConfusableLookup(word);
        });
    }
}

/**
 * Fetch confusable words with streaming and return full response
 * @param {Array} messages Messages array
 * @param {HTMLElement} contentElement Element to display content
 * @returns {Promise<string>} Full response text
 */
async function fetchConfusableWithStreaming(messages, contentElement) {
    const abortController = new AbortController();
    let fullText = '';

    try {
        const generator = await sendOpenAIRequest('normal', messages, abortController.signal);

        if (typeof generator === 'function') {
            contentElement.innerHTML = '';

            for await (const data of generator()) {
                if (data.text) {
                    fullText = data.text;
                    contentElement.innerHTML = fullText.replace(/\n/g, '<br>');
                }
            }
        } else if (typeof generator === 'string') {
            fullText = generator;
            contentElement.innerHTML = generator.replace(/\n/g, '<br>');
        }
    } catch (error) {
        console.error('Streaming confusable error:', error);
        throw error;
    }

    return fullText;
}

/**
 * Parse AI response to extract confusable words and their meanings
 * @param {string} response AI response text
 * @returns {Array<{word: string, meaning: string}>}
 */
function parseConfusableResponse(response) {
    const result = [];

    // Try to find the 【释义】 section
    const meaningSection = response.match(/【释义】([\s\S]*?)(?=【|$)/);
    if (!meaningSection) return result;

    const meaningText = meaningSection[1];

    // Parse each line that starts with "- word:" pattern
    const lines = meaningText.split('\n');
    for (const line of lines) {
        // Match patterns like "- word: meaning" or "- word：meaning"
        const match = line.match(/^[\s-]*([a-zA-Z]+)\s*[:：]\s*(.+)/);
        if (match) {
            const word = match[1].trim();
            const meaning = match[2].trim();
            if (word && meaning) {
                result.push({ word, meaning });
            }
        }
    }

    return result;
}

/**
 * Display parsed confusable words with save buttons
 * @param {Array<{word: string, meaning: string}>} confusables Parsed confusable words
 * @param {string} parentWord The parent word
 * @param {HTMLElement} contentElement Element to display content
 * @param {string} originalResponse Original AI response for display
 */
function displayParsedConfusables(confusables, parentWord, contentElement, originalResponse) {
    // Get already saved confusables for this word (bidirectional)
    const savedConfusables = getRelatedConfusables(parentWord);
    const savedWords = savedConfusables.map(c => c.word.toLowerCase());

    let html = `<div class="ai-dict-confusable-ai-result">`;
    html += `<div class="ai-dict-confusable-ai-title-row">
        <span class="ai-dict-confusable-ai-title">AI 生成的形近词：</span>
        <button class="ai-dict-confusable-refresh-btn" title="重新获取" data-word="${escapeHtml(parentWord)}">
            <i class="fa-solid fa-rotate"></i>
        </button>
    </div>`;
    html += `<div class="ai-dict-confusable-ai-list">`;

    for (const item of confusables) {
        const isSaved = savedWords.includes(item.word.toLowerCase());
        html += `
            <div class="ai-dict-confusable-ai-item" data-word="${escapeHtml(item.word)}" data-meaning="${escapeHtml(item.meaning)}">
                <span class="ai-dict-confusable-word">${escapeHtml(item.word)}</span>
                <span class="ai-dict-confusable-ai-meaning">- ${escapeHtml(item.meaning)}</span>
                <button class="ai-dict-confusable-save-btn ${isSaved ? 'saved' : ''}"
                        data-parent="${escapeHtml(parentWord)}"
                        data-word="${escapeHtml(item.word)}"
                        data-meaning="${escapeHtml(item.meaning)}"
                        ${isSaved ? 'disabled' : ''}>
                    <i class="fa-solid ${isSaved ? 'fa-check' : 'fa-bookmark'}"></i>
                    <span>${isSaved ? '已收藏' : '收藏'}</span>
                </button>
            </div>
        `;
    }

    html += `</div></div>`;

    contentElement.innerHTML = html;

    // Bind save button events
    bindConfusableSaveButtons(parentWord);

    // Bind refresh button event
    const refreshBtn = contentElement.querySelector('.ai-dict-confusable-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const word = refreshBtn.dataset.word;
            performConfusableLookup(word);
        });
    }
}

/**
 * Save a confusable word (bidirectional)
 * When saving "bow" -> "blow", also saves "blow" -> "bow"
 * @param {string} parentWord The parent word (the word being looked up)
 * @param {string} confusableWord The confusable word to save
 * @param {string} meaning The meaning of the confusable word
 * @param {string} parentMeaning The meaning of the parent word (optional)
 */
function saveConfusableWord(parentWord, confusableWord, meaning, parentMeaning = null) {
    const parentKey = parentWord.toLowerCase();
    const confusableKey = confusableWord.toLowerCase();

    // 1. Save confusableWord under parentWord
    if (!settings.confusableWords[parentKey]) {
        settings.confusableWords[parentKey] = [];
    }

    const existingInParent = settings.confusableWords[parentKey].find(c => c.word.toLowerCase() === confusableKey);
    if (!existingInParent) {
        settings.confusableWords[parentKey].push({ word: confusableWord, meaning });
    }

    // 2. Also save parentWord under confusableWord (bidirectional)
    if (!settings.confusableWords[confusableKey]) {
        settings.confusableWords[confusableKey] = [];
    }

    const existingInConfusable = settings.confusableWords[confusableKey].find(c => c.word.toLowerCase() === parentKey);
    if (!existingInConfusable) {
        // Try to find meaning for parentWord
        const foundParentMeaning = parentMeaning || findWordMeaning(parentWord);
        settings.confusableWords[confusableKey].push({ word: parentWord, meaning: foundParentMeaning });
    }

    saveSettings();

    // Update the saved confusables display
    updateSavedConfusablesDisplay(parentWord);

    // Re-highlight all confusable words
    highlightAllConfusableWords();

    return true;
}

/**
 * Remove a confusable word (bidirectional)
 * @param {string} parentWord The parent word
 * @param {string} confusableWord The confusable word to remove
 */
function removeConfusableWord(parentWord, confusableWord) {
    const parentKey = parentWord.toLowerCase();
    const confusableKey = confusableWord.toLowerCase();

    // 1. Remove confusableWord from parentWord's list
    if (settings.confusableWords[parentKey]) {
        const index = settings.confusableWords[parentKey].findIndex(c => c.word.toLowerCase() === confusableKey);
        if (index !== -1) {
            settings.confusableWords[parentKey].splice(index, 1);
        }
        // Clean up empty arrays
        if (settings.confusableWords[parentKey].length === 0) {
            delete settings.confusableWords[parentKey];
        }
    }

    // 2. Also remove parentWord from confusableWord's list (bidirectional)
    if (settings.confusableWords[confusableKey]) {
        const index = settings.confusableWords[confusableKey].findIndex(c => c.word.toLowerCase() === parentKey);
        if (index !== -1) {
            settings.confusableWords[confusableKey].splice(index, 1);
        }
        // Clean up empty arrays
        if (settings.confusableWords[confusableKey].length === 0) {
            delete settings.confusableWords[confusableKey];
        }
    }

    saveSettings();

    // Update the saved confusables display
    updateSavedConfusablesDisplay(parentWord);

    // Re-highlight all confusable words
    highlightAllConfusableWords();

    return true;
}

/**
 * Update the saved confusables display area
 * @param {string} parentWord The parent word
 */
function updateSavedConfusablesDisplay(parentWord) {
    const container = document.getElementById('ai-dict-saved-confusables');
    if (!container) return;

    // Use bidirectional confusables
    const savedConfusables = getRelatedConfusables(parentWord);

    if (savedConfusables.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const listElement = container.querySelector('.ai-dict-saved-confusables-list');
    if (listElement) {
        listElement.innerHTML = formatSavedConfusables(savedConfusables, parentWord);
        // Rebind events for the new elements
        bindSavedConfusableEvents(parentWord);
    }
}

/**
 * Bind events for saved confusable word items
 * @param {string} parentWord The parent word
 */
function bindSavedConfusableEvents(parentWord) {
    // Bind meaning toggle buttons
    const meaningBtns = document.querySelectorAll('.ai-dict-confusable-meaning-btn');
    meaningBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = btn.closest('.ai-dict-saved-confusable-item');
            const meaningDisplay = item?.querySelector('.ai-dict-confusable-meaning-display');
            if (meaningDisplay) {
                const isVisible = meaningDisplay.style.display !== 'none';
                meaningDisplay.style.display = isVisible ? 'none' : 'block';
                btn.innerHTML = isVisible
                    ? '<i class="fa-solid fa-circle-info"></i>'
                    : '<i class="fa-solid fa-circle-info active"></i>';
            }
        });
    });

    // Bind remove buttons
    const removeBtns = document.querySelectorAll('.ai-dict-confusable-remove-btn');
    removeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const word = btn.getAttribute('data-word');
            const parent = btn.getAttribute('data-parent');
            if (word && parent) {
                removeConfusableWord(parent, word);

                // Also update the AI generated list if visible (re-enable save button)
                const saveBtn = document.querySelector(`.ai-dict-confusable-save-btn[data-word="${word}"]`);
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.classList.remove('saved');
                    saveBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i><span>收藏</span>';
                }
            }
        });
    });
}

/**
 * Bind events for AI-generated confusable save buttons
 * @param {string} parentWord The parent word
 */
function bindConfusableSaveButtons(parentWord) {
    const saveBtns = document.querySelectorAll('.ai-dict-confusable-save-btn:not(.saved)');
    saveBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const word = btn.getAttribute('data-word');
            const meaning = btn.getAttribute('data-meaning');
            const parent = btn.getAttribute('data-parent');

            if (word && meaning && parent) {
                const saved = saveConfusableWord(parent, word, meaning);
                if (saved) {
                    btn.disabled = true;
                    btn.classList.add('saved');
                    btn.innerHTML = '<i class="fa-solid fa-check"></i><span>已收藏</span>';
                }
            }
        });
    });
}

/**
 * Bind confusable button click event
 * @param {string} word
 */
function bindConfusableButton(word) {
    const btn = document.getElementById('ai-dict-confusable-btn');
    if (btn) {
        btn.addEventListener('click', () => performConfusableLookup(word));
    }

    // Also bind saved confusable events if there are any
    bindSavedConfusableEvents(word);
}

/**
 * Get all related confusable words for a given word (bidirectional)
 * If bow has confusables [brow, bowl], then brow should show [bow, bowl] and bowl should show [bow, brow]
 * @param {string} word The word to get confusables for
 * @returns {Array<{word: string, meaning: string}>} Array of related confusable words
 */
function getRelatedConfusables(word) {
    const wordLower = word.toLowerCase();
    const result = [];
    const seenWords = new Set();

    // First, check if this word has direct confusables
    const directConfusables = settings.confusableWords[wordLower] || [];
    for (const item of directConfusables) {
        if (!seenWords.has(item.word.toLowerCase())) {
            result.push(item);
            seenWords.add(item.word.toLowerCase());
        }
    }

    // Then, check all other entries to see if this word is a confusable of another word
    for (const [parentWord, confusables] of Object.entries(settings.confusableWords)) {
        if (parentWord === wordLower) continue;

        // Check if our word is in this parent's confusable list
        const isRelated = confusables.some(c => c.word.toLowerCase() === wordLower);

        if (isRelated) {
            // Add the parent word itself (need to find its meaning from somewhere)
            // We'll look for its meaning in other entries or use a placeholder
            if (!seenWords.has(parentWord)) {
                const parentMeaning = findWordMeaning(parentWord);
                result.push({ word: parentWord, meaning: parentMeaning });
                seenWords.add(parentWord);
            }

            // Add all other confusables of this parent (siblings)
            for (const sibling of confusables) {
                const siblingLower = sibling.word.toLowerCase();
                if (siblingLower !== wordLower && !seenWords.has(siblingLower)) {
                    result.push(sibling);
                    seenWords.add(siblingLower);
                }
            }
        }
    }

    return result;
}

/**
 * Find the meaning of a word from confusableWords storage
 * @param {string} word The word to find meaning for
 * @returns {string} The meaning or a placeholder
 */
function findWordMeaning(word) {
    const wordLower = word.toLowerCase();

    // Search through all confusable lists to find this word's meaning
    for (const confusables of Object.values(settings.confusableWords)) {
        for (const item of confusables) {
            if (item.word.toLowerCase() === wordLower) {
                return item.meaning;
            }
        }
    }

    return '(点击形近词按钮获取释义)';
}

/**
 * Get all confusable words that should be highlighted for a given word
 * @param {string} word The current word being looked up
 * @returns {Set<string>} Set of words to highlight (lowercase)
 */
function getWordsToHighlight(word) {
    const wordsToHighlight = new Set();
    const relatedConfusables = getRelatedConfusables(word);

    for (const item of relatedConfusables) {
        wordsToHighlight.add(item.word.toLowerCase());
    }

    return wordsToHighlight;
}

/**
 * Get all confusable words from the entire collection for global highlighting
 * @returns {Set<string>} Set of all words to highlight (lowercase)
 */
function getAllConfusableWords() {
    const allWords = new Set();

    for (const [parentWord, confusables] of Object.entries(settings.confusableWords)) {
        // Add parent word
        allWords.add(parentWord.toLowerCase());
        // Add all confusables
        for (const item of confusables) {
            allWords.add(item.word.toLowerCase());
        }
    }

    return allWords;
}

/**
 * Highlight all confusable words in the page content (for page load)
 */
function highlightAllConfusableWords() {
    if (!settings.highlightConfusables) return;

    // Remove existing highlights first
    removeConfusableHighlights();

    const wordsToHighlight = getAllConfusableWords();
    if (wordsToHighlight.size === 0) return;

    // Find the chat container
    const chatContainer = document.getElementById('chat');
    if (!chatContainer) return;

    // Create a regex pattern for all words to highlight
    const wordsArray = Array.from(wordsToHighlight);
    const pattern = new RegExp(`\\b(${wordsArray.join('|')})\\b`, 'gi');

    // Walk through text nodes and wrap matches
    const walker = document.createTreeWalker(
        chatContainer,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Skip if inside our panel or certain elements
                if (node.parentElement.closest('#ai-dictionary-panel')) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (node.parentElement.closest('script, style, textarea, input')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes = [];
    while (walker.nextNode()) {
        if (pattern.test(walker.currentNode.textContent)) {
            textNodes.push(walker.currentNode);
        }
        pattern.lastIndex = 0; // Reset regex
    }

    // Process each text node
    for (const textNode of textNodes) {
        const text = textNode.textContent;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            // Add text before match
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            // Add highlighted match
            const span = document.createElement('span');
            span.className = 'ai-dict-confusable-highlight';
            span.textContent = match[0];
            span.title = `收藏的形近词`;
            fragment.appendChild(span);

            lastIndex = pattern.lastIndex;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        // Replace text node with fragment
        if (fragment.childNodes.length > 0) {
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    }
}

/**
 * Highlight confusable words in the page content
 * @param {string} currentWord The current word being looked up (optional, if not provided highlights all)
 */
function highlightConfusableWords(currentWord) {
    if (!settings.highlightConfusables) return;

    // Remove existing highlights first
    removeConfusableHighlights();

    // If no currentWord, highlight all confusable words
    const wordsToHighlight = currentWord ? getWordsToHighlight(currentWord) : getAllConfusableWords();
    if (wordsToHighlight.size === 0) return;

    // Also add the current word itself if it's in any confusable list
    if (currentWord) {
        const allWords = getAllConfusableWords();
        if (allWords.has(currentWord.toLowerCase())) {
            // Highlight all related words
            for (const word of allWords) {
                wordsToHighlight.add(word);
            }
        }
    }

    // Find the chat container
    const chatContainer = document.getElementById('chat');
    if (!chatContainer) return;

    // Create a regex pattern for all words to highlight
    const wordsArray = Array.from(wordsToHighlight);
    if (wordsArray.length === 0) return;

    const pattern = new RegExp(`\\b(${wordsArray.join('|')})\\b`, 'gi');

    // Walk through text nodes and wrap matches
    const walker = document.createTreeWalker(
        chatContainer,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Skip if inside our panel or certain elements
                if (node.parentElement.closest('#ai-dictionary-panel')) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (node.parentElement.closest('script, style, textarea, input')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes = [];
    while (walker.nextNode()) {
        if (pattern.test(walker.currentNode.textContent)) {
            textNodes.push(walker.currentNode);
        }
        pattern.lastIndex = 0; // Reset regex
    }

    // Process each text node
    for (const textNode of textNodes) {
        const text = textNode.textContent;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            // Add text before match
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            // Add highlighted match
            const span = document.createElement('span');
            span.className = 'ai-dict-confusable-highlight';
            span.textContent = match[0];
            span.title = `形近词: ${currentWord}`;
            fragment.appendChild(span);

            lastIndex = pattern.lastIndex;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        // Replace text node with fragment
        if (fragment.childNodes.length > 0) {
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    }
}

/**
 * Remove all confusable word highlights from the page
 */
function removeConfusableHighlights() {
    const highlights = document.querySelectorAll('.ai-dict-confusable-highlight');
    for (const highlight of highlights) {
        const textNode = document.createTextNode(highlight.textContent);
        highlight.parentNode.replaceChild(textNode, highlight);
    }

    // Normalize the DOM to merge adjacent text nodes
    const chatContainer = document.getElementById('chat');
    if (chatContainer) {
        chatContainer.normalize();
    }
}

/**
 * Update the highlight color CSS variable
 */
function updateHighlightColor() {
    document.documentElement.style.setProperty('--ai-dict-highlight-color', settings.highlightColor);
}

async function fetchAIDefinition(word) {
    const extractedContext = extractContext(document.body.innerText);

    // Use userPrompt with variable substitution
    const lookupPrompt = settings.userPrompt
        .replace(/%word%/g, word)
        .replace(/%context%/g, extractedContext);

    // Store current prompt for display
    currentPrompt = `System Prompt:\n${settings.systemPrompt}\n\nUser Prompt:\n${lookupPrompt}`;

    // Update the prompt display if it exists
    const promptElement = document.getElementById('ai-dict-current-prompt');
    if (promptElement) {
        promptElement.textContent = currentPrompt;
    }

    const aiContentElement = document.getElementById('ai-definition-content');
    if (!aiContentElement) return null;

    // Store original profile to restore later
    const originalProfile = extension_settings.connectionManager?.selectedProfile;
    let profileApplied = false;

    try {
        // Apply connection profile if specified
        if (settings.connectionProfile) {
            const connectionManager = extension_settings.connectionManager;
            if (connectionManager && Array.isArray(connectionManager.profiles)) {
                const profile = connectionManager.profiles.find(p => p.id === settings.connectionProfile);
                if (profile) {
                    // Apply the profile using slash command
                    const profileSelect = document.getElementById('connection_profiles');
                    if (profileSelect) {
                        profileSelect.value = profile.id;
                        profileSelect.dispatchEvent(new Event('change'));
                        profileApplied = true;
                        // Wait for profile to be applied
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        }

        // Build messages array
        const messages = [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: lookupPrompt }
        ];

        // Check if streaming is enabled
        const streamEnabled = oai_settings.stream_openai;

        if (streamEnabled) {
            // Use streaming
            await fetchWithStreaming(messages, aiContentElement);
        } else {
            // Use non-streaming (generateRaw)
            const definition = await generateRaw({
                prompt: lookupPrompt,
                systemPrompt: settings.systemPrompt,
            });

            if (definition) {
                aiContentElement.innerHTML = `<p>${definition.replace(/\n/g, '<br>')}</p>`;
            } else {
                aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
            }
        }
        return null;
    } catch (error) {
        console.error('AI definition lookup error:', error);
        aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
        return null;
    } finally {
        // Restore original profile if we changed it
        if (profileApplied && originalProfile !== settings.connectionProfile) {
            const profileSelect = document.getElementById('connection_profiles');
            if (profileSelect) {
                profileSelect.value = originalProfile || '';
                profileSelect.dispatchEvent(new Event('change'));
            }
        }
    }
}

/**
 * Fetch AI definition with streaming
 * @param {Array} messages Messages array
 * @param {HTMLElement} aiContentElement Element to display content
 */
async function fetchWithStreaming(messages, aiContentElement) {
    // Create an AbortController for this request
    const abortController = new AbortController();

    try {
        // Use sendOpenAIRequest with 'normal' type to enable streaming
        const generator = await sendOpenAIRequest('normal', messages, abortController.signal);

        if (typeof generator === 'function') {
            // It's an async generator (streaming mode)
            // Create container for both reasoning and text
            aiContentElement.innerHTML = `
                <div class="ai-dict-reasoning-container" style="display: none;">
                    <details class="ai-dict-reasoning-details" open>
                        <summary class="ai-dict-reasoning-summary">
                            <i class="fa-solid fa-brain"></i>
                            <span class="ai-dict-reasoning-title">思考中...</span>
                        </summary>
                        <div class="ai-dict-reasoning-content"></div>
                    </details>
                </div>
                <div class="ai-dict-text-content"></div>
            `;
            const reasoningContainer = aiContentElement.querySelector('.ai-dict-reasoning-container');
            const reasoningDetails = aiContentElement.querySelector('.ai-dict-reasoning-details');
            const reasoningContent = aiContentElement.querySelector('.ai-dict-reasoning-content');
            const reasoningTitle = aiContentElement.querySelector('.ai-dict-reasoning-title');
            const textContent = aiContentElement.querySelector('.ai-dict-text-content');

            let fullText = '';
            let fullReasoning = '';
            let reasoningStartTime = null;
            let reasoningCollapsed = false;

            for await (const data of generator()) {
                // Handle reasoning/thinking content from state object
                // DeepSeek, Claude, etc. accumulate reasoning in data.state.reasoning
                const currentReasoning = data?.state?.reasoning || '';
                if (currentReasoning && currentReasoning !== fullReasoning) {
                    if (!reasoningStartTime) {
                        reasoningStartTime = Date.now();
                        reasoningContainer.style.display = 'block';
                    }
                    fullReasoning = currentReasoning;
                    reasoningContent.innerHTML = fullReasoning.replace(/\n/g, '<br>');
                }

                // Handle regular text content
                if (data.text) {
                    fullText = data.text;
                    textContent.innerHTML = fullText.replace(/\n/g, '<br>');

                    // When text starts coming, reasoning is done - collapse and update title
                    if (reasoningStartTime && fullReasoning && !reasoningCollapsed) {
                        const duration = ((Date.now() - reasoningStartTime) / 1000).toFixed(1);
                        reasoningTitle.textContent = `思考了 ${duration} 秒`;
                        // Auto collapse reasoning when done
                        reasoningDetails.removeAttribute('open');
                        reasoningCollapsed = true;
                    }
                }
            }

            // Final update for reasoning title
            if (reasoningStartTime && fullReasoning) {
                const duration = ((Date.now() - reasoningStartTime) / 1000).toFixed(1);
                reasoningTitle.textContent = `思考了 ${duration} 秒`;
                // Ensure collapsed
                if (!reasoningCollapsed) {
                    reasoningDetails.removeAttribute('open');
                }
            }

            if (!fullText && !fullReasoning) {
                aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
            }
        } else {
            // Non-streaming response - check for reasoning in response
            const content = generator?.choices?.[0]?.message?.content || '';
            const reasoning = generator?.choices?.[0]?.message?.reasoning_content
                || generator?.choices?.[0]?.message?.reasoning
                || generator?.content?.find(part => part.type === 'thinking')?.thinking
                || '';

            let html = '';

            if (reasoning) {
                // Non-streaming: show collapsed by default
                html += `
                    <div class="ai-dict-reasoning-container">
                        <details class="ai-dict-reasoning-details">
                            <summary class="ai-dict-reasoning-summary">
                                <i class="fa-solid fa-brain"></i>
                                <span class="ai-dict-reasoning-title">思考过程</span>
                            </summary>
                            <div class="ai-dict-reasoning-content">${reasoning.replace(/\n/g, '<br>')}</div>
                        </details>
                    </div>
                `;
            }

            if (content) {
                html += `<div class="ai-dict-text-content">${content.replace(/\n/g, '<br>')}</div>`;
            }

            if (html) {
                aiContentElement.innerHTML = html;
            } else {
                aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
            }
        }
    } catch (error) {
        console.error('Streaming error:', error);
        throw error;
    }
}

function createMergedContent(word, youdaoResults, autoFetchAI = settings.autoFetchAI) {
    const collapsibleId = `youdao-definitions-${Date.now()}`;
    const promptCollapsibleId = `prompt-view-${Date.now()}`;
    const historyCollapsibleId = `word-history-${Date.now()}`;

    // Check if we have Youdao results
    const hasYoudaoResults = youdaoResults && Array.isArray(youdaoResults) && youdaoResults.length > 0;

    // Check if proxy error occurred
    const hasProxyError = youdaoResults && youdaoResults.proxyError === true;

    // Show deep study button for single words
    const showDeepStudy = isSingleWord(word);

    // Get saved confusable words for this word (bidirectional)
    const savedConfusables = getRelatedConfusables(word);

    // Get word history
    const wordHistory = getWordHistory(word);

    let youdaoSection = '';

    if (hasProxyError) {
        // Show proxy error message
        youdaoSection = `
            <div class="ai-dict-proxy-error">
                <p class="ai-dict-error-text">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                    无法获取有道词典数据：CORS 代理不可用
                </p>
                <p class="ai-dict-hint-text">
                    请在 SillyTavern 配置文件 <code>config.yaml</code> 中设置：<br>
                    <code>enableCorsProxy: true</code>
                </p>
            </div>
        `;
    } else if (hasYoudaoResults) {
        // Determine if youdao definitions should be expanded by default
        const youdaoExpanded = !settings.autoCollapseYoudao;
        youdaoSection = `
            <!-- Youdao header section (always visible) -->
            ${formatYoudaoHeadSection(youdaoResults)}

            <!-- Collapsible definitions section -->
            <div class="ai-dict-collapsible-section">
                <div class="ai-dict-collapsible-header${youdaoExpanded ? ' expanded' : ''}" data-target="${collapsibleId}">
                    <i class="fa-solid fa-chevron-right${youdaoExpanded ? ' expanded' : ''}"></i>
                    <span>释义</span>
                </div>
                <div id="${collapsibleId}" class="ai-dict-collapsible-content${youdaoExpanded ? ' expanded' : ''}">
                    ${formatYoudaoDefinitions(youdaoResults)}
                </div>
            </div>
        `;
    } else if (youdaoResults === null) {
        // Loading state - youdaoResults is null means still loading
        youdaoSection = `
            <div class="ai-dict-youdao-loading">
                <p class="ai-dict-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> 正在获取有道词典...</p>
            </div>
        `;
    }

    const deepStudySection = showDeepStudy ? `
            <!-- Deep Study section -->
            <div class="ai-dict-deep-study-section">
                <button id="ai-dict-deep-study-btn" class="menu_button ai-dict-deep-study-btn">
                    <i class="fa-solid fa-graduation-cap"></i>
                    <span>深度学习此单词</span>
                </button>
                <div id="ai-dict-deep-study-content" class="ai-dict-deep-study-content" style="display: none;"></div>
            </div>
    ` : '';

    // Confusable words section (only for single words)
    const confusableSection = showDeepStudy ? `
            <!-- Confusable Words section -->
            <div class="ai-dict-confusable-section">
                <button id="ai-dict-confusable-btn" class="menu_button ai-dict-confusable-btn">
                    <i class="fa-solid fa-shuffle"></i>
                    <span>形近词</span>
                </button>
                <!-- Saved confusable words -->
                <div id="ai-dict-saved-confusables" class="ai-dict-saved-confusables" ${savedConfusables.length === 0 ? 'style="display: none;"' : ''}>
                    <div class="ai-dict-saved-confusables-title">已收藏的形近词：</div>
                    <div class="ai-dict-saved-confusables-list">
                        ${formatSavedConfusables(savedConfusables, word)}
                    </div>
                </div>
                <!-- AI generated confusable words -->
                <div id="ai-dict-confusable-content" class="ai-dict-confusable-content" style="display: none;"></div>
            </div>
    ` : '';

    // Word history section (only for single words)
    const wordHistorySection = showDeepStudy ? `
            <!-- Word History section -->
            <div class="ai-dict-collapsible-section ai-dict-history-section">
                <div class="ai-dict-collapsible-header" data-target="${historyCollapsibleId}">
                    <i class="fa-solid fa-chevron-right"></i>
                    <span>查词记录</span>
                    ${wordHistory ? `<span class="ai-dict-history-count">(${wordHistory.count}次)</span>` : ''}
                </div>
                <div id="${historyCollapsibleId}" class="ai-dict-collapsible-content">
                    <div id="ai-dict-word-history-content" class="ai-dict-word-history-content">
                        ${formatWordHistory(word, wordHistory)}
                    </div>
                </div>
            </div>
    ` : '';

    const html = `
        <div class="ai-dict-merged-container">
            <!-- Youdao section container -->
            <div id="ai-dict-youdao-section">
                ${youdaoSection}
            </div>

            <!-- AI Definition section -->
            <div class="ai-dict-ai-section">
                <div id="ai-definition-content" class="ai-dict-ai-content${!autoFetchAI ? ' ai-dict-clickable' : ''}">
                    ${autoFetchAI
                        ? '<p class="ai-dict-loading-text">正在获取 AI 定义...</p>'
                        : '<p class="ai-dict-no-ai-text"><i class="fa-solid fa-hand-pointer"></i> 点击获取 AI 释义</p>'
                    }
                </div>
                <!-- Chat trigger button -->
                <button id="ai-dict-chat-trigger" class="ai-dict-chat-trigger" title="继续提问">
                    <i class="fa-solid fa-comments"></i>
                </button>
                <!-- Chat bubble popup (input only) -->
                <div id="ai-dict-chat-bubble" class="ai-dict-chat-bubble-popup" style="display: none;">
                    <div class="ai-dict-chat-input-container">
                        <input type="text" id="ai-dict-chat-input" class="ai-dict-chat-input" placeholder="继续提问...">
                        <button id="ai-dict-chat-send-btn" class="ai-dict-chat-send-btn" title="发送">
                            <i class="fa-solid fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>

            ${deepStudySection}

            ${confusableSection}

            ${wordHistorySection}

            <!-- Prompt view section -->
            <div class="ai-dict-collapsible-section ai-dict-prompt-section">
                <div class="ai-dict-collapsible-header" data-target="${promptCollapsibleId}">
                    <i class="fa-solid fa-chevron-right"></i>
                    <span>查看提示词</span>
                </div>
                <div id="${promptCollapsibleId}" class="ai-dict-collapsible-content ai-dict-prompt-content">
                    <pre id="ai-dict-current-prompt"></pre>
                </div>
            </div>
        </div>
    `;
    return html;
}

/**
 * Format saved confusable words for display
 * @param {Array} confusables Array of {word, meaning} objects
 * @param {string} parentWord The parent word these confusables belong to
 * @returns {string} HTML string
 */
function formatSavedConfusables(confusables, parentWord) {
    if (!confusables || confusables.length === 0) return '';

    return confusables.map((item, index) => `
        <div class="ai-dict-saved-confusable-item" data-word="${escapeHtml(item.word)}" data-index="${index}">
            <span class="ai-dict-confusable-word">${escapeHtml(item.word)}</span>
            <div class="ai-dict-confusable-actions">
                <button class="ai-dict-confusable-meaning-btn" title="显示释义" data-word="${escapeHtml(item.word)}" data-meaning="${escapeHtml(item.meaning)}">
                    <i class="fa-solid fa-circle-info"></i>
                </button>
                <button class="ai-dict-confusable-remove-btn" title="取消收藏" data-parent="${escapeHtml(parentWord)}" data-word="${escapeHtml(item.word)}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="ai-dict-confusable-meaning-display" style="display: none;">${escapeHtml(item.meaning)}</div>
        </div>
    `).join('');
}

/**
 * Format word history for display
 * @param {string} word The word
 * @param {{count: number, contexts: string[]} | null} history Word history object
 * @returns {string} HTML string
 */
function formatWordHistory(word, history) {
    if (!history) {
        return '<p class="ai-dict-history-empty">暂无查词记录</p>';
    }

    let html = `
        <div class="ai-dict-history-info">
            <span class="ai-dict-history-label">查词次数：</span>
            <span class="ai-dict-history-value">${history.count} 次</span>
        </div>
    `;

    if (history.contexts && history.contexts.length > 0) {
        html += `
            <div class="ai-dict-history-contexts">
                <div class="ai-dict-history-contexts-title">保存的上下文：</div>
                <div class="ai-dict-history-contexts-list">
        `;

        history.contexts.forEach((context, index) => {
            // Highlight the word in context
            const highlightedContext = highlightWordInContext(context, word);
            html += `
                <div class="ai-dict-history-context-item" data-index="${index}">
                    <div class="ai-dict-history-context-text">${highlightedContext}</div>
                    <button class="ai-dict-history-context-remove" title="删除此上下文" data-word="${escapeHtml(word)}" data-index="${index}">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    } else {
        html += '<p class="ai-dict-history-no-context">暂无保存的上下文</p>';
    }

    // Add clear all button
    html += `
        <div class="ai-dict-history-actions">
            <button class="ai-dict-history-clear-btn" title="清除此单词的所有记录" data-word="${escapeHtml(word)}">
                <i class="fa-solid fa-trash"></i>
                <span>清除全部记录</span>
            </button>
        </div>
    `;

    return html;
}

/**
 * Highlight the word in context text
 * @param {string} context The context text
 * @param {string} word The word to highlight
 * @returns {string} HTML string with highlighted word
 */
function highlightWordInContext(context, word) {
    if (!context || !word) return escapeHtml(context);

    const escapedContext = escapeHtml(context);
    const escapedWord = escapeHtml(word);

    // Create a case-insensitive regex to find the word
    const regex = new RegExp(`(${escapedWord})`, 'gi');
    return escapedContext.replace(regex, '<mark class="ai-dict-history-highlight">$1</mark>');
}

/**
 * Bind word history events
 * @param {string} word The word being looked up
 */
function bindWordHistoryEvents(word) {
    // Bind remove context buttons
    const removeContextBtns = document.querySelectorAll('.ai-dict-history-context-remove');
    removeContextBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetWord = btn.getAttribute('data-word');
            const index = parseInt(btn.getAttribute('data-index'), 10);
            if (targetWord && !isNaN(index)) {
                removeWordHistoryContext(targetWord, index);
                updateWordHistoryDisplay(word);
            }
        });
    });

    // Bind clear all button
    const clearBtn = document.querySelector('.ai-dict-history-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetWord = clearBtn.getAttribute('data-word');
            if (targetWord && confirm(`确定要清除 "${targetWord}" 的所有查词记录吗？`)) {
                clearWordHistory(targetWord);
                updateWordHistoryDisplay(word);
            }
        });
    }
}

/**
 * Update word history display dynamically
 * @param {string} word The word
 */
function updateWordHistoryDisplay(word) {
    const container = document.getElementById('ai-dict-word-history-content');
    if (!container) return;

    const history = getWordHistory(word);
    container.innerHTML = formatWordHistory(word, history);

    // Update the count in header
    const countSpan = document.querySelector('.ai-dict-history-count');
    if (countSpan) {
        countSpan.textContent = history ? `(${history.count}次)` : '';
    }

    // Rebind events
    bindWordHistoryEvents(word);
}

/**
 * Update Youdao section dynamically after results are fetched
 * @param {string} word The word being looked up
 * @param {Array|Object} youdaoResults Youdao results or error object
 */
function updateYoudaoSection(word, youdaoResults) {
    const container = document.getElementById('ai-dict-youdao-section');
    if (!container) return;

    const collapsibleId = `youdao-definitions-${Date.now()}`;

    // Check if we have Youdao results
    const hasYoudaoResults = youdaoResults && Array.isArray(youdaoResults) && youdaoResults.length > 0;

    // Check if proxy error occurred
    const hasProxyError = youdaoResults && youdaoResults.proxyError === true;

    let youdaoSection = '';

    if (hasProxyError) {
        // Show proxy error message
        youdaoSection = `
            <div class="ai-dict-proxy-error">
                <p class="ai-dict-error-text">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                    无法获取有道词典数据：CORS 代理不可用
                </p>
                <p class="ai-dict-hint-text">
                    请在 SillyTavern 配置文件 <code>config.yaml</code> 中设置：<br>
                    <code>enableCorsProxy: true</code>
                </p>
            </div>
        `;
    } else if (hasYoudaoResults) {
        // Determine if youdao definitions should be expanded by default
        const youdaoExpanded = !settings.autoCollapseYoudao;
        youdaoSection = `
            <!-- Youdao header section (always visible) -->
            ${formatYoudaoHeadSection(youdaoResults)}

            <!-- Collapsible definitions section -->
            <div class="ai-dict-collapsible-section">
                <div class="ai-dict-collapsible-header${youdaoExpanded ? ' expanded' : ''}" data-target="${collapsibleId}">
                    <i class="fa-solid fa-chevron-right${youdaoExpanded ? ' expanded' : ''}"></i>
                    <span>释义</span>
                </div>
                <div id="${collapsibleId}" class="ai-dict-collapsible-content${youdaoExpanded ? ' expanded' : ''}">
                    ${formatYoudaoDefinitions(youdaoResults)}
                </div>
            </div>
        `;
    }
    // If no results and no error, just clear the loading state (leave empty)

    container.innerHTML = youdaoSection;

    // Rebind event listeners for audio buttons
    const audioButtons = container.querySelectorAll('.odh-playaudio');
    audioButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const audioUrl = btn.getAttribute('data-audio-url');
            if (audioUrl) {
                playAudio(audioUrl);
            }
        });
    });

    // Rebind event listeners for collapsible headers
    const collapsibleHeaders = container.querySelectorAll('.ai-dict-collapsible-header');
    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targetId = header.getAttribute('data-target');
            if (targetId) {
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    const wasExpanded = targetElement.classList.contains('expanded');
                    targetElement.classList.toggle('expanded');
                    const icon = header.querySelector('i');
                    if (icon) {
                        icon.classList.toggle('expanded');
                    }

                    // Check if this is a Youdao definitions header being collapsed
                    // and if we should auto-fetch AI
                    if (wasExpanded && settings.fetchAIOnYoudaoExpand && targetId.startsWith('youdao-definitions-')) {
                        triggerAIFetchIfEmpty();
                    }
                }
            }
        });
    });
}

function formatYoudaoHeadSection(results) {
    if (!results || results.length === 0) {
        return '';
    }

    let html = '';
    for (const result of results) {
        html += '<div class="odh-note">';
        html += '<div class="odh-headsection">';

        // Word expression and phonetic
        html += `<span class="odh-expression">${escapeHtml(result.expression)}</span>`;

        if (result.reading) {
            html += `<span class="odh-reading">${escapeHtml(result.reading)}</span>`;
        }

        // Extra info and Audio buttons - both on the right
        if (result.extrainfo || (result.audios && result.audios.length > 0)) {
            if (result.extrainfo) {
                html += `<span class="odh-extra">${result.extrainfo}</span>`;
            }

            if (result.audios && result.audios.length > 0) {
                html += '<span class="odh-audios">';
                for (let i = 0; i < result.audios.length; i++) {
                    const audioUrl = result.audios[i];
                    html += `<img class="odh-playaudio" data-audio-url="${escapeHtml(audioUrl)}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.02zM14 3.1v2.02c2.84.86 4.9 3.52 4.9 6.88s-2.06 6.02-4.9 6.88v2.02c4.26-.96 7.5-4.9 7.5-8.9s-3.24-7.94-7.5-8.9z'/%3E%3C/svg%3E" title="${i === 0 ? 'UK Pronunciation' : 'US Pronunciation'}">`;
                }
                html += '</span>';
            }
        }

        html += '</div>';
        html += '</div>';
    }

    return html;
}

function formatYoudaoDefinitions(results) {
    if (!results || results.length === 0) {
        return '<p>未找到词典结果。</p>';
    }

    let html = '<div class="odh-notes">';

    for (const result of results) {
        // Definitions only (without head section)
        if (result.definitions && result.definitions.length > 0) {
            for (const definition of result.definitions) {
                html += definition;
            }
        }
    }

    html += '</div>';
    return html;
}

function updateAIDefinitionSection(aiDefinition) {
    const aiContentElement = document.getElementById('ai-definition-content');
    if (aiContentElement) {
        if (aiDefinition) {
            aiContentElement.innerHTML = `<p>${aiDefinition.replace(/\n/g, '<br>')}</p>`;
        } else {
            aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
        }
    }
}

function formatYoudaoResults(results) {
    if (!results || results.length === 0) {
        return '<p>未找到词典结果。</p>';
    }

    let html = '<div class="odh-notes">';

    for (const result of results) {
        // Main note container
        html += '<div class="odh-note">';

        // Head section with word, phonetic, and audio
        html += '<div class="odh-headsection">';

        // Word expression and phonetic - inline
        html += `<span class="odh-expression">${escapeHtml(result.expression)}</span>`;

        if (result.reading) {
            html += `<span class="odh-reading">${escapeHtml(result.reading)}</span>`;
        }

        // Extra info and Audio buttons - both on the right
        if (result.extrainfo || (result.audios && result.audios.length > 0)) {
            if (result.extrainfo) {
                html += `<span class="odh-extra">${result.extrainfo}</span>`;
            }

            // Audio buttons - on the right
            if (result.audios && result.audios.length > 0) {
                html += '<span class="odh-audios">';
                for (let i = 0; i < result.audios.length; i++) {
                    const audioUrl = result.audios[i];
                    html += `<img class="odh-playaudio" data-audio-url="${escapeHtml(audioUrl)}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.02zM14 3.1v2.02c2.84.86 4.9 3.52 4.9 6.88s-2.06 6.02-4.9 6.88v2.02c4.26-.96 7.5-4.9 7.5-8.9s-3.24-7.94-7.5-8.9z'/%3E%3C/svg%3E" title="${i === 0 ? 'UK Pronunciation' : 'US Pronunciation'}">`;
                }
                html += '</span>';
            }
        }

        html += '</div>'; // end headsection

        // Definitions
        if (result.definitions && result.definitions.length > 0) {
            for (const definition of result.definitions) {
                html += definition;
            }
        }

        html += '</div>'; // end odh-note
    }

    html += '</div>'; // end odh-notes

    return html;
}

function playAudio(audioUrl) {
    try {
        const audio = new Audio(audioUrl);
        audio.play().catch(err => {
            console.warn(`[${EXTENSION_NAME}] Failed to play audio:`, err.message);
        });
    } catch (error) {
        console.error(`[${EXTENSION_NAME}] Audio playback error:`, error.message);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function createSidePanel() {
    const isMobileMode = isMobile();

    // 1. Panel Container
    const panel = document.createElement('div');
    panel.id = 'ai-dictionary-panel';

    if (isMobileMode) {
        panel.className = 'ai-dict-mobile-panel';
        document.body.classList.add('ai-dict-mobile-active');
    } else {
        panel.className = 'ai-dict-desktop-popup';
        panel.style.display = 'none';
    }

    // Header
    const header = document.createElement('div');
    header.className = 'ai-dict-panel-header';

    const titleEl = document.createElement('h3');
    titleEl.textContent = 'AI Dictionary';
    header.appendChild(titleEl);

    // Action buttons container for desktop
    if (!isMobileMode) {
        const headerActions = document.createElement('div');
        headerActions.className = 'ai-dict-header-actions';

        // Pin button
        const pinBtn = document.createElement('button');
        pinBtn.className = 'ai-dict-pin-btn';
        pinBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i>';
        pinBtn.title = '固定面板';
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isPanelPinned = !isPanelPinned;
            pinBtn.classList.toggle('active', isPanelPinned);
            panel.classList.toggle('pinned', isPanelPinned);
            pinBtn.title = isPanelPinned ? '取消固定' : '固定面板';
        });
        headerActions.appendChild(pinBtn);

        header.appendChild(headerActions);

        // Desktop drag functionality
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let panelStartLeft = 0;
        let panelStartTop = 0;

        header.addEventListener('mousedown', (e) => {
            // Don't drag if clicking on buttons
            if (e.target.closest('button')) return;

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = panel.getBoundingClientRect();
            panelStartLeft = rect.left;
            panelStartTop = rect.top;

            // Remove transform for proper positioning
            panel.style.transform = 'none';
            panel.style.left = panelStartLeft + 'px';
            panel.style.top = panelStartTop + 'px';

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            const newLeft = Math.max(0, Math.min(panelStartLeft + deltaX, window.innerWidth - panel.offsetWidth));
            const newTop = Math.max(0, Math.min(panelStartTop + deltaY, window.innerHeight - panel.offsetHeight));

            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    panel.appendChild(header);

    // Content
    const contentEl = document.createElement('div');
    contentEl.className = 'ai-dict-panel-content';
    panel.appendChild(contentEl);

    // Prevent clicks inside panel from closing it (stop propagation)
    panel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.body.appendChild(panel);
    panelElement = panel;
    
    // 2. Mobile Specific Buttons
    if (isMobileMode) {
        // A. Toggle Button (Floating "Open" Icon when collapsed) - Right Middle
        const toggle = document.createElement('div');
        toggle.id = 'ai-dictionary-panel-toggle';
        toggle.innerHTML = '<i class="fa-solid fa-book-open"></i>';
        toggle.title = 'Expand AI Dictionary';

        // Set position - use left/top pixel values instead of CSS positioning
        toggle.style.position = 'fixed';
        toggle.style.pointerEvents = 'auto';
        toggle.style.zIndex = '200005';

        // Load saved position or use default (right middle)
        if (settings.mobileTogglePosition) {
            toggle.style.left = settings.mobileTogglePosition.left;
            toggle.style.top = settings.mobileTogglePosition.top;
        } else {
            // Default: right middle of screen
            const toggleWidth = 40;
            const toggleHeight = 60;
            const defaultLeft = window.innerWidth - toggleWidth;
            const defaultTop = window.innerHeight / 2 - toggleHeight / 2;
            toggle.style.left = defaultLeft + 'px';
            toggle.style.top = defaultTop + 'px';
        }

        // Touch/drag state for repositioning
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragStartLeft = 0;
        let dragStartTop = 0;

        toggle.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            dragStartLeft = parseInt(toggle.style.left) || 0;
            dragStartTop = parseInt(toggle.style.top) || 0;
            isDragging = false;
        });

        toggle.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            const deltaX = touch.clientX - dragStartX;
            const deltaY = touch.clientY - dragStartY;

            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                isDragging = true;
                e.preventDefault();

                const newLeft = Math.max(0, Math.min(dragStartLeft + deltaX, window.innerWidth - 40));
                const newTop = Math.max(0, Math.min(dragStartTop + deltaY, window.innerHeight - 60));

                toggle.style.left = newLeft + 'px';
                toggle.style.top = newTop + 'px';
            }
        });

        toggle.addEventListener('touchend', (e) => {
            if (isDragging) {
                // Save new position
                settings.mobileTogglePosition = {
                    left: toggle.style.left,
                    top: toggle.style.top
                };
                saveSettings();
                isDragging = false;
            } else {
                // Not dragging, just a tap - expand panel
                e.preventDefault();
                e.stopPropagation();
                expandPanel();
            }
        });

        // Click handler for desktop
        toggle.addEventListener('click', (e) => {
            if (!isDragging) {
                e.preventDefault();
                e.stopPropagation();
                expandPanel();
            }
        });

        document.body.appendChild(toggle);
        toggleElement = toggle;

        // B. Collapse Button (Attached to Panel - Left Middle)
        const collapseBtn = document.createElement('div');
        collapseBtn.id = 'ai-dictionary-panel-collapse-btn';
        collapseBtn.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
        collapseBtn.title = 'Collapse';
        
        // Force center positioning with inline styles
        collapseBtn.style.position = 'absolute';
        collapseBtn.style.top = '50%';
        collapseBtn.style.left = '-30px';
        collapseBtn.style.transform = 'translateY(-50%)';
        collapseBtn.style.bottom = 'auto';
        collapseBtn.style.pointerEvents = 'auto'; // Ensure clickable
        collapseBtn.style.zIndex = '200002'; // Layer correctly
        
        const collapseAction = (e) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation(); 
            collapsePanel();
        };
        collapseBtn.addEventListener('click', collapseAction);
        collapseBtn.addEventListener('touchstart', collapseAction, { passive: false });
        
        // Append to panel so it moves with it
        panel.appendChild(collapseBtn);
    }
}

function showPanel(title, content, type = 'info') {
    if (!panelElement) {
        createSidePanel();
    }

    const panel = panelElement;

    // Preserve classes, just update status class
    panel.classList.remove('ai-dict-loading', 'ai-dict-error', 'ai-dict-success', 'ai-dict-info');
    panel.classList.add(`ai-dict-${type}`);

    // If desktop, ensure it's visible
    if (!isMobile()) {
        panel.style.display = 'flex';
    }

    const titleEl = panel.querySelector('.ai-dict-panel-header h3');
    if (titleEl) titleEl.textContent = title;

    const contentEl = panel.querySelector('.ai-dict-panel-content');
    if (contentEl) contentEl.textContent = content;
}

function showPanelHtml(title, htmlContent, type = 'info') {
    if (!panelElement) {
        createSidePanel();
    }

    const panel = panelElement;

    // Preserve classes, just update status class
    panel.classList.remove('ai-dict-loading', 'ai-dict-error', 'ai-dict-success', 'ai-dict-info');
    panel.classList.add(`ai-dict-${type}`);

    // If desktop, ensure it's visible
    if (!isMobile()) {
        panel.style.display = 'flex';
    }

    const titleEl = panel.querySelector('.ai-dict-panel-header h3');
    if (titleEl) {
        // Get word history for lookup count
        const wordLower = title.toLowerCase().trim();
        const history = getWordHistory(wordLower);
        const lookupCount = history ? history.count : 0;

        // Check if word is in immersive review
        const isInReview = isWordInReview(wordLower);

        // Build title with count and review icon
        let titleHtml = `<span class="ai-dict-title-word">${escapeHtml(title)}</span>`;
        titleHtml += `<span class="ai-dict-title-count" title="查词次数">${lookupCount}次</span>`;

        if (settings.immersiveReview) {
            const reviewIcon = isInReview ? 'fa-solid fa-book-bookmark' : 'fa-regular fa-bookmark';
            const reviewTitle = isInReview ? '已加入沉浸式复习，点击移除' : '点击加入沉浸式复习';
            const reviewClass = isInReview ? 'ai-dict-review-icon active' : 'ai-dict-review-icon';
            titleHtml += `<button class="${reviewClass}" title="${reviewTitle}" data-word="${escapeHtml(wordLower)}"><i class="${reviewIcon}"></i></button>`;
        }

        titleEl.innerHTML = titleHtml;

        // Bind review icon click event
        const reviewIconBtn = titleEl.querySelector('.ai-dict-review-icon');
        if (reviewIconBtn) {
            reviewIconBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const word = reviewIconBtn.getAttribute('data-word');
                toggleWordInReview(word);
                // Update the icon
                const isNowInReview = isWordInReview(word);
                reviewIconBtn.className = isNowInReview ? 'ai-dict-review-icon active' : 'ai-dict-review-icon';
                reviewIconBtn.title = isNowInReview ? '已加入沉浸式复习，点击移除' : '点击加入沉浸式复习';
                reviewIconBtn.innerHTML = isNowInReview ? '<i class="fa-solid fa-book-bookmark"></i>' : '<i class="fa-regular fa-bookmark"></i>';
            });
        }
    }

    const contentEl = panel.querySelector('.ai-dict-panel-content');
    if (contentEl) {
        contentEl.innerHTML = htmlContent;

        // Add event listeners to tab buttons (for old tabbed interface)
        const tabBtns = contentEl.querySelectorAll('.ai-dict-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = btn.getAttribute('data-tab');
                switchTab(tabName);
            });
        });

        // Add event listeners to audio buttons
        const audioButtons = contentEl.querySelectorAll('.odh-playaudio');
        audioButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const audioUrl = btn.getAttribute('data-audio-url');
                if (audioUrl) {
                    playAudio(audioUrl);
                }
            });
        });

        // Add event listeners to collapsible headers (for new merged interface)
        const collapsibleHeaders = contentEl.querySelectorAll('.ai-dict-collapsible-header');
        collapsibleHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetId = header.getAttribute('data-target');
                if (targetId) {
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                        const wasExpanded = targetElement.classList.contains('expanded');
                        targetElement.classList.toggle('expanded');
                        const icon = header.querySelector('i');
                        if (icon) {
                            icon.classList.toggle('expanded');
                        }

                        // Check if this is a Youdao definitions header being collapsed
                        // and if we should auto-fetch AI
                        if (wasExpanded && settings.fetchAIOnYoudaoExpand && targetId.startsWith('youdao-definitions-')) {
                            triggerAIFetchIfEmpty();
                        }
                    }
                }
            });
        });
    }
}

function switchTab(tabName) {
    // Remove active class from all buttons and panes
    const tabBtns = document.querySelectorAll('.ai-dict-tab-btn');
    const tabPanes = document.querySelectorAll('.ai-dict-tab-pane');

    tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });

    tabPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === tabName) {
            pane.classList.add('active');
        }
    });
}

function expandPanel() {
    if (!panelElement) createSidePanel();
    
    // Force reflow to ensure transition works
    void panelElement.offsetWidth;
    
    panelElement.classList.add('expanded');
    
    // Let CSS handle toggle visibility using sibling selector
    // .ai-dict-mobile-panel.expanded + #ai-dictionary-panel-toggle { display: none; }
}

function collapsePanel() {
    if (panelElement) {
        panelElement.classList.remove('expanded');
        // Force reflow to ensure state is updated
        void panelElement.offsetWidth;
    }
}

function createIcon(x, y) {
    const icon = document.createElement('div');
    icon.id = 'ai-dictionary-icon';
    icon.innerHTML = '<i class="fa-solid fa-book"></i>';
    icon.style.left = `${x}px`;
    icon.style.top = `${y}px`;
    
    icon.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        e.stopPropagation();
        performDictionaryLookup();
    });

    icon.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        performDictionaryLookup();
    });
    
    return icon;
}

function showIcon(x, y) {
    hideIcon();
    const icon = createIcon(x, y);
    document.body.appendChild(icon);
    iconElement = icon;
}

function hideIcon() {
    if (iconElement) {
        iconElement.remove();
        iconElement = null;
    }
}

// Simple debounce function
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Mobile touch selection state
let selectionBeforeTouch = '';
let isTouchActive = false; // Track if touch is currently active (for Android)
let touchEndTimeout = null; // Timeout for processing selection after touch end
let lastProcessedSelection = ''; // Prevent duplicate processing

/**
 * Handle touch start - record current selection state and set touch active flag
 * @param {TouchEvent} event
 */
function handleTouchStart(event) {
    if (!settings.enabled) return;
    if (!isMobile()) return;

    // Don't handle touches on our UI elements
    if (event.target.closest('#ai-dictionary-icon') ||
        event.target.closest('#ai-dictionary-panel') ||
        event.target.closest('#ai-dictionary-panel-toggle')) {
        return;
    }

    // Clear any pending timeout from previous touch
    if (touchEndTimeout) {
        clearTimeout(touchEndTimeout);
        touchEndTimeout = null;
    }

    // Mark touch as active - important for Android to prevent premature icon display
    isTouchActive = true;

    // Record selection state before this touch interaction
    selectionBeforeTouch = window.getSelection().toString().trim();

    // Hide icon when new touch starts (user might be making new selection)
    hideIcon();
}

/**
 * Handle touch end - trigger lookup only when there's a new selection on release
 * For Android: wait longer for selection to stabilize after touch release
 * @param {TouchEvent} event
 */
function handleTouchEnd(event) {
    if (!settings.enabled) return;
    if (!isMobile()) return;

    // Don't handle touches on our UI elements
    if (event.target.closest('#ai-dictionary-icon') ||
        event.target.closest('#ai-dictionary-panel') ||
        event.target.closest('#ai-dictionary-panel-toggle')) {
        return;
    }

    // Mark touch as no longer active
    isTouchActive = false;

    // Clear any pending timeout
    if (touchEndTimeout) {
        clearTimeout(touchEndTimeout);
    }

    // Use longer delay for Android (300ms) vs iOS (50ms)
    // Android text selection takes longer to stabilize after touch release
    const delay = isAndroid() ? 300 : 50;

    touchEndTimeout = setTimeout(() => {
        processSelectionAfterTouch();
    }, delay);
}

/**
 * Handle touch cancel - reset touch state without processing selection
 * This handles cases where the touch is interrupted (e.g., by system gesture)
 */
function handleTouchCancel() {
    isTouchActive = false;
    if (touchEndTimeout) {
        clearTimeout(touchEndTimeout);
        touchEndTimeout = null;
    }
}

/**
 * Process selection after touch has ended
 * Separated from handleTouchEnd to allow calling from selectionchange for Android
 */
function processSelectionAfterTouch() {
    const selected = window.getSelection();
    const selectionString = selected.toString().trim();

    // Only trigger if:
    // 1. Touch is no longer active (user has released finger)
    // 2. There is selected text now
    // 3. The selection is different from before touch (new selection made)
    // 4. Not already processed (prevent duplicate triggers)
    if (isTouchActive) {
        // Touch still active, don't show icon yet (Android long press)
        return;
    }

    if (selectionString.length > 0 &&
        selectionString !== selectionBeforeTouch &&
        selectionString !== lastProcessedSelection) {

        lastProcessedSelection = selectionString;
        selectedText = selectionString;
        let element = selected.anchorNode?.parentElement;
        while (element && element.tagName !== 'P' && element.tagName !== 'DIV') {
            element = element.parentElement;
        }
        selectedContext = element ? element.textContent : selectionString;
        selectedParentElement = element;

        // Save selection range info for marking position in context
        selectionRangeInfo = null; // Reset first
        try {
            const range = selected.getRangeAt(0);
            // Calculate offset relative to the parent element using Range API
            if (element && range.startContainer) {
                // Create a range from the start of the parent element to the selection start
                const preSelectionRange = document.createRange();
                preSelectionRange.selectNodeContents(element);
                preSelectionRange.setEnd(range.startContainer, range.startOffset);

                // The length of this range's text content is the offset
                const startOffset = preSelectionRange.toString().length;

                selectionRangeInfo = {
                    startOffset: startOffset,
                    endOffset: startOffset + selectionString.length
                };
            }
        } catch (e) {
            selectionRangeInfo = null;
        }

        if (settings.enableDirectLookup) {
            performDictionaryLookup();
        } else {
            // Show the icon for manual trigger
            try {
                const range = selected.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                const position = settings.iconPosition || 'top-right';
                let x, y;
                const offset = 35;
                const gap = 5;

                switch (position) {
                    case 'top-left':
                        x = rect.left - offset;
                        y = rect.top - offset;
                        break;
                    case 'bottom-left':
                        x = rect.left - offset;
                        y = rect.bottom + gap;
                        break;
                    case 'bottom-right':
                        x = rect.right + gap;
                        y = rect.bottom + gap;
                        break;
                    case 'top-right':
                    default:
                        x = rect.right + gap;
                        y = rect.top - offset;
                        break;
                }

                const iconSize = 30;
                x = Math.max(5, Math.min(x, window.innerWidth - iconSize - 5));
                y = Math.max(5, Math.min(y, window.innerHeight - iconSize - 5));

                showIcon(x, y);
            } catch (e) {
                console.warn('AI Dictionary: Could not calculate selection position', e);
            }
        }
    } else if (selectionString.length === 0) {
        // No selection, hide icon and reset state
        hideIcon();
        selectionRangeInfo = null;
        lastProcessedSelection = '';
    }
}

function handleTextSelection(event) {
    if (!settings.enabled) return;

    // Check if click was on the icon itself (safe check)
    if (event && event.target && event.target.closest && event.target.closest('#ai-dictionary-icon')) {
        return;
    }
    // Check if click was on the toggle or panel components
    if (event && event.target && event.target.closest &&
        (event.target.closest('#ai-dictionary-panel') ||
         event.target.closest('#ai-dictionary-panel-toggle'))) {
        return;
    }

    const selected = window.getSelection();
    const selectionString = selected.toString().trim();

    if (selectionString.length > 0) {
        selectedText = selectionString;
        let element = selected.anchorNode.parentElement;
        while (element && element.tagName !== 'P' && element.tagName !== 'DIV') {
            element = element.parentElement;
        }
        selectedContext = element ? element.textContent : selectionString;
        selectedParentElement = element; // Store the parent element for context extraction

        // Save selection range info for marking position in context
        selectionRangeInfo = null; // Reset first
        try {
            const range = selected.getRangeAt(0);
            // Calculate offset relative to the parent element using Range API
            if (element && range.startContainer) {
                // Create a range from the start of the parent element to the selection start
                const preSelectionRange = document.createRange();
                preSelectionRange.selectNodeContents(element);
                preSelectionRange.setEnd(range.startContainer, range.startOffset);

                // The length of this range's text content is the offset
                const startOffset = preSelectionRange.toString().length;

                selectionRangeInfo = {
                    startOffset: startOffset,
                    endOffset: startOffset + selectionString.length
                };
            }
        } catch (e) {
            selectionRangeInfo = null;
        }

        if (settings.enableDirectLookup) {
            performDictionaryLookup();
        } else {
            // Calculate position for the icon
            try {
                const range = selected.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Position calculation based on setting
                const position = settings.iconPosition || 'top-right';
                let x, y;
                const offset = 35; // Size + gap
                const gap = 5;

                switch (position) {
                    case 'top-left':
                        x = rect.left - offset;
                        y = rect.top - offset;
                        break;
                    case 'bottom-left':
                        x = rect.left - offset;
                        y = rect.bottom + gap;
                        break;
                    case 'bottom-right':
                        x = rect.right + gap;
                        y = rect.bottom + gap;
                        break;
                    case 'top-right':
                    default:
                        x = rect.right + gap;
                        y = rect.top - offset;
                        break;
                }

                // Ensure icon is within viewport logic could be enhanced, but basic clamping:
                const iconSize = 30;
                x = Math.max(5, Math.min(x, window.innerWidth - iconSize - 5));
                y = Math.max(5, Math.min(y, window.innerHeight - iconSize - 5));

                showIcon(x, y);
            } catch (e) {
                console.warn('AI Dictionary: Could not calculate selection position', e);
            }
        }
    } else {
        // Clear selection, hide icon
        hideIcon();
        selectionRangeInfo = null;
    }
}

function handleContextMenu(event) {
    if (!settings.enabled) return;

    const selected = window.getSelection().toString().trim();
    if (!selected) return;

    selectedText = selected;
    let element = event.target;
    while (element && element.tagName !== 'P' && element.tagName !== 'DIV') {
        element = element.parentElement;
    }
    selectedContext = element ? element.textContent : selected;
    selectedParentElement = element; // Store the parent element for context extraction
}

// Global click handler for auto-collapse/close
function handleGlobalClick(event) {
    if (!panelElement) return;

    const target = event.target;

    // Check if click is inside icon or stats panel (panel clicks are already stopped by stopPropagation)
    const clickedInsideIcon = target.closest('#ai-dictionary-icon');
    const clickedInsideStatsPanel = target.closest('#ai-dict-stats-panel');

    if (clickedInsideIcon || clickedInsideStatsPanel) return;

    if (isMobile()) {
        // Mobile: collapse if expanded
        if (panelElement.classList.contains('expanded')) {
            const clickedInsideToggle = toggleElement && (toggleElement.contains(target) || target.closest('#ai-dictionary-panel-toggle'));
            if (!clickedInsideToggle) {
                collapsePanel();
            }
        }
    } else {
        // Desktop: close if visible and not pinned
        if (panelElement.style.display !== 'none' && !isPanelPinned) {
            panelElement.style.display = 'none';
        }
    }
}

// --- Initialization ---

let isReady = false;
let manager = null;

const init = async () => {
    // Load CSS styles
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = `${EXTENSION_URL}/style.css`;
    document.head.appendChild(linkElement);

    await loadSettings();
    console.log(`[${EXTENSION_NAME}] Settings loaded`, settings);

    // Load word history from file
    await loadWordHistoryFromFile();

    // Load review data from file
    await loadReviewDataFromFile();

    manager = new SettingsUi();
    const renderedUi = await manager.render();
    if (renderedUi) {
        $('#extensions_settings').append(renderedUi);
    }

    // Attach event listeners for core functionality

    // 1. Mouse interaction (Desktop)
    document.addEventListener('mouseup', (e) => setTimeout(() => handleTextSelection(e), 10));

    // 2. Touch interaction (Mobile) - Only trigger on touch release with new selection
    // touchstart: record selection state before touch
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    // touchend: check if new selection made and trigger lookup
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    // touchcancel: reset state when touch is interrupted
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    // 3. Selection change handler
    // - Desktop: debounced fallback for keyboard selection
    // - Android: also handles selection changes after touch ends (for selection handle dragging)
    const debouncedSelectionHandler = debounce((e) => {
        if (!isMobile()) {
            // Desktop: use selectionchange as fallback
            handleTextSelection(e);
        } else if (isAndroid() && !isTouchActive) {
            // Android: after touch ends, selection may still change (handle dragging)
            // Wait a bit more and then process the selection
            if (touchEndTimeout) {
                clearTimeout(touchEndTimeout);
            }
            touchEndTimeout = setTimeout(() => {
                processSelectionAfterTouch();
            }, 200);
        }
    }, 300);
    document.addEventListener('selectionchange', debouncedSelectionHandler);

    document.addEventListener('contextmenu', handleContextMenu);

    // 4. Global click for collapse
    document.addEventListener('click', handleGlobalClick);

    // Expose global function for context menu
    window.performDictionaryLookup = performDictionaryLookup;

    // Initialize the side panel (hidden/collapsed by default)
    // We can't do this immediately on init because body might not be fully ready?
    // Usually extensions load after DOM ready.
    createSidePanel();

    // 5. Listen for chat messages to re-highlight confusable words
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageIndex) => {
        // Delay to allow DOM to update
        setTimeout(() => highlightAllConfusableWords(), 100);

        // Check AI response for review words (immersive review)
        if (settings.immersiveReview && reviewData.currentSession.words.length > 0) {
            setTimeout(() => {
                try {
                    const context = getContext();
                    if (context && context.chat) {
                        // Get the last non-user message
                        let aiMessage = null;
                        for (let i = context.chat.length - 1; i >= 0; i--) {
                            if (!context.chat[i].is_user && context.chat[i].mes) {
                                aiMessage = context.chat[i].mes;
                                break;
                            }
                        }
                        if (aiMessage) {
                            console.log(`[${EXTENSION_NAME}] Checking AI response for review words...`);
                            console.log(`[${EXTENSION_NAME}] Current session words: ${reviewData.currentSession.words.join(', ')}`);
                            checkAIResponseForReviewWords(aiMessage);
                        }
                    }
                } catch (e) {
                    console.warn(`[${EXTENSION_NAME}] Error checking AI response for review words:`, e);
                }
            }, 500); // Delay to ensure message is fully received
        }
    });

    eventSource.on(event_types.MESSAGE_SENT, () => {
        setTimeout(() => highlightAllConfusableWords(), 100);
    });

    // 6. Inject review prompt before generation starts
    eventSource.on(event_types.GENERATION_STARTED, () => {
        if (!settings.immersiveReview) {
            // Clear the prompt if disabled
            setExtensionPrompt('ai-dictionary-review', '', extension_prompt_types.IN_CHAT, 0, false);
            return;
        }

        try {
            const reviewPrompt = generateReviewPrompt();
            if (reviewPrompt) {
                // Inject the review prompt at depth 0 (right before generation)
                setExtensionPrompt('ai-dictionary-review', reviewPrompt, extension_prompt_types.IN_CHAT, 0, false);
                console.log(`[${EXTENSION_NAME}] Injected review prompt with ${reviewData.currentSession.words.length} words`);
            } else {
                // Clear if no words to review
                setExtensionPrompt('ai-dictionary-review', '', extension_prompt_types.IN_CHAT, 0, false);
            }
        } catch (e) {
            console.warn(`[${EXTENSION_NAME}] Error injecting review prompt:`, e);
        }
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => highlightAllConfusableWords(), 100);
    });

    // Initialize highlight color from settings
    updateHighlightColor();

    // Initial highlight on page load
    setTimeout(() => highlightAllConfusableWords(), 500);

    isReady = true;
    console.log(`[${EXTENSION_NAME}] Ready`);
};

// 导出给其他模块使用（如 flashcard.js）
window.aiDictionary = {
    getWordHistory: () => wordHistoryData,
    lookupWord: (word) => {
        selectedText = word;
        selectedContext = '';
        performDictionaryLookup();
    },
    // 只读查词（不记录查词次数），用于背单词卡片
    // 支持传递上下文给AI
    lookupWordReadOnly: (word, context = '') => {
        selectedText = word;
        selectedContext = context;
        performDictionaryLookup(true); // skipSaveHistory = true
    }
};

// Start initialization
await init();
