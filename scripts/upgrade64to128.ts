// scripts/upgrade64to128.ts
// Atualiza músicas de 64kbps para 128kbps e mostra status de cada uma

const fs = require('fs');
const path = require('path');
const db = require('../src/utils/db');
const { downloadAudio } = require('../src/utils/ytDlp');

const musicCacheDir = path.join(__dirname, '..', 'music_cache_opus');

function getAudioPath(videoId: string, bitrate: number) {
  return path.join(musicCacheDir, `${videoId}_${bitrate}k.opus`);
}

async function main() {
  const songs = db.getAllSongs();
  for (const song of songs) {
    const videoId = song.videoId;
    const file64 = getAudioPath(videoId, 64);
    const file128 = getAudioPath(videoId, 128);

    if (fs.existsSync(file128)) {
      console.log(`[SKIP] ${videoId} já está em 128kbps.`);
      continue;
    }
    if (fs.existsSync(file64)) {
      console.log(`[UPGRADE] Baixando 128kbps para ${videoId}...`);
      try {
        await downloadAudio(videoId, 128, file128);
        db.updateSongFile(videoId, file128);
        db.markSongUpdated(videoId);
        console.log(`[OK] ${videoId} atualizado para 128kbps.`);
      } catch (e) {
        console.warn(`[ERRO] Falha ao atualizar ${videoId}:`, e.message);
      }
    } else {
      console.log(`[MISS] ${videoId} não possui arquivo 64kbps.`);
    }
  }
  console.log('Upgrade concluído.');
}

main();
