/**
 * Flashcard - TTS Audio Module
 * TTS音频播放功能
 */

import { MOBILE_TTS_ENDPOINT, MOBILE_TTS_VOICE } from './flashcard-config.js';
import { ttsCache, uiState, blindState } from './flashcard-state.js';
import { isIosDevice } from './flashcard-utils.js';

/**
 * 更新TTS状态文本
 * @param {string} message
 */
export function setTtsStatusMessage(message) {
    uiState.ttsStatusMessage = message || '';
    const statusEl = document.getElementById('flashcard-tts-status');
    if (statusEl) {
        statusEl.textContent = uiState.ttsStatusMessage;
    }
}

/**
 * 获取移动端TTS音频URL（带缓存）
 * @param {string} text
 * @param {string} cacheKey
 * @returns {Promise<string>}
 */
export async function getMobileTtsAudioUrl(text, cacheKey) {
    const key = cacheKey || text;
    if (ttsCache.urlCache.has(key)) {
        return ttsCache.urlCache.get(key);
    }

    const requestBody = JSON.stringify({
        input: text,
        voice: MOBILE_TTS_VOICE,
        speed: uiState.ttsSpeed,
        pitch: '0',
        style: 'general'
    });

    const response = await fetch(MOBILE_TTS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: requestBody
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
        let errorText = '';
        try {
            errorText = (await response.text()).trim();
        } catch {}
        const detail = errorText ? `: ${errorText.slice(0, 120)}` : '';
        throw new Error(`mobile_tts_http_${response.status}${detail}`);
    }

    const isAudio = contentType.includes('audio')
        || contentType.includes('octet-stream')
        || contentType.includes('application/octet-stream');
    if (!isAudio) {
        let errorText = '';
        try {
            errorText = (await response.text()).trim();
        } catch {}
        const detail = errorText ? `: ${errorText.slice(0, 120)}` : '';
        throw new Error(`mobile_tts_bad_content_${contentType || 'unknown'}${detail}`);
    }

    const audioBlob = await response.blob();
    const buffer = await audioBlob.arrayBuffer();
    const url = URL.createObjectURL(audioBlob);
    ttsCache.urlCache.set(key, url);
    ttsCache.bufferCache.set(key, buffer);
    return url;
}

/**
 * 预加载移动端TTS音频
 * @param {string[]} sentences
 * @param {string} cachePrefix
 * @returns {Promise<void>}
 */
export async function prefetchMobileTtsSentences(sentences, cachePrefix) {
    const tasks = sentences.slice(0, 3).map((sentence, index) => {
        const key = `${cachePrefix}-${index}`;
        return getMobileTtsAudioUrl(sentence, key).catch(() => {});
    });
    await Promise.allSettled(tasks);
}

/**
 * 从blob URL播放音频
 * @param {HTMLAudioElement} audioElement
 * @param {string} url
 * @returns {Promise<void>}
 */
export async function playAudioFromUrl(audioElement, url) {
    // 先停止当前播放
    audioElement.pause();
    audioElement.currentTime = 0;

    // 设置新的音频源
    audioElement.src = url;
    audioElement.setAttribute('playsinline', '');
    audioElement.playsInline = true;

    // 等待音频加载完成
    await new Promise((resolve, reject) => {
        const onCanPlay = () => {
            audioElement.removeEventListener('canplaythrough', onCanPlay);
            audioElement.removeEventListener('error', onError);
            resolve();
        };
        const onError = (e) => {
            audioElement.removeEventListener('canplaythrough', onCanPlay);
            audioElement.removeEventListener('error', onError);
            reject(new Error('Audio load failed'));
        };
        audioElement.addEventListener('canplaythrough', onCanPlay, { once: true });
        audioElement.addEventListener('error', onError, { once: true });
        audioElement.load();
    });

    // 播放音频
    await audioElement.play();
}

/**
 * 确保iOS AudioContext已创建并运行
 * @returns {Promise<AudioContext>}
 */
export async function ensureIosAudioContext() {
    if (!ttsCache.iosAudioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            throw new Error('audio_context_not_available');
        }
        ttsCache.iosAudioContext = new AudioContextClass();
    }
    if (ttsCache.iosAudioContext.state === 'suspended') {
        await ttsCache.iosAudioContext.resume();
    }
    return ttsCache.iosAudioContext;
}

