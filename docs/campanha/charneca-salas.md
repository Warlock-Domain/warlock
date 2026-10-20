# Campanha — como desenhar salas

As salas de cada estágio ficam em `src/shared/levels/<estágio>.ts` (a Charneca Cinzenta em `charneca.ts`), em texto, do jeito que foram desenhadas. O jogo lê esse texto direto (`src/shared/levels.ts`) e monta cada noite sorteando salas pela semente: objetivo fixo (entrada → 2 ou 3 salas do meio → portão → arena do chefe), caminho diferente a cada noite e, nas saídas que sobram, até 2 salas laterais opcionais. `tests/levels.test.ts` acusa grade torta, símbolo desconhecido e saída que não bate com o cabeçalho, sempre com o nome da sala.

## Formato

```
sala: moinho-caido-01   estágio: charneca   pool: meio
saídas: O, L

##############################
O......E.....#####.....E.....L
...
##############################

C1: notas do encontro (texto livre, depois da grade)
```

- Cabeçalho com `chave: valor` separados por 2 ou mais espaços. Pools: `entrada`, `meio`, `portão`, `chefe`. Na arena do chefe, `entrada: X` no lugar de `saídas` e `chefe: <nome>` diz quem é o chefe (hoje `Sir Odran, o Elmo Vazio`; o comportamento dele fica em `src/shared/bosses.ts`). Nome desconhecido é erro.
- 1 caractere = 1 casa (1 m, a ajustar jogando). Todas as linhas da grade com o mesmo tamanho.
- Saídas: a mesma letra repetida na borda forma a abertura (`LLL`, `NNNN`). Liga O com L, N com S e X com X (a passagem para a arena do chefe); as aberturas se alinham pelo meio.

## Encontro da sala

Nas notas (depois da grade), as linhas abaixo são lidas pelo jogo; o resto é texto livre:

```
onda 1: 2 Cinzentos @E1, 2 Cinzentos @E2
onda 2: 1 Arqueiro de Fuligem @E1, 1 Arqueiro de Fuligem @E2
lápides: 1 Vigia Oco a cada 10 s, até 3
```

- Os `E` são numerados na ordem de leitura da grade (de cima para baixo, da esquerda para a direita): o primeiro é `E1`.
- Cada onda entra quando a anterior cai; no máximo 4 servos por onda (as vagas da sala). Vários pelo mesmo `E` nascem lado a lado.
- `lápides`: durante o encontro, a cada tantos segundos uma lápide (`I`) da sala racha e solta mais um servo, até o número dado; a sala só é vencida depois disso.
- A arena com `chefe:` tem o chefe como encontro, entrando pelo `B`. Sala sem linha `onda` e sem chefe usa ondas sorteadas pela noite.

Servos (nome no singular ou no plural):

| Servo | Plural | Vida | Ataque | Observação |
|---|---|---|---|---|
| Cinzento | Cinzentos | 200 | Bola de fogo | o básico |
| Arqueiro de Fuligem | Arqueiros de Fuligem | 200 | Raio | atira por cima da mureta |
| Vigia Oco | Vigias Ocos | 150 | Míssil teleguiado | sai das lápides |
| Cão de Brasa | Cães de Brasa | 250 | Investida | 1,4× mais rápido (ainda com o modelo de esqueleto guerreiro) |

Nenhum servo regenera vida.

## Legenda

| Símbolo | O que é |
|---|---|
| `#` | parede ou casa: bloqueia passagem e magia |
| `.` | chão |
| `=` | piso da ponte (chão) |
| `:` | mureta: bloqueia o passo, a magia passa por cima |
| `%` | destroço: bloqueia passo e magia até quebrar |
| `~` | cera: deixa lento |
| `*` | vala / abismo: quem é empurrado para dentro cai e volta à beira de onde caiu, com menos vida |
| `T` | árvore queimada (obstáculo que quebra) |
| `I` | estátua, lápide ou pilar; `I` encostados viram um bloco só (os pilares 2×2 da arena) |
| `$` | baú: dá uma recompensa sorteada (carta extra, cura ou runa, ou fragmento) |
| `@` | início do grupo |
| `+` | vela do Santuário: descanso antes do chefe (cartas e reacender quem caiu) |
| `C1`, `C2`… | ponto de controle: quem pisa puxa todos os Acesos para a sala e começa o encontro |
| `E` | entrada dos inimigos do encontro |
| `B` | onde o chefe aparece |
| `N` `S` `O` `L` `X` | saídas, na borda |
