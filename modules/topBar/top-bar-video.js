/**
 * AI Dictionary - Top Bar Video
 * Video player logic and subtitle display
 */

import { isMobile } from '../utils.js';
import {
    DEFAULT_SUBTITLE_SETTINGS,
    SUBTITLE_SIZE_LIMITS,
    SUBTITLE_OFFSET_STEP,
    MIN_SUBTITLE_OFFSET
} from './top-bar-config.js';
import { videoState } from './top-bar-state.js';
import { loadSubtitleSettings, saveSubtitleSettings } from './top-bar-storage.js';
import { parseVttCues, convertSrtToVtt, normalizeVtt } from './top-bar-subtitle.js';
import { formatSubtitleContent, showSubtitleError } from './top-bar-render.js';

/**
 * Clear all subtitle tracks from video
 * @param {HTMLVideoElement} videoPlayer
 */
export function clearSubtitles(videoPlayer) {
    // Remove native tracks (legacy cleanup)
    const tracks = videoPlayer.querySelectorAll('track');
    tracks.forEach(track => track.remove());

    // Clear custom subtitle data and display
    videoState.currentSubtitleCues = [];
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

/**
 * Clear subtitle panel UI
 */
export function clearSubtitlePanel() {
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
    videoState.currentSubtitleCues = [];
}

/**
 * Update custom subtitle display based on current video time
 * @param {HTMLVideoElement} videoPlayer
 */
export function updateCustomSubtitle(videoPlayer) {
    const customSubtitle = document.getElementById('ai-dict-custom-subtitle');
    if (!customSubtitle) return;

    const currentTime = videoPlayer.currentTime;
    let activeText = '';

    // Find active cue
    for (const cue of videoState.currentSubtitleCues) {
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
export function handleSubtitleFile(file, videoPlayer) {
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
            videoState.currentSubtitleCues = parseVttCues(content);
            console.log(`[AI Dictionary] Parsed ${videoState.currentSubtitleCues.length} subtitle cues`);

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
 * Bind video player events
 */
export function bindVideoEvents() {
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

    // Bind fullscreen events
    bindFullscreenEvents();

    // Bind subtitle control events
    bindSubtitleControlEvents();
}

/**
 * Bind fullscreen toggle events
 */
function bindFullscreenEvents() {
    const fullscreenBtn = document.getElementById('ai-dict-fullscreen-btn');
    const videoWrapper = document.getElementById('ai-dict-video-wrapper');

    if (!fullscreenBtn || !videoWrapper) return;

    fullscreenBtn.addEventListener('click', () => {
        const isFullscreen = videoWrapper.classList.contains('pseudo-fullscreen');
        if (isFullscreen) {
            exitPseudoFullscreen(videoWrapper, fullscreenBtn);
        } else {
            enterPseudoFullscreen(videoWrapper, fullscreenBtn);
        }
    });

    // ESC key to exit pseudo-fullscreen
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && videoWrapper.classList.contains('pseudo-fullscreen')) {
            exitPseudoFullscreen(videoWrapper, fullscreenBtn);
        }
    });
}

/**
 * Enter pseudo-fullscreen mode
 * @param {HTMLElement} videoWrapper
 * @param {HTMLElement} fullscreenBtn
 */
function enterPseudoFullscreen(videoWrapper, fullscreenBtn) {
    videoState.originalParent = videoWrapper.parentNode;
    videoState.originalNextSibling = videoWrapper.nextSibling;

    document.body.appendChild(videoWrapper);
    videoWrapper.classList.add('pseudo-fullscreen');
    fullscreenBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
    fullscreenBtn.title = '退出全屏';
    document.body.style.overflow = 'hidden';
}

/**
 * Exit pseudo-fullscreen mode
 * @param {HTMLElement} videoWrapper
 * @param {HTMLElement} fullscreenBtn
 */
function exitPseudoFullscreen(videoWrapper, fullscreenBtn) {
    videoWrapper.classList.remove('pseudo-fullscreen');
    fullscreenBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
    fullscreenBtn.title = '全屏';
    document.body.style.overflow = '';

    // Move back to original parent
    if (videoState.originalParent) {
        if (videoState.originalNextSibling) {
            videoState.originalParent.insertBefore(videoWrapper, videoState.originalNextSibling);
        } else {
            videoState.originalParent.appendChild(videoWrapper);
        }
    }
}

/**
 * Bind subtitle size and position control events
 */
function bindSubtitleControlEvents() {
    const customSubtitle = document.getElementById('ai-dict-custom-subtitle');
    const smallerBtn = document.getElementById('ai-dict-subtitle-smaller-btn');
    const largerBtn = document.getElementById('ai-dict-subtitle-larger-btn');
    const subtitleUpBtn = document.getElementById('ai-dict-subtitle-up-btn');
    const subtitleDownBtn = document.getElementById('ai-dict-subtitle-down-btn');
    const resetBtn = document.getElementById('ai-dict-subtitle-reset-btn');

    if (!customSubtitle) return;

    // Load settings
    const isMobileDevice = isMobile();
    const deviceKey = isMobileDevice ? 'mobile' : 'desktop';
    const allSubtitleSettings = loadSubtitleSettings();
    let currentFontSize = allSubtitleSettings[deviceKey].fontSize;
    let subtitleOffset = allSubtitleSettings[deviceKey].offset;

    const applySubtitleOffset = () => {
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

    // Apply initial settings
    customSubtitle.style.fontSize = currentFontSize + 'px';
    applySubtitleOffset();

    // Subtitle size controls
    if (smallerBtn) {
        smallerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentFontSize > SUBTITLE_SIZE_LIMITS.min) {
                currentFontSize -= SUBTITLE_SIZE_LIMITS.step;
                customSubtitle.style.fontSize = currentFontSize + 'px';
                persistSubtitleSettings();
            }
        });
    }

    if (largerBtn) {
        largerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentFontSize < SUBTITLE_SIZE_LIMITS.max) {
                currentFontSize += SUBTITLE_SIZE_LIMITS.step;
                customSubtitle.style.fontSize = currentFontSize + 'px';
                persistSubtitleSettings();
            }
        });
    }

    if (subtitleUpBtn) {
        subtitleUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            subtitleOffset += SUBTITLE_OFFSET_STEP;
            applySubtitleOffset();
            persistSubtitleSettings();
        });
    }

    if (subtitleDownBtn) {
        subtitleDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            subtitleOffset = Math.max(MIN_SUBTITLE_OFFSET, subtitleOffset - SUBTITLE_OFFSET_STEP);
            applySubtitleOffset();
            persistSubtitleSettings();
        });
    }

    // Reset subtitle position and size
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const defaults = DEFAULT_SUBTITLE_SETTINGS[deviceKey];
            currentFontSize = defaults.fontSize;
            subtitleOffset = defaults.offset;
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
}
