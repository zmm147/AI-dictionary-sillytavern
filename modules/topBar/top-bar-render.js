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

    const settingsSection = document.createElement('div');
    settingsSection.className = 'ai-dict-top-bar-section ai-dict-top-bar-settings ai-dictionary-settings';
    settingsSection.id = 'ai-dict-top-bar-settings';
    settingsSection.innerHTML = `
        <div class="ai-dict-top-bar-settings-toggle" id="ai-dict-top-bar-settings-toggle">
            <i class="fa-solid fa-chevron-right"></i>
            <span>词典设置</span>
        </div>
        <div class="ai-dict-top-bar-settings-content" id="ai-dict-top-bar-settings-content" style="display: none;">
            <div class="ai-dict-checkbox-row">
                <label for="ai-dict-direct-lookup" class="checkbox_label" title="Android: 点击单词直接查词，长按选择显示图标；此选项仅对iOS和桌面端有效">
                    <input type="checkbox" id="ai-dict-direct-lookup" name="ai-dict-direct-lookup">
                    <span>Direct Lookup <small style="color:#888">(Android无效)</small></span>
                </label>
            </div>

            <label for="ai-dict-connection-profile">Connection Profile (API预设):</label>
            <select id="ai-dict-connection-profile" class="text_pole">
                <option value="">使用当前连接</option>
            </select>

            <label for="ai-dict-playphrase-csrf">PlayPhrase CSRF Token:</label>
            <input type="text" id="ai-dict-playphrase-csrf" class="text_pole" placeholder="从浏览器开发者工具的 Network 标签中复制 x-csrf-token">

            <div class="ai-dict-prompt-label-row">
                <label for="ai-dict-system-prompt">System Prompt:</label>
                <button id="ai-dict-reset-system-prompt" class="menu_button menu_button_icon" title="重置为默认">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            </div>
            <textarea id="ai-dict-system-prompt" class="text_pole textarea_compact" rows="2" placeholder="Enter system prompt for dictionary lookups"></textarea>

            <div class="ai-dict-prompt-label-row">
                <label for="ai-dict-user-prompt">User Prompt (支持变量: %word%, %context%):</label>
                <button id="ai-dict-reset-user-prompt" class="menu_button menu_button_icon" title="重置为默认">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            </div>
            <textarea id="ai-dict-user-prompt" class="text_pole textarea_compact" rows="5" placeholder="Enter user prompt for dictionary lookups"></textarea>

            <label for="ai-dict-context-range">Context Range (上下文范围):</label>
            <select id="ai-dict-context-range" class="text_pole">
                <option value="all">全段 (所有同级标签的段落)</option>
                <option value="single">单段 (只有一段文本)</option>
                <option value="sentence">一句 (段落中的一个句子)</option>
            </select>

            <label for="ai-dict-icon-position">Icon Position:</label>
            <select id="ai-dict-icon-position" class="text_pole">
                <option value="bottom-left">Bottom Left</option>
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-right">Bottom Right</option>
            </select>

            <hr class="sysHR">

            <div class="ai-dict-checkbox-row">
                <label for="ai-dict-auto-collapse-youdao" class="checkbox_label">
                    <input type="checkbox" id="ai-dict-auto-collapse-youdao" name="ai-dict-auto-collapse-youdao">
                    <span>自动折叠有道释义</span>
                </label>
                <label for="ai-dict-auto-fetch-ai" class="checkbox_label">
                    <input type="checkbox" id="ai-dict-auto-fetch-ai" name="ai-dict-auto-fetch-ai">
                    <span>自动获取AI释义</span>
                </label>
            </div>

            <div class="ai-dict-checkbox-row">
                <label for="ai-dict-fetch-ai-on-youdao-expand" class="checkbox_label">
                    <input type="checkbox" id="ai-dict-fetch-ai-on-youdao-expand" name="ai-dict-fetch-ai-on-youdao-expand">
                    <span>折叠有道释义时自动获取AI</span>
                </label>
            </div>

            <hr class="sysHR">

            <div class="ai-dict-prompt-label-row">
                <label for="ai-dict-deep-study-prompt">深度学习提示词 (支持变量: %word%):</label>
                <button id="ai-dict-reset-deep-study-prompt" class="menu_button menu_button_icon" title="重置为默认">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            </div>
            <textarea id="ai-dict-deep-study-prompt" class="text_pole textarea_compact" rows="5" placeholder="Enter deep study prompt"></textarea>

            <hr class="sysHR">

            <div class="ai-dict-checkbox-row">
                <label for="ai-dict-highlight-confusables" class="checkbox_label">
                    <input type="checkbox" id="ai-dict-highlight-confusables" name="ai-dict-highlight-confusables">
                    <span>高亮收藏的形近词</span>
                </label>
            </div>

            <div id="ai-dict-highlight-color-container" style="display: none; margin-top: 10px;">
                <label for="ai-dict-highlight-color">高亮颜色:</label>
                <input type="color" id="ai-dict-highlight-color" class="text_pole" style="width: 60px; height: 30px; padding: 2px; cursor: pointer;">
            </div>
        </div>

        <hr class="sysHR">

        <div class="ai-dict-actions-row">
            <button id="ai-dict-stats-btn" class="menu_button" title="查看查词统计">
                <i class="fa-solid fa-chart-bar"></i>
                <span>查词统计</span>
            </button>
        </div>

        <hr class="sysHR">

        <div class="ai-dict-checkbox-row">
            <label for="ai-dict-immersive-review" class="checkbox_label">
                <input type="checkbox" id="ai-dict-immersive-review" name="ai-dict-immersive-review">
                <span>沉浸式复习</span>
            </label>
        </div>
        <div class="extension_info" style="margin-top: 5px; margin-bottom: 10px;">
            <small>
                <i class="fa-solid fa-lightbulb"></i>
                <span>当单词被查询第2次时，自动加入复习词组。每次发消息时，提示AI在回复中自然使用这些词（最多20个）。AI使用后的单词将进入艾宾浩斯记忆周期（1、2、4、7、15、30天），完成全部周期后视为掌握。</span>
            </small>
        </div>

        <div id="ai-dict-review-prompt-container" style="display: none;">
            <div class="ai-dict-prompt-label-row">
                <label for="ai-dict-review-prompt">复习提示词 (变量: %words%):</label>
                <button id="ai-dict-reset-review-prompt" class="menu_button menu_button_icon" title="重置为默认">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            </div>
            <textarea id="ai-dict-review-prompt" class="text_pole textarea_compact" rows="2" placeholder="Enter review prompt"></textarea>
        </div>

        <hr class="sysHR">

        <div class="extension_info">
            <div class="flex-container">
                <div class="flex1">
                    <small>
                        <i class="fa-solid fa-circle-info"></i>
                        <span>Select text on the page to trigger the lookup. If "Direct Lookup" is enabled, the definition will appear immediately. Otherwise, click the icon that appears next to the selection.</span>
                    </small>
                </div>
            </div>
        </div>

        <hr class="sysHR">

        <div class="ai-dict-actions-row">
            <button id="ai-dict-farm-btn" class="menu_button" title="学习累了？来种种菜吧！">
                <i class="fa-solid fa-seedling"></i>
                <span>农场游戏</span>
            </button>
        </div>

        <hr class="sysHR">

        <label>快捷功能</label>
        <div class="ai-dict-top-bar-actions">
            <button id="ai-dict-top-bar-flashcard-btn" class="menu_button" title="闪卡复习">
                <i class="fa-solid fa-clone"></i>
                <span>闪卡复习</span>
            </button>
            <button id="ai-dict-top-bar-video-btn" class="menu_button" title="视频播放">
                <i class="fa-solid fa-video"></i>
                <span>视频</span>
            </button>
        </div>
    `;
    container.appendChild(settingsSection);

    // Video player section (hidden by default, appears before clear buttons)
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
            <button id="ai-dict-create-character-btn" class="menu_button menu_button_icon" title="创建角色卡">
                <i class="fa-solid fa-user-plus"></i>
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

    // Character creation modal
    const characterModal = document.createElement('div');
    characterModal.id = 'ai-dict-character-modal';
    characterModal.className = 'ai-dict-character-modal';
    characterModal.style.display = 'none';
    characterModal.innerHTML = `
        <div class="ai-dict-character-modal-content">
            <div class="ai-dict-character-modal-header">
                <h3>创建角色卡</h3>
                <div class="ai-dict-character-modal-header-actions">
                    <button id="ai-dict-character-reset-all-btn" class="menu_button menu_button_icon" title="重置所有">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                    <button id="ai-dict-character-modal-close" class="menu_button menu_button_icon" title="关闭">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="ai-dict-character-modal-body">
                <div class="ai-dict-character-system-prompt-toggle" id="ai-dict-character-system-prompt-toggle">
                    <i class="fa-solid fa-chevron-right"></i>
                    <span>系统提示词</span>
                </div>
                <div class="ai-dict-character-form-group" id="ai-dict-character-system-prompt-group" style="display: none;">
                    <textarea id="ai-dict-character-system-prompt" class="ai-dict-system-prompt" rows="3" placeholder="输入系统提示词，AI将根据此提示词生成角色描述"></textarea>
                </div>
                <div class="ai-dict-character-subtitle-toggle" id="ai-dict-character-subtitle-toggle">
                    <i class="fa-solid fa-chevron-right"></i>
                    <span>字幕内容</span>
                    <span id="ai-dict-character-subtitle-status" class="ai-dict-character-subtitle-status"></span>
                </div>
                <div id="ai-dict-character-subtitle-content" class="ai-dict-character-subtitle-content" style="display: none;">
                    <div id="ai-dict-character-subtitle-text" class="ai-dict-character-subtitle-text"></div>
                </div>
                <div class="ai-dict-character-form-group">
                    <label for="ai-dict-character-name">
                        <span>角色名称</span>
                        <button id="ai-dict-extract-info-btn" class="ai-dict-extract-btn menu_button_icon" title="从字幕提取角色和场景">
                            <i class="fa-solid fa-wand-magic-sparkles"></i>
                        </button>
                    </label>
                    <div class="ai-dict-character-name-row">
                        <input type="text" id="ai-dict-character-name" placeholder="输入角色名称" />
                        <select id="ai-dict-character-select" class="ai-dict-info-select" style="display: none;">
                            <option value="">-- 选择角色 --</option>
                        </select>
                        <select id="ai-dict-location-select" class="ai-dict-info-select" style="display: none;">
                            <option value="">-- 选择场景 --</option>
                        </select>
                    </div>
                </div>
                <div class="ai-dict-character-form-group">
                    <label for="ai-dict-character-input" class="ai-dict-character-label">
                        <span>角色描述输入 <span class="ai-dict-variable-hint">(支持 {{字幕内容}} {{角色}} {{场景}} 变量)</span></span>
                        <div class="ai-dict-preset-controls">
                            <select id="ai-dict-preset-select" class="ai-dict-preset-select" title="选择预设模板">
                                <option value="">-- 选择预设 --</option>
                            </select>
                            <button id="ai-dict-save-preset-btn" class="ai-dict-preset-btn menu_button_icon" title="保存到当前预设">
                                <i class="fa-solid fa-save"></i>
                            </button>
                            <button id="ai-dict-save-as-preset-btn" class="ai-dict-preset-btn menu_button_icon" title="另存为新预设">
                                <i class="fa-solid fa-copy"></i>
                            </button>
                            <button id="ai-dict-delete-preset-btn" class="ai-dict-preset-btn menu_button_icon" title="删除当前预设">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                            <button id="ai-dict-reset-prompt-btn" class="ai-dict-reset-prompt-btn menu_button_icon" title="重置为默认提示词模板">
                                <i class="fa-solid fa-rotate-left"></i>
                            </button>
                        </div>
                    </label>
                    <textarea id="ai-dict-character-input" rows="6" placeholder="输入角色相关信息，AI将根据这些信息生成角色描述"></textarea>
                </div>
                <div class="ai-dict-character-form-actions">
                    <button id="ai-dict-generate-description-btn" class="menu_button">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> 生成描述
                    </button>
                </div>
                <div class="ai-dict-character-form-group">
                    <label for="ai-dict-character-output">AI生成的角色描述</label>
                    <div id="ai-dict-preset-tags-container" class="ai-dict-preset-tags-container" style="display: none;">
                        <div class="ai-dict-preset-tags-wrapper">
                            <div id="ai-dict-preset-tags" class="ai-dict-preset-tags"></div>
                            <div id="ai-dict-preset-trash" class="ai-dict-preset-trash" title="拖拽标签到此处删除">
                                <i class="fa-solid fa-trash-alt"></i>
                            </div>
                        </div>
                    </div>
                    <textarea id="ai-dict-character-output" rows="10" placeholder="AI生成的描述将显示在这里，您可以编辑"></textarea>
                </div>
                <div class="ai-dict-character-form-actions">
                    <button id="ai-dict-create-character-submit-btn" class="menu_button">
                        <i class="fa-solid fa-check"></i> 创建角色卡
                    </button>
                </div>
            </div>
        </div>
    `;
    container.appendChild(characterModal);

    // Clear buttons section (always at the bottom)
    const clearButtonsSection = document.createElement('div');
    clearButtonsSection.className = 'ai-dict-top-bar-section';
    clearButtonsSection.innerHTML = `
        <hr class="sysHR">
        <div class="ai-dict-top-bar-actions">
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
    container.appendChild(clearButtonsSection);

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
