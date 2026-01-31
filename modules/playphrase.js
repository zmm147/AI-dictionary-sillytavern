/**
 * AI Dictionary - PlayPhrase Video Module
 * Fetch and display PlayPhrase videos for lookup words
 */

import { EXTENSION_NAME } from './constants.js';

const PLAYPHRASE_API_URL = 'https://www.playphrase.me/api/v1/phrases/search';
const PLAYPHRASE_REFERER = 'https://www.playphrase.me/';
const PLAYPHRASE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';

/**
 * Public CORS proxies as fallback
 */
const PUBLIC_CORS_PROXIES = [
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://test.cors.workers.dev/?${encodeURIComponent(url)}`,
];

// Cache for proxy availability check
let proxyAvailable = null;

/**
 * Create an AbortSignal with timeout
 * @param {number} ms Timeout in milliseconds
 * @returns {AbortSignal}
 */
function createTimeoutSignal(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
}

/**
 * Check if local SillyTavern proxy is available
 * @returns {Promise<boolean>}
 */
async function checkProxyAvailable() {
    if (proxyAvailable !== null) {
        return proxyAvailable;
    }

    try {
        const response = await fetch('/proxy/https://www.playphrase.me/', {
            method: 'HEAD',
            signal: createTimeoutSignal(3000)
        });
        proxyAvailable = response.ok || response.status !== 404;
    } catch (error) {
        proxyAvailable = false;
    }

    console.log(`[${EXTENSION_NAME}] PlayPhrase local proxy available:`, proxyAvailable);
    return proxyAvailable;
}

const playphraseState = {
    word: '',
    phrases: [],
    index: 0,
    loading: false
};

function normalizePhrase(phrase) {
    const videoUrl = phrase['video-url'] || phrase.videoUrl || phrase.video_url;
    if (!videoUrl) return null;

    const videoInfo = phrase['video-info'] || phrase.videoInfo || {};

    return {
        id: phrase.id || '',
        text: phrase.text || '',
        videoUrl,
        source: videoInfo.info || '',
        imdb: videoInfo.imdb || '',
        sourceUrl: videoInfo['source-url'] || videoInfo.sourceUrl || ''
    };
}

function updatePlayphraseUI(elements) {
    const { statusEl, playerEl, videoEl, prevBtn, nextBtn, counterEl } = elements;
    const total = playphraseState.phrases.length;

    if (total === 0) {
        statusEl.textContent = 'No videos found.';
        playerEl.style.display = 'none';
        counterEl.textContent = '';
        return;
    }

    const current = playphraseState.phrases[playphraseState.index];
    statusEl.textContent = '';
    playerEl.style.display = 'flex';
    videoEl.src = current.videoUrl;
    videoEl.load();

    // Update video info (text and source)
    const textEl = playerEl.querySelector('.ai-dict-playphrase-text');
    const sourceEl = playerEl.querySelector('.ai-dict-playphrase-source');

    if (textEl) {
        textEl.textContent = `"${current.text}"`;
    }

    if (sourceEl) {
        if (current.sourceUrl) {
            sourceEl.innerHTML = `<a href="${current.sourceUrl}" target="_blank" rel="noopener noreferrer">${current.source}</a>`;
        } else {
            sourceEl.textContent = current.source;
        }
    }

    counterEl.textContent = `${playphraseState.index + 1} / ${total}`;
    prevBtn.disabled = playphraseState.index === 0;
    nextBtn.disabled = playphraseState.index >= total - 1;

    // Preload next and previous videos for smooth playback
    preloadAdjacentVideos();
}

function preloadAdjacentVideos() {
    const total = playphraseState.phrases.length;
    const currentIndex = playphraseState.index;

    // Create a container for preload videos if it doesn't exist
    let preloadContainer = document.getElementById('ai-dict-playphrase-preload');
    if (!preloadContainer) {
        preloadContainer = document.createElement('div');
        preloadContainer.id = 'ai-dict-playphrase-preload';
        preloadContainer.style.display = 'none';
        document.body.appendChild(preloadContainer);
    }

    // Clear previous preload videos
    preloadContainer.innerHTML = '';

    // Preload next video
    if (currentIndex + 1 < total) {
        const nextUrl = playphraseState.phrases[currentIndex + 1].videoUrl;
        const nextVideo = document.createElement('video');
        nextVideo.src = nextUrl;
        nextVideo.preload = 'auto';
        preloadContainer.appendChild(nextVideo);
    }

    // Preload previous video
    if (currentIndex - 1 >= 0) {
        const prevUrl = playphraseState.phrases[currentIndex - 1].videoUrl;
        const prevVideo = document.createElement('video');
        prevVideo.src = prevUrl;
        prevVideo.preload = 'auto';
        preloadContainer.appendChild(prevVideo);
    }
}

function bindPlayphraseControls(elements) {
    const { prevBtn, nextBtn } = elements;
    if (!prevBtn.dataset.bound) {
        prevBtn.dataset.bound = 'true';
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (playphraseState.index > 0) {
                playphraseState.index -= 1;
                updatePlayphraseUI(elements);
            }
        });
    }

    if (!nextBtn.dataset.bound) {
        nextBtn.dataset.bound = 'true';
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (playphraseState.index < playphraseState.phrases.length - 1) {
                playphraseState.index += 1;
                updatePlayphraseUI(elements);
            }
        });
    }
}

