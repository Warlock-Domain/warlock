# Modo Campanha — "Última Vela" (Last Candle) — desenho

Proposto pelo Lucas (lucascvalle) em 19/10/2026, combinado com o Fernando. Tudo que está em "Decidido" é do Lucas, o resto é proposta para o Fernando e o builder confirmarem. Segue o formato de `2026-10-19-ascensao-design.md`.

## Intenção

Um modo **cooperativo e PvE** (1 a 4 Acesos contra o Fumo), roguelike com história: cada partida é *uma noite*, de 30 a 45 minutos, subindo até a Torre do Pavio antes que o Fumo apague a Vela Primeva. Morrer é a vela pingando: o grupo volta ao Santuário da Cera e tenta de novo, numa noite diferente. A história maior (do que a vela é feita) se revela aos poucos, noite após noite.

Os três modos de hoje (Rodadas, Deathmatch, Times) continuam como estão: o FFA é o jogo original. O Ascensão (PvP com cartas) é a base de progressão que a Campanha reaproveita.

## Objetivos

- Jogar junto contra o jogo, não um contra o outro, com as mesmas magias, o mesmo empurrão e a mesma lava.
- Classes que importam: cada Aceso tem uma passiva exclusiva e uma árvore (quais cartas pode receber). Os chefes são ex-Acesos de cada classe e reconhecem quem é da antiga ordem deles.
- Noite curta e com objetivo claro (3 estágios + chefe final), diferente a cada vez (semente nova por noite), sem repetir numa rerun.
- Reaproveitar o máximo: as 25 magias, os 16 itens, os bots, as arenas, os bonecos (os esqueletos são os servos do Fumo), o XP e as cartas do Ascensão.

## Não objetivos (1ª versão)

- Conta, perfil ou ranking (recusados em 18/10). O que persiste entre noites fica **só no navegador** (`store`), sem servidor.
- Bots aliados (um humano sozinho joga sozinho na 1ª versão).
- Estágios 2 e 3, Morvane e os finais: entram como conteúdo depois que a fatia 1 (Charneca + Sir Odran) estiver jogável.
- Arenas com formato novo (sdf novo em `arena.ts`): a 1ª versão gera variação com os 4 formatos e os obstáculos que existem.
- Mudar número de magia ou item, ou os modos atuais.

## Anti-objetivos

- O chefe virar um saco de pancada parado (barra de vida enorme sem leitura). Todo golpe dele é telegrafado e tem resposta.
- A lava deixar de importar: o chefe pode e deve ser empurrado; cair nela é o maior dano que ele toma.
- Escolher carta no meio da luta; intervalo longo. Menus enxutos (decisão de 19/10).
- Texto de história atrapalhar quem só quer lutar: falas curtas, puláveis, nunca bloqueando o jogo.
- Cada Aceso jogar sozinho num canto: o reacender e o chefe que muda de alvo forçam o grupo a andar junto.

## Decidido (19/10, Lucas com o Fernando)

| Assunto | Decisão |
|---|---|
| Nome | Campanha / Campaign (id interno sugerido: `campaign`). 1ª campanha: **Última Vela / Last Candle** |
| Jogadores | 1 a 4 humanos, todos do mesmo lado (time 0); o Fumo é o time 1 |
| Estrutura da noite | 3 estágios, cada um com encontros e um chefe sorteado de um conjunto; chefe final fixo (Morvane) |
| Mapa | Padrão **Diablo 2**: objetivo fixo, mapa gerado por semente, diferente a cada noite, semente nova em rerun |
| Chefes × lava | Chefe **pesado e resistente**: pode ser empurrado (muita resistência), cai na lava e **volta com dano grande** em vez de morrer; morre pela barra de vida |
| Progressão na noite | **XP e cartas do Ascensão** (1 entre 3), filtradas pela árvore da classe |
| Inimigos comuns | **Servos do Fumo**: magos fracos (esqueletos) controlados pela IA de bot, em ondas |
| Queda no co-op | **Reacender**: quem cai vira brasa; aliado encosta por alguns segundos e ele volta. Todos caídos = noite perdida |
| Classes | 6: Guerreiro, Arqueiro, Mago, Warlock, Ladino (espelham os Apagadores) e **Errante** (Wanderer), que aprende qualquer magia e tem passiva própria |
| Fatia 1 | **Estágio 1 completo**: Charneca Cinzenta (ondas) + Sir Odran, XP/cartas, classes, Santuário mínimo |

