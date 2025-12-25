# 📦 DownloadBatcher - Documentação

## O que é?

**DownloadBatcher** é um gerenciador de fila de downloads com:
- ✅ Concorrência controlada (máx 4 simultâneos)
- ✅ Retry automático com exponential backoff
- ✅ Processamento em background
- ✅ Status em tempo real

## Problema que Resolve

### ❌ Antes (sem batcher)
```
10 músicas solicitadas
→ Bot tenta baixar todas ao mesmo tempo
→ Sobrecarrega I/O, rede, CPU
→ Pode haver timeouts e cascatas de erros
→ Usuário não sabe o status
```

### ✅ Depois (com batcher)
```
10 músicas solicitadas
→ Fila automática
→ Máximo 4 baixando simultaneamente
→ Quando uma termina, próxima começa
→ Se falhar, retry automático
→ Status disponível em tempo real
```

## Como Funciona

### 1. Enqueue (Adicionar à Fila)
```typescript
batcher.enqueue({
  song: { videoId, title, url },
  guildId: "123456",
  onSuccess: (file) => { /* adiciona à fila do bot */ },
  onError: (error) => { /* notifica usuário */ },
  onRetry: (attempt) => { /* log de retry */ },
  maxRetries: 2
});
```

### 2. Processamento Automático
```
[BATCHER] Task enqueued. Queue size: 3, Active: 1
[BATCHER] Starting download: musica1 (1/4)
[BATCHER] Starting download: musica2 (2/4)
[BATCHER] Starting download: musica3 (3/4)
[BATCHER] Starting download: musica4 (4/4)

(musica1 termina após 5s)
[BATCHER] ✅ Downloaded: musica1
[BATCHER] Starting download: musica5 (4/4)

(musica2 falha)
[BATCHER] ⚠️ Retry attempt 1/2 in 1000ms: musica2
[BATCHER] Starting download: musica2 (4/4) - retry
```

### 3. Retry com Exponential Backoff
```
Tentativa 1: falha
  ↓ espera 1 segundo
Tentativa 2: falha
  ↓ espera 2 segundos (exponencial)
Tentativa 3: sucesso! ✅

Ou se falhar 3 vezes:
  → onError callback chamado
```

## Integração no Bot

### Comando Play
```typescript
// Antes: sequencial, lento
for (const song of songs) {
  await download(song); // espera cada uma
}

// Depois: paralelo + batch
const { playWithBatcher } = require('./batcherIntegration');
await playWithBatcher(guildId, voiceChannel, textChannel, songs);
// Retorna imediatamente, processamento em background
```

### Comando Mix
```typescript
// Antes: 15-20 segundos de espera
const recomendadas = await getRecommendations();
for (const musica of recomendadas) {
  await download(musica); // sequencial...
}

// Depois: responde em 2-3 segundos
const { mixWithBatcher } = require('./batcherIntegration');
await mixWithBatcher(guildId, voiceChannel, textChannel, recomendadas);
// Retorna imediatamente, downloads no background
```

## API

### Constructor
```typescript
new DownloadBatcher({
  maxConcurrent: 4,    // máximo downloads simultâneos
  maxRetries: 2,       // quantas vezes retry
  retryDelay: 1000     // delay inicial (ms)
})
```

### Methods

#### `enqueue(task)`
Adiciona tarefa à fila. Processa automaticamente quando há slots.
```typescript
batcher.enqueue({
  song: Song,
  guildId: string,
  onSuccess: (file: string) => void,
  onError: (error: Error) => void,
  onRetry?: (attempt: number) => void,
  maxRetries?: number
});
```

#### `getStatus()`
Retorna status atual da fila.
```typescript
const status = batcher.getStatus();
// { queueSize: 5, activeDownloads: 4, retrying: 1, maxConcurrent: 4 }
```

#### `clear()`
Limpa fila (cancela todas as pendentes).
```typescript
const cleared = batcher.clear();
// Retorna: número de tasks removidas
```

## Exemplos de Uso

### Exemplo 1: Play Simples
```typescript
const { playWithBatcher } = require('./batcherIntegration');

const resolved = [
  { videoId: 'abc', title: 'Song 1', url: 'https://...' },
  { videoId: 'def', title: 'Song 2', url: 'https://...' }
];

await playWithBatcher(guildId, voiceChannel, textChannel, resolved);
// Retorna imediatamente
// Fila adiciona automaticamente conforme baixa
```

### Exemplo 2: Mix com Monitoramento
```typescript
const { mixWithBatcher, getBatcherStatus } = require('./batcherIntegration');

await mixWithBatcher(guildId, voiceChannel, textChannel, recommendedSongs);

// Monitor em tempo real
setInterval(() => {
  const status = getBatcherStatus();
  console.log(`Fila: ${status.queueSize}, Ativo: ${status.activeDownloads}`);
}, 1000);
```

### Exemplo 3: Limpeza de Emergência
```typescript
const { clearBatcher } = require('./batcherIntegration');

if (something_went_wrong) {
  const cleared = clearBatcher();
  console.log(`${cleared} tasks canceladas`);
}
```

## Performance

### Antes (Sequencial)
- 10 músicas × 5s cada = 50 segundos total
- I/O: 1 arquivo sendo escrito por vez
- CPU: baixo
- Memória: estável

### Depois (Batcher com maxConcurrent=4)
- 10 músicas ÷ 4 = 3 lotes × 5s = 15 segundos total
- I/O: 4 arquivos sendo escritos simultaneamente
- CPU: utilizado melhor
- Memória: sob controle (fila limitada)

**Melhoria: 50s → 15s (3.3x mais rápido)** 🚀

## Retry Logic

Exponential backoff com jitter (opcional):
```
Tentativa 1: delay 1s
Tentativa 2: delay 2s (1s × 2^1)
Tentativa 3: delay 4s (1s × 2^2)
Tentativa N: delay 1s × 2^(n-1)
```

**Vantagens:**
- Não sobrecarrega servidor (retry espaçado)
- Adapta-se a falhas temporárias de rede
- Não causa cascatas de erro

## Monitoramento

Verificar status em tempo real:
```typescript
const { getBatcherStatus } = require('./batcherIntegration');

setInterval(() => {
  const { queueSize, activeDownloads, retrying } = getBatcherStatus();
  
  if (queueSize > 50) {
    console.warn('⚠️ Fila crescendo muito!');
  }
  
  if (retrying > 5) {
    console.warn('⚠️ Muitas retries!');
  }
}, 5000);
```

## Próximos Passos

1. Integrar com `basemix.ts` (substituir loop sequencial)
2. Integrar com comando `play` (múltiplas músicas)
3. Adicionar persistência de estado (se bot reinicia, fila é perdida)
4. Implementar circuit breaker (se muitas falhas, para de tentar)
5. Dashboard de monitoramento em tempo real

---

**Resumo:** DownloadBatcher = fila automática + retry inteligente + performance 3x melhor ✨
