/**
 * AI Dictionary - AI Lookup Module
 * AI definition fetching and streaming
 */

import { EXTENSION_NAME } from './constants.js';
import { escapeHtml } from './statistics.js';

/** @type {string} */
let currentPrompt = '';

/** @type {Array} */
let chatHistory = [];

/** @type {string} */
let currentWord = '';

/**
 * Get current prompt for display
 * @returns {string}
 */
export function getCurrentPrompt() {
    return currentPrompt;
}

/**
 * Get chat history
 * @returns {Array}
 */
export function getChatHistory() {
    return chatHistory;
}

/**
 * Get current word
 * @returns {string}
 */
export function getCurrentWord() {
    return currentWord;
}

/**
 * Set current word
 * @param {string} word
 */
export function setCurrentWord(word) {
    currentWord = word;
}

/**
 * Clear chat history
 */
export function clearChatHistory() {
    chatHistory = [];
}

/**
 * Fetch AI definition with streaming support
 * @param {Object} options
 * @param {string} options.word - Word to look up
 * @param {string} options.context - Context text
 * @param {Object} options.settings - Settings object
 * @param {Object} options.extensionSettings - Extension settings object
 * @param {Function} options.sendOpenAIRequest - Send OpenAI request function
 * @param {Function} options.generateRaw - Generate raw function
 * @param {Object} options.oaiSettings - OAI settings
 * @returns {Promise<void>}
 */
