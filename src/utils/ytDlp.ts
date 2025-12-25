// @ts-nocheck
const { spawn } = require('child_process');

function runProcess(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false, ...options });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('error', err => reject(err));
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        const err = new Error(`Process exited with code ${code}`);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

async function runYtDlp(args, options = {}) {
  return runProcess('yt-dlp', args, options);
}

async function runYtDlpJson(args, options = {}) {
  const { stdout } = await runYtDlp(args, options);
  return JSON.parse(stdout);
}


/**
 * Baixa o áudio de um vídeo do YouTube com bitrate especificado usando yt-dlp.
 * @param {string} videoId - ID do vídeo do YouTube
 * @param {number} bitrate - Bitrate desejado (ex: 128)
 * @param {string} outputPath - Caminho do arquivo de saída
 * @returns {Promise<void>}
 */
async function downloadAudio(videoId, bitrate, outputPath) {
  // Exemplo: yt-dlp -f "bestaudio[abr<=128]" -o outputPath https://youtube.com/watch?v=videoId
  const url = `https://youtube.com/watch?v=${videoId}`;
  // O filtro de bitrate depende dos formatos disponíveis, mas abr<=bitrate cobre a maioria dos casos
  const format = `bestaudio[abr<=${bitrate}]`;
  const args = ['-f', format, '-o', outputPath, url];
  await runYtDlp(args);
}

module.exports = { runYtDlp, runYtDlpJson, downloadAudio };

