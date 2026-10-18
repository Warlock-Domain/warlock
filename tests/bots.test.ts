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
    const c = casts(botCmds(w, 'bot', () => 0.1));
    expect(c).toEqual([{ id: 'bot', kind: 'cast', spell: 'shield', at: w.wizards[0].pos }]);
  });

  it('ignores an ally projectile and never aims at an ally', () => {
    const w = newWorld(['bot', 'ally', 'enemy'], { bot: { ...noSpells(), shield: 1, lightning: 1 }, ally: noSpells(), enemy: noSpells() }, {}, 0, Math.random, false, { bot: 0, ally: 0, enemy: 1 });
    w.wizards[0].pos = v(0, 0);
    w.wizards[1].pos = v(2, 0);
    w.wizards[2].pos = v(-4, 0);
    w.projectiles.push({ id: 1, kind: 'fireball', owner: 'ally', caster: 'ally', pos: v(1, 0), vel: v(-6.47, 0), level: 1, until: 9, target: null, dmgMult: 1 });
    for (const r of [0.1, 0.3, 0.6]) {
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

  it('uses Alteration or Warp zone against a projectile about to hit', () => {
    const incoming = (own: Partial<Record<SpellId, number>>, x: number) => {
      const w = duel(own);
      w.projectiles.push({ id: 1, kind: 'fireball', owner: 'x', caster: 'x', pos: v(x, 0), vel: v(-6.47, 0), level: 1, until: 9, target: null, dmgMult: 1 });
      return casts(botCmds(w, 'bot', () => 0.3))[0];
    };
    expect(incoming({ alteration: 1 }, 1.5)).toMatchObject({ kind: 'cast', spell: 'alteration' });
    const z = incoming({ warpzone: 1 }, 3.5);
    expect(z?.kind === 'cast' && z.spell === 'warpzone' && z.at.x > 0.5 && z.at.x < 3.5).toBe(true);
  });

  it('magnetizes the enemy when its own projectile is on the way', () => {
    const w = duel({ magnetize: 1 });
    w.projectiles.push({ id: 1, kind: 'fireball', owner: 'bot', caster: 'bot', pos: v(1, 0.5), vel: v(6.47, 0), level: 1, until: 9, target: null, dmgMult: 1 });
    expect(casts(botCmds(w, 'bot', () => 0.3))[0]).toMatchObject({ kind: 'cast', spell: 'magnetize' });
  });

  it('wind walk: casts it and runs into the enemy, then only chases', () => {
    const w = duel({ windwalk: 1 });
    const cmds = botCmds(w, 'bot', () => 0.3);
    expect(casts(cmds)[0]).toMatchObject({ kind: 'cast', spell: 'windwalk' });
    expect(cmds.some((c) => c.kind === 'move' && c.to.x === 4)).toBe(true);
    w.wizards[0].windUntil = 2;
    expect(botCmds(w, 'bot', () => 0.3)).toEqual([{ id: 'bot', kind: 'move', to: w.wizards[1].pos }]);
  });

  it('at the edge, links to an obstacle further inside', () => {
    const w = duel({ link: 1 });
    w.wizards[0].pos = v(w.arenaR - 0.5, 0);
    w.pillars.push({ pos: v(w.arenaR - 3, 0), hp: 400, alive: true, kind: 'pillar' });
    expect(casts(botCmds(w, 'bot', () => 0.3))[0]).toMatchObject({ kind: 'cast', spell: 'link', at: { x: w.arenaR - 3, y: 0 } });
  });

  it('reacts to a homing missile by distance, even off a straight course', () => {
    const missile = (own: Partial<Record<SpellId, number>>, r: number) => {
      const w = duel(own);
      // curvando: a reta passa a 2 m do bot, mas ele está a 2,5 m e chegando
      w.projectiles.push({ id: 1, kind: 'homing', owner: 'x', caster: 'x', pos: v(2.5, 0), vel: v(-3, 5.7), level: 1, until: 9, target: 'bot', dmgMult: 1 });
      return casts(botCmds(w, 'bot', () => r))[0];
    };
    expect(missile({ shield: 1 }, 0.1)).toMatchObject({ kind: 'cast', spell: 'shield' });
    const z = missile({ lightning: 1 }, 0.3);
    expect(z?.kind === 'cast' && z.spell === 'lightning' && Math.abs(z.at.x - 2.2) < 0.1).toBe(true);
  });

  it('shoots a far homing missile down with the Fireball', () => {
    const w = duel({});
    w.wizards[0].cd.fireball = 0;
    w.projectiles.push({ id: 1, kind: 'homing', owner: 'x', caster: 'x', pos: v(0, 5), vel: v(0, -6.47), level: 1, until: 9, target: 'bot', dmgMult: 1 });
    const c = casts(botCmds(w, 'bot', () => 0.1))[0];
    expect(c?.kind === 'cast' && c.spell === 'fireball' && c.at.y > 2 && Math.abs(c.at.x) < 0.1).toBe(true);
  });

  it('grips only with damage ready to follow, and drops the Meteor on the gripped enemy', () => {
    const w = duel({ grip: 1 });
    expect(casts(botCmds(w, 'bot', () => 0.3))).toHaveLength(0); // nada para emendar: não prende
    // a Bola de fogo saiu da recarga em 0,5 s; com o atraso do Normal (1 + 0,3 s no sorteio de 0,3) vale em 1,8 s, menos de 1 s depois
    w.wizards[0].cd.fireball = 0.5;
    w.t = 1;
    expect(casts(botCmds(w, 'bot', () => 0.3))[0]).toMatchObject({ kind: 'cast', spell: 'grip' });
    const g = duel({ meteor: 1, lightning: 1 });
    g.wizards[1].gripUntil = 2;
    botCmds(g, 'bot', () => 0.99); // vê o alvo preso; emenda depois do tempo de reação
    g.t += 0.4;
    expect(casts(botCmds(g, 'bot', () => 0.1))[0]).toMatchObject({ kind: 'cast', spell: 'meteor' });
  });

  it('does not link through an obstacle (it would pull the bot itself)', () => {
    const w = duel({ link: 1 });
    const R = w.arenaR;
    w.wizards[0].pos = v(R - 2, 0);
    w.wizards[1].pos = v(R - 6, 0);
    w.pillars.push({ pos: v(R - 4, 0), hp: 400, alive: true, kind: 'pillar' });
    expect(casts(botCmds(w, 'bot', () => 0.9))).toHaveLength(0);
  });

  it('under fire, magnetizes a nearby obstacle so the bounce repels enemy shots', () => {
    const w = duel({ magnetize: 1 });
    w.pillars.push({ pos: v(0, 2), hp: 400, alive: true, kind: 'pillar' });
    w.projectiles.push({ id: 1, kind: 'fireball', owner: 'x', caster: 'x', pos: v(3, 0), vel: v(-6.47, 0), level: 1, until: 9, target: null, dmgMult: 1 });
    expect(casts(botCmds(w, 'bot', () => 0.3))[0]).toMatchObject({ kind: 'cast', spell: 'magnetize', at: { x: 0, y: 2 } });
  });

  it('links with the lava behind it and steps aside; never pulls an enemy back from the edge', () => {
    const w = duel({ link: 1 });
    const R = w.arenaR;
    w.wizards[0].pos = v(R - 2, 0);
    w.wizards[1].pos = v(R - 6, 0);
    const cmds = botCmds(w, 'bot', () => 0.9);
    expect(casts(cmds)[0]).toMatchObject({ kind: 'cast', spell: 'link' });
    expect(cmds.some((c) => c.kind === 'move' && Math.abs(c.to.y) > 2)).toBe(true);
    // preso: só sai de lado
    w.projectiles.push({ id: 1, kind: 'link', owner: 'bot', caster: 'bot', pos: w.wizards[1].pos, vel: v(0, 0), level: 1, until: 9, target: 'x', dmgMult: 1 });
    const held = botCmds(w, 'bot', () => 0.3);
    expect(held).toHaveLength(1);
    expect(held[0].kind === 'move' && Math.abs(held[0].to.y) > 2 && held[0].to.x < R - 2).toBe(true);
    // inimigo mais perto da lava: nada de Elo
    const w2 = duel({ link: 1 });
    w2.wizards[0].pos = v(R - 6, 0);
    w2.wizards[1].pos = v(R - 2, 0);
    expect(casts(botCmds(w2, 'bot', () => 0.1))).toHaveLength(0);
  });

  it('grips an enemy in the lava, and drags with Snowball or Gravity toward the lava, without the random skip', () => {
    const R = duel({}).arenaR;
    const edge = (own: Partial<Record<SpellId, number>>, enemyAt: number, d: number) => {
      const w = duel(own);
      w.wizards[0].pos = v(enemyAt - d, 0);
      w.wizards[1].pos = v(enemyAt, 0);
      return casts(botCmds(w, 'bot', () => 0.9))[0];
    };
    expect(edge({ grip: 1 }, R + 0.3, 4)).toMatchObject({ kind: 'cast', spell: 'grip' });
    expect(edge({ snowball: 1 }, R - 1.5, 3)).toMatchObject({ kind: 'cast', spell: 'snowball' });
    expect(edge({ gravity: 1 }, R - 1, 2.2)).toMatchObject({ kind: 'cast', spell: 'gravity' });
    // longe da lava, o sorteio de 0,9 deixa passar
    expect(edge({ snowball: 1 }, 0, 3)).toBeUndefined();
  });

  it('sliding toward the lava, drops a Rock pillar right in front of itself', () => {
    const w = duel({ rockpillar: 1 });
    w.wizards[0].pos = v(w.arenaR - 2, 0);
    w.wizards[0].vel = v(6, 0);
    const c = casts(botCmds(w, 'bot', () => 0.9))[0];
    expect(c?.kind === 'cast' && c.spell === 'rockpillar' && Math.abs(c.at.x - (w.arenaR - 0.85)) < 0.01).toBe(true);
  });

  it('drains when hurt even with other spells ready', () => {
    const w = duel({ drain: 1, lightning: 1 });
    w.wizards[0].hp = 400;
    expect(casts(botCmds(w, 'bot', () => 0.9))[0]).toMatchObject({ kind: 'cast', spell: 'drain' });
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
    botConfig.planner = null;
    expect(m.phase).toBe('end');
    expect(used.size).toBeGreaterThanOrEqual(6);
  }, 30_000); // partida inteira com bots que planejam caminho: passa de 5 s com o processador ocupado
});
