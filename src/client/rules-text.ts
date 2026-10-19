import {
  ARENA_MIN, ARENA_R0, ASSIST_GOLD, ASSIST_MIN_DMG, BOUNTY, CHEST, CREDIT_WINDOW, DM_RESPAWN, DM_ROUND_MS, DM_SPAWN_GAP, HP_MAX, HP_REGEN, INVULN_TIME, KILL_GOLD, LAVA_DPS, LAVA_KB_FACTOR,
  LEADER_WIN_GOLD, OBSTACLES, RECOVERY, ROUND_GOLD, RUNE, SELL_DECAY, SELL_FLOOR, SHRINK_EVERY, START_GOLD, STREAK, SUDDEN, TOP_DMG_GOLD, VOTE_MS, WIN_GOLD, ZONES,
} from '../shared/constants.ts';
import { DEFAULT_OPTS, DM_GOALS, OPTION_CHOICES } from '../shared/match.ts';
import { CLASH } from '../shared/sim.ts';
import { ITEMS, MAX_ITEMS, SCOURGE } from '../shared/items.ts';
import { PAD_NAMES, PAD_NAMES_PS, keyLabel, keyOf, padButtonOf, uiLabel, type PadAction, type UiAction } from './keys.ts';
import { BOUNCER, CAST_POINT, GRAVITY, GRIP, MAX_SPELLS, MAX_SPELL_LEVEL, METEOR_DELAY, RECHARGE, RUSH, SPELLS, SPELL_IDS, WARPZONE, type SpellId } from '../shared/spells.ts';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const n1 = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const list = (xs: readonly (string | number)[]) => xs.map(String).join(', ').replace(/, ([^,]*)$/, ' ou $1');
const L1 = (id: SpellId) => SPELLS[id].levels[0];
// magias que saem na hora (sem tempo de conjuração), lidas de CAST_POINT
const INSTANT = list(SPELL_IDS.filter((s) => CAST_POINT[s] === 0).map((s) => SPELLS[s].name)).replace(/ ou ([^,]*)$/, ' e $1');

