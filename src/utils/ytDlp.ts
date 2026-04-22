// @ts-nocheck
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Tenta encontrar o executável local (Windows ou Linux) ou usa do PATH
const localYtDlp = path.join(process.cwd(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const YT_DLP_BIN = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';

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
 * Cria um stream de áudio do YouTube via yt-dlp sem salvar em disco.
 * O stdout do processo yt-dlp é retornado como um Readable stream
 * e pode ser passado diretamente para createAudioResource() do @discordjs/voice.
 *
 * @param {string} videoIdOrUrl - ID do vídeo (ex: "dQw4w9WgXcQ") ou URL completa
 * @param {object} [options]
 * @param {string} [options.playerClient='android,ios'] - Player client do yt-dlp
 * @returns {{ stream: Readable, process: ChildProcess }}
 */
function createYtDlpStream(videoIdOrUrl, options = {}) {
  const isUrl = /^https?:\/\//.test(videoIdOrUrl);
  const url = isUrl ? videoIdOrUrl : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;
  const playerClient = options.playerClient || 'android,ios';

  const args = [
    '--js-runtimes', 'node',
    '-f', 'bestaudio/best',
    '-x',
    '--audio-format', 'opus',
    '--audio-quality', '0',
    '--no-playlist',
    '--no-warnings',
    '--extractor-args', `youtube:player_client=${playerClient}`,
    '-o', '-',   // redireciona áudio para stdout (sem salvar em disco)
    url
  ];

  const child = spawn(YT_DLP_BIN, args, { shell: false });

  // Loga erros do yt-dlp sem crashar o processo
  let stderrBuf = '';
  child.stderr.on('data', d => {
    stderrBuf += d.toString();
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[YT-DLP STREAM] process exited with code ${code}: ${stderrBuf.slice(-300)}`);
    }
  });

  return { stream: child.stdout, process: child };
}

module.exports = { runYtDlp, runYtDlpJson, createYtDlpStream };

