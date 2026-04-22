import fs from 'fs';
import path from 'path';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  entersState,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  type AudioPlayer,
  type VoiceConnection
} from '@discordjs/voice';
import type { Message } from 'discord.js';
import type { Song } from '../types/music';

// CommonJS-style imports
const { createEmbed, createSongEmbed } = require('./embed');
const { resolve, tokenize } = require('./resolver');
const { createYtDlpStream } = require('./ytDlp');
const { getVideoDetails } = require('./youtubeApi');

type SendableChannel = { send: (...args: any[]) => any } | null;
type VoiceCh = any; // Simplified; could be VoiceBasedChannel but keep loose to match runtime

interface GuildState {
  player: AudioPlayer;
  queue: Song[];
  current: Song | null;
  currentStream: any;
  playing: boolean;
  connection: VoiceConnection | null;
  textChannel: SendableChannel;
  voiceChannel: VoiceCh | null;
  emptyTimeout: NodeJS.Timeout | null;
  loop: boolean;
  autoDJ: boolean;
  nowPlayingMessage: Message | null;
  failedAttempts: Map<string | undefined, number>;
}

class QueueManager {
  private guilds: Map<string, GuildState>;
  selfDisconnecting: Set<string>;

  constructor() {
    this.guilds = new Map();
    this.selfDisconnecting = new Set(); // Rastreia desconexões iniciadas pelo bot

    // 🔥 NOVO: Listener para atualização assíncrona de metadados
    const EventEmitter = require('events');
    if (!global.metadataEmitter) {
      global.metadataEmitter = new EventEmitter();
    }

    global.metadataEmitter.on('metadataUpdated', async (metadata: any) => {
      // Iterar por todas as guilds para encontrar qual está tocando este vídeo
      for (const [guildId, g] of this.guilds.entries()) {
        if (!g.current || !g.nowPlayingMessage) continue;

        // Verificar se o vídeo atualizado é o que está tocando
        if (g.current.videoId === metadata.videoId) {
          try {
            // Atualizar dados da música atual
            g.current.title = metadata.title;
            g.current.artist = metadata.artist;
            g.current.track = metadata.track;

            // Atualizar embed no Discord
            const loopOn = !!g.loop;
            const autoOn = !!g.autoDJ;

            const updatedData = {
              ...g.current,
              title: metadata.track || metadata.title,
              artist: metadata.artist,
              metadata: {
                ...g.current.metadata,
                artist: metadata.artist,
                track: metadata.track,
                album: metadata.album
              }
            };

            const newEmbed = createSongEmbed(updatedData, 'playing', loopOn, autoOn);
            await g.nowPlayingMessage.edit({ embeds: [newEmbed] });

            console.log(`[DISCORD] ✅ Embed atualizado: ${metadata.artist} - ${metadata.track}`);
          } catch (err) {
            console.error(`[DISCORD] Erro ao atualizar embed para ${guildId}:`, err);
          }
        }
      }
    });
  }

