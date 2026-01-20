/**
 * AI Dictionary - Top Bar Configuration
 * Constants and default settings for the top bar module
 */

export const TOP_BAR_ICON_ID = 'ai-dict-top-bar-icon';
export const TOP_BAR_DRAWER_ID = 'ai-dict-top-bar-drawer';
export const SUBTITLE_SETTINGS_STORAGE_KEY = 'ai-dict-video-subtitle-settings';
export const VIDEO_VOLUME_STORAGE_KEY = 'ai-dict-video-volume';
export const FLOATING_CONTROLS_POSITION_KEY = 'ai-dict-floating-controls-position';
export const SUBTITLE_CONTEXT_SIZE_KEY = 'ai-dict-subtitle-context-size';

export const DEFAULT_SUBTITLE_SETTINGS = {
    desktop: { fontSize: 14, offset: 20 },
    mobile: { fontSize: 12, offset: 20 }
};

export const DEFAULT_VIDEO_VOLUME = 1.0;

export const DEFAULT_FLOATING_POSITION = {
    bottom: 60,
    right: 20
};

export const DEFAULT_SUBTITLE_CONTEXT_SIZE = 5;

export const SUBTITLE_SIZE_LIMITS = {
    min: 10,
    max: 32,
    step: 2
};

export const SUBTITLE_OFFSET_STEP = 5;
export const MIN_SUBTITLE_OFFSET = 0;
