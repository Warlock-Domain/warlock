// Corta um personagem KayKit para o jogo: só as animações usadas e sem as armas extras.
// node scripts/slim-character.mjs <entrada.glb> public/models/<id>.glb [nós a remover, separados por vírgula]
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';

// gestos: Dodge_Forward (Teleporte), Throw (Agarrar), Hit_B (preso pelo Agarrar), Jump_Idle (arremessado), Death_B (morte fora da lava)
const KEEP = ['Idle', 'Running_A', 'Spellcast_Shoot', 'Spellcast_Raise', 'Hit_A', 'Death_A', 'Cheer', 'Dodge_Forward', 'Throw', 'Hit_B', 'Jump_Idle', 'Death_B'];
const [src, out, drop = 'Spellbook,Spellbook_open,1H_Wand'] = process.argv.slice(2);
const DROP_NODES = drop.split(',');
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
