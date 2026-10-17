// Partida longa sem janela: rodada 1 até o fim, loja e começo da rodada 2, com fotos de cada fase.
// node scripts/long-headless.mjs <base> <pasta-fotos>
import { chromium } from 'file:///C:/nvm4w/nodejs/node_modules/@playwright/mcp/node_modules/playwright-core/index.mjs';

const [base, out] = process.argv.slice(2);
const ctx = await chromium.launchPersistentContext('C:/Users/ferna/AppData/Local/ms-playwright/mcp-chrome-7a379eb', {
  channel: 'chrome', headless: true, viewport: { width: 1280, height: 720 }, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
try {
  const { id } = await (await fetch(base + '/api/rooms', { method: 'POST' })).json();
  await page.addInitScript(() => localStorage.setItem('warlock:name:pw', 'Fernando'));
  await page.goto(base + '/?as=pw#' + id);
  await page.getByRole('button', { name: 'Começar partida' }).click();
  await page.getByRole('button', { name: 'Pronto' }).click();
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 170_000) {
    const banner = await page.locator('.banner').allInnerTexts();
    const timer = await page.locator('.timer').innerText();
    const round = await page.locator('.round').innerText();
    const shop = await page.locator('.shop').count();
    for (const b of banner) if (!seen.has(b)) {
      seen.add(b);
      console.log(((Date.now() - t0) / 1000).toFixed(0) + 's banner:', b, '|', round);
      await page.screenshot({ path: `${out}/long-${seen.size}.png` });
    }
    if (shop && !seen.has('loja2') && round.includes('1')) {
      seen.add('loja2');
      console.log(((Date.now() - t0) / 1000).toFixed(0) + 's loja depois da rodada 1:', (await page.locator('.shop-head').first().innerText()).replace(/\n/g, ' '));
      await page.screenshot({ path: `${out}/long-loja.png` });
      await page.getByRole('button', { name: 'Pronto' }).click();
    }
    if (round.includes('Rodada 2') && timer.startsWith('A arena')) {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${out}/long-rodada2.png` });
      console.log('rodada 2 rodando; placar:', (await page.locator('.players').innerText()).replace(/\n+/g, ' '));
      break;
    }
    await page.waitForTimeout(250);
  }
} finally {
  console.log(logs.slice(0, 20).join('\n'));
  await ctx.close();
}
