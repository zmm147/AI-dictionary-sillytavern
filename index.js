import { extension_settings, getContext } from '../../../extensions.js';
import { getRequestHeaders, eventSource, event_types, generateRaw, saveSettingsDebounced } from '../../../../script.js';
import { oai_settings, chat_completion_sources, sendOpenAIRequest } from '../../../openai.js';

const EXTENSION_NAME = 'ai-dictionary';

// Dynamically determine extension path
const getExtensionUrl = () => {
    try {
        const url = new URL(import.meta.url);
        return url.pathname.substring(0, url.pathname.lastIndexOf('/'));
    } catch {
        return `scripts/extensions/${EXTENSION_NAME}`;
    }
};
const EXTENSION_URL = getExtensionUrl();

// Helper to detect mobile device
function isMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|ipad|iphone|ipod/i.test(userAgent.toLowerCase()) || window.innerWidth <= 800;
}

const defaultSettings = {
    enabled: true,
    systemPrompt: 'You are a professional English teacher.',
    userPrompt: `输入：%word%
上下文：%context%

请根据输入内容进行处理：
1. 如果是单词：给出基础释义（用【解释性描述】），然后分析在上下文中的具体含义。
2. 如果是短语或句子：先给出中文翻译再分析句子结构。`,
    contextRange: 'all', // 'all' = 全段, 'single' = 单段, 'sentence' = 一句
    connectionProfile: '', // Connection Profile ID, empty means use current
    enableDirectLookup: false,
    iconPosition: 'bottom-left',
    mobileTogglePosition: null, // Will be set to default on first load
    deepStudyPrompt: `请帮我深度学习单词 "%word%"：
1. 词根词缀分析（如有）
2. 常见搭配和用法
3. 同义词/反义词/易混淆单词
4. 记忆技巧建议`,
};

/** @type {Object} */
let settings = { ...defaultSettings };
/** @type {HTMLElement} */
let panelElement = null;
/** @type {HTMLElement} */
let toggleElement = null;
/** @type {HTMLElement} */
let iconElement = null;
/** @type {string} */
let selectedText = '';
/** @type {string} */
let selectedContext = '';
/** @type {boolean} */
let isPanelPinned = false;

/**
 * Settings UI Class
 * mimicking Quick Reply's SettingsUi structure
 */
class SettingsUi {
    constructor() {
        this.dom = null;
        this.template = null;
    }

    async render() {
        if (!this.dom) {
            // Fetch the HTML template using dynamic path
            const response = await fetch(`${EXTENSION_URL}/index.html`);
            if (response.ok) {
                const text = await response.text();
                // Create a document fragment
                this.template = document.createRange().createContextualFragment(text);
                // We expect the first child or the one with id 'ai-dictionary-extension-settings'
                this.dom = this.template.querySelector('#ai-dictionary-extension-settings');
                this.prepareDom();
            } else {
                console.error(`[${EXTENSION_NAME}] Failed to fetch settings template from ${EXTENSION_URL}/index.html`);
            }
        }
        return this.dom;
    }

    prepareDom() {
        if (!this.dom) return;

        // Enabled Toggle
        const enabledInput = this.dom.querySelector('#ai-dict-enabled');
        if (enabledInput) {
            enabledInput.checked = settings.enabled;
            enabledInput.addEventListener('change', () => {
                settings.enabled = enabledInput.checked;
                saveSettings();
            });
        }

        // Connection Profile
        const profileSelect = this.dom.querySelector('#ai-dict-connection-profile');
        if (profileSelect) {
            // Populate connection profiles
            populateConnectionProfiles(profileSelect);
            profileSelect.value = settings.connectionProfile || '';
            profileSelect.addEventListener('change', () => {
                settings.connectionProfile = profileSelect.value;
                saveSettings();
            });
        }

        // System Prompt
        const promptInput = this.dom.querySelector('#ai-dict-system-prompt');
        if (promptInput) {
            promptInput.value = settings.systemPrompt;
            promptInput.addEventListener('change', () => {
                settings.systemPrompt = promptInput.value;
                saveSettings();
            });
        }

        // User Prompt
        const userPromptInput = this.dom.querySelector('#ai-dict-user-prompt');
        if (userPromptInput) {
            userPromptInput.value = settings.userPrompt;
            userPromptInput.addEventListener('change', () => {
                settings.userPrompt = userPromptInput.value;
                saveSettings();
            });
        }

        // Context Range
        const rangeSelect = this.dom.querySelector('#ai-dict-context-range');

        if (rangeSelect) {
            rangeSelect.value = settings.contextRange;
            rangeSelect.addEventListener('change', () => {
                settings.contextRange = rangeSelect.value;
                saveSettings();
            });
        }

        // Direct Lookup
        const directLookupInput = this.dom.querySelector('#ai-dict-direct-lookup');
        if (directLookupInput) {
            directLookupInput.checked = settings.enableDirectLookup;
            directLookupInput.addEventListener('change', () => {
                settings.enableDirectLookup = directLookupInput.checked;
                saveSettings();
            });
        }

        // Icon Position
        const iconPosSelect = this.dom.querySelector('#ai-dict-icon-position');
        if (iconPosSelect) {
            iconPosSelect.value = settings.iconPosition;
            iconPosSelect.addEventListener('change', () => {
                settings.iconPosition = iconPosSelect.value;
                saveSettings();
            });
        }

        // Deep Study Prompt
        const deepStudyPromptInput = this.dom.querySelector('#ai-dict-deep-study-prompt');
        if (deepStudyPromptInput) {
            deepStudyPromptInput.value = settings.deepStudyPrompt;
            deepStudyPromptInput.addEventListener('change', () => {
                settings.deepStudyPrompt = deepStudyPromptInput.value;
                saveSettings();
            });
        }
    }
}

/**
 * Populate connection profiles dropdown
 * @param {HTMLSelectElement} selectElement
 */