// textos do grimório (Como jogar), por página; os números vêm do código
export const RULES = {
  objetivo: [
    `Empurre os outros magos para fora da pedra. Na lava a vida cai ${LAVA_DPS} por segundo; na pedra ela volta ${HP_REGEN} por segundo. Cada mago tem ${HP_MAX} de vida.`,
    `A arena encolhe uma faixa a cada ${SHRINK_EVERY} s até ${n1(ARENA_MIN)} m de raio; a faixa que vai afundar pisca em vermelho antes. Ela é maior quanto mais magos tiver (com 4, ${n1(ARENA_R0)} m de raio).`,
    `Com ${SUDDEN.collapse} s de rodada, o tamanho mínimo deixa de valer e a arena some aos poucos (nenhuma rodada fica sem fim).`,
    `O último vivo vence a rodada e ganha 1 ponto. Quem chega primeiro a ${DEFAULT_OPTS.goal} rodadas vence a partida (padrão; muda nas opções). Se os últimos caem juntos, vence quem tinha mais vida.`,
    `Nos ${INVULN_TIME} primeiros segundos de cada rodada ninguém leva dano.`,
    `As magias saem 0,1 s depois da tecla e o mago fica parado enquanto conjura; saem na hora: ${INSTANT}. O clique de andar dado durante a conjuração vale assim que a magia sai.`,
  ],
  empurrao: [
    'Cada golpe empurra na direção dele. O número de empurrão das magias é a distância, em metros, que um mago sem dano acumulado desliza.',
    `Quanto mais dano você já levou na rodada, mais longe voa: +10% de empurrão a cada 100 de dano levado. A lava também soma, pela metade (${pct(LAVA_KB_FACTOR)} do que ela tira).`,
    'Deslizando rápido você não consegue andar: espere parar ou use uma magia de movimento.',
    `O abate vai para quem acertou você por último nos ${CREDIT_WINDOW} s antes da morte. Cair sozinho na lava não dá abate a ninguém.`,
    `Lava conta como dano de quem empurrou: metade da vida que a lava tira de quem você acertou nos últimos ${CREDIT_WINDOW} s entra no seu dano (placar, top dano e assistência).`,
    `Abates com até ${STREAK.window} s entre eles viram Abate duplo, Abate triplo e Massacre. Abates sem morrer (contam de uma rodada para outra): ${STREAK.spree[0]} é Matança, ${STREAK.spree[1]} Fúria assassina, ${STREAK.spree[2]} Imparável e ${STREAK.spree[3]} Lendária.`,
    `Quebra-combo: derrubar quem tem ${STREAK.breakAt} ou mais abates seguidos dá +${STREAK.breakGold} de ouro.`,
  ],
  // os textos de controles leem as teclas e botões atuais (trocáveis nas configurações): getter, refeito a cada leitura
  get pc() {
    const k = (a: UiAction) => uiLabel(a);
    const sheet = keyOf('sheet') === 'Backquote' ? "Tecla à esquerda do 1 (' no teclado brasileiro)" : k('sheet');
    return [
      `Botão direito no chão: andar (segure para arrastar o destino). ${k('stop')}: parar. Esc: cancela a magia escolhida, fecha o que estiver aberto e, sem nada aberto, abre as configurações.`,
      'Tecla da magia: três jeitos de lançar, escolhidos em Configurações > Lançamento. Rápido (padrão): lança na hora na direção do mouse; o círculo de alcance aparece ao passar o mouse na magia da barra.',
      'Ao soltar: segurando a tecla aparece o círculo de alcance; ao soltar, a magia sai (Esc cancela). Com clique: a tecla escolhe a magia e mostra o alcance, o clique esquerdo lança (fora do alcance, vai até a borda); botão direito ou Esc cancelam.',
      'Clicar no botão da magia e depois no chão também lança.',
      'Roda do mouse: zoom. Espaço + arrastar com o botão esquerdo: mover a câmera; Espaço sozinho volta ao centro.',
      `${k('board')} (segurar): placar; com ele aberto, ← → troca entre Rodada, Partida e Sala.`,
      `${k('taunt')}: provocações. ${sheet}: ficha do mago. ${k('shop')}: loja só para ver durante a rodada (o jogo não pausa; ${k('shop')}, Esc ou ✕ fecham). ${k('rules')}: este grimório.${keyOf('vote') ? ` ${k('vote')}: votar.` : ''}`,
      'Dá para trocar a tecla de cada magia, item e atalho em Configurações > Teclas (Esc ou a engrenagem no topo), ou usar Q W E R D F pela ordem da barra (fica salvo no navegador).',
    ];
  },
  get controle() {
    // nome do botão nas duas famílias: "A (✕)"; L3, R3 e o D-pad são iguais
    const b = (p: PadAction) => {
      const i = padButtonOf(p);
      return PAD_NAMES[i] === PAD_NAMES_PS[i] ? PAD_NAMES[i] : `${PAD_NAMES[i]} (${PAD_NAMES_PS[i]})`;
    };
    return [
      'Ligue o controle (Xbox ou PlayStation) e aperte qualquer botão: aparece "Controle conectado" e a barra mostra os botões do controle.',
      'Analógico esquerdo: andar. Analógico direito: mirar (o anel dourado no chão mostra onde). Sem mirar, a magia vai para onde você anda.',
      `${list((['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6'] as const).map(b)).replace(/ ou ([^,]*)$/, ' e $1')}: as magias pela ordem da barra. ${b('item1')}, ${b('item2')} e ${b('item3')}: itens ativos 1, 2 e 3.`,
      `Start (Options): o Esc do controle (fecha o que estiver aberto; sem nada aberto, abre e fecha as configurações). ${b('board')} segurado: placar. ${b('sheet')}: ficha do mago. ${b('center')}: centraliza a câmera. ${b('shop')}: loja só para ver.`,
      'Os botões da partida se trocam em Configurações > Controle (desenho do controle: clique no botão e aperte o novo).',
      'Menus e loja: D-pad ou analógico esquerdo anda entre os botões, A confirma (o Pronto da loja começa focado), B volta ou fecha, X desfaz ou vende, Y mostra a dica, LB e RB pulam entre os grupos.',
      'Vibra ao levar golpe forte e ao morrer (dá para desligar em Configurações > Controle).',
    ];
  },
  celular: [
    'Toque no chão para andar.',
    'Toque no botão da magia e depois no chão para lançar; o ✕ do aviso cancela.',
    'No topo: o gráfico de barras abre o placar, o pergaminho abre a ficha do mago, o balão manda provocações, a urna (Votar) troca o modo ou expulsa alguém e a engrenagem abre as configurações.',
    'Neste grimório: deslize o dedo para os lados para virar a página.',
  ],
  rodadas: [
    `O último vivo ganha a rodada e 1 ponto. Meta padrão: ${DEFAULT_OPTS.goal} rodadas (${list(OPTION_CHOICES.goal)} nas opções).`,
    `Morte súbita: passados ${SUDDEN.at} s de rodada, a arena encolhe a cada ${SUDDEN.every} s em vez de ${SHRINK_EVERY} (dá para desligar).`,
  ],
  deathmatch: [
    `Rodadas de ${DM_ROUND_MS / 1000} s e a arena não encolhe. Quem cai volta ${DM_RESPAWN} s depois, longe dos outros magos (tenta ${DM_SPAWN_GAP} m ou mais), com vida cheia e ${INVULN_TIME} s sem levar dano; magias e itens continuam.`,
    `Cada abate vale 1 ponto (cair sozinho não vale). A partida acaba no fim da rodada em que alguém chega à meta (${list(Object.values(DM_GOALS))} abates; padrão ${DM_GOALS[DEFAULT_OPTS.goal]}); empate joga mais uma rodada.`,
  ],
  times: [
    'Azul contra Vermelho, times do mesmo tamanho (com número ímpar, um tem 1 a mais). Sorteados a cada rodada ou fixos na partida (escolha da sala, ou votação).',
    'A rodada acaba quando só sobra gente de um time; todos dele ganham 1 ponto e o ouro da vitória.',
    'Magia em aliado só empurra: não tira vida nem dá abate. Míssil, Ricochete, Gravidade e Agarrar só pegam inimigos; a Troca com aliado vale.',
  ],
  opcoes: [
    `Quem começa a partida escolhe o modo e as opções na sala de espera: tempo de loja (${list(OPTION_CHOICES.shop)} s), ritmo, ouro ganho (×${list(OPTION_CHOICES.economy.map(n1))}), ouro inicial (${list(OPTION_CHOICES.startGold)}), meta, arena e dificuldade dos bots. Runas, morte súbita e baús dá para desligar.`,
    `Votar, no topo: trocar o modo, mudar uma opção, sortear ou fixar os times, pôr ou tirar um bot, pular a loja, reiniciar, encerrar ou expulsar alguém. Passa com mais da metade; fecha em ${VOTE_MS / 1000} s e vale na próxima rodada.`,
  ],
  arenas: [
    `Obstáculos: pilar (${OBSTACLES.pillar.hp} de vida, explode com ${OBSTACLES.pillar.blastDmg} de dano ao quebrar), rocha (não quebra), árvore morta (${OBSTACLES.tree.hp} de vida) e altar de velas (${OBSTACLES.shrine.hp} de vida, explode com ${OBSTACLES.shrine.blastDmg} de dano em ${n1(OBSTACLES.shrine.blastR)} m). Bloqueiam magos, projéteis e o Raio.`,
    `Baú de ouro (pode desligar): o primeiro aos ${CHEST.first} s, depois um a cada ${CHEST.every} s (até ${CHEST.maxUp} de pé). Quebre com magias e fique em cima do monte: 1 de ouro a cada ${CHEST.goldEvery} s, até ${CHEST.pile}.`,
  ],
  get loja() {
    return [
      `Você começa com ${START_GOLD} de ouro (padrão), a Bola de fogo e o Flagelo (tecla ${keyLabel(keyOf('scourge'))}). A loja abre entre as rodadas e dura ${DEFAULT_OPTS.shop} s (padrão); fecha antes quando todos clicam Pronto.`,
      `Magias sobem até o nível ${MAX_SPELL_LEVEL} (mais dano e empurrão, menos recarga). No máximo ${MAX_SPELLS} magias e ${MAX_ITEMS} itens por mago.`,
      `Desfazer: devolve o ouro de uma compra feita nesta loja. Vender: cada nível volta 100% na loja em que foi comprado e perde ${pct(SELL_DECAY)} por rodada, até ${pct(SELL_FLOOR)}.`,
      'A Bola de fogo também se vende (vale 0 no nível 1, mas libera a vaga e a tecla); comprar de volta custa o preço normal.',
      `Durante a rodada, a tecla ${uiLabel('shop')} (ou o botão da loja, no topo) mostra a loja só para ver: preços e o que o seu ouro já compra na próxima.`,
    ];
  },
  ouro: [
    `Por rodada: ${ROUND_GOLD}. Vitória: ${WIN_GOLD} (o líder do placar que vence ganha só ${LEADER_WIN_GOLD}). Abate: ${KILL_GOLD}. Mais dano na rodada: ${TOP_DMG_GOLD}. Assistência (mais dano em quem morreu, sem ser quem matou, com pelo menos ${ASSIST_MIN_DMG}): ${ASSIST_GOLD}.`,
    `Recuperação: quem ganhou menos ouro que a média recebe metade da diferença no fim da rodada (até ${RECOVERY.max}). Abater o líder vale +${BOUNTY.perWin} por vitória de vantagem dele sobre a média (até ${BOUNTY.max}).`,
    'Tudo isso é multiplicado pelo "Ouro ganho" das opções.',
  ],
  runas: [
    `Aparece uma por vez num ponto livre da arena: a primeira aos ${RUNE.first} s e a próxima ${RUNE.every} s depois que alguém pega (ou a lava engole). Encoste para pegar; o efeito dura ${RUNE.secs} s. Pegar outra troca a runa.`,
  ],
  runa: {
    haste: `Pressa: +${pct(RUNE.haste)} de velocidade de andar.`,
    fury: `Fúria: +${pct(RUNE.fury)} de dano em tudo que você acerta.`,
    shield: `Escudo de runa: você leva ${pct(RUNE.armor)} menos dano (o empurrão continua).`,
    recharge: `Recarga: suas recargas levam ${pct(RUNE.cdr)} menos tempo.`,
  },
  choques: [
    'Bola de fogo e Míssil teleguiado de magos diferentes se anulam quando se encontram e explodem, deixando o chão com efeito:',
    `Fogo com fogo: explosão de ${CLASH.fire.dmg} em ${n1(CLASH.fire.r)} m e chão em chamas (${ZONES.burn.dps} de dano por segundo por ${n1(ZONES.burn.secs)} s).`,
    `Fogo com míssil (arcano): explosão de ${CLASH.arcane.dmg} em ${n1(CLASH.arcane.r)} m e chão lento (anda a ${pct(ZONES.slow.mult)} por ${n1(ZONES.slow.secs)} s).`,
    `Míssil com míssil (pulso): explosão de ${CLASH.pulse.dmg} em ${n1(CLASH.pulse.r)} m e um redemoinho que puxa para o centro por ${ZONES.pull.secs} s.`,
    `Raio atravessando uma Bola de fogo: detona a bola (2/3 de dano do raio + 70, caindo até a borda de ${n1(CLASH.detonate.r)} m) e deixa chão em chamas por 3,5 s.`,
    'O dano das explosões cai do centro para a borda. O Escudo não segura explosões.',
  ],
  dicas: [
    'Fique longe da borda: com dano acumulado, um golpe médio já joga você na lava.',
    'Ande o tempo todo: projéteis vão reto, e quem para de andar vira alvo fácil do Meteoro.',
    `Guarde uma magia de fuga (Teleporte, Investida, Troca) para quando cair na lava: são ${LAVA_DPS} de vida por segundo.`,
    'Prenda (Agarrar, Elo, Bola de neve) e emende a magia mais forte: o golpe que solta o Agarrar empurra mais.',
    'Combine: Magnetizar + projéteis, Gravidade + Meteoro, Pacto + Bola de fogo perto da borda.',
    `Flagelo: ${n1(SCOURGE.windup)} s de preparo e ${n1(SCOURGE.cd)} s de recarga; use quando alguém encostar em você. A explosão também destrói Bolas de fogo e Mísseis inimigos em volta. O Teleporte cancela o preparo.`,
    'Na loja, passe o mouse (ou toque) numa magia para ver os números do nível atual e do próximo.',
  ],
  creditos: [
    'Personagens e decoração: KayKit, de Kay Lousberg (kaylousberg.com). Texturas: ambientCG e Poly Haven. Partículas e sons: Kenney e OpenGameArt. Música: "Determined Pursuit", de Emma_MA. Tudo em domínio público (CC0). Ícones: game-icons.net, de Lorc, Delapouite, Skoll, Sbed e Caro Asercion (CC BY 3.0; lista em CREDITS.txt).',
    'Inspirado no Warlock do Warcraft 3 e no Warlock Brawl para Dota 2.',
  ],
};

