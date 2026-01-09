/**
 * Farm Game - State Management Module
 * 游戏状态管理
 */

import { GRID_SIZE } from './farm-config.js';

// 游戏状态
export const gameState = {
    coins: 50,
    plots: [],
    selectedSeed: null,
    totalHarvested: 0,
    boostDays: 0, // 累计加速天数
    unlockedCrops: ['carrot', 'potato'], // 已解锁的作物
    ownedItems: [], // 拥有的物品 [{type: 'pet', id: 'cat', name: '猫咪', emoji: '🐱', timestamp: Date}]
    quickSlots: [null, null, null], // 快捷栏（3个槽位），存储种子类型
};

// UI 状态
export const uiState = {
    showingFlashcards: false,
    showingShop: false,
    showingInventory: false,
    showingPet: false, // 是否显示宠物页面
    currentPet: null, // 当前查看的宠物 {id, timestamp}
    flashcardStarted: false,
    currentShopTab: 'seeds', // 'seeds' 或 'exchange'
    inventoryTab: 'items', // 'items' 或 'seeds'
};

/**
 * 初始化游戏状态
 */
export function initGameState() {
    gameState.plots = [];
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        gameState.plots.push({
            crop: null,
            plantedAt: null,
            boostedDays: 0, // 该作物已使用的加速天数
        });
    }
}

/**
 * 重置游戏状态
 */
export function resetGameState() {
    gameState.coins = 50;
    gameState.plots = [];
    gameState.selectedSeed = null;
    gameState.totalHarvested = 0;
    gameState.boostDays = 0;
    gameState.unlockedCrops = ['carrot', 'potato'];
    gameState.ownedItems = [];
    gameState.quickSlots = [null, null, null];
    initGameState();
}

/**
 * 重置UI状态
 */
export function resetUIState() {
    uiState.showingFlashcards = false;
    uiState.showingShop = false;
    uiState.showingInventory = false;
    uiState.showingPet = false;
    uiState.currentPet = null;
    uiState.flashcardStarted = false;
    uiState.currentShopTab = 'seeds';
    uiState.inventoryTab = 'items';
}
