// Bots simples: fogem da borda, desviam às vezes e atiram no mais próximo.
import { WIZ_R, WIZ_SPEED } from './constants.ts';
import type { Cmd, World } from './sim.ts';
import { SPELL_IDS, priceOf, spellLevel, type SpellId } from './spells.ts';
import { add, dist, dot, len, norm, scale, sub, v, type Vec } from './vec.ts';

type Buyer = { gold: number; spells: Record<SpellId, number> };

export function botBuy(p: Buyer): SpellId | null {
  const missing = SPELL_IDS.filter((s) => p.spells[s] === 0 && (priceOf(s, 0) ?? Infinity) <= p.gold);
  if (missing.length) return missing[0];
  const owned = SPELL_IDS.filter((s) => p.spells[s] > 0 && (priceOf(s, p.spells[s]) ?? Infinity) <= p.gold);
  owned.sort((a, b) => p.spells[a] - p.spells[b]);
  return owned[0] ?? null;
}

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
  for (const z of w.wizards) if (z.alive && z.id !== id && (!enemy || dist(z.pos, me.pos) < dist(enemy.pos, me.pos))) enemy = z;
  if (!enemy) return cmds;
  const d = dist(enemy.pos, me.pos);
  // mira onde o alvo vai estar quando a bola de fogo chegar
  const fire = spellLevel('fireball', me.spells.fireball);
  const travel = d / fire.speed;
  const lead = enemy.target ? scale(norm(sub(enemy.target, enemy.pos)), Math.min(dist(enemy.target, enemy.pos), WIZ_SPEED * travel)) : v(0, 0);
  const aim = add(add(add(enemy.pos, lead), scale(enemy.vel, travel * 0.5)), jitter(0.8));
  if (ready('lightning') && d < spellLevel('lightning', me.spells.lightning).range && rand() < 0.5) cmds.push({ id, kind: 'cast', spell: 'lightning', at: aim });
  else if (ready('homing') && rand() < 0.3) cmds.push({ id, kind: 'cast', spell: 'homing', at: enemy.pos });
  else if (ready('fireball') && d < fire.range + 1 && d > WIZ_R * 3 && rand() < 0.5) cmds.push({ id, kind: 'cast', spell: 'fireball', at: aim });
  return cmds;
}
