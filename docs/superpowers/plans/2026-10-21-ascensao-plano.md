# Modo Ascensão — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quarto modo de partida, `ascension`: 9 rodadas fixas, XP do mago, 1 entre 3 cartas por nível no intervalo, pontos por colocação, recuperação para quem fica atrás.

**Architecture:** toda a regra mora em `src/shared/ascension.ts` (funções puras sobre um estado `AscState` guardado em `m.asc`, que vai junto com a sala na hibernação). O intervalo reaproveita a fase `shop` (votação, `skipShop`, `setReady` e o laço da sala continuam valendo); `match.ts`, `protocol.ts`, `room-do.ts` e `ui.ts` ganham só ganchos curtos do tipo `if (m.mode === 'ascension') return asc.algo(...)`. A tela mora em `src/client/ascension-ui.ts`.

**Tech Stack:** o do projeto (TypeScript, Vitest, Three.js, Cloudflare Workers). Nada novo no `package.json`.

**Spec:** `docs/superpowers/specs/2026-10-19-ascensao-design.md` (com a decisão de 21/10: magias sem rebalancear).

## Revisão do spec contra o código de 21/10

O que entrou no master desde o desenho (19/10) e muda o plano:

| Mudança no master | Efeito no Ascensão |
|---|---|
| `'pick'` já é a mensagem de escolher personagem (`protocol.ts:25`) | A carta usa `{ t: 'card' }` |
| Grupos de magia só no cliente, por idioma (`SPELL_GROUPS` em `rules-text.ts:351`) | Fase 1 move as listas de ids para `spells.ts` (`SPELL_GROUP_IDS`); `rules-text.ts` passa a montar os nomes em cima delas |
| Sala contra bots sem escolha de magias dos bots (#155) | Nada a esconder na sala; o `setup` dos bots só existe no sandbox e nos desafios, que não usam o Ascensão |
| Sandbox novo (#159) | Fora do Ascensão: `startMatch` com `sandbox` ignora o modo `ascension` (fica `rounds`) |
| Animações KayKit com gesto por magia (#143) | Nada: as cartas só dão magias que já existem, todas com gesto |
| S cancela a magia (#154) | Nada: regra da simulação, igual em todos os modos |
| `dialog()`, `iconButton()`, `searchFilter()` (#119, #127, #136) | A tela das cartas usa `dialog()` e `iconButton()`; não cria overlay próprio |
| Fluxo sem `dev` geral: PR direto para o `master`, ambiente por PR (#131, #74) | Cada fase é um PR para o `master`, testado no ambiente do PR |
| `botShop` sorteia com `Math.random` | A escolha de carta dos bots recebe o `rand` da partida |
| Plano da Campanha: "o motor de cartas nasce no Ascensão" | A Fase 1 exporta `drawCards`/`applyCard`; não cria nada a mais só para a Campanha |

**Crédito de abate por controle (Fernando, 21/10):** Troca, Agarrar e Magnetizar não marcam `lastHitBy` hoje (só `hit()` marca, `sim.ts:412`), então quem derruba alguém na lava só com controle não leva o abate. Decidido que passam a contar **em todos os modos**: issue #179, fora deste plano (muda o hash de `style.test.ts` de propósito, nesse PR e só nele). O Ascensão não cria gancho para isso; o XP por abate já herda.

Já existe e é reusado (não recriar): `stats.round.dmg/kills/alive` (fontes de XP), o evento `{ k: 'death', id, by }` (`sim.ts:131`, ordem de queda e abates), `BOUNTY` (modelo da recompensa pelo líder), `MAX_SPELLS`/`MAX_ITEMS`, `priceOf`/níveis de `spells.ts` e `items.ts`.

## Global Constraints

- **Os outros modos não mudam:** `tests/style.test.ts` passa **sem regravar o hash** em todo PR. Todo código novo fica atrás de `m.mode === 'ascension'` ou de campo opcional (`m.asc`, campos `?` no `PublicPlayer`).
- **Magias sem rebalancear (Fernando, 21/10):** nenhum número de `spells.ts` ou `items.ts` muda. O simulador só ajusta constantes de `ascension.ts` (XP, curva, pontos, peso de sorteio, raridade).
- Sorteio só com o `rand` recebido; nunca `Math.random` em `ascension.ts`.
- Mensagem nova validada em `parseClientMessage` (objeto reconstruído, `null` na dúvida).
- Números iniciais como constantes nomeadas em `ascension.ts`, com comentário "inicial, a medir".
- Texto visível com `t('pt', 'en')`; DOM com `el()`, `dialog()`, `iconButton()`; cores de grupo pelas classes `.g-*` (`src/client/CLAUDE.md`).
- Gates em todo commit: os dois `tsc`, `vitest run`, `vite build`. Commits em português.
- Decisão nova do Fernando vai para o Registro de decisões do `CLAUDE.md` no mesmo PR.

## Review Focus

- Sala hiberna no intervalo do Ascensão e volta → `m.asc` (XP, níveis, ofertas, pontos) igual; teste `resume keeps ascension state` (Task 1.3).
- Humano desconecta com escolhas pendentes ou o tempo do intervalo acaba → todas as escolhas resolvidas pela carta de cima / pelo bot, a rodada começa; teste `shop timeout resolves pending picks` (Task 1.3).
- Barra cheia (6 magias) e carta de magia nova sem `swap` → recusada; com `swap` de magia que não tem → recusada (Task 1.2).
- Votação troca o modo para/de Ascensão no meio da partida → reinicia a partida, `m.asc` zera (Task 1.3).
- Mensagem `card` fora do Ascensão ou fora da fase `shop` → ignorada, sem erro (Task 1.3).

---

## Fase 1 — motor (issue "Ascensão 1/3: motor do modo")

Sem tela nova: joga-se pela sala com bots e pelo teste. PR sem mudança visível nos modos atuais → mescla com gates e CI verdes, sem aba de teste (regra de 21/10).

### Task 1.1: grupos de magia no shared

**Files:** Modify `src/shared/spells.ts`, `src/client/rules-text.ts:330-351`. Test: `tests/ascension.test.ts` (novo).

**Interfaces — Produces:** `export const SPELL_GROUP_IDS: Record<'attack' | 'mobility' | 'defense' | 'control', SpellId[]>` e `export function spellGroup(s: SpellId): keyof typeof SPELL_GROUP_IDS`.

- [ ] Teste `every spell has exactly one group`: cada id de `SPELL_IDS` aparece em um grupo só.
- [ ] Mover as listas de ids de `SPELL_GROUPS_PT/EN` para `SPELL_GROUP_IDS`; `rules-text.ts` monta as tuplas (nome, frase) em cima delas. `vitest run` e os `tsc` verdes, hash igual.
- [ ] Commit `refactor: grupos de magia no shared para o sorteio do Ascensão`.

### Task 1.2: `ascension.ts` — XP, níveis, cartas

**Files:** Create `src/shared/ascension.ts`. Test: `tests/ascension.test.ts`.

**Interfaces — Produces:**
```ts
export type Card = { kind: 'spell'; id: SpellId } | { kind: 'up'; id: SpellId } | { kind: 'item'; id: ItemId };
export type CardOffer = { cards: Card[]; rare: boolean };
export type AscState = { xp: Record<string, number>; level: Record<string, number>; picks: Record<string, number>; offer: Record<string, CardOffer | null>; points: Record<string, number>; fallen: string[]; dmg: Record<string, number> };
export const ASC_ROUNDS = 9;
export function newAsc(ids: string[]): AscState;
export function xpGain(s: Stat, kills: number): number;            // dano, abates, segundos vivo
export function levelOf(xp: number): number;                         // curva
export function drawCards(p: Player, rand: () => number, rare: boolean): Card[];
export function applyCard(p: Player, card: Card, swap?: SpellId): boolean;
```

- [ ] Testes: `drawCards same seed same cards`; `drawCards gives 3 distinct cards from at least 2 groups` (item conta como grupo); `drawCards never offers up for a spell at max level nor a new spell already owned`; `applyCard new spell enters at level 1`; `applyCard full bar needs swap` (sem `swap` → `false`; `swap` de magia que não tem → `false`; com `swap` válido troca); `applyCard up raises one level`; `applyCard repeated item raises its level`; `levelOf is monotonic`.
- [ ] Implementar. Números iniciais: XP = 1 por ponto de dano + `KILL_XP` por abate + `ALIVE_XP` por segundo vivo; curva calibrada para ~1,5 nível por rodada com 4 magos. Rara = `up` de 2 níveis (escolha do builder registrada no PR). Empurrão fica fora do XP na 1ª versão (a simulação não mede empurrão causado; o abate já premia).
- [ ] Commit `feat: motor de XP e cartas do Ascensão`.

### Task 1.3: ganchos na partida, protocolo e sala

**Files:** Modify `src/shared/match.ts` (`MODES`, `Match.asc?`, `startMatch`, `enterShop`, `buy`/`buyItem`/`sell`/`undoBuy`/`canShop`, `endRound`, `afterRound`, `goalOf`, `stepMatch`, tratamento do evento `death`), `src/shared/protocol.ts` (`ClientMsg`, `parseClientMessage`, `PublicPlayer`), `src/worker/room-do.ts`. Test: `tests/ascension.test.ts`.

**Interfaces — Produces:**
```ts
// match.ts
export const MODES = ['rounds', 'deathmatch', 'teams', 'ascension'] as const;
export function pickCard(m: Match, id: string, i: number, swap?: SpellId): boolean;
// protocol.ts
| { t: 'card'; i: 0 | 1 | 2; swap?: SpellId }
// PublicPlayer (só no Ascensão): xp?: number; level?: number; nextXp?: number; picks?: number; offer?: CardOffer | null; points?: number
```

- [ ] Testes: `ascension match lasts 9 rounds` (bots, semente fixa, `m.phase === 'end'` após a rodada 9 e não antes); `placement points follow fall order` (último vivo leva mais; ordem pelos eventos `death`); `tie broken by total damage`; `start gives fireball, scourge and one pick`; `shop is closed in ascension` (`buy`, `buyItem`, `sell` devolvem `false`; ouro não muda); `no chests in ascension` (`opts.chests` forçado `false`); `bots pick with match rand`; `shop timeout resolves pending picks`; `resume keeps ascension state`; `mode vote to ascension restarts match`; `card message parses and rejects bad i/swap`; `card outside ascension is ignored`.
- [ ] Teste de guarda: `style.test.ts` sem mudar o hash.
- [ ] `ui.ts`: `MODE_NAME` ganha `ascension` (o tipo exige), mas o modo fica fora das duas `choice` de modo (sala e votação) até a Fase 2, para o PR não mudar nada visível.
- [ ] Implementar os ganchos (cada um 1 a 3 linhas chamando `ascension.ts`). Bots desta fase escolhem a carta 0 do sorteio (ao acaso por construção; Normal/Difícil na Fase 3).
- [ ] `CLAUDE.md`: Registro de decisões (magias sem rebalancear, 21/10) e Mapa do código com `ascension.ts`. `README.md`: o modo existe, ainda sem tela.
- [ ] Commit `feat: modo Ascensão jogável na sala com bots (sem tela)`.

---

## Fase 2 — tela (issue "Ascensão 2/3: tela das cartas e do XP")

Depende da Fase 1 (usa `PublicPlayer.offer/picks/xp/level/nextXp/points` e a mensagem `card`). Muda a tela → aba de teste no ponto da escolha de cartas e "aprovado" do Fernando.

### Task 2.1: escolha de cartas no intervalo

**Files:** Create `src/client/ascension-ui.ts`. Modify `src/client/ui.ts` (gancho onde a loja abre), `src/client/main.ts` (envio de `card`), `src/client/style.css`. Test: `tests/ui-data.test.ts` ou `tests/ascension-ui.test.ts`.

**Interfaces — Produces:** `export function cardPicker(me: PublicPlayer, send: (i: 0 | 1 | 2, swap?: SpellId) => void): HTMLElement` (no lugar da loja quando `room.mode === 'ascension'`).

- [ ] Testes: `card text names spell and level` (pt/en); `picker shows remaining picks`; `full bar asks which spell to swap`.
- [ ] 3 cartas com ícone existente, cor de grupo (`.g-*`), item prateado, borda de raridade; "Escolha 1 de N"; troca de magia com a barra cheia via `dialog()`.
- [ ] Commit `feat: tela de escolha de cartas do Ascensão`.

### Task 2.2: XP, pontos e sala

**Files:** Modify `src/client/ascension-ui.ts`, `src/client/ui.ts` (`MODE_NAME`, as duas `choice` de modo ~1135 e ~1352, `optText('goal')`, opção Baús escondida), `src/client/rules-text.ts` (texto do modo em `MODE_INFO`).

- [ ] Testes: `mode name and info in pt and en`; `goal shows 9 rounds in ascension`; `chests option hidden in ascension`.
- [ ] Barra de XP e nível no HUD; pontos na lista de jogadores da esquerda; fim de partida com o placar de pontos.
- [ ] Prints de antes/depois em `docs/review/ascensao/`; `README.md` e `docs/GUIA-COLABORADOR.md`.
- [ ] Commit `feat: XP, pontos e modo Ascensão na sala`.

---

## Fase 3 — recuperação, bots e balanceamento (issue "Ascensão 3/3: recuperação, bots e simulador")

Depende da Fase 1; pode correr junto com a Fase 2 (arquivos diferentes, exceto a marca do líder, que entra no `ascension-ui.ts` depois da Fase 2).

### Task 3.1: os 4 mecanismos de recuperação

**Files:** Modify `src/shared/ascension.ts`, gancho em `match.ts` (abate e fim de rodada), `src/shared/sim.ts` só para o empurrão extra no líder (campo opcional `kbTaken?` no `Wizard`, ausente fora do modo). Test: `tests/ascension.test.ts`.

- [ ] Testes: `killing the leader gives extra xp by level gap`; `below average gets +25% xp per level below`; `behind the leader gets rare chance and one reroll`; `marked leader takes +5% knockback per level above second`; `catch-up off in other modes` (hash igual).
- [ ] Implementar com os números iniciais do spec (tabela Recuperação). Novo sorteio: mensagem `{ t: 'reroll' }` validada no protocolo (uma vez por intervalo, só para quem está atrás); botão na tela da Fase 2.
- [ ] Commit `feat: recuperação do Ascensão`.

### Task 3.2: bots por dificuldade

**Files:** Modify `src/shared/ascension.ts` (`botPick(p, offer, skill, rand): number`), Create `src/shared/ascension-strength.json` (gerado), Modify `scripts/balance-sim.ts` (gera a tabela com `--asc-strength`). Test: `tests/ascension.test.ts`.

- [ ] Testes: `easy bot picks at random`; `normal bot fills missing defense or mobility first`; `hard bot prefers stronger cards but not always` (1000 sorteios: a mais forte vence a maioria e não todas).
- [ ] Commit `feat: bots escolhem cartas do Ascensão pela dificuldade`.

### Task 3.3: simulador e critérios

**Files:** Modify `scripts/sim-lib.ts` (modo por parâmetro, sem mudar o sorteio dos outros modos), `scripts/balance-sim.ts` (corte `ascension`, métricas: duração da rodada, mortes por golpe, vitória do líder da rodada 3, taxa de escolha por carta).

- [ ] Rodar e ajustar só constantes de `ascension.ts` até: rodada média 60 a 120 s; ≥ 60% das mortes por golpe; líder da rodada 3 vence 25% a 50%; nenhuma carta acima de 40% de escolha com bots Normais.
- [ ] Relatório no PR com os números antes/depois; carta que precise sair do sorteio ou número de magia → pergunta ao Fernando, não muda.
- [ ] Commit `balance: números iniciais do Ascensão pelo simulador`.

---

## Depois das 3 fases

- 2ª leva (Aumentos) é outra issue, com decisão própria.
- A Campanha (Task 2 do plano dela) usa `drawCards`/`applyCard` daqui.
