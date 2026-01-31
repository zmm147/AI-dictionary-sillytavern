/**
 * AI Dictionary - Content Builder Module
 * Panel content building and Youdao section formatting
 */

import { escapeHtml } from './statistics.js';
import { isSingleWord } from './utils.js';
import { getRelatedConfusables, formatSavedConfusables } from './confusables.js';
import { playAudio } from './panel.js';
import { triggerAIFetchIfEmpty } from './aiLookup.js';

/**
 * Format Youdao head section HTML
 * @param {Array} results
 * @returns {string}
 */
export function formatYoudaoHeadSection(results) {
    if (!results || results.length === 0) return '';

    let html = '';
    for (const result of results) {
        html += '<div class="odh-note"><div class="odh-headsection">';
        html += `<span class="odh-expression">${escapeHtml(result.expression)}</span>`;

        if (result.reading) {
            html += `<span class="odh-reading">${escapeHtml(result.reading)}</span>`;
        }

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

        html += '</div></div>';
    }

    return html;
}

/**
 * Format Youdao definitions HTML
 * @param {Array} results
 * @returns {string}
 */
export function formatYoudaoDefinitions(results) {
    if (!results || results.length === 0) {
        return '<p>未找到词典结果。</p>';
    }

    let html = '<div class="odh-notes">';
    for (const result of results) {
        if (result.definitions && result.definitions.length > 0) {
            for (const definition of result.definitions) {
                html += definition;
            }
        }
    }
    html += '</div>';
    return html;
}

/**
 * Format word history display
 * @param {string} word
 * @param {Object} history
 * @returns {string}
 */
export function formatWordHistory(word, history) {
    if (!history) {
        return '<p class="ai-dict-history-empty">暂无查词记录</p>';
    }

    let html = `
        <div class="ai-dict-history-info">
            <span class="ai-dict-history-label">查词次数：</span>
            <span class="ai-dict-history-value">${history.count} 次</span>
        </div>
    `;

    if (history.contexts && history.contexts.length > 0) {
        html += `
            <div class="ai-dict-history-contexts">
                <div class="ai-dict-history-contexts-title">保存的上下文：</div>
                <div class="ai-dict-history-contexts-list">
        `;

        history.contexts.forEach((context, index) => {
            const highlightedContext = highlightWordInContext(context, word);
            html += `
                <div class="ai-dict-history-context-item" data-index="${index}">
                    <div class="ai-dict-history-context-text">${highlightedContext}</div>
                    <button class="ai-dict-history-context-remove" title="删除此上下文" data-word="${escapeHtml(word)}" data-index="${index}">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            `;
        });

        html += `</div></div>`;
    } else {
        html += '<p class="ai-dict-history-no-context">暂无保存的上下文</p>';
    }

    html += `
        <div class="ai-dict-history-actions">
            <button class="ai-dict-history-clear-btn" title="清除此单词的所有记录" data-word="${escapeHtml(word)}">
                <i class="fa-solid fa-trash"></i>
                <span>清除全部记录</span>
            </button>
        </div>
    `;

    return html;
}

/**
 * Highlight word in context text
 * @param {string} context
 * @param {string} word
 * @returns {string}
 */
function highlightWordInContext(context, word) {
    if (!context || !word) return escapeHtml(context);

    const escapedContext = escapeHtml(context);
    const escapedWord = escapeHtml(word);
    const regex = new RegExp(`(${escapedWord})`, 'gi');
    return escapedContext.replace(regex, '<mark class="ai-dict-history-highlight">$1</mark>');
}

/**
 * Create merged content HTML for panel
 * @param {Object} options
 * @param {string} options.word
 * @param {Array|null} options.youdaoResults
 * @param {boolean} options.autoFetchAI
 * @param {boolean} options.autoCollapseYoudao
 * @param {Object} options.confusableWords
 * @param {Function} options.getWordHistory
 * @returns {string}
 */
