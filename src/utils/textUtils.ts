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

function normalizeTitle(title) {
    return title
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

module.exports = { normalize, tokenize, normalizeTitle };