function populateConnectionProfiles(selectElement) {
    // Clear existing options except the first one
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    // Get connection profiles from extension_settings
    const connectionManager = extension_settings.connectionManager;
    if (connectionManager && Array.isArray(connectionManager.profiles)) {
        for (const profile of connectionManager.profiles) {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            selectElement.appendChild(option);
        }
    }
}

async function loadSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = { ...defaultSettings };
    }
    // Merge loaded settings with defaults to ensure all keys exist
    settings = { ...defaultSettings, ...extension_settings[EXTENSION_NAME] };
}

function saveSettings() {
    extension_settings[EXTENSION_NAME] = { ...settings };
    saveSettingsDebounced();
}

// --- Core Functionality ---

/**
 * Store the parent element of the selected text for context extraction
 * @type {HTMLElement}
 */
let selectedParentElement = null;

/**
 * Store the current prompt for display purposes
 * @type {string}
 */
let currentPrompt = '';

/**
 * Check if text is a single word (no spaces)
 * @param {string} text
 * @returns {boolean}
 */
function isSingleWord(text) {
    return text && !text.trim().includes(' ');
}

function extractContext(text) {
    const range = settings.contextRange;

    if (range === 'sentence') {
        // 一句 - 段落中的一个句子
        const sentences = selectedContext.split(/[.!?。！？]+/);
        for (const sentence of sentences) {
            if (sentence.includes(selectedText)) {
                return sentence.trim();
            }
        }
        return selectedContext;
    } else if (range === 'single') {
        // 单段 - 只有选中文本所在的一段
        return selectedContext;
    } else if (range === 'all') {
        // 全段 - 所有同级标签的全部段落
        if (selectedParentElement && selectedParentElement.parentElement) {
            const parent = selectedParentElement.parentElement;
            const siblings = parent.querySelectorAll(':scope > p, :scope > div');
            if (siblings.length > 0) {
                return Array.from(siblings).map(el => el.textContent.trim()).filter(t => t).join('\n\n');
            }
        }
        return selectedContext;
    }
    return selectedContext;
}

async function performDictionaryLookup() {
    // Remove icon if present
    hideIcon();

    // Clear text selection
    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }

    if (!selectedText.trim()) {
        showPanel('No word selected', 'Please select a word on the page first.', 'error');
        return;
    }

    try {
        // Show loading state and ensure panel is expanded
        showPanel('Looking up...', `Fetching definitions for: "${selectedText}"...`, 'loading');

        // Force expand if mobile (desktop popup is always 'expanded' effectively)
        if (isMobile()) {
            expandPanel();
        }

        // Show panel immediately with loading states for both sections
        const initialHtmlContent = createMergedContent(selectedText, null);
        showPanelHtml(`${selectedText}`, initialHtmlContent, 'success');

        // Bind deep study button event if it exists
        bindDeepStudyButton(selectedText);

        // Start both lookups in parallel
        const youdaoPromise = fetchYoudaoDictionary(selectedText).catch(error => {
            console.warn('Youdao dictionary fetch failed:', error);
            return null;
        });

        const aiPromise = fetchAIDefinition(selectedText).catch(error => {
            console.error('AI definition fetch error:', error);
            const aiContentElement = document.getElementById('ai-definition-content');
            if (aiContentElement) {
                aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
            }
        });

        // Wait for Youdao results and update the panel
        const youdaoResults = await youdaoPromise;
        if (youdaoResults) {
            updateYoudaoSection(selectedText, youdaoResults);
        }

        // Wait for AI to complete (it updates UI via streaming)
        await aiPromise;

    } catch (error) {
        console.error('AI Dictionary lookup error:', error);
        showPanel('Error', `Failed to lookup word: ${error.message}`, 'error');
    }
}

// Cache for proxy availability check
let proxyAvailable = null;

/**
 * Check if local SillyTavern proxy is available
 * @returns {Promise<boolean>}
 */
async function checkProxyAvailable() {
    if (proxyAvailable !== null) {
        return proxyAvailable;
    }

    try {
        // Try a simple request to the proxy endpoint
        const response = await fetch('/proxy/https://www.google.com', {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000)
        });
        proxyAvailable = response.ok || response.status !== 404;
    } catch (error) {
        proxyAvailable = false;
    }

    console.log(`[${EXTENSION_NAME}] Local proxy available:`, proxyAvailable);
    return proxyAvailable;
}

/**
 * Public CORS proxies as fallback
 */
const PUBLIC_CORS_PROXIES = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

