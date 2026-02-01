// @ts-nocheck
const db = require('./db');

// In-memory cache para buscas (songName → videoId, title, url)
// Sem TTL - vive enquanto o app rodar
const memCache = new Map();

interface CachedSong {
  videoId: string;
  title: string;
  url: string;
  artist?: string;
}

async function searchWithCache(query: string, searcher: (q: string) => Promise<CachedSong>): Promise<CachedSong | null> {
  // 1️⃣ Check mem cache
  const cached = memCache.get(query);
  if (cached) {
    console.log(`[SEARCH-CACHE] HIT (mem): "${query}" → ${cached.videoId}`);
    return cached;
  }

  // 2️⃣ Check DB (se já foi baixada antes)
  const dbEntry = db.findByKey(query);
  if (dbEntry) {
    const song = db.getByVideoId(dbEntry.videoId);
    if (song) {
      const result = {
        videoId: song.videoId,
        title: song.title,
        url: `https://www.youtube.com/watch?v=${song.videoId}`,
        artist: song.artist
      };
      memCache.set(query, result);
      console.log(`[SEARCH-CACHE] HIT (db): "${query}" → ${song.videoId}`);
      return result;
    }
  }

  // 3️⃣ Search via provided searcher function
  try {
    const result = await searcher(query);
    if (result && result.videoId) {
      memCache.set(query, result);
      console.log(`[SEARCH-CACHE] MISS → FOUND: "${query}" → ${result.videoId}`);
      return result;
    }
  } catch (err) {
    console.error(`[SEARCH-CACHE] Error searching "${query}":`, err.message);
  }

  return null;
}

// Batch search com cache (útil para mix)
async function batchSearch(queries: string[], searcher: (q: string) => Promise<CachedSong>, concurrency = 5) {
  const results: (CachedSong | null)[] = [];
  const errors: { query: string; error: Error }[] = [];

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(q => searchWithCache(q, searcher))
    );

    for (let j = 0; j < batchResults.length; j++) {
      if (batchResults[j].status === 'fulfilled') {
        results.push(batchResults[j].value);
      } else {
        errors.push({ query: batch[j], error: batchResults[j].reason });
        console.error(`[BATCH-SEARCH] Error searching "${batch[j]}":`, batchResults[j].reason.message);
        results.push(null);
      }
    }
  }

  return { results, errors };
}

function getCacheStats() {
  return {
    size: memCache.size,
    entries: Array.from(memCache.keys()).slice(0, 10) // primeiras 10
  };
}

function clearCache() {
  const size = memCache.size;
  memCache.clear();
  console.log(`[SEARCH-CACHE] Cache limpo (${size} entradas removidas)`);
}

module.exports = { searchWithCache, batchSearch, getCacheStats, clearCache };