export async function fetchAIDefinition(options) {
    const {
        word,
        context,
        settings,
        extensionSettings,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings
    } = options;

    const lookupPrompt = settings.userPrompt
        .replace(/%word%/g, word)
        .replace(/%context%/g, context);

    currentPrompt = `System Prompt:\n${settings.systemPrompt}\n\nUser Prompt:\n${lookupPrompt}`;

    const promptElement = document.getElementById('ai-dict-current-prompt');
    if (promptElement) {
        promptElement.textContent = currentPrompt;
    }

    const aiContentElement = document.getElementById('ai-definition-content');
    if (!aiContentElement) return;

    // Store original profile to restore later
    const originalProfile = extensionSettings.connectionManager?.selectedProfile;
    let profileApplied = false;

    try {
        // Apply connection profile if specified
        if (settings.connectionProfile) {
            const connectionManager = extensionSettings.connectionManager;
            if (connectionManager && Array.isArray(connectionManager.profiles)) {
                const profile = connectionManager.profiles.find(p => p.id === settings.connectionProfile);
                if (profile) {
                    const profileSelect = document.getElementById('connection_profiles');
                    if (profileSelect) {
                        profileSelect.value = profile.id;
                        profileSelect.dispatchEvent(new Event('change'));
                        profileApplied = true;
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        }

        const messages = [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: lookupPrompt }
        ];

        const streamEnabled = oaiSettings.stream_openai;

        if (streamEnabled) {
            await fetchWithStreaming(messages, aiContentElement, sendOpenAIRequest);
        } else {
            const definition = await generateRaw({
                prompt: lookupPrompt,
                systemPrompt: settings.systemPrompt,
            });

            if (definition) {
                aiContentElement.innerHTML = `<p>${definition.replace(/\n/g, '<br>')}</p>`;
            } else {
                aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
            }
        }
    } catch (error) {
        console.error('AI definition lookup error:', error);
        aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
    } finally {
        if (profileApplied && originalProfile !== settings.connectionProfile) {
            const profileSelect = document.getElementById('connection_profiles');
            if (profileSelect) {
                profileSelect.value = originalProfile || '';
                profileSelect.dispatchEvent(new Event('change'));
            }
        }
    }
}

/**
 * Fetch with streaming
 * @param {Array} messages
 * @param {HTMLElement} contentElement
 * @param {Function} sendOpenAIRequest
 */
async function fetchWithStreaming(messages, contentElement, sendOpenAIRequest) {
    const abortController = new AbortController();

    try {
        const generator = await sendOpenAIRequest('normal', messages, abortController.signal);

        if (typeof generator === 'function') {
            contentElement.innerHTML = `
                <div class="ai-dict-reasoning-container" style="display: none;">
                    <details class="ai-dict-reasoning-details" open>
                        <summary class="ai-dict-reasoning-summary">
                            <i class="fa-solid fa-brain"></i>
                            <span class="ai-dict-reasoning-title">思考中...</span>
                        </summary>
                        <div class="ai-dict-reasoning-content"></div>
                    </details>
                </div>
                <div class="ai-dict-text-content"></div>
            `;

            const reasoningContainer = contentElement.querySelector('.ai-dict-reasoning-container');
            const reasoningDetails = contentElement.querySelector('.ai-dict-reasoning-details');
            const reasoningContent = contentElement.querySelector('.ai-dict-reasoning-content');
            const reasoningTitle = contentElement.querySelector('.ai-dict-reasoning-title');
            const textContent = contentElement.querySelector('.ai-dict-text-content');

            let fullText = '';
            let fullReasoning = '';
            let reasoningStartTime = null;
            let reasoningCollapsed = false;

            for await (const data of generator()) {
                const currentReasoning = data?.state?.reasoning || '';
                if (currentReasoning && currentReasoning !== fullReasoning) {
                    if (!reasoningStartTime) {
                        reasoningStartTime = Date.now();
                        reasoningContainer.style.display = 'block';
                    }
                    fullReasoning = currentReasoning;
                    reasoningContent.innerHTML = fullReasoning.replace(/\n/g, '<br>');
                }

                if (data.text) {
                    fullText = data.text;
                    textContent.innerHTML = fullText.replace(/\n/g, '<br>');

                    if (reasoningStartTime && fullReasoning && !reasoningCollapsed) {
                        const duration = ((Date.now() - reasoningStartTime) / 1000).toFixed(1);
                        reasoningTitle.textContent = `思考了 ${duration} 秒`;
                        reasoningDetails.removeAttribute('open');
                        reasoningCollapsed = true;
                    }
                }
            }

            if (reasoningStartTime && fullReasoning) {
                const duration = ((Date.now() - reasoningStartTime) / 1000).toFixed(1);
                reasoningTitle.textContent = `思考了 ${duration} 秒`;
                if (!reasoningCollapsed) {
                    reasoningDetails.removeAttribute('open');
                }
            }

            if (!fullText && !fullReasoning) {
                contentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
            }
        } else {
            const content = generator?.choices?.[0]?.message?.content || '';
            const reasoning = generator?.choices?.[0]?.message?.reasoning_content
                || generator?.choices?.[0]?.message?.reasoning
                || generator?.content?.find(part => part.type === 'thinking')?.thinking
                || '';

            let html = '';

            if (reasoning) {
                html += `
                    <div class="ai-dict-reasoning-container">
                        <details class="ai-dict-reasoning-details">
                            <summary class="ai-dict-reasoning-summary">
                                <i class="fa-solid fa-brain"></i>
                                <span class="ai-dict-reasoning-title">思考过程</span>
                            </summary>
                            <div class="ai-dict-reasoning-content">${reasoning.replace(/\n/g, '<br>')}</div>
                        </details>
                    </div>
                `;
            }

            if (content) {
                html += `<div class="ai-dict-text-content">${content.replace(/\n/g, '<br>')}</div>`;
            }

            if (html) {
                contentElement.innerHTML = html;
            } else {
                contentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
            }
        }
    } catch (error) {
        console.error('Streaming error:', error);
        throw error;
    }
}

/**
 * Perform deep study for a word
 * @param {Object} options
 * @param {string} options.word
 * @param {Object} options.settings
 * @param {Function} options.sendOpenAIRequest
 * @param {Function} options.generateRaw
 * @param {Object} options.oaiSettings
 */
export async function performDeepStudy(options) {
    const { word, settings, sendOpenAIRequest, generateRaw, oaiSettings } = options;

    const btn = document.getElementById('ai-dict-deep-study-btn');
    const contentElement = document.getElementById('ai-dict-deep-study-content');

    if (!contentElement) return;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>正在生成深度学习内容...</span>';
    }

    contentElement.style.display = 'block';
    contentElement.innerHTML = '<p class="ai-dict-loading-text">正在获取深度学习内容...</p>';

    try {
        const deepStudyPrompt = settings.deepStudyPrompt.replace(/%word%/g, word);

        const messages = [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: deepStudyPrompt }
        ];

        const streamEnabled = oaiSettings.stream_openai;

        if (streamEnabled) {
            await fetchWithStreaming(messages, contentElement, sendOpenAIRequest);
        } else {
            const definition = await generateRaw({
                prompt: deepStudyPrompt,
                systemPrompt: settings.systemPrompt,
            });

            if (definition) {
                contentElement.innerHTML = `<p>${definition.replace(/\n/g, '<br>')}</p>`;
            } else {
                contentElement.innerHTML = '<p class="ai-dict-error-text">无法获取深度学习内容，请稍后重试。</p>';
            }
        }

        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>深度学习完成</span>';
        }
    } catch (error) {
        console.error('Deep study error:', error);
        contentElement.innerHTML = '<p class="ai-dict-error-text">无法获取深度学习内容，请稍后重试。</p>';
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-graduation-cap"></i> <span>重试深度学习</span>';
        }
    }
}

