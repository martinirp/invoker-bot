// @ts-nocheck
const { searchYouTubeMultiple } = require('./youtubeApi');
const { filterCovers } = require('./coverFilter');

/**
 * Funções auxiliares para pontuação de relevância
 */
function calculateRelevancy(title, query) {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const titleLower = title.toLowerCase();
  
  if (queryWords.length === 0) return 0;
  
  let matches = 0;
  for (const word of queryWords) {
    if (titleLower.includes(word)) matches++;
  }
  
  return matches / queryWords.length;
}

/**
 * Cache em Memória (RAM apenas, volátil)
 */
const memoryCache = new Map();

/**
 * Resolve uma query para um videoId do YouTube sem usar cache em disco.
 * Tenta buscar cache em memória primeiro para performance.
 */
async function resolve(query) {
  // Normalizar query para o cache
  const normalizedQuery = query.toLowerCase().trim();
  
  if (memoryCache.has(normalizedQuery)) {
    const cached = memoryCache.get(normalizedQuery);
    console.log(`[RESOLVER] 🚀 Cache em memória: "${query}" → ${cached.videoId}`);
    return { ...cached, fromCache: true };
  }

  console.log(`[RESOLVER] 🔍 Buscando no YouTube: "${query}"`);

  // O primeiro resultado já pode iniciar o áudio; detalhes ficam para o
  // enriquecimento em background feito pelo QueueManager.
  let results = await searchYouTubeMultiple(query, 3);
  
  if (!results || results.length === 0) {
    throw new Error(`Nenhum resultado encontrado para: ${query}`);
  }

  // 2. Filtrar covers indesejados
  const filtered = filterCovers(results, query);
  
  // Se filtrar tudo, usamos o primeiro resultado original como fallback desesperado
  const candidates = filtered.length > 0 ? filtered : [results[0]];

  // ⚡ CAMINHO RÁPIDO (Fast Pass):
  // Se o primeiro resultado for excelente (Oficial e alta relevância), 
  // retornamos ele IMEDIATAMENTE sem esperar detalhes dos outros.
  const first = candidates[0];
  const firstRelevancy = calculateRelevancy(first.title, query);
  const isOfficial = /official|oficial/i.test(first.title) || /official|vevo/i.test(first.channel || '');

  if (firstRelevancy >= 0.85 && isOfficial) {
    console.log(`[RESOLVER] ⚡ Fast Pass: "${first.title}" (Relevância=${firstRelevancy.toFixed(2)})`);
    const fastResult = {
      fromCache: false,
      videoId: first.videoId,
      title: first.title,
      metadata: {
        channel: first.channel,
        thumbnail: first.thumbnail,
        source: 'youtube-fastpass'
      }
    };
    if (memoryCache.size > 500) memoryCache.clear();
    memoryCache.set(normalizedQuery, fastResult);
    return fastResult;
  }

  // Os resultados já vêm ordenados por relevância. Não esperar estatísticas
  // de todos os candidatos reduz bastante a latência do primeiro play.
  const best = candidates[0];

  const finalResult = {
    fromCache: false,
    videoId: best.videoId,
    title: best.title,
    metadata: {
      channel: best.channel,
      thumbnail: best.thumbnail,
      duration: best.duration,
      views: best.views || 0,
      channelId: best.channelId,
      description: best.description
    }
  };

  console.log(`[RESOLVER] ⚡ Selecionado para reprodução imediata: "${finalResult.title}"`);

  // Salvar no cache para uso futuro nesta sessão
  if (memoryCache.size > 500) memoryCache.clear(); // Limpeza básica se crescer demais
  memoryCache.set(normalizedQuery, finalResult);

  return finalResult;
}

module.exports = { resolve };

