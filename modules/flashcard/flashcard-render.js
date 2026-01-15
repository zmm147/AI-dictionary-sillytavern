/**
 * Flashcard - Render Module
 * 渲染函数
 */

import { DECK_SIZE } from './flashcard-config.js';
import { deckState, blindState, uiState } from './flashcard-state.js';
import { escapeHtml, generateRealtimeFeedback } from './flashcard-utils.js';
import { stopReviewTimer, saveSession } from './flashcard-deck.js';
import { renderBlindListeningView, playBlindListeningSentence } from './flashcard-blind.js';
import {
    handleAnswer,
    handleDelete,
    handleContinue,
    handleSpeedChange,
    handleWordInputValidation,
    showDefaultSentence,
    triggerWordLookup,
    prepareCurrentCardSentences
} from './flashcard-card.js';

/**
 * 渲染卡片界面
 */
export function render() {
    const container = document.getElementById('flashcard-container');
    if (!container) return;

    // 如果盲听模式激活，渲染盲听视图
    if (blindState.active) {
        renderBlindListeningView(container);
        return;
    }

    if (deckState.deck.length === 0) {
        renderEmptyState(container);
        return;
    }

    renderCardView(container);
}

/**
 * 渲染空状态
 * @param {HTMLElement} container
 */
function renderEmptyState(container) {
    const isNoHistory = deckState.totalWordsInHistory === 0;
    const emptyTitle = isNoHistory ? '还没有可复习的单词' : '太棒了！所有单词都复习完了！';
    const emptyStats = isNoHistory
        ? '先去查词并保存记录，再回来复习吧。'
        : `本轮完成: ${deckState.wordsCompleted} 个单词`;
    const actionLabel = isNoHistory ? '重新检查' : '继续下一组';

    container.innerHTML = `
        <div class="flashcard-empty">
            <div class="flashcard-empty-icon">${isNoHistory ? '📘' : '🎉'}</div>
            <div class="flashcard-empty-text">${emptyTitle}</div>
            <div class="flashcard-empty-stats">${emptyStats}</div>
            <button class="flashcard-continue-btn menu_button" id="flashcard-continue">
                ${actionLabel}
            </button>
        </div>
    `;

    const continueBtn = document.getElementById('flashcard-continue');
    if (continueBtn) {
        continueBtn.addEventListener('click', handleContinue);
    }

    // 触发完成回调
    if (deckState.onComplete && deckState.wordsCompleted > 0) {
        deckState.onComplete(deckState.wordsCompleted);
    }
    // 清空session并停止定时器
    stopReviewTimer();
    saveSession();
}

/**
 * 渲染卡片视图
 * @param {HTMLElement} container
 */
