/**
 * AI Dictionary Extension for SillyTavern
 * Main entry point - modular version
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types, generateRaw, setExtensionPrompt, extension_prompt_types } from '../../../../script.js';
import { oai_settings, sendOpenAIRequest } from '../../../openai.js';

// Import modules
import { fetchYoudaoDictionary } from './modules/youdao.js';
import {
    groupWordsByCount,
    createTrendChart,
    formatDate as formatDateForStats,
    formatDateForChart,
    escapeHtml
} from './modules/statistics.js';
import { isMobile, isAndroid, debounce, isSingleWord } from './modules/utils.js';
import { EXTENSION_NAME, defaultSettings } from './modules/constants.js';
import { initDatabase } from './modules/database.js';
import {
    backupWordHistoryToJson,
    backupReviewDataToJson
} from './modules/backup.js';

// Import new modules
import {
    loadWordHistoryFromFile,
    saveWordHistory,
    getWordHistory,
    getAllWordHistory,
    removeWordHistoryContext,
    clearWordHistory
} from './modules/wordHistory.js';

import {
    loadReviewDataFromFile,
    getReviewData,
    addWordToPendingReview,
    getWordsToReviewToday,
    buildCurrentSessionWords,
    checkAIResponseForReviewWords,
    generateReviewPrompt,
    isWordInReview,
    toggleWordInReview,
    clearCurrentSession,
    forceAllWordsReviewable,
    clearAllReviewData,
    saveReviewDataDebounced
} from './modules/review.js';

import { SettingsUi } from './modules/settingsUi.js';

import {
    createSidePanel,
    showPanel,
    showPanelHtml,
    expandPanel,
    collapsePanel,
    showIcon,
    hideIcon,
    playAudio,
    handleGlobalClick,
    getPanelElement,
    getToggleElement
} from './modules/panel.js';

import {
    fetchAIDefinition,
    performDeepStudy,
    sendChatMessage,
    triggerAIFetchIfEmpty,
    bindManualAIFetchButton,
    bindDeepStudyButton,
    bindChatInputEvents,
    clearChatHistory,
    setCurrentWord
} from './modules/aiLookup.js';

import {
    getRelatedConfusables,
    getAllConfusableWords,
    formatSavedConfusables,
    highlightAllConfusableWords,
    removeConfusableHighlights,
    updateHighlightColor,
    performConfusableLookup,
    bindConfusableButton,
    updateSavedConfusablesDisplay,
    bindSavedConfusableEvents
} from './modules/confusables.js';

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

/** @type {Object} */
let settings = { ...defaultSettings };

/** @type {string} */
let selectedText = '';

/** @type {string} */
let selectedContext = '';

/** @type {HTMLElement} */
let selectedParentElement = null;

/** @type {{startOffset: number, endOffset: number} | null} */
let selectionRangeInfo = null;

// Mobile touch selection state
let selectionBeforeTouch = '';
let isTouchActive = false;
let touchEndTimeout = null;
let lastProcessedSelection = '';

// --- Settings Functions ---

function loadSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = { ...defaultSettings };
    }
    settings = { ...defaultSettings, ...extension_settings[EXTENSION_NAME] };
}

function saveSettings() {
    extension_settings[EXTENSION_NAME] = { ...settings };
    saveSettingsDebounced();
}

// --- Context Extraction ---

function markSelectionInContext(context, selected) {
    if (!selected || !context) return context;

    const marker = `【${selected}】`;

    if (selectionRangeInfo && selectedParentElement) {
        const parentText = selectedParentElement.textContent || '';
        const parentTextTrimmed = parentText.trim();
        const parentIndexInContext = context.indexOf(parentTextTrimmed);

        if (parentIndexInContext !== -1) {
            const leadingWhitespace = parentText.length - parentText.trimStart().length;
            const adjustedOffset = selectionRangeInfo.startOffset - leadingWhitespace;

            if (adjustedOffset >= 0) {
                const absolutePosition = parentIndexInContext + adjustedOffset;
                const wordAtPosition = context.substring(absolutePosition, absolutePosition + selected.length);

                if (wordAtPosition === selected) {
                    return context.substring(0, absolutePosition) + marker + context.substring(absolutePosition + selected.length);
                }
            }
        }

        const beforeTextInParagraph = parentText.substring(0, selectionRangeInfo.startOffset);
        const afterTextInParagraph = parentText.substring(selectionRangeInfo.endOffset);

        for (let windowSize = 30; windowSize >= 5; windowSize -= 5) {
            const beforePattern = beforeTextInParagraph.slice(-windowSize);
            const afterPattern = afterTextInParagraph.slice(0, windowSize);

            if (beforePattern.length === 0 && afterPattern.length === 0) continue;

            const uniquePattern = beforePattern + selected + afterPattern;
            const patternIndex = context.indexOf(uniquePattern);

            if (patternIndex !== -1) {
                const selectStart = patternIndex + beforePattern.length;
                return context.substring(0, selectStart) + marker + context.substring(selectStart + selected.length);
            }
        }
    }

    if (selectedParentElement && selectedContext) {
        const parentText = selectedParentElement.textContent || '';
        const parentTextTrimmed = parentText.trim();
        const parentIndexInContext = context.indexOf(parentTextTrimmed);

        if (parentIndexInContext !== -1) {
            const paragraphEndInContext = parentIndexInContext + parentTextTrimmed.length;
            let searchStart = parentIndexInContext;
            let foundPositions = [];

            while (searchStart < paragraphEndInContext) {
                const pos = context.indexOf(selected, searchStart);
                if (pos === -1 || pos >= paragraphEndInContext) break;
                foundPositions.push(pos);
                searchStart = pos + 1;
            }

            if (foundPositions.length >= 1) {
                return context.substring(0, foundPositions[0]) + marker + context.substring(foundPositions[0] + selected.length);
            }
        }
    }

    const index = context.indexOf(selected);
    if (index !== -1) {
        return context.substring(0, index) + marker + context.substring(index + selected.length);
    }

    return context + `\n\n[用户选中的文本: ${marker}]`;
}

