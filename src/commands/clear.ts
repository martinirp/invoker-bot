// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const queueManager = require('../utils/queueManager');

module.exports = {
  name: 'clear',
  aliases: ['stop', 'leave'],
  description: 'Para a música, limpa a fila e desconecta o bot do canal',
  usage: '#clear',

  async execute(message) {
    const guildId = message.guild.id;
    const textChannel = message.channel;
    const member = message.member;

    // 🔒 validação básica
    if (!member.voice.channel) {
      return textChannel.send({
        embeds: [
          createEmbed()
            .setDescription('❌ Você precisa estar em um canal de voz.')
        ]
      });
    }

    console.log(`[CLEAR] ${guildId} → comando executado`);

    // 🔥 RESET TOTAL DA GUILD
    queueManager.resetGuild(guildId);

    // 📤 FEEDBACK AO USUÁRIO
    await textChannel.send({
      embeds: [
        createEmbed()
          .setTitle('🧹 Fila limpa')
          .setDescription(
            'Fila apagada, execução interrompida e bot removido do canal de voz.'
          )
      ]
    });
  }
};

