import { describe, expect, it } from 'vitest';
import { CAMPAIGN, NIGHT_XP, STAGES, SERVOS, nightCards, nightCount, nightLevel, nightXpAt, xpShare } from '../src/shared/campaign.ts';
import { STAGE_ROOMS, fightOf, nightMap, type NightMap } from '../src/shared/levels.ts';
import { addPlayer, newMatch, nightPick, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { parseClientMessage, publicRoom } from '../src/shared/protocol.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { MAX_SPELLS, noSpells } from '../src/shared/spells.ts';
import { noItems } from '../src/shared/items.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { v } from '../src/shared/vec.ts';
import { STEP_MS, toPlaying } from './helpers.ts';

function night(humans: string[], seed = 1): Match {
  const m = newMatch();
  for (const id of humans) addPlayer(m, id, id);
  startMatch(m, 0, 0, 'campaign', true, mulberry32(seed));
  return m;
}
const mapOf = (m: Match): NightMap => nightMap(m.night!.seed, m.night!.stage);
const wiz = (m: Match, id: string) => m.world!.wizards.find((z) => z.id === id)!;
const foes = (m: Match) => m.world!.wizards.filter((z) => z.team === 1);
const step = (m: Match, now: number, n = 1) => {
  for (let i = 0; i < n; i++) tickMatch(m, (now += STEP_MS), [], () => 0.5);
  return now;
};
const shelter = (m: Match) => {
  for (const z of m.world!.wizards) if (z.team === 0) z.invulnUntil = 1e9;
};
const killFoes = (m: Match, now: number) => {
  for (const z of foes(m)) if (z.alive) Object.assign(z, { hp: -1, invulnUntil: 0, lastHitBy: 'a', lastHitAt: m.world!.t });
  return step(m, now);
};
// opens the entrance encounter (the first one of the night) by stepping on its checkpoint
function openEntrance(m: Match, now: number): { now: number; room: number } {
  const n = mapOf(m), room = n.rooms.findIndex((r) => r.room.pool === 'entrada');
  const c = n.marks.find((q) => q.room === room && q.kind === 'checkpoint')!;
  shelter(m);
  wiz(m, 'a').pos = v(c.x + 1, c.y + 0.5);
  return { now: step(m, now), room };
}

describe('Campanha: progressão da noite', () => {
  it('a bigger group brings more of the same servants; the extras wait for a slot and the wave lasts until they fall', () => {
    const m = night(['a', 'b', 'c']);
    let now = toPlaying(m, 0);
    const opened = openEntrance(m, now);
    now = opened.now;
    const wave = fightOf(mapOf(m), opened.room, m.night!.seed, 0).waves[0];
    const total = nightCount(wave.length, 3);
    expect(total).toBeGreaterThan(wave.length);
    expect(foes(m).filter((z) => z.alive).length).toBe(CAMPAIGN.slots);
    expect(m.night!.queue!.length).toBe(total - CAMPAIGN.slots);
    // a twin of a servant spawns beside it, not on the same spot
    const spots = foes(m).filter((z) => z.alive).map((z) => `${z.pos.x.toFixed(3)},${z.pos.y.toFixed(3)}`);
    expect(new Set(spots).size).toBe(spots.length);
    // one falls: a queued servant takes the slot at its E in the same step, and the encounter stays open
    const first = foes(m).find((z) => z.alive)!;
    Object.assign(first, { hp: -1, invulnUntil: 0 });
    now = step(m, now);
    expect(foes(m).filter((z) => z.alive).length).toBe(CAMPAIGN.slots);
    expect(m.night!.queue!.length).toBe(total - CAMPAIGN.slots - 1);
    for (let i = 0; i < 5 && m.night!.fight !== null; i++) now = killFoes(m, now);
    expect(m.night!.fight).toBe(null);
    expect(m.night!.queue).toEqual([]);
  });

  it('every fallen servant gives each Aceso the split XP, fallen Acesos too', () => {
    const m = night(['a', 'b']);
    let now = toPlaying(m, 0);
    now = openEntrance(m, now).now;
    Object.assign(wiz(m, 'b'), { hp: -1, invulnUntil: 0 });
    wiz(m, 'b').ember = { prog: 0, need: 99, since: 0 };
    const kind = m.players.find((p) => p.id === foes(m).find((z) => z.alive)!.id)!.servo!;
    Object.assign(foes(m).find((z) => z.alive)!, { hp: -1, invulnUntil: 0 });
    now = step(m, now);
    expect(m.night!.xp).toEqual({ a: xpShare(kind, 2), b: xpShare(kind, 2) });
    expect(xpShare('ash', 2)).toBe(Math.round((NIGHT_XP.servo.ash * 1.25) / 2));
  });

  it('the Charneca brings the group to level 5 before Sir Odran, whatever its size (Lucas, 24/10)', () => {
    for (const acesos of [1, 2, 3, 4]) {
      let xp = 0;
      for (const id of ['charneca-entrada-01', ...STAGES[0].order!]) {
        const room = STAGE_ROOMS[0].find((r) => r.id === id)!, f = room.fight!;
        for (const wave of f.waves) for (let k = 0; k < nightCount(wave.length, acesos); k++) xp += xpShare(wave[k % wave.length].kind, acesos);
        if (f.tombs) xp += nightCount(f.tombs.max, acesos) * xpShare(f.tombs.kind, acesos);
      }
      expect(nightLevel(xp), `${acesos} Acesos, ${xp} XP`).toBe(5);
    }
  });

  it('the 3 Ashen of the entrance already give a solo Aceso level 2 and its cards (Lucas, 25/10), in a group too', () => {
    const room = STAGE_ROOMS[0].find((r) => r.id === 'charneca-entrada-01')!;
    for (const acesos of [1, 2, 3, 4]) {
      const wave = room.fight!.waves[0];
      let xp = 0;
      for (let k = 0; k < nightCount(wave.length, acesos); k++) xp += xpShare(wave[k % wave.length].kind, acesos);
      expect(nightLevel(xp), `${acesos} Acesos, ${xp} XP`).toBe(2);
    }
    const m = night(['a']);
    let now = toPlaying(m, 0);
    now = openEntrance(m, now).now;
    for (let i = 0; i < 5 && m.night!.fight !== null; i++) now = killFoes(m, now);
    expect(m.night!.xp!.a).toBe(3 * NIGHT_XP.servo.ash);
    expect(m.night!.owed!.a).toBe(1);
    expect(m.night!.offer!.a.length).toBe(3);
  });

  it('the XP table: level 1 from 0, each level above the last step again', () => {
    expect([1, 2, 3].map(nightXpAt)).toEqual([0, NIGHT_XP.levels[0], NIGHT_XP.levels[1]]);
    const t = NIGHT_XP.levels, step = t[t.length - 1] - t[t.length - 2];
    expect(nightXpAt(t.length + 2)).toBe(t[t.length - 1] + step);
    expect(nightLevel(nightXpAt(4) - 1)).toBe(3);
    expect(nightLevel(nightXpAt(4))).toBe(4);
  });

  it('a level gained shows its cards only once the room is clear; the pick teaches the spell at once', () => {
    const m = night(['a']);
    let now = toPlaying(m, 0);
    now = openEntrance(m, now).now;
    m.night!.xp = { a: nightXpAt(2) }; // level 2 in the middle of the fight
    now = step(m, now);
    expect(m.night!.offer?.a).toBeUndefined();
    expect(nightPick(m, 'a', 0)).toBe(false);
    for (let i = 0; i < 5 && m.night!.fight !== null; i++) now = killFoes(m, now);
    expect(m.night!.fight).toBe(null);
    expect(m.night!.owed!.a).toBe(1);
    const offer = m.night!.offer!.a;
    expect(offer.length).toBe(3);
    expect(offer.filter((c) => c.kind === 'up').length).toBe(1); // Fireball or Scourge one level up
    expect(publicRoom('ROOM', m, now).players.find((p) => p.name === 'a')!.lv).toMatchObject({ level: 2, owed: 1, offer });
    const fresh = offer.find((c) => c.kind === 'spell')!;
    expect(nightPick(m, 'a', offer.indexOf(fresh))).toBe(true);
    expect(m.players.find((p) => p.id === 'a')!.spells[fresh.id]).toBe(1);
    expect(wiz(m, 'a').spells[fresh.id]).toBe(1);
    expect(m.night!.owed!.a).toBe(0);
    expect(m.night!.offer!.a).toBeUndefined();
    expect(nightPick(m, 'a', 0)).toBe(false);
    // the servants never get a table
    expect(publicRoom('ROOM', m, now).players.filter((p) => p.servo).every((p) => p.lv === undefined)).toBe(true);
  });

  it('two levels at once come one table at a time, so a spell is never offered twice', () => {
    const m = night(['a']);
    let now = toPlaying(m, 0);
    now = openEntrance(m, now).now;
    m.night!.xp = { a: nightXpAt(3) };
    for (let i = 0; i < 5 && m.night!.fight !== null; i++) now = killFoes(m, now);
    expect(m.night!.owed!.a).toBe(2);
    const first = m.night!.offer!.a, i = first.findIndex((c) => c.kind === 'spell');
    nightPick(m, 'a', i);
    now = step(m, now);
    expect(m.night!.offer!.a.some((c) => c.kind === 'spell' && c.id === first[i].id)).toBe(false);
  });

  it('a full bar only offers upgrades', () => {
    const spells = noSpells();
    const ids = Object.keys(spells) as (keyof typeof spells)[];
    for (const id of ids.slice(0, MAX_SPELLS)) spells[id] = 1;
    const cards = nightCards({ spells, items: noItems() }, mulberry32(3));
    expect(cards.length).toBe(1);
    expect(cards[0].kind).toBe('up');
  });

  it('nightCard message: only the card index 0 to 2', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'nightCard', i: 2 }))).toEqual({ t: 'nightCard', i: 2 });
    expect(parseClientMessage(JSON.stringify({ t: 'nightCard', i: 3 }))).toBe(null);
    expect(parseClientMessage(JSON.stringify({ t: 'nightCard', i: 1.5 }))).toBe(null);
  });

  it('the browser accepts the room with the night progress and refuses a bad card', () => {
    const m = night(['a']);
    let now = toPlaying(m, 0);
    now = openEntrance(m, now).now;
    m.night!.xp = { a: nightXpAt(2) };
    for (let i = 0; i < 5 && m.night!.fight !== null; i++) now = killFoes(m, now);
    const room = publicRoom('ROOM', m, now);
    expect(parseServerMessage(JSON.parse(JSON.stringify({ t: 'room', room, you: 'x' })))).not.toBe(null);
    const bad = JSON.parse(JSON.stringify({ t: 'room', room, you: 'x' }));
    bad.room.players.find((p: { lv?: unknown }) => p.lv).lv.offer = [{ kind: 'spell', id: 'nope' }];
    expect(parseServerMessage(bad)).toBe(null);
    expect(SERVOS.odran.boss).toBe(true);
  });
});
