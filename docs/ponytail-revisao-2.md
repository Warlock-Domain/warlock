# Revisão ponytail 2 (19/10/2026, HEAD 7f48105, só leitura)

**Total estimado: ~205 linhas a menos de ~16 mil (faixa realista 150 a 205), sendo ~165 SEGURO e ~40 CUIDADO.** Menor que a primeira revisão (270) porque a duplicação mais fácil já saiu nos commits e9482b1, f4ef8c0 e 4caffdc; o código novo (ilhas, parede, runas, configurações, grimório, controle) é enxuto e o que sobra é, sobretudo, DOM montado à mão em 3 arquivos, o par `launch`/literais de projétil no `sim.ts` e utilitários espalhados.

Todas as linhas são do HEAD 7f48105. Há duas sessões editando a árvore agora (troca de Gêmeos por Ilusão mexe em `spells.ts`, `sim.ts`, `bots.ts`, `match.ts`, `snapshot.ts`, `scene.ts`, `main.ts`, `demo.ts`, `keys.ts`, `icons.ts`, `tips.ts`, `rules-text.ts`): as linhas podem andar, os trechos citados não mudam de natureza. Fora da conta: bots.ts de borda/ouro/duelo e tudo da magia Gêmeos. Não recontei o que a revisão 1 já lista (ver o último bloco).

Rótulos: **SEGURO** = não muda comportamento nem a ordem dos sorteios. **CUIDADO** = pode mudar texto, ordem de sorteio, dado salvo ou números.

---

## Achados por linhas economizadas

1. **`el()` preso em ui.ts** (−25, SEGURO)
   - scene.ts 693-725 (`makeMage`, ~33 linhas de `createElement` + `Object.assign`), 797-803 (`floatText`), 1264-1267, 1619-1621, 1653-1657, 1780-1783; opt-info.ts 68-91 (`infoButton`).
   - Problema: `el` mora em ui.ts:20, que importa scene.ts e opt-info.ts; eles não podem importá-lo (ciclo) e remontam o DOM na mão.
   - Mudança: mover `el` (12 linhas) para icons.ts (os dois já importam) e escrever `el('div', { class: 'hp' }, …)`. ui.ts, settings.ts e grimoire.ts passam a importar de lá.

2. **scene.ts, sobras** (−14, SEGURO)
   - `pillarMeshes[].dead` é código morto: 913, 1271, 1279 e o bloco `if (p.dead)` de 1972-1975 nunca roda (1282 já pôs `bar.hidden` no mesmo quadro). Apagar o campo e o bloco (−6).
   - 274 `FX.flame`/`FX.smoke` carregam as mesmas imagens de `FLAMES[0]`/`SMOKES[0]` (279-280): montar FLAMES/SMOKES antes e `flame: FLAMES[0]` (−2, e duas requisições a menos).
   - 1536-1538 três linhas iguais de `dispose` → `for (const o of [m.ring, m.shield, m.aura]) (o.material as THREE.Material).dispose()` (−2). Não trocar por `dispose(m.root)`: a geometria do modelo é compartilhada entre os clones.
   - 1625 refaz `(d.status & 1048576) > 0` que 1572 já calculou (−1).
   - 1286-1288 `if (m.bar && m.fill) { … }` com chaves para uma linha; `bar` e `fill` nascem juntos → `if (m.fill)` (−2).
   - `new GLTFLoader()` em 501, 897, 1164 (e decor.ts:63): uma instância só; 897 pode usar `loadModel('barrier_half')` (−1).

3. **sim.ts `cast()` e sorteios** (−13, SEGURO)
   - `(L.range / L.speed) * wz.rangeF` escrito em 591, 594, 596, 624, 626, 647, 655, 657. Calcular `flight` uma vez; `grip`, `snowball` e `magnetize` (595-596, 646-647, 654-655) viram um ramo só `launch(spell, dir, flight)` (−4).
   - `placePillars` 309-310 e 319-320 repetem `pickKind(rand())` + `out.push({ pos, hp: OBSTACLES[kind].hp, alive: true, kind })` → função interna `put(pos)`; mesma ordem de `rand()` (−3).
   - `respawn` 1390-1392 e `freeSpot` 1409-1411 sorteiam um ponto num disco com `a = rand()·2π`, `r = √rand()·R`, `v(cos, sin)` → `discPoint(rand, R)`; mesma ordem (−4).
   - Literais completos de `Projectile` em 604, 671, 1034, 1096, 1322 ao lado de `launch` (583): um `spawn()` com os campos padrão (id, born, target null, dmgMult, caster) (−2).

