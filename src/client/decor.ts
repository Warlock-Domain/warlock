// Decoração KayKit (CC0): ilhas de pedra com ruínas na lava em volta da arena e ossos espalhados no chão
// que afundam quando a camada deles cai. Só visual: nada aqui entra na simulação.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type Prop = { obj: THREE.Object3D; r: number; baseY: number };

// [modelos da ilha, raio, ângulo em graus]
const ISLANDS: [string[], number, number][] = [
  [['tree_dead_large', 'skull'], 17.3, 20],
  [['pillar_decorated', 'torch_lit'], 16.6, 62],
  [['arch'], 18, 105],
  [['post_skull', 'rubble_large'], 16.4, 148],
  [['tree_dead_medium', 'lantern_standing'], 17.6, 190],
  [['column', 'torch_lit'], 16.5, 232],
  [['shrine_candles', 'ribcage'], 17.2, 275],
  [['pillar', 'skull_candle'], 16.7, 318],
];
const FLOOR: [string, number, number][] = [
  // dentro da menor arena (2 magos, 9,7 m) para nenhum começar afundado
  ['bone_A', 8.9, 35], ['skull', 8.4, 80], ['rubble_half', 9.2, 128], ['bone_B', 7.7, 170],
  ['ribcage', 8.8, 215], ['candle_triple', 8.2, 255], ['bone_A', 7.3, 300], ['skull', 8.6, 340],
];
// entulho do Dungeon tem 4 a 8 unidades de largura: reduzido para caber como detalhe
const SCALE: Record<string, number> = { rubble_large: 0.35, rubble_half: 0.4 };
const FLAME_ON = new Set(['torch_lit', 'lantern_standing', 'skull_candle', 'shrine_candles', 'candle_triple']);

// unitScale: escala do mago (os pacotes KayKit usam a mesma medida), conhecida depois que o mago carrega
export function createDecor(scene: THREE.Scene, unitScale: Promise<number>, glow: THREE.Texture) {
  const props: Prop[] = [];
  const flames: THREE.Sprite[] = [];
  const islandMat = new THREE.MeshStandardMaterial({ color: '#b8aaa0', roughness: 1, emissive: '#3a0c02', emissiveIntensity: 0.4 });
  new THREE.TextureLoader().load('/tex/stone.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    islandMat.map = t;
    islandMat.needsUpdate = true;
  });

  const ready = Promise.all([new GLTFLoader().loadAsync('/models/decor.glb'), unitScale]).then(([g, k]) => {
    const models = new Map<string, THREE.Object3D>();
    for (const child of g.scene.children) models.set(child.name.replace(/\.gltf$/, ''), child);
    const place = (name: string, x: number, z: number, rot: number, parent: THREE.Object3D) => {
      const src = models.get(name);
      if (!src) return null;
      const o = src.clone(true);
      o.position.set(x, 0, z);
      o.rotation.y = rot;
      o.scale.setScalar(k * (SCALE[name] ?? 1));
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
      });
      // alguns modelos têm a origem no meio: apoia o fundo no chão (medido antes de entrar no pai, em coordenadas locais)
      o.position.y -= new THREE.Box3().setFromObject(o).min.y;
      parent.add(o);
      if (FLAME_ON.has(name)) {
        // brilho de chama no topo das tochas e velas (sem luz de verdade: barato no celular)
        const top = new THREE.Box3().setFromObject(o).max.y;
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffae42', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        f.position.set(x, top - o.position.y + 0.05, z);
        f.scale.setScalar(0.9);
        parent.add(f);
        flames.push(f);
      }
      return o;
    };

    for (const [names, r, deg] of ISLANDS) {
      const a = (deg * Math.PI) / 180;
      const island = new THREE.Group();
      island.position.set(Math.cos(a) * r, -0.15, Math.sin(a) * r);
      const rock = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.3, 1.2, 9), islandMat);
      rock.position.y = -0.6;
      rock.receiveShadow = true;
      island.add(rock);
      names.forEach((n, i) => place(n, i === 0 ? 0 : 0.8, i === 0 ? 0 : 0.6, a + Math.PI / 2, island));
      scene.add(island);
    }
    for (const [name, r, deg] of FLOOR) {
      const a = (deg * Math.PI) / 180;
      const holder = new THREE.Group();
      scene.add(holder);
      const o = place(name, Math.cos(a) * r, Math.sin(a) * r, deg, holder);
      if (o) props.push({ obj: holder, r, baseY: 0 });
    }
  }).catch(() => console.warn('decoração não carregou; a arena segue sem ela'));

  return {
    ready,
    // ossos e entulho fora da pedra afundam na lava; as chamas tremulam
    update(arenaR: number, now: number) {
      for (const p of props) {
        const target = p.r > arenaR - 0.2 ? -1.5 : p.baseY;
        p.obj.position.y += (target - p.obj.position.y) * 0.04;
        p.obj.visible = p.obj.position.y > -1.4;
      }
      flames.forEach((f, i) => f.scale.setScalar(0.75 + 0.18 * Math.sin(now * 9 + i * 1.7) + 0.08 * Math.sin(now * 23 + i)));
    },
  };
}
