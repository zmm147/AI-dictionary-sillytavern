/**
 * AI Dictionary - Top Bar Module
 * Adds an icon to SillyTavern's top settings holder
 */

import { EXTENSION_NAME } from './constants.js';
import { isMobile } from './utils.js';
import { escapeHtml } from './utils.js';

const TOP_BAR_ICON_ID = 'ai-dict-top-bar-icon';
const TOP_BAR_DRAWER_ID = 'ai-dict-top-bar-drawer';
const SUBTITLE_SETTINGS_STORAGE_KEY = 'ai-dict-video-subtitle-settings';

let isDrawerOpen = false;

/**
 * @typedef {Object} SubtitleSettings
 * @property {number} fontSize
 * @property {number} offset
 */

/**
 * Load subtitle settings with defaults.
 * @param {{desktop: SubtitleSettings, mobile: SubtitleSettings}} defaults
 * @returns {{desktop: SubtitleSettings, mobile: SubtitleSettings}}
 */
function loadSubtitleSettings(defaults) {
    try {
        const raw = localStorage.getItem(SUBTITLE_SETTINGS_STORAGE_KEY);
        if (!raw) return { ...defaults };
        const parsed = JSON.parse(raw);
        return {
            desktop: {
                fontSize: Number.isFinite(parsed?.desktop?.fontSize) ? parsed.desktop.fontSize : defaults.desktop.fontSize,
                offset: Number.isFinite(parsed?.desktop?.offset) ? parsed.desktop.offset : defaults.desktop.offset
            },
            mobile: {
                fontSize: Number.isFinite(parsed?.mobile?.fontSize) ? parsed.mobile.fontSize : defaults.mobile.fontSize,
                offset: Number.isFinite(parsed?.mobile?.offset) ? parsed.mobile.offset : defaults.mobile.offset
            }
        };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Failed to load subtitle settings:`, error);
        return { ...defaults };
    }
}

/**
 * Save subtitle settings.
 * @param {{desktop: SubtitleSettings, mobile: SubtitleSettings}} settings
 */
function saveSubtitleSettings(settings) {
    try {
        localStorage.setItem(SUBTITLE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Failed to save subtitle settings:`, error);
    }
}

/**
 * Create the top bar icon and drawer
 * @param {Object} options
 * @param {Object} options.settings - Current settings object
 * @param {Function} options.saveSettings - Function to save settings
 */
export function createTopBarIcon(options) {
    const { settings } = options;

    // Remove existing if any
    removeTopBarIcon();

    if (!settings.enableTopBar) {
        return;
    }

    const topSettingsHolder = document.getElementById('top-settings-holder');
    if (!topSettingsHolder) {
        console.warn(`[${EXTENSION_NAME}] top-settings-holder not found`);
        return;
    }

    // Create drawer container (following SillyTavern's pattern)
    const drawer = document.createElement('div');
    drawer.id = TOP_BAR_DRAWER_ID;
    drawer.className = 'drawer';

    // Create drawer toggle (icon)
    const drawerToggle = document.createElement('div');
    drawerToggle.className = 'drawer-toggle drawer-header';

    const icon = document.createElement('div');
    icon.id = TOP_BAR_ICON_ID;
    icon.className = 'drawer-icon fa-solid fa-book fa-fw closedIcon';
    icon.title = 'AI Dictionary';
    icon.setAttribute('data-i18n', '[title]AI Dictionary');

    drawerToggle.appendChild(icon);

    // Create drawer content panel (dropdown style, not fillLeft/fillRight)
    const drawerContent = document.createElement('div');
    drawerContent.className = 'drawer-content closedDrawer';
    drawerContent.id = `${TOP_BAR_DRAWER_ID}-content`;

    // Create scrollable inner container
    const scrollableInner = document.createElement('div');
    scrollableInner.className = 'scrollableInner';

    // Create panel content
    const panelContent = createPanelContent(options);
    scrollableInner.appendChild(panelContent);

    drawerContent.appendChild(scrollableInner);

    drawer.appendChild(drawerToggle);
    drawer.appendChild(drawerContent);

    // Insert at the beginning of top-settings-holder
    topSettingsHolder.insertBefore(drawer, topSettingsHolder.firstChild);

    // Bind click event for toggle
    drawerToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDrawer(icon, drawerContent);
    });

    // Close drawer when clicking outside
    document.addEventListener('click', (e) => {
        if (isDrawerOpen && !drawer.contains(e.target)) {
            closeDrawer(icon, drawerContent);
        }
    });

    console.log(`[${EXTENSION_NAME}] Top bar icon created`);
}

