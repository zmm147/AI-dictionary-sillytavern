/**
 * AI Dictionary - Top Bar Module
 * Entry point that integrates all top bar sub-modules
 */

import { EXTENSION_NAME } from './constants.js';
import { TOP_BAR_ICON_ID, TOP_BAR_DRAWER_ID } from './topBar/top-bar-config.js';
import { drawerState, resetDrawerState } from './topBar/top-bar-state.js';
import { toggleDrawer, closeDrawer } from './topBar/top-bar-drawer.js';
import { createPanelContent } from './topBar/top-bar-render.js';
import { bindVideoEvents } from './topBar/top-bar-video.js';
import { bindAuthEvents, initAuth, setSaveSettingsCallback, updateCloudSyncUI } from './topBar/top-bar-auth.js';
import { setCloudSyncMode } from './backup.js';

/**
 * Create the top bar icon and drawer
 * @param {Object} options
 * @param {Object} options.settings - Current settings object
 * @param {Function} options.saveSettings - Function to save settings
 */
export function createTopBarIcon(options) {
    const { settings } = options;

    // Remove existing if any
    removeTopBarIcon();

    if (!settings.enableTopBar) {
        return;
    }

    const topSettingsHolder = document.getElementById('top-settings-holder');
    if (!topSettingsHolder) {
        console.warn(`[${EXTENSION_NAME}] top-settings-holder not found`);
        return;
    }

    // Create drawer container (following SillyTavern's pattern)
    const drawer = document.createElement('div');
    drawer.id = TOP_BAR_DRAWER_ID;
    drawer.className = 'drawer';

    // Create drawer toggle (icon)
    const drawerToggle = document.createElement('div');
    drawerToggle.className = 'drawer-toggle drawer-header';

    const icon = document.createElement('div');
    icon.id = TOP_BAR_ICON_ID;
    icon.className = 'drawer-icon fa-solid fa-book fa-fw closedIcon';
    icon.title = 'AI Dictionary';
    icon.setAttribute('data-i18n', '[title]AI Dictionary');

    drawerToggle.appendChild(icon);

    // Create drawer content panel (dropdown style, not fillLeft/fillRight)
    const drawerContent = document.createElement('div');
    drawerContent.className = 'drawer-content closedDrawer';
    drawerContent.id = `${TOP_BAR_DRAWER_ID}-content`;

    // Create scrollable inner container
    const scrollableInner = document.createElement('div');
    scrollableInner.className = 'scrollableInner';

    // Create panel content
    const panelContent = createPanelContent(options);
    scrollableInner.appendChild(panelContent);

    drawerContent.appendChild(scrollableInner);

    drawer.appendChild(drawerToggle);
    drawer.appendChild(drawerContent);

    // Insert at the beginning of top-settings-holder
    topSettingsHolder.insertBefore(drawer, topSettingsHolder.firstChild);

    // Bind click event for toggle
    drawerToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDrawer(icon, drawerContent);
    });

    // Close drawer when clicking outside
    document.addEventListener('click', (e) => {
        if (drawerState.isOpen && !drawer.contains(e.target)) {
            closeDrawer(icon, drawerContent);
        }
    });

    console.log(`[${EXTENSION_NAME}] Top bar icon created`);
}

/**
 * Remove the top bar icon
 */
export function removeTopBarIcon() {
    const drawer = document.getElementById(TOP_BAR_DRAWER_ID);
    if (drawer) {
        drawer.remove();
        resetDrawerState();
    }
}

/**
 * Update top bar visibility based on settings
 * @param {Object} options
 */
export function updateTopBar(options) {
    const { settings } = options;

    if (settings.enableTopBar) {
        createTopBarIcon(options);
    } else {
        removeTopBarIcon();
    }
}

/**
 * Bind top bar events
 * @param {Object} options
 * @param {Function} options.performLookup - Function to perform word lookup
 * @param {Function} options.showStatisticsPanel - Function to show statistics
 * @param {Function} options.showFarmGamePanel - Function to show farm game
 * @param {Function} options.showFlashcardPanel - Function to show flashcard (optional)
 * @param {Object} options.settings - Current settings object
 * @param {Function} options.saveSettings - Function to save settings
 */
export function bindTopBarEvents(options) {
    const { performLookup, showStatisticsPanel, showFarmGamePanel, showFlashcardPanel, settings, saveSettings } = options;

    // Lookup button
    const lookupBtn = document.getElementById('ai-dict-top-bar-lookup-btn');
    const lookupInput = document.getElementById('ai-dict-top-bar-input');

    if (lookupBtn && lookupInput) {
        const doLookup = () => {
            const word = lookupInput.value.trim();
            if (word && performLookup) {
                performLookup(word);
                lookupInput.value = '';
            }
        };

        lookupBtn.addEventListener('click', doLookup);
        lookupInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                doLookup();
            }
        });
    }

    // Stats button
    const statsBtn = document.getElementById('ai-dict-top-bar-stats-btn');
    if (statsBtn && showStatisticsPanel) {
        statsBtn.addEventListener('click', () => {
            showStatisticsPanel();
        });
    }

    // Flashcard button
    const flashcardBtn = document.getElementById('ai-dict-top-bar-flashcard-btn');
    if (flashcardBtn && showFlashcardPanel) {
        flashcardBtn.addEventListener('click', () => {
            showFlashcardPanel();
        });
    }

    // Farm button
    const farmBtn = document.getElementById('ai-dict-top-bar-farm-btn');
    if (farmBtn && showFarmGamePanel) {
        farmBtn.addEventListener('click', () => {
            showFarmGamePanel();
        });
    }

    // Video button and functionality
    bindVideoEvents();

    // Set up save settings callback for auth module
    if (saveSettings && settings) {
        setSaveSettingsCallback((key, value) => {
            settings[key] = value;
            saveSettings();

            // Update cloud sync mode in backup module
            if (key === 'cloudSyncEnabled') {
                setCloudSyncMode(value);
            }
        });

        // Set initial cloud sync mode (may already be set, but ensure it's correct)
        setCloudSyncMode(settings.cloudSyncEnabled || false);
    }

    // Auth events (login, register, sync) - pass cloudSyncEnabled setting
    bindAuthEvents();

    // Initialize auth module with current cloudSyncEnabled setting
    // Note: initAuth is idempotent, so it's safe to call multiple times
    // waitForCloudData = false here because data was already loaded
    initAuth(settings?.cloudSyncEnabled || false, false);

    // Update UI to reflect current cloudSyncEnabled setting (DOM is now ready)
    updateCloudSyncUI();
}
