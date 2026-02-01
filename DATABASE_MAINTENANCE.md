# Scripts de Manutenção do Banco de Dados

## 1. Corrigir Músicas Antigas

Busca metadados do yt-dlp para músicas que ainda têm `artist` e `track` NULL:

```bash
node fix_old_songs.js
```

**O que faz:**
- Busca todas as músicas com `artist IS NULL` ou `track IS NULL`
- Para cada música, chama `updateMetadataAsync()` que:
  - Busca metadados do yt-dlp
  - Aplica estratégia de fallback (parsing, uploader, etc.)
  - Atualiza banco de dados
  - Popula campos normalizados
- Mostra progresso em tempo real
- Delay de 1s entre cada música para não sobrecarregar

**Exemplo de output:**
```
🔧 Corrigindo músicas antigas no banco de dados...

📊 Encontradas 12 músicas para corrigir

[1/12] Processando: Dance Of Death
   VideoId: HfpYbWlGf9k
[METADATA] Iniciando busca assíncrona para HfpYbWlGf9k...
[METADATA] ✅ Atualizado: Iron Maiden - Dance Of Death
   ✅ Atualizado: Iron Maiden - Dance Of Death

[2/12] Processando: CLASSICOS DISK PIZZA: UNDYING MID...
   VideoId: KptYUmiNR50
[METADATA] Iniciando busca assíncrona para KptYUmiNR50...
[METADATA] ✅ Atualizado: DISK PIZZA - CLASSICOS DISK PIZZA...
   ✅ Atualizado: DISK PIZZA - CLASSICOS DISK PIZZA...

...

📊 RESUMO FINAL:
   ✅ Corrigidas: 10
   ❌ Falharam: 2
   📈 Total processadas: 12
```

---

## 2. Migrar Campos Normalizados

Popula `artist_normalized` e `track_normalized` para músicas que já têm artist/track:

```bash
node migrate_normalized_fields.js
```

**O que faz:**
- Busca todas as músicas que já têm `artist` ou `track`
- Normaliza os valores usando `normalizeKey()`
- Atualiza `artist_normalized` e `track_normalized`
- Não faz chamadas ao yt-dlp (apenas normalização local)

**Quando usar:**
- Após rodar `fix_old_songs.js`
- Quando adicionar músicas manualmente ao banco
- Para garantir que índices de busca estejam atualizados

---

## 3. Ordem Recomendada

Para corrigir banco de dados completamente:

```bash
# 1. Corrigir músicas sem metadados (busca no yt-dlp)
node fix_old_songs.js

# 2. Popular campos normalizados
node migrate_normalized_fields.js

# 3. Verificar resultado
node check_db.js
```

---

## 4. Verificar Banco de Dados

Ver estado atual do banco:

```bash
node check_db.js
```

**Output esperado após correção:**
```
🎵 Primeiras 15 músicas no banco:

1. Dance Of Death
   Artist: Iron Maiden
   Track: Dance Of Death
   VideoId: HfpYbWlGf9k

2. Sleeptalk
   Artist: Dayseeker
   Track: Sleeptalk
   VideoId: KV5ffXxFI38

...

📈 Total de músicas: 15
📈 Músicas com artist NULL: 0
📈 Músicas com track NULL: 0
```

---

## 5. Notas Importantes

### ⚠️ Tempo de Execução

O script `fix_old_songs.js` pode demorar:
- **1 música**: ~2-3 segundos
- **10 músicas**: ~30 segundos
- **100 músicas**: ~5 minutos

Há um delay de 1s entre cada música para evitar rate limiting do YouTube.

### ⚠️ Falhas Esperadas

Algumas músicas podem falhar se:
- Vídeo foi deletado do YouTube
- Vídeo é privado/restrito
- Problemas de rede
- Rate limiting do YouTube

Isso é normal e esperado. O script continua processando as demais.

### ✅ Segurança

- O script **não deleta** nenhuma música
- Apenas **atualiza** campos `artist`, `track`, e normalizados
- Pode ser executado múltiplas vezes sem problemas
- Músicas já corrigidas são puladas automaticamente

---

## 6. Troubleshooting

### Erro: "Cannot find module"

```bash
# Certifique-se de compilar primeiro
npm run build
```

### Erro: "ENOENT: no such file or directory"

O banco de dados está em outro local. Verifique o `.env`:
```
MUSIC_DB_PATH=/caminho/para/music.db
```

### Muitas falhas

Se muitas músicas falharem, pode ser rate limiting. Aumente o delay:

```javascript
// Em fix_old_songs.js, linha ~45
await new Promise(resolve => setTimeout(resolve, 2000)); // 2s em vez de 1s
```
