/**
 * AI Dictionary Farm Game - 农场种菜小游戏
 * 学习累了就来种种菜放松一下吧！
 * 背单词可以加速作物生长！
 */

const FarmGame = (() => {
    // 游戏配置
    const GRID_SIZE = 4;
    const SAVE_KEY = 'ai-dict-farm-game';
    const BOOST_PER_WORD = 10; // 每背一个单词加速10秒

    // 作物定义
    const CROPS = {
        carrot: { name: '胡萝卜', emoji: '🥕', growTime: 30, sellPrice: 10, seedPrice: 5 },
        tomato: { name: '番茄', emoji: '🍅', growTime: 60, sellPrice: 25, seedPrice: 12 },
        cabbage: { name: '白菜', emoji: '🥬', growTime: 45, sellPrice: 18, seedPrice: 8 },
        corn: { name: '玉米', emoji: '🌽', growTime: 90, sellPrice: 40, seedPrice: 20 },
        eggplant: { name: '茄子', emoji: '🍆', growTime: 75, sellPrice: 35, seedPrice: 15 },
        potato: { name: '土豆', emoji: '🥔', growTime: 50, sellPrice: 20, seedPrice: 10 },
    };

    const GROWTH_STAGES = ['🟫', '🌱', '🌿', '✨'];

    // 游戏状态
    let gameState = {
        coins: 50,
        plots: [],
        selectedSeed: null,
        totalHarvested: 0,
        boostSeconds: 0, // 累计加速秒数
    };

    let showingFlashcards = false;
    let showingShop = false;

    function initGameState() {
        gameState.plots = [];
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            gameState.plots.push({
                crop: null,
                plantedAt: null,
                stage: 0,
            });
        }
    }

    function saveGame() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
        } catch (e) {
            console.warn('[FarmGame] Save failed:', e);
        }
    }

    function loadGame() {
        try {
            const saved = localStorage.getItem(SAVE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                gameState = { ...gameState, ...data };
                if (!gameState.plots || gameState.plots.length !== GRID_SIZE * GRID_SIZE) {
                    initGameState();
                }
                if (typeof gameState.boostSeconds !== 'number') {
                    gameState.boostSeconds = 0;
                }
            } else {
                initGameState();
            }
        } catch (e) {
            console.warn('[FarmGame] Load failed:', e);
            initGameState();
        }
    }

    /**
     * 获取作物生长阶段（考虑加速）
     */
    function getGrowthStage(plot) {
        if (!plot.crop || !plot.plantedAt) return 0;
        // 实际经过时间 + 加速时间
        const elapsed = (Date.now() - plot.plantedAt) / 1000 + Math.max(0, gameState.boostSeconds);
        const cropInfo = CROPS[plot.crop];
        const progress = Math.min(Math.max(elapsed, 0) / cropInfo.growTime, 1);
        return Math.floor(Math.max(progress, 0) * 3);
    }

    function isRipe(plot) {
        return getGrowthStage(plot) >= 3;
    }

    /**
     * 添加加速时间
     */
    function addBoost(seconds) {
        gameState.boostSeconds += seconds;
        saveGame();
        render();
    }

    /**
     * 背单词完成回调
     */
    function onFlashcardComplete(wordsCompleted) {
        if (wordsCompleted > 0) {
            const boostTime = wordsCompleted * BOOST_PER_WORD;
            addBoost(boostTime);
            setTimeout(() => {
                alert(`🎉 背完 ${wordsCompleted} 个单词！\n⚡ 作物生长加速 ${boostTime} 秒！`);
            }, 100);
        }
    }

    function render() {
        const container = document.getElementById('farm-game-container');
        if (!container) return;

        if (showingFlashcards) {
            renderFlashcardView(container);
            return;
        }

        if (showingShop) {
            renderShopView(container);
            return;
        }

        gameState.plots.forEach(plot => {
            if (plot.crop) {
                plot.stage = getGrowthStage(plot);
            }
        });

        const html = `
            <div class="farm-game">
                <div class="farm-header">
                    <span class="farm-coins">💰 ${gameState.coins}</span>
                    <span class="farm-harvested">🏆 ${gameState.totalHarvested}</span>
                </div>

                <div class="farm-grid">
                    ${gameState.plots.map((plot, i) => renderPlot(plot, i)).join('')}
                </div>

                <div class="farm-status">
                    ${gameState.selectedSeed
                        ? `<span class="farm-selected-seed">已选: ${CROPS[gameState.selectedSeed].emoji} ${CROPS[gameState.selectedSeed].name}</span>`
                        : '<span class="farm-no-seed">点击下方选种子</span>'}
                    ${gameState.boostSeconds > 0 ? `<span class="farm-boost-badge">⚡+${gameState.boostSeconds}s</span>` : ''}
                </div>

                <div class="farm-actions">
                    <button class="farm-action-btn menu_button" id="farm-open-shop">
                        🏪 种子商店
                    </button>
                    <button class="farm-action-btn menu_button" id="farm-start-flashcard">
                        📚 背单词
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = html;
        bindEvents();
    }

    function renderShopView(container) {
        container.innerHTML = `
            <div class="farm-shop-page">
                <div class="farm-shop-header">
                    <button class="menu_button farm-back-btn" id="shop-back">
                        <i class="fa-solid fa-arrow-left"></i> 返回
                    </button>
                    <span class="farm-shop-coins">💰 ${gameState.coins}</span>
                </div>
                <div class="farm-shop-title">🏪 选择种子</div>
                <div class="farm-shop-list">
                    ${Object.entries(CROPS).map(([key, crop]) => `
                        <div class="farm-shop-item ${gameState.selectedSeed === key ? 'selected' : ''} ${gameState.coins < crop.seedPrice ? 'disabled' : ''}"
                             data-seed="${key}">
                            <span class="shop-item-emoji">${crop.emoji}</span>
                            <div class="shop-item-info">
                                <span class="shop-item-name">${crop.name}</span>
                                <span class="shop-item-detail">⏱${crop.growTime}s → 💰${crop.sellPrice}</span>
                            </div>
                            <span class="shop-item-price">$${crop.seedPrice}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // 绑定返回按钮
        document.getElementById('shop-back')?.addEventListener('click', () => {
            showingShop = false;
            render();
        });

        // 绑定种子选择
        document.querySelectorAll('.farm-shop-item:not(.disabled)').forEach(el => {
            el.addEventListener('click', () => {
                const seed = el.dataset.seed;
                gameState.selectedSeed = seed;
                showingShop = false;
                render();
            });
        });
    }

    function renderFlashcardView(container) {
        container.innerHTML = `
            <div class="flashcard-panel-content">
                <button class="menu_button flashcard-back-btn" id="flashcard-back">
                    <i class="fa-solid fa-arrow-left"></i> 返回农场
                </button>
                <div id="flashcard-container" class="flashcard-container"></div>
            </div>
        `;

        // 绑定返回按钮
        const backBtn = document.getElementById('flashcard-back');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                showingFlashcards = false;
                if (window.Flashcard) {
                    // 获取已完成的数量
                    const completed = window.Flashcard.getCompletedCount();
                    if (completed > 0) {
                        onFlashcardComplete(completed);
                    }
                }
                render();
            });
        }

        // 加载并启动背单词
        loadFlashcardAndStart();
    }

    async function loadFlashcardAndStart() {
        if (!window.Flashcard) {
            try {
                const script = document.createElement('script');
                // 获取当前脚本路径
                const currentScript = document.querySelector('script[src*="farm-game.js"]');
                const basePath = currentScript ? currentScript.src.replace('farm-game.js', '') : '';
                script.src = basePath + 'flashcard.js';
                script.onload = () => {
                    if (window.Flashcard) {
                        window.Flashcard.start(onFlashcardComplete);
                    }
                };
                document.head.appendChild(script);
            } catch (e) {
                console.error('[FarmGame] Failed to load flashcard:', e);
            }
        } else {
            window.Flashcard.start(onFlashcardComplete);
        }
    }

    function renderPlot(plot, index) {
        let emoji = '🟫';
        let className = 'empty';

        if (plot.crop) {
            const stage = getGrowthStage(plot);
            if (stage >= 3) {
                emoji = CROPS[plot.crop].emoji;
                className = 'ripe';
            } else {
                emoji = GROWTH_STAGES[stage];
                className = 'growing';
            }
        }

        return `
            <div class="farm-plot ${className}" data-index="${index}">
                <span class="plot-emoji">${emoji}</span>
            </div>
        `;
    }

    function bindEvents() {
        // 地块点击
        document.querySelectorAll('.farm-plot').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                handlePlotClick(index);
            });
        });

        // 商店按钮
        document.getElementById('farm-open-shop')?.addEventListener('click', () => {
            showingShop = true;
            render();
        });

        // 背单词按钮
        document.getElementById('farm-start-flashcard')?.addEventListener('click', () => {
            showingFlashcards = true;
            render();
        });
    }

    function handlePlotClick(index) {
        const plot = gameState.plots[index];

        if (plot.crop) {
            if (isRipe(plot)) {
                harvest(index);
            }
        } else {
            if (gameState.selectedSeed) {
                plant(index, gameState.selectedSeed);
            }
        }
    }

    function plant(index, cropType) {
        const crop = CROPS[cropType];
        if (gameState.coins < crop.seedPrice) return;

        gameState.coins -= crop.seedPrice;
        gameState.plots[index] = {
            crop: cropType,
            plantedAt: Date.now(),
            stage: 0,
        };

        saveGame();
        render();
    }

    function harvest(index) {
        const plot = gameState.plots[index];
        if (!plot.crop || !isRipe(plot)) return;

        const crop = CROPS[plot.crop];
        gameState.coins += crop.sellPrice;
        gameState.totalHarvested++;

        gameState.plots[index] = {
            crop: null,
            plantedAt: null,
            stage: 0,
        };

        saveGame();
        render();
        showHarvestMessage(crop);
    }

    function showHarvestMessage(crop) {
        const msg = document.createElement('div');
        msg.className = 'farm-harvest-msg';
        msg.textContent = `${crop.emoji} +$${crop.sellPrice}`;
        document.querySelector('.farm-game')?.appendChild(msg);
        setTimeout(() => msg.remove(), 1000);
    }

    let gameLoop = null;
    function startGameLoop() {
        if (gameLoop) return;
        gameLoop = setInterval(() => {
            if (document.getElementById('farm-game-container') && !showingFlashcards) {
                render();
            }
        }, 5000);
    }

    function stopGameLoop() {
        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
    }

    function init() {
        loadGame();
        render();
        startGameLoop();
    }

    function reset() {
        if (!confirm('确定要重置游戏吗？所有进度将丢失！')) return;
        gameState = {
            coins: 50,
            plots: [],
            selectedSeed: null,
            totalHarvested: 0,
            boostSeconds: 0,
        };
        initGameState();
        saveGame();
        render();
    }

    return {
        init,
        reset,
        render,
        stopGameLoop,
        addBoost,
    };
})();

if (typeof window !== 'undefined') {
    window.FarmGame = FarmGame;
}