/**
 * Create the panel content for the drawer
 * @param {Object} options
 * @returns {HTMLElement}
 */
function createPanelContent(options) {
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
 * Toggle the drawer open/closed
 * @param {HTMLElement} icon
 * @param {HTMLElement} content
 */
function toggleDrawer(icon, content) {
    if (isDrawerOpen) {
        closeDrawer(icon, content);
    } else {
        openDrawer(icon, content);
    }
}

/**
 * Open the drawer
 * @param {HTMLElement} icon
 * @param {HTMLElement} content
 */
function openDrawer(icon, content) {
    // Close other open drawers first (SillyTavern behavior)
    document.querySelectorAll('#top-settings-holder .drawer-content.openDrawer').forEach(el => {
        if (el.id !== `${TOP_BAR_DRAWER_ID}-content`) {
            el.classList.remove('openDrawer');
            el.classList.add('closedDrawer');
            const parentDrawer = el.closest('.drawer');
            if (parentDrawer) {
                const otherIcon = parentDrawer.querySelector('.drawer-icon');
                if (otherIcon) {
                    otherIcon.classList.remove('openIcon');
                    otherIcon.classList.add('closedIcon');
                }
            }
        }
    });

    isDrawerOpen = true;
    icon.classList.remove('closedIcon');
    icon.classList.add('openIcon');
    content.classList.remove('closedDrawer');
    content.classList.add('openDrawer');
}

/**
 * Close the drawer
 * @param {HTMLElement} icon
 * @param {HTMLElement} content
 */
function closeDrawer(icon, content) {
    isDrawerOpen = false;
    icon.classList.remove('openIcon');
    icon.classList.add('closedIcon');
    content.classList.remove('openDrawer');
    content.classList.add('closedDrawer');
}

/**
 * Remove the top bar icon
 */
export function removeTopBarIcon() {
    const drawer = document.getElementById(TOP_BAR_DRAWER_ID);
    if (drawer) {
        drawer.remove();
        isDrawerOpen = false;
    }
}

/**
 * Update top bar visibility based on settings
 * @param {Object} options
 */
export function updateTopBar(options) {
    const { settings } = options;

    if (settings.enableTopBar) {
        createTopBarIcon(options);
    } else {
        removeTopBarIcon();
    }
}

/**
 * Bind top bar events
 * @param {Object} options
 * @param {Function} options.performLookup - Function to perform word lookup
 * @param {Function} options.showStatisticsPanel - Function to show statistics
 * @param {Function} options.showFarmGamePanel - Function to show farm game
 * @param {Function} options.showFlashcardPanel - Function to show flashcard (optional)
 */
export function bindTopBarEvents(options) {
    const { performLookup, showStatisticsPanel, showFarmGamePanel, showFlashcardPanel } = options;

    // Lookup button
    const lookupBtn = document.getElementById('ai-dict-top-bar-lookup-btn');
    const lookupInput = document.getElementById('ai-dict-top-bar-input');

    if (lookupBtn && lookupInput) {
        const doLookup = () => {
            const word = lookupInput.value.trim();
            if (word && performLookup) {
                performLookup(word);
                lookupInput.value = '';
            }
        };

        lookupBtn.addEventListener('click', doLookup);
        lookupInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                doLookup();
            }
        });
    }

    // Stats button
    const statsBtn = document.getElementById('ai-dict-top-bar-stats-btn');
    if (statsBtn && showStatisticsPanel) {
        statsBtn.addEventListener('click', () => {
            showStatisticsPanel();
        });
    }

    // Flashcard button
    const flashcardBtn = document.getElementById('ai-dict-top-bar-flashcard-btn');
    if (flashcardBtn && showFlashcardPanel) {
        flashcardBtn.addEventListener('click', () => {
            showFlashcardPanel();
        });
    }

    // Farm button
    const farmBtn = document.getElementById('ai-dict-top-bar-farm-btn');
    if (farmBtn && showFarmGamePanel) {
        farmBtn.addEventListener('click', () => {
            showFarmGamePanel();
        });
    }

    // Video button and functionality
    bindVideoEvents();
}

/**
 * Bind video player events
 */
