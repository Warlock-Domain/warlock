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

## Decisões de produto (não desfazer sem combinar numa issue)

- Menu principal com 5 abas: Jogar · Magias e itens · Aprender · Personagem · Configurações. Menus enxutos.
- Loja em grade com o nome dentro do ícone e preço com moeda; cores por grupo (Ataque vermelho-laranja, Mobilidade verde, Defesa azul, Controle roxo, Itens prateado); 10 magias de ataque e 5 de cada outro grupo.
- Sala sem opção de ritmo nem de morte súbita (sempre ligada); dificuldade escolhida bot a bot.
- Baús: no máximo metade dos magos + 1 por rodada, nunca mais que 3. Escudo com recarga de 16 s. Drenar só muda depois de partidas reais. Ataques fortes e raros (não encurtar recargas).
- Recusados: ranking/perfil e itens que só ajudam uma magia específica.

## Registro de decisões do Fernando

Toda decisão nova entra aqui (data, decisão, porquê); se mudar o jeito de codar, também no `CLAUDE.md` da pasta afetada; se mudar o que o jogo tem ou como contribuir, também no `README.md` e no `docs/GUIA-COLABORADOR.md`. Tudo no mesmo PR da mudança. Cada pasta principal tem o seu (`src/shared`, `src/client`, `src/worker`, `scripts`, `tests`) com os padrões de código daquela área; o `AGENTS.md` de cada pasta aponta para ele.

| Data | Decisão | Por quê |
|---|---|---|
| 17/10 | Câmera de cima em 3D, controles do Dota (botão direito anda); 1 ponto por rodada, vence quem fizer 5 | igual ao Warlock original, público de Dota |
| 18/10 | Repositório público | amigos contribuírem |
| 18/10 | Recusados: ranking/perfil e itens que só ajudam uma magia (ex.: Cajado de fogo) | foco no jogo, build livre |
| 18/10 | Número de magia/item só muda depois de medido no simulador; justo no Normal **e** no Difícil (0,85 a 1,15); metas de rodada 60–120 s e ≥ 60% das mortes por golpe | balanceamento por dado, não por opinião |
| 18/10 | Bots em 3 dificuldades | jogar sozinho em qualquer nível |
| 19/10 | Sai Gêmeos, entra Ilusão: 10 magias de ataque, 5 de mobilidade, 5 de defesa, 5 de controle | grupos equilibrados |
| 19/10 | Escudo com recarga 16 s; Drenar espera partidas reais; Ilusão fica como está | resultado do torneio de compras |
| 19/10 | Balanceamento continua tendo a Bola de fogo como referência | todos têm de graça |
| 19/10 | Menu inicial com 5 abas; menus enxutos; loja em grade estilo Dota com cor por grupo; magias e itens numa tela de consulta (F2) | público de Dota, menos coisa na tela |
| 19/10 | Sala sem opção de ritmo (sempre Normal) nem de morte súbita (sempre ligada); dificuldade escolhida bot a bot | menos opção que ninguém entendia |
| 19/10 | Criador de personagem de 7 peças, com os 9 bonecos originais como atalho; troca até no meio da partida | visual próprio sem poluir a sala |
| 19/10 | Rocha vira **Barricada** | nome mais claro |
| 19/10 | Jogo em português e inglês | amigos de fora |
| 19/10 | Baús: no máximo metade dos magos + 1 por rodada, nunca mais que 3 | baú demais por rodada |
| 19/10 | Sandbox no Treino (vida e ouro sem fim, bots e boneco pelo painel) | testar magias e interações |
| 19/10 | `master` protegido (PR + CI + aprovação); revisão automática do Claude em todo PR; ambiente `<nome>-dev` por colaborador; guia do colaborador no repositório | entrada de colaboradores |
| 19/10 | Os `CLAUDE.md` (raiz e pastas) são atualizados a cada decisão nova | todo dev com o mesmo contexto do dono |
| 19/10 | PR passa pela revisão automática do Claude (comentário com veredito) e pode ser ajustado e mesclado pelo agente do dono, inclusive PR de colaborador; comente `@claude` num PR ou issue para pedir ajuda | mesclar rápido sem o dono revisar à mão |
| 19/10 | Cada colaborador tem um ambiente dev próprio (`<usuário do GitHub>-dev`, em minúsculas) publicado sozinho a cada push | testar com outras pessoas antes do PR, sem tocar no jogo no ar |
| 19/10 | Modo novo **Ascensão** (roguelike, estilo ARAM com cartas): XP do mago, a cada nível escolhe 1 entre 3 cartas (magia nova, subir magia, item) no intervalo; sem ouro, loja nem baús; Flagelo continua de graça; 9 rodadas com pontos por colocação; 4 mecanismos de recuperação; aumentos ficam para a 2ª leva. Desenho em `docs/superpowers/specs/2026-10-19-ascensao-design.md` | progressão dentro da partida sem decidir o jogo cedo |