function extractContext(text) {
    const range = settings.contextRange;
    let context = '';

    if (range === 'sentence') {
        const sentences = selectedContext.split(/[.!?。！？]+/);
        for (const sentence of sentences) {
            if (sentence.includes(selectedText)) {
                context = sentence.trim();
                break;
            }
        }
        if (!context) context = selectedContext;
    } else if (range === 'single') {
        context = selectedContext;
    } else if (range === 'all') {
        if (selectedParentElement && selectedParentElement.parentElement) {
            const parent = selectedParentElement.parentElement;
            const siblings = parent.querySelectorAll(':scope > p, :scope > div');
            if (siblings.length > 0) {
                context = Array.from(siblings).map(el => el.textContent.trim()).filter(t => t).join('\n\n');
            }
        }
        if (!context) context = selectedContext;
    } else {
        context = selectedContext;
    }

    return markSelectionInContext(context, selectedText);
}

// --- Word History Display ---

function formatWordHistory(word, history) {
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

function highlightWordInContext(context, word) {
    if (!context || !word) return escapeHtml(context);

    const escapedContext = escapeHtml(context);
    const escapedWord = escapeHtml(word);
    const regex = new RegExp(`(${escapedWord})`, 'gi');
    return escapedContext.replace(regex, '<mark class="ai-dict-history-highlight">$1</mark>');
}

function bindWordHistoryEvents(word) {
    const removeContextBtns = document.querySelectorAll('.ai-dict-history-context-remove');
    removeContextBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetWord = btn.getAttribute('data-word');
            const index = parseInt(btn.getAttribute('data-index'), 10);
            if (targetWord && !isNaN(index)) {
                removeWordHistoryContext(targetWord, index);
                updateWordHistoryDisplay(word);
            }
        });
    });

    const clearBtn = document.querySelector('.ai-dict-history-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetWord = clearBtn.getAttribute('data-word');
            if (targetWord && confirm(`确定要清除 "${targetWord}" 的所有查词记录吗？`)) {
                clearWordHistory(targetWord);
                updateWordHistoryDisplay(word);
            }
        });
    }
}

function updateWordHistoryDisplay(word) {
    const container = document.getElementById('ai-dict-word-history-content');
    if (!container) return;

    const history = getWordHistory(word);
    container.innerHTML = formatWordHistory(word, history);

    const countSpan = document.querySelector('.ai-dict-history-count');
    if (countSpan) {
        countSpan.textContent = history ? `(${history.count}次)` : '';
    }

    bindWordHistoryEvents(word);
}

// --- Statistics Panel ---

function getTimeRangeStart(range) {
    const now = new Date();
    switch (range) {
        case 'today':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        case 'week':
            const dayOfWeek = now.getDay();
            const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff).getTime();
        case 'month':
            return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        case 'all':
        default:
            return 0;
    }
}

function getWordStatistics(range) {
    const startTime = getTimeRangeStart(range);
    const stats = [];
    const wordHistoryData = getAllWordHistory();

    for (const [word, data] of Object.entries(wordHistoryData)) {
        const lookups = data.lookups || [];
        const rangeCount = lookups.filter(ts => ts >= startTime).length;

        if (rangeCount > 0) {
            stats.push({
                word: word,
                count: rangeCount,
                totalCount: data.count || rangeCount
            });
        }
    }

    stats.sort((a, b) => b.count - a.count);
    return stats;
}

