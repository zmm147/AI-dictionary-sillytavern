/**
 * AI Dictionary Farm Game - 农场种菜小游戏
 * 学习累了就来种种菜放松一下吧！
 * 背单词可以获得加速点！
 */

import { CROPS } from './modules/farm/farm-config.js';
import { gameState, uiState, resetGameState, resetUIState } from './modules/farm/farm-state.js';
import { saveGame, loadGame } from './modules/farm/farm-storage.js';

export { loadGame, restoreFloatingPet };

import {
    plantCrop,
    harvestCrop,
    unlockCrop,
    boostAllCrops,
    addBoost,
    isCropUnlocked
} from './modules/farm/farm-crop.js';
import { exchangePet } from './modules/farm/farm-shop.js';
import { setQuickSlot, getQuickSlot } from './modules/farm/farm-quickslot.js';
import { addSeedToInventory, consumeSeed, hasSeed } from './modules/farm/farm-seed-inventory.js';
import { renamePet, createFloatingPet, restoreFloatingPet, removeFloatingPet, loadFloatingPet, FLOATING_PET_POSITION_KEY } from './modules/farm/farm-pet.js';
import { bindPetCommentaryEvents } from './modules/farm/farm-pet-commentary.js';
import {
    renderMainView,
    renderShopView,
    renderInventoryView,
    renderFlashcardView,
    renderPetView,
    showHarvestMessage,
    showBoostMessage,
    showBoostAppliedMessage,
    showMessage,
    renderPlot
} from './modules/farm/farm-render.js';

/** @type {string} */
const FLASHCARD_SCRIPT_URL = new URL('modules/flashcard/flashcard.js', import.meta.url).href;
console.log('[FarmGame] Module loaded, FLASHCARD_SCRIPT_URL:', FLASHCARD_SCRIPT_URL);

