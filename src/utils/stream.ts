// @ts-nocheck
const { spawn } = require('child_process');

function createOpusStream(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  return createOpusStreamFromUrl(url);
}

function createOpusStreamFromUrl(url) {
  console.log(`[STREAM] iniciando download via yt-dlp (file-based)`);

  const { getCookieArgs } = require('./ytDlp');
  const cookieArgs = getCookieArgs();

  // 🔥 YouTube 403 Fix: Download to file instead of streaming to stdout
  // YouTube blocks stdout streaming (-o -) but allows file downloads
  // This matches the working 'dl' command approach
  const fs = require('fs');
  const path = require('path');
  const cachePath = require('./cachePath');

  // Generate temporary file path
  const tempId = url.includes('watch?v=') ? url.split('watch?v=')[1].split('&')[0] : 'temp';
  const outputFile = cachePath(tempId);
  const outputDir = path.dirname(outputFile);

  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const ytdlpArgs = [
    ...cookieArgs,
    '-x',  // Extract audio
    '--audio-format', 'opus',  // Convert to Opus (Discord-compatible)
    '--no-playlist',
    '-o', outputFile,
    url
  ];

  // Spawn yt-dlp to download file
  console.log(`[STREAM] comando: yt-dlp ${ytdlpArgs.join(' ')}`);
  const ytdlp = spawn('yt-dlp', ytdlpArgs, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Track download progress and errors
  let ytdlpFailed = false;
  let ytdlpError = null;
  let downloadComplete = false;

  // Monitor yt-dlp exit
  ytdlp.on('close', (code) => {
    if (code !== 0) {
      ytdlpFailed = true;
      ytdlpError = new Error(`yt-dlp failed with exit code ${code}`);
      console.error(`[STREAM] yt-dlp falhou com código ${code}`);
    } else {
      downloadComplete = true;
      console.log(`[STREAM] download concluído: ${outputFile}`);
    }
  });

  ytdlp.on('error', err => {
    ytdlpFailed = true;
    ytdlpError = err;
    console.error('[STREAM] yt-dlp erro:', err?.message || err);
  });

  // Capture stderr for debugging and error detection
  ytdlp.stderr.on('data', chunk => {
    const msg = chunk.toString();
    // Log everything for debugging
    console.log(`[STREAM][yt-dlp] ${msg.trim()}`);

    if (msg.includes('HTTP Error 403')) {
      ytdlpFailed = true;
      ytdlpError = new Error('YouTube blocked download (HTTP 403 Forbidden)');
      console.error('[STREAM] ❌ YouTube bloqueou download (403)');
    }
  });

  // Return a PassThrough stream that will pipe the file once download completes
  const { PassThrough } = require('stream');
  const outputStream = new PassThrough();

  // Wait for download to complete, then stream the file
  const checkAndStream = setInterval(() => {
    if (ytdlpFailed) {
      clearInterval(checkAndStream);
      outputStream.destroy(ytdlpError || new Error('Download failed'));
      return;
    }

    if (downloadComplete && fs.existsSync(outputFile)) {
      clearInterval(checkAndStream);

      // Stream the downloaded file
      const fileStream = fs.createReadStream(outputFile);
      fileStream.on('error', err => {
        console.error('[STREAM] erro ao ler arquivo:', err);
        outputStream.destroy(err);
      });

      fileStream.pipe(outputStream);
      console.log('[STREAM] streaming do arquivo baixado');
    }
  }, 100);

  // Cleanup on stream close
  outputStream.on('close', () => {
    clearInterval(checkAndStream);
    try { ytdlp.kill('SIGKILL'); } catch { }
  });

  return outputStream;
}

module.exports = { createOpusStream, createOpusStreamFromUrl };

