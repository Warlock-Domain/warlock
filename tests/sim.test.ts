import { describe, expect, it } from 'vitest';
import { ARENA_MIN, ARENA_R0, ARENA_STEP, CHEST, DT, HP_MAX, PILLAR, SHRINK_EVERY, WIZ_R } from '../src/shared/constants.ts';
import { SPELLS } from '../src/shared/spells.ts';
import { newWorld, stepWorld, type Cmd, type World } from '../src/shared/sim.ts';
import { noSpells, type SpellId } from '../src/shared/spells.ts';
import { dist, v } from '../src/shared/vec.ts';

const all = (): Record<SpellId, number> => ({ ...noSpells(), lightning: 1, homing: 1, shield: 1, teleport: 1 });

// mundo com magos em posições escolhidas, todos com as 5 magias no nível 1
function world(spots: [number, number][]): World {
  const ids = spots.map((_, i) => 'p' + i);
  const w = newWorld(ids, Object.fromEntries(ids.map((id) => [id, all()])));
  spots.forEach(([x, y], i) => (w.wizards[i].pos = v(x, y)));
  // os testes de mecânica não querem os 2 s de invulnerabilidade do começo da rodada
  for (const z of w.wizards) z.invulnUntil = 0;
  return w;
}

function run(w: World, seconds: number, cmds: Cmd[] = []) {
  stepWorld(w, cmds);
  for (let i = 1; i < Math.round(seconds / DT); i++) stepWorld(w, []);
}

const wz = (w: World, i: number) => w.wizards[i];

describe('movimento, lava e arena', () => {
  it('walks to target and stops', () => {
    const w = world([[0, 0]]);
    run(w, 3, [{ id: 'p0', kind: 'move', to: v(3, 0) }]);
    expect(wz(w, 0).pos.x).toBeCloseTo(3, 5);
    expect(wz(w, 0).target).toBeNull();
  });

  it('cannot walk while sliding fast', () => {
    const w = world([[0, 0]]);
    wz(w, 0).vel = v(0, 6);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(5, 0) }]);
    expect(wz(w, 0).pos.x).toBe(0);
    expect(wz(w, 0).pos.y).toBeGreaterThan(0);
  });

  it('regenerates slowly on stone', () => {
    const w = world([[0, 0]]);
    wz(w, 0).hp = 50;
    run(w, 2);
    expect(wz(w, 0).hp).toBeCloseTo(51, 1);
  });

  it('lava drains 10 hp per second', () => {
    const w = world([[ARENA_R0 + 1, 0]]);
    run(w, 1);
    expect(wz(w, 0).hp).toBeCloseTo(HP_MAX - 10, 1);
  });

  it('arena stops shrinking at the minimum size', () => {
    const w = world([[0, 0]]);
    run(w, SHRINK_EVERY * 40);
    expect(w.arenaR).toBeCloseTo(ARENA_MIN);
  });

  it('arena shrinks by ARENA_STEP every SHRINK_EVERY', () => {
    const w = world([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(w.arenaR).toBeCloseTo(ARENA_R0);
    run(w, SHRINK_EVERY + 0.1);
    expect(w.arenaR).toBeCloseTo(ARENA_R0 - ARENA_STEP);
    expect(w.events.length + 0).toBeGreaterThanOrEqual(0);
  });

  it('wizards do not overlap', () => {
    const w = world([[0, 0], [0.1, 0]]);
    run(w, 0.5);
    expect(dist(wz(w, 0).pos, wz(w, 1).pos)).toBeGreaterThanOrEqual(2 * WIZ_R - 0.01);
  });

  it('dead wizard does not move', () => {
    const w = world([[0, 0]]);
    wz(w, 0).alive = false;
    run(w, 1, [{ id: 'p0', kind: 'move', to: v(3, 0) }]);
    expect(wz(w, 0).pos.x).toBe(0);
  });
});

