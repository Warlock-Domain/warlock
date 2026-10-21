# scripts — simulador, testes no navegador e ativos

Vale junto com o `CLAUDE.md` da raiz.

- Os `.ts` rodam direto com `node scripts/x.ts` (sem ts-node/tsx): imports com extensão `.ts` e só TypeScript apagável (sem `enum`, sem `namespace`). Argumentos por `parseArgs` de `node:util`; argumento inválido vira `throw` no começo.
- **`balance-sim.ts`:** `--minutes`, `--seed`, `--difficulty easy|normal|hard`, `--plan random|classic|smart`, `--arena`, `--rounds`, `--every`, `--out`; juntar processos com `--merge --out <total> <p1> <p2>…`. Grava `summary.json` e `report.md` em `balance/` (fora do git).
- **`build-tournament.ts`:** `--pop`, `--keep`, `--gen` além de `--minutes`/`--seed`/`--difficulty`/`--out`; roda com prioridade baixa.
- **`sim-lib.ts`** é a base comum: `seedRandom(seed)` (mulberry32, também troca `Math.random`), `playMatch`, `adjusted` (vitória ajustada pelo ouro), `writeAtomic`.
- **Navegador:** os `*-headless.mjs` importam `openChrome` de `scripts/lib/browser.mjs` (perfil temporário; `PW_PROFILE=<pasta>` para perfil fixo; `PW_CHANNEL=chromium` para o Chromium do Playwright). Argumentos `base pasta [largura altura]`; abaixo de 700 px vira celular com toque. Script novo de navegador usa o mesmo `openChrome`.
- **`smoke.mjs <url>`** usa WebSocket nativo (sem Playwright); falha com `SMOKE FAIL` e código 1. Roda no domínio depois de toda publicação.
- **`slim-character.mjs <original.glb> public/models/<id>.glb [nós a remover] [glbs do pacote]`** corta um boneco KayKit: fica só o que está no `KEEP` (clips do próprio boneco) e no `PACK` (copiados osso a osso dos glbs do KayKit Character Animations 1.1, `Rig_Medium`). Clip novo entra numa das listas e ganha gatilho em `CAST_ANIM`/`TAUNT_ANIM` (`src/client/scene.ts`); regere os 9 bonecos e depois rode `scripts/assets/hood.mjs` (capuz no `rogue.glb`).
- `scripts/assets/` monta `public/icons.svg` e outros ativos: rode à mão e commite o resultado, com crédito em `public/CREDITS.txt` e uma linha em `docs/ASSETS.md`.
- **`assets/kaykit-index.mjs`** refaz `assets/kaykit/INDICE.md` (nome de cada modelo por pack); rode sempre que um pack entrar, sair ou mudar.
