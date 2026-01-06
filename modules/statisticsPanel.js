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

/** @type {number} Current calendar year */
let calendarYear = new Date().getFullYear();

/** @type {number} Current calendar month (0-11) */
let calendarMonth = new Date().getMonth();

/**
 * Get review schedule map (date -> words[])
 * @param {Object} reviewData
 * @returns {Object}
 */
function getReviewScheduleMap(reviewData) {
    const scheduleMap = {};

    // Add pending words (they become reviewable the next day after adding)
    for (const item of reviewData.pendingWords) {
        const addedDate = new Date(item.addedDate);
        // Available for review starting the next day
        const reviewDate = new Date(addedDate);
        reviewDate.setDate(reviewDate.getDate() + 1);
        const dateKey = formatDateKey(reviewDate);

        if (!scheduleMap[dateKey]) {
            scheduleMap[dateKey] = [];
        }
        scheduleMap[dateKey].push({
            word: item.word,
            type: 'pending',
            stage: 0
        });
    }

    // Add reviewing words with their next review date
    for (const [word, data] of Object.entries(reviewData.reviewingWords)) {
        const reviewDate = new Date(data.nextReviewDate);
        const dateKey = formatDateKey(reviewDate);

        if (!scheduleMap[dateKey]) {
            scheduleMap[dateKey] = [];
        }
        scheduleMap[dateKey].push({
            word: word,
            type: 'reviewing',
            stage: data.stage + 1
        });
    }

    return scheduleMap;
}

/**
 * Format date to YYYY-MM-DD key
 * @param {Date} date
 * @returns {string}
 */
function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Create calendar HTML
 * @param {number} year
 * @param {number} month
 * @param {Object} scheduleMap - date -> words[]
 * @returns {string}
 */
function createCalendarHtml(year, month, scheduleMap) {
    const today = new Date();
    const todayKey = formatDateKey(today);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay(); // 0 = Sunday

    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月',
        '7月', '8月', '9月', '10月', '11月', '12月'];
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

    let calendarHtml = `
        <div class="ai-dict-calendar">
            <div class="ai-dict-calendar-header">
                <button class="ai-dict-calendar-nav" data-action="prev-month" title="上个月">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <span class="ai-dict-calendar-title">${year}年 ${monthNames[month]}</span>
                <button class="ai-dict-calendar-nav" data-action="next-month" title="下个月">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
            <div class="ai-dict-calendar-weekdays">
                ${weekDays.map(d => `<div class="ai-dict-calendar-weekday">${d}</div>`).join('')}
            </div>
            <div class="ai-dict-calendar-days">
    `;

    // Empty cells before the first day
    for (let i = 0; i < startWeekday; i++) {
        calendarHtml += '<div class="ai-dict-calendar-day empty"></div>';
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const wordsForDay = scheduleMap[dateKey] || [];
        const hasWords = wordsForDay.length > 0;
        const isToday = dateKey === todayKey;
        const isPast = new Date(dateKey) < new Date(todayKey);

        let classes = 'ai-dict-calendar-day';
        if (hasWords) classes += ' has-words';
        if (isToday) classes += ' today';
        if (isPast && hasWords) classes += ' overdue';

        calendarHtml += `
            <div class="${classes}" data-date="${dateKey}" title="${hasWords ? wordsForDay.length + '个单词' : ''}">
                <span class="ai-dict-calendar-day-num">${day}</span>
            </div>
        `;
    }

    calendarHtml += `
            </div>
        </div>
    `;

    return calendarHtml;
}

/**
 * Show popup with words for selected date
 * @param {HTMLElement} dayEl - The clicked day element
 * @param {string} dateKey - Date key (YYYY-MM-DD)
 * @param {Object} scheduleMap - date -> words[]
 */
function showCalendarPopup(dayEl, dateKey, scheduleMap) {
    // Remove any existing popup
    closeCalendarPopup();

    const words = scheduleMap[dateKey] || [];

    // Don't show popup if no words
    if (words.length === 0) return;

    const pendingWords = words.filter(w => w.type === 'pending');
    const reviewingWords = words.filter(w => w.type === 'reviewing');

    let contentHtml = '';
    if (pendingWords.length > 0) {
        contentHtml += `
            <div class="ai-dict-calendar-popup-group">
                <div class="ai-dict-calendar-popup-group-title">
                    <i class="fa-solid fa-seedling"></i> 新词 (${pendingWords.length})
                </div>
                <div class="ai-dict-calendar-popup-words">
                    ${pendingWords.map(w => `
                        <span class="ai-dict-calendar-popup-word">${escapeHtml(w.word)}</span>
                    `).join('')}
                </div>
            </div>
        `;
    }
    if (reviewingWords.length > 0) {
        contentHtml += `
            <div class="ai-dict-calendar-popup-group">
                <div class="ai-dict-calendar-popup-group-title">
                    <i class="fa-solid fa-rotate"></i> 复习 (${reviewingWords.length})
                </div>
                <div class="ai-dict-calendar-popup-words">
                    ${reviewingWords.map(w => `
                        <span class="ai-dict-calendar-popup-word">${escapeHtml(w.word)}</span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const popup = document.createElement('div');
    popup.className = 'ai-dict-calendar-popup';
    popup.id = 'ai-dict-calendar-popup';
    popup.innerHTML = `
        <div class="ai-dict-calendar-popup-content">
            ${contentHtml}
        </div>
    `;

    document.body.appendChild(popup);

    // Position the popup near the clicked day
    const rect = dayEl.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - popupRect.width / 2;
    let top = rect.bottom + 8;

    // Keep within viewport
    if (left < 10) left = 10;
    if (left + popupRect.width > window.innerWidth - 10) {
        left = window.innerWidth - popupRect.width - 10;
    }
    if (top + popupRect.height > window.innerHeight - 10) {
        top = rect.top - popupRect.height - 8;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', handlePopupOutsideClick);
    }, 0);
}

