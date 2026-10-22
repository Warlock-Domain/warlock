import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../src/shared/items.ts';
import { SPELLS, SPELL_IDS, type Level } from '../src/shared/spells.ts';
import { ITEM_GROUPS, RULES_SHORT, SPELL_GROUPS, SPELL_USE } from '../src/client/rules-text.ts';
import { ITEM_ROWS, SPELL_ROWS } from '../src/client/tips.ts';
import { ICON, ITEM_ICON, STATUS_ICONS } from '../src/client/icons.ts';
import { endResult, roomGroups } from '../src/client/screen-data.ts';
import type { PublicPlayer, PublicRoom, RoomInfo } from '../src/shared/protocol.ts';

describe('loja: dados para decidir', () => {
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
    expect([...grouped].sort()).toEqual([...ITEM_IDS].sort()); // sem itens ativos (#236): todo item é passivo
  });

  it('shows a tip row for every level field that is not zero', () => {
    // velocidade do projétil não aparece na dica; o resto, se existe na magia, tem de mexer em alguma linha
    const fields = (Object.keys(SPELLS.fireball.levels[0]) as (keyof Level)[]).filter((f) => f !== 'speed');
    for (const s of SPELL_IDS) {
      const l = SPELLS[s].levels[0];
      for (const f of fields) {
        if (!l[f]) continue;
        const bumped = { ...l, [f]: l[f] * 2 + 1 };
        const changed = SPELL_ROWS[s].some(([, show]) => show(l) !== show(bumped));
        expect(changed, `${s}.${f} sem linha na dica`).toBe(true);
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

describe('telas: fim da partida e lista de salas', () => {
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
    // sorteados: dois chegaram à meta juntos; o servidor marca só um como winner
    expect(endResult(room({ mode: 'teams', players, winner: 'a' }), 'b')).toBe('win');
  });

  it('lists waiting rooms first and keeps empty rooms apart', () => {
    const r = (id: string, phase: string, players = 1) => ({ id, phase, players }) as RoomInfo;
    const { live, empty } = roomGroups([r('PLAY', 'playing'), r('VAZI', 'lobby', 0), r('ENDD', 'end'), r('WAIT', 'lobby'), r('SHOP', 'shop')]);
    expect(live.map((x) => x.id)).toEqual(['WAIT', 'ENDD', 'PLAY', 'SHOP']);
    expect(empty.map((x) => x.id)).toEqual(['VAZI']);
  });
});
