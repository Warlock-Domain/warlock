import { describe, expect, it } from 'vitest';
import { DT, KILL_GOLD, LAVA_DPS, NO_MODS, ROUND_EFFECT_IDS, roundMods, type RoundEffectId } from '../src/shared/constants.ts';
import { addPlayer, newMatch, startMatch, type Match } from '../src/shared/match.ts';
import { publicRoom } from '../src/shared/protocol.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { kill, toPlaying, until, world } from './helpers.ts';

// partida só de bots já na rodada 1 (o mundo da rodada existe a partir da contagem)
const firstRound = (bots: number, sandbox = false): { m: Match; now: number } => {
  const m = newMatch();
  startMatch(m, 0, bots, 'rounds', true, () => 0.3, {}, [], sandbox);
  return { m, now: toPlaying(m, 0) };
};

describe('efeitos de rodada', () => {
  it('cada efeito muda só o seu multiplicador; sem efeito tudo fica em 1', () => {
    expect(roundMods(null)).toEqual(NO_MODS);
    expect(roundMods('lava')).toEqual({ ...NO_MODS, lava: 0.5 });
    expect(roundMods('gold')).toEqual({ ...NO_MODS, killGold: 1.5 });
    expect(roundMods('slow')).toEqual({ ...NO_MODS, slow: 0.8 });
    expect(roundMods('regen')).toEqual({ ...NO_MODS, regen: 1.3 });
  });

  it('Lava amena: a lava tira metade da vida', () => {
    const burn = (effect: RoundEffectId | null) => {
      const w = world([[30, 0], [0, 0]], noSpells());
      w.mods = roundMods(effect);
      const a = w.wizards[0], before = a.hp;
      stepWorld(w, []);
      return before - a.hp;
    };
    expect(burn(null)).toBeCloseTo(LAVA_DPS * DT);
    expect(burn('lava')).toBeCloseTo((LAVA_DPS * DT) / 2);
  });

  it('Fonte da vida: a vida volta 30% mais rápido', () => {
    const heal = (effect: RoundEffectId | null) => {
      const w = world([[0, 0], [3, 0]], noSpells());
      w.mods = roundMods(effect);
      w.wizards[0].hp = 500;
      stepWorld(w, []);
      return w.wizards[0].hp - 500;
    };
    expect(heal('regen')).toBeCloseTo(heal(null) * 1.3);
  });

  it('Caçada: o abate paga 50% a mais, com a parte quebrada guardada', () => {
    const gain = (effect: RoundEffectId | null) => {
      const m = newMatch();
      for (const id of ['a', 'b', 'c']) addPlayer(m, id, id); // 3 magos: o abate não encerra a rodada (sem ouro de vitória no meio)
      startMatch(m, 0, 0);
      const now = toPlaying(m, 0);
      m.world!.mods = roundMods(effect);
      const killer = m.players[0], before = killer.gold;
      kill(m, 'b', 'a');
      until(m, now, () => !m.world!.wizards[1].alive, 600);
      return { gold: killer.gold - before, carry: killer.goldCarry ?? 0 };
    };
    expect(gain(null).gold).toBe(KILL_GOLD);
    expect(gain('gold')).toEqual({ gold: Math.floor(KILL_GOLD * 1.5), carry: KILL_GOLD * 1.5 - Math.floor(KILL_GOLD * 1.5) });
  });

  it('a partida sorteia um efeito por rodada e o manda para o navegador; a sandbox fica sem', () => {
    const { m } = firstRound(2);
    expect(ROUND_EFFECT_IDS).toContain(m.world!.effect);
    expect(m.world!.mods).toEqual(roundMods(m.world!.effect));
    expect(publicRoom('x', m, 0).effect).toBe(m.world!.effect);
    const { m: s } = firstRound(1, true);
    expect(s.world!.effect).toBeNull();
    expect(s.world!.mods).toEqual(NO_MODS);
  });
});
