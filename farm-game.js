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
import {
    renderMainView,
    renderShopView,
    renderInventoryView,
    renderFlashcardView,
    renderPetView,
    showHarvestMessage,
    showBoostMessage,
    showBoostAppliedMessage,
    showMessage
} from './modules/farm/farm-render.js';

const FarmGame = (() => {
    let gameLoop = null;

    /**
     * 主渲染函数
     */
    function render() {
        const container = document.getElementById('farm-game-container');
        if (!container) return;

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
     * 绑定主界面事件
     */
    function bindEvents() {
        // 地块点击
        document.querySelectorAll('.farm-plot').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                handlePlotClick(index);
            });
        });

        // 快捷栏点击
        document.querySelectorAll('.farm-quick-slot').forEach(el => {
            el.addEventListener('click', () => {
                const slotIndex = parseInt(el.dataset.slotIndex);
                const cropType = el.dataset.cropType;
                if (cropType && isCropUnlocked(cropType)) {
                    gameState.selectedSeed = cropType;
                    render();
                }
            });
        });

        // 加速天数点击
        document.getElementById('farm-boost-points')?.addEventListener('click', () => {
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
            uiState.inventoryTab = 'items'; // 默认显示物品页
            render();
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

        // 重命名按钮
        document.getElementById('pet-rename')?.addEventListener('click', () => {
            const newName = prompt('请输入新名字：');
            if (newName && newName.trim()) {
                const { currentPet } = uiState;
                if (currentPet && renamePet(currentPet.id, currentPet.timestamp, newName)) {
                    saveGame();
                    render();
                }
            }
        });

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

        // ===== 吐槽配置事件 =====

        // 启用吐槽功能复选框
        const enabledCheckbox = document.getElementById('pet-commentary-enabled');
        const configContainer = document.getElementById('pet-commentary-config');

        enabledCheckbox?.addEventListener('change', () => {
            const settings = window.aiDictionary?.settings;
            if (settings && settings.petCommentary) {
                settings.petCommentary.enabled = enabledCheckbox.checked;
                window.aiDictionary.saveSettings?.();

                // 显示/隐藏配置区域
                if (configContainer) {
                    configContainer.style.display = enabledCheckbox.checked ? 'block' : 'none';
                }
            }
        });

        // 自动吐槽复选框
        document.getElementById('pet-commentary-auto')?.addEventListener('change', (e) => {
            const settings = window.aiDictionary?.settings;
            if (settings && settings.petCommentary) {
                settings.petCommentary.autoTrigger = e.target.checked;
                window.aiDictionary.saveSettings?.();
            }
        });

        // API预设选择
        document.getElementById('pet-commentary-profile')?.addEventListener('change', (e) => {
            const settings = window.aiDictionary?.settings;
            if (settings && settings.petCommentary) {
                settings.petCommentary.connectionProfile = e.target.value;
                window.aiDictionary.saveSettings?.();
            }
        });

        // 上下文消息数
        document.getElementById('pet-commentary-max-messages')?.addEventListener('change', (e) => {
            const settings = window.aiDictionary?.settings;
            if (settings && settings.petCommentary) {
                settings.petCommentary.maxMessages = parseInt(e.target.value) || 10;
                window.aiDictionary.saveSettings?.();
            }
        });

        // 系统提示词
        document.getElementById('pet-commentary-prompt')?.addEventListener('change', (e) => {
            const settings = window.aiDictionary?.settings;
            if (settings && settings.petCommentary) {
                settings.petCommentary.systemPrompt = e.target.value;
                window.aiDictionary.saveSettings?.();
            }
        });

        // 重置提示词按钮
        document.getElementById('pet-commentary-reset-prompt')?.addEventListener('click', () => {
            const settings = window.aiDictionary?.settings;
            const defaultPrompt = window.aiDictionary?.defaultSettings?.petCommentary?.systemPrompt || '';

            if (settings && settings.petCommentary) {
                settings.petCommentary.systemPrompt = defaultPrompt;
                window.aiDictionary.saveSettings?.();

                const textarea = document.getElementById('pet-commentary-prompt');
                if (textarea) {
                    textarea.value = defaultPrompt;
                }
            }
        });

        // 测试吐槽按钮
        document.getElementById('pet-commentary-test')?.addEventListener('click', () => {
            if (typeof window.triggerPetCommentary === 'function') {
                window.triggerPetCommentary();
            } else {
                console.warn('[FarmGame] triggerPetCommentary not available');
                alert('吐槽功能未初始化，请先展示宠物后再试。');
            }
        });
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
     * 处理地块点击
     */
    function handlePlotClick(index) {
        const plot = gameState.plots[index];

        if (plot.crop) {
            const crop = harvestCrop(index);
            if (crop) {
                showHarvestMessage(crop);
                render();
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
                    render();
                }
            }
        }
    }

    /**
     * 加载并启动背单词
     */
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
