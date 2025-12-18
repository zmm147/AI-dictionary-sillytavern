import { extension_settings, getContext } from '../../../extensions.js';
import { getRequestHeaders, eventSource, event_types, generateRaw, saveSettingsDebounced } from '../../../../script.js';
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
const WORD_HISTORY_FILE_NAME = 'ai-dictionary-word-history.json'; // 独立存储文件名

/** @type {Object} */
let wordHistoryData = {}; // 内存中的查词记录缓存

/**
 * Load word history from file
 * @returns {Promise<Object>}
 */
async function loadWordHistoryFromFile() {
    try {
        // File is stored in user's files directory: data/[user]/files/
        const response = await fetch(`/user/files/${WORD_HISTORY_FILE_NAME}`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });

        if (response.ok) {
            const data = await response.json();
            wordHistoryData = data || {};
            console.log(`[${EXTENSION_NAME}] Loaded ${Object.keys(wordHistoryData).length} words from history file`);
            return wordHistoryData;
        } else {
            // File doesn't exist yet, initialize empty
            wordHistoryData = {};
            return wordHistoryData;
        }
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Could not load word history file:`, error.message);
        wordHistoryData = {};
        return wordHistoryData;
    }
}

/**
 * Save word history to file
 */
async function saveWordHistoryToFile() {
    try {
        const jsonData = JSON.stringify(wordHistoryData, null, 2);
        const base64Data = btoa(unescape(encodeURIComponent(jsonData)));

        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                name: WORD_HISTORY_FILE_NAME,
                data: base64Data,
            }),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        console.log(`[${EXTENSION_NAME}] Word history saved to file`);
    } catch (error) {
        console.error(`[${EXTENSION_NAME}] Could not save word history file:`, error.message);
    }
}

// Debounced save to avoid too frequent writes
const saveWordHistoryDebounced = debounce(saveWordHistoryToFile, 2000);

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

    // Save to file (debounced)
    saveWordHistoryDebounced();
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
        saveWordHistoryDebounced();
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
        saveWordHistoryDebounced();
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
 * @param {'today' | 'week' | 'month' | 'all'} range
 * @returns {string}
 */
function createStatisticsPanelContent(range) {
    const stats = getWordStatistics(range);
    const groups = groupWordsByCount(stats);
    const totalWords = stats.length;
    const totalLookups = stats.reduce((sum, item) => sum + item.count, 0);

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
            <div class="ai-dict-stats-content">
                ${groupsHtml}
            </div>
        </div>
    `;
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
        const fullText = selectedParentElement.textContent || '';
        const beforeText = fullText.substring(0, selectionRangeInfo.startOffset);
        const afterText = fullText.substring(selectionRangeInfo.endOffset);

        // Find this pattern in the context
        const pattern = beforeText.slice(-30) + selected + afterText.slice(0, 30);
        const patternIndex = context.indexOf(pattern.trim());

        if (patternIndex !== -1) {
            // Found the exact location, mark it
            const beforePart = beforeText.slice(-30);
            const afterPart = afterText.slice(0, 30);
            const searchStart = context.indexOf(beforePart);
            if (searchStart !== -1) {
                const selectStart = searchStart + beforePart.length;
                return context.substring(0, selectStart) + marker + context.substring(selectStart + selected.length);
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

async function performDictionaryLookup() {
    // Remove icon if present
    hideIcon();

    // Clear text selection
    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }

    if (!selectedText.trim()) {
        showPanel('No word selected', 'Please select a word on the page first.', 'error');
        return;
    }

    try {
        // Show loading state and ensure panel is expanded
        showPanel('Looking up...', `Fetching definitions for: "${selectedText}"...`, 'loading');

        // Force expand if mobile (desktop popup is always 'expanded' effectively)
        if (isMobile()) {
            expandPanel();
        }

        // Save word history with the single paragraph context (selectedContext)
        // Note: selectedContext contains only the paragraph where the word was found
        saveWordHistory(selectedText, selectedContext);

        // Show panel immediately with loading states for both sections
        const initialHtmlContent = createMergedContent(selectedText, null);
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

        // Bind manual AI fetch button if auto fetch is disabled
        if (!settings.autoFetchAI) {
            bindManualAIFetchButton(selectedText);
        }

        // Start Youdao lookup
        const youdaoPromise = fetchYoudaoDictionary(selectedText).catch(error => {
            console.warn('Youdao dictionary fetch failed:', error);
            return null;
        });

        // Only start AI lookup if auto fetch is enabled
        let aiPromise = Promise.resolve();
        if (settings.autoFetchAI) {
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
        if (settings.autoFetchAI) {
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
    const fetchBtn = document.getElementById('ai-dict-fetch-ai-btn');
    if (fetchBtn) {
        fetchBtn.addEventListener('click', async () => {
            // Show loading state
            const aiContentElement = document.getElementById('ai-definition-content');
            if (aiContentElement) {
                aiContentElement.innerHTML = '<p class="ai-dict-loading-text">正在获取 AI 定义...</p>';
            }

            // Disable button
            fetchBtn.disabled = true;

            try {
                await fetchAIDefinition(word);
            } catch (error) {
                console.error('AI definition fetch error:', error);
                if (aiContentElement) {
                    aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
                }
            }
        });
    }
}

// Cache for proxy availability check
let proxyAvailable = null;

/**
 * Check if local SillyTavern proxy is available
 * @returns {Promise<boolean>}
 */
async function checkProxyAvailable() {
    if (proxyAvailable !== null) {
        return proxyAvailable;
    }

    try {
        // Try a simple request to the proxy endpoint
        const response = await fetch('/proxy/https://www.google.com', {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000)
        });
        proxyAvailable = response.ok || response.status !== 404;
    } catch (error) {
        proxyAvailable = false;
    }

    console.log(`[${EXTENSION_NAME}] Local proxy available:`, proxyAvailable);
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
                        signal: AbortSignal.timeout(10000)
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
            }
        }

        // Update button to show completion
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>形近词查找完成</span>';
        }
    } catch (error) {
        console.error('Confusable lookup error:', error);
        contentElement.innerHTML = '<p class="ai-dict-error-text">无法获取形近词，请稍后重试。</p>';
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-shuffle"></i> <span>重试形近词</span>';
        }
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
    html += `<div class="ai-dict-confusable-ai-title">AI 生成的形近词：</div>`;
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

function createMergedContent(word, youdaoResults) {
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
                <div id="ai-definition-content" class="ai-dict-ai-content">
                    ${settings.autoFetchAI
                        ? '<p class="ai-dict-loading-text">正在获取 AI 定义...</p>'
                        : '<p class="ai-dict-no-ai-text">点击右下角按钮获取 AI 释义</p>'
                    }
                </div>
                ${!settings.autoFetchAI ? `
                <button id="ai-dict-fetch-ai-btn" class="ai-dict-fetch-ai-btn" title="获取 AI 释义">
                    <i class="fa-solid fa-sync-alt"></i>
                </button>
                ` : ''}
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
                    targetElement.classList.toggle('expanded');
                    const icon = header.querySelector('i');
                    if (icon) {
                        icon.classList.toggle('expanded');
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
    if (titleEl) titleEl.textContent = title;

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
                        targetElement.classList.toggle('expanded');
                        const icon = header.querySelector('i');
                        if (icon) {
                            icon.classList.toggle('expanded');
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

/**
 * Handle touch start - record current selection state
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

    // Record selection state before this touch interaction
    selectionBeforeTouch = window.getSelection().toString().trim();
}

/**
 * Handle touch end - trigger lookup only when there's a new selection on release
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

    // Delay to allow selection to be finalized after touch release
    setTimeout(() => {
        const selected = window.getSelection();
        const selectionString = selected.toString().trim();

        // Only trigger if:
        // 1. There is selected text now
        // 2. The selection is different from before touch (new selection made)
        if (selectionString.length > 0 && selectionString !== selectionBeforeTouch) {
            selectedText = selectionString;
            let element = selected.anchorNode?.parentElement;
            while (element && element.tagName !== 'P' && element.tagName !== 'DIV') {
                element = element.parentElement;
            }
            selectedContext = element ? element.textContent : selectionString;
            selectedParentElement = element;

            // Save selection range info for marking position in context
            try {
                const range = selected.getRangeAt(0);
                if (element && range.startContainer) {
                    const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                    let offset = 0;
                    let node;
                    while ((node = treeWalker.nextNode())) {
                        if (node === range.startContainer) {
                            selectionRangeInfo = {
                                startOffset: offset + range.startOffset,
                                endOffset: offset + range.startOffset + selectionString.length
                            };
                            break;
                        }
                        offset += node.textContent.length;
                    }
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
            // No selection, hide icon
            hideIcon();
            selectionRangeInfo = null;
        }
    }, 50);
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
        try {
            const range = selected.getRangeAt(0);
            // Calculate offset relative to the parent element
            if (element && range.startContainer) {
                const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                let offset = 0;
                let node;
                while ((node = treeWalker.nextNode())) {
                    if (node === range.startContainer) {
                        selectionRangeInfo = {
                            startOffset: offset + range.startOffset,
                            endOffset: offset + range.startOffset + selectionString.length
                        };
                        break;
                    }
                    offset += node.textContent.length;
                }
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

    // 3. Selection change (General / Fallback / Keyboard) - debounced (desktop only)
    const debouncedSelectionHandler = debounce((e) => {
        // Only use selectionchange for desktop, mobile uses touch events
        if (!isMobile()) {
            handleTextSelection(e);
        }
    }, 500);
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
    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        // Delay to allow DOM to update
        setTimeout(() => highlightAllConfusableWords(), 100);
    });

    eventSource.on(event_types.MESSAGE_SENT, () => {
        setTimeout(() => highlightAllConfusableWords(), 100);
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

// Start initialization
await init();
