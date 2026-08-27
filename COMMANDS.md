# 📖 Documentação de Comandos — Kael Bot

> **Prefixos aceitos:** `#` `$` `%` `&` `/`
> Exemplo: `#play Linkin Park` ou `$skip`

---

## 🎵 `play` — Tocar música
**Aliases:** `p`
**Uso:** `#play <nome ou link>`

Toca uma música. O fluxo varia conforme o input:

### Fluxo de detecção (em ordem de prioridade):
1. **Link do Spotify (track)** → Resolve metadata da track (artista + título) → Busca no YouTube → Toca
2. **Link do Spotify (playlist)** → Resolve todas as faixas → Toca a primeira imediatamente → Enfileira o restante em background
3. **Link do YouTube (vídeo ou playlist):**
   - Toca o vídeo **imediatamente**
   - Se a URL também contém uma playlist (`?list=PL...`), pergunta via botões se o usuário quer adicionar as restantes
   - ⚠️ **Mixes automáticos são ignorados** (`list=RD...`, `list=WL`, `list=LL`, `list=LM`, `start_radio=1`)
4. **URL externa** (SoundCloud, Bandcamp, URL direta de áudio) → Resolve via `yt-dlp` → Toca
5. **Busca de texto** → Usa o resolver interno → Toca o melhor resultado

### Comportamento importante:
- **Sem download em disco**: o áudio é transmitido em tempo real via `yt-dlp -o -` → `ffmpeg` → PCM (48kHz stereo) e tocado direto no Discord (StreamType.Raw)
- `yt-dlp` usa player client `android,ios` para evitar throttling e restrições
- O vídeo do YouTube é tocado com `--no-playlist` (só o vídeo, sem importar a playlist automaticamente)
- A detecção de playlist é separada e explícita (via botões Sim/Não)

---

## 🎵 `playSuno` — Tocar música do Suno
**Aliases:** `ps`
**Uso:** `$ps <link-suno>`
**Exemplo:** `$ps https://suno.com/s/qLR5ObPcP5CIx1W5`

- Resolve o link do Suno (extrai `audio_url`/CDN do HTML SSR)
- Toca o áudio direto da CDN do Suno (streaming, sem download)
- Mostra embed com título, artista e capa

---

## ⏭️ `playnow` — Tocar próximo (prioritário)
**Aliases:** `pn`, `pnow`, `next`
**Uso:** `#playnow <nome ou link>`
**Requer:** Cargo `Admin`, `Moderador`, `DJ`, `MODS` ou permissão de `ADMINISTRATOR`

Mesma lógica de resolução do `play`, mas **insere a música como próxima na fila** (não no final), sem aguardar a atual terminar.

> ⚠️ **Não pergunta sobre playlists** — apenas toca o vídeo individual, mesmo que a URL contenha `?list=`.

---

## ⏭️ `skip` — Pular música atual
**Aliases:** `s`, `pular`
**Uso:** `#skip`

- Mata o processo de stream (yt-dlp/ffmpeg) e avança para a próxima música
- Exibe o título da música que foi pulada

---

## 🧹 `clear` — Parar e desconectar
**Aliases:** `stop`, `leave`
**Uso:** `#clear`

- Para a reprodução completamente
- Limpa toda a fila da guild
- Desconecta o bot do canal de voz
- O usuário precisa estar em um canal de voz para usar

---

## 📜 `queue` — Ver fila de reprodução
**Aliases:** `q`, `fila`
**Uso:** `#queue`

- Mostra a música tocando e as próximas (até 10)
- Exibe **duração** de cada música e **tempo estimado até tocar**
- Mostra duração total da fila
- Se houver mais de 10 músicas, exibe no rodapé quantas restam
- Envia reações numéricas (1️⃣–🔟) na mensagem para remoção rápida via react
- Busca as durações via YouTube API em background e **atualiza a mensagem** automaticamente

---

## 📜 `queuelist` — Ver fila paginada
**Aliases:** `ql`, `qlist`
**Uso:** `#queuelist [página]`

- Versão paginada da fila (10 itens por página)
- Na página 1, exibe a música atual com botões interativos: **Loop**, **AutoDJ**, **Skip**
- Diferente do `queue`, não mostra durações (mais leve)

---

## 🗑️ `remove` — Remover música da fila
**Uso:** `#remove`

- Exibe a fila e adiciona reações numéricas (1️⃣–🔟)
- O usuário reage com o número para remover a música correspondente
- O handler de remoção fica em `index.ts`

---

## 🔄 `loop` — Loop da música atual
**Aliases:** `repeat`, `repetir`
**Uso:** `#loop [toggle|on|off]`

