// Script para testar múltiplos vídeos em batch
const { runYtDlpJson } = require('./dist/utils/ytDlp');
const fs = require('fs');

// IDs extraídos dos links fornecidos pelo usuário
const videoIds = [
    'HfpYbWlGf9k',  // Iron Maiden - Dance Of Death
    'J5o8Daw1ZsY',  // Megadeth - Holy Wars
    'KptYUmiNR50',  // DISK PIZZA gameplay
    'EYlaqBS12JQ',  // Link 1
    'KV5ffXxFI38',  // Link 2
    'J8dqFkWh0UY',  // Link 3
    'zMnfkW9UZc4',  // Link 4
    '_P3Q6VkNrwg',  // Link 5
    'Exkv1BTkUno',  // Link 6
    'MCxw_1pnx-g',  // Link 7
];

async function testBatch() {
    console.log(`🔍 Testando ${videoIds.length} vídeos...\n`);

    const results = [];

    for (let i = 0; i < videoIds.length; i++) {
        const videoId = videoIds[i];
        console.log(`\n[${i + 1}/${videoIds.length}] Testando: ${videoId}`);

        try {
            const url = `https://youtube.com/watch?v=${videoId}`;
            const data = await runYtDlpJson([
                '--dump-json',
                '--no-playlist',
                url
            ]);

            const result = {
                videoId,
                title: data.title,
                artist: data.artist || null,
                track: data.track || null,
                album: data.album || null,
                uploader: data.uploader || null,
                channel: data.channel || null,
                creator: data.creator || null
            };

            results.push(result);

            console.log(`  Title: ${result.title}`);
            console.log(`  Artist: ${result.artist || 'NULL'}`);
            console.log(`  Track: ${result.track || 'NULL'}`);
            console.log(`  Uploader: ${result.uploader || 'NULL'}`);

        } catch (err) {
            console.error(`  ❌ Erro: ${err.message}`);
            results.push({
                videoId,
                error: err.message
            });
        }
    }

    // Salvar resultados
    fs.writeFileSync('batch_metadata_results.json', JSON.stringify(results, null, 2));

    // Análise
    console.log('\n\n📊 ANÁLISE GERAL:');
    console.log('─'.repeat(60));

    const successful = results.filter(r => !r.error);
    const withArtist = successful.filter(r => r.artist);
    const withTrack = successful.filter(r => r.track);
    const withUploader = successful.filter(r => r.uploader);

    console.log(`Total de vídeos: ${videoIds.length}`);
    console.log(`Sucesso: ${successful.length}`);
    console.log(`Com artist: ${withArtist.length} (${Math.round(withArtist.length / successful.length * 100)}%)`);
    console.log(`Com track: ${withTrack.length} (${Math.round(withTrack.length / successful.length * 100)}%)`);
    console.log(`Com uploader: ${withUploader.length} (${Math.round(withUploader.length / successful.length * 100)}%)`);

    console.log('\n📋 Casos sem artist:');
    successful.filter(r => !r.artist).forEach(r => {
        console.log(`  - ${r.videoId}: "${r.title}"`);
        console.log(`    Uploader: ${r.uploader || 'NULL'}`);
    });

    console.log('\n✅ Resultados salvos em batch_metadata_results.json');
}

testBatch();