  get(guildId: string): GuildState {
    if (!this.guilds.has(guildId)) {
      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Pause,
          maxMissedFrames: 10
        }
      });

      // Handler global para evitar crash em erros do player (ex.: ERR_STREAM_PREMATURE_CLOSE)
      player.on('error', (err) => {
        const audioErr = err as any;
        const code = audioErr?.code || audioErr?.name || 'player_error';
        const msg = audioErr?.message || '';
        // Ignorar completamente "premature close" - deixar Idle handler cuidar
        if (code === 'ERR_STREAM_PREMATURE_CLOSE' || /premature/i.test(msg)) {
          console.warn(`[PLAYER][${guildId}] aviso: fechamento prematuro (ignorado)`);
          return; // NÃO avançar
        }
        // Erros críticos reais
        console.error(`[PLAYER][${guildId}] erro crítico:`, code, msg || err);
        // Tenta avançar para a próxima faixa se estivermos com estado montado
        try {
          this.next(guildId);
        } catch (e) {
          console.error(`[PLAYER][${guildId}] falha ao avançar após erro:`, e.message);
        }
      });

      this.guilds.set(guildId, {
        player,
        queue: [],
        current: null,
        currentStream: null,
        playing: false,
        connection: null,
        textChannel: null,
        voiceChannel: null,
        emptyTimeout: null,
        loop: false,
        autoDJ: false,
        nowPlayingMessage: null,
        failedAttempts: new Map()
      });
    }
    return this.guilds.get(guildId)!;
  }

  /**
   * Garante que o bot está conectado ao canal de voz (adianta a conexão)
   */
  ensureConnection(guildId: string, voiceChannel: VoiceCh) {
    const g = this.get(guildId);
    if (!g.connection) {
      console.log(`[VOICE] ⚡ Conexão antecipada em ${guildId}`);
      g.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator
      });
      g.connection.subscribe(g.player);
    }
    return g.connection;
  }

  async play(guildId: string, voiceChannel: VoiceCh, song: Song, textChannel?: SendableChannel) {
    const g = this.get(guildId);

    if (textChannel) g.textChannel = textChannel;
    g.voiceChannel = voiceChannel;

    // Conectar se necessário (adiantado ou fallback)
    this.ensureConnection(guildId, voiceChannel);

    // Verificar o estado REAL do player, não apenas a flag
    const playerStatus = g.player?.state?.status;
    const isPlayerActive = (playerStatus === AudioPlayerStatus.Playing || playerStatus === AudioPlayerStatus.Buffering);
    const wasPlaying = g.playing && isPlayerActive;

    const queueSize = g.queue.length;
    console.log(`[QUEUE] ${guildId} → adicionando: ${song.title} (playing=${wasPlaying}, playerStatus=${playerStatus}, queue_size=${queueSize})`);
    g.queue.push(song);
    console.log(`[QUEUE] ${guildId} → fila agora tem ${g.queue.length} músicas`);

    // IMPORTANTE: Só toca automaticamente se NÃO estava tocando nada
    if (!wasPlaying) {
      console.log(`[QUEUE] ${guildId} → iniciando playback (nada estava tocando)`);
      g.playing = true;
      this.next(guildId);
    } else {
      console.log(`[QUEUE] ${guildId} → adicionado à fila (já estava tocando, não inicia playback)`);
    }
  }

  async playNow(guildId: string, voiceChannel: VoiceCh, song: Song, textChannel?: SendableChannel) {
    const g = this.get(guildId);

    if (textChannel) g.textChannel = textChannel;
    g.voiceChannel = voiceChannel;


    // Verificar o estado REAL do player, não apenas a flag
    const playerStatus = g.player?.state?.status;
    const isPlayerActive = playerStatus === AudioPlayerStatus.Playing || playerStatus === AudioPlayerStatus.Buffering;
    const wasPlaying = g.playing && isPlayerActive;
    const currentSong = g.current;
    console.log(`[PLAYNOW] ${guildId} → colocando no topo: ${song.title} (playing=${wasPlaying}, playerStatus=${playerStatus})`);

    // Coloca a música no TOPO da fila usando unshift
    g.queue.unshift(song);
    console.log(`[PLAYNOW] ${guildId} → fila agora tem ${g.queue.length} músicas`);


    // Conectar se necessário (adiantado ou fallback)
    this.ensureConnection(guildId, voiceChannel);

    // Não interromper a música atual: se já estiver tocando, apenas mantém na frente da fila

    // Não interromper a música atual: se já estiver tocando, apenas mantém na frente da fila
    if (wasPlaying) {
      console.log(`[PLAYNOW] ${guildId} → adicionada ao topo (não interrompe a atual)`);
      return;
    } else {
      // Se não estava tocando, inicia playback
      console.log(`[PLAYNOW] ${guildId} → iniciando playback`);
      g.playing = true;
      this.next(guildId);
    }
  }

  async next(guildId: string) {
    const g = this.get(guildId);
    // Se loop ativo, reaproveita a música atual em vez de puxar da fila
    let song: Song | undefined | null;
    if (g.loop && g.current) {
      song = g.current;
    } else {
      song = g.queue.shift();
    }

    if (!song) {
      g.current = null;
      g.playing = false;

      g.textChannel?.send({
        embeds: [createEmbed().setDescription('Fila encerrada.')]
      }).catch(() => { });

      // Iniciar timer para desconectar se vazio
      this.startAutoDisconnect(guildId);
      return;
    }

    // Proteção contra loop infinito: se a mesma música falhar 3x seguidas, pula
    if (!g.failedAttempts) g.failedAttempts = new Map();
    const attempts = g.failedAttempts.get(song.videoId) || 0;
    if (attempts >= 3) {
      console.error(`[PLAYER] ${guildId} → música ${song.title} falhou 3x, pulando...`);
      g.failedAttempts.delete(song.videoId);
      g.textChannel?.send({
        embeds: [createEmbed().setDescription(`❌ Erro ao tocar **${song.title}**, pulando...`)]
      }).catch(() => { });
      this.next(guildId);
      return;
    }

    // Cancelar auto-disconnect se tinha
    if (g.emptyTimeout) {
      clearTimeout(g.emptyTimeout);
      g.emptyTimeout = null;
    }

    g.current = song;

    // Se não há videoId nem streamUrl, não há como tocar
    if (!song.videoId && !song.streamUrl) {
      console.error(`[PLAYER] ${guildId} → música sem videoId/streamUrl, pulando`);
      this.next(guildId);
      return;
    }

    const { decodeHtml } = require('./embed');
    const titleForLog = song.title || song.metadata?.title || 'Música desconhecida';
    const cleanTitleLog = decodeHtml(titleForLog);
    console.log(`[PLAYER] ${guildId} → tocando agora: ${cleanTitleLog}`);

    let resource;

    // ─── Stream direto para fontes CDN (ex: Suno) ────────────────────────────
    const isSunoSource = song.metadata?.source === 'suno';
    const hasDirectStreamUrl = song.streamUrl && /^https?:\/\/.+\.(mp3|ogg|opus|wav|m4a)/i.test(song.streamUrl);

    if (isSunoSource && hasDirectStreamUrl) {
      try {
        console.log(`[PLAYBACK][${guildId}] src=direct-stream url=${song.streamUrl}`);
        resource = createAudioResource(song.streamUrl, { inputType: StreamType.Arbitrary });
        g.currentStream = null;
      } catch (err) {
        console.error(`[PLAYBACK] Falha ao criar stream direto:`, err);
        if (!g.failedAttempts) g.failedAttempts = new Map();
        const attempts = g.failedAttempts.get(song.videoId) || 0;
        g.failedAttempts.set(song.videoId, attempts + 1);
        this.next(guildId);
        return;
      }

    // ─── Stream via yt-dlp (sem download em disco) ────────────────────────────
    } else {
      try {
        const target = song.streamUrl || song.videoId;
        if (!target) throw new Error('Música sem videoId ou streamUrl');

        console.log(`[PLAYBACK][${guildId}] src=yt-dlp-stream target=${target}`);
        const { stream, process: ytProcess } = createYtDlpStream(target);

        // Guardar referência ao processo para poder matar no skip
        g.currentStream = ytProcess;

        resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
      } catch (err) {
        console.error(`[PLAYBACK] Falha ao criar yt-dlp stream:`, err);
        if (!g.failedAttempts) g.failedAttempts = new Map();
        const attempts = g.failedAttempts.get(song.videoId) || 0;
        g.failedAttempts.set(song.videoId, attempts + 1);
        this.next(guildId);
        return;
      }
    }

    // Garantir conexão pronta antes de tocar (reduz silêncio inicial)
    try {
      if (g.connection) {
        // Aumentado para 10s para redes mais lentas ou primeira conexão
        await entersState(g.connection, VoiceConnectionStatus.Ready, 10000);
      }
    } catch (e) {
      console.warn('[VOICE] conexão não ficou pronta em 10s; iniciando mesmo assim');
    }

    console.log(`[PLAYBACK][${guildId}] player.play(inputType=Arbitrary)`);
    g.player.play(resource);

    // Evitar múltiplos listeners acumulados
    g.player.removeAllListeners(AudioPlayerStatus.Idle);

    g.player.once(AudioPlayerStatus.Idle, () => {
      g.currentStream = null;
      g.nowPlayingMessage = null; // 🔥 FIX: Limpar referência para evitar memory leak

      // Limpar contador de falhas ao tocar com sucesso
      if (g.failedAttempts) {
        g.failedAttempts.delete(song.videoId);

        // 🔥 FIX: Limpar tentativas antigas (>1h) para evitar Map crescer infinitamente
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        for (const [vid, count] of g.failedAttempts.entries()) {
          // Se não tiver timestamp, assumir que é antigo
          if (typeof count === 'number' && count > 0) {
            // Versão antiga sem timestamp, limpar se >3 falhas
            if (count >= 3) g.failedAttempts.delete(vid);
          }
        }
      }

      this.next(guildId);
    });

    // Garantir que o songData sempre tem título (envio imediato do embed)
    const baseSongData = {
      ...song,
      ...(song.metadata || {}),
      title: song.title || song.metadata?.title || 'Música desconhecida'
    };

    try {
      const loopOn = !!g.loop;
      const autoOn = !!g.autoDJ;

      // Se estamos reaproveitando a mesma faixa por causa do loop e já temos uma mensagem "Now Playing",
      // não reenviamos o embed para evitar spam. Apenas atualizamos a mensagem existente.
      if (g.loop && g.current && g.nowPlayingMessage) {
        try {
          const existing = g.nowPlayingMessage;
          const newEmbed = createSongEmbed(baseSongData, 'playing', loopOn, autoOn);
          await existing.edit({ embeds: [newEmbed] }).catch(() => { });
          // Garante que as reações estejam presentes
          const neededReactions = ['🔁', '🎶', '✨', '⏭️', '🇶'];
          for (const emoji of neededReactions) {
            if (!existing.reactions.cache.has(emoji)) {
              try { await existing.react(emoji); } catch { }
            }
          }
        } catch (err) {
          // se falhar ao editar, ignoramos silenciosamente
        }
      } else {
        const sent = await g.textChannel?.send({ embeds: [createSongEmbed(baseSongData, 'playing', loopOn, autoOn)] });

        if (sent) {
          g.nowPlayingMessage = sent;
          try { await sent.react('🔁'); } catch { }
          try { await sent.react('🎶'); } catch { }
          try { await sent.react('✨'); } catch { }
          try { await sent.react('⏭️'); } catch { } // Skip
          try { await sent.react('🇶'); } catch { } // Queue
        }
      }

      // Buscar metadados ricos em background e atualizar embed assim que disponível
      const needsMetadata = !song.metadata || !song.metadata.duration || !song.metadata.views;
      if (needsMetadata && song.videoId) {
        (async () => {
          try {
            const details = await getVideoDetails(song.videoId);
            if (details) {
              song.metadata = details;
              const updatedData = {
                ...song,
                ...(song.metadata || {}),
                title: song.title || song.metadata?.title || 'Música desconhecida'
              };
              const loopOnRef = !!g.loop;
              const autoOnRef = !!g.autoDJ;
              const newEmbed = createSongEmbed(updatedData, 'playing', loopOnRef, autoOnRef);
              try { await g.nowPlayingMessage?.edit({ embeds: [newEmbed] }); } catch { }
            }
          } catch { }
        })();
      }

      // 🎵 AUTO-RECOMENDAÇÕES LAST.FM (se autoDJ estiver ativado, adiciona 2 músicas automaticamente)
      if (g.autoDJ && song.videoId) {
        try {
          console.log('[AUTODJ] 🎯 Adicionando recomendações automáticas do Last.FM...');
          await this.addAutoRecommendations(guildId, 2);
        } catch (autoErr) {
          console.error('[AUTODJ] Erro ao adicionar recomendações automáticas:', autoErr.message);
        }
      }
    } catch (e) {
      // Falha em enviar embed não é crítico
      try { g.textChannel?.send({ embeds: [createSongEmbed(baseSongData, 'playing', false, false)] }); } catch { }
    }

    // Iniciar prefetch da próxima música para acelerar a transição
    this.prefetch(guildId);
  }

  /**
   * Resolve antecipadamente a próxima música da fila em background
   */
  async prefetch(guildId: string) {
    const g = this.get(guildId);
    if (g.queue.length === 0) return;

    const nextSong = g.queue[0];
    
    // Se já tem videoId e metadados básicos, não precisa prefetch (ou já foi feito)
    if (nextSong.videoId && nextSong.metadata?.views) return;

    console.log(`[PREFETCH][${guildId}] Adiantando resolução de: ${nextSong.title}`);
    
    try {
      const res = await resolve(nextSong.title);
      if (res && res.videoId) {
        // Atualizar objeto na fila sem removê-lo
        nextSong.videoId = res.videoId;
        nextSong.title = res.title;
        nextSong.metadata = { ...nextSong.metadata, ...res.metadata };
        console.log(`[PREFETCH][${guildId}] ✅ Resolvido com sucesso: ${res.videoId}`);
      }
    } catch (e) {
      console.warn(`[PREFETCH][${guildId}] ⚠️ Falha ao pre-resolver:`, e.message);
    }
  }



  // 🔥 SAFE SKIP CHECK
  async ensureNextReady(guildId: string, timeoutMs: number = 10000): Promise<'ready' | 'timeout' | 'none'> {
    const g = this.get(guildId);
    if (!g.queue.length) return 'none'; // Nada na fila
    
    // Sem download em disco, consideramos sempre pronto para streaming
    return 'ready';
  }


  pause(guildId: string) {
    const g = this.guilds.get(guildId);
    if (!g?.player) return;

    if (g.player.state.status === AudioPlayerStatus.Playing) {
      g.player.pause(true);
    }
  }

  resume(guildId: string) {
    const g = this.guilds.get(guildId);
    if (!g?.player) return;

    if (g.player.state.status === AudioPlayerStatus.Paused) {
      g.player.unpause();
    }
  }

  skip(guildId: string) {
    const g = this.get(guildId);

    if (g.currentStream) {
      try {
        // currentStream é um ChildProcess (yt-dlp); usa kill() para encerrá-lo
        if (typeof g.currentStream.kill === 'function') g.currentStream.kill();
        else if (typeof g.currentStream.destroy === 'function') g.currentStream.destroy();
      } catch { }
      g.currentStream = null;
    }

    this.next(guildId);
  }

  resetGuild(guildId: string, options: { preserveSelfFlag?: boolean } = {}) {
    const g = this.guilds.get(guildId);
    if (!g) return;

    if (g.emptyTimeout) {
      clearTimeout(g.emptyTimeout);
      g.emptyTimeout = null;
    }

    if (g.currentStream) {
      try {
        if (typeof g.currentStream.kill === 'function') g.currentStream.kill();
        else if (typeof g.currentStream.destroy === 'function') g.currentStream.destroy();
      } catch { }
      g.currentStream = null;
    }

    try { g.player.stop(true); } catch { }
    try { g.connection?.destroy(); } catch { }

    this.guilds.delete(guildId);

    // Preservar flag se especificado (para auto-disconnect)
    if (!options.preserveSelfFlag) {
      this.selfDisconnecting.delete(guildId);
    }
  }

  startAutoDisconnect(guildId: string) {
    const g = this.get(guildId);
    if (!g) return;

    // Já tem timeout? ignora
    if (g.emptyTimeout) return;

    g.emptyTimeout = setTimeout(() => {
      const guild = this.get(guildId);
      if (!guild || guild.playing || guild.queue.length > 0) return;

      this.selfDisconnecting.add(guildId);
      this.resetGuild(guildId, { preserveSelfFlag: true });

      guild.textChannel?.send({
        embeds: [createEmbed().setDescription('⏱️ Desconectado por inatividade.')]
      }).catch(() => { });

      // Limpar flag após 5s
      setTimeout(() => this.selfDisconnecting.delete(guildId), 5000);
    }, 5 * 60 * 1000); // 5 minutos
  }

  checkIfAlone(guildId: string) {
    const g = this.guilds.get(guildId);
    if (!g?.voiceChannel) return;

    // Buscar o canal de voz atualizado da guild para ter contagem correta de membros
    const voiceChannelId = g.voiceChannel.id;
    const guild = g.voiceChannel.guild;
    const freshChannel = guild?.channels?.cache?.get(voiceChannelId);

    if (!freshChannel || !('members' in freshChannel)) {
      console.log(`[CHECK ALONE] Canal de voz não encontrado ou inválido`);
      return;
    }

    const members = freshChannel.members.filter(m => !m.user.bot);
    console.log(`[CHECK ALONE] ${guildId} → ${members.size} membro(s) humano(s) no canal`);

    if (members.size === 0) {
      console.log(`[CHECK ALONE] ${guildId} → Bot está sozinho, desconectando...`);
      this.selfDisconnecting.add(guildId);

      // Enviar mensagem antes de resetar
      const textChannel = g.textChannel;
      if (textChannel) {
        textChannel.send({
          embeds: [createEmbed().setDescription('👋 Desconectado (sozinho no canal).')]
        }).catch(() => { });
      }

      this.resetGuild(guildId, { preserveSelfFlag: true });
      setTimeout(() => this.selfDisconnecting.delete(guildId), 5000);
    }
  }

  // Adiciona recomendações imediatas quando Auto é ativado
  async addAutoRecommendations(guildId: string, count = 2) {
    const g = this.get(guildId);
    if (!g || !g.current) return 0;

    try {
      const currentTitle = g.current.title || '';
      const primaryTokens = new Set<string>(tokenize(currentTitle) as string[]);

      // Contagem por artista para permitir no máx. 1 música por artista (incluindo o atual)
      const artistCount = new Map();
      let currentArtist = '';
      let currentTrack = '';

      let recommendations: any[] = [];

      // Step 1: LAST.FM COMO PRIMEIRA OPÇÃO (melhor similaridade)
      if (process.env.LASTFM_API_KEY) {
        try {
          console.log('[AUTODJ] 🎯 Step 1: Buscando recomendações via Last.FM...');
          console.log(`[AUTODJ] 📝 Título atual: "${currentTitle}"`);

          // Extrair artista e música
          const extracted = await this._extractArtistTrack(g.current);
          const artistName = extracted.artist;
          const trackName = extracted.track;
          currentArtist = (artistName || '').toLowerCase();
          currentTrack = (trackName || '').toLowerCase();

          console.log(`[AUTODJ] 🎨 Artist: "${artistName}" | 🎵 Track: "${trackName}"`);

          if (artistName && trackName) {
            const lastfmRecs = await this._getRecommendationsFromLastFM(artistName, trackName, count * 3);
            if (lastfmRecs && lastfmRecs.length > 0) {
              recommendations = lastfmRecs.map(r => ({
                source: 'lastfm',
                title: r
              }));
              console.log(`[AUTODJ] ✅ Last.FM retornou ${recommendations.length} recomendações`);
            } else {
              console.log(`[AUTODJ] ⚠️ Last.FM retornou array vazio`);
            }
          } else {
            console.log(`[AUTODJ] ⚠️ Não conseguiu extrair artist/track do título`);
          }
        } catch (lastfmErr) {
          console.error('[AUTODJ] ❌ Last.FM error:', lastfmErr.message);
          console.error('[AUTODJ] Stack:', lastfmErr.stack);
        }
      } else {
        console.log('[AUTODJ] ⚠️ LASTFM_API_KEY não configurada');
      }

      if (recommendations.length === 0) {
        console.log('[AUTODJ] Nenhuma recomendação encontrada no Last.FM');
        return 0;
      }

      // Apply filters and deduplication
      const stopwords = ['cover', 'live', 'stripped', 'acoustic', 'remix', 'karaoke', 'instrumental', 'solo'];
      const durationTolerance = 30;
      const primaryDurationRaw = g.current?.metadata?.duration;
      const primaryDuration = typeof primaryDurationRaw === 'number'
        ? primaryDurationRaw
        : Number(primaryDurationRaw || 0);
      const minTokenOverlap = 1;

      let added = 0;
      for (const rec of recommendations) {
        if (added >= count) break;

        const recArtist = (rec.title.split(' - ')[0] || '').trim().toLowerCase();
        const recTokens = tokenize(rec.title || '') as string[];
        const currentTitleClean = this._cleanTitle(currentTitle).toLowerCase();
        const recTitleClean = this._cleanTitle(rec.title || '').toLowerCase();
        if (recTitleClean === currentTitleClean) {
          console.log('[AUTODJ FILTER] REJEITADO: título igual ao atual');
          continue;
        }

        // Evitar repetir artista: no máximo 1 por artista
        if (recArtist) {
          const c = artistCount.get(recArtist) || 0;
          if (c >= 1) {
            console.log(`[AUTODJ FILTER] REJEITADO: artista repetido (${recArtist})`);
            continue;
          }
        }

        // Last.FM já garante similaridade, então pula o filtro de tokens
        if (rec.source === 'lastfm') {
          console.log(`[AUTODJ FILTER] ✅ Last.FM - pulando validação de tokens`);
        } else {
          // Check token overlap - DEVE TER TOKENS EM COMUM (para outras fontes)
          if (recTokens.length > 0 && primaryTokens.size > 0) {
            const overlap = recTokens.filter(t => primaryTokens.has(t));
            if (overlap.length < minTokenOverlap) {
              console.log(`[AUTODJ FILTER] REJEITADO: sem tokens em comum`);
              continue;
            }

            // Se TEM overlap, agora verifica similaridade Jaccard
            const sim = this._jaccardSimilarity(Array.from(primaryTokens), recTokens);
            if (sim >= 0.75) {
              console.log(`[AUTODJ FILTER] REJEITADO por similaridade muito alta: ${sim.toFixed(3)}`);
              continue;
            }
            console.log(`[AUTODJ FILTER] similaridade OK: ${sim.toFixed(3)}`);
          } else {
            if (rec.source !== 'gemini') {
              console.log(`[AUTODJ FILTER] REJEITADO: sem tokens suficientes`);
              continue;
            }
          }
        }

        // Check for stopwords
        if (stopwords.some(w => rec.title.toLowerCase().includes(w))) {
          console.log(`[AUTODJ FILTER] REJEITADO por stopword`);
          continue;
        }

        // Check duration
        const recDuration = typeof rec.duration === 'number' ? rec.duration : Number(rec.duration || 0);
        if (recDuration > 0 && primaryDuration > 0) {
          const durDiff = Math.abs(primaryDuration - recDuration);
          if (durDiff > durationTolerance) {
            console.log(`[AUTODJ FILTER] REJEITADO por duração`);
            continue;
          }
        }

        // Resolve to get videoId
        let videoId = null;
        if (rec.videoId) {
          videoId = rec.videoId;
        } else {
          try {
            console.log(`[AUTODJ] 🔎 Resolvendo: "${rec.title}"`);
            const res = await resolve(rec.title);
            if (res && res.videoId) {
              videoId = res.videoId;
            } else {
              // Se falhar, tenta busca direta no YouTube
              console.log(`[AUTODJ] ⚠️ Resolve falhou, tentando YouTube direto...`);
              const { searchYouTube } = require('./youtubeApi');
              const ytRes = await searchYouTube(rec.title);
              if (ytRes && ytRes.videoId) {
                videoId = ytRes.videoId;
                console.log(`[AUTODJ] ✅ YouTube direto encontrou: ${videoId}`);
              } else {
                console.log(`[AUTODJ FILTER] REJEITADO: não conseguiu resolver`);
                continue;
              }
            }
          } catch (e) {
            console.log(`[AUTODJ FILTER] REJEITADO: erro ao resolver - ${e.message}`);
            continue;
          }
        }

        // Check if already in queue
        if (videoId === g.current.videoId) {
          console.log(`[AUTODJ FILTER] REJEITADO: é a música atual`);
          continue;
        }
        if (g.queue.some(s => s.videoId === videoId)) {
          console.log(`[AUTODJ FILTER] REJEITADO: já está na fila`);
          continue;
        }

        console.log(`[AUTODJ] ✅ ACEITO: "${rec.title}"`);

        if (recArtist) artistCount.set(recArtist, (artistCount.get(recArtist) || 0) + 1);

        // Add to queue
        const songObj = {
          videoId: videoId,
          title: rec.title,
          metadata: { channel: rec.source }
        };

        g.queue.push(songObj);

        added++;
      }

      if (added > 0) {
        try {
          g.textChannel?.send({
            embeds: [
              require('./embed').createEmbed()
                .setDescription(`🎶 Auto: adicionadas ${added} recomendações à fila.`)
            ]
          }).catch(() => { });
        } catch { }
      }

      return added;
    } catch (err) {
      console.error('[AUTODJ] addAutoRecommendations erro:', err);
      return 0;
    }
  }

  // Helper: Get Spotify token
  async _getSpotifyToken() {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Spotify credentials not set');

    const axios = require('axios');
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await axios.post('https://accounts.spotify.com/api/token', 'grant_type=client_credentials', {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return res.data.access_token;
  }

  // Helper: Jaccard similarity
  _jaccardSimilarity(a: string[], b: string[]) {
    const A = new Set(a);
    const B = new Set(b);
    const inter = [...A].filter(x => B.has(x)).length;
    const uni = new Set([...A, ...B]).size;
    return uni === 0 ? 0 : inter / uni;
  }

  // Helper: Limpar título de sufixos do YouTube
  _cleanTitle(title: string) {
    return title
      // Normalizar travessões Unicode para hífen
      .replace(/[–—]/g, ' - ')
      // Substituir caractere de substituição (�) por hífen separador
      .replace(/\uFFFD/g, ' - ')
      // Remover parênteses/colchetes completos com tags indesejadas
      .replace(/[\[\(]\s*(?:official\s*(?:music\s*)?(?:video|audio|visualizer|lyric\s*video)|official\s+visualizer|4k|8k|(?:hq|hd|high\s*quality)|remaster(?:ed|ize[ds])?|ft\.?\s*[^\]\)]+|(?:with\s*)?lyrics|music\s*video|mv|live\s*(?:performance|version)?|studio\s*version|audio\s*only|visual\s*izer|explicit|uncensored|original\s*mix|clean\s*version|mono|stereo|full\s*album|album\s*version|extended|radio\s*edit|single\s*version|version\s*\d+\.?\d*|\d{4}\s*remaster|prod\.\s*[^\]\)]+)[\]\)]/gi, '')
      // Remover sufixos sem parênteses
      .replace(/\s+(?:official\s*(?:music\s*)?(?:video|audio|visualizer)|4k|8k|hq|hd|remaster(?:ed)?|mv|live|explicit)$/gi, '')
      // Remover sufixos em PT-BR comuns
      .replace(/\s*[-|–—]\s*(clipe\s+oficial|vídeo\s+oficial|ao\s+vivo|letra)$/gi, '')
      // Remover separadores adicionais "| Canal"
      .replace(/\s*\|\s*[^|]+$/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Helper: Extrair Artist e Track do título
  async _extractArtistTrack(song: Song) {
    // Limpar título primeiro
    const cleanedTitle = this._cleanTitle(song.title);

    // Opção 1: Já tem metadata com artist
    if (song.metadata?.artist) {
      return {
        artist: song.metadata.artist,
        track: this._cleanTitle(song.metadata.track || cleanedTitle)
      };
    }

    // Opção 2: Spotify metadata - buscou via Spotify
    if (song.metadata?.spotifyId) {
      try {
        const axios = require('axios');
        const token = await this._getSpotifyToken();
        const res = await axios.get(`https://api.spotify.com/v1/tracks/${song.metadata.spotifyId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data) {
          return {
            artist: res.data.artists[0]?.name || '',
            track: res.data.name
          };
        }
      } catch (e) {
        console.log(`[EXTRACT] Erro ao buscar Spotify: ${e.message}`);
      }
    }

    // Opção 3: Tenta parsear do título (ex: "Artist - Track")
    // Tenta separar por diversos separadores comuns e também pelo caractere de substituição
    const sepRegex = /\s*(?:-|–|—|:|\||•|\uFFFD)\s*/;
    const parts = cleanedTitle.split(sepRegex);
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        track: parts.slice(1).join(' - ').trim()
      };
    }

    // Opção 4: Busca reversa no Last.FM (tenta encontrar artist para esse track)
    console.log(`[EXTRACT] 🔍 Tentando busca reversa no Last.FM para: "${cleanedTitle}"`);
    if (process.env.LASTFM_API_KEY) {
      try {
        const axios = require('axios');
        const url = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(cleanedTitle)}&limit=1&api_key=${process.env.LASTFM_API_KEY}&format=json`;
        const res = await axios.get(url, { timeout: 5000 });

        const track = res.data?.results?.trackmatches?.track?.[0];
        if (track && track.artist) {
          console.log(`[EXTRACT] ✅ Encontrado no Last.FM: "${track.artist}" - "${track.name}"`);
          return {
            artist: track.artist,
            track: track.name || cleanedTitle
          };
        }
      } catch (e) {
        console.log(`[EXTRACT] ⚠️ Erro na busca reversa Last.FM: ${e.message}`);
      }
    }

    // Fallback: Retorna só o título
    console.log(`[EXTRACT] ℹ️ Fallback: usando só o título`);
    return {
      artist: '',
      track: cleanedTitle
    };
  }

  // Helper: Get recommendations from Last.FM
  async _getRecommendationsFromLastFM(artistName: string, trackName: string, limit = 5) {
    const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
    if (!LASTFM_API_KEY) throw new Error('Last.FM API key not set');

    try {
      // Sanitize inputs: remove tags like (Official Music Video), [Lyric Video], etc.
      const cleanArtist = String(artistName || '').replace(/\s+/g, ' ').trim();
      const cleanTrack = this._cleanTitle(String(trackName || ''));
      console.log(`[LASTFM] 🔍 Buscando: "${cleanArtist}" - "${cleanTrack}"`);

      const url =
        `https://ws.audioscrobbler.com/2.0/?` +
        `method=track.getsimilar` +
        `&artist=${encodeURIComponent(cleanArtist)}` +
        `&track=${encodeURIComponent(cleanTrack)}` +
        `&limit=${limit}` +
        `&api_key=${LASTFM_API_KEY}` +
        `&format=json`;

      console.log(`[LASTFM] 📡 URL: ${url}`);

      const res = await require('axios').get(url, { timeout: 5000 });
      console.log(`[LASTFM] ✅ Status: ${res.status}`);
      console.log(`[LASTFM] 📦 Response data:`, JSON.stringify(res.data).substring(0, 200));

      let tracks = res.data?.similartracks?.track ?? [];
      console.log(`[LASTFM] 📋 Tracks antes de validação:`, Array.isArray(tracks), typeof tracks, tracks.length || 'N/A');

      // Garantir que é array (Last.FM retorna objeto se houver 1 resultado)
      if (!Array.isArray(tracks)) {
        console.log(`[LASTFM] ⚠️ Convertendo objeto para array`);
        tracks = tracks ? [tracks] : [];
      }

      console.log(`[LASTFM] 📊 Total de tracks: ${tracks.length}`);

      const result = tracks.map(t => {
        const formatted = `${t.artist.name} - ${t.name}`;
        console.log(`[LASTFM] ✨ Formatado: "${formatted}"`);
        return formatted;
      });

      console.log(`[LASTFM] ✅ Retornando ${result.length} recomendações`);
      return result;
    } catch (err) {
      console.error('[LASTFM] ❌ Error:', err.message);
      console.error('[LASTFM] Stack:', err.stack);
      return [];
    }
  }

  // Helper: Get artist top tracks from Last.FM for artist mix
  async _getArtistMixFromLastFM(artistName: string, limit = 20) {
    const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
    if (!LASTFM_API_KEY) throw new Error('Last.FM API key not set');

    try {
      const cleanArtist = String(artistName || '').replace(/\s+/g, ' ').trim();
      console.log(`[ARTIST MIX] 🔍 Buscando top tracks de: "${cleanArtist}"`);

      const url =
        `https://ws.audioscrobbler.com/2.0/?` +
        `method=artist.gettoptracks` +
        `&artist=${encodeURIComponent(cleanArtist)}` +
        `&limit=${limit}` +
        `&api_key=${LASTFM_API_KEY}` +
        `&format=json`;

      console.log(`[ARTIST MIX] 📡 URL: ${url}`);

      const res = await require('axios').get(url, { timeout: 5000 });
      console.log(`[ARTIST MIX] ✅ Status: ${res.status}`);

      let tracks = res.data?.toptracks?.track ?? [];
      console.log(`[ARTIST MIX] 📋 Tracks recebidas:`, Array.isArray(tracks), typeof tracks, tracks.length || 'N/A');

      // Garantir que é array
      if (!Array.isArray(tracks)) {
        console.log(`[ARTIST MIX] ⚠️ Convertendo objeto para array`);
        tracks = tracks ? [tracks] : [];
      }

      console.log(`[ARTIST MIX] 📊 Total de tracks: ${tracks.length}`);

      const result = tracks.map(t => {
        const formatted = `${t.artist.name} - ${t.name}`;
        console.log(`[ARTIST MIX] ✨ Formatado: "${formatted}"`);
        return formatted;
      });

      console.log(`[ARTIST MIX] ✅ Retornando ${result.length} tracks do artista`);
      return result;
    } catch (err) {
      console.error('[ARTIST MIX] ❌ Error:', err.message);
      console.error('[ARTIST MIX] Stack:', err.stack);
      return [];
    }
  }

  // Create artist mix: fetch top tracks from same artist and add to queue
  async createArtistMix(guildId: string) {
    const g = this.get(guildId);
    if (!g || !g.current) {
      console.log('[ARTIST MIX] ⚠️ Sem música tocando');
      return;
    }

    try {
      // Extract artist from current song
      const extracted = await this._extractArtistTrack(g.current);
      const artistName = extracted.artist;

      if (!artistName) {
        console.log('[ARTIST MIX] ⚠️ Não conseguiu extrair artista da música atual');
        g.textChannel?.send({
          embeds: [
            require('./embed').createEmbed()
              .setDescription('❌ Não consegui identificar o artista desta música.')
          ]
        }).catch(() => { });
        return;
      }

      console.log(`[ARTIST MIX] 🎨 Criando mix para artista: "${artistName}"`);

      // Send initial feedback
      const feedbackMsg = await g.textChannel?.send({
        embeds: [
          require('./embed').createEmbed()
            .setDescription(`✨ Criando mix de **${artistName}**...`)
        ]
      }).catch(() => null);

      // Fetch 20 top tracks from Last.fm
      const tracks = await this._getArtistMixFromLastFM(artistName, 20);

      if (!tracks || tracks.length === 0) {
        console.log('[ARTIST MIX] ⚠️ Nenhuma track encontrada no Last.FM');
        if (feedbackMsg) {
          feedbackMsg.edit({
            embeds: [
              require('./embed').createEmbed()
                .setDescription(`❌ Não encontrei músicas de **${artistName}** no Last.fm.`)
            ]
          }).catch(() => { });
        }
        return;
      }

      console.log(`[ARTIST MIX] 📦 Recebidas ${tracks.length} tracks, processando...`);

      // Filter out current song
      const currentTitleClean = this._cleanTitle(g.current.title || '').toLowerCase();
      const filteredTracks = tracks.filter(track => {
        const trackClean = this._cleanTitle(track).toLowerCase();
        return trackClean !== currentTitleClean;
      });

      console.log(`[ARTIST MIX] 🔍 Após filtrar música atual: ${filteredTracks.length} tracks`);

      // Select up to 10 tracks
      const selectedTracks = filteredTracks.slice(0, 10);
      console.log(`[ARTIST MIX] ✅ Selecionadas ${selectedTracks.length} tracks para adicionar`);

      let added = 0;
      const { resolve } = require('./resolver');

      for (const track of selectedTracks) {
        try {
          console.log(`[ARTIST MIX] 🔎 Resolvendo: "${track}"`);
          const resolved = await resolve(track);

          if (!resolved || !resolved.videoId) {
            console.log(`[ARTIST MIX] ⚠️ Não conseguiu resolver: "${track}"`);
            continue;
          }

          // Check if already in queue or currently playing
          if (resolved.videoId === g.current?.videoId) {
            console.log(`[ARTIST MIX] ⏭️ Pulando (é a música atual)`);
            continue;
          }

          if (g.queue.some(s => s.videoId === resolved.videoId)) {
            console.log(`[ARTIST MIX] ⏭️ Pulando (já está na fila)`);
            continue;
          }

          // Create new song object
          const songObj = {
            videoId: resolved.videoId,
            title: resolved.title || track,
            metadata: resolved.metadata
          };

          // Add to queue
          g.queue.push(songObj);
          console.log(`[ARTIST MIX] ✅ Adicionado: "${songObj.title}"`);

          added++;
        } catch (err) {
          console.error(`[ARTIST MIX] ❌ Erro ao processar "${track}":`, err.message);
        }
      }

      // Send final feedback
      if (feedbackMsg) {
        if (added > 0) {
          feedbackMsg.edit({
            embeds: [
              require('./embed').createEmbed()
                .setDescription(`✨ Mix de **${artistName}** criado!\n🎵 ${added} música${added > 1 ? 's' : ''} adicionada${added > 1 ? 's' : ''} à fila.`)
            ]
          }).catch(() => { });
        } else {
          feedbackMsg.edit({
            embeds: [
              require('./embed').createEmbed()
                .setDescription(`❌ Não consegui adicionar músicas de **${artistName}** à fila.`)
            ]
          }).catch(() => { });
        }
      }

      console.log(`[ARTIST MIX] 🎉 Mix criado com sucesso: ${added} músicas adicionadas`);
    } catch (err) {
      console.error('[ARTIST MIX] ❌ Erro geral:', err.message);
      g.textChannel?.send({
        embeds: [
          require('./embed').createEmbed()
            .setDescription('❌ Erro ao criar mix do artista.')
        ]
      }).catch(() => { });
    }
  }


  async _getRecommendationsFromGemini(musicTitle: string, limit = 5) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('Gemini API key not set');

    const https = require('https');
    const modelo = 'gemini-2.0-flash-exp';
    const prompt = `Me recomende ${limit} músicas similares a "${musicTitle}".
Responda apenas com um array JavaScript no formato ["Artista - Música"], sem explicações, sem markdown.`;

    const data = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${modelo}:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              console.error(`[AUTODJ] Gemini error (${res.statusCode})`);
              return resolve([]);
            }

            const result = JSON.parse(body);
            const content = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (!content) return resolve([]);

            const match = content.match(/\[[\s\S]*\]/);
            if (match) {
              try {
                const arr = JSON.parse(match[0]);
                console.log(`[AUTODJ] Gemini retornou ${arr.length} recomendações`);
                return resolve(arr);
              } catch (e) {
                console.error('[AUTODJ] Erro ao parsear JSON Gemini:', e.message);
                return resolve([]);
              }
            }
            resolve([]);
          } catch (e) {
            console.error('[AUTODJ] Erro Gemini:', e.message);
            resolve([]);
          }
        });
      });

      req.on('error', err => {
        console.error('[AUTODJ] Erro HTTP Gemini:', err.message);
        resolve([]);
      });

      req.write(data);
      req.end();
    });
  }
}

module.exports = new QueueManager();

