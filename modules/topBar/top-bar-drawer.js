/**
 * AI Dictionary - Top Bar Drawer
 * Drawer open/close logic
 */

import { TOP_BAR_DRAWER_ID } from './top-bar-config.js';
import { drawerState } from './top-bar-state.js';

/**
 * Toggle the drawer open/closed
 * @param {HTMLElement} icon
 * @param {HTMLElement} content
 */
export function toggleDrawer(icon, content) {
    if (drawerState.isOpen) {
        closeDrawer(icon, content);
    } else {
        openDrawer(icon, content);
    }
}

/**
 * Open the drawer
 * @param {HTMLElement} icon
 * @param {HTMLElement} content
 */
export function openDrawer(icon, content) {
    // Close other open drawers first (SillyTavern behavior)
    document.querySelectorAll('#top-settings-holder .drawer-content.openDrawer').forEach(el => {
        if (el.id !== `${TOP_BAR_DRAWER_ID}-content`) {
            el.classList.remove('openDrawer');
            el.classList.add('closedDrawer');
            const parentDrawer = el.closest('.drawer');
            if (parentDrawer) {
                const otherIcon = parentDrawer.querySelector('.drawer-icon');
                if (otherIcon) {
                    otherIcon.classList.remove('openIcon');
                    otherIcon.classList.add('closedIcon');
                }
            }
        }
    });

    drawerState.isOpen = true;
    icon.classList.remove('closedIcon');
    icon.classList.add('openIcon');
    content.classList.remove('closedDrawer');
    content.classList.add('openDrawer');
}

/**
 * Close the drawer
 * @param {HTMLElement} icon
 * @param {HTMLElement} content
 */
export function closeDrawer(icon, content) {
    drawerState.isOpen = false;
    icon.classList.remove('openIcon');
    icon.classList.add('closedIcon');
    content.classList.remove('openDrawer');
    content.classList.add('closedDrawer');
}
