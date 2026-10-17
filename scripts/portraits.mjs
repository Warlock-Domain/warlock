// Gera public/chars/<id>.png renderizando cada personagem (pose Idle) num navegador sem janela.
// Precisa do servidor local rodando (wrangler dev) para servir /models: node scripts/portraits.mjs http://localhost:8797
import { writeFileSync } from 'node:fs';
import { chromium } from 'file:///C:/nvm4w/nodejs/node_modules/@playwright/mcp/node_modules/playwright-core/index.mjs';

const base = process.argv[2];
const IDS = ['mage', 'knight', 'barbarian', 'rogue', 'rogue_hooded', 'skeleton_mage', 'skeleton_minion', 'skeleton_rogue', 'skeleton_warrior'];
const page_html = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.186.1/build/three.module.js","three/addons/":"https://unpkg.com/three@0.186.1/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
r.setSize(240, 320); r.outputColorSpace = THREE.SRGBColorSpace; document.body.append(r.domElement);
window.shot = async (url) => {
  const g = await new GLTFLoader().loadAsync(url);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff4e8', '#3a2018', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(2, 4, 5); scene.add(key);
  scene.add(g.scene);
  const mixer = new THREE.AnimationMixer(g.scene);
  const idle = g.animations.find((a) => a.name === 'Idle'); if (idle) { mixer.clipAction(idle).play(); mixer.update(0.4); }
  const box = new THREE.Box3().setFromObject(g.scene); const c = box.getCenter(new THREE.Vector3()); const h = box.max.y - box.min.y;
  const cam = new THREE.PerspectiveCamera(30, 240 / 320, 0.1, 100);
  cam.position.set(c.x + h * 0.35, c.y + h * 0.15, c.z + h * 2.3); cam.lookAt(c.x, c.y + h * 0.05, c.z);
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.route(base + '/_portraits', (route) => route.fulfill({ contentType: 'text/html', body: page_html }));
await page.goto(base + '/_portraits');
await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
for (const id of IDS) {
  const data = await page.evaluate((u) => window.shot(u), `/models/${id}.glb`);
  writeFileSync(`public/chars/${id}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('ok', id);
}
await browser.close();
