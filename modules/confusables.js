/**
 * AI Dictionary - Confusables Module
 * Confusable words (similar looking words) management
 */

import { EXTENSION_NAME } from './constants.js';
import { escapeHtml } from './statistics.js';

/**
 * Parse AI response to extract confusable words and their meanings
 * @param {string} response
 * @param {string} parentWord
 * @returns {{confusables: Array<{word: string, meaning: string}>, parentMeaning: string}}
 */
export function parseConfusableResponse(response, parentWord = '') {
    const result = [];
    const parentLower = parentWord ? parentWord.toLowerCase() : '';
    let parentMeaning = '';

    const parentSection = response.match(/【原词释义】([\s\S]*?)(?=【|$)/);
    if (parentSection) {
        const parentText = parentSection[1].trim();
        const parentLines = parentText.split('\n');
        for (const line of parentLines) {
            const match = line.match(/^[\s-]*([a-zA-Z]+)\s*[:：]\s*(.+)/);
            if (match) {
                const word = match[1].trim();
                const meaning = match[2].trim();
                if (meaning && (!parentLower || word.toLowerCase() === parentLower)) {
                    parentMeaning = meaning;
                    break;
                }
            }
        }
    }

    const meaningSection = response.match(/【释义】([\s\S]*?)(?=【|$)/);
    if (!meaningSection) return { confusables: result, parentMeaning };

    const meaningText = meaningSection[1];
    const lines = meaningText.split('\n');

    for (const line of lines) {
        const match = line.match(/^[\s-]*([a-zA-Z]+)\s*[:：]\s*(.+)/);
        if (match) {
            const word = match[1].trim();
            const meaning = match[2].trim();
            if (word && meaning) {
                if (parentLower && word.toLowerCase() === parentLower) {
                    parentMeaning = parentMeaning || meaning;
                    continue;
                }
                result.push({ word, meaning });
            }
        }
    }

    return { confusables: result, parentMeaning };
}

/**
 * Get all related confusable words for a given word (bidirectional)
 * @param {string} word
 * @param {Object} confusableWords - Settings confusableWords object
 * @returns {Array<{word: string, meaning: string}>}
 */
export function getRelatedConfusables(word, confusableWords) {
    const wordLower = word.toLowerCase();
    const result = [];
    const seenWords = new Set();

    // Direct confusables
    const directConfusables = confusableWords[wordLower] || [];
    for (const item of directConfusables) {
        if (!seenWords.has(item.word.toLowerCase())) {
            result.push(item);
            seenWords.add(item.word.toLowerCase());
        }
    }

    // Check all other entries for bidirectional relationships
    for (const [parentWord, confusables] of Object.entries(confusableWords)) {
        if (parentWord === wordLower) continue;

        const isRelated = confusables.some(c => c.word.toLowerCase() === wordLower);

        if (isRelated) {
            if (!seenWords.has(parentWord)) {
                const parentMeaning = findWordMeaning(parentWord, confusableWords);
                result.push({ word: parentWord, meaning: parentMeaning });
                seenWords.add(parentWord);
            }

            for (const sibling of confusables) {
                const siblingLower = sibling.word.toLowerCase();
                if (siblingLower !== wordLower && !seenWords.has(siblingLower)) {
                    result.push(sibling);
                    seenWords.add(siblingLower);
                }
            }
        }
    }

    return result;
}

/**
 * Find the meaning of a word from confusableWords storage
 * @param {string} word
 * @param {Object} confusableWords
 * @returns {string}
 */
export function findWordMeaning(word, confusableWords) {
    const wordLower = word.toLowerCase();

    for (const confusables of Object.values(confusableWords)) {
        for (const item of confusables) {
            if (item.word.toLowerCase() === wordLower) {
                return item.meaning;
            }
        }
    }

    return '(点击形近词按钮获取释义)';
}

/**
 * Get all confusable words from the entire collection
 * @param {Object} confusableWords
 * @returns {Set<string>}
 */
export function getAllConfusableWords(confusableWords) {
    const allWords = new Set();

    for (const [parentWord, confusables] of Object.entries(confusableWords)) {
        allWords.add(parentWord.toLowerCase());
        for (const item of confusables) {
            allWords.add(item.word.toLowerCase());
        }
    }

    return allWords;
}

/**
 * Save a confusable word (bidirectional)
 * @param {string} parentWord
 * @param {string} confusableWord
 * @param {string} meaning
 * @param {Object} confusableWords - Settings confusableWords object (will be modified)
 * @param {string} parentMeaning
 * @returns {boolean}
 */