describe('magias', () => {
  it('fireball hits and pushes away from caster', () => {
    const w = world([[0, 0], [4, 0]]);
    run(w, 1.5, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(4, 0) }]);
    // a regeneração devolve um pouco da vida depois do acerto
    expect(wz(w, 1).hp).toBeGreaterThanOrEqual(HP_MAX - SPELLS.fireball.levels[0].dmg);
    expect(wz(w, 1).hp).toBeLessThan(HP_MAX - SPELLS.fireball.levels[0].dmg + 1);
    expect(wz(w, 1).pos.x).toBeGreaterThan(5);
    expect(wz(w, 1).lastHitBy).toBe('p0');
  });

  it('fireball never tunnels', () => {
    const w = world([[0, 0], [SPELLS.fireball.levels[0].range - 0.3, 0]]);
    run(w, 2, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(1, 0) }]);
    expect(wz(w, 1).hp).toBeLessThan(HP_MAX);
  });

  it('cannot cast on cooldown', () => {
    // alvo longe, fora do alcance: a primeira bola ainda está voando quando a segunda é tentada
    const w = world([[0, 0], [9, 0]]);
    run(w, 0.25, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(9, 0) }]);
    run(w, 0.25, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(9, 0) }]);
    expect(w.projectiles.length).toBe(1);
  });

  it('cannot cast spell not owned', () => {
    const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() });
    stepWorld(w, [{ id: 'a', kind: 'cast', spell: 'lightning', at: v(0, 0) }]);
    expect(w.events.some((e) => e.k === 'lightning')).toBe(false);
  });

  it('lightning hits first wizard on the line within range', () => {
    const w = world([[0, 0], [2.5, 0], [3.5, 0]]);
    run(w, 0.25, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(6, 0) }]);
    expect(wz(w, 1).hp).toBeLessThan(HP_MAX);
    expect(wz(w, 2).hp).toBe(HP_MAX);
  });

  it('lightning does not reach past its range', () => {
    const w = world([[0, 0], [8, 0]]);
    run(w, 0.25, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(8, 0) }]);
    expect(wz(w, 1).hp).toBe(HP_MAX);
  });

  it('shield reflects fireball back to caster', () => {
    const w = world([[0, 0], [4, 0]]);
    stepWorld(w, [
      { id: 'p0', kind: 'cast', spell: 'fireball', at: v(4, 0) },
      { id: 'p1', kind: 'cast', spell: 'shield', at: v(0, 0) },
    ]);
    run(w, 1.5);
    expect(wz(w, 1).hp).toBe(HP_MAX);
    expect(wz(w, 0).hp).toBeLessThan(HP_MAX);
    expect(wz(w, 0).lastHitBy).toBe('p1');
  });

  it('shield aims the reflected fireball at where the shooter is now', () => {
    const w = world([[0, 0], [4, 0]]);
    stepWorld(w, [
      { id: 'p0', kind: 'cast', spell: 'fireball', at: v(4, 0) },
      { id: 'p1', kind: 'cast', spell: 'shield', at: v(0, 0) },
    ]);
    // quem atirou foge para o lado logo depois de lançar
    wz(w, 0).pos = v(0, 2.5);
    run(w, 2);
    expect(wz(w, 1).hp).toBe(HP_MAX);
    expect(wz(w, 0).hp).toBeLessThan(HP_MAX);
  });

  it('shield reflects lightning to caster', () => {
    const w = world([[0, 0], [3, 0]]);
    stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'shield', at: v(0, 0) }]);
    run(w, 0.25, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(3, 0) }]);
    expect(wz(w, 1).hp).toBe(HP_MAX);
    expect(wz(w, 0).hp).toBeLessThan(HP_MAX);
  });

  it('homing locks target nearest to aim point', () => {
    const w = world([[0, 0], [5, 3], [5, -3]]);
    run(w, 4, [{ id: 'p0', kind: 'cast', spell: 'homing', at: v(5, -3.5) }]);
    expect(wz(w, 2).hp).toBeLessThan(HP_MAX);
    expect(wz(w, 1).hp).toBe(HP_MAX);
  });

  it('teleport clamps to range', () => {
    const w = world([[0, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'teleport', at: v(20, 0) }]);
    expect(wz(w, 0).pos.x).toBeCloseTo(SPELLS.teleport.levels[0].range);
  });

  it('knockback grows as hp drops', () => {
    const fresh = world([[0, 0], [3, 0]]);
    const hurt = world([[0, 0], [3, 0]]);
    wz(hurt, 1).dmgTaken = 80;
    for (const w of [fresh, hurt]) run(w, 2.5, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
    expect(wz(hurt, 1).pos.x - 3).toBeGreaterThan((wz(fresh, 1).pos.x - 3) * 1.5);
  });

  it('death credits last hitter within 5s', () => {
    const w = world([[0, 0], [3, 0]]);
    wz(w, 1).hp = 5;
    const deaths: { id: string; by: string | null }[] = [];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
    for (let i = 0; i < 120; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'death') deaths.push(e);
    }
    expect(deaths).toMatchObject([{ k: 'death', id: 'p1', by: 'p0', src: 'fireball' }]);
    expect(wz(w, 1).alive).toBe(false);
  });

  it('lava death long after the hit has no killer', () => {
    const w = world([[ARENA_R0 + 2, 0]]);
    wz(w, 0).hp = 1;
    wz(w, 0).lastHitBy = 'x';
    wz(w, 0).lastHitAt = -10;
    run(w, 0.5);
    expect(wz(w, 0).alive).toBe(false);
  });
});

