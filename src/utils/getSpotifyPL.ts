// @ts-nocheck
const axios = require('axios');
const { getSpotifyToken } = require('./spotifyResolver');

async function getSpotifyPlaylist(spotifyUrl, limit = 500) {
  try {
    const token = await getSpotifyToken();

    // extrair playlist id: suporta urls como
    // https://open.spotify.com/playlist/{id}
    // spotify:playlist:{id}
    const m = spotifyUrl.match(/playlist[/:]([a-zA-Z0-9]+)/) || spotifyUrl.match(/playlist\/?(.*)$/);
    const playlistId = m ? m[1] : null;
    if (!playlistId) throw new Error('Playlist ID não encontrada');

    const items = [];
    let offset = 0;
    const pageSize = 100;

    while (items.length < limit) {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
      const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?${params.toString()}`;

      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.data || !Array.isArray(res.data.items)) break;

      for (const it of res.data.items) {
        if (!it || !it.track) continue;
        const t = it.track;
        const artists = (t.artists || []).map(a => a.name).join(', ');
        const title = t.name;
        items.push({ artist: artists, title, query: `${artists} - ${title}`, trackId: t.id });
        if (items.length >= limit) break;
      }

      if (res.data.items.length < pageSize) break; // last page
      offset += pageSize;
    }

    return items;
  } catch (err) {
    console.error('[SPOTIFY-PL] erro ao obter playlist:', err && (err.response ? (err.response.data || err.response.status) : err.message));
    throw err;
  }
}

module.exports = { getSpotifyPlaylist };
