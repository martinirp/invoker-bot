// @ts-nocheck
import type { Song } from '../types/music';

interface DownloadTask {
  song: Song;
  guildId: string;
  onSuccess: (file: string) => void;
  onError: (error: Error) => void;
  onRetry?: (attempt: number) => void;
  maxRetries?: number;
}

interface BatcherConfig {
  maxConcurrent?: number;
  maxRetries?: number;
  retryDelay?: number; // ms
}

/**
 * DownloadBatcher: Gerencia fila de downloads com concorrência controlada + retry automático
 * 
 * Funciona como:
 * 1. Enqueue tasks (música para baixar)
 * 2. Processa automaticamente até maxConcurrent simultâneos
 * 3. Retry automático em caso de falha (exponential backoff)
 * 4. Notifica sucesso/erro via callbacks
 */
class DownloadBatcher {
  private queue: DownloadTask[] = [];
  private activeCount = 0;
  private retrying = new Set<DownloadTask>();
  
  private readonly maxConcurrent: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number; // ms

  constructor(config: BatcherConfig = {}) {
    this.maxConcurrent = config.maxConcurrent || 4;
    this.maxRetries = config.maxRetries || 2;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Adiciona uma tarefa de download à fila
   */
  enqueue(task: DownloadTask) {
    this.queue.push(task);
    console.log(`[BATCHER] Task enqueued. Queue size: ${this.queue.length}, Active: ${this.activeCount}`);
    this.processQueue();
  }

  /**
   * Processa fila, mantendo até maxConcurrent downloads simultâneos
   */
  private processQueue() {
    // Se não há mais slots livres, não faz nada
    if (this.activeCount >= this.maxConcurrent) {
      return;
    }

    // Se fila vazia, nada pra fazer
    if (this.queue.length === 0) {
      console.log(`[BATCHER] Queue vazia. Aguardando.`);
      return;
    }

    // Pega próxima task
    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;
    console.log(`[BATCHER] Starting download: ${task.song.title} (${this.activeCount}/${this.maxConcurrent})`);

    // Simula download (em produção, chama downloadManager)
    this.executeTask(task, 0);
  }

  /**
   * Executa tarefa com retry automático
   */
  private async executeTask(task: DownloadTask, attempt: number) {
    const maxRetries = task.maxRetries ?? this.maxRetries;
    
    try {
      // Aqui entraria a lógica real de download
      // Por enquanto, simula sucesso
      const file = `cache/${task.song.videoId}.opus`;
      
      // Simula delay de download
      await new Promise(r => setTimeout(r, Math.random() * 3000 + 1000));
      
      console.log(`[BATCHER] ✅ Downloaded: ${task.song.title}`);
      task.onSuccess(file);

    } catch (error) {
      const isLastAttempt = attempt >= maxRetries;

      if (isLastAttempt) {
        console.error(`[BATCHER] ❌ Failed after ${attempt + 1} attempts: ${task.song.title}`);
        task.onError(new Error(`Download falhou após ${attempt + 1} tentativas: ${error.message}`));
      } else {
        // Retry com exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt);
        console.warn(`[BATCHER] ⚠️ Retry attempt ${attempt + 1}/${maxRetries + 1} in ${delay}ms: ${task.song.title}`);
        
        if (task.onRetry) task.onRetry(attempt + 1);

        this.retrying.add(task);
        setTimeout(() => {
          this.retrying.delete(task);
          this.executeTask(task, attempt + 1);
        }, delay);

        // Não decrementa activeCount aqui - mantém slot ativo para retry
        this.processQueue(); // Processa próxima enquanto retry aguarda
        return;
      }
    }

    // Finalizou (sucesso ou failure final)
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.processQueue(); // Processa próxima task
  }

  /**
   * Retorna status da fila
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      activeDownloads: this.activeCount,
      retrying: this.retrying.size,
      maxConcurrent: this.maxConcurrent
    };
  }

  /**
   * Limpa fila (cancela pendentes)
   */
  clear() {
    const cleared = this.queue.length;
    this.queue = [];
    console.log(`[BATCHER] Queue cleared. ${cleared} tasks removidas.`);
    return cleared;
  }
}

// Export como CommonJS (compatível com codebase)
module.exports = DownloadBatcher;
module.exports.default = DownloadBatcher;