function bindVideoEvents() {
    const videoBtn = document.getElementById('ai-dict-top-bar-video-btn');
    const videoSection = document.getElementById('ai-dict-video-section');
    const videoInput = document.getElementById('ai-dict-video-input');
    const videoImportBtn = document.getElementById('ai-dict-video-import-btn');
    const videoCloseBtn = document.getElementById('ai-dict-video-close-btn');
    const videoPlayer = document.getElementById('ai-dict-video-player');
    const videoFilename = document.getElementById('ai-dict-video-filename');
    const subtitleInput = document.getElementById('ai-dict-subtitle-input');
    const subtitleImportBtn = document.getElementById('ai-dict-subtitle-import-btn');

    if (!videoBtn || !videoSection) return;

    // Toggle video section visibility
    videoBtn.addEventListener('click', () => {
        const isVisible = videoSection.style.display !== 'none';
        videoSection.style.display = isVisible ? 'none' : 'flex';
    });

    // Close video section
    if (videoCloseBtn) {
        videoCloseBtn.addEventListener('click', () => {
            videoSection.style.display = 'none';
            // Stop and clear video when closing
            if (videoPlayer) {
                videoPlayer.pause();
                videoPlayer.src = '';
                videoPlayer.load();
            }
            if (videoFilename) {
                videoFilename.textContent = '';
            }
            // Clear subtitle panel
            clearSubtitlePanel();
        });
    }

    // Import video button click
    if (videoImportBtn && videoInput) {
        videoImportBtn.addEventListener('click', () => {
            videoInput.click();
        });
    }

    // Handle video file selection
    if (videoInput && videoPlayer && videoFilename) {
        videoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                videoPlayer.src = url;
                videoPlayer.load();
                videoFilename.textContent = file.name;
                // Clear existing subtitles when loading new video
                clearSubtitles(videoPlayer);
                clearSubtitlePanel();

                // Clean up object URL when video is loaded or on error
                videoPlayer.onloadeddata = () => {
                    console.log(`[AI Dictionary] Video loaded: ${file.name}`);
                };
                videoPlayer.onerror = () => {
                    console.error(`[AI Dictionary] Failed to load video: ${file.name}`);
                    videoFilename.textContent = '加载失败';
                };
            }
        });
    }

    // Subtitle import button click
    if (subtitleImportBtn && subtitleInput) {
        subtitleImportBtn.addEventListener('click', () => {
            subtitleInput.click();
        });
    }

    // Handle subtitle file selection
    if (subtitleInput && videoPlayer) {
        subtitleInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleSubtitleFile(file, videoPlayer);
            }
        });
    }

    // Subtitle toggle click event
    const subtitleToggle = document.getElementById('ai-dict-subtitle-toggle');
    const subtitleContent = document.getElementById('ai-dict-subtitle-content');
    if (subtitleToggle && subtitleContent) {
        subtitleToggle.addEventListener('click', () => {
            const isExpanded = subtitleContent.style.display !== 'none';
            subtitleContent.style.display = isExpanded ? 'none' : 'block';
            const icon = subtitleToggle.querySelector('i');
            if (icon) {
                icon.className = isExpanded ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
            }
        });
    }

    // Pseudo-fullscreen toggle
    const fullscreenBtn = document.getElementById('ai-dict-fullscreen-btn');
    const videoWrapper = document.getElementById('ai-dict-video-wrapper');
    let originalParent = null;
    let originalNextSibling = null;

    if (fullscreenBtn && videoWrapper) {
        fullscreenBtn.addEventListener('click', () => {
            const isFullscreen = videoWrapper.classList.contains('pseudo-fullscreen');
            if (isFullscreen) {
                // Exit pseudo-fullscreen - move back to original position
                videoWrapper.classList.remove('pseudo-fullscreen');
                fullscreenBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
                fullscreenBtn.title = '全屏';
                document.body.style.overflow = '';

                // Move back to original parent
                if (originalParent) {
                    if (originalNextSibling) {
                        originalParent.insertBefore(videoWrapper, originalNextSibling);
                    } else {
                        originalParent.appendChild(videoWrapper);
                    }
                }
            } else {
                // Enter pseudo-fullscreen - move to body for highest z-index
                originalParent = videoWrapper.parentNode;
                originalNextSibling = videoWrapper.nextSibling;

                document.body.appendChild(videoWrapper);
                videoWrapper.classList.add('pseudo-fullscreen');
                fullscreenBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
                fullscreenBtn.title = '退出全屏';
                document.body.style.overflow = 'hidden';
            }
        });

        // ESC key to exit pseudo-fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && videoWrapper.classList.contains('pseudo-fullscreen')) {
                videoWrapper.classList.remove('pseudo-fullscreen');
                fullscreenBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
                fullscreenBtn.title = '全屏';
                document.body.style.overflow = '';

                // Move back to original parent
                if (originalParent) {
                    if (originalNextSibling) {
                        originalParent.insertBefore(videoWrapper, originalNextSibling);
                    } else {
                        originalParent.appendChild(videoWrapper);
                    }
                }
            }
        });
    }

    // Subtitle size and position controls
    const customSubtitle = document.getElementById('ai-dict-custom-subtitle');
    const smallerBtn = document.getElementById('ai-dict-subtitle-smaller-btn');
    const largerBtn = document.getElementById('ai-dict-subtitle-larger-btn');
    const subtitleUpBtn = document.getElementById('ai-dict-subtitle-up-btn');
    const subtitleDownBtn = document.getElementById('ai-dict-subtitle-down-btn');
    const resetBtn = document.getElementById('ai-dict-subtitle-reset-btn');

    // Default subtitle settings
    const defaultSubtitleOffset = 20;
    const subtitleDefaults = {
        desktop: { fontSize: 14, offset: defaultSubtitleOffset },
        mobile: { fontSize: 12, offset: defaultSubtitleOffset }
    };
    const isMobileDevice = isMobile();
    const deviceKey = isMobileDevice ? 'mobile' : 'desktop';
    const defaultFontSize = subtitleDefaults[deviceKey].fontSize;
    const allSubtitleSettings = loadSubtitleSettings(subtitleDefaults);
    let currentFontSize = allSubtitleSettings[deviceKey].fontSize;
    let subtitleOffset = allSubtitleSettings[deviceKey].offset;
    const minFontSize = 10;
    const maxFontSize = 32;
    const minSubtitleOffset = 0;

    const applySubtitleOffset = () => {
        if (!customSubtitle) return;
        customSubtitle.style.bottom = '';
        customSubtitle.style.top = '';
        customSubtitle.style.setProperty('--ai-dict-subtitle-offset', `${subtitleOffset}px`);
    };

    const persistSubtitleSettings = () => {
        allSubtitleSettings[deviceKey] = {
            fontSize: currentFontSize,
            offset: subtitleOffset
        };
        saveSubtitleSettings(allSubtitleSettings);
    };

    if (customSubtitle) {
        customSubtitle.style.fontSize = currentFontSize + 'px';
        applySubtitleOffset();
    }

    // Subtitle size controls
    if (smallerBtn && customSubtitle) {
        smallerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentFontSize > minFontSize) {
                currentFontSize -= 2;
                customSubtitle.style.fontSize = currentFontSize + 'px';
                persistSubtitleSettings();
            }
        });
    }

    if (largerBtn && customSubtitle) {
        largerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentFontSize < maxFontSize) {
                currentFontSize += 2;
                customSubtitle.style.fontSize = currentFontSize + 'px';
                persistSubtitleSettings();
            }
        });
    }

    if (subtitleUpBtn && customSubtitle) {
        subtitleUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            subtitleOffset += 5;
            applySubtitleOffset();
            persistSubtitleSettings();
        });
    }

    if (subtitleDownBtn && customSubtitle) {
        subtitleDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            subtitleOffset = Math.max(minSubtitleOffset, subtitleOffset - 5);
            applySubtitleOffset();
            persistSubtitleSettings();
        });
    }

    // Reset subtitle position and size
    if (resetBtn && customSubtitle) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentFontSize = defaultFontSize;
            subtitleOffset = defaultSubtitleOffset;
            customSubtitle.style.fontSize = currentFontSize + 'px';
            applySubtitleOffset();
            persistSubtitleSettings();
            // Reset all inline styles to restore CSS defaults
            customSubtitle.style.left = '';
            customSubtitle.style.top = '';
            customSubtitle.style.bottom = '';
            customSubtitle.style.transform = '';
            customSubtitle.style.right = '';
        });
    }

    // Subtitle dragging removed; keep subtitle fixed at video bottom.
}

