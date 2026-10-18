import { describe, expect, it } from 'vitest';
import { botCmds, botConfig, randomPlan } from '../src/shared/bots.ts';
import { DT } from '../src/shared/constants.ts';
import { ITEM_IDS, noItems } from '../src/shared/items.ts';
import { newMatch, startMatch, tickMatch } from '../src/shared/match.ts';
import { newWorld, type Cmd } from '../src/shared/sim.ts';
import { SPELL_IDS, noSpells, type SpellId } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

const casts = (cmds: Cmd[]) => cmds.filter((c) => c.kind === 'cast' || c.kind === 'item');
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// bot em (0,0) com as magias dadas e a Bola de fogo em recarga; inimigo em (4,0)
function duel(own: Partial<Record<SpellId, number>>, items: Partial<Record<string, number>> = {}) {
  const w = newWorld(['bot', 'x'], { bot: { ...noSpells(), ...own }, x: noSpells() }, { bot: { ...noItems(), ...items } });
  w.wizards[0].pos = v(0, 0);
  w.wizards[1].pos = v(4, 0);
  w.wizards[0].cd.fireball = 99;
  return w;
}

describe('bots usam tudo', () => {
  it('casts lightning when it is the only spell ready and the target is in range', () => {
    const c = casts(botCmds(duel({ lightning: 1 }), 'bot', () => 0.3));
    expect(c).toHaveLength(1);
    expect(c[0].kind === 'cast' && c[0].spell === 'lightning' && c[0].at.x > 3).toBe(true);
  });

  it('raises the shield against an incoming enemy projectile', () => {
    const w = duel({ shield: 1 });
    w.wizards[1].cd.fireball = 99;
    w.projectiles.push({ id: 1, kind: 'fireball', owner: 'x', caster: 'x', pos: v(1.5, 0), vel: v(-6.47, 0), level: 1, until: 9, target: null, dmgMult: 1 });
    const c = casts(botCmds(w, 'bot', () => 0.3));
    expect(c).toEqual([{ id: 'bot', kind: 'cast', spell: 'shield', at: w.wizards[0].pos }]);
  });

  it('ignores an ally projectile and never aims at an ally', () => {
    const w = newWorld(['bot', 'ally', 'enemy'], { bot: { ...noSpells(), shield: 1, lightning: 1 }, ally: noSpells(), enemy: noSpells() }, {}, 0, Math.random, false, { bot: 0, ally: 0, enemy: 1 });
    w.wizards[0].pos = v(0, 0);
    w.wizards[1].pos = v(2, 0);
    w.wizards[2].pos = v(-4, 0);
    w.projectiles.push({ id: 1, kind: 'fireball', owner: 'ally', caster: 'ally', pos: v(1, 0), vel: v(-6.47, 0), level: 1, until: 9, target: null, dmgMult: 1 });
    for (const r of [0.05, 0.3, 0.6]) {
      const c = casts(botCmds(w, 'bot', () => r));
      for (const x of c) expect(x.kind === 'cast' && x.spell !== 'shield' && x.at.x < -2).toBe(true);
    }
  });

  it('arms the Pact before a damage spell, then casts the spell', () => {
    const w = duel({ lightning: 1 }, { pact: 1 });
    expect(casts(botCmds(w, 'bot', () => 0.3))).toEqual([{ id: 'bot', kind: 'item', item: 'pact', at: w.wizards[0].pos }]);
    w.wizards[0].itemCd.pact = 99;
    w.wizards[0].pactUntil = 5;
    const c = casts(botCmds(w, 'bot', () => 0.3));
    expect(c[0]?.kind === 'cast' && c[0].spell === 'lightning').toBe(true);
  });

  it('random plans are valid and cover every spell and item', () => {
    const rand = seeded(7);
    const spells = new Set<string>();
    const items = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = randomPlan(rand);
      const s = p.buys.filter((b) => b.kind === 'spell');
      expect(p.buys[0].kind).toBe('spell');
      expect(s.length).toBeGreaterThanOrEqual(2);
      expect(s.length).toBeLessThanOrEqual(5);
      for (const b of p.buys) (b.kind === 'spell' ? spells : items).add(b.id);
    }
    expect([...spells].sort()).toEqual(SPELL_IDS.filter((s) => s !== 'fireball').sort());
    expect([...items].sort()).toEqual(ITEM_IDS.filter((i) => i !== 'scourge').sort());
  });

  it('a bots-only match ends and uses several different spells', () => {
    const rand = seeded(3);
    // planos de compra com a semente (a quantidade de pilares ainda usa Math.random dentro da partida)
    botConfig.planner = () => randomPlan(rand);
    const m = newMatch();
    startMatch(m, 0, 6, 'rounds', true, rand);
    const used = new Set<string>();
    let now = 0;
    for (let i = 0; i < 400_000 && m.phase !== 'end'; i++) {
      now = m.phase === 'playing' || m.phase === 'shop' ? now + DT * 1000 : Math.max(now, m.phaseEnds);
      for (const e of tickMatch(m, now, [], rand)) if (e.k === 'fire') used.add(e.src);
    }
    botConfig.planner = randomPlan;
    expect(m.phase).toBe('end');
    expect(used.size).toBeGreaterThanOrEqual(6);
  });
});
