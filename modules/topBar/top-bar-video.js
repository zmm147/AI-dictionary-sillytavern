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
import { loadSubtitleSettings, saveSubtitleSettings, loadVideoVolume, saveVideoVolume, loadFloatingPosition, saveFloatingPosition } from './top-bar-storage.js';
import { parseVttCues, convertSrtToVtt, normalizeVtt } from './top-bar-subtitle.js';
import { formatSubtitleContent, showSubtitleError } from './top-bar-render.js';
import { updateCharacterSubtitleDisplay } from './top-bar-character.js';

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
    videoState.originalSubtitleContent = '';
    const customSubtitle = document.getElementById('ai-dict-custom-subtitle');
    if (customSubtitle) {
        customSubtitle.textContent = '';
    }

    // Update character modal subtitle display if open
    updateCharacterSubtitleDisplay();

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
    videoState.originalSubtitleContent = '';

    // Update character modal subtitle display if open
    updateCharacterSubtitleDisplay();
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

            // Store the original content before any conversion
            const originalContent = content;

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

            // Store the original content AFTER clearing (so it doesn't get cleared)
            videoState.originalSubtitleContent = originalContent;

            // Parse subtitle cues for custom rendering
            videoState.currentSubtitleCues = parseVttCues(content);
            console.log(`[AI Dictionary] Parsed ${videoState.currentSubtitleCues.length} subtitle cues`);

            // Set up timeupdate listener for custom subtitle display
            const updateHandler = () => updateCustomSubtitle(videoPlayer);
            videoPlayer._subtitleUpdateHandler = updateHandler;
            videoPlayer.addEventListener('timeupdate', updateHandler);

            // Update character modal subtitle display if open
            updateCharacterSubtitleDisplay();

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

    // Load and apply saved volume
    if (videoPlayer) {
        const savedVolume = loadVideoVolume();
        videoPlayer.volume = savedVolume;

        // Save volume when it changes
        videoPlayer.addEventListener('volumechange', () => {
            saveVideoVolume(videoPlayer.volume);
        });
    }

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
            // Reset file inputs to allow re-selecting the same file
            if (videoInput) {
                videoInput.value = '';
            }
            if (subtitleInput) {
                subtitleInput.value = '';
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
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            // Separate video and subtitle files
            const videoFile = files.find(f => f.type.startsWith('video/'));
            const subtitleFile = files.find(f => {
                const name = f.name.toLowerCase();
                return name.endsWith('.srt') || name.endsWith('.vtt');
            });

            if (!videoFile) {
                console.warn('[AI Dictionary] No video file selected');
                return;
            }

            // Save existing subtitle data before clearing
            const savedSubtitleCues = [...videoState.currentSubtitleCues];
            const savedOriginalContent = videoState.originalSubtitleContent;
            const subtitlePanel = document.getElementById('ai-dict-subtitle-panel');
            const subtitleName = document.getElementById('ai-dict-subtitle-name');
            const subtitleContent = document.getElementById('ai-dict-subtitle-content');
            const savedSubtitleName = subtitleName ? subtitleName.textContent : '';
            const savedSubtitleContent = subtitleContent ? subtitleContent.innerHTML : '';
            const savedPanelVisible = subtitlePanel ? subtitlePanel.style.display !== 'none' : false;

            const url = URL.createObjectURL(videoFile);
            videoPlayer.src = url;
            videoPlayer.load();
            videoFilename.textContent = videoFile.name;
            // Clear existing subtitles when loading new video
            clearSubtitles(videoPlayer);
            clearSubtitlePanel();

            // If subtitle file was selected, load it
            if (subtitleFile) {
                console.log(`[AI Dictionary] Auto-loading subtitle: ${subtitleFile.name}`);
                handleSubtitleFile(subtitleFile, videoPlayer);
            } else if (savedSubtitleCues.length > 0) {
                // Restore subtitle data if it existed and no new subtitle was selected
                videoState.currentSubtitleCues = savedSubtitleCues;
                videoState.originalSubtitleContent = savedOriginalContent;

                // Re-bind timeupdate listener
                const updateHandler = () => updateCustomSubtitle(videoPlayer);
                videoPlayer._subtitleUpdateHandler = updateHandler;
                videoPlayer.addEventListener('timeupdate', updateHandler);

                // Restore subtitle panel UI
                if (subtitlePanel && subtitleName && subtitleContent) {
                    subtitlePanel.style.display = savedPanelVisible ? 'block' : 'none';
                    subtitleName.textContent = savedSubtitleName;
                    subtitleContent.innerHTML = savedSubtitleContent;
                    subtitleContent.style.display = 'none'; // Keep collapsed
                }

                console.log(`[AI Dictionary] Restored ${savedSubtitleCues.length} subtitle cues after video load`);
            }

            // Clean up object URL when video is loaded or on error
            videoPlayer.onloadeddata = () => {
                console.log(`[AI Dictionary] Video loaded: ${videoFile.name}`);
            };
            videoPlayer.onerror = () => {
                console.error(`[AI Dictionary] Failed to load video: ${videoFile.name}`);
                videoFilename.textContent = '加载失败';
            };
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

    // Bind floating controls
    bindFloatingControls();
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

/**
 * Bind floating controls (play/pause and previous subtitle buttons)
 */
function bindFloatingControls() {
    const floatingControls = document.getElementById('ai-dict-floating-controls');
    const playBtn = document.getElementById('ai-dict-floating-play-btn');
    const prevBtn = document.getElementById('ai-dict-floating-prev-btn');
    const videoPlayer = document.getElementById('ai-dict-video-player');

    if (!floatingControls || !playBtn || !prevBtn || !videoPlayer) return;

    // Load and apply saved position
    const savedPosition = loadFloatingPosition();
    if (savedPosition.left !== undefined && savedPosition.top !== undefined) {
        floatingControls.style.left = savedPosition.left + 'px';
        floatingControls.style.top = savedPosition.top + 'px';
        floatingControls.style.right = 'auto';
        floatingControls.style.bottom = 'auto';
    } else if (savedPosition.right !== undefined && savedPosition.bottom !== undefined) {
        floatingControls.style.right = savedPosition.right + 'px';
        floatingControls.style.bottom = savedPosition.bottom + 'px';
    }

    // Update play button icon based on video state
    const updatePlayIcon = () => {
        const icon = playBtn.querySelector('i');
        if (icon) {
            icon.className = videoPlayer.paused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
        }
    };

    // Update icon when video state changes
    videoPlayer.addEventListener('play', updatePlayIcon);
    videoPlayer.addEventListener('pause', updatePlayIcon);

    // Play button click handler
    playBtn.addEventListener('click', (e) => {
        if (videoPlayer.paused) {
            videoPlayer.play();
        } else {
            videoPlayer.pause();
        }
        updatePlayIcon();
        e.stopPropagation();
    });

    // Previous button click handler
    prevBtn.addEventListener('click', (e) => {
        jumpToPreviousSubtitle(videoPlayer);
        e.stopPropagation();
    });

    // Dragging logic for the container
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    const onPointerDown = (e) => {
        // Only start dragging if clicking on the container background, not the buttons
        if (e.target === floatingControls) {
            isDragging = true;

            const rect = floatingControls.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            startLeft = rect.left;
            startTop = rect.top;

            floatingControls.style.cursor = 'grabbing';
            e.preventDefault();
        }
    };

    const onPointerMove = (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        const newLeft = startLeft + deltaX;
        const newTop = startTop + deltaY;

        // Get container bounds
        const container = floatingControls.parentElement;
        const containerRect = container.getBoundingClientRect();
        const controlsWidth = floatingControls.offsetWidth;
        const controlsHeight = floatingControls.offsetHeight;

        // Constrain to container bounds
        const maxLeft = containerRect.width - controlsWidth;
        const maxTop = containerRect.height - controlsHeight;

        const constrainedLeft = Math.max(0, Math.min(newLeft, maxLeft));
        const constrainedTop = Math.max(0, Math.min(newTop, maxTop));

        floatingControls.style.left = constrainedLeft + 'px';
        floatingControls.style.top = constrainedTop + 'px';
        floatingControls.style.right = 'auto';
        floatingControls.style.bottom = 'auto';
    };

    const onPointerUp = () => {
        if (isDragging) {
            isDragging = false;
            floatingControls.style.cursor = 'move';

            // Save position
            const rect = floatingControls.getBoundingClientRect();
            saveFloatingPosition({
                left: rect.left,
                top: rect.top
            });
        }
    };

    // Mouse events
    floatingControls.addEventListener('mousedown', onPointerDown);
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);

    // Touch events
    floatingControls.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        onPointerDown({
            target: e.target,
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => e.preventDefault()
        });
    });

    document.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches.length > 0) {
            const touch = e.touches[0];
            onPointerMove({ clientX: touch.clientX, clientY: touch.clientY });
        }
    });

    document.addEventListener('touchend', onPointerUp);
}

