/**
 * Farm Game - Pet Module
 * 宠物管理模块
 */

import { PETS } from './farm-config.js';
import { gameState } from './farm-state.js';

export const FLOATING_PET_KEY = 'ai-dict-floating-pet';
export const FLOATING_PET_POSITION_KEY = 'ai-dict-floating-pet-position';

/**
 * 获取宠物详情
 * @param {string} petId - 宠物ID
 */
export function getPetDetails(petId) {
    const petConfig = PETS[petId];
    if (!petConfig) return null;

    const ownedPets = gameState.ownedItems.filter(
        item => item.type === 'pet' && item.id === petId
    );

    return {
        id: petId,
        config: petConfig,
        ownedCount: ownedPets.length,
        pets: ownedPets
    };
}

/**
 * 获取所有拥有的宠物
 */
export function getAllOwnedPets() {
    return gameState.ownedItems.filter(item => item.type === 'pet');
}

/**
 * 重命名宠物
 * @param {string} petId - 宠物ID
 * @param {number} timestamp - 宠物获得时间戳
 * @param {string} newName - 新名字
 */
export function renamePet(petId, timestamp, newName) {
    const pet = gameState.ownedItems.find(
        item => item.type === 'pet' && item.id === petId && item.timestamp === timestamp
    );

    if (pet && newName && newName.trim()) {
        pet.customName = newName.trim();
        return true;
    }
    return false;
}

/**
 * 获取宠物显示名称
 * @param {object} pet - 宠物对象
 */
export function getPetDisplayName(pet) {
    return pet.customName || pet.name;
}

/**
 * 保存悬浮宠物状态
 */
export function saveFloatingPet(petId, timestamp, position) {
    try {
        const data = {
            petId,
            timestamp,
            position
        };
        localStorage.setItem(FLOATING_PET_KEY, JSON.stringify(data));
        // 同时保存位置到单独的 key，关闭宠物时保留
        localStorage.setItem(FLOATING_PET_POSITION_KEY, JSON.stringify(position));
    } catch (e) {
        console.warn('[FarmGame] Failed to save floating pet:', e);
    }
}

/**
 * 加载悬浮宠物状态
 */
export function loadFloatingPet() {
    try {
        const saved = localStorage.getItem(FLOATING_PET_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.warn('[FarmGame] Failed to load floating pet:', e);
    }
    return null;
}

/**
 * 加载悬浮宠物位置
 */
export function loadFloatingPetPosition() {
    try {
        const saved = localStorage.getItem(FLOATING_PET_POSITION_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.warn('[FarmGame] Failed to load floating pet position:', e);
    }
    return null;
}

/**
 * 移除悬浮宠物状态
 */
export function removeFloatingPet() {
    try {
        localStorage.removeItem(FLOATING_PET_KEY);
    } catch (e) {
        console.warn('[FarmGame] Failed to remove floating pet:', e);
    }
}

/**
 * 创建悬浮宠物元素
 */
export function createFloatingPet(petId, timestamp) {
    const pet = gameState.ownedItems.find(
        item => item.type === 'pet' && item.id === petId && item.timestamp === timestamp
    );

    if (!pet) return null;

    // 获取保存的位置或使用默认位置
    // 优先使用上次保存的位置（即使宠物被关闭过）
    const savedPosition = loadFloatingPetPosition();
    const position = savedPosition || { x: window.innerWidth - 150, y: 100 };

    // 获取图片路径
    const currentScript = document.querySelector('script[src*="farm-game.js"]');
    const basePath = currentScript ? currentScript.src.replace('farm-game.js', '') : '';
    const petImageSrc = basePath + 'flycat.gif';

    // 创建悬浮元素
    const floatingPet = document.createElement('div');
    floatingPet.id = 'floating-pet';
    floatingPet.className = 'floating-pet';
    floatingPet.style.left = position.x + 'px';
    floatingPet.style.top = position.y + 'px';

    floatingPet.innerHTML = `
        <img src="${petImageSrc}" class="floating-pet-img" alt="${getPetDisplayName(pet)}" draggable="false" />
    `;

    document.body.appendChild(floatingPet);

    // 绑定拖动事件
    bindFloatingPetDrag(floatingPet, petId, timestamp);

    // 保存状态
    saveFloatingPet(petId, timestamp, position);

    return floatingPet;
}

/**
 * 绑定拖动事件
 */
function bindFloatingPetDrag(element, petId, timestamp) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    const img = element.querySelector('.floating-pet-img');

    // 鼠标事件
    img.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    // 触摸事件（移动端支持）
    img.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', dragEnd);

    function getPointerPosition(e) {
        if (e.touches && e.touches.length > 0) {
            return {
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
            };
        }
        return {
            clientX: e.clientX,
            clientY: e.clientY
        };
    }

    function dragStart(e) {
        const pos = getPointerPosition(e);
        initialX = pos.clientX - element.offsetLeft;
        initialY = pos.clientY - element.offsetTop;
        isDragging = true;
        element.style.cursor = 'grabbing';

        if (e.cancelable) {
            e.preventDefault();
        }
    }

    function drag(e) {
        if (!isDragging) return;

        if (e.cancelable) {
            e.preventDefault();
        }

        const pos = getPointerPosition(e);
        currentX = pos.clientX - initialX;
        currentY = pos.clientY - initialY;

        // 限制在窗口范围内
        const maxX = window.innerWidth - element.offsetWidth;
        const maxY = window.innerHeight - element.offsetHeight;
        currentX = Math.max(0, Math.min(currentX, maxX));
        currentY = Math.max(0, Math.min(currentY, maxY));

        element.style.left = currentX + 'px';
        element.style.top = currentY + 'px';
    }

    function dragEnd() {
        if (!isDragging) return;

        isDragging = false;
        element.style.cursor = 'grab';

        // 保存位置
        const position = {
            x: parseInt(element.style.left),
            y: parseInt(element.style.top)
        };
        saveFloatingPet(petId, timestamp, position);
    }
}

/**
 * 检查并恢复悬浮宠物
 */
export function restoreFloatingPet() {
    const saved = loadFloatingPet();
    if (saved && saved.petId && saved.timestamp) {
        // 检查宠物是否还存在
        const pet = gameState.ownedItems.find(
            item => item.type === 'pet' &&
                    item.id === saved.petId &&
                    item.timestamp === saved.timestamp
        );

        if (pet) {
            // 移除已存在的悬浮宠物
            const existing = document.getElementById('floating-pet');
            if (existing) existing.remove();

            createFloatingPet(saved.petId, saved.timestamp);
        } else {
            // 宠物不存在，清除保存的状态
            removeFloatingPet();
        }
    }
}