export function createMergedContent(options) {
    const {
        word,
        youdaoResults,
        autoFetchAI,
        autoCollapseYoudao,
        confusableWords,
        getWordHistory
    } = options;

    const collapsibleId = `youdao-definitions-${Date.now()}`;
    const promptCollapsibleId = `prompt-view-${Date.now()}`;
    const historyCollapsibleId = `word-history-${Date.now()}`;

    const hasYoudaoResults = youdaoResults && Array.isArray(youdaoResults) && youdaoResults.length > 0;
    const hasProxyError = youdaoResults && youdaoResults.proxyError === true;
    const showDeepStudy = isSingleWord(word);

    const savedConfusables = getRelatedConfusables(word, confusableWords);
    const wordHistory = getWordHistory(word);

    let youdaoSection = '';

    if (hasProxyError) {
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
        const youdaoExpanded = !autoCollapseYoudao;
        youdaoSection = `
            ${formatYoudaoHeadSection(youdaoResults)}
            <div class="ai-dict-collapsible-section">
                <div class="ai-dict-collapsible-header${youdaoExpanded ? ' expanded' : ''}" data-target="${collapsibleId}">
                    <i class="fa-solid fa-chevron-right${youdaoExpanded ? ' expanded' : ''}"></i>
                    <span>释义</span>
                </div>
                <div id="${collapsibleId}" class="ai-dict-collapsible-content${youdaoExpanded ? ' expanded' : ''}">
                    ${formatYoudaoDefinitions(youdaoResults)}
                </div>
            </div>
        `;
    } else if (youdaoResults === null) {
        youdaoSection = `
            <div class="ai-dict-youdao-loading">
                <p class="ai-dict-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> 正在获取有道词典...</p>
            </div>
        `;
    }

    const deepStudySection = showDeepStudy ? `
        <div class="ai-dict-deep-study-section">
            <button id="ai-dict-deep-study-btn" class="menu_button ai-dict-deep-study-btn">
                <i class="fa-solid fa-graduation-cap"></i>
                <span>深度学习此单词</span>
            </button>
            <div id="ai-dict-deep-study-content" class="ai-dict-deep-study-content" style="display: none;"></div>
        </div>
    ` : '';

    const confusableSection = showDeepStudy ? `
        <div class="ai-dict-confusable-section">
            <button id="ai-dict-confusable-btn" class="menu_button ai-dict-confusable-btn">
                <i class="fa-solid fa-shuffle"></i>
                <span>形近词</span>
            </button>
            <div id="ai-dict-saved-confusables" class="ai-dict-saved-confusables" ${savedConfusables.length === 0 ? 'style="display: none;"' : ''}>
                <div class="ai-dict-saved-confusables-title">已收藏的形近词：</div>
                <div class="ai-dict-saved-confusables-list">
                    ${formatSavedConfusables(savedConfusables, word)}
                </div>
            </div>
            <div id="ai-dict-confusable-content" class="ai-dict-confusable-content" style="display: none;"></div>
        </div>
    ` : '';

    const wordHistorySection = showDeepStudy ? `
        <div class="ai-dict-collapsible-section ai-dict-history-section">
            <div class="ai-dict-collapsible-header" data-target="${historyCollapsibleId}">
                <i class="fa-solid fa-chevron-right"></i>
                <span>查词记录</span>
                ${wordHistory ? `<span class="ai-dict-history-count">(${wordHistory.count}次)</span>` : ''}
            </div>
            <div id="${historyCollapsibleId}" class="ai-dict-collapsible-content">
                <div id="ai-dict-word-history-content" class="ai-dict-word-history-content">
                    ${formatWordHistory(word, wordHistory)}
                </div>
            </div>
        </div>
    ` : '';

    const playphraseSection = `
        <div class="ai-dict-playphrase-section">
            <button id="ai-dict-playphrase-btn" class="menu_button ai-dict-playphrase-btn">
                <i class="fa-solid fa-video"></i>
                <span>PlayPhrase</span>
            </button>
            <div id="ai-dict-playphrase-content" class="ai-dict-playphrase-content" data-word="${escapeHtml(word)}" style="display: none;">
                <div class="ai-dict-playphrase-status">点击展开加载视频。</div>
                <div class="ai-dict-playphrase-player" style="display: none;">
                    <div class="ai-dict-playphrase-counter"></div>
                    <video id="ai-dict-playphrase-video" controls playsinline webkit-playsinline></video>
                    <div class="ai-dict-playphrase-info">
                        <div class="ai-dict-playphrase-text"></div>
                        <div class="ai-dict-playphrase-source"></div>
                    </div>
                    <div class="ai-dict-playphrase-controls">
                        <button id="ai-dict-playphrase-prev-btn" class="menu_button">上一个</button>
                        <button id="ai-dict-playphrase-next-btn" class="menu_button">下一个</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    return `
        <div class="ai-dict-merged-container">
            <div id="ai-dict-youdao-section">${youdaoSection}</div>
            <div class="ai-dict-ai-section">
                <div id="ai-definition-content" class="ai-dict-ai-content${!autoFetchAI ? ' ai-dict-clickable' : ''}">
                    ${autoFetchAI
                        ? '<p class="ai-dict-loading-text">正在获取 AI 定义...</p>'
                        : '<p class="ai-dict-no-ai-text"><i class="fa-solid fa-hand-pointer"></i> 点击获取 AI 释义</p>'
                    }
                </div>
                <button id="ai-dict-chat-trigger" class="ai-dict-chat-trigger" title="继续提问">
                    <i class="fa-solid fa-comments"></i>
                </button>
                <div id="ai-dict-chat-bubble" class="ai-dict-chat-bubble-popup" style="display: none;">
                    <div class="ai-dict-chat-input-container">
                        <input type="text" id="ai-dict-chat-input" class="ai-dict-chat-input" placeholder="继续提问...">
                        <button id="ai-dict-chat-send-btn" class="ai-dict-chat-send-btn" title="发送">
                            <i class="fa-solid fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
            ${playphraseSection}
            ${deepStudySection}
            ${confusableSection}
            ${wordHistorySection}
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
}

