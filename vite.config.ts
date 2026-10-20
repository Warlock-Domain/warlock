import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// versão mostrada em Configurações > Sobre: dia do build e o commit
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return '';
  }
})();

// branch que dá nome à aba de teste em localhost (main.ts). Lida uma vez e gravada no bundle: com `vite build` + `wrangler dev`,
// trocar de branch sem refazer o build mostra o nome antigo. Fica também no build de produção (o filtro de hostname a esconde no ar)
// porque o `wrangler dev` das sessões serve esse mesmo `dist`.
const branch = (() => {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  } catch {
    return '';
  }
})();

export default defineConfig({
  test: { setupFiles: ['tests/setup.ts'] }, // idioma pt nos testes
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10) + (commit ? ` · ${commit}` : '')), __BRANCH__: JSON.stringify(branch) },
  server: {
    proxy: {
      '/api': 'http://localhost:8797',
      '/ws': { target: 'ws://localhost:8797', ws: true },
    },
  },
});
