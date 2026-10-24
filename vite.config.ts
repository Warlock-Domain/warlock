import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// saída de um comando git; vazio fora de um repositório (build sem .git)
const git = (args: string) => {
  try {
    return execSync('git ' + args).toString().trim();
  } catch {
    return '';
  }
};
// versão mostrada em Configurações > Sobre: dia do build e o commit
const commit = git('rev-parse --short HEAD');
// branch que dá nome à aba de teste em localhost (main.ts). Lida uma vez e gravada no bundle: com `vite build` + `wrangler dev`,
// trocar de branch sem refazer o build mostra o nome antigo. Fica também no build de produção (o filtro de hostname a esconde no ar)
// porque o `wrangler dev` das sessões serve esse mesmo `dist`.
const branch = git('rev-parse --abbrev-ref HEAD');

export default defineConfig({
  // only this checkout's tests: without it the run also sweeps the agent worktrees under .claude/
  test: { include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'] }, // tests run in Portuguese
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10) + (commit ? ` · ${commit}` : '')), __BRANCH__: JSON.stringify(branch) },
  server: {
    proxy: {
      '/api': 'http://localhost:8797',
      '/ws': { target: 'ws://localhost:8797', ws: true },
    },
  },
});
