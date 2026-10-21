# Loja abaixo da barra do topo (issue #26, PR #139)

Loja aberta no meio da partida, em português, PC 1280×720 e 1920×1080.

| | Janela da loja | Barra do topo | Clique no botão de sair cai em |
|---|---|---|---|
| antes (1280×720) | y 12 a 708 | y 8 a 52 | a janela da loja |
| depois (1280×720) | y 56 a 708 | y 8 a 52 | o próprio botão |
| antes (1920×1080) | y 12 a 1068 | y 8 a 52 | a janela da loja |
| depois (1920×1080) | y 56 a 1068 | y 8 a 52 | o próprio botão |

Como foram feitos: Chrome sem janela (`scripts/lib/browser.mjs`) contra `wrangler dev`, partida criada por `POST /api/rooms`, tela parada na fase de loja. Os "antes" são o mesmo build com a regra antiga de `.center.shop-open` (centralizada, `max-height: calc(100% - 24px - ...)`) reinjetada por `addStyleTag`; os "depois" são o build da branch. O clique foi medido com `document.elementFromPoint` no centro do botão "Sair da sala".
