import { describe, expect, it } from 'vitest';
import { addPlayer, newMatch, setReady, startMatch, tickMatch } from '../src/shared/match.ts';
import { addRecord, emptyTotals, roundRecord } from '../src/shared/telemetry.ts';

describe('dados de balanceamento', () => {
  it('a played round adds usage, damage by source and ownership with wins', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    startMatch(m, 0, 3);
    setReady(m, 'a');
    let now = 0;
    // bots jogam até a rodada acabar
    for (let i = 0; i < 60 * 240 && m.phase !== 'roundEnd'; i++) tickMatch(m, (now += 1000 / 60), [], Math.random);
    expect(m.phase).toBe('roundEnd');
    const t = addRecord(emptyTotals(), roundRecord(m, now));
    expect(t.rounds).toBe(1);
    expect(t.sources.fireball.fired).toBeGreaterThan(0);
    expect(t.owned['spell:fireball'].rounds).toBe(4);
    expect(t.owned['spell:fireball'].wins).toBe(1);
    expect(t.recent.length).toBe(1);
  });
});