function getDailyLookupCounts(range) {
    const now = Date.now();
    let days;

    switch (range) {
        case 'week': days = 7; break;
        case 'month': days = 30; break;
        case 'all': days = 90; break;
        default: days = 7;
    }

    const dailyCounts = {};
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        dailyCounts[dateStr] = 0;
    }

    const wordHistoryData = getAllWordHistory();
    for (const data of Object.values(wordHistoryData)) {
        const lookups = data.lookups || [];
        for (const ts of lookups) {
            const date = new Date(ts);
            const dateStr = date.toISOString().split('T')[0];
            if (dateStr in dailyCounts) {
                dailyCounts[dateStr]++;
            }
        }
    }

    return Object.entries(dailyCounts).map(([date, count]) => ({
        date,
        count,
        displayDate: formatDateForChart(date)
    }));
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

function createStatisticsPanelContent(range) {
    if (range === 'review') {
        return createReviewStatusContent();
    }

    const stats = getWordStatistics(range);
    const groups = groupWordsByCount(stats);
    const totalWords = stats.length;
    const totalLookups = stats.reduce((sum, item) => sum + item.count, 0);

    const chartRange = range === 'today' ? 'week' : range;
    const dailyData = getDailyLookupCounts(chartRange);
    const trendChartHtml = createTrendChart(dailyData);

    let groupsHtml = '';
    for (const [key, group] of Object.entries(groups)) {
        if (group.words.length > 0) {
            groupsHtml += `
                <div class="ai-dict-stats-group" data-group="${key}">
                    <div class="ai-dict-stats-group-header">
                        <span class="ai-dict-stats-group-label">${group.label}</span>
                        <span class="ai-dict-stats-group-count">${group.words.length} 词</span>
                    </div>
                    <div class="ai-dict-stats-group-words">
                        ${group.words.map(item => `
                            <div class="ai-dict-stats-word-item" data-word="${escapeHtml(item.word)}">
                                <span class="ai-dict-stats-word">${escapeHtml(item.word)}</span>
                                <span class="ai-dict-stats-word-count">${item.count}次</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }

    if (!groupsHtml) {
        groupsHtml = '<div class="ai-dict-stats-empty">该时间段内暂无查词记录</div>';
    }

    return `
        <div class="ai-dict-stats-inner">
            <div class="ai-dict-stats-header">
                <h3><i class="fa-solid fa-chart-bar"></i> 查词统计</h3>
                <button class="ai-dict-stats-close-btn" title="关闭">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            <div class="ai-dict-stats-tabs">
                <button class="ai-dict-stats-tab ${range === 'today' ? 'active' : ''}" data-range="today">今日</button>
                <button class="ai-dict-stats-tab ${range === 'week' ? 'active' : ''}" data-range="week">本周</button>
                <button class="ai-dict-stats-tab ${range === 'month' ? 'active' : ''}" data-range="month">本月</button>
                <button class="ai-dict-stats-tab ${range === 'all' ? 'active' : ''}" data-range="all">全部</button>
                <button class="ai-dict-stats-tab ${range === 'review' ? 'active' : ''}" data-range="review">复习</button>
            </div>
            <div class="ai-dict-stats-summary">
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${totalWords}</span>
                    <span class="ai-dict-stats-summary-label">单词数</span>
                </div>
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${totalLookups}</span>
                    <span class="ai-dict-stats-summary-label">查词次数</span>
                </div>
            </div>
            <div class="ai-dict-stats-chart-section">
                <div class="ai-dict-stats-chart-title">
                    <i class="fa-solid fa-chart-line"></i>
                    每日查词趋势 ${range === 'today' ? '(近7天)' : range === 'week' ? '(本周)' : range === 'month' ? '(近30天)' : '(近90天)'}
                </div>
                <div class="ai-dict-stats-chart-container">
                    ${trendChartHtml}
                </div>
            </div>
            <div class="ai-dict-stats-content">
                ${groupsHtml}
            </div>
        </div>
    `;
}

function createReviewStatusContent() {
    const reviewData = getReviewData();
    const pendingCount = reviewData.pendingWords.length;
    const reviewingCount = Object.keys(reviewData.reviewingWords).length;
    const masteredCount = reviewData.masteredWords.length;
    const sessionCount = reviewData.currentSession.words.length;
    const todayWords = getWordsToReviewToday();

    let pendingHtml = '';
    if (pendingCount > 0) {
        pendingHtml = `
            <div class="ai-dict-stats-group">
                <div class="ai-dict-stats-group-header">
                    <span class="ai-dict-stats-group-label">待复习 (查2次待加入)</span>
                    <span class="ai-dict-stats-group-count">${pendingCount} 词</span>
                </div>
                <div class="ai-dict-stats-group-words">
                    ${reviewData.pendingWords.slice(0, 20).map(item => `
                        <div class="ai-dict-stats-word-item">
                            <span class="ai-dict-stats-word">${escapeHtml(item.word)}</span>
                            <span class="ai-dict-stats-word-count">${formatDate(item.addedDate)}</span>
                        </div>
                    `).join('')}
                    ${pendingCount > 20 ? `<div class="ai-dict-stats-more">... 还有 ${pendingCount - 20} 个</div>` : ''}
                </div>
            </div>
        `;
    }

    let reviewingHtml = '';
    if (reviewingCount > 0) {
        const reviewingEntries = Object.entries(reviewData.reviewingWords);
        reviewingHtml = `
            <div class="ai-dict-stats-group">
                <div class="ai-dict-stats-group-header">
                    <span class="ai-dict-stats-group-label">复习中 (艾宾浩斯周期)</span>
                    <span class="ai-dict-stats-group-count">${reviewingCount} 词</span>
                </div>
                <div class="ai-dict-stats-group-words">
                    ${reviewingEntries.slice(0, 20).map(([word, data]) => `
                        <div class="ai-dict-stats-word-item">
                            <span class="ai-dict-stats-word">${escapeHtml(word)}</span>
                            <span class="ai-dict-stats-word-count">阶段${data.stage + 1}/6 | ${formatDate(data.nextReviewDate)}</span>
                        </div>
                    `).join('')}
                    ${reviewingCount > 20 ? `<div class="ai-dict-stats-more">... 还有 ${reviewingCount - 20} 个</div>` : ''}
                </div>
            </div>
        `;
    }

    let masteredHtml = '';
    if (masteredCount > 0) {
        masteredHtml = `
            <div class="ai-dict-stats-group">
                <div class="ai-dict-stats-group-header">
                    <span class="ai-dict-stats-group-label">已掌握</span>
                    <span class="ai-dict-stats-group-count">${masteredCount} 词</span>
                </div>
                <div class="ai-dict-stats-group-words">
                    ${reviewData.masteredWords.slice(0, 20).map(item => `
                        <div class="ai-dict-stats-word-item">
                            <span class="ai-dict-stats-word">${escapeHtml(item.word)}</span>
                            <span class="ai-dict-stats-word-count">${formatDate(item.masteredDate)}</span>
                        </div>
                    `).join('')}
                    ${masteredCount > 20 ? `<div class="ai-dict-stats-more">... 还有 ${masteredCount - 20} 个</div>` : ''}
                </div>
            </div>
        `;
    }

    let sessionHtml = '';
    if (sessionCount > 0) {
        sessionHtml = `
            <div class="ai-dict-stats-group" style="background: var(--SmartThemeBlurTintColor, rgba(100,100,255,0.1)); border-radius: 8px; padding: 10px;">
                <div class="ai-dict-stats-group-header">
                    <span class="ai-dict-stats-group-label">当前会话待用词</span>
                    <span class="ai-dict-stats-group-count">${sessionCount} 词</span>
                </div>
                <div class="ai-dict-stats-group-words">
                    ${reviewData.currentSession.words.map(word => `
                        <div class="ai-dict-stats-word-item">
                            <span class="ai-dict-stats-word">${escapeHtml(word)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const noDataHtml = (!pendingCount && !reviewingCount && !masteredCount)
        ? '<div class="ai-dict-stats-empty">暂无复习数据。查询单词2次后会自动加入复习。</div>'
        : '';

    return `
        <div class="ai-dict-stats-inner">
            <div class="ai-dict-stats-header">
                <h3><i class="fa-solid fa-brain"></i> 沉浸式复习</h3>
                <button class="ai-dict-stats-close-btn" title="关闭">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            <div class="ai-dict-stats-tabs">
                <button class="ai-dict-stats-tab" data-range="today">今日</button>
                <button class="ai-dict-stats-tab" data-range="week">本周</button>
                <button class="ai-dict-stats-tab" data-range="month">本月</button>
                <button class="ai-dict-stats-tab" data-range="all">全部</button>
                <button class="ai-dict-stats-tab active" data-range="review">复习</button>
            </div>
            <div class="ai-dict-stats-summary">
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${pendingCount}</span>
                    <span class="ai-dict-stats-summary-label">待复习</span>
                </div>
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${reviewingCount}</span>
                    <span class="ai-dict-stats-summary-label">复习中</span>
                </div>
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${masteredCount}</span>
                    <span class="ai-dict-stats-summary-label">已掌握</span>
                </div>
                <div class="ai-dict-stats-summary-item">
                    <span class="ai-dict-stats-summary-value">${todayWords.length}</span>
                    <span class="ai-dict-stats-summary-label">今日待复习</span>
                </div>
            </div>
            <div class="ai-dict-review-actions" style="padding: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="menu_button" id="ai-dict-clear-session" title="清空当前会话，重新获取今日词汇">
                    <i class="fa-solid fa-rotate"></i> 刷新会话
                </button>
                <button class="menu_button" id="ai-dict-force-today" title="强制将所有待复习词设为今日可复习">
                    <i class="fa-solid fa-forward"></i> 立即可复习
                </button>
                <button class="menu_button" id="ai-dict-clear-all-review" title="清空所有复习数据" style="color: #ff6b6b;">
                    <i class="fa-solid fa-trash"></i> 清空全部
                </button>
            </div>
            <div class="ai-dict-stats-content">
                ${sessionHtml}
                ${noDataHtml}
                ${pendingHtml}
                ${reviewingHtml}
                ${masteredHtml}
            </div>
        </div>
    `;
}

function showStatisticsPanel() {
    const existingPanel = document.getElementById('ai-dict-stats-panel');
    if (existingPanel) {
        existingPanel.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'ai-dict-stats-panel';
    panel.className = 'ai-dict-stats-panel';
    panel.innerHTML = createStatisticsPanelContent('today');

    document.body.appendChild(panel);
    bindStatisticsPanelEvents();
}

function bindStatisticsPanelEvents() {
    const panel = document.getElementById('ai-dict-stats-panel');
    if (!panel) return;

    const closeBtn = panel.querySelector('.ai-dict-stats-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => panel.remove());
    }

    const tabs = panel.querySelectorAll('.ai-dict-stats-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const range = tab.getAttribute('data-range');
            panel.innerHTML = createStatisticsPanelContent(range);
            bindStatisticsPanelEvents();
        });
    });

    panel.addEventListener('click', (e) => {
        if (e.target === panel) panel.remove();
    });

    // Review tab buttons
    const clearSessionBtn = panel.querySelector('#ai-dict-clear-session');
    if (clearSessionBtn) {
        clearSessionBtn.addEventListener('click', () => {
            clearCurrentSession();
            alert('已清空当前会话，下次发消息时会重新获取今日词汇');
            panel.innerHTML = createStatisticsPanelContent('review');
            bindStatisticsPanelEvents();
        });
    }

    const forceTodayBtn = panel.querySelector('#ai-dict-force-today');
    if (forceTodayBtn) {
        forceTodayBtn.addEventListener('click', () => {
            const count = forceAllWordsReviewable();
            alert(`已将 ${count} 个单词加入当前会话，下次发消息时生效`);
            panel.innerHTML = createStatisticsPanelContent('review');
            bindStatisticsPanelEvents();
        });
    }

    const clearAllBtn = panel.querySelector('#ai-dict-clear-all-review');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async () => {
            if (!confirm('确定要清空所有复习数据吗？此操作不可恢复。')) return;
            await clearAllReviewData();
            alert('已清空所有复习数据');
            panel.innerHTML = createStatisticsPanelContent('review');
            bindStatisticsPanelEvents();
        });
    }
}

