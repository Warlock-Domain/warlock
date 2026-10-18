import { describe, expect, it } from 'vitest';
import { DT, LAVA_DPS, UNIT, WIZ_SPEED } from '../src/shared/constants.ts';
import { ITEMS, WIND_BOOTS, noItems } from '../src/shared/items.ts';
import { addPlayer, newMatch, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { newWorld, stepWorld, type World } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

const run = (w: World, secs: number) => {
  for (let i = 0; i < Math.round(secs / DT); i++) stepWorld(w, []);
};
const duo = (items: Partial<Record<keyof typeof ITEMS, number>>) => {
  const w = newWorld(['a', 'b'], { a: noSpells(), b: { ...noSpells(), fireball: 1 } }, { a: { ...noItems(), ...items } }, 0, Math.random, false, {}, undefined, 'circle');
  w.wizards[0].pos = v(0, 0);
  w.wizards[1].pos = v(4, 0);
  for (const z of w.wizards) z.invulnUntil = 0;
  return w;
};

describe('Botas de vento', () => {
  it('5 s sem dano: anda mais rápido; um golpe acaba; depois de mais 5 s volta', () => {
    const w = duo({ wind_boots: 1 });
    const a = w.wizards[0];
    run(w, 4.9);
    expect(a.speed).toBeCloseTo(WIZ_SPEED);
    run(w, 0.2);
    expect(a.speed).toBeCloseTo(WIZ_SPEED + WIND_BOOTS.speed);
    stepWorld(w, [{ id: 'b', kind: 'cast', spell: 'fireball', at: v(0, 0) }]);
    run(w, 1);
    expect(a.hp).toBeLessThan(a.hpMax);
    expect(a.speed).toBeCloseTo(WIZ_SPEED);
    run(w, 5);
    expect(a.speed).toBeCloseTo(WIZ_SPEED + WIND_BOOTS.speed);
  });

  it('não soma com as Botas: vale a maior', () => {
    const w = duo({ wind_boots: 1, boots: 1 });
    run(w, 5.1);
    expect(w.wizards[0].speed).toBeCloseTo(WIZ_SPEED + Math.max(18 * UNIT, WIND_BOOTS.speed));
    const fast = duo({ wind_boots: 1, boots: 3 }); // 40 de velocidade > 25: as de vento não somam nada
    run(fast, 5.1);
    expect(fast.wizards[0].speed).toBeCloseTo(WIZ_SPEED + 40 * UNIT);
  });

  it('quem causa dano também perde a calmaria', () => {
    const w = duo({});
    w.wizards[1].items.wind_boots = 1;
    w.wizards[1].windBonus = WIND_BOOTS.speed;
    w.wizards[0].spells.fireball = 1;
    run(w, 5.1);
    expect(w.wizards[1].speed).toBeCloseTo(WIZ_SPEED + WIND_BOOTS.speed);
    stepWorld(w, [{ id: 'a', kind: 'cast', spell: 'fireball', at: v(4, 0) }]);
    run(w, 1);
    expect(w.wizards[1].speed).toBeCloseTo(WIZ_SPEED);
  });
});

describe('dano da lava para quem empurrou', () => {
  function playing(): Match {
    const m = newMatch();
    addPlayer(m, 'a', 'A');
    addPlayer(m, 'b', 'B');
    startMatch(m, 0, 0, 'rounds', true, Math.random, { arena: 'circle' });
    let now = 0;
    while (m.phase !== 'playing') tickMatch(m, (now = Math.max(now + 17, m.phaseEnds)), []);
    for (const z of m.world!.wizards) z.invulnUntil = 0;
    return m;
  }
  const steps = (m: Match, n: number) => {
    for (let i = 0; i < n; i++) tickMatch(m, 1e6 + i, []);
  };

  it('metade da vida que a lava tira vai para o dano de quem acertou por último (janela de 5 s)', () => {
    const m = playing();
    const b = m.world!.wizards.find((z) => z.id === 'b')!;
    Object.assign(b, { lastHitBy: 'a', lastHitAt: m.world!.t, lastHitSrc: 'fireball', pos: v(m.world!.arenaR + 2, 0) });
    const hp = b.hp;
    steps(m, 30);
    const a = m.players.find((p) => p.id === 'a')!;
    const lost = hp - b.hp;
    expect(lost).toBeCloseTo(30 * LAVA_DPS * DT, 6);
    expect(a.stats.round.dmgBy.lava).toBeCloseTo(lost / 2, 6);
    expect(a.stats.round.dmg).toBeCloseTo(lost / 2, 6);
    expect(a.stats.match.dmg).toBeCloseTo(lost / 2, 6);
    expect(m.dmgOn?.b?.a).toBeCloseTo(lost / 2, 6); // conta na assistência
    expect(m.players.find((p) => p.id === 'b')!.stats.round.dmg).toBe(0);
    // não vira evento para o navegador
    expect(m.world!.events.some((e) => e.k === 'hit')).toBe(false);
  });

  it('sem golpe na janela, a lava não conta para ninguém', () => {
    const m = playing();
    const b = m.world!.wizards.find((z) => z.id === 'b')!;
    Object.assign(b, { lastHitBy: 'a', lastHitAt: m.world!.t - 6, pos: v(m.world!.arenaR + 2, 0) });
    steps(m, 30);
    expect(m.players.find((p) => p.id === 'a')!.stats.round.dmg).toBe(0);
    expect(m.players.find((p) => p.id === 'a')!.stats.round.dmgBy.lava).toBeUndefined();
  });

  it('a lava não solta o preso nem cura pelo Roubo de vida', () => {
    const m = playing();
    const [a, b] = ['a', 'b'].map((id) => m.world!.wizards.find((z) => z.id === id)!);
    Object.assign(a, { lifesteal: 0.5, hp: 500 });
    Object.assign(b, { lastHitBy: 'a', lastHitAt: m.world!.t, gripUntil: m.world!.t + 2, gripBonus: 0.3, pos: v(m.world!.arenaR + 2, 0) });
    const hpA = a.hp;
    steps(m, 30);
    expect(b.gripUntil).toBeGreaterThan(m.world!.t);
    expect(a.hp).toBeLessThan(hpA + 30 * 10 * DT); // só a regeneração normal
  });
});