export function saveConfusableWord(parentWord, confusableWord, meaning, confusableWords, parentMeaning = null) {
    const parentKey = parentWord.toLowerCase();
    const confusableKey = confusableWord.toLowerCase();

    // Save confusableWord under parentWord
    if (!confusableWords[parentKey]) {
        confusableWords[parentKey] = [];
    }

    const existingInParent = confusableWords[parentKey].find(c => c.word.toLowerCase() === confusableKey);
    if (!existingInParent) {
        confusableWords[parentKey].push({ word: confusableWord, meaning });
    }

    // Save parentWord under confusableWord (bidirectional)
    if (!confusableWords[confusableKey]) {
        confusableWords[confusableKey] = [];
    }

    const existingInConfusable = confusableWords[confusableKey].find(c => c.word.toLowerCase() === parentKey);
    if (!existingInConfusable) {
        const foundParentMeaning = parentMeaning || findWordMeaning(parentWord, confusableWords);
        confusableWords[confusableKey].push({ word: parentWord, meaning: foundParentMeaning });
    }

    return true;
}

/**
 * Remove a confusable word (bidirectional)
 * @param {string} parentWord
 * @param {string} confusableWord
 * @param {Object} confusableWords - Settings confusableWords object (will be modified)
 * @returns {boolean}
 */
export function removeConfusableWord(parentWord, confusableWord, confusableWords) {
    const parentKey = parentWord.toLowerCase();
    const confusableKey = confusableWord.toLowerCase();

    // Remove from parentWord's list
    if (confusableWords[parentKey]) {
        const index = confusableWords[parentKey].findIndex(c => c.word.toLowerCase() === confusableKey);
        if (index !== -1) {
            confusableWords[parentKey].splice(index, 1);
        }
        if (confusableWords[parentKey].length === 0) {
            delete confusableWords[parentKey];
        }
    }

    // Remove from confusableWord's list (bidirectional)
    if (confusableWords[confusableKey]) {
        const index = confusableWords[confusableKey].findIndex(c => c.word.toLowerCase() === parentKey);
        if (index !== -1) {
            confusableWords[confusableKey].splice(index, 1);
        }
        if (confusableWords[confusableKey].length === 0) {
            delete confusableWords[confusableKey];
        }
    }

    return true;
}

/**
 * Format saved confusable words for display
 * @param {Array} confusables
 * @param {string} parentWord
 * @returns {string}
 */
export function formatSavedConfusables(confusables, parentWord) {
    if (!confusables || confusables.length === 0) return '';

    return confusables.map((item, index) => `
        <div class="ai-dict-saved-confusable-item" data-word="${escapeHtml(item.word)}" data-index="${index}">
            <span class="ai-dict-confusable-word">${escapeHtml(item.word)}</span>
            <div class="ai-dict-confusable-actions">
                <button class="ai-dict-confusable-meaning-btn" title="显示释义" data-word="${escapeHtml(item.word)}" data-meaning="${escapeHtml(item.meaning)}">
                    <i class="fa-solid fa-circle-info"></i>
                </button>
                <button class="ai-dict-confusable-remove-btn" title="取消收藏" data-parent="${escapeHtml(parentWord)}" data-word="${escapeHtml(item.word)}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="ai-dict-confusable-meaning-display" style="display: none;">${escapeHtml(item.meaning)}</div>
        </div>
    `).join('');
}

/**
 * Display parsed confusable words with save buttons
 * @param {Array} confusables
 * @param {string} parentWord
 * @param {HTMLElement} contentElement
 * @param {Object} confusableWords
 */
export function displayParsedConfusables(confusables, parentWord, contentElement, confusableWords) {
    const savedConfusables = getRelatedConfusables(parentWord, confusableWords);
    const savedWords = savedConfusables.map(c => c.word.toLowerCase());

    let html = `<div class="ai-dict-confusable-ai-result">`;
    html += `<div class="ai-dict-confusable-ai-title-row">
        <span class="ai-dict-confusable-ai-title">AI 生成的形近词：</span>
        <button class="ai-dict-confusable-refresh-btn" title="重新获取" data-word="${escapeHtml(parentWord)}">
            <i class="fa-solid fa-rotate"></i>
        </button>
    </div>`;
    html += `<div class="ai-dict-confusable-ai-list">`;

    for (const item of confusables) {
        const isSaved = savedWords.includes(item.word.toLowerCase());
        html += `
            <div class="ai-dict-confusable-ai-item" data-word="${escapeHtml(item.word)}" data-meaning="${escapeHtml(item.meaning)}">
                <span class="ai-dict-confusable-word">${escapeHtml(item.word)}</span>
                <span class="ai-dict-confusable-ai-meaning">- ${escapeHtml(item.meaning)}</span>
                <button class="ai-dict-confusable-save-btn ${isSaved ? 'saved' : ''}"
                        data-parent="${escapeHtml(parentWord)}"
                        data-word="${escapeHtml(item.word)}"
                        data-meaning="${escapeHtml(item.meaning)}"
                        ${isSaved ? 'disabled' : ''}>
                    <i class="fa-solid ${isSaved ? 'fa-check' : 'fa-bookmark'}"></i>
                    <span>${isSaved ? '已收藏' : '收藏'}</span>
                </button>
            </div>
        `;
    }

    html += `</div></div>`;
    contentElement.innerHTML = html;
}

