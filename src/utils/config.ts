// @ts-nocheck
/**
 * Valida a configuração do bot (variáveis de ambiente) e reporta
 * erros/warnings de forma clara na inicialização.
 */

function validateConfig() {
  const errors = [];
  const warnings = [];

  if (!process.env.DISCORD_TOKEN) {
    errors.push('DISCORD_TOKEN não definido no .env');
  } else if (process.env.DISCORD_TOKEN.includes('your_') || process.env.DISCORD_TOKEN.includes('seu_token')) {
    errors.push('DISCORD_TOKEN ainda é o placeholder do exemplo');
  }

  const bitrate = parseInt(process.env.OPUS_BITRATE_K || '96', 10);
  if (isNaN(bitrate) || bitrate < 16 || bitrate > 512) {
    warnings.push(`OPUS_BITRATE_K inválido ("${process.env.OPUS_BITRATE_K}"), usando padrão 96`);
  }

  const volume = parseFloat(process.env.DEFAULT_VOLUME || '1');
  if (isNaN(volume) || volume < 0 || volume > 2) {
    warnings.push('DEFAULT_VOLUME inválido (aceito 0–2), usando padrão 1.0');
  }

  const concurrency = parseInt(process.env.DOWNLOAD_CONCURRENCY || '10', 10);
  if (isNaN(concurrency) || concurrency < 1 || concurrency > 50) {
    warnings.push(`DOWNLOAD_CONCURRENCY inválido ("${process.env.DOWNLOAD_CONCURRENCY}"), usando padrão 10`);
  }

  const retries = parseInt(process.env.DOWNLOAD_RETRIES || '2', 10);
  if (isNaN(retries) || retries < 0 || retries > 10) {
    warnings.push('DOWNLOAD_RETRIES inválido (aceito 0–10), usando padrão 2');
  }

  if (!process.env.YOUTUBE_API_KEY) {
    warnings.push('YOUTUBE_API_KEY não definida — busca usará apenas yt-dlp (mais lento)');
  }

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    warnings.push('Credenciais do Spotify não definidas — links/playlists do Spotify não funcionarão');
  }

  if (!process.env.LASTFM_API_KEY) {
    warnings.push('LASTFM_API_KEY não definida — AutoDJ e recomendações desativados');
  }

  if (!process.env.GEMINI_API_KEY) {
    warnings.push('GEMINI_API_KEY não definida — mix por IA desativado');
  }

  return { errors, warnings };
}

function logConfig() {
  const { errors, warnings } = validateConfig();

  for (const err of errors) {
    console.error(`❌ [CONFIG] ${err}`);
  }
  for (const warn of warnings) {
    console.warn(`⚠️  [CONFIG] ${warn}`);
  }

  if (errors.length > 0) {
    console.error('❌ [CONFIG] Corrija os erros acima antes de iniciar o bot.');
  } else if (warnings.length === 0) {
    console.log('✅ [CONFIG] Configuração válida.');
  } else {
    console.log(`⚠️  [CONFIG] Configuração aceita com ${warnings.length} avisos.`);
  }

  return { errors, warnings };
}

module.exports = { validateConfig, logConfig };
