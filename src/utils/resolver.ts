// @ts-nocheck
const { searchYouTubeMultiple, getVideoDetails } = require('./youtubeApi');
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

  // 1. Buscar múltiplos resultados (top 5)
  let results = await searchYouTubeMultiple(query, 5);
  
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

  // 3. Buscar detalhes (views) para todos os candidatos em paralelo (Caminho Normal)
  const candidatesWithDetails = await Promise.all(
    candidates.map(async (v) => {
      try {
        const details = await getVideoDetails(v.videoId);
        return { ...v, ...details };
      } catch {
        return { ...v, views: 0 };
      }
    })
  );

  // 4. Sistema de pontuação (Reduce)
  // Pesos: 70% Relevância de Título, 30% Visualizações (Log)
  const best = candidatesWithDetails.reduce((prev, curr) => {
    const prevRel = calculateRelevancy(prev.title, query);
    const currRel = calculateRelevancy(curr.title, query);
    
    // View Score: Log10 das views (10k = 4, 1M = 6, 10M = 7...)
    const prevViewScore = Math.log10(Math.max(1, prev.views || 0));
    const currViewScore = Math.log10(Math.max(1, curr.views || 0));
    
    // Normalizar view score (considerando que raramente passa de 10 na escala log)
    const prevScore = (prevRel * 0.7) + (Math.min(prevViewScore / 10, 1) * 0.3);
    const currScore = (currRel * 0.7) + (Math.min(currViewScore / 10, 1) * 0.3);
    
    return currScore > prevScore ? curr : prev;
  });

  const finalResult = {
    fromCache: false,
    videoId: best.videoId,
    title: best.title,
    metadata: {
      channel: best.channel,
      thumbnail: best.thumbnail,
      duration: best.duration,
      views: best.views,
      channelId: best.channelId,
      description: best.description
    }
  };

  console.log(`[RESOLVER] ✅ Selecionado: "${finalResult.title}" [Score: Views=${finalResult.metadata.views}]`);

  // Salvar no cache para uso futuro nesta sessão
  if (memoryCache.size > 500) memoryCache.clear(); // Limpeza básica se crescer demais
  memoryCache.set(normalizedQuery, finalResult);

  return finalResult;
}

module.exports = { resolve };