- Sem argumento ou `toggle` → alterna entre ligado/desligado
- `on` ou `1` → liga o loop
- `off` ou `0` → desliga o loop
- Loop faz a música atual repetir indefinidamente até ser desligado ou a música ser pulada

---

## 🎲 `shuffle` — Embaralhar fila
**Aliases:** `embaralhar`, `shuf`
**Uso:** `#shuffle`

- Embaralha a ordem de todas as músicas na fila (algoritmo Fisher-Yates)
- Precisa de pelo menos 2 músicas na fila
- **Não** adiciona músicas novas

---

## 🔊 `volume` — Controle de volume
**Aliases:** `vol`, `v`
**Uso:** `#volume [1-200]`

- Sem argumento → mostra o volume atual em %
- `#volume 150` → define o volume em 150%
- O volume é aplicado em tempo real (inline volume transformer do @discordjs/voice)
- Precisa de uma música tocando para alterar

---

## 🤖 `autodj` — Modo Auto-DJ
**Aliases:** `dj`, `autoplay`
**Uso:** `#autodj`

- Precisa de uma música **tocando no momento**
- Busca recomendações via **Last.FM** (músicas similares à atual) e adiciona à fila
- Filtra covers, repetições de artista e músicas já na fila
- Exibe botão de **Skip** na mensagem de status (ativo por 60 segundos)

> ⚠️ Requer `LASTFM_API_KEY`. Também é ativado automaticamente a cada música quando ligado.

---

## 📖 `help` — Lista de comandos
**Aliases:** `ajuda`, `comandos`, `h`
**Uso:** `#help`

- Lista todos os comandos registrados no bot, ordenados alfabeticamente
- Exibe nome e descrição de cada comando
- Agrupa em campos de 8 por vez (limite do Discord)

---

## 🔄 `reload` — Recarregar comandos *(Admin)*
**Aliases:** `rl`
**Uso:** `#reload` ou `#reload force`
**Requer:** Permissão de `ADMINISTRATOR`

- Recarrega todos os arquivos de comando e utilitários (limpa o `require.cache`)
- `#reload force` → salva as filas e força um restart completo do processo (útil se o reload normal não resolver)
- Exibe quantos comandos e utils foram carregados com sucesso e quantos falharam

---

## 🔄 `reset` — Reiniciar bot *(Admin)*
**Aliases:** `restart`, `reboot`, `rt`
**Uso:** `#reset`
**Requer:** Permissão de `ADMINISTRATOR`

- **Salva o estado da fila** em disco (`.queue_state.json`) antes de reiniciar
- Desconecta o bot de todos os canais de voz
- Encerra o processo com `exit(1)` (o `start.js` detecta e reinicia)
- Após reconexão, **restaura a fila automaticamente** (aguarda 5 segundos para garantir reconexão)

---

## 🔧 Notas Técnicas Importantes

### Arquitetura de áudio (no-download)
- **Sem cache local, sem banco de dados, sem download em disco**
- YouTube: `yt-dlp -f 'ba[acodec=opus]/ba[ext=m4a]/best' -o -` com `player_client=web_safari` (sem cookies por padrão) → `ffmpeg` (s16le 48kHz stereo) → `createAudioResource(stream, { inputType: StreamType.Raw, inlineVolume: true })`
- Suno: stream direto da CDN (`streamUrl` `.mp3`) com `inputType: StreamType.Arbitrary`
- Volume em tempo real via `resource.volume.setVolume()`

### `linkResolver.ts` — Funções de detecção de links
| Função | Comportamento |
|---|---|
| `isYoutubeLink(url)` | Aceita: `youtube.com`, `www.youtube.com`, `youtu.be`, `music.youtube.com` |
| `isSpotifyLink(url)` | Aceita: `open.spotify.com`, `spotify.com`, URIs `spotify:track:...`, `spotify:playlist:...` |
| `isPlaylist(url)` | Retorna `true` se `?list=` estiver presente, **exceto** `RD*`, `WL`, `LL`, `LM` e `start_radio=1` |
| `resolveVideo(url)` | Usa `yt-dlp --no-playlist` — sempre toca **só o vídeo**, nunca a playlist |
| `resolvePlaylist(url)` | Tenta YouTube API primeiro; fallback para `yt-dlp --flat-playlist` |
| `detectSourceType(url)` | Retorna: `direct`, `soundcloud`, `bandcamp`, `spotify`, `youtube` ou `search` |

### Handler de Reações (index.ts)
Os seguintes comportamentos são tratados por handlers no `index.ts`, **não nos arquivos de comando**:
- Remoção de músicas via reação no `queue`
- Controles da música atual via reações no embed de "tocando agora": 🔁 (loop), 🎶 (autoDJ), ✨ (mix do artista), ⏭️ (skip), 🇶 (fila)
