# Revisão ponytail (18/10/2026, HEAD 96028ee, só leitura)

Estimativa: ~270 linhas a menos de 13,5 mil, sem mudar comportamento nem números. Aplicar depois que as frentes de bots e grimório commitarem; linhas abaixo são do HEAD 96028ee e podem ter andado.

Já resolvido desde a revisão: bit 8 "vulnerável" e `kbPenaltyUntil` (saíram com o conserto do Redirecionador); escudo de runa por absorção (virou armadura de 30%).

## A. Seguro e mecânico (~165)
1. `sim.ts` `cast`: um só evento 'fire' com contagem {cluster 4, twin 2, splitter 8} (−20)
2. localStorage: um módulo `store` e fim dos 11 try/catch; `notify()` em keys.ts (−35)
3. `items.ts` `itemStats`: laço sobre as chaves (−7)
4. Tipos derivados dos arrays (`as const`), `noSpells()` com `SPELL_IDS` (−7)
5. `room-do.ts` 117-142: um push + acks para move/stop/cast/item; 'kicked' e busca por id público únicas (−12)
6. `ui.ts`: helper `toggle(panel, btn)` para os painéis do topo (−10)
7. `scene.ts`: `floatText()` para dano, cura e ouro (−8)
8. scripts headless: `scripts/lib/browser.mjs` com o launch do chromium (−10)
9. `n1` e `pct` exportados de um lugar só (−6)
10. `sim.ts`: helper da zona de dobra inimiga para `timeScale` e `inWarp` (−5)
11. `sim.ts`: helper `segT` para os 3 `first*OnSegment` (−5)
12. `ui.ts`: laços de recarga, pips e `details` da ficha repetidos (−8)
13. `input.ts`: `button`/`itemButton` iguais; despacho `fire(a, p)` (−5)
14. `decor.ts`: `baseY` sempre 0; `clone()` repete o traverse (−4)
15. `sim.ts` 387-391: usar `heal()` no Roubo de vida (−3)
16. `icons.ts`: `actionName`/`actionIcon` (−3)
17. `scene.ts`: parâmetro `names` sem uso, `void id`, comentário duplicado, `export type GameScene` morto (−4)
18. `scene.ts`: `toScreen()`; nome da animação de conjurar (−3)
19. `durF` sempre 1: apagar o campo e os `* wz.durF` (−2)
20. Rótulos de ritmo e dificuldade num lugar só (−2)
21. `ui.ts`: `rule()`/`TOP_DMG_GOLD` que nunca variam; filtro `bit !== 1` morto (−2)
22. `protocol.ts`: validação de sell/undo e regex de id público repetidos (−2)
23. `TOUCH` exportado; tipo da lista de salas em `protocol.ts` (−2)
24. `telemetry.ts` 76-78: laço (−1)
25. `area(falloff)` sempre true; `hit(src='outro')` nunca usado (−1)
26. `isSliding` reaproveitado em snapshot/predict/main
27. `PILLAR` repete `OBSTACLES.pillar`
28. ~28 exports usados só no próprio arquivo: tirar o `export`

Comentários e textos errados: "nunca some" (constants.ts:11, rules-text.ts:11), "maestrias continuam" (rules-text.ts:19), Pilar "4 s" (rules-text.ts:132, é 5), "maestria" em sim.ts 65-66/558/625, nota da Égide em cima de wind_boots (items.ts:37), comentários trocados em scene.ts 611 e 1533, import no meio de spells.ts:8, main.ts:527 (aviso some depois do colapso: possível defeito).

## B. Com cuidado (~80)
- Helpers de teste repetidos (`until`, `toPlaying`, `kill`, `STEP_MS`) → `tests/helpers.ts` (−40)
- `world()`/`run()` dos testes de simulação (−20)
- `seeded()` com duas PRNGs diferentes (muda sorteios) (−10)
- `scene.ts`: helper `ground(mesh, y)` (12 vezes) (−10)
- `tips.ts` 15-38: `knock / 1.166` é o FRICTION à mão (pode mudar 1 casa decimal)
- `sim.ts`: `byId` (só vivos) × 17 `find` sem filtro → `anyById`
- `launch` devolver o projétil (8 `projectiles[length - 1]`)
- NÃO trocar o descarte de `syncWizards` por `dispose(m.root)` (geometria compartilhada)

## C. Depois de bots/match commitados (~25)
- `match.ts`: ouro + evento 'gold' 5 vezes → `bonus()`; 4 blocos 'death'; "único no topo" duplicado; laço de compra dos bots duplicado; comentário de maestria em `undoBuy`; imports separados; helper `player(m, id)`; `Math.random` em vez do `rand` nos pilares (determinismo)
- `bots.ts`: `shuffle` = `shuffleTeams`; `?? 0.1` morto em CAST_POINT; `blocked()` repete o segmento; refaz `fixed`/`returning`
