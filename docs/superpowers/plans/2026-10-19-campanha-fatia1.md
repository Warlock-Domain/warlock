# Campanha — plano da fatia 1 (Charneca Cinzenta + Sir Odran)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** modo Campanha jogável na `lucascvalle-dev`: 1 a 4 Acesos, classe com passiva e árvore, cartas no intervalo, Estágio 1 gerado por semente (clareiras com ondas de servos) e Sir Odran no fim; reacender aliado; noite perdida ou vencida.

**Architecture:** a Campanha é um modo de `match.ts` que **reusa as fases** que existem (`shop` = Santuário/intervalo com cartas, `countdown`/`playing`/`roundEnd` = clareira, `end` = fim da noite), então o cliente e a sala continuam funcionando sem fase nova. Inimigos são `Player`s bot com `role` (o cliente liga cada mago do mundo a um `Player` por `room.ids`), em vagas fixas `fumo-1…fumo-n` (n = `MAX_PLAYERS` − humanos) que renascem a cada onda. A noite é gerada por um sorteio próprio derivado de `m.night.seed`, sem estado (sobrevive à hibernação da sala). Regras novas da simulação ficam atrás de campos opcionais do `Wizard` (`heavy`, `ember`, passivas), que só a Campanha liga.

**Tech Stack:** o do projeto (TypeScript, Vitest, Three.js, Workers). Nada novo no `package.json`.

**Spec:** `docs/superpowers/specs/2026-10-19-campanha-design.md`

## Global Constraints

- Branch de cada PR a partir de `dev`; PR para `dev`; título `feat: …`; os 4 gates verdes em todo commit.
- **Os outros modos não mudam:** `tests/style.test.ts` (hash da partida com semente 7) tem que passar **sem regravar** em todos os PRs. Todo código novo fica atrás de `m.mode === 'campaign'` ou de campo opcional ausente fora dela.
- Sorteio da noite só por `nightRand(seed, stage, clearing)`; o `rand` da sala continua sendo usado só pela simulação, na mesma ordem.
- Todo texto visível com `t('pt', 'en')`; textos da Campanha em `src/client/campaign-text.ts` (pares `_PT`/`_EN`).
- Mensagem nova validada em `parseClientMessage` (devolve `null` na dúvida, objeto reconstruído).
- Números iniciais do desenho (vida, resistência, XP, passivas) entram como constantes nomeadas em `src/shared/campaign.ts` com comentário "inicial, a medir"; nenhum número de magia ou item muda.
- Celular: toda tela nova conferida em 390×844 e `pointer: coarse`.

## Review Focus

- Partida de Rodadas/Deathmatch/Times com semente idêntica antes e depois → hash do `style.test.ts` igual (Task 1 em diante).
- Mesma semente gera a mesma noite; rerun gera outra → teste `same seed same night` na Task 1.
- Sala hiberna no meio da noite (persist sem `World`) e volta: a clareira atual recomeça do intervalo, a noite continua → teste `resume mid-night` na Task 1.
- Humano desconecta no meio da clareira: o bot joga por ele (como hoje) e ele não vira inimigo → teste na Task 1.
- Mensagem `card` fora do intervalo, índice fora de 0..2, ou `class` no meio da clareira → `null` / ignorada (Task 2).
- Todos os humanos viram brasa no mesmo passo → noite perdida, sem travar (Task 3).
- Chefe empurrado para a lava várias vezes seguidas não morre na lava nem fica preso fora da pedra (Task 4).

---

### Task 1 (PR 1): modo Campanha, noite gerada, servos em ondas

**Files:**
- Create: `src/shared/rng.ts` (`mulberry32` movido de `scripts/sim-lib.ts`, que passa a importar daqui)
- Create: `src/shared/campaign.ts`
- Modify: `src/shared/match.ts`, `src/shared/protocol.ts`, `src/shared/sim.ts` (só exportar `respawn` como `spawnAt`), `src/worker/room-do.ts` (nada além do `start` já aceitar o modo)
- Modify (cliente): `src/client/ui.ts` (modo na sala), `src/client/main.ts` (`hpMax` do `PublicPlayer`), placar/pódio escondem `role`
- Test: `tests/campaign.test.ts`

