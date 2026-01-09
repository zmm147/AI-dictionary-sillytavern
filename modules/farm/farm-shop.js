/**
 * Farm Game - Shop Module
 * 商店相关逻辑
 */

import { PETS } from './farm-config.js';
import { gameState } from './farm-state.js';
import { saveGame } from './farm-storage.js';

/**
 * 兑换宠物
 */
export function exchangePet(petId) {
    const pet = PETS[petId];
    if (!pet) return { success: false, message: '宠物不存在' };

    const ownedCount = gameState.ownedItems.filter(
        item => item.type === 'pet' && item.id === petId
    ).length;

    if (pet.limit > 0 && ownedCount >= pet.limit) {
        return { success: false, message: '已达到兑换上限！' };
    }

    if (pet.cost > 0 && gameState.coins < pet.cost) {
        return { success: false, message: '金币不足！' };
    }

    if (pet.cost > 0) {
        gameState.coins -= pet.cost;
    }

    gameState.ownedItems.push({
        type: 'pet',
        id: petId,
        name: pet.name,
        emoji: pet.emoji,
        timestamp: Date.now()
    });

    saveGame();
    return { success: true, message: `${pet.emoji} 兑换成功！`, pet };
}

/**
 * 获取已拥有的宠物数量
 */
export function getOwnedPetCount(petId) {
    return gameState.ownedItems.filter(
        item => item.type === 'pet' && item.id === petId
    ).length;
}

/**
 * 检查是否可以兑换
 */
export function canExchange(petId) {
    const pet = PETS[petId];
    if (!pet) return false;

    const ownedCount = getOwnedPetCount(petId);
    if (pet.limit > 0 && ownedCount >= pet.limit) return false;
    if (pet.cost > 0 && gameState.coins < pet.cost) return false;

    return true;
}
