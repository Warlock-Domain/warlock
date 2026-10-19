# Warlock Wars — instruções para agentes de IA

Guia para quem trabalha neste repositório com Claude Code, Codex, Cursor ou outro agente. Também vale para humanos. `AGENTS.md` aponta para este arquivo.

Jogo no ar: https://warlock.fernandorffdev.com · remake web do mod **Warlock** (Warcraft 3 / Warlock Brawl do Dota 2). O público são jogadores de Dota: na dúvida de interface, siga o jeito do Dota.

## Mapa do código

```
src/shared/   lógica do jogo, roda igual no servidor e no navegador
  sim.ts        simulação (60 passos/s): magos, projéteis, lava, obstáculos, ilhas, runas
  spells.ts     as 25 magias (níveis, recarga, dano, empurrão); items.ts os itens
  bots.ts       bots (BOT_SKILL por dificuldade, decisão a cada pensamento)
  match.ts      partida: fases, loja, ouro, rodadas, votações, estatísticas
  protocol.ts   mensagens cliente↔servidor e a validação delas (fronteira de confiança)
  arena.ts      formatos de arena, borda, caminho dentro da pedra
  characters.ts personagens e o "look" de 7 peças (criador de personagem)
src/worker/   Cloudflare Workers + Durable Objects (uma sala por objeto; lobby.ts guarda a telemetria)
src/client/   navegador: main.ts (laço), scene.ts (Three.js), ui.ts (HUD, menus, loja), i18n.ts, grimoire.ts…
scripts/      balance-sim.ts (simulador de balanceamento), build-tournament.ts (torneio de compras), smoke.mjs
tests/        Vitest (lógica e funções puras do cliente)
docs/         auditorias, revisões de código e catálogos
```

## Comandos

```bash
npm install
npx wrangler dev                    # servidor + cliente em http://localhost:8787
npx tsc --noEmit -p .               # tipos do cliente e do compartilhado
npx tsc --noEmit -p src/worker      # tipos do servidor
npx vitest run                      # testes
npx vite build                      # build do cliente (dist/)
```

**Gates antes de qualquer commit:** os dois `tsc`, `vitest run` e `vite build`, todos limpos.

## Regras do código

- **Comentários curtos em português**, só onde ajudam; imports sempre no topo do arquivo.
- **Menos código vence:** reaproveite o que já existe (`el()` em icons.ts, `choice()`, `withTip`, `store`, `t()`), sem abstração para um uso só, sem configuração que ninguém pediu. Mudança cirúrgica: não reformate código vizinho.
- **Todo texto que o jogador vê sai nas duas línguas** com `t('português', 'English')` de `src/client/i18n.ts`. Nomes de magia/item/arena pelos helpers `spellName`, `itemName`, `arenaName`. Números com `LOCALE`.
- **Determinismo:** a simulação não pode usar `Math.random` solto nem mudar a ordem dos sorteios sem querer. `tests/style.test.ts` guarda um hash dos eventos de uma partida com semente: se ele mudar, você mudou o jogo. Só regrave o valor quando a mudança de jogabilidade for intencional.
- **Protocolo é fronteira de confiança:** toda mensagem nova é validada em `parseClientMessage` (tipos, limites, chaves conhecidas).
- **Celular continua usável:** confira as media queries (≤ 600 px e `pointer: coarse`) a cada mudança de interface.

## Balanceamento (como se decide número de magia e item)

- Os números vêm do simulador, não de opinião: `node scripts/balance-sim.ts --minutes 30 --seed 1 --difficulty normal --out balance/<pasta>` (vários processos com sementes diferentes; junte com `--merge`).
- O número que vale é a **vitória ajustada pelo ouro** (coluna "ajustada"; 1,00 = vence o justo). Faixa aceita: **0,85 a 1,15 no Normal e no Difícil**. Metas de diversão no relatório (rodada de 60 a 120 s, ≥ 60% das mortes por golpe).
- Quando um número não responde a mudanças, desconfie do bot: no Redirecionador, a recarga não mudava nada; o problema era o bot reagir perfeitamente.
- `build-tournament.ts` acha combinações de compra dominantes; relate, não ajuste sozinho.
- Mudança de balanceamento só entra depois de medida localmente com dados suficientes (dezenas de milhares de rodadas por dificuldade).

## Testar no navegador

Prints com Playwright headless contra `npx wrangler dev`; confira PC (1280×720 e 1920×1080) e celular (390×844) e as duas línguas (`localStorage.warlock:lang = 'pt' | 'en'`). `node scripts/smoke.mjs <url>` faz o teste rápido de uma sala de verdade.

## Git

Fluxo completo em [CONTRIBUTING.md](CONTRIBUTING.md): uma branch por tarefa a partir do `master` (`feat/`, `fix/`, `balance/`, `style/`, `docs/`, `refactor/`), commits em português com o tipo na frente (`feat: …`), pull request com o modelo de `.github/`, CI verde (`.github/workflows/ci.yml`: os dois `tsc`, `vitest`, `vite build`) e *squash and merge*. Agente: nunca dê push direto no `master` sem o dono pedir; abra PR.

## Publicar

Só quem tem a conta Cloudflare do projeto publica: `npx vite build && npx wrangler deploy`, depois confira que o `index-*.js` servido é o do `dist/` e rode o smoke no domínio. Contribuições de fora chegam por pull request.

## Créditos e licenças

Assets de uso livre (KayKit, Kenney, ambientCG, Poly Haven, OpenGameArt): lista em `public/CREDITS.txt`. Asset novo só com licença que permita uso e redistribuição, e com crédito no CREDITS.txt.
