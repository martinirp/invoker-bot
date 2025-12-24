# InvokerBot

Um bot Discord para reprodução de música, reescrito em TypeScript com otimizações de performance.

**Baseado em:** MorphBot (reescrita completa em TypeScript)

## Features

- 🎵 **Reprodução de Música** via YouTube, Spotify, Last.FM
- 🔄 **AutoDJ** com recomendações inteligentes (Last.FM + Gemini AI)
- 💾 **Cache Opus** com validação automática
- ⚡ **Performance Otimizada** (ES2022, TypeScript compilado)
- 🎚️ **42 Comandos** disponíveis
- 🔊 **Bitrate Configurável** (16-512 kbps)

## Requisitos

- **Node.js:** >= 20.0.0
- **npm:** >= 10.0.0
- **FFmpeg** instalado e acessível via PATH
- **yt-dlp** instalado e acessível via PATH

## Instalação

```bash
# Clone o repositório
git clone https://github.com/your-username/invoker-bot.git
cd invoker-bot

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com seus tokens e API keys
```

## Configuração

Edite o arquivo `.env`:

```dotenv
# Token do Discord Bot
DISCORD_TOKEN=seu_token_aqui

# APIs (opcional, para features específicas)
GEMINI_API_KEY=sua_chave_aqui
SPOTIFY_CLIENT_ID=seu_id_aqui
SPOTIFY_CLIENT_SECRET=seu_secret_aqui
YOUTUBE_API_KEY=sua_chave_aqui
LASTFM_API_KEY=sua_chave_aqui

# Configuração de Áudio
OPUS_BITRATE_K=64          # 16-512 kbps
OPUS_COMPRESSION_LEVEL=10  # 0-10

# Debug
DEBUG_MODE=false
```

## Comandos

### Reprodução
- `#p <música>` - Reproduzir música
- `#playnow <música>` - Pular fila e reproduzir agora
- `#skip` - Pular faixa atual
- `#queue` - Ver fila de reprodução
- `#clear` - Limpar fila

### Controle
- `#volume <0-100>` - Ajustar volume
- `#pause` - Pausar
- `#resume` - Retomar
- `#stop` - Parar e desconectar

### Utilitários
- `#help` - Listar comandos
- `#stats` - Estatísticas do bot
- `#mix` - Reprodução aleatória
- `#autodj <on|off>` - Ativar/desativar AutoDJ

## Scripts

```bash
# Desenvolvimento (ts-node com hot-reload)
npm run dev

# Build
npm run build

# Produção
npm start

# Lint (placeholder)
npm run lint
```

## Estrutura

```
invokerBot/
├── src/
│   ├── commands/          # Comandos Discord
│   ├── utils/            # Utilitários (queue, cache, download)
│   ├── types/            # Tipos TypeScript
│   ├── index.ts          # Client Discord
│   └── start.ts          # Entrypoint
├── dist/                 # Build output
├── tsconfig.json         # Configuração TypeScript
├── package.json
└── .env.example         # Template de variáveis
```

## Performance

- **Compilação:** ES2022 otimizado
- **Runtime:** Node.js com 2GB heap
- **Source Maps:** Inline para debugging
- **Bitrate:** 64 kbps (configurável)
- **Compression:** Nível 10 (máximo)

## Troubleshooting

### "DAVE protocol not installed"
```bash
npm install @snazzah/davey
```

### YouTube API 403
Tente usar yt-dlp como fallback automático ou regenere sua API key.

### Sem som
- Verifique se FFmpeg está instalado
- Verifique permissões do bot no servidor Discord
- Verifique o bitrate em `.env`

## Desenvolvido com

- [discord.js](https://discord.js.org/) v14
- [@discordjs/voice](https://github.com/discordjs/voice) v0.19
- [TypeScript](https://www.typescriptlang.org/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [FFmpeg](https://ffmpeg.org/)

## Licença

Privado - Todos os direitos reservados

## Suporte

Para reportar bugs ou sugerir features, abra uma issue no repositório.