async function fetchYoudaoDictionary(word) {
    try {
        console.log(`[${EXTENSION_NAME}] Fetching Youdao dictionary for: ${word}`);

        const youdaoUrl = `https://dict.youdao.com/w/${encodeURIComponent(word)}`;
        let response = null;
        let proxyUsed = '';

        // Check if local proxy is available
        const useLocalProxy = await checkProxyAvailable();

        if (useLocalProxy) {
            // Use SillyTavern's built-in CORS proxy
            const proxyUrl = `/proxy/${youdaoUrl}`;
            proxyUsed = 'local';
            console.log(`[${EXTENSION_NAME}] Using local proxy:`, proxyUrl);

            response = await fetch(proxyUrl, { method: 'GET' });
        } else {
            // Try public CORS proxies
            for (const getProxyUrl of PUBLIC_CORS_PROXIES) {
                try {
                    const proxyUrl = getProxyUrl(youdaoUrl);
                    proxyUsed = proxyUrl.split('?')[0];
                    console.log(`[${EXTENSION_NAME}] Trying public proxy:`, proxyUsed);

                    response = await fetch(proxyUrl, {
                        method: 'GET',
                        signal: AbortSignal.timeout(10000)
                    });

                    if (response.ok) {
                        console.log(`[${EXTENSION_NAME}] Public proxy succeeded:`, proxyUsed);
                        break;
                    }
                } catch (proxyError) {
                    console.warn(`[${EXTENSION_NAME}] Public proxy failed:`, proxyUsed, proxyError.message);
                    response = null;
                }
            }
        }

        if (!response || !response.ok) {
            console.warn(`[${EXTENSION_NAME}] All proxies failed for Youdao`);
            // Return special error object to indicate proxy failure
            return { proxyError: true };
        }

        console.log(`[${EXTENSION_NAME}] Proxy response status:`, response.status);

        const html = await response.text();
        console.log(`[${EXTENSION_NAME}] Received HTML, length:`, html.length);

        // Parse the HTML content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const results = parseYoudaoHtml(doc, word);

        if (results && results.length > 0) {
            console.log(`[${EXTENSION_NAME}] Found ${results.length} Youdao result(s)`);
            return results;
        }

        console.log(`[${EXTENSION_NAME}] No Youdao results found`);
        return null;
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Youdao dictionary lookup error:`, error.message);
        console.log(`[${EXTENSION_NAME}] Will show AI definition instead`);
        return null;
    }
}

function parseYoudaoHtml(doc, word) {
    const results = [];

    // Try Collins dictionary first
    const collinsResult = parseCollinsHtml(doc);
    if (collinsResult) {
        results.push(collinsResult);
    }

    // If no Collins, try EC dictionary
    if (results.length === 0) {
        const ecResult = parseYoudaoEcHtml(doc);
        if (ecResult) {
            results.push(ecResult);
        }
    }

    // If still nothing, try web definitions
    if (results.length === 0) {
        const webResult = parseWebDefinitionsHtml(doc);
        if (webResult) {
            results.push(webResult);
        }
    }

    return results;
}

function parseCollinsHtml(doc) {
    try {
        const defNodes = doc.querySelectorAll('#collinsResult .ol li');
        if (!defNodes || !defNodes.length) return null;

        const expression = getText(doc.querySelector('#collinsResult h4 .title'));
        const reading = getText(doc.querySelector('#collinsResult h4 .phonetic'));

        if (!expression) return null;

        // Get extra info (star rating, exam cert)
        let extrainfo = '';
        const starNode = doc.querySelector('#collinsResult h4 .star');
        if (starNode) {
            const starClass = starNode.className.split(' ')[1];
            if (starClass) {
                const starCount = starClass.substring(4, 5);
                if (starCount) {
                    extrainfo += `<span class="star">${'★'.repeat(Number(starCount))}</span>`;
                }
            }
        }

        const cets = getText(doc.querySelector('#collinsResult h4 .rank'));
        if (cets) {
            const cetTags = cets.split(' ').map(c => `<span class="cet">${c}</span>`).join('');
            extrainfo += cetTags;
        }

        // Build definitions with proper example sentences
        const definitions = [];
        for (const defNode of defNodes) {
            let def = '<div class="odh-definition">';

            // Get POS (Part of Speech)
            const posNode = defNode.querySelector('.collinsMajorTrans p .additional');
            if (posNode) {
                const pos = getText(posNode);
                def += `<span class="pos">${escapeHtml(pos)}</span>`;
            }

            // Get English and Chinese translation
            const tranNode = defNode.querySelector('.collinsMajorTrans p');
            if (tranNode) {
                // Clone to avoid modifying original
                const clonedNode = tranNode.cloneNode(true);

                // Remove POS nodes
                clonedNode.querySelectorAll('.additional').forEach(n => n.remove());

                const fullText = clonedNode.innerText;

                // Try to extract Chinese translation
                const chnMatch = fullText.match(/[\u4e00-\u9fa5\uff0c\u3002]+/g);
                const chnTran = chnMatch ? chnMatch.join('').trim() : '';

                // Extract English translation (remove Chinese parts)
                const engTran = fullText.replace(/[\u4e00-\u9fa5\uff0c\u3002]+/g, '').trim();

                def += '<span class="tran">';
                if (engTran) {
                    def += `<span class="eng_tran">${escapeHtml(engTran)}</span>`;
                }
                if (chnTran) {
                    def += `<span class="chn_tran">${escapeHtml(chnTran)}</span>`;
                }
                def += '</span>';
            }

            // Get example sentences
            const exampleNodes = defNode.querySelectorAll('.exampleLists');
            if (exampleNodes && exampleNodes.length > 0) {
                def += '<ul class="sents">';
                for (let i = 0; i < Math.min(exampleNodes.length, 2); i++) {
                    const example = exampleNodes[i];
                    const engSent = getText(example.querySelector('p'));
                    const chnSent = getText(example.querySelector('p+p'));

                    def += '<li class="sent">';
                    if (engSent) {
                        def += `<span class="eng_sent">${escapeHtml(engSent)}</span>`;
                    }
                    def += ' - ';
                    if (chnSent) {
                        def += `<span class="chn_sent">${escapeHtml(chnSent)}</span>`;
                    }
                    def += '</li>';
                }
                def += '</ul>';
            }

            def += '</div>';
            definitions.push(def);
        }

        if (definitions.length === 0) return null;

        return {
            expression,
            reading: reading || '',
            extrainfo: extrainfo || '',
            definitions: definitions,
            audios: [
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=1`,
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=2`
            ]
        };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Error parsing Collins:`, error.message);
        return null;
    }
}

function parseYoudaoEcHtml(doc) {
    try {
        const defNodes = doc.querySelectorAll('#phrsListTab .trans-container ul li');
        if (!defNodes || !defNodes.length) return null;

        const expression = getText(doc.querySelector('#phrsListTab .wordbook-js .keyword'));
        if (!expression) return null;

        let definition = '<ul class="ec">';
        for (const defNode of defNodes) {
            const text = getText(defNode);
            if (text) {
                definition += `<li>${escapeHtml(text)}</li>`;
            }
        }
        definition += '</ul>';

        return {
            expression,
            reading: '',
            definitions: [definition],
            audios: [
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=1`,
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=2`
            ]
        };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Error parsing EC:`, error.message);
        return null;
    }
}

function parseWebDefinitionsHtml(doc) {
    try {
        const webNode = doc.querySelector('#webResult');
        if (!webNode) return null;

        const expression = getText(doc.querySelector('h1'));
        if (!expression) return null;

        let definition = '<div>';
        const items = doc.querySelectorAll('#webResult .web-item, #webResult .web-section');
        if (items && items.length > 0) {
            definition += '<ul class="web">';
            for (let i = 0; i < Math.min(items.length, 5); i++) {
                const text = getText(items[i]);
                if (text) {
                    definition += `<li>${escapeHtml(text)}</li>`;
                }
            }
            definition += '</ul>';
        }
        definition += '</div>';

        return {
            expression,
            reading: '',
            definitions: [definition]
        };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Error parsing web definitions:`, error.message);
        return null;
    }
}