const FarmGame = (() => {
    let gameLoop = null;

    /**
     * 主渲染函数
     */
    function render() {
        const container = document.getElementById('farm-game-container');
        if (!container) return;

        // 控制关闭按钮显示：只在主界面显示
        const closeBtn = document.querySelector('.ai-dict-farm-close-btn');
        const isMainView = !uiState.showingFlashcards && !uiState.showingPet && !uiState.showingShop && !uiState.showingInventory;
        if (closeBtn) {
            closeBtn.style.display = isMainView ? '' : 'none';
        }

        if (uiState.showingFlashcards) {
            // 只在首次显示时渲染flashcard视图，之后由Flashcard模块自行管理
            if (!uiState.flashcardStarted) {
                renderFlashcardView(container);
                uiState.flashcardStarted = true;
                loadFlashcardAndStart();
                bindFlashcardEvents();
            }
            return;
        }

        if (uiState.showingPet) {
            renderPetView(container);
            bindPetEvents();
            return;
        }

        if (uiState.showingShop) {
            renderShopView(container);
            bindShopEvents();
            return;
        }

        if (uiState.showingInventory) {
            renderInventoryView(container);
            bindInventoryEvents();
            return;
        }

        renderMainView(container);
        bindEvents();
    }

    /**
     * 只更新选中状态的UI，不重新渲染整个视图（避免闪烁）
     */
    function updateSelectionUI() {
        const hasSeedSelected = !!gameState.selectedSeed;

        // 更新游戏容器的 seed-selected 类
        const gameContainer = document.querySelector('.farm-game');
        if (gameContainer) {
            gameContainer.classList.toggle('seed-selected', hasSeedSelected);
        }

        // 更新快捷栏选中状态
        document.querySelectorAll('.farm-quick-slot').forEach(el => {
            const cropType = el.dataset.cropType;
            if (cropType) {
                el.classList.toggle('selected', gameState.selectedSeed === cropType);
            }
        });

        // 更新空地块的 show-grid 状态
        document.querySelectorAll('.farm-plot.empty').forEach(el => {
            el.classList.toggle('show-grid', hasSeedSelected);
        });
    }

    /**
     * 更新单个地块的显示（避免全量重渲染导致闪烁）
     */
    function updateSinglePlot(index) {
        const plotElement = document.querySelector(`.farm-plot[data-index="${index}"]`);
        if (!plotElement) return;

        const plot = gameState.plots[index];
        const newHtml = renderPlot(plot, index);

        // 使用临时元素避免闪烁
        const temp = document.createElement('div');
        temp.innerHTML = newHtml.trim();
        const newElement = temp.firstChild;

        // 保留事件监听器（需要重新绑定）
        plotElement.innerHTML = newElement.innerHTML;
        plotElement.className = newElement.className;

        // 重新绑定这个地块的事件
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        // 移除旧的事件监听器（通过克隆）
        const newPlotElement = plotElement.cloneNode(true);
        plotElement.parentNode.replaceChild(newPlotElement, plotElement);

        // 重新绑定事件
        let lastTapTime = 0;
        if (isTouchDevice) {
            newPlotElement.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const now = Date.now();
                if (now - lastTapTime < 300) return;
                lastTapTime = now;
                handlePlotClick(index);
            }, { passive: false });
        } else {
            newPlotElement.addEventListener('click', () => {
                handlePlotClick(index);
            });
        }

        // 更新空地块的 show-grid 状态
        if (!plot.crop) {
            newPlotElement.classList.toggle('show-grid', !!gameState.selectedSeed);
        }
    }

    /**
     * 更新金币显示
     */
    function updateCoinDisplay() {
        const coinElements = document.querySelectorAll('.farm-coins, .farm-shop-coins');
        coinElements.forEach(el => {
            el.textContent = `💰 ${gameState.coins}`;
        });
    }

    /**
     * 处理地块点击
     */
    function handlePlotClick(index) {
        const plot = gameState.plots[index];

        if (plot.crop) {
            const crop = harvestCrop(index);
            if (crop) {
                showHarvestMessage(crop);
                updateSinglePlot(index);
                updateCoinDisplay();
            }
        } else {
            if (gameState.selectedSeed && isCropUnlocked(gameState.selectedSeed)) {
                // 检查是否有种子
                if (!hasSeed(gameState.selectedSeed)) {
                    showHarvestMessage({ emoji: '❌', sellPrice: 0 });
                    const container = document.querySelector('.farm-harvest-msg');
                    if (container) container.textContent = '没有种子！';
                    return;
                }

                // 尝试种植（会扣金币）
                if (plantCrop(index, gameState.selectedSeed)) {
                    // 种植成功，消耗种子
                    consumeSeed(gameState.selectedSeed, 1);
                    updateSinglePlot(index);
                    updateCoinDisplay();
                }
            }
        }
    }

    /**
     * 绑定主界面事件
     */
    function bindEvents() {
        // 检测是否为触摸设备
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        // 地块点击
        document.querySelectorAll('.farm-plot').forEach(el => {
            let lastTapTime = 0;

            // 触摸设备使用 touchstart 防止闪烁
            if (isTouchDevice) {
                el.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    const now = Date.now();
                    if (now - lastTapTime < 300) return;
                    lastTapTime = now;
                    const index = parseInt(el.dataset.index);
                    handlePlotClick(index);
                }, { passive: false });
            } else {
                // PC端使用普通 click
                el.addEventListener('click', () => {
                    const index = parseInt(el.dataset.index);
                    handlePlotClick(index);
                });
            }
        });

        // 快捷栏点击
        document.querySelectorAll('.farm-quick-slot').forEach(el => {
            let lastTapTime = 0;

            if (isTouchDevice) {
                el.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    const now = Date.now();
                    if (now - lastTapTime < 300) return;
                    lastTapTime = now;
                    const cropType = el.dataset.cropType;
                    if (cropType && isCropUnlocked(cropType)) {
                        if (gameState.selectedSeed === cropType) {
                            gameState.selectedSeed = null;
                        } else {
                            gameState.selectedSeed = cropType;
                        }
                        updateSelectionUI();
                    } else {
                        gameState.selectedSeed = null;
                        updateSelectionUI();
                    }
                }, { passive: false });
            } else {
                // PC端使用普通 click
                el.addEventListener('click', () => {
                    const cropType = el.dataset.cropType;
                    if (cropType && isCropUnlocked(cropType)) {
                        if (gameState.selectedSeed === cropType) {
                            gameState.selectedSeed = null;
                        } else {
                            gameState.selectedSeed = cropType;
                        }
                        updateSelectionUI();
                    } else {
                        gameState.selectedSeed = null;
                        updateSelectionUI();
                    }
                });
            }
        });

        // 加速天数点击
        document.getElementById('farm-boost-points')?.addEventListener('click', (e) => {
            if (gameState.boostDays >= 1) {
                if (boostAllCrops()) {
                    showBoostAppliedMessage();
                    render();
                }
            }
        });

        // 商店按钮
        document.getElementById('farm-open-shop')?.addEventListener('click', () => {
            uiState.showingShop = true;
            render();
        });

        // 背单词按钮
        document.getElementById('farm-start-flashcard')?.addEventListener('click', () => {
            uiState.showingFlashcards = true;
            uiState.flashcardStarted = false;
            render();
        });

        // 物品按钮
        document.getElementById('farm-open-inventory')?.addEventListener('click', () => {
            uiState.showingInventory = true;
            uiState.inventoryTab = 'items';
            render();
        });

        // 关闭按钮
        document.getElementById('farm-close')?.addEventListener('click', () => {
            const panel = document.getElementById('ai-dict-farm-panel');
            if (panel) {
                cleanup();
                panel.remove();
            }
        });
    }

    /**
     * 绑定商店事件
     */
    function bindShopEvents() {
        // 返回按钮
        document.getElementById('shop-back')?.addEventListener('click', () => {
            uiState.showingShop = false;
            render();
        });

        // Tab切换
        document.querySelectorAll('.farm-shop-tab').forEach(el => {
            el.addEventListener('click', () => {
                uiState.currentShopTab = el.dataset.tab;
                render();
            });
        });

        // 种子tab相关（仅在种子tab）
        if (uiState.currentShopTab === 'seeds') {
            // 更新价格显示的辅助函数
            const updatePrice = (cropType) => {
                const input = document.querySelector(`.qty-input[data-crop="${cropType}"]`);
                const priceEl = document.querySelector(`.shop-item-price[data-crop="${cropType}"]`);
                if (input && priceEl) {
                    const quantity = parseInt(input.value) || 1;
                    const unitPrice = parseInt(priceEl.dataset.unitPrice) || 0;
                    const totalPrice = unitPrice * quantity;
                    priceEl.textContent = `💰${totalPrice}`;

                    // 更新购买按钮状态
                    const buyBtn = document.querySelector(`.shop-buy-btn[data-crop="${cropType}"]`);
                    if (buyBtn) {
                        if (gameState.coins >= totalPrice) {
                            buyBtn.classList.remove('disabled');
                        } else {
                            buyBtn.classList.add('disabled');
                        }
                    }
                }
            };

            // 数量加减按钮
            document.querySelectorAll('.qty-btn').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const cropType = el.dataset.crop;
                    const action = el.dataset.action;
                    const input = document.querySelector(`.qty-input[data-crop="${cropType}"]`);

                    if (input) {
                        let value = parseInt(input.value) || 1;
                        if (action === 'plus' && value < 99) {
                            value++;
                        } else if (action === 'minus' && value > 1) {
                            value--;
                        }
                        input.value = value;
                        updatePrice(cropType);
                    }
                });
            });

            // 数量输入框
            document.querySelectorAll('.qty-input').forEach(el => {
                el.addEventListener('change', (e) => {
                    let value = parseInt(e.target.value) || 1;
                    value = Math.max(1, Math.min(99, value));
                    e.target.value = value;
                    updatePrice(el.dataset.crop);
                });

                el.addEventListener('input', (e) => {
                    const cropType = e.target.dataset.crop;
                    updatePrice(cropType);
                });
            });

            // 购买按钮
            document.querySelectorAll('.shop-buy-btn').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (el.classList.contains('disabled')) return;

                    const cropType = el.dataset.crop;
                    const input = document.querySelector(`.qty-input[data-crop="${cropType}"]`);
                    const quantity = parseInt(input?.value) || 1;

                    if (cropType) {
                        handlePurchaseSeed(cropType, quantity);
                    }
                });
            });

            // 解锁按钮
            document.querySelectorAll('.shop-unlock-btn:not(.disabled)').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const cropKey = el.dataset.unlock;
                    if (cropKey && unlockCrop(cropKey)) {
                        render();
                    }
                });
            });
        }

        // 兑换按钮（仅在兑换tab）
        if (uiState.currentShopTab === 'exchange') {
            document.querySelectorAll('.shop-exchange-btn:not(.disabled)').forEach(el => {
                el.addEventListener('click', () => {
                    const petId = el.dataset.pet;
                    if (petId) {
                        const result = exchangePet(petId);
                        if (result.success) {
                            render();
                        }
                        showMessage(result.message);
                    }
                });
            });
        }
    }

    /**
     * 处理购买种子
     */
    function handlePurchaseSeed(cropType, quantity) {
        const crop = CROPS[cropType];
        if (!crop) return;

        const totalCost = crop.seedPrice * quantity;
        if (gameState.coins < totalCost) {
            showMessage('金币不足！');
            return;
        }

        gameState.coins -= totalCost;
        addSeedToInventory(cropType, quantity);
        showMessage(`购买成功！获得 ${crop.name} × ${quantity}`);
        render();
    }

    /**
     * 绑定库存事件
     */
    function bindInventoryEvents() {
        document.getElementById('inventory-back')?.addEventListener('click', () => {
            uiState.showingInventory = false;
            render();
        });

        // 物品快捷栏设置按钮
        document.querySelectorAll('.item-slot-btn').forEach(el => {
            el.addEventListener('click', () => {
                const cropType = el.dataset.crop;
                const slotIndex = parseInt(el.dataset.slot);

                if (cropType && slotIndex >= 0) {
                    setQuickSlot(slotIndex, cropType);
                    render();
                }
            });
        });

        // 宠物点击事件
        document.querySelectorAll('.pet-clickable').forEach(el => {
            el.addEventListener('click', () => {
                const petId = el.dataset.petId;
                const petTimestamp = parseInt(el.dataset.petTimestamp);

                if (petId && petTimestamp) {
                    uiState.currentPet = { id: petId, timestamp: petTimestamp };
                    uiState.showingPet = true;
                    render();
                }
            });
        });
    }

    /**
     * 绑定宠物页面事件
     */
    function bindPetEvents() {
        // 返回按钮
        document.getElementById('pet-back')?.addEventListener('click', () => {
            uiState.showingPet = false;
            uiState.currentPet = null;
            uiState.showingInventory = true;
            render();
        });

        // 宠物名字编辑
        const nameDisplay = document.getElementById('pet-name-display');
        const nameInput = document.getElementById('pet-name-input');
        const nameEditBtn = document.getElementById('pet-name-edit');

        nameEditBtn?.addEventListener('click', () => {
            if (nameDisplay && nameInput) {
                nameDisplay.style.display = 'none';
                nameEditBtn.style.display = 'none';
                nameInput.style.display = 'block';
                nameInput.focus();
                nameInput.select();
            }
        });

        nameInput?.addEventListener('blur', () => {
            finishNameEdit();
        });

        nameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameInput.blur();
            } else if (e.key === 'Escape') {
                // 取消编辑，恢复原名
                const { currentPet } = uiState;
                if (currentPet) {
                    const pet = gameState.ownedItems.find(
                        item => item.type === 'pet' &&
                                item.id === currentPet.id &&
                                item.timestamp === currentPet.timestamp
                    );
                    if (pet) {
                        nameInput.value = getPetDisplayName(pet);
                    }
                }
                nameInput.blur();
            }
        });

        function finishNameEdit() {
            const newName = nameInput?.value?.trim();
            if (newName && nameDisplay && nameInput && nameEditBtn) {
                const { currentPet } = uiState;
                if (currentPet && renamePet(currentPet.id, currentPet.timestamp, newName)) {
                    saveGame();
                    nameDisplay.textContent = newName;
                }
                nameDisplay.style.display = 'block';
                nameEditBtn.style.display = 'flex';
                nameInput.style.display = 'none';
            }
        }

        // 展示按钮
        document.getElementById('pet-display')?.addEventListener('click', () => {
            const { currentPet } = uiState;
            if (currentPet) {
                const existing = document.getElementById('floating-pet');

                if (existing) {
                    // 如果已有悬浮宠物，移除 DOM 元素和状态，但保留位置信息
                    existing.remove();
                    removeFloatingPet();
                } else {
                    // 如果没有悬浮宠物，创建新的
                    createFloatingPet(currentPet.id, currentPet.timestamp);
                }

                // 返回背包界面
                uiState.showingPet = false;
                uiState.currentPet = null;
                uiState.showingInventory = true;
                render();
            }
        });

        // 绑定吐槽配置事件
        bindPetCommentaryEvents();
    }

    /**
     * 导航到宠物详情页
     */
    function navigateToPet(petId, timestamp) {
        uiState.currentPet = { id: petId, timestamp: timestamp };
        uiState.showingPet = true;
        uiState.showingInventory = false;
        uiState.showingShop = false;
        uiState.showingFlashcards = false;
        render();
    }

    /**
     * 绑定背单词事件
     */
    function bindFlashcardEvents() {
        const backBtn = document.getElementById('flashcard-back');
        if (backBtn && !backBtn.hasAttribute('data-bound')) {
            backBtn.setAttribute('data-bound', 'true');
            backBtn.addEventListener('click', () => {
                uiState.showingFlashcards = false;
                uiState.flashcardStarted = false;
                render();
            });
        }
    }

    /**
     * 显示背单词加载失败提示
     * @param {string} message
     */
    function showFlashcardLoadError(message) {
        const container = document.getElementById('flashcard-container');
        if (!container) return;

        container.innerHTML = `
            <div class="flashcard-empty">
                <div class="flashcard-empty-icon">⚠️</div>
                <div class="flashcard-empty-text">${message}</div>
                <div class="flashcard-empty-stats">请刷新页面或稍后再试。</div>
            </div>
        `;
    }

    /**
     * 加载并启动背单词
     */
    async function loadFlashcardAndStart() {
        const startFlashcard = async () => {
            try {
                await window.Flashcard.start(onFlashcardComplete);
            } catch (error) {
                console.error('[FarmGame] Flashcard start error:', error);
                showFlashcardLoadError('背单词启动失败');
            }
        };

        if (!window.Flashcard) {
            try {
                console.log('[FarmGame] Loading flashcard from:', FLASHCARD_SCRIPT_URL);
                const script = document.createElement('script');
                script.type = 'module'; // ES6 模块
                script.src = FLASHCARD_SCRIPT_URL;
                script.onload = () => {
                    // 模块加载后需要等待一下让 window.Flashcard 被设置
                    setTimeout(() => {
                        console.log('[FarmGame] Flashcard script loaded, window.Flashcard:', !!window.Flashcard);
                        if (window.Flashcard) {
                            startFlashcard();
                        } else {
                            console.error('[FarmGame] window.Flashcard is not defined after script load');
                            showFlashcardLoadError('背单词加载失败');
                        }
                    }, 100);
                };
                script.onerror = (e) => {
                    console.error('[FarmGame] Failed to load flashcard script:', e);
                    showFlashcardLoadError('背单词加载失败');
                };
                document.head.appendChild(script);
            } catch (e) {
                console.error('[FarmGame] Failed to load flashcard:', e);
                showFlashcardLoadError('背单词加载失败');
            }
        } else {
            await startFlashcard();
        }
    }

    /**
     * 背单词完成回调
     */
    function onFlashcardComplete(wordsCompleted) {
        if (wordsCompleted > 0) {
            addBoost(1);
            // 在flashcard视图下不显示boost消息
            // 用户在flashcard界面已经知道完成了，返回农场时会看到加速点增加
        }
    }

    /**
     * 游戏循环
     */
    function startGameLoop() {
        if (gameLoop) return;
        gameLoop = setInterval(() => {
            if (document.getElementById('farm-game-container') && !uiState.showingFlashcards) {
                saveGame();
            }
        }, 300000); // 每5分钟自动保存一次
    }

    function stopGameLoop() {
        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
    }

    /**
     * 清理
     */
    function cleanup() {
        stopGameLoop();
        if (window.Flashcard && typeof window.Flashcard.stopReviewTimer === 'function') {
            window.Flashcard.stopReviewTimer();
        }
        resetUIState();
    }

    /**
     * 初始化
     */
    function init() {
        resetUIState();
        loadGame();
        gameState.selectedSeed = null;
        restoreFloatingPet(); // 恢复悬浮宠物
        render();
        startGameLoop();
    }

    /**
     * 重置游戏
     */
    function reset() {
        if (!confirm('确定要重置游戏吗？所有进度将丢失！')) return;
        resetGameState();
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
        loadGame,
        restoreFloatingPet,
        navigateToPet,
    };
})();

if (typeof window !== 'undefined') {
    window.FarmGame = FarmGame;
    window.CROPS = CROPS;
}