// grimório: como usar cada magia e contra o quê ela funciona (lido do comportamento em shared/sim.ts)
export const SPELL_TIPS: Record<SpellId, [use: string, vs: string]> = {
  fireball: ['Mire um pouco à frente de quem anda. Perto da borda, um acerto já joga na lava.', 'O Escudo devolve; Teleporte e Troca escapam. O Raio detona a bola no ar e duas bolas que se chocam viram chão em chamas.'],
  lightning: ['Não dá tempo de desviar: bom em quem está preso, conjurando ou na borda. Passar pela sua Bola de fogo a detona.', `Obstáculos bloqueiam; o Escudo devolve o raio para você. Alcance curto (${n1(L1('lightning').range)} m no nível 1).`],
  homing: ['Bom contra quem foge e desvia: mire perto do alvo, ele persegue o inimigo mais perto da mira.', 'O Escudo devolve e ele passa a perseguir você; obstáculos o param. Com uma Bola de fogo inimiga, vira chão lento.'],
  shield: [`Ligue quando o projétil estiver chegando: dura só ${n1(L1('shield').duration)} s. Devolve mirando quem lançou.`, 'Devolve projéteis e o Raio; barra a Troca; Bumerangue e Elo quicam. Não segura áreas: Meteoro, Flagelo, explosões dos choques e lava.'],
  teleport: ['Volte da lava para a pedra ou saia da frente de um projétil. É a única magia que sai durante o preparo do seu Flagelo (e o cancela).', `Quem lê o salto atira no ponto de chegada. Recarga longa no começo (${n1(L1('teleport').cd)} s).`],
  swap: ['Fique perto da lava e troque: o inimigo vai para o seu lugar ruim. Errou? Você vai até a metade do caminho da mira, que também serve de fuga.', 'O Escudo barra a Troca: ninguém sai do lugar.'],
  grip: [`Prenda e acerte com a magia mais forte: o golpe que solta empurra mais (+${pct(L1('grip').scale)} no nível 1). Cada magia que o preso lança soma ${GRIP.castPenalty} de dano acumulado.`, 'Não prende aliados. O Escudo devolve e quem prende é ele.'],
  meteor: [`Mire onde o inimigo vai estar daqui a ${METEOR_DELAY.toLocaleString('pt-BR')} s, ou em quem está preso ou conjurando. O dano é maior no centro.`, 'Dá para sair andando da marca. O Escudo não segura.'],
  rush: [`O avanço de ${n1(RUSH.dash)} m sai na hora e quem você encostar leva ${RUSH.dashDmg} de dano. Durante a Investida, metade de cada golpe vira velocidade (até o limite do nível).`, 'Só o dano é absorvido: o empurrão continua valendo.'],
  cluster: ['De perto os 4 projéteis acertam juntos: muito dano e empurrão.', `Alcance curto (${n1(L1('cluster').range)} m): de longe erra.`],
  boomerang: ['Acerta na ida e na volta: deixe o inimigo entre você e o ponto. Quica em obstáculos.', 'No Escudo ele quica e volta sem trocar de dono.'],
  thrust: ['O dano cheio vem com velocidade: comece de longe. Você para no primeiro inimigo que tocar.', 'No Escudo você quica. Se errar, freia no fim do caminho.'],
  gravity: [`Jogue no meio de um grupo: puxa inimigos até ${n1(GRAVITY.wizR)} m e queima quem fica a ${n1(L1('gravity').radius)} m. Também puxa projéteis de qualquer dono.`, `É lento (${n1(L1('gravity').speed)} m/s): dá para sair andando.`],
  rockpillar: [`Erga entre você e um projétil: a parede (2 m, atravessada no caminho) segura magos e projéteis por ${n1(L1('rockpillar').duration)} s.`, `Magias quebram a parede (${OBSTACLES.rockpillar.hp} de vida para ela toda), e ela explode ao quebrar.`],
  bouncer: [`Melhor com inimigos juntos: pula para o mago mais perto, perdendo ${pct(1 - BOUNCER.decay)} do dano por inimigo.`, 'Contra um inimigo sozinho é só um acerto.'],
  drain: ['Mire perto do grupo: depois do ponto, vira para o mago mais perto. No inimigo, dano, lentidão e a vida volta para você; no aliado, cura e pressa.', `É lento (${n1(L1('drain').speed)} m/s) e o Escudo devolve.`],
  snowball: ['Quem encosta é arrastado junto: role na direção da lava. No fim do caminho ela explode.', `Muito lenta (${n1(L1('snowball').speed)} m/s) e de alcance curto: dá para sair da frente.`],
  twin: ['Dois projéteis em curva se encontram no ponto: fecham a fuga para os lados.', 'O Escudo devolve os dois em linha reta.'],
  magnetize: ['Magnetize o inimigo e atire perto dele: os seus projéteis curvam até ele. Em você ou num aliado, afasta os projéteis inimigos.', 'Só curva projéteis que passam perto (menos de 2 m).'],
  recharge: [`Se acertar, ela volta até você e zera a recarga: lance de novo, com +${RECHARGE.perHit} de dano por acerto seguido.`, `Errar zera a sequência e a recarga é longa (${n1(L1('recharge').cd)} s no nível 1).`],
  alteration: [`Ligue quando um projétil estiver chegando: por ${n1(L1('alteration').duration)} s você troca de lugar com o primeiro que entrar na bolha.`, 'Não serve contra Raio, Meteoro, Flagelo e explosões, que não são projéteis.'],
  link: ['Puxe o inimigo para perto (e para o seu Meteoro), ou prenda num obstáculo e puxe-se até ele para fugir.', 'O Escudo faz o Elo quicar e voltar.'],
  windwalk: ['Fique invisível, chegue perto e encoste: o primeiro inimigo leva dano. Também serve para fugir sem ser visto.', `Lançar qualquer magia desfaz; dura ${n1(L1('windwalk').duration)} s.`],
  splitter: ['Estoura no ponto (ou no primeiro que tocar) em 8 projéteis em leque: cobre uma área ou acerta quem está atrás de obstáculo.', 'Cada filhote é fraco; de longe eles se espalham.'],
  warpzone: [`Ponha entre você e os projéteis: dentro dela os projéteis inimigos andam a ${pct(L1('warpzone').scale)} (nível 1) e os inimigos a ${pct(WARPZONE.wizMult)} da velocidade.`, 'Não para o Raio nem áreas.'],
};

