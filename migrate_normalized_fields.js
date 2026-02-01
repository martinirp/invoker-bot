// Script para popular campos normalizados em músicas existentes
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'dist', 'utils', 'music.db');
const db = new Database(dbPath);

// Função de normalização (mesma do db.ts)
function normalizeKey(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

console.log('🔄 Migrando campos normalizados para músicas existentes...\n');

const songs = db.prepare('SELECT videoId, artist, track FROM songs').all();

let updated = 0;
let skipped = 0;

for (const song of songs) {
    if (song.artist || song.track) {
        const artistNorm = song.artist ? normalizeKey(song.artist) : null;
        const trackNorm = song.track ? normalizeKey(song.track) : null;

        db.prepare(`
      UPDATE songs 
      SET artist_normalized = ?, track_normalized = ?
      WHERE videoId = ?
    `).run(artistNorm, trackNorm, song.videoId);

        console.log(`✅ ${song.artist || '(sem artist)'} - ${song.track || '(sem track)'}`);
        updated++;
    } else {
        console.log(`⏭️  Pulando: ${song.videoId} (sem artist/track)`);
        skipped++;
    }
}

console.log(`\n📊 Resumo:`);
console.log(`   ✅ Atualizadas: ${updated}`);
console.log(`   ⏭️  Puladas: ${skipped}`);
console.log(`   📈 Total: ${songs.length}`);

db.close();
