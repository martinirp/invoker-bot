// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const { resolve } = require('../utils/resolver');
const { fastResolve } = require('../utils/fastResolver');
const queueManager = require('../utils/queueManager');
const db = require('../utils/db');

const {
  isYoutubeLink,
  detectSourceType,
  isPlaylist,
  resolveVideo,
  resolvePlaylist,
  isSpotifyLink
} = require('../utils/linkResolver');

const { processPlaylistBatched } = require('../utils/playlistProcessor');
const { resolveSpotifyTrack } = require('../utils/spotifyResolver');

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

  const statusMsg = await textChannel.send({
    embeds: [createEmbed().setDescription('🔍 Processando Legal')]
  });

  try {
    // =====================================================
    // 🎵 SPOTIFY LINK (track OR playlist)
    // =====================================================
    if (isSpotifyLink(query)) {
      // detectar playlist (spotify playlist url ou spotify:playlist:)
      const isPl = /playlist[/:]/.test(query) || /spotify:playlist:/.test(query);

      if (isPl) {
        console.log('[PLAY] Detectado playlist Spotify, obtendo faixas...');
        const { getSpotifyPlaylist } = require('../utils/getSpotifyPL');
        const { resolveWithCache, resolveParallel } = require('../utils/resolutionCache');

        const tracks = await getSpotifyPlaylist(query);
        if (!tracks || tracks.length === 0) {
          throw new Error('Não foi possível obter faixas da playlist Spotify.');
        }

        // Tocar a primeira faixa IMEDIATAMENTE
        console.log(`[PLAY][SPOTIFY-PL] Resolvendo primeira faixa: "${tracks[0].query}"`);
        const firstRes = await resolveWithCache(tracks[0].query, resolve);
        const firstSong = firstRes && firstRes.videoId
          ? { videoId: firstRes.videoId, title: firstRes.title || tracks[0].query }
          : null;

        if (!firstSong) {
          throw new Error('Não foi possível resolver a primeira faixa da playlist.');
        }

        await queueManager.play(guildId, voiceChannel, firstSong, textChannel);

        await statusMsg.edit({
          embeds: [
            createEmbed()
              .setDescription(`✅ Spotify Playlist: **${firstSong.title}** (1/${tracks.length})\n🔄 Resolvendo próximas (paralelo)...`)
          ]
        });

        // Resolver resto em PARALELO em background (sem bloquear)
        if (tracks.length > 1) {
          console.log(`[PLAY][SPOTIFY-PL] Enfileirando ${tracks.length - 1} faixas restantes (paralelo) em background...`);

          (async () => {
            const remaining = tracks.slice(1);
            const queries = remaining.map(t => t.query);

            const { results, errors } = await resolveParallel(queries, resolve, 10); // 10 concurrent

            let added = 0;
            for (const video of results) {
              if (!video || !video.videoId) continue;
              try {
                await queueManager.play(guildId, voiceChannel, video, null);
                added++;
              } catch (e) {
                console.error('[PLAY][SPOTIFY-PL] erro ao enfileirar:', e.message);
              }
            }

            console.log(`[PLAY][SPOTIFY-PL] Concluído: ${added}/${remaining.length} faixas adicionadas (${errors.length} erros)`);
            if (textChannel) {
              textChannel.send({
                embeds: [
                  createEmbed()
                    .setDescription(`✅ Playlist Spotify completa: **${added}** faixas adicionadas à fila.${errors.length > 0 ? ` ⚠️ ${errors.length} não conseguidas.` : ''}`)
                ]
              }).catch(() => { });
            }
          })();
        }

        return;
      }

      console.log('[PLAY] Detectado link Spotify (track), resolvendo metadata...');

      const spotifyData = await resolveSpotifyTrack(query);

      if (!spotifyData) {
        throw new Error('Não foi possível resolver o link do Spotify. Tente novamente.');
      }

      // Busca a música no YouTube usando artista + título
      console.log(`[PLAY] Buscando no YouTube: "${spotifyData.query}"`);
      const result = await resolve(spotifyData.query);

      const song = result.fromCache
        ? db.getByVideoId(result.videoId)
        : { videoId: result.videoId, title: spotifyData.query, metadata: { spotifyId: spotifyData.trackId } };

      // Se veio do banco mas não tiver spotifyId, adicionamos para futuras recomendações
      if (song && song.metadata && !song.metadata.spotifyId && spotifyData.trackId) {
        song.metadata.spotifyId = spotifyData.trackId;
      }

      await queueManager.play(
        guildId,
        voiceChannel,
        song,
        textChannel
      );

      await statusMsg.edit({
        embeds: [
          createEmbed()
            .setDescription(`✅ Spotify → YouTube: **${spotifyData.title}** por **${spotifyData.artist}**`)
        ]
      });

      return;
    }

    // =====================================================
    // 🔗 LINK DO YOUTUBE (VÍDEO SEMPRE PRIMEIRO)
    // =====================================================
    if (isYoutubeLink(query)) {
      // 🎵 resolve e toca o vídeo imediatamente
      const video = await resolveVideo(query);

      const dbSong = db.getByVideoId(video.videoId);
      // Sempre preferir o título recém-resolvido (para não exibir versões antigas ou truncadas)
      let song = dbSong
        ? { ...dbSong, title: video.title || dbSong.title }
        : { videoId: video.videoId, title: video.title };

      await queueManager.play(
        guildId,
        voiceChannel,
        song,
        textChannel
      );

      await statusMsg.edit({
        embeds: [
          createEmbed()
            .setDescription(`Adicionado à fila: **${song.title}**`)
        ]
      });

      // 📜 SE TAMBÉM FOR PLAYLIST, PERGUNTA DEPOIS
      if (isPlaylist(query)) {
        const playlist = await resolvePlaylist(query);

        // remove o vídeo atual da playlist
        playlist.videos = playlist.videos.filter(
          v => v.videoId !== video.videoId
        );

        if (playlist.videos.length === 0) return;

        const askMsg = await textChannel.send({
          embeds: [
            createEmbed()
              .setTitle('📜 Playlist detectada')
              .setDescription(
                `Este vídeo faz parte de uma playlist.\nDeseja adicionar as **${playlist.videos.length}** músicas restantes?`
              )
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
        const collector = askMsg.createMessageComponentCollector({
          filter,
          max: 1,
          time: 60000
        });

        collector.on('collect', async i => {
          if (i.deferred || i.replied) return;
          await i.deferUpdate();

          if (i.customId === 'pl_yes') {
            await processPlaylistBatched({
              playlist,
              guildId,
              voiceChannel,
              textChannel,
              limit: 100,
              batchSize: 10
            });
          }

          askMsg.edit({ components: [] }).catch(() => { });
        });
      }

      return;
    }

    // =====================================================
    // 🔗 OUTRAS FONTES (SoundCloud/Bandcamp/Direct URLs)
    // =====================================================
    const sourceType = detectSourceType(query);

    if (sourceType !== 'search' && sourceType !== 'youtube') {
      const { runYtDlpJson } = require('../utils/ytDlp');

      let video;
      try {
        const data = await runYtDlpJson([
          '--dump-json',
          '--no-playlist',
          query
        ]);
        video = {
          videoId: data.id || require('crypto').createHash('md5').update(query).digest('hex'),
          title: data.title || 'Áudio externo',
          channel: data.uploader || sourceType
        };
      } catch (err) {
        console.error('[PLAY] erro ao resolver URL:', err);
        video = {
          videoId: require('crypto').createHash('md5').update(query).digest('hex'),
          title: query.split('/').pop() || 'Áudio externo',
          channel: sourceType
        };
      }

      let song = db.getByVideoId(video.videoId) || {
        videoId: video.videoId,
        title: video.title,
        streamUrl: query
      };

      await queueManager.play(
        guildId,
        voiceChannel,
        song,
        textChannel
      );

      await statusMsg.edit({
        embeds: [
          createEmbed()
            .setDescription(`✅ Adicionado: **${song.title}**`)
        ]
      });

      return;
    }

    // =====================================================
    // 🔍 SEARCH NORMAL
    // =====================================================
    const result = await resolve(query);

    const song = result.fromCache
      ? db.getByVideoId(result.videoId)
      : { videoId: result.videoId, title: result.title };

    await queueManager.play(
      guildId,
      voiceChannel,
      song,
      textChannel
    );

    await statusMsg.edit({
      embeds: [
        createEmbed()
          .setDescription(`Adicionado à fila: **${song.title}**`)
      ]
    });
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
  description: 'Toca uma música do YouTube, Spotify, SoundCloud ou URL direta',
  usage: '#play <nome ou link>',
  execute
};