describe('conjuração e invulnerabilidade', () => {
  it('spells fire after the cast point and stop the caster', () => {
    const w = world([[0, 0], [3, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(0, 5) }]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
    expect(w.projectiles.length).toBe(0);
    run(w, 0.25);
    expect(w.projectiles.length).toBe(1);
    expect(wz(w, 0).target).toBeNull();
  });

  it('clicking to move during the cast does not cancel it; the wizard walks after', () => {
    const w = world([[0, 0], [9, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(9, 0) }]);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(0, 5) }]);
    expect(wz(w, 0).pos.y).toBe(0); // parado enquanto conjura
    run(w, 0.5);
    expect(w.projectiles.length).toBe(1);
    expect(wz(w, 0).pos.y).toBeGreaterThan(0.2);
  });

  it('nobody takes damage in the first 2 seconds', () => {
    const ids = ['a', 'b'];
    const w = newWorld(ids, { a: all(), b: all() });
    w.wizards[0].pos = v(0, 0);
    w.wizards[1].pos = v(2, 0);
    run(w, 0.5, [{ id: 'a', kind: 'cast', spell: 'lightning', at: v(2, 0) }]);
    expect(w.wizards[1].hp).toBe(HP_MAX);
  });
});

describe('choque de magias', () => {
  it('two enemy fireballs meeting explode in an area', () => {
    const w = world([[-3, 0], [3, 0], [0, 0.8]]);
    stepWorld(w, [
      { id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) },
      { id: 'p1', kind: 'cast', spell: 'fireball', at: v(-3, 0) },
    ]);
    const clashes: string[] = [];
    for (let i = 0; i < 40; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'clash') clashes.push(e.combo);
    }
    expect(clashes).toEqual(['fire']);
    expect(w.projectiles.length).toBe(0);
    expect(wz(w, 2).hp).toBeLessThan(HP_MAX);
    expect(wz(w, 0).hp).toBe(HP_MAX);
  });

  it('fireball meeting a homing missile makes an arcane explosion', () => {
    const w = world([[-3, 0], [3, 0]]);
    stepWorld(w, [
      { id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) },
      { id: 'p1', kind: 'cast', spell: 'homing', at: v(-3, 0) },
    ]);
    const clashes: string[] = [];
    for (let i = 0; i < 60; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'clash') clashes.push(e.combo);
    }
    expect(clashes).toEqual(['arcane']);
  });

  it('own projectiles do not collide with each other', () => {
    const w = world([[0, 0], [8, 8]]);
    run(w, 0.3, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
    run(w, 0.3, [{ id: 'p0', kind: 'cast', spell: 'homing', at: v(3, 0) }]);
    expect(w.projectiles.length).toBe(2);
  });

  it('lightning detonates a fireball in its path', () => {
    const w = world([[0, 0], [3, 2], [2.2, 0.6]]);
    stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'fireball', at: v(-3, -2) }]);
    for (let i = 0; i < 16; i++) stepWorld(w, []);
    const fb = w.projectiles[0].pos;
    const seen: string[] = [];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(fb.x, fb.y) }]);
    for (let i = 0; i < 14; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'clash') seen.push(e.combo);
    }
    expect(seen).toContain('detonate');
    expect(w.projectiles.length).toBe(0);
    expect(wz(w, 2).hp).toBeLessThan(HP_MAX);
  });
});

