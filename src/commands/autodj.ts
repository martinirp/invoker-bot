// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const queueManager = require('../utils/queueManager');

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
    // Ativa o modo AutoDJ e adiciona recomendações via Last.FM (filtro de similaridade/dedupe)
    g.autoDJ = true;

    const added = await queueManager.addAutoRecommendations(guildId, 5);

    if (added === 0) {
      g.autoDJ = false;
      return statusMsg.edit({
        embeds: [
          createEmbed().setDescription(`❌ Não foi possível encontrar músicas relacionadas a:\n**${g.current.title}**`)
        ],
        components: []
      });
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

    // Coletor para o botão de skip
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
    g.autoDJ = false;
    await statusMsg.edit({
      embeds: [
        createEmbed().setDescription(`❌ Erro ao ativar Auto-DJ: ${error.message}`)
      ]
    }).catch(() => {});
  }
}

module.exports = {
  name: 'autodj',
  aliases: ['dj', 'autoplay'],
  description: 'Ativa o AutoDJ e adiciona músicas relacionadas à música atual',
  usage: '#autodj',
  execute
};
