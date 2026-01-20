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

    // Cloud sync / Auth section
    const authSection = document.createElement('div');
    authSection.className = 'ai-dict-top-bar-section ai-dict-auth-section';
    authSection.id = 'ai-dict-auth-section';
    authSection.innerHTML = `
        <!-- Cloud sync toggle -->
        <div class="ai-dict-cloud-toggle">
            <label class="ai-dict-toggle-label">
                <i class="fa-solid fa-cloud"></i> 云端同步
            </label>
            <label class="ai-dict-switch">
                <input type="checkbox" id="ai-dict-cloud-sync-toggle">
                <span class="ai-dict-slider"></span>
            </label>
        </div>
        <!-- Login form (shown when cloud sync enabled and not logged in) -->
        <div id="ai-dict-auth-form" class="ai-dict-auth-form" style="display: none;">
            <div class="ai-dict-auth-inputs">
                <input type="email" id="ai-dict-auth-email" class="text_pole" placeholder="邮箱">
                <input type="password" id="ai-dict-auth-password" class="text_pole" placeholder="密码">
            </div>
            <div class="ai-dict-auth-buttons">
                <button id="ai-dict-auth-login-btn" class="menu_button" title="登录">
                    <i class="fa-solid fa-sign-in-alt"></i>
                    <span>登录</span>
                </button>
                <button id="ai-dict-auth-register-btn" class="menu_button" title="注册">
                    <i class="fa-solid fa-user-plus"></i>
                    <span>注册</span>
                </button>
            </div>
            <div id="ai-dict-auth-error" class="ai-dict-auth-error" style="display: none;"></div>
        </div>
        <!-- User info (shown when logged in) -->
        <div id="ai-dict-user-info" class="ai-dict-user-info" style="display: none;">
            <div class="ai-dict-user-details">
                <span class="ai-dict-user-email" id="ai-dict-user-email"></span>
                <span class="ai-dict-cloud-status" id="ai-dict-cloud-status">
                    <i class="fa-solid fa-cloud-check"></i> 已连接
                </span>
            </div>
            <div class="ai-dict-sync-stats" id="ai-dict-sync-stats">
                <span>本地: <strong id="ai-dict-local-count">0</strong> 词</span>
                <span>云端: <strong id="ai-dict-cloud-count">0</strong> 词</span>
            </div>
            <div class="ai-dict-sync-buttons">
                <button id="ai-dict-sync-upload-btn" class="menu_button" title="上传本地数据到云端">
                    <i class="fa-solid fa-cloud-upload-alt"></i>
                    <span>上传</span>
                </button>
                <button id="ai-dict-sync-download-btn" class="menu_button" title="从云端下载数据">
                    <i class="fa-solid fa-cloud-download-alt"></i>
                    <span>下载</span>
                </button>
                <button id="ai-dict-auth-logout-btn" class="menu_button menu_button_icon" title="退出登录">
                    <i class="fa-solid fa-sign-out-alt"></i>
                </button>
            </div>
            <div id="ai-dict-sync-progress" class="ai-dict-sync-progress" style="display: none;">
                <div class="ai-dict-progress-bar">
                    <div class="ai-dict-progress-fill" id="ai-dict-progress-fill"></div>
                </div>
                <span id="ai-dict-progress-text">同步中...</span>
            </div>
        </div>
    `;
    container.appendChild(authSection);

    // Divider after auth
    const hrAuth = document.createElement('hr');
    hrAuth.className = 'sysHR';
    container.appendChild(hrAuth);

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
        <div class="ai-dict-top-bar-actions" style="margin-top: 8px;">
            <button id="ai-dict-clear-flashcard-btn" class="menu_button menu_button_danger" title="清空所有闪卡背单词记录">
                <i class="fa-solid fa-trash-alt"></i>
                <span>清空闪卡记录</span>
            </button>
            <button id="ai-dict-clear-word-history-btn" class="menu_button menu_button_danger" title="清空所有查词记录">
                <i class="fa-solid fa-trash-alt"></i>
                <span>清空查词记录</span>
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
            <input type="file" id="ai-dict-video-input" accept="video/*,.vtt,.srt" multiple style="display: none;">
            <input type="file" id="ai-dict-subtitle-input" accept=".vtt,.srt" style="display: none;">
            <button id="ai-dict-video-import-btn" class="menu_button menu_button_icon" title="导入本地视频（可同时选择字幕文件）">
                <i class="fa-solid fa-file-import"></i>
            </button>
            <button id="ai-dict-subtitle-import-btn" class="menu_button menu_button_icon" title="导入字幕文件 (.vtt/.srt)">
                <i class="fa-solid fa-closed-captioning"></i>
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
                <!-- Floating control buttons container (only visible in fullscreen) -->
                <div id="ai-dict-floating-controls" class="ai-dict-floating-controls">
                    <button id="ai-dict-floating-prev-btn" class="ai-dict-floating-btn" title="上一句">
                        <i class="fa-solid fa-step-backward"></i>
                    </button>
                    <button id="ai-dict-floating-play-btn" class="ai-dict-floating-btn" title="播放/暂停">
                        <i class="fa-solid fa-pause"></i>
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
