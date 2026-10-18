// Cena 3D: lava, arena de pedra que encolhe, magos (KayKit), projéteis e efeitos.
// Coordenadas: o plano da simulação (x, y) vira (x, 0, y) no Three.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ARENA_STEP, CHEST, OBSTACLES, SHRINK_WARN, WIZ_R } from '../shared/constants.ts';
import type { ProjKind, SimEvent } from '../shared/sim.ts';
import type { PillarView, ProjView } from '../shared/snapshot.ts';
import { v, type Vec } from '../shared/vec.ts';
import { createDecor } from './decor.ts';

// cor de cada lugar (0..7) e o giro de matiz que leva o roxo do mago até ela
export const COLORS = ['#e5484d', '#3e8ef7', '#30a46c', '#f5d90a', '#a26bf5', '#12c7c7', '#f76b15', '#e93d82'];
const HUES = [0, 215, 145, 52, 270, 182, 24, 330];
const MAGE_HUE = 255;

export type WizDraw = { id: string; pos: Vec; facing: number; hp: number; hpMax: number; status: number; alive: boolean; shield: boolean; shieldR?: number; loot?: number; color: number; character: string; name: string; moving: boolean; cheer: boolean };

const w3 = (p: Vec, y = 0) => new THREE.Vector3(p.x, y, p.y);

type Mage = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  current: string;
  oneShotUntil: number;
  ring: THREE.Mesh;
  shield: THREE.Mesh;
  lootBar: HTMLDivElement;
  lootFill: HTMLDivElement;
  label: HTMLDivElement;
  hpFill: HTMLDivElement;
  hpText: HTMLSpanElement;
  statusEl: HTMLSpanElement;
  statusKey: number;
  dead: boolean;
  color: number;
  character: string;
};

type Fx = { obj: THREE.Object3D; until: number; born: number; update?: (k: number) => void };