**Interfaces:**
- `rng.ts`: `mulberry32(seed: number): () => number`; `nightRand(seed: number, stage: number, clearing: number): () => number` (hash simples dos três)
- `campaign.ts`:
  - `type ServoKind = 'ash' | 'archer' | 'brute' | 'acolyte'` com `SERVOS: Record<ServoKind, { look: string; hp: number; spells: Partial<Record<SpellId, number>>; skill: 'easy' | 'normal' }>`
  - `type Clearing = { arena: ArenaId; pillars: number; fragment: boolean; waves: ServoKind[][]; boss?: BossId }`
  - `type StagePattern = { id: 'charneca'; clearings: [min: number, max: number]; arenas: Partial<Record<ArenaId, number>>; pillars: [number, number]; obstacles: ObstacleKind[]; shrinkEvery: number; waves: ServoKind[][][]; bosses: BossId[] }`
  - `STAGES: StagePattern[]` (só a Charneca nesta fatia)
  - `generateStage(seed: number, stage: number): Clearing[]` (último item = arena do chefe)
  - `type Night = { seed: number; stage: number; clearing: number; plan: Clearing[]; wave: number; result: 'won' | 'lost' | null }`
- `match.ts`:
  - `MODES` ganha `'campaign'` **no fim** da lista
  - `Player.role?: 'servo' | 'boss'`, `Player.hpMax?: number` (público, para a barra), `Match.night?: Night`
  - `startMatch(..., mode='campaign')`: sorteia `night.seed` (com o `rand` recebido), aceita 1 humano, cria as vagas `fumo-k` (bot, `team: 1`, look de esqueleto, `role: 'servo'`); humanos `team: 0`; sem baús, sem ouro
  - `enterCountdown` (ramo campanha): arena, pilares e encolhimento da clareira atual; vagas da 1ª onda vivas na borda, as outras mortas com `respawnAt = Infinity`
  - `stepMatch` (ramo campanha): onda acabou (servos vivos = 0) → próxima onda nas vagas mortas (`spawnAt` na borda, vida e magias do tipo); última onda acabou → `endRound`; humanos vivos = 0 → `night.result = 'lost'`, fase `end`
  - `afterRound` (ramo campanha): avança `night.clearing`; passou da última → `night.result = 'won'` (nesta fatia, vencer o estágio 1 encerra a noite)
  - `resume`: com `night`, volta para o intervalo da clareira atual
- `protocol.ts`: `start.mode` aceita `'campaign'`; `PublicPlayer` ganha `role`, `hpMax`; `PublicRoom` ganha `night` (sem `plan` inteiro: só estágio, clareira, total, onda, resultado, `fragment` da atual)

- [ ] **Step 1:** mover `mulberry32` para `src/shared/rng.ts`; `scripts/sim-lib.ts` importa; gates verdes (nada mudou).
- [ ] **Step 2: testes que falham** em `tests/campaign.test.ts`: `same seed same night` (`generateStage(42, 0)` igual duas vezes; `generateStage(43, 0)` diferente); `stage has 2 to 3 clearings and ends in boss arena`; `campaign starts with one human and enemy slots on team 1`; `first wave alive, later waves wait`; `next wave spawns when wave is cleared`; `clearing ends when last wave is cleared`; `all humans down loses the night`; `last clearing won ends the night won`; `resume mid-night returns to the interval`; `disconnected human is played by bot on team 0`; `enemies are hidden from scoreboard data` (função pura em `screen-data.ts`).
- [ ] **Step 3:** `npx vitest run tests/campaign.test.ts` → FAIL.
- [ ] **Step 4:** implementar `campaign.ts` e os ramos em `match.ts`; exportar `spawnAt` de `sim.ts` (o `respawn` atual vira `spawnAt` + a escolha de ponto, sem mudar a ordem dos sorteios).
- [ ] **Step 5:** testes PASS; `npx vitest run tests/style.test.ts` PASS **sem regravar**; os 4 gates.
- [ ] **Step 6:** cliente: "Campanha" no seletor de modo da sala (texto em `t()`); barra de vida usa `p.hpMax ?? HP_MAX + itens`; placar, pódio e telemetria ignoram `role`. Prints PC e celular, pt e en.
- [ ] **Step 7:** push na `lucascvalle-dev`, jogar uma noite com servos; PR `feat: modo Campanha com noite gerada por semente e ondas de servos`.

