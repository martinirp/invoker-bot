// @ts-nocheck
const { createEmbed } = require('../utils/embed');

module.exports = {
  name: 'queuelist',
  aliases: ['ql', 'qlist', 'fila'],
  inVoiceChannel: false,

  execute: async (message, client, args) => {
    const guildId = message.guild.id;
    const queueManager = require('../utils/queueManager');
    const g = queueManager.get(guildId);

    if (!g || g.queue.length === 0) {
      return message.channel.send({
        embeds: [createEmbed().setDescription('📭 Fila vazia')]
      });
    }

    const pageSize = 10;
    const page = Math.max(1, parseInt(args[0] || '1', 10));
    const totalPages = Math.ceil((g.queue.length + (g.current ? 1 : 0)) / pageSize);

    if (page > totalPages) {
      return message.channel.send({
        embeds: [createEmbed().setDescription(`❌ Página ${page} não existe. Total: ${totalPages}`)]
      });
    }

    const lines = [];

    // Current song
    if (g.current && page === 1) {
      lines.push(`🎵 **TOCANDO:** ${g.current.title || 'Desconhecido'}`);
      lines.push('');
    }

    // Queue items for this page
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, g.queue.length);

    for (let i = start; i < end; i++) {
      const song = g.queue[i];
      const idx = i + 1;
      lines.push(`${idx}. ${song.title || 'Desconhecido'}`);
    }

    const description = lines.join('\n');

    message.channel.send({
      embeds: [
        createEmbed()
          .setTitle(`📜 Fila (${g.queue.length} músicas)`)
          .setDescription(description)
          .setFooter({ text: `Página ${page}/${totalPages}` })
      ]
    });
  }
};
