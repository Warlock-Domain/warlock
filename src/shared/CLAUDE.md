# src/shared — regras do jogo (rodam no servidor e no navegador)

Vale junto com o `CLAUDE.md` da raiz.

## Simulação

- **Sorteio só pelo `rand: () => number` recebido.** Assinatura pública tem `rand = Math.random` como padrão (`newWorld`, `stepWorld`, `tickMatch`); funções internas repassam o `rand`. Nunca `Math.random` solto. Mudar a ordem dos sorteios muda o hash de `tests/style.test.ts`.
- **O `World` é mutado no lugar** (`stepWorld` zera `w.events` e escreve em `wz.hp`, `wz.cd`, `w.projectiles`). Não clone. O bot é a exceção: `botCmds` só lê o mundo e devolve `Cmd[]`.
- Fase, ouro e compras moram em `Match` (`match.ts`). O `World` não é gravado no disco (a sala grava `world: null`).
- **Unidades:** distância em metros, tempo em segundos, vida na escala 1000. Números do Warlock original entram multiplicados por `UNIT` (`speed: 1000 * UNIT`). `DT = 1/60`. Recarga guardada como instante (`w.t + cd`). Milissegundos (`*_MS`, `Date.now()`) só na camada de partida e do servidor.
- **Eventos:** `w.events.push({ k: '...', ... })` durante o passo; tipo novo entra na união `SimEvent` e o cliente consome em `main.ts`. Ids secretos viram públicos em `publicEvents` (`snapshot.ts`).

## Números de magia e item (`spells.ts`, `items.ts`, `constants.ts`)

- 7 níveis por `L({...})`; séries irregulares com `zip([...], [...])`, lineares com `steps(de, passo)`.
- Ajuste de balanceamento fica **inline sobre o número original**, com comentário de data e medição: `cd: cd * 0.7 /* 18/10: … (0,86 → 0,97) */`.
- Constante extra de mecânica vira objeto `NOME = { … * UNIT }` abaixo da tabela, com o arquivo `.lua` de origem no comentário. Nada de número mágico solto em `sim.ts`.
- Número só muda com medição do simulador (ver raiz).
- **Campanha tem números próprios:** magia diferente na Campanha entra em `CAMPAIGN_BOOK` (`campaign.ts`, com `retune`), nunca em `spells.ts`; o mundo dela leva esse livro em `World.book`. Quem lê número de magia usa `spellLevel(id, nível, w.book)`, nunca `SPELLS[id].levels` direto (`tests/spellbook.test.ts` acusa). O que não está no livro segue `SPELLS`. O livro cobre só a tabela de níveis (`Level`): constante de mecânica (`RUSH`, `THRUST`…), `CAST_POINT` e itens ainda são de todos os modos; para mudar um deles só na Campanha, primeiro estenda o livro (mesma ideia, no `World`), nunca edite a constante compartilhada.

## Magia nova: onde mexer

`spells.ts` (`SPELL_IDS`, `SPELLS` com `name`/`en`, `CAST_POINT`) · `sim.ts` (`PROJ_KINDS` **no fim da lista**, ramo em `cast()` e comportamento do projétil) · `snapshot.ts` (só se precisar de estado novo, como bit em `bits`) · `bots.ts` (grupo `DAMAGE`/`ESCAPE`/`CONTROL` e uso específico) · `match.ts` (`DEFENSE` se for defesa) · cliente: `icons.ts`, `keys.ts`, `main.ts` (`SPELL_SOUND`), `rules-text.ts` (grupo, uso, regras, dicas nas duas línguas), `tips.ts` (`SPELL_ROWS`), `demo.ts` (`SCRIPTS`), `scene.ts` (`LOOK` se for projétil). Os testes `ui-data`, `grimoire-demo`, `i18n` e `new-spells` acusam o que faltar.

## Protocolo (`protocol.ts`)

Mensagem nova do cliente: variante em `ClientMsg` → `case` em `parseClientMessage` que devolve `null` em qualquer dúvida, usando `isObj`, `coord`, `seq`, `pubId`, `isSpell` → devolver o objeto **reconstruído** com campos conhecidos, nunca o cru → objeto de entrada só com chaves permitidas (veja `parseOpts`, `parseSandbox`) → respeitar `MAX_MSG` → ramo em `room-do.ts` e teste em `tests/protocol.test.ts`.

## Snapshot (`snapshot.ts`)

- Dano histórico não amplifica knockback (`KNOCK_HP_SCALE=0`); continua registrado para estatísticas. `WALKING_BIT` só marca destino voluntário válido; deslocamento físico/reconciliação não anima caminhada. Botão direito não fica preso após blur/pointercancel.

Listas achatadas de números (layout no comentário de `protocol.ts`), valores com `r2`, campos opcionais só quando há conteúdo, estado novo por mago como bit documentado em `bits`. Inserir no meio de `PROJ_KINDS` quebra cliente aberto.

## Aparência (`characters.ts`)

O código da aparência guarda a **posição** de cada opção (7 dígitos, um por peça), e ele fica salvo no navegador e nas salas. Opção nova entra **no fim** da lista da peça; opção que sai fica no lugar e vira aposentada (`isRetired`): `decodeLook` troca por outra (a Ladina encapuzada vira Ladina + Capuz, issue #107), o criador e o sorteio pulam. Toda entrada de código passa por `fixLook` (navegador em `savedLook`, mensagem em `parseClientMessage`, sala gravada em `resume`).
