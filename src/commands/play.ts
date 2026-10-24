// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const { resolve } = require('../utils/resolver');
const queueManager = require('../utils/queueManager');

const {
  isYoutubeLink,
  detectSourceType,
  isPlaylist,
  isDirectAudioUrl,
  resolveVideo,
  resolvePlaylist,
  isSpotifyLink,
  isInstagramLink
} = require('../utils/linkResolver');

const { processPlaylistBatched } = require('../utils/playlistProcessor');
const { resolveSpotifyTrack } = require('../utils/spotifyResolver');
const { isSunoLink, resolveSunoTrack } = require('../utils/sunoResolver');
const { resolveInstagramTrack } = require('../utils/instagramResolver');

async function execute(message) {
  const guildId = message.guild.id;
  const voiceChannel = message.member.voice.channel;
  const textChannel = message.channel;

  console.log(`[PLAY] comando recebido em ${guildId}`);

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
    embeds: [createEmbed().setDescription('🔍 Processando Legal')]
  });


  try {
    // =====================================================
    // 🎼 SUNO LINK (antes era o comando $ps)
    // =====================================================
    if (isSunoLink(query)) {
      console.log('[PLAY] Detectado link Suno, resolvendo metadata...');

      const sunoData = await resolveSunoTrack(query);
      if (!sunoData) {
        throw new Error('Não foi possível resolver a música do Suno. O link pode estar inválido ou a música foi removida.');
      }

      console.log(`[PLAY][SUNO] ✅ "${sunoData.title}" por ${sunoData.artist}`);

      const song = {
        videoId: undefined,
        title: sunoData.title,
        streamUrl: sunoData.audioUrl || query,
        metadata: {
          source: 'suno',
          artist: sunoData.artist,
          image: sunoData.image,
          sunoId: sunoData.sunoId,
          originalUrl: query
        }
      };

      const playPromise = queueManager.play(guildId, voiceChannel, song, textChannel);

      statusMsg.edit({
        embeds: [
          createEmbed()
            .setTitle('🎵 Suno')
            .setDescription(`✅ **${sunoData.title}**\n👤 ${sunoData.artist}`)
            .setFooter({ text: 'Suno.com' })
            .setImage(sunoData.image)
        ]
      }).catch(() => { });

      await playPromise;
      return;
    }

    // =====================================================
    // 📸 INSTAGRAM REEL (áudio do Reel)
    // =====================================================
    if (isInstagramLink(query)) {
      console.log('[PLAY] Detectado link do Instagram, resolvendo áudio do Reel...');

      const reel = await resolveInstagramTrack(query);
      console.log(`[PLAY][INSTAGRAM] ✅ "${reel.title}" por ${reel.artist}`);

      // O stream é feito pelo yt-dlp apontando para a URL do Reel
      const song = {
        videoId: undefined,
        title: reel.title,
        streamUrl: reel.streamUrl,
        metadata: {
          source: 'instagram',
          artist: reel.artist,
          image: reel.image,
          duration: reel.duration,
          originalUrl: reel.originalUrl
        }
      };

      const playPromise = queueManager.play(guildId, voiceChannel, song, textChannel);

      statusMsg.edit({
        embeds: [
          createEmbed()
            .setTitle('📸 Instagram Reel')
            .setDescription(`✅ **${reel.title}**\n👤 ${reel.artist}`)
            .setFooter({ text: 'Instagram' })
            .setImage(reel.image)
        ]
      }).catch(() => { });

      await playPromise;
      return;
    }

    // =====================================================
    // 🎵 SPOTIFY LINK (track OR playlist)
    // =====================================================
    if (isSpotifyLink(query)) {
      const isPl = /playlist[/:]/.test(query) || /spotify:playlist:/.test(query);

      if (isPl) {
        console.log('[PLAY] Detectado playlist Spotify, obtendo faixas...');
        const { getSpotifyPlaylist } = require('../utils/getSpotifyPL');

        const tracks = await getSpotifyPlaylist(query);
        if (!tracks || tracks.length === 0) {
          throw new Error('Não foi possível obter faixas da playlist Spotify.');
        }

        // Tocar a primeira faixa IMEDIATAMENTE
        console.log(`[PLAY][SPOTIFY-PL] Resolvendo primeira faixa: "${tracks[0].query}"`);
        const firstRes = await resolve(tracks[0].query);
        const firstSong = firstRes && firstRes.videoId
          ? { videoId: firstRes.videoId, title: firstRes.title || tracks[0].query, metadata: firstRes.metadata }
          : null;

        if (!firstSong) {
          throw new Error('Não foi possível resolver a primeira faixa da playlist.');
        }

        await queueManager.play(guildId, voiceChannel, firstSong, textChannel);

        await statusMsg.edit({
          embeds: [
            createEmbed()
              .setDescription(`✅ Spotify Playlist: **${firstSong.title}** (1/${tracks.length})\n🔄 Resolvendo próximas...`)
          ]
        });

        // Resolver resto de forma sequencial (ou paralelo simples) em background
        if (tracks.length > 1) {
          (async () => {
            const remaining = tracks.slice(1);
            let added = 0;
            for (const t of remaining) {
              try {
                const res = await resolve(t.query);
                if (res && res.videoId) {
                  await queueManager.play(guildId, voiceChannel, { videoId: res.videoId, title: res.title || t.query, metadata: res.metadata }, null);
                  added++;
                }
              } catch (e) {
                console.error('[PLAY][SPOTIFY-PL] erro ao enfileirar:', e.message);
              }
            }
            console.log(`[PLAY][SPOTIFY-PL] Concluído: ${added}/${remaining.length} faixas adicionadas`);
          })();
        }

        return;
      }

      console.log('[PLAY] Detectado link Spotify (track), resolvendo metadata...');
      const spotifyData = await resolveSpotifyTrack(query);

      if (!spotifyData) {
        throw new Error('Não foi possível resolver o link do Spotify.');
      }

      console.log(`[PLAY] Buscando no YouTube: "${spotifyData.query}"`);
      const result = await resolve(spotifyData.query);

      const song = { 
        videoId: result.videoId, 
        title: result.title || spotifyData.query, 
        metadata: { ...result.metadata, spotifyId: spotifyData.trackId } 
      };

      const playPromise = queueManager.play(guildId, voiceChannel, song, textChannel);

      statusMsg.edit({
        embeds: [
          createEmbed()
            .setDescription(`✅ Spotify → YouTube: **${song.title}**`)
        ]
      }).catch(() => { });

      await playPromise;
      return;
    }

    // =====================================================
    // 🔗 LINK DO YOUTUBE
    // =====================================================
    if (isYoutubeLink(query)) {
      const video = await resolveVideo(query);
      const song = { videoId: video.videoId, title: video.title };

      const playPromise = queueManager.play(guildId, voiceChannel, song, textChannel);

      statusMsg.edit({
        embeds: [
          createEmbed()
            .setDescription(`Adicionado à fila: **${song.title}**`)
        ]
      }).catch(() => { });

      await playPromise;

      if (isPlaylist(query)) {
        const playlist = await resolvePlaylist(query);
        playlist.videos = playlist.videos.filter(v => v.videoId !== video.videoId);

        if (playlist.videos.length === 0) return;

        const askMsg = await textChannel.send({
          embeds: [
            createEmbed()
              .setTitle('📜 Playlist detectada')
              .setDescription(`Este vídeo faz parte de uma playlist.\nDeseja adicionar as **${playlist.videos.length}** músicas restantes?`)
          ],
          components: [
            {
              type: 1,
              components: [
                { type: 2, style: 3, label: 'Sim', custom_id: 'pl_yes' },
                { type: 2, style: 4, label: 'Não', custom_id: 'pl_no' }
              ]
            }
          ]
        });

        const filter = i => i.user.id === message.author.id;
        const collector = askMsg.createMessageComponentCollector({ filter, max: 1, time: 60000 });

        collector.on('collect', async i => {
          if (i.deferred || i.replied) return;
          await i.deferUpdate();
          if (i.customId === 'pl_yes') {
            await processPlaylistBatched({ playlist, guildId, voiceChannel, textChannel, limit: 100, batchSize: 10 });
          }
          askMsg.edit({ components: [] }).catch(() => { });
        });
      }
      return;
    }

    // =====================================================
    // 🎧 URL DIRETA DE ÁUDIO (.mp3, .m4a, .ogg...)
    // =====================================================
    if (isDirectAudioUrl(query)) {
      let fileName = 'Áudio';
      try {
        fileName = decodeURIComponent(query.split('/').pop() || fileName);
      } catch { }

      const song = {
        videoId: undefined,
        title: fileName,
        streamUrl: query,
        metadata: { source: 'direct', originalUrl: query }
      };

      const playPromise = queueManager.play(guildId, voiceChannel, song, textChannel);

      statusMsg.edit({
        embeds: [
          createEmbed()
            .setDescription(`Adicionado à fila: **${song.title}**`)
        ]
      }).catch(() => { });

      await playPromise;
      return;
    }

    // =====================================================
    // 🔍 SEARCH NORMAL
    // =====================================================
    const result = await resolve(query);
    const song = { 
      videoId: result.videoId, 
      title: result.title, 
      metadata: result.metadata 
    };

    const playPromise = queueManager.play(guildId, voiceChannel, song, textChannel);

    statusMsg.edit({
      embeds: [
        createEmbed()
          .setDescription(`Adicionado à fila: **${song.title}**`)
      ]
    }).catch(() => { });

    await playPromise;
  } catch (err) {
    console.error('[PLAY] Erro:', err);
    await statusMsg.edit({
      embeds: [
        createEmbed()
          .setTitle('❌ Erro ao processar')
          .setDescription(err.message || 'Vídeo inválido ou inacessível')
      ]
    }).catch(() => { });
  }
}

module.exports = {
  name: 'play',
  aliases: ['p'],
  description: 'Toca uma música do YouTube, Spotify, SoundCloud, Suno, Instagram Reels ou URL direta',
  usage: '#play <nome ou link>',
  execute
};

