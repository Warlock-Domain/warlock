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

- Cabeçalho com `chave: valor` separados por 2 ou mais espaços. Pools: `entrada`, `meio`, `portão`, `chefe`. Na arena do chefe, `entrada: X` no lugar de `saídas`.
- 1 caractere = 1 casa (1 m, a ajustar jogando). Todas as linhas da grade com o mesmo tamanho.
- Saídas: a mesma letra repetida na borda forma a abertura (`LLL`, `NNNN`). Liga O com L, N com S e X com X (a passagem para a arena do chefe); as aberturas se alinham pelo meio.

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
