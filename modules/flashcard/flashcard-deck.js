/**
 * Flashcard - Deck Management Module
 * 牌组生成和会话管理
 */

import { DECK_SIZE, REVIEW_INTERVAL } from './flashcard-config.js';
import { deckState, blindState, resetBlindState } from './flashcard-state.js';
import { stopPlayback } from './flashcard-tts.js';

/**
 * 生成新的均衡牌组（新词+复习词）
 * @returns {Array} 牌组数组
 */
export function generateNewDeck() {
    let historyData = null;

    if (window.aiDictionary && typeof window.aiDictionary.getWordHistory === 'function') {
        historyData = window.aiDictionary.getWordHistory();
    }

    if (!historyData || Object.keys(historyData).length === 0) {
        deckState.totalWordsInHistory = 0;
        return [];
    }

    deckState.totalWordsInHistory = Object.keys(historyData).length;

    // 使用均衡算法生成牌组
    if (window.aiDictionary && window.aiDictionary.flashcard &&
        typeof window.aiDictionary.flashcard.generateBalancedDeck === 'function') {
        return window.aiDictionary.flashcard.generateBalancedDeck(historyData);
    }

    // 降级：使用旧的完全随机算法
    const allWords = [];
    for (const [word, data] of Object.entries(historyData)) {
        if (data.count >= 1) {
            allWords.push({
                word: word,
                context: data.contexts && data.contexts.length > 0
                    ? data.contexts[data.contexts.length - 1]
                    : '',
                correctCount: 0
            });
        }
    }

    // 完全随机打乱
    for (let i = allWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allWords[i], allWords[j]] = [allWords[j], allWords[i]];
    }

    return allWords.slice(0, DECK_SIZE);
}

/**
 * 保存当前session到数据库
 */
export async function saveSession() {
    if (!window.aiDictionary || !window.aiDictionary.flashcard ||
        !window.aiDictionary.flashcard.saveCurrentSession) {
        return;
    }

    const session = deckState.deck.length > 0 ? {
        deck: deckState.deck,
        currentIndex: deckState.currentIndex,
        wordsCompleted: deckState.wordsCompleted,
        progressScore: deckState.progressScore,
        lastReviewTime: deckState.lastReviewTime,
        totalWordsInHistory: deckState.totalWordsInHistory
    } : null;

    await window.aiDictionary.flashcard.saveCurrentSession(session);
}

/**
 * 启动复习定时器
 */
export function startReviewTimer() {
    stopReviewTimer();
    deckState.reviewTimer = setInterval(() => {
        triggerReview();
    }, REVIEW_INTERVAL);
}

/**
 * 停止复习定时器
 */
export function stopReviewTimer() {
    if (deckState.reviewTimer) {
        clearInterval(deckState.reviewTimer);
        deckState.reviewTimer = null;
    }
    resetBlindState();
    stopPlayback();
}

/**
 * 触发复习（从底部取卡插入到当前位置后）
 */
export function triggerReview() {
    if (deckState.deck.length <= 1) {
        return;
    }

    // 从底部取卡
    const reviewCard = deckState.deck.pop();
    if (reviewCard) {
        // 标记为定时复习卡片
        reviewCard.isReviewCard = true;
        // 插入到当前位置的下一张（不打断当前正在看的卡片）
        const insertIndex = Math.min(deckState.currentIndex + 1, deckState.deck.length);
        deckState.deck.splice(insertIndex, 0, reviewCard);
        deckState.lastReviewTime = Date.now();
        console.log(`[Flashcard] 定时复习: 静默插入单词 "${reviewCard.word}" 到位置 ${insertIndex}`);
        // 不调用 render()，避免打断用户当前正在看的卡片
    }
}

/**
 * 获取完成的单词数
 * @returns {number}
 */
export function getCompletedCount() {
    return deckState.wordsCompleted;
}

/**
 * 获取剩余单词数
 * @returns {number}
 */
export function getRemainingCount() {
    return deckState.deck.length;
}

/**
 * 获取牌组状态（供其他模块使用）
 * @returns {{deck: Array, currentIndex: number}}
 */
export function getDeckState() {
    return {
        deck: deckState.deck,
        currentIndex: deckState.currentIndex
    };
}
