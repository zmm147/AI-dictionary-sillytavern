/**
 * AI Dictionary - Top Bar State
 * State management for drawer and video player
 */

// Drawer state
export const drawerState = {
    isOpen: false
};

// Video player state
export const videoState = {
    currentSubtitleCues: [],
    originalParent: null,
    originalNextSibling: null
};

/**
 * Reset drawer state
 */
export function resetDrawerState() {
    drawerState.isOpen = false;
}

/**
 * Reset video state
 */
export function resetVideoState() {
    videoState.currentSubtitleCues = [];
    videoState.originalParent = null;
    videoState.originalNextSibling = null;
}
