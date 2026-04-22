// @ts-nocheck
const axios = require('axios');

/**
 * Detecta se é um link do Suno
 */
function isSunoLink(query) {
    if (!query || typeof query !== 'string') return false;
    return /suno\.com\/(s|song)\/[\w-]+/i.test(query);
}

/**
 * Extrai o ID da música do link Suno (short link ou song link)
 */
function extractSunoId(url) {
    const match = url.match(/suno\.com\/(?:s|song)\/([\w-]+)/i);
    return match ? match[1] : null;
}

/**
 * Resolve metadados de uma música Suno
 * Extrai dados diretamente do HTML SSR (Next.js RSC payload)
 */
async function resolveSunoTrack(url) {
    try {
        const sunoId = extractSunoId(url);
        if (!sunoId) {
            console.error('[SUNO] ID inválido na URL');
            return null;
        }

        console.log(`[SUNO] Resolvendo música: ${sunoId}`);

        // Buscar página HTML do Suno
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000
            });

            const html = response.data;

            // MÉTODO 1: Extrair do Next.js RSC payload (self.__next_f.push)
            // O Suno usa React Server Components e serializa os dados da música no HTML
            const audioUrlMatch = html.match(/"audio_url"\s*:\s*"(https?:\/\/[^"]+\.mp3)"/);
            const titleMatch = html.match(/"title"\s*:\s*"([^"]+)"/);
            const displayNameMatch = html.match(/"display_name"\s*:\s*"([^"]+)"/);
            const imageUrlMatch = html.match(/"image_url"\s*:\s*"(https?:\/\/[^"]+)"/);
            const imageLargeMatch = html.match(/"image_large_url"\s*:\s*"(https?:\/\/[^"]+)"/);

            if (audioUrlMatch) {
                const audioUrl = audioUrlMatch[1];
                const title = titleMatch ? titleMatch[1] : 'Música do Suno';
                const artist = displayNameMatch ? displayNameMatch[1] : 'Suno';
                const image = imageLargeMatch ? imageLargeMatch[1] : (imageUrlMatch ? imageUrlMatch[1] : null);

                console.log(`[SUNO] ✅ Audio URL encontrada: ${audioUrl}`);
                console.log(`[SUNO] ✅ Título: "${title}" por ${artist}`);

                return {
                    title,
                    artist,
                    image,
                    audioUrl,
                    sunoId: sunoId,
                    query: `${title} ${artist}`
                };
            }

            // MÉTODO 2: Fallback - tentar extrair do og:tags
            const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
            const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);

            const title = ogTitleMatch ? ogTitleMatch[1] : 'Música do Suno';
            const image = ogImageMatch ? ogImageMatch[1] : null;

            // MÉTODO 3: Tentar construir URL do CDN diretamente
            // Suno usa padrão: https://cdn1.suno.ai/<uuid>.mp3
            // Se o ID é um UUID, podemos tentar diretamente
            const uuidMatch = html.match(/suno\.com\/song\/([\w-]{36})/);
            const songUuid = uuidMatch ? uuidMatch[1] : null;
            
            // Também procurar o UUID no canonical link
            const canonicalMatch = html.match(/rel="canonical"\s+href="https:\/\/suno\.com\/song\/([\w-]{36})"/);
            const canonicalUuid = canonicalMatch ? canonicalMatch[1] : null;
            
            const finalUuid = songUuid || canonicalUuid;

            if (finalUuid) {
                const cdnUrl = `https://cdn1.suno.ai/${finalUuid}.mp3`;
                console.log(`[SUNO] ✅ Construindo URL do CDN: ${cdnUrl}`);

                return {
                    title,
                    artist: 'Suno',
                    image,
                    audioUrl: cdnUrl,
                    sunoId: sunoId,
                    query: title
                };
            }

            console.warn('[SUNO] Não foi possível encontrar audio_url no HTML');

            return {
                title,
                artist: 'Suno',
                image,
                audioUrl: null,
                sunoId: sunoId,
                query: title
            };
        } catch (scrapErr) {
            console.warn('[SUNO] Scraping falhou:', scrapErr.message);
        }

        // MÉTODO 4: Fallback final
        return {
            title: 'Música do Suno',
            artist: 'Suno',
            image: null,
            audioUrl: null,
            sunoId: sunoId,
            query: 'Música do Suno'
        };
    } catch (err) {
        console.error('[SUNO] Erro ao resolver:', err.message);
        return null;
    }
}

module.exports = {
    isSunoLink,
    extractSunoId,
    resolveSunoTrack
};
