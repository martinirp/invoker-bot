# Filtro de Covers - Implementação

## Problema
O bot estava retornando muitos covers de músicas, mesmo quando o usuário não pedia explicitamente por covers.

## Solução
Implementei um sistema de filtragem inteligente que:

1. **Detecta covers automaticamente** - Identifica vídeos que são covers através de padrões no título:
   - `cover`, `[cover]`, `(cover)`
   - `metal cover`, `acoustic cover`, `piano cover`, `banjo cover`, etc.
   - `karaoke`, `tribute`, `in the style of`

2. **Detecta a intenção do usuário** - Verifica se a query contém a palavra "cover":
   - ✅ `#p slipknot psychosocial banjo cover` → Usuário QUER cover
   - ❌ `#p slipknot psychosocial` → Usuário NÃO quer cover

3. **Filtra resultados** - Remove covers dos resultados EXCETO quando explicitamente solicitados

## Arquivos Criados

### `src/utils/coverFilter.ts`
Novo módulo com funções para:
- `isCover(title)` - Detecta se um título é um cover
- `queriesForCover(query)` - Detecta se o usuário quer um cover
- `shouldKeepVideo(video, query)` - Decide se deve manter um vídeo
- `filterCovers(videos, query)` - Filtra uma lista de vídeos

## Arquivos Modificados

### `src/utils/youtubeApi.ts`
- Importou o filtro de covers
- Aplicou filtro em `ytSearchBasic()` - busca via yt-dlp
- Aplicou filtro em `searchYouTubeMultiple()` - busca múltipla via API

### `src/utils/fastResolver.ts`
- Importou o filtro de covers
- Aplicou filtro no fallback yt-dlp (último recurso)

### `src/utils/resolver.ts`
- Importou o filtro de covers
- Aplicou filtro no fallback yt-dlp (último recurso)

## Como Funciona

### Exemplo 1: Query SEM "cover"
```
Query: "slipknot psychosocial"

Resultados do YouTube:
1. ✅ Slipknot - Psychosocial Official Video
2. 🚫 Slipknot - Psychosocial (Cover) [FILTRADO]
3. 🚫 Slipknot - Psychosocial [Metal Cover] [FILTRADO]
4. 🚫 Psychosocial - Banjo Cover [FILTRADO]

Resultado final: 1 vídeo (apenas o original)
```

### Exemplo 2: Query COM "cover"
```
Query: "slipknot psychosocial banjo cover"

Resultados do YouTube:
1. ✅ Slipknot - Psychosocial Official Video
2. ✅ Slipknot - Psychosocial (Cover)
3. ✅ Slipknot - Psychosocial [Metal Cover]
4. ✅ Psychosocial - Banjo Cover

Resultado final: 4 vídeos (todos mantidos)
```

## Testes

Execute o teste com:
```bash
npm run build
node test_cover_filter.js
```

O teste verifica:
- ✅ Detecção de covers em títulos
- ✅ Detecção de intenção do usuário
- ✅ Filtragem correta de resultados

## Padrões Detectados

O filtro detecta os seguintes padrões (case-insensitive):
- `cover`, `covers`
- `[cover]`, `(cover)`
- `metal cover`, `acoustic cover`, `piano cover`, `guitar cover`
- `banjo cover`, `drum cover`, `vocal cover`
- `instrumental cover`
- `karaoke`
- `tribute`
- `in the style of`

## Notas Técnicas

1. **Performance**: O filtro é aplicado APÓS a busca, não antes, para não afetar a query do YouTube
2. **Fallback seguro**: Se não houver título, o vídeo é mantido por segurança
3. **Logs**: O filtro registra no console quando filtra um vídeo
4. **Integração**: Funciona em todos os métodos de busca (API, yt-dlp, Piped)

## Próximos Passos (Opcional)

Se quiser expandir o filtro no futuro:
- Adicionar mais padrões de detecção (ex: "versão", "versão cover")
- Permitir configuração por servidor (alguns podem querer covers)
- Adicionar comando para alternar filtro on/off
- Detectar idioma e adicionar padrões em outras línguas
