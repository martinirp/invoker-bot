// @ts-nocheck
/**
 * silenceMinimizer.ts
 * 
 * Estratégias para minimizar tempo em silêncio entre faixas:
 * 1. Pré-carregar próxima música enquanto toca atual
 * 2. Trocar de recurso instantaneamente em Idle
 * 3. Usar high-precision timing
 */

import fs from 'fs';
import path from 'path';

const cachePath = require('./cachePath') as (id: string) => string;
const { createOpusTailStream } = require('./fileTailStream');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const { isValidOggOpus } = require('./validator');

interface ResourcePrep {
  song: any;
  resource: any;
  stream: any | null;
  ready: boolean;
  preparedAt: number;
}

/**
 * Prepara recurso de áudio para estar pronto quase instantaneamente
 * Retorna um objeto que pode ser jogado direto no player
 */
function prepareAudioResource(song: any): ResourcePrep {
  let resource;
  let stream = null;

  // Garantir caminho do arquivo
  if (!song.file && song.videoId) {
    song.file = cachePath(song.videoId);
  }

  const absPath = song.file ? path.resolve(song.file) : null;
  const partPath = song.file ? path.resolve(`${song.file}.part`) : null;
  const hasCache = !!(absPath && fs.existsSync(absPath) && isValidOggOpus(absPath));
  const hasPart = !!(partPath && fs.existsSync(partPath) && isValidOggOpus(partPath));

  if (hasCache) {
    // Cache completo: usar direto (mais rápido)
    console.log(`[SILENCE-MIN] Preparado (cache): ${song.title}`);
    resource = createAudioResource(absPath, { inputType: StreamType.OggOpus });
  } else if (hasPart) {
    // Arquivo em download: usar tail stream
    console.log(`[SILENCE-MIN] Preparado (tail): ${song.title}`);
    const tail = createOpusTailStream(absPath);
    tail.on('error', err => {
      console.warn('[TAIL] aviso:', err?.message || err);
    });
    stream = tail;
    resource = createAudioResource(tail, { inputType: StreamType.OggOpus, inlineVolume: false });
  } else {
    // Não está pronto ainda
    console.log(`[SILENCE-MIN] NÃO PRONTO: ${song.title}`);
    return {
      song,
      resource: null,
      stream: null,
      ready: false,
      preparedAt: Date.now()
    };
  }

  return {
    song,
    resource,
    stream,
    ready: true,
    preparedAt: Date.now()
  };
}

/**
 * Pre-fetch inteligente: baixa próxima música antes de terminar a atual
 * Retorna true se conseguiu preparar, false se ainda não está pronta
 */
function isSongReadyToPlay(song: any): boolean {
  if (!song || !song.videoId) return false;

  if (!song.file && song.videoId) {
    song.file = cachePath(song.videoId);
  }

  const absPath = song.file ? path.resolve(song.file) : null;
  const partPath = song.file ? path.resolve(`${song.file}.part`) : null;

  const hasCache = !!(absPath && fs.existsSync(absPath) && isValidOggOpus(absPath));
  const hasPart = !!(partPath && fs.existsSync(partPath) && isValidOggOpus(partPath));

  return hasCache || hasPart;
}

/**
 * Calcula quanto tempo até próxima música estar pronta (estimativa)
 * Útil para timing preciso de transições
 */
function estimateReadyTime(song: any): number {
  if (isSongReadyToPlay(song)) {
    return 0; // Já pronta
  }

  // Estimativa: quanto tempo até o arquivo estar disponível?
  if (!song.file && song.videoId) {
    song.file = cachePath(song.videoId);
  }

  const partPath = song.file ? path.resolve(`${song.file}.part`) : null;

  if (partPath && fs.existsSync(partPath)) {
    // Arquivo .part existe, estimar tamanho crescente
    try {
      const stat = fs.statSync(partPath);
      const sizeKB = stat.size / 1024;
      // Assumindo 64kbps = 8KB/s, estimar tempo restante
      const estimatedTotalKB = 8000; // ~2 minutos
      const remainingKB = Math.max(0, estimatedTotalKB - sizeKB);
      const secondsRemaining = remainingKB / 8;
      return Math.max(100, secondsRemaining * 1000); // mínimo 100ms
    } catch {
      return 3000; // fallback: 3 segundos
    }
  }

  // Se nem .part existe, pode demorar mais
  return 5000; // 5 segundos
}

/**
 * Aguarda música estar pronta, com timeout
 */
async function waitUntilReady(song: any, maxWaitMs = 5000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (isSongReadyToPlay(song)) {
      console.log(`[SILENCE-MIN] Música pronta em ${Date.now() - startTime}ms: ${song.title}`);
      return true;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  console.warn(`[SILENCE-MIN] Timeout aguardando ${song.title} (${maxWaitMs}ms)`);
  return false;
}

/**
 * Retorna callbacks para integrar no player Idle handler
 * Minimiza gap entre Idle → Next play
 */
function getSeamlessTransitionCallbacks() {
  return {
    /**
     * Chamado imediatamente ao receber Idle
     * Deve preparar próxima música MUITO rápido
     */
    onIdle: (nextSong: any) => {
      if (!nextSong) return null;

      const prep = prepareAudioResource(nextSong);
      if (prep.ready) {
        console.log(`[SILENCE-MIN] ⚡ Transição seamless pronta em ${Date.now() - prep.preparedAt}ms`);
        return prep.resource;
      } else {
        console.warn(`[SILENCE-MIN] ⚠️ Próxima música não está pronta para transição seamless`);
        return null;
      }
    },

    /**
     * Chamado ~1 segundo antes de Idle (pre-event)
     * Garante que próxima está pronta
     */
    onPreIdle: (nextSong: any, currentDurationMs: number) => {
      if (!nextSong) return;

      const readyTime = estimateReadyTime(nextSong);
      const timeUntilIdle = Math.max(0, currentDurationMs - 1000); // 1s antes do fim

      console.log(`[SILENCE-MIN] Pre-Idle check: ready=${readyTime}ms, timeUntilIdle=${timeUntilIdle}ms`);

      if (readyTime <= timeUntilIdle) {
        console.log(`[SILENCE-MIN] ✅ Próxima música estará pronta a tempo`);
        return true;
      } else {
        console.warn(`[SILENCE-MIN] ⚠️ Próxima música pode não estar pronta a tempo (${readyTime}ms > ${timeUntilIdle}ms)`);
        return false;
      }
    }
  };
}

module.exports = {
  prepareAudioResource,
  isSongReadyToPlay,
  estimateReadyTime,
  waitUntilReady,
  getSeamlessTransitionCallbacks
};
