import { describe, expect, it } from 'vitest';
import { DT, WIZ_R, WIZ_SPEED } from '../src/shared/constants.ts';
import { botBuy, botCmds } from '../src/shared/bots.ts';
import { addPlayer, buy, newMatch, startMatch, undoBuy } from '../src/shared/match.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { newWorld, stepWorld, type Cmd, type SimEvent, type World } from '../src/shared/sim.ts';
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

  it('flies past the click point and swaps with whoever is beyond it', () => {
    const w = world([[0, 0], [4.5, 0]], ['swap']);
    run(w, 0.6, [cast('p0', 'swap', 2, 0)]);
    expect(w.wizards[0].pos.x).toBeCloseTo(4.5, 1);
    expect(w.wizards[1].pos.x).toBeCloseTo(0, 1);
  });

  it('with no hit the caster ends where the projectile stopped, up to max range', () => {
    const w = world([[0, 0], [0, -8]], ['swap']);
    run(w, 0.6, [cast('p0', 'swap', 3, 0)]);
    expect(w.wizards[0].pos.x).toBeCloseTo(1.5, 3); // errou: vai até a metade do caminho até a mira
    w.wizards[0].cd.swap = 0;
    w.wizards[0].pos = v(0, 0);
    run(w, 1, [cast('p0', 'swap', 50, 0)]);
    expect(dist(w.wizards[0].pos, v(0, 0))).toBeCloseTo(SPELLS.swap.levels[0].range / 2, 3);
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
    expect(lost).toBeLessThan(L.dmg * 0.7); // borda 6 desde 17/10 (era 4)
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

  it('the dash damages whoever it touches, once', () => {
    const w = world([[0, 0], [0, -1.5]], ['rush']);
    run(w, 0.5, [cast('p0', 'rush', 0, -10)]);
    expect(w.wizards[1].hp).toBeCloseTo(100 - RUSH.dashDmg, 0);
  });

  it('scourge can start during the dash', () => {
    const w = world([[0, 0], [0, -4]], ['rush']);
    w.wizards[0].items.scourge = 1;
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'rush', at: v(0, -10) }]);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, -10) }]);
    expect(w.wizards[0].casting?.item).toBe('scourge');
    run(w, 0.8);
    expect(w.wizards[1].hp).toBeLessThan(100);
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

// as cinco do Warlock Brawl (17/10): Bumerangue, Estocada, Gravidade, Pilar de pedra e Ricochete
function runEvents(w: World, seconds: number, cmds: Cmd[] = [], each?: () => void) {
  const out: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepWorld(w, i === 0 ? cmds : []);
    out.push(...w.events);
    each?.();
  }
  return out;
}
const hitsOf = (ev: SimEvent[], src: string) => ev.filter((e): e is Extract<SimEvent, { k: 'hit' }> => e.k === 'hit' && e.src === src);

describe('Bumerangue', () => {
  // voo livre até (4, 0): guarda a trajetória e se o bumerangue já estava voltando
  function freeFlight() {
    const w = world([[0, 0], [0, -8]], ['boomerang']);
    const path: { x: number; y: number; back: boolean }[] = [];
    runEvents(w, 4, [cast('p0', 'boomerang', 4, 0)], () => {
      const p = w.projectiles.find((q) => q.kind === 'boomerang');
      if (p) path.push({ ...p.pos, back: !!p.back });
    });
    return { w, path };
  }

  it('curves out to the click point and comes back to the caster, where it disappears', () => {
    const { w, path } = freeFlight();
    const far = Math.max(...path.map((q) => q.x));
    expect(far).toBeGreaterThan(3.5);
    expect(far).toBeLessThan(4.7); // o passo de 1/60 s passa um pouco do ponto
    expect(path.some((q) => q.y > 0.2)).toBe(true); // ida curva para um lado
    expect(path.some((q) => q.y < -0.2)).toBe(true); // volta pelo outro
    expect(w.projectiles).toHaveLength(0);
    expect(dist(path[path.length - 1], w.wizards[0].pos)).toBeLessThan(1);
  });

  it('hits on the way out, bounces and still returns to the caster', () => {
    const out = freeFlight().path.find((q) => !q.back && q.x > 2)!;
    const w = world([[0, 0], [out.x, out.y]], ['boomerang']);
    const ev = runEvents(w, 4, [cast('p0', 'boomerang', 4, 0)]);
    const hits = hitsOf(ev, 'boomerang');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].id).toBe('p1');
    expect(hits[0].dmg).toBeCloseTo(SPELLS.boomerang.levels[0].dmg, 5);
    expect(w.projectiles).toHaveLength(0); // voltou e sumiu no dono
    expect(ev.filter((e) => e.k === 'land')).toHaveLength(1);
  });

  it('hits someone standing on the way back', () => {
    const back = freeFlight().path.find((q) => q.back && q.x < 2.5)!;
    const w = world([[0, 0], [back.x, back.y]], ['boomerang']);
    let backAtHit: boolean | null = null;
    runEvents(w, 4, [cast('p0', 'boomerang', 4, 0)], () => {
      const p = w.projectiles.find((q) => q.kind === 'boomerang');
      if (backAtHit === null && w.events.some((e) => e.k === 'hit' && e.src === 'boomerang')) backAtHit = !!p?.back;
    });
    expect(backAtHit).toBe(true);
  });
});