/**
 * Clear all subtitle tracks from video
 * @param {HTMLVideoElement} videoPlayer
 */
function clearSubtitles(videoPlayer) {
    // Remove native tracks (legacy cleanup)
    const tracks = videoPlayer.querySelectorAll('track');
    tracks.forEach(track => track.remove());

    // Clear custom subtitle data and display
    currentSubtitleCues = [];
    const customSubtitle = document.getElementById('ai-dict-custom-subtitle');
    if (customSubtitle) {
        customSubtitle.textContent = '';
    }

    // Remove timeupdate listener if exists
    if (videoPlayer._subtitleUpdateHandler) {
        videoPlayer.removeEventListener('timeupdate', videoPlayer._subtitleUpdateHandler);
        videoPlayer._subtitleUpdateHandler = null;
    }
}

// Store parsed subtitle cues globally for the module
let currentSubtitleCues = [];

/**
 * Clear subtitle panel UI
 */
function clearSubtitlePanel() {
    const subtitlePanel = document.getElementById('ai-dict-subtitle-panel');
    const subtitleContent = document.getElementById('ai-dict-subtitle-content');
    const subtitleName = document.getElementById('ai-dict-subtitle-name');
    const subtitleError = document.getElementById('ai-dict-subtitle-error');
    const customSubtitle = document.getElementById('ai-dict-custom-subtitle');

    if (subtitlePanel) subtitlePanel.style.display = 'none';
    if (subtitleContent) {
        subtitleContent.innerHTML = '';
        subtitleContent.style.display = 'none';
    }
    if (subtitleName) subtitleName.textContent = '';
    if (subtitleError) {
        subtitleError.style.display = 'none';
        subtitleError.textContent = '';
    }
    if (customSubtitle) {
        customSubtitle.textContent = '';
    }
    currentSubtitleCues = [];
}