describe('pilares', () => {
  const withPillar = (spots: [number, number][], pillar: [number, number]) => {
    const w = world(spots);
    w.pillars = [{ pos: v(pillar[0], pillar[1]), hp: PILLAR.hp, alive: true, kind: 'pillar' }];
    return w;
  };

  it('a pillar blocks a fireball and takes the damage', () => {
    const w = withPillar([[0, 0], [5, 0]], [2.5, 0]);
    run(w, 1.5, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(5, 0) }]);
    expect(wz(w, 1).hp).toBe(HP_MAX);
    expect(w.pillars[0].hp).toBeLessThan(PILLAR.hp);
  });

  it('wizards cannot walk through a pillar', () => {
    const w = withPillar([[0, 0]], [1.5, 0]);
    run(w, 3, [{ id: 'p0', kind: 'move', to: v(3, 0) }]);
    expect(dist(wz(w, 0).pos, v(1.5, 0))).toBeGreaterThanOrEqual(PILLAR.r + WIZ_R - 0.01);
  });

  it('a broken pillar explodes and stops blocking', () => {
    const w = withPillar([[0, 0], [5, 0]], [2.5, 0]);
    w.pillars[0].hp = 1;
    const seen: string[] = [];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(5, 0) }]);
    for (let i = 0; i < 60; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'clash') seen.push(e.combo);
    }
    expect(seen).toContain('pillar');
    expect(w.pillars[0].alive).toBe(false);
  });

  it('a rock never breaks and an altar explodes in fire', () => {
    const w = world([[0, 0], [5, 0], [4, 1.2]]);
    w.pillars = [{ pos: v(2.5, 0), hp: Infinity, alive: true, kind: 'rock' }];
    run(w, 1.5, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(5, 0) }]);
    expect(w.pillars[0].alive).toBe(true);
    const w2 = world([[0, 0], [9, 0], [4, 0.9]]);
    w2.pillars = [{ pos: v(4, 0), hp: 1, alive: true, kind: 'shrine' }];
    run(w2, 1.5, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(9, 0) }]);
    expect(w2.pillars[0].alive).toBe(false);
    expect(wz(w2, 2).hp).toBeLessThan(HP_MAX);
  });

  it('pillars spawn away from wizards', () => {
    const w = newWorld(['a', 'b', 'c', 'd'], { a: all(), b: all(), c: all(), d: all() }, {}, {}, 8);
    expect(w.pillars.length).toBeGreaterThanOrEqual(2);
    for (const p of w.pillars) for (const z of w.wizards) expect(dist(p.pos, z.pos)).toBeGreaterThanOrEqual(2);
  });
});

describe('acerto em invulnerável', () => {
  it('a fireball hitting an invulnerable wizard still makes a hit event, without damage', () => {
    const w = world([[0, 0], [3, 0]]);
    wz(w, 1).invulnUntil = 99;
    const hits: number[] = [];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
    for (let i = 0; i < 60; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'hit') hits.push(e.dmg);
    }
    expect(hits).toEqual([0]);
    expect(wz(w, 1).hp).toBe(HP_MAX);
  });
});

