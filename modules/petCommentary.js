/**
 * Pet Commentary Module
 * 宠物吐槽功能模块
 */

let lastProcessedIndex = -1;
let eventSource = null;
let event_types = null;
let getContextFn = null;
let sendOpenAIRequestFn = null;
let generateRawFn = null;
let oaiSettingsObj = null;
let systemPromptsArr = null;
let openaiSettingsArr = null;
let openaiSettingNamesObj = null;
let autoCloseTimer = null; // 自动关闭定时器

/**
 * 获取当前设置（从全局对象动态读取）
 */
function getSettings() {
    return window.aiDictionary?.settings;
}

/**
 * 初始化宠物吐槽功能
 */
export function initPetCommentary(options) {
    const {
        eventSource: es,
        event_types: et,
        getContext,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings,
        systemPrompts,
        openaiSettings,
        openaiSettingNames
    } = options;

    eventSource = es;
    event_types = et;
    getContextFn = getContext;
    sendOpenAIRequestFn = sendOpenAIRequest;
    generateRawFn = generateRaw;
    oaiSettingsObj = oaiSettings;
    systemPromptsArr = systemPrompts;
    openaiSettingsArr = openaiSettings;
    openaiSettingNamesObj = openaiSettingNames;

    // 监听 MESSAGE_RECEIVED 事件
    eventSource.on(event_types.MESSAGE_RECEIVED, async (messageIndex) => {
        const settings = getSettings();
        // 检查是否启用且设置为自动触发
        if (!settings?.petCommentary?.enabled || !settings.petCommentary.autoTrigger) {
            return;
        }

        // 防止重复处理同一条消息
        if (messageIndex === lastProcessedIndex) {
            return;
        }
        lastProcessedIndex = messageIndex;

        // 检查宠物是否展示
        if (!isPetDisplaying()) {
            return;
        }

        // 随机触发检查
        if (settings.petCommentary.randomTrigger) {
            const chance = settings.petCommentary.randomChance || 30;
            const roll = Math.random() * 100;
            console.log(`[PetCommentary] Random check: rolled ${roll.toFixed(1)}%, need <= ${chance}%`);
            if (roll > chance) {
                console.log('[PetCommentary] Random check failed, skipping commentary');
                return;
            }
            console.log('[PetCommentary] Random check passed, triggering commentary');
        }

        // 触发评论
        try {
            await triggerPetCommentary();
        } catch (error) {
            console.error('[PetCommentary] Auto trigger error:', error);
        }
    });

    console.log('[PetCommentary] Initialized');
}

/**
 * 检测宠物是否展示
 */
function isPetDisplaying() {
    return document.getElementById('floating-pet') !== null;
}

/**
 * 构建聊天上下文 - 直接使用预设中的提示词和消息结构
 */
function buildChatContext(context, settings) {
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Character';

    // 如果启用了使用预设文件，直接使用预设的完整结构
    if (settings.petCommentary.usePresetFile && settings.petCommentary.presetFileName) {
        console.log('[PetCommentary] Building messages from preset file:', settings.petCommentary.presetFileName);

        const messages = getMessagesFromPresetFile(settings.petCommentary.presetFileName, userName, charName);
        if (messages && messages.length > 0) {
            console.log('[PetCommentary] Built', messages.length, 'messages from preset file');
            return messages;
        }
    }

    // 原有的自定义提示词逻辑（禁用时使用）
    const maxMessages = settings.petCommentary.maxMessages ?? 10;

    // 获取当前展示的宠物名称
    const floatingPetData = localStorage.getItem('ai-dict-floating-pet');
    let petName = '宠物';
    if (floatingPetData) {
        try {
            const petInfo = JSON.parse(floatingPetData);
            const farmData = localStorage.getItem('ai-dict-farm-game');
            if (farmData) {
                const gameState = JSON.parse(farmData);
                const pet = gameState.ownedItems?.find(
                    item => item.type === 'pet' &&
                            item.id === petInfo.petId &&
                            item.timestamp === petInfo.timestamp
                );
                if (pet) {
                    petName = pet.customName || pet.name || '宠物';
                }
            }
        } catch (e) {
            console.warn('[PetCommentary] Failed to get pet name:', e);
        }
    }

    // 替换系统提示词中的变量
    const systemPrompt = settings.petCommentary.systemPrompt
        .replace(/\{\{user\}\}/g, userName)
        .replace(/\{\{petName\}\}/g, petName);

    // 获取用户提示词
    const userPrompt = (settings.petCommentary.userPrompt || '以上是最近的聊天记录，请给出你的吐槽评论。')
        .replace(/\{\{user\}\}/g, userName)
        .replace(/\{\{petName\}\}/g, petName);

    // 获取最近的消息
    const chat = context.chat || [];
    const filteredChat = chat.filter(msg => !msg.is_system);
    // -1 表示全部消息
    const recentMessages = maxMessages === -1 ? filteredChat : filteredChat.slice(-maxMessages);

    // 将聊天记录聚合为一条文本
    const chatText = recentMessages.map(msg => {
        const role = msg.is_user ? userName : (msg.name || charName);
        return `${role}: ${msg.mes}`;
    }).join('\n\n');

    // 发送 system + assistant(聊天记录) + user(提示词)
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'assistant', content: chatText },
        { role: 'user', content: userPrompt }
    ];

    return messages;
}