## Como funciona (uma noite)

1. **Sala** com modo Campanha. Cada humano escolhe a classe (a classe decide o boneco inicial; o look de 7 peças continua livre). Opção da sala: dificuldade (Fácil/Normal/Difícil, vale para servos e chefes). Sem bots, sem baús, sem ouro.
2. **Santuário da Cera** (a fase `shop` de hoje, sem loja): fala curta da Ilse, cada um escolhe 1 entre 3 cartas iniciais. Pronto → começa.
3. **Estágio** = sequência de **clareiras** (encontros) gerada pela semente da noite a partir do padrão do estágio, terminando na **arena do chefe**. Uma clareira é uma rodada: arena, lava que encolhe devagar, ondas de servos. A clareira acaba quando o último servo cai. Golpes e quedas de servos dão XP.
4. **Intervalo** entre clareiras (a fase `roundEnd` + escolha de cartas): 1 escolha por nível ganho, 1 entre 3, filtradas pela classe. Fragmento de história quando a clareira era de "fragmento".
5. **Chefe**: arena própria (não encolhe até o chefe estar abaixo de 25% de vida, aí vira morte súbita). Falas no começo, na metade e na queda; fala especial contra a própria ordem.
6. **Estágio vencido** → Santuário rápido (fala da Ilse, cartas) → próximo estágio. Depois do 3º, a Torre do Pavio e Morvane.
7. **Todos caíram** → "A vela pingou": tela de fim com o que o grupo chegou a ver, volta ao Santuário (sala). A próxima noite sorteia outra semente.
8. **Morvane vencido** → final da noite; o contador de noites vencidas (local) abre, na 3ª vitória, o estágio verdadeiro (2ª leva).

Alvo de tempo: 3 clareiras de ~2 min + chefe de 3 a 5 min por estágio ≈ 10 min; 3 estágios + Morvane ≈ 35 a 45 min. Ajuste pelo número de clareiras e ondas.

## O mapa da noite (Diablo 2)

- `Match.seed` é sorteado quando a noite começa (`startMatch`) e guardado. Toda geração usa `rand` derivado dessa semente (mulberry32 como `scripts/sim-lib.ts`, movido para `src/shared`); nunca `Math.random`. A mesma semente gera a mesma noite (testável); uma rerun sorteia outra.
- Cada estágio tem um **padrão** (`STAGES` em `src/shared/campaign.ts`): número de clareiras (2 a 4), peso de cada formato de arena (`ARENA_IDS`), obstáculos do tema (Charneca: `rock`, `rockpillar`, `tree` queimada; Bosque: `tree`; Biblioteca: `pillar`), faixa de pilares (`PILLAR`), ritmo da lava (`SHRINK_EVERY` maior que o de hoje), as ondas possíveis e o conjunto de chefes.
- A **clareira** gerada diz: formato, raio, obstáculos, se é de **fragmento** (um baú-de-história no meio: ficar em cima 3 s revela um fragmento, como o monte de ouro de hoje usa `lootProg`), e as ondas (quantos servos, de que tipo, de que lado da borda entram).
- Objetivo fixo, caminho único: a sequência é sorteada mas não há escolha de rota (fica para a 2ª leva, se fizer sentido). O que muda a cada noite: formatos, obstáculos, ondas, qual clareira tem fragmento, qual chefe.

## Servos do Fumo

Magos de verdade na simulação (`Wizard`), adicionados como `Player` bot com `role: 'servo'` (campo novo, só na Campanha), time 1, look de esqueleto, vida e magias por tipo:

| Tipo | Look | Vida (escala 1000) | Magias | Jeito |
|---|---|---|---|---|
| Cinzento | `skeleton_minion` | 350 | Bola de fogo 1 | `BOT_SKILL.easy`, anda devagar, vem em grupo |
| Arqueiro oco | `skeleton_rogue` | 300 | Raio 1 | fica longe, atira de fora |
| Carregador | `skeleton_warrior` | 600 | Investida 1, Agarrar 1 | vai para cima |
| Acólito | `skeleton_mage` | 300 | Escudo 1, Drenar 1 | protege os outros |

