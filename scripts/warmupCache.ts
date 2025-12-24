#!/usr/bin/env node
// @ts-nocheck

/**
 * scripts/warmupCache.ts
 * 
 * Script para pré-popular o cache com músicas populares
 * Usa Gemini AI para gerar queries inteligentes
 * Resolve todas em paralelo e salva no DB
 */

require('dotenv').config();
const https = require('https');
const { fastResolve, fastResolveBatch } = require('../src/utils/fastResolver');
const db = require('../src/utils/db');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Gera lista de queries populares usando Gemini AI
 */
async function generatePopularQueries(genre = 'all', count = 50) {
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY não definida');
    return null;
  }

  const prompts = {
    all: `Gere uma lista de 50 das músicas mais populares e ouvidas de todos os tempos (últimos 10 anos).
Format: "Artista - Música" (um por linha, sem numeração, sem explicações).
Inclua: Pop, Hip-Hop, Rock, Eletrônico, K-Pop, Latin.`,
    
    pop: `Gere 50 das melhores músicas Pop dos últimos 5 anos.
Format: "Artista - Música" (um por linha).`,
    
    hiphop: `Gere 50 das melhores músicas Hip-Hop/Rap dos últimos 5 anos.
Format: "Artista - Música" (um por linha).`,
    
    rock: `Gere 50 das melhores músicas Rock clássicas e modernas.
Format: "Artista - Música" (um por linha).`,
    
    kpop: `Gere 50 das melhores músicas K-Pop dos últimos 5 anos.
Format: "Artista - Música" (um por linha).`,
    
    latin: `Gere 50 das melhores músicas Reggaeton e Latin dos últimos 5 anos.
Format: "Artista - Música" (um por linha).`
  };

  const prompt = prompts[genre] || prompts.all;

  console.log(`🤖 [GEMINI] Gerando ${count} queries de gênero "${genre}"...`);

  const data = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }]
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          const content = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          
          if (!content) {
            console.error('❌ Resposta vazia do Gemini');
            return resolve([]);
          }

          // Parse das músicas (formato: "Artista - Música")
          const queries = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && line.includes('-'))
            .slice(0, count);

          console.log(`✅ Gemini gerou ${queries.length} queries`);
          resolve(queries);
        } catch (e) {
          console.error('❌ Erro ao parsear Gemini:', e.message);
          resolve([]);
        }
      });
    });

    req.on('error', err => {
      console.error('❌ Erro HTTP Gemini:', err.message);
      resolve([]);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Resolve e salva múltiplas queries no cache
 */
async function warmupCacheWithQueries(queries, concurrent = 5) {
  console.log(`\n🔥 [WARMUP] Resolvendo ${queries.length} queries...`);
  console.log(`⚙️  Concorrência: ${concurrent}`);

  let success = 0;
  let failed = 0;
  const startTime = Date.now();

  // Resolver em batch
  const { results, errors } = await fastResolveBatch(queries, concurrent);

  // Salvar no DB
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const query = queries[i];

    if (result && result.videoId) {
      try {
        db.insertSong({
          videoId: result.videoId,
          title: result.title,
          artist: result.channel || '',
          track: '',
          file: '' // Será preenchido no download
        });
        
        db.insertKey(query, result.videoId);
        success++;
        
        if (success % 10 === 0) {
          console.log(`  ✅ ${success}/${queries.length}`);
        }
      } catch (e) {
        console.error(`  ❌ Erro ao salvar: ${query}`, e.message);
        failed++;
      }
    } else {
      failed++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n📊 [WARMUP] Resultado:`);
  console.log(`  ✅ Sucesso: ${success}`);
  console.log(`  ❌ Falhas: ${failed}`);
  console.log(`  ⏱️  Tempo total: ${duration}s`);
  console.log(`  ⚡ Taxa: ${(success / duration).toFixed(1)} queries/s`);

  return { success, failed };
}

/**
 * Cria presets de cache populares
 */
async function createPopularPresets() {
  const genres = [
    { name: 'all', label: 'Top Global (50)' },
    { name: 'pop', label: 'Pop Moderno (30)' },
    { name: 'hiphop', label: 'Hip-Hop/Rap (30)' },
    { name: 'kpop', label: 'K-Pop (20)' }
  ];

  let totalSuccess = 0;
  let totalFailed = 0;

  for (const genre of genres) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎵 Preaquecendo: ${genre.label}`);
    console.log(`${'='.repeat(60)}`);

    const queries = await generatePopularQueries(genre.name, parseInt(genre.label.match(/\d+/)[0]));
    
    if (queries && queries.length > 0) {
      const { success, failed } = await warmupCacheWithQueries(queries, 5);
      totalSuccess += success;
      totalFailed += failed;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎊 CACHE PREAQUECIDO!`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📊 Total Sucesso: ${totalSuccess}`);
  console.log(`📊 Total Falhas: ${totalFailed}`);
  console.log(`\n✅ Próximas vezes que essas músicas forem tocadas, resolverão em <1ms!`);
}

/**
 * Main
 */
async function main() {
  console.log(`
╔════════════════════════════════════════╗
║      🔥 CACHE WARMUP SCRIPT 🔥        ║
║   Pré-popula cache com músicas pop    ║
╚════════════════════════════════════════╝
  `);

  try {
    await createPopularPresets();
  } catch (e) {
    console.error('❌ Erro fatal:', e.message);
    process.exit(1);
  }
}

main();