describe('Estocada', () => {
  const thrustHit = (gap: number) => {
    const w = world([[0, 0], [gap, 0]], ['thrust']);
    const ev = runEvents(w, 1, [cast('p0', 'thrust', gap, 0)]);
    return { w, hit: hitsOf(ev, 'thrust')[0] };
  };

  it('moves the caster and deals more damage the faster it is going', () => {
    const near = thrustHit(2);
    const far = thrustHit(5.5);
    expect(near.hit.id).toBe('p1');
    expect(near.w.wizards[0].pos.x).toBeGreaterThan(1);
    expect(far.w.wizards[0].pos.x).toBeGreaterThan(4);
    expect(near.hit.dmg).toBeLessThan(far.hit.dmg);
    expect(far.hit.dmg).toBeLessThanOrEqual(SPELLS.thrust.levels[0].dmg);
    expect(far.w.wizards[1].vel.x).toBeGreaterThan(0); // empurrou o alvo
    expect(len(far.w.wizards[0].vel)).toBe(0); // quem estocou para no golpe
  });

  it('without a hit it stops near the click point and slows down', () => {
    const w = world([[0, 0], [0, -8]], ['thrust']);
    run(w, 0.5, [cast('p0', 'thrust', 3, 0)]);
    expect(w.wizards[0].pos.x).toBeGreaterThan(2.3);
    expect(w.wizards[0].pos.x).toBeLessThan(3.7);
    expect(len(w.wizards[0].vel)).toBeLessThan(2);
  });
});

describe('Gravidade', () => {
  it('pulls a nearby enemy and burns it', () => {
    const w = world([[0, 0], [2, 1.5]], ['gravity']);
    run(w, 1, [cast('p0', 'gravity', 5, 0)]);
    expect(w.wizards[1].pos.y).toBeLessThan(1.4);
    expect(w.wizards[1].hp).toBeLessThan(w.wizards[1].hpMax);
    expect(w.wizards[0].pos).toEqual(v(0, 0)); // quem lançou não é puxado
  });

  it('bends a passing projectile', () => {
    const fireballY = (gravity: boolean) => {
      const w = world([[0, -1], [-1, 2]], ['gravity']);
      run(w, 0.6, [cast('p1', 'fireball', 9, 2), ...(gravity ? [cast('p0', 'gravity', 5, -1)] : [])]);
      return w.projectiles.find((p) => p.kind === 'fireball')!.pos.y;
    };
    expect(fireballY(false)).toBeCloseTo(2, 5);
    expect(fireballY(true)).toBeLessThan(1.8);
  });
});

describe('Pilar de pedra', () => {
  it('raises an obstacle at the click point (up to its range) that vanishes after 4 s', () => {
    const w = world([[0, 0], [0, -8]], ['rockpillar']);
    run(w, 0.1, [cast('p0', 'rockpillar', 3, 0)]);
    const p = w.pillars.find((q) => q.kind === 'rockpillar')!;
    expect(p.alive).toBe(true);
    expect(dist(p.pos, v(3, 0))).toBeLessThan(1e-9);
    const view = decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0', 'p1']);
    expect(view.pillars.some((q) => q.kind === 'rockpillar' && q.hp > 0)).toBe(true);
    run(w, 4);
    expect(p.alive).toBe(false);
    w.wizards[0].cd.rockpillar = 0;
    run(w, 0.1, [cast('p0', 'rockpillar', 50, 0)]);
    expect(len(w.pillars[w.pillars.length - 1].pos)).toBeCloseTo(SPELLS.rockpillar.levels[0].range, 5);
  });
});

describe('Ricochete', () => {
  it('jumps to the next wizard with 70% of the damage and stops once it would drop below 1', () => {
    const w = world([[-2, 0], [2, 0], [2, 2]], ['bouncer']);
    for (const z of w.wizards) z.kbResist = 1; // sem empurrão: os alvos ficam no lugar
    const ev = runEvents(w, 3, [cast('p0', 'bouncer', 2, 0)]);
    const hits = hitsOf(ev, 'bouncer');
    const d0 = SPELLS.bouncer.levels[0].dmg;
    expect(hits.map((h) => h.id)).toEqual(['p1', 'p2', 'p1', 'p2', 'p1']);
    hits.forEach((h, i) => expect(h.dmg).toBeCloseTo(Math.round(d0 * 0.7 ** i * 10) / 10, 5));
    expect(d0 * 0.7 ** 5).toBeLessThan(1);
    expect(w.projectiles).toHaveLength(0);
  });
});

describe('Bumerangue e baú', () => {
  it('the boomerang damages the chest', () => {
    const w = world([[0, 0], [9, 9]], ['boomerang']);
    w.pillars = [{ pos: v(2.5, 0), hp: 25, alive: true, kind: 'chest' }];
    run(w, 1.5, [cast('p0', 'boomerang', 4, 0)]);
    expect(w.pillars[0].hp).toBeLessThan(25);
  });
});
