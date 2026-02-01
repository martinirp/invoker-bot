// scripts/forceUpgradeAllTo128.ts
// Força baixar/substituir 128kbps para todas as músicas do banco, mostra estatísticas

const fs = require('fs');
const path = require('path');
const db = require('../src/utils/db');
const { downloadAudio } = require('../src/utils/ytDlp');

const musicCacheDir = path.join(__dirname, '..', 'music_cache_opus');

function getAudioPath(videoId, bitrate) {
  return path.join(musicCacheDir, `${videoId}_${bitrate}k.opus`);
}

async function baixarSempre128(videoId) {
  const file128 = getAudioPath(videoId, 128);
  try {
    await downloadAudio(videoId, 128, file128);
    db.updateSongFile(videoId, file128);
    db.markSongUpdated(videoId);
    return true;
  } catch (e) {
    console.warn(`[ERRO] Falha ao baixar/substituir 128kbps para ${videoId}:`, e.message);
    return false;
  }
}

async function main() {
  const songs = db.getAllSongs();
  let countNoFile = 0;
  let count64 = 0;
  let count128 = 0;
  let countAtualizadas = 0;

  for (const song of songs) {
    const videoId = song.videoId;
    const file64 = getAudioPath(videoId, 64);
    const file128 = getAudioPath(videoId, 128);
    const has64 = fs.existsSync(file64);
    const has128 = fs.existsSync(file128);

    if (!has64 && !has128) {
      console.log(`[MISS] ${videoId} não possui nenhum arquivo de áudio.`);
      countNoFile++;
    }
    if (has64) count64++;
    if (has128) count128++;

    // Sempre baixa/substitui 128kbps para todas as músicas
    console.log(`[FORCE] Baixando/substituindo 128kbps para ${videoId}...`);
    if (await baixarSempre128(videoId)) countAtualizadas++;
  }

  console.log('--- Estatísticas ---');
  console.log(`Total de músicas: ${songs.length}`);
  console.log(`Sem arquivo: ${countNoFile}`);
  console.log(`Com 64kbps: ${count64}`);
  console.log(`Com 128kbps: ${count128}`);
  console.log(`Atualizadas para 128kbps nesta execução: ${countAtualizadas}`);
  console.log('Upgrade concluído.');
}

main();