function getText(node) {
    if (!node) return '';
    return node.innerText.trim();
}

/**
 * Bind deep study button click event
 * @param {string} word
 */
function bindDeepStudyButton(word) {
    const btn = document.getElementById('ai-dict-deep-study-btn');
    if (btn) {
        btn.addEventListener('click', () => performDeepStudy(word));
    }
}

/**
 * Perform deep study for a word
 * @param {string} word
 */
async function performDeepStudy(word) {
    const btn = document.getElementById('ai-dict-deep-study-btn');
    const contentElement = document.getElementById('ai-dict-deep-study-content');

    if (!contentElement) return;

    // Disable button and show loading
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>正在生成深度学习内容...</span>';
    }

    contentElement.style.display = 'block';
    contentElement.innerHTML = '<p class="ai-dict-loading-text">正在获取深度学习内容...</p>';

    try {
        // Build the deep study prompt
        const deepStudyPrompt = settings.deepStudyPrompt.replace(/%word%/g, word);

        // Build messages array
        const messages = [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: deepStudyPrompt }
        ];

        // Check if streaming is enabled
        const streamEnabled = oai_settings.stream_openai;

        if (streamEnabled) {
            // Use streaming
            await fetchWithStreaming(messages, contentElement);
        } else {
            // Use non-streaming
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

        // Update button to show completion
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

async function fetchAIDefinition(word) {
    const extractedContext = extractContext(document.body.innerText);

    // Use userPrompt with variable substitution
    const lookupPrompt = settings.userPrompt
        .replace(/%word%/g, word)
        .replace(/%context%/g, extractedContext);

    // Store current prompt for display
    currentPrompt = `System Prompt:\n${settings.systemPrompt}\n\nUser Prompt:\n${lookupPrompt}`;

    // Update the prompt display if it exists
    const promptElement = document.getElementById('ai-dict-current-prompt');
    if (promptElement) {
        promptElement.textContent = currentPrompt;
    }

    const aiContentElement = document.getElementById('ai-definition-content');
    if (!aiContentElement) return null;

    // Store original profile to restore later
    const originalProfile = extension_settings.connectionManager?.selectedProfile;
    let profileApplied = false;

    try {
        // Apply connection profile if specified
        if (settings.connectionProfile) {
            const connectionManager = extension_settings.connectionManager;
            if (connectionManager && Array.isArray(connectionManager.profiles)) {
                const profile = connectionManager.profiles.find(p => p.id === settings.connectionProfile);
                if (profile) {
                    // Apply the profile using slash command
                    const profileSelect = document.getElementById('connection_profiles');
                    if (profileSelect) {
                        profileSelect.value = profile.id;
                        profileSelect.dispatchEvent(new Event('change'));
                        profileApplied = true;
                        // Wait for profile to be applied
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        }

        // Build messages array
        const messages = [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: lookupPrompt }
        ];

        // Check if streaming is enabled
        const streamEnabled = oai_settings.stream_openai;

        if (streamEnabled) {
            // Use streaming
            await fetchWithStreaming(messages, aiContentElement);
        } else {
            // Use non-streaming (generateRaw)
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
        return null;
    } catch (error) {
        console.error('AI definition lookup error:', error);
        aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
        return null;
    } finally {
        // Restore original profile if we changed it
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
 * Fetch AI definition with streaming
 * @param {Array} messages Messages array
 * @param {HTMLElement} aiContentElement Element to display content
 */
async function fetchWithStreaming(messages, aiContentElement) {
    // Create an AbortController for this request
    const abortController = new AbortController();

    try {
        // Use sendOpenAIRequest with 'normal' type to enable streaming
        const generator = await sendOpenAIRequest('normal', messages, abortController.signal);

        if (typeof generator === 'function') {
            // It's an async generator (streaming mode)
            aiContentElement.innerHTML = '<p></p>';
            const textElement = aiContentElement.querySelector('p');
            let fullText = '';

            for await (const data of generator()) {
                if (data.text) {
                    fullText = data.text;
                    textElement.innerHTML = fullText.replace(/\n/g, '<br>');
                }
            }

            if (!fullText) {
                aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
            }
        } else {
            // Non-streaming response
            const content = generator?.choices?.[0]?.message?.content || '';
            if (content) {
                aiContentElement.innerHTML = `<p>${content.replace(/\n/g, '<br>')}</p>`;
            } else {
                aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
            }
        }
    } catch (error) {
        console.error('Streaming error:', error);
        throw error;
    }
}

function createMergedContent(word, youdaoResults) {
    const collapsibleId = `youdao-definitions-${Date.now()}`;
    const promptCollapsibleId = `prompt-view-${Date.now()}`;

    // Check if we have Youdao results
    const hasYoudaoResults = youdaoResults && Array.isArray(youdaoResults) && youdaoResults.length > 0;

    // Check if proxy error occurred
    const hasProxyError = youdaoResults && youdaoResults.proxyError === true;

    // Show deep study button for single words
    const showDeepStudy = isSingleWord(word);

    let youdaoSection = '';

    if (hasProxyError) {
        // Show proxy error message
        youdaoSection = `
            <div class="ai-dict-proxy-error">
                <p class="ai-dict-error-text">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                    无法获取有道词典数据：CORS 代理不可用
                </p>
                <p class="ai-dict-hint-text">
                    请在 SillyTavern 配置文件 <code>config.yaml</code> 中设置：<br>
                    <code>enableCorsProxy: true</code>
                </p>
            </div>
        `;
    } else if (hasYoudaoResults) {
        youdaoSection = `
            <!-- Youdao header section (always visible) -->
            ${formatYoudaoHeadSection(youdaoResults)}

            <!-- Collapsible definitions section -->
            <div class="ai-dict-collapsible-section">
                <div class="ai-dict-collapsible-header" data-target="${collapsibleId}">
                    <i class="fa-solid fa-chevron-right"></i>
                    <span>释义</span>
                </div>
                <div id="${collapsibleId}" class="ai-dict-collapsible-content">
                    ${formatYoudaoDefinitions(youdaoResults)}
                </div>
            </div>
        `;
    } else if (youdaoResults === null) {
        // Loading state - youdaoResults is null means still loading
        youdaoSection = `
            <div class="ai-dict-youdao-loading">
                <p class="ai-dict-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> 正在获取有道词典...</p>
            </div>
        `;
    }

    const deepStudySection = showDeepStudy ? `
            <!-- Deep Study section -->
            <div class="ai-dict-deep-study-section">
                <button id="ai-dict-deep-study-btn" class="menu_button ai-dict-deep-study-btn">
                    <i class="fa-solid fa-graduation-cap"></i>
                    <span>深度学习此单词</span>
                </button>
                <div id="ai-dict-deep-study-content" class="ai-dict-deep-study-content" style="display: none;"></div>
            </div>
    ` : '';

    const html = `
        <div class="ai-dict-merged-container">
            <!-- Youdao section container -->
            <div id="ai-dict-youdao-section">
                ${youdaoSection}
            </div>

            <!-- AI Definition section -->
            <div class="ai-dict-ai-section">
                <div id="ai-definition-content" class="ai-dict-ai-content">
                    <p class="ai-dict-loading-text">正在获取 AI 定义...</p>
                </div>
            </div>

            ${deepStudySection}

            <!-- Prompt view section -->
            <div class="ai-dict-collapsible-section ai-dict-prompt-section">
                <div class="ai-dict-collapsible-header" data-target="${promptCollapsibleId}">
                    <i class="fa-solid fa-chevron-right"></i>
                    <span>查看提示词</span>
                </div>
                <div id="${promptCollapsibleId}" class="ai-dict-collapsible-content ai-dict-prompt-content">
                    <pre id="ai-dict-current-prompt"></pre>
                </div>
            </div>
        </div>
    `;
    return html;
}

/**
 * Update Youdao section dynamically after results are fetched
 * @param {string} word The word being looked up
 * @param {Array|Object} youdaoResults Youdao results or error object
 */
function updateYoudaoSection(word, youdaoResults) {
    const container = document.getElementById('ai-dict-youdao-section');
    if (!container) return;

    const collapsibleId = `youdao-definitions-${Date.now()}`;

    // Check if we have Youdao results
    const hasYoudaoResults = youdaoResults && Array.isArray(youdaoResults) && youdaoResults.length > 0;

    // Check if proxy error occurred
    const hasProxyError = youdaoResults && youdaoResults.proxyError === true;

    let youdaoSection = '';

    if (hasProxyError) {
        // Show proxy error message
        youdaoSection = `
            <div class="ai-dict-proxy-error">
                <p class="ai-dict-error-text">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                    无法获取有道词典数据：CORS 代理不可用
                </p>
                <p class="ai-dict-hint-text">
                    请在 SillyTavern 配置文件 <code>config.yaml</code> 中设置：<br>
                    <code>enableCorsProxy: true</code>
                </p>
            </div>
        `;
    } else if (hasYoudaoResults) {
        youdaoSection = `
            <!-- Youdao header section (always visible) -->
            ${formatYoudaoHeadSection(youdaoResults)}

            <!-- Collapsible definitions section -->
            <div class="ai-dict-collapsible-section">
                <div class="ai-dict-collapsible-header" data-target="${collapsibleId}">
                    <i class="fa-solid fa-chevron-right"></i>
                    <span>释义</span>
                </div>
                <div id="${collapsibleId}" class="ai-dict-collapsible-content">
                    ${formatYoudaoDefinitions(youdaoResults)}
                </div>
            </div>
        `;
    }
    // If no results and no error, just clear the loading state (leave empty)

    container.innerHTML = youdaoSection;

    // Rebind event listeners for audio buttons
    const audioButtons = container.querySelectorAll('.odh-playaudio');
    audioButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const audioUrl = btn.getAttribute('data-audio-url');
            if (audioUrl) {
                playAudio(audioUrl);
            }
        });
    });

    // Rebind event listeners for collapsible headers
    const collapsibleHeaders = container.querySelectorAll('.ai-dict-collapsible-header');
    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targetId = header.getAttribute('data-target');
            if (targetId) {
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    targetElement.classList.toggle('expanded');
                    const icon = header.querySelector('i');
                    if (icon) {
                        icon.classList.toggle('expanded');
                    }
                }
            }
        });
    });
}