/**
 * Display error when confusable parsing fails
 * @param {string} word
 * @param {string} response
 * @param {HTMLElement} contentElement
 */
export function displayConfusableParseError(word, response, contentElement) {
    contentElement.innerHTML = `
        <div class="ai-dict-confusable-parse-error">
            <div class="ai-dict-confusable-ai-title-row">
                <span class="ai-dict-confusable-ai-title">
                    <i class="fa-solid fa-triangle-exclamation"></i> AI 返回格式有误
                </span>
                <button class="ai-dict-confusable-refresh-btn" title="重新获取" data-word="${escapeHtml(word)}">
                    <i class="fa-solid fa-rotate"></i>
                </button>
            </div>
            <div class="ai-dict-confusable-raw-response">
                ${escapeHtml(response).replace(/\n/g, '<br>')}
            </div>
        </div>
    `;
}

/**
 * Highlight all confusable words in the page content
 * @param {Object} confusableWords
 * @param {boolean} enabled
 * @param {Function} performLookup - Optional callback to perform dictionary lookup
 */
export function highlightAllConfusableWords(confusableWords, enabled, performLookup = null) {
    if (!enabled) return;

    removeConfusableHighlights();

    const wordsToHighlight = getAllConfusableWords(confusableWords);
    if (wordsToHighlight.size === 0) return;

    const chatContainer = document.getElementById('chat');
    if (!chatContainer) return;

    const wordsArray = Array.from(wordsToHighlight);
    const pattern = new RegExp(`\\b(${wordsArray.join('|')})\\b`, 'gi');

    const walker = document.createTreeWalker(
        chatContainer,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                if (node.parentElement.closest('#ai-dictionary-panel')) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (node.parentElement.closest('script, style, textarea, input')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes = [];
    while (walker.nextNode()) {
        if (pattern.test(walker.currentNode.textContent)) {
            textNodes.push(walker.currentNode);
        }
        pattern.lastIndex = 0;
    }

    for (const textNode of textNodes) {
        const text = textNode.textContent;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            const relatedConfusables = getRelatedConfusables(match[0], confusableWords);
            const relatedWords = relatedConfusables.map(item => item.word).filter(Boolean);

            const span = document.createElement('span');
            span.className = 'ai-dict-confusable-highlight';
            span.textContent = match[0];

            // Create tooltip element
            const tooltip = document.createElement('div');
            tooltip.className = 'ai-dict-confusable-tooltip';

            if (relatedWords.length > 0) {
                relatedWords.forEach((word, index) => {
                    const wordSpan = document.createElement('span');
                    wordSpan.className = 'ai-dict-confusable-word';
                    wordSpan.textContent = word;
                    wordSpan.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (performLookup && typeof performLookup === 'function') {
                            performLookup(word);
                        }
                    });
                    tooltip.appendChild(wordSpan);

                    if (index < relatedWords.length - 1) {
                        tooltip.appendChild(document.createTextNode(', '));
                    }
                });
            } else {
                tooltip.textContent = '暂无形近词';
            }

            span.appendChild(tooltip);

            span.addEventListener('click', (e) => {
                e.stopPropagation();
                const isActive = span.classList.contains('ai-dict-show-confusables');
                document.querySelectorAll('.ai-dict-confusable-highlight.ai-dict-show-confusables').forEach(el => {
                    if (el !== span) {
                        el.classList.remove('ai-dict-show-confusables');
                    }
                });
                span.classList.toggle('ai-dict-show-confusables', !isActive);
            });
            fragment.appendChild(span);

            lastIndex = pattern.lastIndex;
        }

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        if (fragment.childNodes.length > 0) {
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    }

    if (!highlightAllConfusableWords.hasClickHandler) {
        document.addEventListener('click', () => {
            document.querySelectorAll('.ai-dict-confusable-highlight.ai-dict-show-confusables').forEach(el => {
                el.classList.remove('ai-dict-show-confusables');
            });
        });
        highlightAllConfusableWords.hasClickHandler = true;
    }
}