/**
 * Normalize subtitle text for display.
 * Converts WebVTT <br> tags into actual line breaks.
 * @param {string} text
 * @returns {string}
 */
function normalizeSubtitleText(text) {
    if (!text) return '';
    return text.replace(/<br\s*\/?>/gi, '\n');
}

/**
 * Parse VTT content into cues array
 * @param {string} vttContent
 * @returns {Array<{start: number, end: number, text: string}>}
 */
function parseVttCues(vttContent) {
    const cues = [];
    const lines = vttContent.split('\n');
    let i = 0;

    // Skip WEBVTT header
    while (i < lines.length && !lines[i].includes('-->')) {
        i++;
    }

    while (i < lines.length) {
        const line = lines[i].trim();

        // Look for timestamp line
        if (line.includes('-->')) {
            const [startStr, endStr] = line.split('-->').map(s => s.trim());
            const start = parseTimestamp(startStr);
            const end = parseTimestamp(endStr);

            // Collect text lines until empty line or next timestamp
            const textLines = [];
            i++;
            while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
                const textLine = normalizeSubtitleText(lines[i].trim());
                // Skip numeric cue identifiers
                if (!/^\d+$/.test(textLine)) {
                    textLines.push(textLine);
                }
                i++;
            }

            if (textLines.length > 0 && !isNaN(start) && !isNaN(end)) {
                cues.push({
                    start,
                    end,
                    text: textLines.join('\n')
                });
            }
        } else {
            i++;
        }
    }

    return cues;
}

/**
 * Parse VTT timestamp to seconds
 * @param {string} timestamp - Format: HH:MM:SS.mmm or MM:SS.mmm
 * @returns {number}
 */
function parseTimestamp(timestamp) {
    const parts = timestamp.split(':');
    let seconds = 0;

    if (parts.length === 3) {
        // HH:MM:SS.mmm
        seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
        // MM:SS.mmm
        seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }

    return seconds;
}

/**
 * Update custom subtitle display based on current video time
 * @param {HTMLVideoElement} videoPlayer
 */
function updateCustomSubtitle(videoPlayer) {
    const customSubtitle = document.getElementById('ai-dict-custom-subtitle');
    if (!customSubtitle) return;

    const currentTime = videoPlayer.currentTime;
    let activeText = '';

    // Find active cue
    for (const cue of currentSubtitleCues) {
        if (currentTime >= cue.start && currentTime <= cue.end) {
            activeText = cue.text;
            break;
        }
    }

    // Only update if changed
    if (customSubtitle.textContent !== activeText) {
        customSubtitle.textContent = activeText;
    }
}

/**
 * Handle subtitle file upload
 * @param {File} file
 * @param {HTMLVideoElement} videoPlayer
 */