/**
 * Send chat message
 * @param {Object} options
 * @param {string} options.word
 * @param {Object} options.settings
 * @param {Function} options.sendOpenAIRequest
 * @param {Function} options.generateRaw
 * @param {Object} options.oaiSettings
 */
export async function sendChatMessage(options) {
    const { word, settings, sendOpenAIRequest, generateRaw, oaiSettings } = options;

    const chatInput = document.getElementById('ai-dict-chat-input');
    const sendBtn = document.getElementById('ai-dict-chat-send-btn');
    const chatBubble = document.getElementById('ai-dict-chat-bubble');
    const aiContentElement = document.getElementById('ai-definition-content');

    if (!chatInput || !aiContentElement) return;

    const userMessage = chatInput.value.trim();
    if (!userMessage) return;

    chatInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    chatInput.value = '';
    if (chatBubble) {
        chatBubble.style.display = 'none';
    }

    const userQuestionEl = document.createElement('div');
    userQuestionEl.className = 'ai-dict-chat-question';
    userQuestionEl.innerHTML = `<i class="fa-solid fa-user"></i> ${escapeHtml(userMessage)}`;
    aiContentElement.appendChild(userQuestionEl);

    const aiResponseEl = document.createElement('div');
    aiResponseEl.className = 'ai-dict-chat-response';
    aiResponseEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    aiContentElement.appendChild(aiResponseEl);

    aiContentElement.scrollTop = aiContentElement.scrollHeight;

    try {
        if (chatHistory.length === 0 || currentWord !== word) {
            currentWord = word;

            const existingContent = Array.from(aiContentElement.children)
                .filter(el => !el.classList.contains('ai-dict-chat-question') && !el.classList.contains('ai-dict-chat-response'))
                .map(el => el.innerText)
                .join('\n');

            const deepStudyElement = document.getElementById('ai-dict-deep-study-content');
            const deepStudyContent = deepStudyElement && deepStudyElement.style.display !== 'none'
                ? deepStudyElement.innerText
                : '';

            let contextInfo = `关于单词 "${word}" 的查词结果：\n`;
            if (existingContent) {
                contextInfo += `\nAI释义:\n${existingContent}\n`;
            }
            if (deepStudyContent) {
                contextInfo += `\n深度学习内容:\n${deepStudyContent}\n`;
            }

            chatHistory = [
                { role: 'system', content: settings.systemPrompt + '\n\n以下是之前的查词结果，用户可能会基于这些内容继续提问：\n' + contextInfo },
            ];
        }

        chatHistory.push({ role: 'user', content: userMessage });

        // Update prompt display to show chat history
        const promptElement = document.getElementById('ai-dict-current-prompt');
        if (promptElement) {
            let promptDisplay = '';
            chatHistory.forEach((msg, index) => {
                if (msg.role === 'system') {
                    promptDisplay += `System Prompt:\n${msg.content}\n\n`;
                } else if (msg.role === 'user') {
                    promptDisplay += `User Message ${Math.floor(index / 2)}:\n${msg.content}\n\n`;
                } else if (msg.role === 'assistant') {
                    promptDisplay += `Assistant Response ${Math.floor(index / 2)}:\n${msg.content}\n\n`;
                }
            });
            promptElement.textContent = promptDisplay.trim();
        }

        const streamEnabled = oaiSettings.stream_openai;

        if (streamEnabled) {
            await fetchChatWithStreaming(chatHistory, aiResponseEl, sendOpenAIRequest);
        } else {
            // Non-streaming mode: send full chat history
            const response = await sendOpenAIRequest({
                messages: chatHistory,
                signal: null
            });

            if (response && response.choices && response.choices[0]) {
                const assistantMessage = response.choices[0].message.content;
                aiResponseEl.innerHTML = assistantMessage.replace(/\n/g, '<br>');
                chatHistory.push({ role: 'assistant', content: assistantMessage });
            } else {
                aiResponseEl.innerHTML = '<span class="ai-dict-error-text">无法获取回复，请重试。</span>';
            }
        }
    } catch (error) {
        console.error('Chat error:', error);
        aiResponseEl.innerHTML = '<span class="ai-dict-error-text">发生错误，请重试。</span>';
    } finally {
        chatInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        aiContentElement.scrollTop = aiContentElement.scrollHeight;
    }
}

