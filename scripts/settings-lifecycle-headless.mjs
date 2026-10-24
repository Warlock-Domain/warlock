// Usa o Vite (npm run dev:client): importa o menu real sem iniciar uma sala nem o loop do jogo.
import assert from 'node:assert/strict';
import { openChrome } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await openChrome({ viewport: { width: 1280, height: 720 } });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const observers = [];
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends NativeObserver {
      targets = new Set();
      constructor(...args) { super(...args); observers.push(this); }
      observe(target) { this.targets.add(target); super.observe(target); }
      unobserve(target) { this.targets.delete(target); super.unobserve(target); }
      disconnect() { this.targets.clear(); super.disconnect(); }
    };
    const mediaListeners = new Set();
    const nativeMatch = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = nativeMatch(query);
      const add = media.addEventListener.bind(media), remove = media.removeEventListener.bind(media);
      media.addEventListener = (type, listener, options) => {
        if (query === '(max-width: 600px)' && type === 'change') mediaListeners.add(listener);
        return add(type, listener, options);
      };
      media.removeEventListener = (type, listener, options) => {
        if (query === '(max-width: 600px)' && type === 'change') mediaListeners.delete(listener);
        return remove(type, listener, options);
      };
      return media;
    };
    window.settingsResources = () => {
      const targets = observers.flatMap((observer) => [...observer.targets]).filter((target) => target.classList.contains('settings-body'));
      return { observed: targets.length, detached: targets.filter((target) => !target.isConnected).length, listeners: mediaListeners.size };
    };
  });
  await page.route('**/__settings-lifecycle', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/src/client/style.css"><main id="host"></main>',
  }));
  await page.goto(new URL('/__settings-lifecycle', base).href);
  await page.evaluate(async () => {
    const settings = await import('/src/client/settings.ts');
    settings.setSettingsCtx({ name: () => 'Lifecycle', rename: () => {}, volumes: () => ({ sfx: 1, music: 0.7 }), setVolume: () => {} });
    window.settingsTest = settings;
  });
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.settingsTest.openSettings());
    assert.equal((await page.evaluate(() => window.settingsResources())).listeners, 1);
    // Trocar a configuração redesenha seções e precisa devolver o foco ao mesmo campo.
    await page.locator('#slot-keys').focus();
    await page.locator('#slot-keys').press('Space');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'slot-keys');
    assert.equal((await page.evaluate(() => window.settingsResources())).detached, 0);
    const close = page.locator('.settings-overlay .dialog-head button');
    if (i % 3 === 0) await page.keyboard.press('Escape');
    else if (i % 3 === 1) await close.click();
    else await page.locator('.settings-overlay').click({ position: { x: 1, y: 1 } });
    assert.deepEqual(await page.evaluate(() => window.settingsResources()), { observed: 0, detached: 0, listeners: 0 });
    await page.keyboard.press('Escape'); // fechar de novo não reativa a página.
  }
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => document.querySelector('#host').replaceChildren(window.settingsTest.settingsPage()));
    const resources = await page.evaluate(() => window.settingsResources());
    assert.equal(resources.detached, 0);
    assert.equal(resources.listeners, 1);
    assert.ok(resources.observed > 0);
  }
  await page.setViewportSize({ width: 540, height: 720 });
  await page.waitForFunction(() => !document.querySelector('.settings-toc').open);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => document.querySelector('.settings-toc').open);
  await page.locator('#slot-keys').focus();
  await page.locator('#slot-keys').press('Space');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'slot-keys');
  assert.equal((await page.evaluate(() => window.settingsResources())).detached, 0);
  assert.deepEqual(errors, []);
  console.log('Settings lifecycle passed: 10 modal cycles, 10 home replacements, resize and focus preservation.');
} finally {
  await browser.close();
}
