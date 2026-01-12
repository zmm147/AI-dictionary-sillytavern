/**
 * AI Dictionary - Farm Game Module
 * Farm game loader and panel management
 */

import { EXTENSION_NAME } from './constants.js';

/** @type {boolean} */
let scriptLoaded = false;

/**
 * Load farm game script dynamically
 * @param {string} extensionUrl
 * @returns {Promise<void>}
 */
export async function loadFarmGameScript(extensionUrl) {
    if (window.FarmGame || scriptLoaded) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.type = 'module'; // 添加模块类型
        script.src = `${extensionUrl}/farm-game.js`;
        script.onload = () => {
            scriptLoaded = true;
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load farm game'));
        document.head.appendChild(script);
    });
}

/**
 * Show farm game panel
 * @param {string} extensionUrl
 */
export async function showFarmGamePanel(extensionUrl) {
    const existingPanel = document.getElementById('ai-dict-farm-panel');
    if (existingPanel) {
        existingPanel.remove();
        return;
    }

    try {
        await loadFarmGameScript(extensionUrl);
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Failed to load farm game:`, e);
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'ai-dict-farm-panel';
    panel.className = 'ai-dict-farm-panel';
    panel.innerHTML = `
        <div class="ai-dict-farm-panel-content">
            <div id="farm-game-container"></div>
        </div>
    `;

    document.body.appendChild(panel);

    if (window.FarmGame) {
        window.FarmGame.init();
    }

    panel.addEventListener('click', (e) => {
        if (e.target === panel) {
            if (window.FarmGame && typeof window.FarmGame.cleanup === 'function') {
                window.FarmGame.cleanup();
            }
            panel.remove();
        }
    });
}
