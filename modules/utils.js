/**
 * AI Dictionary - Utils Module
 * Common utilities and constants
 */

// Re-export EXTENSION_NAME from constants for backward compatibility
export { EXTENSION_NAME } from './constants.js';

// Dynamically determine extension path
export const getExtensionUrl = () => {
    try {
        const url = new URL(import.meta.url);
        const pathname = url.pathname;
        // Go up one level from modules/ to extension root
        return pathname.substring(0, pathname.lastIndexOf('/modules'));
    } catch {
        return `scripts/extensions/third-party/${EXTENSION_NAME}`;
    }
};

export const EXTENSION_URL = getExtensionUrl();

// Word history limits
export const WORD_HISTORY_MAX_CONTEXTS = 10;
export const WORD_HISTORY_MAX_CONTEXT_LENGTH = 500;

/**
 * Detect mobile device
 */
export function isMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|ipad|iphone|ipod/i.test(userAgent.toLowerCase()) || window.innerWidth <= 800;
}

/**
 * Detect Android device specifically
 */
export function isAndroid() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android/i.test(userAgent.toLowerCase());
}

/**
 * Clean word - remove extra whitespace and newlines
 */
export function cleanWord(word) {
    if (typeof word !== 'string') return '';
    return word.trim().replace(/[\r\n]+/g, '');
}

/**
 * Ensure words is an array of clean strings
 */
export function ensureWordsArray(words) {
    if (!words) return [];
    let result = [];
    if (typeof words === 'string') {
        result = words.split(/[\s,]+/).map(w => cleanWord(w)).filter(w => w.length > 0);
    } else if (Array.isArray(words)) {
        for (const item of words) {
            if (typeof item === 'string') {
                result.push(...item.split(/[\s,]+/).map(w => cleanWord(w)).filter(w => w.length > 0));
            }
        }
    }
    return result;
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Check if text is a single word
 */
export function isSingleWord(text) {
    return text && !/\s/.test(text.trim());
}

/**
 * Format date to locale string
 */
export function formatDate(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString();
}

/**
 * Format date with time
 */
export function formatDateTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString();
}

/**
 * Get today's date string (YYYY-MM-DD)
 */
export function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Calculate days between two dates
 */
export function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Generate a simple unique ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
