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

function getCookieArgs() {
  const customCookies = process.env.YTDLP_COOKIES;
  if (customCookies && fs.existsSync(customCookies)) {
    return ['--cookies', customCookies];
  }
  const rootCookies = path.join(process.cwd(), 'cookies.txt');
  if (fs.existsSync(rootCookies)) {
    return ['--cookies', rootCookies];
  }
  return [];
}

function getExtractorArgs(playerClientOverride) {
  const extractorArgs = [];

  // Se playerClient for especificado explicitamente via options ou env, passa.
  // Padrão vazio: deixa o yt-dlp escolher (funciona com o runtime JS Deno nativamente)
  const client = (playerClientOverride !== undefined && playerClientOverride !== null)
    ? String(playerClientOverride).trim()
    : (process.env.YTDLP_PLAYER_CLIENT || '').trim();

  if (client) {
    extractorArgs.push(`player_client=${client}`);
  }

  const poToken = (process.env.YOUTUBE_PO_TOKEN || '').trim();
  const visitorData = (process.env.YOUTUBE_VISITOR_DATA || '').trim();
  if (poToken) {
    extractorArgs.push(`po_token=web+${poToken}`);
    if (visitorData) {
      extractorArgs.push(`visitor_data=${visitorData}`);
    }
  }

  if (extractorArgs.length > 0) {
    return ['--extractor-args', `youtube:${extractorArgs.join(';')}`];
  }
  return [];
}

async function runYtDlp(args, options = {}) {
  const commonArgs = [
    ...getCookieArgs(),
    ...getExtractorArgs(options.playerClient)
  ];
  return await runProcess(YT_DLP_BIN, [...commonArgs, ...args], options);
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
 * @param {string} [options.playerClient] - Player client do yt-dlp
 * @returns {{ stream: Readable, process: { kill: Function } }}
 */
function createYtDlpStream(videoIdOrUrl, options = {}) {
  const isUrl = /^https?:\/\//.test(videoIdOrUrl);
  const url = isUrl ? videoIdOrUrl : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;

  // yt-dlp: preferência por opus em contêiner webm (mais leve para o YouTube)
  const ytArgs = [
    ...getCookieArgs(),
    ...getExtractorArgs(options.playerClient),
    '-f', 'ba[acodec=opus]/ba[ext=m4a]/bestaudio/best',
    '--no-playlist',
    '--no-warnings',
    '--no-cache-dir',
    '--buffer-size', '128K',
    '--socket-timeout', '30',
    '--retries', '3',
    '-o', '-',
    url
  ];
  // Alguns casos funcionam melhor sem forçar client específico (deixa yt-dlp escolher)
  // Mantemos override quando explicitamente passado

  const ytProcess = spawn(YT_DLP_BIN, ytArgs, { shell: false });

  // ffmpeg: otimizado para baixo uso de CPU
  // s16le ainda é usado para permitir inlineVolume no discord.js
  const ffmpegArgs = [
    '-i', 'pipe:0',
    '-analyzeduration', '0',
    '-probesize', '32k',
    '-loglevel', 'error',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ];

  const ffmpegProcess = spawn(FFMPEG_BIN, ffmpegArgs, { shell: false });

  // Pipe com tratamento de erro
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

  ffmpegProcess.stdout.once('data', d => {
    console.log(`[FFMPEG] Gerou primeiro chunk de áudio PCM (${d.length} bytes)`);
  });

  // Loga erros sem crashar
  let ytStderr = '';
  ytProcess.stderr.on('data', d => { ytStderr += d.toString(); });
  ytProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
       console.error(`[YT-DLP] exited code ${code} for ${videoIdOrUrl}: ${ytStderr.slice(-1000)}`);
    } else {
       console.log(`[YT-DLP] finalizou com sucesso (code 0) para ${videoIdOrUrl}`);
    }
  });

  let ffmpegStderr = '';
  ffmpegProcess.stderr.on('data', d => { ffmpegStderr += d.toString(); });
  ffmpegProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[FFMPEG] exited code ${code}: ${ffmpegStderr.slice(-500)}`);
    } else {
      console.log(`[FFMPEG] finalizou com sucesso (code 0)`);
    }
  });

  // Objeto de controle que mata ambos os processos juntos
  const controller = {
    kill: (signal = 'SIGKILL') => {
      try { ytProcess.kill(signal); } catch {}
      try { ffmpegProcess.kill(signal); } catch {}
    },
    onExit: (handler) => ytProcess.on('exit', handler)
  };

  return { stream: ffmpegProcess.stdout, process: controller };
}

module.exports = { runYtDlp, runYtDlpJson, createYtDlpStream, YT_DLP_BIN, getCookieArgs, getExtractorArgs };
