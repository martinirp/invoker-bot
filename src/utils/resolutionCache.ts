// @ts-nocheck
const db = require('./db');

// In-memory cache para resolução rápida (YouTube → videoId)
// Mantém indefinidamente enquanto arquivo estiver em cache (sem TTL)
const memCache = new Map(); // { query: { videoId, title } }

async function resolveWithCache(query, resolver) {
  // 1️⃣ Check mem cache (sem expiração)
  const cached = memCache.get(query);
  if (cached) {
    console.log(`[CACHE-RESOLVE] HIT (mem): ${query} → ${cached.videoId}`);
    return cached;
  }

  // 2️⃣ Check DB
  const dbEntry = db.findByKey(query);
  if (dbEntry) {
    const song = db.getByVideoId(dbEntry.videoId);
    if (song) {
      memCache.set(query, { videoId: song.videoId, title: song.title });
      console.log(`[CACHE-RESOLVE] HIT (db): ${query} → ${song.videoId}`);
      return { videoId: song.videoId, title: song.title };
    }
  }

  // 3️⃣ Resolve via provided resolver function with retry
  let lastError;
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await resolver(query);
      if (result && result.videoId) {
        memCache.set(query, { videoId: result.videoId, title: result.title });
        console.log(`[CACHE-RESOLVE] MISS → RESOLVED (attempt ${attempt + 1}): ${query} → ${result.videoId}`);
        return result;
      }
    } catch (err) {
      lastError = err;
      console.warn(`[CACHE-RESOLVE] attempt ${attempt + 1}/${maxRetries + 1} failed:`, err.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // exponential backoff
      }
    }
  }

  throw lastError || new Error(`Failed to resolve: ${query}`);
}

// Parallel resolution with concurrency limit
async function resolveParallel(queries, resolver, concurrency = 5) {
  const results = [];
  const errors = [];

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(q => resolveWithCache(q, resolver))
    );

    for (let j = 0; j < batchResults.length; j++) {
      if (batchResults[j].status === 'fulfilled') {
        results.push(batchResults[j].value);
      } else {
        errors.push({ query: batch[j], error: batchResults[j].reason });
        console.error(`[PARALLEL-RESOLVE] Error resolving "${batch[j]}":`, batchResults[j].reason.message);
      }
    }
  }

  return { results, errors };
}

module.exports = { resolveWithCache, resolveParallel };
