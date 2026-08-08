import { config } from 'dotenv';
config();

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

const RESTART_DELAY = 3000; // Delay antes de reiniciar (ms)
const MAX_RESTARTS = 10; // Máximo de restarts consecutivos
const RESTART_WINDOW = 60000; // Janela de tempo para contar restarts (ms)

let restartCount = 0;
let lastRestartTime = 0;
let botProcess: ChildProcess | null = null;

function shouldRestart(): boolean {
  const now = Date.now();

  // Reseta contagem se fora da janela
  if (now - lastRestartTime > RESTART_WINDOW) {
    restartCount = 0;
  }

  if (restartCount >= MAX_RESTARTS) {
    console.error(`❌ [MANAGER] Máximo de ${MAX_RESTARTS} restarts atingido em ${RESTART_WINDOW}ms. Abortando.`);
    return false;
  }

  restartCount++;
  lastRestartTime = now;
  return true;
}

function startBot(): void {
  const botScript = path.join(__dirname, 'index.js');

  console.log(`\n🚀 [MANAGER] Iniciando bot (attempt ${restartCount})...`);

  botProcess = spawn('node', ['--enable-source-maps', '--max-old-space-size=2048', botScript], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  botProcess.on('exit', (code, signal) => {
    console.log(`\n⚠️  [MANAGER] Bot encerrou (code: ${code}, signal: ${signal})`);
    botProcess = null;

    if (shouldRestart()) {
      console.log(`⏳ [MANAGER] Reiniciando em ${RESTART_DELAY}ms...`);
      setTimeout(startBot, RESTART_DELAY);
    } else {
      console.error(`❌ [MANAGER] Bot não será reiniciado.`);
      process.exit(1);
    }
  });

  botProcess.on('error', (err) => {
    console.error(`❌ [MANAGER] Erro ao iniciar bot:`, err);
  });
}

// Handle signals de encerramento gracioso
process.on('SIGTERM', () => {
  console.log('\n📴 [MANAGER] SIGTERM recebido, encerrando...');
  if (botProcess) botProcess.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n📴 [MANAGER] SIGINT recebido, encerrando...');
  if (botProcess) botProcess.kill('SIGINT');
  process.exit(0);
});

console.log('🎵 [MANAGER] Gerenciador de Bot iniciado. Monitorando restarts...\n');

try {
  console.log('🔨 [MANAGER] Executando build (npm run build)...');
  const { execSync } = require('child_process');
  execSync('npm run build', { stdio: 'inherit', cwd: process.cwd() });
  console.log('✅ [MANAGER] Build concluído com sucesso!');
} catch (error) {
  console.error('❌ [MANAGER] Falha no build! Iniciando versão anterior se existir...', error.message);
}

startBot();

