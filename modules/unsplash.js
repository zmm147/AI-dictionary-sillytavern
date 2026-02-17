/**
 * AI Dictionary - Unsplash Module
 * Unsplash API integration for word-related images
 */

import { escapeHtml } from './statistics.js';

// Unsplash API configuration
const UNSPLASH_ACCESS_KEY = 'pnCytZeB6k-bwgQyTydWOXnNJiZAcIEpUyC-K6C4buE';
const APP_NAME = 'AI-Dictionary';
const PHOTOS_PER_PAGE = 9;

/**
 * Search photos on Unsplash
 * @param {string} query - Search query
 * @param {number} page - Page number (default: 1)
 * @returns {Promise<Object>} - Search results
 */
export async function searchPhotos(query, page = 1) {
    try {
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${PHOTOS_PER_PAGE}&page=${page}&client_id=${UNSPLASH_ACCESS_KEY}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('[AI Dictionary] Unsplash search error:', error);
        throw error;
    }
}

/**
 * Trigger download event (required by Unsplash API guidelines)
 * @param {string} downloadLocation - Download location URL from photo object
 */
export async function triggerDownload(downloadLocation) {
    try {
        const url = `${downloadLocation}?client_id=${UNSPLASH_ACCESS_KEY}`;
        await fetch(url);
        console.log('[AI Dictionary] Unsplash download event triggered');
    } catch (error) {
        console.error('[AI Dictionary] Failed to trigger download event:', error);
    }
}

/**
 * Format photo attribution HTML
 * @param {Object} photo - Photo object from Unsplash API
 * @returns {string} - Attribution HTML
 */
export function formatAttribution(photo) {
    return `
        Photo by
        <a href="${photo.user.links.html}?utm_source=${APP_NAME}&utm_medium=referral"
           target="_blank"
           rel="noopener noreferrer">
            ${escapeHtml(photo.user.name)}
        </a>
        on
        <a href="https://unsplash.com?utm_source=${APP_NAME}&utm_medium=referral"
           target="_blank"
           rel="noopener noreferrer">
            Unsplash
        </a>
    `;
}

/**
 * Render photo grid HTML
 * @param {Array} photos - Array of photo objects
 * @param {string} word - Current word being looked up
 * @returns {string} - Photo grid HTML
 */
export function renderPhotoGrid(photos, word) {
    if (!photos || photos.length === 0) {
        return '<div class="ai-dict-unsplash-empty">未找到相关图片</div>';
    }

    let html = '<div class="ai-dict-unsplash-grid">';

    photos.forEach((photo, index) => {
        html += `
            <div class="ai-dict-unsplash-card" data-photo-index="${index}">
                <img
                    src="${photo.urls.small}"
                    alt="${escapeHtml(photo.alt_description || word)}"
                    loading="lazy"
                    class="ai-dict-unsplash-image"
                    data-photo-id="${photo.id}"
                    data-download-location="${photo.links.download_location}"
                    data-full-url="${photo.urls.regular}"
                >
                <div class="ai-dict-unsplash-attribution">
                    ${formatAttribution(photo)}
                </div>
                <button
                    class="ai-dict-unsplash-use-btn"
                    data-photo-id="${photo.id}"
                    data-download-location="${photo.links.download_location}"
                    data-full-url="${photo.urls.regular}"
                    data-photographer="${escapeHtml(photo.user.name)}"
                    title="使用此图片">
                    <i class="fa-solid fa-check"></i>
                </button>
            </div>
        `;
    });

    html += '</div>';
    return html;
}

/**
 * Initialize Unsplash functionality for a word
 * @param {string} word - Word to search images for
 */
