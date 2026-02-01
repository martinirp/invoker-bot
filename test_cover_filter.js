// @ts-nocheck
/**
 * Test script for cover filter
 */

const { isCover, queriesForCover, shouldKeepVideo, filterCovers } = require('./dist/utils/coverFilter');

console.log('=== TESTE DO FILTRO DE COVERS ===\n');

// Teste 1: Detectar covers
console.log('1. Testando detecção de covers:');
const testTitles = [
    'Slipknot - Psychosocial',
    'Slipknot - Psychosocial (Cover)',
    'Slipknot - Psychosocial [Metal Cover]',
    'Psychosocial - Banjo Cover',
    'Slipknot - Psychosocial (Acoustic Cover)',
    'Slipknot - Psychosocial Karaoke',
    'Slipknot - Psychosocial Official Video'
];

testTitles.forEach(title => {
    const result = isCover(title);
    console.log(`  ${result ? '✅' : '❌'} "${title}" -> ${result ? 'É COVER' : 'NÃO é cover'}`);
});

// Teste 2: Detectar intenção do usuário
console.log('\n2. Testando detecção de intenção do usuário:');
const testQueries = [
    'slipknot psychosocial',
    'slipknot psychosocial cover',
    'slipknot psychosocial banjo cover',
    'metallica nothing else matters',
    'metallica nothing else matters acoustic cover'
];

testQueries.forEach(query => {
    const result = queriesForCover(query);
    console.log(`  ${result ? '✅' : '❌'} "${query}" -> Usuário ${result ? 'QUER' : 'NÃO quer'} cover`);
});

// Teste 3: Filtrar vídeos
console.log('\n3. Testando filtragem de vídeos:');

const videos = [
    { videoId: 'v1', title: 'Slipknot - Psychosocial Official Video' },
    { videoId: 'v2', title: 'Slipknot - Psychosocial (Cover)' },
    { videoId: 'v3', title: 'Slipknot - Psychosocial [Metal Cover]' },
    { videoId: 'v4', title: 'Slipknot - Psychosocial Banjo Cover' }
];

console.log('\n  Query SEM "cover":');
const query1 = 'slipknot psychosocial';
const filtered1 = filterCovers(videos, query1);
console.log(`  Query: "${query1}"`);
console.log(`  Resultados: ${filtered1.length}/${videos.length}`);
filtered1.forEach(v => console.log(`    ✅ ${v.title}`));

console.log('\n  Query COM "cover":');
const query2 = 'slipknot psychosocial banjo cover';
const filtered2 = filterCovers(videos, query2);
console.log(`  Query: "${query2}"`);
console.log(`  Resultados: ${filtered2.length}/${videos.length}`);
filtered2.forEach(v => console.log(`    ✅ ${v.title}`));

console.log('\n=== TESTE COMPLETO ===');
