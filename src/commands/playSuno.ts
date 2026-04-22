// @ts-nocheck
const { createEmbed } = require('../utils/embed');
const queueManager = require('../utils/queueManager');
const { isSunoLink, resolveSunoTrack } = require('../utils/sunoResolver');

interface CommandModule {
    name: string;
    aliases: string[];
    description: string;
    usage: string;
    example: string;
    execute(message: Message): Promise<void>;
}

async function execute(message: Message): Promise<void> {
    const guildId = message.guildId;
    const voiceChannel = message.member?.voice.channel;
    const textChannel = message.channel;

    if (!guildId || !voiceChannel || !textChannel.isTextBased()) {
        return;
    }

    console.log(`[PLAY-SUNO] comando recebido em ${guildId}`);

    // Validação: usuário em canal de voz
    if (!voiceChannel) {
        return textChannel.send({
            embeds: [
                createEmbed().setDescription('❌ Entre em um canal de voz.')
            ]
        });
    }

    // Extrai o link/query do comando
    const query = message.content.split(' ').slice(1).join(' ').trim();
    if (!query) {
        return textChannel.send({
            embeds: [
                createEmbed().setDescription('❌ Uso: `$ps <link-suno>`\nExemplo: `$ps https://suno.com/s/qLR5ObPcP5CIx1W5`')
            ]
        });
    }

    // Validação: é um link Suno?
    if (!isSunoLink(query)) {
        return textChannel.send({
            embeds: [
                createEmbed().setDescription('❌ Link inválido. Use um link do Suno!\nExemplo: `https://suno.com/s/qLR5ObPcP5CIx1W5`')
            ]
        });
    }

    const statusMsg = await textChannel.send({
        embeds: [createEmbed().setDescription('🔍 Processando música do Suno...')]
    });

    try {
        console.log('[PLAY-SUNO] Resolvendo metadata do Suno...');

        const sunoData = await resolveSunoTrack(query);

        if (!sunoData) {
            throw new Error('Não foi possível resolver a música do Suno. O link pode estar inválido ou a música foi removida.');
        }

        console.log(`[PLAY-SUNO] ✅ Música resolvida: "${sunoData.title}" por ${sunoData.artist}`);

        // Cria objeto de música para a fila
        interface Song {
            videoId: string;
            title: string;
            streamUrl: string;
            metadata: {
                source: string;
                artist: string;
                image: string | null;
                sunoId: string;
                originalUrl: string;
            };
        }

        let song: Song;

        // Se conseguimos a URL de áudio direto, usamos
        if (sunoData.audioUrl) {
            song = {
                videoId: sunoData.sunoId,
                title: sunoData.title,
                streamUrl: sunoData.audioUrl,
                metadata: {
                    source: 'suno',
                    artist: sunoData.artist,
                    image: sunoData.image,
                    sunoId: sunoData.sunoId,
                    originalUrl: query
                }
            };
        } else {
            // Fallback: usa o link do Suno como stream URL
            song = {
                videoId: sunoData.sunoId,
                title: sunoData.title,
                streamUrl: query,
                metadata: {
                    source: 'suno',
                    artist: sunoData.artist,
                    image: sunoData.image,
                    sunoId: sunoData.sunoId,
                    originalUrl: query
                }
            };
        }

        // Atualiza status com feedback imediato
        const playPromise = queueManager.play(
            guildId,
            voiceChannel,
            song,
            textChannel
        );

        await statusMsg.edit({
            embeds: [
                createEmbed()
                    .setTitle('🎵 Suno')
                    .setDescription(`✅ **${sunoData.title}**\n👤 ${sunoData.artist}`)
                    .setColor('#000000')
                    .setFooter({ text: 'Suno.com' })
                    .setImage(sunoData.image)
            ]
        }).catch(() => { });

        await playPromise;

    } catch (err) {
        console.error('[PLAY-SUNO] Erro:', err);

        await statusMsg.edit({
            embeds: [
                createEmbed()
                    .setTitle('❌ Erro ao processar Suno')
                    .setDescription((err as Error).message || 'Música inválida ou inacessível')
                    .setColor('#FF0000')
            ]
        }).catch(() => { });
    }
}

module.exports = {
    name: 'playSuno',
    aliases: ['ps'],
    description: '🎵 Toca uma música do Suno pelo link',
    usage: '$ps <link-suno>',
    example: '$ps https://suno.com/s/qLR5ObPcP5CIx1W5',
    execute
};