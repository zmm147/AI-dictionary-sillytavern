/**
 * Flashcard - Card Operations Module
 * 卡片操作和事件处理
 */

import { DECK_SIZE } from './flashcard-config.js';
import { deckState, blindState, uiState, resetBlindState, saveTtsSpeed, clearTtsCache } from './flashcard-state.js';
import { escapeHtml, normalizeAnswer, generateRealtimeFeedback, applyConnectionProfile } from './flashcard-utils.js';
import { prefetchMobileTtsSentences, stopPlayback } from './flashcard-tts.js';
import { generateNewDeck, saveSession, startReviewTimer, stopReviewTimer, getDeckState } from './flashcard-deck.js';
import { generateBlindListeningSentences, playBlindListeningSentence } from './flashcard-blind.js';

// 渲染函数引用（由入口文件设置）
let renderFn = null;

/**
 * 设置渲染函数
 * @param {Function} fn
 */
export function setRenderFunction(fn) {
    renderFn = fn;
}

/**
 * 调用渲染
 */
function render() {
    if (renderFn) {
        renderFn();
    }
}

/**
 * 触发查词（只读模式）
 * @param {string} word
 * @param {string} context
 */
export function triggerWordLookup(word, context = '') {
    if (window.aiDictionary && typeof window.aiDictionary.lookupWordReadOnly === 'function') {
        window.aiDictionary.lookupWordReadOnly(word, context);
    } else {
        console.warn('[Flashcard] aiDictionary.lookupWordReadOnly not available');
    }
}

/**
 * 显示默认句子（第一个句子）
 */
export function showDefaultSentence() {
    const currentCard = deckState.deck[deckState.currentIndex];
    if (!currentCard) return;
    const sentences = blindState.sentences.get(currentCard.word) || [];
    if (sentences.length > 0) {
        const idx = blindState.lastPlayedIndex >= 0 ? blindState.lastPlayedIndex : 0;
        blindState.displayedSentence = sentences[idx] || sentences[0];
        if (blindState.lastPlayedIndex < 0) {
            blindState.lastPlayedIndex = 0;
        }
    }
}

/**
 * 处理单词输入验证
 */
export function handleWordInputValidation() {
    const currentCard = deckState.deck[deckState.currentIndex];
    if (!currentCard) return;

    const normalizedInput = normalizeAnswer(blindState.inputValue);
    const normalizedWord = normalizeAnswer(currentCard.word);

    // 检查是否完全正确
    if (normalizedInput && normalizedInput === normalizedWord) {
        // 输入完全正确，显示句子、翻转卡片并显示操作按钮
        deckState.isFlipped = true;
        showDefaultSentence();
        uiState.showActionButtons = true;
        render();
    } else {
        // 只更新反馈区域，不重新渲染整个界面
        const feedbackContainer = document.querySelector('.flashcard-realtime-feedback');
        if (feedbackContainer) {
            feedbackContainer.innerHTML = generateRealtimeFeedback(blindState.inputValue, currentCard.word);
        }
    }
}

/**
 * 处理回答
 * @param {boolean} remembered - 是否记住了
 */
export async function handleAnswer(remembered) {
    const card = deckState.deck[deckState.currentIndex];
    const wasLastCard = deckState.currentIndex === deckState.deck.length - 1;

    // 清除复习卡片标记
    if (card.isReviewCard) {
        delete card.isReviewCard;
    }

    if (remembered) {
        deckState.progressScore += 0.5;
    } else if (card.correctCount > 0) {
        // 如果之前已经点过认识，才扣分
        deckState.progressScore = Math.max(0, deckState.progressScore - 0.5);
    }

    // 更新跨session的单词进度（SM-2算法）
    if (window.aiDictionary && window.aiDictionary.flashcard &&
        window.aiDictionary.flashcard.updateWordProgress) {
        await window.aiDictionary.flashcard.updateWordProgress(
            card.word,
            remembered,
            card.context
        );
    }

    if (remembered) {
        card.correctCount++;
        if (card.correctCount >= 2) {
            // 记住2次，从牌组移除
            deckState.deck.splice(deckState.currentIndex, 1);
            deckState.wordsCompleted++;
            // 索引不变（因为后面的卡片前移了）
            if (deckState.currentIndex >= deckState.deck.length) {
                deckState.currentIndex = 0;
            }
        } else {
            // 记住1次，放到牌组底部
            deckState.deck.splice(deckState.currentIndex, 1);
            deckState.deck.push(card);
            if (wasLastCard) {
                deckState.currentIndex = 0;
            }
            if (deckState.currentIndex >= deckState.deck.length) {
                deckState.currentIndex = 0;
            }
        }
    } else {
        // 没记住，重置计数，放到牌组底部
        card.correctCount = 0;
        deckState.deck.splice(deckState.currentIndex, 1);
        deckState.deck.push(card);
        if (wasLastCard) {
            deckState.currentIndex = 0;
        }
        if (deckState.currentIndex >= deckState.deck.length) {
            deckState.currentIndex = 0;
        }
    }

    // 重置翻转状态和输入状态
    deckState.isFlipped = false;
    blindState.inputValue = '';
    blindState.cursorPosition = 0;
    blindState.displayedSentence = '';
    blindState.lastPlayedIndex = -1;
    blindState.playingIndex = -1;
    uiState.inputExpanded = false;
    uiState.showActionButtons = false;
    uiState.showWordOnFront = false;

    // 保存session
    await saveSession();

    render();

    // 为新卡片准备句子
    prepareCurrentCardSentences();
}

