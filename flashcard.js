/**
 * AI Dictionary Flashcard - 背单词卡片
 * 背单词加速作物收获！
 * 支持进度保存和SM-2算法
 */

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

        // 启动复习定时器
        if (deck.length > 0) {
            startReviewTimer();
        }

        if (deck.length === 0 && wordsCompleted === 0) {
            alert('没有可复习的单词！请先查询一些单词。');
            return false;
        }

        render();
        await saveSession();
        return true;
    }

    /**
     * 渲染卡片界面
     */
    function render() {
        const container = document.getElementById('flashcard-container');
        if (!container) return;

        if (deck.length === 0) {
            container.innerHTML = `
                <div class="flashcard-empty">
                    <div class="flashcard-empty-icon">🎉</div>
                    <div class="flashcard-empty-text">太棒了！所有单词都复习完了！</div>
                    <div class="flashcard-empty-stats">本轮完成: ${wordsCompleted} 个单词</div>
                    <button class="flashcard-continue-btn menu_button" id="flashcard-continue">
                        继续下一组
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
                    startReviewTimer();
                    await saveSession();
                    render();
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

        container.innerHTML = `
            <div class="flashcard-progress">
                <span>📚 ${progressInfo}</span>
                <span>✅ ${progressScore.toFixed(1)} | ${initialDeckSize}</span>
            </div>

            <div class="flashcard-card ${isFlipped ? 'flipped' : ''}" id="flashcard-main">
                <div class="flashcard-front">
                    <div class="flashcard-word">${escapeHtml(card.word)}</div>
                    <div class="flashcard-hint">点击卡片查看上下文</div>
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

            <div class="flashcard-actions">
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
            </div>
        `;

        bindCardEvents();
    }

    /**
     * 绑定卡片事件
     */
    function bindCardEvents() {
        // 点击卡片翻转
        const card = document.getElementById('flashcard-main');
        if (card) {
            card.addEventListener('click', () => {
                isFlipped = !isFlipped;
                card.classList.toggle('flipped', isFlipped);
            });
        }

        // 查看释义按钮
        const lookupBtn = document.getElementById('flashcard-lookup-btn');
        if (lookupBtn) {
            lookupBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const currentCard = deck[currentIndex];
                if (currentCard && typeof triggerWordLookup === 'function') {
                    triggerWordLookup(currentCard.word, currentCard.context);
                }
            });
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
     * 处理回答
     * @param {boolean} remembered - 是否记住了
     */
    async function handleAnswer(remembered) {
        const card = deck[currentIndex];
        const wasLastCard = currentIndex === deck.length - 1;
        let cardMovedToBottom = false; // 标记当前卡是否被移到了底部

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

        // 重置翻转状态
        isFlipped = false;

        // 保存session
        await saveSession();

        render();
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

        // 重置翻转状态
        isFlipped = false;
        render();
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
}
