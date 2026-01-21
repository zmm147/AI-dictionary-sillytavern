/**
 * AI Dictionary - Character Creation Module
 * Character card creation with AI-generated descriptions
 */

import { EXTENSION_NAME } from '../constants.js';
import { videoState } from './top-bar-state.js';

/**
 * Default character prompt template
 */
const DEFAULT_CHARACTER_PROMPT = `按照下面的格式，生成{{角色}}的角色扮演卡片。

  [{{char}}'s Personality= "性格关键词1", "性格关键词2", "性格关键词3", "...", "..."]
  [{{char}}'s body= "外貌特征1", "外貌特征2", "服装特征", "...", "..."]
  <START>
  {{user}}: "Describe your traits?"
  {{char}}: *在此处描写角色的微表情、动作或周围的环境氛围，体现角色的性格。* "在此处填入角色关于自己性格的自述，展现其说话的语气、口癖和态度。"
  {{user}}: "Describe your body and features."
  {{char}}: *描写角色听到问题后的反应（如笑声、羞涩、自信等）。* "在此处通过角色的口吻描述自己的外貌（头发、眼睛、身材、衣着）。"
  [Genre: 故事类型; Tags: 标签1, 标签2; Scenario: 在此处简要描述故事的开场背景（禁剧透）。]
  [First message = *描写角色当前场景的状态。* "角色的第一句话"]`;

/**
 * Extract First message from AI generated description
 * @param {string} description - AI generated description
 * @returns {string} Extracted first message or empty string
 */
function extractFirstMessage(description) {
    if (!description) return '';

    // Match pattern: [First message = content]
    const match = description.match(/\[First message\s*=\s*(.+?)\]/i);
    if (match && match[1]) {
        return match[1].trim();
    }

    return '';
}

/**
 * Show character creation modal
 */
export function showCharacterModal() {
    const modal = document.getElementById('ai-dict-character-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Clear previous inputs
        const nameInput = document.getElementById('ai-dict-character-name');
        const inputTextarea = document.getElementById('ai-dict-character-input');
        const outputTextarea = document.getElementById('ai-dict-character-output');
        if (nameInput) nameInput.value = '';
        if (inputTextarea) inputTextarea.value = DEFAULT_CHARACTER_PROMPT; // Show default prompt
        if (outputTextarea) outputTextarea.value = '';
    }
}

/**
 * Hide character creation modal
 */