// grimório: o que a demonstração do item mostra (itens sem demonstração não aparecem aqui)
export const ITEM_DEMO: Partial<Record<keyof typeof ITEMS, string>> = {
  scourge: 'Você explode em volta e empurra os dois magos de treino.',
  redirector: 'A Bola de fogo sai para o lado e o Redirecionador a desvia para o mago de treino.',
  pact: 'Pacto e depois Bola de fogo: dano e empurrão dobrados.',
  aegis: 'O mago de treino tem a Égide: cai na lava com pouca vida e volta para a pedra.',
};

// loja e ajuda: magias agrupadas pelo efeito principal (o que cada uma faz está em RULES_SHORT)
export const SPELL_GROUPS: [name: string, hint: string, spells: SpellId[]][] = [
  ['Ataque', 'dano e empurrão', ['fireball', 'lightning', 'homing', 'meteor', 'cluster', 'boomerang', 'bouncer', 'twin', 'recharge', 'splitter', 'snowball']],
  ['Mobilidade', 'sair do lugar', ['teleport', 'swap', 'rush', 'thrust', 'windwalk']],
  ['Defesa', 'parar o que vem', ['shield', 'alteration', 'warpzone', 'rockpillar']],
  ['Controle', 'prender, puxar, atrasar', ['grip', 'gravity', 'link', 'magnetize', 'drain']],
];

