/**
 * Flashcard - Utilities Module
 * 工具函数
 */

/**
 * HTML 转义
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 标准化答案文本用于比较
 * @param {string} text
 * @returns {string}
 */
export function normalizeAnswer(text) {
    return String(text || '')
        .trim()
        .replace(/^[\s"'""'']+|[\s"'""'']+$/g, '')
        .toLowerCase();
}

/**
 * 检测iOS设备（包括iPadOS）
 * @returns {boolean}
 */
export function isIosDevice() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
}

/**
 * 生成实时反馈HTML（逐字符比较）
 * @param {string} input - 用户输入
 * @param {string} target - 目标单词
 * @returns {string} 带颜色反馈的HTML字符串
 */
export function generateRealtimeFeedback(input, target) {
    if (!input || !target) return '';

    const normalizedInput = input.trim().toLowerCase();
    const normalizedTarget = target.trim().toLowerCase();

    let html = '';
    for (let i = 0; i < normalizedInput.length; i++) {
        const inputChar = normalizedInput[i];
        const targetChar = normalizedTarget[i];

        if (targetChar === undefined) {
            // 输入超出目标长度
            html += `<span class="blind-char-wrong">${escapeHtml(input[i])}</span>`;
        } else if (inputChar === targetChar) {
            html += `<span class="blind-char-correct">${escapeHtml(input[i])}</span>`;
        } else {
            html += `<span class="blind-char-wrong">${escapeHtml(input[i])}</span>`;
        }
    }

    return html;
}

/**
 * 应用连接配置文件用于AI请求
 * @param {string} profileId
 * @returns {Promise<Function>} 恢复函数
 */
export async function applyConnectionProfile(profileId) {
    const contextObj = window.SillyTavern?.getContext?.();
    const extensionSettings = contextObj?.extensionSettings || window.extension_settings;
    const connectionManager = extensionSettings?.connectionManager;
    const originalProfile = connectionManager?.selectedProfile || '';
    let profileApplied = false;

    if (profileId && connectionManager && Array.isArray(connectionManager.profiles)) {
        const profile = connectionManager.profiles.find((item) => item.id === profileId);
        const profileSelect = document.getElementById('connection_profiles');
        if (profile && profileSelect) {
            profileSelect.value = profile.id;
            profileSelect.dispatchEvent(new Event('change'));
            profileApplied = true;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }

    return async () => {
        if (profileApplied && originalProfile !== profileId) {
            const profileSelect = document.getElementById('connection_profiles');
            if (profileSelect) {
                profileSelect.value = originalProfile || '';
                profileSelect.dispatchEvent(new Event('change'));
            }
        }
    };
}
