// @ts-nocheck
const { PermissionsBitField } = require('discord.js');
const queueManager = require('../utils/queueManager');
const { createEmbed } = require('../utils/embed');

module.exports = {
  name: 'reset',
  aliases: ['restart', 'reboot', 'rt'],
  description: 'Reinicia o bot: encerra tudo e executa novamente o start.js',
  permission: 'ADMINISTRATOR',

  async execute(message, client) {
    // --- SAVE STATE DA FILA ---
    const savedQueues = {};
    if (queueManager && queueManager.guilds) {
      for (const [guildId, g] of queueManager.guilds) {
        savedQueues[guildId] = {
          current: g.current ? { ...g.current } : null,
          queue: g.queue.map(song => ({ ...song })),
          textChannelId: g.textChannel?.id,
          voiceChannelId: g.voiceChannel?.id
        };
      }
    }
    // Permissão de administrador
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.channel.send({
        embeds: [
          createEmbed()
            .setColor(0xe74c3c)
            .setTitle('❌ Permissão negada')
            .setDescription('Você não tem permissão para usar este comando.')
        ]
      });
    }

    const statusMsg = await message.channel.send({
      embeds: [
        createEmbed()
          .setColor(0xf1c40f)
          .setTitle('🔄 Reiniciando bot')
          .setDescription('Encerrando conexões...')
      ]
    });

    try {
      // Desconectar de todos os guilds de forma silenciosa
      if (queueManager && queueManager.guilds) {
        for (const [guildId] of queueManager.guilds) {
          queueManager.selfDisconnecting.add(guildId);
          queueManager.resetGuild(guildId, { preserveSelfFlag: true });
        }
      }

      // Dar um tempo para desconectar
      await new Promise(resolve => setTimeout(resolve, 1000));

      // --- RESTORE STATE DA FILA APÓS REINICIAR ---
      // Usar setTimeout para restaurar após o bot reconectar
      setTimeout(async () => {
        for (const guildId in savedQueues) {
          const saved = savedQueues[guildId];
          if (!saved || (!saved.current && saved.queue.length === 0)) continue;
          // Recupera canais
          const guild = client.guilds.cache.get(guildId);
          const textChannel = saved.textChannelId ? guild?.channels?.cache?.get(saved.textChannelId) : null;
          const voiceChannel = saved.voiceChannelId ? guild?.channels?.cache?.get(saved.voiceChannelId) : null;
          // Restaura fila
          if (voiceChannel && textChannel) {
            // Restaura música atual
            if (saved.current) {
              await queueManager.playNow(guildId, voiceChannel, saved.current, textChannel);
            }
            // Restaura restante da fila
            for (const song of saved.queue) {
              await queueManager.play(guildId, voiceChannel, song, textChannel);
            }
          }
        }
      }, 5000); // Aguarda 5s para garantir reconexão

      await statusMsg.edit({
        embeds: [
          createEmbed()
            .setColor(0x2ecc71)
            .setTitle('🔄 Reiniciando')
            .setDescription('Voltando em segundos... 🚀')
        ]
      });

      // Fechar cliente Discord e encerrar processo
      // O hosting (Replit, Railway, etc) detectará o crash e reiniciará
      console.log('[RESET] Encerrando processo para reinicialização...');
      
      try {
        await client.destroy();
      } catch {}

      // Exit com code 1 força o hosting a reiniciar
      process.exit(1);
    } catch (error) {
      console.error('[RESET] erro:', error);
      await statusMsg.edit({
        embeds: [
          createEmbed()
            .setColor(0xe74c3c)
            .setTitle('❌ Erro ao reiniciar')
            .setDescription(error?.message || String(error))
        ]
      });
    }
  }
};

