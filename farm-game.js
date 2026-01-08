/**
 * AI Dictionary Farm Game - 农场种菜小游戏
 * 学习累了就来种种菜放松一下吧！
 * 背单词可以获得加速点！
 */

const FarmGame = (() => {
    // 游戏配置
    const GRID_SIZE = 4;
    const SAVE_KEY = 'ai-dict-farm-game';
    const DAY_IN_MS = 24 * 60 * 60 * 1000; // 一天的毫秒数

    // 作物定义（生长时间单位：天）
    const CROPS = {
        carrot: { name: '胡萝卜', emoji: '🥕', growDays: 1, sellPrice: 10, seedPrice: 5, unlocked: true },
        potato: { name: '土豆', emoji: '🥔', growDays: 1, sellPrice: 15, seedPrice: 8, unlocked: true },
        cabbage: { name: '白菜', emoji: '🥬', growDays: 1.5, sellPrice: 20, seedPrice: 10, unlockCost: 50 },
        tomato: { name: '番茄', emoji: '🍅', growDays: 2, sellPrice: 30, seedPrice: 15, unlockCost: 100 },
        corn: { name: '玉米', emoji: '🌽', growDays: 2.5, sellPrice: 45, seedPrice: 20, unlockCost: 200 },
        eggplant: { name: '茄子', emoji: '🍆', growDays: 3, sellPrice: 60, seedPrice: 25, unlockCost: 300 },
    };

    const GROWTH_STAGES = ['🌱', '🌿', '🌾', '✨'];

    // 游戏状态
    let gameState = {
        coins: 50,
        plots: [],
        selectedSeed: null,
        totalHarvested: 0,
        boostDays: 0, // 累计加速天数
        unlockedCrops: ['carrot', 'potato'], // 已解锁的作物
    };

    let showingFlashcards = false;
    let showingShop = false;
    let showingRedemption = false;
    let showingInventory = false;
    let flashcardStarted = false;

    function initGameState() {
        gameState.plots = [];
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            gameState.plots.push({
                crop: null,
                plantedAt: null,
                boostedDays: 0, // 该作物已使用的加速天数
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
                // 兼容旧数据
                if (typeof gameState.boostDays !== 'number') {
                    gameState.boostDays = Math.floor((gameState.boostSeconds || 0) / 86400);
                    delete gameState.boostSeconds;
                }
                if (!Array.isArray(gameState.unlockedCrops)) {
                    gameState.unlockedCrops = ['carrot', 'potato'];
                }
                // 删除旧的全局加速字段
                delete gameState.globalBoostDays;
                // 确保每个地块有boostedDays字段
                gameState.plots.forEach(plot => {
                    if (typeof plot.boostedDays !== 'number') {
                        plot.boostedDays = 0;
                    }
                });
            } else {
                initGameState();
            }
        } catch (e) {
            console.warn('[FarmGame] Load failed:', e);
            initGameState();
        }
    }

    /**
     * 获取作物生长进度（0-1）
     */
    function getGrowthProgress(plot) {
        if (!plot.crop || !plot.plantedAt) return 0;
        const cropInfo = CROPS[plot.crop];
        const elapsedMs = Date.now() - plot.plantedAt;
        const elapsedDays = elapsedMs / DAY_IN_MS;
        const totalDays = elapsedDays + (plot.boostedDays || 0);
        return Math.min(totalDays / cropInfo.growDays, 1);
    }

    /**
     * 获取作物生长阶段（0-3）
     */
    function getGrowthStage(plot) {
        const progress = getGrowthProgress(plot);
        return Math.floor(progress * 3);
    }

    /**
     * 获取剩余生长时间（天）
     */
    function getRemainingDays(plot) {
        if (!plot.crop || !plot.plantedAt) return 0;
        const cropInfo = CROPS[plot.crop];
        const elapsedMs = Date.now() - plot.plantedAt;
        const elapsedDays = elapsedMs / DAY_IN_MS;
        const totalDays = elapsedDays + (plot.boostedDays || 0);
        return Math.max(0, cropInfo.growDays - totalDays);
    }

    function isRipe(plot) {
        return getGrowthProgress(plot) >= 1;
    }

    /**
     * 添加加速天数
     */
    function addBoost(days) {
        gameState.boostDays += days;
        saveGame();
        render();
    }

    /**
     * 对所有已种植的作物使用加速
     */
    function boostAllCrops() {
        if (gameState.boostDays < 1) return;

        gameState.boostDays -= 1;

        // 为所有已种植且未成熟的作物增加1天加速
        gameState.plots.forEach(plot => {
            if (plot.crop && !isRipe(plot)) {
                plot.boostedDays = (plot.boostedDays || 0) + 1;
            }
        });

        saveGame();
        render();
        showBoostAppliedMessage();
    }

    function showBoostAppliedMessage() {
        const msg = document.createElement('div');
        msg.className = 'farm-harvest-msg';
        msg.textContent = '⚡ +1天';
        document.querySelector('.farm-game')?.appendChild(msg);
        setTimeout(() => msg.remove(), 1000);
    }

    /**
     * 背单词完成回调
     */
    function onFlashcardComplete(wordsCompleted) {
        if (wordsCompleted > 0) {
            // 背完一组单词获得1天加速点
            addBoost(1);
            showBoostMessage(wordsCompleted);
        }
    }

    /**
     * 显示加速提示消息
     */
    function showBoostMessage(wordsCompleted) {
        const msg = document.createElement('div');
        msg.className = 'farm-boost-msg';
        msg.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 8px;">🎉</div>
            <div>背完 ${wordsCompleted} 个单词！</div>
            <div style="color: #ffd700; font-weight: bold;">⚡ +1 天加速点</div>
        `;
        document.querySelector('.farm-game')?.appendChild(msg);
        setTimeout(() => msg.remove(), 2500);
    }

    /**
     * 解锁作物
     */
    function unlockCrop(cropKey) {
        const crop = CROPS[cropKey];
        if (!crop || !crop.unlockCost) return;
        if (gameState.unlockedCrops.includes(cropKey)) return;
        if (gameState.coins < crop.unlockCost) return;

        gameState.coins -= crop.unlockCost;
        gameState.unlockedCrops.push(cropKey);
        saveGame();
        render();
    }

    function isCropUnlocked(cropKey) {
        return gameState.unlockedCrops.includes(cropKey) || CROPS[cropKey].unlocked;
    }

    async function loadRedemptionModule() {
        if (window.Redemption) return;
        try {
            const script = document.createElement('script');
            const currentScript = document.querySelector('script[src*="farm-game.js"]');
            const basePath = currentScript ? currentScript.src.replace('farm-game.js', '') : '';
            script.src = basePath + 'modules/redemption.js';
            script.onload = () => {
                if (window.Redemption) {
                    window.Redemption.init();
                }
            };
            document.head.appendChild(script);
        } catch (e) {
            console.error('[FarmGame] Failed to load redemption module:', e);
        }
    }

    function showPanel() {
        showingRedemption = false;
        showingInventory = false;
        render();
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

        if (showingRedemption) {
            renderRedemptionView(container);
            return;
        }

        if (showingInventory) {
            renderInventoryView(container);
            return;
        }

        const html = `
            <div class="farm-game">
                <div class="farm-header">
                    <span class="farm-coins">💰 ${gameState.coins}</span>
                    <span class="farm-harvested">🏆 ${gameState.totalHarvested}</span>
                    <span class="farm-boost-points ${gameState.boostDays >= 1 ? 'clickable' : ''}" id="farm-boost-points" title="${gameState.boostDays >= 1 ? '点击使用加速' : '加速天数'}">⚡ ${gameState.boostDays}天</span>
                </div>

                <div class="farm-grid">
                    ${gameState.plots.map((plot, i) => renderPlot(plot, i)).join('')}
                </div>

                <div class="farm-status">
                    ${gameState.selectedSeed
                        ? `<span class="farm-selected-seed">已选: ${CROPS[gameState.selectedSeed].emoji} ${CROPS[gameState.selectedSeed].name}</span>`
                        : '<span class="farm-no-seed">点击下方选种子</span>'}
                </div>

                <div class="farm-actions">
                    <button class="farm-action-btn menu_button" id="farm-open-shop">
                        🏪 种子商店
                    </button>
                    <button class="farm-action-btn menu_button farm-redemption-btn" id="farm-open-redemption">
                        🎁 免费兑换
                    </button>
                    <button class="farm-action-btn menu_button farm-inventory-btn" id="farm-open-inventory">
                        🎒 我的物品
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

    function renderPlot(plot, index) {
        let emoji = '🟫';
        let className = 'empty';
        let timeInfo = '';

        if (plot.crop) {
            const stage = getGrowthStage(plot);
            if (stage >= 3 || isRipe(plot)) {
                emoji = CROPS[plot.crop].emoji;
                className = 'ripe';
                timeInfo = '<span class="plot-time ready">可收获</span>';
            } else {
                emoji = GROWTH_STAGES[stage];
                className = 'growing';
                const remaining = getRemainingDays(plot);
                const hours = Math.floor((remaining % 1) * 24);
                const days = Math.floor(remaining);
                timeInfo = `<span class="plot-time">${days > 0 ? days + '天' : ''}${hours}时</span>`;
            }
        }

        return `
            <div class="farm-plot ${className}" data-index="${index}">
                <span class="plot-emoji">${emoji}</span>
                ${timeInfo}
            </div>
        `;
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
                <div class="farm-shop-title">🏪 种子商店</div>
                <div class="farm-shop-list">
                    ${Object.entries(CROPS).map(([key, crop]) => {
                        const unlocked = isCropUnlocked(key);
                        const canAfford = gameState.coins >= crop.seedPrice;
                        const canUnlock = !unlocked && gameState.coins >= crop.unlockCost;

                        if (!unlocked) {
                            return `
                                <div class="farm-shop-item locked ${canUnlock ? '' : 'disabled'}" data-crop="${key}">
                                    <span class="shop-item-emoji">🔒</span>
                                    <div class="shop-item-info">
                                        <span class="shop-item-name">${crop.name}</span>
                                        <span class="shop-item-detail">解锁后可种植</span>
                                    </div>
                                    <button class="shop-unlock-btn ${canUnlock ? '' : 'disabled'}" data-unlock="${key}">
                                        💰${crop.unlockCost} 解锁
                                    </button>
                                </div>
                            `;
                        }

                        return `
                            <div class="farm-shop-item ${gameState.selectedSeed === key ? 'selected' : ''} ${canAfford ? '' : 'disabled'}"
                                 data-seed="${key}">
                                <span class="shop-item-emoji">${crop.emoji}</span>
                                <div class="shop-item-info">
                                    <span class="shop-item-name">${crop.name}</span>
                                    <span class="shop-item-detail">⏱${crop.growDays}天 → 💰${crop.sellPrice}</span>
                                </div>
                                <span class="shop-item-price">$${crop.seedPrice}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // 绑定返回按钮
        document.getElementById('shop-back')?.addEventListener('click', () => {
            showingShop = false;
            render();
        });

        // 绑定种子选择
        document.querySelectorAll('.farm-shop-item:not(.disabled):not(.locked)').forEach(el => {
            el.addEventListener('click', () => {
                const seed = el.dataset.seed;
                if (seed) {
                    gameState.selectedSeed = seed;
                    showingShop = false;
                    render();
                }
            });
        });

        // 绑定解锁按钮
        document.querySelectorAll('.shop-unlock-btn:not(.disabled)').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const cropKey = el.dataset.unlock;
                if (cropKey) {
                    unlockCrop(cropKey);
                }
            });
        });
    }

    function renderRedemptionView(container) {
        if (window.Redemption && typeof window.Redemption.showPanel === 'function') {
            const panelContainer = document.createElement('div');
            panelContainer.id = 'redemption-panel-container';
            container.innerHTML = '';
            container.appendChild(panelContainer);
            window.Redemption.showPanel(panelContainer);
        } else {
            container.innerHTML = `
                <div class="flashcard-panel-content">
                    <button class="menu_button flashcard-back-btn" id="redemption-back">
                        <i class="fa-solid fa-arrow-left"></i> 返回农场
                    </button>
                    <div class="redemption-loading">加载中...</div>
                </div>
            `;
            document.getElementById('redemption-back')?.addEventListener('click', () => {
                showingRedemption = false;
                render();
            });
            loadRedemptionModule();
        }
    }

    function renderInventoryView(container) {
        if (window.Redemption && typeof window.Redemption.showPanel === 'function') {
            const panelContainer = document.createElement('div');
            panelContainer.id = 'redemption-panel-container';
            container.innerHTML = '';
            container.appendChild(panelContainer);
            window.Redemption.showPanel(panelContainer);
            window.Redemption.switchView('inventory');
        } else {
            container.innerHTML = `
                <div class="flashcard-panel-content">
                    <button class="menu_button flashcard-back-btn" id="inventory-back">
                        <i class="fa-solid fa-arrow-left"></i> 返回农场
                    </button>
                    <div class="redemption-loading">加载中...</div>
                </div>
            `;
            document.getElementById('inventory-back')?.addEventListener('click', () => {
                showingInventory = false;
                render();
            });
            loadRedemptionModule();
        }
    }

    function renderFlashcardView(container) {
        if (!flashcardStarted) {
            container.innerHTML = `
                <div class="flashcard-panel-content">
                    <button class="menu_button flashcard-back-btn" id="flashcard-back">
                        <i class="fa-solid fa-arrow-left"></i> 返回农场
                    </button>
                    <div id="flashcard-container" class="flashcard-container"></div>
                </div>
            `;

            const backBtn = document.getElementById('flashcard-back');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    showingFlashcards = false;
                    flashcardStarted = false;
                    render();
                });
            }

            flashcardStarted = true;
            loadFlashcardAndStart();
        }
    }

    async function loadFlashcardAndStart() {
        if (!window.Flashcard) {
            try {
                const script = document.createElement('script');
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

    function bindEvents() {
        // 地块点击
        document.querySelectorAll('.farm-plot').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                handlePlotClick(index);
            });
        });

        // 加速天数点击
        document.getElementById('farm-boost-points')?.addEventListener('click', () => {
            if (gameState.boostDays >= 1) {
                boostAllCrops();
            }
        });

        // 商店按钮
        document.getElementById('farm-open-shop')?.addEventListener('click', () => {
            showingShop = true;
            render();
        });

        // 兑换中心按钮
        document.getElementById('farm-open-redemption')?.addEventListener('click', () => {
            showingRedemption = true;
            loadRedemptionModule();
            render();
        });

        // 我的物品按钮
        document.getElementById('farm-open-inventory')?.addEventListener('click', () => {
            showingInventory = true;
            loadRedemptionModule();
            render();
        });

        // 背单词按钮
        document.getElementById('farm-start-flashcard')?.addEventListener('click', () => {
            showingFlashcards = true;
            flashcardStarted = false;
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
            if (gameState.selectedSeed && isCropUnlocked(gameState.selectedSeed)) {
                plant(index, gameState.selectedSeed);
            }
        }
    }

    function plant(index, cropType) {
        const crop = CROPS[cropType];
        if (gameState.coins < crop.seedPrice) return;
        if (!isCropUnlocked(cropType)) return;

        gameState.coins -= crop.seedPrice;
        gameState.plots[index] = {
            crop: cropType,
            plantedAt: Date.now(),
            boostedDays: 0,
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
            boostedDays: 0,
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
        }, 60000); // 每分钟更新一次
    }

    function stopGameLoop() {
        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
    }

    function cleanup() {
        stopGameLoop();
        if (window.Flashcard && typeof window.Flashcard.stopReviewTimer === 'function') {
            window.Flashcard.stopReviewTimer();
        }
        showingFlashcards = false;
        showingShop = false;
        showingRedemption = false;
        showingInventory = false;
    }

    function init() {
        showingFlashcards = false;
        showingShop = false;
        showingRedemption = false;
        showingInventory = false;
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
            boostDays: 0,
            unlockedCrops: ['carrot', 'potato'],
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
        cleanup,
        showPanel,
    };
})();

if (typeof window !== 'undefined') {
    window.FarmGame = FarmGame;
}
