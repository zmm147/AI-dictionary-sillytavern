/**
 * AI Dictionary Extension for SillyTavern
 * Main entry point - modular version
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types, generateRaw, setExtensionPrompt, extension_prompt_types, getCharacters, select_rm_info as selectRmInfo } from '../../../../script.js';
import { oai_settings, sendOpenAIRequest, openai_settings, openai_setting_names } from '../../../openai.js';
import { system_prompts } from '../../../sysprompt.js';

// Import modules
import { fetchYoudaoDictionary } from './modules/youdao.js';
import { isMobile, isSingleWord } from './modules/utils.js';
import { EXTENSION_NAME, defaultSettings } from './modules/constants.js';

// Import data modules
import {
    loadWordHistoryFromFile,
    saveWordHistory,
    getWordHistory,
    getAllWordHistory,
    removeWordHistoryContext,
    clearWordHistory,
    deleteWordPermanently
} from './modules/wordHistory.js';

import {
    loadFlashcardProgress,
    saveCurrentSession,
    getCurrentSession,
    updateWordProgress,
    generateBalancedDeck,
    getFlashcardStats
} from './modules/flashcardProgress.js';

import {
    loadReviewDataFromFile,
    getReviewData,
    addWordToPendingReview,
    getWordsToReviewToday,
    checkAIResponseForReviewWords,
    generateReviewPrompt,
    isWordInReview,
    toggleWordInReview,
    clearCurrentSession,
    forceAllWordsReviewable,
    clearAllReviewData
} from './modules/review.js';

import { setCloudSyncMode } from './modules/backup.js';
import { initDatabase } from './modules/database.js';

// Import UI modules
import { SettingsUi } from './modules/settingsUi.js';

import {
    createSidePanel,
    showPanel,
    showPanelHtml,
    expandPanel,
    collapsePanel,
    showIcon,
    hideIcon,
    playAudio,
    handleGlobalClick
} from './modules/panel.js';

import {
    fetchAIDefinition,
    performDeepStudy,
    sendChatMessage,
    triggerAIFetchIfEmpty,
    bindManualAIFetchButton,
    bindDeepStudyButton,
    bindChatInputEvents,
    clearChatHistory,
    setCurrentWord
} from './modules/aiLookup.js';

import {
    getRelatedConfusables,
    formatSavedConfusables,
    highlightAllConfusableWords,
    removeConfusableHighlights,
    updateHighlightColor,
    performConfusableLookup,
    bindConfusableButton,
    updateSavedConfusablesDisplay
} from './modules/confusables.js';
import { loadPlayphraseVideos, bindPlayphraseButton } from './modules/playphrase.js';

// Import new split modules
import { showStatisticsPanel } from './modules/statisticsPanel.js';
import { showFarmGamePanel, loadFarmGameScript } from './modules/farmGameLoader.js';
import {
    formatYoudaoHeadSection,
    formatYoudaoDefinitions,
    formatWordHistory,
    createMergedContent,
    updateYoudaoSection
} from './modules/contentBuilder.js';
import {
    getSelectedText,
    setSelectedText,
    getSelectedContext,
    setSelectedContext,
    handleTouchStart,
    handleTouchEnd,
    handleTouchCancel,
    handleTextSelection,
    handleContextMenu,
    createSelectionChangeHandler,
    clearSelectionAfterLookup
} from './modules/selection.js';
import { getContextForLookup } from './modules/context.js';

// Import pet commentary module
import { initPetCommentary, hidePetBubble } from './modules/petCommentary.js';

// Import top bar module
import { createTopBarIcon, updateTopBar, bindTopBarEvents } from './modules/topBar.js';
import { initAuth, setSaveSettingsCallback } from './modules/topBar/top-bar-auth.js';

// Dynamically determine extension path
const getExtensionUrl = () => {
    try {
        const url = new URL(import.meta.url);
        return url.pathname.substring(0, url.pathname.lastIndexOf('/'));
    } catch {
        return `scripts/extensions/${EXTENSION_NAME}`;
    }
};
const EXTENSION_URL = getExtensionUrl();

/** @type {Object} */
let settings = { ...defaultSettings };
let settingsUi = null;

// --- Settings Functions ---

function loadSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = { ...defaultSettings };
    }
    settings = { ...defaultSettings, ...extension_settings[EXTENSION_NAME] };

    if (!settings.confusableWordsPrompt || !settings.confusableWordsPrompt.includes('【原词释义】')) {
        settings.confusableWordsPrompt = defaultSettings.confusableWordsPrompt;
        extension_settings[EXTENSION_NAME].confusableWordsPrompt = settings.confusableWordsPrompt;
    }

    // 确保 petCommentary 子对象存在且有所有默认属性
    if (!settings.petCommentary) {
        settings.petCommentary = { ...defaultSettings.petCommentary };
    } else {
        // 深度合并，确保新增的属性有默认值
        settings.petCommentary = { ...defaultSettings.petCommentary, ...settings.petCommentary };
    }
}

function saveSettings() {
    // 深拷贝确保嵌套对象正确保存
    extension_settings[EXTENSION_NAME] = JSON.parse(JSON.stringify(settings));
    saveSettingsDebounced();
}

// --- Word History Events ---

function bindWordHistoryEvents(word) {
    const removeContextBtns = document.querySelectorAll('.ai-dict-history-context-remove');
    removeContextBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetWord = btn.getAttribute('data-word');
            const index = parseInt(btn.getAttribute('data-index'), 10);
            if (targetWord && !isNaN(index)) {
                removeWordHistoryContext(targetWord, index);
                updateWordHistoryDisplay(word);
            }
        });
    });

    const clearBtn = document.querySelector('.ai-dict-history-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetWord = clearBtn.getAttribute('data-word');
            if (targetWord && confirm(`确定要清除 "${targetWord}" 的所有查词记录吗？`)) {
                clearWordHistory(targetWord);
                updateWordHistoryDisplay(word);
            }
        });
    }
}

function updateWordHistoryDisplay(word) {
    const container = document.getElementById('ai-dict-word-history-content');
    if (!container) return;

    const history = getWordHistory(word);
    container.innerHTML = formatWordHistory(word, history);

    const countSpan = document.querySelector('.ai-dict-history-count');
    if (countSpan) {
        countSpan.textContent = history ? `(${history.count}次)` : '';
    }

    bindWordHistoryEvents(word);
}

// --- AI Lookup Wrappers ---

async function fetchAIDefinitionWrapper(word) {
    const context = getContextForLookup(settings);
    await fetchAIDefinition({
        word,
        context,
        settings,
        extensionSettings: extension_settings,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings: oai_settings
    });
}

async function performDeepStudyWrapper(word) {
    await performDeepStudy({
        word,
        settings,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings: oai_settings
    });
}

async function sendChatMessageWrapper(word) {
    await sendChatMessage({
        word,
        settings,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings: oai_settings
    });
}

async function performConfusableLookupWrapper(word) {
    await performConfusableLookup({
        word,
        settings,
        confusableWords: settings.confusableWords,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings: oai_settings,
        saveSettings,
        updateSavedDisplay: (w) => updateSavedConfusablesDisplay(w, settings.confusableWords, saveSettings, () => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables, performDictionaryLookup)),
        highlightWords: () => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables, performDictionaryLookup)
    });
}

// --- Youdao Section Update Wrapper ---

function updateYoudaoSectionWrapper(word, youdaoResults) {
    updateYoudaoSection({
        word,
        youdaoResults,
        autoCollapseYoudao: settings.autoCollapseYoudao,
        fetchAIOnYoudaoExpand: settings.fetchAIOnYoudaoExpand,
        fetchAIDefinitionWrapper
    });
}

// --- Main Lookup Function ---