/**
 * Update Youdao section after results load
 * @param {Object} options
 * @param {string} options.word
 * @param {Array} options.youdaoResults
 * @param {boolean} options.autoCollapseYoudao
 * @param {boolean} options.fetchAIOnYoudaoExpand
 * @param {Function} options.fetchAIDefinitionWrapper
 */
export function updateYoudaoSection(options) {
    const {
        word,
        youdaoResults,
        autoCollapseYoudao,
        fetchAIOnYoudaoExpand,
        fetchAIDefinitionWrapper
    } = options;

    const container = document.getElementById('ai-dict-youdao-section');
    if (!container) return;

    const collapsibleId = `youdao-definitions-${Date.now()}`;
    const hasYoudaoResults = youdaoResults && Array.isArray(youdaoResults) && youdaoResults.length > 0;
    const hasProxyError = youdaoResults && youdaoResults.proxyError === true;

    let youdaoSection = '';

    if (hasProxyError) {
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
        const youdaoExpanded = !autoCollapseYoudao;
        youdaoSection = `
            ${formatYoudaoHeadSection(youdaoResults)}
            <div class="ai-dict-collapsible-section">
                <div class="ai-dict-collapsible-header${youdaoExpanded ? ' expanded' : ''}" data-target="${collapsibleId}">
                    <i class="fa-solid fa-chevron-right${youdaoExpanded ? ' expanded' : ''}"></i>
                    <span>释义</span>
                </div>
                <div id="${collapsibleId}" class="ai-dict-collapsible-content${youdaoExpanded ? ' expanded' : ''}">
                    ${formatYoudaoDefinitions(youdaoResults)}
                </div>
            </div>
        `;
    }

    container.innerHTML = youdaoSection;

    // Rebind audio buttons
    const audioButtons = container.querySelectorAll('.odh-playaudio');
    audioButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const audioUrl = btn.getAttribute('data-audio-url');
            if (audioUrl) playAudio(audioUrl);
        });
    });

    // Rebind collapsible headers
    const collapsibleHeaders = container.querySelectorAll('.ai-dict-collapsible-header');
    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targetId = header.getAttribute('data-target');
            if (targetId) {
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    const wasExpanded = targetElement.classList.contains('expanded');
                    targetElement.classList.toggle('expanded');
                    const icon = header.querySelector('i');
                    if (icon) icon.classList.toggle('expanded');

                    if (wasExpanded && fetchAIOnYoudaoExpand && targetId.startsWith('youdao-definitions-')) {
                        triggerAIFetchIfEmpty(word, fetchAIDefinitionWrapper);
                    }
                }
            }
        });
    });
}
