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

function getCookieArgs() {
  const cookieArgs = [];
  if (process.env.YOUTUBE_COOKIES_FROM_BROWSER) {
    cookieArgs.push('--cookies-from-browser', process.env.YOUTUBE_COOKIES_FROM_BROWSER);
  } else if (process.env.YOUTUBE_COOKIES_FILE) {
    cookieArgs.push('--cookies', process.env.YOUTUBE_COOKIES_FILE);
  }
  return cookieArgs;
}

const fs = require('fs');
const path = require('path');

let proxies = [];
try {
  const proxyPath = path.resolve('proxies.txt');
  if (fs.existsSync(proxyPath)) {
    proxies = fs.readFileSync(proxyPath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    console.log(`[YT-DLP] Carregados ${proxies.length} proxies.`);
  }
} catch (e) {
  console.warn('[YT-DLP] Erro ao ler proxies.txt:', e.message);
}

function getRandomProxy() {
  if (proxies.length === 0) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

async function runYtDlp(args, options = {}, retryCount = 0) {
  const cookieArgs = getCookieArgs();

  // Na primeira tentativa, avisa sobre cookies
  if (retryCount === 0) {
    if (cookieArgs.length > 0) {
      console.log(`[YT-DLP] Using cookies configuration`);
    } else {
      console.warn('[YT-DLP] ⚠️ No cookies configured! YouTube may block requests.');
    }
  }

  let finalArgs = [...cookieArgs, ...args];

  // Se for retry e tiver proxy, adiciona
  if (options.proxyUrl) {
    console.log(`[YT-DLP] 🔄 Tentativa ${retryCount} usando proxy: ${options.proxyUrl}`);
    finalArgs.push('--proxy', options.proxyUrl);
  }

  try {
    // 🧪 TESTE: Forçar erro na primeira tentativa para testar proxy
    if (retryCount === 0) {
      console.warn('[YT-DLP] 🧪 SIMULANDO ERRO 429 PARA TESTAR PROXY...');
      throw new Error('HTTP Error 429: Too Many Requests (SIMULATED)');
    }

    return await runProcess('yt-dlp', finalArgs, options);
  } catch (err) {
    const errorMsg = (err.stderr || err.message || '').toLowerCase();

    // Erros conhecidos que justificam uso de proxy
    const isBlockingError =
      errorMsg.includes('sign in to confirm') ||
      errorMsg.includes('bot') ||
      errorMsg.includes('429') ||
      errorMsg.includes('403') ||
      errorMsg.includes('forbidden');

    // Se for erro de bloqueio e tiver proxies disponíveis (max 3 retries)
    if (isBlockingError && proxies.length > 0 && retryCount < 3) {
      console.warn(`[YT-DLP] ⚠️ Bloqueio detectado! Tentando proxy (Attempt ${retryCount + 1}/3)...`);

      const proxy = getRandomProxy();
      const newOptions = { ...options, proxyUrl: proxy };

      return runYtDlp(args, newOptions, retryCount + 1);
    }

    throw err;
  }
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

module.exports = { runYtDlp, runYtDlpJson, downloadAudio, getCookieArgs };

