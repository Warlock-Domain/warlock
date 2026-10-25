import { describe, expect, it } from 'vitest';
import { edge } from '../src/shared/arena.ts';
import { BOT_SKILL, botBuy, botCmds, botConfig, botThinks, botWatch, skillAt, smartPlan, type BotPlan, type BotSkill } from '../src/shared/bots.ts';
import { DT } from '../src/shared/constants.ts';
import { noItems } from '../src/shared/items.ts';
import { addPlayer, botSkill, newMatch, parseOpt, startMatch } from '../src/shared/match.ts';
import { newWorld, stepWorld, type Cmd, type World } from '../src/shared/sim.ts';
import { FREE_SPELLS, SPELL_IDS, noSpells, type SpellId } from '../src/shared/spells.ts';
import { dist, v, type Vec } from '../src/shared/vec.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// the first draw (the human-error one) never slips; every other draw returns `r`
const noSlip = (r: number) => {
  let n = 0;
  return () => (n++ ? r : 0.99);
};
const KINDS = ['easy', 'normal', 'hard'] as const;
type Kind = (typeof KINDS)[number];
// no human error and always casting when there is a play: to measure one thing at a time
const exact = (k: Kind): BotSkill => ({ ...BOT_SKILL[k], slip: 0, cast: 1 });

// bot at (0,0), enemy at (4,0), the bot's Fireball on cooldown
function duel(own: Partial<Record<SpellId, number>>, enemyAt = v(4, 0)): World {
  const w = newWorld(['bot', 'x'], { bot: { ...noSpells(), ...own }, x: noSpells() });
  w.wizards[0].pos = v(0, 0);
  w.wizards[1].pos = enemyAt;
  w.wizards[0].cd.fireball = 99;
  return w;
}
// enemy Fireball arriving in ~0.23 s
const threatened = (own: Partial<Record<SpellId, number>>) => {
  const w = duel(own);
  w.projectiles.push({ id: 1, kind: 'fireball', owner: 'x', caster: 'x', pos: v(1.5, 0), vel: v(-6.47, 0), level: 1, until: 9, target: null, dmgMult: 1 });
  return w;
};
// how many times, in 400 thinks with different draws, the bot did something
function count(make: () => World, skill: BotSkill, did: (c: Cmd[]) => boolean) {
  let n = 0;
  for (let i = 0; i < 400; i++) if (did(botCmds(make(), 'bot', seeded(i), skill))) n++;
  return n;
}
// where the cast went (or the destination of the first step)
const castAt = (c: Cmd[]): Vec | undefined => c.flatMap((x) => (x.kind === 'cast' ? [x.at] : []))[0];
const moveTo = (c: Cmd[]): Vec | undefined => c.flatMap((x) => (x.kind === 'move' ? [x.to] : []))[0];

