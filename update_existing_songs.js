// Script para atualizar músicas existentes no banco de dados
// Extrai artist e track dos títulos existentes

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'dist', 'utils', 'music.db');
const db = new Database(dbPath);

// Função para normalizar título (mesma do textUtils.ts)
function normalizeTitle(text) {
    return text
        .replace(/\s*\(.*?\)\s*/g, ' ')
        .replace(/\s*\[.*?\]\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

console.log('🔄 Atualizando músicas existentes...\n');

const songs = db.prepare('SELECT videoId, title, artist, track FROM songs').all();

let updated = 0;
let skipped = 0;

songs.forEach(song => {
    // Pular se já tem artist e track
    if (song.artist && song.track) {
        console.log(`⏭️  Pulando: ${song.title} (já tem artist/track)`);
        skipped++;
        return;
    }

    // Extrair artist e track do título
    const clean = normalizeTitle(song.title);
    const parts = clean.split(' - ');

    if (parts.length >= 2) {
        const artist = parts[0].trim();
        const track = parts.slice(1).join(' - ').trim();

        db.prepare(`
      UPDATE songs 
      SET artist = ?, track = ? 
      WHERE videoId = ?
    `).run(artist, track, song.videoId);

        console.log(`✅ Atualizado: ${song.title}`);
        console.log(`   Artist: ${artist}`);
        console.log(`   Track: ${track}\n`);
        updated++;
    } else {
        console.log(`⚠️  Não foi possível extrair artist/track: ${song.title}\n`);
        skipped++;
    }
});

console.log(`\n📊 Resumo:`);
console.log(`   ✅ Atualizadas: ${updated}`);
console.log(`   ⏭️  Puladas: ${skipped}`);
console.log(`   📈 Total: ${songs.length}`);

db.close();
