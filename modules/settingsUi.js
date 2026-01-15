/**
 * AI Dictionary - Settings UI Module
 * Settings panel UI class and related functions
 */

import { EXTENSION_NAME, defaultSettings } from './constants.js';

/**
 * Populate connection profiles dropdown
 * @param {HTMLSelectElement} selectElement
 * @param {Object} connectionManager
 */
export function populateConnectionProfiles(selectElement, connectionManager) {
    // Clear existing options except the first one
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    if (connectionManager && Array.isArray(connectionManager.profiles)) {
        for (const profile of connectionManager.profiles) {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            selectElement.appendChild(option);
        }
    }
}

/**
 * Settings UI Class
 */
export class SettingsUi {
    /**
     * @param {Object} options
     * @param {string} options.extensionUrl - Extension URL path
     * @param {Object} options.settings - Current settings object
     * @param {Function} options.saveSettings - Function to save settings
     * @param {Object} options.connectionManager - Connection manager object
     * @param {Function} options.showStatisticsPanel - Function to show statistics panel
     * @param {Function} options.showFarmGamePanel - Function to show farm game panel
     * @param {Function} options.removeConfusableHighlights - Function to remove highlights
     * @param {Function} options.highlightAllConfusableWords - Function to highlight words
     * @param {Function} options.updateHighlightColor - Function to update highlight color
     * @param {Function} options.updateTopBar - Function to update top bar visibility
     */
    constructor(options) {
        this.dom = null;
        this.template = null;
        this.extensionUrl = options.extensionUrl;
        this.settings = options.settings;
        this.saveSettings = options.saveSettings;
        this.connectionManager = options.connectionManager;
        this.showStatisticsPanel = options.showStatisticsPanel;
        this.showFarmGamePanel = options.showFarmGamePanel;
        this.removeConfusableHighlights = options.removeConfusableHighlights;
        this.highlightAllConfusableWords = options.highlightAllConfusableWords;
        this.updateHighlightColor = options.updateHighlightColor;
        this.updateTopBar = options.updateTopBar;
    }

    async render() {
        if (!this.dom) {
            const response = await fetch(`${this.extensionUrl}/index.html`);
            if (response.ok) {
                const text = await response.text();
                this.template = document.createRange().createContextualFragment(text);
                this.dom = this.template.querySelector('#ai-dictionary-extension-settings');
                this.prepareDom();
            } else {
                console.error(`[${EXTENSION_NAME}] Failed to fetch settings template from ${this.extensionUrl}/index.html`);
            }
        }
        return this.dom;
    }

