// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const queueManager = require('../utils/queueManager');
const db = require('../utils/db');

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

async function execute(message) {
  const guildId = message.guild.id;
  const voiceChannel = message.member.voice.channel;
  const textChannel = message.channel;

  if (!voiceChannel) {
    return textChannel.send({
      embeds: [
        createEmbed().setDescription('❌ Entre em um canal de voz.')
      ]
    });
  }

  const songs = db.getAllSongs();

  if (!songs.length) {
    return textChannel.send({
      embeds: [
        createEmbed().setDescription('❌ Não há músicas no banco.')
      ]
    });
  }

  shuffle(songs);

  const selected = songs.slice(0, 10);

  for (const song of selected) {
    await queueManager.play(
      guildId,
      voiceChannel,
      {
        videoId: song.videoId,
        title: song.title,
        file: song.file
      },
      textChannel
    );
  }

  textChannel.send({
    embeds: [
      createEmbed()
        .setTitle('🎧 Mix aleatório')
        .setDescription(`Foram adicionadas **${selected.length}** músicas aleatórias à fila.`)
    ]
  }).catch(() => {});
}

module.exports = {
  name: 'mix',
  aliases: ['m', 'radio'],
  description: 'Adiciona músicas aleatórias da biblioteca na fila',
  usage: '#mix <quantidade>',
  execute
};