/**
 * Close the calendar popup
 */
function closeCalendarPopup() {
    const popup = document.getElementById('ai-dict-calendar-popup');
    if (popup) {
        popup.remove();
    }
    document.removeEventListener('click', handlePopupOutsideClick);
}

/**
 * Handle click outside popup
 */
function handlePopupOutsideClick(e) {
    const popup = document.getElementById('ai-dict-calendar-popup');
    if (popup && !popup.contains(e.target) && !e.target.closest('.ai-dict-calendar-day')) {
        closeCalendarPopup();
    }
}

/**
 * Format date for display
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {string}
 */
function formatDisplayDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const today = new Date();
    const todayKey = formatDateKey(today);

    if (dateKey === todayKey) {
        return `今天 (${month}月${day}日)`;
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateKey === formatDateKey(tomorrow)) {
        return `明天 (${month}月${day}日)`;
    }

    return `${month}月${day}日`;
}

/**
 * Generate summary words panel HTML
 * @param {string} type - pending, reviewing, mastered, today
 * @param {Object} reviewData
 * @param {Function} getWordsToReviewToday
 * @returns {string}
 */
function generateSummaryWordsHtml(type, reviewData, getWordsToReviewToday) {
    let words = [];
    let title = '';

    // Get today's midnight timestamp
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    switch (type) {
        case 'pending':
            title = '新加入';
            words = reviewData.pendingWords.map(w => ({ word: w.word, status: 'pending' }));
            break;
        case 'reviewing':
            title = '复习中';
            words = Object.entries(reviewData.reviewingWords).map(([word, data]) => ({
                word,
                status: 'reviewing',
                stage: data.stage + 1
            }));
            break;
        case 'mastered':
            title = '已掌握';
            words = reviewData.masteredWords.map(w => ({ word: w.word, status: 'mastered' }));
            break;
        case 'today':
            title = '今日复习';
            const sessionWords = reviewData.currentSession.words || [];

            // Pending: words still in session (waiting to be used)
            const pendingTodayWords = sessionWords.map(word => ({
                word,
                status: 'pending'
            }));

            // Done: words used today (check lastUsedDate >= todayStart)
            const doneWords = [];
            for (const [word, data] of Object.entries(reviewData.reviewingWords)) {
                if (data.lastUsedDate && data.lastUsedDate >= todayStart) {
                    doneWords.push({ word, status: 'done' });
                }
            }
            // Also check mastered words that were mastered today
            for (const item of reviewData.masteredWords) {
                if (item.masteredDate && item.masteredDate >= todayStart) {
                    doneWords.push({ word: item.word, status: 'done' });
                }
            }

            words = [...pendingTodayWords, ...doneWords];
            break;
    }

    if (words.length === 0) {
        return `<div class="ai-dict-summary-words-empty">暂无${title}的单词</div>`;
    }

    // For today type, separate done and pending
    if (type === 'today') {
        const doneWords = words.filter(w => w.status === 'done');
        const pendingWords = words.filter(w => w.status === 'pending');

        let html = '<div class="ai-dict-summary-words-list">';

        if (pendingWords.length > 0) {
            html += `
                <div class="ai-dict-summary-words-group">
                    <span class="ai-dict-summary-words-group-label">待复习 (${pendingWords.length})</span>
                    <div class="ai-dict-summary-words-items">
                        ${pendingWords.map(w => `<span class="ai-dict-summary-word">${escapeHtml(w.word)}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        if (doneWords.length > 0) {
            html += `
                <div class="ai-dict-summary-words-group">
                    <span class="ai-dict-summary-words-group-label done">已完成 (${doneWords.length})</span>
                    <div class="ai-dict-summary-words-items">
                        ${doneWords.map(w => `<span class="ai-dict-summary-word done">${escapeHtml(w.word)}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    return `
        <div class="ai-dict-summary-words-list">
            <div class="ai-dict-summary-words-items">
                ${words.map(w => `<span class="ai-dict-summary-word">${escapeHtml(w.word)}</span>`).join('')}
            </div>
        </div>
    `;
}

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

    // Calculate today's review count: pending in session + completed today
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    let todayDoneCount = 0;
    for (const data of Object.values(reviewData.reviewingWords)) {
        if (data.lastUsedDate && data.lastUsedDate >= todayStart) {
            todayDoneCount++;
        }
    }
    // Also count mastered words that were mastered today
    for (const item of reviewData.masteredWords) {
        if (item.masteredDate && item.masteredDate >= todayStart) {
            todayDoneCount++;
        }
    }
    const todayTotalCount = sessionCount + todayDoneCount;

    // Generate review schedule map and calendar
    const scheduleMap = getReviewScheduleMap(reviewData);
    const calendarHtml = createCalendarHtml(calendarYear, calendarMonth, scheduleMap);

    const noDataHtml = (!pendingCount && !reviewingCount && !masteredCount)
        ? '<div class="ai-dict-stats-empty">暂无复习数据。查询单词后会自动加入复习计划。</div>'
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
                <div class="ai-dict-stats-summary-item" data-type="pending">
                    <span class="ai-dict-stats-summary-value">${pendingCount}</span>
                    <span class="ai-dict-stats-summary-label">新加入</span>
                </div>
                <div class="ai-dict-stats-summary-item" data-type="reviewing">
                    <span class="ai-dict-stats-summary-value">${reviewingCount}</span>
                    <span class="ai-dict-stats-summary-label">复习中</span>
                </div>
                <div class="ai-dict-stats-summary-item" data-type="mastered">
                    <span class="ai-dict-stats-summary-value">${masteredCount}</span>
                    <span class="ai-dict-stats-summary-label">已掌握</span>
                </div>
                <div class="ai-dict-stats-summary-item" data-type="today">
                    <span class="ai-dict-stats-summary-value">${todayTotalCount}</span>
                    <span class="ai-dict-stats-summary-label">今日复习</span>
                </div>
            </div>
            <div class="ai-dict-summary-words-panel" id="ai-dict-summary-words-panel" style="display:none;"></div>
            <div class="ai-dict-review-actions">
                <button class="menu_button" id="ai-dict-clear-session" title="重置今日复习状态">
                    <i class="fa-solid fa-rotate"></i> 重置今日
                </button>
                <button class="menu_button" id="ai-dict-force-today" title="强制将所有新加入和复习中的词设为今日可复习">
                    <i class="fa-solid fa-forward"></i> 立即可复习
                </button>
                <button class="menu_button" id="ai-dict-clear-all-review" title="清空所有复习数据" style="color: #ff6b6b;">
                    <i class="fa-solid fa-trash"></i> 清空全部
                </button>
            </div>
            <div class="ai-dict-stats-content">
                ${noDataHtml}
                <div class="ai-dict-calendar-section">
                    <div class="ai-dict-calendar-section-title">
                        <i class="fa-solid fa-calendar-days"></i> 复习日历
                    </div>
                    ${calendarHtml}
                </div>
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
                // Reset calendar state when switching tabs
                if (range !== 'review') {
                    calendarYear = new Date().getFullYear();
                    calendarMonth = new Date().getMonth();
                }
                closeCalendarPopup();
                updateContent(range);
            });
        });

        panel.addEventListener('click', (e) => {
            if (e.target === panel) {
                closeCalendarPopup();
                panel.remove();
            }
        });

        // Calendar navigation
        const calendarNavBtns = panel.querySelectorAll('.ai-dict-calendar-nav');
        calendarNavBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                if (action === 'prev-month') {
                    calendarMonth--;
                    if (calendarMonth < 0) {
                        calendarMonth = 11;
                        calendarYear--;
                    }
                } else if (action === 'next-month') {
                    calendarMonth++;
                    if (calendarMonth > 11) {
                        calendarMonth = 0;
                        calendarYear++;
                    }
                }
                closeCalendarPopup();
                updateContent('review');
            });
        });

        // Calendar day clicks - show popup
        const calendarDays = panel.querySelectorAll('.ai-dict-calendar-day:not(.empty)');
        const scheduleMap = getReviewScheduleMap(getReviewData());
        calendarDays.forEach(dayEl => {
            dayEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const dateKey = dayEl.getAttribute('data-date');
                showCalendarPopup(dayEl, dateKey, scheduleMap);
            });
        });

        // Summary item clicks - show words panel
        const summaryItems = panel.querySelectorAll('.ai-dict-stats-summary-item[data-type]');
        const wordsPanel = panel.querySelector('#ai-dict-summary-words-panel');
        let activeType = null;

        summaryItems.forEach(item => {
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => {
                const type = item.getAttribute('data-type');

                // Toggle off if clicking same item
                if (activeType === type) {
                    wordsPanel.style.display = 'none';
                    item.classList.remove('active');
                    activeType = null;
                    return;
                }

                // Remove active from all items
                summaryItems.forEach(i => i.classList.remove('active'));

                // Show words panel
                const html = generateSummaryWordsHtml(type, getReviewData(), getWordsToReviewToday);
                wordsPanel.innerHTML = html;
                wordsPanel.style.display = 'block';
                item.classList.add('active');
                activeType = type;
            });
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
                closeCalendarPopup();
                alert('已清空所有复习数据');
                updateContent('review');
            });
        }
    };

    updateContent('today');
    document.body.appendChild(panel);
}