async function performDictionaryLookup(skipSaveHistory = false, wordOverride = null) {
    hideIcon();
    clearSelectionAfterLookup();

    const selectedText = wordOverride || getSelectedText();
    const selectedContext = wordOverride ? '' : getSelectedContext();

    if (!selectedText.trim()) {
        showPanel('No word selected', 'Please select a word on the page first.', 'error');
        return;
    }

    const isPhrase = !isSingleWord(selectedText);
    const shouldAutoFetchAI = settings.autoFetchAI || isPhrase;

    try {
        showPanel('Looking up...', `Fetching definitions for: "${selectedText}"...`, 'loading');

        if (isMobile()) {
            expandPanel();
        }

        if (!skipSaveHistory) {
            saveWordHistory(selectedText, selectedContext, (word) => {
                addWordToPendingReview(word, settings.immersiveReview);
            });
        }

        const initialHtmlContent = createMergedContent({
            word: selectedText,
            youdaoResults: null,
            autoFetchAI: shouldAutoFetchAI,
            autoCollapseYoudao: settings.autoCollapseYoudao,
            confusableWords: settings.confusableWords,
            getWordHistory
        });

        showPanelHtml(selectedText, initialHtmlContent, 'success', {
            getWordHistory,
            isWordInReview,
            toggleWordInReview,
            immersiveReviewEnabled: settings.immersiveReview,
            playAudio,
            fetchAIOnYoudaoExpand: settings.fetchAIOnYoudaoExpand,
            triggerAIFetchIfEmpty: () => triggerAIFetchIfEmpty(selectedText, fetchAIDefinitionWrapper),
            loadPlayphraseVideos: () => loadPlayphraseVideos({
                word: selectedText,
                limit: settings.playphraseLimit,
                csrfToken: settings.playphraseCsrfToken
            })
        });

        clearChatHistory();
        setCurrentWord(selectedText);

        bindDeepStudyButton(selectedText, performDeepStudyWrapper);
        bindConfusableButton(
            selectedText,
            performConfusableLookupWrapper,
            settings.confusableWords,
            saveSettings,
            (w) => updateSavedConfusablesDisplay(w, settings.confusableWords, saveSettings, () => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables, performDictionaryLookup)),
            () => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables, performDictionaryLookup)
        );

        // Don't re-highlight when opening lookup panel to preserve existing highlights

        bindChatInputEvents(selectedText, sendChatMessageWrapper);
        bindWordHistoryEvents(selectedText);
        bindPlayphraseButton(() => loadPlayphraseVideos({
            word: selectedText,
            limit: settings.playphraseLimit,
            csrfToken: settings.playphraseCsrfToken
        }));

        if (!shouldAutoFetchAI) {
            bindManualAIFetchButton(selectedText, fetchAIDefinitionWrapper);
        }

        // Start Youdao lookup (only for single words)
        let youdaoPromise = Promise.resolve(null);
        if (!isPhrase) {
            youdaoPromise = fetchYoudaoDictionary(selectedText).catch(error => {
                console.warn('Youdao dictionary fetch failed:', error);
                return null;
            });
        }

        // Start AI lookup if should auto fetch
        let aiPromise = Promise.resolve();
        if (shouldAutoFetchAI) {
            aiPromise = fetchAIDefinitionWrapper(selectedText).catch(error => {
                console.error('AI definition fetch error:', error);
                const aiContentElement = document.getElementById('ai-definition-content');
                if (aiContentElement) {
                    aiContentElement.innerHTML = '<p class="ai-dict-error-text">无法获取 AI 定义，请稍后重试。</p>';
                }
            });
        }

        const youdaoResults = await youdaoPromise;
        if (youdaoResults) {
            updateYoudaoSectionWrapper(selectedText, youdaoResults);
        }

        if (shouldAutoFetchAI) {
            await aiPromise;
        }

    } catch (error) {
        console.error('AI Dictionary lookup error:', error);
        showPanel('Error', `Failed to lookup word: ${error.message}`, 'error');
    }
}

// --- Statistics Panel Wrapper ---

function showStatisticsPanelWrapper() {
    showStatisticsPanel({
        getAllWordHistory,
        getReviewData,
        getWordsToReviewToday,
        clearCurrentSession,
        forceAllWordsReviewable,
        clearAllReviewData
    });
}

// --- Farm Game Panel Wrapper ---

function showFarmGamePanelWrapper() {
    showFarmGamePanel(EXTENSION_URL);
}

// --- Top Bar Wrapper ---

function updateTopBarWrapper() {
    updateTopBar({
        settings,
        saveSettings
    });

    // Bind events after creating (always enabled)
    bindTopBarEvents({
        performLookup: (word) => {
            setSelectedText(word);
            setSelectedContext('');
            performDictionaryLookup();
        },
        showStatisticsPanel: showStatisticsPanelWrapper,
        showFarmGamePanel: showFarmGamePanelWrapper,
        showFlashcardPanel: null, // TODO: Add flashcard panel function if available
        settings: settings,
        saveSettings: saveSettings,
        sendOpenAIRequest: sendOpenAIRequest,
        oaiSettings: oai_settings,
        getCharacters: getCharacters,
        selectRmInfo: selectRmInfo
    });
    const topBarSettings = document.getElementById('ai-dict-top-bar-settings');
    settingsUi?.bindToElement(topBarSettings);
}

