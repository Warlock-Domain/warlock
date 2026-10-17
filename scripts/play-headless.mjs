// Joga uma rodada sem janela e tira fotos: node play.mjs <base> <pasta-fotos> [largura altura]
import { chromium } from 'file:///C:/nvm4w/nodejs/node_modules/@playwright/mcp/node_modules/playwright-core/index.mjs';

const [base, out, w = '1280', h = '720'] = process.argv.slice(2);
const mobile = Number(w) < 700;
const ctx = await chromium.launchPersistentContext('C:/Users/ferna/AppData/Local/ms-playwright/mcp-chrome-7a379eb', {
  channel: 'chrome', headless: true, viewport: { width: Number(w), height: Number(h) }, hasTouch: mobile, isMobile: mobile,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
try {
  const { id } = await (await fetch(base + '/api/rooms', { method: 'POST' })).json();
  await page.addInitScript(() => localStorage.setItem('warlock:name:pw', 'Fernando'));
  await page.goto(base + '/?as=pw#' + id);
  await page.getByRole('button', { name: 'Esqueleto guerreiro' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/0-sala.png' });
  await page.getByRole('button', { name: 'Começar partida' }).click();
  await page.getByRole('button', { name: /^Comprar/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Comprar/ }).nth(3).click().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('.shop-item').first().hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/1-loja.png' });
  await page.getByRole('button', { name: 'Pronto' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/2-contagem.png' });
  await page.waitForTimeout(2200);
  const cx = Number(w) / 2, cy = Number(h) / 2;
  if (mobile) await page.touchscreen.tap(cx, cy);
  else {
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
  }
  await page.waitForTimeout(700);
  await page.mouse.move(cx + 160, cy - 60);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(250);
  await page.screenshot({ path: out + '/3-jogando.png' });
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(120);
  await page.screenshot({ path: out + '/4-raio.png' });
  await page.locator('.spell').first().hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/4b-dica.png' });
  await page.mouse.move(Number(w) / 2, Number(h) / 2 - 100);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: out + '/5-depois.png' });
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  console.log('fps', fps, 'sala', id);
  console.log((await page.locator('.hud').innerText()).replace(/\n+/g, ' | '));
} finally {
  console.log(logs.slice(0, 20).join('\n'));
  await ctx.close();
}
