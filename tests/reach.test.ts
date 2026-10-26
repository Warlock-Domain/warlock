import { describe, expect, it } from 'vitest';
import { aimOf, blastOf, hitR, reachOf } from '../src/client/reach.ts';
import { OBSTACLES, PROJ_R, PROJ_SPAWN, WALL_GAP, WIZ_R } from '../src/shared/constants.ts';
import { noItems } from '../src/shared/items.ts';
import { snowR } from '../src/shared/sim.ts';
import { CLUSTER_FAN, LIGHTNING, RUSH, SPELL_IDS, SPLITTER, THRUST, noSpells, spellLevel } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

describe('range circle', () => {
  it('Grip shows the mark range and its radius, without a projectile advance', () => {
    const spells = { ...noSpells(), grip: 1 };
    expect(reachOf('grip', spells, noItems())).toBeCloseTo(spellLevel('grip', 1).range);
    expect(reachOf('grip', spells, { ...noItems(), helmet: 1 })).toBeCloseTo(spellLevel('grip', 1).range * .9);
    expect(blastOf('grip', spells)).toBe(1.5);
    expect(blastOf('grip', noSpells())).toBe(0);
  });
  it('area at the aimed point: Warp zone radius at the level and Barricade half width', () => {
    const spells = { ...noSpells(), warpzone: 3, rockpillar: 1 };
    expect(blastOf('warpzone', spells)).toBeCloseTo(spellLevel('warpzone', 3).radius);
    expect(blastOf('rockpillar', spells)).toBeCloseTo(WALL_GAP + OBSTACLES.rockpillar.r);
    expect([blastOf('warpzone', noSpells()), blastOf('rockpillar', noSpells())]).toEqual([0, 0]);
  });
  it('every spell with range and radius that does not fly shows its area at the aimed point (Lula Pix was left out)', () => {
    const all = Object.fromEntries(SPELL_IDS.map((s) => [s, 1])) as ReturnType<typeof noSpells>;
    expect(SPELL_IDS.filter((s) => s !== 'rockpillar' && blastOf(s, all) > 0)).toEqual(['grip', 'meteor', 'warpzone', 'geyser', 'pix']);
    expect(blastOf('pix', all)).toBe(spellLevel('pix', 1).radius);
  });
  it('while aiming, area spells show only the circle at the aimed point', () => {
    const spells = { ...noSpells(), grip: 1, warpzone: 1, rockpillar: 1, pix: 1 };
    for (const s of ['grip', 'warpzone', 'rockpillar', 'pix'] as const) {
      const a = aimOf(s, spells, noItems(), v(0, 0), v(3, 0));
      expect([a.segs.length, a.blastR]).toEqual([0, blastOf(s, spells)]);
      expect(a.blastAt).toEqual(v(3, 0));
    }
  });
  it('shows the current level range; the Helmet shortens it 10%', () => {
    const spells = { ...noSpells(), lightning: 3 };
    expect(reachOf('lightning', spells, noItems())).toBeCloseTo(spellLevel('lightning', 3).range);
    expect(reachOf('lightning', spells, { ...noItems(), helmet: 1 })).toBeCloseTo(spellLevel('lightning', 3).range * 0.9);
    expect(reachOf('lightning', noSpells(), noItems())).toBe(0); // spell not owned
  });

  it('projectile: as far as its tip reaches (spawns ahead of the wizard and has a radius); Meteor: blast at the aimed point (issue #82)', () => {
    const spells = { ...noSpells(), fireball: 1, snowball: 2, meteor: 3 };
    expect(reachOf('fireball', spells, noItems())).toBeCloseTo(spellLevel('fireball', 1).range + PROJ_SPAWN + PROJ_R);
    expect(reachOf('fireball', spells, { ...noItems(), helmet: 1 })).toBeCloseTo(spellLevel('fireball', 1).range * 0.9 + PROJ_SPAWN + PROJ_R);
    expect(reachOf('snowball', spells, noItems())).toBeCloseTo(spellLevel('snowball', 2).range + PROJ_SPAWN + snowR(2));
    expect(reachOf('meteor', spells, noItems())).toBeCloseTo(spellLevel('meteor', 3).range); // where it can be aimed
    expect([blastOf('meteor', spells), blastOf('fireball', spells), blastOf('meteor', noSpells())]).toEqual([spellLevel('meteor', 3).radius, 0, 0]);
  });

  it('no fixed range: Shield bubble radius, Rush advance, Scourge blast; nothing for Homing missile and Pact', () => {
    const all = Object.fromEntries(SPELL_IDS.map((s) => [s, 1])) as ReturnType<typeof noSpells>;
    expect(reachOf('shield', all, noItems())).toBeCloseTo(spellLevel('shield', 1).radius);
    expect(reachOf('rush', all, noItems())).toBe(RUSH.dash);
    expect(reachOf('scourge', all, noItems())).toBe(spellLevel('scourge', 1).radius);
    expect(reachOf('homing', all, noItems())).toBe(0);
    expect(reachOf('pact', all, noItems())).toBe(0);
    // every spell with a range shows something
    for (const s of SPELL_IDS) if (spellLevel(s, 1).range > 0) expect(reachOf(s, all, noItems())).toBeGreaterThan(0);
  });
});

