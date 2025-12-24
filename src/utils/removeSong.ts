// @ts-nocheck
const fs = require('fs');
const path = require('path');
const db = require('./db');

function removeSongCompletely(videoId) {
  const song = db.getByVideoId(videoId);
  if (!song || !song.file) return false;

  // caminho ABSOLUTO (obrigatório)
  const absoluteFile = path.resolve(song.file);
  const dir = path.dirname(absoluteFile);

  // Remove the file if it exists
  try {
    if (fs.existsSync(absoluteFile)) {
      fs.unlinkSync(absoluteFile);
      console.log(`[CACHE] arquivo removido: ${absoluteFile}`);
    }
  } catch (e) {
    console.error('[CACHE] erro ao remover arquivo:', absoluteFile, e && e.message);
  }

  // Remove parent directories only if empty (to avoid deleting sibling caches unexpectedly)
  try {
    let cur = dir;
    // don't climb above the repo root
    const repoRoot = path.resolve(__dirname, '..');
    while (cur.startsWith(repoRoot)) {
      const files = fs.readdirSync(cur);
      if (files.length === 0) {
        fs.rmdirSync(cur);
        console.log(`[CACHE] diretório vazio removido: ${cur}`);
        cur = path.dirname(cur);
      } else {
        break;
      }
    }
  } catch (e) {
    // ignore errors when trying to remove dirs (they may not be empty or permissions)
  }

  db.deleteSong(videoId);
  return true;
}

module.exports = { removeSongCompletely };


