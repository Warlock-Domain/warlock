import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type Model } from '../src/client/scene.ts';

// the project has no @types/node: only the type of what the tests use
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };

// GLB without textures (node cannot decode images): rebuilds the file with the cleaned JSON and the same binary chunk
export async function loadModel(id: string): Promise<Model> {
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
  out.set(bin, 20 + json.length); // the BIN chunk length and type come with it
  const g = await new GLTFLoader().parseAsync(out.buffer, '');
  return { scene: g.scene, clips: g.animations };
}
