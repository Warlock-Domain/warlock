// Capuz como chapéu (issue #107): copia o capuz da cabeça da Ladina encapuzada (Rogue_Head_Hooded) para o rogue.glb como a malha
// Rogue_Hood, skinada só no osso da cabeça como as outras. O capuz original abraça só a cabeça dela: 20% maior e 7 cm mais alto
// ele cobre o cabelo das outras cabeças; onde ainda encostava (o topete do Cavaleiro), a metade de cima da casca é empurrada para fora
// (embaixo não: o rabo de cavalo da Ladina e o coque do Mago esticariam o capuz até o pescoço).
// Só acrescenta ao GLB (o resto do arquivo fica igual). Rodar uma vez: node scripts/assets/hood.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SCALE = 1.2, LIFT = 0.07, GAP = 0.03;
const CENTER = [0, 1.62, 0]; // meio da cabeça, no espaço do modelo (y para cima)
const HEADS = { mage: ['Mage_Head'], knight: ['Knight_Head'], barbarian: ['Barbarian_Head'], rogue: ['Rogue_Head'], skeleton_mage: ['Skeleton_Mage_Skull'],
  skeleton_minion: ['Skeleton_Minion_Head'], skeleton_rogue: ['Skeleton_Rogue_Head'], skeleton_warrior: ['Skeleton_Warrior_Head'] };

const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function open(path) {
  const b = readFileSync(path);
  const len = b.readUInt32LE(12);
  return { j: JSON.parse(b.subarray(20, 20 + len).toString()), bin: b.subarray(28 + len) };
}
// bytes de cada elemento do accessor (respeita o byteStride das views intercaladas)
function elements({ j, bin }, a) {
  const acc = j.accessors[a], view = j.bufferViews[acc.bufferView];
  const size = SIZE[acc.componentType] * COMP[acc.type], stride = view.byteStride ?? size, start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return Array.from({ length: acc.count }, (_, i) => bin.subarray(start + i * stride, start + i * stride + size));
}
const vec3 = (e) => [e.readFloatLE(0), e.readFloatLE(4), e.readFloatLE(8)];
const prim = (g, name) => g.j.meshes[g.j.nodes.find((n) => n.name === name).mesh].primitives[0];

const src = open('public/models/rogue_hooded.glb');
const p = prim(src, 'Rogue_Head_Hooded');
const tri = elements(src, p.indices).map((e) => e.readUInt16LE(0));
// ilhas da malha (vértices ligados por triângulo): o rosto e as sobrancelhas ficam; o capuz são as ilhas de 144, 44, 42, 7 e 7 vértices
const up = [...Array(src.j.accessors[p.attributes.POSITION].count).keys()];
const root = (v) => (up[v] === v ? v : (up[v] = root(up[v])));
for (let i = 0; i < tri.length; i += 3) for (const v of [tri[i + 1], tri[i + 2]]) up[root(v)] = root(tri[i]);
const size = new Map();
for (const v of up.keys()) size.set(root(v), (size.get(root(v)) ?? 0) + 1);
const isHood = (v) => [144, 44, 42, 7].includes(size.get(root(v)));
const shell = (v) => size.get(root(v)) === 144;
const keep = up.keys().filter(isHood).toArray();
if (keep.length !== 244) throw new Error(`capuz com ${keep.length} vértices (esperado 244): o modelo mudou?`);
const map = new Map(keep.map((v, i) => [v, i]));

