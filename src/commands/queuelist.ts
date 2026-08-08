// @ts-nocheck
const { createEmbed } = require('../utils/embed');

module.exports = {
  name: 'queuelist',
  aliases: ['ql', 'qlist'],
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
    let currentMsg;
    if (g.current && page === 1) {
      currentMsg = await message.channel.send({
        embeds: [
          createEmbed()
            .setTitle('🎵 Tocando agora')
            .setDescription(g.current.title || 'Desconhecido')
        ],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 2, emoji: '🔄', custom_id: 'queue_loop', label: 'Loop' },
              { type: 2, style: 2, emoji: '🤖', custom_id: 'queue_autodj', label: 'AutoDJ' },
              { type: 2, style: 2, emoji: '⏭️', custom_id: 'queue_skip', label: 'Skip' }
            ]
          }
        ]
      });

      // Collector para os botões
      const filter = i => ['queue_loop','queue_autodj','queue_skip'].includes(i.customId) && i.user.id === message.author.id;
      const collector = currentMsg.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async i => {
        if (i.deferred || i.replied) return;
        await i.deferUpdate();
        if (i.customId === 'queue_loop') {
          const loopCmd = require('./loop');
          await loopCmd.execute(message, null, []);
        } else if (i.customId === 'queue_autodj') {
          const autodjCmd = require('./autodj');
          await autodjCmd.execute(message);
        } else if (i.customId === 'queue_skip') {
          const skipCmd = require('./skip');
          await skipCmd.execute(message);
        }
        // Remove botões após uso
        await currentMsg.edit({ components: [] }).catch(() => {});
      });
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
