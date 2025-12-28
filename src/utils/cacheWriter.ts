// @ts-nocheck
const fs = require('fs');
const path = require('path');
const cachePath = require('./cachePath');
const db = require('./db');
const { normalizeTitle } = require('./textUtils'); // 🔥 FIX: Import shared utils

function generateKeysFromTitle(title) {
  const clean = normalizeTitle(title);
  const parts = clean.split(' - ');

  const keys = new Set();

  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const track = parts.slice(1).join(' - ').trim();

    keys.add(`${artist} ${track}`);
    keys.add(`${track} ${artist}`);
    keys.add(artist);
    keys.add(track);
  } else {
    keys.add(clean);
  }

  return keys;
}

function writeCache(videoId, title, stream, onFinish, streamUrl = null) {
  const file = cachePath(videoId);
  const dir = path.dirname(file);
  const tempFile = `${file}.part`;

  if (fs.existsSync(file)) {
    onFinish?.();
    return;
  }

  fs.mkdirSync(dir, { recursive: true });

  console.log(`[CACHE] iniciando gravação: ${file}`);

  const out = fs.createWriteStream(tempFile);
  let completed = false;

  stream.pipe(out);

  out.on('finish', () => {
    completed = true;

    // move .part → final para evitar cache corrompido
    try {
      console.log(`[CACHE] renomeando .part → final: ${tempFile} -> ${file}`);
      fs.renameSync(tempFile, file);
    } catch (err) {
      console.error('[CACHE] erro ao renomear arquivo:', err);
      try { fs.unlinkSync(tempFile); } catch { }
      onFinish?.();
      return;
    }

    const keys = generateKeysFromTitle(title);
    keys.add(videoId);

    // 🔥 NOVO: Salvar dados mínimos no banco (rápido, não bloqueia)
    db.insertSong({
      videoId,
      title,
      artist: null,  // Será atualizado de forma assíncrona
      track: null,   // Será atualizado de forma assíncrona
      file,
      streamUrl: streamUrl || null
    });

    for (const k of keys) {
      db.insertKey(k, videoId);
    }

    console.log(`[CACHE] finalizado: ${file}`);

    // 🔥 NOVO: Buscar metadados de forma assíncrona (não bloqueia reprodução)
    const { updateMetadataAsync } = require('./metadataFetcher');
    updateMetadataAsync(videoId).catch(err => {
      console.error('[METADATA] Erro na atualização assíncrona:', err);
    });

    onFinish?.();
  });

  out.on('close', () => {
    if (!completed && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
      console.log('[CACHE] arquivo parcial descartado');
    }
  });

  out.on('error', err => {
    console.error('[CACHE] erro:', err);
  });
}

module.exports = { writeCache };