/**
 * Fetch chat response with streaming
 * @param {Array} messages
 * @param {HTMLElement} bubbleElement
 * @param {Function} sendOpenAIRequest
 */
async function fetchChatWithStreaming(messages, bubbleElement, sendOpenAIRequest) {
    const abortController = new AbortController();

    try {
        const generator = await sendOpenAIRequest('normal', messages, abortController.signal);

        if (typeof generator === 'function') {
            bubbleElement.innerHTML = '';
            let fullText = '';

            for await (const data of generator()) {
                if (data.text) {
                    fullText = data.text;
                    bubbleElement.innerHTML = fullText.replace(/\n/g, '<br>');
                }
            }

            if (fullText) {
                chatHistory.push({ role: 'assistant', content: fullText });
            } else {
                bubbleElement.innerHTML = '<span class="ai-dict-error-text">无法获取回复，请重试。</span>';
            }
        } else if (typeof generator === 'string') {
            bubbleElement.innerHTML = generator.replace(/\n/g, '<br>');
            chatHistory.push({ role: 'assistant', content: generator });
        }
    } catch (error) {
        console.error('Streaming chat error:', error);
        throw error;
    }
}

/**
 * Trigger AI fetch if content area is empty/clickable
 * @param {string} word
 * @param {Function} fetchAIDefinitionFn
 */
export function triggerAIFetchIfEmpty(word, fetchAIDefinitionFn) {
    const aiContentElement = document.getElementById('ai-definition-content');
    if (!aiContentElement) return;

    if (aiContentElement.classList.contains('ai-dict-clickable')) {
        aiContentElement.classList.remove('ai-dict-clickable');
        aiContentElement.innerHTML = '<p class="ai-dict-loading-text">正在获取 AI 定义...</p>';
        fetchAIDefinitionFn(word);
    }
}

/**
 * Bind manual AI fetch button
 * @param {string} word
 * @param {Function} fetchAIDefinitionFn
 */
export function bindManualAIFetchButton(word, fetchAIDefinitionFn) {
    const aiContentElement = document.getElementById('ai-definition-content');
    if (!aiContentElement || !aiContentElement.classList.contains('ai-dict-clickable')) return;

    const handleClick = async () => {
        aiContentElement.classList.remove('ai-dict-clickable');
        aiContentElement.removeEventListener('click', handleClick);
        aiContentElement.innerHTML = '<p class="ai-dict-loading-text">正在获取 AI 定义...</p>';

        try {
            await fetchAIDefinitionFn(word);
        } catch (error) {
            console.error('AI definition fetch error:', error);
            aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
        }
    };

    aiContentElement.addEventListener('click', handleClick);
}

/**
 * Bind deep study button
 * @param {string} word
 * @param {Function} performDeepStudyFn
 */
export function bindDeepStudyButton(word, performDeepStudyFn) {
    const btn = document.getElementById('ai-dict-deep-study-btn');
    if (btn) {
        btn.addEventListener('click', () => performDeepStudyFn(word));
    }
}

/**
 * Bind chat input events
 * @param {string} word
 * @param {Function} sendChatMessageFn
 */
export function bindChatInputEvents(word, sendChatMessageFn) {
    const chatTrigger = document.getElementById('ai-dict-chat-trigger');
    const chatBubble = document.getElementById('ai-dict-chat-bubble');
    const chatInput = document.getElementById('ai-dict-chat-input');
    const sendBtn = document.getElementById('ai-dict-chat-send-btn');

    if (!chatTrigger || !chatBubble) return;

    chatTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = chatBubble.style.display !== 'none';
        chatBubble.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            chatInput?.focus();
        }
    });

    chatBubble.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    if (!chatInput || !sendBtn) return;

    sendBtn.addEventListener('click', () => sendChatMessageFn(word));

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessageFn(word);
        }
    });
}