export async function initializeUnsplash(word) {
    const unsplashBtn = document.getElementById('ai-dict-unsplash-btn');
    const unsplashContent = document.getElementById('ai-dict-unsplash-content');
    const unsplashStatus = document.querySelector('.ai-dict-unsplash-status');

    if (!unsplashBtn || !unsplashContent) return;

    let isExpanded = false;
    let currentPhotos = [];
    let currentPage = 1;
    let totalPages = 1;

    // Toggle button click
    unsplashBtn.addEventListener('click', async () => {
        isExpanded = !isExpanded;

        if (isExpanded) {
            unsplashContent.style.display = 'block';
            unsplashBtn.classList.add('active');

            // Load photos if not already loaded
            if (currentPhotos.length === 0) {
                await loadPhotos(word);
            }
        } else {
            unsplashContent.style.display = 'none';
            unsplashBtn.classList.remove('active');
        }
    });

    // Load photos function
    async function loadPhotos(query, page = 1) {
        if (unsplashStatus) {
            unsplashStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在加载图片...';
            unsplashStatus.style.display = 'block';
        }

        try {
            const data = await searchPhotos(query, page);
            currentPhotos = data.results;
            currentPage = page;
            totalPages = data.total_pages;

            if (currentPhotos.length === 0) {
                if (unsplashStatus) {
                    unsplashStatus.innerHTML = '未找到相关图片';
                }
                return;
            }

            // Hide status and show photos
            if (unsplashStatus) {
                unsplashStatus.style.display = 'none';
            }

            // Render photo grid
            const gridHtml = renderPhotoGrid(currentPhotos, word);
            const playerDiv = unsplashContent.querySelector('.ai-dict-unsplash-player');
            const gridContainer = playerDiv ? playerDiv.querySelector('.ai-dict-unsplash-grid-container') : null;

            if (playerDiv && gridContainer) {
                gridContainer.innerHTML = gridHtml;
                playerDiv.style.display = 'block';

                // Update pagination info
                updatePaginationInfo(data.total, currentPage, totalPages);

                // Bind photo click events
                bindPhotoEvents();
            }

        } catch (error) {
            console.error('[AI Dictionary] Failed to load Unsplash photos:', error);
            if (unsplashStatus) {
                unsplashStatus.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> 加载失败: ${error.message}`;
            }
        }
    }

    // Update pagination info
    function updatePaginationInfo(total, page, totalPages) {
        const counterDiv = unsplashContent.querySelector('.ai-dict-unsplash-counter');
        if (counterDiv) {
            counterDiv.textContent = `第 ${page} 页 / 共 ${totalPages} 页 (共 ${total} 张图片)`;
        }
    }

    // Bind photo click events
    function bindPhotoEvents() {
        // Image click - open in new tab
        const images = unsplashContent.querySelectorAll('.ai-dict-unsplash-image');
        images.forEach(img => {
            img.addEventListener('click', () => {
                const photoId = img.dataset.photoId;
                const photo = currentPhotos.find(p => p.id === photoId);
                if (photo) {
                    window.open(`${photo.links.html}?utm_source=${APP_NAME}&utm_medium=referral`, '_blank');
                }
            });
        });

        // Use button click - trigger download event
        const useButtons = unsplashContent.querySelectorAll('.ai-dict-unsplash-use-btn');
        useButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();

                const downloadLocation = btn.dataset.downloadLocation;
                const fullUrl = btn.dataset.fullUrl;
                const photographer = btn.dataset.photographer;

                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                try {
                    // Trigger download event (required by Unsplash)
                    await triggerDownload(downloadLocation);

                    // Show success feedback
                    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                    btn.classList.add('used');

                    // You can add custom logic here, e.g., save to settings
                    console.log('[AI Dictionary] Photo selected:', {
                        url: fullUrl,
                        photographer: photographer
                    });

                    // Optional: Show notification
                    setTimeout(() => {
                        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                        btn.disabled = false;
                    }, 1000);

                } catch (error) {
                    console.error('[AI Dictionary] Failed to use photo:', error);
                    btn.innerHTML = '<i class="fa-solid fa-times"></i>';
                    btn.disabled = false;
                }
            });
        });
    }

    // Pagination buttons
    const prevBtn = document.getElementById('ai-dict-unsplash-prev-btn');
    const nextBtn = document.getElementById('ai-dict-unsplash-next-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', async () => {
            if (currentPage > 1) {
                await loadPhotos(word, currentPage - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', async () => {
            if (currentPage < totalPages) {
                await loadPhotos(word, currentPage + 1);
            }
        });
    }
}
