import { EmbedBuilder } from 'discord.js';

export type SongStatus = 'playing' | 'queued' | 'added';

export interface SongLike {
  videoId?: string;
  title?: string;
  channel?: string;
  duration?: string;
}

export function createEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTimestamp()
    .setFooter({ text: 'Music Bot' });
}

// Decodifica entidades HTML comuns em strings (ex: &quot; → ")
export function decodeHtml(str?: string): string | undefined {
  if (!str || typeof str !== 'string') return str;
  let s = str;
  const entities: Record<string, string> = {
    '&quot;': '"',
    '&#34;': '"',
    '&amp;': '&',
    '&#39;': "'",
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>'
  };

  s = s.replace(/&[a-zA-Z0-9#]+;/g, match => entities[match] || match);
  s = s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  s = s.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  return s;
}

export function createSongEmbed(
  song: SongLike,
  status: SongStatus = 'playing',
  loop = false,
  autoDJ = false
): EmbedBuilder {
  const embed = createEmbed();

  // Cor dourada quando loop ativo, cinza quando inativo
  if (status === 'playing') {
    embed.setColor(loop ? 0xFFD700 : 0x808080); // Gold vs Gray
  }

  const statusEmoji: Record<SongStatus, string> = {
    playing: '▶️ Tocando agora',
    queued: '📝 Adicionado à fila',
    added: '✅ Adicionado'
  };

  embed.setTitle(statusEmoji[status] ?? '🎵 Música');
  const cleanTitle = decodeHtml(song.title || '') || '';
  embed.setDescription(`**${cleanTitle}**`);

  if (song.channel) {
    embed.addFields({ name: '👤 Canal', value: decodeHtml(song.channel) || song.channel, inline: true });
  }

  if (song.duration) {
    embed.addFields({ name: '⏱️ Duração', value: song.duration, inline: true });
  }

  if (status === 'playing') {
    embed.addFields({ name: '🔁 Loop', value: loop ? '✅ Ativado' : '❌ Desativado', inline: true });
    embed.addFields({ name: '🎧 Auto', value: autoDJ ? '✅ Ativado' : '❌ Desativado', inline: true });
  }

  if (song.videoId) {
    embed.setURL(`https://www.youtube.com/watch?v=${song.videoId}`);
  }

  return embed;
}

