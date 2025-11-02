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
