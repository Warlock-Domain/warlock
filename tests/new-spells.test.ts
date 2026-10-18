import { describe, expect, it } from 'vitest';
import { DT, WIZ_R, WIZ_SPEED } from '../src/shared/constants.ts';
import { botBuy, botCmds } from '../src/shared/bots.ts';
import { addPlayer, buy, newMatch, startMatch, undoBuy } from '../src/shared/match.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { newWorld, stepWorld, type Cmd, type World } from '../src/shared/sim.ts';
import { GRIP, MAX_SPELLS, RUSH, SPELLS, noSpells, spellLevel, type SpellId } from '../src/shared/spells.ts';
import { dist, len, v } from '../src/shared/vec.ts';

// mundo sem invulnerabilidade inicial; todos os magos com as magias dadas no nível 1
function world(spots: [number, number][], spells: SpellId[]): World {
  const ids = spots.map((_, i) => 'p' + i);
  const own = { ...noSpells(), ...Object.fromEntries(spells.map((s) => [s, 1])) };
  const w = newWorld(ids, Object.fromEntries(ids.map((id) => [id, own])));
  spots.forEach(([x, y], i) => (w.wizards[i].pos = v(x, y)));
  for (const z of w.wizards) z.invulnUntil = 0;
  return w;
}

function run(w: World, seconds: number, cmds: Cmd[] = []) {
  stepWorld(w, cmds);
  for (let i = 1; i < Math.round(seconds / DT); i++) stepWorld(w, []);
}

const cast = (id: string, spell: SpellId, x: number, y: number): Cmd => ({ id, kind: 'cast', spell, at: v(x, y) });

describe('Troca', () => {
  it('swaps places with the wizard it hits', () => {
    const w = world([[0, 0], [3, 0]], ['swap']);
    run(w, 0.5, [cast('p0', 'swap', 3, 0)]);
    expect(w.wizards[0].pos.x).toBeCloseTo(3, 1);
    expect(w.wizards[1].pos.x).toBeCloseTo(0, 1);
    expect(w.projectiles).toHaveLength(0);
  });

  it('with no hit the caster ends where the projectile stopped, up to max range', () => {
    const w = world([[0, 0], [0, -8]], ['swap']);
    run(w, 0.3, [cast('p0', 'swap', 3, 0)]);
    expect(w.wizards[0].pos.x).toBeCloseTo(3, 3); // parou na mira, mais perto que o alcance
    w.wizards[0].cd.swap = 0;
    w.wizards[0].pos = v(0, 0);
    run(w, 1, [cast('p0', 'swap', 50, 0)]);
    expect(dist(w.wizards[0].pos, v(0, 0))).toBeCloseTo(SPELLS.swap.levels[0].range, 3);
  });
});

describe('escudo contra as magias novas', () => {
  it('blocks Troca: nobody moves and the projectile is gone', () => {
    const w = world([[0, 0], [3, 0]], ['swap']);
    w.wizards[1].shieldUntil = 99;
    run(w, 0.5, [cast('p0', 'swap', 3, 0)]);
    expect(w.wizards[0].pos).toEqual(v(0, 0));
    expect(w.wizards[1].pos.x).toBeCloseTo(3, 5);
    expect(w.projectiles).toHaveLength(0);
  });

  it('reflects Rajada back at the caster without crediting a hit', () => {
    const w = world([[0, 0], [4, 0]], ['cluster']);
    w.wizards[1].shieldUntil = 99;
    let landed = false;
    stepWorld(w, [cast('p0', 'cluster', 4, 0)]);
    for (let i = 0; i < 60; i++) {
      stepWorld(w, []);
      landed ||= w.events.some((e) => e.k === 'land');
    }
    expect(w.projectiles.some((p) => p.kind === 'cluster' && p.owner === 'p1')).toBe(true);
    expect(w.wizards[1].hp).toBe(100);
    expect(landed).toBe(false);
  });
});

