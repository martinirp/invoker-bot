import fs from 'fs';
import path from 'path';
import type { DownloadGuildState, DownloadQueueItem, Song } from '../types/music';

const cachePath = require('./cachePath') as (id: string) => string;
const { downloadForDiscord } = require('./ytDlp');
const db = require('./db');
const { normalizeTitle } = require('./textUtils');
const { updateMetadataAsync } = require('./metadataFetcher');

function generateKeysFromTitle(title: string) {
  const clean = normalizeTitle(title || '');
  const parts = clean.split(' - ');

  const keys = new Set<string>();

  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const track = parts.slice(1).join(' - ').trim();

    keys.add(`${artist} ${track}`);
    keys.add(`${track} ${artist}`);
    keys.add(artist);
    keys.add(track);
  } else {
    keys.add(clean);
  }

  return keys;
}

class DownloadQueue {
  private guilds: Map<string, DownloadGuildState>;
  private active: number;
  private readonly MAX_CONCURRENCY: number;
  
  // Track ongoing downloads to allow awaiting them
  private activeDownloads: Map<string, Promise<string>>;

  constructor() {
    this.guilds = new Map();
    this.active = 0;
    this.MAX_CONCURRENCY = Number(process.env.DOWNLOAD_CONCURRENCY || 4);
    this.activeDownloads = new Map();
  }

  get(guildId: string): DownloadGuildState {
    if (!this.guilds.has(guildId)) {
      this.guilds.set(guildId, {
        queue: [],
        downloading: false,
        currentController: null
      });
    }
    return this.guilds.get(guildId)!;
  }

  enqueue(guildId: string, song: Song) {
    const g = this.get(guildId);
    const videoId = song.videoId || '';
    const file = song.file || cachePath(videoId);
    if (fs.existsSync(file)) return;

    if (g.queue.find(s => s.videoId === videoId)) return;

    const item: DownloadQueueItem = { ...song, file } as DownloadQueueItem;
    g.queue.push(item);
    this._tryNext();
  }

  async awaitDownload(song: Song, textChannel?: any) {
    const videoId = song.videoId || '';
    const file = song.file || cachePath(videoId);

    // Se já existe, retorna rápido
    if (fs.existsSync(file)) return file;

    // Se já está baixando, apenas aguarda
    if (this.activeDownloads.has(videoId)) {
      if (textChannel) {
         textChannel.send({ embeds: [{ description: `⏳ Aguardando download de **${song.title}**...`, color: 0xFFFF00 }] }).catch(() => {});
      }
      try {
        await this.activeDownloads.get(videoId);
        return file;
      } catch (err) {
        console.error(`[DOWNLOAD] Erro ao aguardar download de ${videoId}:`, err);
        throw err;
      }
    }

    // Se não está baixando, precisamos forçar o download IMEDIATAMENTE e aguardar
    if (textChannel) {
       textChannel.send({ embeds: [{ description: `⏳ Baixando **${song.title}** (isso pode levar alguns segundos)...`, color: 0xFFFF00 }] }).catch(() => {});
    }
    
    // Iniciar o download agora e registrar na lista de downloads ativos
    const promise = this._performDownload(song, file);
    this.activeDownloads.set(videoId, promise);
    
    try {
      await promise;
      return file;
    } finally {
      this.activeDownloads.delete(videoId);
      this._tryNext(); // Liberar a fila caso estivesse bloqueada
    }
  }

  private async _startDownload(guildId: string, song: DownloadQueueItem, state: DownloadGuildState) {
    state.downloading = true;
    this.active += 1;
    const videoId = song.videoId || '';
    const file = song.file;

    // Se já existe no activeDownloads (sendo baixado forçadamente pelo awaitDownload), apenas aguarda
    if (this.activeDownloads.has(videoId)) {
      try { await this.activeDownloads.get(videoId); } catch {}
      state.downloading = false;
      this.active = Math.max(0, this.active - 1);
      this._tryNext();
      return;
    }

    console.log(`[DOWNLOAD] ${guildId} → pre-fetching: ${song.title}`);
    
    const promise = this._performDownload(song, file);
    this.activeDownloads.set(videoId, promise);

    try {
      await promise;
    } catch (err) {
      console.error(`[DOWNLOAD] Erro no background download de ${song.title}:`, err);
    } finally {
      this.activeDownloads.delete(videoId);
      state.downloading = false;
      this.active = Math.max(0, this.active - 1);
      this._tryNext();
    }
  }

  private async _performDownload(song: any, finalFile: string) {
    const videoId = song.videoId || '';
    const title = song.title || '';
    const dir = path.dirname(finalFile);
    fs.mkdirSync(dir, { recursive: true });

    const tempFile = `${finalFile}.part`;

    // Deletar tempFile se existir de uma execução anterior abortada
    if (fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch {}
    }

    // Executar yt-dlp de forma síncrona/promissificada
    await downloadForDiscord(videoId, song.streamUrl, tempFile);

    // Validação de arquivo final
    if (!fs.existsSync(tempFile)) {
      throw new Error(`Arquivo não foi gerado pelo yt-dlp: ${tempFile}`);
    }

    const stats = fs.statSync(tempFile);
    if (stats.size === 0) {
      fs.unlinkSync(tempFile);
      throw new Error(`Arquivo gerado vazio`);
    }

    // Renomear pro arquivo final
    fs.renameSync(tempFile, finalFile);

    // DB updates
    const keys = generateKeysFromTitle(title);
    keys.add(videoId);

    db.insertSong({
      videoId,
      title,
      artist: null,
      track: null,
      file: finalFile,
      streamUrl: song.streamUrl || null
    });

    for (const k of keys) {
      db.insertKey(k, videoId);
    }

    // Metadados em background
    updateMetadataAsync(videoId).catch((err: any) => {
      console.error('[METADATA] Erro na atualização assíncrona:', err);
    });

    console.log(`[DOWNLOAD-DB] Concluído e salvo no banco: ${title}`);
    return finalFile;
  }

  private _tryNext() {
    while (this.active < this.MAX_CONCURRENCY) {
      const entry = [...this.guilds.entries()].find(([, st]) => !st.downloading && st.queue.length > 0);
      if (!entry) return;

      const [guildId, state] = entry;
      const nextSong = state.queue.shift();
      if (!nextSong) return;

      this._startDownload(guildId, nextSong, state);
    }
  }

  resetGuild(guildId: string) {
    const g = this.guilds.get(guildId);
    if (g?.currentController) {
      try { g.currentController.abort(); } catch {}
    }
    this.guilds.delete(guildId);
    this._tryNext();
  }
}

const downloadQueue = new DownloadQueue();
module.exports = downloadQueue;
module.exports.default = downloadQueue;
module.exports.DownloadQueue = DownloadQueue;