### Task 2 (PR 2): classes e cartas

**Files:**
- Create: `src/shared/cards.ts` (motor de cartas que o Ascensão também usa: genérico, sem nada da Campanha)
- Modify: `src/shared/campaign.ts` (classes, árvores, passivas, XP), `src/shared/match.ts`, `src/shared/protocol.ts`, `src/shared/sim.ts` (passivas), `src/worker/room-do.ts`
- Modify (cliente): seletor de classe na sala; tela das 3 cartas no intervalo; barra de XP
- Test: `tests/cards.test.ts`, `tests/campaign-classes.test.ts`

**Interfaces:**
- `cards.ts`:
  - `type Card = { kind: 'spell'; id: SpellId } | { kind: 'up'; id: SpellId } | { kind: 'item'; id: ItemId }`
  - `type Deck = { spells: SpellId[]; items: ItemId[]; maxSpells: number; maxLevel: number }`
  - `drawCards(p: { spells; items }, deck: Deck, rand): Card[]` — 3 cartas sem repetir, ≥ 2 tipos quando possível
  - `applyCard(p, card): boolean`
  - `levelOf(xp: number): number` e `XP_CURVE` (inicial, a medir)
- `campaign.ts`: `CLASS_IDS = ['warrior', 'archer', 'mage', 'warlock', 'rogue', 'wanderer'] as const`; `CLASSES: Record<ClassId, { look: CharacterId; deck: Deck; passive: Passive }>`; `type Passive = Partial<Pick<Wizard, 'kbResist' | 'rangeF' | 'lifesteal' | 'regen'>> & { speedMult?: number; dmgMult?: number; shade?: { calm: number; speed: number; kb: number } }`; `campaignXp(e: SimEvent, ...)`
- `match.ts`: `Player.cls?: ClassId`, `Player.xp`, `Player.offer: Card[] | null`, `Player.picks: number`; `setClass(m, id, cls)` (lobby, `shop` da 1ª clareira); `pickCard(m, id, i)`; fase `shop` da campanha termina quando nenhum humano tem `picks` (ou tempo, com escolha automática da carta de cima); bot/desconectado escolhe na hora
- `sim.ts`: passivas aplicadas por `fitClass(z, passive)` depois do `gearOf` (só campos que existem) + duas regras pequenas: `dmgMult` das magias de ataque do dono e `shade` (mesmo relógio `calmSince` das Botas de vento)
- `protocol.ts`: `{ t: 'class'; cls: ClassId }`, `{ t: 'card'; i: 0 | 1 | 2 }`; `PublicPlayer` com `cls`, `xp`, `offer`, `picks` (só os seus? não: cartas dos aliados visíveis, é co-op)

- [ ] **Step 1: testes que falham:** `draws 3 distinct cards`, `cards cover 2 kinds when possible`, `deck filters spells by class`, `wanderer has 7 slots and max level 5`, `applying up raises level`, `item card stacks like the shop`, `same rand same draw`; `each class has look, deck, passive and texts in pt and en` (completude, como `ui-data`); `warrior passive reduces knockback`; `archer passive extends range`; `rogue shade speeds up after calm`; `card message outside interval is ignored`; `parseClientMessage rejects card index 3 and unknown class`.
- [ ] **Step 2:** FAIL → implementar → PASS; `style.test.ts` sem regravar; gates.
- [ ] **Step 3:** cliente: seletor de classe com `choice(...)` e `withTip` mostrando passiva e árvore; tela de cartas com os ícones e cores de grupo existentes (itens prateados); barra de XP fina sob a barra de magias. Prints.
- [ ] **Step 4:** PR `feat: classes dos Acesos e cartas na Campanha`.