Números iniciais, a medir. Servos não têm itens, não ganham XP, não compram. Usam `botCmds` como está, com a dificuldade da sala rebaixada um degrau (o chefe usa a dificuldade cheia). Entram pela borda (`SHAPES[arena].spawn` com ângulo sorteado), com 1 s de invulnerabilidade para não nascerem na lava.

## Classes dos Acesos

A classe filtra as cartas (a **árvore**: grupos e magias que podem aparecer) e dá uma **passiva**, implementada nos campos que o mago já tem (`kbResist`, `regen`, `lifesteal`, `rangeF`, `windBonus`, `speed`…) ou em uma regra pequena no `sim.ts`. Números iniciais, a medir no simulador com os servos.

| Classe | Boneco | Passiva (proposta) | Árvore |
|---|---|---|---|
| Guerreiro / Warrior | `knight` | **Pé firme:** −25% de empurrão recebido; anda 5% mais devagar | Defesa (todas), Controle (Agarrar, Elo), Ataque (Meteoro, Rajada, Bola de neve), Mobilidade (Investida) |
| Arqueiro / Archer | `rogue` | **Olho de falcão:** +15% de alcance (`rangeF`) | Ataque (Raio, Teleguiado, Bumerangue, Ricochete, Divisor), Mobilidade (todas), Defesa (Escudo) |
| Mago / Mage | `mage` | **Chama viva:** +10% de dano das magias de ataque | Ataque (todas as 10), Defesa (Escudo, Zona de dobra), Mobilidade (Teleporte) |
| Warlock | `skeleton_mage` | **Pacto de cera:** 15% do dano causado volta como vida; sem regeneração | Controle (todas as 5), Ataque (Drenar, Teleguiado, Meteoro), Defesa (Ilusão, Alteração) |
| Ladino / Rogue | `rogue_hooded` | **Sombra:** 3 s sem causar nem levar dano → mais rápido (como as Botas de vento) e o próximo golpe empurra 20% a mais | Mobilidade (todas), Ataque (Bumerangue, Ricochete, Rajada), Controle (Agarrar, Magnetizar), Defesa (Ilusão) |
| Errante / Wanderer | qualquer | **Sem ordem:** aprende qualquer magia (árvore = tudo) e carrega 7 magias (`MAX_SPELLS` + 1), mas nenhuma passa do nível 5 | tudo |

Todos começam com Bola de fogo 1 e Flagelo (como nos outros modos). Itens aparecem nas cartas de todas as classes. A classe vai no protocolo como mensagem nova (`class`, validada em `parseClientMessage`) e no `PublicPlayer`.

## Cartas e XP

Mesmo motor do Ascensão (`src/shared/cards.ts`, a combinar com quem construir o Ascensão: a Campanha **depende** desse motor e deve ser construída em cima dele, não ao lado). Diferenças da Campanha:

- Fontes de XP: dano em servo e chefe, derrubar servo (bônus fixo), derrubar chefe (bônus grande dividido pelo grupo), clareira vencida (XP igual para todos, inclusive quem caiu — não castiga o co-op).
- Sorteio filtrado pela árvore da classe; as 3 cartas cobrem pelo menos 2 tipos.
- Sem catch-up entre jogadores (são aliados). Em vez disso, **XP igual por clareira** mantém o grupo parelho.
- Raridade "rara" (do Ascensão) fica mais provável a partir do estágio 2.

## Chefes (Apagadores)

Um chefe é um `Wizard` com `role: 'boss'`, perfil em `src/shared/bosses.ts` (vida, resistência, velocidade, magias nos níveis certos, fases por vida, falas) e um **cérebro próprio** (`bossCmds`), que escolhe entre padrões telegrafados em vez de usar `botCmds`.

Regras comuns:

- `kbResist` alto (0,6 a 0,75) e vida 5 a 8 vezes a de um mago. Caiu na lava: toma 15% da vida máxima, volta para a pedra (`safeInside`, como a Égide faz em `toStone`) e fica 1,5 s atordoado. É a maior janela de dano do grupo.
- Troca de alvo: foca quem causou mais dano nos últimos 5 s, mas a cada ~12 s vira para quem está mais longe (puxa o grupo para junto).
- Fases por fração de vida (ex.: 100 / 60 / 25%): cada fase troca o conjunto de padrões e dispara uma fala. Abaixo de 25% a arena começa a encolher.
- Falas: evento `{ k: 'say', id, line }` da partida; os textos ficam no cliente em `campaign-text.ts` (pares `_PT`/`_EN`, como `rules-text.ts`). Fala contra a própria ordem: se algum Aceso tem a classe do chefe.