export function hideCharacterModal() {
    const modal = document.getElementById('ai-dict-character-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Generate character description using AI
 * @param {Object} options
 * @param {string} options.input - User input for character description
 * @param {string} options.characterName - Character name to replace {{角色}} variable
 * @param {Object} options.settings - Extension settings
 * @param {Function} options.sendOpenAIRequest - Send OpenAI request function
 * @param {Object} options.oaiSettings - OAI settings
 * @returns {Promise<string>} Generated description
 */
export async function generateCharacterDescription(options) {
    const { input, characterName, settings, sendOpenAIRequest, oaiSettings } = options;

    const outputTextarea = document.getElementById('ai-dict-character-output');
    if (!outputTextarea) {
        throw new Error('Output textarea not found');
    }

    // Clear previous output
    outputTextarea.value = '';

    try {
        // Apply connection profile if specified
        const extensionSettings = SillyTavern.getContext().extensionSettings[EXTENSION_NAME];
        const originalProfile = extensionSettings.connectionManager?.selectedProfile;
        let profileApplied = false;

        if (settings.connectionProfile) {
            try {
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
            } catch (err) {
                console.warn(`[AI Dictionary] Failed to apply connection profile: ${err.message}`);
            }
        }

        // Extract subtitle text as context
        let subtitleContext = '';
        if (videoState.currentSubtitleCues && videoState.currentSubtitleCues.length > 0) {
            subtitleContext = videoState.currentSubtitleCues
                .map(cue => cue.text)
                .join('\n');
            console.log(`[AI Dictionary] Using ${videoState.currentSubtitleCues.length} subtitle cues as context`);
        }

        // Build messages with subtitle context
        const messages = [];

        if (subtitleContext) {
            messages.push({
                role: 'system',
                content: `你是专业的srt-script角色扮演卡片制作大师，你会分析srt字幕中的角色台词出色完成用户所要求的人物。srt字幕：\n\n${subtitleContext}`
            });
        }

        // Replace {{角色}} variable with actual character name before sending to AI
        const inputWithName = characterName ? input.replace(/\{\{角色\}\}/g, characterName) : input;

        messages.push({
            role: 'user',
            content: inputWithName
        });

        // Create abort controller
        const abortController = new AbortController();

        // Stream response
        let fullResponse = '';
        const streamEnabled = oaiSettings.stream_openai;

        if (streamEnabled) {
            const generator = await sendOpenAIRequest('normal', messages, abortController.signal);

            if (typeof generator === 'function') {
                for await (const data of generator()) {
                    if (data && data.text) {
                        fullResponse = data.text;
                        outputTextarea.value = fullResponse;
                        // Auto-scroll to bottom
                        outputTextarea.scrollTop = outputTextarea.scrollHeight;
                    }
                }
            } else {
                throw new Error('Invalid generator returned from sendOpenAIRequest');
            }
        } else {
            // Non-streaming mode - use generateRaw if available
            throw new Error('Non-streaming mode not supported yet. Please enable streaming in API settings.');
        }

        // Restore original profile if we changed it
        if (profileApplied && originalProfile !== settings.connectionProfile) {
            try {
                const profileSelect = document.getElementById('connection_profiles');
                if (profileSelect) {
                    profileSelect.value = originalProfile || '';
                    profileSelect.dispatchEvent(new Event('change'));
                }
            } catch (err) {
                console.warn(`[AI Dictionary] Failed to restore connection profile: ${err.message}`);
            }
        }

        return fullResponse;

    } catch (error) {
        console.error('[AI Dictionary] Error generating character description:', error);
        outputTextarea.value = `生成失败: ${error.message}`;
        throw error;
    }
}

/**
 * Create character card in SillyTavern
 * @param {Object} options
 * @param {string} options.name - Character name
 * @param {string} options.description - Character description
 * @param {string} options.firstMessage - First message (optional)
 * @param {Function} options.getCharacters - Function to reload character list
 * @param {Function} options.selectRmInfo - Function to update character list UI
 * @returns {Promise<void>}
 */
export async function createCharacterCard(options) {
    const { name, description, firstMessage = '', getCharacters, selectRmInfo } = options;

    if (!name || !name.trim()) {
        throw new Error('角色名称不能为空');
    }

    if (!description || !description.trim()) {
        throw new Error('角色描述不能为空');
    }

    try {
        // Create FormData for character creation
        const formData = new FormData();

        // Core fields - ch_name is the correct field name, not "name"
        formData.append('ch_name', name.trim());
        formData.append('description', description.trim());
        formData.append('fav', 'false');

        // Empty string fields
        formData.append('first_mes', firstMessage.trim());
        formData.append('json_data', '');
        formData.append('avatar_url', '');
        formData.append('chat', '');
        formData.append('create_date', '');
        formData.append('last_mes', '');
        formData.append('world', '');
        formData.append('system_prompt', '');
        formData.append('post_history_instructions', '');
        formData.append('creator', 'AI Dictionary');
        formData.append('character_version', '');
        formData.append('creator_notes', '由AI Dictionary扩展创建');
        formData.append('tags', '');
        formData.append('personality', '');
        formData.append('scenario', '');
        formData.append('mes_example', '');

        // Depth prompt settings
        formData.append('depth_prompt_prompt', '');
        formData.append('depth_prompt_depth', '4');
        formData.append('depth_prompt_role', 'system');

        // Talkativeness
        formData.append('talkativeness', '0.5');

        // Extensions as JSON string
        formData.append('extensions', '{}');

        // Create a default avatar image
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        // Fill with a default color
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(0, 0, 400, 400);

        // Add text
        ctx.fillStyle = '#666666';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.charAt(0).toUpperCase(), 200, 200);

        // Convert canvas to blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        formData.append('avatar', blob, 'avatar.png');

        // Get request headers using SillyTavern's method
        const getRequestHeaders = window.SillyTavern?.getContext()?.getRequestHeaders;
        const headers = getRequestHeaders ? getRequestHeaders({ omitContentType: true }) : {};

        // Send request to create character
        const response = await fetch('/api/characters/create', {
            method: 'POST',
            headers: headers,
            body: formData,
            cache: 'no-cache'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`创建角色卡失败: ${response.status} ${errorText}`);
        }

        const avatarId = await response.text();
        console.log(`[AI Dictionary] Character created successfully: ${avatarId}`);

        // Show success message
        if (typeof toastr !== 'undefined') {
            toastr.success(`角色卡 "${name}" 创建成功！`, '成功');
        }

        // Close modal
        hideCharacterModal();

        // Reload character list
        if (getCharacters && typeof getCharacters === 'function') {
            try {
                await getCharacters();
                if (selectRmInfo && typeof selectRmInfo === 'function') {
                    selectRmInfo('char_create', avatarId);
                }
                console.log('[AI Dictionary] Character list reloaded successfully');
            } catch (err) {
                console.warn('[AI Dictionary] Failed to reload character list:', err);
            }
        }

    } catch (error) {
        console.error('[AI Dictionary] Error creating character card:', error);
        if (typeof toastr !== 'undefined') {
            toastr.error(error.message, '创建失败');
        }
        throw error;
    }
}

/**
 * Bind character creation events
 * @param {Object} options
 * @param {Object} options.settings - Extension settings
 * @param {Function} options.sendOpenAIRequest - Send OpenAI request function
 * @param {Object} options.oaiSettings - OAI settings
 * @param {Function} options.getCharacters - Function to reload character list
 * @param {Function} options.selectRmInfo - Function to update character list UI
 */
export function bindCharacterCreationEvents(options) {
    const { settings, sendOpenAIRequest, oaiSettings, getCharacters, selectRmInfo } = options;

    // Show modal button
    const showModalBtn = document.getElementById('ai-dict-create-character-btn');
    if (showModalBtn) {
        showModalBtn.addEventListener('click', () => {
            showCharacterModal();
        });
    }

    // Close modal button
    const closeModalBtn = document.getElementById('ai-dict-character-modal-close');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            hideCharacterModal();
        });
    }

    // Close modal when clicking outside
    const modal = document.getElementById('ai-dict-character-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideCharacterModal();
            }
        });
    }

    // Reset prompt button
    const resetPromptBtn = document.getElementById('ai-dict-reset-prompt-btn');
    if (resetPromptBtn) {
        resetPromptBtn.addEventListener('click', () => {
            const inputTextarea = document.getElementById('ai-dict-character-input');

            if (inputTextarea) {
                // Restore original template without any replacement
                inputTextarea.value = DEFAULT_CHARACTER_PROMPT;
                if (typeof toastr !== 'undefined') {
                    toastr.success('已重置为默认提示词模板', '提示');
                }
            }
        });
    }

    // Generate description button
    const generateBtn = document.getElementById('ai-dict-generate-description-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('ai-dict-character-name');
            const inputTextarea = document.getElementById('ai-dict-character-input');
            const input = inputTextarea?.value?.trim();
            const characterName = nameInput?.value?.trim();

            if (!input) {
                if (typeof toastr !== 'undefined') {
                    toastr.warning('请先输入角色相关信息', '提示');
                }
                return;
            }

            // Disable button during generation
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 生成中...';

            try {
                await generateCharacterDescription({
                    input,
                    characterName,
                    settings,
                    sendOpenAIRequest,
                    oaiSettings
                });
            } catch (error) {
                console.error('[AI Dictionary] Error in generate button:', error);
            } finally {
                // Re-enable button
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 生成描述';
            }
        });
    }

    // Create character button
    const createBtn = document.getElementById('ai-dict-create-character-submit-btn');
    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('ai-dict-character-name');
            const outputTextarea = document.getElementById('ai-dict-character-output');

            const name = nameInput?.value?.trim();
            const description = outputTextarea?.value?.trim();

            if (!name) {
                if (typeof toastr !== 'undefined') {
                    toastr.warning('请输入角色名称', '提示');
                }
                return;
            }

            if (!description) {
                if (typeof toastr !== 'undefined') {
                    toastr.warning('请先生成角色描述', '提示');
                }
                return;
            }

            // Extract first message from description
            const firstMessage = extractFirstMessage(description);

            // Disable button during creation
            createBtn.disabled = true;
            createBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 创建中...';

            try {
                await createCharacterCard({ name, description, firstMessage, getCharacters, selectRmInfo });
            } catch (error) {
                console.error('[AI Dictionary] Error in create button:', error);
            } finally {
                // Re-enable button
                createBtn.disabled = false;
                createBtn.innerHTML = '<i class="fa-solid fa-check"></i> 创建角色卡';
            }
        });
    }
}
