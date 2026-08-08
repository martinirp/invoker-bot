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

  const raw = (args[0] || '').trim().toLowerCase();
  const isRelative = /^[+-]/.test(raw);
  const parsed = Math.floor(parseFloat(raw.replace(/[^0-9.]/g, '')));

  if (isNaN(parsed) || parsed <= 0) {
    return message.channel.send({
      embeds: [createEmbed().setDescription('❌ Por favor, informe um número entre 1 e 200 (ou use +10 / -10).')]
    }).catch(() => {});
  }

  // Relativo (+10 / -10)
  let volume;
  if (isRelative) {
    const step = raw.startsWith('-') ? -parsed : parsed;
    volume = Math.round(g.volume * 100) + step;
  } else {
    volume = parsed;
  }

  volume = Math.max(1, Math.min(200, volume));

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