describe('bot difficulty', () => {
  it('each level uses the decided numbers (18/10)', () => {
    const pick = (k: keyof BotSkill) => KINDS.map((d) => BOT_SKILL[d][k]);
    expect(pick('aim')).toEqual([1.5, 1, 0.6]);
    expect(pick('delay')).toEqual([0.6, 0.4, 0.25]);
    expect([pick('waitMin'), pick('waitMax')]).toEqual([[2, 1, 0.5], [4, 2, 1]]);
    expect(pick('rate')).toEqual([1.5, 2.5, 4]);
    expect(pick('dodge')).toEqual([0.3, 0.55, 0.8]);
    expect(pick('shield')).toEqual([0.12, 0.35, 0.52]);
    expect(pick('combo')).toEqual([0.3, 0.6, 0.9]);
    expect(pick('range')).toEqual([6, 4.5, 3]);
    expect(pick('edge')).toEqual([1, 1.5, 2]);
    expect(pick('slip')).toEqual([0.2, 0.08, 0.02]);
    expect(pick('vision')).toEqual([10, 12, 15]);
  });

  it('Easy reacts less than Normal, and Normal less than Hard, to the same incoming projectile', () => {
    const shield = (c: Cmd[]) => c.some((x) => x.kind === 'cast' && x.spell === 'shield');
    const dodge = (c: Cmd[]) => c.some((x) => x.kind === 'move' || (x.kind === 'cast' && x.spell === 'teleport'));
    const make = () => threatened({ shield: 1, teleport: 1 });
    const [e, n, h] = KINDS.map((k) => count(make, BOT_SKILL[k], (c) => shield(c) || dodge(c)));
    expect(e).toBeLessThan(n);
    expect(n).toBeLessThan(h);
    expect(count(make, BOT_SKILL.easy, shield)).toBeLessThan(count(make, BOT_SKILL.hard, shield));
  });

  it('dodges on foot and raises Shield at the chances of each level', () => {
    const moves = (c: Cmd[]) => c.some((x) => x.kind === 'move');
    const shield = (c: Cmd[]) => c.some((x) => x.kind === 'cast' && x.spell === 'shield');
    for (const k of KINDS) {
      const D = exact(k);
      expect(Math.abs(count(() => threatened({}), D, moves) / 400 - D.dodge)).toBeLessThan(0.07);
      expect(Math.abs(count(() => threatened({ shield: 1 }), D, shield) / 400 - D.shield)).toBeLessThan(0.07);
    }
  });

  it('reaction time: a projectile that just appeared is not seen; after the delay of each level, it is', () => {
    const shield = (c: Cmd[]) => c.some((x) => x.kind === 'cast' && x.spell === 'shield');
    for (const k of KINDS) {
      const w = threatened({ shield: 1 });
      w.projectiles[0].born = w.t - BOT_SKILL[k].delay + 0.05; // appeared just now
      expect(shield(botCmds(w, 'bot', noSlip(0.01), BOT_SKILL[k]))).toBe(false);
      w.projectiles[0].born = w.t - BOT_SKILL[k].delay; // now there was time
      expect(shield(botCmds(w, 'bot', noSlip(0.01), BOT_SKILL[k]))).toBe(true);
    }
  });

  it('aim ignores the click destination of the target: only what it saw (position and velocity 0.3 s ago)', () => {
    for (let i = 0; i < 100; i++) {
      const at = castAt(botCmds(duel({ lightning: 1 }), 'bot', seeded(i), exact('normal')));
      expect(at && Math.abs(at.x - 4) < 1e-9 && Math.abs(at.y) <= BOT_SKILL.normal.aim + 1e-9).toBe(true);
    }
    // standing still, just clicked to walk up: the bot does not know yet
    const w = duel({ lightning: 1 });
    w.wizards[1].target = v(4, 10);
    expect(Math.abs(castAt(botCmds(w, 'bot', noSlip(0.5), exact('normal')))!.y)).toBeLessThan(1e-9);
    // walking up at 1.4 m/s: the bot saw it (0.3 s ago) and leads ahead, even with the click now pointing down
    const m = duel({ lightning: 1 });
    for (let i = 0; i < 40; i++) {
      m.wizards[1].pos = v(4, i * DT * 1.4);
      botWatch(m);
      m.t += DT;
    }
    m.wizards[1].target = v(4, -10);
    expect(castAt(botCmds(m, 'bot', noSlip(0.5), exact('normal')))!.y).toBeGreaterThan(m.wizards[1].pos.y);
  });

  it('aim error: sideways, up to ±1.5 / ±1 / ±0.6 m', () => {
    for (const k of KINDS) {
      let max = 0;
      for (let i = 0; i < 400; i++) {
        const at = castAt(botCmds(duel({ lightning: 1 }), 'bot', seeded(i), exact(k)))!;
        expect(Math.abs(at.x - 4)).toBeLessThan(1e-9); // sideways only
        max = Math.max(max, Math.abs(at.y));
      }
      expect(max).toBeLessThanOrEqual(BOT_SKILL[k].aim);
      expect(max).toBeGreaterThan(BOT_SKILL[k].aim * 0.95);
    }
  });

  it('a spell only comes back into play some time after its cooldown: 2–4 / 1–2 / 0.5–1 s', () => {
    for (const k of KINDS) {
      const D = exact(k);
      const at = (t: number) => count(() => {
        const w = duel({ lightning: 1 });
        w.wizards[0].cd.lightning = 1; // the cooldown ends in 1 s
        w.t = t;
        return w;
      }, D, (c) => !!castAt(c));
      expect(at(1 + D.waitMin - 0.01)).toBe(0);
      const mid = at(1 + (D.waitMin + D.waitMax) / 2);
      expect(mid).toBeGreaterThan(120);
      expect(mid).toBeLessThan(280);
      expect(at(1 + D.waitMax + 0.01)).toBe(400);
    }
    // one not yet cast this round is usable at once
    expect(count(() => duel({ lightning: 1 }), exact('easy'), (c) => !!castAt(c))).toBe(400);
  });

  it('thinks 1.5 / 2.5 / 4 times per second, each bot on a different step', () => {
    for (const k of KINDS) {
      let n = 0;
      for (let s = 1; s <= 600; s++) if (botThinks(s, 0, BOT_SKILL[k])) n++;
      expect(n).toBe(BOT_SKILL[k].rate * 10);
      const first = Array.from({ length: 8 }, (_, i) => Array.from({ length: 60 }, (_, s) => s).find((s) => botThinks(s, i, BOT_SKILL[k])));
      expect(new Set(first).size).toBe(8);
    }
  });

  it('sight: only sees enemies up to 10 / 12 / 15 m', () => {
    const homing = (k: Kind) => {
      const w = duel({ homing: 1 }, v(5.5, 0));
      w.wizards[0].pos = v(-5.5, 0); // 11 m
      return castAt(botCmds(w, 'bot', noSlip(0.5), exact(k)));
    };
    expect(homing('easy')).toBeUndefined();
    expect(homing('normal')).toBeDefined();
    expect(homing('hard')).toBeDefined();
  });

  it('edge fear: walks back to the middle at 1 / 1.5 / 2 m from the lava', () => {
    const back = (k: Kind, e: number) => {
      const w = newWorld(['bot'], { bot: noSpells() });
      w.wizards[0].pos = v(w.arenaR - e, 0);
      return !!moveTo(botCmds(w, 'bot', () => 0.9, BOT_SKILL[k]));
    };
    for (const k of KINDS) {
      expect(back(k, BOT_SKILL[k].edge - 0.1)).toBe(true);
      expect(back(k, BOT_SKILL[k].edge + 0.1)).toBe(false);
    }
    // arena almost gone (no margin anywhere): in the lava, it still walks back
    for (const arena of ['circle', 'islands'] as const) {
      const w = newWorld(['bot'], { bot: noSpells() }, {}, 0, Math.random, false, {}, undefined, arena);
      w.arenaR = 1;
      w.wizards[0].pos = v(arena === 'circle' ? 1.1 : 1.7, 0);
      const to = moveTo(botCmds(w, 'bot', () => 0.9, BOT_SKILL.normal));
      expect(to && edge(w, to) > edge(w, w.wizards[0].pos)).toBe(true);
    }
  });

  it('target: Easy and Normal pick the nearest; Hard picks whoever is weak, near the lava or leading the scoreboard', () => {
    const scene = (hp = 1) => {
      const w = newWorld(['bot', 'near', 'weak'], { bot: noSpells(), near: noSpells(), weak: noSpells() });
      w.wizards[0].pos = v(0, 0);
      w.wizards[1].pos = v(3, 0);
      w.wizards[2].pos = v(-4.5, 0);
      w.wizards[2].hp = w.wizards[2].hpMax * hp;
      return w;
    };
    const aim = (k: Kind, w: World, scores = {}) => castAt(botCmds(w, 'bot', noSlip(0.5), exact(k), scores))!.x;
    expect(aim('easy', scene(0.3))).toBeGreaterThan(0);
    expect(aim('normal', scene(0.3))).toBeGreaterThan(0);
    expect(aim('hard', scene(0.3))).toBeLessThan(0); // 30% health
    expect(aim('hard', scene())).toBeGreaterThan(0); // nobody weak: the nearest
    expect(aim('hard', scene(), { bot: 1, near: 1, weak: 3 })).toBeLessThan(0); // the scoreboard leader, 4.5 m away
  });

  it('preferred distance: Easy flees from whoever just hit it; Normal closes to ~4.5 m', () => {
    const w = duel({}, v(6, 0));
    w.wizards[0].lastHitBy = 'x';
    w.wizards[0].lastHitAt = w.t;
    expect(moveTo(botCmds(w, 'bot', noSlip(0.9), BOT_SKILL.easy))).toEqual(v(-3, 0));
    expect(moveTo(botCmds(w, 'bot', noSlip(0.9), BOT_SKILL.normal))).toEqual(v(1.5, 0));
  });

  it('gold: Easy ignores it; Normal goes with no enemy within 4 m; Hard goes even with an enemy near; in the final duel, nobody', () => {
    const goes = (k: Kind, enemyAt: number, last = false) => {
      const w = duel({}, v(enemyAt, 0));
      // a third living wizard, far away: not the final duel yet
      if (!last) w.wizards.push({ ...w.wizards[1], id: 'y', pos: v(-30, -30) });
      w.loots.push({ pos: v(0, 3), left: 10, until: 99 });
      return botCmds(w, 'bot', noSlip(0.9), BOT_SKILL[k]).some((c) => c.kind === 'move' && c.to.x === 0 && c.to.y === 3);
    };
    expect(goes('easy', 9)).toBe(false);
    expect(goes('normal', 9)).toBe(true);
    expect(goes('normal', 3)).toBe(false);
    expect(goes('hard', 3)).toBe(true);
    expect(goes('normal', 9, true)).toBe(false);
    expect(goes('hard', 3, true)).toBe(false);
  });

  it('gold right at the edge is left there (otherwise the bot went back and forth forever)', () => {
    const goes = (gx: number) => {
      const w = duel({}, v(-9, 0));
      w.wizards.push({ ...w.wizards[1], id: 'y', pos: v(-30, -30) });
      w.wizards[0].pos = v(w.arenaR - 4.5, 0);
      w.loots.push({ pos: v(w.arenaR - gx, 0), left: 10, until: 99 });
      return botCmds(w, 'bot', noSlip(0.9), BOT_SKILL.normal).some((c) => c.kind === 'move' && c.to.x === w.arenaR - gx);
    };
    expect(goes(2.5)).toBe(true);
    expect(goes(0.3)).toBe(false);
  });

  it('human error: Easy freezes far more often than Hard, and a frozen bot decides nothing for 0.5 s', () => {
    const stops = (k: Kind) => count(() => duel({}), BOT_SKILL[k], (c) => c.some((x) => x.kind === 'stop'));
    expect(stops('easy')).toBeGreaterThan(20); // ~10% (half of the 20% errors)
    expect(stops('hard')).toBeLessThan(15); // ~1%
    const w = duel({ lightning: 1 });
    expect(botCmds(w, 'bot', () => 0.01, BOT_SKILL.easy)).toEqual([{ id: 'bot', kind: 'stop' }]);
    w.t += 0.4;
    expect(botCmds(w, 'bot', noSlip(0.5), BOT_SKILL.easy)).toEqual([]);
    w.t += 0.2;
    expect(castAt(botCmds(w, 'bot', noSlip(0.5), exact('easy')))).toBeDefined();
    // the other error: a cast bent up to 45°
    let bent = 0;
    for (let i = 0; i < 400; i++) {
      const at = castAt(botCmds(duel({ lightning: 1 }), 'bot', seeded(i), { ...BOT_SKILL.easy, cast: 1, aim: 0 }));
      if (at) {
        expect(Math.abs(Math.atan2(at.y, at.x))).toBeLessThanOrEqual(Math.PI / 4 + 1e-9);
        if (Math.abs(at.y) > 1e-6) bent++;
      }
    }
    expect(bent).toBeGreaterThan(20);
  });

  it('purchases: Normal and Hard build a combination with damage and escape; the simulator can fix the plan', () => {
    const escape: string[] = ['shield', 'teleport', 'rush', 'windwalk', 'alteration', 'warpzone', 'rockpillar', 'illusion'];
    const rand = seeded(5);
    const plans = Array.from({ length: 50 }, () => smartPlan(rand));
    for (const p of plans) {
      const s = p.buys.flatMap((b) => (b.kind === 'spell' ? [b.id] : []));
      expect(s.filter((id) => escape.includes(id))).toHaveLength(1);
      expect(s.length).toBeGreaterThanOrEqual(2);
      expect(p.buys.some((b) => b.kind === 'item')).toBe(true);
    }
    expect(new Set(plans.map((p) => JSON.stringify(p.buys))).size).toBeGreaterThan(40); // they vary between bots
    const first = (D: BotSkill): BotPlan => {
      const p: { gold: number; spells: Record<SpellId, number>; items: ReturnType<typeof noItems>; plan?: BotPlan } = { gold: 99, spells: noSpells(), items: noItems() };
      botBuy(p, seeded(1), D);
      return p.plan!;
    };
    expect(escape).toContain(first(BOT_SKILL.hard).buys[1].id);
    botConfig.planner = () => ({ buys: [], upgrade: 'lowest' });
    expect(first(BOT_SKILL.hard).buys).toEqual([]);
    botConfig.planner = null;
  });

  it('purchases: the Normal and Hard plan reaches every buyable spell (issue #373)', () => {
    const rand = seeded(9);
    const planned = new Set(Array.from({ length: 400 }, () => smartPlan(rand).buys.flatMap((b) => (b.kind === 'spell' ? [b.id] : []))).flat());
    for (const id of SPELL_IDS.filter((s) => !FREE_SPELLS.includes(s))) expect(planned.has(id), id).toBe(true);
  });

  it('search: on opposite islands, the two meet within 25 s, over the bridge and around obstacles, never stepping in the lava or standing still > 2 s', () => {
    for (const k of KINDS) {
      const D = BOT_SKILL[k];
      const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() }, {}, 0, seeded(1), false, {}, { runes: false, sudden: false, chests: false }, 'islands');
      for (const z of w.wizards) z.cd.fireball = 1e9; // nobody shoots: they only walk
      // a rock in the middle of each island, right on the straight path to the bridge
      for (const x of [1, -1]) w.pillars.push({ pos: v(x * 0.95 * w.arenaR, 0), hp: Infinity, alive: true, kind: 'rock' });
      expect(dist(w.wizards[0].pos, w.wizards[1].pos)).toBeGreaterThan(24);
      const rand = seeded(2);
      const still = [0, 0];
      let s = 0;
      for (; s < 25 / DT && dist(w.wizards[0].pos, w.wizards[1].pos) > D.range + 1.5; s++) {
        botWatch(w);
        const cmds = w.wizards.flatMap((z, i) => (botThinks(s, i, D) ? botCmds(w, z.id, rand, D) : []));
        stepWorld(w, cmds, rand);
        w.wizards.forEach((z, i) => {
          expect(edge(w, z.pos)).toBeGreaterThan(0);
          still[i] = z.target ? 0 : still[i] + DT;
          expect(still[i]).toBeLessThan(2);
        });
      }
      expect([k, s * DT < 25]).toEqual([k, true]);
    }
  });

  it('Automatic: a losing human makes bots weaker, a winning one stronger, without jumps', () => {
    const m = newMatch();
    addPlayer(m, 'h1', 'Ana');
    startMatch(m, 0, 2, 'rounds', true, Math.random, { difficulty: 'auto' });
    const [h, b1, b2] = m.players;
    expect(botSkill(m, b1)).toEqual(BOT_SKILL.normal); // 0 to 0
    b1.score = 4; // human losing badly to bot 1
    expect(botSkill(m, b1).dodge).toBeLessThan(BOT_SKILL.normal.dodge);
    expect(botSkill(m, b1).aim).toBeGreaterThan(BOT_SKILL.normal.aim);
    h.score = 3; // human ahead of bot 2
    expect(botSkill(m, b2).dodge).toBeGreaterThan(BOT_SKILL.normal.dodge);
    expect(botSkill(m, b2).aim).toBeLessThan(BOT_SKILL.normal.aim);
    // smooth: a 1-point gap lands halfway
    h.score = 1;
    b2.score = 0;
    const s = botSkill(m, b2);
    expect(s.rate).toBeGreaterThan(BOT_SKILL.normal.rate);
    expect(s.rate).toBeLessThan(BOT_SKILL.hard.rate);
    expect(skillAt(-1)).toEqual(BOT_SKILL.easy);
    expect(skillAt(1)).toEqual(BOT_SKILL.hard);
  });

  it('difficulty is a votable match option', () => {
    expect(parseOpt('difficulty:hard')).toEqual(['difficulty', 'hard']);
    expect(parseOpt('difficulty:insane')).toBeNull();
  });
});

describe('intermediate difficulties', () => {
  it('Casual sits between Easy and Normal and Veteran between Normal and Hard, in every number', () => {
    const between = (x: number, a: number, b: number) => x >= Math.min(a, b) && x <= Math.max(a, b);
    for (const k of Object.keys(BOT_SKILL.normal) as (keyof BotSkill)[]) {
      expect(between(BOT_SKILL.casual[k], BOT_SKILL.easy[k], BOT_SKILL.normal[k])).toBe(true);
      expect(between(BOT_SKILL.veteran[k], BOT_SKILL.normal[k], BOT_SKILL.hard[k])).toBe(true);
    }
    expect(BOT_SKILL.casual.delay).toBeCloseTo((BOT_SKILL.easy.delay + BOT_SKILL.normal.delay) / 2);
    expect(parseOpt('difficulty:veteran')).toEqual(['difficulty', 'veteran']);
  });
});
