/**
 * Atualiza metadados de uma música pelo videoId.
 * @param {string} videoId
 * @param {object} meta - { title, artist, track }
 */
function updateSongMeta(videoId, meta) {
  const artistNorm = meta.artist ? normalizeKey(meta.artist) : null;
  const trackNorm = meta.track ? normalizeKey(meta.track) : null;

  db.prepare(`
    UPDATE songs 
    SET title = ?, artist = ?, track = ?, 
        artist_normalized = ?, track_normalized = ?
    WHERE videoId = ?
  `).run(
    meta.title || null,
    meta.artist || null,
    meta.track || null,
    artistNorm,
    trackNorm,
    videoId
  );
}
// Observação: erros de variáveis não declaradas em outros arquivos (ex: updater.ts) indicam ausência no escopo local de uso, não necessariamente no projeto inteiro.
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.MUSIC_DB_PATH || path.join(__dirname, 'music.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// =========================
// 🔧 NORMALIZAÇÃO
// =========================
function normalizeKey(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// =========================
// INIT
// =========================
db.prepare(`
  CREATE TABLE IF NOT EXISTS songs (
    videoId TEXT PRIMARY KEY,
    title TEXT,
    artist TEXT,
    track TEXT,
    file TEXT,
    createdAt INTEGER,
    updated INTEGER DEFAULT 0
  )
`).run();

// MIGRATION: Adicionar coluna bitrate se não existir
try {
  db.prepare('ALTER TABLE songs ADD COLUMN bitrate INTEGER').run();
} catch (e) {
  // Ignora erro se coluna já existe
}

// 🔥 NOVO: Adicionar colunas normalizadas para busca otimizada
try {
  db.prepare('ALTER TABLE songs ADD COLUMN artist_normalized TEXT').run();
} catch (e) {
  // Ignora se já existe
}

try {
  db.prepare('ALTER TABLE songs ADD COLUMN track_normalized TEXT').run();
} catch (e) {
  // Ignora se já existe
}

// 🔥 NOVO: Criar índices para performance de busca
db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_artist_normalized 
  ON songs(artist_normalized)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_track_normalized 
  ON songs(track_normalized)
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS search_keys (
    key TEXT,
    videoId TEXT
  )
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_search_keys_key
  ON search_keys(key)
`).run();

// =========================
// INSERTS
// =========================
function insertSong({ videoId, title, artist, track, file, bitrate }) {
  db.prepare(`
    INSERT OR IGNORE INTO songs
    (videoId, title, artist, track, file, createdAt, bitrate)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(videoId, title || null, artist || null, track || null, file, Date.now(), bitrate || null);
}

function insertKey(key, videoId) {
  const normalized = normalizeKey(key);
  db.prepare(`
    INSERT INTO search_keys (key, videoId)
    VALUES (?, ?)
  `).run(normalized, videoId);
}

// =========================
// UPDATE
/**
 * Marca uma música como processada (updated = 1).
 * @param {string} videoId
 */
function markSongUpdated(videoId) {
  db.prepare(`UPDATE songs SET updated = 1 WHERE videoId = ?`).run(videoId);
}

/**
 * Verifica se uma música já foi processada (updated = 1).
 * @param {string} videoId
 * @returns {boolean}
 */
function isSongUpdated(videoId) {
  const row = db.prepare(`SELECT updated FROM songs WHERE videoId = ?`).get(videoId);
  return !!(row && row.updated);
}
// =========================
/**
 * Atualiza o caminho do arquivo de áudio para um vídeo específico.
 * @param {string} videoId - ID do vídeo
 * @param {string} file - Caminho do arquivo de áudio
 */
function updateSongFile(videoId, file) {
  db.prepare(`
    UPDATE songs SET file = ? WHERE videoId = ?
  `).run(file, videoId);
}

function updateSongBitrate(videoId, bitrate) {
  const stmt = db.prepare('UPDATE songs SET bitrate = ? WHERE videoId = ?');
  stmt.run(bitrate, videoId);
}

// 🔥 FIX: Combined query to avoid redundant DB calls
function getSongWithKeys(videoId) {
  const song = getByVideoId(videoId);
  if (!song) return null;

  const keys = getKeysByVideoId(videoId);
  return { song, keys };
}

// =========================
// QUERIES
// =========================
function findByKey(key) {
  const normalized = normalizeKey(key);
  return db.prepare(`
    SELECT videoId FROM search_keys
    WHERE key = ?
    LIMIT 1
  `).get(normalized) || null;
}

// 🔥 NOVO: Busca inteligente por artist e track (order-independent)
/**
 * Busca músicas por artist e track com fuzzy matching
 * Funciona independente da ordem: "artist track" ou "track artist"
 * @param {string} query - Query completa do usuário
 * @returns {object|null} - Melhor match ou null
 */
function findByArtistTrack(query) {
  const queryNorm = normalizeKey(query);
  const words = queryNorm.split(' ').filter(w => w.length > 0);

  if (words.length < 2) return null;

  // Estratégia: buscar músicas onde TODAS as palavras aparecem em artist OU track
  // Isso funciona independente da ordem

  const conditions = words.map(() => `
    (artist_normalized LIKE ? OR track_normalized LIKE ?)
  `).join(' AND ');

  const params = words.flatMap(word => [`%${word}%`, `%${word}%`]);

  const sql = `
    SELECT *, 
      CASE
        -- Score 3: Todas palavras no artist E track
        WHEN ${words.map(() => `artist_normalized LIKE ?`).join(' AND ')}
         AND ${words.map(() => `track_normalized LIKE ?`).join(' AND ')} THEN 3
        -- Score 2: Metade das palavras no artist, metade no track
        WHEN artist_normalized IS NOT NULL AND track_normalized IS NOT NULL THEN 2
        -- Score 1: Todas palavras em um único campo
        ELSE 1
      END as score
    FROM songs
    WHERE ${conditions}
      AND artist_normalized IS NOT NULL 
      AND track_normalized IS NOT NULL
    ORDER BY score DESC, createdAt DESC
    LIMIT 1
  `;

  // Params para score calculation + params para WHERE clause
  const scoreParams = [...words.map(w => `%${w}%`), ...words.map(w => `%${w}%`)];
  const allParams = [...scoreParams, ...params];

  try {
    const result = db.prepare(sql).get(...allParams);
    if (result && result.score >= 1) {
      console.log(`[DB] findByArtistTrack HIT: "${result.artist} - ${result.track}" (score: ${result.score})`);
      return result;
    }
  } catch (err) {
    console.error('[DB] findByArtistTrack error:', err.message);
  }

  return null;
}

function getByVideoId(videoId) {
  return db.prepare(`
    SELECT * FROM songs
    WHERE videoId = ?
    LIMIT 1
  `).get(videoId);
}

// AJUSTE: Versão simplificada de getAllSongs()
function getAllSongs() {
  return db.prepare('SELECT * FROM songs').all();
}

// ADIÇÃO: Função para obter todas as chaves de um videoId
function getKeysByVideoId(videoId) {
  return db
    .prepare('SELECT key FROM search_keys WHERE videoId = ?')
    .all(videoId)
    .map(r => r.key);
}

// =========================
// 🔍 BUSCA MANUAL (LIB)
// =========================
function searchSongs(query) {
  const q = `%${query.toLowerCase()}%`;
  return db.prepare(`
    SELECT *
    FROM songs
    WHERE LOWER(title) LIKE ?
    ORDER BY createdAt DESC
    LIMIT 10
  `).all(q);
}

// =========================
// ❌ EXCLUSÃO COMPLETA
// =========================
function deleteSong(videoId) {
  db.prepare(`DELETE FROM songs WHERE videoId = ?`).run(videoId);
  db.prepare(`DELETE FROM search_keys WHERE videoId = ?`).run(videoId);
}

// ADIÇÃO: Função para limpar search_keys
function clearSearchKeys() {
  db.prepare('DELETE FROM search_keys').run();
}

module.exports = {
  getAllSongs,
  getByVideoId,
  insertSong,
  insertKey,
  findByKey,
  findByArtistTrack,  // 🔥 NOVO: Busca inteligente por artist/track
  getKeysByVideoId,
  updateSongFile,
  updateSongBitrate,
  updateSongMeta,
  getSongWithKeys,
  markSongUpdated,
  isSongUpdated,
  deleteSong,
  searchSongs,
  clearSearchKeys
};
