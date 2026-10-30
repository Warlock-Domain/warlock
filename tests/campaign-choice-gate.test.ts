import { describe, expect, it } from 'vitest';
import { addPlayer, campaignPickers, newMatch, nightPick, startMatch, tickMatch } from '../src/shared/match.ts';
import { nightMap } from '../src/shared/levels.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { SPELL_IDS, spellMax } from '../src/shared/spells.ts';
import { publicId, publicRoom } from '../src/shared/protocol.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { STEP_MS, toPlaying } from './helpers.ts';

function party() {
  const m = newMatch(); m.mode = 'campaign';
  addPlayer(m, 'a', 'Alice'); addPlayer(m, 'b', 'Bob');
  startMatch(m, 0, 0, 'campaign', true, mulberry32(7));
  let now = toPlaying(m, 0, mulberry32(2));
  const map = nightMap(m.night!.seed, m.night!.stage), mark = map.marks.find(c => c.kind === 'checkpoint' && c.room === 0)!;
  m.world!.wizards.find(z => z.id === 'b')!.pos = { x: mark.x + 1, y: mark.y + .5 };
  m.night!.offer = { a: [{ kind: 'up', id: 'fireball' }], b: [{ kind: 'up', id: 'fireball' }] };
  m.night!.owed = { a: 1, b: 1 };
  return { m, tick: () => tickMatch(m, now += STEP_MS, [], () => .5) };
}

describe('Campaign encounter choice gate', () => {
  it('waits for both players without hiding their offers or freezing exploration', () => {
    const { m, tick } = party(), start = m.world!.t, pos = { ...m.world!.wizards[0].pos };
    tick();
    expect(m.night!.fight).toBeNull(); expect(m.world!.wizards[0].pos).toEqual(pos);
    expect(m.world!.t).toBeGreaterThan(start); expect(campaignPickers(m).map(p => p.id)).toEqual(['a', 'b']);
    expect(nightPick(m, 'a', 0)).toBe(true); tick();
    expect(m.night!.fight).toBeNull(); expect(campaignPickers(m).map(p => p.id)).toEqual(['b']);
    expect(nightPick(m, 'b', 0)).toBe(true); tick();
    expect(m.night!.fight).not.toBeNull(); expect(campaignPickers(m)).toEqual([]);
    for (const z of m.world!.wizards.filter(z => z.team === 0)) expect(z.spells.fireball).toBe(2);
  });
  it('waits for every owed reward, not just the first visible row', () => {
    const { m, tick } = party(); m.night!.owed!.a = 2;
    expect(nightPick(m, 'b', 0)).toBe(true); expect(nightPick(m, 'a', 0)).toBe(true);
    tick(); expect(m.night!.fight).toBeNull(); expect(m.night!.offer!.a.length).toBeGreaterThan(0);
    expect(m.night!.owed!.a).toBe(1); expect(nightPick(m, 'a', 0)).toBe(true);
    tick(); expect(m.night!.fight).not.toBeNull();
  });
  it.each(['disconnected', 'watching', 'bot'] as const)('does not block the group on a %s player', kind => {
    const { m, tick } = party(), p = m.players.find(p => p.id === 'a')!;
    if (kind === 'disconnected') p.connected = false;
    if (kind === 'watching') p.watch = true;
    if (kind === 'bot') p.bot = true;
    expect(campaignPickers(m).map(p => p.id)).toEqual(['b']);
    expect(nightPick(m, 'b', 0)).toBe(true); tick(); expect(m.night!.fight).not.toBeNull();
  });
  it('includes fallen connected participants because they can still choose', () => {
    const { m, tick } = party(); m.world!.wizards.find(z => z.id === 'a')!.alive = false;
    expect(nightPick(m, 'b', 0)).toBe(true); tick();
    expect(m.night!.fight).toBeNull(); expect(campaignPickers(m).map(p => p.id)).toEqual(['a']);
    expect(nightPick(m, 'a', 0)).toBe(true); tick(); expect(m.night!.fight).not.toBeNull();
  });
  it('clears exhausted reward pools before testing the encounter gate', () => {
    const { m, tick } = party(), p = m.players.find(p => p.id === 'a')!;
    for (const s of SPELL_IDS) p.spells[s] = spellMax(s);
    delete m.night!.offer!.a;
    expect(nightPick(m, 'b', 0)).toBe(true); tick();
    expect(m.night!.owed!.a).toBe(0); expect(m.night!.fight).not.toBeNull();
  });
  it('publishes only pending public ids and strictly validates the notice state', () => {
    const { m, tick } = party(); tick();
    const room = publicRoom('ABCD', m, 10000), you = publicId('ABCD', 'a');
    expect(room.choosing).toEqual(['a', 'b'].map(id => publicId('ABCD', id)));
    expect(parseServerMessage({ t: 'room', room, you })).not.toBeNull();
    for (const choosing of [['a'], [you, you], ['unknown'], [7]]) expect(parseServerMessage({ t: 'room', room: { ...room, choosing }, you })).toBeNull();
    expect(parseServerMessage({ t: 'room', room: { ...room, night: { ...room.night!, fight: 0 } }, you })).toBeNull();
    nightPick(m, 'a', 0); nightPick(m, 'b', 0); tick();
    expect(publicRoom('ABCD', m, 10001).choosing).toBeUndefined();
  });
});