/**
 * Jump to the previous subtitle cue
 * @param {HTMLVideoElement} videoPlayer
 */
function jumpToPreviousSubtitle(videoPlayer) {
    const currentTime = videoPlayer.currentTime;
    const cues = videoState.currentSubtitleCues;

    if (!cues || cues.length === 0) {
        console.log('[AI Dictionary] No subtitles loaded');
        return;
    }

    // Find the previous cue
    let targetCue = null;

    // First, find the current cue or the one we just passed
    let currentCueIndex = -1;
    for (let i = 0; i < cues.length; i++) {
        if (currentTime >= cues[i].start && currentTime <= cues[i].end) {
            // We're in the middle of a cue
            currentCueIndex = i;
            break;
        } else if (currentTime < cues[i].start) {
            // We're before this cue, so the previous one is the last one we passed
            currentCueIndex = i - 1;
            break;
        }
    }

    // If we didn't find a current cue, we might be after all cues
    if (currentCueIndex === -1) {
        currentCueIndex = cues.length - 1;
    }

    // Get the previous cue
    if (currentCueIndex > 0) {
        targetCue = cues[currentCueIndex - 1];
    } else if (currentCueIndex === 0) {
        // Already at first cue, replay it
        targetCue = cues[0];
    }

    if (targetCue) {
        videoPlayer.currentTime = targetCue.start;
        videoPlayer.pause();
        console.log(`[AI Dictionary] Jumped to previous subtitle at ${targetCue.start}s`);
    }
}
