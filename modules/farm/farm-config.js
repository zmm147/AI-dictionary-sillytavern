/**
 * Farm Game - Configuration Module
 * 游戏配置和常量定义
 */

export const GRID_ROWS = 10;
export const GRID_COLS = 5;
export const GRID_SIZE = GRID_ROWS * GRID_COLS; // 总共50个地块

// 背景图片配置
export const BG_IMAGE = 'resourse/bg.jpg';
export const BG_WIDTH = 1536;
export const BG_HEIGHT = 2752;

// 种植区域配置（像素坐标）
export const PLANT_AREA = {
    left: 370,
    top: 739,
    right: 1182,
    bottom: 2289,
    cellSize: 149, // 每个格子的像素大小
};
export const SAVE_KEY = 'ai-dict-farm-game';
export const DAY_IN_MS = 24 * 60 * 60 * 1000; // 一天的毫秒数

// 作物图片资源路径（相对于扩展目录）
export const CROP_IMAGES = {
    seed: 'resourse/seed-all.png',      // 所有作物第1阶段
    tomato1: 'resourse/tomoto1.png',    // 番茄第2阶段
    tomato2: 'resourse/tomoto2.png',    // 番茄第3阶段（成熟）
    berry1: 'resourse/barry1.png',      // 其他作物第2阶段
    berry2: 'resourse/barry2.png',      // 其他作物第3阶段（成熟）
};

// 生长阶段数量（3个阶段）
export const GROWTH_STAGE_COUNT = 3;

// 作物定义（生长时间单位：天）
export const CROPS = {
    carrot: { name: '胡萝卜', emoji: '🥕', growDays: 1, sellPrice: 10, seedPrice: 5, unlocked: true },
    potato: { name: '土豆', emoji: '🥔', growDays: 1, sellPrice: 15, seedPrice: 8, unlockCost: 30 },
    cabbage: { name: '白菜', emoji: '🥬', growDays: 1.5, sellPrice: 20, seedPrice: 10, unlockCost: 50 },
    tomato: { name: '番茄', emoji: '🍅', growDays: 2, sellPrice: 30, seedPrice: 15, unlockCost: 80, useCustomSprite: true },
    corn: { name: '玉米', emoji: '🌽', growDays: 2.5, sellPrice: 45, seedPrice: 20, unlockCost: 150 },
    eggplant: { name: '茄子', emoji: '🍆', growDays: 3, sellPrice: 60, seedPrice: 25, unlockCost: 250 },
};

// 生长阶段emoji（备用，当图片无法加载时使用）
export const GROWTH_STAGES = ['🌱', '🌿', '✨'];

// 宠物定义
export const PETS = {
    cat: { name: '猫咪', emoji: '🐱', description: '可爱的小猫咪', cost: 1000, limit: 1 },
};
