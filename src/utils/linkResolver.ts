// @ts-nocheck
const { spawn } = require('child_process');
const { getPlaylistItems } = require('./youtubeApi');

function isYoutubeLink(input) {
  try {
    const url = new URL(input);
    return ['youtube.com', 'www.youtube.com', 'youtu.be', 'music.youtube.com'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isSoundCloudLink(input) {
  try {
    const url = new URL(input);
    return url.hostname.includes('soundcloud.com');
  } catch {
    return false;
  }
}

function isBandcampLink(input) {
  try {
    const url = new URL(input);
    return url.hostname.includes('bandcamp.com');
  } catch {
    return false;
  }
}

function isSpotifyLink(input) {
  if (input.startsWith('spotify:')) return true;
  try {
    const url = new URL(input);
    return ['spotify.com', 'open.spotify.com'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isDirectAudioUrl(input) {
  return /\.(mp3|ogg|m4a|wav|flac|aac|opus|webm)$/i.test(input);
}

function isPlaylist(input) {
  // Ignora mixes ou rádios automáticas (ex: list=RD..., WL, LL)
  if (/[?&]start_radio=1/.test(input)) return false;
  if (/[?&]list=(RD|WL|LL|LM)/.test(input)) return false;
  return /[?&]list=/.test(input);
}

function getPlaylistId(url) {
  const match = url.match(/[?&]list=([^&]+)/);
  return match ? match[1] : null;
}

function detectSourceType(input) {
  if (isDirectAudioUrl(input)) return 'direct';
  if (isSoundCloudLink(input)) return 'soundcloud';
  if (isBandcampLink(input)) return 'bandcamp';
  if (isSpotifyLink(input)) return 'spotify';
  if (isYoutubeLink(input)) return 'youtube';
  return 'search';
}

async function resolveVideo(url) {
  const { runYtDlpJson } = require('./ytDlp');

  const data = await runYtDlpJson([
    '--dump-json',
    '--no-playlist',
    url
  ]);

  return {
    videoId: data.id,
    title: data.title,
    channel: data.uploader
  };
}

function resolvePlaylist(url) {
  const playlistId = getPlaylistId(url);
  
  if (!playlistId) {
    return Promise.reject(new Error('ID da playlist não encontrado'));
  }

  // Tentar YouTube API primeiro (muito mais rápido)
  return getPlaylistItems(playlistId, 100)
    .then(result => {
      if (result) {
        console.log(`[PLAYLIST] YouTube API resolveu ${result.videos.length} vídeos`);
        return result;
      }
      
      // Fallback: yt-dlp
      console.log('[PLAYLIST] YouTube API indisponível, usando yt-dlp...');
      return resolvePlaylistYtDlp(url);
    })
    .catch(err => {
      console.error('[PLAYLIST] Erro na API, fallback yt-dlp:', err.message);
      return resolvePlaylistYtDlp(url);
    });
}

function resolvePlaylistYtDlp(url) {
  return new Promise((resolve, reject) => {
    const yt = spawn('yt-dlp', [
      '--flat-playlist',
      '--dump-json',
      url
    ]);

    const videos = [];
    let buffer = '';

    yt.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        try {
          const d = JSON.parse(line);
          videos.push({
            videoId: d.id,
            title: d.title
          });
        } catch {}
      }
    });

    yt.on('close', code => {
      if (code !== 0) return reject(new Error('Erro playlist'));
      resolve({
        title: 'Playlist do YouTube',
        videos
      });
    });
  });
}

module.exports = {
  isYoutubeLink,
  isSoundCloudLink,
  isBandcampLink,
  isSpotifyLink,
  isDirectAudioUrl,
  detectSourceType,
  isPlaylist,
  getPlaylistId,
  resolveVideo,
  resolvePlaylist
};