/**
 * 通过Web Audio在iOS上播放音频
 * @param {ArrayBuffer} buffer
 * @returns {Promise<void>}
 */
export async function playMobileTtsWithWebAudio(buffer) {
    const context = await ensureIosAudioContext();
    if (ttsCache.iosAudioSource) {
        try {
            ttsCache.iosAudioSource.stop();
        } catch {}
        ttsCache.iosAudioSource = null;
    }
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.connect(context.destination);
    ttsCache.iosAudioSource = source;
    return new Promise((resolve, reject) => {
        source.onended = () => {
            if (ttsCache.iosAudioSource === source) {
                ttsCache.iosAudioSource = null;
            }
            resolve();
        };
        try {
            source.start(0);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * 使用移动端TTS端点播放文本
 * @param {HTMLAudioElement} audioElement
 * @param {string} text
 * @param {string} cacheKey
 * @returns {Promise<void>}
 */
export async function playMobileTts(audioElement, text, cacheKey) {
    let url = '';
    try {
        url = await getMobileTtsAudioUrl(text, cacheKey);
    } catch (error) {
        const detail = String(error?.message || error || '');
        throw new Error(`mobile_tts_fetch_failed: ${detail}`);
    }

    try {
        await playAudioFromUrl(audioElement, url);
    } catch (error) {
        const detail = String(error?.message || error || '');
        throw new Error(`mobile_tts_play_failed: ${detail}`);
    }
}

/**
 * 更新播放按钮的激活状态（不重新渲染）
 * @param {number} nextIndex
 */
export function setPlayingIndex(nextIndex) {
    blindState.playingIndex = nextIndex;
    document.querySelectorAll('.flashcard-sentence-btn').forEach((button) => {
        const index = Number(button.dataset.sentenceIndex);
        button.classList.toggle('active', index === nextIndex);
    });
    document.querySelectorAll('.flashcard-blind-play-btn').forEach((button) => {
        const index = Number(button.dataset.sentenceIndex);
        button.classList.toggle('active', index === nextIndex);
    });
}

/**
 * 播放单个句子
 * @param {string} sentence
 * @param {number} sentenceIndex
 * @param {number} [token]
 * @param {Function} getDeckState - 获取牌组状态的函数
 * @returns {Promise<void>}
 */
export async function playSentence(sentence, sentenceIndex, token, getDeckState) {
    const audioElement = blindState.audio;
    if (!audioElement) return;

    const playbackToken = token || Date.now();
    if (!token) {
        blindState.playbackToken = playbackToken;
        audioElement.onended = null;
    }
    setPlayingIndex(sentenceIndex);
    const clearPlayingState = () => {
        if (blindState.playbackToken !== playbackToken) return;
        if (blindState.playingIndex !== sentenceIndex) return;
        setPlayingIndex(-1);
    };
    if (!isIosDevice()) {
        audioElement.addEventListener('ended', clearPlayingState, { once: true });
    }

    try {
        const { deck, currentIndex } = getDeckState();
        const currentCard = deck[currentIndex];
        const cacheKey = currentCard ? `${currentCard.word}-${sentenceIndex}` : sentence;

        if (isIosDevice()) {
            setTtsStatusMessage('Mobile TTS active');
            let buffer = ttsCache.bufferCache.get(cacheKey);
            if (!buffer) {
                await getMobileTtsAudioUrl(sentence, cacheKey);
                buffer = ttsCache.bufferCache.get(cacheKey);
            }
            if (!buffer) {
                throw new Error('mobile_tts_buffer_missing');
            }
            await playMobileTtsWithWebAudio(buffer);
            clearPlayingState();
            setTtsStatusMessage('');
            return;
        }

        setTtsStatusMessage('Mobile TTS active');
        await playMobileTts(audioElement, sentence, cacheKey);
        setTtsStatusMessage('');
    } catch (error) {
        console.error('[Flashcard] TTS play failed:', error);
        const detail = String(error?.message || error || '').slice(0, 160);
        setTtsStatusMessage(`Mobile TTS failed: ${detail || 'unknown error'}`);
        clearPlayingState();
    }
}

/**
 * 停止播放
 */
export function stopPlayback() {
    if (blindState.audio) {
        blindState.audio.pause();
        blindState.audio.src = '';
    }
    blindState.playbackToken = 0;
    setPlayingIndex(-1);
}