describe('Agarrar', () => {
  it('stops the target from walking while it lasts, then releases', () => {
    const w = world([[0, 0], [4, 0]], ['grip']);
    run(w, 1.2, [cast('p0', 'grip', 4, 0)]);
    const L = spellLevel('grip', 1);
    expect(w.wizards[1].gripUntil).toBeGreaterThan(w.t);
    const before = w.wizards[1].pos;
    run(w, 2, [{ id: 'p1', kind: 'move', to: v(4, 6) }]);
    expect(w.wizards[1].pos).toEqual(before);
    run(w, L.duration, []);
    run(w, 1, [{ id: 'p1', kind: 'move', to: v(4, 6) }]);
    expect(w.wizards[1].pos.y).toBeGreaterThan(0.5);
  });

  it('cuts knockback taken by 67% and cancels the target cast', () => {
    const a = world([[0, 0], [4, 0]], ['fireball']);
    const g = world([[0, 0], [4, 0]], ['fireball']);
    g.wizards[1].gripUntil = 99;
    run(a, 0.4, [cast('p0', 'fireball', 4, 0)]);
    run(g, 0.4, [cast('p0', 'fireball', 4, 0)]);
    expect(len(g.wizards[1].vel)).toBeCloseTo(len(a.wizards[1].vel) * (1 - GRIP.kbCut), 3);
    const c = world([[0, 0], [4, 0]], ['grip', 'meteor']);
    stepWorld(c, [cast('p1', 'meteor', 0, 0)]);
    expect(c.wizards[1].casting).not.toBeNull();
    run(c, 0.4, [cast('p0', 'grip', 4, 0)]);
    expect(c.wizards[1].casting).toBeNull();
  });
});

describe('Meteoro', () => {
  it('lands only after the delay and hurts only inside the radius', () => {
    const L = spellLevel('meteor', 1);
    const w = world([[0, 0], [4, 0], [4, L.radius + WIZ_R + 1]], ['meteor']);
    run(w, 0.5, [cast('p0', 'meteor', 4, 0)]);
    expect(w.projectiles.map((p) => p.kind)).toEqual(['meteor']);
    expect(w.wizards[1].hp).toBe(100);
    run(w, 1, []);
    expect(w.projectiles).toHaveLength(0);
    expect(w.wizards[1].hp).toBeCloseTo(100 - L.dmg, 0); // no centro: dano máximo
    expect(w.wizards[2].hp).toBe(100); // fora do raio
    expect(w.wizards[0].hp).toBe(100); // quem lança não leva
    expect(len(w.wizards[1].vel)).toBeGreaterThan(0);
  });

  it('deals less at the edge', () => {
    const L = spellLevel('meteor', 1);
    const w = world([[0, 0], [4 + L.radius * 0.9, 0]], ['meteor']);
    run(w, 1.7, [cast('p0', 'meteor', 4, 0)]);
    const lost = 100 - w.wizards[1].hp;
    expect(lost).toBeGreaterThan(L.dmgMin - 0.2);
    expect(lost).toBeLessThan(L.dmg * 0.5);
  });
});

describe('Investida', () => {
  it('raises walking speed and turns hits into extra speed', () => {
    const w = world([[0, 0], [4, 0]], ['rush', 'fireball']);
    // avança para (4, 3), de lado, para a bola de fogo ir até lá
    run(w, 0.3, [cast('p1', 'rush', 4, 9)]);
    const z = w.wizards[1];
    expect(z.speed).toBeCloseTo(WIZ_SPEED + RUSH.bonus, 5);
    const fb = spellLevel('fireball', 1);
    run(w, 1.2, [cast('p0', 'fireball', z.pos.x, z.pos.y)]);
    expect(z.speed).toBeGreaterThan(WIZ_SPEED + RUSH.bonus);
    expect(100 - z.hp).toBeCloseTo(fb.dmg * (1 - RUSH.share), 0); // absorveu metade do golpe
  });

  it('dashes 3 m toward the cursor', () => {
    const w = world([[0, 0], [9, 9]], ['rush']);
    run(w, 0.5, [cast('p0', 'rush', 0, -10)]);
    expect(w.wizards[0].pos.x).toBeCloseTo(0, 1);
    expect(w.wizards[0].pos.y).toBeCloseTo(-RUSH.dash, 1);
  });

  it('ends after its duration', () => {
    const w = world([[0, 0], [4, 0]], ['rush']);
    run(w, 0.1, [cast('p0', 'rush', 0, 0)]);
    run(w, spellLevel('rush', 1).duration + 0.5);
    expect(w.wizards[0].speed).toBeCloseTo(WIZ_SPEED, 5);
  });
});