4. **grimório e demonstração** (−11, SEGURO)
   - grimoire.ts 28-44 (`arenaThumb`) e demo.ts 129-139 desenham a mesma pedra (mesmas cores `#2a0c06`, `#4a3a30`, `#ff6a1a`, `fill('evenodd')`, contorno): `drawStone(ctx, id, R, lineWidth)` em demo.ts, importado pelo grimório (−8).
   - grimoire.ts 177-178 e 201-202 repetem `per = wide.matches ? 2 : 1` e `first = at - (at % per)` → `const spreadAt = () => …` (−2).
   - demo.ts 183 `w.wizards.find(...)` duas vezes na mesma linha (−1).

5. **Grupos de botões `stats-tabs` copiados 5 vezes** (−10, SEGURO)
   - settings.ts 90-91 (`choice`) já é o helper; ui.ts 722-726 (sorteio dos times), 728-732 (modo), 737-742 (cada opção) e 896-897 (modo da próxima rodada) refazem o mesmo `div[role=group]` com `aria-pressed`.
   - Mudança: exportar `choice(label, itens, atual, escolher, desabilitado?)` de ui.ts e usar nos 5 lugares. O DOM final é idêntico.

6. **gamepad, settings e keys** (−10, SEGURO)
   - settings.ts 286 `isSettingsOpen` e 328 `toggleSettings`: nenhum uso em lugar nenhum (−2); 327 `const close = closeSettings` → renomear (−1).
   - gamepad.ts 232/239: `Math.hypot(mv.x, mv.y)` três vezes e `lastAim = {x: mv.x/h*0.7, …}` → `scale(norm(mv), 0.7)` do vec.ts; 26-31 `aimPoint` com `add/scale/norm` (−3).
   - gamepad.ts 215 e 262: `if (hit(BTN.START)) start()` nos dois ramos de `tick`; uma vez só depois deles (−1).
   - rules-text.ts 56-59 (`b`) e settings.ts 34 (`padName`) fazem o mesmo (nome Xbox e PlayStation, separador diferente): `padName(i, sep)` em keys.ts (−3).

7. **Comentários e dados que só contam história** (−9, SEGURO; ver também a seção de comentários errados)
   - constants.ts 283-284 (descrição velha das runas, contradiz 287-288) (−2); items.ts 49-53 (quatro linhas de histórico de balanceamento) e 56 (−4); sim.ts 598-599 (diz que sem ninguém o mago vai ao ponto da mira, 600 diz que vai à metade) (−2); spells.ts 121 (linha em branco dupla) (−1).

8. **sim.ts: um `land()`** (−8, SEGURO)
   - O padrão `if (!p.landed && p.owner === p.caster) push land; p.landed = true` repete em 875-876, 1051-1052, 1285-1286, 1295-1296; a forma curta `if (p.owner === p.caster) push land` em 821, 1033, 1066, 1313, 1321, 1326, 1334.
   - Mudança: `land(w, p, src, once = false)` (dono = lançador, e só uma vez quando `once`).

9. **main.ts, repetições locais** (−8, SEGURO)
   - 260-262 `names()` usado uma vez (`const who = names()`): inline (−3).
   - `interp.latest()?.wizards.find((z) => z.id === X)` em 302, 308 e 349-350 → `wizardOf(id)` (−3).
   - 294, 301, 305: `e.k === 'hit' && e.id === me && e.dmg > 0` calculado três vezes → uma constante por evento (−2).

10. **snapshot.ts `decodeSnap`** (−7, SEGURO)
    - 86-105: cinco laços com índice e passo à mão (`i * 7`, `i += 6`, `i + 3 < …`, `s.ru![i + 2]`) → `const rows = (a, n) => Array.from({ length: Math.floor((a?.length ?? 0) / n) }, (_, i) => a!.slice(i * n, i * n + n))` e um `.map` por lista. Sem `!` e sem `?? 0`.

11. **match.ts: `buy`/`buyItem` quase iguais** (−6, SEGURO)
    - 193-204 e 214-224: achar jogador, `canShop`, preço, ouro, `bought.push`, `held.push`. → `pay(m, id, key, preço)` que devolve o jogador, e cada função só sobe o nível. Mantém a ordem das checagens.

