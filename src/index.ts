
// ===============================================
// 🐛 DEBUG EMBED
// ===============================================
function sendDebugEmbed(guildId, msg) {
  if (process.env.DISCORD_DEBUG !== 'true') return;
  const textChannel = lastTextChannel.get(guildId);
  if (!textChannel) return;

  // Armazenar mensagens acumuladas por guild
  if (!global._debugEmbedState) global._debugEmbedState = {};
  if (!global._debugEmbedState[guildId]) {
    global._debugEmbedState[guildId] = { messages: [], lastMsg: null };
  }
  const state = global._debugEmbedState[guildId];
  state.messages.push(msg);

  // Limite de caracteres por embed (Discord: 4096 por descrição)
  const MAX_CHARS = 4000;
  let allText = state.messages.join('\n');

  // Se exceder limite, cria novo embed e reseta
  if (allText.length > MAX_CHARS) {
    // Envia embed anterior
    if (state.lastMsg) {
      textChannel.send({ embeds: [createEmbed().setTitle('Debug (cont.)').setDescription('```' + allText.slice(0, MAX_CHARS) + '```')] }).catch(() => { });
    }
    // Restaura apenas a última mensagem
    state.messages = [msg];
    allText = msg;
  }

  // Edita ou envia embed
  if (state.lastMsg) {
    state.lastMsg.edit({ embeds: [createEmbed().setTitle('Debug').setDescription('```' + allText + '```')] }).catch(() => { });
  } else {
    textChannel.send({ embeds: [createEmbed().setTitle('Debug').setDescription('```' + allText + '```')] }).then(m => {
      state.lastMsg = m;
    }).catch(() => { });
  }
}

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
console.log = function (...args) {
  originalLog.apply(console, args);
  try {
    const guildId = global.lastDebugGuildId;
    if (guildId) sendDebugEmbed(guildId, args.map(String).join(' '));
  } catch { }
};
console.warn = function (...args) {
  originalWarn.apply(console, args);
  try {
    const guildId = global.lastDebugGuildId;
    if (guildId) sendDebugEmbed(guildId, args.map(String).join(' '));
  } catch { }
};
console.error = function (...args) {
  originalError.apply(console, args);
  try {
    const guildId = global.lastDebugGuildId;
    if (guildId) sendDebugEmbed(guildId, args.map(String).join(' '));
  } catch { }
};
// @ts-nocheck
// ===============================================
// 🚫 EVITAR MULTI INSTÂNCIAS
// ===============================================
let client;
if (global.botInstance) {
  console.log('🔄 Limpando instância anterior do bot...');
  try {
    if (global._clientInstance?.destroy) global._clientInstance.destroy();
  } catch { }
}
global.botInstance = true;

// ===============================================
// 🌱 ENV
// ===============================================
require('dotenv').config();

// Validar OPUS_BITRATE_K
const opusBitrate = parseInt(process.env.OPUS_BITRATE_K || '96', 10);
if (isNaN(opusBitrate) || opusBitrate < 16 || opusBitrate > 512) {
  console.warn(`⚠️  OPUS_BITRATE_K inválido (${process.env.OPUS_BITRATE_K}), usando padrão 96kbps`);
}

if (process.env.DEBUG_MODE === 'true') {
  console.log('🐛 DEBUG_MODE ativado: logs verbosos habilitados');
}

