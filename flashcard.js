/**
 * AI Dictionary Flashcard - 背单词卡片
 * 背单词加速作物收获！
 */

const Flashcard = (() => {
    // 配置
    const DECK_SIZE = 20; // 每组单词数量

    // 状态
    let deck = [];           // 当前牌组 [{ word, context, correctCount }]
    let totalWordsInHistory = 0; // 词库总单词数
    let currentIndex = 0;    // 当前卡片索引
    let isFlipped = false;   // 是否翻转显示背面
    let wordsCompleted = 0;  // 本轮完成的单词数
    let onComplete = null;   // 完成回调

    /**
     * 从查词历史获取单词列表（随机抽取最多20个）
     */
    function getWordsFromHistory() {
        // 通过导出的接口访问 wordHistoryData
        let historyData = null;

        if (window.aiDictionary && typeof window.aiDictionary.getWordHistory === 'function') {
            historyData = window.aiDictionary.getWordHistory();
        }

        if (!historyData || Object.keys(historyData).length === 0) {
            totalWordsInHistory = 0;
            return [];
        }

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

        // 记录总单词数
        totalWordsInHistory = allWords.length;

        // 完全随机打乱
        for (let i = allWords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allWords[i], allWords[j]] = [allWords[j], allWords[i]];
        }

        // 只取前 DECK_SIZE 个作为本轮牌组
        return allWords.slice(0, DECK_SIZE);
    }

    /**
     * 开始背单词
     * @param {Function} completeCallback - 完成时的回调，传入完成的单词数
     */
    function start(completeCallback) {
        deck = getWordsFromHistory();
        currentIndex = 0;
        isFlipped = false;
        wordsCompleted = 0;
        onComplete = completeCallback;

        if (deck.length === 0) {
            alert('没有可复习的单词！请先查询一些单词。');
            return false;
        }

        render();
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
                </div>
            `;
            // 触发完成回调
            if (onComplete && wordsCompleted > 0) {
                onComplete(wordsCompleted);
            }
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
                <span>✅ ${wordsCompleted} | 剩 ${deck.length}</span>
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
                <button class="flashcard-btn flashcard-btn-remember" id="flashcard-remember">
                    <i class="fa-solid fa-check"></i>
                    <span>记住了${card.correctCount > 0 ? ` (${card.correctCount}/2)` : ''}</span>
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
    function handleAnswer(remembered) {
        const card = deck[currentIndex];

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
                if (currentIndex >= deck.length) {
                    currentIndex = 0;
                }
            }
        } else {
            // 没记住，重置计数，放到牌组底部
            card.correctCount = 0;
            deck.splice(currentIndex, 1);
            deck.push(card);
            if (currentIndex >= deck.length) {
                currentIndex = 0;
            }
        }

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

    return {
        start,
        render,
        getCompletedCount,
        getRemainingCount,
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
