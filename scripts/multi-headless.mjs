// 3 pessoas na mesma sala, sem janela: node multi.mjs <base> <pasta-fotos>
import { openChrome } from './lib/browser.mjs';

const [base, out] = process.argv.slice(2);
const ctx = await openChrome({ viewport: { width: 1000, height: 640 } });
const logs = [];
try {
  const { id } = await (await fetch(base + '/api/rooms', { method: 'POST' })).json();
  await ctx.addInitScript(() => {
    localStorage.setItem('warlock:lang', 'pt');
    for (const [k, n] of [['ana', 'Ana'], ['bia', 'Bia'], ['caio', 'Caio']]) localStorage.setItem('warlock:name:' + k, n);
  });
  const pages = [];
  for (const who of ['ana', 'bia', 'caio']) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => logs.push(who + ' pageerror: ' + e.message));
    p.on('console', (m) => m.type() === 'error' && logs.push(who + ': ' + m.text()));
    if (who === 'caio') await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(base + `/?as=${who}#` + id);
    await p.waitForTimeout(600);
    pages.push(p);
  }
  const [a, b, c] = pages;
  const lobbyText = await a.locator('.center').innerText();
  console.log('sala de espera da Ana:', lobbyText.replace(/\n+/g, ' | '));
  // no bots, only the three people; the "−" text is the same in both languages, unlike the aria-label
  for (let i = 0; i < 3; i++) await a.locator('button', { hasText: /^−$/ }).click();
  await a.getByRole('button', { name: 'Começar partida' }).click();
  for (const p of pages) await p.getByRole('button', { name: /^Pronto/ }).click();
  await a.waitForTimeout(3600);
  await a.mouse.click(500, 320, { button: 'right' });
  await a.mouse.move(600, 250);
  await a.keyboard.press('KeyQ'); // first bar slot (Q W E R D F since #401)
  await a.waitForTimeout(900);
  for (const [i, p] of pages.entries()) {
    await p.bringToFront();
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${out}/multi-${['ana', 'bia', 'caio'][i]}.png` });
  }
  for (const p of pages) console.log((await p.locator('.tops').innerText()).replace(/\n+/g, ' '));
  // Bia closes and rejoins: same wizard
  await b.close();
  const b2 = await ctx.newPage();
  await b2.goto(base + '/?as=bia#' + id);
  await b2.waitForTimeout(1500);
  console.log('Bia voltou:', (await b2.locator('.tops').innerText()).replace(/\n+/g, ' '), '| magos na tela:', await b2.locator('.wiz-label:not([hidden])').count());
} finally {
  console.log(logs.slice(0, 20).join('\n'));
  await ctx.close();
}