12. **match.ts, sobras** (−6, SEGURO)
    - 175 `p.bought ??= []` é morto (`enterShop` zera em 427); 174 `fillStats` em `fresh` já foi feito em `resume` e `addPlayer` (−2).
    - 536-543: o filtro `played.has` é feito três vezes antes de `inRound` (540) existir; subir `inRound` e usar nos três laços (−3).
    - 164 e 481-484: criar bot com nome sorteado do `BOT_NAMES` em dois lugares → `addBot(m, n)` (−1).

13. **Runas descritas em 4 lugares** (−6, CUIDADO: o texto que o jogador vê muda de palavra)
    - main.ts 264-272 (`RUNE_NAME`/`RUNE_EFFECT`), rules-text.ts 150-155 (`runa`), opt-info.ts 32-33, balance-sim.ts 64 (`RUNE_NAMES`). Mesmos números (`RUNE.haste`, `fury`, `armor`, `cdr`, `secs`), frases diferentes. → uma tabela `{ nome, efeito }` em rules-text.ts.

14. **Predicados repetidos** (−6, SEGURO)
    - "é magia?": `in SPELLS` (demo.ts 61, 79; icons.ts 43-44; ui.ts 228, 594), `SPELL_IDS.includes` (keys.ts 45, match.ts 248, protocol.ts 86). "é item ativo?": `(ACTIVE_ITEMS as string[]).includes` (input.ts 27, reach.ts 7, gamepad.ts 259), `ITEMS[x].key` usado só como booleano (grimoire.ts 68, tips.ts 92, ui.ts 852, 860, 861, 1079) e `ACTIVE_ITEMS.includes` (sim.ts 733, 752, protocol.ts 150).
    - Mudança: `isSpell(x)` em spells.ts e `isActive(x)` em items.ts, usados em todo lugar. Depois o campo `key: '1' | '2' | '3'` de items.ts 27-29 não serve a nada.

