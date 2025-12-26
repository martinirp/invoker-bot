// @ts-nocheck
const { spawn } = require('child_process');

function createOpusStream(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  return createOpusStreamFromUrl(url);
}

function createOpusStreamFromUrl(url) {
  const bitrateK = (() => {
    const v = parseInt(process.env.OPUS_BITRATE_K || '96', 10);
    if (Number.isNaN(v)) return 96;
    return Math.min(512, Math.max(16, v));
  })();
  const compLevel = (() => {
    const v = parseInt(process.env.OPUS_COMPRESSION_LEVEL || '10', 10);
    if (Number.isNaN(v)) return 10;
    return Math.min(10, Math.max(0, v));
  })();

  console.log(`[STREAM] ffmpeg opus settings: bitrate=${bitrateK}k compression=${compLevel}`);

  const { getCookieArgs } = require('./ytDlp');
  const cookieArgs = getCookieArgs();

  // 🔥 Optimization: Add buffer-size and cookies to yt-dlp
  const ytdlpArgs = [
    ...cookieArgs,
    '-f', 'bestaudio',
    '--buffer-size', '1M',
    '--no-playlist',
    '-o', '-',
    url
  ];

  const ytdlp = spawn('yt-dlp', ytdlpArgs, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const ffmpeg = spawn('ffmpeg', [
    '-loglevel', 'quiet',
    '-i', 'pipe:0',
    '-f', 'ogg',
    '-acodec', 'libopus',
    '-b:a', `${bitrateK}k`,
    '-compression_level', String(compLevel),
    'pipe:1'
  ], {
    stdio: ['pipe', 'pipe', 'ignore']
  });

  // 🔥 FIX: Add error handler for ffmpeg.stdin to catch EPIPE (broken pipe)
  ffmpeg.stdin.on('error', err => {
    if ((err as any).code === 'EPIPE') {
      // Ignorar silenciosamente erro de pipe quebrado ao fechar
      return;
    }
    console.error('[STREAM] ffmpeg.stdin erro:', err?.message || err);
  });

  // Conectar pipeline de forma explícita
  ytdlp.stdout.pipe(ffmpeg.stdin);

  // Propagar erros do pipeline (sem causar exceções no consumidor)
  ytdlp.on('error', err => {
    console.error('[STREAM] yt-dlp erro:', err?.message || err);
    try { ffmpeg.stdin.end(); } catch { }
  });

  // Capture yt-dlp stderr for debugging
  ytdlp.stderr.on('data', chunk => {
    const msg = chunk.toString();
    // Ignorar warnings comuns para não poluir
    if (msg.includes('warning') || msg.includes('WARNING')) return;
    console.error(`[STREAM][yt-dlp-err] ${msg.trim()}`);
  });

  ffmpeg.on('error', err => {
    console.error('[STREAM] ffmpeg erro:', err?.message || err);
  });

  // Passar stream diretamente sem buffer estratégico
  const { PassThrough } = require('stream');
  const bufferedStream = new PassThrough();

  ffmpeg.stdout.on('data', chunk => {
    // Respeitar backpressure: pausar leitura se necessário
    if (!bufferedStream.push(chunk)) {
      try { ffmpeg.stdout.pause(); } catch { }
      bufferedStream.once('drain', () => {
        try { ffmpeg.stdout.resume(); } catch { }
      });
    }
  });

  ffmpeg.stdout.on('end', () => {
    console.log('[STREAM] stream finalizado normalmente');
    bufferedStream.end();
  });
  ffmpeg.stdout.on('close', () => {
    try { bufferedStream.end(); } catch { }
  });
  ffmpeg.stdout.on('error', err => {
    console.error('[STREAM] stdout erro:', err?.message || err);
    try { bufferedStream.end(); } catch { }
  });

  // Encerramento coordenado dos processos quando o consumidor termina
  const cleanup = () => {
    try { ytdlp.kill('SIGKILL'); } catch { }
    try { ffmpeg.kill('SIGKILL'); } catch { }
  };
  bufferedStream.on('close', cleanup);
  bufferedStream.on('end', cleanup);

  return bufferedStream;
}

module.exports = { createOpusStream, createOpusStreamFromUrl };

