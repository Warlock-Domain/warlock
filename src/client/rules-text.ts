import { LAVA_DPS, RUNE, SHRINK_EVERY, STREAK, SUDDEN, VOTE_MS } from '../shared/constants.ts';
import { DM_GOALS, OPTION_CHOICES } from '../shared/match.ts';
import type { SpellId } from '../shared/spells.ts';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const list = (xs: readonly (string | number)[]) => xs.map(String).join(', ').replace(/, ([^,]*)$/, ' ou $1');

export const RULES: [string, string[]][] = [
  ['Objetivo', [
    `Empurre os outros magos para fora da arena. Na lava a vida cai ${LAVA_DPS} por segundo.`,
    'A arena encolhe a cada 10 segundos até um tamanho mínimo (nunca some); a faixa que vai afundar pisca em vermelho antes. Ela é maior quanto mais magos tiver.',
    'O último vivo vence a rodada e ganha 1 ponto, como no Warlock original. Quem vencer 5 rodadas primeiro ganha a partida (padrão; muda nas opções).',
    'A rodada só acaba quando sobra um. Se os últimos caírem juntos, vence quem tinha mais vida.',
    'Nos 2 primeiros segundos de cada rodada ninguém leva dano.',
    'As magias saem 0,1 s depois da tecla (Escudo, Teleporte, Troca e Investida na hora) e o mago fica parado enquanto conjura; o clique de andar vale assim que a magia sai.',
  ]],
  ['Deathmatch', [
    'Quem começa a partida escolhe o modo na sala de espera: Rodadas, Deathmatch ou Times (como no Warlock Brawl).',
    'Cada rodada dura 60 segundos e a arena não encolhe. Quem cai volta 10 segundos depois, num ponto sorteado na pedra longe dos inimigos, com vida cheia e 2 segundos sem levar dano; magias, itens e maestrias continuam.',
    'Cada abate vale 1 ponto (cair sozinho na lava não vale). Entre as rodadas tem a loja de sempre. A partida acaba no fim da rodada em que alguém chega a 15 pontos (padrão; muda nas opções), e vence quem tiver mais (empate joga mais uma rodada).',
  ]],
  ['Times', [
    'Azul contra Vermelho, com times do mesmo tamanho (com número ímpar, um time tem 1 a mais). Na sala dá para escolher se os times são sorteados a cada rodada ou fixos na partida; isso também muda por votação.',
    'A rodada acaba quando só sobra gente de um time, e todos desse time ganham 1 ponto e o ouro da vitória. Com times fixos, quem chegar à meta leva a vitória para o time.',
    'Magia que acerta aliado só empurra: não tira vida nem dá abate. Míssil, Ricochete, Gravidade e Agarrar só pegam inimigos; a Troca com aliado vale.',
  ]],
  ['Runas e morte súbita', [
    `Runas: aparece uma por vez num ponto livre da arena, a primeira aos ${RUNE.first} s e a próxima ${RUNE.every} s depois que alguém pega (ou a lava engole). Encoste para pegar; o efeito dura ${RUNE.secs} s.`,
    `Pressa: +${pct(RUNE.haste)} de velocidade · Fúria: +${pct(RUNE.fury)} de dano · Escudo: absorve ${RUNE.shield} de dano (o empurrão continua) · Recarga: zera as recargas na hora.`,
    `Morte súbita (Rodadas e Times): passados ${SUDDEN.at} s de rodada, a arena encolhe a cada ${SUDDEN.every} s em vez de ${SHRINK_EVERY}.`,
  ]],
  ['Sequências de abate', [
    `Abates com até ${STREAK.window} s entre eles viram Abate duplo, Abate triplo e Massacre (o locutor grita em inglês).`,
    `Abates sem morrer (contam de uma rodada para a outra): ${STREAK.spree[0]} é Matança, ${STREAK.spree[1]} Fúria assassina, ${STREAK.spree[2]} Imparável e ${STREAK.spree[3]} Lendária.`,
    `Quebra-combo: quem derruba alguém com ${STREAK.breakAt} ou mais abates seguidos ganha +${STREAK.breakGold} de ouro (vezes o multiplicador de ouro da sala).`,
  ]],
  ['Opções da partida e votações', [
    `Quem começa a partida escolhe na sala de espera: tempo de loja (${list(OPTION_CHOICES.shop)} s; acaba antes se todos apertarem Pronto), ritmo da contagem e do fim de rodada, ouro ganho (×${list(OPTION_CHOICES.economy.map((x) => x.toLocaleString('pt-BR')))}, vale para toda renda), ouro inicial (${list(OPTION_CHOICES.startGold)}, também multiplicado) e rodadas para vencer (${list(OPTION_CHOICES.goal)}; no Deathmatch ${list(Object.values(DM_GOALS))} abates).`,
    'Também dá para desligar as runas, a morte súbita e os baús de ouro.',
    `Votar, no topo: trocar o modo, mudar uma opção, sortear ou fixar os times, pôr ou tirar um bot, pular a loja, reiniciar, encerrar agora ou expulsar alguém. Passa com mais da metade dos jogadores; a votação fecha em ${VOTE_MS / 1000} s e o que muda vale na próxima rodada.`,
  ]],
  ['Controles no PC', [
    'Botão direito no chão: andar (segure para arrastar o destino). S: parar. Esc: cancela a magia escolhida.',
    'Tecla da magia: segurando, aparece o círculo de alcance em volta do mago; ao soltar, a magia sai na direção do cursor (Esc cancela; as suas teclas estão logo abaixo). Clicar no botão da magia e depois no chão também lança, com o mesmo círculo.',
    'Roda do mouse: zoom. Espaço + arrastar com o botão esquerdo: mover a câmera; Espaço sozinho volta ao centro.',
    'Tab (segurar): placar; com ele aberto, ← → troca entre Rodada, Partida e Sala. Na loja o Tab anda pelos botões e o placar fica no botão Placar.',
    'Y: provocações (frase com som em cima do seu mago); o número escolhe. Também no botão do balão de fala, no topo.',
    "Tecla à esquerda do 1 (' no teclado brasileiro): ficha do mago, com vida, velocidade, empurrão, magias, itens e efeitos de agora. Também no botão do pergaminho, no topo.",
    'Votar, no topo: abre as votações da partida (a lista está em "Opções da partida e votações").',
    'Dá para trocar a tecla de cada magia e item no botão do teclado, no topo, ou usar Q W E R D F pela ordem da barra (fica salvo no navegador).',
  ]],
  ['Controle (Xbox ou PlayStation)', [
    'Ligue o controle e aperte qualquer botão: aparece "Controle conectado" e a barra passa a mostrar os botões do controle. Tecla ou mouse voltam a mostrar as teclas.',
    'Analógico esquerdo: andar (soltar para). Analógico direito: mirar; o anel dourado no chão mostra onde, mais longe quanto mais inclinado, e o círculo fino em volta do mago mostra o alcance da última magia lançada. Sem mirar, a magia vai para onde você anda.',
    'A, B, X e Y (no PlayStation ✕, ○, □ e △), LB e RB (L1 e R1): as magias pela ordem da barra, da 1ª à 6ª. LT e RT (L2 e R2): itens ativos 1 e 2; D-pad ↑: item 3.',
    'Start (Options): ficha do mago na partida, Pronto na loja e esta ajuda nas outras telas. View ou Select (Share), segurado: placar. Apertar o analógico direito (R3): centraliza a câmera.',
    'Morto ou só assistindo: D-pad ← → troca quem a câmera segue (com o placar aberto, troca o período).',
    'Menus e loja: D-pad ou analógico esquerdo anda entre os botões (anel dourado), A confirma, B volta ou fecha, X desfaz a compra ou vende o item focado, Y mostra ou esconde a dica, LB e RB pulam entre os grupos da loja (com o placar aberto, trocam o período).',
    'Vibra ao levar golpe forte e ao morrer; dá para desligar no botão do teclado, no topo. Um controle por navegador (vale o primeiro conectado).',
  ]],
  ['Controles no celular', [
    'Toque no chão para andar.',
    'Toque no botão da magia e depois no chão para lançar; o ✕ do aviso cancela.',
    'No topo: o gráfico de barras abre o placar, o pergaminho abre a ficha do mago, o balão de fala manda provocações e a urna (Votar) troca o modo ou expulsa alguém.',
  ]],
  ['Loja', [
    'Você começa com 30 de ouro (nas opções padrão), a Bola de fogo e o Flagelo (tecla 1), e ganha 10 de ouro a cada rodada, como no Warlock original. A loja dura 30 s (dá para mudar nas opções).',
    'Compre magias novas ou melhore até o nível 7 (mais dano e empurrão, menos recarga). Cada mago pode ter no máximo 6 magias (a Bola de fogo conta); desfazer uma compra libera a vaga.',
    'Quanto mais dano você já levou na rodada, mais longe voa quando é acertado. Na pedra a vida volta devagar.',
    'As magias vêm agrupadas por função (Ataque, Mobilidade, Defesa, Controle). Passe o mouse ou toque numa magia para ver os números do nível atual e do próximo.',
  ]],
  ['Créditos', [
    'Personagens e decoração: KayKit, de Kay Lousberg (kaylousberg.com). Texturas: ambientCG e Poly Haven. Partículas e sons: Kenney e OpenGameArt. Música: "Determined Pursuit", de Emma_MA. Tudo em domínio público (CC0). Ícones: game-icons.net, de Lorc, Delapouite, Skoll, Sbed e Caro Asercion (CC BY 3.0; lista em CREDITS.txt).',
    'Inspirado no Warlock do Warcraft 3 e no Warlock Brawl para Dota 2.',
  ]],
];

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
  warpzone: 'Freia projéteis para dar tempo de desviar.',
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
  homing: 'Lento, persegue o alvo mais perto da mira.',
  shield: 'Reflete fogo, míssil e raio por 1,2 s.',
  teleport: 'Salta até o cursor (alcance curto).',
  swap: 'Voa até o alcance e troca de lugar com o primeiro mago que tocar; sem ninguém, leva você ao ponto da mira.',
  grip: 'Prende o alvo no lugar até o primeiro golpe, que o solta e empurra mais longe.',
  meteor: 'Cai em área no ponto marcado, após 1 s.',
  rush: 'Avança 3 m na direção do mouse e fica mais rápido; dano levado vira mais velocidade.',
  cluster: 'Quatro projéteis em leque, curto alcance.',
  boomerang: 'Vai em curva até o ponto e volta para você; acerta na ida e na volta.',
  thrust: 'Você dispara até o ponto; o primeiro inimigo que tocar leva dano conforme a sua velocidade.',
  gravity: 'Orbe lento que puxa magos inimigos e projéteis e queima quem fica perto.',
  rockpillar: 'Ergue um pilar de pedra no ponto por 4 s: bloqueia magos e projéteis.',
  bouncer: 'Acerta e pula para o mago mais perto, perdendo 30% do dano a cada inimigo.',
  drain: 'Vai até o ponto e vira para o mago mais perto: no inimigo, dano, lentidão e a vida volta para você; no aliado, cura e acelera.',
  snowball: 'Bola lenta que atravessa e arrasta quem encosta, com dano, e explode no fim do caminho.',
  twin: 'Dois projéteis em curva, um de cada lado, que se encontram no ponto.',
  magnetize: 'No inimigo, puxa para ele os projéteis dos outros; num aliado ou em você (depois de quicar), afasta.',
  recharge: 'Se acertar, volta e zera a própria recarga; cada acerto seguido soma dano.',
  alteration: 'Por 2 s, troca de lugar com o primeiro projétil inimigo que chegar perto.',
  link: 'Prende num mago e o puxa até você (com dano no inimigo); num obstáculo, puxa você até ele.',
  windwalk: 'Invisível e mais rápido por 2,6 s; o primeiro inimigo em que encostar leva dano. Lançar magia desfaz.',
  splitter: 'Estoura no ponto (ou no primeiro que tocar) em 8 projéteis que se abrem em leque.',
  warpzone: 'Esfera que deixa lentos os projéteis inimigos que passam por ela.',
};