### Task 3 (PR 3): reacender

**Files:** `src/shared/sim.ts`, `src/shared/snapshot.ts`, `src/shared/match.ts`, `src/shared/campaign.ts` (`EMBER` constantes), cliente `scene.ts` (brasa com `public/fx/flame_*`) e `main.ts` (anel de progresso)
**Test:** `tests/ember.test.ts`

**Interfaces:**
- `World.coop?: boolean` (só a Campanha liga); `Wizard.ember?: { pos: Vec; prog: number; need: number; falls: number }`
- `sim.ts`: com `w.coop` e mago do time 0, morrer cria a brasa em `safeInside` do último ponto; aliado vivo a ≤ `EMBER.reach` soma `DT` em `prog`, longe zera; `prog ≥ need` → `spawnAt` no ponto da brasa com 50% da vida e `INVULN_TIME`, evento `{ k: 'rekindle', id, by }`; `need = EMBER.base + falls` (3, 4, 5…)
- `match.ts`: noite perdida passa a ser "nenhum humano vivo" (brasas não contam); na arena do chefe a brasa apaga depois de `EMBER.bossTimeout` s
- `snapshot.ts`: bit novo documentado em `bits` (brasa) e lista `em` = x, y, progresso, só quando existir

- [ ] **Step 1: testes que falham:** `falling leaves an ember on stone`, `ally standing near rekindles after 3 s`, `walking away resets progress`, `second fall needs 4 s`, `servants do not interrupt`, `all humans down in the same step loses the night`, `ember fades in boss arena after timeout`, `ember is off outside campaign` (mundo sem `coop`: morte igual a hoje).
- [ ] **Step 2:** FAIL → implementar → PASS; `style.test.ts` sem regravar; gates.
- [ ] **Step 3:** cliente: brasa na cena, anel de progresso sobre ela, som (`shield.mp3` ou `confirm.mp3`) ao reacender. Prints.
- [ ] **Step 4:** PR `feat: reacender aliado caído na Campanha`.

### Task 4 (PR 4): Sir Odran, o Elmo Vazio

**Files:**
- Create: `src/shared/bosses.ts`
- Modify: `src/shared/sim.ts` (`heavy`), `src/shared/match.ts` (vaga do chefe, `bossCmds` no lugar de `botCmds`), `src/shared/protocol.ts` (evento `say`, `tele`), cliente (barra do chefe no topo, marca no chão do golpe telegrafado, caixa de fala)
- Test: `tests/bosses.test.ts`

**Interfaces:**
- `bosses.ts`:
  - `BOSS_IDS = ['odran'] as const`
  - `BossProfile = { look: string; hp: number; kbResist: number; speedMult: number; spells: Partial<Record<SpellId, number>>; phases: { at: number; patterns: PatternId[]; summon?: ServoKind[] }[]; cls: ClassId }`
  - `type Brain = { phase: number; next: number; pattern: PatternId | null; fireAt: number; aim: Vec; target: string | null; switchAt: number }` guardado em `Wizard.brain?` (no mundo: determinístico e sem estado fora dele)
  - `bossCmds(w: World, id: string, rand): Cmd[]` — escolhe padrão, emite `{ k: 'tele', id, pattern, x, y, secs }` e só lança a magia em `fireAt`
  - Odran: `stomp` (Meteoro 4 no próprio pé, `secs` 1,2), `charge` (Investida 3 em linha, `secs` 0,8), `sweep` (Rajada 3 em leque, `secs` 0,6); fase 2 (60%): 2 `ash` pela borda; fase 3 (25%): `world.shrink` liga e `stomp` com `secs` 0,8
