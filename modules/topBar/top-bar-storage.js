/**
 * AI Dictionary - Top Bar Storage
 * Subtitle settings persistence using localStorage
 */

import { EXTENSION_NAME } from '../constants.js';
import { SUBTITLE_SETTINGS_STORAGE_KEY, DEFAULT_SUBTITLE_SETTINGS, VIDEO_VOLUME_STORAGE_KEY, DEFAULT_VIDEO_VOLUME, FLOATING_CONTROLS_POSITION_KEY, DEFAULT_FLOATING_POSITION, SUBTITLE_CONTEXT_SIZE_KEY, DEFAULT_SUBTITLE_CONTEXT_SIZE } from './top-bar-config.js';

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

/**
 * Load video volume from localStorage.
 * @returns {number}
 */
export function loadVideoVolume() {
    try {
        const raw = localStorage.getItem(VIDEO_VOLUME_STORAGE_KEY);
        if (!raw) return DEFAULT_VIDEO_VOLUME;
        const volume = parseFloat(raw);
        return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : DEFAULT_VIDEO_VOLUME;
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Failed to load video volume:`, error);
        return DEFAULT_VIDEO_VOLUME;
    }
}

/**
 * Save video volume to localStorage.
 * @param {number} volume
 */
export function saveVideoVolume(volume) {
    try {
        localStorage.setItem(VIDEO_VOLUME_STORAGE_KEY, volume.toString());
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Failed to save video volume:`, error);
    }
}

/**
 * Load floating controls position from localStorage.
 * @returns {{bottom?: number, right?: number, left?: number, top?: number}}
 */
export function loadFloatingPosition() {
    try {
        const raw = localStorage.getItem(FLOATING_CONTROLS_POSITION_KEY);
        if (!raw) return { ...DEFAULT_FLOATING_POSITION };
        const position = JSON.parse(raw);
        return position || { ...DEFAULT_FLOATING_POSITION };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Failed to load floating controls position:`, error);
        return { ...DEFAULT_FLOATING_POSITION };
    }
}

/**
 * Save floating controls position to localStorage.
 * @param {{bottom?: number, right?: number, left?: number, top?: number}} position
 */
export function saveFloatingPosition(position) {
    try {
        localStorage.setItem(FLOATING_CONTROLS_POSITION_KEY, JSON.stringify(position));
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Failed to save floating controls position:`, error);
    }
}

/**
 * Load subtitle context size from localStorage.
 * @returns {number}
 */
export function loadSubtitleContextSize() {
    try {
        const raw = localStorage.getItem(SUBTITLE_CONTEXT_SIZE_KEY);
        if (!raw) return DEFAULT_SUBTITLE_CONTEXT_SIZE;
        const size = parseInt(raw, 10);
        // Validate: must be one of the allowed values
        const allowedSizes = [3, 5, 7, 9, 11, 13, 15];
        return allowedSizes.includes(size) ? size : DEFAULT_SUBTITLE_CONTEXT_SIZE;
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Failed to load subtitle context size:`, error);
        return DEFAULT_SUBTITLE_CONTEXT_SIZE;
    }
}

/**
 * Save subtitle context size to localStorage.
 * @param {number} size
 */
export function saveSubtitleContextSize(size) {
    try {
        localStorage.setItem(SUBTITLE_CONTEXT_SIZE_KEY, size.toString());
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Failed to save subtitle context size:`, error);
    }
}
