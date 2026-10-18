import { describe, expect, it } from 'vitest';
import { coachTip, type CoachState } from '../src/client/coach.ts';

const base: CoachState = { phase: 'playing', round: 1, playingFor: 20, shrinkIn: 12, low: false, lava: false, alive: true, touch: false, fireKey: 'Q' };

describe('modo treino: dicas', () => {
  it('teaches walking, then shooting with the current key, then stays quiet', () => {
    expect(coachTip({ ...base, playingFor: 2 })).toMatch(/andar/);
    expect(coachTip({ ...base, playingFor: 8, fireKey: 'E' })).toMatch(/Use E para atirar/);
    expect(coachTip(base)).toBeNull();
  });

  it('puts the urgent tip first: lava over border over low life', () => {
    expect(coachTip({ ...base, lava: true, low: true, shrinkIn: 2 })).toMatch(/lava/);
    expect(coachTip({ ...base, low: true, shrinkIn: 2 })).toMatch(/borda vermelha/);
    expect(coachTip({ ...base, low: true })).toMatch(/Vida baixa/);
    expect(coachTip({ ...base, alive: false, lava: true })).toMatch(/Você caiu/);
  });

  it('asks to buy in the shop and stops after the first rounds', () => {
    expect(coachTip({ ...base, phase: 'shop', round: 0 })).toMatch(/Compre uma magia nova/);
    expect(coachTip({ ...base, phase: 'shop', round: 4 })).toBeNull();
    expect(coachTip({ ...base, round: 4, lava: true })).toBeNull();
  });

  it('speaks of touching on a phone', () => {
    expect(coachTip({ ...base, playingFor: 8, touch: true })).toMatch(/Toque/);
  });
});
