// @ts-nocheck
const db = require('./db');

// In-memory cache para resolução rápida (YouTube → videoId)
const memCache = new Map(); // { query: { videoId, title, timestamp } }
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function resolveWithCache(query, resolver) {
  // 1️⃣ Check mem cache
  const cached = memCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[CACHE-RESOLVE] HIT (mem): ${query} → ${cached.videoId}`);
    return cached;
  }

  // 2️⃣ Check DB
  const dbEntry = db.findByKey(query);
  if (dbEntry) {
    const song = db.getByVideoId(dbEntry.videoId);
    if (song) {
      memCache.set(query, { videoId: song.videoId, title: song.title, timestamp: Date.now() });
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
        memCache.set(query, { ...result, timestamp: Date.now() });
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

// Clear old cache entries
function clearOldCache() {
  const now = Date.now();
  for (const [key, val] of memCache.entries()) {
    if (now - val.timestamp > CACHE_TTL_MS) {
      memCache.delete(key);
    }
  }
  console.log(`[CACHE-RESOLVE] Cleared old entries, current size: ${memCache.size}`);
}

// Periodically clean cache
setInterval(clearOldCache, 6 * 60 * 60 * 1000); // every 6 hours

module.exports = { resolveWithCache, resolveParallel };
