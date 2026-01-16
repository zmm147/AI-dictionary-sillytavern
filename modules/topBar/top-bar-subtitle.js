/**
 * AI Dictionary - Top Bar Subtitle Parsing
 * Subtitle file parsing and format conversion
 */

/**
 * Normalize subtitle text for display.
 * Converts WebVTT <br> tags into actual line breaks.
 * @param {string} text
 * @returns {string}
 */
export function normalizeSubtitleText(text) {
    if (!text) return '';
    return text.replace(/<br\s*\/?>/gi, '\n');
}

/**
 * Parse VTT timestamp to seconds
 * @param {string} timestamp - Format: HH:MM:SS.mmm or MM:SS.mmm
 * @returns {number}
 */
export function parseTimestamp(timestamp) {
    const parts = timestamp.split(':');
    let seconds = 0;

    if (parts.length === 3) {
        // HH:MM:SS.mmm
        seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
        // MM:SS.mmm
        seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }

    return seconds;
}

/**
 * Parse VTT content into cues array
 * @param {string} vttContent
 * @returns {Array<{start: number, end: number, text: string}>}
 */
export function parseVttCues(vttContent) {
    const cues = [];
    const lines = vttContent.split('\n');
    let i = 0;

    // Skip WEBVTT header
    while (i < lines.length && !lines[i].includes('-->')) {
        i++;
    }

    while (i < lines.length) {
        const line = lines[i].trim();

        // Look for timestamp line
        if (line.includes('-->')) {
            const [startStr, endStr] = line.split('-->').map(s => s.trim());
            const start = parseTimestamp(startStr);
            const end = parseTimestamp(endStr);

            // Collect text lines until empty line or next timestamp
            const textLines = [];
            i++;
            while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
                const textLine = normalizeSubtitleText(lines[i].trim());
                // Skip numeric cue identifiers
                if (!/^\d+$/.test(textLine)) {
                    textLines.push(textLine);
                }
                i++;
            }

            if (textLines.length > 0 && !isNaN(start) && !isNaN(end)) {
                cues.push({
                    start,
                    end,
                    text: textLines.join('\n')
                });
            }
        } else {
            i++;
        }
    }

    return cues;
}

/**
 * Convert SRT format to VTT format
 * @param {string} srtContent
 * @returns {string}
 */
export function convertSrtToVtt(srtContent) {
    // Add VTT header
    let vttContent = 'WEBVTT\n\n';

    // Replace SRT timestamp format (00:00:00,000) with VTT format (00:00:00.000)
    const converted = srtContent
        .replace(/\r\n/g, '\n')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

    vttContent += converted;
    return vttContent;
}

/**
 * Normalize VTT content to ensure proper format
 * @param {string} vttContent
 * @returns {string}
 */
export function normalizeVtt(vttContent) {
    // Remove BOM (Byte Order Mark) if present - this is often the cause of VTT loading issues
    let normalized = vttContent.replace(/^\uFEFF/, '');

    // Normalize line endings (Windows CRLF to LF)
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Trim whitespace
    normalized = normalized.trim();

    // Rebuild with clean WEBVTT header (same approach as SRT conversion)
    if (normalized.startsWith('WEBVTT')) {
        // Find where the header line ends
        const headerMatch = normalized.match(/^WEBVTT[^\n]*/);
        const headerLine = headerMatch ? headerMatch[0] : 'WEBVTT';
        const afterHeader = normalized.substring(headerLine.length).trim();

        // Rebuild with proper format: WEBVTT + blank line + content
        normalized = 'WEBVTT\n\n' + afterHeader;
    }

    return normalized;
}
