// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const queueManager = require('../utils/queueManager');

async function execute(message) {
  const guildId = message.guild.id;
  const textChannel = message.channel;

  const g = queueManager.get(guildId);

  // validação simples e segura
  if (!g || !g.current) {
    return textChannel.send({
      embeds: [
        createEmbed()
          .setDescription('❌ Não há música tocando no momento.')
      ]
    });
  }

  // título ANTES do skip (se existir)
  const skippedTitle = g?.current?.title;

  // 🔥 delega totalmente ao QueueManager
  // 🔥 SAFE SKIP LOGIC
  const nextStatus = await queueManager.ensureNextReady(guildId, 15000); // Wait up to 15s

  if (nextStatus === 'timeout') {
    return textChannel.send({
      embeds: [createEmbed().setDescription('❌ A próxima música está demorando muito para carregar. O skip foi cancelado para evitar silêncio.')]
    });
  }

  if (nextStatus === 'none') {
    return textChannel.send({
      embeds: [createEmbed().setDescription('❌ Não há próximas músicas na fila para pular.')]
    });
  }

  queueManager.skip(guildId);

  return textChannel.send({
    embeds: [
      createEmbed().setDescription(
        skippedTitle
          ? `⏭️ Música pulada: **${skippedTitle}**`
          : '⏭️ Música pulada.'
      )
    ]
  });
}

module.exports = {
  name: 'skip',
  aliases: ['s', 'pular'],
  description: 'Pula a música atual e toca a próxima da fila',
  usage: '#skip',
  execute
};