/**
 * 从预设文件构建消息数组，按照每个提示词的 role 字段，并包含聊天记录
 */
function getMessagesFromPresetFile(presetFileName, userName, charName) {
    try {
        if (!presetFileName) {
            console.warn('[PetCommentary] No preset file name provided');
            return null;
        }

        // 检查是否是当前活动的预设
        const currentPresetName = oaiSettingsObj?.preset_settings_openai;
        const isCurrentPreset = presetFileName === currentPresetName;

        let prompts, promptOrder;

        if (isCurrentPreset) {
            console.log('[PetCommentary] Using current active preset:', presetFileName);
            prompts = oaiSettingsObj.prompts;
            promptOrder = oaiSettingsObj.prompt_order;
        } else {
            console.log('[PetCommentary] Using stored preset:', presetFileName);

            if (!openaiSettingNamesObj || typeof openaiSettingNamesObj !== 'object') {
                console.warn('[PetCommentary] openaiSettingNamesObj not available');
                return null;
            }

            const presetIndex = openaiSettingNamesObj[presetFileName];
            if (presetIndex === undefined) {
                console.warn('[PetCommentary] Preset index not found for:', presetFileName);
                return null;
            }

            if (!Array.isArray(openaiSettingsArr)) {
                console.warn('[PetCommentary] openaiSettingsArr not available');
                return null;
            }

            const preset = openaiSettingsArr[presetIndex];
            if (!preset) {
                console.warn('[PetCommentary] Preset not found at index:', presetIndex);
                return null;
            }

            prompts = preset.prompts;
            promptOrder = preset.prompt_order;
        }

        if (!Array.isArray(prompts)) {
            console.warn('[PetCommentary] No prompts array found');
            return null;
        }

        // 获取全局的 prompt_order
        let globalOrder = null;
        if (Array.isArray(promptOrder)) {
            globalOrder = promptOrder.find(po => po.character_id === 100001)?.order;
        }

        if (!Array.isArray(globalOrder)) {
            console.warn('[PetCommentary] No global prompt order found');
            return null;
        }

        // 构建消息数组，按照 prompt_order 顺序
        const messages = [];
        for (const orderEntry of globalOrder) {
            // 只取启用的
            if (!orderEntry.enabled) continue;

            // 检查是否是 chatHistory（聊天记录占位符）
            if (orderEntry.identifier === 'chatHistory') {
                console.log('[PetCommentary] Adding chat history');
                // 从当前聊天上下文获取消息
                const context = getContextFn?.();
                if (context && Array.isArray(context.chat)) {
                    const chat = context.chat.filter(msg => !msg.is_system);
                    const settings = getSettings();
                    const mergeChatHistory = settings?.petCommentary?.mergeChatHistory !== false;

                    if (mergeChatHistory) {
                        // 合并为一条消息
                        const chatText = chat
                            .map(msg => {
                                const role = msg.is_user ? userName : charName;
                                return `${role}: ${msg.mes}`;
                            })
                            .join('\n\n');

                        if (chatText.trim()) {
                            const chatHistoryPrompt = prompts.find(p => p && p.identifier === 'chatHistory');
                            const role = chatHistoryPrompt?.role || 'user';
                            messages.push({ role, content: chatText });
                            console.log('[PetCommentary] Added chat history as single message with role:', role);
                        }
                    } else {
                        // 分开为多条消息
                        for (const msg of chat) {
                            const role = msg.is_user ? 'user' : 'assistant';
                            messages.push({ role, content: msg.mes });
                        }
                        console.log('[PetCommentary] Added chat history as', chat.length, 'separate messages');
                    }
                }
                continue;
            }

            // 在 prompts 中查找
            const prompt = prompts.find(p => p && p.identifier === orderEntry.identifier);

            // 跳过找不到的或没有内容的
            if (!prompt || !prompt.content || prompt.content.trim() === '') continue;

            // 获取 role，默认为 "system"
            const role = prompt.role || 'system';

            // 替换变量
            let content = prompt.content
                .replace(/\{\{user\}\}/gi, userName)
                .replace(/\{\{char\}\}/gi, charName);

            messages.push({ role, content });
            console.log('[PetCommentary] Added message with role:', role, 'identifier:', orderEntry.identifier);
        }

        return messages.length > 0 ? messages : null;
    } catch (e) {
        console.error('[PetCommentary] Failed to get messages from preset file:', e);
        return null;
    }
}

