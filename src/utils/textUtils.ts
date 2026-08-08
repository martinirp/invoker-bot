// @ts-nocheck
/**
 * Shared text normalization utilities
 */

function normalize(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    return text
        .toLowerCase()
        .split(/\s+/)
        .filter(t => t.length >= 3);
}

function normalizeTitle(title) {    return title
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\bofficial\b/g, '')
        .replace(/\bmusic\b/g, '')
        .replace(/\bvideo\b/g, '')
        .replace(/\bremastered\b/g, '')
        .replace(/\blyrics?\b/g, '')
        .replace(/\blive\b/g, '')
        .replace(/\bhd\b/g, '')
        .replace(/–|—/g, '-')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

module.exports = { normalize, tokenize, normalizeTitle, formatBytes };
