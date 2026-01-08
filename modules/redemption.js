/**
 * AI Dictionary - Redemption System
 * 兑换系统 - 兑换桌宠等道具
 */

const Redemption = (() => {
    const SAVE_KEY = 'ai-dict-redemption';
    const PETS = {
        cat: {
            id: 'cat',
            name: '猫咪',
            emoji: '🐱',
            description: '可爱的猫咪，会在你查询单词时喵喵叫',
            price: 0,
            type: 'pet',
        },
        dog: {
            id: 'dog',
            name: '小狗',
            emoji: '🐶',
            description: '忠诚的小狗，会陪你一起学习',
            price: 0,
            type: 'pet',
        },
        rabbit: {
            id: 'rabbit',
            name: '兔子',
            emoji: '🐰',
            description: '活泼的兔子，繁殖能力强',
            price: 0,
            type: 'pet',
        },
        hamster: {
            id: 'hamster',
            name: '仓鼠',
            emoji: '🐹',
            description: '可爱的仓鼠，喜欢跑轮子',
            price: 0,
            type: 'pet',
        },
        fox: {
            id: 'fox',
            name: '狐狸',
            emoji: '🦊',
            description: '聪明的狐狸，会提醒你背单词',
            price: 0,
            type: 'pet',
        },
        panda: {
            id: 'panda',
            name: '熊猫',
            emoji: '🐼',
            description: '慵懒的熊猫，最喜欢吃竹子',
            price: 0,
            type: 'pet',
        },
    };

    let gameState = {
        redeemedItems: [], // 已兑换的物品ID列表
    };

    let currentView = 'list'; // list 或 inventory
    let onItemRedeemed = null;

    function loadGame() {
        try {
            const saved = localStorage.getItem(SAVE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                gameState = { ...gameState, ...data };
                if (!Array.isArray(gameState.redeemedItems)) {
                    gameState.redeemedItems = [];
                }
            }
        } catch (e) {
            console.warn('[Redemption] Load failed:', e);
        }
    }

    function saveGame() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
        } catch (e) {
            console.warn('[Redemption] Save failed:', e);
        }
    }

    function isRedeemed(itemId) {
        return gameState.redeemedItems.includes(itemId);
    }

    function redeemItem(itemId) {
        const item = PETS[itemId];
        if (!item) return false;
        if (isRedeemed(itemId)) return false;

        gameState.redeemedItems.push(itemId);
        saveGame();
        return true;
    }

    function getRedeemedItems() {
        return gameState.redeemedItems.map(id => PETS[id]).filter(Boolean);
    }

    function setOnItemRedeemed(callback) {
        onItemRedeemed = callback;
    }

    function showPanel(container) {
        currentView = 'list';
        renderPanel(container);
    }

    function switchView(view) {
        currentView = view;
        const container = document.getElementById('redemption-panel-container');
        if (container) {
            renderPanel(container);
        }
    }

    function renderPanel(container) {
        if (currentView === 'list') {
            renderRedeemList(container);
        } else {
            renderInventory(container);
        }
    }

    function renderRedeemList(container) {
        container.innerHTML = `
            <div class="redemption-panel">
                <div class="redemption-header">
                    <button class="menu_button redemption-back-btn" id="redemption-back">
                        <i class="fa-solid fa-arrow-left"></i> 返回
                    </button>
                    <div class="redemption-title">🎁 免费兑换</div>
                    <button class="menu_button redemption-inventory-btn" id="redemption-to-inventory">
                        🎒 我的物品
                    </button>
                </div>
                <div class="redemption-list">
                    ${Object.values(PETS).map(item => renderRedeemItem(item)).join('')}
                </div>
            </div>
        `;

        bindRedeemEvents(container);
    }

    function renderRedeemItem(item) {
        const redeemed = isRedeemed(item.id);
        return `
            <div class="redemption-item ${redeemed ? 'redeemed' : ''}" data-id="${item.id}">
                <div class="redemption-item-emoji">${item.emoji}</div>
                <div class="redemption-item-info">
                    <div class="redemption-item-name">${item.name}</div>
                    <div class="redemption-item-desc">${item.description}</div>
                </div>
                <button class="redemption-redeem-btn ${redeemed ? 'disabled' : ''}"
                        data-id="${item.id}" ${redeemed ? 'disabled' : ''}>
                    ${redeemed ? '已兑换' : '免费兑换'}
                </button>
            </div>
        `;
    }

    function renderInventory(container) {
        const items = getRedeemedItems();

        container.innerHTML = `
            <div class="redemption-panel">
                <div class="redemption-header">
                    <button class="menu_button redemption-back-btn" id="redemption-back">
                        <i class="fa-solid fa-arrow-left"></i> 返回
                    </button>
                    <div class="redemption-title">🎒 我的物品</div>
                    <button class="menu_button redemption-list-btn" id="redemption-to-list">
                        🎁 兑换中心
                    </button>
                </div>
                <div class="redemption-inventory">
                    ${items.length > 0
                        ? items.map(item => renderInventoryItem(item)).join('')
                        : '<div class="redemption-empty">还没有兑换任何物品，去兑换中心看看吧！</div>'
                    }
                </div>
            </div>
        `;

        bindInventoryEvents(container);
    }

    function renderInventoryItem(item) {
        return `
            <div class="redemption-inventory-item" data-id="${item.id}">
                <div class="inventory-item-emoji">${item.emoji}</div>
                <div class="inventory-item-info">
                    <div class="inventory-item-name">${item.name}</div>
                    <div class="inventory-item-desc">${item.description}</div>
                </div>
            </div>
        `;
    }

    function bindRedeemEvents(container) {
        document.getElementById('redemption-back')?.addEventListener('click', () => {
            if (window.FarmGame) {
                window.FarmGame.showPanel();
            }
        });

        document.getElementById('redemption-to-inventory')?.addEventListener('click', () => {
            switchView('inventory');
        });

        container.querySelectorAll('.redemption-redeem-btn:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = btn.dataset.id;
                if (redeemItem(itemId)) {
                    showRedeemSuccess(itemId);
                    renderPanel(container);
                    if (onItemRedeemed) {
                        onItemRedeemed(itemId);
                    }
                }
            });
        });
    }

    function bindInventoryEvents(container) {
        document.getElementById('redemption-back')?.addEventListener('click', () => {
            if (window.FarmGame) {
                window.FarmGame.showPanel();
            }
        });

        document.getElementById('redemption-to-list')?.addEventListener('click', () => {
            switchView('list');
        });
    }

    function showRedeemSuccess(itemId) {
        const item = PETS[itemId];
        if (!item) return;

        const msg = document.createElement('div');
        msg.className = 'redemption-success-msg';
        msg.innerHTML = `
            <div class="success-icon">🎉</div>
            <div class="success-text">成功兑换 ${item.emoji} ${item.name}！</div>
        `;
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2000);
    }

    function init() {
        loadGame();
    }

    function reset() {
        gameState = { redeemedItems: [] };
        saveGame();
    }

    return {
        init,
        reset,
        showPanel,
        redeemItem,
        getRedeemedItems,
        isRedeemed,
        setOnItemRedeemed,
    };
})();

if (typeof window !== 'undefined') {
    window.Redemption = Redemption;
}
