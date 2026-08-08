// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const db = require('../utils/db');

const { formatBytes } = require('../utils/textUtils');

async function execute(message) {
  try {
    const stats = db.getStats();
    const bitrate = process.env.OPUS_BITRATE_K || '96';

    return message.channel.send({
      embeds: [
        createEmbed()
          .setTitle('📊 Estatísticas do Bot')
          .addFields(
            { name: '🎵 Músicas em Cache', value: `${stats.totalSongs}`, inline: true },
            { name: '🔍 Chaves de Busca', value: `${stats.totalKeys}`, inline: true },
            { name: '💾 Banco de Dados', value: `${formatBytes(stats.dbSizeBytes)} (WAL ${formatBytes(stats.journalSizeBytes)})`, inline: false },
            { name: '⚡ Bitrate Áudio', value: `${bitrate} kbps`, inline: true },
            { name: '🌐 Uptime', value: formatUptime(process.uptime()), inline: true }
          )
      ]
    });
  } catch (err) {
    console.error('[STATS] Erro:', err);
    message.channel.send({
      embeds: [
        createEmbed()
          .setDescription('❌ Erro ao obter estatísticas.')
      ]
    }).catch(() => {});
  }
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = {
  name: 'stats',
  aliases: ['estatísticas', 'info'],
  description: 'Exibe estatísticas do bot (músicas em cache, chaves de busca)',
  usage: '#stats',
  execute
};
