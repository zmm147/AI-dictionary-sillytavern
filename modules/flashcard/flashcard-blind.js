/**
 * Flashcard - Blind Listening Module
 * 盲听模式功能
 */

import { deckState, blindState, resetBlindState } from './flashcard-state.js';
import { escapeHtml, normalizeAnswer, generateRealtimeFeedback, applyConnectionProfile } from './flashcard-utils.js';
import { prefetchMobileTtsSentences, playSentence, stopPlayback } from './flashcard-tts.js';
import { getDeckState } from './flashcard-deck.js';

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
 * 生成盲听句子的AI提示词
 * @param {string} word
 * @param {string} context
 * @returns {string}
 */
function buildBlindListeningPrompt(word) {
    return [
        `Generate 3 short English sentences using the word "${word}".`,
        'Each sentence should be natural and different.',
        'Only output the sentences, one per line, without numbering or extra text.',
    ].join('\n');
}

/**
 * 解析AI响应中的句子
 * @param {string} response
 * @returns {string[]}
 */
function parseBlindListeningSentences(response) {
    if (!response) return [];
    const cleaned = response.replace(/```[\s\S]*?```/g, '').trim();
    let sentences = [];

    if (cleaned.startsWith('[') || cleaned.startsWith('{')) {
        try {
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) {
                sentences = parsed;
            } else if (Array.isArray(parsed?.sentences)) {
                sentences = parsed.sentences;
            }
        } catch (error) {
            console.warn('[Flashcard] Blind listening JSON parse failed:', error);
        }
    }

    if (!sentences.length) {
        const lines = cleaned.split(/\r?\n/).map((line) => {
            return line.replace(/^[\s*\-•\d.)]+/, '').trim();
        }).filter(Boolean);
        sentences = lines;
    }

    if (sentences.length < 3) {
        const splitSentences = cleaned
            .replace(/([.!?])\s+/g, '$1|')
            .split('|')
            .map((line) => line.trim());
        sentences = sentences.concat(splitSentences).filter(Boolean);
    }

    return sentences
        .map((sentence) => String(sentence).trim())
        .filter(Boolean)
        .slice(0, 3);
}

/**
 * 生成盲听句子
 * @param {string} word
 * @param {string} context
 * @returns {Promise<string[]>}
 */
export async function generateBlindListeningSentences(word, context) {
    const contextObj = window.SillyTavern?.getContext?.();
    const generateRaw = contextObj?.generateRaw;
    if (!generateRaw) {
        throw new Error('generateRaw not available');
    }

    const settings = window.aiDictionary?.settings || {};
    const prompt = buildBlindListeningPrompt(word);
    const response = await generateRaw({
        prompt,
        systemPrompt: settings.systemPrompt || 'You are a professional English teacher.',
    });

    const sentences = parseBlindListeningSentences(response);
    if (!sentences.length) {
        throw new Error('empty sentences');
    }
    return sentences;
}

/**
 * 获取当前盲听卡片
 * @returns {{word: string, context: string} | null}
 */
export function getBlindListeningCard() {
    return blindState.deck[blindState.index] || null;
}

/**
 * 获取单词的盲听句子
 * @param {string} word
 * @returns {string[]}
 */
export function getBlindListeningSentences(word) {
    if (!word) return [];
    return blindState.sentences.get(word) || [];
}

/**
 * 进入盲听模式
 */
export function startBlindListening() {
    if (!deckState.deck.length) {
        alert('没有可盲听的单词！请先开始背单词。');
        return;
    }

    blindState.active = true;
    blindState.deck = deckState.deck.map((card) => ({
        word: card.word,
        context: card.context || '',
    }));
    blindState.index = 0;
    blindState.sentences = new Map();
    blindState.loadProgress = { total: blindState.deck.length, completed: 0 };
    blindState.loading = false;
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
    stopPlayback();
    render();
    prepareBlindListeningData();
}

/**
 * 设置当前盲听索引
 * @param {number} nextIndex
 */
export function setBlindListeningIndex(nextIndex) {
    if (nextIndex < 0 || nextIndex >= blindState.deck.length) {
        return;
    }
    blindState.index = nextIndex;
    blindState.inputExpanded = false;
    blindState.revealAnswer = false;
    blindState.feedback = '';
    blindState.inputValue = '';
    blindState.statusMessage = '';
    blindState.autoPlayedIndex = null;
    blindState.displayedSentence = '';
    blindState.lastPlayedIndex = -1;
    blindState.playingIndex = -1;
    blindState.cursorPosition = 0;
    stopPlayback();
    render();
}

