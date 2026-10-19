import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS, encodeLook, type CharacterId } from '../src/shared/characters.ts';
import { assemble, type Model } from '../src/client/scene.ts';

// o projeto não tem @types/node: só o tipo do que o teste usa
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };

// GLB sem as texturas (o node não decodifica imagem): refaz o arquivo com o JSON limpo e o mesmo bloco binário
async function load(id: string): Promise<Model> {
  const b = readFileSync(`public/models/${id}.glb`);
  const dv = new DataView(b.buffer, b.byteOffset);
  const len = dv.getUint32(12, true);
  const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len)));
  delete j.images;
  delete j.textures;
  for (const m of j.materials) delete m.pbrMetallicRoughness?.baseColorTexture;
  const json = new TextEncoder().encode(JSON.stringify(j).padEnd(Math.ceil(JSON.stringify(j).length / 4) * 4));
  const bin = b.subarray(20 + len);
  const out = new Uint8Array(20 + json.length + bin.length);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true); // glTF
  o.setUint32(4, 2, true);
  o.setUint32(8, out.length, true);
  o.setUint32(12, json.length, true);
  o.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(json, 20);
  out.set(bin, 20 + json.length); // tamanho e tipo do bloco BIN vêm junto
  const g = await new GLTFLoader().parseAsync(out.buffer, '');
  return { scene: g.scene, clips: g.animations };
}

// boneco clonado (como cada mago) na pose de Running_A aos t s; posição no mundo de ~25 vértices de uma malha
function sample(src: Model, name: string, t: number): number[] {
  const root = cloneSkinned(src.scene);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(src.clips.find((c) => c.name === 'Running_A')!).play();
  mixer.update(t);
  root.updateMatrixWorld(true);
  const m = root.getObjectByName(name) as THREE.Mesh;
  const out: number[] = [];
  const v = new THREE.Vector3();
  const n = m.geometry.attributes.position.count;
  (m as THREE.SkinnedMesh).skeleton?.update();
  for (let i = 0; i < n; i += Math.ceil(n / 25)) {
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).getVertexPosition(i, v);
    else v.fromBufferAttribute(m.geometry.attributes.position, i);
    out.push(...v.applyMatrix4(m.matrixWorld).toArray());
  }
  return out;
}

describe('montagem da aparência (scene.ts)', () => {
  it('peça de outro boneco fica no mesmo lugar que no original, animada', async () => {
    const files = new Map<CharacterId, Model>();
    for (const c of CHARACTERS) files.set(c.id, await load(c.id));
    // cabeça e elmo do esqueleto guerreiro, tronco do mago, braços do bárbaro, pernas da ladina, manto do lacaio, espada e escudo
    const mixed = assemble(encodeLook([8, 5, 0, 2, 3, 5, 2]), (id) => files.get(id)!);
    const parts: [CharacterId, string][] = [['skeleton_warrior', 'Skeleton_Warrior_Head'], ['skeleton_warrior', 'Skeleton_Warrior_Helmet'], ['barbarian', 'Barbarian_ArmLeft'],
      ['rogue', 'Rogue_LegRight'], ['skeleton_minion', 'Skeleton_Minion_Cloak'], ['knight', '1H_Sword'], ['knight', 'Round_Shield'], ['mage', 'Mage_Body']];
    for (const [id, name] of parts) {
      const a = sample(mixed, name, 0.37), b = sample(files.get(id)!, name, 0.37);
      expect(Math.max(...a.map((x, i) => Math.abs(x - b[i]))), name).toBeLessThan(1e-4);
    }
    // controle: em outro instante da corrida a cabeça está em outro lugar (o teste enxerga a diferença)
    const a = sample(mixed, 'Skeleton_Warrior_Head', 0.37), b = sample(files.get('skeleton_warrior')!, 'Skeleton_Warrior_Head', 0.6);
    expect(Math.max(...a.map((x, i) => Math.abs(x - b[i])))).toBeGreaterThan(0.05);
    // só as peças do look: nada do mago sobrou além do tronco
    const names: string[] = [];
    mixed.scene.traverse((o) => (o as THREE.Mesh).isMesh && names.push(o.name));
    expect(names.sort()).toEqual(['1H_Sword', 'Barbarian_ArmLeft', 'Barbarian_ArmRight', 'Mage_Body', 'Rogue_LegLeft', 'Rogue_LegRight', 'Round_Shield', 'Skeleton_Minion_Cloak',
      'Skeleton_Warrior_Eyes', 'Skeleton_Warrior_Head', 'Skeleton_Warrior_Helmet', 'Skeleton_Warrior_Jaw']);
  });
});
