// @ts-nocheck
/**
 * fastResolver.ts
 * 
 * Resolve queries MUITO mais rápido:
 * 1. Cache agressivo em memória (sem TTL)
 * 2. Parallel API calls (YouTube + Last.FM simultaneamente)
 * 3. Early return (não espera detalhes completos)
 * 4. Last.FM como hint (corrij erros de busca)
 */

const db = require('./db');
const { searchYouTube, searchYouTubeMultiple, getVideoDetails } = require('./youtubeApi');
const { runYtDlp } = require('./ytDlp');
const { shouldKeepVideo } = require('./coverFilter');
const axios = require('axios');

// ⚡ Cache em memória (persistente, sem TTL)
const memCache = new Map();

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ⚡ Resolve com estratégia de velocidade máxima
 * 
 * Retorna o MAIS RÁPIDO possível:
 * 1. Check memCache (0ms)
 * 2. Check DB (1-5ms)
 * 3. Parallel API calls (500-1000ms)
 * 4. Early return (não espera metadados completos)
 */
async function fastResolve(query, includeMetadata = false) {
  const normalized = normalize(query);
  const startTime = Date.now();

  console.log(`[FAST-RESOLVE] query: "${query}"`);

  // 1️⃣ CHECK MEMORY CACHE (instantâneo)
  if (memCache.has(normalized)) {
    const cached = memCache.get(normalized);
    console.log(`[FAST-RESOLVE] ✅ MEM CACHE HIT (${Date.now() - startTime}ms): ${cached.videoId}`);
    return cached;
  }

  // 2️⃣ CHECK DATABASE (muito rápido)
  const hit = db.findByKey(normalized);
  if (hit) {
    const song = db.getByVideoId(hit.videoId);
    if (song) {
      const result = {
        fromCache: true,
        videoId: hit.videoId,
        title: song.title,
        channel: song.artist || '',
        metadata: {
          title: song.title,
          channel: song.artist
        }
      };
      memCache.set(normalized, result);
      console.log(`[FAST-RESOLVE] ✅ DB HIT (${Date.now() - startTime}ms): ${hit.videoId}`);
      return result;
    }
  }

  // 3️⃣ PARALLEL RESOLUTION (YouTube API + Last.FM)
  console.log(`[FAST-RESOLVE] Cache miss → resolving em paralelo...`);

  const [ytResult, lfmQuery] = await Promise.all([
    searchYouTube(query).catch(e => {
      console.warn(`[FAST-RESOLVE] YouTube API erro:`, e.message);
      return null;
    }),
    getLastFMTrackName(query).catch(e => {
      console.warn(`[FAST-RESOLVE] Last.FM erro:`, e.message);
      return null;
    })
  ]);

  // 4️⃣ EARLY RETURN (não espera metadados completos)
  if (ytResult) {
    const result = {
      fromCache: false,
      videoId: ytResult.videoId,
      title: ytResult.title,
      channel: ytResult.channel || '',
      metadata: includeMetadata ? await getVideoDetails(ytResult.videoId).catch(() => null) : null
    };
    memCache.set(normalized, result);
    console.log(`[FAST-RESOLVE] ✅ YouTube resolveu (${Date.now() - startTime}ms): ${ytResult.videoId}`);
    return result;
  }

  // 5️⃣ FALLBACK: Usar Last.FM hint + yt-dlp
  if (lfmQuery) {
    console.log(`[FAST-RESOLVE] Tentando com Last.FM hint: "${lfmQuery}"`);
    try {
      const ytRetry = await searchYouTube(lfmQuery);
      if (ytRetry) {
        const result = {
          fromCache: false,
          videoId: ytRetry.videoId,
          title: ytRetry.title,
          channel: ytRetry.channel || '',
          metadata: includeMetadata ? await getVideoDetails(ytRetry.videoId).catch(() => null) : null
        };
        memCache.set(normalized, result);
        console.log(`[FAST-RESOLVE] ✅ Last.FM hint resolveu (${Date.now() - startTime}ms)`);
        return result;
      }
    } catch (e) {
      console.warn(`[FAST-RESOLVE] Last.FM hint falhou:`, e.message);
    }
  }

  // 6️⃣ ÚLTIMO RECURSO: yt-dlp (mais lento, mas confiável)
  console.log(`[FAST-RESOLVE] Último recurso: yt-dlp`);
  try {
    const args = [
      `ytsearch1:${query}`,
      '--skip-download',
      '--no-playlist',
      '--no-warnings',
      '--extractor-retries', '1',
      '--socket-timeout', '5',
      '--print', '%(id)s|||%(title)s'
    ];
    const { stdout } = await runYtDlp(args);

    if (stdout && stdout.trim()) {
      const [videoId, title] = stdout.trim().split('|||');

      // Verifica se deve manter este vídeo (filtra covers não solicitados)
      const video = { videoId, title };
      if (!shouldKeepVideo(video, query)) {
        console.log(`[FAST-RESOLVE] ❌ Vídeo filtrado (cover não solicitado)`);
        return null;
      }

      const result = {
        fromCache: false,
        videoId,
        title,
        channel: '',
        metadata: null
      };
      memCache.set(normalized, result);
      console.log(`[FAST-RESOLVE] ✅ yt-dlp resolveu (${Date.now() - startTime}ms)`);
      return result;
    }
  } catch (e) {
    console.error(`[FAST-RESOLVE] yt-dlp falhou:`, e.message);
  }

  console.error(`[FAST-RESOLVE] ❌ Falha ao resolver: ${query}`);
  return null;
}

/**
 * Get Last.FM track name (helps correct typos and find exact match)
 * Muito mais rápido que busca manual no YouTube
 */
async function getLastFMTrackName(query) {
  const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
  if (!LASTFM_API_KEY) return null;

  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(query)}&limit=1&api_key=${LASTFM_API_KEY}&format=json`;
    const res = await axios.get(url, { timeout: 3000 });

    const track = res.data?.results?.trackmatches?.track?.[0];
    if (track && track.name && track.artist) {
      return `${track.artist.name || track.artist} - ${track.name}`;
    }
  } catch (e) {
    console.warn(`[LASTFM] Erro:`, e.message);
  }

  return null;
}

/**
 * Batch resolve (múltiplas queries em paralelo)
 * Muito mais rápido para playlists/mix
 */
async function fastResolveBatch(queries, concurrency = 5) {
  const results = [];
  const errors = [];

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(q => fastResolve(q, false))
    );

    for (let j = 0; j < batchResults.length; j++) {
      if (batchResults[j].status === 'fulfilled' && batchResults[j].value) {
        results.push(batchResults[j].value);
      } else {
        errors.push({ query: batch[j], reason: batchResults[j].reason?.message });
        results.push(null);
      }
    }
  }

  return { results, errors };
}

/**
 * Limpa cache se necessário
 */
function getCacheStats() {
  return {
    size: memCache.size,
    entries: Array.from(memCache.keys()).slice(0, 20)
  };
}

function clearCache() {
  const size = memCache.size;
  memCache.clear();
  console.log(`[FAST-RESOLVE] Cache limpo (${size} entradas)`);
}

module.exports = {
  fastResolve,
  fastResolveBatch,
  getCacheStats,
  clearCache,
  normalize
};
