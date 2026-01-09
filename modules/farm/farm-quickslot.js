/**
 * Farm Game - Quick Slots Module
 * 快捷栏相关逻辑
 */

import { gameState } from './farm-state.js';
import { saveGame } from './farm-storage.js';

/**
 * 设置快捷栏槽位
 * @param {number} slotIndex - 槽位索引 (0-5)
 * @param {string|null} cropType - 作物类型，null表示清空
 */
export function setQuickSlot(slotIndex, cropType) {
    if (slotIndex < 0 || slotIndex >= gameState.quickSlots.length) {
        return false;
    }

    gameState.quickSlots[slotIndex] = cropType;
    saveGame();
    return true;
}

/**
 * 获取快捷栏槽位内容
 * @param {number} slotIndex - 槽位索引
 */
export function getQuickSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= gameState.quickSlots.length) {
        return null;
    }
    return gameState.quickSlots[slotIndex];
}

/**
 * 清空快捷栏槽位
 * @param {number} slotIndex - 槽位索引
 */
export function clearQuickSlot(slotIndex) {
    return setQuickSlot(slotIndex, null);
}

/**
 * 查找作物在快捷栏中的位置
 * @param {string} cropType - 作物类型
 * @returns {number} - 槽位索引，-1表示不在快捷栏中
 */
export function findCropInQuickSlots(cropType) {
    return gameState.quickSlots.indexOf(cropType);
}

/**
 * 从快捷栏移除作物（所有槽位）
 * @param {string} cropType - 作物类型
 */
export function removeCropFromQuickSlots(cropType) {
    let changed = false;
    for (let i = 0; i < gameState.quickSlots.length; i++) {
        if (gameState.quickSlots[i] === cropType) {
            gameState.quickSlots[i] = null;
            changed = true;
        }
    }
    if (changed) {
        saveGame();
    }
    return changed;
}

/**
 * 获取所有快捷栏槽位
 */
export function getAllQuickSlots() {
    return gameState.quickSlots;
}