**Sir Odran, o Elmo Vazio** (Guerreiro, estágio 1): `knight` com elmo e sem cabeça (look com cabeça de esqueleto e elmo de cavaleiro). Vida 6000, `kbResist` 0,7, velocidade 85%. Padrões: *Pisão* (Meteoro nível 4 no próprio pé, atraso longo: ensina a sair da área), *Investida cega* (Investida nível 3 numa linha reta, telegrafada pela mira: ensina a esquivar de lado), *Varredura* (Rajada nível 3 em leque curto). Fase 2 (60%): dois Cinzentos entram pela borda. Fase 3 (25%): arena encolhe, Pisão mais rápido. Falas: "Mais um. Eles sempre mandam mais um." · contra Guerreiro: "Esse elmo já foi seu, irmão. Ainda vai ser." · ao cair: "Enfim... silêncio."

Os outros (Nyra, Calvass, Dama Sem Sombra, Vesk, Morvane) ficam descritos no plot e entram um por PR, cada um com uma mecânica que já existe como base: Nyra (Raio, Teleguiado, névoa = `veilUntil` dos servos), Calvass (Magnetizar invertido nos projéteis do grupo), Dama Sem Sombra (Ilusão copiando os Acesos), Vesk (rouba a runa e o item ativo), Morvane (fases ligadas à chama: a arena escurece no cliente e a Caminhada no vento dele fica mais longa).

## Reacender (queda no co-op)

- Aceso cai (lava ou vida zero): vira **brasa** no último ponto seguro (`safeInside`), visível para todos, com `alive: false` e `ember: { pos, prog }` no mago.
- Aliado vivo a menos de 1 m acumula `prog` (como `lootProg` nos montes de ouro); 3 s seguidos → volta com 50% da vida e 2 s de invulnerabilidade (`invulnUntil`). Afastar zera o progresso; servos não interrompem (só a distância).
- Cada queda do mesmo Aceso na mesma clareira custa 1 s a mais para reacender (3, 4, 5…).
- Todos caídos → clareira perdida → noite perdida. Sozinho (1 humano): cair é perder a noite (sem bots aliados na 1ª versão).
- Na arena do chefe a brasa apaga depois de 20 s sem ser reacendida (o Fumo a consome): pressão para o grupo se mexer.

## Santuário da Cera e história entre noites

- Na sala e no fim: a Ilse fala (1 a 2 frases por momento, com botão de pular). As falas avançam por um contador local de noites jogadas/vencidas e de fragmentos vistos, guardado por `store` (`warlock:campaign`). Sem servidor, sem conta: o anfitrião da sala envia o progresso dele ao começar a noite (campo validado em `startMatch`), para o grupo ver a mesma história.
- Fragmentos: texto curto por clareira de fragmento; revelado para todos; marcado como visto localmente em cada navegador.
- Final verdadeiro (reacender ou apagar; chefe Ilse): 2ª leva.

## Onde mexe (para o builder confirmar)

- `src/shared/match.ts`: `MODES` ganha `campaign`; `Player.role` e `Player.class`; `Match.seed`, `Match.stage`, `Match.clearing`; fase de cartas (do Ascensão) no lugar da loja; fim da rodada quando os servos caem (não quando sobra um); noite perdida; sem baús/ouro/votação de modo durante a noite.
- `src/shared/campaign.ts` (novo): `STAGES`, geração da noite por semente (`generateNight(seed)`), tipos de servo, árvores e passivas das classes, XP da Campanha.
- `src/shared/bosses.ts` (novo): perfis e `bossCmds`.
- `src/shared/cards.ts` (do Ascensão): sorteio de cartas com filtro por árvore.
- `src/shared/sim.ts`: chefe volta da lava; brasa e reacender; passivas (poucas linhas cada, nos campos que já existem); `hpMax` por mago vindo do perfil (hoje vem só dos itens); evento `say`.
- `src/shared/protocol.ts`: mensagem `class`; `role` e `class` no `PublicPlayer`; `seed` e progresso em `start`; tudo validado.
- `src/shared/bots.ts`: nada para servos (usam `botCmds`); o chefe tem cérebro próprio em `bosses.ts`.
- `src/shared/snapshot.ts`: brasa (bit em `bits` + posição) e vida do chefe (já vai como `hp`).
- `src/worker/room-do.ts`: ramo da mensagem `class`; a partida chama `bossCmds` para quem tem `role: 'boss'`.
- `src/client`: seletor de classe na sala; barra do chefe; brasa e barra de reacender na cena; caixa de fala (pulável); fragmento; tela de fim da noite; `campaign-text.ts` com todo texto em `_PT`/`_EN`; Campanha como opção de modo na sala (sem aba nova no menu: menus enxutos).
- `scripts/balance-sim.ts`: rodar a Campanha com bots no lugar dos humanos (grupo de 2 a 4) para medir tempo de noite, taxa de vitória por estágio e por classe.
- `tests/`: geração determinística por semente; clareira acaba quando o último servo cai; reacender (tempo, distância, custo crescente); chefe volta da lava com dano; noite perdida com todos caídos; filtro de cartas por classe; cada classe tem passiva, árvore e textos nas duas línguas (teste de completude, como `ui-data`).
- `CLAUDE.md` (Registro de decisões, Mapa do código), `README.md`, `CONTRIBUTING.md`.