/**
 * 处理实时验证
 */
export function handleRealtimeValidation() {
    const currentCard = getBlindListeningCard();
    if (!currentCard) return;

    const normalizedInput = normalizeAnswer(blindState.inputValue);
    const normalizedWord = normalizeAnswer(currentCard.word);

    // 检查是否完全正确
    if (normalizedInput && normalizedInput === normalizedWord) {
        // 输入完全正确，自动揭示答案
        revealAnswerWithSentence();
    } else {
        // 只更新反馈区域，不重新渲染整个界面
        const feedbackContainer = document.querySelector('.flashcard-blind-realtime-feedback');
        if (feedbackContainer) {
            feedbackContainer.innerHTML = generateRealtimeFeedback(blindState.inputValue, currentCard.word);
        }
    }
}

/**
 * 揭示答案并显示句子
 */
export function revealAnswerWithSentence() {
    blindState.revealAnswer = true;

    const currentCard = getBlindListeningCard();
    const sentences = getBlindListeningSentences(currentCard?.word);

    // 如果有播放过的句子，显示它；否则显示第一个句子
    if (blindState.lastPlayedIndex >= 0 && sentences[blindState.lastPlayedIndex]) {
        blindState.displayedSentence = sentences[blindState.lastPlayedIndex];
    } else if (sentences.length > 0) {
        blindState.displayedSentence = sentences[0];
        blindState.lastPlayedIndex = 0;
    }

    render();
}

/**
 * 准备盲听数据
 * @returns {Promise<void>}
 */
async function prepareBlindListeningData() {
    if (blindState.loading || !blindState.deck.length) {
        return;
    }

    const generationToken = ++blindState.generationToken;
    blindState.loading = true;
    blindState.statusMessage = '';
    blindState.loadProgress = { total: blindState.deck.length, completed: 0 };
    render();

    const settings = window.aiDictionary?.settings;
    const restoreProfile = await applyConnectionProfile(settings?.connectionProfile || '');

    try {
        for (const card of blindState.deck) {
            if (generationToken !== blindState.generationToken || !blindState.active) {
                return;
            }

            if (!blindState.sentences.has(card.word)) {
                try {
                    const sentences = await generateBlindListeningSentences(card.word, card.context);
                    blindState.sentences.set(card.word, sentences);
                    await prefetchMobileTtsSentences(sentences, card.word);
                } catch (error) {
                    console.error('[Flashcard] Blind listening sentence error:', error);
                    blindState.statusMessage = '句子生成失败，请稍后重试';
                }
            }

            blindState.loadProgress.completed += 1;
            const activeCard = getBlindListeningCard();
            if (!blindState.audio || blindState.audio.paused || activeCard?.word === card.word) {
                render();
            }
        }
    } finally {
        await restoreProfile();
        blindState.loading = false;
        if (!blindState.audio || blindState.audio.paused) {
            render();
        }
    }
}

/**
 * 播放盲听句子
 * @param {string} sentence
 * @param {number} sentenceIndex
 * @returns {Promise<void>}
 */
export async function playBlindListeningSentence(sentence, sentenceIndex) {
    await playSentence(sentence, sentenceIndex, null, getDeckState);
}

/**
 * 渲染盲听视图
 * @param {HTMLElement} container
 */