function formatYoudaoHeadSection(results) {
    if (!results || results.length === 0) {
        return '';
    }

    let html = '';
    for (const result of results) {
        html += '<div class="odh-note">';
        html += '<div class="odh-headsection">';

        // Word expression and phonetic
        html += `<span class="odh-expression">${escapeHtml(result.expression)}</span>`;

        if (result.reading) {
            html += `<span class="odh-reading">${escapeHtml(result.reading)}</span>`;
        }

        // Extra info and Audio buttons - both on the right
        if (result.extrainfo || (result.audios && result.audios.length > 0)) {
            if (result.extrainfo) {
                html += `<span class="odh-extra">${result.extrainfo}</span>`;
            }

            if (result.audios && result.audios.length > 0) {
                html += '<span class="odh-audios">';
                for (let i = 0; i < result.audios.length; i++) {
                    const audioUrl = result.audios[i];
                    html += `<img class="odh-playaudio" data-audio-url="${escapeHtml(audioUrl)}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.02zM14 3.1v2.02c2.84.86 4.9 3.52 4.9 6.88s-2.06 6.02-4.9 6.88v2.02c4.26-.96 7.5-4.9 7.5-8.9s-3.24-7.94-7.5-8.9z'/%3E%3C/svg%3E" title="${i === 0 ? 'UK Pronunciation' : 'US Pronunciation'}">`;
                }
                html += '</span>';
            }
        }

        html += '</div>';
        html += '</div>';
    }

    return html;
}

