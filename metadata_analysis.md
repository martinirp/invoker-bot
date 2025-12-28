# 📊 Análise de Metadados - Resultados dos Testes

## Resumo Executivo

Testamos **10 vídeos** diferentes para entender como o yt-dlp retorna metadados:

### Estatísticas
- **Com artist nativo**: 2/10 (20%)
- **Com track nativo**: 2/10 (20%)
- **Com uploader**: 10/10 (100%)
- **Com channel**: 10/10 (100%)

## Padrões Identificados

### ✅ Vídeos COM metadados nativos (artist/track)

1. **Iron Maiden - Dance Of Death**
   - Artist: `Iron Maiden`
   - Track: `Dance Of Death`
   - Album: `From Fear to Eternity: The Best of 1990 - 2010`
   - **Padrão**: Vídeo oficial de artista major label

2. **Megadeth - Holy Wars**
   - Artist: `Megadeth`
   - Track: `Holy Wars... The Punishment Due (2004 Remix)`
   - Album: `Rust In Peace`
   - **Padrão**: Vídeo oficial de artista major label

### ❌ Vídeos SEM metadados nativos (80% dos casos)

3. **DISK PIZZA - Gameplay**
   - Title: `CLASSICOS DISK PIZZA: UNDYING MID NUNCA DECEPCIONA!!!!`
   - Uploader: `DISK PIZZA`
   - **Padrão**: Conteúdo de gaming/streaming

4. **Daniel Boaventura - Unchain My Heart (Ao Vivo)**
   - Title: `Daniel Boaventura - Unchain My Heart (Ao Vivo)`
   - Uploader: `Daniel Boaventura`
   - **Padrão**: Performance ao vivo, título tem formato "Artista - Música"

5. **Dayseeker - Sleeptalk**
   - Title: `Dayseeker - Sleeptalk (Official Video)`
   - Uploader: `Dayseeker`
   - **Padrão**: Banda independente, título tem formato "Artista - Música"

6. **hOlyhexOr - SATANIC = NEW TOP 1 MMR RANK DOTA 2**
   - Title: `SATANIC = NEW TOP 1 MMR RANK DOTA 2`
   - Uploader: `hOlyhexOr`
   - **Padrão**: Conteúdo de gaming

7. **Spiritbox - Circle With Me**
   - Title: `Spiritbox - Circle With Me - Courtney LaPlante live one take performance`
   - Uploader: `Spiritbox Official`
   - **Padrão**: Performance ao vivo, título tem formato "Artista - Música"

8. **The Plot In You - Left Behind**
   - Title: `The Plot In You - Left Behind (Official Music Video)`
   - Uploader: `THEPLOTINYOU`
   - **Padrão**: Banda independente, título tem formato "Artista - Música"

9. **Killswitch Engage - My Curse (Cover)**
   - Title: `Killswitch Engage - "My Curse" (Cover by As The Structure Fails)`
   - Uploader: `As The Structure Fails`
   - **Padrão**: Cover de música, título complexo

10. **As Everything Unfolds - Grayscale**
    - Title: `As Everything Unfolds - Grayscale (Official Video)`
    - Uploader: `Long Branch Records`
    - **Padrão**: Gravadora independente, título tem formato "Artista - Música"

## Conclusões

### 1. Metadados nativos são raros
Apenas **20% dos vídeos** têm metadados nativos de artist/track. Estes são exclusivamente de:
- Artistas major label (Iron Maiden, Megadeth)
- Vídeos oficiais em canais verificados

### 2. Parsing do título é essencial
**80% dos vídeos** precisam de parsing do título, especialmente:
- Bandas independentes
- Performances ao vivo
- Vídeos de gravadoras menores

### 3. Uploader é sempre disponível
**100% dos vídeos** têm o campo `uploader`, que pode servir como fallback para artist

### 4. Formato "Artista - Música" é comum
Dos 8 vídeos sem metadados nativos:
- **6 vídeos** (75%) têm formato "Artista - Música" no título
- **2 vídeos** (25%) são conteúdo não-musical (gaming)

## Estratégia Recomendada

```typescript
// PRIORIDADE 1: Metadados nativos do yt-dlp (20% dos casos)
let finalArtist = artist || null;
let finalTrack = track || null;

// PRIORIDADE 2: Parsing do título "Artista - Música" (60% dos casos)
if (!finalArtist || !finalTrack) {
  const clean = normalizeTitle(title);
  const parts = clean.split(' - ');
  
  if (parts.length >= 2) {
    if (!finalArtist) finalArtist = parts[0].trim();
    if (!finalTrack) finalTrack = parts.slice(1).join(' - ').trim();
  }
}

// PRIORIDADE 3: Usar uploader como artist (100% disponível)
if (!finalArtist && uploader) {
  finalArtist = uploader;
}

// PRIORIDADE 4: Usar title como track (100% disponível)
if (!finalTrack && title) {
  finalTrack = title;
}
```

### Resultado Esperado

| Tipo de Vídeo | Artist | Track |
|---------------|--------|-------|
| Major label oficial | ✅ Nativo | ✅ Nativo |
| Banda independente | ✅ Parsing | ✅ Parsing |
| Performance ao vivo | ✅ Parsing | ✅ Parsing |
| Gaming/Stream | ✅ Uploader | ✅ Title |

**Cobertura**: 100% dos vídeos terão artist e track preenchidos, nunca "Desconhecido"
