/**
 * Farm Game - Inventory Module
 * 库存相关逻辑
 */

import { gameState } from './farm-state.js';

/**
 * 获取所有物品
 */
export function getAllItems() {
    return gameState.ownedItems || [];
}

/**
 * 获取物品数量
 */
export function getItemCount() {
    return gameState.ownedItems ? gameState.ownedItems.length : 0;
}

/**
 * 按类型获取物品
 */
export function getItemsByType(type) {
    return gameState.ownedItems.filter(item => item.type === type);
}

/**
 * 格式化物品时间戳
 */
export function formatItemTimestamp(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 获取物品类型名称
 */
export function getItemTypeName(type) {
    const typeNames = {
        'pet': '宠物',
        'item': '物品',
        'decoration': '装饰',
    };
    return typeNames[type] || '物品';
}