## Fluxo com agente

Skills (plugins `superpowers@claude-plugins-official` e `ponytail@ponytail`): brainstorming antes de coisa nova → writing-plans para vários passos → TDD em `src/shared` → systematic-debugging antes de corrigir bug → verification-before-completion antes de dizer pronto → `/ponytail-review` no diff antes do PR. Guia completo do colaborador (máquina, prompts, testes, problemas comuns): [docs/GUIA-COLABORADOR.md](docs/GUIA-COLABORADOR.md).

Armadilhas: depois de `vite build`, reinicie o `wrangler dev` (senão página branca/404); trabalhe em branch deste repositório, não em fork (em fork o CI espera aprovação manual e a revisão automática não roda); push em `<nome>-dev` publica em `https://<nome>-dev-warlock.fernandorffdev.com`.

## Ambientes dev

Push na branch `<nome>-dev` publica em `https://<nome>-dev-warlock.fernandorffdev.com` (`.github/workflows/dev-deploy.yml`, Worker e salas próprios, teste rápido no fim). Trabalhe na sua branch de tarefa e traga para a sua `-dev` quando quiser testar com outras pessoas (`git push origin HEAD:<nome>-dev`, ou merge). O nome é o usuário do GitHub, em minúsculas. Colaborador novo ganha a branch dele aqui.

| Colaborador | GitHub | Branch | Link |
|---|---|---|---|
| Leonard | lboesmans | `lboesmans-dev` | https://lboesmans-dev-warlock.fernandorffdev.com |
| Branco | breakie33 | `breakie33-dev` | https://breakie33-dev-warlock.fernandorffdev.com |
| Lucas | lucascvalle | `lucascvalle-dev` | https://lucascvalle-dev-warlock.fernandorffdev.com |

## Balanceamento (como se decide número de magia e item)

- Os números vêm do simulador, não de opinião: `node scripts/balance-sim.ts --minutes 30 --seed 1 --difficulty normal --out balance/<pasta>` (vários processos com sementes diferentes; junte com `--merge`).
- O número que vale é a **vitória ajustada pelo ouro** (coluna "ajustada"; 1,00 = vence o justo). Faixa aceita: **0,85 a 1,15 no Normal e no Difícil**. Metas de diversão no relatório (rodada de 60 a 120 s, ≥ 60% das mortes por golpe).
- Quando um número não responde a mudanças, desconfie do bot: no Redirecionador, a recarga não mudava nada; o problema era o bot reagir perfeitamente.
- `build-tournament.ts` acha combinações de compra dominantes; relate, não ajuste sozinho.
- Mudança de balanceamento só entra depois de medida localmente com dados suficientes (dezenas de milhares de rodadas por dificuldade).

## Testar no navegador

Prints com Playwright headless contra `npx wrangler dev`; confira PC (1280×720 e 1920×1080) e celular (390×844) e as duas línguas (`localStorage.warlock:lang = 'pt' | 'en'`). `node scripts/smoke.mjs <url>` faz o teste rápido de uma sala de verdade. Scripts prontos: `node scripts/play-headless.mjs <url> <pasta-prints>` (uma rodada com prints), `long-headless.mjs`, `multi-headless.mjs` (3 pessoas). Usam o Chrome instalado (`PW_CHANNEL=chromium` para o Chromium do Playwright, depois de `npx playwright-core install chromium`) e um perfil temporário (`PW_PROFILE=<pasta>` para um fixo).

## Git

Fluxo completo em [CONTRIBUTING.md](CONTRIBUTING.md): uma branch por tarefa a partir do `master` (`feat/`, `fix/`, `balance/`, `style/`, `docs/`, `refactor/`), commits em português com o tipo na frente (`feat: …`), pull request com o modelo de `.github/`, CI verde (`.github/workflows/ci.yml`: os dois `tsc`, `vitest`, `vite build`) e *squash and merge*. Agente: nunca dê push direto no `master` sem o dono pedir; abra PR.

## Publicar

Só quem tem a conta Cloudflare do projeto publica: `npx vite build && npx wrangler deploy`, depois confira que o `index-*.js` servido é o do `dist/` e rode o smoke no domínio. Contribuições de fora chegam por pull request.

## Créditos e licenças

Assets de uso livre (KayKit, Kenney, ambientCG, Poly Haven, OpenGameArt): lista em `public/CREDITS.txt`. Asset novo só com licença que permita uso e redistribuição, e com crédito no CREDITS.txt.
