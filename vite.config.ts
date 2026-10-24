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
  test: { setupFiles: ['tests/setup.ts'] }, // idioma pt nos testes
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10) + (commit ? ` · ${commit}` : '')), __BRANCH__: JSON.stringify(branch) },
  // /forum is a second page: the assets binding serves dist/forum.html at /forum, so the worker needs no route for it.
  // The game key stays `index`: entry chunks take the key's name and deploy.yml checks the served index-*.js
  build: { rollupOptions: { input: { index: 'index.html', forum: 'forum.html' } } },
  server: {
    proxy: {
      '/api': 'http://localhost:8797',
      '/ws': { target: 'ws://localhost:8797', ws: true },
    },
  },
});
