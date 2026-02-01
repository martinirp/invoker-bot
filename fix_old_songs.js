// Script para corrigir músicas antigas no banco de dados (PARALELO)
// Busca metadados do yt-dlp para músicas sem artist/track
const Database = require('better-sqlite3');
const path = require('path');
const { updateMetadataAsync } = require('./dist/utils/metadataFetcher');

const dbPath = path.join(__dirname, 'dist', 'utils', 'music.db');
const db = new Database(dbPath);

const BATCH_SIZE = 50; // Processar 50 músicas em paralelo

async function fixOldSongs() {
    console.log('🔧 Corrigindo músicas antigas no banco de dados...\n');

    // Buscar músicas sem artist ou track
    const songsToFix = db.prepare(`
    SELECT videoId, title, artist, track 
    FROM songs 
    WHERE artist IS NULL OR track IS NULL
  `).all();

    console.log(`📊 Encontradas ${songsToFix.length} músicas para corrigir`);
    console.log(`⚡ Processando ${BATCH_SIZE} músicas em paralelo\n`);

    if (songsToFix.length === 0) {
        console.log('✅ Todas as músicas já têm metadados!');
        db.close();
        return;
    }

    let fixed = 0;
    let failed = 0;

    // Processar em batches de BATCH_SIZE
    for (let i = 0; i < songsToFix.length; i += BATCH_SIZE) {
        const batch = songsToFix.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(songsToFix.length / BATCH_SIZE);

        console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} músicas)`);
        console.log('─'.repeat(60));

        // Processar batch em paralelo
        const promises = batch.map(async (song, idx) => {
            const globalIdx = i + idx + 1;
            console.log(`[${globalIdx}/${songsToFix.length}] Processando: ${song.title.substring(0, 50)}...`);

            try {
                const result = await updateMetadataAsync(song.videoId);

                if (result) {
                    console.log(`   ✅ [${globalIdx}] ${result.artist} - ${result.track}`);
                    return { success: true, song };
                } else {
                    console.log(`   ⚠️  [${globalIdx}] Não foi possível obter metadados`);
                    return { success: false, song };
                }
            } catch (err) {
                console.error(`   ❌ [${globalIdx}] Erro: ${err.message}`);
                return { success: false, song, error: err.message };
            }
        });

        // Aguardar todas as músicas do batch
        const results = await Promise.all(promises);

        // Contar sucessos e falhas
        const batchFixed = results.filter(r => r.success).length;
        const batchFailed = results.filter(r => !r.success).length;

        fixed += batchFixed;
        failed += batchFailed;

        console.log(`\n📊 Batch ${batchNum}: ✅ ${batchFixed} | ❌ ${batchFailed}`);

        // Pequeno delay entre batches para não sobrecarregar
        if (i + BATCH_SIZE < songsToFix.length) {
            console.log('⏳ Aguardando 2s antes do próximo batch...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`📊 RESUMO FINAL:`);
    console.log(`   ✅ Corrigidas: ${fixed}`);
    console.log(`   ❌ Falharam: ${failed}`);
    console.log(`   📈 Total processadas: ${songsToFix.length}`);
    console.log(`   🎯 Taxa de sucesso: ${Math.round((fixed / songsToFix.length) * 100)}%`);
    console.log('='.repeat(60));

    db.close();
}

// Executar
fixOldSongs().catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