/**
 * 从API预设获取绑定的所有激活提示词
 * @param {string} profileId - API预设ID
 * @returns {string|null} - 组合后的提示词内容，如果未找到则返回null
 */
function getBoundSystemPrompt(profileId) {
    try {
        const extensionSettings = window.extension_settings || {};
        const connectionManager = extensionSettings.connectionManager;

        console.log('[PetCommentary] getBoundSystemPrompt called with profileId:', profileId);

        if (!connectionManager || !Array.isArray(connectionManager.profiles)) {
            console.warn('[PetCommentary] connectionManager.profiles not available');
            return null;
        }

        // 找到选中的profile
        const profile = connectionManager.profiles.find(p => p.id === profileId);
        if (!profile) {
            console.warn('[PetCommentary] Profile not found');
            return null;
        }

        // 获取预设名称
        const presetName = profile.preset;
        if (!presetName) {
            console.warn('[PetCommentary] Profile has no preset');
            return null;
        }

        console.log('[PetCommentary] Preset name:', presetName);

        // 检查是否是当前活动的预设，如果是则使用 oai_settings（实时数据）
        const currentPresetName = oaiSettingsObj?.preset_settings_openai;
        const isCurrentPreset = presetName === currentPresetName;

        let prompts, promptOrder;

        if (isCurrentPreset) {
            // 使用当前活动的设置（实时数据）
            console.log('[PetCommentary] Using current active preset settings');
            prompts = oaiSettingsObj.prompts;
            promptOrder = oaiSettingsObj.prompt_order;
        } else {
            // 从 openaiSettingsArr 获取预设数据
            console.log('[PetCommentary] Using stored preset settings');

            if (!openaiSettingNamesObj || typeof openaiSettingNamesObj !== 'object') {
                console.warn('[PetCommentary] openaiSettingNamesObj not available');
                return null;
            }

            const presetIndex = openaiSettingNamesObj[presetName];
            if (presetIndex === undefined) {
                console.warn('[PetCommentary] Preset index not found for:', presetName);
                return null;
            }

            if (!Array.isArray(openaiSettingsArr)) {
                console.warn('[PetCommentary] openaiSettingsArr not available');
                return null;
            }

            const preset = openaiSettingsArr[presetIndex];
            if (!preset) {
                console.warn('[PetCommentary] Preset not found at index:', presetIndex);
                return null;
            }

            prompts = preset.prompts;
            promptOrder = preset.prompt_order;
        }

        if (!Array.isArray(prompts)) {
            console.warn('[PetCommentary] No prompts array found');
            return null;
        }

        // 获取全局的 prompt_order (character_id === 100001 是默认/全局)
        let globalOrder = null;
        if (Array.isArray(promptOrder)) {
            globalOrder = promptOrder.find(po => po.character_id === 100001)?.order;
        }

        if (!Array.isArray(globalOrder)) {
            console.warn('[PetCommentary] No global prompt order found, using prompts directly');
            // 如果没有 prompt_order，直接从 prompts 中获取有内容的
            const enabledPrompts = prompts
                .filter(p => p && p.content && p.content.trim() !== '')
                .map(p => p.content);

            if (enabledPrompts.length > 0) {
                console.log('[PetCommentary] Found', enabledPrompts.length, 'prompts (no order)');
                return enabledPrompts.join('\n\n');
            }
            return null;
        }

        // 根据 prompt_order 顺序获取全部启用的提示词（不做任何筛选）
        const combinedPrompts = [];
        for (const orderEntry of globalOrder) {
            // 只跳过未启用的
            if (!orderEntry.enabled) continue;

            // 在 prompts 中查找
            const prompt = prompts.find(p => p && p.identifier === orderEntry.identifier);

            // 跳过找不到的或没有内容的
            if (!prompt || !prompt.content || prompt.content.trim() === '') continue;

            combinedPrompts.push(prompt.content);
            console.log('[PetCommentary] Added prompt:', orderEntry.identifier);
        }

        if (combinedPrompts.length > 0) {
            console.log('[PetCommentary] Total enabled prompts:', combinedPrompts.length);
            return combinedPrompts.join('\n\n');
        }

        console.warn('[PetCommentary] No enabled prompts found');
        return null;
    } catch (e) {
        console.error('[PetCommentary] Failed to get bound system prompt:', e);
        return null;
    }
}

