/**
 * AI Dictionary - Top Bar Render
 * HTML content generation for the top bar panel
 */

import { escapeHtml } from '../utils.js';
import { normalizeSubtitleText } from './top-bar-subtitle.js';

/**
 * Create the panel content for the drawer
 * @param {Object} options
 * @returns {HTMLElement}
 */
export function createPanelContent(options) {
    const container = document.createElement('div');
    container.className = 'ai-dict-top-bar-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'ai-dict-top-bar-header';
    header.innerHTML = `
        <h3><i class="fa-solid fa-book"></i> AI Dictionary</h3>
    `;
    container.appendChild(header);

    // Quick lookup input
    const lookupSection = document.createElement('div');
    lookupSection.className = 'ai-dict-top-bar-section';
    lookupSection.innerHTML = `
        <label>快速查词</label>
        <div class="ai-dict-top-bar-lookup">
            <input type="text" id="ai-dict-top-bar-input" class="text_pole" placeholder="输入单词查询...">
            <button id="ai-dict-top-bar-lookup-btn" class="menu_button menu_button_icon" title="查询">
                <i class="fa-solid fa-search"></i>
            </button>
        </div>
    `;
    container.appendChild(lookupSection);

    // Divider
    const hr1 = document.createElement('hr');
    hr1.className = 'sysHR';
    container.appendChild(hr1);

    // Quick actions
    const actionsSection = document.createElement('div');
    actionsSection.className = 'ai-dict-top-bar-section';
    actionsSection.innerHTML = `
        <label>快捷功能</label>
        <div class="ai-dict-top-bar-actions">
            <button id="ai-dict-top-bar-stats-btn" class="menu_button" title="查词统计">
                <i class="fa-solid fa-chart-bar"></i>
                <span>查词统计</span>
            </button>
            <button id="ai-dict-top-bar-flashcard-btn" class="menu_button" title="闪卡复习">
                <i class="fa-solid fa-clone"></i>
                <span>闪卡复习</span>
            </button>
            <button id="ai-dict-top-bar-farm-btn" class="menu_button" title="农场游戏">
                <i class="fa-solid fa-seedling"></i>
                <span>农场游戏</span>
            </button>
            <button id="ai-dict-top-bar-video-btn" class="menu_button" title="视频播放">
                <i class="fa-solid fa-video"></i>
                <span>视频</span>
            </button>
        </div>
    `;
    container.appendChild(actionsSection);

    // Divider before video section
    const hr3 = document.createElement('hr');
    hr3.className = 'sysHR';
    container.appendChild(hr3);

    // Video player section (hidden by default)
    const videoSection = document.createElement('div');
    videoSection.className = 'ai-dict-top-bar-section ai-dict-video-section';
    videoSection.id = 'ai-dict-video-section';
    videoSection.style.display = 'none';
    videoSection.innerHTML = `
        <div class="ai-dict-video-header">
            <label><i class="fa-solid fa-video"></i> 视频播放器</label>
            <button id="ai-dict-video-close-btn" class="menu_button menu_button_icon" title="关闭视频">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        <div class="ai-dict-video-import">
            <input type="file" id="ai-dict-video-input" accept="video/*" style="display: none;">
            <input type="file" id="ai-dict-subtitle-input" accept=".vtt,.srt" style="display: none;">
            <button id="ai-dict-video-import-btn" class="menu_button" title="导入本地视频">
                <i class="fa-solid fa-file-import"></i>
                <span>导入视频</span>
            </button>
            <button id="ai-dict-subtitle-import-btn" class="menu_button" title="导入字幕文件 (.vtt/.srt)">
                <i class="fa-solid fa-closed-captioning"></i>
                <span>字幕</span>
            </button>
            <span id="ai-dict-video-filename" class="ai-dict-video-filename"></span>
        </div>
        <div id="ai-dict-subtitle-error" class="ai-dict-subtitle-error" style="display: none;"></div>
        <div class="ai-dict-video-wrapper" id="ai-dict-video-wrapper">
            <div class="ai-dict-video-container">
                <video id="ai-dict-video-player" controls playsinline webkit-playsinline>
                    您的浏览器不支持视频播放
                </video>
                <div id="ai-dict-custom-subtitle" class="ai-dict-custom-subtitle"></div>
                <div class="ai-dict-video-controls">
                    <button id="ai-dict-subtitle-smaller-btn" class="ai-dict-control-btn" title="字幕缩小">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                    <button id="ai-dict-subtitle-larger-btn" class="ai-dict-control-btn" title="字幕放大">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                    <button id="ai-dict-subtitle-up-btn" class="ai-dict-control-btn" title="字幕上移">
                        <i class="fa-solid fa-arrow-up"></i>
                    </button>
                    <button id="ai-dict-subtitle-down-btn" class="ai-dict-control-btn" title="字幕下移">
                        <i class="fa-solid fa-arrow-down"></i>
                    </button>
                    <button id="ai-dict-subtitle-reset-btn" class="ai-dict-control-btn" title="重置字幕位置">
                        <i class="fa-solid fa-undo"></i>
                    </button>
                    <button id="ai-dict-fullscreen-btn" class="ai-dict-fullscreen-btn" title="全屏">
                        <i class="fa-solid fa-expand"></i>
                    </button>
                </div>
            </div>
        </div>
        <div id="ai-dict-subtitle-panel" class="ai-dict-subtitle-panel" style="display: none;">
            <div class="ai-dict-subtitle-toggle" id="ai-dict-subtitle-toggle">
                <i class="fa-solid fa-chevron-right"></i>
                <span>字幕内容</span>
                <span id="ai-dict-subtitle-name" class="ai-dict-subtitle-name"></span>
            </div>
            <div class="ai-dict-subtitle-content" id="ai-dict-subtitle-content" style="display: none;"></div>
        </div>
    `;
    container.appendChild(videoSection);

    // Divider
    const hr2 = document.createElement('hr');
    hr2.className = 'sysHR';
    container.appendChild(hr2);

    // Info/tip section
    const infoSection = document.createElement('div');
    infoSection.className = 'ai-dict-top-bar-section ai-dict-top-bar-info';
    infoSection.innerHTML = `
        <div class="ai-dict-top-bar-tip">
            <i class="fa-solid fa-lightbulb"></i>
            <span>选中文本即可快速查词</span>
        </div>
    `;
    container.appendChild(infoSection);

    return container;
}

