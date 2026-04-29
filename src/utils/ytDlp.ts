// @ts-nocheck
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Tenta encontrar o executável local (Windows ou Linux) ou usa do PATH
const localYtDlp = path.join(process.cwd(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const YT_DLP_BIN = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';

// ffmpeg-static fornece o binário do ffmpeg embutido
let FFMPEG_BIN;
try {
  FFMPEG_BIN = require('ffmpeg-static');
} catch {
  FFMPEG_BIN = 'ffmpeg';
}

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
  const defaultArgs = ['--js-runtimes', 'node'];
  try {
    return await runProcess(YT_DLP_BIN, [...defaultArgs, ...args], options);
  } catch (err) {
    throw err;
  }
}

async function runYtDlpJson(args, options = {}) {
  const { stdout } = await runYtDlp(args, options);
  return JSON.parse(stdout);
}

/**
 * Cria um stream de áudio do YouTube via yt-dlp → ffmpeg (PCM s16le).
 * O ffmpeg converte o áudio para PCM raw (48kHz, stereo) que o @discordjs/voice
 * consome com StreamType.Raw — sem precisar de encoder opus instalado.
 *
 * @param {string} videoIdOrUrl - ID do vídeo (ex: "dQw4w9WgXcQ") ou URL completa
 * @param {object} [options]
 * @param {string} [options.playerClient='android,ios'] - Player client do yt-dlp
 * @returns {{ stream: Readable, process: { kill: Function } }}
 */
function createYtDlpStream(videoIdOrUrl, options = {}) {
  const isUrl = /^https?:\/\//.test(videoIdOrUrl);
  const url = isUrl ? videoIdOrUrl : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;
  const playerClient = options.playerClient || 'android,ios';

  // yt-dlp: baixa o melhor áudio e redireciona para stdout
  const ytArgs = [
    '--js-runtimes', 'node',
    '-f', 'bestaudio/best',
    '--no-playlist',
    '--no-warnings',
    '--no-cache-dir',
    '--extractor-args', `youtube:player_client=${playerClient}`,
    '--buffer-size', '256K',
    '--socket-timeout', '30',
    '--retries', '5',
    '--fragment-retries', '5',
    '--retry-sleep', 'fragment:1',
    '-o', '-',
    url
  ];

  const ytProcess = spawn(YT_DLP_BIN, ytArgs, { shell: false });

  // ffmpeg: lê do stdin (yt-dlp), converte para PCM s16le 48kHz stereo
  const ffmpegArgs = [
    '-i', 'pipe:0',
    '-analyzeduration', '0',
    '-loglevel', 'error',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ];

  const ffmpegProcess = spawn(FFMPEG_BIN, ffmpegArgs, { shell: false });

  // Conecta yt-dlp → ffmpeg
  ytProcess.stdout.pipe(ffmpegProcess.stdin);

  // Silencia erros de pipe para não crashar
  ytProcess.stdout.on('error', (err) => {
    if (err.code !== 'EPIPE') console.error(`[YT-DLP] stdout error: ${err.message}`);
  });
  ffmpegProcess.stdin.on('error', (err) => {
    if (err.code !== 'EPIPE') console.error(`[FFMPEG] stdin error: ${err.message}`);
  });
  ffmpegProcess.stdout.on('error', (err) => {
    if (err.code !== 'EPIPE') console.error(`[FFMPEG] stdout error: ${err.message}`);
  });

  // Loga erros sem crashar
  let ytStderr = '';
  ytProcess.stderr.on('data', d => { ytStderr += d.toString(); });
  ytProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[YT-DLP] exited code ${code} for ${videoIdOrUrl}: ${ytStderr.slice(-200)}`);
    }
  });
  ffmpegProcess.stderr.on('data', () => {}); // silencia ffmpeg stderr

  // Objeto de controle que mata ambos os processos juntos
  const controller = {
    kill: (signal = 'SIGKILL') => {
      try { ytProcess.kill(signal); } catch {}
      try { ffmpegProcess.kill(signal); } catch {}
    }
  };

  return { stream: ffmpegProcess.stdout, process: controller };
}

module.exports = { runYtDlp, runYtDlpJson, createYtDlpStream };
