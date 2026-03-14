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
2. **Link do Spotify (playlist)** → Resolve todas as faixas → Toca a primeira imediatamente → Enfileira o restante em paralelo (10 concurrent)
3. **Link do YouTube (vídeo ou playlist):**
   - Toca o vídeo **imediatamente**
   - Se a URL também contém uma playlist (`?list=PL...`), pergunta via botões se o usuário quer adicionar as restantes
   - ⚠️ **Mixes automáticos são ignorados** (`list=RD...`, `list=WL`, `list=LL`, `list=LM`, `start_radio=1`)
4. **URL externa** (SoundCloud, Bandcamp, URL direta de áudio) → Resolve via `yt-dlp` → Toca
5. **Busca de texto** → Usa o resolver interno → Toca o primeiro resultado

### Comportamento importante:
- O vídeo do YouTube always é tocado com `--no-playlist` (só o vídeo, sem importar a playlist automaticamente)
- A detecção de playlist é separada e explícita (via botões Sim/Não)
- A fila salva o estado de cada guild individualmente

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

- Antes de pular, verifica se a próxima música está **pronta para tocar** (aguarda até 15 segundos)
- Se a próxima demorar mais de 15s → cancela o skip para evitar silêncio
- Se não houver próxima → avisa que a fila está vazia
- Exibe o título da música que foi pulada

---

## 🧹 `clear` — Parar e desconectar
**Aliases:** `stop`, `leave`, `reset`
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
- **Não** adiciona músicas novas (diferente do `mix`)

---

## 🎧 `mix` — Mix aleatório da biblioteca
**Aliases:** `shuffle`, `embaralhar`
**Uso:** `#mix`

- Pega até **10 músicas aleatórias** do banco de dados local (cache)
- Adiciona todas à fila
- Músicas vêm do arquivo de cache local (já baixadas anteriormente)

> ⚠️ Só funciona se houver músicas no banco. Se o cache estiver vazio, avisa.

---

## 🤖 `autodj` — Modo Auto-DJ
**Aliases:** `dj`, `autoplay`
**Uso:** `#autodj`

- Precisa de uma música **tocando no momento**
- Busca **5 vídeos relacionados** no YouTube API baseado na música atual
- Adiciona à fila apenas os que **não estão já na fila**
- Exibe botão de **Skip** na mensagem de status (ativo por 60 segundos)

> ⚠️ Depende da YouTube Data API — se a API estiver indisponível, não funciona.

---

## 📚 `lib` — Biblioteca de músicas do cache
**Aliases:** `library`, `biblioteca`
**Uso:** `#lib`

- Lista todas as músicas baixadas no cache local (banco SQLite)
- Paginação de 12 músicas por página com botões ⬅️ ➡️
- Da segunda mensagem, exibe botão **Buscar** para localizar uma música específica
- As interações (busca, tocar direto, excluir) são tratadas no `index.ts`

---

## ⬇️ `dl` — Download MP3
**Aliases:** `download`
**Uso:** `#dl <link ou termo de busca>`

- **Com link do YouTube:** baixa diretamente o vídeo como MP3
- **Com texto:** busca 3 resultados no YouTube e pede para o usuário escolher via reações 1️⃣2️⃣3️⃣
- Escreve tags ID3 no arquivo (título, artista, álbum) se os metadados estiverem disponíveis
- Envia o arquivo `.mp3` no chat
- Remove o arquivo temporário automaticamente após 5 segundos do envio

---

## 📊 `stats` — Estatísticas do bot
**Aliases:** `estatísticas`, `info`
**Uso:** `#stats`

Exibe:
- Total de músicas em cache
- Total de chaves de busca salvas
- Informações do banco de dados (WAL, cache size)
- Bitrate de áudio configurado (96 kbps)

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
- `#reload force` → força um restart completo do processo (útil se reload normal não resolver)
- Exibe quantos comandos e utils foram carregados com sucesso e quantos falharam

---

## 🔄 `reset` — Reiniciar bot *(Admin)*
**Aliases:** `restart`, `reboot`, `rt`
**Uso:** `#reset`
**Requer:** Permissão de `ADMINISTRATOR`

- **Salva o estado da fila** de todas as guilds antes de reiniciar
- Desconecta o bot de todos os canais de voz
- Encerra o processo com `exit(1)` (o host/`start.js` detecta e reinicia)
- Após reconexão, **restaura a fila automaticamente** (aguarda 5 segundos para garantir reconexão)

---

## 🔧 Notas Técnicas Importantes

### `linkResolver.ts` — Funções de detecção de links
| Função | Comportamento |
|---|---|
| `isYoutubeLink(url)` | Aceita: `youtube.com`, `www.youtube.com`, `youtu.be`, `music.youtube.com` |
| `isSpotifyLink(url)` | Aceita: `open.spotify.com`, `spotify.com`, URIs `spotify:track:...`, `spotify:playlist:...` |
| `isPlaylist(url)` | Retorna `true` se `?list=` estiver presente, **exceto** `RD*`, `WL`, `LL`, `LM` e `start_radio=1` |
| `resolveVideo(url)` | Usa `yt-dlp --no-playlist` — sempre toca **só o vídeo**, nunca a playlist |
| `resolvePlaylist(url)` | Tenta YouTube API primeiro; fallback para `yt-dlp --flat-playlist` |
| `detectSourceType(url)` | Retorna: `direct`, `soundcloud`, `bandcamp`, `spotify`, `youtube` ou `search` |

### Cache e Banco de Dados
- Todas as músicas baixadas ficam no SQLite local (`db.ts`)
- `db.getByVideoId(id)` verifica cache antes de baixar novamente
- O `mix` e o `lib` dependem exclusivamente desse banco

### Handler de Reações (index.ts)
Os seguintes comportamentos são tratados por handlers no `index.ts`, **não nos arquivos de comando**:
- Remoção de músicas via reação no `queue`
- Escolha de download via reação no `dl`
- Buscar/tocar/excluir músicas via botão no `lib`