function formatYoudaoDefinitions(results) {
    if (!results || results.length === 0) {
        return '<p>未找到词典结果。</p>';
    }

    let html = '<div class="odh-notes">';

    for (const result of results) {
        // Definitions only (without head section)
        if (result.definitions && result.definitions.length > 0) {
            for (const definition of result.definitions) {
                html += definition;
            }
        }
    }

    html += '</div>';
    return html;
}

function updateAIDefinitionSection(aiDefinition) {
    const aiContentElement = document.getElementById('ai-definition-content');
    if (aiContentElement) {
        if (aiDefinition) {
            aiContentElement.innerHTML = `<p>${aiDefinition.replace(/\n/g, '<br>')}</p>`;
        } else {
            aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
        }
    }
}

function formatYoudaoResults(results) {
    if (!results || results.length === 0) {
        return '<p>未找到词典结果。</p>';
    }

    let html = '<div class="odh-notes">';

    for (const result of results) {
        // Main note container
        html += '<div class="odh-note">';

        // Head section with word, phonetic, and audio
        html += '<div class="odh-headsection">';

        // Word expression and phonetic - inline
        html += `<span class="odh-expression">${escapeHtml(result.expression)}</span>`;

        if (result.reading) {
            html += `<span class="odh-reading">${escapeHtml(result.reading)}</span>`;
        }

        // Extra info and Audio buttons - both on the right
        if (result.extrainfo || (result.audios && result.audios.length > 0)) {
            if (result.extrainfo) {
                html += `<span class="odh-extra">${result.extrainfo}</span>`;
            }

            // Audio buttons - on the right
            if (result.audios && result.audios.length > 0) {
                html += '<span class="odh-audios">';
                for (let i = 0; i < result.audios.length; i++) {
                    const audioUrl = result.audios[i];
                    html += `<img class="odh-playaudio" data-audio-url="${escapeHtml(audioUrl)}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.02zM14 3.1v2.02c2.84.86 4.9 3.52 4.9 6.88s-2.06 6.02-4.9 6.88v2.02c4.26-.96 7.5-4.9 7.5-8.9s-3.24-7.94-7.5-8.9z'/%3E%3C/svg%3E" title="${i === 0 ? 'UK Pronunciation' : 'US Pronunciation'}">`;
                }
                html += '</span>';
            }
        }

        html += '</div>'; // end headsection

        // Definitions
        if (result.definitions && result.definitions.length > 0) {
            for (const definition of result.definitions) {
                html += definition;
            }
        }

        html += '</div>'; // end odh-note
    }

    html += '</div>'; // end odh-notes

    return html;
}

function playAudio(audioUrl) {
    try {
        const audio = new Audio(audioUrl);
        audio.play().catch(err => {
            console.warn(`[${EXTENSION_NAME}] Failed to play audio:`, err.message);
        });
    } catch (error) {
        console.error(`[${EXTENSION_NAME}] Audio playback error:`, error.message);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function createSidePanel() {
    const isMobileMode = isMobile();

    // 1. Panel Container
    const panel = document.createElement('div');
    panel.id = 'ai-dictionary-panel';

    if (isMobileMode) {
        panel.className = 'ai-dict-mobile-panel';
        document.body.classList.add('ai-dict-mobile-active');
    } else {
        panel.className = 'ai-dict-desktop-popup';
        panel.style.display = 'none';
    }

    // Header
    const header = document.createElement('div');
    header.className = 'ai-dict-panel-header';

    const titleEl = document.createElement('h3');
    titleEl.textContent = 'AI Dictionary';
    header.appendChild(titleEl);

    // Action buttons container for desktop
    if (!isMobileMode) {
        const headerActions = document.createElement('div');
        headerActions.className = 'ai-dict-header-actions';

        // Pin button
        const pinBtn = document.createElement('button');
        pinBtn.className = 'ai-dict-pin-btn';
        pinBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i>';
        pinBtn.title = '固定面板';
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isPanelPinned = !isPanelPinned;
            pinBtn.classList.toggle('active', isPanelPinned);
            panel.classList.toggle('pinned', isPanelPinned);
            pinBtn.title = isPanelPinned ? '取消固定' : '固定面板';
        });
        headerActions.appendChild(pinBtn);

        header.appendChild(headerActions);

        // Desktop drag functionality
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let panelStartLeft = 0;
        let panelStartTop = 0;

        header.addEventListener('mousedown', (e) => {
            // Don't drag if clicking on buttons
            if (e.target.closest('button')) return;

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = panel.getBoundingClientRect();
            panelStartLeft = rect.left;
            panelStartTop = rect.top;

            // Remove transform for proper positioning
            panel.style.transform = 'none';
            panel.style.left = panelStartLeft + 'px';
            panel.style.top = panelStartTop + 'px';

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            const newLeft = Math.max(0, Math.min(panelStartLeft + deltaX, window.innerWidth - panel.offsetWidth));
            const newTop = Math.max(0, Math.min(panelStartTop + deltaY, window.innerHeight - panel.offsetHeight));

            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    panel.appendChild(header);
    
    // Content
    const contentEl = document.createElement('div');
    contentEl.className = 'ai-dict-panel-content';
    panel.appendChild(contentEl);
    
    document.body.appendChild(panel);
    panelElement = panel;
    
    // 2. Mobile Specific Buttons
    if (isMobileMode) {
        // A. Toggle Button (Floating "Open" Icon when collapsed) - Right Middle
        const toggle = document.createElement('div');
        toggle.id = 'ai-dictionary-panel-toggle';
        toggle.innerHTML = '<i class="fa-solid fa-book-open"></i>';
        toggle.title = 'Expand AI Dictionary';

        // Set position - use left/top pixel values instead of CSS positioning
        toggle.style.position = 'fixed';
        toggle.style.pointerEvents = 'auto';
        toggle.style.zIndex = '200005';

        // Load saved position or use default (right middle)
        if (settings.mobileTogglePosition) {
            toggle.style.left = settings.mobileTogglePosition.left;
            toggle.style.top = settings.mobileTogglePosition.top;
        } else {
            // Default: right middle of screen
            const toggleWidth = 40;
            const toggleHeight = 60;
            const defaultLeft = window.innerWidth - toggleWidth;
            const defaultTop = window.innerHeight / 2 - toggleHeight / 2;
            toggle.style.left = defaultLeft + 'px';
            toggle.style.top = defaultTop + 'px';
        }

        // Touch/drag state for repositioning
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragStartLeft = 0;
        let dragStartTop = 0;

        toggle.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            dragStartLeft = parseInt(toggle.style.left) || 0;
            dragStartTop = parseInt(toggle.style.top) || 0;
            isDragging = false;
        });

        toggle.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            const deltaX = touch.clientX - dragStartX;
            const deltaY = touch.clientY - dragStartY;

            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                isDragging = true;
                e.preventDefault();

                const newLeft = Math.max(0, Math.min(dragStartLeft + deltaX, window.innerWidth - 40));
                const newTop = Math.max(0, Math.min(dragStartTop + deltaY, window.innerHeight - 60));

                toggle.style.left = newLeft + 'px';
                toggle.style.top = newTop + 'px';
            }
        });

        toggle.addEventListener('touchend', (e) => {
            if (isDragging) {
                // Save new position
                settings.mobileTogglePosition = {
                    left: toggle.style.left,
                    top: toggle.style.top
                };
                saveSettings();
                isDragging = false;
            } else {
                // Not dragging, just a tap - expand panel
                e.preventDefault();
                e.stopPropagation();
                expandPanel();
            }
        });

        // Click handler for desktop
        toggle.addEventListener('click', (e) => {
            if (!isDragging) {
                e.preventDefault();
                e.stopPropagation();
                expandPanel();
            }
        });

        document.body.appendChild(toggle);
        toggleElement = toggle;

        // B. Collapse Button (Attached to Panel - Left Middle)
        const collapseBtn = document.createElement('div');
        collapseBtn.id = 'ai-dictionary-panel-collapse-btn';
        collapseBtn.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
        collapseBtn.title = 'Collapse';
        
        // Force center positioning with inline styles
        collapseBtn.style.position = 'absolute';
        collapseBtn.style.top = '50%';
        collapseBtn.style.left = '-30px';
        collapseBtn.style.transform = 'translateY(-50%)';
        collapseBtn.style.bottom = 'auto';
        collapseBtn.style.pointerEvents = 'auto'; // Ensure clickable
        collapseBtn.style.zIndex = '200002'; // Layer correctly
        
        const collapseAction = (e) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation(); 
            collapsePanel();
        };
        collapseBtn.addEventListener('click', collapseAction);
        collapseBtn.addEventListener('touchstart', collapseAction, { passive: false });
        
        // Append to panel so it moves with it
        panel.appendChild(collapseBtn);
    }
}

