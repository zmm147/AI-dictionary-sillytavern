/**
 * AI Dictionary - Panel Module
 * Side panel UI management
 */

import { isMobile } from './utils.js';
import { escapeHtml } from './statistics.js';

/** @type {HTMLElement|null} */
let panelElement = null;

/** @type {HTMLElement|null} */
let toggleElement = null;

/** @type {HTMLElement|null} */
let iconElement = null;

/** @type {boolean} */
let isPanelPinned = false;

/**
 * Get the panel element
 * @returns {HTMLElement|null}
 */
export function getPanelElement() {
    return panelElement;
}

/**
 * Get the toggle element
 * @returns {HTMLElement|null}
 */
export function getToggleElement() {
    return toggleElement;
}

/**
 * Check if panel is pinned
 * @returns {boolean}
 */
export function isPinned() {
    return isPanelPinned;
}

/**
 * Create the side panel
 * @param {Object} options
 * @param {Object} options.settings - Settings object
 * @param {Function} options.saveSettings - Save settings function
 */
export function createSidePanel(options) {
    const { settings, saveSettings } = options;
    const isMobileMode = isMobile();

    // 1. Panel Container
    const panel = document.createElement('div');
    panel.id = 'ai-dictionary-panel';

    if (isMobileMode) {
        panel.className = 'ai-dict-mobile-panel';
        document.body.classList.add('ai-dict-mobile-active');
    } else {
        panel.className = 'ai-dict-desktop-popup';
        panel.style.display = 'none';
    }

    // Header
    const header = document.createElement('div');
    header.className = 'ai-dict-panel-header';

    const titleEl = document.createElement('h3');
    titleEl.textContent = 'AI Dictionary';
    header.appendChild(titleEl);

    // Action buttons container for desktop
    if (!isMobileMode) {
        const headerActions = document.createElement('div');
        headerActions.className = 'ai-dict-header-actions';

        // Pin button
        const pinBtn = document.createElement('button');
        pinBtn.className = 'ai-dict-pin-btn';
        pinBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i>';
        pinBtn.title = '固定面板';
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isPanelPinned = !isPanelPinned;
            pinBtn.classList.toggle('active', isPanelPinned);
            panel.classList.toggle('pinned', isPanelPinned);
            pinBtn.title = isPanelPinned ? '取消固定' : '固定面板';
        });
        headerActions.appendChild(pinBtn);

        header.appendChild(headerActions);

        // Desktop drag functionality
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let panelStartLeft = 0;
        let panelStartTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = panel.getBoundingClientRect();
            panelStartLeft = rect.left;
            panelStartTop = rect.top;

            panel.style.transform = 'none';
            panel.style.left = panelStartLeft + 'px';
            panel.style.top = panelStartTop + 'px';

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            const newLeft = Math.max(0, Math.min(panelStartLeft + deltaX, window.innerWidth - panel.offsetWidth));
            const newTop = Math.max(0, Math.min(panelStartTop + deltaY, window.innerHeight - panel.offsetHeight));

            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    panel.appendChild(header);

    // Content
    const contentEl = document.createElement('div');
    contentEl.className = 'ai-dict-panel-content';
    panel.appendChild(contentEl);

    // Prevent clicks inside panel from closing it
    panel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.body.appendChild(panel);
    panelElement = panel;

    // 2. Mobile Specific Buttons
    if (isMobileMode) {
        // A. Toggle Button
        const toggle = document.createElement('div');
        toggle.id = 'ai-dictionary-panel-toggle';
        toggle.innerHTML = '<i class="fa-solid fa-book-open"></i>';
        toggle.title = 'Expand AI Dictionary';

        toggle.style.position = 'fixed';
        toggle.style.pointerEvents = 'auto';
        toggle.style.zIndex = '99997'; // 低于农场面板(99998)和悬浮宠物(99999)

        if (settings.mobileTogglePosition) {
            toggle.style.left = settings.mobileTogglePosition.left;
            toggle.style.top = settings.mobileTogglePosition.top;
        } else {
            const toggleWidth = 40;
            const toggleHeight = 60;
            const defaultLeft = window.innerWidth - toggleWidth;
            const defaultTop = window.innerHeight / 2 - toggleHeight / 2;
            toggle.style.left = defaultLeft + 'px';
            toggle.style.top = defaultTop + 'px';
        }

        // Touch/drag state for repositioning
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragStartLeft = 0;
        let dragStartTop = 0;

        toggle.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            dragStartLeft = parseInt(toggle.style.left) || 0;
            dragStartTop = parseInt(toggle.style.top) || 0;
            isDragging = false;
        });

        toggle.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            const deltaX = touch.clientX - dragStartX;
            const deltaY = touch.clientY - dragStartY;

            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                isDragging = true;
                e.preventDefault();

                const newLeft = Math.max(0, Math.min(dragStartLeft + deltaX, window.innerWidth - 40));
                const newTop = Math.max(0, Math.min(dragStartTop + deltaY, window.innerHeight - 60));

                toggle.style.left = newLeft + 'px';
                toggle.style.top = newTop + 'px';
            }
        });

        toggle.addEventListener('touchend', (e) => {
            if (isDragging) {
                settings.mobileTogglePosition = {
                    left: toggle.style.left,
                    top: toggle.style.top
                };
                saveSettings();
                isDragging = false;
            } else {
                e.preventDefault();
                e.stopPropagation();
                expandPanel();
            }
        });

        toggle.addEventListener('click', (e) => {
            if (!isDragging) {
                e.preventDefault();
                e.stopPropagation();
                expandPanel();
            }
        });

        document.body.appendChild(toggle);
        toggleElement = toggle;

        // B. Collapse Button
        const collapseBtn = document.createElement('div');
        collapseBtn.id = 'ai-dictionary-panel-collapse-btn';
        collapseBtn.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
        collapseBtn.title = 'Collapse';

        collapseBtn.style.position = 'absolute';
        collapseBtn.style.top = '50%';
        collapseBtn.style.left = '-30px';
        collapseBtn.style.transform = 'translateY(-50%)';
        collapseBtn.style.bottom = 'auto';
        collapseBtn.style.pointerEvents = 'auto';
        collapseBtn.style.zIndex = '200002';

        const collapseAction = (e) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            collapsePanel();
        };
        collapseBtn.addEventListener('click', collapseAction);
        collapseBtn.addEventListener('touchstart', collapseAction, { passive: false });

        panel.appendChild(collapseBtn);
    }
}