// ===============================================
// 🛡️ GLOBAL ERROR GUARDS
// ===============================================
process.on('uncaughtException', (err) => {
  const msg = (err && typeof err === 'object' && 'message' in err) ? err.message : String(err);
  const code = (err && typeof err === 'object' && 'code' in err) ? err.code : '';
  if (code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'EPIPE' || /premature/i.test(msg) || /write EOF/i.test(msg) || code === 'EOF') {
    console.warn('[GLOBAL] Ignorando fechamento prematuro de stream ou broken pipe:', msg);
    return;
  }
  console.error('[GLOBAL] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  const msg = (reason && typeof reason === 'object' && 'message' in reason) ? reason.message : String(reason);
  const msgStr = String(msg);
  if (/premature/i.test(msgStr) || /write EOF/i.test(msgStr)) {
    console.warn('[GLOBAL] Ignorando rejeição por fechamento prematuro:', msgStr);
    return;
  }
  console.error('[GLOBAL] Unhandled rejection:', reason);
});

// ===============================================
// 🤖 IMPORTS
// ===============================================
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

const db = require('./utils/db');
const cachePath = require('./utils/cachePath');
const queueManager = require('./utils/queueManager');
const { createEmbed, createSongEmbed } = require('./utils/embed');
const { resolve } = require('./utils/resolver');
const { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Worker } = require('worker_threads'); // Integration: Worker
const { removeSongCompletely } = require('./utils/removeSong');
const { startCacheMonitor } = require('./utils/cacheMonitor');
const { LootSplitter } = require('./utils/lootSplitter');

// ===============================================
// 💬 Último canal de texto por guild
// ===============================================
const lastTextChannel = new Map();

// Loot Splitter State Map: MessageID -> { originalLog, players[] }
const lootSessionMap = new Map();

// Mapeia mensagens geradas para comandos externos (!p) → query
const externalPMap = new Map();

// ===============================================
// 🔒 Guilds em reset (lock anti race-condition)
// ===============================================
const resettingGuilds = new Set();

// ===============================================
// 🔧 Client
// ===============================================
client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

const PREFIXES = ['#', '$', '%', '&', '/'];
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('❌ Token não encontrado.');
  process.exit(1);
}

// ===============================================
// 🧩 Comandos
// ===============================================
client.commands = new Collection();
const commandPath = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandPath, file));
  if (!command.name) continue;

  client.commands.set(command.name, command);
  if (Array.isArray(command.aliases)) {
    for (const alias of command.aliases) {
      client.commands.set(alias, command);
    }
  }
}

console.log(`✅ Comandos carregados: ${client.commands.size}`);

// ===============================================
// 🤖 READY
// ===============================================
client.once(Events.ClientReady, c => {
  console.log(`✅ Bot online como ${c.user.tag}`);
  // iniciar monitor de cache assíncrono (não bloqueante)
  try { startCacheMonitor(); } catch (e) {
    console.error('[CACHE MONITOR] erro ao iniciar:', e.message);
  }
});

