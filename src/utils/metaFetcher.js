

const YT_API_KEY = process.env.YT_API_KEY;
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

async function fetchYoutubeMeta(videoId) {
  if (!YT_API_KEY) return null;
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.items || !json.items[0]) return null;
    const snippet = json.items[0].snippet;
    return {
      title: snippet.title,
      artist: snippet.channelTitle,
      track: snippet.title
    };
  } catch {
    return null;
  }
}

async function fetchLastfmMeta(title) {
  if (!LASTFM_API_KEY) return null;
  try {
    const url = `http://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(title)}&api_key=${LASTFM_API_KEY}&format=json&limit=1`;
    const res = await fetch(url);
    const json = await res.json();
    const track = json.results?.trackmatches?.track?.[0];
    if (!track) return null;
    return {
      title: track.name,
      artist: track.artist,
      track: track.name
    };
  } catch {
    return null;
  }
}

module.exports = { fetchYoutubeMeta, fetchLastfmMeta };