/**
 * Format subtitle content for display in subtitle panel
 * @param {string} vttContent
 * @returns {string}
 */
export function formatSubtitleContent(vttContent) {
    const lines = vttContent.split('\n');
    let html = '';
    let currentTime = '';
    let currentText = [];

    for (const line of lines) {
        const trimmed = line.trim();
        // Skip WEBVTT header and empty lines
        if (trimmed === 'WEBVTT' || trimmed === '') {
            if (currentText.length > 0) {
                const formattedText = escapeHtml(currentText.join('\n')).replace(/\n/g, '<br>');
                html += `<div class="ai-dict-subtitle-line">
                    <span class="ai-dict-subtitle-time">${currentTime}</span>
                    <span class="ai-dict-subtitle-text">${formattedText}</span>
                </div>`;
                currentText = [];
            }
            continue;
        }
        // Check for timestamp line
        if (trimmed.includes('-->')) {
            currentTime = trimmed.split('-->')[0].trim();
            continue;
        }
        // Skip numeric cue identifiers
        if (/^\d+$/.test(trimmed)) {
            continue;
        }
        // Collect text lines
        currentText.push(normalizeSubtitleText(trimmed));
    }

    // Add last entry
    if (currentText.length > 0) {
        const formattedText = escapeHtml(currentText.join('\n')).replace(/\n/g, '<br>');
        html += `<div class="ai-dict-subtitle-line">
            <span class="ai-dict-subtitle-time">${currentTime}</span>
            <span class="ai-dict-subtitle-text">${formattedText}</span>
        </div>`;
    }

    return html || '<div class="ai-dict-subtitle-empty">字幕内容为空</div>';
}

/**
 * Show subtitle error message
 * @param {string} message
 */
export function showSubtitleError(message) {
    const subtitleError = document.getElementById('ai-dict-subtitle-error');
    if (subtitleError) {
        subtitleError.textContent = message;
        subtitleError.style.display = 'block';
    }
}
