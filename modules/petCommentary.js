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
        oaiSettings
    } = options;

    eventSource = es;
    event_types = et;
    getContextFn = getContext;
    sendOpenAIRequestFn = sendOpenAIRequest;
    generateRawFn = generateRaw;
    oaiSettingsObj = oaiSettings;

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
 * 构建聊天上下文
 */
function buildChatContext(context, settings) {
    const maxMessages = settings.petCommentary.maxMessages || 10;
    const userName = context.name1 || 'User';

    // 替换系统提示词中的变量
    const systemPrompt = settings.petCommentary.systemPrompt
        .replace(/\{\{user\}\}/g, userName);

    const messages = [{ role: 'system', content: systemPrompt }];

    // 获取最近的消息
    const chat = context.chat || [];
    const recentMessages = chat
        .filter(msg => !msg.is_system)
        .slice(-maxMessages);

    for (const msg of recentMessages) {
        messages.push({
            role: msg.is_user ? 'user' : 'assistant',
            content: msg.mes
        });
    }

    return messages;
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

    try {
        // 注意：配置文件切换功能暂时禁用
        // SillyTavern 的连接管理器在切换配置文件时会触发异步连接验证，
        // 这会导致 sendOpenAIRequest 返回空的流数据。
        // 目前使用当前活动的 API 配置。
        // TODO: 研究如何正确等待配置文件切换完成，或使用其他方式指定 API
        console.log('[PetCommentary] Using current active API connection');

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
    } else {
        bubble.classList.remove('pet-commentary-loading');
    }
}

/**
 * 隐藏宠物气泡
 */
export function hidePetBubble() {
    const bubble = document.querySelector('.pet-commentary-bubble');
    if (bubble) {
        bubble.remove();
    }
}

/**
 * 定位气泡到宠物旁边
 */
function positionBubble(petElement, bubbleElement) {
    const petRect = petElement.getBoundingClientRect();

    // 默认显示在宠物下方
    let top = petRect.bottom + 10;
    let left = petRect.left + petRect.width / 2 - 125; // 气泡宽度250px，居中

    // 检查是否超出屏幕底部
    if (top + 150 > window.innerHeight) {
        // 显示在上方
        top = petRect.top - 150 - 10;
    }

    // 检查是否超出屏幕左侧
    if (left < 10) {
        left = 10;
    }

    // 检查是否超出屏幕右侧
    if (left + 250 > window.innerWidth - 10) {
        left = window.innerWidth - 260;
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
