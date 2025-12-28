// Script para corrigir músicas antigas no banco de dados
// Busca metadados do yt-dlp para músicas sem artist/track
const Database = require('better-sqlite3');
const path = require('path');
const { updateMetadataAsync } = require('./dist/utils/metadataFetcher');

const dbPath = path.join(__dirname, 'dist', 'utils', 'music.db');
const db = new Database(dbPath);

async function fixOldSongs() {
    console.log('🔧 Corrigindo músicas antigas no banco de dados...\n');

    // Buscar músicas sem artist ou track
    const songsToFix = db.prepare(`
    SELECT videoId, title, artist, track 
    FROM songs 
    WHERE artist IS NULL OR track IS NULL
  `).all();

    console.log(`📊 Encontradas ${songsToFix.length} músicas para corrigir\n`);

    if (songsToFix.length === 0) {
        console.log('✅ Todas as músicas já têm metadados!');
        db.close();
        return;
    }

    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < songsToFix.length; i++) {
        const song = songsToFix[i];
        console.log(`\n[${i + 1}/${songsToFix.length}] Processando: ${song.title}`);
        console.log(`   VideoId: ${song.videoId}`);

        try {
            // Usar a função de atualização assíncrona
            const result = await updateMetadataAsync(song.videoId);

            if (result) {
                console.log(`   ✅ Atualizado: ${result.artist} - ${result.track}`);
                fixed++;
            } else {
                console.log(`   ⚠️  Não foi possível obter metadados`);
                failed++;
            }

            // Pequeno delay para não sobrecarregar o yt-dlp
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (err) {
            console.error(`   ❌ Erro: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n\n📊 RESUMO FINAL:`);
    console.log(`   ✅ Corrigidas: ${fixed}`);
    console.log(`   ❌ Falharam: ${failed}`);
    console.log(`   📈 Total processadas: ${songsToFix.length}`);

    db.close();
}

// Executar
fixOldSongs().catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
