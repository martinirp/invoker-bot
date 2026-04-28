// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const queueManager = require('../utils/queueManager');

async function execute(message, args) {
  const guildId = message.guild.id;
  const g = queueManager.get(guildId);

  if (!g || !g.current) {
    return message.channel.send({
      embeds: [createEmbed().setDescription('❌ Nenhuma música tocando no momento.')]
    }).catch(() => {});
  }

  if (!args || args.length === 0) {
    return message.channel.send({
      embeds: [createEmbed().setDescription(`🔊 O volume atual é **${Math.round(g.volume * 100)}%**`)]
    }).catch(() => {});
  }

  const rawArg = (args[0] || '').trim().replace(/[^0-9.]/g, '');
  const volume = Math.floor(parseFloat(rawArg));

  if (isNaN(volume) || volume < 1 || volume > 200) {
    return message.channel.send({
      embeds: [createEmbed().setDescription('❌ Por favor, informe um número entre 1 e 200.')]
    }).catch(() => {});
  }

  const volDecimal = volume / 100;
  queueManager.setVolume(guildId, volDecimal);

  return message.channel.send({
    embeds: [createEmbed().setDescription(`✅ Volume alterado para **${volume}%**`)]
  }).catch(() => {});
}

module.exports = {
  name: 'volume',
  aliases: ['vol', 'v'],
  description: 'Controle de volume da stream de áudio',
  usage: '#volume [1-200]',
  execute
};