function handleSubtitleFile(file, videoPlayer) {
    const subtitleError = document.getElementById('ai-dict-subtitle-error');
    const subtitlePanel = document.getElementById('ai-dict-subtitle-panel');
    const subtitleName = document.getElementById('ai-dict-subtitle-name');
    const subtitleContent = document.getElementById('ai-dict-subtitle-content');

    // Hide previous error
    if (subtitleError) {
        subtitleError.style.display = 'none';
        subtitleError.textContent = '';
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let content = e.target.result;
            const isSrt = file.name.toLowerCase().endsWith('.srt');

            // Convert SRT to VTT if needed, or normalize VTT
            if (isSrt) {
                content = convertSrtToVtt(content);
            } else {
                // Ensure VTT has proper header
                if (!content.trim().startsWith('WEBVTT')) {
                    throw new Error('无效的 VTT 文件格式');
                }
                // Normalize VTT: fix line endings and ensure proper format
                content = normalizeVtt(content);
            }

            // Clear existing subtitles
            clearSubtitles(videoPlayer);

            // Parse subtitle cues for custom rendering
            currentSubtitleCues = parseVttCues(content);
            console.log(`[AI Dictionary] Parsed ${currentSubtitleCues.length} subtitle cues`);

            // Set up timeupdate listener for custom subtitle display
            const updateHandler = () => updateCustomSubtitle(videoPlayer);
            videoPlayer._subtitleUpdateHandler = updateHandler;
            videoPlayer.addEventListener('timeupdate', updateHandler);

            // Show subtitle panel with content
            if (subtitlePanel && subtitleName && subtitleContent) {
                subtitlePanel.style.display = 'block';
                subtitleName.textContent = `(${file.name})`;
                subtitleContent.innerHTML = formatSubtitleContent(content);
                // Keep collapsed by default
                subtitleContent.style.display = 'none';
                const toggle = document.getElementById('ai-dict-subtitle-toggle');
                if (toggle) {
                    const icon = toggle.querySelector('i');
                    if (icon) {
                        icon.className = 'fa-solid fa-chevron-right';
                    }
                }
            }

            console.log(`[AI Dictionary] Custom subtitle loaded: ${file.name}`);

        } catch (err) {
            showSubtitleError(`字幕解析失败: ${err.message}`);
            console.error(`[AI Dictionary] Subtitle parse error:`, err);
        }
    };

    reader.onerror = () => {
        showSubtitleError(`无法读取字幕文件: ${file.name}`);
        console.error(`[AI Dictionary] Failed to read subtitle file: ${file.name}`);
    };

    reader.readAsText(file);
}

/**
 * Show subtitle error message
 * @param {string} message
 */
function showSubtitleError(message) {
    const subtitleError = document.getElementById('ai-dict-subtitle-error');
    if (subtitleError) {
        subtitleError.textContent = message;
        subtitleError.style.display = 'block';
    }
}

/**
 * Format subtitle content for display
 * @param {string} vttContent
 * @returns {string}
 */
function formatSubtitleContent(vttContent) {
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
 * Convert SRT format to VTT format
 * @param {string} srtContent
 * @returns {string}
 */
function convertSrtToVtt(srtContent) {
    // Add VTT header
    let vttContent = 'WEBVTT\n\n';

    // Replace SRT timestamp format (00:00:00,000) with VTT format (00:00:00.000)
    const converted = srtContent
        .replace(/\r\n/g, '\n')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

    vttContent += converted;
    return vttContent;
}

/**
 * Normalize VTT content to ensure proper format
 * @param {string} vttContent
 * @returns {string}
 */
function normalizeVtt(vttContent) {
    // Remove BOM (Byte Order Mark) if present - this is often the cause of VTT loading issues
    let normalized = vttContent.replace(/^\uFEFF/, '');

    // Normalize line endings (Windows CRLF to LF)
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Trim whitespace
    normalized = normalized.trim();

    // Rebuild with clean WEBVTT header (same approach as SRT conversion)
    if (normalized.startsWith('WEBVTT')) {
        // Find where the header line ends
        const headerMatch = normalized.match(/^WEBVTT[^\n]*/);
        const headerLine = headerMatch ? headerMatch[0] : 'WEBVTT';
        const afterHeader = normalized.substring(headerLine.length).trim();

        // Rebuild with proper format: WEBVTT + blank line + content
        normalized = 'WEBVTT\n\n' + afterHeader;
    }

    return normalized;
}
