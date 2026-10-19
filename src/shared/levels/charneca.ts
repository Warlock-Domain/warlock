// Salas da Charneca Cinzenta, desenhadas pelo Lucas (level design da Campanha). O texto é a fonte: o jogo lê estas grades
// do jeito que estão (levels.ts). Para mudar uma sala, edite aqui; o teste tests/levels.test.ts acusa grade torta,
// saída que não bate com o cabeçalho e símbolo desconhecido. Formato e legenda em docs/campanha/charneca-salas.md.
export const CHARNECA = `
sala: charneca-entrada-01   estágio: charneca   pool: entrada
saídas: L

##############################
#..T.................T.......#
#...........:::::............#
#..@........:...:......E.....#
#...........:...:............L
#......................~~~...L
#..T...................~~~...L
#..........C1................#
#............................#
#....T..................T....#
##############################

C1: onda de tutorial, 3 Cinzentos pelo E. A mureta em U ensina que dá para atirar por cima da cobertura baixa.

sala: moinho-caido-01   estágio: charneca   pool: meio
saídas: O, L

##############################
#.......%%.........%%........#
#...T...%%....###..%%....T...#
#............#####...........#
O......E.....#####.....E.....L
O..........:..###..:.........L
O..........:...C1..:.........L
#...T...%%.........%%....T...#
#.......%%.........%%........#
#............................#
##############################

C1: 2 Cinzentos por cada E, depois 1 Arqueiro de Fuligem em cada E.
Os destroços (%) podem ser quebrados para abrir linhas de tiro.

sala: vilarejo-queimado-02   estágio: charneca   pool: meio
saídas: O, N, L

#############NNNN#############
#.####......:....:......####.#
#.#$........:....:.......E.#.#
#.####......:....:......####.#
O......T..............T......L
O..........~~~~~~~~..........L
O......T...~~~C1~~~...T......L
#..........~~~~~~~~..........#
#..E......................E..#
#............................#
##############################

C1: fica no meio da cera, então a onda começa com o jogador lento.
3 Cinzentos pelos E de baixo, 1 Cão de Brasa saindo da casa da direita.
O baú ($) fica na casa da esquerda, de entrada pelo lado leste.

sala: cemiterio-dos-vigias-01   estágio: charneca   pool: meio
saídas: O, S

##############################
#...I...I...I....I...I...I...#
#............................#
#...I...I...I....I...I...I...#
O.............$..............#
O...I...I....C1......I...I...#
O............................#
#E..I...I...I....I...I...I..E#
#............................#
#...I...I................I...#
#############SSSS#############

C1: 4 Vigias Ocos (arqueiros mortos) pelos E. A cada 10 s uma lápide
racha e libera mais um, até 3. O baú no centro é a isca.


sala: ponte-dos-enforcados-01   estágio: charneca   pool: meio
saídas: O, L

##############################
#....T......******.....T.....#
#...........******.....E.....#
#..E........******...........#
O......:....======....:......L
O......:....==C1==....:......L
O......:....======....:......L
#...........******...........#
#....T......******......T....#
#...........******...........#
##############################

C1: no meio da ponte. Arqueiros de Fuligem atiram dos dois lados
por cima das muretas. Habilidades de empurrão jogam inimigos na vala.

sala: charneca-portao-01   estágio: charneca   pool: portão
saídas: O, X

##############################
#..T.......I...I...I...I.....#
#............................#
#..........I...I...I...I.....#
O............................X
O...+........................X
O............................X
#..........I...I...I...I.....#
#............................#
#..T.......I...I...I...I.....#
##############################

Sem inimigos: é a sala de respiro antes do chefe. As estátuas (I) são
armaduras vazias enfileiradas, um prenúncio de Sir Odran.


sala: arena-odran-01   estágio: charneca   pool: chefe
chefe: Sir Odran, o Elmo Vazio   entrada: X (40×15)

########################################
#####..............................#####
###..................................###
##....................................##
#......II......................II......#
#......II......................II......#
X..............~~~~~~~~~~..............#
X...................B..................#
X..............~~~~~~~~~~..............#
#......II......................II......#
#......II......................II......#
##....................................##
###..................................###
#####..............................#####
########################################

Odran investe em linha reta. Se bater num pilar (II), o pilar
desmorona e ele fica atordoado por 3 s: é a janela de dano.
Quando os 4 pilares caem, começa a fase 2 e a cera se espalha
pela arena a cada investida.
`;
