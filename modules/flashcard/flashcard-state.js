/**
 * Flashcard - State Management Module
 * 状态管理
 */

import { DEFAULT_TTS_SPEED, TTS_SPEED_STORAGE_KEY } from './flashcard-config.js';

// 牌组状态
export const deckState = {
    deck: [],                    // 当前牌组 [{ word, context, correctCount }]
    totalWordsInHistory: 0,      // 词库总单词数
    currentIndex: 0,             // 当前卡片索引
    isFlipped: false,            // 是否翻转显示背面
    wordsCompleted: 0,           // 本轮完成的单词数
    progressScore: 0,            // 进度分数（每次认识+0.5，忘了-0.5）
    onComplete: null,            // 完成回调
    lastReviewTime: 0,           // 上次复习时间
    reviewTimer: null,           // 复习定时器
};

// 盲听状态
export const blindState = {
    active: false,
    deck: [],
    index: 0,
    sentences: new Map(),
    loading: false,
    loadProgress: { total: 0, completed: 0 },
    inputExpanded: false,
    revealAnswer: false,
    feedback: '',
    inputValue: '',
    statusMessage: '',
    autoPlayedIndex: null,
    audio: null,
    playbackToken: 0,
    generationToken: 0,
    displayedSentence: '',
    lastPlayedIndex: -1,
    playingIndex: -1,
    cursorPosition: 0,
};

// TTS 缓存
export const ttsCache = {
    urlCache: new Map(),
    bufferCache: new Map(),
    iosAudioContext: null,
    iosAudioSource: null,
};

// UI 状态
export const uiState = {
    inputExpanded: false,
    showActionButtons: false,
    showWordOnFront: false,
    ttsSpeed: parseFloat(localStorage.getItem(TTS_SPEED_STORAGE_KEY)) || DEFAULT_TTS_SPEED,
    ttsStatusMessage: '',
    blindListeningEnabled: localStorage.getItem('flashcard-blind-listening-enabled') === 'true',
};

/**
 * 重置牌组状态
 */
export function resetDeckState() {
    deckState.deck = [];
    deckState.totalWordsInHistory = 0;
    deckState.currentIndex = 0;
    deckState.isFlipped = false;
    deckState.wordsCompleted = 0;
    deckState.progressScore = 0;
    deckState.onComplete = null;
    deckState.lastReviewTime = 0;
    if (deckState.reviewTimer) {
        clearInterval(deckState.reviewTimer);
        deckState.reviewTimer = null;
    }
}

/**
 * 重置盲听状态
 */
export function resetBlindState() {
    blindState.active = false;
    blindState.deck = [];
    blindState.index = 0;
    blindState.sentences = new Map();
    blindState.loading = false;
    blindState.loadProgress = { total: 0, completed: 0 };
    blindState.inputExpanded = false;
    blindState.revealAnswer = false;
    blindState.feedback = '';
    blindState.inputValue = '';
    blindState.statusMessage = '';
    blindState.autoPlayedIndex = null;
    blindState.generationToken += 1;
    blindState.displayedSentence = '';
    blindState.lastPlayedIndex = -1;
    blindState.playingIndex = -1;
    blindState.cursorPosition = 0;
}

/**
 * 重置UI状态
 */
export function resetUIState() {
    uiState.inputExpanded = false;
    uiState.showActionButtons = false;
    uiState.showWordOnFront = false;
    uiState.ttsStatusMessage = '';
}

/**
 * 保存TTS语速到localStorage
 * @param {number} speed
 */
export function saveTtsSpeed(speed) {
    uiState.ttsSpeed = speed;
    localStorage.setItem(TTS_SPEED_STORAGE_KEY, speed.toString());
}

/**
 * 保存盲听开关状态到localStorage
 * @param {boolean} enabled
 */
export function saveBlindListeningEnabled(enabled) {
    uiState.blindListeningEnabled = enabled;
    localStorage.setItem('flashcard-blind-listening-enabled', enabled.toString());
}

/**
 * 清除TTS缓存
 */
export function clearTtsCache() {
    ttsCache.urlCache.clear();
    ttsCache.bufferCache.clear();
}