export function renderBlindListeningView(container) {
    if (!blindState.deck.length) {
        container.innerHTML = `
            <div class="flashcard-empty">
                <div class="flashcard-empty-icon">🎧</div>
                <div class="flashcard-empty-text">没有可盲听的单词</div>
                <button class="flashcard-continue-btn menu_button" id="blind-exit-empty">
                    返回背单词
                </button>
            </div>
        `;
        document.getElementById('blind-exit-empty')?.addEventListener('click', () => {
            resetBlindState();
            stopPlayback();
            render();
        });
        return;
    }

    const currentCard = getBlindListeningCard();
    const sentences = getBlindListeningSentences(currentCard?.word);
    const sentenceCount = sentences.length;
    const progressText = `${blindState.index + 1}/${blindState.deck.length}`;
    const generationText = blindState.loading
        ? `句子 ${blindState.loadProgress.completed}/${blindState.loadProgress.total}`
        : `句子 ${Math.min(sentenceCount, 3)}/3`;
    const statusMessage = blindState.statusMessage
        || (blindState.loading ? '正在生成盲听句子...' : (sentenceCount ? '句子已就绪' : '句子准备中'));

    // 生成播放按钮
    const playButtons = [0, 1, 2].map((sentenceIndex) => {
        const isReady = Boolean(sentences[sentenceIndex]);
        const isActive = blindState.playingIndex === sentenceIndex;
        return `
            <button class="flashcard-blind-play-btn menu_button${isActive ? ' active' : ''}"
                    data-sentence-index="${sentenceIndex}"
                    ${isReady ? '' : 'disabled'}>
                句子 ${sentenceIndex + 1}
            </button>
        `;
    }).join('');

    // 显示句子文本区域（当答案已揭示时）
    const sentenceDisplay = blindState.displayedSentence
        ? `<div class="flashcard-blind-sentence-text">${escapeHtml(blindState.displayedSentence)}</div>`
        : '';

    const answerText = blindState.revealAnswer && currentCard
        ? escapeHtml(currentCard.word)
        : '';

    // 生成实时反馈HTML
    const realtimeFeedbackHtml = generateRealtimeFeedback(blindState.inputValue, currentCard?.word || '');

    container.innerHTML = `
        <div class="flashcard-blind">
            <div class="flashcard-progress">
                <span>🎧 盲听 ${progressText}</span>
                <span>${generationText}</span>
            </div>

            <div class="flashcard-blind-status">${escapeHtml(statusMessage)}</div>

            <div class="flashcard-blind-audio">
                ${playButtons}
            </div>
            ${sentenceDisplay}

            <div class="flashcard-blind-answer">
                <button class="menu_button flashcard-blind-reveal" id="blind-reveal-answer">
                    查看答案
                </button>
                <div class="flashcard-blind-answer-text${blindState.revealAnswer ? '' : ' hidden'}">
                    ${answerText}
                </div>
            </div>

            <div class="flashcard-blind-input">
                <div class="flashcard-blind-input-body expanded">
                    <input type="text" id="blind-answer-input" placeholder="输入听到的单词"
                           value="${escapeHtml(blindState.inputValue)}">
                </div>
                <div class="flashcard-blind-realtime-feedback">${realtimeFeedbackHtml}</div>
            </div>

            <div class="flashcard-blind-controls">
                <button class="menu_button" id="blind-prev" ${blindState.index === 0 ? 'disabled' : ''}>
                    上一词
                </button>
                <button class="menu_button" id="blind-next" ${blindState.index >= blindState.deck.length - 1 ? 'disabled' : ''}>
                    下一词
                </button>
                <button class="menu_button" id="blind-exit">返回背单词</button>
            </div>
            <audio id="flashcard-blind-audio" preload="auto"></audio>
        </div>
    `;

    bindBlindListeningEvents();
}

/**
 * 绑定盲听事件
 */
function bindBlindListeningEvents() {
    blindState.audio = document.getElementById('flashcard-blind-audio');

    document.querySelectorAll('.flashcard-blind-play-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            const sentenceIndex = Number(button.dataset.sentenceIndex);
            const currentCard = getBlindListeningCard();
            const sentences = getBlindListeningSentences(currentCard?.word);
            const sentence = sentences[sentenceIndex];
            if (sentence) {
                blindState.lastPlayedIndex = sentenceIndex;
                // 如果答案已揭示，显示句子文本
                if (blindState.revealAnswer) {
                    blindState.displayedSentence = sentence;
                    render();
                }
                await playBlindListeningSentence(sentence, sentenceIndex);
            }
        });
    });

    document.getElementById('blind-prev')?.addEventListener('click', () => {
        setBlindListeningIndex(blindState.index - 1);
    });

    document.getElementById('blind-next')?.addEventListener('click', () => {
        setBlindListeningIndex(blindState.index + 1);
    });

    document.getElementById('blind-exit')?.addEventListener('click', () => {
        resetBlindState();
        stopPlayback();
        render();
    });

    const input = document.getElementById('blind-answer-input');
    if (input) {
        input.addEventListener('input', () => {
            blindState.inputValue = input.value;
            blindState.cursorPosition = input.selectionStart || 0;
            handleRealtimeValidation();
        });

        // 恢复光标位置
        input.focus();
        if (blindState.cursorPosition > 0 && blindState.cursorPosition <= input.value.length) {
            input.setSelectionRange(blindState.cursorPosition, blindState.cursorPosition);
        }
    }

    document.getElementById('blind-reveal-answer')?.addEventListener('click', () => {
        revealAnswerWithSentence();
    });
}