// ===============================================
// 💬 PREFIXOS
// ===============================================
client.on(Events.MessageCreate, async message => {
  if (!message.guild) return;

  // ===============================================
  // 🕵️ LOOT SPLITTER MONITOR
  // ===============================================
  // Canal fixo: 1467419860727234611
  if (message.channel.id === '1467419860727234611' && !message.author.bot) {
    const content = message.content;

    if (LootSplitter.isValidLog(content)) {
      try {
        const players = LootSplitter.parsePlayers(content);
        const result = LootSplitter.calculate(players);

        let desc = `**Session:** ${LootSplitter.findSessionDate(content)} (${LootSplitter.findSessionDuration(content)})\n` +
          `**Total Profit:** ${result.formatted.totalProfit}\n` +
          `**Per Person:** ${result.formatted.profitPerPerson}\n\n` +
          `**Transfers:**\n`;

        if (result.transfers.length === 0) {
          desc += "Nenhuma transferência necessária.";
        } else {
          result.transfers.forEach(t => {
            desc += `🔹 **${t.from}** pays **${LootSplitter.formatNumber(t.amount)}** to **${t.to}**\n`;
          });
        }

        const embed = createEmbed()
          .setTitle('💰 Tibia Loot Splitter')
          .setDescription(desc)
          .setColor(result.totalProfit >= 0 ? 0x00FF00 : 0xFF0000);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('loot_btn_regular').setLabel('Regular Split').setStyle(1), // Primary
          new ButtonBuilder().setCustomId('loot_btn_extra').setLabel('Extra Expenses').setStyle(2), // Secondary
          new ButtonBuilder().setCustomId('loot_btn_remove').setLabel('Remove Players').setStyle(4) // Danger
        );

        const replyMsg = await message.reply({ embeds: [embed], components: [row] });

        // Salvar estado para interações futuras
        lootSessionMap.set(replyMsg.id, {
          originalLog: content,
          players: players,
          lastResult: result
        });

        // Limpar memória após 1 hora
        setTimeout(() => lootSessionMap.delete(replyMsg.id), 3600000);

        return; // Parar processamento de outros comandos
      } catch (e) {
        console.error('[LOOT SPLITTER] Erro ao processar:', e);
        // Não responder erro para não spammar se for apenas chat normal
      }
    }
  }

  // Detectar mensagens do tipo "!p <query>" (geralmente originadas de outro bot)
  // ⚠️ ESTE CHECK DEVE VENIR ANTES DO CHECK DE BOT!
  try {
    const m = message.content?.trim();
    const match = m ? m.match(/^!p(?:\s+([\s\S]+))?/i) : null;

    if (match) {
      console.log('[EXTERNAL !p] Detectado: content=', m, 'query=', match[1]);
      const query = (match[1] || '').trim();

      // Tentar identificar quem foi o usuário original: primeiro usuário mencionado na mensagem, senão autor
      const mentioned = message.mentions?.users?.first();
      const triggerUserId = mentioned ? mentioned.id : message.author.id;

      // Reagir na mensagem original com um triste
      try {
        await message.react('😢');
        console.log('[EXTERNAL !p] Reação adicionada com sucesso');
      } catch (reactionErr) {
        console.error('[EXTERNAL !p] Erro ao reagir:', reactionErr.message);
      }

      // Enviar embed triste com botão "Tudo bem"
      const embed = createEmbed()
        .setTitle('😢 Tem certeza?')
        .setDescription(`<@${triggerUserId}>, tem certeza que vai usar esse bot ai??\nse lembre de mim!!`);

      const btn = new ButtonBuilder()
        .setCustomId('external_p_ok')
        .setLabel('Tudo bem')
        .setStyle(1);

      const row = new ActionRowBuilder().addComponents(btn);

      const sent = await message.channel.send({ embeds: [embed], components: [row] });
      externalPMap.set(sent.id, { query, triggerUserId });
      console.log('[EXTERNAL !p] Processado com sucesso: messageId=', sent.id);
      return; // Sair após processar !p
    }
  } catch (e) {
    console.error('[EXTERNAL !p] erro ao processar mensagem:', e);
  }

  // Ignorar mensagens de bot para execução de comandos normais
  if (message.author.bot) return;

  lastTextChannel.set(message.guild.id, message.channel);
  global.lastDebugGuildId = message.guild.id;

  const prefix = PREFIXES.find(p => message.content.startsWith(p));
  if (!prefix) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    if (resettingGuilds.has(message.guild.id)) {
      return message.reply('⏳ Bot está se reorganizando, tente novamente em alguns segundos.');
    }

    console.log(`🔧 Executando comando: ${prefix}${commandName}`, args);
    await command.execute(message, client, args);
  } catch (err) {
    console.error(`❌ Erro no comando "${commandName}":`, err);
    message.channel.send('❌ Erro ao executar comando.');
  }
});

