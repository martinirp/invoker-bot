#!/usr/bin/env node
// @ts-nocheck

/**
 * scripts/quickWarmup.ts
 * 
 * Versão rápida do warmup (sem Gemini)
 * Usa lista pré-definida de músicas populares
 * Mais rápido para testar!
 */

require('dotenv').config();
const { fastResolveBatch } = require('../src/utils/fastResolver');
const db = require('../src/utils/db');
const POPULAR_QUERIES = require('./popularQueries');

/**
 * Resolve e salva queries no cache
 */
async function warmupCache(queries, concurrent = 5) {
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
          file: ''
        });
        
        db.insertKey(query, result.videoId);
        success++;
        
        if (success % 5 === 0) {
          console.log(`  ✅ ${success}/${queries.length}`);
        }
      } catch (e) {
        // Pode falhar se já existe, é ok
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
 * Gera array único de todas as queries
 */
function getAllQueries() {
  const allQueries = [];
  for (const [genre, queries] of Object.entries(POPULAR_QUERIES)) {
    allQueries.push(...queries);
  }
  return allQueries;
}

/**
 * Main
 */
async function main() {
  console.log(`
╔════════════════════════════════════════╗
║   ⚡ QUICK CACHE WARMUP (NO GEMINI)   ║
║   Pré-popula cache com populares      ║
╚════════════════════════════════════════╝
  `);

  try {
    const allQueries = getAllQueries();
    console.log(`📋 Total de queries: ${allQueries.length}`);
    
    const { success, failed } = await warmupCache(allQueries, 5);
    
    console.log(`\n✅ CACHE PREAQUECIDO!`);
    console.log(`   ${success} músicas prontas em <1ms!`);
    
  } catch (e) {
    console.error('❌ Erro:', e.message);
    process.exit(1);
  }
}

main();
