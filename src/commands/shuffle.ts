// @ts-nocheck
const { createEmbed } = require('../utils/embed');

module.exports = {
  name: 'shuffle',
  aliases: ['embaralhar', 'shuf'],
  inVoiceChannel: false,

  execute: async (message, client, args) => {
    const guildId = message.guild.id;
    const queueManager = require('../utils/queueManager');
    const g = queueManager.get(guildId);

    if (!g || g.queue.length < 2) {
      return message.channel.send({
        embeds: [createEmbed().setDescription('❌ Fila precisa ter pelo menos 2 músicas')]
      });
    }

    // Fisher-Yates shuffle
    for (let i = g.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [g.queue[i], g.queue[j]] = [g.queue[j], g.queue[i]];
    }

    message.channel.send({
      embeds: [
        createEmbed().setDescription(`🎲 Fila embaralhada (${g.queue.length} músicas)`)
      ]
    });
  }
};
