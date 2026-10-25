// @ts-nocheck
const fs = require("fs");
const path = require("path");
const { createEmbed } = require("../utils/embed");
const queueManager = require("../utils/queueManager");

async function execute(message) {
  const guildId = message.guild?.id;
  const voiceChannel = message.member?.voice?.channel;
  const textChannel = message.channel;

  if (!guildId || !textChannel?.isTextBased()) return;

  console.log("[PICANHA] comando recebido em " + guildId);

  if (!voiceChannel) {
    return textChannel.send({
      embeds: [
        createEmbed().setDescription("❌ Entre em um canal de voz.")
      ]
    });
  }

  const possiblePaths = [
    path.resolve(__dirname, "../../picanha.ogg"),
    path.resolve(process.cwd(), "picanha.ogg"),
    path.resolve(__dirname, "../picanha.ogg")
  ];

  const audioPath = possiblePaths.find(p => fs.existsSync(p));

  if (!audioPath) {
    return textChannel.send({
      embeds: [
        createEmbed().setDescription("❌ Arquivo picanha.ogg nao foi encontrado no servidor.")
      ]
    });
  }

  queueManager.ensureConnection(guildId, voiceChannel);

  const song = {
    title: "Picanha",
    file: audioPath,
    streamUrl: audioPath,
    metadata: {
      source: "local",
      title: "Picanha",
      artist: "Lula",
      duration: "0:18"
    }
  };

  const playPromise = queueManager.play(guildId, voiceChannel, song, textChannel);

  textChannel.send({
    embeds: [
      createEmbed().setDescription("🥩 **Picanha** adicionada à fila!")
    ]
  }).catch(() => {});

  await playPromise;
}

module.exports = {
  name: "picanha",
  aliases: ["pica"],
  description: "🥩 Toca o áudio da picanha no canal de voz",
  usage: "",
  execute
};
