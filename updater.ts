// updater.ts
// Atualizador assíncrono: baixa áudios ausentes ou faz upgrade de qualidade, rodando em background

const fs = require('fs');
const path = require('path');
const db = require('./src/utils/db');
const { downloadAudio, runYtDlpJson } = require('./src/utils/ytDlp');
const { fetchYoutubeMeta, fetchLastfmMeta } = require('./src/utils/metaFetcher.js');
const musicCacheDir = path.join(__dirname, 'music_cache_opus');

function getAudioPath(videoId, bitrate = 128) {
  // Ajuste conforme seu padrão de nome de arquivo
  return path.join(musicCacheDir, `${videoId}_${bitrate}k.opus`);
}

async function upgradeAll() {
  const songs = db.getAllSongs();
  const atualizadas = [];
  const pendentes = [];
  const metaAtualizados = [];
  const metaNaoEncontrados = [];
  // Lista inicial de músicas pendentes
  const atualizadasInit = songs.filter(song => {
    const videoId = song.videoId;
    const file128 = getAudioPath(videoId, 128);
    return fs.existsSync(file128);
  });
  const pendentesInit = songs.length - atualizadasInit.length;
  console.log(`Músicas atualizadas: ${atualizadasInit.length}`);
  console.log(`Músicas pendentes para atualizar: ${pendentesInit}`);

  for (const [idx, song] of songs.entries()) {
    // Loga sempre qual música está sendo processada
    const videoId = song.videoId;
    let ytMeta = null;
    try {
      ytMeta = await runYtDlpJson(['-j', `https://youtube.com/watch?v=${videoId}`]);
    } catch {}
    const title = ytMeta?.title || song.title || '(sem título)';
    console.log(`[Processando] ${idx + 1}/${songs.length}: ${title} (${videoId})`);
    const channel = ytMeta?.channel || ytMeta?.uploader || song.artist || '';
    const file64 = getAudioPath(videoId, 64);
    const file128 = getAudioPath(videoId, 128);
    const isPlaying = false; // TODO: Integrar com player para checar se está tocando

    let atualizou = false;

    // Se não existe arquivo 128kbps e não está tocando, faz upgrade
    if (fs.existsSync(file64) && !fs.existsSync(file128) && !isPlaying) {
      // Pula se já foi processada
      if (db.isSongUpdated(videoId)) {
        continue;
      }
      try {
        console.log(`Baixando versão 128kbps para ${videoId} - ${title}...`);
        await downloadAudio(videoId, 128, file128);
        db.updateSongFile(videoId, file128);
        // Atualiza metadados
        let meta = await fetchYoutubeMeta(videoId);
        if (!meta) meta = await fetchLastfmMeta(title);
        // Se yt-dlp trouxe dados, prioriza
        if (ytMeta) {
          meta = {
            title: ytMeta.title,
            artist: channel,
            track: ytMeta.title
          };
        }
        if (meta) {
          db.updateSongMeta(videoId, meta);
          console.log(`Metadados atualizados para ${videoId}:`, meta);
          metaAtualizados.push(`${title} (${videoId})`);
        } else {
          console.log(`Metadados não encontrados para ${videoId}`);
          metaNaoEncontrados.push(`${title} (${videoId})`);
        }
        console.log(`Upgrade concluído para ${videoId} - ${title}`);
        atualizadas.push(`${title} (${videoId})`);
        atualizou = true;
      } catch (e) {
        console.warn(`Falha ao fazer upgrade de ${videoId} - ${title}:`, e.message);
      }
    }
    // Se não existe nenhum arquivo, baixa o 128kbps
    if (!fs.existsSync(file64) && !fs.existsSync(file128)) {
      try {
        console.log(`Baixando áudio 128kbps para ${videoId} - ${title} (ausente)...`);
        await downloadAudio(videoId, 128, file128);
        db.updateSongFile(videoId, file128);
        // Atualiza metadados
        let meta = await fetchYoutubeMeta(videoId);
        if (!meta) meta = await fetchLastfmMeta(title);
        // Se yt-dlp trouxe dados, prioriza
        if (ytMeta) {
          meta = {
            title: ytMeta.title,
            artist: channel,
            track: ytMeta.title
          };
        }
        if (meta) {
          db.updateSongMeta(videoId, meta);
          console.log(`Metadados atualizados para ${videoId}:`, meta);
          metaAtualizados.push(`${title} (${videoId})`);
        } else {
          console.log(`Metadados não encontrados para ${videoId}`);
          metaNaoEncontrados.push(`${title} (${videoId})`);
        }
        console.log(`Download concluído para ${videoId} - ${title}`);
        atualizadas.push(`${title} (${videoId})`);
        atualizou = true;
      } catch (e) {
        console.warn(`Falha ao baixar ${videoId} - ${title}:`, e.message);
      }
    }
    // Se não atualizou, está pendente
    if (!atualizou && (!fs.existsSync(file128))) {
      pendentes.push(`${title} (${videoId})`);
    }
    // Progresso a cada 5 músicas atualizadas
    if (atualizadas.length > 0 && atualizadas.length % 5 === 0) {
      console.log(`[Progresso] ${atualizadas.length} músicas atualizadas:`, atualizadas.slice(-5).join(', '));
    }
  }
  console.log('Atualização de áudios concluída!');
  console.log('Músicas atualizadas:', atualizadas.length ? atualizadas.join(', ') : 'Nenhuma');
  console.log('Músicas pendentes:', pendentes.length ? pendentes.join(', ') : 'Nenhuma');
  console.log('Metadados atualizados:', metaAtualizados.length ? metaAtualizados.join(', ') : 'Nenhuma');
  console.log('Metadados não encontrados:', metaNaoEncontrados.length ? metaNaoEncontrados.join(', ') : 'Nenhuma');
}

// Para rodar em background, basta chamar upgradeAll() de forma assíncrona no start.ts
upgradeAll();
    // Marca como processada no banco
    db.markSongUpdated(videoId);
