import { describe, expect, it } from 'vitest';
import { CAMPAIGN_BOOK, retune } from '../src/shared/campaign.ts';
import { HP_MAX } from '../src/shared/constants.ts';
import { addPlayer, newMatch, startMatch, type Match } from '../src/shared/match.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { SPELLS, SPELL_IDS, noSpells, spellLevel, type SpellBook } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { reachOf } from '../src/client/reach.ts';
import { sheet } from '../src/client/sheet.ts';
import { spellTip } from '../src/client/tips.ts';
import { noItems } from '../src/shared/items.ts';
import { run, toPlaying, world } from './helpers.ts';

// p0 casts Fireball at p1 (an enemy) 3 m away
function shot(book?: SpellBook): number {
  const w = world([[0, 0], [3, 0]], noSpells(), [], () => 0.5, false, [0, 1]);
  w.book = book;
  w.wizards[1].regen = 0;
  run(w, 2, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
  return HP_MAX - w.wizards[1].hp;
}

describe('Campaign spells kept apart from the other modes', () => {
  it('a book changes the spell only in the world that carries it', () => {
    const before = JSON.stringify(SPELLS);
    const strong: SpellBook = { fireball: retune('fireball', (l) => ({ ...l, dmg: l.dmg * 2 })) };
    expect(shot(strong)).toBeCloseTo(2 * shot(), 5);
    expect(shot()).toBeCloseTo(spellLevel('fireball', 1).dmg, 5);
    expect(JSON.stringify(SPELLS)).toBe(before); // the shared table does not change
  });

  it('every spell cast reads its cooldown from the book', () => {
    const slow: SpellBook = Object.fromEntries(SPELL_IDS.map((s) => [s, retune(s, (l) => ({ ...l, cd: 99 }))]));
    for (const s of SPELL_IDS) {
      const w = world([[0, 0], [3, 0]], { ...noSpells(), [s]: 1 }, [], () => 0.5, false, [0, 1]);
      w.book = slow;
      if (s === 'closedbody') Object.assign(w.wizards[0], { braceReadyAt: w.t, braceUntil: w.t + 9 }); // Closed body needs an active Hold ground
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell: s, at: s === 'heal' ? v(0, 0) : v(3, 0) }]); // Heal targets the caster or an ally
      for (let i = 0; i < 60; i++) stepWorld(w, []); // 1 s: covers the longest windup (Scourge, 0.5 s)
      expect(w.wizards[0].cd[s] - w.t, s).toBeGreaterThan(90);
    }
  });

  it('only the Campaign world carries the Campaign book', () => {
    const match = (mode: 'rounds' | 'deathmatch' | 'teams' | 'campaign', sandbox = false): Match => {
      const m = Object.assign(newMatch(), { mode }); // a Campaign match needs a Campaign room
      addPlayer(m, 'a', 'a');
      startMatch(m, 0, mode === 'campaign' ? 0 : 1, mode, true, mulberry32(1), {}, [], sandbox);
      toPlaying(m, 0);
      return m;
    };
    for (const mode of ['rounds', 'deathmatch', 'teams'] as const) expect(match(mode).world!.book, mode).toBeUndefined();
    expect(match('rounds', true).world!.book).toBeUndefined(); // sandbox
    expect(match('campaign').world!.book).toBe(CAMPAIGN_BOOK);
  });

  it('retune never touches the shared table, even when the change mutates the level', () => {
    const before = JSON.stringify(SPELLS);
    retune('fireball', (l) => Object.assign(l, { cd: 1 }));
    expect(JSON.stringify(SPELLS)).toBe(before);
  });

  it('the Campaign book has the 7 levels of every spell it changes', () => {
    for (const [s, levels] of Object.entries(CAMPAIGN_BOOK)) expect(levels!.length, s).toBe(SPELLS[s as keyof typeof SPELLS].levels.length);
  });

  it('the screens show the numbers of the book (tooltip, sheet, range circle)', () => {
    const far: SpellBook = { lightning: retune('lightning', (l) => ({ ...l, range: 20, dmg: 777 })) };
    const spells = { ...noSpells(), lightning: 1 };
    expect(reachOf('lightning', spells, noItems(), far)).toBeCloseTo(20);
    expect(spellTip('lightning', 1, far)).toContain('777');
    expect(spellTip('lightning', 1)).not.toContain('777');
    expect(sheet(spells, noItems(), far).some((r) => r.value.includes('777'))).toBe(true);
  });

  it('no game code reads the spell table around the book', () => {
    // spell numbers in the simulation come from spellLevel(id, level, w.book); reading SPELLS[...] directly would skip the Campaign
    const files = import.meta.glob<string>(['../src/shared/*.ts', '../src/worker/*.ts', '!../src/shared/spells.ts', '!../src/shared/campaign.ts'], { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(files).length).toBeGreaterThan(10);
    for (const [f, src] of Object.entries(files)) expect(src, f).not.toMatch(/SPELLS(\[|\.\w+\.levels)/);
  });
});
