// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const queueManager = require('../utils/queueManager');

async function execute(message, client, args) {
  const guildId = message.guild.id;

  // Sem argumento → mostra volume atual
  if (!args || args.length === 0) {
    const current = Math.round(queueManager.getVolume(guildId) * 100);
    return message.channel.send({
      embeds: [
        createEmbed()
          .setTitle('🔊 Volume atual')
          .setDescription(`Volume: **${current}%**\n\nUse \`#volume <0-200>\` para ajustar.`)
      ]
    }).catch(() => {});
  }

  // +/- relativo
  let raw = args[0].trim();
  if (raw === '+' || raw === '-') raw += '10';

  const delta = /^[+-]/.test(raw);
  const amount = parseInt(raw, 10);

  if (isNaN(amount)) {
    return message.channel.send({
      embeds: [
        createEmbed().setDescription('❌ Use: `#volume <0-200>` ou `#volume +10` / `#volume -10`')
      ]
    }).catch(() => {});
  }

  let target;
  if (delta) {
    const current = queueManager.getVolume(guildId) * 100;
    target = current + amount;
  } else {
    target = amount;
  }

  const applied = queueManager.setVolume(guildId, target);

  return message.channel.send({
    embeds: [
      createEmbed()
        .setTitle('🔊 Volume')
        .setDescription(`Volume ajustado para **${applied}%**.`)
    ]
  }).catch(() => {});
}

module.exports = {
  name: 'volume',
  aliases: ['vol', 'v'],
  description: 'Ajusta o volume da reprodução (0-200%)',
  usage: '#volume [0-200] | #volume +/-<valor>',
  execute
};