/**
 * 触发宠物评论（内部函数）
 */
async function triggerPetCommentary() {
    const settings = getSettings();
    const context = getContextFn();

    if (!context || !context.chat) {
        console.warn('[PetCommentary] No context available');
        return;
    }

    // 构建消息
    const messages = buildChatContext(context, settings);

    // 显示加载气泡
    showPetBubble('💭 猫咪正在思考...', true);

    // 保存原始 profile 用于恢复
    const extensionSettings = window.extension_settings || {};
    const originalProfile = extensionSettings.connectionManager?.selectedProfile;
    let profileApplied = false;

    try {
        // 切换 connection profile（如果配置了）
        const configuredProfile = settings.petCommentary?.connectionProfile;
        if (configuredProfile) {
            const connectionManager = extensionSettings.connectionManager;
            if (connectionManager && Array.isArray(connectionManager.profiles)) {
                const profile = connectionManager.profiles.find(p => p.id === configuredProfile);
                if (profile) {
                    const profileSelect = document.getElementById('connection_profiles');
                    if (profileSelect) {
                        console.log('[PetCommentary] Switching to profile:', profile.name);
                        profileSelect.value = profile.id;
                        profileSelect.dispatchEvent(new Event('change'));
                        profileApplied = true;
                        // 等待连接生效
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        }

        // 检查是否启用流式
        const streamEnabled = oaiSettingsObj?.stream_openai;

        let fullText = '';

        if (streamEnabled) {
            // 流式响应
            const abortController = new AbortController();
            const generator = await sendOpenAIRequestFn('normal', messages, abortController.signal);

            if (typeof generator === 'function') {
                for await (const data of generator()) {
                    if (data.text) {
                        fullText = data.text;
                        updatePetBubble(fullText, false);
                    }
                }
            } else {
                // 返回的不是生成器函数，按非流式处理
                fullText = generator?.choices?.[0]?.message?.content || '';
                if (fullText) {
                    updatePetBubble(fullText, false);
                }
            }
        } else {
            // 非流式响应，使用 generateRaw
            const userContent = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
            const systemContent = messages.find(m => m.role === 'system')?.content || '';

            fullText = await generateRawFn({
                prompt: userContent,
                systemPrompt: systemContent,
            });

            if (fullText) {
                updatePetBubble(fullText, false);
            }
        }

        if (!fullText) {
            updatePetBubble('😿 猫咪没有想法...', false);
        }

    } catch (error) {
        console.error('[PetCommentary] Error:', error);
        updatePetBubble('😿 吐槽失败了...', false);
    } finally {
        // 恢复原始 profile
        if (profileApplied) {
            const profileSelect = document.getElementById('connection_profiles');
            if (profileSelect) {
                console.log('[PetCommentary] Restoring original profile');
                profileSelect.value = originalProfile || '';
                profileSelect.dispatchEvent(new Event('change'));
            }
        }
    }
}

/**
 * 手动触发宠物评论（导出供外部调用）
 */
export async function manualTriggerCommentary() {
    const settings = getSettings();
    console.log('[PetCommentary] Manual trigger called, settings:', settings?.petCommentary);

    if (!settings?.petCommentary) {
        console.error('[PetCommentary] Settings not initialized');
        return;
    }

    if (!settings.petCommentary.enabled) {
        console.warn('[PetCommentary] Feature is disabled, enabled value:', settings.petCommentary.enabled);
        return;
    }

    if (!isPetDisplaying()) {
        console.warn('[PetCommentary] Pet is not displaying');
        return;
    }

    await triggerPetCommentary();
}

/**
 * 显示宠物气泡
 */
function showPetBubble(text, isLoading) {
    let bubble = document.querySelector('.pet-commentary-bubble');

    if (!bubble) {
        // 创建新气泡
        bubble = document.createElement('div');
        bubble.className = 'pet-commentary-bubble';
        bubble.innerHTML = `
            <button class="pet-commentary-close" title="关闭">✕</button>
            <div class="pet-commentary-text"></div>
        `;
        document.body.appendChild(bubble);

        // 绑定关闭按钮
        bubble.querySelector('.pet-commentary-close').addEventListener('click', () => {
            hidePetBubble();
        });
    }

    // 更新内容
    const textEl = bubble.querySelector('.pet-commentary-text');
    textEl.textContent = text;

    // 设置加载状态
    if (isLoading) {
        bubble.classList.add('pet-commentary-loading');
    } else {
        bubble.classList.remove('pet-commentary-loading');
    }

    // 定位气泡
    const petElement = document.getElementById('floating-pet');
    if (petElement) {
        positionBubble(petElement, bubble);
    }

    bubble.style.display = 'block';
}

/**
 * 更新气泡内容
 */
function updatePetBubble(text, isLoading) {
    const bubble = document.querySelector('.pet-commentary-bubble');
    if (!bubble) {
        showPetBubble(text, isLoading);
        return;
    }

    const textEl = bubble.querySelector('.pet-commentary-text');
    textEl.textContent = text;

    if (isLoading) {
        bubble.classList.add('pet-commentary-loading');
        // 清除之前的自动关闭定时器
        if (autoCloseTimer) {
            clearTimeout(autoCloseTimer);
            autoCloseTimer = null;
        }
    } else {
        bubble.classList.remove('pet-commentary-loading');
        // 流式输出结束后自动关闭
        if (autoCloseTimer) {
            clearTimeout(autoCloseTimer);
        }
        const settings = getSettings();
        const duration = (settings?.petCommentary?.bubbleDuration ?? 20) * 1000;
        autoCloseTimer = setTimeout(() => {
            hidePetBubble();
            autoCloseTimer = null;
        }, duration);
    }
}

/**
 * 隐藏宠物气泡
 */
export function hidePetBubble() {
    // 清除自动关闭定时器
    if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
    }
    const bubble = document.querySelector('.pet-commentary-bubble');
    if (bubble) {
        bubble.remove();
    }
}

/**
 * 定位气泡到宠物左侧
 */
function positionBubble(petElement, bubbleElement) {
    const petRect = petElement.getBoundingClientRect();
    const bubbleWidth = 250;
    const bubbleHeight = 150;

    // 默认显示在宠物左侧
    let top = petRect.top + petRect.height / 2 - bubbleHeight / 2;
    let left = petRect.left - bubbleWidth - 15;

    // 检查是否超出屏幕左侧，如果是则显示在右侧
    if (left < 10) {
        left = petRect.right + 15;
    }

    // 检查是否超出屏幕右侧，如果是则显示在下方
    if (left + bubbleWidth > window.innerWidth - 10) {
        left = petRect.left + petRect.width / 2 - bubbleWidth / 2;
        top = petRect.bottom + 10;
    }

    // 检查是否超出屏幕顶部
    if (top < 10) {
        top = 10;
    }

    // 检查是否超出屏幕底部
    if (top + bubbleHeight > window.innerHeight - 10) {
        top = window.innerHeight - bubbleHeight - 10;
    }

    // 最终检查左侧边界
    if (left < 10) {
        left = 10;
    }

    bubbleElement.style.top = `${top}px`;
    bubbleElement.style.left = `${left}px`;
}

/**
 * 更新气泡位置（供宠物拖拽时调用）
 */
export function updatePetBubblePosition() {
    const bubble = document.querySelector('.pet-commentary-bubble');
    const petElement = document.getElementById('floating-pet');

    if (bubble && petElement) {
        positionBubble(petElement, bubble);
    }
}

// 暴露给全局，供 farm-pet.js 调用
if (typeof window !== 'undefined') {
    window.updatePetBubblePosition = updatePetBubblePosition;
    window.triggerPetCommentary = manualTriggerCommentary;
}
