/**
 * Farm Game - Render Module
 * 渲染相关功能
 */

import { CROPS, GROWTH_STAGES, PETS } from './farm-config.js';
import { gameState, uiState } from './farm-state.js';
import {
    getGrowthStage,
    getRemainingDays,
    isRipe,
    isCropUnlocked
} from './farm-crop.js';
import { getOwnedPetCount } from './farm-shop.js';
import { getAllItems, formatItemTimestamp, getItemTypeName } from './farm-inventory.js';
import { getAllQuickSlots } from './farm-quickslot.js';
import { getSeedCount } from './farm-seed-inventory.js';
import { getPetDisplayName, loadFloatingPet, removeFloatingPet } from './farm-pet.js';

/**
 * 获取宠物图标HTML
 */
function getPetIconHTML(petId, petEmoji, className = 'shop-item-emoji') {
    // 获取图片路径
    const currentScript = document.querySelector('script[src*="farm-game.js"]');
    const basePath = currentScript ? currentScript.src.replace('farm-game.js', '') : '';

    // 如果是猫咪，使用图片
    if (petId === 'cat') {
        const petImageSrc = basePath + 'flycat.png';
        return `<span class="${className}"><img src="${petImageSrc}" class="pet-icon-img" alt="猫咪" /></span>`;
    }

    // 其他宠物使用emoji
    return `<span class="${className}">${petEmoji}</span>`;
}

/**
 * 渲染快捷栏
 */
export function renderQuickSlots() {
    const quickSlots = getAllQuickSlots();

    return quickSlots.map((cropType, index) => {
        if (cropType && CROPS[cropType]) {
            const crop = CROPS[cropType];
            const seedCount = getSeedCount(cropType);

            // 如果数量为0，清空槽位
            if (seedCount <= 0) {
                return `
                    <div class="farm-quick-slot empty"
                         data-slot-index="${index}"
                         title="空槽位">
                        <span class="quick-slot-empty">+</span>
                    </div>
                `;
            }

            const isSelected = gameState.selectedSeed === cropType;
            return `
                <div class="farm-quick-slot ${isSelected ? 'selected' : ''}"
                     data-slot-index="${index}"
                     data-crop-type="${cropType}"
                     title="${crop.name} (${seedCount}个)">
                    <span class="quick-slot-emoji">${crop.emoji}</span>
                    <span class="quick-slot-count">${seedCount}</span>
                </div>
            `;
        } else {
            return `
                <div class="farm-quick-slot empty"
                     data-slot-index="${index}"
                     title="空槽位">
                    <span class="quick-slot-empty">+</span>
                </div>
            `;
        }
    }).join('');
}

/**
 * 渲染地块
 */
export function renderPlot(plot, index) {
    let emoji = '🟫';
    let className = 'empty';

    if (plot.crop) {
        const stage = getGrowthStage(plot);
        if (stage >= 3 || isRipe(plot)) {
            emoji = CROPS[plot.crop].emoji;
            className = 'ripe';
        } else {
            emoji = GROWTH_STAGES[stage];
            className = 'growing';
        }
    }

    return `
        <div class="farm-plot ${className}" data-index="${index}">
            <span class="plot-emoji">${emoji}</span>
        </div>
    `;
}

/**
 * 渲染种子商店标签页
 */
