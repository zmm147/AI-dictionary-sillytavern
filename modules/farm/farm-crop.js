/**
 * Farm Game - Crop Logic Module
 * 作物相关逻辑
 */

import { CROPS, DAY_IN_MS } from './farm-config.js';
import { gameState } from './farm-state.js';
import { saveGame } from './farm-storage.js';

/**
 * 获取作物生长进度（0-1）
 */
export function getGrowthProgress(plot) {
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
export function getGrowthStage(plot) {
    const progress = getGrowthProgress(plot);
    return Math.floor(progress * 3);
}

/**
 * 获取剩余生长时间（天）
 */
export function getRemainingDays(plot) {
    if (!plot.crop || !plot.plantedAt) return 0;
    const cropInfo = CROPS[plot.crop];
    const elapsedMs = Date.now() - plot.plantedAt;
    const elapsedDays = elapsedMs / DAY_IN_MS;
    const totalDays = elapsedDays + (plot.boostedDays || 0);
    return Math.max(0, cropInfo.growDays - totalDays);
}

/**
 * 判断作物是否成熟
 */
export function isRipe(plot) {
    return getGrowthProgress(plot) >= 1;
}

/**
 * 检查作物是否已解锁
 */
export function isCropUnlocked(cropKey) {
    return gameState.unlockedCrops.includes(cropKey) || CROPS[cropKey].unlocked;
}

/**
 * 解锁作物
 */
export function unlockCrop(cropKey) {
    const crop = CROPS[cropKey];
    if (!crop || !crop.unlockCost) return false;
    if (gameState.unlockedCrops.includes(cropKey)) return false;
    if (gameState.coins < crop.unlockCost) return false;

    gameState.coins -= crop.unlockCost;
    gameState.unlockedCrops.push(cropKey);
    saveGame();
    return true;
}

/**
 * 种植作物
 */
export function plantCrop(index, cropType) {
    const crop = CROPS[cropType];
    if (gameState.coins < crop.seedPrice) return false;
    if (!isCropUnlocked(cropType)) return false;

    gameState.coins -= crop.seedPrice;
    gameState.plots[index] = {
        crop: cropType,
        plantedAt: Date.now(),
        boostedDays: 0,
    };

    saveGame();
    return true;
}

/**
 * 收获作物
 */
export function harvestCrop(index) {
    const plot = gameState.plots[index];
    if (!plot.crop || !isRipe(plot)) return null;

    const crop = CROPS[plot.crop];
    gameState.coins += crop.sellPrice;
    gameState.totalHarvested++;

    gameState.plots[index] = {
        crop: null,
        plantedAt: null,
        boostedDays: 0,
    };

    saveGame();
    return crop;
}

/**
 * 添加加速天数
 */
export function addBoost(days) {
    gameState.boostDays += days;
    saveGame();
}

/**
 * 对所有已种植的作物使用加速
 */
export function boostAllCrops() {
    if (gameState.boostDays < 1) return false;

    gameState.boostDays -= 1;

    // 为所有已种植且未成熟的作物增加1天加速
    gameState.plots.forEach(plot => {
        if (plot.crop && !isRipe(plot)) {
            plot.boostedDays = (plot.boostedDays || 0) + 1;
        }
    });

    saveGame();
    return true;
}
