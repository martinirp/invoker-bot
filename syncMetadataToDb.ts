// Script: syncMetadataToDb.ts
// Sincroniza metadados de músicas locais e arquivos de cache com o banco de dados.
// Execute manualmente uma vez para garantir que todos os metadados estejam persistidos.

const fs = require('fs');
const path = require('path');
const db = require('./src/utils/db');
const { getVideoDetails } = require('./src/utils/youtubeApi');
const musicCacheDir = path.join(__dirname, 'music_cache_opus');

// Função para buscar todos os arquivos de áudio no cache
function getAllAudioFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllAudioFiles(filePath));
    } else if (file.endsWith('.opus')) {
      results.push(filePath);
    }
  });
  return results;
}

async function sync() {
  const audioFiles = getAllAudioFiles(musicCacheDir);
  console.log(`Encontrados ${audioFiles.length} arquivos de áudio no cache.`);

  for (const filePath of audioFiles) {
    // Extrai videoId do caminho do arquivo (ajuste conforme seu padrão)
    const match = filePath.match(/([\w-]{11})/);
    if (!match) continue;
    const videoId = match[1];

    let song = db.getByVideoId(videoId);
    if (!song) {
      // Se não existe no banco, cria entrada básica
      song = { videoId, file: filePath };
      db.insertSong(song);
      console.log(`Adicionado ao banco: ${videoId}`);
    }

    // Se não tem metadados, busca e atualiza
    if (!song.metadata) {
      try {
        const details = await getVideoDetails(videoId);
        if (details) {
          // Atualiza no banco (você pode expandir para salvar mais campos)
          db.updateMetadata(videoId, details);
          console.log(`Metadados atualizados para ${videoId}`);
        }
      } catch (e) {
        console.warn(`Falha ao buscar metadados para ${videoId}:`, e.message);
      }
    }
  }

  console.log('Sincronização concluída!');
}

sync();