// ===============================================
// 🎮 INTERACTIONS
// ===============================================
client.on(Events.InteractionCreate, async interaction => {
  try {
    // ===============================================
    // 💰 LOOT SPLITTER INTERACTIONS
    // ===============================================

    // Helper (Defined here for scope access, though reusing across events is better)
    const updateLootMessage = async (interaction, result, originalMessage = null) => {
      let desc = `**Session:** ${LootSplitter.findSessionDate(result.sessionDate || '')} (${result.sessionDuration || LootSplitter.findSessionDuration('')})\n` +
        `**Total Profit:** ${result.formatted.totalProfit}\n` +
        `**Per Person:** ${result.formatted.profitPerPerson}\n\n` +
        `**Transfers:**\n`;

      if (result.transfers.length === 0) {
        desc += "Nenhuma transferência necessária.";
      } else {
        result.transfers.forEach(t => {
          desc += `🔹 **${t.from}** pays **${LootSplitter.formatNumber(t.amount)}** to **${t.to}**\n`;
        });
      }

      const embed = createEmbed()
        .setTitle('💰 Tibia Loot Splitter')
        .setDescription(desc)
        .setColor(result.totalProfit >= 0 ? 0x00FF00 : 0xFF0000);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('loot_btn_regular').setLabel('Regular Split').setStyle(1),
        new ButtonBuilder().setCustomId('loot_btn_extra').setLabel('Extra Expenses').setStyle(2),
        new ButtonBuilder().setCustomId('loot_btn_remove').setLabel('Remove Players').setStyle(4)
      );

      if (originalMessage) {
        await originalMessage.edit({ embeds: [embed], components: [row] });
      } else {
        await interaction.update({ embeds: [embed], components: [row] });
      }
    };

    if (interaction.isButton() && interaction.customId.startsWith('loot_btn_')) {
      const messageId = interaction.message.id;
      const session = lootSessionMap.get(messageId);

      if (!session) {
        return interaction.reply({ content: '❌ Sessão expirada ou não encontrada.', ephemeral: true });
      }

      if (interaction.customId === 'loot_btn_regular') {
        session.players = LootSplitter.parsePlayers(session.originalLog); // Reset
        const result = LootSplitter.calculate(session.players);
        session.lastResult = result;
        return updateLootMessage(interaction, result);
      }

      if (interaction.customId === 'loot_btn_remove') {
        const options = session.players.map(p => ({
          label: p.name,
          value: p.name,
          default: p.isRemoved === true
        }));

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`loot_select_remove_${messageId}`)
            .setPlaceholder('Selecione quem NÃO participou')
            .setMinValues(0)
            .setMaxValues(options.length)
            .addOptions(options)
        );

        return interaction.reply({ content: 'Marque os jogadores para **REMOVER** da conta:', components: [row], ephemeral: true });
      }

      if (interaction.customId === 'loot_btn_extra') {
        const options = session.players.map(p => ({
          label: p.name,
          value: p.name
        }));

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`loot_select_extra_player_${messageId}`)
            .setPlaceholder('Quem teve gasto extra?')
            .addOptions(options)
        );

        return interaction.reply({ content: 'Selecione o jogador:', components: [row], ephemeral: true });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('loot_select_remove_')) {
        const messageId = interaction.customId.replace('loot_select_remove_', '');
        const session = lootSessionMap.get(messageId);
        if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });

        const removedPlayers = interaction.values;
        session.players.forEach(p => {
          p.isRemoved = removedPlayers.includes(p.name);
        });

        const result = LootSplitter.calculate(session.players);
        session.lastResult = result;

        try {
          const msg = await interaction.guild.channels.cache.get(interaction.channelId).messages.fetch(messageId);
          await updateLootMessage(interaction, result, msg);
          return interaction.reply({ content: '✅ Lista atualizada!', ephemeral: true });
        } catch (err) {
          return interaction.reply({ content: '❌ Erro ao atualizar mensagem original.', ephemeral: true });
        }
      }

      if (interaction.customId.startsWith('loot_select_extra_player_')) {
        const messageId = interaction.customId.replace('loot_select_extra_player_', '');
        const playerSelected = interaction.values[0];

        const modal = new ModalBuilder()
          .setCustomId(`loot_modal_extra_${messageId}_${playerSelected}`)
          .setTitle(`Gastos: ${playerSelected}`);

        const goldInput = new TextInputBuilder()
          .setCustomId('extra_gold')
          .setLabel("Valor do Gasto (Gold)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 50000')
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(goldInput));
        return interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('loot_modal_extra_')) {
      const prefix = 'loot_modal_extra_';
      const rest = interaction.customId.substring(prefix.length);
      const firstUnderscore = rest.indexOf('_');
      const messageId = rest.substring(0, firstUnderscore);
      const playerName = rest.substring(firstUnderscore + 1);

      const session = lootSessionMap.get(messageId);
      if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });

      const gold = parseInt(interaction.fields.getTextInputValue('extra_gold') || '0', 10);

      const p = session.players.find(p => p.name === playerName);
      if (p) {
        // Accumulate expenses
        p.extraExpenses = (p.extraExpenses || 0) + gold;
      }

      const result = LootSplitter.calculate(session.players);
      session.lastResult = result;

      try {
        const msg = await interaction.guild.channels.cache.get(interaction.channelId).messages.fetch(messageId);
        await updateLootMessage(interaction, result, msg);
        return interaction.reply({ content: `✅ Gasto de ${gold} gp adicionado a ${playerName}`, ephemeral: true });
      } catch (err) {
        return interaction.reply({ content: '❌ Erro ao atualizar.', ephemeral: true });
      }
    }

    if (interaction.isButton() && interaction.customId === 'lib_search') {
      return interaction.showModal({
        title: 'Buscar música',
        custom_id: 'lib_search_modal',
        components: [{
          type: 1,
          components: [{
            type: 4,
            custom_id: 'query',
            label: 'Nome da música',
            style: 1,
            required: true
          }]
        }]
      });
    }

    if (interaction.isModalSubmit() && interaction.customId === 'lib_search_modal') {
      const query = interaction.fields.getTextInputValue('query');
      const results = db.searchSongs(query);

      if (!results.length) {
        return interaction.reply({ content: '❌ Nenhuma música encontrada.', ephemeral: true });
      }

      const song = results[0];

      return interaction.reply({
        embeds: [{
          title: '🎵 Música encontrada',
          description: `**${song.title}**`,
          fields: [
            { name: 'VideoId', value: song.videoId },
            { name: 'Arquivo', value: fs.existsSync(song.file) ? '✅ Cache OK' : '❌ Não existe' }
          ],
          color: 0x5865F2
        }],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 1, label: 'Tocar', emoji: '▶️', custom_id: `lib_play_${song.videoId}` },
            { type: 2, style: 4, label: 'Excluir', emoji: '❌', custom_id: `lib_delete_${song.videoId}` }
          ]
        }]
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith('lib_play_')) {
      const videoId = interaction.customId.replace('lib_play_', '');
      const song = db.getByVideoId(videoId);

      if (!song || !fs.existsSync(song.file)) {
        return interaction.reply({ content: '❌ Cache não encontrado.', ephemeral: true });
      }

      const vc = interaction.member.voice.channel;
      if (!vc) {
        return interaction.reply({ content: '❌ Entre em um canal de voz.', ephemeral: true });
      }

      if (resettingGuilds.has(interaction.guild.id)) {
        return interaction.reply({ content: '⏳ Bot está se reorganizando.', ephemeral: true });
      }

      await interaction.reply({ content: '▶️ Tocando do cache...', ephemeral: true });

      return queueManager.play(
        interaction.guild.id,
        vc,
        { videoId: song.videoId, title: song.title, file: song.file },
        interaction.channel
      );
    }

    // loop button removed (using reaction toggle instead)

    if (interaction.isButton() && interaction.customId.startsWith('lib_delete_')) {
      const videoId = interaction.customId.replace('lib_delete_', '');
      const ok = removeSongCompletely(videoId);

      return interaction.reply({
        content: ok
          ? '❌ Música removida completamente (cache + banco).'
          : '❌ Música não encontrada.',
        ephemeral: true
      });
    }

    // Confirmação para mensagens externas "!p": pega a query armazenada e toca
    if (interaction.isButton() && interaction.customId === 'external_p_ok') {
      const mapping = externalPMap.get(interaction.message.id);
      if (!mapping) {
        return interaction.reply({ content: '❌ Pedido expirado ou inválido.', ephemeral: true });
      }

      if (mapping.triggerUserId && mapping.triggerUserId !== interaction.user.id) {
        return interaction.reply({ content: `❌ Apenas <@${mapping.triggerUserId}> pode confirmar este pedido.`, ephemeral: true });
      }

      const query = (mapping.query || '').trim();
      if (!query) return interaction.reply({ content: '❌ Query vazia.', ephemeral: true });

      const vc = interaction.member?.voice?.channel;
      if (!vc) return interaction.reply({ content: '❌ Entre em um canal de voz para eu tocar.', ephemeral: true });

      if (resettingGuilds.has(interaction.guild.id)) {
        return interaction.reply({ content: '⏳ Bot está se reorganizando.', ephemeral: true });
      }

      await interaction.reply({ content: '🔎 Resolvendo a query e adicionando à fila...', ephemeral: true });

      try {
        const resolved = await resolve(query);

        if (!resolved || !resolved.videoId) {
          return interaction.followUp({ content: '❌ Não consegui resolver a query.', ephemeral: true });
        }

        const song = { videoId: resolved.videoId, title: resolved.title, metadata: resolved.metadata };

        // Remover mapping para evitar reuso
        externalPMap.delete(interaction.message.id);

        return queueManager.play(interaction.guild.id, vc, song, interaction.channel);
      } catch (err) {
        console.error('[EXTERNAL_P_OK] erro ao resolver/play:', err);
        return interaction.followUp({ content: '❌ Erro ao processar a query.', ephemeral: true });
      }
    }

  } catch (e) {
    console.error('❌ Erro em InteractionCreate:', e);
    if (!interaction.replied) {
      interaction.reply({ content: '❌ Erro interno.', ephemeral: true });
    }
  }
});

