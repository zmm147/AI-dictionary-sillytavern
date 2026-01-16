/**
 * AI Dictionary - Top Bar Storage
 * Subtitle settings persistence using localStorage
 */

import { EXTENSION_NAME } from '../constants.js';
import { SUBTITLE_SETTINGS_STORAGE_KEY, DEFAULT_SUBTITLE_SETTINGS } from './top-bar-config.js';

/**
 * @typedef {Object} SubtitleSettings
 * @property {number} fontSize
 * @property {number} offset
 */

/**
 * Load subtitle settings with defaults.
 * @param {{desktop: SubtitleSettings, mobile: SubtitleSettings}} [defaults]
 * @returns {{desktop: SubtitleSettings, mobile: SubtitleSettings}}
 */
export function loadSubtitleSettings(defaults = DEFAULT_SUBTITLE_SETTINGS) {
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
export function saveSubtitleSettings(settings) {
    try {
        localStorage.setItem(SUBTITLE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Failed to save subtitle settings:`, error);
    }
}
