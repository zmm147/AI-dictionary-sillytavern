/**
 * AI Dictionary - Statistics Module
 * Word lookup statistics and trend charts
 */

/**
 * Get time range start timestamp
 * @param {'today' | 'week' | 'month' | 'all'} range
 * @returns {number} Start timestamp
 */
export function getTimeRangeStart(range) {
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
 * @param {Object} wordHistoryData Word history data object
 * @param {'today' | 'week' | 'month' | 'all'} range
 * @returns {Array<{word: string, count: number, totalCount: number}>}
 */
export function getWordStatistics(wordHistoryData, range) {
    const startTime = getTimeRangeStart(range);
    const stats = [];

    for (const [word, data] of Object.entries(wordHistoryData)) {
        const lookups = data.lookups || [];
        const totalCount = data.count || 0;

        // If lookups array has timestamps, use them for filtering
        if (lookups.length > 0) {
            const rangeCount = lookups.filter(ts => ts >= startTime).length;
            if (rangeCount > 0) {
                stats.push({
                    word: word,
                    count: rangeCount,
                    totalCount: totalCount
                });
            }
        } else if (range === 'all' && totalCount > 0) {
            // For 'all' range, show words even if lookups array is empty
            // This handles cloud-synced data that doesn't have timestamps
            stats.push({
                word: word,
                count: totalCount,
                totalCount: totalCount
            });
        }
    }

    stats.sort((a, b) => b.count - a.count);
    return stats;
}

/**
 * Group words by lookup count
 * @param {Array<{word: string, count: number, totalCount: number}>} stats
 * @returns {Object} Grouped words
 */
export function groupWordsByCount(stats) {
    const groups = {
        'high': { label: '高频 (5次+)', words: [] },
        'medium': { label: '中频 (3-4次)', words: [] },
        'low': { label: '低频 (2次)', words: [] },
        'once': { label: '仅一次', words: [] }
    };

    for (const item of stats) {
        if (item.count >= 5) {
            groups.high.words.push(item);
        } else if (item.count >= 3) {
            groups.medium.words.push(item);
        } else if (item.count === 2) {
            groups.low.words.push(item);
        } else {
            groups.once.words.push(item);
        }
    }

    return groups;
}

/**
 * Get daily lookup counts for trend chart
 * @param {Object} wordHistoryData Word history data object
 * @param {'week' | 'month' | 'all'} range
 * @returns {Array<{date: string, count: number, displayDate: string}>}
 */
export function getDailyLookupCounts(wordHistoryData, range) {
    const now = Date.now();
    let days;

    switch (range) {
        case 'week':
            days = 7;
            break;
        case 'month':
            days = 30;
            break;
        case 'all':
            days = 90;
            break;
        default:
            days = 7;
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
 * Format date for chart display
 * @param {string} dateStr - YYYY-MM-DD format
 * @returns {string}
 */
export function formatDateForChart(dateStr) {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

/**
 * Create SVG trend chart
 * @param {Array<{date: string, count: number, displayDate: string}>} data
 * @returns {string} SVG HTML
 */
export function createTrendChart(data) {
    if (!data || data.length === 0) {
        return '<div class="ai-dict-chart-empty">暂无数据</div>';
    }

    const width = 520;
    const height = 150;
    const padding = { top: 20, right: 20, bottom: 35, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxCount = Math.max(...data.map(d => d.count), 1);
    const minCount = 0;

    const points = data.map((d, i) => ({
        x: padding.left + (i / (data.length - 1 || 1)) * chartWidth,
        y: padding.top + chartHeight - ((d.count - minCount) / (maxCount - minCount || 1)) * chartHeight,
        count: d.count,
        date: d.displayDate
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

    const yLabels = [];
    for (let i = 0; i <= 4; i++) {
        const value = Math.round(minCount + (maxCount - minCount) * (i / 4));
        const y = padding.top + chartHeight - (chartHeight * i / 4);
        yLabels.push({ value, y });
    }

    const xLabelInterval = data.length <= 7 ? 1 : data.length <= 14 ? 2 : Math.ceil(data.length / 7);
    const xLabels = points.filter((_, i) => i % xLabelInterval === 0 || i === points.length - 1);

    return `
        <svg class="ai-dict-trend-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.3" />
                    <stop offset="100%" style="stop-color:#667eea;stop-opacity:0.05" />
                </linearGradient>
            </defs>

            <!-- Grid lines -->
            ${yLabels.map(l => `
                <line x1="${padding.left}" y1="${l.y}" x2="${width - padding.right}" y2="${l.y}"
                      stroke="var(--SmartThemeBorderColor, #444)" stroke-width="0.5" stroke-dasharray="3,3" opacity="0.5"/>
            `).join('')}

            <!-- Y-axis labels -->
            ${yLabels.map(l => `
                <text x="${padding.left - 8}" y="${l.y + 4}" text-anchor="end"
                      fill="var(--SmartThemeBodyColor, #999)" font-size="10">${l.value}</text>
            `).join('')}

            <!-- X-axis labels -->
            ${xLabels.map(p => `
                <text x="${p.x}" y="${height - 8}" text-anchor="middle"
                      fill="var(--SmartThemeBodyColor, #999)" font-size="10">${p.date}</text>
            `).join('')}

            <!-- Area fill -->
            <path d="${areaPath}" fill="url(#areaGradient)" />

            <!-- Line -->
            <path d="${linePath}" fill="none" stroke="#667eea" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

            <!-- Data points -->
            ${points.map(p => `
                <circle cx="${p.x}" cy="${p.y}" r="4" fill="#667eea" stroke="#fff" stroke-width="2">
                    <title>${p.date}: ${p.count}次</title>
                </circle>
            `).join('')}

            <!-- Hover areas -->
            ${points.map(p => `
                <circle cx="${p.x}" cy="${p.y}" r="12" fill="transparent" class="ai-dict-chart-hover-area">
                    <title>${p.date}: ${p.count}次</title>
                </circle>
            `).join('')}
        </svg>
    `;
}

/**
 * Format timestamp to readable date
 * @param {number} timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
