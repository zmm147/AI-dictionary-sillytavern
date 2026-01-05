/**
 * AI Dictionary - Youdao Dictionary Module
 * Handles Youdao dictionary lookups via proxy
 */

import { EXTENSION_NAME } from './utils.js';

// Cache for proxy availability check
let proxyAvailable = null;

/**
 * Public CORS proxies as fallback
 */
const PUBLIC_CORS_PROXIES = [
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://test.cors.workers.dev/?${encodeURIComponent(url)}`,
];

/**
 * Create an AbortSignal with timeout (compatible with older browsers)
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
export async function checkProxyAvailable() {
    if (proxyAvailable !== null) {
        return proxyAvailable;
    }

    let errorMsg = '';
    try {
        const response = await fetch('/proxy/https://dict.youdao.com/', {
            method: 'HEAD',
            signal: createTimeoutSignal(3000)
        });
        proxyAvailable = response.ok || response.status !== 404;
        errorMsg = `status: ${response.status}`;
    } catch (error) {
        proxyAvailable = false;
        errorMsg = error.message || String(error);
    }

    console.log(`[${EXTENSION_NAME}] Local proxy available:`, proxyAvailable, errorMsg);
    return proxyAvailable;
}

/**
 * Fetch dictionary data from Youdao
 * @param {string} word The word to look up
 * @returns {Promise<Array|null>} Dictionary results or null
 */
