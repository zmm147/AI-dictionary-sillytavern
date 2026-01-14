/**
 * AI Dictionary Flashcard - 背单词卡片
 * 背单词加速作物收获！
 * 支持进度保存和SM-2算法
 */

console.log('[Flashcard] Script loading...');

const Flashcard = (() => {
    // 配置
    const DECK_SIZE = 20; // 每组单词数量
    const REVIEW_INTERVAL = 5 * 60 * 1000; // 每隔5分钟复习一次

    // 状态
    let deck = [];           // 当前牌组 [{ word, context, correctCount }]
    let totalWordsInHistory = 0; // 词库总单词数
    let currentIndex = 0;    // 当前卡片索引
    let isFlipped = false;   // 是否翻转显示背面
    let wordsCompleted = 0;  // 本轮完成的单词数
    let progressScore = 0;   // 进度分数（每次认识+0.5，忘了-0.5）
    let onComplete = null;   // 完成回调
    let lastReviewTime = 0;  // 上次复习时间
    let reviewTimer = null;  // 复习定时器

    let blindListeningActive = false;
    let blindListeningDeck = [];
    let blindListeningIndex = 0;
    let blindListeningSentences = new Map();
    let blindListeningLoading = false;
    let blindListeningLoadProgress = { total: 0, completed: 0 };
    let blindListeningInputExpanded = false;
    let blindListeningRevealAnswer = false;
    let blindListeningFeedback = '';
    let blindListeningInputValue = '';
    let blindListeningStatusMessage = '';
    let ttsStatusMessage = '';
    let blindListeningAutoPlayedIndex = null;
    let blindListeningAudio = null;
    let blindListeningPlaybackToken = 0;
    let blindListeningGenerationToken = 0;
    let mobileTtsCache = new Map();
    let mobileTtsBufferCache = new Map();
    let iosAudioContext = null;
    let iosAudioSource = null;
    let blindListeningPlayingIndex = -1;
    let inputExpanded = false;
    let showActionButtons = false;
    let showWordOnFront = false;
    let ttsSpeed = parseFloat(localStorage.getItem('flashcard_tts_speed')) || 1.0;

    const MOBILE_TTS_ENDPOINT = 'https://tts.wangwangit.com/v1/audio/speech';
    const MOBILE_TTS_VOICE = 'en-US-JennyNeural';
    let blindListeningDisplayedSentence = '';  // 显示在音频区域的句子文本
    let blindListeningLastPlayedIndex = -1;    // 最后播放的句子索引
    let blindListeningCursorPosition = 0;      // 输入框光标位置

    /**
     * 生成新的均衡牌组（新词+复习词）
     */
    function generateNewDeck() {
        let historyData = null;

        if (window.aiDictionary && typeof window.aiDictionary.getWordHistory === 'function') {
            historyData = window.aiDictionary.getWordHistory();
        }

        if (!historyData || Object.keys(historyData).length === 0) {
            totalWordsInHistory = 0;
            return [];
        }

        totalWordsInHistory = Object.keys(historyData).length;

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
    async function saveSession() {
        if (!window.aiDictionary || !window.aiDictionary.flashcard ||
            !window.aiDictionary.flashcard.saveCurrentSession) {
            return;
        }

        const session = deck.length > 0 ? {
            deck: deck,
            currentIndex: currentIndex,
            wordsCompleted: wordsCompleted,
            progressScore: progressScore,
            lastReviewTime: lastReviewTime,
            totalWordsInHistory: totalWordsInHistory
        } : null;

        await window.aiDictionary.flashcard.saveCurrentSession(session);
    }

    /**
     * 开始背单词
     * @param {Function} completeCallback - 完成时的回调，传入完成的单词数
     */
    async function start(completeCallback) {
        onComplete = completeCallback;
        resetBlindListeningState();

        // 检查是否有保存的session，直接恢复
        let hasSession = false;
        if (window.aiDictionary && window.aiDictionary.flashcard &&
            window.aiDictionary.flashcard.getCurrentSession) {
            const savedSession = window.aiDictionary.flashcard.getCurrentSession();

            if (savedSession && savedSession.deck && savedSession.deck.length > 0) {
                // 直接恢复session，不询问
                deck = savedSession.deck;
                currentIndex = savedSession.currentIndex || 0;
                wordsCompleted = savedSession.wordsCompleted || 0;
                progressScore = Math.max(0, savedSession.progressScore ?? 0);
                lastReviewTime = savedSession.lastReviewTime || Date.now();
                totalWordsInHistory = savedSession.totalWordsInHistory || 0;
                hasSession = true;
                console.log(`[Flashcard] 恢复上次进度: 剩余 ${deck.length} 词, 已完成 ${wordsCompleted} 词, 进度分数 ${progressScore}`);
            }
        }

        // 如果没有session，生成新牌组
        if (!hasSession) {
            deck = generateNewDeck();
            currentIndex = 0;
            isFlipped = false;
            wordsCompleted = 0;
            progressScore = 0;
            lastReviewTime = Date.now();
        }

        const hasDeck = deck.length > 0;

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
     * 渲染卡片界面
     */
    function render() {
        const container = document.getElementById('flashcard-container');
        if (!container) return;

        if (deck.length === 0) {
            const isNoHistory = totalWordsInHistory === 0;
            const emptyTitle = isNoHistory ? '还没有可复习的单词' : '太棒了！所有单词都复习完了！';
            const emptyStats = isNoHistory
                ? '先去查词并保存记录，再回来复习吧。'
                : `本轮完成: ${wordsCompleted} 个单词`;
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
                continueBtn.addEventListener('click', async () => {
                    wordsCompleted = 0;
                    deck = generateNewDeck();
                    currentIndex = 0;
                    isFlipped = false;
                    progressScore = 0;
                    lastReviewTime = Date.now();
                    blindListeningInputValue = '';
                    blindListeningCursorPosition = 0;
                    blindListeningDisplayedSentence = '';
                    blindListeningLastPlayedIndex = -1;
                    blindListeningPlayingIndex = -1;
                    const hasNewDeck = deck.length > 0;
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
                });
            }

            // 触发完成回调
            if (onComplete && wordsCompleted > 0) {
                onComplete(wordsCompleted);
            }
            // 清空session并停止定时器
            stopReviewTimer();
            saveSession();
            return;
        }

        const card = deck[currentIndex];
        const initialDeckSize = wordsCompleted + deck.length;
        const progressInfo = totalWordsInHistory > DECK_SIZE
            ? `本轮 ${initialDeckSize} / 词库 ${totalWordsInHistory}`
            : `共 ${initialDeckSize} 词`;

        // 获取当前单词的句子
        const sentences = blindListeningSentences.get(card.word) || [];
        const sentenceCount = sentences.length;

        // 生成句子播放按钮（更紧凑的样式）
        const playButtons = [0, 1, 2].map((sentenceIndex) => {
            const isReady = Boolean(sentences[sentenceIndex]);
            const isActive = blindListeningPlayingIndex === sentenceIndex;
            return `
                <button class="flashcard-sentence-btn${isActive ? ' active' : ''}"
                        data-sentence-index="${sentenceIndex}"
                        ${isReady ? '' : 'disabled'}>
                    <i class="fa-solid fa-volume-high"></i>
                </button>
            `;
        }).join('');

        // 生成句子状态文本
        const sentenceStatus = blindListeningLoading
            ? `生成中...`
            : (sentenceCount >= 3 ? '' : `${sentenceCount}/3`);

        // 显示句子文本（在正面，当需要显示时）
        const sentenceDisplay = blindListeningDisplayedSentence
            ? `<div class="flashcard-sentence-text">${escapeHtml(blindListeningDisplayedSentence)}</div>`
            : '';

        // 生成实时反馈HTML
        const realtimeFeedbackHtml = generateRealtimeFeedback(blindListeningInputValue, card.word);

        container.innerHTML = `
            <div class="flashcard-progress">
                <span>📚 ${progressInfo}</span>
                <div class="flashcard-speed-control">
                    <label>语速:</label>
                    <select class="form-select" id="flashcard-speed-select">
                        <option value="0.5" ${ttsSpeed === 0.5 ? 'selected' : ''}>🐌 很慢</option>
                        <option value="0.75" ${ttsSpeed === 0.75 ? 'selected' : ''}>🚶 慢速</option>
                        <option value="1.0" ${ttsSpeed === 1.0 ? 'selected' : ''}>⚡ 正常</option>
                        <option value="1.25" ${ttsSpeed === 1.25 ? 'selected' : ''}>🏃 快速</option>
                        <option value="1.5" ${ttsSpeed === 1.5 ? 'selected' : ''}>🚀 很快</option>
                        <option value="2.0" ${ttsSpeed === 2.0 ? 'selected' : ''}>💨 极速</option>
                    </select>
                </div>
                <span>✅ ${progressScore.toFixed(1)} | ${initialDeckSize}</span>
            </div>

            <div class="flashcard-card ${isFlipped ? 'flipped' : ''}" id="flashcard-main">
                <div class="flashcard-front">
                    <div class="flashcard-listen-area">
                        <div class="flashcard-sentence-buttons">
                            ${playButtons}
                            ${sentenceStatus ? `<span class="flashcard-sentence-status">${sentenceStatus}</span>` : ''}
                        </div>
                        ${sentenceDisplay}
                        ${!showWordOnFront && !blindListeningDisplayedSentence ? '<div class="flashcard-hint">听出三个句中相同的单词</div>' : ''}
                        ${showWordOnFront ? `<div class="flashcard-word-reveal">${escapeHtml(card.word)}</div>` : ''}
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
                <div class="flashcard-input-body ${inputExpanded ? 'expanded' : 'collapsed'}">
                    <input type="text" id="flashcard-word-input" placeholder="输入听到的单词"
                           value="${escapeHtml(blindListeningInputValue)}"
                           ${isFlipped ? 'disabled' : ''}>
                    <div class="flashcard-realtime-feedback">${realtimeFeedbackHtml}</div>
                </div>
            </div>

            <div class="flashcard-actions">
                ${showActionButtons ? `
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
                    <button class="flashcard-btn flashcard-btn-reveal" id="flashcard-reveal-word">
                        <i class="fa-solid fa-eye"></i>
                        <span>查看单词</span>
                    </button>
                `}
            </div>

            <audio id="flashcard-audio" preload="auto"></audio>
        `;

        bindCardEvents();
    }

    /**
     * Detect iOS devices (including iPadOS).
     * @returns {boolean}
     */
    function isIosDevice() {
        const ua = navigator.userAgent || '';
        return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
    }

    /**
     * Update TTS status text in UI.
     * @param {string} message
     */
    function setTtsStatusMessage(message) {
        ttsStatusMessage = message || '';
        const statusEl = document.getElementById('flashcard-tts-status');
        if (statusEl) {
            statusEl.textContent = ttsStatusMessage;
        }
    }

    /**
     * Get audio URL from mobile TTS endpoint with cache.
     * @param {string} text
     * @param {string} cacheKey
     * @returns {Promise<string>}
     */
    async function getMobileTtsAudioUrl(text, cacheKey) {
        const key = cacheKey || text;
        if (mobileTtsCache.has(key)) {
            return mobileTtsCache.get(key);
        }

        const requestBody = JSON.stringify({
            input: text,
            voice: MOBILE_TTS_VOICE,
            speed: ttsSpeed,
            pitch: '0',
            style: 'general'
        });

        const response = await fetch(MOBILE_TTS_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: requestBody
        });

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
            let errorText = '';
            try {
                errorText = (await response.text()).trim();
            } catch {}
            const detail = errorText ? `: ${errorText.slice(0, 120)}` : '';
            throw new Error(`mobile_tts_http_${response.status}${detail}`);
        }

        const isAudio = contentType.includes('audio')
            || contentType.includes('octet-stream')
            || contentType.includes('application/octet-stream');
        if (!isAudio) {
            let errorText = '';
            try {
                errorText = (await response.text()).trim();
            } catch {}
            const detail = errorText ? `: ${errorText.slice(0, 120)}` : '';
            throw new Error(`mobile_tts_bad_content_${contentType || 'unknown'}${detail}`);
        }

        const audioBlob = await response.blob();
        const buffer = await audioBlob.arrayBuffer();
        const url = URL.createObjectURL(audioBlob);
        mobileTtsCache.set(key, url);
        mobileTtsBufferCache.set(key, buffer);
        return url;
    }

    /**
     * Prefetch mobile TTS audio for all platforms.
     * @param {string[]} sentences
     * @param {string} cachePrefix
     * @returns {Promise<void>}
     */
    async function prefetchMobileTtsSentences(sentences, cachePrefix) {
        const tasks = sentences.slice(0, 3).map((sentence, index) => {
            const key = `${cachePrefix}-${index}`;
            return getMobileTtsAudioUrl(sentence, key).catch(() => {});
        });
        await Promise.allSettled(tasks);
    }

    /**
     * Play audio from a blob URL.
     * @param {HTMLAudioElement} audioElement
     * @param {string} url
     * @returns {Promise<void>}
     */
    async function playAudioFromUrl(audioElement, url) {
        // 先停止当前播放
        audioElement.pause();
        audioElement.currentTime = 0;

        // 设置新的音频源
        audioElement.src = url;
        audioElement.setAttribute('playsinline', '');
        audioElement.playsInline = true;

        // 等待音频加载完成
        await new Promise((resolve, reject) => {
            const onCanPlay = () => {
                audioElement.removeEventListener('canplaythrough', onCanPlay);
                audioElement.removeEventListener('error', onError);
                resolve();
            };
            const onError = (e) => {
                audioElement.removeEventListener('canplaythrough', onCanPlay);
                audioElement.removeEventListener('error', onError);
                reject(new Error('Audio load failed'));
            };
            audioElement.addEventListener('canplaythrough', onCanPlay, { once: true });
            audioElement.addEventListener('error', onError, { once: true });
            audioElement.load();
        });

        // 播放音频
        await audioElement.play();
    }

    /**
     * Update active playback button state without re-rendering.
     * @param {number} nextIndex
     */
    function setBlindListeningPlayingIndex(nextIndex) {
        blindListeningPlayingIndex = nextIndex;
        document.querySelectorAll('.flashcard-sentence-btn').forEach((button) => {
            const index = Number(button.dataset.sentenceIndex);
            button.classList.toggle('active', index === nextIndex);
        });
        document.querySelectorAll('.flashcard-blind-play-btn').forEach((button) => {
            const index = Number(button.dataset.sentenceIndex);
            button.classList.toggle('active', index === nextIndex);
        });
    }

    /**
     * Ensure iOS AudioContext is created and running.
     * @returns {Promise<AudioContext>}
     */
    async function ensureIosAudioContext() {
        if (!iosAudioContext) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                throw new Error('audio_context_not_available');
            }
            iosAudioContext = new AudioContextClass();
        }
        if (iosAudioContext.state === 'suspended') {
            await iosAudioContext.resume();
        }
        return iosAudioContext;
    }

    /**
     * Play audio via Web Audio on iOS to avoid HTMLAudioElement aborts.
     * @param {ArrayBuffer} buffer
     * @returns {Promise<void>}
     */
    async function playMobileTtsWithWebAudio(buffer) {
        const context = await ensureIosAudioContext();
        if (iosAudioSource) {
            try {
                iosAudioSource.stop();
            } catch {}
            iosAudioSource = null;
        }
        const decoded = await context.decodeAudioData(buffer.slice(0));
        const source = context.createBufferSource();
        source.buffer = decoded;
        source.connect(context.destination);
        iosAudioSource = source;
        return new Promise((resolve, reject) => {
            source.onended = () => {
                if (iosAudioSource === source) {
                    iosAudioSource = null;
                }
                resolve();
            };
            try {
                source.start(0);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Play text using mobile TTS endpoint.
     * @param {HTMLAudioElement} audioElement
     * @param {string} text
     * @param {string} cacheKey
     * @returns {Promise<void>}
     */
    async function playMobileTts(audioElement, text, cacheKey) {
        let url = '';
        try {
            url = await getMobileTtsAudioUrl(text, cacheKey);
        } catch (error) {
            const detail = String(error?.message || error || '');
            throw new Error(`mobile_tts_fetch_failed: ${detail}`);
        }

        try {
            await playAudioFromUrl(audioElement, url);
        } catch (error) {
            const detail = String(error?.message || error || '');
            throw new Error(`mobile_tts_play_failed: ${detail}`);
        }
    }

    /**
     * 重新生成当前卡片和后续2个卡片的音频（语速改变时调用）
     */
    async function regenerateAudioForCurrentAndUpcoming() {
        if (!deck.length) return;

        // 收集需要重新生成音频的卡片（当前卡片 + 后续2个非复习卡片）
        const cardsToRegenerate = [];

        // 当前卡片
        const currentCard = deck[currentIndex];
        if (currentCard && blindListeningSentences.has(currentCard.word)) {
            cardsToRegenerate.push(currentCard);
        }

        // 后续2个非复习卡片
        let count = 0;
        let searchIndex = 1;
        while (count < 2 && searchIndex < deck.length) {
            const nextIndex = (currentIndex + searchIndex) % deck.length;
            const nextCard = deck[nextIndex];
            searchIndex++;

            if (!nextCard) continue;
            if (nextCard.isReviewCard) continue;
            if (!blindListeningSentences.has(nextCard.word)) continue;

            cardsToRegenerate.push(nextCard);
            count++;
        }

        // 重新生成音频
        for (const card of cardsToRegenerate) {
            const sentences = blindListeningSentences.get(card.word);
            if (sentences && sentences.length > 0) {
                await prefetchMobileTtsSentences(sentences, card.word);
                console.log(`[Flashcard] Regenerated audio for: ${card.word}`);
            }
        }
    }

    /**
     * 绑定卡片事件
     */
    function bindCardEvents() {
        // 初始化音频元素
        blindListeningAudio = document.getElementById('flashcard-audio');

        // 语速选择器
        const speedSelect = document.getElementById('flashcard-speed-select');
        if (speedSelect) {
            speedSelect.addEventListener('change', async (e) => {
                const newSpeed = parseFloat(e.target.value);
                if (newSpeed !== ttsSpeed) {
                    ttsSpeed = newSpeed;
                    // 保存到localStorage
                    localStorage.setItem('flashcard_tts_speed', ttsSpeed.toString());
                    // 清除所有音频缓存，强制重新生成
                    mobileTtsCache.clear();
                    mobileTtsBufferCache.clear();
                    // 重新生成当前卡片和后续卡片的音频
                    await regenerateAudioForCurrentAndUpcoming();
                }
            });
        }

        // 输入框折叠/展开按钮
        const inputToggleBtn = document.getElementById('flashcard-input-toggle');
        if (inputToggleBtn) {
            inputToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                inputExpanded = !inputExpanded;
                render();
            });
        }

        // 查看单词按钮
        const revealWordBtn = document.getElementById('flashcard-reveal-word');
        if (revealWordBtn) {
            revealWordBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showActionButtons = true;
                showWordOnFront = true;
                render();
            });
        }

        // 点击卡片翻转
        const card = document.getElementById('flashcard-main');
        if (card) {
            card.addEventListener('click', (e) => {
                // 不要在点击按钮时翻转
                if (e.target.closest('.flashcard-sentence-btn')) return;
                isFlipped = !isFlipped;
                // 翻转时显示第一个句子和操作按钮
                if (isFlipped) {
                    showDefaultSentence();
                    showActionButtons = true;
                }
                render();
            });
        }

        // 句子播放按钮
        document.querySelectorAll('.flashcard-sentence-btn').forEach((button) => {
            button.addEventListener('click', async (e) => {
                e.stopPropagation();
                const sentenceIndex = Number(button.dataset.sentenceIndex);
                const currentCard = deck[currentIndex];
                const sentences = blindListeningSentences.get(currentCard?.word) || [];
                const sentence = sentences[sentenceIndex];
                if (sentence) {
                    blindListeningLastPlayedIndex = sentenceIndex;
                    // 只有在已经显示句子的情况下才更新句子内容
                    if (blindListeningDisplayedSentence) {
                        blindListeningDisplayedSentence = sentence;
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
                const currentCard = deck[currentIndex];
                if (currentCard && typeof triggerWordLookup === 'function') {
                    triggerWordLookup(currentCard.word, currentCard.context);
                }
                // 显示第一个句子和操作按钮
                showDefaultSentence();
                showActionButtons = true;
                render();
            });
        }

        // 单词输入框
        const input = document.getElementById('flashcard-word-input');
        if (input && !isFlipped) {
            input.addEventListener('input', () => {
                blindListeningInputValue = input.value;
                blindListeningCursorPosition = input.selectionStart || 0;
                handleWordInputValidation();
            });

            // 只在输入框展开时才聚焦
            if (inputExpanded) {
                input.focus();
                if (blindListeningCursorPosition > 0 && blindListeningCursorPosition <= input.value.length) {
                    input.setSelectionRange(blindListeningCursorPosition, blindListeningCursorPosition);
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

    /**
     * 显示默认句子（第一个句子）
     */
    function showDefaultSentence() {
        const currentCard = deck[currentIndex];
        if (!currentCard) return;
        const sentences = blindListeningSentences.get(currentCard.word) || [];
        if (sentences.length > 0) {
            const idx = blindListeningLastPlayedIndex >= 0 ? blindListeningLastPlayedIndex : 0;
            blindListeningDisplayedSentence = sentences[idx] || sentences[0];
            if (blindListeningLastPlayedIndex < 0) {
                blindListeningLastPlayedIndex = 0;
            }
        }
    }

    /**
     * 处理单词输入验证
     */
    function handleWordInputValidation() {
        const currentCard = deck[currentIndex];
        if (!currentCard) return;

        const normalizedInput = normalizeAnswer(blindListeningInputValue);
        const normalizedWord = normalizeAnswer(currentCard.word);

        // 检查是否完全正确
        if (normalizedInput && normalizedInput === normalizedWord) {
            // 输入完全正确，显示句子、翻转卡片并显示操作按钮
            isFlipped = true;
            showDefaultSentence();
            showActionButtons = true;
            render();
        } else {
            // 只更新反馈区域，不重新渲染整个界面
            const feedbackContainer = document.querySelector('.flashcard-realtime-feedback');
            if (feedbackContainer) {
                feedbackContainer.innerHTML = generateRealtimeFeedback(blindListeningInputValue, currentCard.word);
            }
        }
    }

    /**
     * 处理回答
     * @param {boolean} remembered - 是否记住了
     */
    async function handleAnswer(remembered) {
        const card = deck[currentIndex];
        const wasLastCard = currentIndex === deck.length - 1;
        let cardMovedToBottom = false; // 标记当前卡是否被移到了底部

        // 清除复习卡片标记
        if (card.isReviewCard) {
            delete card.isReviewCard;
        }

        if (remembered) {
            progressScore += 0.5;
        } else if (card.correctCount > 0) {
            // 如果之前已经点过认识，才扣分
            progressScore = Math.max(0, progressScore - 0.5);
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
                deck.splice(currentIndex, 1);
                wordsCompleted++;
                // 索引不变（因为后面的卡片前移了）
                if (currentIndex >= deck.length) {
                    currentIndex = 0;
                }
            } else {
                // 记住1次，放到牌组底部
                deck.splice(currentIndex, 1);
                deck.push(card);
                cardMovedToBottom = true;
                if (wasLastCard) {
                    currentIndex = 0;
                }
                if (currentIndex >= deck.length) {
                    currentIndex = 0;
                }
            }
        } else {
            // 没记住，重置计数，放到牌组底部
            card.correctCount = 0;
            deck.splice(currentIndex, 1);
            deck.push(card);
            cardMovedToBottom = true;
            if (wasLastCard) {
                currentIndex = 0;
            }
            if (currentIndex >= deck.length) {
                currentIndex = 0;
            }
        }

        // 重置翻转状态和输入状态
        isFlipped = false;
        blindListeningInputValue = '';
        blindListeningCursorPosition = 0;
        blindListeningDisplayedSentence = '';
        blindListeningLastPlayedIndex = -1;
        blindListeningPlayingIndex = -1;
        inputExpanded = false;
        showActionButtons = false;
        showWordOnFront = false;

        // 保存session
        await saveSession();

        render();

        // 为新卡片准备句子
        prepareCurrentCardSentences();
    }

    /**
     * 处理删除单词
     */
    async function handleDelete() {
        const card = deck[currentIndex];

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
            progressScore = Math.max(0, progressScore - card.correctCount * 0.5);
        }

        // 从牌组中移除
        deck.splice(currentIndex, 1);

        // 调整索引
        if (currentIndex >= deck.length) {
            currentIndex = 0;
        }

        // 保存session
        await saveSession();

        // 重置翻转状态和输入状态
        isFlipped = false;
        blindListeningInputValue = '';
        blindListeningCursorPosition = 0;
        blindListeningDisplayedSentence = '';
        blindListeningLastPlayedIndex = -1;
        blindListeningPlayingIndex = -1;
        inputExpanded = false;
        showActionButtons = false;
        showWordOnFront = false;
        render();

        // 为新卡片准备句子
        prepareCurrentCardSentences();
    }

    /**
     * 为当前卡片准备句子（如果尚未生成）
     */
    async function prepareCurrentCardSentences() {
        if (!deck.length) return;

        const currentCard = deck[currentIndex];
        if (!currentCard) return;

        // 如果已经有句子，只预加载不自动播放
        if (blindListeningSentences.has(currentCard.word)) {
            const sentences = blindListeningSentences.get(currentCard.word);
            if (sentences && sentences.length > 0) {
                await prefetchMobileTtsSentences(sentences, currentCard.word);
                blindListeningLastPlayedIndex = 0;
                render();
            }
            // 预生成接下来的卡片
            prefetchUpcomingCards();
            return;
        }

        const generationToken = ++blindListeningGenerationToken;
        blindListeningLoading = true;
        blindListeningLoadProgress = { total: 1, completed: 0 };
        render();

        const settings = window.aiDictionary?.settings;
        const restoreProfile = await applyConnectionProfile(settings?.connectionProfile || '');

        try {
            if (generationToken !== blindListeningGenerationToken) return;

            const sentences = await generateBlindListeningSentences(currentCard.word, currentCard.context);
            blindListeningSentences.set(currentCard.word, sentences);
            await prefetchMobileTtsSentences(sentences, currentCard.word);
            blindListeningLoadProgress.completed = 1;

            // 句子生成完成后只渲染，不自动播放
            if (generationToken === blindListeningGenerationToken && sentences.length > 0) {
                blindListeningLastPlayedIndex = 0;
                blindListeningLoading = false;
                render();
            }
        } catch (error) {
            console.error('[Flashcard] Sentence generation error:', error);
        } finally {
            await restoreProfile();
            blindListeningLoading = false;
            if (generationToken === blindListeningGenerationToken) {
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
        if (!deck.length) return;

        const settings = window.aiDictionary?.settings;
        const restoreProfile = await applyConnectionProfile(settings?.connectionProfile || '');

        try {
            let prefetchedCount = 0;
            let searchIndex = 1;

            // 从当前索引开始，预生成接下来的2个非复习卡片
            while (prefetchedCount < 2 && searchIndex < deck.length) {
                const nextIndex = (currentIndex + searchIndex) % deck.length;
                const nextCard = deck[nextIndex];

                searchIndex++;

                if (!nextCard) continue;

                // 跳过定时复习卡片
                if (nextCard.isReviewCard) {
                    console.log(`[Flashcard] Skipping review card: ${nextCard.word}`);
                    continue;
                }

                // 如果已经有句子，跳过
                if (blindListeningSentences.has(nextCard.word)) {
                    prefetchedCount++;
                    continue;
                }

                try {
                    const sentences = await generateBlindListeningSentences(nextCard.word, nextCard.context);
                    blindListeningSentences.set(nextCard.word, sentences);
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
     * Reset blind listening state.
     */
    function resetBlindListeningState() {
        blindListeningActive = false;
        blindListeningDeck = [];
        blindListeningIndex = 0;
        blindListeningSentences = new Map();
        blindListeningLoading = false;
        blindListeningLoadProgress = { total: 0, completed: 0 };
        blindListeningInputExpanded = false;
        blindListeningRevealAnswer = false;
        blindListeningFeedback = '';
        blindListeningInputValue = '';
        blindListeningStatusMessage = '';
        blindListeningAutoPlayedIndex = null;
        blindListeningGenerationToken += 1;
        blindListeningDisplayedSentence = '';
        blindListeningLastPlayedIndex = -1;
        blindListeningPlayingIndex = -1;
        blindListeningCursorPosition = 0;
        inputExpanded = false;
        showActionButtons = false;
        showWordOnFront = false;
        stopBlindListeningPlayback();
    }

    /**
     * Enter blind listening mode.
     */
    function startBlindListening() {
        if (!deck.length) {
            alert('没有可盲听的单词！请先开始背单词。');
            return;
        }

        blindListeningActive = true;
        blindListeningDeck = deck.map((card) => ({
            word: card.word,
            context: card.context || '',
        }));
        blindListeningIndex = 0;
        blindListeningSentences = new Map();
        blindListeningLoadProgress = { total: blindListeningDeck.length, completed: 0 };
        blindListeningLoading = false;
        blindListeningInputExpanded = false;
        blindListeningRevealAnswer = false;
        blindListeningFeedback = '';
        blindListeningInputValue = '';
        blindListeningStatusMessage = '';
        blindListeningAutoPlayedIndex = null;
        blindListeningGenerationToken += 1;
        blindListeningDisplayedSentence = '';
        blindListeningLastPlayedIndex = -1;
        blindListeningPlayingIndex = -1;
        blindListeningCursorPosition = 0;
        stopBlindListeningPlayback();
        render();
        prepareBlindListeningData();
    }

    /**
     * Generate real-time feedback HTML for character-by-character comparison.
     * @param {string} input - User's input
     * @param {string} target - Target word
     * @returns {string} HTML string with colored feedback
     */
    function generateRealtimeFeedback(input, target) {
        if (!input || !target) return '';

        const normalizedInput = input.trim().toLowerCase();
        const normalizedTarget = target.trim().toLowerCase();

        let html = '';
        for (let i = 0; i < normalizedInput.length; i++) {
            const inputChar = normalizedInput[i];
            const targetChar = normalizedTarget[i];

            if (targetChar === undefined) {
                // 输入超出目标长度
                html += `<span class="blind-char-wrong">${escapeHtml(input[i])}</span>`;
            } else if (inputChar === targetChar) {
                html += `<span class="blind-char-correct">${escapeHtml(input[i])}</span>`;
            } else {
                html += `<span class="blind-char-wrong">${escapeHtml(input[i])}</span>`;
            }
        }

        return html;
    }

    /**
     * Render blind listening view.
     * @param {HTMLElement} container
     */
    function renderBlindListeningView(container) {
        if (!blindListeningDeck.length) {
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
                resetBlindListeningState();
                render();
            });
            return;
        }

        const currentCard = getBlindListeningCard();
        const sentences = getBlindListeningSentences(currentCard?.word);
        const sentenceCount = sentences.length;
        const progressText = `${blindListeningIndex + 1}/${blindListeningDeck.length}`;
        const generationText = blindListeningLoading
            ? `句子 ${blindListeningLoadProgress.completed}/${blindListeningLoadProgress.total}`
            : `句子 ${Math.min(sentenceCount, 3)}/3`;
        const statusMessage = blindListeningStatusMessage
            || (blindListeningLoading ? '正在生成盲听句子...' : (sentenceCount ? '句子已就绪' : '句子准备中'));

        // 生成播放按钮，显示句子文本（如果答案已揭示）
        const playButtons = [0, 1, 2].map((sentenceIndex) => {
            const isReady = Boolean(sentences[sentenceIndex]);
            const isActive = blindListeningPlayingIndex === sentenceIndex;
            return `
                <button class="flashcard-blind-play-btn menu_button${isActive ? ' active' : ''}"
                        data-sentence-index="${sentenceIndex}"
                        ${isReady ? '' : 'disabled'}>
                    句子 ${sentenceIndex + 1}
                </button>
            `;
        }).join('');

        // 显示句子文本区域（当答案已揭示时）
        const sentenceDisplay = blindListeningDisplayedSentence
            ? `<div class="flashcard-blind-sentence-text">${escapeHtml(blindListeningDisplayedSentence)}</div>`
            : '';

        const answerText = blindListeningRevealAnswer && currentCard
            ? escapeHtml(currentCard.word)
            : '';

        // 生成实时反馈HTML
        const realtimeFeedbackHtml = generateRealtimeFeedback(blindListeningInputValue, currentCard?.word || '');

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
                    <div class="flashcard-blind-answer-text${blindListeningRevealAnswer ? '' : ' hidden'}">
                        ${answerText}
                    </div>
                </div>

                <div class="flashcard-blind-input">
                    <div class="flashcard-blind-input-body expanded">
                        <input type="text" id="blind-answer-input" placeholder="输入听到的单词"
                               value="${escapeHtml(blindListeningInputValue)}">
                    </div>
                    <div class="flashcard-blind-realtime-feedback">${realtimeFeedbackHtml}</div>
                </div>

                <div class="flashcard-blind-controls">
                    <button class="menu_button" id="blind-prev" ${blindListeningIndex === 0 ? 'disabled' : ''}>
                        上一词
                    </button>
                    <button class="menu_button" id="blind-next" ${blindListeningIndex >= blindListeningDeck.length - 1 ? 'disabled' : ''}>
                        下一词
                    </button>
                    <button class="menu_button" id="blind-exit">返回背单词</button>
                </div>
                <audio id="flashcard-blind-audio" preload="auto"></audio>
            </div>
        `;

        bindBlindListeningEvents();
        maybeAutoPlayBlindListening();
    }

    /**
     * Bind blind listening events.
     */
    function bindBlindListeningEvents() {
        blindListeningAudio = document.getElementById('flashcard-blind-audio');

        document.querySelectorAll('.flashcard-blind-play-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const sentenceIndex = Number(button.dataset.sentenceIndex);
                const currentCard = getBlindListeningCard();
                const sentences = getBlindListeningSentences(currentCard?.word);
                const sentence = sentences[sentenceIndex];
                if (sentence) {
                    blindListeningLastPlayedIndex = sentenceIndex;
                    // 如果答案已揭示，显示句子文本
                    if (blindListeningRevealAnswer) {
                        blindListeningDisplayedSentence = sentence;
                        render();
                    }
                    await playBlindListeningSentence(sentence, sentenceIndex);
                }
            });
        });

        document.getElementById('blind-prev')?.addEventListener('click', () => {
            setBlindListeningIndex(blindListeningIndex - 1);
        });

        document.getElementById('blind-next')?.addEventListener('click', () => {
            setBlindListeningIndex(blindListeningIndex + 1);
        });

        document.getElementById('blind-exit')?.addEventListener('click', () => {
            resetBlindListeningState();
            render();
        });

        const input = document.getElementById('blind-answer-input');
        if (input) {
            input.addEventListener('input', () => {
                blindListeningInputValue = input.value;
                blindListeningCursorPosition = input.selectionStart || 0;
                handleRealtimeValidation();
            });

            // 恢复光标位置
            input.focus();
            if (blindListeningCursorPosition > 0 && blindListeningCursorPosition <= input.value.length) {
                input.setSelectionRange(blindListeningCursorPosition, blindListeningCursorPosition);
            }
        }

        document.getElementById('blind-reveal-answer')?.addEventListener('click', () => {
            revealAnswerWithSentence();
        });
    }

    /**
     * Set current blind listening index.
     * @param {number} nextIndex
     */
    function setBlindListeningIndex(nextIndex) {
        if (nextIndex < 0 || nextIndex >= blindListeningDeck.length) {
            return;
        }
        blindListeningIndex = nextIndex;
        blindListeningInputExpanded = false;
        blindListeningRevealAnswer = false;
        blindListeningFeedback = '';
        blindListeningInputValue = '';
        blindListeningStatusMessage = '';
        blindListeningAutoPlayedIndex = null;
        blindListeningDisplayedSentence = '';
        blindListeningLastPlayedIndex = -1;
        blindListeningPlayingIndex = -1;
        blindListeningCursorPosition = 0;
        stopBlindListeningPlayback();
        render();
    }

    /**
     * Handle real-time validation of user input.
     * Auto-reveals answer when input is completely correct.
     */
    function handleRealtimeValidation() {
        const currentCard = getBlindListeningCard();
        if (!currentCard) return;

        const normalizedInput = normalizeAnswer(blindListeningInputValue);
        const normalizedWord = normalizeAnswer(currentCard.word);

        // 检查是否完全正确
        if (normalizedInput && normalizedInput === normalizedWord) {
            // 输入完全正确，自动揭示答案
            revealAnswerWithSentence();
        } else {
            // 只更新反馈区域，不重新渲染整个界面
            const feedbackContainer = document.querySelector('.flashcard-blind-realtime-feedback');
            if (feedbackContainer) {
                feedbackContainer.innerHTML = generateRealtimeFeedback(blindListeningInputValue, currentCard.word);
            }
        }
    }

    /**
     * Reveal answer and show the current/last played sentence.
     */
    function revealAnswerWithSentence() {
        blindListeningRevealAnswer = true;

        const currentCard = getBlindListeningCard();
        const sentences = getBlindListeningSentences(currentCard?.word);

        // 如果有播放过的句子，显示它；否则显示第一个句子
        if (blindListeningLastPlayedIndex >= 0 && sentences[blindListeningLastPlayedIndex]) {
            blindListeningDisplayedSentence = sentences[blindListeningLastPlayedIndex];
        } else if (sentences.length > 0) {
            blindListeningDisplayedSentence = sentences[0];
            blindListeningLastPlayedIndex = 0;
        }

        render();
    }

    /**
     * Get the current blind listening card.
     * @returns {{word: string, context: string} | null}
     */
    function getBlindListeningCard() {
        return blindListeningDeck[blindListeningIndex] || null;
    }

    /**
     * Get sentences for a word in blind listening.
     * @param {string} word
     * @returns {string[]}
     */
    function getBlindListeningSentences(word) {
        if (!word) return [];
        return blindListeningSentences.get(word) || [];
    }

    /**
     * Prepare blind listening sentences for the current deck.
     * @returns {Promise<void>}
     */
    async function prepareBlindListeningData() {
        if (blindListeningLoading || !blindListeningDeck.length) {
            return;
        }

        const generationToken = ++blindListeningGenerationToken;
        blindListeningLoading = true;
        blindListeningStatusMessage = '';
        blindListeningLoadProgress = { total: blindListeningDeck.length, completed: 0 };
        render();

        const settings = window.aiDictionary?.settings;
        const restoreProfile = await applyConnectionProfile(settings?.connectionProfile || '');

        try {
            for (const card of blindListeningDeck) {
                if (generationToken !== blindListeningGenerationToken || !blindListeningActive) {
                    return;
                }

                if (!blindListeningSentences.has(card.word)) {
                    try {
                        const sentences = await generateBlindListeningSentences(card.word, card.context);
                        blindListeningSentences.set(card.word, sentences);
                        await prefetchMobileTtsSentences(sentences, card.word);
                    } catch (error) {
                        console.error('[Flashcard] Blind listening sentence error:', error);
                        blindListeningStatusMessage = '句子生成失败，请稍后重试';
                    }
                }

                blindListeningLoadProgress.completed += 1;
                const activeCard = getBlindListeningCard();
                if (!blindListeningAudio || blindListeningAudio.paused || activeCard?.word === card.word) {
                    render();
                }
            }
        } finally {
            await restoreProfile();
            blindListeningLoading = false;
            if (!blindListeningAudio || blindListeningAudio.paused) {
                render();
            }
        }
    }

    /**
     * Generate sentences for blind listening.
     * @param {string} word
     * @param {string} context
     * @returns {Promise<string[]>}
     */
    async function generateBlindListeningSentences(word, context) {
        const contextObj = window.SillyTavern?.getContext?.();
        const generateRaw = contextObj?.generateRaw;
        if (!generateRaw) {
            throw new Error('generateRaw not available');
        }

        const settings = window.aiDictionary?.settings || {};
        const prompt = buildBlindListeningPrompt(word, context);
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
     * Build blind listening prompt.
     * @param {string} word
     * @param {string} context
     * @returns {string}
     */
    function buildBlindListeningPrompt(word, context) {
        const contextLine = context ? `Context: ${context}` : '';
        return [
            `Generate 3 short English sentences using the word "${word}".`,
            'Each sentence should be natural and different.',
            'Only output the sentences, one per line, without numbering or extra text.',
            contextLine,
        ].filter(Boolean).join('\n');
    }

    /**
     * Parse sentences from AI response.
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
     * Normalize answer text for comparison.
     * @param {string} text
     * @returns {string}
     */
    function normalizeAnswer(text) {
        return String(text || '')
            .trim()
            .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '')
            .toLowerCase();
    }

    /**
     * Apply connection profile for AI requests.
     * @param {string} profileId
     * @returns {Promise<Function>}
     */
    async function applyConnectionProfile(profileId) {
        const contextObj = window.SillyTavern?.getContext?.();
        const extensionSettings = contextObj?.extensionSettings || window.extension_settings;
        const connectionManager = extensionSettings?.connectionManager;
        const originalProfile = connectionManager?.selectedProfile || '';
        let profileApplied = false;

        if (profileId && connectionManager && Array.isArray(connectionManager.profiles)) {
            const profile = connectionManager.profiles.find((item) => item.id === profileId);
            const profileSelect = document.getElementById('connection_profiles');
            if (profile && profileSelect) {
                profileSelect.value = profile.id;
                profileSelect.dispatchEvent(new Event('change'));
                profileApplied = true;
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }

        return async () => {
            if (profileApplied && originalProfile !== profileId) {
                const profileSelect = document.getElementById('connection_profiles');
                if (profileSelect) {
                    profileSelect.value = originalProfile || '';
                    profileSelect.dispatchEvent(new Event('change'));
                }
            }
        };
    }

    /**
     * Auto play sentences for the current word.
     */
    function maybeAutoPlayBlindListening() {
        // 禁用自动播放
        return;
    }

    /**
     * Play a sentence queue for blind listening.
     * @param {string[]} sentences
     * @returns {Promise<void>}
     */
    async function playBlindListeningQueue(sentences) {
        if (!sentences.length) return;
        const audioElement = blindListeningAudio;
        if (!audioElement) return;

        let queueIndex = 0;
        const playbackToken = Date.now();
        blindListeningPlaybackToken = playbackToken;

        const playNext = async () => {
            if (blindListeningPlaybackToken !== playbackToken) return;
            const sentence = sentences[queueIndex];
            if (!sentence) return;
            await playBlindListeningSentence(sentence, queueIndex, playbackToken);
        };

        audioElement.onended = () => {
            if (blindListeningPlaybackToken !== playbackToken) return;
            queueIndex += 1;
            if (queueIndex < sentences.length) {
                playNext();
            }
        };

        await playNext();
    }

    /**
     * Play a single sentence via TTS.
     * @param {string} sentence
     * @param {number} sentenceIndex
     * @param {number} [token]
     * @returns {Promise<void>}
     */
    async function playBlindListeningSentence(sentence, sentenceIndex, token) {
        const audioElement = blindListeningAudio;
        if (!audioElement) return;

        const playbackToken = token || Date.now();
        if (!token) {
            blindListeningPlaybackToken = playbackToken;
            audioElement.onended = null;
        }
        setBlindListeningPlayingIndex(sentenceIndex);
        const clearPlayingState = () => {
            if (blindListeningPlaybackToken !== playbackToken) return;
            if (blindListeningPlayingIndex !== sentenceIndex) return;
            setBlindListeningPlayingIndex(-1);
        };
        if (!isIosDevice()) {
            audioElement.addEventListener('ended', clearPlayingState, { once: true });
        }

        try {
            const currentCard = deck[currentIndex];
            const cacheKey = currentCard ? `${currentCard.word}-${sentenceIndex}` : sentence;

            if (isIosDevice()) {
                setTtsStatusMessage('Mobile TTS active');
                let buffer = mobileTtsBufferCache.get(cacheKey);
                if (!buffer) {
                    await getMobileTtsAudioUrl(sentence, cacheKey);
                    buffer = mobileTtsBufferCache.get(cacheKey);
                }
                if (!buffer) {
                    throw new Error('mobile_tts_buffer_missing');
                }
                await playMobileTtsWithWebAudio(buffer);
                clearPlayingState();
                setTtsStatusMessage('');
                return;
            }

            setTtsStatusMessage('Mobile TTS active');
            await playMobileTts(audioElement, sentence, cacheKey);
            setTtsStatusMessage('');
        } catch (error) {
            console.error('[Flashcard] TTS play failed:', error);
            const detail = String(error?.message || error || '').slice(0, 160);
            setTtsStatusMessage(`Mobile TTS failed: ${detail || 'unknown error'}`);
            clearPlayingState();
        }
    }

    /**
     * Stop blind listening playback.
     */
    function stopBlindListeningPlayback() {
        if (blindListeningAudio) {
            blindListeningAudio.pause();
            blindListeningAudio.src = '';
        }
        blindListeningPlaybackToken = 0;
        setBlindListeningPlayingIndex(-1);
    }

    /**
     * HTML 转义
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 获取完成的单词数
     */
    function getCompletedCount() {
        return wordsCompleted;
    }

    /**
     * 获取剩余单词数
     */
    function getRemainingCount() {
        return deck.length;
    }

    /**
     * 启动复习定时器
     */
    function startReviewTimer() {
        stopReviewTimer();
        reviewTimer = setInterval(() => {
            triggerReview();
        }, REVIEW_INTERVAL);
    }

    /**
     * 停止复习定时器
     */
    function stopReviewTimer() {
        if (reviewTimer) {
            clearInterval(reviewTimer);
            reviewTimer = null;
        }
        resetBlindListeningState();
    }

    /**
     * 触发复习
     */
    function triggerReview() {
        if (deck.length <= 1) {
            return;
        }

        // 从底部取卡
        const reviewCard = deck.pop();
        if (reviewCard) {
            // 标记为定时复习卡片
            reviewCard.isReviewCard = true;
            // 插入到当前位置的下一张（不打断当前正在看的卡片）
            const insertIndex = Math.min(currentIndex + 1, deck.length);
            deck.splice(insertIndex, 0, reviewCard);
            lastReviewTime = Date.now();
            console.log(`[Flashcard] 定时复习: 静默插入单词 "${reviewCard.word}" 到位置 ${insertIndex}`);
            // 不调用 render()，避免打断用户当前正在看的卡片
        }
    }

    return {
        start,
        render,
        getCompletedCount,
        getRemainingCount,
        stopReviewTimer,
    };
})();

// 触发查词的辅助函数（只读模式，不记录查词次数）
function triggerWordLookup(word, context = '') {
    if (window.aiDictionary && typeof window.aiDictionary.lookupWordReadOnly === 'function') {
        window.aiDictionary.lookupWordReadOnly(word, context);
    } else {
        console.warn('[Flashcard] aiDictionary.lookupWordReadOnly not available');
    }
}

if (typeof window !== 'undefined') {
    window.Flashcard = Flashcard;
    console.log('[Flashcard] Script loaded successfully, window.Flashcard set');
}