function showPanel(title, content, type = 'info') {
    if (!panelElement) {
        createSidePanel();
    }

    const panel = panelElement;

    // Preserve classes, just update status class
    panel.classList.remove('ai-dict-loading', 'ai-dict-error', 'ai-dict-success', 'ai-dict-info');
    panel.classList.add(`ai-dict-${type}`);

    // If desktop, ensure it's visible
    if (!isMobile()) {
        panel.style.display = 'flex';
    }

    const titleEl = panel.querySelector('.ai-dict-panel-header h3');
    if (titleEl) titleEl.textContent = title;

    const contentEl = panel.querySelector('.ai-dict-panel-content');
    if (contentEl) contentEl.textContent = content;
}

function showPanelHtml(title, htmlContent, type = 'info') {
    if (!panelElement) {
        createSidePanel();
    }

    const panel = panelElement;

    // Preserve classes, just update status class
    panel.classList.remove('ai-dict-loading', 'ai-dict-error', 'ai-dict-success', 'ai-dict-info');
    panel.classList.add(`ai-dict-${type}`);

    // If desktop, ensure it's visible
    if (!isMobile()) {
        panel.style.display = 'flex';
    }

    const titleEl = panel.querySelector('.ai-dict-panel-header h3');
    if (titleEl) titleEl.textContent = title;

    const contentEl = panel.querySelector('.ai-dict-panel-content');
    if (contentEl) {
        contentEl.innerHTML = htmlContent;

        // Add event listeners to tab buttons (for old tabbed interface)
        const tabBtns = contentEl.querySelectorAll('.ai-dict-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = btn.getAttribute('data-tab');
                switchTab(tabName);
            });
        });

        // Add event listeners to audio buttons
        const audioButtons = contentEl.querySelectorAll('.odh-playaudio');
        audioButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const audioUrl = btn.getAttribute('data-audio-url');
                if (audioUrl) {
                    playAudio(audioUrl);
                }
            });
        });

        // Add event listeners to collapsible headers (for new merged interface)
        const collapsibleHeaders = contentEl.querySelectorAll('.ai-dict-collapsible-header');
        collapsibleHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetId = header.getAttribute('data-target');
                if (targetId) {
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                        targetElement.classList.toggle('expanded');
                        const icon = header.querySelector('i');
                        if (icon) {
                            icon.classList.toggle('expanded');
                        }
                    }
                }
            });
        });
    }
}

function switchTab(tabName) {
    // Remove active class from all buttons and panes
    const tabBtns = document.querySelectorAll('.ai-dict-tab-btn');
    const tabPanes = document.querySelectorAll('.ai-dict-tab-pane');

    tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });

    tabPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === tabName) {
            pane.classList.add('active');
        }
    });
}

function expandPanel() {
    if (!panelElement) createSidePanel();
    
    // Force reflow to ensure transition works
    void panelElement.offsetWidth;
    
    panelElement.classList.add('expanded');
    
    // Let CSS handle toggle visibility using sibling selector
    // .ai-dict-mobile-panel.expanded + #ai-dictionary-panel-toggle { display: none; }
}