export async function fetchYoudaoDictionary(word) {
    try {
        console.log(`[${EXTENSION_NAME}] Fetching Youdao dictionary for: ${word}`);

        const youdaoUrl = `https://dict.youdao.com/w/${encodeURIComponent(word)}`;
        let response = null;
        let proxyUsed = '';

        // Check if local proxy is available
        const useLocalProxy = await checkProxyAvailable();

        if (useLocalProxy) {
            const proxyUrl = `/proxy/${youdaoUrl}`;
            proxyUsed = 'local';
            console.log(`[${EXTENSION_NAME}] Using local proxy:`, proxyUrl);
            response = await fetch(proxyUrl, { method: 'GET' });
        } else {
            // Try public CORS proxies
            for (const getProxyUrl of PUBLIC_CORS_PROXIES) {
                try {
                    const proxyUrl = getProxyUrl(youdaoUrl);
                    proxyUsed = proxyUrl.split('?')[0];
                    console.log(`[${EXTENSION_NAME}] Trying public proxy:`, proxyUsed);

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

        if (!response || !response.ok) {
            console.warn(`[${EXTENSION_NAME}] All proxies failed for Youdao`);
            return { proxyError: true };
        }

        console.log(`[${EXTENSION_NAME}] Proxy response status:`, response.status);

        const html = await response.text();
        console.log(`[${EXTENSION_NAME}] Received HTML, length:`, html.length);

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const results = parseYoudaoHtml(doc, word);

        if (results && results.length > 0) {
            console.log(`[${EXTENSION_NAME}] Found ${results.length} Youdao result(s)`);
            return results;
        }

        console.log(`[${EXTENSION_NAME}] No Youdao results found`);
        return null;
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Youdao dictionary lookup error:`, error.message);
        return null;
    }
}

/**
 * Parse Youdao HTML response
 * @param {Document} doc Parsed HTML document
 * @param {string} word The word being looked up
 * @returns {Array} Parsed results
 */
function parseYoudaoHtml(doc, word) {
    const results = [];

    // Try Collins dictionary first
    const collinsResult = parseCollinsHtml(doc);
    if (collinsResult) {
        results.push(collinsResult);
    }

    // If no Collins, try EC dictionary
    if (results.length === 0) {
        const ecResult = parseYoudaoEcHtml(doc);
        if (ecResult) {
            results.push(ecResult);
        }
    }

    // If still nothing, try web definitions
    if (results.length === 0) {
        const webResult = parseWebDefinitionsHtml(doc);
        if (webResult) {
            results.push(webResult);
        }
    }

    return results;
}

/**
 * Parse Collins dictionary section
 */
function parseCollinsHtml(doc) {
    try {
        const defNodes = doc.querySelectorAll('#collinsResult .ol li');
        if (!defNodes || !defNodes.length) return null;

        const expression = getText(doc.querySelector('#collinsResult h4 .title'));
        const reading = getText(doc.querySelector('#collinsResult h4 .phonetic'));

        if (!expression) return null;

        // Get extra info (star rating, exam cert)
        let extrainfo = '';
        const starNode = doc.querySelector('#collinsResult h4 .star');
        if (starNode) {
            const starClass = starNode.className.split(' ')[1];
            if (starClass) {
                const starCount = starClass.substring(4, 5);
                if (starCount) {
                    extrainfo += `<span class="star">${'★'.repeat(Number(starCount))}</span>`;
                }
            }
        }

        const cets = getText(doc.querySelector('#collinsResult h4 .rank'));
        if (cets) {
            const cetTags = cets.split(' ').map(c => `<span class="cet">${c}</span>`).join('');
            extrainfo += cetTags;
        }

        // Build definitions
        const definitions = [];
        for (const defNode of defNodes) {
            let def = '<div class="odh-definition">';

            // Get POS
            const posNode = defNode.querySelector('.collinsMajorTrans p .additional');
            if (posNode) {
                const pos = getText(posNode);
                def += `<span class="pos">${escapeHtml(pos)}</span>`;
            }

            // Get translation
            const tranNode = defNode.querySelector('.collinsMajorTrans p');
            if (tranNode) {
                const clonedNode = tranNode.cloneNode(true);
                clonedNode.querySelectorAll('.additional').forEach(n => n.remove());

                const fullText = clonedNode.innerText;
                const chnMatch = fullText.match(/[\u4e00-\u9fa5\uff0c\u3002]+/g);
                const chnTran = chnMatch ? chnMatch.join('').trim() : '';
                const engTran = fullText.replace(/[\u4e00-\u9fa5\uff0c\u3002]+/g, '').trim();

                def += '<span class="tran">';
                if (engTran) {
                    def += `<span class="eng_tran">${escapeHtml(engTran)}</span>`;
                }
                if (chnTran) {
                    def += `<span class="chn_tran">${escapeHtml(chnTran)}</span>`;
                }
                def += '</span>';
            }

            // Get example sentences
            const exampleNodes = defNode.querySelectorAll('.exampleLists');
            if (exampleNodes && exampleNodes.length > 0) {
                def += '<ul class="sents">';
                for (let i = 0; i < Math.min(exampleNodes.length, 2); i++) {
                    const example = exampleNodes[i];
                    const engSent = getText(example.querySelector('p'));
                    const chnSent = getText(example.querySelector('p+p'));

                    def += '<li class="sent">';
                    if (engSent) {
                        def += `<span class="eng_sent">${escapeHtml(engSent)}</span>`;
                    }
                    def += ' - ';
                    if (chnSent) {
                        def += `<span class="chn_sent">${escapeHtml(chnSent)}</span>`;
                    }
                    def += '</li>';
                }
                def += '</ul>';
            }

            def += '</div>';
            definitions.push(def);
        }

        if (definitions.length === 0) return null;

        return {
            expression,
            reading: reading || '',
            extrainfo: extrainfo || '',
            definitions: definitions,
            audios: [
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=1`,
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=2`
            ]
        };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Error parsing Collins:`, error.message);
        return null;
    }
}

/**
 * Parse EC dictionary section
 */
function parseYoudaoEcHtml(doc) {
    try {
        const defNodes = doc.querySelectorAll('#phrsListTab .trans-container ul li');
        if (!defNodes || !defNodes.length) return null;

        const expression = getText(doc.querySelector('#phrsListTab .wordbook-js .keyword'));
        if (!expression) return null;

        let definition = '<ul class="ec">';
        for (const defNode of defNodes) {
            const text = getText(defNode);
            if (text) {
                definition += `<li>${escapeHtml(text)}</li>`;
            }
        }
        definition += '</ul>';

        return {
            expression,
            reading: '',
            definitions: [definition],
            audios: [
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=1`,
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=2`
            ]
        };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Error parsing EC:`, error.message);
        return null;
    }
}

/**
 * Parse web definitions section
 */
function parseWebDefinitionsHtml(doc) {
    try {
        const webNode = doc.querySelector('#webResult');
        if (!webNode) return null;

        const expression = getText(doc.querySelector('h1'));
        if (!expression) return null;

        let definition = '<div>';
        const items = doc.querySelectorAll('#webResult .web-item, #webResult .web-section');
        if (items && items.length > 0) {
            definition += '<ul class="web">';
            for (let i = 0; i < Math.min(items.length, 5); i++) {
                const text = getText(items[i]);
                if (text) {
                    definition += `<li>${escapeHtml(text)}</li>`;
                }
            }
            definition += '</ul>';
        }
        definition += '</div>';

        return {
            expression,
            reading: '',
            definitions: [definition]
        };
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] Error parsing web definitions:`, error.message);
        return null;
    }
}

/**
 * Get text content from a node
 */
function getText(node) {
    if (!node) return '';
    return node.innerText.trim();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