function renderCardView(container) {
    const card = deckState.deck[deckState.currentIndex];
    const initialDeckSize = deckState.wordsCompleted + deckState.deck.length;
    const progressInfo = deckState.totalWordsInHistory > DECK_SIZE
        ? `本轮 ${initialDeckSize} / 词库 ${deckState.totalWordsInHistory}`
        : `共 ${initialDeckSize} 词`;

    // 获取当前单词的句子
    const sentences = blindState.sentences.get(card.word) || [];
    const sentenceCount = sentences.length;

    // 生成句子播放按钮（更紧凑的样式）
    const playButtons = [0, 1, 2].map((sentenceIndex) => {
        const isReady = Boolean(sentences[sentenceIndex]);
        const isActive = blindState.playingIndex === sentenceIndex;
        return `
            <button class="flashcard-sentence-btn${isActive ? ' active' : ''}"
                    data-sentence-index="${sentenceIndex}"
                    ${isReady ? '' : 'disabled'}>
                <i class="fa-solid fa-volume-high"></i>
            </button>
        `;
    }).join('');

    // 生成句子状态文本
    const sentenceStatus = blindState.loading
        ? `生成中...`
        : (sentenceCount >= 3 ? '' : `${sentenceCount}/3`);

    // 显示句子文本（在正面，当需要显示时）
    const sentenceDisplay = blindState.displayedSentence
        ? `<div class="flashcard-sentence-text">${escapeHtml(blindState.displayedSentence)}</div>`
        : '';

    // 生成实时反馈HTML
    const realtimeFeedbackHtml = generateRealtimeFeedback(blindState.inputValue, card.word);

    container.innerHTML = `
        <div class="flashcard-progress">
            <span>📚 ${progressInfo}</span>
            <div class="flashcard-speed-control">
                <label>语速:</label>
                <select class="form-select" id="flashcard-speed-select">
                    <option value="0.5" ${uiState.ttsSpeed === 0.5 ? 'selected' : ''}>🐌 很慢</option>
                    <option value="0.75" ${uiState.ttsSpeed === 0.75 ? 'selected' : ''}>🚶 慢速</option>
                    <option value="1.0" ${uiState.ttsSpeed === 1.0 ? 'selected' : ''}>⚡ 正常</option>
                    <option value="1.25" ${uiState.ttsSpeed === 1.25 ? 'selected' : ''}>🏃 快速</option>
                    <option value="1.5" ${uiState.ttsSpeed === 1.5 ? 'selected' : ''}>🚀 很快</option>
                    <option value="2.0" ${uiState.ttsSpeed === 2.0 ? 'selected' : ''}>💨 极速</option>
                </select>
            </div>
            <span>✅ ${deckState.progressScore.toFixed(1)} | ${initialDeckSize}</span>
        </div>

        <div class="flashcard-card ${deckState.isFlipped ? 'flipped' : ''}" id="flashcard-main">
            <div class="flashcard-front">
                <div class="flashcard-listen-area">
                    <div class="flashcard-sentence-buttons">
                        ${playButtons}
                        ${sentenceStatus ? `<span class="flashcard-sentence-status">${sentenceStatus}</span>` : ''}
                    </div>
                    ${sentenceDisplay}
                    ${!uiState.showWordOnFront && !blindState.displayedSentence ? '<div class="flashcard-hint">听出三个句中相同的单词</div>' : ''}
                    ${uiState.showWordOnFront ? `<div class="flashcard-word-reveal">${escapeHtml(card.word)}</div>` : ''}
                </div>
            </div>
            <div class="flashcard-back">
                <div class="flashcard-word-small">${escapeHtml(card.word)}</div>
                <div class="flashcard-context">${card.context ? escapeHtml(card.context) : '(无上下文)'}</div>
            </div>
        </div>

        <div class="flashcard-lookup">
            <button class="flashcard-lookup-btn menu_button" id="flashcard-lookup-btn">
                <i class="fa-solid fa-book"></i> 查看释义
            </button>
        </div>

        <div class="flashcard-input-area">
            <button class="flashcard-input-toggle-btn" id="flashcard-input-toggle">
                <i class="fa-solid fa-keyboard"></i>
            </button>
            <div class="flashcard-input-body ${uiState.inputExpanded ? 'expanded' : 'collapsed'}">
                <input type="text" id="flashcard-word-input" placeholder="输入听到的单词"
                       value="${escapeHtml(blindState.inputValue)}"
                       ${deckState.isFlipped ? 'disabled' : ''}>
                <div class="flashcard-realtime-feedback">${realtimeFeedbackHtml}</div>
            </div>
        </div>

        <div class="flashcard-actions">
            ${uiState.showActionButtons ? `
                <button class="flashcard-btn flashcard-btn-forgot" id="flashcard-forgot">
                    <i class="fa-solid fa-xmark"></i>
                    <span>忘了</span>
                </button>
                <button class="flashcard-btn flashcard-btn-delete" id="flashcard-delete" title="永久删除此单词">
                    <i class="fa-solid fa-trash"></i>
                </button>
                <button class="flashcard-btn flashcard-btn-remember" id="flashcard-remember">
                    <i class="fa-solid fa-check"></i>
                    <span>认识${card.correctCount > 0 ? ` (${card.correctCount}/2)` : ''}</span>
                </button>
            ` : `
                <button class="flashcard-btn flashcard-btn-reveal" id="flashcard-reveal-word" title="查看单词">
                    <i class="fa-solid fa-eye"></i>
                </button>
            `}
        </div>

        <audio id="flashcard-audio" preload="auto"></audio>
    `;

    bindCardEvents();
}

