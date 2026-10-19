# src/worker — Cloudflare Workers + Durable Objects

Vale junto com o `CLAUDE.md` da raiz. Tipos à parte: `npx tsc --noEmit -p src/worker`.

- **Toda mensagem passa por `parseClientMessage` primeiro** (`webSocketMessage` em `room-do.ts`); inválida responde `{ t: 'error', code: 'bad_msg' }`. O `playerId` vem do attachment do socket, nunca da mensagem. O cliente só conhece ids públicos (`byPublic()` traduz).
- Um socket é uma pessoa: `hello` com outro id é recusado; segunda aba do mesmo jogador derruba a primeira (`other_tab`).
- Comandos de jogo (`move`, `stop`, `cast`, `item`) só entram na fila com a partida em `playing`; o `seq` vai para `acks` (o cliente reconcilia a previsão).
- Regra de negócio é de `match.ts`: o worker chama a função e, se ela devolve `true`, faz `await this.changed()`.
- **Limite por jogador** para mensagem que grava a sala: siga o padrão do `look` (mapa por jogador + janela em ms, 100 ms) e do taunt (`TAUNT_COOLDOWN_MS`).
- **Gravar só em `changed()` → `persist()`**, nunca no laço de 16 ms. `persist` grava a partida sem o `World`. Em `changed()`: avisa clientes, liga ou desliga o laço, arma o alarme, só então grava disco e lobby (falha do lobby não congela a sala). Chamada que pode falhar vai em `try/catch` com comentário.
- **Telemetria:** fim de rodada fora da sandbox chama `lobby().record(roundRecord(...))` com `.catch(() => {})`. A agregação mora em `src/shared/telemetry.ts`, não aqui. Sandbox não grava telemetria.
- **Rotas** (`index.ts`): fila de `if` por `url.pathname`. Leitura nova segue `GET /api/telemetry` (JSON com `cache-control: no-store`). Resto devolve 404.
- Cada branch `<usuário>-dev` e a `dev` (dev geral) publicam um Worker separado (`warlock-<branch>`, `.github/workflows/dev-deploy.yml`): o `wrangler.jsonc` não muda por ambiente; a pipeline troca só nome e rota.