describe('Rajada', () => {
  it('spawns 4 projectiles in a fan and each can land', () => {
    const w = world([[0, 0], [3, 0]], ['cluster']);
    run(w, 0.15, [cast('p0', 'cluster', 3, 0)]);
    expect(w.projectiles.filter((p) => p.kind === 'cluster')).toHaveLength(4);
    const dirs = new Set(w.projectiles.map((p) => Math.round(Math.atan2(p.vel.y, p.vel.x) * 100)));
    expect(dirs.size).toBe(4);
    run(w, 1);
    expect(w.wizards[1].hp).toBeLessThan(100);
    expect(w.wizards[1].hp).toBeGreaterThan(100 - 4 * spellLevel('cluster', 1).dmg - 1);
  });

  it('passes through enemy fireballs instead of clashing', () => {
    const w = world([[0, 0], [8, 0]], ['cluster', 'fireball']);
    let clashed = false;
    stepWorld(w, [cast('p0', 'cluster', 8, 0), cast('p1', 'fireball', 0, 0)]);
    for (let i = 0; i < 60; i++) {
      stepWorld(w, []);
      clashed ||= w.events.some((e) => e.k === 'clash');
    }
    expect(clashed).toBe(false);
  });
});

describe('snapshot e telemetria', () => {
  it('encodes new statuses and projectile kinds', () => {
    const w = world([[0, 0], [4, 0]], ['rush', 'grip', 'meteor']);
    w.wizards[0].gripUntil = 9;
    run(w, 0.1, [cast('p0', 'rush', 0, 0), cast('p1', 'meteor', 5, 0)]);
    run(w, 0.2);
    const snap = decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0', 'p1']);
    expect(snap.wizards[0].status & 128).toBe(128);
    expect(snap.wizards[0].status & 256).toBe(256);
    expect(snap.projectiles[0].kind).toBe('meteor');
    expect(snap.projectiles[0].vel.x).toBeCloseTo(spellLevel('meteor', 1).radius, 1);
    expect(snap.projectiles[0].vel.y).toBeGreaterThan(0);
  });

  it('emits fire, hit and land events for meteor and cluster', () => {
    const seen = new Set<string>();
    for (const spell of ['cluster', 'meteor'] as const) {
      const w = world([[0, 0], [3, 0]], [spell]);
      stepWorld(w, [cast('p0', spell, 3, 0)]);
      for (let i = 0; i < 120; i++) {
        stepWorld(w, []);
        for (const e of w.events) {
          if (e.k === 'fire' || e.k === 'land') seen.add(`${e.k}:${e.src}`);
          else if (e.k === 'hit' && e.by === 'p0') seen.add(`hit:${e.src}`);
        }
      }
    }
    expect([...seen]).toEqual(expect.arrayContaining(['fire:cluster', 'land:cluster', 'hit:cluster', 'fire:meteor', 'land:meteor', 'hit:meteor']));
  });
});

describe('limite de 6 magias', () => {
  const shop = () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    m.players[0].gold = 500;
    return m;
  };

  it('refuses a 7th different spell; undo frees the slot; upgrades keep working', () => {
    const m = shop();
    const five: SpellId[] = ['lightning', 'homing', 'shield', 'teleport', 'swap'];
    for (const s of five) expect(buy(m, 'a', s)).toBe(true);
    expect(MAX_SPELLS).toBe(6);
    const gold = m.players[0].gold;
    expect(buy(m, 'a', 'grip')).toBe(false);
    expect(m.players[0].gold).toBe(gold);
    expect(m.players[0].spells.grip).toBe(0);
    expect(buy(m, 'a', 'lightning')).toBe(true); // nível 2 da mesma
    expect(undoBuy(m, 'a', 'spell:swap')).toBe(true);
    expect(buy(m, 'a', 'grip')).toBe(true);
  });

  it('bots stop buying new spells at the limit but still upgrade', () => {
    const spells = { ...noSpells(), lightning: 1, homing: 1, meteor: 1, cluster: 1, shield: 1 };
    const pick = botBuy({ gold: 99, spells });
    expect(pick?.kind).toBe('spell');
    expect(pick && pick.kind === 'spell' && spells[pick.id] > 0).toBe(true);
  });
});

describe('bots com as magias novas', () => {
  const duel = (own: Partial<Record<SpellId, number>>) => {
    const w = newWorld(['bot', 'x'], { bot: { ...noSpells(), ...own }, x: noSpells() });
    w.wizards[0].pos = v(0, 0);
    w.wizards[1].pos = v(4, 0);
    w.wizards[0].cd.fireball = 99;
    return w;
  };

  it('cast meteor and cluster at the nearest enemy', () => {
    expect(botCmds(duel({ meteor: 1 }), 'bot', () => 0.3).some((c) => c.kind === 'cast' && c.spell === 'meteor')).toBe(true);
    expect(botCmds(duel({ cluster: 1 }), 'bot', () => 0.3).some((c) => c.kind === 'cast' && c.spell === 'cluster')).toBe(true);
  });
});