- `sim.ts`: `Wizard.heavy?: { lavaHit: number; stun: number }` — na lava, ramo irmão do `god`: `hp -= hpMax * lavaHit`, `toStone`, atordoado `stun` s, evento `{ k: 'smoke', id }`; morre só pela vida
- Falas: evento `{ k: 'say', id, line: 'intro' | 'order' | 'phase2' | 'phase3' | 'fall' }`; o texto vem de `campaign-text.ts` (`ODRAN_PT`/`ODRAN_EN`); `order` quando algum humano tem `cls === profile.cls`

- [ ] **Step 1: testes que falham:** `boss in lava takes 15% and returns to stone`, `boss does not die in lava`, `boss resists knockback`, `stomp is telegraphed before it lands` (evento `tele` antes do `cast`, `fireAt − t ≥ secs`), `boss switches to farthest every 12 s`, `phase 2 summons two ash at 60%`, `phase 3 starts shrinking at 25%`, `order line only with a warrior`, `same seed same fight` (dois mundos, mesmos eventos).
- [ ] **Step 2:** FAIL → implementar → PASS; `style.test.ts` sem regravar; gates.
- [ ] **Step 3:** cliente: barra do chefe com nome e fase; marca no chão durante `secs` (reusar `circle_05.png`); caixa de fala pulável (Esc ou toque) que nunca pausa o jogo. Prints PC e celular.
- [ ] **Step 4:** PR `feat: Sir Odran, chefe do estágio 1 da Campanha`.

### Task 5 (PR 5): Santuário, fragmentos e fim da noite

**Files:** `src/client/campaign-text.ts` (novo), `src/client/ui.ts`, `src/client/store.ts` (só usar), `src/shared/sim.ts` (fragmento reusa o monte de ouro: `loots` com `kind: 'lore'`), `src/shared/match.ts`
**Test:** `tests/campaign-text.test.ts`

- [ ] **Step 1: testes que falham:** `every Ilse line and fragment has pt and en`; `Ilse line advances with nights played` (função pura que escolhe a fala pelo contador); `lore pile reveals after 3 s and gives no gold`; `fragment clearing has exactly one lore pile`.
- [ ] **Step 2:** FAIL → implementar → PASS; gates.
- [ ] **Step 3:** cliente: fala da Ilse no intervalo (1 a 2 frases, botão pular); fragmento revelado para todos; tela de fim "A vela pingou" / "A Charneca respira", com estágio alcançado e quem caiu mais; contador local `warlock:campaign` por `store`.
- [ ] **Step 4:** atualizar `README.md` (modos), `docs/GUIA-COLABORADOR.md` (modos, mapa do código), `CLAUDE.md` (Mapa do código: `campaign.ts`, `cards.ts`, `bosses.ts`, `rng.ts`) e `src/shared/CLAUDE.md` (onde mexer para chefe e estágio novos).
- [ ] **Step 5:** PR `feat: Santuário da Cera, fragmentos e fim da noite`.

### Task 6 (PR 6): Campanha no simulador

**Files:** `scripts/balance-sim.ts`, `scripts/sim-lib.ts` (`playNight`)
- [ ] Bots no lugar dos humanos (grupo de 2 a 4, classes sorteadas ou fixas por `--class`), relatório: tempo do estágio, taxa de vitória do estágio por dificuldade e por classe, duração da luta do Odran, quedas dele na lava por luta, taxa de escolha por carta.
- [ ] Rodar até os critérios do desenho caberem (estágio 1 em 8 a 12 min; 60–80% Normal, 30–50% Difícil; classes ±15 pp; nenhuma carta > 40%). Ajustes só nas constantes de `campaign.ts`/`bosses.ts`, com a medição no PR.
- [ ] PR `balance: números iniciais da Campanha medidos no simulador`.

## Ordem e dependências

1 → 2 → (3 e 4 em paralelo) → 5 → 6. Cada PR fica jogável na `lucascvalle-dev` (`git push --force origin HEAD:lucascvalle-dev`) antes de ir para `dev`. A Task 2 cria o `cards.ts` genérico: avisar no PR que o Ascensão deve usá-lo.
