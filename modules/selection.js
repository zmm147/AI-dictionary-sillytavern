/**
 * AI Dictionary - Selection Module
 * Text selection handling for desktop and mobile
 */

import { isMobile, isAndroid, debounce } from './utils.js';
import { showIcon, hideIcon } from './panel.js';

/** @type {string} */
let selectedText = '';

/** @type {string} */
let selectedContext = '';

/** @type {HTMLElement|null} */
let selectedParentElement = null;

/** @type {{startOffset: number, endOffset: number}|null} */
let selectionRangeInfo = null;

// Mobile touch selection state
let selectionBeforeTouch = '';
let isTouchActive = false;
let touchEndTimeout = null;
let lastProcessedSelection = '';

/**
 * Get current selected text
 * @returns {string}
 */
export function getSelectedText() {
    return selectedText;
}

/**
 * Set selected text
 * @param {string} text
 */
export function setSelectedText(text) {
    selectedText = text;
}

/**
 * Get current selected context
 * @returns {string}
 */
export function getSelectedContext() {
    return selectedContext;
}

/**
 * Set selected context
 * @param {string} context
 */
export function setSelectedContext(context) {
    selectedContext = context;
}

/**
 * Get selected parent element
 * @returns {HTMLElement|null}
 */
export function getSelectedParentElement() {
    return selectedParentElement;
}

/**
 * Get selection range info
 * @returns {{startOffset: number, endOffset: number}|null}
 */
export function getSelectionRangeInfo() {
    return selectionRangeInfo;
}

/**
 * Set selection range info
 * @param {{startOffset: number, endOffset: number}|null} info
 */
export function setSelectionRangeInfo(info) {
    selectionRangeInfo = info;
}

/**
 * Handle touch start event
 * @param {TouchEvent} event
 * @param {Object} settings
 */
export function handleTouchStart(event, settings) {
    if (!settings.enabled) return;
    if (!isMobile()) return;

    if (event.target.closest('#ai-dictionary-icon') ||
        event.target.closest('#ai-dictionary-panel') ||
        event.target.closest('#ai-dictionary-panel-toggle')) {
        return;
    }

    if (touchEndTimeout) {
        clearTimeout(touchEndTimeout);
        touchEndTimeout = null;
    }

    isTouchActive = true;
    selectionBeforeTouch = window.getSelection().toString().trim();
    hideIcon();
}

/**
 * Handle touch end event
 * @param {TouchEvent} event
 * @param {Object} settings
 * @param {Function} onSelectionProcessed - Callback when selection is processed
 */
export function handleTouchEnd(event, settings, onSelectionProcessed) {
    if (!settings.enabled) return;
    if (!isMobile()) return;

    if (event.target.closest('#ai-dictionary-icon') ||
        event.target.closest('#ai-dictionary-panel') ||
        event.target.closest('#ai-dictionary-panel-toggle')) {
        return;
    }

    isTouchActive = false;

    if (touchEndTimeout) {
        clearTimeout(touchEndTimeout);
    }

    const delay = isAndroid() ? 300 : 50;

    touchEndTimeout = setTimeout(() => {
        processSelectionAfterTouch(settings, onSelectionProcessed);
    }, delay);
}

/**
 * Handle touch cancel event
 */
export function handleTouchCancel() {
    isTouchActive = false;
    if (touchEndTimeout) {
        clearTimeout(touchEndTimeout);
        touchEndTimeout = null;
    }
}

/**
 * Process selection after touch event
 * @param {Object} settings
 * @param {Function} onSelectionProcessed - Callback when selection is processed
 */
export function processSelectionAfterTouch(settings, onSelectionProcessed) {
    const selected = window.getSelection();
    const selectionString = selected.toString().trim();

    if (isTouchActive) return;

    if (selectionString.length > 0 &&
        selectionString !== selectionBeforeTouch &&
        selectionString !== lastProcessedSelection) {

        lastProcessedSelection = selectionString;
        selectedText = selectionString;

        let element = selected.anchorNode?.parentElement;
        while (element && element.tagName !== 'P' && element.tagName !== 'DIV') {
            element = element.parentElement;
        }
        selectedContext = element ? element.textContent : selectionString;
        selectedParentElement = element;

        selectionRangeInfo = null;
        try {
            const range = selected.getRangeAt(0);
            if (element && range.startContainer) {
                const preSelectionRange = document.createRange();
                preSelectionRange.selectNodeContents(element);
                preSelectionRange.setEnd(range.startContainer, range.startOffset);
                const startOffset = preSelectionRange.toString().length;

                selectionRangeInfo = {
                    startOffset: startOffset,
                    endOffset: startOffset + selectionString.length
                };
            }
        } catch (e) {
            selectionRangeInfo = null;
        }

        if (settings.enableDirectLookup) {
            if (onSelectionProcessed) onSelectionProcessed();
        } else {
            showIconAtSelection(selected, settings, onSelectionProcessed);
        }
    } else if (selectionString.length === 0) {
        hideIcon();
        selectionRangeInfo = null;
        lastProcessedSelection = '';
    }
}