// pontos de todas as cabeças, para empurrar a casca para fora onde encosta
const heads = Object.entries(HEADS).flatMap(([id, names]) => {
  const g = open(`public/models/${id}.glb`);
  return names.flatMap((n) => elements(g, prim(g, n).attributes.POSITION).map(vec3));
});
const sub = (a, b) => a.map((x, i) => x - b[i]);
const len3 = (a) => Math.hypot(...a);
const pos = elements(src, p.attributes.POSITION).map(vec3);
let pushed = 0;
const out = keep.map((v) => {
  let d = sub(pos[v], CENTER).map((x) => x * SCALE);
  if (shell(v) && d[1] > 0) {
    const r = len3(d), u = d.map((x) => x / r);
    const reach = Math.max(0, ...heads.map((h) => sub(h, [CENTER[0], CENTER[1] + LIFT, CENTER[2]])).filter((h) => (h[0] * u[0] + h[1] * u[1] + h[2] * u[2]) / len3(h) > 0.985).map(len3));
    if (r < reach + GAP) (d = u.map((x) => x * (reach + GAP))), pushed++;
  }
  return [d[0] + CENTER[0], d[1] + CENTER[1] + LIFT, d[2] + CENTER[2]];
});

// acrescenta: uma view por atributo (posição nova; normal, UV, ossos e pesos copiados), índices novos, malha e nó filho do Rig
const dst = open('public/models/rogue.glb');
const { j } = dst;
if (j.nodes.some((n) => n.name === 'Rogue_Hood')) throw new Error('rogue.glb já tem o Rogue_Hood');
const chunks = [dst.bin];
let offset = dst.bin.length;
function add(buf, acc) {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) chunks.push(Buffer.alloc(pad));
  offset += pad;
  j.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target: acc.type === 'SCALAR' ? 34963 : 34962 });
  chunks.push(buf);
  offset += buf.length;
  return j.accessors.push({ ...acc, bufferView: j.bufferViews.length - 1, byteOffset: 0 }) - 1;
}
const posBuf = Buffer.alloc(out.length * 12);
out.forEach((v, i) => v.forEach((x, k) => posBuf.writeFloatLE(x, i * 12 + k * 4)));
const attributes = {
  POSITION: add(posBuf, { type: 'VEC3', componentType: 5126, count: out.length, min: [0, 1, 2].map((k) => Math.min(...out.map((v) => v[k]))), max: [0, 1, 2].map((k) => Math.max(...out.map((v) => v[k]))) }),
};
for (const name of ['NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
  const a = src.j.accessors[p.attributes[name]], all = elements(src, p.attributes[name]);
  attributes[name] = add(Buffer.concat(keep.map((v) => all[v])), { type: a.type, componentType: a.componentType, count: keep.length, ...(a.normalized && { normalized: true }) });
}
const idx = tri.filter((_, i) => isHood(tri[i - (i % 3)]));
const idxBuf = Buffer.alloc(idx.length * 2);
idx.forEach((v, i) => idxBuf.writeUInt16LE(map.get(v), i * 2));
const indices = add(idxBuf, { type: 'SCALAR', componentType: 5123, count: idx.length });
const head = j.nodes.find((n) => n.name === 'Rogue_Head');
j.meshes.push({ name: 'Rogue_Hood', primitives: [{ attributes, indices, material: prim(dst, 'Rogue_Head').material }] });
j.nodes.push({ name: 'Rogue_Hood', mesh: j.meshes.length - 1, skin: head.skin });
j.nodes.find((n) => n.name === 'Rig').children.push(j.nodes.length - 1);

const tail = (4 - (offset % 4)) % 4;
if (tail) chunks.push(Buffer.alloc(tail));
const bin = Buffer.concat(chunks);
j.buffers[0].byteLength = bin.length;
let json = Buffer.from(JSON.stringify(j));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const glb = Buffer.alloc(28 + json.length + bin.length);
glb.writeUInt32LE(0x46546c67, 0);
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(json.length, 12);
glb.writeUInt32LE(0x4e4f534a, 16);
json.copy(glb, 20);
glb.writeUInt32LE(bin.length, 20 + json.length);
glb.writeUInt32LE(0x004e4942, 24 + json.length);
bin.copy(glb, 28 + json.length);
writeFileSync('public/models/rogue.glb', glb);
console.log(`Rogue_Hood: ${keep.length} vértices, ${idx.length / 3} triângulos; ${pushed} vértices da casca empurrados para fora`);
