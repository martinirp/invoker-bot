// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const queueManager = require('../utils/queueManager');

const EMOJIS = ['❌','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

async function execute(message) {
  const guildId = message.guild.id;
  const g = queueManager.guilds.get(guildId);
  if (!g || g.queue.length === 0) {
    return message.channel.send({ embeds: [createEmbed().setTitle('❌ Fila vazia').setDescription('Não há músicas para remover.')] });
  }

  const embed = createEmbed()
    .setTitle('🗑️ Remover música da fila')
    .setDescription('Reaja com o número para remover a música correspondente da fila.');

  const sent = await message.channel.send({ embeds: [embed] });
  for (let i = 0; i <= Math.min(10, g.queue.length); i++) {
    await sent.react(EMOJIS[i]);
  }
}

module.exports = { name: 'remove', execute };
