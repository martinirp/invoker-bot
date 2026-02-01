// @ts-nocheck
const { createEmbed } = require('../utils/embed');

module.exports = {
  name: 'loop',
  aliases: ['repeat', 'repetir'],
  inVoiceChannel: false,

  execute: async (message, client, args) => {
    const guildId = message.guild.id;
    const queueManager = require('../utils/queueManager');
    const g = queueManager.get(guildId);

    const mode = (args[0] || 'toggle').toLowerCase();

    if (mode === 'toggle' || mode === 't') {
      g.loop = !g.loop;
    } else if (mode === 'on' || mode === '1') {
      g.loop = true;
    } else if (mode === 'off' || mode === '0') {
      g.loop = false;
    } else {
      return message.channel.send({
        embeds: [createEmbed().setDescription('❌ Use: `#loop [toggle|on|off]`')]
      });
    }

    message.channel.send({
      embeds: [
        createEmbed().setDescription(`🔄 Loop ${g.loop ? '✅ LIGADO' : '❌ DESLIGADO'}`)
      ]
    });
  }
};
