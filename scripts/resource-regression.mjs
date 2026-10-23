// Opt-in: node scripts/resource-regression.mjs --base http://127.0.0.1:8848 --gc.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { openChrome } from './lib/browser.mjs';
import { installResourceProbe } from './lib/resource-probe.mjs';

const { values } = parseArgs({ options: {
  base: { type: 'string', default: 'http://127.0.0.1:8848' }, out: { type: 'string', default: 'balance/resource-regression' },
  cycles: { type: 'string', default: '100' }, warmup: { type: 'string', default: '20' }, seed: { type: 'string', default: '7' },
  'soak-seconds': { type: 'string', default: '0' }, gc: { type: 'boolean', default: false },
  'heap-snapshots': { type: 'boolean', default: false }, mutation: { type: 'string', default: 'none' },
} });
const positive = (name, min) => { const n = Number(values[name]); assert(Number.isSafeInteger(n) && n >= min, `Invalid --${name}`); return n; };
const cycles = positive('cycles', 100), warmup = positive('warmup', 10), seed = positive('seed', 0), soak = positive('soak-seconds', 0);
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(values.base).hostname), 'Use a local Vite server, never production');
assert(['none', 'skeleton-dispose', 'connection-listener'].includes(values.mutation), 'Unknown mutation');
await mkdir(values.out, { recursive: true });
const config = { ...values, cycles, warmup, seed, assets: ['mage', 'knight', 'chest', 'rockpillar'], viewport: [800, 600] };
const report = { config, startedAt: new Date().toISOString(), samples: [], errors: [], failures: [] };
const browser = await openChrome({ viewport: { width: 800, height: 600 } });
const page = await browser.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', (error) => report.errors.push(error.message));
const cdp = await page.context().newCDPSession(page);
try {
  await page.addInitScript(installResourceProbe, { mutation: values.mutation });
  await page.route('**/__resource-harness', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/src/client/style.css"></head><body></body></html>' }));
  await page.goto(`${values.base}/__resource-harness`);
  await page.evaluate(async ({ seed }) => {
    // Imports reais do Vite mantêm o teste fora do bundle e dos fluxos do jogador.
    const scene = await import('/src/client/scene.ts');
    const threePath = performance.getEntriesByType('resource').find((e) => /\/deps\/three\.js\?/.test(e.name))?.name;
    if (!threePath) throw new Error('Run against the Vite development server');
    resourceProbe.attachThree(await import(threePath));
    const { avatarPanel } = await import('/src/client/avatar.ts');
    const { openSettings } = await import('/src/client/settings.ts');
    const { lookOf } = await import('/src/shared/characters.ts');
    let rng = seed >>> 0;
    Math.random = () => { rng = (Math.imul(1664525, rng) + 1013904223) >>> 0; return rng / 4294967296; };
    window.looks = ['mage', 'knight'].map(lookOf);
    await Promise.all(looks.map(scene.loadLook));
    const canvas = document.createElement('canvas'), labels = document.createElement('div'), host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:0;left:0;width:700px';
    document.body.append(canvas, labels, host);
    host.append(avatarPanel());
    window.game = scene.createScene(canvas, labels); await game.ready; game.setFx(true);
    const wizard = (id, x) => ({ id, character: 'mage', look: looks[0], pos: { x, y: 0 }, facing: 0, hp: 100, hpMax: 100, status: 0, alive: true, shield: false, color: x < 0 ? 0 : 1, name: id, moving: false, cheer: false });
    const state = { arena: 'circle', arenaR: 11, shrinkIn: 20, wizards: [wizard('changed', -2), wizard('shared', 2)], projectiles: [], pillars: [], loots: [], runes: [], follow: null };
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.runResourceCycle = async (i) => {
      openSettings('personagem'); await frames();
      document.querySelector('.settings-overlay .dialog-head button').click();
      host.append(avatarPanel()); host.hidden = false; await frames();
      document.querySelectorAll('.avatar-preset')[i % 2].click();
      await frames();
      host.hidden = true; await frames();
      state.wizards[0].look = looks[i % 2];
      state.pillars = [{ kind: 'chest', hp: 10, pos: { x: 0, y: 3 } }, ...[-1, 0, 1].map((x) => ({ kind: 'rockpillar', hp: 100, pos: { x, y: -3 } }))];
      game.render(state);
      state.pillars = []; game.render(state);
    };
    window.checkHidden = async () => {
      host.hidden = true; await frames();
      const before = resourceProbe.sample();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const after = resourceProbe.sample();
      if (after.mixerUpdates !== before.mixerUpdates || after.renders !== before.renders) throw new Error('Hidden preview still animates/renders (#298)');
      return after;
    };
    window.connectionCycles = async (count) => {
      const { connect } = await import('/src/client/net.ts');
      const Real = window.WebSocket;
      class Socket {
        static OPEN = 1;
        readyState = 0;
        close() { this.readyState = 3; this.onclose?.(); }
        send() {}
      }
      window.WebSocket = Socket;
      try { for (let i = 0; i < count; i++) { const net = connect('/ws/lobby', () => {}, () => {}); net.stop(); net.stop(); } }
      finally { window.WebSocket = Real; }
    };
    window.fixture = { game, host, state };
    game.render(state);
  }, { seed });
  const sample = async (label, cycle) => {
    if (values.gc) await cdp.send('HeapProfiler.collectGarbage');
    const resources = await page.evaluate(() => resourceProbe.sample());
    const heap = await cdp.send('Runtime.getHeapUsage'), dom = await cdp.send('Memory.getDOMCounters');
    const retained = {};
    if (values.gc) for (const type of ['Mesh', 'Skeleton', 'Material', 'AnimationMixer']) {
      const prototype = await cdp.send('Runtime.evaluate', { expression: `resourceThree.${type}.prototype` });
      const objects = await cdp.send('Runtime.queryObjects', { prototypeObjectId: prototype.result.objectId, objectGroup: 'retained-probe' });
      const count = await cdp.send('Runtime.callFunctionOn', { objectId: objects.objects.objectId, functionDeclaration: 'function () { return this.length; }', returnByValue: true });
      retained[type] = count.result.value;
      await cdp.send('Runtime.releaseObject', { objectId: prototype.result.objectId });
      await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'retained-probe' });
    }
    const result = { label, cycle, at: new Date().toISOString(), resources, heap, dom, retained };
    report.samples.push(result); return result;
  };
  const snapshot = async (name) => {
    if (!values['heap-snapshots']) return;
    const chunks = []; const onChunk = ({ chunk }) => chunks.push(chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await cdp.send('HeapProfiler.takeHeapSnapshot');
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await writeFile(`${values.out}/${name}.heapsnapshot`, chunks.join(''));
  };
  for (let i = 0; i < warmup; i++) await page.evaluate((i) => runResourceCycle(i), i);
  await page.evaluate(() => runResourceCycle(1));
  await page.evaluate(() => checkHidden());
  await page.evaluate(() => connectionCycles(5));
  const baseline = await sample('warmed baseline', 0);
  await snapshot('baseline');
  const started = Date.now();
  let completed = 0;
  do {
    await page.evaluate((i) => runResourceCycle(i), completed++);
    if (completed % 10 === 0) { await page.evaluate(() => checkHidden()); await sample('repeated actions', completed); }
  } while (completed < cycles || Date.now() - started < soak * 1000);
  await page.evaluate(() => runResourceCycle(1));
  await page.evaluate(() => checkHidden());
  const beforeConnections = await sample('before connection cycles', completed);
  await page.evaluate((n) => connectionCycles(n), cycles);
  const final = await sample('after connection cycles', completed);
  await snapshot('final');
  // Caches aquecidos ficam; a tolerância é crescimento de zero recursos possuídos, não um teto arbitrário de memória.
  for (const metric of ['textures', 'buffers']) {
    const growth = final.resources.gpu[metric].active - baseline.resources.gpu[metric].active;
    if (growth > 0) report.failures.push(`${metric} grew by ${growth} after warmup`);
  }
  for (const metric of ['listeners', 'observers', 'observedTargets', 'intervals', 'timeouts', 'rafs']) {
    const growth = final.resources[metric] - baseline.resources[metric];
    if (growth > 0) report.failures.push(`${metric} grew by ${growth} after warmup`);
  }
  for (const metric of ['visibilityListeners', 'intervals', 'timeouts']) if (final.resources[metric] !== beforeConnections.resources[metric]) report.failures.push(`Connection stop leaked ${metric} (#302)`);
  for (const type of Object.keys(final.retained)) {
    const growth = final.retained[type] - baseline.retained[type];
    // Duas aparências podem ter números diferentes de malhas; a baseline e o fim usam a mesma paridade.
    if (growth > 0) report.failures.push(`Retained ${type} grew by ${growth} after GC`);
  }
  await page.screenshot({ path: `${values.out}/final.png` });
  assert.deepEqual(report.errors, [], 'Browser errors');
  assert.deepEqual(report.failures, [], 'Resource plateau failed');
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${values.out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`PASS resource plateau; artifacts in ${values.out}`);
