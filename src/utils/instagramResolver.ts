// @ts-nocheck
const { runYtDlpJson } = require('./ytDlp');

const INSTAGRAM_HOSTS = [
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
  'www.instagr.am'
];

/**
 * Detecta links de Reels/Posts/IGTV do Instagram.
 * Ex.: https://www.instagram.com/reel/ABC123/?igsh=...
 */
function isInstagramLink(query) {
  if (!query || typeof query !== 'string') return false;
  try {
    const url = new URL(query);
    if (!INSTAGRAM_HOSTS.includes(url.hostname.toLowerCase())) return false;
    return /\/(reel|reels|p|tv)\//i.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Remove parâmetros de rastreio (igsh, utm...) e padroniza o link do Reel.
 */
function normalizeInstagramUrl(input) {
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    if (!match) return input;
    const type = match[1].toLowerCase() === 'reels' ? 'reel' : match[1].toLowerCase();
    return `https://www.instagram.com/${type}/${match[2]}/`;
  } catch {
    return input;
  }
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function pickTitle(data) {
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  const rawTitle = clean(data?.title);
  const rawDescription = clean(data?.description);

  // A legenda costuma ser mais útil que o título genérico "Video by <user>"
  const caption = rawDescription.replace(/#[^\s#]+/g, '').replace(/\s+/g, ' ').trim();
  const titleIsGeneric = !rawTitle
    || /^video by /i.test(rawTitle)
    || rawTitle.toLowerCase() === 'instagram';

  const chosen = (titleIsGeneric ? (caption || rawTitle) : rawTitle)
    || (data?.uploader ? `Reel de ${data.uploader}` : '')
    || (data?.id ? `Instagram Reel ${data.id}` : 'Instagram Reel');

  return chosen.length > 100 ? `${chosen.slice(0, 97)}...` : chosen;
}

function lastStderrLine(err) {
  const stderr = String(err?.stderr || '').trim();
  if (!stderr) return err?.message || 'erro desconhecido';
  const lines = stderr.split(/\r?\n/).filter(Boolean);
  return lines[lines.length - 1];
}

/**
 * Resolve um Reel do Instagram via yt-dlp.
 * Retorna título, autor, thumbnail, duração e a URL usada no streaming.
 */
async function resolveInstagramTrack(input) {
  const url = normalizeInstagramUrl(input);

  try {
    const data = await runYtDlpJson([
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      url
    ]);

    return {
      id: data.id,
      title: pickTitle(data),
      artist: data.uploader || data.channel || data.uploader_id || 'Instagram',
      image: data.thumbnail || null,
      duration: formatDuration(data.duration),
      description: data.description || null,
      originalUrl: data.webpage_url || url,
      streamUrl: url
    };
  } catch (err) {
    const stderr = String(err?.stderr || '');

    if (/login|checkpoint|cookie|rate.?limit|401|403|not available/i.test(stderr)) {
      throw new Error(
        'O Instagram bloqueou o acesso a este Reel (login/limite). ' +
        'Configure YTDLP_COOKIES_FROM_BROWSER (ex.: chrome) ou YTDLP_COOKIES_FILE no .env e tente novamente.'
      );
    }

    throw new Error(`Não foi possível obter o áudio do Reel: ${lastStderrLine(err)}`);
  }
}

module.exports = {
  isInstagramLink,
  normalizeInstagramUrl,
  resolveInstagramTrack
};
