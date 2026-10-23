// Regressão da prévia contra o Vite local: node scripts/preview-lifecycle.mjs [base] [pasta de artefatos].
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openChrome } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8848';
const out = process.argv[3] ?? 'balance/preview-lifecycle';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Use a local Vite server');
await mkdir(out, { recursive: true });
const browser = await openChrome({ viewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
page.setDefaultTimeout(10000);
await page.addInitScript(() => { localStorage.setItem('warlock:name', 'Preview check'); localStorage.setItem('warlock:lang', 'en'); });
const errors = [];
const samples = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.route('**/api/lobby', (route) => route.fulfill({ json: [] }));
  await page.goto(base);
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find((e) => /\/deps\/three\.js\?/.test(e.name))?.name;
    if (!path) throw new Error('Run this check against the Vite development server');
    const THREE = await import(path);
    window.previewStats = { draws: 0, mixers: 0, rafs: 0, maxPending: 0 };
    const update = THREE.AnimationMixer.prototype.update;
    THREE.AnimationMixer.prototype.update = function (...args) { previewStats.mixers++; return update.apply(this, args); };
    for (const Type of [WebGLRenderingContext, WebGL2RenderingContext]) for (const name of ['drawArrays', 'drawElements']) {
      const original = Type.prototype[name];
      Type.prototype[name] = function (...args) { previewStats.draws++; return original.apply(this, args); };
    }
    const request = window.requestAnimationFrame, cancel = window.cancelAnimationFrame, pending = new Set();
    window.requestAnimationFrame = function (callback) {
      if (!new Error().stack.includes('/src/client/avatar.ts')) return request(callback);
      const id = request((now) => { pending.delete(id); previewStats.rafs++; callback(now); });
      pending.add(id); previewStats.maxPending = Math.max(previewStats.maxPending, pending.size);
      return id;
    };
    window.cancelAnimationFrame = (id) => { pending.delete(id); cancel(id); };
  });
  const measure = async (label, active) => {
    await page.waitForTimeout(200); // O observer entrega a transição fora do quadro que esconde a aba.
    const before = await page.evaluate(() => ({ ...previewStats }));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ ...previewStats }));
    const delta = Object.fromEntries(['draws', 'mixers', 'rafs'].map((k) => [k, after[k] - before[k]]));
    samples.push({ label, active, ...delta });
    for (const key of ['draws', 'mixers', 'rafs']) assert(active ? delta[key] > 0 : delta[key] === 0, `${label}: ${key}=${delta[key]}`);
    assert(after.maxPending <= 1, `${label}: multiple preview animation loops`);
  };
  await page.locator('#home-tab-char').click();
  await page.waitForFunction(() => document.querySelectorAll('.avatar-preset[aria-pressed=true]').length === 1);
  await measure('wardrobe', true);
  await page.screenshot({ path: `${out}/wardrobe.png` });
  await page.locator('#home-tab-home').click();
  await measure('hidden home panel', false);
  await page.locator('#home-tab-char').click();
  await page.locator('[aria-controls=wardrobe-spells]').click();
  await measure('hidden wardrobe category', false);
  await page.locator('[aria-controls=wardrobe-accessories]').click();
  await measure('resume wardrobe category', true);
  // Chamadas repetidas usam o mesmo painel e não podem iniciar outro laço.
  await page.evaluate(async () => { const { avatarPanel } = await import('/src/client/avatar.ts'); for (let i = 0; i < 5; i++) avatarPanel(); });
  await measure('repeated mount calls', true);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await measure('background visibility event', false);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await measure('foreground visibility event', true);
  const canvas = page.locator('.avatar canvas');
  const before = await canvas.screenshot();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 100);
  await page.mouse.down(); await page.mouse.move(box.x + 130, box.y + 130); await page.mouse.up();
  await page.mouse.wheel(0, -150);
  await page.locator('.avatar-preset').nth(1).click();
  await page.waitForTimeout(300);
  assert(!before.equals(await canvas.screenshot()), 'Orbit/zoom/appearance controls must change the preview');
  assert.equal(await page.locator('.avatar-preset').nth(1).getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: `${out}/controls.png` });
  await page.evaluate(() => { window.savedPreview = document.querySelector('.avatar'); savedPreview.remove(); });
  await measure('detached panel', false);
  await page.evaluate(() => document.querySelector('#wardrobe-accessories').append(savedPreview));
  await measure('reattached panel', true);
  // Sem o lobby conectado, as Configurações usam o diálogo da partida.
  await page.evaluate(async () => { document.querySelector('.lobby').remove(); const { openSettings } = await import('/src/client/settings.ts'); openSettings('personagem'); });
  await measure('settings dialog', true);
  await page.screenshot({ path: `${out}/settings.png` });
  await page.keyboard.press('Escape');
  await measure('closed settings dialog', false);
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ samples, errors }, null, 2));
  await browser.close();
}
console.log(`PASS preview lifecycle: ${samples.length} transitions; artifacts in ${out}`);