/**
 * 处理删除单词
 */
export async function handleDelete() {
    const card = deckState.deck[deckState.currentIndex];

    // 确认删除
    if (!confirm(`确定要永久删除单词 "${card.word}" 吗？\n\n删除后：\n1. 该单词将从查词记录中移除\n2. 后续查询将不再记录此单词`)) {
        return;
    }

    // 调用删除API
    if (window.aiDictionary && typeof window.aiDictionary.deleteWordPermanently === 'function') {
        await window.aiDictionary.deleteWordPermanently(card.word);
    }

    // 如果该单词之前已记住了，扣减进度分数
    if (card.correctCount > 0) {
        deckState.progressScore = Math.max(0, deckState.progressScore - card.correctCount * 0.5);
    }

    // 从牌组中移除
    deckState.deck.splice(deckState.currentIndex, 1);

    // 调整索引
    if (deckState.currentIndex >= deckState.deck.length) {
        deckState.currentIndex = 0;
    }

    // 保存session
    await saveSession();

    // 重置翻转状态和输入状态
    deckState.isFlipped = false;
    blindState.inputValue = '';
    blindState.cursorPosition = 0;
    blindState.displayedSentence = '';
    blindState.lastPlayedIndex = -1;
    blindState.playingIndex = -1;
    uiState.inputExpanded = false;
    uiState.showActionButtons = false;
    uiState.showWordOnFront = false;
    render();

    // 为新卡片准备句子
    prepareCurrentCardSentences();
}

/**
 * 为当前卡片准备句子（如果尚未生成）
 */
export async function prepareCurrentCardSentences() {
    // 如果盲听未开启，不生成句子
    if (!uiState.blindListeningEnabled) {
        return;
    }

    if (!deckState.deck.length) return;

    const currentCard = deckState.deck[deckState.currentIndex];
    if (!currentCard) return;

    // 如果已经有句子，只预加载不自动播放
    if (blindState.sentences.has(currentCard.word)) {
        const sentences = blindState.sentences.get(currentCard.word);
        if (sentences && sentences.length > 0) {
            await prefetchMobileTtsSentences(sentences, currentCard.word);
            blindState.lastPlayedIndex = 0;
            render();
        }
        // 预生成接下来的卡片
        prefetchUpcomingCards();
        return;
    }

    const generationToken = ++blindState.generationToken;
    blindState.loading = true;
    blindState.loadProgress = { total: 1, completed: 0 };
    render();

    const settings = window.aiDictionary?.settings;
    const restoreProfile = await applyConnectionProfile(settings?.connectionProfile || '');

    try {
        if (generationToken !== blindState.generationToken) return;

        const sentences = await generateBlindListeningSentences(currentCard.word, currentCard.context);
        blindState.sentences.set(currentCard.word, sentences);
        await prefetchMobileTtsSentences(sentences, currentCard.word);
        blindState.loadProgress.completed = 1;

        // 句子生成完成后只渲染，不自动播放
        if (generationToken === blindState.generationToken && sentences.length > 0) {
            blindState.lastPlayedIndex = 0;
            blindState.loading = false;
            render();
        }
    } catch (error) {
        console.error('[Flashcard] Sentence generation error:', error);
    } finally {
        await restoreProfile();
        blindState.loading = false;
        if (generationToken === blindState.generationToken) {
            render();
        }
    }

    // 预生成接下来的卡片
    prefetchUpcomingCards();
}

/**
 * 预生成接下来的2个卡片的句子和音频
 */
async function prefetchUpcomingCards() {
    // 如果盲听未开启，不预生成
    if (!uiState.blindListeningEnabled) {
        return;
    }

    if (!deckState.deck.length) return;

    const settings = window.aiDictionary?.settings;
    const restoreProfile = await applyConnectionProfile(settings?.connectionProfile || '');

    try {
        let prefetchedCount = 0;
        let searchIndex = 1;

        // 从当前索引开始，预生成接下来的2个非复习卡片
        while (prefetchedCount < 2 && searchIndex < deckState.deck.length) {
            const nextIndex = (deckState.currentIndex + searchIndex) % deckState.deck.length;
            const nextCard = deckState.deck[nextIndex];

            searchIndex++;

            if (!nextCard) continue;

            // 跳过定时复习卡片
            if (nextCard.isReviewCard) {
                console.log(`[Flashcard] Skipping review card: ${nextCard.word}`);
                continue;
            }

            // 如果已经有句子，跳过
            if (blindState.sentences.has(nextCard.word)) {
                prefetchedCount++;
                continue;
            }

            try {
                const sentences = await generateBlindListeningSentences(nextCard.word, nextCard.context);
                blindState.sentences.set(nextCard.word, sentences);
                await prefetchMobileTtsSentences(sentences, nextCard.word);
                prefetchedCount++;
                console.log(`[Flashcard] Prefetched card ${prefetchedCount}: ${nextCard.word}`);
            } catch (error) {
                console.error(`[Flashcard] Prefetch error for ${nextCard.word}:`, error);
                // 继续预生成下一个卡片
            }
        }
    } finally {
        await restoreProfile();
    }
}

