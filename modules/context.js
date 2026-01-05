/**
 * AI Dictionary - Context Module
 * Context extraction and text marking
 */

import {
    getSelectedText,
    getSelectedContext,
    getSelectedParentElement,
    getSelectionRangeInfo
} from './selection.js';

/**
 * Mark selection in context text
 * @param {string} context
 * @param {string} selected
 * @returns {string}
 */
export function markSelectionInContext(context, selected) {
    if (!selected || !context) return context;

    const marker = `【${selected}】`;
    const selectionRangeInfo = getSelectionRangeInfo();
    const selectedParentElement = getSelectedParentElement();
    const selectedContext = getSelectedContext();

    if (selectionRangeInfo && selectedParentElement) {
        const parentText = selectedParentElement.textContent || '';
        const parentTextTrimmed = parentText.trim();
        const parentIndexInContext = context.indexOf(parentTextTrimmed);

        if (parentIndexInContext !== -1) {
            const leadingWhitespace = parentText.length - parentText.trimStart().length;
            const adjustedOffset = selectionRangeInfo.startOffset - leadingWhitespace;

            if (adjustedOffset >= 0) {
                const absolutePosition = parentIndexInContext + adjustedOffset;
                const wordAtPosition = context.substring(absolutePosition, absolutePosition + selected.length);

                if (wordAtPosition === selected) {
                    return context.substring(0, absolutePosition) + marker + context.substring(absolutePosition + selected.length);
                }
            }
        }

        const beforeTextInParagraph = parentText.substring(0, selectionRangeInfo.startOffset);
        const afterTextInParagraph = parentText.substring(selectionRangeInfo.endOffset);

        for (let windowSize = 30; windowSize >= 5; windowSize -= 5) {
            const beforePattern = beforeTextInParagraph.slice(-windowSize);
            const afterPattern = afterTextInParagraph.slice(0, windowSize);

            if (beforePattern.length === 0 && afterPattern.length === 0) continue;

            const uniquePattern = beforePattern + selected + afterPattern;
            const patternIndex = context.indexOf(uniquePattern);

            if (patternIndex !== -1) {
                const selectStart = patternIndex + beforePattern.length;
                return context.substring(0, selectStart) + marker + context.substring(selectStart + selected.length);
            }
        }
    }

    if (selectedParentElement && selectedContext) {
        const parentText = selectedParentElement.textContent || '';
        const parentTextTrimmed = parentText.trim();
        const parentIndexInContext = context.indexOf(parentTextTrimmed);

        if (parentIndexInContext !== -1) {
            const paragraphEndInContext = parentIndexInContext + parentTextTrimmed.length;
            let searchStart = parentIndexInContext;
            let foundPositions = [];

            while (searchStart < paragraphEndInContext) {
                const pos = context.indexOf(selected, searchStart);
                if (pos === -1 || pos >= paragraphEndInContext) break;
                foundPositions.push(pos);
                searchStart = pos + 1;
            }

            if (foundPositions.length >= 1) {
                return context.substring(0, foundPositions[0]) + marker + context.substring(foundPositions[0] + selected.length);
            }
        }
    }

    const index = context.indexOf(selected);
    if (index !== -1) {
        return context.substring(0, index) + marker + context.substring(index + selected.length);
    }

    return context + `\n\n[用户选中的文本: ${marker}]`;
}

/**
 * Extract context based on settings
 * @param {string} text - Full text (unused in current implementation)
 * @param {Object} settings
 * @returns {string}
 */
export function extractContext(text, settings) {
    const range = settings.contextRange;
    const selectedText = getSelectedText();
    const selectedContext = getSelectedContext();
    const selectedParentElement = getSelectedParentElement();

    let context = '';

    if (range === 'sentence') {
        const sentences = selectedContext.split(/[.!?。！？]+/);
        for (const sentence of sentences) {
            if (sentence.includes(selectedText)) {
                context = sentence.trim();
                break;
            }
        }
        if (!context) context = selectedContext;
    } else if (range === 'single') {
        context = selectedContext;
    } else if (range === 'all') {
        if (selectedParentElement && selectedParentElement.parentElement) {
            const parent = selectedParentElement.parentElement;
            const siblings = parent.querySelectorAll(':scope > p, :scope > div');
            if (siblings.length > 0) {
                context = Array.from(siblings).map(el => el.textContent.trim()).filter(t => t).join('\n\n');
            }
        }
        if (!context) context = selectedContext;
    } else {
        context = selectedContext;
    }

    return markSelectionInContext(context, selectedText);
}

/**
 * Get context for AI lookup
 * @param {Object} settings
 * @returns {string}
 */
export function getContextForLookup(settings) {
    return extractContext(document.body.innerText, settings);
}