function collapsePanel() {
    if (panelElement) {
        panelElement.classList.remove('expanded');
        // Force reflow to ensure state is updated
        void panelElement.offsetWidth;
    }
}

function createIcon(x, y) {
    const icon = document.createElement('div');
    icon.id = 'ai-dictionary-icon';
    icon.innerHTML = '<i class="fa-solid fa-book"></i>';
    icon.style.left = `${x}px`;
    icon.style.top = `${y}px`;
    
    icon.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        e.stopPropagation();
        performDictionaryLookup();
    });

    icon.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        performDictionaryLookup();
    });
    
    return icon;
}

function showIcon(x, y) {
    hideIcon();
    const icon = createIcon(x, y);
    document.body.appendChild(icon);
    iconElement = icon;
}

function hideIcon() {
    if (iconElement) {
        iconElement.remove();
        iconElement = null;
    }
}

// Simple debounce function
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function handleTextSelection(event) {
    if (!settings.enabled) return;

    // Check if click was on the icon itself (safe check)
    if (event && event.target && event.target.closest && event.target.closest('#ai-dictionary-icon')) {
        return;
    }
    // Check if click was on the toggle or panel components
    if (event && event.target && event.target.closest && 
        (event.target.closest('#ai-dictionary-panel') || 
         event.target.closest('#ai-dictionary-panel-toggle'))) {
        return;
    }

    const selected = window.getSelection();
    const selectionString = selected.toString().trim();

    if (selectionString.length > 0) {
        selectedText = selectionString;
        let element = selected.anchorNode.parentElement;
        while (element && element.tagName !== 'P' && element.tagName !== 'DIV') {
            element = element.parentElement;
        }
        selectedContext = element ? element.textContent : selectionString;
        selectedParentElement = element; // Store the parent element for context extraction

        if (settings.enableDirectLookup) {
            performDictionaryLookup();
        } else {
            // Calculate position for the icon
            try {
                const range = selected.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                
                // Position calculation based on setting
                const position = settings.iconPosition || 'top-right';
                let x, y;
                const offset = 35; // Size + gap
                const gap = 5;

                switch (position) {
                    case 'top-left':
                        x = rect.left - offset;
                        y = rect.top - offset;
                        break;
                    case 'bottom-left':
                        x = rect.left - offset;
                        y = rect.bottom + gap;
                        break;
                    case 'bottom-right':
                        x = rect.right + gap;
                        y = rect.bottom + gap;
                        break;
                    case 'top-right':
                    default:
                        x = rect.right + gap;
                        y = rect.top - offset;
                        break;
                }
                
                // Ensure icon is within viewport logic could be enhanced, but basic clamping:
                const iconSize = 30;
                x = Math.max(5, Math.min(x, window.innerWidth - iconSize - 5));
                y = Math.max(5, Math.min(y, window.innerHeight - iconSize - 5));
                
                showIcon(x, y);
            } catch (e) {
                console.warn('AI Dictionary: Could not calculate selection position', e);
            }
        }
    } else {
        // Clear selection, hide icon
        hideIcon();
    }
}

function handleContextMenu(event) {
    if (!settings.enabled) return;

    const selected = window.getSelection().toString().trim();
    if (!selected) return;

    selectedText = selected;
    let element = event.target;
    while (element && element.tagName !== 'P' && element.tagName !== 'DIV') {
        element = element.parentElement;
    }
    selectedContext = element ? element.textContent : selected;
    selectedParentElement = element; // Store the parent element for context extraction
}

// Global click handler for auto-collapse/close
function handleGlobalClick(event) {
    if (!panelElement) return;

    const target = event.target;

    // Check if click is inside panel or icon
    const clickedInsidePanel = panelElement.contains(target);
    const clickedInsideIcon = target.closest('#ai-dictionary-icon');

    if (clickedInsidePanel || clickedInsideIcon) return;

    if (isMobile()) {
        // Mobile: collapse if expanded
        if (panelElement.classList.contains('expanded')) {
            const clickedInsideToggle = toggleElement && (toggleElement.contains(target) || target.closest('#ai-dictionary-panel-toggle'));
            if (!clickedInsideToggle) {
                collapsePanel();
            }
        }
    } else {
        // Desktop: close if visible and not pinned
        if (panelElement.style.display !== 'none' && !isPanelPinned) {
            panelElement.style.display = 'none';
        }
    }
}

// --- Initialization ---

let isReady = false;
let manager = null;

const init = async () => {
    // Load CSS styles
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = `${EXTENSION_URL}/style.css`;
    document.head.appendChild(linkElement);

    await loadSettings();
    console.log(`[${EXTENSION_NAME}] Settings loaded`, settings);

    manager = new SettingsUi();
    const renderedUi = await manager.render();
    if (renderedUi) {
        $('#extensions_settings').append(renderedUi);
    }

    // Attach event listeners for core functionality
    
    // 1. Mouse interaction (Desktop)
    document.addEventListener('mouseup', (e) => setTimeout(() => handleTextSelection(e), 10));
    
    // 2. Touch interaction (Mobile)
    document.addEventListener('touchend', (e) => setTimeout(() => handleTextSelection(e), 10));

    // 3. Selection change (General / Fallback / Keyboard) - debounced
    const debouncedSelectionHandler = debounce((e) => handleTextSelection(e), 500);
    document.addEventListener('selectionchange', debouncedSelectionHandler);

    document.addEventListener('contextmenu', handleContextMenu);

    // 4. Global click for collapse
    document.addEventListener('click', handleGlobalClick);
    
    // Expose global function for context menu
    window.performDictionaryLookup = performDictionaryLookup;

    // Initialize the side panel (hidden/collapsed by default)
    // We can't do this immediately on init because body might not be fully ready? 
    // Usually extensions load after DOM ready.
    createSidePanel();

    isReady = true;
    console.log(`[${EXTENSION_NAME}] Ready`);
};

// Start initialization
await init();
