// Script para testar quais metadados o yt-dlp retorna
const { runYtDlpJson } = require('./dist/utils/ytDlp');
const fs = require('fs');

async function testMetadata() {
    // Testar com o vídeo fornecido pelo usuário
    const videoId = 'KptYUmiNR50';
    const url = `https://youtube.com/watch?v=${videoId}`;

    console.log('🔍 Buscando metadados do vídeo...\n');

    try {
        const data = await runYtDlpJson([
            '--dump-json',
            '--no-playlist',
            url
        ]);

        const output = {
            id: data.id,
            title: data.title,
            uploader: data.uploader,
            channel: data.channel,
            artist: data.artist || null,
            track: data.track || null,
            album: data.album || null,
            creator: data.creator || null,
            all_fields: Object.keys(data).sort()
        };

        fs.writeFileSync('metadata_output.json', JSON.stringify(output, null, 2));
        console.log('✅ Metadados salvos em metadata_output.json');
        console.log('\nCampos importantes:');
        console.log('  Title:', output.title);
        console.log('  Artist:', output.artist);
        console.log('  Track:', output.track);
        console.log('  Uploader:', output.uploader);
        console.log('  Creator:', output.creator);

    } catch (err) {
        console.error('❌ Erro:', err.message);
    }
}

testMetadata();
