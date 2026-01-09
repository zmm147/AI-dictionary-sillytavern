/**
 * Farm Game - Storage Module
 * 游戏存储模块
 */

import { SAVE_KEY, GRID_SIZE } from './farm-config.js';
import { gameState, initGameState } from './farm-state.js';

/**
 * 保存游戏
 */
export function saveGame() {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
    } catch (e) {
        console.warn('[FarmGame] Save failed:', e);
    }
}

/**
 * 加载游戏
 */
export function loadGame() {
    try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            Object.assign(gameState, data);

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
            if (!Array.isArray(gameState.ownedItems)) {
                gameState.ownedItems = [];
            }
            if (!Array.isArray(gameState.quickSlots) || gameState.quickSlots.length !== 3) {
                gameState.quickSlots = [null, null, null];
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