const LAVA_VERT = `varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const LAVA_FRAG = `
uniform float uTime; uniform sampler2D uMap; uniform float uHas; varying vec2 vUv; varying vec3 vPos;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*noise(p); p = p*2.03 + 1.7; a *= 0.5; } return s; }
void main(){
  vec2 p = vPos.xz * 0.18;
  float t = uTime * 0.08;
  float n = fbm(p + vec2(t, -t*0.7) + fbm(p*1.7 - t));
  float veins = smoothstep(0.5, 0.66, n);
  float core = smoothstep(0.66, 0.8, n);
  vec3 crust = mix(vec3(0.035, 0.008, 0.004), vec3(0.16, 0.025, 0.008), smoothstep(0.3, 0.5, n));
  vec3 hot = mix(vec3(0.7, 0.1, 0.01), vec3(1.0, 0.45, 0.06), core);
  vec3 col = mix(crust, hot, veins);
  if (uHas > 0.5) {
    // textura de lava (ambientCG Lava004) em duas camadas que correm em sentidos diferentes
    vec2 q = vPos.xz * 0.05;
    vec3 a = texture2D(uMap, q + vec2(t * 0.10, t * 0.04)).rgb;
    vec3 b = texture2D(uMap, q * 1.7 - vec2(t * 0.06, -t * 0.09)).rgb;
    vec3 tex = pow(max(a, b * 0.85), vec3(2.2));
    col = tex * (0.45 + 0.55 * veins) + hot * core * 0.2;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function stoneTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3b3633';
  g.fillRect(0, 0, 1024, 1024);
  // lajes irregulares com rejunte escuro
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 8 + Math.random() * 30;
    const l = 24 + Math.random() * 18;
    g.fillStyle = `hsl(20, 6%, ${l}%)`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(20,16,14,.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 140; i++) {
    g.beginPath();
    let x = Math.random() * 1024, y = Math.random() * 1024;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) g.lineTo((x += (Math.random() - 0.5) * 70), (y += (Math.random() - 0.5) * 70));
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createScene(canvas: HTMLCanvasElement, labels: HTMLElement) {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a0603');
  scene.fog = new THREE.Fog('#1a0603', 30, 70);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);

  scene.add(new THREE.HemisphereLight('#ffd2b0', '#ff4a10', 0.55));
  const sun = new THREE.DirectionalLight('#fff1e0', 1.5);
  sun.position.set(-8, 20, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  scene.add(sun);
  const under = new THREE.PointLight('#ff5a1a', 60, 30, 1.6); // brilho da lava por baixo da borda
  under.position.set(0, -1.5, 0);
  scene.add(under);

  // assets CC0 em public/ (créditos em public/CREDITS.txt); enquanto não carregam, fica o visual gerado por código
  const loader = new THREE.TextureLoader();
  const tex = (path: string, srgb = true, repeat = 0) => {
    const t = loader.load(path);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    return t;
  };
  const fxTex = (name: string) => tex(`/fx/${name}.png`);
  const FX = {
    flame: fxTex('flame_01'), fire: fxTex('fire_01'), smoke: fxTex('smoke_01'), spark: fxTex('spark_01'),
    magic: fxTex('magic_02'), light: fxTex('light_01'), circle: fxTex('circle_05'), scorch: fxTex('scorch_02'),
  };
  const lavaMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uMap: { value: null }, uHas: { value: 0 } }, vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG });
  loader.load('/tex/lava_emit.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    lavaMat.uniforms.uMap.value = t;
    lavaMat.uniforms.uHas.value = 1;
  });
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), lavaMat);
  lava.rotation.x = -Math.PI / 2;
  lava.position.y = -0.6;
  scene.add(lava);

  // arena: cilindro de raio 1 escalado; a borda brilha com a lava
  const stone = stoneTexture();
  const arena = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 0.94, 1.2, 96, 1),
    [new THREE.MeshStandardMaterial({ color: '#6b3a26', roughness: 1, emissive: '#5a1404', emissiveIntensity: 0.6 }),
      new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: '#000' })],
  );
  arena.position.y = -0.6;
  arena.receiveShadow = true;
  scene.add(arena);
  // ardósia de verdade (Poly Haven Slate Floor 02) quando a textura chegar
  loader.load('/tex/stone.jpg', (t) => {
    const top = (arena.material as THREE.MeshStandardMaterial[])[1];
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 5);
    top.map = t;
    top.normalMap = tex('/tex/stone_nor.jpg', false, 5);
    top.color.set('#e6ddd6');
    top.needsUpdate = true;
  });
  // borda incandescente: a pedra queimando onde encosta na lava
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.975, 1.0, 128), new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.015;
  scene.add(rim);
  // anel que pisca em vermelho na faixa que vai afundar
  const warnMat = new THREE.MeshBasicMaterial({ color: '#ff2a00', transparent: true, opacity: 0, depthWrite: false });
  const warn = new THREE.Mesh(new THREE.RingGeometry(0.5, 1, 96), warnMat);
  warn.rotation.x = -Math.PI / 2;
  warn.position.y = 0.02;
  scene.add(warn);
  let shownR = 11;
  let shake = 0; // tremor da câmera nos choques
  let warnR = -1;

  const glow = glowTexture();
  // núcleo quase branco e brilho saturado: destaca do chão marrom e da lava laranja (legibilidade, ideia do Spellsworn)
  const fireMat = new THREE.MeshBasicMaterial({ color: '#fff2b0' });
  const homingMat = new THREE.MeshBasicMaterial({ color: '#f3d4ff' });
  const ballGeo = new THREE.SphereGeometry(0.28, 16, 12);
  const swapMat = new THREE.MeshBasicMaterial({ color: '#dcfffb' });
  const gripMat = new THREE.MeshBasicMaterial({ color: '#ffd6de' });
  // aparência de cada projétil: corpo, cor do brilho e do rastro, textura do rastro e tamanho
  const LOOK: Record<ProjKind, { mat: THREE.Material; halo: string; trail: string; tex: THREE.Texture; size: number }> = {
    fireball: { mat: fireMat, halo: '#ffb000', trail: '#ff8a00', tex: FX.flame, size: 1.15 },
    homing: { mat: homingMat, halo: '#c23cff', trail: '#b040ff', tex: FX.magic, size: 1.1 },
    cluster: { mat: fireMat, halo: '#fff066', trail: '#ffd23a', tex: FX.spark, size: 0.65 },
    swap: { mat: swapMat, halo: '#00fff0', trail: '#2fe0d0', tex: FX.magic, size: 1 },
    grip: { mat: gripMat, halo: '#ff1f4f', trail: '#e0103a', tex: FX.magic, size: 1 },
    meteor: { mat: fireMat, halo: '#ff5a1a', trail: '#ff7a20', tex: FX.fire, size: 3 },
  };
  const projs = new Map<number, THREE.Group>();
  const fx: Fx[] = [];

  // personagens KayKit: cada modelo carrega na primeira vez que alguém o usa e cada jogador ganha um clone.
  // O mago define a escala (os pacotes KayKit usam a mesma medida) e tem as roupas tingidas na cor do jogador.
  type Model = { scene: THREE.Group; clips: THREE.AnimationClip[] };
  const models = new Map<string, Model | null>(); // null = carregando
  let mageScale = 1;
  const tinted = new Map<number, THREE.Texture>();
  const loadModel = (id: string) =>
    new GLTFLoader().loadAsync(`/models/${id}.glb`).then((g) => {
      models.set(id, { scene: g.scene, clips: g.animations });
      return g;
    });
  const ready = loadModel('mage').then((g) => {
    const box = new THREE.Box3().setFromObject(g.scene);
    mageScale = 1.9 / (box.max.y - box.min.y);
  });
  models.set('mage', null);

  function tintFor(color: number, base: THREE.Texture): THREE.Texture {
    const hit = tinted.get(color);
    if (hit) return hit;
    const img = base.image as CanvasImageSource & { width: number; height: number };
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.filter = `hue-rotate(${HUES[color] - MAGE_HUE}deg) saturate(1.25)`;
    g.drawImage(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = base.flipY;
    tex.colorSpace = THREE.SRGBColorSpace;
    tinted.set(color, tex);
    return tex;
  }

  const mages = new Map<string, Mage>();
  const decor = createDecor(scene, ready.then(() => mageScale), FX.flame);

  const failed = new Set<string>();
  function preload(id: string) {
    if (models.has(id) || failed.has(id)) return;
    models.set(id, null);
    loadModel(id).catch(() => {
      models.delete(id);
      failed.add(id); // não tenta de novo a cada quadro; usa o mago padrão
    });
  }

  // geometrias de efeito compartilhadas: criar uma por efeito vazava memória de vídeo
  const ringGeo = new THREE.RingGeometry(WIZ_R * 0.9, WIZ_R * 1.25, 40);
  const shieldGeo = new THREE.SphereGeometry(0.85, 24, 16);
  const markerGeo = new THREE.RingGeometry(0.15, 0.25, 24);
  const scorchGeo = new THREE.PlaneGeometry(1.6, 1.6);
  const waveGeo = new THREE.RingGeometry(0.85, 1, 64);
  const SHARED = new Set<THREE.BufferGeometry>([ringGeo, shieldGeo, markerGeo, scorchGeo, waveGeo, ballGeo]);

  // libera o que o efeito criou (material sempre; geometria se não for compartilhada; sprite usa a geometria interna do three)
  function dispose(obj: THREE.Object3D) {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh && !(o as THREE.Line).isLine && !(o as THREE.Sprite).isSprite) return;
      if (!(o as THREE.Sprite).isSprite && mesh.geometry && !SHARED.has(mesh.geometry)) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[];
      (Array.isArray(mat) ? mat : [mat]).forEach((x) => x?.dispose());
    });
  }

  function makeMage(d: WizDraw): Mage | null {
    preload(d.character);
    const src = models.get(d.character) ?? (failed.has(d.character) ? models.get('mage') : null);
    if (!src) return null;
    const model = cloneSkinned(src.scene) as THREE.Group;
    model.scale.setScalar(mageScale);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      if (d.character === 'mage' && (/Hat|Body|Cape/.test(mesh.name) || /Hat|Body|Cape/.test(mesh.parent?.name ?? ''))) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        if (mat.map) mat.map = tintFor(d.color, mat.map);
        mesh.material = mat;
      }
    });
    const root = new THREE.Group();
    root.add(model);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: COLORS[d.color], transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    root.add(ring);
    const shield = new THREE.Mesh(shieldGeo, new THREE.MeshBasicMaterial({ color: '#8fd3ff', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
    shield.position.y = 0.8;
    shield.visible = false;
    root.add(shield);
    scene.add(root);
    const mixer = new THREE.AnimationMixer(model);
    const actions: Record<string, THREE.AnimationAction> = {};
    for (const c of src.clips) actions[c.name] = mixer.clipAction(c);
    for (const n of ['Spellcast_Shoot', 'Hit_A', 'Death_A', 'Spellcast_Raise']) {
      actions[n]?.setLoop(THREE.LoopOnce, 1);
      if (actions[n]) actions[n].clampWhenFinished = true;
    }
    actions.Idle?.play();
    const hpFill = document.createElement('div');
    hpFill.className = 'hp-fill';
    hpFill.style.background = COLORS[d.color];
    const label = document.createElement('div');
    label.className = 'wiz-label';
    const nameEl = document.createElement('span');
    nameEl.textContent = d.name;
    const bar = document.createElement('div');
    bar.className = 'hp';
    const hpText = document.createElement('span');
    hpText.className = 'hp-text';
    bar.append(hpFill, hpText);
    const statusEl = document.createElement('span');
    statusEl.className = 'status-icons';
    // barrinha dourada do monte de ouro: enche a cada 2 s em cima dele
    const lootBar = document.createElement('div');
    lootBar.className = 'loot-bar';
    lootBar.hidden = true;
    const lootFill = document.createElement('div');
    lootBar.append(lootFill);
    label.append(statusEl, nameEl, bar, lootBar);
    labels.append(label);
    return { root, mixer, actions, current: 'Idle', oneShotUntil: 0, ring, shield, label, hpFill, hpText, lootBar, lootFill, statusEl, statusKey: -1, dead: false, color: d.color, character: d.character };
  }

  function play(m: Mage, name: string, fade = 0.15) {
    if (m.current === name || !m.actions[name]) return;
    m.actions[m.current]?.fadeOut(fade);
    m.actions[name].reset().fadeIn(fade).play();
    m.current = name;
  }

  function oneShot(id: string, name: string, secs: number) {
    const m = mages.get(id);
    if (!m || m.dead) return;
    play(m, name, 0.08);
    m.oneShotUntil = performance.now() / 1000 + secs;
  }

  function addFx(obj: THREE.Object3D, secs: number, update?: (k: number) => void) {
    scene.add(obj);
    const now = performance.now() / 1000;
    fx.push({ obj, born: now, until: now + secs, update });
  }

  function burst(at: Vec, color: string, size: number, secs: number, y = 0.8, map: THREE.Texture = glow, rise = 0) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: Math.random() * Math.PI * 2 }));
    s.position.copy(w3(at, y));
    addFx(s, secs, (k) => {
      s.scale.setScalar(size * (0.4 + k));
      s.position.y = y + rise * k;
      s.material.opacity = 1 - k;
    });
  }

  // fumaça escura que sobe (mistura normal, não soma luz)
  function smoke(at: Vec, size: number, secs: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.smoke, color: '#3a2a22', transparent: true, opacity: 0.55, depthWrite: false, rotation: Math.random() * Math.PI * 2 }));
    s.position.copy(w3(at, 0.9));
    addFx(s, secs, (k) => {
      s.scale.setScalar(size * (0.6 + k));
      s.position.y = 0.9 + k * 1.4;
      s.material.opacity = 0.55 * (1 - k);
    });
  }

  // marca de queimado no chão onde a bola de fogo explodiu
  function scorch(at: Vec) {
    const m = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: FX.scorch, color: '#000000', transparent: true, opacity: 0.7, depthWrite: false }));
    m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    m.position.copy(w3(at, 0.025));
    addFx(m, 7, (k) => ((m.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.min(1, (1 - k) * 3)));
  }

  // número de dano que sobe e some em cima de quem levou
  const numbers: { el: HTMLDivElement; at: THREE.Vector3; born: number }[] = [];
  function damageNumber(at: Vec, dmg: number) {
    if (dmg < 0.5) return;
    const el = document.createElement('div');
    el.className = 'dmg' + (dmg >= 9 ? ' big' : '');
    el.textContent = '-' + (dmg >= 10 ? Math.round(dmg) : dmg.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
    labels.append(el);
    numbers.push({ el, at: w3(at, 1.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, 0)), born: performance.now() / 1000 });
  }
  // ouro ganho no abate: sobe dourado em cima de quem matou
  function goldNumber(at: Vec, n: number) {
    const el = document.createElement('div');
    el.className = 'dmg gold';
    el.textContent = `+${n} 🪙`;
    labels.append(el);
    numbers.push({ el, at: w3(at, 2.1), born: performance.now() / 1000 });
  }

  // marca que fica no chão alguns segundos onde houve choque de magias (só visual)
  const MARK: Record<string, { map: THREE.Texture; color: string; secs: number; spin: number }> = {
    fire: { map: FX.flame, color: '#ff6a10', secs: 4.5, spin: 0.2 },
    arcane: { map: FX.magic, color: '#b45cff', secs: 4.5, spin: 1.2 },
    pulse: { map: FX.circle, color: '#9f7bff', secs: 3, spin: 0.8 },
    detonate: { map: FX.spark, color: '#8fd3ff', secs: 3.5, spin: 0.5 },
    pillar: { map: FX.scorch, color: '#ffb066', secs: 4, spin: 0 },
  };
  function groundMark(at: Vec, combo: string, radius: number) {
    const m = MARK[combo] ?? MARK.fire;
    const plane = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: m.map, color: m.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.copy(w3(at, 0.035));
    const size = Math.max(0.8, radius * 1.4);
    plane.scale.setScalar(size / 1.6);
    const spin = m.spin * (Math.random() < 0.5 ? -1 : 1);
    addFx(plane, m.secs, (k) => {
      plane.rotation.z += spin * 0.016;
      // tremula como brasa e some no fim
      const flicker = 0.75 + 0.25 * Math.sin(performance.now() / 90 + at.x * 7);
      (plane.material as THREE.MeshBasicMaterial).opacity = flicker * Math.min(1, (1 - k) * 2.5);
    });
  }

  // obstáculos da rodada: modelo KayKit de cada tipo, treme quando apanha e afunda ao quebrar
  const OBSTACLE_MODEL: Record<string, string> = { pillar: 'pillar_decorated', rock: 'rubble_large', tree: 'tree_dead_large', shrine: 'shrine_candles' };
  const pillarMeshes: { obj: THREE.Object3D; pos: Vec; dead: boolean; bar: HTMLDivElement | null; fill: HTMLDivElement | null; height: number }[] = [];
  // baú: caixa simples com tampa dourada e brilho (é um obstáculo: as magias quebram)
  const chestWood = new THREE.MeshStandardMaterial({ color: '#7a4a22', roughness: 0.7 });
  const chestGold = new THREE.MeshStandardMaterial({ color: '#ffcc33', emissive: '#a06a00', metalness: 0.6, roughness: 0.3 });
  function makeChest() {
    const g = new THREE.Group();
    const wood = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.38), chestWood);
    wood.position.y = 0.16;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.4), chestGold);
    lid.position.y = 0.38;
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffd84a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowSprite.scale.setScalar(1.2);
    glowSprite.position.y = 0.3;
    g.add(wood, lid, glowSprite);
    return g;
  }
  // monte de ouro do baú quebrado: moedas no chão com brilho que pulsa
  const pile = new THREE.Group();
  {
    for (let k = 0; k < 9; k++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12), chestGold);
      coin.position.set((Math.random() - 0.5) * 0.6, 0.03 + Math.random() * 0.12, (Math.random() - 0.5) * 0.6);
      coin.rotation.set(Math.random(), Math.random(), Math.random());
      pile.add(coin);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.78, 40), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    const shine = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffd84a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    shine.scale.setScalar(1.8);
    shine.position.y = 0.3;
    pile.add(ring, shine);
    pile.visible = false;
    scene.add(pile);
  }

  function syncPillars(list: PillarView[]) {
    const changed = list.length !== pillarMeshes.length || list.some((p, i) => p.pos.x !== pillarMeshes[i].pos.x || p.pos.y !== pillarMeshes[i].pos.y);
    const radius = (p: PillarView) => OBSTACLES[p.kind].r;
    if (changed) {
      for (const p of pillarMeshes) {
        scene.remove(p.obj);
        p.bar?.remove();
      }
      pillarMeshes.length = 0;
      for (const p of list) {
        const obj = (p.kind === 'chest' ? makeChest() : decor.clone(OBSTACLE_MODEL[p.kind])) ?? new THREE.Mesh(new THREE.CylinderGeometry(radius(p), radius(p), 2.2, 12), new THREE.MeshStandardMaterial({ color: '#6b625c' }));
        // ajusta a largura do modelo ao raio de colisão do pilar
        const box = new THREE.Box3().setFromObject(obj);
        const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
        // árvore é fina no tronco e larga nos galhos: mede pelo tronco (menos que a copa)
        obj.scale.multiplyScalar((radius(p) * (p.kind === 'tree' ? 6 : 2.3)) / width);
        obj.position.copy(w3(p.pos, 0));
        scene.add(obj);
        // barra de vida em tudo que quebra (pedido do Fernando, 17/10: sempre visível)
        let bar: HTMLDivElement | null = null, fill: HTMLDivElement | null = null;
        if (Number.isFinite(OBSTACLES[p.kind].hp)) {
          bar = document.createElement('div');
          bar.className = 'obstacle-hp' + (p.kind === 'chest' ? ' chest' : '');
          fill = document.createElement('div');
          bar.append(fill);
          labels.append(bar);
        }
        const height = new THREE.Box3().setFromObject(obj).max.y;
        pillarMeshes.push({ obj, pos: p.pos, dead: false, bar, fill, height });
      }
    }
    list.forEach((p, i) => {
      const m = pillarMeshes[i];
      if (p.hp <= 0) {
        m.dead = true;
        m.obj.position.y = Math.max(-3, m.obj.position.y - 0.05);
        m.obj.visible = m.obj.position.y > -2.9;
        if (m.bar) m.bar.hidden = true;
      } else {
        // tremida curta quando apanha
        const shake = p.hp < 100 ? (100 - p.hp) / 100 : 0;
        if (m.bar && m.fill) {
          m.fill.style.width = `${p.hp}%`;
        }
        m.obj.rotation.z = Math.sin(performance.now() / 40) * 0.02 * shake;
      }
    });
  }

  // anel que se expande no chão até o raio da área
  function shockwave(at: Vec, radius: number, color: string) {
    const ring = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(w3(at, 0.06));
    addFx(ring, 0.45, (k) => {
      ring.scale.setScalar(Math.max(0.01, radius * (0.2 + 0.8 * k)));
      (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    });
  }

  // acerto: clarão branco, bola de fogo, onda no chão e faíscas; durava 0,3 s e quase não se via (relato do Fernando, 17/10)
  function explosion(at: Vec) {
    burst(at, '#ffffff', 2.2, 0.18, 0.9, FX.light);
    burst(at, '#ffb347', 4, 0.6, 0.8, FX.fire);
    burst(at, '#ff6a10', 4.8, 0.45, 0.8, FX.light);
    burst(at, '#ff8a3a', 3.6, 0.55, 0.15, FX.circle);
    for (let i = 0; i < 6; i++) burst(v(at.x + (Math.random() - 0.5) * 0.9, at.y + (Math.random() - 0.5) * 0.9), '#ffd27a', 1.1, 0.6, 0.9, FX.spark, 1.6);
    smoke(at, 2.2, 1.3);
  }

  function zap(at: Vec) {
    burst(at, '#ffffff', 2.2, 0.18, 1, FX.light);
    burst(at, '#9fd0ff', 4.4, 0.6, 1, FX.light);
    burst(at, '#e6f4ff', 2.8, 0.5, 1, FX.spark);
    burst(at, '#6fb6ff', 3.8, 0.6, 0.15, FX.circle);
  }

  function bolt(from: Vec, to: Vec) {
    const pts: THREE.Vector3[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const p = w3(v(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n), 1);
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5));
      pts.push(p);
    }
    // três traços tortos sobrepostos para o raio parecer grosso (linha de WebGL tem 1 px)
    for (let j = 0; j < 3; j++) {
      const jit = pts.map((p, i) => (i === 0 || i === n ? p : p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.18))));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(jit), new THREE.LineBasicMaterial({ color: j ? '#9fd0ff' : '#ffffff', transparent: true, blending: THREE.AdditiveBlending }));
      addFx(line, 0.35, (k) => ((line.material as THREE.LineBasicMaterial).opacity = 1 - k));
    }
    burst(to, '#9fd0ff', 2.4, 0.3, 1, FX.light);
    burst(to, '#e6f4ff', 1.4, 0.35, 1, FX.spark);
    burst(from, '#9fd0ff', 1.2, 0.2, 1, FX.light);
  }

  function onEvents(events: SimEvent[], names: Map<string, string>) {
    for (const e of events) {
      if (e.k === 'cast') oneShot(e.id, e.spell === 'shield' || e.spell === 'rush' ? 'Spellcast_Raise' : 'Spellcast_Shoot', 0.55);
      else if (e.k === 'hit') {
        oneShot(e.id, 'Hit_A', 0.45);
        // o acerto do raio tem impacto elétrico próprio: a explosão de fogo cobria o raio e parecia que ele não tinha saído
        if (e.src === 'lightning') zap(v(e.x, e.y));
        else explosion(v(e.x, e.y));
        scorch(v(e.x, e.y));
        damageNumber(v(e.x, e.y), e.dmg);
      } else if (e.k === 'gold') goldNumber(v(e.x, e.y), e.n);
      else if (e.k === 'reflect') {
        burst(v(e.x, e.y), '#8fd3ff', 2.4, 0.3, 0.8, FX.circle);
        burst(v(e.x, e.y), '#cfeaff', 1.6, 0.25, 0.8, FX.light);
      }
      else if (e.k === 'lightning') bolt(e.from, e.to);
      else if (e.k === 'grip') {
        burst(v(e.x, e.y), '#e0203a', 2.4, 0.5, 0.8, FX.magic);
        burst(v(e.x, e.y), '#ffd0d8', 1.6, 0.3, 0.8, FX.light);
        shockwave(v(e.x, e.y), 1.2, '#e0203a');
      }
      else if (e.k === 'teleport') {
        burst(e.from, '#c49bff', 2.4, 0.45, 0.8, FX.magic);
        burst(e.to, '#c49bff', 2.6, 0.45, 0.8, FX.magic);
        burst(e.to, '#e9d8ff', 1.6, 0.3, 0.8, FX.light);
      } else if (e.k === 'item' && e.item === 'scourge') {
        // preparo do Flagelo: brasa crescendo em volta de quem vai explodir
        const m = mages.get(e.id);
        if (m) {
          const at = v(m.root.position.x, m.root.position.z);
          burst(at, '#ff5a1a', 3, 0.9, 0.6, FX.magic);
          burst(at, '#ffb347', 1.6, 0.9, 1.2, FX.light);
        }
      } else if (e.k === 'item' && e.item === 'pact') {
        const m = mages.get(e.id);
        if (m) burst(v(m.root.position.x, m.root.position.z), '#c2122a', 2.6, 0.6, 1, FX.magic);
      } else if (e.k === 'scourge') {
        shockwave(v(e.x, e.y), e.r, '#ff7a1a');
        explosion(v(e.x, e.y));
      } else if (e.k === 'pillar') {
        // projétil batendo em obstáculo também explode
        explosion(v(e.x, e.y));
        burst(v(e.x, e.y), '#d8c8b8', 1.4, 0.3, 1.2, FX.smoke);
      } else if (e.k === 'clash') {
        const at = v(e.x, e.y);
        groundMark(at, e.combo, e.r);
        if (e.combo !== 'pillar') {
          shake = Math.min(0.6, shake + e.r * 0.15);
          burst(at, '#fff1d0', e.r * 2.2, 0.25, 0.9, FX.light);
          burst(at, '#ffb347', e.r * 1.8, 0.5, 0.9, FX.fire);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            burst(v(at.x + Math.cos(a) * e.r * 0.5, at.y + Math.sin(a) * e.r * 0.5), '#ffd27a', 1.1, 0.5, 0.9, FX.spark, 1.5);
          }
        }
        if (e.combo === 'fire') {
          shockwave(at, e.r, '#ff7a1a');
          explosion(at);
          scorch(at);
        } else if (e.combo === 'arcane') {
          shockwave(at, e.r, '#c46bff');
          shockwave(at, e.r * 0.6, '#ffb347');
          burst(at, '#c46bff', 3.6, 0.5, 0.9, FX.magic);
          burst(at, '#ffd27a', 2.8, 0.4, 0.9, FX.fire);
          smoke(at, 2, 1.2);
        } else if (e.combo === 'detonate') {
          shockwave(at, e.r, '#9fd0ff');
          burst(at, '#e6f4ff', 2.6, 0.35, 0.9, FX.spark);
          explosion(at);
          scorch(at);
        } else {
          shockwave(at, e.r, '#b98cff');
          burst(at, '#b98cff', 2.2, 0.4, 0.9, FX.magic);
        }
      } else if (e.k === 'redirect') {
        burst(v(e.x, e.y), '#b98cff', 2, 0.35, 0.9, FX.circle);
      } else if (e.k === 'death') {
        const m = mages.get(e.id);
        if (m) {
          const at = v(m.root.position.x, m.root.position.z);
          burst(at, '#ffcf5a', 4, 0.6, 0.3, FX.fire);
          smoke(at, 2.6, 1.6);
        }
      }
    }
    void names;
  }

  function syncProjectiles(list: ProjView[]) {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let g = projs.get(p.id);
      if (!g) {
        g = new THREE.Group();
        const look = LOOK[p.kind];
        const core = new THREE.Mesh(ballGeo, look.mat);
        core.scale.setScalar(look.size);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.light, color: look.halo, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.setScalar(1.6 * look.size);
        g.add(core, halo);
        if (p.kind === 'meteor') {
          // aviso no chão: círculo do tamanho da explosão, que pulsa até a pedra cair
          const warn = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: FX.circle, color: '#ff3a1a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          warn.rotation.x = -Math.PI / 2;
          warn.scale.setScalar((p.vel.x * 2) / 1.6);
          g.add(warn);
        }
        scene.add(g);
        projs.set(p.id, g);
      }
      if (p.kind === 'meteor') {
        const y = 0.9 + p.vel.y * 8; // vel.y = segundos até cair
        g.position.copy(w3(p.pos, y));
        g.children[2].position.y = 0.04 - y;
        ((g.children[2] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.4 * Math.sin(performance.now() / 70);
      } else g.position.copy(w3(p.pos, 0.9));
      // rastro: brasas que ficam para trás e somem
      const look = LOOK[p.kind];
      if (Math.random() < 0.7) burst(p.pos, look.trail, 1.1 * look.size, 0.35, 0.9, look.tex);
    }
    for (const [id, g] of projs) if (!seen.has(id)) {
      scene.remove(g);
      ((g.children[1] as THREE.Sprite).material as THREE.Material).dispose();
      if (g.children[2]) ((g.children[2] as THREE.Mesh).material as THREE.Material).dispose();
      projs.delete(id);
    }
  }

  function syncWizards(list: WizDraw[], now: number) {
    const seen = new Set<string>();
    for (const d of list) {
      let m = mages.get(d.id);
      // trocou de personagem na loja: refaz o boneco
      if (m && m.character !== d.character) {
        scene.remove(m.root);
        m.ring.material instanceof THREE.Material && m.ring.material.dispose();
        m.shield.material instanceof THREE.Material && m.shield.material.dispose();
        m.label.remove();
        mages.delete(d.id);
        m = undefined;
      }
      if (!m) {
        const made = makeMage(d);
        if (!made) continue;
        mages.set(d.id, (m = made));
      }
      seen.add(d.id);
      m.root.visible = true;
      m.root.position.copy(w3(d.pos));
      m.root.rotation.y = Math.PI / 2 - d.facing;
      m.shield.visible = d.shield && d.alive;
      if (d.shieldR) m.shield.scale.setScalar(d.shieldR / 0.85);
      m.ring.visible = d.alive;
      if (!d.alive) {
        if (!m.dead) {
          m.dead = true;
          play(m, 'Death_A', 0.1);
        }
        // afunda na lava se morreu fora da pedra
        if (Math.hypot(d.pos.x, d.pos.y) > shownR) m.root.position.y = Math.max(-1.8, m.root.position.y - 0.02);
      } else {
        if (m.dead) {
          m.dead = false;
          m.root.position.y = 0;
        }
        if (now > m.oneShotUntil) play(m, d.cheer ? 'Cheer' : d.moving ? 'Running_A' : 'Idle');
      }
      m.label.hidden = !d.alive;
      // ícones de efeito em cima do mago (negativos primeiro)
      if (m.statusKey !== d.status) {
        m.statusKey = d.status;
        const icons: [number, string, string][] = [[16, '💫', 'atordoado'], [8, '⚠️', 'vulnerável'], [32, '✨', 'invulnerável'], [64, '🩸', 'Pacto armado'], [128, '⛓️', 'preso'], [256, '💨', 'Investida'], [4, '🐌', 'lento (chão arcano)'], [512, '🔥', 'queimando']];
        m.statusEl.replaceChildren(...icons.filter(([bit]) => d.status & bit).map(([bit, ico, name]) => Object.assign(document.createElement('i'), { textContent: ico, title: name, className: [16, 4, 8, 128].includes(bit) ? 'bad' : 'good' })));
      }
      m.hpFill.style.width = `${Math.max(0, Math.min(100, (d.hp / d.hpMax) * 100))}%`;
      m.hpText.textContent = `${Math.max(0, Math.ceil(d.hp))}/${d.hpMax}`;
      m.lootBar.hidden = !d.loot;
      if (d.loot) m.lootFill.style.width = `${Math.min(100, d.loot * 100)}%`;
    }
    for (const [id, m] of mages) if (!seen.has(id)) {
      m.root.visible = false;
      m.label.hidden = true;
      void id;
    }
  }

  let focus = new THREE.Vector3();
  // câmera do jogador: roda do mouse aproxima/afasta; Espaço + arrastar desloca (Espaço sozinho volta ao centro)
  let zoom = 1;
  const pan = new THREE.Vector3();
  let lastDist = 20;
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  let composer: EffectComposer | null = null;
  if (!mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.45, 0.85));
    composer.addPass(new OutputPass());
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    // retrato (celular em pé) precisa de mais distância para caber a arena
    // distância para caber a arena inteira; retrato (celular em pé) precisa de mais
    camera.userData.fit = camera.aspect < 1 ? 1 / Math.max(0.5, camera.aspect) : 1;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let lastFrame = performance.now() / 1000;

  return {
    ready,
    onEvents,
    // baixa antes os personagens de quem está na sala, para ninguém aparecer invisível na rodada
    preload(ids: string[]) {
      for (const id of ids) preload(id);
    },
    // ponto do chão sob o cursor, em coordenadas da simulação
    pick(clientX: number, clientY: number): Vec | null {
      const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      return raycaster.ray.intersectPlane(ground, hit) ? v(hit.x, hit.z) : null;
    },
    clickMarker(at: Vec, cast: boolean) {
      const ring = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: cast ? '#ffb347' : '#7dff9a', transparent: true, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(w3(at, 0.04));
      addFx(ring, 0.45, (k) => {
        ring.scale.setScalar(1 + k * 2);
        (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      });
    },
    // balão do taunt em cima do mago por 2,5 s
    bubble(id: string, text: string) {
      const m = mages.get(id);
      if (!m) return false;
      m.label.querySelector('.bubble')?.remove();
      const b = document.createElement('div');
      b.className = 'bubble';
      b.textContent = text;
      m.label.prepend(b);
      setTimeout(() => b.remove(), 2500);
      return true;
    },
    zoomBy(deltaY: number) {
      zoom = Math.min(1.7, Math.max(0.45, zoom * Math.exp(deltaY * 0.0012)));
    },
    // arrasto em pixels de tela → deslocamento no chão (o chão "anda junto" com o mouse)
    panBy(dx: number, dy: number) {
      const k = (lastDist * 1.1) / innerHeight;
      pan.x -= dx * k;
      pan.z -= dy * k * 1.3;
      pan.clampLength(0, 30);
    },
    resetCamera() {
      pan.set(0, 0, 0);
    },
    castLocal(id: string, spell: string) {
      oneShot(id, spell === 'shield' || spell === 'rush' ? 'Spellcast_Raise' : 'Spellcast_Shoot', 0.55);
    },
    render(state: { arenaR: number; shrinkIn: number; wizards: WizDraw[]; projectiles: ProjView[]; pillars: PillarView[]; loot: { pos: Vec; left: number } | null; follow: Vec | null }) {
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - lastFrame);
      lastFrame = now;
      lavaMat.uniforms.uTime.value = now;

      shownR += (state.arenaR - shownR) * Math.min(1, dt * 4);
      arena.scale.set(shownR, 1, shownR);
      rim.scale.setScalar(Math.max(0.001, shownR));
      under.intensity = 40 + Math.sin(now * 2) * 8;
      const warning = state.shrinkIn > 0 && state.shrinkIn < SHRINK_WARN && state.arenaR > 0;
      warnMat.opacity = warning ? 0.25 + 0.25 * Math.sin(now * 14) : 0;
      if (warning && warnR !== state.arenaR) {
        warnR = state.arenaR;
        const inner = Math.max(0.01, state.arenaR - ARENA_STEP);
        warn.geometry.dispose();
        warn.geometry = new THREE.RingGeometry(inner, state.arenaR, 96);
      }

      syncWizards(state.wizards, now);
      syncProjectiles(state.projectiles);
      syncPillars(state.pillars);
      // baú de ouro: caixa simples com tampa dourada, brilho e balanço
      pile.visible = !!state.loot;
      if (state.loot) {
        pile.position.copy(w3(state.loot.pos, 0));
        pile.scale.setScalar(0.6 + 0.4 * (state.loot.left / CHEST.pile));
        pile.rotation.y = now * 0.6;
      }
      for (const m of mages.values()) m.mixer.update(dt);
      decor.update(shownR, now);
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        const k = (now - f.born) / (f.until - f.born);
        if (k >= 1) {
          scene.remove(f.obj);
          dispose(f.obj);
          fx.splice(i, 1);
        } else f.update?.(k);
      }

      // câmera inclinada estilo Dota, seguindo de leve o próprio mago
      // em pé a arena não cabe na largura: a câmera acompanha mais o próprio mago
      const target = (state.follow ? w3(state.follow).multiplyScalar(camera.aspect < 1 ? 0.65 : 0.3) : new THREE.Vector3()).add(pan);
      focus.lerp(target, Math.min(1, dt * 3));
      // aproxima conforme a arena encolhe
      const dist = Math.min(44, Math.max(13, shownR * 2.1 + 2) * (camera.userData.fit as number)) * zoom;
      lastDist = dist;
      // olha um pouco à frente do centro para a borda de baixo não ficar atrás da barra de magias
      const lookZ = focus.z + dist * 0.06;
      camera.position.set(focus.x, dist * 0.74, lookZ + dist * 0.67);
      camera.lookAt(focus.x, 0, lookZ);
      if (shake > 0.01 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.z += (Math.random() - 0.5) * shake;
      }
      shake *= 0.9;

      // números de dano: sobem 1,2 m em 0,9 s e somem
      for (let i = numbers.length - 1; i >= 0; i--) {
        const d = numbers[i];
        const k = (now - d.born) / 1.2;
        if (k >= 1) {
          d.el.remove();
          numbers.splice(i, 1);
          continue;
        }
        const p = d.at.clone().setY(d.at.y + k * 1.2).project(camera);
        d.el.style.transform = `translate(${(p.x * innerWidth) / 2 + innerWidth / 2}px, ${(-p.y * innerHeight) / 2 + innerHeight / 2}px) translate(-50%, -50%) scale(${1 + 0.3 * Math.max(0, 0.2 - k) * 5})`;
        d.el.style.opacity = String(Math.min(1, (1 - k) * 2.5));
      }

      // barras dos obstáculos, logo acima de cada um
      for (const p of pillarMeshes) {
        if (!p.bar || p.bar.hidden) continue;
        if (p.dead) {
          p.bar.hidden = true;
          continue;
        }
        const q = p.obj.position.clone().setY(p.height + 0.15).project(camera);
        p.bar.style.transform = `translate(${(q.x * innerWidth) / 2 + innerWidth / 2}px, ${(-q.y * innerHeight) / 2 + innerHeight / 2}px) translate(-50%, -100%)`;
      }

      // nome e vida em cima de cada mago
      const half = new THREE.Vector2(innerWidth / 2, innerHeight / 2);
      for (const m of mages.values()) {
        if (m.label.hidden) continue;
        const p = m.root.position.clone().setY(2.1).project(camera);
        m.label.style.transform = `translate(${(p.x * half.x + half.x).toFixed(1)}px, ${(-p.y * half.y + half.y).toFixed(1)}px) translate(-50%, -100%)`;
      }

      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
  };
}

export type GameScene = ReturnType<typeof createScene>;