// ===============================================
// 🔊 VOICE STATE (MUTE / UNMUTE / KICK)
// ===============================================
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    const guildId = oldState.guild.id;

    // ============================================
    // 👤 Alguém saiu do canal → verificar se bot ficou sozinho
    // ============================================
    if (oldState.channelId && !newState.channelId && oldState.member?.id !== client.user.id) {
      const botVoiceState = oldState.guild.members.me?.voice;
      if (botVoiceState?.channelId === oldState.channelId) {
        setTimeout(() => queueManager.checkIfAlone(guildId), 1000);
      }
    }

    // ============================================
    // 🤖 Eventos do próprio bot
    // ============================================
    if (oldState.member?.id !== client.user.id) return;

    const wasMuted = oldState.serverMute || oldState.selfMute;
    const isMuted = newState.serverMute || newState.selfMute;

    if (!wasMuted && isMuted) {
      queueManager.pause(guildId);

      const textChannel = lastTextChannel.get(guildId);
      if (textChannel) {
        await textChannel.send({
          embeds: [
            createEmbed()
              .setTitle('😔 Fui mutado')
              .setDescription('Alguém me mutou...\nAposto que foi o **PITUBA**.')
          ]
        }).catch(() => { });
      }
      return;
    }

    if (wasMuted && !isMuted) {
      queueManager.resume(guildId);
      return;
    }

    const botKicked = oldState.channelId && !newState.channelId;
    if (!botKicked) return;

    // Verificar se foi auto-disconnect
    if (queueManager.selfDisconnecting.has(guildId)) {
      return; // Não mostrar mensagem de kick
    }

    resettingGuilds.add(guildId);

    const textChannel = lastTextChannel.get(guildId);
    if (textChannel) {
      await textChannel.send({
        embeds: [
          createEmbed()
            .setTitle('😔 Fui kickado')
            .setDescription('Aposto que foi o **PITUBA**.')
        ]
      }).catch(() => { });
    }

    queueManager.resetGuild(guildId);

    setTimeout(() => resettingGuilds.delete(guildId), 1000);

  } catch (e) {
    console.error('⚠️ Erro em VoiceStateUpdate:', e);
    if (oldState.guild) resettingGuilds.delete(oldState.guild.id);
  }
});

