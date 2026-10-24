<!--
Título no formato do commit: `tipo: o que muda, em português` (tipos: feat, fix, balance, style, refactor, docs, ci, test).
Ex.: `feat: runa de gelo que deixa o inimigo lento por 3 s`. O título vira o commit no `master`.
-->

Closes #<!-- número da issue, se houver; a palavra tem de ser em inglês (Closes, Fixes ou Resolves) para o GitHub fechar a issue sozinho -->

## Por quê

<!-- O problema ou a ideia, em uma ou duas frases. -->

## O que muda

<!-- O que o jogador vê de diferente, ou o que muda por dentro. Lista curta. -->

## Prints

<!-- Obrigatório se mudou algo na tela: antes e depois, no PC. Sem print de celular por enquanto. Arraste as imagens aqui. -->

| Antes | Depois |
|---|---|
|  |  |

## Como testei

- [ ] `npm run typecheck` (cliente, servidor e scripts)
- [ ] `npx vitest run`
- [ ] `npx vite build`
- [ ] Joguei no navegador (`npx wrangler dev`) no PC
- [ ] Textos novos em português e inglês (`t('pt', 'en')`)
- [ ] Decisão não óbvia com 1 linha de comentário explicando o porquê
- [ ] Asset novo: licença livre, crédito em `public/CREDITS.txt` e linha em `docs/ASSETS.md` (o que é, onde o código usa, de onde veio)
- [ ] Interface com as peças que já existem (`dialog()`, `iconButton()`, `tabs()`, `choice()`, `searchFilter()`, `withTip`) e as variáveis do `:root`; peça nova só se nenhuma serve, registrada em `src/client/CLAUDE.md`

## Balanceamento

<!-- Só se mexeu em número de magia, item ou bot: rodadas simuladas por dificuldade e a vitória ajustada antes → depois (faixa 0,85 a 1,15 no Normal e no Difícil). Senão, apague esta seção. -->