// para que serve, em uma linha (cartão da loja)
export const SPELL_USE: Record<SpellId, string> = {
  fireball: 'Ataque básico: empurra de longe.',
  lightning: 'Acerta na hora, sem tempo de desviar.',
  homing: 'Persegue quem foge ou desvia.',
  meteor: 'Pune grupos e quem fica parado.',
  cluster: 'Muito dano de perto.',
  boomerang: 'Acerta na ida e na volta.',
  bouncer: 'Bom com os inimigos juntos.',
  twin: 'Fecha a fuga pelos dois lados.',
  recharge: 'Repete logo se você acertar.',
  splitter: 'Enche uma área de projéteis.',
  snowball: 'Arrasta inimigos para a lava.',
  teleport: 'Fugir da lava ou de um ataque.',
  swap: 'Põe o inimigo no seu lugar ruim.',
  rush: 'Correr e aguentar dano por um tempo.',
  thrust: 'Avançar e acertar quem estiver no caminho.',
  windwalk: 'Sumir, reposicionar e surpreender.',
  shield: 'Devolve projéteis para quem lançou.',
  alteration: 'Escapa trocando de lugar com um projétil.',
  warpzone: 'Freia projéteis e inimigos para dar tempo de desviar.',
  rockpillar: 'Parede de pedra contra magos e projéteis.',
  grip: 'Segura o alvo para os outros acertarem.',
  gravity: 'Puxa inimigos e desvia projéteis.',
  link: 'Puxa o inimigo, ou você até um obstáculo.',
  magnetize: 'Atrai para o alvo os projéteis dos outros.',
  drain: 'Deixa lento e devolve vida a você.',
};