// ===============================================
// 🧾 REACTIONS (loop toggle via 🔁)
// ===============================================
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  // Download command reactions (1️⃣, 2️⃣, 3️⃣)
  if (['1️⃣', '2️⃣', '3️⃣'].includes(reaction.emoji.name)) {
    console.log('[DOWNLOAD REACTION] Reação detectada:', reaction.emoji.name, 'por usuário:', user.id);

    const message = reaction.message;
    if (!message || !message.guild) {
      console.log('[DOWNLOAD REACTION] Mensagem ou guild inválida');
      return;
    }

    // Verificar se é uma mensagem de download pendente
    const downloadData = global.downloadPendingMessages?.get(message.id);
    console.log('[DOWNLOAD REACTION] downloadData:', downloadData ? 'encontrado' : 'não encontrado');
    console.log('[DOWNLOAD REACTION] global.downloadPendingMessages size:', global.downloadPendingMessages?.size || 0);

    if (!downloadData) return; // Não é uma mensagem de download

    // Verificar se é o autor correto
    if (user.bot || user.id !== downloadData.authorId) {
      console.log('[DOWNLOAD REACTION] Usuário não autorizado ou é bot');
      try { await reaction.users.remove(user.id); } catch { }
      return;
    }

    const idx = ['1️⃣', '2️⃣', '3️⃣'].indexOf(reaction.emoji.name);
    const selected = downloadData.detailed[idx];

    if (!selected) {
      console.log('[DOWNLOAD REACTION] Seleção inválida, idx:', idx);
      return;
    }

    console.log('[DOWNLOAD REACTION] Iniciando download de:', selected.title);

    // Limpar mensagem pendente
    global.downloadPendingMessages.delete(message.id);

    // Remover todas as reações
    try { await message.reactions.removeAll(); } catch { }

    // Executar download
    const downloadCommand = client.commands.get('dl');
    if (downloadCommand && downloadCommand.performDownload) {
      await downloadCommand.performDownload(selected.videoId, selected.title, message.channel);
    } else {
      console.error('[DOWNLOAD REACTION] Comando download não encontrado ou performDownload não existe');
    }

    return;
  }

  // Remove (❌, 1️⃣ a 🔟) — handler para remoção na fila

  if (reaction.emoji.name === '❌' || ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'].includes(reaction.emoji.name)) {
    const message = reaction.message;
    if (!message || !message.guild) return;
    const guildId = message.guild.id;
    const g = queueManager.get(guildId);
    // Só processa se for a mensagem da fila
    if (!g || !g.queueMessage || message.id !== g.queueMessage.id) return;
    if (g.queue.length === 0) return;
    // Helper para formatar duração (duplicado de queue.ts para simplificar scope)
    const durationToSeconds = (duration) => {
      if (!duration) return 0;
      const parts = duration.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) return parts[0] * 60 + parts[1];
      return 0;
    };
    const secondsToDuration = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return hours > 0
        ? `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        : `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    let idx = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'].indexOf(reaction.emoji.name);
    if (idx >= 0 && idx < g.queue.length) {
      const removed = g.queue.splice(idx, 1)[0];
      try { await reaction.users.remove(user.id); } catch { }

      // RECONSTRUIR EMBED ATUALIZADO
      const queueSlice = g.queue.slice(0, 10);
      const durations = await Promise.all(queueSlice.map(async song => {
        if (song.duration) return song.duration;
        if (song.metadata?.duration) return song.metadata.duration;
        // Não buscar na API aqui para ser rápido na interação UI
        return null;
      }));

      let accumulatedSeconds = 0;
      const list = queueSlice.map((s, i) => {
        const duration = durations[i];
        const durationSeconds = durationToSeconds(duration);
        const timeUntil = accumulatedSeconds > 0 ? ` • Em ${secondsToDuration(accumulatedSeconds)}` : '';
        const durationDisplay = duration ? ` [${duration}]` : '';
        accumulatedSeconds += durationSeconds;
        return `${i + 1}. ${s.title}${durationDisplay}${timeUntil}`;
      }).join('\n');

      const totalDuration = accumulatedSeconds > 0 ? ` • Tempo total: ${secondsToDuration(accumulatedSeconds)}` : '';

      const updatedEmbed = createEmbed().setTitle('🎶 Fila de reprodução');
      if (g.playing && g.current) {
        updatedEmbed.addFields({ name: '🎵 Tocando agora', value: `**${g.current.title}**` });
      }
      if (list) {
        updatedEmbed.addFields({ name: `📜 Próximas músicas${totalDuration}`, value: list });
      } else {
        updatedEmbed.setDescription('A fila está vazia.');
      }

      // Footer
      if (g.queue.length > 10) {
        updatedEmbed.setFooter({ text: `+ ${g.queue.length - 10} música(s) na fila` });
      }

      try { await message.edit({ embeds: [updatedEmbed] }); } catch { }

      // REMOVER REAÇÕES EXCEDENTES
      const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      // Se fila tem tamanho 2, deve ter reações 0 e 1. A partir do index 2 (g.queue.length), remover.
      for (let i = g.queue.length; i < EMOJIS.length; i++) {
        const emojiToRemove = EMOJIS[i];
        const reactionToRemove = message.reactions.cache.find(r => r.emoji.name === emojiToRemove);
        if (reactionToRemove) {
          try { await reactionToRemove.remove(); } catch { }
        }
      }
    }
    if (reaction.emoji.name === '❌') {
      try { await message.delete(); } catch { }
    }
    return;
  }
  try {
    if (user.bot) return;

    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }

    const message = reaction.message;
    if (!message || !message.guild) return;

    const guildId = message.guild.id;
    const g = queueManager.get(guildId);
    if (!g || !g.nowPlayingMessage) return;
    if (message.id !== g.nowPlayingMessage.id) return;

    // Loop toggle (🔁)
    if (reaction.emoji.name === '🔁') {
      g.loop = !g.loop;

      try {
        const newEmbed = createSongEmbed(g.current, 'playing', g.loop, g.autoDJ);
        await g.nowPlayingMessage.edit({ embeds: [newEmbed] }).catch(() => { });
      } catch { }

      try { await reaction.users.remove(user.id); } catch { }

      try {
        const ch = g.textChannel || message.channel;
        const feedback = await ch.send({ embeds: [createEmbed().setDescription(g.loop ? '🔁 Loop ativado' : '⏹️ Loop desativado')] });
        setTimeout(() => feedback.delete().catch(() => { }), 2500);
      } catch { }
      return;
    }

    // Auto toggle (🎶)
    if (reaction.emoji.name === '🎶') {
      g.autoDJ = !g.autoDJ;

      try {
        const newEmbed = createSongEmbed(g.current, 'playing', g.loop, g.autoDJ);
        await g.nowPlayingMessage.edit({ embeds: [newEmbed] }).catch(() => { });
      } catch { }

      try { await reaction.users.remove(user.id); } catch { }

      try {
        const ch = g.textChannel || message.channel;
        const feedback = await ch.send({ embeds: [createEmbed().setDescription(g.autoDJ ? '🎶 Auto ativado' : '⏹️ Auto desativado')] });
        setTimeout(() => feedback.delete().catch(() => { }), 2500);
      } catch { }

      // Se acabou de ativar, já adicionar 2 recomendações imediatas
      if (g.autoDJ) {
        try {
          await queueManager.addAutoRecommendations(guildId, 2);
        } catch (e) {
          console.error('[AUTO] erro ao adicionar recomendações imediatas:', e);
        }
      }

      return;
    }

    // Artist Mix (✨)
    if (reaction.emoji.name === '✨') {
      try {
        console.log('[ARTIST MIX] ✨ Reação detectada, criando mix...');
        await queueManager.createArtistMix(guildId);
      } catch (e) {
        console.error('[ARTIST MIX] erro ao criar mix:', e);
      }

      try { await reaction.users.remove(user.id); } catch { }

      return;
    }

    // Skip (⏭️) — duplicata do autoDJ
    if (reaction.emoji.name === '⏭️' || reaction.emoji.name === '⏭') {
      try {
        queueManager.skip(guildId);
      } catch (e) {
        console.error('[SKIP] erro ao tentar pular música:', e);
      }

      try { await reaction.users.remove(user.id); } catch { }

      try {
        const ch = g.textChannel || message.channel;
        const feedback = await ch.send({ embeds: [createEmbed().setDescription('⏭️ Música pulada!')] });
        setTimeout(() => feedback.delete().catch(() => { }), 2500);
      } catch { }

      // Não há ação extra como no autoDJ
      return;
    }

    // Queue (🇶)
    if (reaction.emoji.name === '🇶') {
      try {
        console.log('[QUEUE REACTION] 🇶 Reação detectada, mostrando fila...');
        const queueCommand = client.commands.get('queue');
        if (queueCommand) {
          await queueCommand.execute(message);
        }
      } catch (e) {
        console.error('[QUEUE REACTION] erro ao mostrar fila:', e);
      }

      try { await reaction.users.remove(user.id); } catch { }

      return;
    }
  } catch (e) {
    console.error('[REACTION] erro ao processar reação:', e);
  }
});

// ===============================================
// 🚀 LOGIN
// ===============================================
client.login(token);
