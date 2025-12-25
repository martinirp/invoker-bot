export interface SongMetadata {
  duration?: string;
  views?: number;
  channel?: string;
  title?: string;
  description?: string;
  artist?: string;
  track?: string;
  spotifyId?: string;
}

export interface Song {
  videoId?: string;
  title: string;
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
