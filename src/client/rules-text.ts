export const RULES: [string, string[]][] = [
  ['Objetivo', [
    'Empurre os outros magos para fora da arena. Na lava a vida cai 10 por segundo.',
    'A arena encolhe a cada 10 segundos até um tamanho mínimo (nunca some); a faixa que vai afundar pisca em vermelho antes. Ela é maior quanto mais magos tiver.',
    'O último vivo vence a rodada e ganha 1 ponto, como no Warlock original. Quem vencer 5 rodadas primeiro ganha a partida.',
    'A rodada só acaba quando sobra um. Se os últimos caírem juntos, vence quem tinha mais vida.',
    'Nos 2 primeiros segundos de cada rodada ninguém leva dano.',
    'As magias saem 0,1 s depois da tecla (Escudo e Teleporte na hora) e o mago fica parado enquanto conjura; o clique de andar vale assim que a magia sai.',
  ]],
  ['Deathmatch', [
    'Quem começa a partida escolhe o modo na sala de espera: Rodadas ou Deathmatch (como no Warlock Brawl).',
    'Cada rodada dura 60 segundos e a arena não encolhe. Quem cai volta 10 segundos depois, num ponto sorteado na pedra longe dos inimigos, com vida cheia e 2 segundos sem levar dano; magias, itens e maestrias continuam.',
    'Cada abate vale 1 ponto (cair sozinho na lava não vale). Entre as rodadas tem a loja de sempre. A partida acaba no fim da rodada em que alguém chega a 15 pontos, e vence quem tiver mais (empate joga mais uma rodada).',
  ]],
  ['Controles no PC', [
    'Botão direito no chão: andar (segure para arrastar o destino). S: parar.',
    'Q bola de fogo · W raio · E míssil teleguiado · R escudo · F teleporte: saem na direção do cursor.',
    'Espaço: centralizar a câmera. Tab: placar.',
    'Dá para trocar a tecla de cada magia e item no botão ⌨️ (fica salvo no navegador).',
  ]],
  ['Controles no celular', [
    'Toque no chão para andar.',
    'Toque no botão da magia e depois no chão para lançar.',
  ]],
  ['Loja', [
    'Você começa com 30 de ouro, a Bola de fogo e o Flagelo (tecla 1), e ganha 10 de ouro a cada rodada, como no Warlock original. A loja dura 30 s.',
    'Compre magias novas ou melhore até o nível 3 (mais dano e empurrão, menos recarga).',
    'Quanto mais dano você já levou na rodada, mais longe voa quando é acertado. Na pedra a vida volta devagar.',
  ]],
  ['Créditos', [
    'Personagens e decoração: KayKit, de Kay Lousberg (kaylousberg.com). Texturas: ambientCG e Poly Haven. Partículas e sons: Kenney e OpenGameArt. Música: "Determined Pursuit", de Emma_MA. Tudo em domínio público (CC0).',
    'Inspirado no Warlock do Warcraft 3 e no Warlock Brawl para Dota 2.',
  ]],
];