describe('hit width and blast while aiming (Fernando, 21/10)', () => {
  const from = v(0, 0), at = v(2, 0);
  const all = Object.fromEntries(SPELL_IDS.map((s) => [s, 1])) as ReturnType<typeof noSpells>;
  const reach = (s: Parameters<typeof reachOf>[0]) => reachOf(s, all, noItems());

  it('band as wide as the projectile (enemy body touching = hit), up to the range toward the aim', () => {
    const fb = aimOf('fireball', all, noItems(), from, at);
    expect(fb.half).toBeCloseTo(PROJ_R);
    expect(fb.segs).toHaveLength(1);
    expect(fb.segs[0][1].x).toBeCloseTo(reach('fireball'));
    expect(fb.blastR).toBe(0);
    expect(aimOf('lightning', all, noItems(), from, at)).toMatchObject({ half: LIGHTNING.width, segs: [[from, v(reach('lightning'), 0)]] }); // Lightning extra width
    expect(aimOf('snowball', all, noItems(), from, at).half).toBeCloseTo(snowR(1));
    for (const s of ['magnetize', 'bouncer', 'recharge', 'link', 'swap'] as const) expect(aimOf(s, all, noItems(), from, at).half).toBeCloseTo(PROJ_R);
  });

  it('Sand blast: a single 3×2 triangle without projectile bands', () => {
    const c = aimOf('cluster', all, noItems(), from, at);
    expect(c.segs).toHaveLength(0);
    expect(c.cone).toEqual([from,v(3,1),v(3,-1)]);
  });

  it('Snowball blasts at the end of its flight; Gravity burns around the path and at the end; Meteor at the aimed point', () => {
    const sn = aimOf('snowball', all, noItems(), from, at);
    expect(sn.blastR).toBeCloseTo(spellLevel('snowball', 1).radius - WIZ_R); // it hits by the centre: the body touches WIZ_R earlier
    expect(sn.blastAt!.x).toBeCloseTo(reach('snowball') - snowR(1));
    const g = aimOf('gravity', all, noItems(), from, at);
    expect(g.half).toBeCloseTo(spellLevel('gravity', 1).radius - WIZ_R);
    expect(g.blastR).toBeCloseTo(g.half);
    expect(g.blastAt!.x).toBeCloseTo(reach('gravity') - PROJ_R);
    const m = aimOf('meteor', all, noItems(), from, at);
    expect([m.segs, m.half, m.blastR, m.blastAt]).toEqual([[], 0, spellLevel('meteor', 1).radius, at]);
    expect(aimOf('meteor', all, noItems(), from, v(50, 0)).blastAt!.x).toBeCloseTo(reach('meteor')); // never beyond the range
  });

  it('Drain and Thrust stop at the aimed point; Rush advances the fixed dash; Teleport shows the body where it lands; no band for Boomerang, Homing and unaimed spells', () => {
    expect(aimOf('drain', all, noItems(), from, at).segs[0][1].x).toBeCloseTo(2);
    expect(aimOf('thrust', all, noItems(), from, at)).toMatchObject({ segs: [[from, at]], half: WIZ_R + THRUST.reach });
    const r = aimOf('rush', all, noItems(), from, at);
    expect([r.segs[0][1].x, r.half]).toEqual([RUSH.dash, WIZ_R + 0.1]);
    expect(aimOf('teleport', all, noItems(), from, at)).toMatchObject({ segs: [], blastAt: at, blastR: WIZ_R });
    for (const s of ['boomerang', 'homing', 'shield', 'scourge', 'illusion', 'windwalk'] as const) expect(aimOf(s, all, noItems(), from, at)).toMatchObject({ segs: [], blastR: 0 });
  });

  it('Splitter: flies to the aimed point and releases 2 shards per wave, widest on the first', () => {
    const sp = aimOf('splitter', all, noItems(), from, at);
    expect(sp.segs).toHaveLength(1 + 2 * SPLITTER.waves);
    expect(sp.segs[0][1].x).toBeCloseTo(PROJ_SPAWN + 2); // bursts at the aimed point (counted from where it spawns)
    const open = (i: number) => Math.abs(Math.atan2(sp.segs[i][1].y - sp.segs[i][0].y, sp.segs[i][1].x - sp.segs[i][0].x));
    expect(open(1)).toBeCloseTo(Math.atan(SPLITTER.spawnLife)); // first wave: a = spawnLife
    expect(open(1)).toBeGreaterThan(open(2 * SPLITTER.waves)); // last wave is the narrowest
    expect(sp.segs[1][1].y).toBeCloseTo(-sp.segs[2][1].y); // symmetric
  });
});

describe('real hitbox in the sandbox (Fernando, 21/10)', () => {
  it('touching circles = hit: wizard and Illusion with WIZ_R, projectile with its radius; no circle for what does not hit', () => {
    expect([hitR('fireball'), hitR('shard'), hitR('swap'), hitR('snowball'), hitR('illusion')]).toEqual([PROJ_R, PROJ_R, PROJ_R, snowR(1), WIZ_R]);
    for (const k of ['meteor', 'warpzone', 'gravity'] as const) expect(hitR(k)).toBe(0);
  });
});
