/**
 * Farm Game - Seed Inventory Module
 * 种子库存管理
 */

import { CROPS } from './farm-config.js';
import { gameState } from './farm-state.js';
import { saveGame } from './farm-storage.js';

/**
 * 添加种子到库存
 * @param {string} cropType - 作物类型
 * @param {number} quantity - 数量
 */
export function addSeedToInventory(cropType, quantity = 1) {
    const crop = CROPS[cropType];
    if (!crop) return false;

    // 查找是否已有该种子
    const existingItem = gameState.ownedItems.find(
        item => item.type === 'seed' && item.id === cropType
    );

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        gameState.ownedItems.push({
            type: 'seed',
            id: cropType,
            name: crop.name,
            emoji: crop.emoji,
            quantity: quantity,
            timestamp: Date.now()
        });
    }

    saveGame();
    return true;
}

/**
 * 消耗种子
 * @param {string} cropType - 作物类型
 * @param {number} quantity - 数量
 */
export function consumeSeed(cropType, quantity = 1) {
    const seedItem = gameState.ownedItems.find(
        item => item.type === 'seed' && item.id === cropType
    );

    if (!seedItem || seedItem.quantity < quantity) {
        return false;
    }

    seedItem.quantity -= quantity;

    // 如果数量为0，从背包移除
    if (seedItem.quantity <= 0) {
        const index = gameState.ownedItems.indexOf(seedItem);
        gameState.ownedItems.splice(index, 1);

        // 从快捷栏中移除该种子
        gameState.quickSlots = gameState.quickSlots.map(slot =>
            slot === cropType ? null : slot
        );
    }

    saveGame();
    return true;
}

/**
 * 获取种子数量
 * @param {string} cropType - 作物类型
 */
export function getSeedCount(cropType) {
    const seedItem = gameState.ownedItems.find(
        item => item.type === 'seed' && item.id === cropType
    );
    return seedItem ? seedItem.quantity : 0;
}

/**
 * 检查是否有种子
 * @param {string} cropType - 作物类型
 */
export function hasSeed(cropType) {
    return getSeedCount(cropType) > 0;
}

/**
 * 获取所有种子
 */
export function getAllSeeds() {
    return gameState.ownedItems.filter(item => item.type === 'seed');
}
