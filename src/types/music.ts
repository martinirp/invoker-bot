export interface SongMetadata {
  duration?: string;
  views?: number;
  channel?: string;
  title?: string;
  description?: string;
  artist?: string;
  track?: string;
  spotifyId?: string;
  source?: string;
  [key: string]: any;
}

export interface Song {
  videoId?: string;
  title: string;
  artist?: string;  // 🔥 NOVO: Campo para artista (atualizado assincronamente)
  track?: string;   // 🔥 NOVO: Campo para faixa (atualizado assincronamente)
  file?: string;
  streamUrl?: string;
  metadata?: SongMetadata;
}

export interface DownloadQueueItem extends Song {
  file: string;
}

export interface DownloadGuildState {
  queue: DownloadQueueItem[];
  downloading: boolean;
  currentController: AbortController | null;
}
