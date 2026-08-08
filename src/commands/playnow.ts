// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const { resolve } = require('../utils/resolver');
const queueManager = require('../utils/queueManager');

const {
  isYoutubeLink,
  resolveVideo,
  isSpotifyLink
} = require('../utils/linkResolver');

const { resolveSpotifyTrack } = require('../utils/spotifyResolver');

// Roles que podem usar o comando
const ALLOWED_ROLES = ['Admin', 'Moderador', 'DJ', 'MODS'];

async function execute(message) {
  const guildId = message.guild.id;
  const voiceChannel = message.member.voice.channel;
  const textChannel = message.channel;

  console.log(`[PLAYNOW] comando recebido em ${guildId} por ${message.author.tag}`);

  // =====================================================
  // ✅ VERIFICAÇÃO DE PRIVILÉGIOS
  // =====================================================
  const hasPermission = 
    message.member.permissions.has('ADMINISTRATOR') ||
    message.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.name));

  if (!hasPermission) {
    return textChannel.send({
      embeds: [
        createEmbed().setDescription('❌ Você não tem permissão para usar este comando.')
      ]
    });
  }

  if (!voiceChannel) {
    return textChannel.send({
      embeds: [
        createEmbed().setDescription('❌ Entre em um canal de voz.')
      ]
    });
  }

  const query = message.content.split(' ').slice(1).join(' ').trim();
  if (!query) return;

  // ⚡ CONEXÃO ANTECIPADA: Entra no canal imediatamente enquanto resolve a música
  queueManager.ensureConnection(guildId, voiceChannel);

  const statusMsg = await textChannel.send({
    embeds: [createEmbed().setDescription('🔍 Processando…')]
  });

  try {
    // =====================================================
    // 🎵 SPOTIFY LINK
    // =====================================================
    if (isSpotifyLink(query)) {
      console.log('[PLAYNOW] Detectado link Spotify, resolvendo metadata...');

      const spotifyData = await resolveSpotifyTrack(query);
      if (!spotifyData) {
        throw new Error('Não foi possível resolver o link do Spotify.');
      }

      console.log(`[PLAYNOW] Buscando no YouTube: "${spotifyData.query}"`);
      const result = await resolve(spotifyData.query);

      const song = { 
        videoId: result.videoId, 
        title: result.title || spotifyData.query, 
        metadata: { ...result.metadata, spotifyId: spotifyData.trackId } 
      };

      await queueManager.playNow(guildId, voiceChannel, song, textChannel);

      await statusMsg.edit({
        embeds: [
          createEmbed()
            .setDescription(`✅ Próximo: **${song.title}**`)
        ]
      });

      return;
    }

    // =====================================================
    // 🔗 LINK DO YOUTUBE
    // =====================================================
    if (isYoutubeLink(query)) {
      const video = await resolveVideo(query);
      const song = { videoId: video.videoId, title: video.title };

      await queueManager.playNow(guildId, voiceChannel, song, textChannel);

      await statusMsg.edit({
        embeds: [
          createEmbed()
            .setDescription(`✅ Próximo a tocar: **${song.title}**`)
        ]
      });

      return;
    }

    // =====================================================
    // 🔍 SEARCH NORMAL
    // =====================================================
    const result = await resolve(query);
    const song = { videoId: result.videoId, title: result.title, metadata: result.metadata };

    await queueManager.playNow(guildId, voiceChannel, song, textChannel);

    await statusMsg.edit({
      embeds: [
        createEmbed()
          .setDescription(`✅ Próximo a tocar: **${song.title}**`)
      ]
    });
  } catch (err) {
    console.error('[PLAYNOW] Erro:', err);
    await statusMsg.edit({
      embeds: [
        createEmbed()
          .setTitle('❌ Erro ao processar')
          .setDescription(err.message || 'Vídeo inválido ou inacessível')
      ]
    }).catch(() => {});
  }
}

module.exports = {
  name: 'playnow',
  aliases: ['pn', 'pnow', 'next'],
  description: 'Coloca uma música como próxima a tocar (requer privilégios)',
  usage: '#playnow <nome ou link> | #pn <nome ou link> | %pn <nome ou link>',
  permissions: ['ADMINISTRATOR'],
  execute
};

