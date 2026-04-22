// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const queueManager = require('../utils/queueManager');
const { getRelatedVideos } = require('../utils/youtubeApi');

async function execute(message) {
  const guildId = message.guild.id;
  const g = queueManager.get(guildId);

  if (!g.current) {
    return message.channel.send({
      embeds: [
        createEmbed().setDescription('❌ Nenhuma música tocando no momento.')
      ]
    });
  }

  const statusMsg = await message.channel.send({
    embeds: [createEmbed().setDescription('🤖 Auto-DJ: buscando músicas relacionadas...')],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 2, emoji: '⏭️', custom_id: 'autodj_skip', label: 'Skip' }
        ]
      }
    ]
  });

  try {
    const related = await getRelatedVideos(g.current.videoId, 5);

    if (!related || related.length === 0) {
      throw new Error('Não foi possível encontrar músicas relacionadas.');
    }

    let added = 0;

    for (const video of related) {
      const alreadyInQueue = g.queue.some(s => s.videoId === video.videoId);
      if (alreadyInQueue) continue;

      const song = {
        videoId: video.videoId,
        title: video.title,
        metadata: {
          channel: video.channel,
          thumbnail: video.thumbnail
        }
      };

      await queueManager.play(
        guildId,
        g.voiceChannel,
        song,
        message.channel
      );

      added++;
    }

    await statusMsg.edit({
      embeds: [
        createEmbed()
          .setTitle('🤖 Auto-DJ ativado')
          .setDescription(`✅ Adicionadas **${added}** músicas relacionadas à fila baseadas em:\n**${g.current.title}**`)
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 2, emoji: '⏭️', custom_id: 'autodj_skip', label: 'Skip' }
          ]
        }
      ]
    });
    
    const filter = i => i.customId === 'autodj_skip' && i.user.id === message.author.id;
    const collector = statusMsg.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
      if (i.deferred || i.replied) return;
      await i.deferUpdate();
      const skipCmd = require('./skip');
      await skipCmd.execute(message);
      await statusMsg.edit({ components: [] }).catch(() => {});
    });
  } catch (error) {
    console.error('[AUTODJ] Erro:', error);
    await statusMsg.edit({
      embeds: [
        createEmbed().setDescription(`❌ Erro ao ativar Auto-DJ: ${error.message}`)
      ]
    });
  }
}

module.exports = {
  name: 'autodj',
  aliases: ['dj', 'autoplay'],
  description: 'Adiciona automaticamente 5 músicas relacionadas à música atual',
  usage: '#autodj',
  execute
};

