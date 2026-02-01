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

const log = (msg: string) => console.log(`[UPDATER] ${msg}`);

async function main() {
  while (true) {
    log('🎵 Iniciando ciclo de verificação... (Intervalo: 6h)');

    const allSongs = db.getAllSongs();

    // Categorias
    let unknown = 0;
    let low = 0; // < 128
    let good = 0; // >= 128

    const toUpdate = [];

    for (const s of allSongs) {
      if (!s.bitrate) {
        unknown++;
        toUpdate.push(s);
      } else if (s.bitrate < 128) {
        low++;
        toUpdate.push(s);
      } else {
        good++;
      }
    }

    log('📊 Relatório de Qualidade:');
    log(`   ➤ Total: ${allSongs.length}`);
    log(`   ➤ ✅ Qualidade Alta (>=128kbps): ${good}`);
    log(`   ➤ ⚠️  Baixa (64kbps/Outros): ${low}`);
    log(`   ➤ ❓ Desconhecido (Antigos): ${unknown}`);
    log(`   ➤ 🔄 Fila para Upgrade: ${toUpdate.length}`);

    if (toUpdate.length === 0) {
      log('✅ Nada pendente. Tudo atualizado.');
    } else {
      let success = 0;
      let fail = 0;

      log(`▶️  Iniciando processamento de ${toUpdate.length} músicas...`);

      for (let i = 0; i < toUpdate.length; i++) {
        const song = toUpdate[i];
        const pct = Math.round(((i + 1) / toUpdate.length) * 100);
        const progress = `[${i + 1}/${toUpdate.length} - ${pct}%]`;

        log(`${progress} Processando Legal: ${song.title.substring(0, 30)}...`);

        const filePath = song.file || cachePath(song.videoId);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        try {
          // Baixar sobrescrevendo
          await downloadAudio(song.videoId, 128, filePath);
          db.updateSongBitrate(song.videoId, 128);

          success++;
          // Não esperar muito entre logs para deixar fluido, mas o delay de download existe
          await new Promise(r => setTimeout(r, 2000));
        } catch (err: any) {
          log(`❌ Falha em ${song.title}: ${err.message}`);
          fail++;
        }
      }
      log(`🎉 Ciclo finalizado. Sucesso: ${success} | Falhas: ${fail}`);
    }

    // Esperar 6 horas
    const hours = 6;
    log(`💤 Dormindo por ${hours} horas...`);
    await new Promise(r => setTimeout(r, hours * 60 * 60 * 1000));
  }
}

main().catch(console.error);
