// @ts-nocheck
const { runYtDlp } = require('../utils/ytDlp');
const fs = require('fs');
const path = require('path');

const { createEmbed } = require('../utils/embed');
const { searchMultiple } = require('../utils/dibuiador');
const { getVideoDetails } = require('../utils/youtubeApi');
const { fetchMetadataAsync } = require('../utils/metadataFetcher');

// Map global para armazenar mensagens de download pendentes
// messageId -> { detailed: [...], authorId: string }
if (!global.downloadPendingMessages) {
  global.downloadPendingMessages = new Map();
}

// usando wrapper seguro para yt-dlp

// =========================
// HELPERS
// =========================
function extractVideoId(input) {
  try {
    // youtu.be/ID
    if (input.includes('youtu.be')) {
      return input.split('youtu.be/')[1].split(/[?\&]/)[0];
    }

    // watch?v=ID
    const url = new URL(input);
    return url.searchParams.get('v');
  } catch {
    return null;
  }
}

function tempPath(videoId) {
  return path.join(
    __dirname,
    '..',
    'temp_downloads',
    `${videoId}.mp3`
  );
}

// =========================
// FUNÇÃO DE DOWNLOAD (usada tanto pelo comando quanto pelo handler de reações)
// =========================
async function performDownload(chosenVideoId, chosenTitle, textChannel) {
  const filePath = tempPath(chosenVideoId);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`[DL] baixando mp3 → ${chosenVideoId}`);

  const statusMsg = await textChannel.send({
    embeds: [
      createEmbed().setDescription('⬇️ Baixando áudio...')
    ]
  });

  try {
    // =========================
    // yt-dlp → MP3
    // =========================
    const args = ['-x', '--audio-format', 'mp3', '--no-playlist', '-o', filePath, `https://www.youtube.com/watch?v=${chosenVideoId}`];
    const { stdout } = await runYtDlp(args);

    // Buscar metadados para obter Artist e Track
    let finalFilename = chosenTitle || 'audio';

    try {
      const metadata = await fetchMetadataAsync(chosenVideoId);
      if (metadata && metadata.artist && metadata.track) {
        finalFilename = `${metadata.artist} - ${metadata.track}`;
      } else if (metadata && metadata.title) {
        finalFilename = metadata.title;
      }
    } catch (metaErr) {
      console.warn('[DL] Erro ao buscar metadados, usando título padrão:', metaErr.message);
    }

    await statusMsg.edit({
      embeds: [
        createEmbed()
          .setTitle('🎵 Download pronto')
          .setDescription(`**${finalFilename}**`)
      ]
    });

    await textChannel.send({
      files: [
        {
          attachment: filePath,
          name: `${finalFilename}.mp3`
        }
      ]
    });

  } catch (err) {
    console.error('[DL] erro:', err);

    await statusMsg.edit({
      embeds: [
        createEmbed().setDescription('❌ Erro ao baixar o áudio.')
      ]
    });
  } finally {
    // 🧹 remove arquivo temporário
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('[DL] arquivo temporário removido');
      }
    }, 5000);
  }
}

// =========================
// COMMAND
// =========================
module.exports = {
  name: 'dl',
  aliases: ['download'],
  description: 'Baixa um vídeo do YouTube em formato MP3 e envia no chat',
  usage: '#download <link do YouTube>',
  performDownload, // Exportar para uso no handler de reações

  async execute(message) {
    const textChannel = message.channel;

    // argumentos após o prefix
    const parts = message.content.trim().split(/\s+/);
    const input = parts.slice(1).join(' ');

    // Se não recebeu nada, pede query
    if (!input) {
      return textChannel.send({ embeds: [createEmbed().setDescription('❌ Forneça um link ou uma query de busca.')] });
    }

    // Se parece link do YouTube extrai ID e baixa direto
    const videoIdFromUrl = extractVideoId(input);

    if (videoIdFromUrl) {
      // Download direto
      return performDownload(videoIdFromUrl, null, textChannel);
    } else {
      // Fazer busca e listar 3 opções
      const searching = await textChannel.send({ embeds: [createEmbed().setDescription('🔎 Buscando no YouTube...')] });
      const results = await searchMultiple(input, 3);

      if (!results || results.length === 0) {
        return searching.edit({ embeds: [createEmbed().setDescription('❌ Nenhum resultado encontrado.')] });
      }

      // Buscar detalhes (duração) para cada resultado
      const detailed = [];
      for (const r of results) {
        const details = await getVideoDetails(r.videoId);
        detailed.push({ ...r, duration: details?.duration || '??:??' });
      }

      const listEmbed = createEmbed()
        .setTitle('Escolha um vídeo para baixar (clique na reação)')
        .setDescription(detailed.map((d, i) => `**${i + 1}.** ${d.title} — ${d.channel} (${d.duration})`).join('\n\n'));

      await searching.edit({ embeds: [listEmbed] });

      // Adicionar reações
      const EMOJIS = ['1️⃣', '2️⃣', '3️⃣'];
      try {
        for (let i = 0; i < Math.min(EMOJIS.length, detailed.length); i++) {
          await searching.react(EMOJIS[i]);
        }

        // Armazenar mensagem para o handler de reações
        global.downloadPendingMessages.set(searching.id, {
          detailed,
          authorId: message.author.id
        });

        // Limpar após 30 segundos
        setTimeout(() => {
          global.downloadPendingMessages.delete(searching.id);
        }, 30000);
      } catch (e) {
        console.error('[DL] Erro ao adicionar reações:', e);
        return textChannel.send({ embeds: [createEmbed().setDescription('❌ Erro ao adicionar reações. Tente novamente.')] });
      }
    }
  }
};

