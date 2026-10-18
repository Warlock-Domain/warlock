import type { SpellId } from '../shared/spells.ts';

export const RULES: [string, string[]][] = [
  ['Objetivo', [
    'Empurre os outros magos para fora da arena. Na lava a vida cai 10 por segundo.',
    'A arena encolhe a cada 10 segundos até um tamanho mínimo (nunca some); a faixa que vai afundar pisca em vermelho antes. Ela é maior quanto mais magos tiver.',
    'O último vivo vence a rodada e ganha 1 ponto, como no Warlock original. Quem vencer 5 rodadas primeiro ganha a partida.',
    'A rodada só acaba quando sobra um. Se os últimos caírem juntos, vence quem tinha mais vida.',
    'Nos 2 primeiros segundos de cada rodada ninguém leva dano.',
    'As magias saem 0,1 s depois da tecla (Escudo, Teleporte, Troca e Investida na hora) e o mago fica parado enquanto conjura; o clique de andar vale assim que a magia sai.',
  ]],
  ['Deathmatch', [
    'Quem começa a partida escolhe o modo na sala de espera: Rodadas, Deathmatch ou Times (como no Warlock Brawl).',
    'Cada rodada dura 60 segundos e a arena não encolhe. Quem cai volta 10 segundos depois, num ponto sorteado na pedra longe dos inimigos, com vida cheia e 2 segundos sem levar dano; magias, itens e maestrias continuam.',
    'Cada abate vale 1 ponto (cair sozinho na lava não vale). Entre as rodadas tem a loja de sempre. A partida acaba no fim da rodada em que alguém chega a 15 pontos, e vence quem tiver mais (empate joga mais uma rodada).',
  ]],
  ['Times', [
    'Azul contra Vermelho, com times do mesmo tamanho (com número ímpar, um time tem 1 a mais). Na sala dá para escolher se os times são sorteados a cada rodada ou fixos na partida; isso também muda por votação.',
    'A rodada acaba quando só sobra gente de um time, e todos desse time ganham 1 ponto e o ouro da vitória. Com times fixos, quem chegar à meta leva a vitória para o time.',
    'Magia que acerta aliado só empurra: não tira vida nem dá abate. Míssil, Ricochete, Gravidade e Agarrar só pegam inimigos; a Troca com aliado vale.',
  ]],
  ['Controles no PC', [
    'Botão direito no chão: andar (segure para arrastar o destino). S: parar. Esc: cancela a magia escolhida.',
    'Tecla da magia: lança na direção do cursor (as suas teclas estão logo abaixo). Clicar no botão da magia e depois no chão também lança.',
    'Roda do mouse: zoom. Espaço + arrastar com o botão esquerdo: mover a câmera; Espaço sozinho volta ao centro.',
    'Tab (segurar): placar; com ele aberto, ← → troca entre Rodada, Partida e Sala. Na loja o Tab anda pelos botões e o placar fica no botão Placar.',
    'Y: taunts (frase com som em cima do seu mago); o número escolhe. Também no botão 💬.',
    'Votar, no topo: trocar o modo da próxima rodada ou expulsar alguém; passa com mais da metade dos jogadores.',
    'Dá para trocar a tecla de cada magia e item no botão ⌨️, ou usar Q W E R D F pela ordem da barra (fica salvo no navegador).',
  ]],
  ['Controles no celular', [
    'Toque no chão para andar.',
    'Toque no botão da magia e depois no chão para lançar; o ✕ do aviso cancela.',
    '📊 no topo abre o placar, 💬 manda taunts e Votar troca o modo ou expulsa alguém.',
  ]],
  ['Loja', [
    'Você começa com 30 de ouro, a Bola de fogo e o Flagelo (tecla 1), e ganha 10 de ouro a cada rodada, como no Warlock original. A loja dura 30 s.',
    'Compre magias novas ou melhore até o nível 7 (mais dano e empurrão, menos recarga). Cada mago pode ter no máximo 6 magias (a Bola de fogo conta); desfazer uma compra libera a vaga.',
    'Quanto mais dano você já levou na rodada, mais longe voa quando é acertado. Na pedra a vida volta devagar.',
    'As magias vêm agrupadas por função (Ataque, Mobilidade, Defesa, Controle). Passe o mouse ou toque numa magia para ver os números do nível atual e do próximo.',
  ]],
  ['Créditos', [
    'Personagens e decoração: KayKit, de Kay Lousberg (kaylousberg.com). Texturas: ambientCG e Poly Haven. Partículas e sons: Kenney e OpenGameArt. Música: "Determined Pursuit", de Emma_MA. Tudo em domínio público (CC0).',
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
  grip: 'Prende o alvo no lugar e reduz o empurrão dele.',
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
