import { config } from 'dotenv';
// Força 128kbps para este script, independente do .env
process.env.OPUS_BITRATE_K = '128';
config();

// Imports
const db = require('../src/utils/db');
const { downloadAudio } = require('../src/utils/ytDlp');
const cachePath = require('../src/utils/cachePath');
const fs = require('fs');
const path = require('path');

async function main() {
  while (true) {
    console.log('🎵 [LOOP] Iniciando ciclo de verificação (128kbps)...');

    const allSongs = db.getAllSongs();
    console.log(`📊 Total de músicas no banco: ${allSongs.length}`);

    const toUpdate = allSongs.filter((s: any) => !s.bitrate || s.bitrate < 128);
    console.log(`⚠️  Músicas precisando de upgrade: ${toUpdate.length}`);

    if (toUpdate.length === 0) {
      console.log('✅ Todas as músicas já atualizadas.');
    } else {
      let success = 0;
      let fail = 0;

      for (let i = 0; i < toUpdate.length; i++) {
        const song = toUpdate[i];
        const progress = `[${i + 1}/${toUpdate.length}]`;
        console.log(`\n${progress} Processando: ${song.title.substring(0, 40)}...`);

        const filePath = song.file || cachePath(song.videoId);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        try {
          console.log(`   ⬇️  Baixando (128kbps)...`);
          await downloadAudio(song.videoId, 128, filePath);
          db.updateSongBitrate(song.videoId, 128);
          console.log(`   ✅ Sucesso!`);
          success++;
          await new Promise(r => setTimeout(r, 2000));
        } catch (err: any) {
          console.error(`   ❌ Erro: ${err.message}`);
          fail++;
        }
      }
      console.log(`\n🎉 Ciclo finalizado. Atualizados: ${success}, Falhas: ${fail}`);
    }

    // Esperar 6 horas antes da próxima verificação
    const hours = 6;
    console.log(`💤 Dormindo por ${hours} horas...`);
    await new Promise(r => setTimeout(r, hours * 60 * 60 * 1000));
  }
}

main().catch(console.error);
