/**
 * Farm Game - Configuration Module
 * 游戏配置和常量定义
 */

export const GRID_SIZE = 4;
export const SAVE_KEY = 'ai-dict-farm-game';
export const DAY_IN_MS = 24 * 60 * 60 * 1000; // 一天的毫秒数

// 作物定义（生长时间单位：天）
export const CROPS = {
    carrot: { name: '胡萝卜', emoji: '🥕', growDays: 1, sellPrice: 10, seedPrice: 5, unlocked: true },
    potato: { name: '土豆', emoji: '🥔', growDays: 1, sellPrice: 15, seedPrice: 8, unlocked: true },
    cabbage: { name: '白菜', emoji: '🥬', growDays: 1.5, sellPrice: 20, seedPrice: 10, unlockCost: 50 },
    tomato: { name: '番茄', emoji: '🍅', growDays: 2, sellPrice: 30, seedPrice: 15, unlockCost: 100 },
    corn: { name: '玉米', emoji: '🌽', growDays: 2.5, sellPrice: 45, seedPrice: 20, unlockCost: 200 },
    eggplant: { name: '茄子', emoji: '🍆', growDays: 3, sellPrice: 60, seedPrice: 25, unlockCost: 300 },
};

export const GROWTH_STAGES = ['🌱', '🌿', '🌾', '✨'];

// 宠物定义
export const PETS = {
    cat: { name: '猫咪', emoji: '🐱', description: '可爱的小猫咪', cost: 0, limit: 1 },
};