    prepareDom() {
        if (!this.dom) return;

        // Enabled Toggle
        const enabledInput = this.dom.querySelector('#ai-dict-enabled');
        if (enabledInput) {
            enabledInput.checked = this.settings.enabled;
            enabledInput.addEventListener('change', () => {
                this.settings.enabled = enabledInput.checked;
                this.saveSettings();
            });
        }

        // Connection Profile
        const profileSelect = this.dom.querySelector('#ai-dict-connection-profile');
        if (profileSelect) {
            populateConnectionProfiles(profileSelect, this.connectionManager);
            profileSelect.value = this.settings.connectionProfile || '';
            profileSelect.addEventListener('change', () => {
                this.settings.connectionProfile = profileSelect.value;
                this.saveSettings();
            });
        }

        // System Prompt
        const promptInput = this.dom.querySelector('#ai-dict-system-prompt');
        if (promptInput) {
            promptInput.value = this.settings.systemPrompt;
            promptInput.addEventListener('change', () => {
                this.settings.systemPrompt = promptInput.value;
                this.saveSettings();
            });
        }

        // User Prompt
        const userPromptInput = this.dom.querySelector('#ai-dict-user-prompt');
        if (userPromptInput) {
            userPromptInput.value = this.settings.userPrompt;
            userPromptInput.addEventListener('change', () => {
                this.settings.userPrompt = userPromptInput.value;
                this.saveSettings();
            });
        }

        // Context Range
        const rangeSelect = this.dom.querySelector('#ai-dict-context-range');
        if (rangeSelect) {
            rangeSelect.value = this.settings.contextRange;
            rangeSelect.addEventListener('change', () => {
                this.settings.contextRange = rangeSelect.value;
                this.saveSettings();
            });
        }

        // Direct Lookup
        const directLookupInput = this.dom.querySelector('#ai-dict-direct-lookup');
        if (directLookupInput) {
            directLookupInput.checked = this.settings.enableDirectLookup;
            directLookupInput.addEventListener('change', () => {
                this.settings.enableDirectLookup = directLookupInput.checked;
                this.saveSettings();
            });
        }

        // Enable Top Bar
        const enableTopBarInput = this.dom.querySelector('#ai-dict-enable-top-bar');
        if (enableTopBarInput) {
            enableTopBarInput.checked = this.settings.enableTopBar;
            enableTopBarInput.addEventListener('change', () => {
                this.settings.enableTopBar = enableTopBarInput.checked;
                this.saveSettings();
                this.updateTopBar?.();
            });
        }

        // Icon Position
        const iconPosSelect = this.dom.querySelector('#ai-dict-icon-position');
        if (iconPosSelect) {
            iconPosSelect.value = this.settings.iconPosition;
            iconPosSelect.addEventListener('change', () => {
                this.settings.iconPosition = iconPosSelect.value;
                this.saveSettings();
            });
        }

        // Auto Collapse Youdao
        const autoCollapseYoudaoInput = this.dom.querySelector('#ai-dict-auto-collapse-youdao');
        if (autoCollapseYoudaoInput) {
            autoCollapseYoudaoInput.checked = this.settings.autoCollapseYoudao;
            autoCollapseYoudaoInput.addEventListener('change', () => {
                this.settings.autoCollapseYoudao = autoCollapseYoudaoInput.checked;
                this.saveSettings();
            });
        }

        // Auto Fetch AI
        const autoFetchAIInput = this.dom.querySelector('#ai-dict-auto-fetch-ai');
        if (autoFetchAIInput) {
            autoFetchAIInput.checked = this.settings.autoFetchAI;
            autoFetchAIInput.addEventListener('change', () => {
                this.settings.autoFetchAI = autoFetchAIInput.checked;
                this.saveSettings();
            });
        }

        // Fetch AI on Youdao Expand
        const fetchAIOnYoudaoExpandInput = this.dom.querySelector('#ai-dict-fetch-ai-on-youdao-expand');
        if (fetchAIOnYoudaoExpandInput) {
            fetchAIOnYoudaoExpandInput.checked = this.settings.fetchAIOnYoudaoExpand;
            fetchAIOnYoudaoExpandInput.addEventListener('change', () => {
                this.settings.fetchAIOnYoudaoExpand = fetchAIOnYoudaoExpandInput.checked;
                this.saveSettings();
            });
        }

        // Deep Study Prompt
        const deepStudyPromptInput = this.dom.querySelector('#ai-dict-deep-study-prompt');
        if (deepStudyPromptInput) {
            deepStudyPromptInput.value = this.settings.deepStudyPrompt;
            deepStudyPromptInput.addEventListener('change', () => {
                this.settings.deepStudyPrompt = deepStudyPromptInput.value;
                this.saveSettings();
            });
        }

        // Highlight Confusables
        const highlightConfusablesInput = this.dom.querySelector('#ai-dict-highlight-confusables');
        const highlightColorContainer = this.dom.querySelector('#ai-dict-highlight-color-container');
        const highlightColorInput = this.dom.querySelector('#ai-dict-highlight-color');

        if (highlightConfusablesInput) {
            highlightConfusablesInput.checked = this.settings.highlightConfusables;

            if (highlightColorContainer) {
                highlightColorContainer.style.display = this.settings.highlightConfusables ? 'block' : 'none';
            }

            highlightConfusablesInput.addEventListener('change', () => {
                this.settings.highlightConfusables = highlightConfusablesInput.checked;
                this.saveSettings();

                if (highlightColorContainer) {
                    highlightColorContainer.style.display = this.settings.highlightConfusables ? 'block' : 'none';
                }

                if (!this.settings.highlightConfusables) {
                    this.removeConfusableHighlights?.();
                } else {
                    this.highlightAllConfusableWords?.();
                }
            });
        }

        // Highlight Color
        if (highlightColorInput) {
            highlightColorInput.value = this.settings.highlightColor;
            highlightColorInput.addEventListener('input', () => {
                this.settings.highlightColor = highlightColorInput.value;
                this.saveSettings();
                this.updateHighlightColor?.();
                if (this.settings.highlightConfusables) {
                    this.highlightAllConfusableWords?.();
                }
            });
        }

        // Statistics Button
        const statsBtn = this.dom.querySelector('#ai-dict-stats-btn');
        if (statsBtn) {
            statsBtn.addEventListener('click', () => {
                this.showStatisticsPanel?.();
            });
        }

        // Immersive Review Toggle
        const immersiveReviewInput = this.dom.querySelector('#ai-dict-immersive-review');
        const reviewPromptContainer = this.dom.querySelector('#ai-dict-review-prompt-container');
        if (immersiveReviewInput) {
            immersiveReviewInput.checked = this.settings.immersiveReview;
            if (reviewPromptContainer) {
                reviewPromptContainer.style.display = this.settings.immersiveReview ? 'block' : 'none';
            }
            immersiveReviewInput.addEventListener('change', () => {
                this.settings.immersiveReview = immersiveReviewInput.checked;
                if (reviewPromptContainer) {
                    reviewPromptContainer.style.display = immersiveReviewInput.checked ? 'block' : 'none';
                }
                this.saveSettings();
            });
        }

        // Review Prompt Textarea
        const reviewPromptInput = this.dom.querySelector('#ai-dict-review-prompt');
        if (reviewPromptInput) {
            reviewPromptInput.value = this.settings.reviewPrompt || defaultSettings.reviewPrompt;
            reviewPromptInput.addEventListener('input', () => {
                this.settings.reviewPrompt = reviewPromptInput.value;
                this.saveSettings();
            });
        }

        // Reset Review Prompt Button
        const resetReviewPromptBtn = this.dom.querySelector('#ai-dict-reset-review-prompt');
        if (resetReviewPromptBtn) {
            resetReviewPromptBtn.addEventListener('click', () => {
                const promptInput = this.dom.querySelector('#ai-dict-review-prompt');
                if (promptInput) {
                    promptInput.value = defaultSettings.reviewPrompt;
                    this.settings.reviewPrompt = defaultSettings.reviewPrompt;
                    this.saveSettings();
                }
            });
        }

        // Reset System Prompt Button
        const resetSystemPromptBtn = this.dom.querySelector('#ai-dict-reset-system-prompt');
        if (resetSystemPromptBtn) {
            resetSystemPromptBtn.addEventListener('click', () => {
                const promptInput = this.dom.querySelector('#ai-dict-system-prompt');
                if (promptInput) {
                    promptInput.value = defaultSettings.systemPrompt;
                    this.settings.systemPrompt = defaultSettings.systemPrompt;
                    this.saveSettings();
                }
            });
        }

        // Reset User Prompt Button
        const resetUserPromptBtn = this.dom.querySelector('#ai-dict-reset-user-prompt');
        if (resetUserPromptBtn) {
            resetUserPromptBtn.addEventListener('click', () => {
                const promptInput = this.dom.querySelector('#ai-dict-user-prompt');
                if (promptInput) {
                    promptInput.value = defaultSettings.userPrompt;
                    this.settings.userPrompt = defaultSettings.userPrompt;
                    this.saveSettings();
                }
            });
        }

        // Reset Deep Study Prompt Button
        const resetDeepStudyPromptBtn = this.dom.querySelector('#ai-dict-reset-deep-study-prompt');
        if (resetDeepStudyPromptBtn) {
            resetDeepStudyPromptBtn.addEventListener('click', () => {
                const promptInput = this.dom.querySelector('#ai-dict-deep-study-prompt');
                if (promptInput) {
                    promptInput.value = defaultSettings.deepStudyPrompt;
                    this.settings.deepStudyPrompt = defaultSettings.deepStudyPrompt;
                    this.saveSettings();
                }
            });
        }

        // Farm Game Button
        const farmBtn = this.dom.querySelector('#ai-dict-farm-btn');
        if (farmBtn) {
            farmBtn.addEventListener('click', () => {
                this.showFarmGamePanel?.();
            });
        }
    }
}