/**
 * Remove all confusable word highlights from the page
 */
export function removeConfusableHighlights() {
    const highlights = document.querySelectorAll('.ai-dict-confusable-highlight');
    for (const highlight of highlights) {
        const textNode = document.createTextNode(highlight.textContent);
        highlight.parentNode.replaceChild(textNode, highlight);
    }

    const chatContainer = document.getElementById('chat');
    if (chatContainer) {
        chatContainer.normalize();
    }
}

/**
 * Update the highlight color CSS variable
 * @param {string} color
 */
export function updateHighlightColor(color) {
    document.documentElement.style.setProperty('--ai-dict-highlight-color', color);
}

/**
 * Perform confusable words lookup
 * @param {Object} options
 * @param {string} options.word
 * @param {Object} options.settings
 * @param {Object} options.confusableWords
 * @param {Function} options.sendOpenAIRequest
 * @param {Function} options.generateRaw
 * @param {Object} options.oaiSettings
 * @param {Function} options.saveSettings
 * @param {Function} options.updateSavedDisplay
 * @param {Function} options.highlightWords
 */
export async function performConfusableLookup(options) {
    const {
        word,
        settings,
        confusableWords,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings,
        saveSettings,
        updateSavedDisplay,
        highlightWords
    } = options;

    const btn = document.getElementById('ai-dict-confusable-btn');
    const contentElement = document.getElementById('ai-dict-confusable-content');

    if (!contentElement) return;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>正在查找形近词...</span>';
    }

    contentElement.style.display = 'block';
    contentElement.innerHTML = '<p class="ai-dict-loading-text">正在获取形近词...</p>';

    try {
        const confusablePrompt = settings.confusableWordsPrompt.replace(/%word%/g, word);

        const messages = [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: confusablePrompt }
        ];

        const streamEnabled = oaiSettings.stream_openai;
        let fullResponse = '';

        if (streamEnabled) {
            fullResponse = await fetchConfusableWithStreaming(messages, contentElement, sendOpenAIRequest);
        } else {
            fullResponse = await generateRaw({
                prompt: confusablePrompt,
                systemPrompt: settings.systemPrompt,
            });

            if (fullResponse) {
                contentElement.innerHTML = `<p>${fullResponse.replace(/\n/g, '<br>')}</p>`;
            } else {
                contentElement.innerHTML = '<p class="ai-dict-error-text">无法获取形近词，请稍后重试。</p>';
            }
        }

        if (fullResponse) {
            const parsed = parseConfusableResponse(fullResponse, word);
            if (parsed && parsed.confusables.length > 0) {
                displayParsedConfusables(parsed.confusables, word, contentElement, confusableWords);
                bindConfusableSaveButtons(word, confusableWords, saveSettings, updateSavedDisplay, highlightWords, parsed.parentMeaning);
            } else {
                displayConfusableParseError(word, fullResponse, contentElement);
            }
            bindConfusableRefreshButton(contentElement, word, options);
        }

        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>形近词查找完成</span>';
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Confusable lookup error:', error);
        contentElement.innerHTML = `
            <div class="ai-dict-confusable-error-container">
                <p class="ai-dict-error-text">无法获取形近词，请稍后重试。</p>
                <button class="ai-dict-confusable-refresh-btn" title="重新获取" data-word="${escapeHtml(word)}">
                    <i class="fa-solid fa-rotate"></i> 重试
                </button>
            </div>
        `;
        bindConfusableRefreshButton(contentElement, word, options);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-shuffle"></i> <span>重试形近词</span>';
        }
    }
}

/**
 * Fetch confusable words with streaming
 * @param {Array} messages
 * @param {HTMLElement} contentElement
 * @param {Function} sendOpenAIRequest
 * @returns {Promise<string>}
 */
async function fetchConfusableWithStreaming(messages, contentElement, sendOpenAIRequest) {
    const abortController = new AbortController();
    let fullText = '';

    try {
        const generator = await sendOpenAIRequest('normal', messages, abortController.signal);

        if (typeof generator === 'function') {
            contentElement.innerHTML = '';

            for await (const data of generator()) {
                if (data.text) {
                    fullText = data.text;
                    contentElement.innerHTML = fullText.replace(/\n/g, '<br>');
                }
            }
        } else if (typeof generator === 'string') {
            fullText = generator;
            contentElement.innerHTML = generator.replace(/\n/g, '<br>');
        }
    } catch (error) {
        console.error('Streaming confusable error:', error);
        throw error;
    }

    return fullText;
}

