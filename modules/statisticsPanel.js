/**
 * AI Dictionary - Statistics Panel Module
 * Statistics panel UI and review status display
 */

import {
    groupWordsByCount,
    createTrendChart,
    formatDateForChart,
    escapeHtml
} from './statistics.js';

/**
 * Get time range start timestamp
 * @param {'today'|'week'|'month'|'all'} range
 * @returns {number}
 */
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

/**
 * Format timestamp to month/day
 * @param {number} timestamp
 * @returns {string}
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

/**
 * Get word statistics for a time range
 * @param {Object} wordHistoryData
 * @param {'today'|'week'|'month'|'all'} range
 * @returns {Array}
 */
function getWordStatistics(wordHistoryData, range) {
    const startTime = getTimeRangeStart(range);
    const stats = [];

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

/**
 * Get daily lookup counts for chart
 * @param {Object} wordHistoryData
 * @param {'today'|'week'|'month'|'all'} range
 * @returns {Array}
 */
function getDailyLookupCounts(wordHistoryData, range) {
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

/**
 * Create statistics panel content HTML
 * @param {Object} options
 * @param {'today'|'week'|'month'|'all'|'review'} options.range
 * @param {Object} options.wordHistoryData
 * @param {Object} options.reviewData
 * @param {Function} options.getWordsToReviewToday
 * @returns {string}
 */
export function createStatisticsPanelContent(options) {
    const { range, wordHistoryData, reviewData, getWordsToReviewToday } = options;

    if (range === 'review') {
        return createReviewStatusContent({ reviewData, getWordsToReviewToday });
    }

    const stats = getWordStatistics(wordHistoryData, range);
    const groups = groupWordsByCount(stats);
    const totalWords = stats.length;
    const totalLookups = stats.reduce((sum, item) => sum + item.count, 0);

    const chartRange = range === 'today' ? 'week' : range;
    const dailyData = getDailyLookupCounts(wordHistoryData, chartRange);
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

/**
 * Create review status content HTML
 * @param {Object} options
 * @param {Object} options.reviewData
 * @param {Function} options.getWordsToReviewToday
 * @returns {string}
 */
function createReviewStatusContent(options) {
    const { reviewData, getWordsToReviewToday } = options;

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

/**
 * Show statistics panel
 * @param {Object} options
 * @param {Function} options.getAllWordHistory
 * @param {Function} options.getReviewData
 * @param {Function} options.getWordsToReviewToday
 * @param {Function} options.clearCurrentSession
 * @param {Function} options.forceAllWordsReviewable
 * @param {Function} options.clearAllReviewData
 */
export function showStatisticsPanel(options) {
    const {
        getAllWordHistory,
        getReviewData,
        getWordsToReviewToday,
        clearCurrentSession,
        forceAllWordsReviewable,
        clearAllReviewData
    } = options;

    const existingPanel = document.getElementById('ai-dict-stats-panel');
    if (existingPanel) {
        existingPanel.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'ai-dict-stats-panel';
    panel.className = 'ai-dict-stats-panel';

    const updateContent = (range) => {
        panel.innerHTML = createStatisticsPanelContent({
            range,
            wordHistoryData: getAllWordHistory(),
            reviewData: getReviewData(),
            getWordsToReviewToday
        });
        bindPanelEvents(range);
    };

    const bindPanelEvents = (currentRange) => {
        const closeBtn = panel.querySelector('.ai-dict-stats-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => panel.remove());
        }

        const tabs = panel.querySelectorAll('.ai-dict-stats-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const range = tab.getAttribute('data-range');
                updateContent(range);
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
                updateContent('review');
            });
        }

        const forceTodayBtn = panel.querySelector('#ai-dict-force-today');
        if (forceTodayBtn) {
            forceTodayBtn.addEventListener('click', () => {
                const count = forceAllWordsReviewable();
                alert(`已将 ${count} 个单词加入当前会话，下次发消息时生效`);
                updateContent('review');
            });
        }

        const clearAllBtn = panel.querySelector('#ai-dict-clear-all-review');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', async () => {
                if (!confirm('确定要清空所有复习数据吗？此操作不可恢复。')) return;
                await clearAllReviewData();
                alert('已清空所有复习数据');
                updateContent('review');
            });
        }
    };

    updateContent('today');
    document.body.appendChild(panel);
}
