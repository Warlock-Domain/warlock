// Corta o Mage.glb do KayKit para o jogo: só as animações usadas, sem livro e varinha.
// node scripts/slim-mage.mjs <entrada.glb> public/models/mage.glb
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';

const KEEP = ['Idle', 'Running_A', 'Spellcast_Shoot', 'Spellcast_Raise', 'Hit_A', 'Death_A', 'Cheer'];
const DROP_NODES = ['Spellbook', 'Spellbook_open', '1H_Wand'];
const [src, out] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(src);
const root = doc.getRoot();
for (const a of root.listAnimations()) {
  if (KEEP.includes(a.getName())) continue;
  // os samplers soltos seguram os dados da animação; sem isso o prune não remove nada
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}
for (const n of root.listNodes()) if (DROP_NODES.includes(n.getName())) n.dispose();
await doc.transform(resample(), prune(), dedup());
await io.write(out, doc);
console.log('animações:', root.listAnimations().map((a) => a.getName()).join(', '));
