// @ts-nocheck
/**
 * Persistência de fila entre reinícios.
 *
 * O comando #reset encerra o processo com process.exit(1), o que descarta
 * qualquer estado salvo apenas em memória. Esta utilidade serializa a fila
 * de todas as guilds em um arquivo JSON e a restaura após a reconexão.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = process.env.QUEUE_STATE_PATH || path.join(__dirname, '..', '..', '.queue_state.json');

function serializeSong(song) {
  if (!song) return null;
  return {
    videoId: song.videoId || null,
    title: song.title || '',
    artist: song.artist || null,
    track: song.track || null,
    file: song.file || null,
    streamUrl: song.streamUrl || null,
    metadata: song.metadata || null
  };
}

function saveQueues(queueManager) {
  const data = {};

  for (const [guildId, g] of queueManager.guilds) {
    if (!g || (!g.queue.length && !g.current)) continue;
    data[guildId] = {
      current: serializeSong(g.current),
      queue: g.queue.map(serializeSong),
      textChannelId: g.textChannel?.id || null,
      voiceChannelId: g.voiceChannel?.id || null,
      volume: g.volume || 1,
      loop: !!g.loop,
      autoDJ: !!g.autoDJ,
      savedAt: Date.now()
    };
  }

  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
    console.log(`[PERSIST] estado salvo (${Object.keys(data).length} guilds)`);
    return Object.keys(data).length;
  } catch (e) {
    console.error('[PERSIST] erro ao salvar estado:', e.message);
    return 0;
  }
}

function loadQueues() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (e) {
    console.error('[PERSIST] erro ao ler estado:', e.message);
    return null;
  }
}

function clearQueues() {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  } catch (e) {
    // ignora
  }
}

async function restoreQueues(queueManager, client) {
  const data = loadQueues();
  if (!data) return 0;

  let restored = 0;

  for (const [guildId, saved] of Object.entries(data)) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;

      const textChannel = saved.textChannelId ? guild.channels.cache.get(saved.textChannelId) : null;
      const voiceChannel = saved.voiceChannelId ? guild.channels.cache.get(saved.voiceChannelId) : null;
      if (!textChannel || !voiceChannel) continue;

      const g = queueManager.get(guildId);
      if (saved.volume) g.volume = saved.volume;
      g.loop = !!saved.loop;
      g.autoDJ = !!saved.autoDJ;

      if (saved.current) {
        await queueManager.playNow(guildId, voiceChannel, serializeSong(saved.current), textChannel);
        restored++;
      }

      for (const song of saved.queue) {
        if (!song) continue;
        await queueManager.play(guildId, voiceChannel, serializeSong(song), textChannel);
        restored++;
      }

      console.log(`[PERSIST] fila restaurada para guild ${guildId}`);
    } catch (e) {
      console.error(`[PERSIST] erro ao restaurar guild ${guildId}:`, e.message);
    }
  }

  clearQueues();
  console.log(`[PERSIST] restauração concluída: ${restored} músicas`);
  return restored;
}

module.exports = { saveQueues, loadQueues, restoreQueues, clearQueues };
