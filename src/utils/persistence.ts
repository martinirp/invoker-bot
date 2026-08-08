// @ts-nocheck
/**
 * Persistência de filas em disco.
 * Salva o estado de todas as guilds em um JSON para restaurar após reinício.
 */
const fs = require('fs');
const path = require('path');

const QUEUE_STATE_PATH = process.env.QUEUE_STATE_PATH || path.join(process.cwd(), '.queue_state.json');

function _snapshot(queueManager) {
  const data = {};
  if (!queueManager || !queueManager.guilds) return data;

  for (const [guildId, g] of queueManager.guilds) {
    if (!g) continue;
    data[guildId] = {
      current: g.current ? { ...g.current } : null,
      queue: g.queue.map(song => ({ ...song })),
      textChannelId: g.textChannel?.id || null,
      voiceChannelId: g.voiceChannel?.id || null
    };
  }
  return data;
}

function saveQueues(queueManager) {
  try {
    const data = _snapshot(queueManager);
    fs.mkdirSync(path.dirname(path.resolve(QUEUE_STATE_PATH)), { recursive: true });
    fs.writeFileSync(QUEUE_STATE_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[PERSIST] estado salvo (${Object.keys(data).length} guilds)`);
    return true;
  } catch (e) {
    console.error('[PERSIST] erro ao salvar estado:', e.message);
    return false;
  }
}

function loadQueues() {
  try {
    if (!fs.existsSync(QUEUE_STATE_PATH)) return {};
    const raw = fs.readFileSync(QUEUE_STATE_PATH, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    console.error('[PERSIST] erro ao ler estado salvo:', e.message);
    return {};
  }
}

function clearQueues() {
  try {
    if (fs.existsSync(QUEUE_STATE_PATH)) fs.unlinkSync(QUEUE_STATE_PATH);
  } catch (e) {
    console.error('[PERSIST] erro ao limpar estado:', e.message);
  }
}

/**
 * Restaura as filas salvas após o bot reconectar.
 * @param {object} queueManager - instância do QueueManager
 * @param {object} client - client do Discord.js (para resgatar canais)
 */
async function restoreQueues(queueManager, client) {
  const saved = loadQueues();
  const guildIds = Object.keys(saved);
  if (guildIds.length === 0) {
    clearQueues();
    return;
  }

  let restored = 0;
  for (const guildId of guildIds) {
    const s = saved[guildId];
    if (!s || (!s.current && (!Array.isArray(s.queue) || s.queue.length === 0))) continue;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const textChannel = s.textChannelId ? guild.channels.cache.get(s.textChannelId) : null;
    const voiceChannel = s.voiceChannelId ? guild.channels.cache.get(s.voiceChannelId) : null;

    if (!voiceChannel || !textChannel) continue;

    try {
      if (s.current) {
        await queueManager.playNow(guildId, voiceChannel, s.current, textChannel);
      }
      for (const song of s.queue || []) {
        await queueManager.play(guildId, voiceChannel, song, textChannel);
      }
      restored++;
      console.log(`[PERSIST] fila restaurada para ${guildId}`);
    } catch (e) {
      console.error(`[PERSIST] erro ao restaurar ${guildId}:`, e.message);
    }
  }

  console.log(`[PERSIST] ${restored} fila(s) restaurada(s)`);
  clearQueues();
}

module.exports = { saveQueues, loadQueues, restoreQueues, clearQueues };