## Fatia 1 (primeiro PR jogável na `lucascvalle-dev`)

Modo Campanha na sala · 6 classes com passiva e árvore · Santuário mínimo (fala da Ilse + cartas iniciais) · Estágio 1 gerado por semente (2 a 3 clareiras, 2 tipos de servo: Cinzento e Arqueiro oco, 1 clareira de fragmento) · Sir Odran com 3 fases · reacender · noite perdida/vencida · textos em pt/en · testes acima. Depende do motor de cartas do Ascensão: se ele ainda não existir quando a fatia começar, o builder faz `cards.ts` de forma que o Ascensão o use sem mudar (combinar com o Fernando antes).

Deve sair em mais de um PR (um assunto por PR): (1) modo + classes + servos + geração; (2) cartas na Campanha; (3) Sir Odran; (4) reacender; (5) textos e Santuário.

## Critérios de sucesso (simulador e partidas reais)

- Noite de 30 a 45 min com 2 a 4 jogadores no Normal (estágio 1 em 8 a 12 min).
- Grupo de 2 bots Normais vence o estágio 1 entre 60% e 80% das vezes; no Difícil, entre 30% e 50%.
- Luta do Sir Odran entre 3 e 5 min; pelo menos 1 queda dele na lava por luta em média (a lava continua importando).
- Nenhuma classe vence o estágio 1 mais de 15 pontos percentuais acima ou abaixo da média (passivas equilibradas).
- Nenhuma carta escolhida em mais de 40% das vezes em que aparece (critério do Ascensão).

## Fica com o builder

- Fórmula de XP da Campanha e curva de níveis (1 a 2 cartas por intervalo, como no Ascensão).
- Números dos servos, dos chefes e das passivas, medidos no simulador.
- Layout do seletor de classe, da barra do chefe e da caixa de fala, seguindo `src/client/CLAUDE.md` (DOM com `el`, `choice`, `withTip`; celular em 390×844).
- Como a brasa aparece na cena 3D (reaproveitar o `puff`/`flame` de `public/fx`).

## Respostas do Fernando (19/10, no chat)

- **Motor de cartas:** nasce no **Ascensão** primeiro (`src/shared/ascension.ts`, desenho aprovado em `2026-10-19-ascensao-design.md`); a Campanha reaproveita. Nada de um segundo motor.
- **As demais perguntas** (progresso no navegador, onde o modo aparece, dano em aliado, bots aliados, dificuldade da sala): o Lucas decide, como dono do modo Campanha. As propostas abaixo valem como decisão dele até ele mudar.

## Perguntas que estavam abertas

1. Progresso entre noites só no navegador (`store`), sem conta: ok, dado que perfil foi recusado?
2. Quem constrói o motor de cartas (`cards.ts`): o Ascensão primeiro, ou a Campanha faz e o Ascensão reaproveita?
3. Campanha como opção de modo na sala (como os outros 3) ou como entrada própria na aba Jogar? Proposta: opção de modo, para não mexer no menu.
4. Dano em aliado: hoje "magia em aliado só empurra". Na Campanha, manter igual (empurrar aliado para a lava é friendly fire de verdade)? Proposta: manter.
5. Bots aliados na 2ª leva, para quem joga sozinho?
