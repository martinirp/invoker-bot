const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'dist', 'utils', 'music.db');
const db = new Database(dbPath);

console.log('📊 Estrutura da tabela songs:');
const schema = db.prepare("PRAGMA table_info(songs)").all();
console.table(schema);

console.log('\n🎵 Primeiras 15 músicas no banco:');
const songs = db.prepare('SELECT videoId, title, artist, track FROM songs LIMIT 15').all();
songs.forEach((song, i) => {
    console.log(`\n${i + 1}. ${song.title}`);
    console.log(`   Artist: ${song.artist || 'NULL'}`);
    console.log(`   Track: ${song.track || 'NULL'}`);
    console.log(`   VideoId: ${song.videoId}`);
});

console.log(`\n📈 Total de músicas: ${db.prepare('SELECT COUNT(*) as count FROM songs').get().count}`);
console.log(`📈 Músicas com artist NULL: ${db.prepare('SELECT COUNT(*) as count FROM songs WHERE artist IS NULL').get().count}`);
console.log(`📈 Músicas com track NULL: ${db.prepare('SELECT COUNT(*) as count FROM songs WHERE track IS NULL').get().count}`);

db.close();
