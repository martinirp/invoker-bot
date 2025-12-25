// updater.ts
// Atualizador assíncrono: baixa áudios ausentes ou faz upgrade de qualidade, rodando em background

const fs = require('fs');
const path = require('path');
const db = require('./src/utils/db');
const { downloadAudio } = require('./src/utils/ytDlp'); // Supondo função de download
const musicCacheDir = path.join(__dirname, 'music_cache_opus');

function getAudioPath(videoId, bitrate = 128) {
  // Ajuste conforme seu padrão de nome de arquivo
  return path.join(musicCacheDir, `${videoId}_${bitrate}k.opus`);
}

async function upgradeAll() {
  const songs = db.getAllSongs();
  for (const song of songs) {
    const videoId = song.videoId;
    const file64 = getAudioPath(videoId, 64);
    const file128 = getAudioPath(videoId, 128);
    const isPlaying = false; // TODO: Integrar com player para checar se está tocando

    // Se não existe arquivo 128kbps e não está tocando, faz upgrade
    if (fs.existsSync(file64) && !fs.existsSync(file128) && !isPlaying) {
      try {
        console.log(`Baixando versão 128kbps para ${videoId}...`);
        await downloadAudio(videoId, 128, file128);
        db.updateSongFile(videoId, file128); // Atualiza caminho no banco
        console.log(`Upgrade concluído para ${videoId}`);
      } catch (e) {
        console.warn(`Falha ao fazer upgrade de ${videoId}:`, e.message);
      }
    }
    // Se não existe nenhum arquivo, baixa o 128kbps
    if (!fs.existsSync(file64) && !fs.existsSync(file128)) {
      try {
        console.log(`Baixando áudio 128kbps para ${videoId} (ausente)...`);
        await downloadAudio(videoId, 128, file128);
        db.updateSongFile(videoId, file128);
        console.log(`Download concluído para ${videoId}`);
      } catch (e) {
        console.warn(`Falha ao baixar ${videoId}:`, e.message);
      }
    }
  }
  console.log('Atualização de áudios concluída!');
}

// Para rodar em background, basta chamar upgradeAll() de forma assíncrona no start.ts
upgradeAll();
