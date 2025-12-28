// Script para testar vários vídeos e comparar metadados
const { runYtDlpJson } = require('./dist/utils/ytDlp');
const fs = require('fs');

const testVideos = [
    { id: 'HfpYbWlGf9k', name: 'Iron Maiden - Dance Of Death' },
    { id: 'J5o8Daw1ZsY', name: 'Megadeth - Holy Wars' },
    // Adicione mais IDs aqui se quiser testar
];

async function testMultipleVideos() {
    console.log('🔍 Testando metadados de múltiplos vídeos...\n');

    const results = [];

    for (const video of testVideos) {
        console.log(`\n📹 Testando: ${video.name}`);
        console.log(`   ID: ${video.id}`);

        try {
            const url = `https://youtube.com/watch?v=${video.id}`;
            const data = await runYtDlpJson([
                '--dump-json',
                '--no-playlist',
                url
            ]);

            const result = {
                videoId: video.id,
                name: video.name,
                metadata: {
                    title: data.title,
                    artist: data.artist || null,
                    track: data.track || null,
                    album: data.album || null,
                    creator: data.creator || null,
                    uploader: data.uploader || null,
                    channel: data.channel || null
                }
            };

            results.push(result);

            console.log(`   ✅ Title: ${result.metadata.title}`);
            console.log(`   ✅ Artist: ${result.metadata.artist || 'NULL'}`);
            console.log(`   ✅ Track: ${result.metadata.track || 'NULL'}`);
            console.log(`   ✅ Uploader: ${result.metadata.uploader || 'NULL'}`);

        } catch (err) {
            console.error(`   ❌ Erro: ${err.message}`);
            results.push({
                videoId: video.id,
                name: video.name,
                error: err.message
            });
        }
    }

    fs.writeFileSync('metadata_comparison.json', JSON.stringify(results, null, 2));
    console.log('\n\n✅ Resultados salvos em metadata_comparison.json');

    // Análise
    console.log('\n📊 ANÁLISE:');
    const withArtist = results.filter(r => r.metadata?.artist).length;
    const withTrack = results.filter(r => r.metadata?.track).length;
    const total = results.filter(r => !r.error).length;

    console.log(`   Vídeos com artist: ${withArtist}/${total}`);
    console.log(`   Vídeos com track: ${withTrack}/${total}`);
}

testMultipleVideos();