/**
 * Show the panel with text content
 * @param {string} title
 * @param {string} content
 * @param {string} type
 */
export function showPanel(title, content, type = 'info') {
    if (!panelElement) return;

    const panel = panelElement;

    panel.classList.remove('ai-dict-loading', 'ai-dict-error', 'ai-dict-success', 'ai-dict-info');
    panel.classList.add(`ai-dict-${type}`);

    if (!isMobile()) {
        panel.style.display = 'flex';
    }

    const titleEl = panel.querySelector('.ai-dict-panel-header h3');
    if (titleEl) titleEl.textContent = title;

    const contentEl = panel.querySelector('.ai-dict-panel-content');
    if (contentEl) contentEl.textContent = content;
}

/**
 * Show the panel with HTML content
 * @param {string} title
 * @param {string} htmlContent
 * @param {string} type
 * @param {Object} options
 * @param {Function} options.getWordHistory - Function to get word history
 * @param {Function} options.isWordInReview - Function to check if word is in review
 * @param {Function} options.toggleWordInReview - Function to toggle word in review
 * @param {boolean} options.immersiveReviewEnabled - Whether immersive review is enabled
 * @param {Function} options.playAudio - Function to play audio
 * @param {boolean} options.fetchAIOnYoudaoExpand - Whether to fetch AI on Youdao expand
 * @param {Function} options.triggerAIFetchIfEmpty - Function to trigger AI fetch
 * @param {Function} options.loadPlayphraseVideos - Function to load PlayPhrase videos
 */
