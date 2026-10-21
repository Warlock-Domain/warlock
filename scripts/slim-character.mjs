// Corta um personagem KayKit para o jogo: só as animações usadas e sem as armas extras.
// node scripts/slim-character.mjs <entrada.glb> public/models/<id>.glb [nós a remover] [glbs do pacote de animações]
// (listas separadas por vírgula; nós a remover vazio = o padrão)
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';

// do próprio boneco; o gesto de cada magia e situação está em CAST_ANIM e TAUNT_ANIM (src/client/scene.ts)
const KEEP = ['Idle', 'Running_A', 'Spellcast_Shoot', 'Hit_A', 'Death_A', 'Cheer', 'Dodge_Forward', 'Throw', 'Hit_B', 'Jump_Idle', 'Death_B',
  'Block', 'Spellcast_Long', 'Dodge_Backward', 'Unarmed_Melee_Attack_Kick', '2H_Melee_Attack_Spinning'];
// do KayKit Character Animations 1.1 (Rig_Medium: mesmos ossos e mesma pose de repouso), copiados osso a osso pelo nome
const PACK = ['Ranged_Magic_Summon', 'Waving', 'Skeletons_Taunt', 'Spawn_Ground'];
const [src, out, drop, extra = ''] = process.argv.slice(2);
const DROP_NODES = (drop || 'Spellbook,Spellbook_open,1H_Wand').split(',');
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
const bone = new Map(root.listNodes().map((n) => [n.getName(), n]));
const copy = (x) => doc.createAccessor().setType(x.getType()).setArray(x.getArray().slice()).setBuffer(root.listBuffers()[0]);
for (const f of extra.split(',').filter(Boolean)) for (const a of (await io.read(f)).getRoot().listAnimations()) {
  if (!PACK.includes(a.getName())) continue;
  const anim = doc.createAnimation(a.getName());
  for (const c of a.listChannels()) {
    const node = bone.get(c.getTargetNode().getName());
    if (!node) continue;
    const s = c.getSampler();
    const t = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
    anim.addSampler(t).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(c.getTargetPath()).setSampler(t));
  }
}
for (const n of root.listNodes()) if (DROP_NODES.includes(n.getName())) n.dispose();
await doc.transform(resample(), prune(), dedup());
await io.write(out, doc);
console.log('animações:', root.listAnimations().map((a) => a.getName()).join(', '));