/**
 * 绑定卡片事件
 */
function bindCardEvents() {
    // 初始化音频元素
    blindState.audio = document.getElementById('flashcard-audio');

    // 语速选择器
    const speedSelect = document.getElementById('flashcard-speed-select');
    if (speedSelect) {
        speedSelect.addEventListener('change', async (e) => {
            const newSpeed = parseFloat(e.target.value);
            await handleSpeedChange(newSpeed);
        });
    }

    // 输入框折叠/展开按钮
    const inputToggleBtn = document.getElementById('flashcard-input-toggle');
    if (inputToggleBtn) {
        inputToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            uiState.inputExpanded = !uiState.inputExpanded;
            render();
        });
    }

    // 查看单词按钮
    const revealWordBtn = document.getElementById('flashcard-reveal-word');
    if (revealWordBtn) {
        revealWordBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            uiState.showActionButtons = true;
            uiState.showWordOnFront = true;
            render();
        });
    }

    // 点击卡片翻转
    const card = document.getElementById('flashcard-main');
    if (card) {
        card.addEventListener('click', (e) => {
            // 不要在点击按钮时翻转
            if (e.target.closest('.flashcard-sentence-btn')) return;
            deckState.isFlipped = !deckState.isFlipped;
            // 翻转时显示第一个句子和操作按钮
            if (deckState.isFlipped) {
                showDefaultSentence();
                uiState.showActionButtons = true;
            }
            render();
        });
    }

    // 句子播放按钮
    document.querySelectorAll('.flashcard-sentence-btn').forEach((button) => {
        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sentenceIndex = Number(button.dataset.sentenceIndex);
            const currentCard = deckState.deck[deckState.currentIndex];
            const sentences = blindState.sentences.get(currentCard?.word) || [];
            const sentence = sentences[sentenceIndex];
            if (sentence) {
                blindState.lastPlayedIndex = sentenceIndex;
                // 只有在已经显示句子的情况下才更新句子内容
                if (blindState.displayedSentence) {
                    blindState.displayedSentence = sentence;
                    const sentenceTextEl = document.querySelector('.flashcard-sentence-text');
                    if (sentenceTextEl) {
                        sentenceTextEl.textContent = sentence;
                    }
                }
                await playBlindListeningSentence(sentence, sentenceIndex);
            }
        });
    });

    // 查看释义按钮
    const lookupBtn = document.getElementById('flashcard-lookup-btn');
    if (lookupBtn) {
        lookupBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentCard = deckState.deck[deckState.currentIndex];
            if (currentCard) {
                triggerWordLookup(currentCard.word, currentCard.context);
            }
            // 显示第一个句子和操作按钮
            showDefaultSentence();
            uiState.showActionButtons = true;
            render();
        });
    }

    // 单词输入框
    const input = document.getElementById('flashcard-word-input');
    if (input && !deckState.isFlipped) {
        input.addEventListener('input', () => {
            blindState.inputValue = input.value;
            blindState.cursorPosition = input.selectionStart || 0;
            handleWordInputValidation();
        });

        // 只在输入框展开时才聚焦
        if (uiState.inputExpanded) {
            input.focus();
            if (blindState.cursorPosition > 0 && blindState.cursorPosition <= input.value.length) {
                input.setSelectionRange(blindState.cursorPosition, blindState.cursorPosition);
            }
        }
    }

    // 忘了按钮
    const forgotBtn = document.getElementById('flashcard-forgot');
    if (forgotBtn) {
        forgotBtn.addEventListener('click', () => handleAnswer(false));
    }

    // 删除按钮
    const deleteBtn = document.getElementById('flashcard-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDelete());
    }

    // 记住了按钮
    const rememberBtn = document.getElementById('flashcard-remember');
    if (rememberBtn) {
        rememberBtn.addEventListener('click', () => handleAnswer(true));
    }
}
