import { describe, expect, it } from 'vitest';
import { DELAY } from '../src/client/interp.ts';
import { REF, addRound, kOf, toSkill, type Profile } from '../src/client/mimic.ts';
import { BOT_SKILL } from '../src/shared/bots.ts';
import type { Stat } from '../src/shared/match.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';

// perfil com cada métrica no valor da dificuldade i do REF (0 = Fácil, 1 = Normal, 2 = Difícil); 100 de cada contagem
function profileAt(i: number, rtt = 0.05): Profile {
  return {
    n: 3, fired: 100, landed: REF.aim[i] * 100, alive: 6000 / REF.rate[i], threats: 100, struck: (1 - REF.dodge[i]) * 100,
    shieldable: 100, shielded: REF.shield[i] * 100, reactSum: (REF.react[i] + rtt + DELAY + 1 / 60) * 100, reactN: 100,
    nearSum: 500, nearN: 100, rtt,
  };
}
const stat = (o: Partial<Stat>): Stat => ({
  gold: 0, dmg: 0, kills: 0, dmgBy: {}, fired: {}, landed: {}, deaths: 0, deathBy: {}, alive: 0,
  threats: 0, struck: 0, shieldable: 0, shielded: 0, reactSum: 0, reactN: 0, nearSum: 0, nearN: 0, ...o,
});

describe('sombra', () => {
  it('kOf: Normal dá 0, além do Difícil dá 1, além do Fácil dá −1 (crescente e decrescente)', () => {
    expect(kOf(5, [8, 5, 2])).toBe(0);
    expect(kOf(1, [8, 5, 2])).toBe(1);
    expect(kOf(3.5, [8, 5, 2])).toBe(0.5);
    expect(kOf(9, [8, 5, 2])).toBe(-1);
    expect(kOf(0.9, [0.2, 0.4, 0.6])).toBe(1);
    expect(kOf(0.3, [0.2, 0.4, 0.6])).toBeCloseTo(-0.5);
    expect(kOf(0.1, [0.2, 0.2, 0.6])).toBe(0); // trecho sem largura: Normal
    for (const m of Object.keys(REF) as (keyof typeof REF)[]) expect(kOf(REF[m][1], REF[m])).toBe(0);
  });

  it('perfil igual ao REF de cada dificuldade devolve a força dela', () => {
    for (const [i, d] of [[0, 'easy'], [1, 'normal'], [2, 'hard']] as const) {
      const s = toSkill(profileAt(i))!;
      expect(Object.keys(s).sort()).toEqual(['aim', 'cast', 'delay', 'dodge', 'shield', 'waitMax', 'waitMin']);
      for (const [k, v] of Object.entries(s)) expect(v, `${d}.${k}`).toBeCloseTo(BOT_SKILL[d][k as keyof typeof s], 1);
    }
  });

  it('precisão maior dá mira mais justa (aim menor)', () => {
    const lo = profileAt(1);
    const hi = { ...lo, landed: (REF.aim[1] + (REF.aim[2] - REF.aim[1]) / 2) * 100 };
    expect(toSkill(hi)!.aim!).toBeLessThan(toSkill(lo)!.aim!);
  });

  it('perfil curto ou sem tiros suficientes devolve null; métrica sem dado fica de fora e o servidor aceita', () => {
    expect(toSkill(null)).toBeNull();
    expect(toSkill({ ...profileAt(1), n: 2 })).toBeNull();
    expect(toSkill({ ...profileAt(1), fired: 19, landed: 5 })).toBeNull();
    const s = toSkill({ ...profileAt(1), shieldable: 0, shielded: 0, reactN: 0, reactSum: 0, threats: 0, struck: 0 })!;
    expect(['shield', 'delay', 'dodge'].filter((k) => k in s)).toEqual([]);
    expect(Object.values(s).every(Number.isFinite)).toBe(true);
    expect(parseClientMessage(JSON.stringify({ t: 'start', bots: 1, setup: [{ skill: toSkill(profileAt(0)) }] }))).not.toBeNull();
  });

  it('addRound soma a rodada nova por cima das antigas com peso 0,9', () => {
    const a = addRound(null, stat({ fired: { fireball: 10, lightning: 4 }, landed: { fireball: 3 }, alive: 60, threats: 5 }), 0.1);
    expect(a).toMatchObject({ n: 1, fired: 10, landed: 3, alive: 60, threats: 5, rtt: 0.1 });
    const b = addRound(a, stat({ fired: { fireball: 20 }, alive: 30 }), 0.2);
    expect(b.n).toBe(2);
    expect(b.fired).toBeCloseTo(10 * 0.9 + 20);
    expect(b.landed).toBeCloseTo(3 * 0.9);
    expect(b.alive).toBeCloseTo(60 * 0.9 + 30);
    expect(b.threats).toBeCloseTo(5 * 0.9);
    expect(b.rtt).toBeCloseTo(0.1 * 0.9 + 0.2 * 0.1);
    // 3 rodadas com 20 Bolas de fogo bastam
    expect(toSkill(addRound(b, stat({ fired: { fireball: 5 }, alive: 30 }), 0.1))).not.toBeNull();
  });
});
