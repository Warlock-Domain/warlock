// Decoração KayKit (CC0): ilhas de pedra com ruínas na lava em volta da arena e ossos espalhados no chão
// que afundam quando a camada deles cai. Só visual: nada aqui entra na simulação.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { v, type Vec } from '../shared/vec.ts';

type Prop = { obj: THREE.Object3D; pos: Vec };
// distância até a borda da arena (positiva na pedra), da forma desta rodada
type EdgeOf = (p: Vec) => number;

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
// sombra em toda malha do modelo
const shadows = (o: THREE.Object3D) => o.traverse((m) => {
  if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
});

// unitScale: escala do mago (os pacotes KayKit usam a mesma medida), conhecida depois que o mago carrega
export function createDecor(scene: THREE.Scene, unitScale: Promise<number>, glow: THREE.Texture) {
  const props: Prop[] = [];
  let models = new Map<string, THREE.Object3D>();
  let unit = 1;
  const flames: THREE.Sprite[] = [];
  const islands: { g: THREE.Group; r: number; a: number }[] = [];
  let edgeOf: EdgeOf | null = null;
  // ilhas de decoração afastadas da pedra (as arenas novas são mais compridas que o círculo) e das ilhas de refúgio (até 5,4 m da borda, mais o raio de 1,7 m destas); ossos fora da pedra já afundados
  const arrange = () => {
    if (!edgeOf) return;
    for (const it of islands) {
      let r = it.r;
      while (r < 40 && edgeOf(v(Math.cos(it.a) * r, Math.sin(it.a) * r)) > -7.5) r += 0.5;
      it.g.position.set(Math.cos(it.a) * r, 0.1, Math.sin(it.a) * r);
    }
    for (const p of props) {
      p.obj.position.y = edgeOf(p.pos) < 0.2 ? -1.5 : 0;
      p.obj.visible = p.obj.position.y > -1.4;
    }
  };
  const islandMat = new THREE.MeshStandardMaterial({ color: '#b8aaa0', roughness: 1, emissive: '#3a0c02', emissiveIntensity: 0.4 });
  new THREE.TextureLoader().load('/tex/stone.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    islandMat.map = t;
    islandMat.needsUpdate = true;
  });

  const ready = Promise.all([new GLTFLoader().loadAsync('/models/decor.glb'), unitScale]).then(([g, k]) => {
    models = new Map<string, THREE.Object3D>();
    for (const child of g.scene.children) models.set(child.name.replace(/\.gltf$/, ''), child);
    unit = k;
    const place = (name: string, x: number, z: number, rot: number, parent: THREE.Object3D) => {
      const src = models.get(name);
      if (!src) return null;
      const o = src.clone(true);
      o.position.set(x, 0, z);
      o.rotation.y = rot;
      o.scale.setScalar(k * (SCALE[name] ?? 1));
      shadows(o);
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
      island.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      const rock = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.3, 1.2, 9), islandMat);
      rock.position.y = -0.6;
      rock.receiveShadow = true;
      island.add(rock);
      names.forEach((n, i) => place(n, i === 0 ? 0 : 0.8, i === 0 ? 0 : 0.6, a + Math.PI / 2, island));
      scene.add(island);
      islands.push({ g: island, r, a });
    }
    for (const [name, r, deg] of FLOOR) {
      const a = (deg * Math.PI) / 180;
      const holder = new THREE.Group();
      scene.add(holder);
      const o = place(name, Math.cos(a) * r, Math.sin(a) * r, deg, holder);
      if (o) props.push({ obj: holder, pos: v(Math.cos(a) * r, Math.sin(a) * r) });
    }
    arrange();
  }).catch(() => console.warn('decoração não carregou; a arena segue sem ela'));

  return {
    ready,
    // cópia de um modelo da decoração (para os pilares da arena), já na escala do jogo; null se ainda não carregou
    clone(name: string): THREE.Object3D | null {
      const src = models.get(name);
      if (!src) return null;
      const o = src.clone(true);
      o.scale.setScalar(unit);
      shadows(o);
      return o;
    },
    // arena nova (ou rodada nova): arruma a decoração para a forma dela
    layout(edge: EdgeOf) {
      edgeOf = edge;
      arrange();
    },
    // ossos e entulho fora da pedra afundam na lava; as chamas tremulam
    update(edge: EdgeOf, now: number) {
      for (const p of props) {
        const target = edge(p.pos) < 0.2 ? -1.5 : 0;
        p.obj.position.y += (target - p.obj.position.y) * 0.04;
        p.obj.visible = p.obj.position.y > -1.4;
      }
      flames.forEach((f, i) => f.scale.setScalar(0.75 + 0.18 * Math.sin(now * 9 + i * 1.7) + 0.08 * Math.sin(now * 23 + i)));
    },
  };
}