/**
 * Show icon at selection position
 * @param {Selection} selected
 * @param {Object} settings
 * @param {Function} onIconClick - Callback when icon is clicked
 */
export function showIconAtSelection(selected, settings, onIconClick) {
    try {
        const range = selected.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const position = settings.iconPosition || 'top-right';
        let x, y;
        const offset = 35;
        const gap = 5;

        switch (position) {
            case 'top-left':
                x = rect.left - offset;
                y = rect.top - offset;
                break;
            case 'bottom-left':
                x = rect.left - offset;
                y = rect.bottom + gap;
                break;
            case 'bottom-right':
                x = rect.right + gap;
                y = rect.bottom + gap;
                break;
            case 'top-right':
            default:
                x = rect.right + gap;
                y = rect.top - offset;
                break;
        }

        const iconSize = 30;
        x = Math.max(5, Math.min(x, window.innerWidth - iconSize - 5));
        y = Math.max(5, Math.min(y, window.innerHeight - iconSize - 5));

        showIcon(x, y, onIconClick);
    } catch (e) {
        console.warn('AI Dictionary: Could not calculate selection position', e);
    }
}

/**
 * Handle text selection event (desktop)
 * @param {Event} event
 * @param {Object} settings
 * @param {Function} onSelectionProcessed - Callback when selection is processed
 */
export function handleTextSelection(event, settings, onSelectionProcessed) {
    if (!settings.enabled) return;

    if (event && event.target && event.target.closest) {
        if (event.target.closest('#ai-dictionary-icon') ||
            event.target.closest('#ai-dictionary-panel') ||
            event.target.closest('#ai-dictionary-panel-toggle')) {
            return;
        }
    }

    const selected = window.getSelection();
    const selectionString = selected.toString().trim();

    if (selectionString.length > 0) {
        selectedText = selectionString;

        let element = selected.anchorNode.parentElement;
        while (element && element.tagName !== 'P' && element.tagName !== 'DIV') {
            element = element.parentElement;
        }
        selectedContext = element ? element.textContent : selectionString;
        selectedParentElement = element;

        selectionRangeInfo = null;
        try {
            const range = selected.getRangeAt(0);
            if (element && range.startContainer) {
                const preSelectionRange = document.createRange();
                preSelectionRange.selectNodeContents(element);
                preSelectionRange.setEnd(range.startContainer, range.startOffset);
                const startOffset = preSelectionRange.toString().length;

                selectionRangeInfo = {
                    startOffset: startOffset,
                    endOffset: startOffset + selectionString.length
                };
            }
        } catch (e) {
            selectionRangeInfo = null;
        }

        if (settings.enableDirectLookup) {
            if (onSelectionProcessed) onSelectionProcessed();
        } else {
            showIconAtSelection(selected, settings, onSelectionProcessed);
        }
    } else {
        hideIcon();
        selectionRangeInfo = null;
    }
}

/**
 * Handle context menu event
 * @param {Event} event
 * @param {Object} settings
 */
export function handleContextMenu(event, settings) {
    if (!settings.enabled) return;

    const selected = window.getSelection().toString().trim();
    if (!selected) return;

    selectedText = selected;
    let element = event.target;
    while (element && element.tagName !== 'P' && element.tagName !== 'DIV') {
        element = element.parentElement;
    }
    selectedContext = element ? element.textContent : selected;
    selectedParentElement = element;
}

/**
 * Create debounced selection change handler
 * @param {Object} settings
 * @param {Function} onSelectionProcessed
 * @returns {Function}
 */
export function createSelectionChangeHandler(settings, onSelectionProcessed) {
    return debounce((e) => {
        if (!isMobile()) {
            handleTextSelection(e, settings, onSelectionProcessed);
        } else if (isAndroid() && !isTouchActive) {
            if (touchEndTimeout) {
                clearTimeout(touchEndTimeout);
            }
            touchEndTimeout = setTimeout(() => {
                processSelectionAfterTouch(settings, onSelectionProcessed);
            }, 200);
        }
    }, 300);
}

/**
 * Clear selection after lookup
 */
export function clearSelectionAfterLookup() {
    const savedRangeInfo = selectionRangeInfo;
    const savedParent = selectedParentElement;

    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }

    // Restore saved info
    selectionRangeInfo = savedRangeInfo;
    selectedParentElement = savedParent;
}

/**
 * Check if touch is active
 * @returns {boolean}
 */
export function isTouchSelectionActive() {
    return isTouchActive;
}