export function renderSeedsTab() {
    return `
        <div class="farm-shop-title">🏪 种子商店</div>
        <div class="farm-shop-list">
            ${Object.entries(CROPS).map(([key, crop]) => {
                const unlocked = isCropUnlocked(key);
                const canAfford = gameState.coins >= crop.seedPrice;
                const canUnlock = !unlocked && gameState.coins >= crop.unlockCost;
                const ownedCount = getSeedCount(key);

                if (!unlocked) {
                    return `
                        <div class="farm-shop-item locked ${canUnlock ? '' : 'disabled'}" data-crop="${key}">
                            <span class="shop-item-emoji">🔒</span>
                            <div class="shop-item-info">
                                <span class="shop-item-name">${crop.name}</span>
                                <span class="shop-item-detail">解锁后可购买</span>
                            </div>
                            <button class="shop-unlock-btn ${canUnlock ? '' : 'disabled'}" data-unlock="${key}">
                                💰${crop.unlockCost} 解锁
                            </button>
                        </div>
                    `;
                }

                return `
                    <div class="farm-shop-item seed-purchase-item ${canAfford ? '' : 'disabled'}">
                        <span class="shop-item-emoji">${crop.emoji}</span>
                        <div class="shop-item-info">
                            <span class="shop-item-name">${crop.name}</span>
                            <span class="shop-item-detail">⏱${crop.growDays}天 → 💰${crop.sellPrice}</span>
                            ${ownedCount > 0 ? `<span class="shop-item-owned">拥有: ${ownedCount}个</span>` : ''}
                        </div>
                        <div class="seed-purchase-controls">
                            <span class="shop-item-price" data-crop="${key}" data-unit-price="${crop.seedPrice}">💰${crop.seedPrice}</span>
                            <div class="seed-quantity-selector">
                                <button class="qty-btn qty-minus" data-crop="${key}" data-action="minus">-</button>
                                <input type="number" class="qty-input" data-crop="${key}" value="1" min="1" max="99">
                                <button class="qty-btn qty-plus" data-crop="${key}" data-action="plus">+</button>
                            </div>
                            <button class="shop-buy-btn ${canAfford ? '' : 'disabled'}" data-crop="${key}">
                                购买
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

/**
 * 渲染兑换标签页
 */
export function renderExchangeTab() {
    return `
        <div class="farm-shop-title">🎁 兑换中心</div>
        <div class="farm-shop-list">
            ${Object.entries(PETS).map(([key, pet]) => {
                const ownedCount = getOwnedPetCount(key);
                const canExchange = pet.limit === 0 || ownedCount < pet.limit;
                const isFree = pet.cost === 0;

                return `
                    <div class="farm-shop-item exchange-item ${canExchange ? '' : 'disabled'}">
                        ${getPetIconHTML(key, pet.emoji)}
                        <div class="shop-item-info">
                            <span class="shop-item-name">${pet.name}</span>
                            <span class="shop-item-detail">${pet.description}</span>
                            ${ownedCount > 0 ? `<span class="shop-item-owned">已拥有: ${ownedCount}</span>` : ''}
                        </div>
                        <button class="shop-exchange-btn ${canExchange ? '' : 'disabled'}" data-pet="${key}">
                            ${isFree ? '🆓 免费领取' : `💰${pet.cost} 兑换`}
                        </button>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

/**
 * 渲染商店视图
 */
export function renderShopView(container) {
    container.innerHTML = `
        <div class="farm-shop-page">
            <div class="farm-shop-header">
                <button class="menu_button farm-back-btn" id="shop-back">
                    <i class="fa-solid fa-arrow-left"></i> 返回
                </button>
                <span class="farm-shop-coins">💰 ${gameState.coins}</span>
            </div>
            <div class="farm-shop-tabs">
                <button class="farm-shop-tab ${uiState.currentShopTab === 'seeds' ? 'active' : ''}" data-tab="seeds">
                    🌱 种子
                </button>
                <button class="farm-shop-tab ${uiState.currentShopTab === 'exchange' ? 'active' : ''}" data-tab="exchange">
                    🎁 兑换
                </button>
            </div>
            <div class="farm-shop-content">
                ${uiState.currentShopTab === 'seeds' ? renderSeedsTab() : renderExchangeTab()}
            </div>
        </div>
    `;
}

/**
 * 渲染库存视图
 */
export function renderInventoryView(container) {
    const items = getAllItems();
    const quickSlots = getAllQuickSlots();

    container.innerHTML = `
        <div class="farm-shop-page">
            <div class="farm-shop-header">
                <button class="menu_button farm-back-btn" id="inventory-back">
                    <i class="fa-solid fa-arrow-left"></i> 返回
                </button>
                <div class="farm-shop-stats">
                    <span class="farm-shop-coins">💰 ${gameState.coins}</span>
                    <span class="farm-shop-harvest">🏆 ${gameState.totalHarvested}</span>
                </div>
            </div>

            <div class="farm-shop-title">🎁 我的物品</div>
            <div class="farm-shop-list">
                ${items.length === 0
                    ? '<div class="farm-empty-msg">还没有任何物品哦~<br>去商店看看吧！</div>'
                    : items.map((item) => {
                        const dateStr = formatItemTimestamp(item.timestamp);
                        const typeName = getItemTypeName(item.type);
                        const isSeed = item.type === 'seed';
                        const isPet = item.type === 'pet';

                        let actionButtons = '';
                        let clickableClass = '';
                        let dataAttrs = '';

                        if (isSeed) {
                            // 种子显示快捷栏槽位按钮
                            const slotIndex = quickSlots.indexOf(item.id);
                            actionButtons = `
                                <div class="item-quickslot-btns">
                                    ${quickSlots.map((slot, idx) => {
                                        const isCurrent = slot === item.id;
                                        const isEmpty = slot === null;
                                        return `
                                            <button class="item-slot-btn ${isCurrent ? 'current' : ''} ${!isEmpty && !isCurrent ? 'occupied' : ''}"
                                                    data-crop="${item.id}"
                                                    data-slot="${idx}"
                                                    title="${isCurrent ? '当前槽位' : isEmpty ? `设置到槽位 ${idx + 1}` : `替换槽位 ${idx + 1}`}">
                                                ${idx + 1}
                                            </button>
                                        `;
                                    }).join('')}
                                </div>
                            `;
                        } else if (isPet) {
                            // 宠物可点击查看详情
                            clickableClass = 'pet-clickable';
                            dataAttrs = `data-pet-id="${item.id}" data-pet-timestamp="${item.timestamp}"`;
                            actionButtons = `<span class="shop-item-type">${typeName}</span>`;
                        } else {
                            actionButtons = `<span class="shop-item-type">${typeName}</span>`;
                        }

                        // 获取图标HTML
                        let itemIcon;
                        if (isPet) {
                            itemIcon = getPetIconHTML(item.id, item.emoji);
                        } else {
                            itemIcon = `<span class="shop-item-emoji">${item.emoji}</span>`;
                        }

                        return `
                            <div class="farm-shop-item inventory-item ${clickableClass}" ${dataAttrs}>
                                ${itemIcon}
                                <div class="shop-item-info">
                                    <span class="shop-item-name">${item.customName || item.name}</span>
                                    <span class="shop-item-detail">
                                        ${isSeed ? `数量: ${item.quantity}个` : `获得时间: ${dateStr}`}
                                    </span>
                                </div>
                                ${actionButtons}
                            </div>
                        `;
                    }).join('')
                }
            </div>
        </div>
    `;
}

/**
 * 渲染背单词视图
 */
export function renderFlashcardView(container) {
    container.innerHTML = `
        <div class="flashcard-panel-content">
            <button class="menu_button flashcard-back-btn" id="flashcard-back">
                <i class="fa-solid fa-arrow-left"></i> 返回农场
            </button>
            <div id="flashcard-container" class="flashcard-container"></div>
        </div>
    `;
}

/**
 * 渲染宠物页面
 */
export function renderPetView(container) {
    const { currentPet } = uiState;
    if (!currentPet) return;

    // 找到宠物数据
    const pet = gameState.ownedItems.find(
        item => item.type === 'pet' &&
                item.id === currentPet.id &&
                item.timestamp === currentPet.timestamp
    );

    if (!pet) {
        uiState.showingPet = false;
        return;
    }

    const petConfig = PETS[pet.id];
    const displayName = getPetDisplayName(pet);

    // 获取图片路径
    const currentScript = document.querySelector('script[src*="farm-game.js"]');
    const basePath = currentScript ? currentScript.src.replace('farm-game.js', '') : '';
    const petImageSrc = basePath + 'flycat.png';

    // 检查当前是否有悬浮宠物显示
    const floatingPetState = loadFloatingPet();
    const floatingPetElement = document.getElementById('floating-pet');
    const isDisplaying = floatingPetElement && floatingPetState && floatingPetState.petId === pet.id && floatingPetState.timestamp === pet.timestamp;
    const displayBtnText = isDisplaying ? '关闭展示' : '展示宠物';

    // 获取吐槽配置
    const commentarySettings = window.aiDictionary?.settings?.petCommentary || {};
    const commentaryEnabled = commentarySettings.enabled || false;
    const commentaryCollapsed = commentarySettings.collapsed !== false; // 默认折叠
    const autoTrigger = commentarySettings.autoTrigger || false;
    const randomTrigger = commentarySettings.randomTrigger || false;
    const randomChance = commentarySettings.randomChance ?? 30;
    const connectionProfile = commentarySettings.connectionProfile || '';
    const usePresetFile = commentarySettings.usePresetFile || false;
    const presetFileName = commentarySettings.presetFileName || '';
    const mergeChatHistory = commentarySettings.mergeChatHistory !== false;
    const systemPrompt = commentarySettings.systemPrompt || '';
    const userPrompt = commentarySettings.userPrompt || '';
    const maxMessages = commentarySettings.maxMessages ?? 10;
    const bubbleDuration = commentarySettings.bubbleDuration ?? 20;

    container.innerHTML = `
        <div class="farm-pet-page">
            <div class="farm-shop-header">
                <button class="menu_button farm-back-btn" id="pet-back">
                    <i class="fa-solid fa-arrow-left"></i> <span>返回</span>
                </button>
                <span class="farm-shop-coins">💰 ${gameState.coins}</span>
            </div>

            <div class="farm-pet-container">
                <div class="farm-pet-avatar">
                    <img src="${petImageSrc}" class="pet-emoji-large" alt="${displayName}" />
                </div>

                <div class="farm-pet-name-row">
                    <h2 class="pet-name" id="pet-name-display">${displayName}</h2>
                    <button class="pet-name-edit-btn" id="pet-name-edit" title="编辑名字">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <input type="text" class="pet-name-input" id="pet-name-input" value="${displayName}" style="display: none;">
                </div>

                <div class="farm-pet-actions">
                    <button class="menu_button pet-action-btn" id="pet-display">
                        ${isDisplaying ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>'} <span>${displayBtnText}</span>
                    </button>
                </div>

                <!-- 吐槽配置区域 -->
                <div class="farm-pet-commentary-section">
                    <div class="pet-commentary-header">
                        <label class="pet-commentary-toggle checkbox_label">
                            <input type="checkbox" id="pet-commentary-enabled" ${commentaryEnabled ? 'checked' : ''}>
                            <span>启用吐槽功能</span>
                        </label>
                        <button class="pet-commentary-collapse-btn" id="pet-commentary-collapse"
                                style="display: ${commentaryEnabled ? 'flex' : 'none'};"
                                title="${commentaryCollapsed ? '展开设置' : '折叠设置'}">
                            <i class="fa-solid ${commentaryCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
                        </button>
                    </div>

                    <div class="pet-commentary-config" id="pet-commentary-config" style="display: ${commentaryEnabled && !commentaryCollapsed ? 'block' : 'none'}">
                        <label class="pet-commentary-toggle checkbox_label">
                            <input type="checkbox" id="pet-commentary-auto" ${autoTrigger ? 'checked' : ''}>
                            <span>AI回复后自动吐槽</span>
                        </label>

                        <div class="pet-commentary-random-wrapper" id="pet-commentary-random-wrapper" style="display: ${autoTrigger ? 'flex' : 'none'}; margin-left: 24px; margin-bottom: 12px; align-items: center; gap: 6px;">
                            <label class="pet-commentary-toggle checkbox_label" style="margin-bottom: 0;">
                                <input type="checkbox" id="pet-commentary-random" ${randomTrigger ? 'checked' : ''}>
                                <span>随机</span>
                            </label>
                            <input type="number" id="pet-commentary-random-chance" class="text_pole"
                                   value="${randomChance}" min="1" max="100" style="width: 50px; padding: 4px;"
                                   ${!randomTrigger ? 'disabled' : ''}>
                            <span style="color: rgba(255,255,255,0.7);">%</span>
                        </div>

                        <div class="pet-commentary-field">
                            <label for="pet-commentary-profile">API预设:</label>
                            <select id="pet-commentary-profile" class="text_pole">
                                <option value="">使用当前连接</option>
                            </select>
                            <span class="pet-commentary-hint">选择用于吐槽的API配置</span>
                        </div>

                        <label class="pet-commentary-toggle checkbox_label" style="margin-top: 8px;">
                            <input type="checkbox" id="pet-commentary-use-preset-file" ${usePresetFile ? 'checked' : ''}>
                            <span>使用预设文件</span>
                        </label>

                        <div class="pet-commentary-field" id="pet-commentary-preset-file-wrapper" style="display: ${usePresetFile ? 'block' : 'none'}; margin-top: 8px;">
                            <label for="pet-commentary-preset-file">选择预设文件:</label>
                            <select id="pet-commentary-preset-file" class="text_pole">
                                <option value="">-- 选择预设文件 --</option>
                            </select>
                            <span class="pet-commentary-hint">使用预设文件的提示词和聊天记录格式</span>
                        </div>

                        <label class="pet-commentary-toggle checkbox_label" id="pet-commentary-merge-wrapper" style="display: ${usePresetFile ? 'flex' : 'none'}; margin-top: 8px;">
                            <input type="checkbox" id="pet-commentary-merge-chat" ${mergeChatHistory ? 'checked' : ''}>
                            <span>合并聊天记录为一条消息</span>
                        </label>

                        <div class="pet-commentary-field">
                            <label for="pet-commentary-max-messages">上下文消息数:</label>
                            <input type="number" id="pet-commentary-max-messages" class="text_pole"
                                   value="${maxMessages}" min="-1" max="999" style="width: 80px;">
                            <span class="pet-commentary-hint">发送给AI的最近消息条数，-1表示全部</span>
                        </div>

                        <div class="pet-commentary-field">
                            <label for="pet-commentary-bubble-duration">气泡持续时间:</label>
                            <input type="number" id="pet-commentary-bubble-duration" class="text_pole"
                                   value="${bubbleDuration}" min="1" max="999" style="width: 80px;">
                            <span class="pet-commentary-hint">吐槽文本显示多少秒后自动消失</span>
                        </div>

                        <div class="pet-commentary-field">
                            <div class="pet-commentary-label-row">
                                <label for="pet-commentary-prompt">系统提示词:</label>
                                <button class="pet-commentary-reset-btn" id="pet-commentary-reset-prompt" title="重置为默认">
                                    <i class="fa-solid fa-rotate-left"></i>
                                </button>
                            </div>
                            <textarea id="pet-commentary-prompt" class="text_pole textarea_compact"
                                      rows="4" placeholder="吐槽系统提示词...">${systemPrompt}</textarea>
                            <span class="pet-commentary-hint">变量: {{petName}} 宠物名, {{user}} 用户名</span>
                        </div>

                        <div class="pet-commentary-field">
                            <div class="pet-commentary-label-row">
                                <label for="pet-commentary-user-prompt">用户提示词:</label>
                                <button class="pet-commentary-reset-btn" id="pet-commentary-reset-user-prompt" title="重置为默认">
                                    <i class="fa-solid fa-rotate-left"></i>
                                </button>
                            </div>
                            <textarea id="pet-commentary-user-prompt" class="text_pole textarea_compact"
                                      rows="2" placeholder="用户提示词...">${userPrompt}</textarea>
                            <span class="pet-commentary-hint">作为最后一条消息发送给AI</span>
                        </div>

                        <div class="pet-commentary-actions">
                            <button class="menu_button pet-commentary-test-btn" id="pet-commentary-test">
                                <i class="fa-solid fa-comment-dots"></i> <span>测试吐槽</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 填充API预设选项
    populateConnectionProfiles();
    const profileSelect = container.querySelector('#pet-commentary-profile');
    if (profileSelect && connectionProfile) {
        profileSelect.value = connectionProfile;
    }

    // 填充预设文件选项
    populatePresetFiles();
    const presetFileSelect = container.querySelector('#pet-commentary-preset-file');
    if (presetFileSelect && presetFileName) {
        presetFileSelect.value = presetFileName;
    }
}

/**
 * 填充连接配置选项
 */
function populateConnectionProfiles() {
    const select = document.getElementById('pet-commentary-profile');
    if (!select) return;

    const connectionManager = window.extension_settings?.connectionManager;
    if (connectionManager && Array.isArray(connectionManager.profiles)) {
        for (const profile of connectionManager.profiles) {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            select.appendChild(option);
        }
    }
}

/**
 * 填充预设文件选项
 */
function populatePresetFiles() {
    const select = document.getElementById('pet-commentary-preset-file');
    if (!select) return;

    // 从 SillyTavern 的预设下拉框获取所有预设名称
    const presetDropdown = document.getElementById('settings_preset_openai');
    if (!presetDropdown) {
        console.warn('[PetCommentary] settings_preset_openai dropdown not found');
        return;
    }

    const options = presetDropdown.querySelectorAll('option');
    for (const opt of options) {
        if (opt.value && opt.textContent) {
            const option = document.createElement('option');
            option.value = opt.textContent; // 使用预设名称作为值
            option.textContent = opt.textContent;
            select.appendChild(option);
        }
    }
}

/**
 * 渲染主游戏视图
 */
export function renderMainView(container) {
    const html = `
        <div class="farm-game">
            <div class="farm-header">
                <span class="farm-coins">💰 ${gameState.coins}</span>
                <div class="farm-quick-slots">
                    ${renderQuickSlots()}
                </div>
                <div class="farm-header-right">
                    <button class="farm-inventory-btn menu_button" id="farm-open-inventory" title="物品">
                        🎁
                    </button>
                    <span class="farm-boost-points ${gameState.boostDays >= 1 ? 'clickable' : ''}"
                          id="farm-boost-points"
                          title="${gameState.boostDays >= 1 ? '点击使用加速' : '加速天数'}">
                        ⚡ ${gameState.boostDays}天
                    </span>
                </div>
            </div>

            <div class="farm-grid">
                ${gameState.plots.map((plot, i) => renderPlot(plot, i)).join('')}
            </div>

            <div class="farm-status">
                ${gameState.selectedSeed
                    ? `<span class="farm-selected-seed">已选: ${CROPS[gameState.selectedSeed].emoji} ${CROPS[gameState.selectedSeed].name}</span>`
                    : '<span class="farm-no-seed">点击下方选种子</span>'}
            </div>

            <div class="farm-actions">
                <button class="farm-action-btn menu_button" id="farm-open-shop">
                    🏪 商店
                </button>
                <button class="farm-action-btn menu_button" id="farm-start-flashcard">
                    📚 背单词
                </button>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * 显示收获消息
 */
export function showHarvestMessage(crop) {
    const msg = document.createElement('div');
    msg.className = 'farm-harvest-msg';
    msg.textContent = `${crop.emoji} +$${crop.sellPrice}`;
    document.querySelector('.farm-game')?.appendChild(msg);
    setTimeout(() => msg.remove(), 1000);
}

/**
 * 显示加速消息
 */
export function showBoostMessage(wordsCompleted) {
    const msg = document.createElement('div');
    msg.className = 'farm-boost-msg';
    msg.innerHTML = `
        <div style="font-size: 24px; margin-bottom: 8px;">🎉</div>
        <div>背完 ${wordsCompleted} 个单词！</div>
        <div style="color: #ffd700; font-weight: bold;">⚡ +1 天加速点</div>
    `;
    document.querySelector('.farm-game')?.appendChild(msg);
    setTimeout(() => msg.remove(), 2500);
}

/**
 * 显示加速应用消息
 */
export function showBoostAppliedMessage() {
    const msg = document.createElement('div');
    msg.className = 'farm-harvest-msg';
    msg.textContent = '⚡ +1天';
    document.querySelector('.farm-game')?.appendChild(msg);
    setTimeout(() => msg.remove(), 1000);
}

/**
 * 显示提示消息
 */
export function showMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'farm-message';
    msg.textContent = text;
    document.querySelector('.farm-shop-page')?.appendChild(msg);
    setTimeout(() => msg.remove(), 2000);
}
