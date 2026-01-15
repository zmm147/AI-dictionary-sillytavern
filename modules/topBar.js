/**
 * AI Dictionary - Top Bar Module
 * Adds an icon to SillyTavern's top settings holder
 */

import { EXTENSION_NAME } from './constants.js';

const TOP_BAR_ICON_ID = 'ai-dict-top-bar-icon';
const TOP_BAR_DRAWER_ID = 'ai-dict-top-bar-drawer';

let isDrawerOpen = false;

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
        if (isDrawerOpen && !drawer.contains(e.target)) {
            closeDrawer(icon, drawerContent);
        }
    });

    console.log(`[${EXTENSION_NAME}] Top bar icon created`);
}

/**
 * Create the panel content for the drawer
 * @param {Object} options
 * @returns {HTMLElement}
 */
function createPanelContent(options) {
    const container = document.createElement('div');
    container.className = 'ai-dict-top-bar-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'ai-dict-top-bar-header';
    header.innerHTML = `
        <h3><i class="fa-solid fa-book"></i> AI Dictionary</h3>
    `;
    container.appendChild(header);

    // Quick lookup input
    const lookupSection = document.createElement('div');
    lookupSection.className = 'ai-dict-top-bar-section';
    lookupSection.innerHTML = `
        <label>快速查词</label>
        <div class="ai-dict-top-bar-lookup">
            <input type="text" id="ai-dict-top-bar-input" class="text_pole" placeholder="输入单词查询...">
            <button id="ai-dict-top-bar-lookup-btn" class="menu_button menu_button_icon" title="查询">
                <i class="fa-solid fa-search"></i>
            </button>
        </div>
    `;
    container.appendChild(lookupSection);

    // Divider
    const hr1 = document.createElement('hr');
    hr1.className = 'sysHR';
    container.appendChild(hr1);

    // Quick actions
    const actionsSection = document.createElement('div');
    actionsSection.className = 'ai-dict-top-bar-section';
    actionsSection.innerHTML = `
        <label>快捷功能</label>
        <div class="ai-dict-top-bar-actions">
            <button id="ai-dict-top-bar-stats-btn" class="menu_button" title="查词统计">
                <i class="fa-solid fa-chart-bar"></i>
                <span>查词统计</span>
            </button>
            <button id="ai-dict-top-bar-flashcard-btn" class="menu_button" title="闪卡复习">
                <i class="fa-solid fa-clone"></i>
                <span>闪卡复习</span>
            </button>
            <button id="ai-dict-top-bar-farm-btn" class="menu_button" title="农场游戏">
                <i class="fa-solid fa-seedling"></i>
                <span>农场游戏</span>
            </button>
        </div>
    `;
    container.appendChild(actionsSection);

    // Divider
    const hr2 = document.createElement('hr');
    hr2.className = 'sysHR';
    container.appendChild(hr2);

    // Info/tip section
    const infoSection = document.createElement('div');
    infoSection.className = 'ai-dict-top-bar-section ai-dict-top-bar-info';
    infoSection.innerHTML = `
        <div class="ai-dict-top-bar-tip">
            <i class="fa-solid fa-lightbulb"></i>
            <span>选中文本即可快速查词</span>
        </div>
    `;
    container.appendChild(infoSection);

    return container;
}

/**
 * Toggle the drawer open/closed
 * @param {HTMLElement} icon
 * @param {HTMLElement} content
 */
function toggleDrawer(icon, content) {
    if (isDrawerOpen) {
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
function openDrawer(icon, content) {
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

    isDrawerOpen = true;
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
function closeDrawer(icon, content) {
    isDrawerOpen = false;
    icon.classList.remove('openIcon');
    icon.classList.add('closedIcon');
    content.classList.remove('openDrawer');
    content.classList.add('closedDrawer');
}

/**
 * Remove the top bar icon
 */
export function removeTopBarIcon() {
    const drawer = document.getElementById(TOP_BAR_DRAWER_ID);
    if (drawer) {
        drawer.remove();
        isDrawerOpen = false;
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
 */
export function bindTopBarEvents(options) {
    const { performLookup, showStatisticsPanel, showFarmGamePanel, showFlashcardPanel } = options;

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
}
