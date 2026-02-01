// @ts-nocheck
const { runYtDlpJson } = require('./ytDlp');
const { normalizeTitle } = require('./textUtils');
const db = require('./db');

/**
 * Busca metadados do yt-dlp de forma assíncrona
 */
async function fetchMetadataAsync(videoId: string) {
    const url = `https://youtube.com/watch?v=${videoId}`;

    try {
        const data = await runYtDlpJson([
            '--dump-json',
            '--no-playlist',
            url
        ]);

        return {
            artist: data.artist || null,
            track: data.track || null,
            album: data.album || null,
            uploader: data.uploader || null,
            channel: data.channel || null,
            title: data.title
        };
    } catch (err) {
        console.error(`[METADATA] Erro ao buscar metadados do yt-dlp para ${videoId}:`, err.message);
        return null;
    }
}

/**
 * Extrai artist e track do título usando parsing
 * Estratégia de fallback em cascata
 */
function extractMetadataFromTitle(title: string, uploader: string | null) {
    let artist = null;
    let track = null;

    // Tentar parsing do título "Artista - Música"
    const clean = normalizeTitle(title);
    const parts = clean.split(' - ');

    if (parts.length >= 2) {
        artist = parts[0].trim();
        track = parts.slice(1).join(' - ').trim();
    }

    // Fallback: usar uploader como artist
    if (!artist && uploader) {
        artist = uploader;
    }

    // Fallback: usar title como track
    if (!track && title) {
        track = title;
    }

    return { artist, track };
}

/**
 * Atualiza metadados de uma música de forma assíncrona
 * Busca do yt-dlp, aplica fallbacks, atualiza banco e emite evento
 */
async function updateMetadataAsync(videoId: string) {
    try {
        console.log(`[METADATA] Iniciando busca assíncrona para ${videoId}...`);

        // Buscar metadados do yt-dlp
        const metadata = await fetchMetadataAsync(videoId);

        if (!metadata) {
            console.log(`[METADATA] Não foi possível buscar metadados para ${videoId}`);
            return null;
        }

        let finalArtist = metadata.artist;
        let finalTrack = metadata.track;

        // Se não houver metadados nativos, fazer parsing
        if (!finalArtist || !finalTrack) {
            const extracted = extractMetadataFromTitle(
                metadata.title,
                metadata.uploader
            );
            finalArtist = finalArtist || extracted.artist;
            finalTrack = finalTrack || extracted.track;
        }

        // Atualizar banco de dados
        db.updateSongMeta(videoId, {
            title: metadata.title,
            artist: finalArtist,
            track: finalTrack
        });

        console.log(`[METADATA] ✅ Atualizado: ${finalArtist} - ${finalTrack}`);

        const result = {
            videoId,
            title: metadata.title,
            artist: finalArtist,
            track: finalTrack,
            album: metadata.album
        };

        // Emitir evento para atualizar embed do Discord
        const EventEmitter = require('events');
        const metadataEmitter = global.metadataEmitter || new EventEmitter();
        global.metadataEmitter = metadataEmitter;
        metadataEmitter.emit('metadataUpdated', result);

        return result;

    } catch (err) {
        console.error(`[METADATA] Erro ao atualizar metadados para ${videoId}:`, err);
        return null;
    }
}

module.exports = {
    updateMetadataAsync,
    fetchMetadataAsync,
    extractMetadataFromTitle
};
