import { describe, expect, it } from 'vitest';
import { addPlayer, buyItem, newMatch, sell, setReady, startMatch, tickMatch, undoBuy } from '../src/shared/match.ts';
import { ITEM_IDS, MAX_ITEMS } from '../src/shared/items.ts';
import { MAX_SPELLS, SPELL_IDS } from '../src/shared/spells.ts';
import { addRecord, addResourceSample, emptyTotals, RESOURCE_SAMPLE_MAX, roundRecord, styleRows } from '../src/shared/telemetry.ts';
import { kill, toPlaying, until } from './helpers.ts';

describe('dados de balanceamento', () => {
  it('keeps only a bounded tail of resource samples', () => {
    const samples = Array.from({ length: RESOURCE_SAMPLE_MAX }, (_, i) => ({
      at: i, session: '12345678-1234-1234-1234-123456789abc', build: 'dev', mode: 'rounds' as const,
      round: 1, players: 2, projectiles: 0, geometries: 10, textures: 5,
    }));
    addResourceSample(samples, { ...samples[0], at: RESOURCE_SAMPLE_MAX });
    expect(samples).toHaveLength(RESOURCE_SAMPLE_MAX);
    expect(samples[0].at).toBe(1);
    expect(samples.at(-1)?.at).toBe(RESOURCE_SAMPLE_MAX);
  });

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

  it('records round economy context and reconciles earned, spent, refunded, and recovery gold', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0, 'rounds', true, Math.random, { economy: 1.5 });
    const a = m.players[0];
    expect(buyItem(m, 'a', 'armor')).toBe(true);
    expect(undoBuy(m, 'a', 'item:armor')).toBe(true);
    expect(buyItem(m, 'a', 'armor')).toBe(true);
    expect(sell(m, 'a', 'item:armor')).toBe(true);
    expect(buyItem(m, 'a', 'armor')).toBe(true);

    let now = toPlaying(m, 0);
    kill(m, 'b', null);
    now = until(m, now, () => m.phase === 'roundEnd');
    const record = roundRecord(m, now);
    const winner = record.players[0];
    const loser = record.players[1];

    expect(record).toMatchObject({ round: 1, economy: 1.5, startGold: 30 });
    expect(winner.gold?.start).toBe(45);
    expect(winner.gold?.spent).toBe(18); // o multiplicador da sala não altera o preço das compras
    expect(winner.gold?.refunded).toBe(12); // desfazer e vender devolvem uma compra cada
    expect(winner.gold?.earned).toBeGreaterThan(0);
    expect(loser.gold?.recovery).toBeGreaterThan(0);
    for (const p of record.players) {
      expect(p.gold?.end).toBe(p.gold!.start + p.gold!.earned - p.gold!.spent + p.gold!.refunded);
    }
  });

  it('keeps 200 worst-case eight-player telemetry records below the 2 MB storage limit', () => {
    const m = newMatch();
    for (let i = 0; i < 8; i++) addPlayer(m, `p${i}`, `Player ${i}`);
    startMatch(m, 0, 0);
    const activeSpells = SPELL_IDS.slice(0, MAX_SPELLS);
    const sources = [...activeSpells, 'lava', 'shock', 'wall'];
    for (const p of m.players) {
      p.stats.round.dmgBy = Object.fromEntries(sources.map((s) => [s, 1000]));
      p.stats.round.fired = Object.fromEntries(activeSpells.map((s) => [s, 100]));
      p.stats.round.landed = Object.fromEntries(activeSpells.map((s) => [s, 50]));
      for (const s of activeSpells) p.spells[s] = 7;
      for (const i of ITEM_IDS.slice(0, MAX_ITEMS)) p.items[i] = 6;
    }
    const record = roundRecord(m, 1);
    const owned = Object.fromEntries([...SPELL_IDS.map((s) => [`spell:${s}`, { rounds: 200, wins: 100 }]), ...ITEM_IDS.map((i) => [`item:${i}`, { rounds: 200, wins: 100 }])]);
    const totals = { rounds: 200, sources: Object.fromEntries(sources.map((s) => [s, { fired: 800, landed: 400, dmg: 8000 }])), owned, recent: Array.from({ length: 200 }, () => record) };
    expect(new TextEncoder().encode(JSON.stringify(totals)).length).toBeLessThan(2_000_000);
  });

  it('accepts older round records without the economy fields', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    const old = roundRecord(m, 1);
    delete old.round;
    delete old.economy;
    delete old.startGold;
    for (const p of old.players) delete p.gold;

    const totals = addRecord(emptyTotals(), old);
    expect(totals.recent[0]).toEqual(old);
    expect(styleRows(totals)).toHaveLength(2);
  });
});