15. **scripts: o mesmo em dois** (−6, SEGURO)
    - balance-sim.ts 129-130 e build-tournament.ts 92-93: `f` e `pct` iguais → sim-lib.ts (−2). Validação da dificuldade em balance-sim.ts 37 e build-tournament.ts 27 (−1). sim-lib.ts 23-24 reconstrói `Player` e `SimEvent` que match.ts e sim.ts já exportam (−1). balance-sim.ts 103 e 109 `winners / n` duas vezes; 174 e 202 `deaths` com o mesmo `reduce` (−2).
    - scripts/*.mjs: portraits.mjs:4 importa `chromium` por fora de `scripts/lib/browser.mjs`; `IDS` de portraits.mjs:7 repete `CHARACTERS`; `fetch('/api/rooms', POST)` em play, long, multi, jitter; `addInitScript(... 'warlock:name:pw' ...)` em play e long. Um `newRoom(base)` e um `chromium` exportado em browser.mjs (≈ −2 a −3 linhas, conta no −6).

16. **bots.ts, sobras fora da borda/ouro/duelo** (−5, SEGURO)
    - 418 e 468: `s === 'shield' || s === 'swap'` e depois `else if (s === 'alteration') continue` → um `const DEFENSE = new Set(['shield','swap','alteration'])` (−1).
    - 405-406 `options[]` e `dmgOpt[]` em listas paralelas lidas por índice em 492 → `options: { run, dmg }[]` (−3).
    - 315 e 294: `w.pillars.filter(q => q.alive).map(...)` igual; calcular `avoid` uma vez no topo (−1; o 294 está no bloco da borda, só se esse bloco for mexido de qualquer jeito).
    - 139, 187, 269, 339 `w.wizards.find((z) => z.id === id …)`: `zOf(id)` local.

17. **decor, net, sound, lobby** (−9, SEGURO)
    - decor.ts 38 e 64 `models = new Map` duas vezes (−1); 113 `ready` devolvido e nunca lido (−1); `arrange` (52-53) e `update` (131-133) repetem `edge(p.pos) < 0.2 ? -1.5 : 0` + `visible` → `settle(edge, k)` com `k = 1` na primeira vez (−3).
    - net.ts 67 `status()` sem nenhum uso (−1).
    - sound.ts 21 `music.volume = 0.3` é sobrescrito em `syncAmbience` antes de tocar (−1); 22/76 guarda `gain` do `lava` e ninguém lê.
    - lobby.ts 37 e 42: `get('telemetry') ?? emptyTotals()` duas vezes → `totals()` (−2).

18. **sim.ts, miúdos** (−3, SEGURO)
    - 416 e 911: `shielded ? Math.max(0, z.shieldR - WIZ_R) : 0` → `bubble(w, z)` (416 ainda escreve `w.t < wz.shieldUntil` em vez de usar `shielded`) (−1). 1571-1572 `LAVA_DPS * DT * (1 - wz.lavaCut)` duas vezes (−1). 733 e 752: `ACTIVE_ITEMS.includes` checado em `beginCast` e de novo em `useItem` (só chamado por `fire`) (−1).

19. **ui.ts** (−6, SEGURO)
    - Guarda `e.repeat || e.ctrlKey || e.metaKey || target.tagName === 'INPUT'` copiada em ui.ts 113, 460, 501, 626 e input.ts 120, 128 → `typing(e)` em keys.ts (−3).
    - 1096 `tabPhase` refaz `TAB_PHASES.includes(r.phase)` (571) (−1); 713-715 `startBtn`: `disabled` na criação como em 761 (−1); 832 e 834 `o.key.replace('-', ':')` três vezes (−1).

20. **A regra "na lava" escrita em 5 lugares** (−3, SEGURO)
    - sim.ts 277 `inLava`; main.ts 351 e 489; scene.ts 1429 e 1584: `edgeAt(...) < margem && !onIsle(...)`. → `inLavaAt(arena, R, ilhas, p, margem = 0)` em arena.ts, e `inLava` do sim passa a chamá-la.

21. **Auxiliares do sim.ts reconstruídos fora** (−4, SEGURO)
    - `fixed(p)` (941) refeito em snapshot.ts 53 e bots.ts 398; `spellOf` (943) em demo.ts 143; `snowR` (1037) em demo.ts 154; `anyById`/`byId` em match.ts 190, 332, 513 e demo.ts 153, 183. Exportar `fixed`, `spellOf`, `snowR`.

22. **Pequenos** (−1 a −2, SEGURO)
    - arena.ts 45 e 52: `spawn` do círculo e do anel iguais (muda só o raio) → `onRing(i, n, r)` (−1).
    - spells.ts 33: `zip([...], [4.5 ×7])` para um valor constante → `duration: 2.25` (0 linhas, tira um vetor de 7 repetições).
    - `SPELLS[x].key` ('Q', 'W', …) não tem nenhum uso (os atalhos moram em keys.ts 15-19): apagar o campo dos 25 magos (−0 linhas, 25 campos mortos). Se preferir manter, derivar `DEFAULTS` dele (−4).

### CUIDADO (podem mudar dado salvo, texto ou sorteio) — soma ~−40 além do item 13

23. **keys.ts/ui.ts/main.ts: ouvintes e migrações** (−21)
    - ui.ts 459-478, 500-509, 572-588, 625-629: quatro `keydown` de `createRoomUi`, um por painel, com a mesma guarda → um ouvinte com `switch` (−6). A ordem de `preventDefault`/`stopImmediatePropagation` precisa ficar igual (o Esc do placar e do painel).
    - ui.ts 402-406 e 705-709: `sessionStorage` com try/catch → `store` (−5). Muda de "por aba" para "guardado no navegador".
    - main.ts 93-98: migração do silêncio da versão antiga (`warlock:mute`, `warlock:music`) (−4); some o efeito para quem nunca abriu o jogo depois de 18/10.
    - match.ts 290-313 (`resume`): oito `??=` de "salas gravadas antes de X" e a migração da maestria (`masteries`, 310-313). Sala vive no máximo 5 min sem gente e 3 min parada (room-do.ts 13-14), então só valem para salas ativas durante a publicação. Se aceitar o risco de uma sala em andamento quebrar na publicação, apagar as migrações com mais de um dia (−16).

24. **scene.ts: `/tex/stone.jpg` carregada 3 vezes** (−2, CUIDADO)
    - 323 (`loader.load`), 1160 (`tex(...)`) e decor.ts 57 baixam e decodificam a mesma imagem com `repeat`/`colorSpace` diferentes. Dividir uma textura e `clone()` para o `repeat` próprio.

---

## Comentários errados ou desatualizados

- constants.ts 283-284: runas "Pressa +40%, Escudo de runa absorve 100 de dano" — as duas linhas seguintes (287-288) e o código dizem Pressa +50% e Escudo −30% de dano levado.
- snapshot.ts 31: lista o bit `8 vulnerável (Redirecionador)`, que não existe mais (nenhum código liga o bit 8); 34: "Escudo de runa (com dano ainda a absorver)" — virou armadura de 30%.
- icons.ts 46: o ícone `vuln` do mesmo bit nunca é usado em `STATUS_ICONS`.
- spells.ts 47: Pilar de pedra "de 4 s"; o nível dá `duration: 5` (linha 48).
- sim.ts 598-600: duas linhas contam coisas diferentes (ponto da mira x metade do caminho); vale só a de 600.
- items.ts 56: "recarga 24 → 12 s" e 57 já diz que hoje é 20 s.
- gamepad.ts 70: "desliga no painel de teclas" — a vibração se desliga em Configurações, aba Controle.
- main.ts 299: "controle: vibra…" está em cima do bloco da seta de golpe (301-304); o comentário é do bloco de 305-306.
- ui.ts 864: o botão fecha com `'Fechar (4 ou Esc)'` com o 4 escrito à mão; a tecla da loja é trocável.

## Defeitos que vi de passagem (não mexi)

- **keys.ts 152 x 160** — `whoUses` (usado para avisar a troca) ignora as magias no modo Q W E R D F, mas `setKey` não: ao dar a um atalho a tecla que uma magia da barra tem no modo "pela posição", a troca com a tecla escondida dessa magia acontece sem aviso. Ao desligar o modo, a magia aparece com outra tecla. Efeito: pequeno, mas silencioso.
- **demo.ts 154 x sim.ts 1037** — o raio da Bola de neve na demonstração é `coll + perLevel * nível`; o jogo usa `nível − 1`. Diferença de 1,3 cm, só visual.
- **gamepad.ts 287-296** — no modo de captura de botão o `tick` retorna antes de tratar o botão do placar; se ele estiver apertado ao entrar na captura, o `keyup` nunca é enviado e o placar fica aberto até o próximo aperto. Raro.
- **scene.ts 962 x 1063** — `discGeo` (const) é usado dentro de `runeDraw` antes de ser declarado no arquivo; funciona porque `runeDraw` só roda depois da criação, mas quebra se alguém chamar antes. Mover a declaração para junto de `ringGeo` (542).
- **room-do.ts 156-157** — `taunted` nunca é limpo (um número por jogador que já provocou). Irrelevante, a sala fecha.
- **tsc `--noUnusedLocals`** — arena.ts 78 (`n` do `spawn` da cruz) e tests/items.test.ts 246 (`m`). É tudo que o compilador acusa.

## Exports sem uso (verificados por `import`)

- Nenhum importador: settings.ts `isSettingsOpen`, `toggleSettings`; net.ts `status` (membro); decor.ts `ready` (membro); sim.ts `Rules` (tipo); sim-lib.ts `Cell` (tipo). Tirar o `export`/o membro.
- Só testes importam (não contar): gamepad.ts `BTN`, `Rect`, `AIM_RANGE`, `AIM_MIN`, `aimPoint`, `padAction`, `nextFocus`, `stick`, `padName`; demo.ts `demoWorld`, `demoStep`; input.ts `InputHandlers`; coach.ts `CoachState`; match.ts `canShop`, `botSkill`; protocol.ts `cleanName`.

## Números mágicos que não economizam linha mas valem o nome

Bits de estado em seis arquivos sem tabela: snapshot.ts 36-42 (define), icons.ts 48-52, scene.ts 1558/1571-1572/1625/1630, ui.ts 1059-1061, predict.ts 72, main.ts 493. Uma `BIT = { shield: 2, invuln: 32, grip: 128, invisible: 2048, aegis: 131072, runeShield: 1048576, … }` em snapshot.ts evita errar o número ao mexer em runas (SEGURO, 0 linhas).

## Pendências da revisão 1 que continuam no código (não recontadas)

- tests: `seeded()` mulberry32 copiado em arena.test.ts 11, bots.test.ts 11 e difficulty.test.ts 11 (idêntico a sim-lib.ts `seedRandom`) e o LCG de teams.test.ts 13; `until`/`toPlaying`/`kill` próprios em options.test.ts 22-33 (helpers.ts já tem).
- tips.ts 14-45: `l.knock / 1.166` em 14 linhas (é o `FRICTION` à mão).
- bots.ts: `shuffle` (23) = `shuffleTeams` de match.ts 444-447; `CAST_POINT[s] ?? 0.1` (420, o tipo é `Record<SpellId, number>`); `blocked()` (408-413) refaz `segT` do sim.ts.
- match.ts 438 e 504: `Math.random` direto no sorteio de pilares e na compra dos bots em vez do `rand` recebido.
