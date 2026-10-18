// Bots simples: fogem da borda, desviam às vezes e atiram no mais próximo.
import { WIZ_R, WIZ_SPEED } from './constants.ts';
import type { Cmd, Wizard, World } from './sim.ts';
import { ITEM_IDS, itemPrice, type ItemId } from './items.ts';
import { MAX_SPELLS, METEOR_DELAY, priceOf, spellCount, spellLevel, type SpellId } from './spells.ts';
import { add, dist, dot, len, norm, scale, sub, v, type Vec } from './vec.ts';

type Buyer = { gold: number; spells: Record<SpellId, number>; items?: Record<ItemId, number> };

// ordem de compra das magias; com o limite de 6, quem fica de fora são as últimas da lista
const BOT_SPELLS: SpellId[] = ['lightning', 'homing', 'meteor', 'cluster', 'shield', 'teleport', 'rush', 'swap', 'grip'];
// magias que faltam primeiro; depois defesa (armadura, anel, botas); depois melhorar a magia de menor nível
const BOT_ITEMS: ItemId[] = ['armor', 'ring', 'boots', 'cape', 'scourge'];
export type BotPick = { kind: 'spell'; id: SpellId } | { kind: 'item'; id: ItemId };

export function botBuy(p: Buyer): BotPick | null {
  const missing = spellCount(p.spells) >= MAX_SPELLS ? [] : BOT_SPELLS.filter((s) => p.spells[s] === 0 && (priceOf(s, 0) ?? Infinity) <= p.gold);
  if (missing.length) return { kind: 'spell', id: missing[0] };
  const items = p.items;
  const item = items && BOT_ITEMS.find((i) => items[i] === 0 && (itemPrice(items, i) ?? Infinity) <= p.gold);
  if (item) return { kind: 'item', id: item };
  const owned = (['fireball', ...BOT_SPELLS] as SpellId[]).filter((s) => p.spells[s] > 0 && (priceOf(s, p.spells[s]) ?? Infinity) <= p.gold);
  owned.sort((a, b) => p.spells[a] - p.spells[b]);
  return owned[0] ? { kind: 'spell', id: owned[0] } : null;
}
void ITEM_IDS;

export function botCmds(w: World, id: string, rand: () => number): Cmd[] {
  const me = w.wizards.find((z) => z.id === id && z.alive);
  if (!me) return [];
  const ready = (s: SpellId) => me.spells[s] > 0 && w.t >= me.cd[s];
  const cmds: Cmd[] = [];
  const jitter = (r: number): Vec => v((rand() - 0.5) * r, (rand() - 0.5) * r);

  const threat = w.projectiles.find((p) => p.owner !== id && dist(p.pos, me.pos) < 3 && dot(p.vel, sub(me.pos, p.pos)) > 0);
  if (threat) {
    const side = norm(v(-threat.vel.y, threat.vel.x));
    const inward = dot(side, me.pos) > 0 ? scale(side, -1) : side;
    if (ready('shield') && rand() < 0.4) cmds.push({ id, kind: 'cast', spell: 'shield', at: me.pos });
    else if (ready('teleport') && rand() < 0.3) cmds.push({ id, kind: 'cast', spell: 'teleport', at: add(me.pos, scale(inward, 4)) });
    else if (rand() < 0.6) cmds.push({ id, kind: 'move', to: add(me.pos, scale(inward, 2)) });
  }

  if (len(me.pos) > w.arenaR - 1.5) {
    cmds.push({ id, kind: 'move', to: add(scale(norm(me.pos), Math.max(0, w.arenaR * 0.4)), jitter(2)) });
  } else if (!me.target && rand() < 0.25) {
    cmds.push({ id, kind: 'move', to: scale(add(me.pos, jitter(6)), Math.min(1, (w.arenaR * 0.6) / Math.max(1, len(me.pos)))) });
  }

  let enemy = null;
  // nos Times, só mira quem é do outro time
  for (const z of w.wizards) if (z.alive && z.id !== id && (me.team === null || z.team !== me.team) && (!enemy || dist(z.pos, me.pos) < dist(enemy.pos, me.pos))) enemy = z;
  if (!enemy) return cmds;
  const d = dist(enemy.pos, me.pos);
  // mira onde o alvo vai estar quando a bola de fogo chegar
  const fire = spellLevel('fireball', me.spells.fireball);
  const travel = d / fire.speed;
  const lead = enemy.target ? scale(norm(sub(enemy.target, enemy.pos)), Math.min(dist(enemy.target, enemy.pos), WIZ_SPEED * travel)) : v(0, 0);
  // o meteoro demora a cair: mira onde o alvo vai estar andando até o destino dele
  const meteorAim = (z: Wizard) => (z.target ? add(z.pos, scale(norm(sub(z.target, z.pos)), Math.min(dist(z.target, z.pos), WIZ_SPEED * METEOR_DELAY))) : z.pos);
  const aim = add(add(add(enemy.pos, lead), scale(enemy.vel, travel * 0.5)), jitter(0.8));
  if (me.items.scourge && w.t >= me.itemCd.scourge && d < 1.4 && rand() < 0.4) cmds.push({ id, kind: 'item', item: 'scourge', at: me.pos });
  else if (ready('lightning') && d < spellLevel('lightning', me.spells.lightning).range && rand() < 0.5) cmds.push({ id, kind: 'cast', spell: 'lightning', at: aim });
  else if (ready('meteor') && d < spellLevel('meteor', me.spells.meteor).range && rand() < 0.5) cmds.push({ id, kind: 'cast', spell: 'meteor', at: meteorAim(enemy) });
  else if (ready('cluster') && d < spellLevel('cluster', me.spells.cluster).range && rand() < 0.5) cmds.push({ id, kind: 'cast', spell: 'cluster', at: aim });
  else if (ready('homing') && rand() < 0.3) cmds.push({ id, kind: 'cast', spell: 'homing', at: enemy.pos });
  else if (ready('fireball') && d < fire.range + 1 && d > WIZ_R * 3 && rand() < 0.5) cmds.push({ id, kind: 'cast', spell: 'fireball', at: aim });
  return cmds;
}