export function showPanelHtml(title, htmlContent, type = 'info', options = {}) {
    if (!panelElement) return;

    const panel = panelElement;

    panel.classList.remove('ai-dict-loading', 'ai-dict-error', 'ai-dict-success', 'ai-dict-info');
    panel.classList.add(`ai-dict-${type}`);

    if (!isMobile()) {
        panel.style.display = 'flex';
    }

    const titleEl = panel.querySelector('.ai-dict-panel-header h3');
    if (titleEl) {
        const wordLower = title.toLowerCase().trim();
        const history = options.getWordHistory?.(wordLower);
        const lookupCount = history ? history.count : 0;
        const isInReview = options.isWordInReview?.(wordLower) || false;

        let titleHtml = `<span class="ai-dict-title-word">${escapeHtml(title)}</span>`;
        titleHtml += `<span class="ai-dict-title-count" title="查词次数">${lookupCount}次</span>`;

        if (options.immersiveReviewEnabled) {
            const reviewIcon = isInReview ? 'fa-solid fa-book-bookmark' : 'fa-regular fa-bookmark';
            const reviewTitle = isInReview ? '已加入沉浸式复习，点击移除' : '点击加入沉浸式复习';
            const reviewClass = isInReview ? 'ai-dict-review-icon active' : 'ai-dict-review-icon';
            titleHtml += `<button class="${reviewClass}" title="${reviewTitle}" data-word="${escapeHtml(wordLower)}"><i class="${reviewIcon}"></i></button>`;
        }

        titleEl.innerHTML = titleHtml;

        // Bind review icon click event
        const reviewIconBtn = titleEl.querySelector('.ai-dict-review-icon');
        if (reviewIconBtn && options.toggleWordInReview) {
            reviewIconBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const word = reviewIconBtn.getAttribute('data-word');
                options.toggleWordInReview(word);
                const isNowInReview = options.isWordInReview?.(word) || false;
                reviewIconBtn.className = isNowInReview ? 'ai-dict-review-icon active' : 'ai-dict-review-icon';
                reviewIconBtn.title = isNowInReview ? '已加入沉浸式复习，点击移除' : '点击加入沉浸式复习';
                reviewIconBtn.innerHTML = isNowInReview ? '<i class="fa-solid fa-book-bookmark"></i>' : '<i class="fa-regular fa-bookmark"></i>';
            });
        }
    }

    const contentEl = panel.querySelector('.ai-dict-panel-content');
    if (contentEl) {
        contentEl.innerHTML = htmlContent;

        // Add event listeners to audio buttons
        const audioButtons = contentEl.querySelectorAll('.odh-playaudio');
        audioButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const audioUrl = btn.getAttribute('data-audio-url');
                if (audioUrl && options.playAudio) {
                    options.playAudio(audioUrl);
                }
            });
        });

        // Add event listeners to collapsible headers
        const collapsibleHeaders = contentEl.querySelectorAll('.ai-dict-collapsible-header');
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
                        if (icon) {
                            icon.classList.toggle('expanded');
                        }

                        if (wasExpanded && options.fetchAIOnYoudaoExpand && targetId.startsWith('youdao-definitions-')) {
                            options.triggerAIFetchIfEmpty?.();
                        }

                        if (!wasExpanded && targetId.startsWith('playphrase-videos-')) {
                            options.loadPlayphraseVideos?.();
                        }
                    }
                }
            });
        });
    }
}

/**
 * Expand the panel (mobile)
 */
export function expandPanel() {
    if (!panelElement) return;

    void panelElement.offsetWidth;
    panelElement.classList.add('expanded');
}

/**
 * Collapse the panel (mobile)
 */
export function collapsePanel() {
    if (panelElement) {
        panelElement.classList.remove('expanded');
        void panelElement.offsetWidth;
    }
}

/**
 * Hide the panel (desktop)
 */
export function hidePanel() {
    if (panelElement && !isMobile()) {
        panelElement.style.display = 'none';
    }
}

/**
 * Create the dictionary icon
 * @param {number} x
 * @param {number} y
 * @param {Function} onClick
 * @returns {HTMLElement}
 */
function createIcon(x, y, onClick) {
    const icon = document.createElement('div');
    icon.id = 'ai-dictionary-icon';
    icon.innerHTML = '<i class="fa-solid fa-book"></i>';
    icon.style.left = `${x}px`;
    icon.style.top = `${y}px`;

    icon.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
    });

    icon.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
    });

    return icon;
}

/**
 * Show the dictionary icon
 * @param {number} x
 * @param {number} y
 * @param {Function} onClick
 */
export function showIcon(x, y, onClick) {
    hideIcon();
    const icon = createIcon(x, y, onClick);
    document.body.appendChild(icon);
    iconElement = icon;
}

/**
 * Hide the dictionary icon
 */
export function hideIcon() {
    if (iconElement) {
        iconElement.remove();
        iconElement = null;
    }
}

/**
 * Play audio from URL
 * @param {string} audioUrl
 */
export function playAudio(audioUrl) {
    try {
        const audio = new Audio(audioUrl);
        audio.play().catch(err => {
            console.warn('Failed to play audio:', err.message);
        });
    } catch (error) {
        console.error('Audio playback error:', error.message);
    }
}

/**
 * Handle global click for auto-collapse/close
 * @param {Event} event
 */
export function handleGlobalClick(event) {
    if (!panelElement) return;

    const target = event.target;

    const clickedInsideIcon = target.closest('#ai-dictionary-icon');
    const clickedInsideStatsPanel = target.closest('#ai-dict-stats-panel');

    if (clickedInsideIcon || clickedInsideStatsPanel) return;

    if (isMobile()) {
        if (panelElement.classList.contains('expanded')) {
            const clickedInsideToggle = toggleElement && (toggleElement.contains(target) || target.closest('#ai-dictionary-panel-toggle'));
            if (!clickedInsideToggle) {
                collapsePanel();
            }
        }
    } else {
        if (panelElement.style.display !== 'none' && !isPanelPinned) {
            panelElement.style.display = 'none';
        }
    }
}