/**
 * Bind refresh button event
 * @param {HTMLElement} contentElement
 * @param {string} word
 * @param {Object} options
 */
function bindConfusableRefreshButton(contentElement, word, options) {
    const refreshBtn = contentElement.querySelector('.ai-dict-confusable-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            performConfusableLookup({ ...options, word });
        });
    }
}

/**
 * Bind save button events
 * @param {string} parentWord
 * @param {Object} confusableWords
 * @param {Function} saveSettings
 * @param {Function} updateSavedDisplay
 * @param {Function} highlightWords
 * @param {string} parentMeaning
 */
function bindConfusableSaveButtons(parentWord, confusableWords, saveSettings, updateSavedDisplay, highlightWords, parentMeaning = '') {
    const saveBtns = document.querySelectorAll('.ai-dict-confusable-save-btn:not(.saved)');
    saveBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const word = btn.getAttribute('data-word');
            const meaning = btn.getAttribute('data-meaning');
            const parent = btn.getAttribute('data-parent');

            if (word && meaning && parent) {
                const saved = saveConfusableWord(parent, word, meaning, confusableWords, parentMeaning);
                if (saved) {
                    saveSettings();
                    btn.disabled = true;
                    btn.classList.add('saved');
                    btn.innerHTML = '<i class="fa-solid fa-check"></i><span>已收藏</span>';
                    updateSavedDisplay?.(parentWord);
                    highlightWords?.();
                }
            }
        });
    });
}

/**
 * Bind events for saved confusable word items
 * @param {string} parentWord
 * @param {Object} confusableWords
 * @param {Function} saveSettings
 * @param {Function} updateSavedDisplay
 * @param {Function} highlightWords
 */
export function bindSavedConfusableEvents(parentWord, confusableWords, saveSettings, updateSavedDisplay, highlightWords) {
    // Bind meaning toggle buttons
    const meaningBtns = document.querySelectorAll('.ai-dict-confusable-meaning-btn');
    meaningBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = btn.closest('.ai-dict-saved-confusable-item');
            const meaningDisplay = item?.querySelector('.ai-dict-confusable-meaning-display');
            if (meaningDisplay) {
                const isVisible = meaningDisplay.style.display !== 'none';
                meaningDisplay.style.display = isVisible ? 'none' : 'block';
                btn.innerHTML = isVisible
                    ? '<i class="fa-solid fa-circle-info"></i>'
                    : '<i class="fa-solid fa-circle-info active"></i>';
            }
        });
    });

    // Bind remove buttons
    const removeBtns = document.querySelectorAll('.ai-dict-confusable-remove-btn');
    removeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const word = btn.getAttribute('data-word');
            const parent = btn.getAttribute('data-parent');
            if (word && parent) {
                removeConfusableWord(parent, word, confusableWords);
                saveSettings();
                updateSavedDisplay?.(parentWord);
                highlightWords?.();

                // Re-enable save button if visible
                const saveBtn = document.querySelector(`.ai-dict-confusable-save-btn[data-word="${word}"]`);
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.classList.remove('saved');
                    saveBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i><span>收藏</span>';
                }
            }
        });
    });
}

/**
 * Bind confusable button click event
 * @param {string} word
 * @param {Function} performLookupFn
 * @param {Object} confusableWords
 * @param {Function} saveSettings
 * @param {Function} updateSavedDisplay
 * @param {Function} highlightWords
 */
export function bindConfusableButton(word, performLookupFn, confusableWords, saveSettings, updateSavedDisplay, highlightWords) {
    const btn = document.getElementById('ai-dict-confusable-btn');
    if (btn) {
        btn.addEventListener('click', () => performLookupFn(word));
    }

    bindSavedConfusableEvents(word, confusableWords, saveSettings, updateSavedDisplay, highlightWords);
}

/**
 * Update the saved confusables display area
 * @param {string} parentWord
 * @param {Object} confusableWords
 * @param {Function} saveSettings
 * @param {Function} highlightWords
 */
export function updateSavedConfusablesDisplay(parentWord, confusableWords, saveSettings, highlightWords) {
    const container = document.getElementById('ai-dict-saved-confusables');
    if (!container) return;

    const savedConfusables = getRelatedConfusables(parentWord, confusableWords);

    if (savedConfusables.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const listElement = container.querySelector('.ai-dict-saved-confusables-list');
    if (listElement) {
        listElement.innerHTML = formatSavedConfusables(savedConfusables, parentWord);
        bindSavedConfusableEvents(
            parentWord,
            confusableWords,
            saveSettings,
            (word) => updateSavedConfusablesDisplay(word, confusableWords, saveSettings, highlightWords),
            highlightWords
        );
    }
}