export const RULES_SHORT: Record<SpellId, string> = {
  fireball: 'Projétil reto. Dano e empurrão médios.',
  lightning: 'Instantâneo. Acerta o primeiro na linha.',
  homing: `Persegue por ${n1(L1('homing').duration)} s o inimigo mais perto da mira, virando devagar.`,
  shield: `Por ${n1(L1('shield').duration)} s, devolve projéteis e o Raio para quem lançou.`,
  teleport: 'Salta até o cursor (alcance curto).',
  swap: 'Voa até o alcance e troca de lugar com o primeiro mago que tocar; sem ninguém, leva você até a metade do caminho da mira.',
  grip: 'Prende o alvo no lugar até o primeiro golpe, que o solta e empurra mais longe.',
  meteor: `Cai em área no ponto marcado, ${METEOR_DELAY.toLocaleString('pt-BR')} s depois.`,
  rush: `Avança ${n1(RUSH.dash)} m na direção da mira e fica mais rápido; parte do dano levado vira mais velocidade.`,
  cluster: 'Quatro projéteis em leque, curto alcance.',
  boomerang: 'Vai em curva até o ponto e volta para você; acerta na ida e na volta.',
  thrust: 'Você dispara até o ponto; o primeiro inimigo que tocar leva dano conforme a sua velocidade.',
  gravity: 'Orbe lento que puxa magos inimigos e projéteis e queima quem fica perto.',
  rockpillar: `Ergue uma parede baixa de pedra (2 m) atravessada no caminho por ${n1(L1('rockpillar').duration)} s: bloqueia magos e projéteis.`,
  bouncer: `Acerta e pula para o mago mais perto, perdendo ${pct(1 - BOUNCER.decay)} do dano a cada inimigo.`,
  drain: 'Vai até o ponto e vira para o mago mais perto: no inimigo, dano, lentidão e a vida volta para você; no aliado, cura e acelera.',
  snowball: 'Bola lenta que atravessa e arrasta quem encosta, com dano, e explode no fim do caminho.',
  twin: 'Dois projéteis em curva, um de cada lado, que se encontram no ponto.',
  magnetize: 'No inimigo, puxa para ele os projéteis dos outros; num aliado ou em você (depois de quicar), afasta.',
  recharge: 'Se acertar, volta e zera a própria recarga; cada acerto seguido soma dano.',
  alteration: `Por ${n1(L1('alteration').duration)} s, troca de lugar com o primeiro projétil inimigo que chegar perto.`,
  link: 'Prende num mago e o puxa até você (com dano no inimigo); num obstáculo, puxa você até ele.',
  windwalk: `Invisível e mais rápido por ${n1(L1('windwalk').duration)} s; o primeiro inimigo em que encostar leva dano. Lançar magia desfaz.`,
  splitter: 'Estoura no ponto (ou no primeiro que tocar) em 8 projéteis que se abrem em leque.',
  warpzone: 'Esfera que deixa lentos os projéteis inimigos que passam por ela e os inimigos que andam dentro dela.',
};
