// Shared utility functions for the application

export const HEX_COLOR_PATTERN = /^#([0-9a-f]{6})$/i;

export function escapeHtml(str = '') {
    return str.replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

export function getReadableTextColor(hexColor) {
    const hex = (hexColor || '').replace('#', '');
    if (hex.length !== 6) {
        return '#1b1b1f';
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#1b1b1f' : '#fdfdfd';
}

export function normalizeCategories(list = []) {
    const seen = new Set();
    const result = [];
    list.forEach(category => {
        const value = (category || '').trim();
        if (!value) return;
        const key = value.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            result.push(value);
        }
    });
    return result;
}

export function getCategoryAppearance(category, categoryPalette = {}) {
    const name = (category || '').trim();
    if (!name) {
        return { classes: '', style: '' };
    }
    const paletteEntry = categoryPalette[name];
    if (paletteEntry) {
        const candidate = (paletteEntry.color || '').trim();
        if (candidate && HEX_COLOR_PATTERN.test(candidate)) {
            const textColor = getReadableTextColor(candidate);
            return {
                classes: 'has-custom-color',
                style: `--category-color:${candidate};--category-text-color:${textColor};`
            };
        }
    }
    const sum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colorNum = (sum % 8) + 1;
    return { classes: `category-${colorNum}`, style: '' };
}

export function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

/**
 * Extract hashtags from text
 * @param {string} text 
 * @returns {string[]} Array of unique normalized tags (without #)
 */
export function extractTags(text = '') {
    // Matches #tag, #complex-tag, #tag_123
    // Does not match mid-word like #not#tag
    const matches = text.match(/(?:^|\s)(#[a-zA-Z0-9_\-]+)/g);
    if (!matches) return [];

    // Clean up matches (remove leading space, remove #) and lowercase
    const tags = matches.map(tag => tag.trim().slice(1).toLowerCase());

    // Return unique tags
    return [...new Set(tags)];
}

/**
 * Format text content: escape HTML, linkify URLs, highlight tags, and formatting newlines
 * @param {string} text 
 * @returns {string} Formatted HTML
 */
export function formatTextContent(text = '') {
    if (!text) return '';

    // 1. Escape HTML
    let content = escapeHtml(text);

    // 2. Linkify URLs
    // Matches http://, https://, or www.
    // exclude trailing punctuation if it might be part of the sentence
    const urlRegex = /((https?:\/\/|www\.)[^\s<]+)/g;
    content = content.replace(urlRegex, (url) => {
        let href = url;
        if (!href.startsWith('http')) {
            href = 'http://' + href;
        }
        // Basic cleanup for trailing punctuation that likely isn't part of the URL
        // e.g. "Visit google.com." -> url is "google.com" (formatting might keep the dot outside)
        // For simplicity now, we just link what we matched.
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="idea-link">${url}</a>`;
    });

    // 3. Highlight Tags
    // Re-using logic from highlightTags but applying to the already escaped/linked content.
    // Caution: We must ensure we don't match things inside our new <a> tags.
    // The tag regex requires a leading space or start of string.
    // Our <a> tags start with <a ... which doesn't match space/#.
    // Content inside <a> might be #tag? "google.com/#tag" -> regex matches (#tag)?
    // The regex `(?:^|\s)(#[a-zA-Z0-9_\-]+)`
    // In "google.com/#tag", the char before # receives no space check if we are strictly looking for space.
    // It finds `/` before `#`. So it won't match.
    // "Check out #cool" -> matches.
    content = content.replace(/(?:^|\s)(#[a-zA-Z0-9_\-]+)/g, (match) => {
        const prefix = match.match(/^\s/);
        const space = prefix ? prefix[0] : '';
        const tag = match.trim();
        const tagName = tag.slice(1); // remove #
        return `${space}<span class="idea-tag" data-tag="${tagName.toLowerCase()}">${tag}</span>`;
    });

    // 4. Newlines
    content = content.replace(/\n/g, '<br>');

    return content;
}

/**
 * Wrap hashtags in text with span elements
 * @deprecated Use formatTextContent instead for full formatting
 * @param {string} text 
 * @returns {string} HTML string with tags highlighted
 */
export function highlightTags(text = '') {
    return formatTextContent(text);
}