// --- Farm Game ---

async function loadFarmGameScript() {
    if (window.FarmGame) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${EXTENSION_URL}/farm-game.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load farm game'));
        document.head.appendChild(script);
    });
}

async function showFarmGamePanel() {
    const existingPanel = document.getElementById('ai-dict-farm-panel');
    if (existingPanel) {
        existingPanel.remove();
        return;
    }

    try {
        await loadFarmGameScript();
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Failed to load farm game:`, e);
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'ai-dict-farm-panel';
    panel.className = 'ai-dict-farm-panel';
    panel.innerHTML = `
        <div class="ai-dict-farm-panel-content">
            <div class="ai-dict-farm-panel-header">
                <span>🌾 开心农场</span>
                <div class="ai-dict-farm-panel-btns">
                    <button class="ai-dict-farm-reset-btn menu_button" title="重置游戏">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                    <button class="ai-dict-farm-close-btn menu_button" title="关闭">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="farm-game-container"></div>
        </div>
    `;

    document.body.appendChild(panel);

    if (window.FarmGame) {
        window.FarmGame.init();
    }

    const closeBtn = panel.querySelector('.ai-dict-farm-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => panel.remove());
    }

    const resetBtn = panel.querySelector('.ai-dict-farm-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (window.FarmGame) window.FarmGame.reset();
        });
    }

    panel.addEventListener('click', (e) => {
        if (e.target === panel) panel.remove();
    });
}

// --- Merged Content Creation ---

function createMergedContent(word, youdaoResults, autoFetchAI = settings.autoFetchAI) {
    const collapsibleId = `youdao-definitions-${Date.now()}`;
    const promptCollapsibleId = `prompt-view-${Date.now()}`;
    const historyCollapsibleId = `word-history-${Date.now()}`;

    const hasYoudaoResults = youdaoResults && Array.isArray(youdaoResults) && youdaoResults.length > 0;
    const hasProxyError = youdaoResults && youdaoResults.proxyError === true;
    const showDeepStudy = isSingleWord(word);

    const savedConfusables = getRelatedConfusables(word, settings.confusableWords);
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
        const youdaoExpanded = !settings.autoCollapseYoudao;
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

function formatYoudaoHeadSection(results) {
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

function formatYoudaoDefinitions(results) {
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

function updateYoudaoSection(word, youdaoResults) {
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
        const youdaoExpanded = !settings.autoCollapseYoudao;
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

                    if (wasExpanded && settings.fetchAIOnYoudaoExpand && targetId.startsWith('youdao-definitions-')) {
                        triggerAIFetchIfEmpty(selectedText, fetchAIDefinitionWrapper);
                    }
                }
            }
        });
    });
}

// --- AI Lookup Wrappers ---

async function fetchAIDefinitionWrapper(word) {
    const context = extractContext(document.body.innerText);
    await fetchAIDefinition({
        word,
        context,
        settings,
        extensionSettings: extension_settings,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings: oai_settings
    });
}

async function performDeepStudyWrapper(word) {
    await performDeepStudy({
        word,
        settings,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings: oai_settings
    });
}

async function sendChatMessageWrapper(word) {
    await sendChatMessage({
        word,
        settings,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings: oai_settings
    });
}

async function performConfusableLookupWrapper(word) {
    await performConfusableLookup({
        word,
        settings,
        confusableWords: settings.confusableWords,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings: oai_settings,
        saveSettings,
        updateSavedDisplay: (w) => updateSavedConfusablesDisplay(w, settings.confusableWords, saveSettings, () => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables)),
        highlightWords: () => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables)
    });
}

// --- Main Lookup Function ---

async function performDictionaryLookup(skipSaveHistory = false) {
    hideIcon();

    const savedSelectionRangeInfo = selectionRangeInfo;
    const savedSelectedParentElement = selectedParentElement;

    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }

    selectionRangeInfo = savedSelectionRangeInfo;
    selectedParentElement = savedSelectedParentElement;

    if (!selectedText.trim()) {
        showPanel('No word selected', 'Please select a word on the page first.', 'error');
        return;
    }

    const isPhrase = !isSingleWord(selectedText);
    const shouldAutoFetchAI = settings.autoFetchAI || isPhrase;

    try {
        showPanel('Looking up...', `Fetching definitions for: "${selectedText}"...`, 'loading');

        if (isMobile()) {
            expandPanel();
        }

        if (!skipSaveHistory) {
            saveWordHistory(selectedText, selectedContext, (word) => {
                addWordToPendingReview(word, settings.immersiveReview);
            });
        }

        const initialHtmlContent = createMergedContent(selectedText, null, shouldAutoFetchAI);
        showPanelHtml(selectedText, initialHtmlContent, 'success', {
            getWordHistory,
            isWordInReview,
            toggleWordInReview,
            immersiveReviewEnabled: settings.immersiveReview,
            playAudio,
            fetchAIOnYoudaoExpand: settings.fetchAIOnYoudaoExpand,
            triggerAIFetchIfEmpty: () => triggerAIFetchIfEmpty(selectedText, fetchAIDefinitionWrapper)
        });

        clearChatHistory();
        setCurrentWord(selectedText);

        bindDeepStudyButton(selectedText, performDeepStudyWrapper);
        bindConfusableButton(
            selectedText,
            performConfusableLookupWrapper,
            settings.confusableWords,
            saveSettings,
            (w) => updateSavedConfusablesDisplay(w, settings.confusableWords, saveSettings, () => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables)),
            () => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables)
        );

        highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables);

        bindChatInputEvents(selectedText, sendChatMessageWrapper);
        bindWordHistoryEvents(selectedText);

        if (!shouldAutoFetchAI) {
            bindManualAIFetchButton(selectedText, fetchAIDefinitionWrapper);
        }

        // Start Youdao lookup (only for single words)
        let youdaoPromise = Promise.resolve(null);
        if (!isPhrase) {
            youdaoPromise = fetchYoudaoDictionary(selectedText).catch(error => {
                console.warn('Youdao dictionary fetch failed:', error);
                return null;
            });
        }

        // Start AI lookup if should auto fetch
        let aiPromise = Promise.resolve();
        if (shouldAutoFetchAI) {
            aiPromise = fetchAIDefinitionWrapper(selectedText).catch(error => {
                console.error('AI definition fetch error:', error);
                const aiContentElement = document.getElementById('ai-definition-content');
                if (aiContentElement) {
                    aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
                }
            });
        }

        const youdaoResults = await youdaoPromise;
        if (youdaoResults) {
            updateYoudaoSection(selectedText, youdaoResults);
        }

        if (shouldAutoFetchAI) {
            await aiPromise;
        }

    } catch (error) {
        console.error('AI Dictionary lookup error:', error);
        showPanel('Error', `Failed to lookup word: ${error.message}`, 'error');
    }
}

// --- Text Selection Handlers ---

function handleTouchStart(event) {
    if (!settings.enabled) return;
    if (!isMobile()) return;

    if (event.target.closest('#ai-dictionary-icon') ||
        event.target.closest('#ai-dictionary-panel') ||
        event.target.closest('#ai-dictionary-panel-toggle')) {
        return;
    }

    if (touchEndTimeout) {
        clearTimeout(touchEndTimeout);
        touchEndTimeout = null;
    }

    isTouchActive = true;
    selectionBeforeTouch = window.getSelection().toString().trim();
    hideIcon();
}

function handleTouchEnd(event) {
    if (!settings.enabled) return;
    if (!isMobile()) return;

    if (event.target.closest('#ai-dictionary-icon') ||
        event.target.closest('#ai-dictionary-panel') ||
        event.target.closest('#ai-dictionary-panel-toggle')) {
        return;
    }

    isTouchActive = false;

    if (touchEndTimeout) {
        clearTimeout(touchEndTimeout);
    }

    const delay = isAndroid() ? 300 : 50;

    touchEndTimeout = setTimeout(() => {
        processSelectionAfterTouch();
    }, delay);
}

function handleTouchCancel() {
    isTouchActive = false;
    if (touchEndTimeout) {
        clearTimeout(touchEndTimeout);
        touchEndTimeout = null;
    }
}

function processSelectionAfterTouch() {
    const selected = window.getSelection();
    const selectionString = selected.toString().trim();

    if (isTouchActive) return;

    if (selectionString.length > 0 &&
        selectionString !== selectionBeforeTouch &&
        selectionString !== lastProcessedSelection) {

        lastProcessedSelection = selectionString;
        selectedText = selectionString;

        let element = selected.anchorNode?.parentElement;
        while (element && element.tagName !== 'P' && element.tagName !== 'DIV') {
            element = element.parentElement;
        }
        selectedContext = element ? element.textContent : selectionString;
        selectedParentElement = element;

        selectionRangeInfo = null;
        try {
            const range = selected.getRangeAt(0);
            if (element && range.startContainer) {
                const preSelectionRange = document.createRange();
                preSelectionRange.selectNodeContents(element);
                preSelectionRange.setEnd(range.startContainer, range.startOffset);
                const startOffset = preSelectionRange.toString().length;

                selectionRangeInfo = {
                    startOffset: startOffset,
                    endOffset: startOffset + selectionString.length
                };
            }
        } catch (e) {
            selectionRangeInfo = null;
        }

        if (settings.enableDirectLookup) {
            performDictionaryLookup();
        } else {
            showIconAtSelection(selected);
        }
    } else if (selectionString.length === 0) {
        hideIcon();
        selectionRangeInfo = null;
        lastProcessedSelection = '';
    }
}

function showIconAtSelection(selected) {
    try {
        const range = selected.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const position = settings.iconPosition || 'top-right';
        let x, y;
        const offset = 35;
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

        const iconSize = 30;
        x = Math.max(5, Math.min(x, window.innerWidth - iconSize - 5));
        y = Math.max(5, Math.min(y, window.innerHeight - iconSize - 5));

        showIcon(x, y, performDictionaryLookup);
    } catch (e) {
        console.warn('AI Dictionary: Could not calculate selection position', e);
    }
}

function handleTextSelection(event) {
    if (!settings.enabled) return;

    if (event && event.target && event.target.closest) {
        if (event.target.closest('#ai-dictionary-icon') ||
            event.target.closest('#ai-dictionary-panel') ||
            event.target.closest('#ai-dictionary-panel-toggle')) {
            return;
        }
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
        selectedParentElement = element;

        selectionRangeInfo = null;
        try {
            const range = selected.getRangeAt(0);
            if (element && range.startContainer) {
                const preSelectionRange = document.createRange();
                preSelectionRange.selectNodeContents(element);
                preSelectionRange.setEnd(range.startContainer, range.startOffset);
                const startOffset = preSelectionRange.toString().length;

                selectionRangeInfo = {
                    startOffset: startOffset,
                    endOffset: startOffset + selectionString.length
                };
            }
        } catch (e) {
            selectionRangeInfo = null;
        }

        if (settings.enableDirectLookup) {
            performDictionaryLookup();
        } else {
            showIconAtSelection(selected);
        }
    } else {
        hideIcon();
        selectionRangeInfo = null;
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
    selectedParentElement = element;
}

// --- Initialization ---

const init = async () => {
    // Load CSS styles
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = `${EXTENSION_URL}/style.css`;
    document.head.appendChild(linkElement);

    loadSettings();
    console.log(`[${EXTENSION_NAME}] Settings loaded`, settings);

    // Load word history
    await loadWordHistoryFromFile();

    // Load review data
    await loadReviewDataFromFile();

    // Initialize Settings UI
    const manager = new SettingsUi({
        extensionUrl: EXTENSION_URL,
        settings: settings,
        saveSettings: saveSettings,
        connectionManager: extension_settings.connectionManager,
        showStatisticsPanel: showStatisticsPanel,
        showFarmGamePanel: showFarmGamePanel,
        removeConfusableHighlights: removeConfusableHighlights,
        highlightAllConfusableWords: () => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables),
        updateHighlightColor: () => updateHighlightColor(settings.highlightColor)
    });

    const renderedUi = await manager.render();
    if (renderedUi) {
        $('#extensions_settings').append(renderedUi);
    }

    // Mouse interaction (Desktop)
    document.addEventListener('mouseup', (e) => setTimeout(() => handleTextSelection(e), 10));

    // Touch interaction (Mobile)
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    // Selection change handler
    const debouncedSelectionHandler = debounce((e) => {
        if (!isMobile()) {
            handleTextSelection(e);
        } else if (isAndroid() && !isTouchActive) {
            if (touchEndTimeout) {
                clearTimeout(touchEndTimeout);
            }
            touchEndTimeout = setTimeout(() => {
                processSelectionAfterTouch();
            }, 200);
        }
    }, 300);
    document.addEventListener('selectionchange', debouncedSelectionHandler);

    document.addEventListener('contextmenu', handleContextMenu);

    // Global click for collapse
    document.addEventListener('click', handleGlobalClick);

    // Expose global function
    window.performDictionaryLookup = performDictionaryLookup;

    // Initialize the side panel
    createSidePanel({ settings, saveSettings });

    // Event listeners for chat messages
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageIndex) => {
        setTimeout(() => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables), 100);

        const reviewData = getReviewData();
        if (settings.immersiveReview && reviewData.currentSession.words.length > 0) {
            setTimeout(() => {
                try {
                    const context = getContext();
                    if (context && context.chat) {
                        let aiMessage = null;
                        for (let i = context.chat.length - 1; i >= 0; i--) {
                            if (!context.chat[i].is_user && context.chat[i].mes) {
                                aiMessage = context.chat[i].mes;
                                break;
                            }
                        }
                        if (aiMessage) {
                            console.log(`[${EXTENSION_NAME}] Checking AI response for review words...`);
                            checkAIResponseForReviewWords(aiMessage, settings.immersiveReview);
                        }
                    }
                } catch (e) {
                    console.warn(`[${EXTENSION_NAME}] Error checking AI response for review words:`, e);
                }
            }, 500);
        }
    });

    eventSource.on(event_types.MESSAGE_SENT, () => {
        setTimeout(() => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables), 100);
    });

    // Inject review prompt before generation
    eventSource.on(event_types.GENERATION_STARTED, () => {
        if (!settings.immersiveReview) {
            setExtensionPrompt('ai-dictionary-review', '', extension_prompt_types.IN_CHAT, 0, false);
            return;
        }

        try {
            const reviewPrompt = generateReviewPrompt(settings.immersiveReview, settings.reviewPrompt);
            if (reviewPrompt) {
                setExtensionPrompt('ai-dictionary-review', reviewPrompt, extension_prompt_types.IN_CHAT, 0, false);
                const reviewData = getReviewData();
                console.log(`[${EXTENSION_NAME}] Injected review prompt with ${reviewData.currentSession.words.length} words`);
            } else {
                setExtensionPrompt('ai-dictionary-review', '', extension_prompt_types.IN_CHAT, 0, false);
            }
        } catch (e) {
            console.warn(`[${EXTENSION_NAME}] Error injecting review prompt:`, e);
        }
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables), 100);
    });

    // Initialize highlight color
    updateHighlightColor(settings.highlightColor);

    // Initial highlight on page load
    setTimeout(() => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables), 500);

    console.log(`[${EXTENSION_NAME}] Ready`);
};

// Export for other modules
window.aiDictionary = {
    getWordHistory: getAllWordHistory,
    lookupWord: (word) => {
        selectedText = word;
        selectedContext = '';
        performDictionaryLookup();
    },
    lookupWordReadOnly: (word, context = '') => {
        selectedText = word;
        selectedContext = context;
        performDictionaryLookup(true);
    }
};

// Start initialization
await init();