describe('tecla repetida', () => {
  it('pressing the same spell twice during the cast fires it once and keeps the first timing', () => {
    const w = world([[0, 0], [9, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(9, 0) }]);
    for (let i = 0; i < 4; i++) stepWorld(w, []);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(9, 0) }]);
    for (let i = 0; i < 2; i++) stepWorld(w, []);
    expect(w.projectiles.length).toBe(1);
  });
});

describe('baú e chão do choque', () => {
  it('a chest appears after 15 s, spells break it and standing on the gold pays 1 every 2 s', () => {
    const w = world([[0, 0], [6, 6]]);
    w.pillars = [];
    run(w, CHEST.first + 0.1);
    const i = w.pillars.findIndex((q) => q.kind === 'chest' && q.alive);
    expect(i).toBeGreaterThanOrEqual(0);
    const at = w.pillars[i].pos;
    // quebra com bolas de fogo de perto
    w.wizards[0].pos = v(at.x - 1.5, at.y);
    for (let k = 0; k < 8 && w.pillars[i].alive; k++) {
      w.wizards[0].cd.fireball = 0;
      run(w, 0.4, [{ id: 'p0', kind: 'cast', spell: 'fireball', at }]);
    }
    expect(w.pillars[i].alive).toBe(false);
    expect(w.loots[0]?.left).toBe(CHEST.pile);
    w.wizards[0].pos = v(at.x, at.y);
    w.wizards[0].vel = v(0, 0);
    let gold = 0;
    for (let k = 0; k < Math.round(4.2 / DT); k++) {
      stepWorld(w, []);
      gold += w.events.filter((e) => e.k === 'loot' && e.id === 'p0').length;
    }
    expect(gold).toBe(2);
  });

  it('fire clash leaves burning ground, arcane slows, pulse pulls inward', () => {
    const w = world([[0, 0], [9, 0]]);
    w.pillars = [];
    w.zones = [
      { pos: v(0, 0), r: 1, kind: 'burn', until: 99 },
      { pos: v(9, 0), r: 1, kind: 'slow', until: 99 },
      { pos: v(4, 4), r: 2, kind: 'pull', until: 99 },
    ];
    const z = w.wizards;
    z.push({ ...z[0], id: 'p2', pos: v(5.5, 4), hp: HP_MAX });
    run(w, 1);
    expect(z[0].hp).toBeLessThan(HP_MAX);
    expect(z[1].speed).toBeLessThan(z[1].baseSpeed);
    expect(z[2].pos.x).toBeLessThan(5.5);
  });
});

describe('mecânicas do original', () => {
  it('a pushed wizard passes momentum to the one it bumps (elastic)', () => {
    const w = world([[0, 0], [1, 0]]);
    w.pillars = [];
    w.wizards[0].vel = v(6, 0);
    run(w, 0.3);
    expect(w.wizards[1].vel.x).toBeGreaterThan(1);
  });

  it('a shield bubble blocks a fireball before it reaches the body', () => {
    const w = world([[0, 0], [5, 0]]);
    w.pillars = [];
    w.wizards[1].shieldUntil = 99;
    w.wizards[1].shieldR = 1.5;
    run(w, 0.05, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(5, 0) }]);
    let reflectedAt = 0;
    for (let i = 0; i < 60 && !reflectedAt; i++) {
      stepWorld(w, []);
      const e = w.events.find((x) => x.k === 'reflect');
      if (e && e.k === 'reflect') reflectedAt = e.x;
    }
    expect(reflectedAt).toBeLessThan(5 - 1.2);
  });
});

describe('baús ao longo da rodada', () => {
  it('a new chest comes every 12 s even if nobody broke the last one, up to 2 standing', () => {
    const w = world([[0, 0], [6, 6]]);
    w.pillars = [];
    run(w, CHEST.first + CHEST.every * 3 + 0.5);
    expect(w.pillars.filter((q) => q.kind === 'chest' && q.alive).length).toBe(CHEST.maxUp);
  });
});
