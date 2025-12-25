/**
 * Atualiza metadados de uma música pelo videoId.
 * @param {string} videoId
 * @param {object} meta - { title, artist, track }
 */
function updateSongMeta(videoId, meta) {
  db.prepare(`
    UPDATE songs SET title = ?, artist = ?, track = ? WHERE videoId = ?
  `).run(meta.title || null, meta.artist || null, meta.track || null, videoId);
}
// Observação: erros de variáveis não declaradas em outros arquivos (ex: updater.ts) indicam ausência no escopo local de uso, não necessariamente no projeto inteiro.
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'music.db');
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
function insertSong({ videoId, title, artist, track, file }) {
  db.prepare(`
    INSERT OR IGNORE INTO songs
    (videoId, title, artist, track, file, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(videoId, title || null, artist || null, track || null, file, Date.now());
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
  insertSong,
  insertKey,
  findByKey,
  getByVideoId,
  getAllSongs,
  getKeysByVideoId,
  searchSongs,
  deleteSong,
  clearSearchKeys,
  updateSongFile,
  updateSongMeta,
  markSongUpdated,
  isSongUpdated
};


