import { describe, expect, it } from 'vitest';
import {
  isSummary,
  mergeSummaries,
  type Summary,
} from '../scripts/balance-summary.ts';

const summary = (overrides: Partial<Summary> = {}): Summary => ({
  seed: '1',
  plan: 'random',
  difficulty: 'normal',
  arena: 'random',
  effect: 'off',
  startedAt: '2026-10-24T10:00:00.000Z',
  seconds: 10,
  roundsPerMin: 6,
  matches: 1,
  rounds: 1,
  playerRounds: 2,
  noWinner: 0,
  stalled: 0,
  modes: { solo: 1 },
  sizes: { '2': 1 },
  duration: { sum: 10, by10s: { '10': 1 } },
  owned: {
    'spell:fireball': {
      n: 2,
      wins: 1,
      exp: 0.5,
      dmg: 20,
      kills: 1,
      deaths: 0,
      alive: 1,
      gold: 50,
      by: { all: { '0': { n: 2, w: 1, e: 0.5 } } },
    },
  },
  sources: { fireball: { fired: 2, landed: 1, dmg: 20 } },
  deathBy: { fireball: 1 },
  arenaDur: { circle: { rounds: 1, sum: 10 } },
  botMatches: 1,
  picked: { fireball: 2 },
  ...overrides,
});

describe('validação e junção dos resumos de balanceamento', () => {
  it('aceita um resumo completo e rejeita campos desconhecidos', () => {
    expect(isSummary(summary())).toBe(true);
    expect(isSummary({ ...summary(), obsolete: 1 })).toBe(false);
  });

  it('rejeita valores malformados em agregações aninhadas', () => {
    const malformed = summary();
    (malformed.owned['spell:fireball'] as { wins: unknown }).wins = 'one';
    expect(isSummary(malformed)).toBe(false);
  });

  it('soma métricas, junta sementes e preserva duração máxima e início mais antigo', () => {
    const first = summary({
      seed: '1',
      startedAt: '2026-10-24T10:00:00.000Z',
      seconds: 20,
    });
    const second = summary({
      seed: '2',
      startedAt: '2026-10-24T09:00:00.000Z',
      seconds: 10,
      owned: {
        'spell:fireball': {
          ...summary().owned['spell:fireball'],
          by: { all: { '10': { n: 1, w: 1, e: 1 } } },
        },
      },
      sources: {
        fireball: { fired: 2, landed: 1, dmg: 20 },
        lightning: { fired: 1, landed: 1, dmg: 5 },
      },
    });

    const merged = mergeSummaries([first, second]);

    expect(merged.seed).toBe('1, 2');
    expect(merged.rounds).toBe(2);
    expect(merged.owned['spell:fireball'].n).toBe(4);
    expect(merged.owned['spell:fireball'].by?.all['0'].n).toBe(2);
    expect(merged.owned['spell:fireball'].by?.all['10'].n).toBe(1);
    expect(merged.sources.lightning).toEqual({ fired: 1, landed: 1, dmg: 5 });
    expect(merged.seconds).toBe(20);
    expect(merged.startedAt).toBe('2026-10-24T09:00:00.000Z');
  });

  it('não altera o resumo original ao juntar uma única execução', () => {
    const input = summary({ seconds: 20 });

    const merged = mergeSummaries([input]);

    expect(merged).not.toBe(input);
    expect(merged.seconds).toBe(20);
    expect(input.seconds).toBe(20);
  });

  it('rejeita resumos com configurações incompatíveis e entrada vazia', () => {
    expect(() =>
      mergeSummaries([summary(), summary({ plan: 'smart' })]),
    ).toThrow(/plan diferentes/);
    expect(() => mergeSummaries([])).toThrow(/ao menos uma pasta/);
  });
});
