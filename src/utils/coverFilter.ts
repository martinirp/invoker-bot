// @ts-nocheck
/**
 * coverFilter.ts
 * 
 * Detecta e filtra covers de músicas.
 * Só permite covers se o usuário explicitamente pediu na query.
 */

// Padrões comuns que indicam que um vídeo é um cover
const COVER_PATTERNS = [
    /\bcover\b/i,
    /\[cover\]/i,
    /\(cover\)/i,
    /\bmetal cover\b/i,
    /\bacoustic cover\b/i,
    /\bpiano cover\b/i,
    /\bguitar cover\b/i,
    /\bbanjo cover\b/i,
    /\bdrum cover\b/i,
    /\bvocal cover\b/i,
    /\binstrumental cover\b/i,
    /\bkaraoke\b/i,
    /\btribute\b/i,
    /\bin the style of\b/i,
    /\bcovers\b/i
];

/**
 * Verifica se um título de vídeo parece ser um cover
 * @param {string} title - Título do vídeo
 * @returns {boolean} - true se parece ser um cover
 */
function isCover(title) {
    if (!title) return false;

    return COVER_PATTERNS.some(pattern => pattern.test(title));
}

/**
 * Verifica se a query do usuário pede explicitamente um cover
 * @param {string} query - Query de busca do usuário
 * @returns {boolean} - true se o usuário quer um cover
 */
function queriesForCover(query) {
    if (!query) return false;

    // Normaliza a query
    const normalized = query.toLowerCase().trim();

    // Verifica se contém a palavra "cover" ou variações
    return /\bcover\b/.test(normalized) ||
        /\bcovers\b/.test(normalized) ||
        /\bkaraoke\b/.test(normalized);
}

/**
 * Filtra um resultado de vídeo baseado na intenção do usuário
 * @param {Object} video - Objeto com pelo menos { title: string }
 * @param {string} query - Query original do usuário
 * @returns {boolean} - true se o vídeo deve ser mantido, false se deve ser filtrado
 */
function shouldKeepVideo(video, query) {
    if (!video || !video.title) return true; // Se não tem título, mantém por segurança

    const videoIsCover = isCover(video.title);
    const userWantsCover = queriesForCover(query);

    // Se o vídeo é um cover mas o usuário não pediu cover, filtra
    if (videoIsCover && !userWantsCover) {
        console.log(`[COVER-FILTER] 🚫 Filtrando cover: "${video.title}"`);
        return false;
    }

    // Caso contrário, mantém o vídeo
    return true;
}

/**
 * Filtra uma lista de vídeos removendo covers não solicitados
 * @param {Array} videos - Array de vídeos
 * @param {string} query - Query original do usuário
 * @returns {Array} - Array filtrado
 */
function filterCovers(videos, query) {
    if (!Array.isArray(videos)) return videos;

    return videos.filter(video => shouldKeepVideo(video, query));
}

module.exports = {
    isCover,
    queriesForCover,
    shouldKeepVideo,
    filterCovers
};