async function fetchPlayphrasePhrases(word, limit, csrfToken) {
    const params = new URLSearchParams({
        q: word,
        limit: String(limit || 10),
        language: 'en',
        platform: 'desktop safari',
        'content-rating': 'G',
        skip: '0'
    });

    const url = `${PLAYPHRASE_API_URL}?${params.toString()}`;
    let response = null;
    let proxyUsed = '';

    // Check if local proxy is available
    const useLocalProxy = await checkProxyAvailable();

    if (useLocalProxy) {
        // Use SillyTavern's CORS proxy
        const proxyHeaders = {
            'accept': 'json',
            'authorization': 'Token',
            'content-type': 'json',
            'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            'x-proxy-referer': PLAYPHRASE_REFERER,
            'x-proxy-user-agent': PLAYPHRASE_USER_AGENT,
            'x-proxy-origin': PLAYPHRASE_REFERER
        };

        // Add CSRF token if provided
        if (csrfToken) {
            proxyHeaders['x-proxy-csrf-token'] = csrfToken;
        }

        const proxyUrl = `/proxy/${encodeURIComponent(url)}`;
        proxyUsed = 'local';
        console.log(`[${EXTENSION_NAME}] Using local proxy for PlayPhrase:`, proxyUrl);

        try {
            response = await fetch(proxyUrl, {
                headers: proxyHeaders,
                signal: createTimeoutSignal(10000)
            });
        } catch (error) {
            console.warn(`[${EXTENSION_NAME}] Local proxy failed:`, error.message);
            response = null;
        }
    }

    // Try public CORS proxies if local proxy failed or unavailable
    if (!response || !response.ok) {
        for (const getProxyUrl of PUBLIC_CORS_PROXIES) {
            try {
                const proxyUrl = getProxyUrl(url);
                proxyUsed = proxyUrl.split('?')[0];
                console.log(`[${EXTENSION_NAME}] Trying public proxy for PlayPhrase:`, proxyUsed);

                response = await fetch(proxyUrl, {
                    method: 'GET',
                    signal: createTimeoutSignal(10000)
                });

                if (response.ok) {
                    console.log(`[${EXTENSION_NAME}] Public proxy succeeded:`, proxyUsed);
                    break;
                }
            } catch (proxyError) {
                console.warn(`[${EXTENSION_NAME}] Public proxy failed:`, proxyUsed, proxyError.message);
                response = null;
            }
        }
    }

    // Handle response
    if (!response || !response.ok) {
        if (response?.status === 404) {
            throw new Error('CORS proxy is disabled. Enable it in config.yaml with enableCorsProxy: true');
        }
        if (response && [401, 403].includes(response.status)) {
            throw new Error('PlayPhrase request rejected. Please check your CSRF Token.');
        }
        if (response) {
            throw new Error(`PlayPhrase request failed (${response.status}). Please check your CSRF Token.`);
        }
        throw new Error('PlayPhrase request failed. All proxies unavailable.');
    }

    const data = await response.json();
    const phrases = Array.isArray(data?.phrases) ? data.phrases : [];
    return phrases.map(normalizePhrase).filter(Boolean);
}

/**
 * Load PlayPhrase videos into the panel
 * @param {Object} options
 * @param {string} options.word
 * @param {number} options.limit
 * @param {string} options.cookie
 * @param {string} options.csrfToken
 */
export async function loadPlayphraseVideos(options) {
    const { word, limit, csrfToken } = options;
    const container = document.getElementById('ai-dict-playphrase-content');
    if (!container) return;

    const statusEl = container.querySelector('.ai-dict-playphrase-status');
    const playerEl = container.querySelector('.ai-dict-playphrase-player');
    const videoEl = container.querySelector('#ai-dict-playphrase-video');
    const prevBtn = container.querySelector('#ai-dict-playphrase-prev-btn');
    const nextBtn = container.querySelector('#ai-dict-playphrase-next-btn');
    const counterEl = container.querySelector('.ai-dict-playphrase-counter');

    if (!statusEl || !playerEl || !videoEl || !prevBtn || !nextBtn || !counterEl) {
        return;
    }

    bindPlayphraseControls({ statusEl, playerEl, videoEl, prevBtn, nextBtn, counterEl });

    const shouldReset = playphraseState.word !== word;
    if (shouldReset) {
        playphraseState.word = word;
        playphraseState.phrases = [];
        playphraseState.index = 0;
    }

    if (playphraseState.loading) {
        return;
    }

    if (playphraseState.phrases.length === 0) {
        statusEl.textContent = 'Loading videos...';
        playerEl.style.display = 'none';
        counterEl.textContent = '';
        playphraseState.loading = true;

        try {
            const phrases = await fetchPlayphrasePhrases(word, limit, csrfToken);
            playphraseState.phrases = phrases;
            playphraseState.index = 0;
            updatePlayphraseUI({ statusEl, playerEl, videoEl, prevBtn, nextBtn, counterEl });
        } catch (error) {
            console.warn(`[${EXTENSION_NAME}] PlayPhrase fetch failed:`, error);
            statusEl.textContent = `Video load failed: ${error?.message || 'Request failed'}`;
            playerEl.style.display = 'none';
            counterEl.textContent = '';
        } finally {
            playphraseState.loading = false;
        }
        return;
    }

    updatePlayphraseUI({ statusEl, playerEl, videoEl, prevBtn, nextBtn, counterEl });
}
