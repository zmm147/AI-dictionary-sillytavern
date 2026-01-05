/**
 * AI Dictionary - Shared State Module
 * Centralized state management for the extension
 */

import { debounce } from './utils.js';

// Default settings
export const defaultSettings = {
    enabled: true,
    systemPrompt: 'You are a professional English teacher.',
    userPrompt: `输入：%word%
上下文：%context%

请根据输入内容进行处理：
1. 如果是单词：给出基础释义（用【解释性描述】），然后分析在上下文中的具体含义。
2. 如果是短语或句子：先给出中文翻译再分析句子结构。`,
    contextRange: 'all',
    connectionProfile: '',
    enableDirectLookup: false,
    iconPosition: 'bottom-left',
    mobileTogglePosition: null,
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
    confusableWords: {},
    highlightConfusables: false,
    highlightColor: '#e0a800',
    autoCollapseYoudao: false,
    autoFetchAI: true,
    fetchAIOnYoudaoExpand: true,
    immersiveReview: true,
    reviewPrompt: `Naturally incorporate the following words into the narrative at least once, without making the story feel forced or awkward: [%words%]. If the current part of the story does not naturally fit these words, you may develop the scene to make their use plausible.`,
};

// Ebbinghaus intervals for spaced repetition
export const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];
export const MAX_DAILY_REVIEW_WORDS = 20;

/** @type {Object} Current settings */
export let settings = { ...defaultSettings };

/** @type {HTMLElement} Side panel element */
export let panelElement = null;

/** @type {HTMLElement} Mobile toggle element */
export let toggleElement = null;

/** @type {HTMLElement} Dictionary icon element */
export let iconElement = null;

/** @type {string} Currently selected text */
export let selectedText = '';

/** @type {string} Context around selected text */
export let selectedContext = '';

/** @type {boolean} Whether panel is pinned */
export let isPanelPinned = false;

/** @type {Array} Chat history for deep study */
export let chatHistory = [];

/** @type {string} Current word being looked up */
export let currentWord = '';

/** @type {Object} Word history data cache */
export let wordHistoryData = {};

/** @type {Object} Review data */
export let reviewData = {
    pendingWords: [],
    reviewingWords: {},
    masteredWords: [],
    currentSession: { words: [], lastUpdated: null }
};

/** @type {Set} Pending word saves */
export const pendingWordSaves = new Set();

// State setters
export function setSettings(newSettings) {
    settings = newSettings;
}

export function setPanelElement(element) {
    panelElement = element;
}

export function setToggleElement(element) {
    toggleElement = element;
}

export function setIconElement(element) {
    iconElement = element;
}

export function setSelectedText(text) {
    selectedText = text;
}

export function setSelectedContext(context) {
    selectedContext = context;
}

export function setIsPanelPinned(pinned) {
    isPanelPinned = pinned;
}

export function setChatHistory(history) {
    chatHistory = history;
}

export function setCurrentWord(word) {
    currentWord = word;
}

export function setWordHistoryData(data) {
    wordHistoryData = data;
}

export function setReviewData(data) {
    reviewData = data;
}

export function updateReviewData(updates) {
    reviewData = { ...reviewData, ...updates };
}

export function clearChatHistory() {
    chatHistory = [];
}

export function addToChatHistory(message) {
    chatHistory.push(message);
}
