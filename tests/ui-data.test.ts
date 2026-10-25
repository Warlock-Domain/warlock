import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../src/shared/items.ts';
import { SPELLS, SPELL_IDS, type Level } from '../src/shared/spells.ts';
import { ITEM_GROUPS, RULES_SHORT, SPELL_GROUPS, SPELL_USE } from '../src/client/rules-text.ts';
import { ITEM_ROWS, SPELL_ROWS } from '../src/client/tips.ts';
import { ICON, ITEM_ICON, STATUS_ICONS } from '../src/client/icons.ts';
import { botLevel, endResult, playerName, roomGroups, seatChanges } from '../src/client/screen-data.ts';
import type { PublicPlayer, PublicRoom, RoomInfo } from '../src/shared/protocol.ts';

describe('shop: data for choosing', () => {
  it('puts every spell in exactly one group, with a purpose and a description', () => {
    const grouped = SPELL_GROUPS.flatMap(([, , ids]) => ids);
    expect([...grouped].sort()).toEqual([...SPELL_IDS].sort());
    for (const s of SPELL_IDS) {
      expect(SPELL_USE[s]).toBeTruthy();
      expect(RULES_SHORT[s]).toBeTruthy();
    }
  });

  it('puts every passive item in exactly one shop section', () => {
    const grouped = ITEM_GROUPS.flatMap(([, , ids]) => ids);
    expect([...grouped].sort()).toEqual([...ITEM_IDS].sort()); // no active items (#236): every item is passive
  });

  it('shows a tip row for every level field that is not zero', () => {
    // projectile speed is not shown in the tip; any other field the spell has must change some row
    const fields = (Object.keys(SPELLS.fireball.levels[0]) as (keyof Level)[]).filter((f) => f !== 'speed');
    for (const s of SPELL_IDS) {
      const l = SPELLS[s].levels[0];
      for (const f of fields) {
        if (!l[f]) continue;
        const bumped = { ...l, [f]: l[f] * 2 + 1 };
        const changed = SPELL_ROWS[s].some(([, show]) => show(l) !== show(bumped));
        expect(changed, `${s}.${f} has no tip row`).toBe(true);
      }
    }
  });

  it('has tip rows for every item', () => {
    for (const i of ITEM_IDS) expect(ITEM_ROWS[i]?.(0).length, i).toBeGreaterThan(0);
  });

  it('gives every spell and item its own icon', () => {
    const all = [...Object.values(ICON), ...Object.values(ITEM_ICON)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives every status effect its own icon', () => {
    const icons = STATUS_ICONS.map(([, ico]) => ico);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe('screens: match end and room list', () => {
  const p = (id: string, score = 0, team: number | null = null) => ({ id, score, team }) as PublicPlayer;
  const room = (over: Partial<PublicRoom>) => ({ players: [p('a', 5), p('b', 2)], winner: 'a', winnerTeam: null, mode: 'rounds', goal: 5, ...over }) as PublicRoom;

  it('says Vitória to the winner, Derrota to the others and nothing to spectators', () => {
    expect(endResult(room({}), 'a')).toBe('win');
    expect(endResult(room({}), 'b')).toBe('loss');
    expect(endResult(room({}), 'x')).toBe('none');
    expect(endResult(room({ winner: null }), 'a')).toBe('none');
  });

  it('counts the whole team and every champion of shuffled teams', () => {
    const players = [p('a', 5, 0), p('b', 5, 0), p('c', 3, 1)];
    expect(endResult(room({ mode: 'teams', players, winnerTeam: 0 }), 'b')).toBe('win');
    expect(endResult(room({ mode: 'teams', players, winnerTeam: 0 }), 'c')).toBe('loss');
    // shuffled teams: two reached the goal together; the server marks only one as winner
    expect(endResult(room({ mode: 'teams', players, winner: 'a' }), 'b')).toBe('win');
  });

  it('lists waiting rooms first and keeps empty rooms apart', () => {
    const r = (id: string, phase: string, players = 1) => ({ id, phase, players }) as RoomInfo;
    const { live, empty } = roomGroups([r('PLAY', 'playing'), r('VAZI', 'lobby', 0), r('ENDD', 'end'), r('WAIT', 'lobby'), r('SHOP', 'shop')]);
    expect(live.map((x) => x.id)).toEqual(['WAIT', 'ENDD', 'PLAY', 'SHOP']);
    expect(empty.map((x) => x.id)).toEqual(['VAZI']);
  });
});

describe('bot in place of a disconnected player (issue #223)', () => {
  type Seat = Parameters<typeof botLevel>[0];
  const seat = (id: string, extra: Partial<Seat> = {}): Seat => ({ id, name: id.toUpperCase(), bot: false, connected: true, ...extra });
  const room = { opts: { difficulty: 'veteran' } } as Pick<PublicRoom, 'opts'>;

  it('shows a bot its own difficulty (or the match one); a disconnected player becomes a match bot; players and spectators do not', () => {
    expect(botLevel(seat('b', { bot: true, difficulty: 'easy' }), room)).toBe('easy');
    expect(botLevel(seat('b', { bot: true }), room)).toBe('veteran');
    expect(botLevel(seat('a', { connected: false }), room)).toBe('veteran');
    expect(botLevel(seat('a'), room)).toBeNull();
    expect(botLevel(seat('w', { connected: false, watch: true }), room)).toBeNull();
  });

  it('marks on screen only the disconnected player the bot is controlling', () => {
    expect(playerName(seat('a'))).toBe('A');
    expect(playerName(seat('a', { connected: false }))).toBe('A (BOT)');
    expect(playerName(seat('bot-1', { bot: true, connected: false }))).toBe('BOT-1');
    expect(playerName(seat('w', { connected: false, watch: true }))).toBe('W');
  });

  // the overhead label of an existing wizard is refreshed from this name every frame (issue #367)
  it('round-trips the marker on one seat (bot takes over, then the player reconnects) without changing the stored name', () => {
    const a = seat('a');
    a.connected = false;
    expect(playerName(a)).toBe('A (BOT)');
    a.connected = true;
    expect(playerName(a)).toBe('A');
    expect(a.name).toBe('A');
  });

  it('finds who left and who came back between two room states, ignoring bots, spectators and newcomers', () => {
    const prev = { players: [seat('a'), seat('b', { connected: false }), seat('c'), seat('bot-1', { bot: true }), seat('w', { watch: true })] };
    const next = { players: [seat('a', { connected: false }), seat('b'), seat('c'), seat('bot-1', { bot: true, connected: false }), seat('w', { watch: true, connected: false }), seat('novo', { connected: false })] };
    const { left, back } = seatChanges(prev, next);
    expect(left.map((p) => p.id)).toEqual(['a']);
    expect(back.map((p) => p.id)).toEqual(['b']);
  });
});
