/**
 * Farm Game - Pet Commentary Module
 * 宠物吐槽配置模块
 */

/**
 * 绑定宠物吐槽配置事件
 */
export function bindPetCommentaryEvents() {
    // 启用吐槽功能复选框
    const enabledCheckbox = document.getElementById('pet-commentary-enabled');
    const configContainer = document.getElementById('pet-commentary-config');
    const collapseBtn = document.getElementById('pet-commentary-collapse');

    enabledCheckbox?.addEventListener('change', () => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            settings.petCommentary.enabled = enabledCheckbox.checked;
            window.aiDictionary.saveSettings?.();

            // 显示/隐藏折叠按钮
            if (collapseBtn) {
                collapseBtn.style.display = enabledCheckbox.checked ? 'flex' : 'none';
            }

            // 显示/隐藏配置区域（根据折叠状态）
            if (configContainer) {
                const isCollapsed = settings.petCommentary.collapsed !== false;
                configContainer.style.display = enabledCheckbox.checked && !isCollapsed ? 'block' : 'none';
            }
        }
    });

    // 折叠/展开按钮
    collapseBtn?.addEventListener('click', () => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            const isCollapsed = settings.petCommentary.collapsed !== false;
            settings.petCommentary.collapsed = !isCollapsed;
            window.aiDictionary.saveSettings?.();

            // 更新UI
            if (configContainer) {
                configContainer.style.display = isCollapsed ? 'block' : 'none';
            }
            const icon = collapseBtn.querySelector('i');
            if (icon) {
                icon.className = isCollapsed ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
            }
            collapseBtn.title = isCollapsed ? '折叠设置' : '展开设置';
        }
    });

    // 自动吐槽复选框
    document.getElementById('pet-commentary-auto')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            settings.petCommentary.autoTrigger = e.target.checked;
            window.aiDictionary.saveSettings?.();
        }
        // 显示/隐藏随机选项
        const randomWrapper = document.getElementById('pet-commentary-random-wrapper');
        if (randomWrapper) {
            randomWrapper.style.display = e.target.checked ? 'flex' : 'none';
        }
    });

    // 随机触发复选框
    document.getElementById('pet-commentary-random')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            settings.petCommentary.randomTrigger = e.target.checked;
            window.aiDictionary.saveSettings?.();
        }
        // 启用/禁用概率输入框
        const chanceInput = document.getElementById('pet-commentary-random-chance');
        if (chanceInput) {
            chanceInput.disabled = !e.target.checked;
        }
    });

    // 随机概率输入
    document.getElementById('pet-commentary-random-chance')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            let value = parseInt(e.target.value) || 30;
            value = Math.max(1, Math.min(100, value));
            e.target.value = value;
            settings.petCommentary.randomChance = value;
            window.aiDictionary.saveSettings?.();
        }
    });

    // API预设选择
    document.getElementById('pet-commentary-profile')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            settings.petCommentary.connectionProfile = e.target.value;
            window.aiDictionary.saveSettings?.();
        }
    });

    // 使用预设文件复选框
    document.getElementById('pet-commentary-use-preset-file')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            settings.petCommentary.usePresetFile = e.target.checked;
            window.aiDictionary.saveSettings?.();
        }
        // 显示/隐藏预设文件选择和合并选项
        const wrapper = document.getElementById('pet-commentary-preset-file-wrapper');
        const mergeWrapper = document.getElementById('pet-commentary-merge-wrapper');
        if (wrapper) {
            wrapper.style.display = e.target.checked ? 'block' : 'none';
        }
        if (mergeWrapper) {
            mergeWrapper.style.display = e.target.checked ? 'flex' : 'none';
        }
    });

    // 预设文件选择
    document.getElementById('pet-commentary-preset-file')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            settings.petCommentary.presetFileName = e.target.value;
            window.aiDictionary.saveSettings?.();
        }
    });

    // 合并聊天记录复选框
    document.getElementById('pet-commentary-merge-chat')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            settings.petCommentary.mergeChatHistory = e.target.checked;
            window.aiDictionary.saveSettings?.();
        }
    });

    // 上下文消息数
    document.getElementById('pet-commentary-max-messages')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            const value = parseInt(e.target.value);
            settings.petCommentary.maxMessages = isNaN(value) ? 10 : value;
            window.aiDictionary.saveSettings?.();
        }
    });

    // 气泡持续时间
    document.getElementById('pet-commentary-bubble-duration')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            let value = parseInt(e.target.value) || 20;
            value = Math.max(1, Math.min(999, value));
            e.target.value = value;
            settings.petCommentary.bubbleDuration = value;
            window.aiDictionary.saveSettings?.();
        }
    });

    // 系统提示词
    document.getElementById('pet-commentary-prompt')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            settings.petCommentary.systemPrompt = e.target.value;
            window.aiDictionary.saveSettings?.();
        }
    });

    // 重置提示词按钮
    document.getElementById('pet-commentary-reset-prompt')?.addEventListener('click', () => {
        const settings = window.aiDictionary?.settings;
        const defaultPrompt = window.aiDictionary?.defaultSettings?.petCommentary?.systemPrompt || '';

        if (settings && settings.petCommentary) {
            settings.petCommentary.systemPrompt = defaultPrompt;
            window.aiDictionary.saveSettings?.();

            const textarea = document.getElementById('pet-commentary-prompt');
            if (textarea) {
                textarea.value = defaultPrompt;
            }
        }
    });

    // 用户提示词
    document.getElementById('pet-commentary-user-prompt')?.addEventListener('change', (e) => {
        const settings = window.aiDictionary?.settings;
        if (settings && settings.petCommentary) {
            settings.petCommentary.userPrompt = e.target.value;
            window.aiDictionary.saveSettings?.();
        }
    });

    // 重置用户提示词按钮
    document.getElementById('pet-commentary-reset-user-prompt')?.addEventListener('click', () => {
        const settings = window.aiDictionary?.settings;
        const defaultPrompt = window.aiDictionary?.defaultSettings?.petCommentary?.userPrompt || '';

        if (settings && settings.petCommentary) {
            settings.petCommentary.userPrompt = defaultPrompt;
            window.aiDictionary.saveSettings?.();

            const textarea = document.getElementById('pet-commentary-user-prompt');
            if (textarea) {
                textarea.value = defaultPrompt;
            }
        }
    });

    // 测试吐槽按钮
    document.getElementById('pet-commentary-test')?.addEventListener('click', () => {
        if (typeof window.triggerPetCommentary === 'function') {
            window.triggerPetCommentary();
        } else {
            console.warn('[FarmGame] triggerPetCommentary not available');
            alert('吐槽功能未初始化，请先展示宠物后再试。');
        }
    });
}