/**
 * 重新生成当前卡片和后续2个卡片的音频（语速改变时调用）
 */
export async function regenerateAudioForCurrentAndUpcoming() {
    // 如果盲听未开启，不重新生成
    if (!uiState.blindListeningEnabled) {
        return;
    }

    if (!deckState.deck.length) return;

    // 收集需要重新生成音频的卡片（当前卡片 + 后续2个非复习卡片）
    const cardsToRegenerate = [];

    // 当前卡片
    const currentCard = deckState.deck[deckState.currentIndex];
    if (currentCard && blindState.sentences.has(currentCard.word)) {
        cardsToRegenerate.push(currentCard);
    }

    // 后续2个非复习卡片
    let count = 0;
    let searchIndex = 1;
    while (count < 2 && searchIndex < deckState.deck.length) {
        const nextIndex = (deckState.currentIndex + searchIndex) % deckState.deck.length;
        const nextCard = deckState.deck[nextIndex];
        searchIndex++;

        if (!nextCard) continue;
        if (nextCard.isReviewCard) continue;
        if (!blindState.sentences.has(nextCard.word)) continue;

        cardsToRegenerate.push(nextCard);
        count++;
    }

    // 重新生成音频
    for (const card of cardsToRegenerate) {
        const sentences = blindState.sentences.get(card.word);
        if (sentences && sentences.length > 0) {
            await prefetchMobileTtsSentences(sentences, card.word);
            console.log(`[Flashcard] Regenerated audio for: ${card.word}`);
        }
    }
}

/**
 * 开始背单词
 * @param {Function} completeCallback - 完成时的回调，传入完成的单词数
 * @returns {Promise<boolean>}
 */
export async function start(completeCallback) {
    deckState.onComplete = completeCallback;
    resetBlindState();
    stopPlayback();

    // 检查是否有保存的session，直接恢复
    let hasSession = false;
    if (window.aiDictionary && window.aiDictionary.flashcard &&
        window.aiDictionary.flashcard.getCurrentSession) {
        const savedSession = window.aiDictionary.flashcard.getCurrentSession();

        if (savedSession && savedSession.deck && savedSession.deck.length > 0) {
            // 直接恢复session，不询问
            deckState.deck = savedSession.deck;
            deckState.currentIndex = savedSession.currentIndex || 0;
            deckState.wordsCompleted = savedSession.wordsCompleted || 0;
            deckState.progressScore = Math.max(0, savedSession.progressScore ?? 0);
            deckState.lastReviewTime = savedSession.lastReviewTime || Date.now();
            deckState.totalWordsInHistory = savedSession.totalWordsInHistory || 0;
            hasSession = true;
            console.log(`[Flashcard] 恢复上次进度: 剩余 ${deckState.deck.length} 词, 已完成 ${deckState.wordsCompleted} 词, 进度分数 ${deckState.progressScore}`);
        }
    }

    // 如果没有session，生成新牌组
    if (!hasSession) {
        deckState.deck = generateNewDeck();
        deckState.currentIndex = 0;
        deckState.isFlipped = false;
        deckState.wordsCompleted = 0;
        deckState.progressScore = 0;
        deckState.lastReviewTime = Date.now();
    }

    const hasDeck = deckState.deck.length > 0;

    // 启动复习定时器
    if (hasDeck) {
        startReviewTimer();
    }

    render();
    await saveSession();

    if (!hasDeck) {
        stopReviewTimer();
        return false;
    }

    // 为当前卡片准备句子
    prepareCurrentCardSentences();

    return true;
}

/**
 * 处理继续下一组
 */
export async function handleContinue() {
    deckState.wordsCompleted = 0;
    deckState.deck = generateNewDeck();
    deckState.currentIndex = 0;
    deckState.isFlipped = false;
    deckState.progressScore = 0;
    deckState.lastReviewTime = Date.now();
    blindState.inputValue = '';
    blindState.cursorPosition = 0;
    blindState.displayedSentence = '';
    blindState.lastPlayedIndex = -1;
    blindState.playingIndex = -1;
    const hasNewDeck = deckState.deck.length > 0;
    if (hasNewDeck) {
        startReviewTimer();
    } else {
        stopReviewTimer();
    }
    await saveSession();
    render();
    if (hasNewDeck) {
        prepareCurrentCardSentences();
    }
}

/**
 * 处理语速变化
 * @param {number} newSpeed
 */
export async function handleSpeedChange(newSpeed) {
    if (newSpeed !== uiState.ttsSpeed) {
        saveTtsSpeed(newSpeed);
        // 清除所有音频缓存，强制重新生成
        clearTtsCache();
        // 重新生成当前卡片和后续卡片的音频
        await regenerateAudioForCurrentAndUpcoming();
    }
}
