// @ts-nocheck
/**
 * Exemplo de uso do DownloadBatcher
 * Integração prática com o comando play/mix
 */

const DownloadBatcher = require('./downloadBatcher');
const downloadManager = require('./download');
const queueManager = require('./queueManager');

// Singleton batcher compartilhado entre todos os comandos
const batcher = new DownloadBatcher({
  maxConcurrent: 4,
  maxRetries: 2,
  retryDelay: 1000
});

/**
 * Exemplo 1: Play simples com batcher
 */
async function playWithBatcher(guildId, voiceChannel, textChannel, resolvedSongs) {
  console.log(`[PLAY-BATCHER] Processing ${resolvedSongs.length} songs com batcher`);

  for (const song of resolvedSongs) {
    batcher.enqueue({
      song,
      guildId,
      onSuccess: async (file) => {
        // Música foi baixada com sucesso
        try {
          await queueManager.addToQueue(guildId, {
            videoId: song.videoId,
            title: song.title,
            file,
            url: song.url,
            fromCache: false
          }, voiceChannel);
          
          console.log(`[PLAY-BATCHER] ✅ Queued: ${song.title}`);
        } catch (err) {
          console.error(`[PLAY-BATCHER] Erro ao enfileirar:`, err.message);
        }
      },
      onError: (error) => {
        // Download falhou após retries
        console.error(`[PLAY-BATCHER] ❌ Download falhou: ${song.title} - ${error.message}`);
        textChannel.send(`❌ | Não consegui baixar: **${song.title}**`).catch(() => {});
      },
      onRetry: (attempt) => {
        console.log(`[PLAY-BATCHER] 🔄 Retry ${attempt}: ${song.title}`);
      },
      maxRetries: 2
    });
  }

  // Retorna imediatamente - processamento em background!
  console.log(`[PLAY-BATCHER] Todas as ${resolvedSongs.length} tasks enfileiradas. Processamento em background.`);
}

/**
 * Exemplo 2: Mix com batcher (integração com basemix.ts)
 */
async function mixWithBatcher(guildId, voiceChannel, textChannel, recommendedSongs) {
  console.log(`[MIX-BATCHER] Processing ${recommendedSongs.length} recommended songs`);

  let successCount = 0;
  let failureCount = 0;

  for (const song of recommendedSongs) {
    batcher.enqueue({
      song,
      guildId,
      onSuccess: async (file) => {
        successCount++;
        await queueManager.addToQueue(guildId, {
          videoId: song.videoId,
          title: song.title,
          file,
          url: song.url,
          fromCache: false
        }, voiceChannel);
        
        console.log(`[MIX-BATCHER] ✅ ${successCount}/${recommendedSongs.length}: ${song.title}`);
      },
      onError: (error) => {
        failureCount++;
        console.error(`[MIX-BATCHER] ❌ ${failureCount} falhas`);
      },
      maxRetries: 2
    });
  }

  // Monitorar progresso em tempo real
  const monitor = setInterval(() => {
    const status = batcher.getStatus();
    console.log(`[MIX-BATCHER] Status:`, status);
    
    // Se terminado, para monitoring
    if (status.queueSize === 0 && status.activeDownloads === 0 && status.retrying === 0) {
      clearInterval(monitor);
      console.log(`[MIX-BATCHER] Completo! ✅: ${successCount}, ❌: ${failureCount}`);
    }
  }, 2000);
}

/**
 * Exemplo 3: Monitorar status do batcher
 */
function getBatcherStatus() {
  return batcher.getStatus();
}

/**
 * Exemplo 4: Limpar fila (útil em case de erro crítico)
 */
function clearBatcher() {
  return batcher.clear();
}

module.exports = {
  batcher,
  playWithBatcher,
  mixWithBatcher,
  getBatcherStatus,
  clearBatcher
};