// --- Initialization ---

const init = async () => {
    // Load CSS styles
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = `${EXTENSION_URL}/style.css`;
    document.head.appendChild(linkElement);

    loadSettings();
    console.log(`[${EXTENSION_NAME}] Settings loaded`, settings);

    // Set cloud sync mode BEFORE loading data (to skip local backup if cloud sync is enabled)
    setCloudSyncMode(settings.cloudSyncEnabled || false);

    // Initialize database BEFORE any data operations
    await initDatabase();

    // Set up save settings callback for auth module BEFORE initAuth
    setSaveSettingsCallback((key, value) => {
        settings[key] = value;
        saveSettings();
        // Update cloud sync mode in backup module
        if (key === 'cloudSyncEnabled') {
            setCloudSyncMode(value);
        }
    });

    // If cloud sync is enabled, initialize auth and download cloud data BEFORE loading local data
    if (settings.cloudSyncEnabled) {
        await initAuth(true, true); // waitForCloudData = true
    }

    // Load word history
    await loadWordHistoryFromFile();

    // Load review data
    await loadReviewDataFromFile();

    // Load flashcard progress
    await loadFlashcardProgress();

    // Initialize Settings UI
    const manager = new SettingsUi({
        extensionUrl: EXTENSION_URL,
        settings: settings,
        saveSettings: saveSettings,
        connectionManager: extension_settings.connectionManager,
        showStatisticsPanel: showStatisticsPanelWrapper,
        showFarmGamePanel: showFarmGamePanelWrapper,
        removeConfusableHighlights: removeConfusableHighlights,
        highlightAllConfusableWords: () => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables, performDictionaryLookup),
        updateHighlightColor: () => updateHighlightColor(settings.highlightColor),
        updateTopBar: updateTopBarWrapper
    });
    settingsUi = manager;

    const renderedUi = await manager.render();
    if (renderedUi) {
        $('#extensions_settings').append(renderedUi);
    }

    // Mouse interaction (Desktop)
    document.addEventListener('mouseup', (e) => setTimeout(() => handleTextSelection(e, settings, performDictionaryLookup), 10));

    // Touch interaction (Mobile)
    document.addEventListener('touchstart', (e) => handleTouchStart(e, settings), { passive: true });
    document.addEventListener('touchend', (e) => handleTouchEnd(e, settings, performDictionaryLookup), { passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    // Selection change handler
    const debouncedSelectionHandler = createSelectionChangeHandler(settings, performDictionaryLookup);
    document.addEventListener('selectionchange', debouncedSelectionHandler);

    document.addEventListener('contextmenu', (e) => handleContextMenu(e, settings));

    // Global click for collapse
    document.addEventListener('click', handleGlobalClick);

    // Expose global function
    window.performDictionaryLookup = performDictionaryLookup;

    // Initialize the side panel
    createSidePanel({ settings, saveSettings });

    // Initialize top bar (always enabled)
    updateTopBarWrapper();

    // Event listeners for chat messages
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageIndex) => {
        // Highlight confusable words
        setTimeout(() => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables, performDictionaryLookup), 100);

        // Check AI message for review words (immersive review)
        if (settings.immersiveReview) {
            try {
                const context = getContext();
                if (context && context.chat && messageIndex >= 0) {
                    const message = context.chat[messageIndex];
                    // Only check AI messages (not user messages)
                    if (message && !message.is_user && !message.is_system && message.mes) {
                        const reviewData = getReviewData();
                        if (reviewData.currentSession.words.length > 0) {
                            checkAIResponseForReviewWords(message.mes, settings.immersiveReview);
                        }
                    }
                }
            } catch (e) {
                console.warn(`[${EXTENSION_NAME}] Error checking AI message for review words:`, e);
            }
        }
    });

    eventSource.on(event_types.MESSAGE_SENT, () => {
        setTimeout(() => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables, performDictionaryLookup), 100);
    });

    // Inject review prompt before generation
    eventSource.on(event_types.GENERATION_STARTED, (type, _options, dryRun) => {
        try {
            const context = getContext();

            if (!context || !context.chat) {
                return;
            }

            const isDryRun = !!dryRun;

            // Replicate SillyTavern's coreChat logic to get the actual messages sent to AI
            // Filter out system messages (same as SillyTavern does)
            let effectiveChat = context.chat.filter(x => !x.is_system);

            // If swipe/regenerate, remove the last message (same as SillyTavern's coreChat.pop())
            if (type === 'swipe' || type === 'regenerate') {
                effectiveChat = effectiveChat.slice(0, -1);
            } else {
            }

            // Check last AI message in effectiveChat for review words
            const reviewData = getReviewData();
            if (!isDryRun && settings.immersiveReview && reviewData.currentSession.words.length > 0) {
                if (effectiveChat.length > 0) {
                    let lastAIMessage = null;
                    let lastAIMessageIndex = -1;

                    // Find the last AI message in effectiveChat
                    for (let i = effectiveChat.length - 1; i >= 0; i--) {
                        if (!effectiveChat[i].is_user && effectiveChat[i].mes) {
                            lastAIMessage = effectiveChat[i].mes;
                            lastAIMessageIndex = i;
                            break;
                        }
                    }

                    if (lastAIMessage) {
                        checkAIResponseForReviewWords(lastAIMessage, settings.immersiveReview);
                    }
                }
            }

            // Inject review prompt to user message
            if (!settings.immersiveReview) {
                setExtensionPrompt('ai-dictionary-review', '', extension_prompt_types.IN_CHAT, 0, false);
                return;
            }

            const reviewPrompt = generateReviewPrompt(settings.immersiveReview, settings.reviewPrompt);
            if (reviewPrompt) {
                setExtensionPrompt('ai-dictionary-review', reviewPrompt, extension_prompt_types.IN_CHAT, 0, false);
            } else {
                setExtensionPrompt('ai-dictionary-review', '', extension_prompt_types.IN_CHAT, 0, false);
            }
        } catch (e) {
            console.warn(`[${EXTENSION_NAME}] Error in GENERATION_STARTED:`, e);
        }
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables, performDictionaryLookup), 100);
    });

    // Initialize highlight color
    updateHighlightColor(settings.highlightColor);

    // Initial highlight on page load
    setTimeout(() => highlightAllConfusableWords(settings.confusableWords, settings.highlightConfusables, performDictionaryLookup), 500);

    // Restore floating pet on page load
    loadFarmGameScript(EXTENSION_URL).then(() => {
        if (window.FarmGame) {
            if (typeof window.FarmGame.loadGame === 'function') {
                window.FarmGame.loadGame();
            }
            if (typeof window.FarmGame.restoreFloatingPet === 'function') {
                window.FarmGame.restoreFloatingPet();
            }
        }
    }).catch(err => {
        console.warn(`[${EXTENSION_NAME}] Failed to load farm game for floating pet restoration:`, err);
    });

    // Initialize pet commentary module
    initPetCommentary({
        eventSource,
        event_types,
        getContext,
        sendOpenAIRequest,
        generateRaw,
        oaiSettings: oai_settings,
        systemPrompts: system_prompts,
        openaiSettings: openai_settings,
        openaiSettingNames: openai_setting_names
    });

    console.log(`[${EXTENSION_NAME}] Ready`);
};

// Export for other modules
window.aiDictionary = {
    getWordHistory: getAllWordHistory,
    lookupWord: (word) => {
        setSelectedText(word);
        setSelectedContext('');
        performDictionaryLookup();
    },
    lookupWordReadOnly: (word, context = '') => {
        setSelectedText(word);
        setSelectedContext(context);
        performDictionaryLookup(true);
    },
    deleteWordPermanently: deleteWordPermanently,
    // Settings access for farm game / pet commentary
    get settings() { return settings; },
    saveSettings: saveSettings,
    defaultSettings: defaultSettings,
    // Flashcard progress functions
    flashcard: {
        getCurrentSession: getCurrentSession,
        saveCurrentSession: saveCurrentSession,
        updateWordProgress: updateWordProgress,
        generateBalancedDeck: generateBalancedDeck,
        getFlashcardStats: getFlashcardStats
    }
};

// Also expose extension_settings for farm-render.js
window.extension_settings = extension_settings;

// Start initialization
await init();
