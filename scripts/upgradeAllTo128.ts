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
  console.log('🎵 Iniciando atualização da biblioteca para 128kbps...');

  const allSongs = db.getAllSongs();
  console.log(`📊 Total de músicas no banco: ${allSongs.length}`);

  const toUpdate = allSongs.filter((s: any) => !s.bitrate || s.bitrate < 128);
  console.log(`⚠️  Músicas precisando de upgrade: ${toUpdate.length}`);

  if (toUpdate.length === 0) {
    console.log('✅ Todas as músicas já estão em 128kbps (ou marcado como tal).');
    return;
  }

  let success = 0;
  let fail = 0;

  for (let i = 0; i < toUpdate.length; i++) {
    const song = toUpdate[i];
    const progress = `[${i + 1}/${toUpdate.length}]`;
    console.log(`\n${progress} Processando: ${song.title.substring(0, 40)}...`);

    const filePath = song.file || cachePath(song.videoId);

    // Garantir diretório
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
      console.log(`   ⬇️  Baixando (128kbps)...`);

      // Baixar sobrescrevendo
      await downloadAudio(song.videoId, 128, filePath);

      // Atualizar DB
      db.updateSongBitrate(song.videoId, 128);
      console.log(`   ✅ Sucesso! DB atualizado.`);
      success++;

      // Delay gentil para evitar bloqueio do YouTube (importante!)
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      console.error(`   ❌ Erro ao baixar: ${err.message}`);
      fail++;
    }
  }

  console.log('\n=============================================');
  console.log('🎉 Finalizado!');
  console.log(`✅ Atualizados: ${success}`);
  console.log(`❌ Falhas: ${fail}`);
  console.log('=============================================');
}

main().catch(console.error);
