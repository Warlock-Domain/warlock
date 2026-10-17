import { describe, expect, it } from 'vitest';
import { cleanName, parseClientMessage } from '../src/shared/protocol.ts';
import { newWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

const p = (m: unknown) => parseClientMessage(JSON.stringify(m));

describe('protocolo', () => {
  it('accepts valid commands', () => {
    expect(p({ t: 'hello', playerId: 'abcdefgh-123', name: 'Ana' })).toEqual({ t: 'hello', playerId: 'abcdefgh-123', name: 'Ana' });
    expect(p({ t: 'move', x: 1.5, y: -2, seq: 3 })).toEqual({ t: 'move', x: 1.5, y: -2, seq: 3 });
    expect(p({ t: 'cast', spell: 'homing', x: 0, y: 0, seq: 9 })).toEqual({ t: 'cast', spell: 'homing', x: 0, y: 0, seq: 9 });
    expect(p({ t: 'start', bots: 7 })).toEqual({ t: 'start', bots: 7 });
    expect(p({ t: 'pick', character: 'skeleton_warrior' })).toEqual({ t: 'pick', character: 'skeleton_warrior' });
  });

  it('rejects bad commands', () => {
    expect(parseClientMessage('{"t":"move","x":NaN,"y":0,"seq":1}')).toBeNull();
    expect(p({ t: 'move', x: 1e9, y: 0, seq: 1 })).toBeNull();
    expect(p({ t: 'move', x: 1, y: 0, seq: -1 })).toBeNull();
    expect(p({ t: 'cast', spell: 'meteor', x: 0, y: 0, seq: 1 })).toBeNull();
    expect(p({ t: 'start', bots: 8 })).toBeNull();
    expect(p({ t: 'hello', playerId: 'x', name: 'a' })).toBeNull();
    expect(p({ t: 'buy', spell: 'shield', extra: 'x'.repeat(2000) })).toBeNull();
    expect(p({ t: 'pick', character: 'dragon' })).toBeNull();
    expect(parseClientMessage('nada')).toBeNull();
    expect(p([1, 2])).toBeNull();
  });

  it('cleans name', () => {
    expect(cleanName('<b>Zé</b> do Fogo e mais um nome comprido')).toBe('bZé/b do Fogo e mais');
    expect(cleanName('   ')).toBe('Mago');
  });

  it('snapshot round-trips positions within 0.01', () => {
    const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() });
    w.wizards[0].pos = v(1.23456, -7.891);
    w.wizards[1].alive = false;
    w.wizards[0].shieldUntil = 5;
    const s = decodeSnap(JSON.parse(JSON.stringify(encodeSnap(w, 'a', 4, []))), ['a', 'b']);
    expect(s.wizards[0].pos.x).toBeCloseTo(1.23456, 2);
    expect(s.wizards[0].pos.y).toBeCloseTo(-7.891, 2);
    expect(s.wizards[0].shield).toBe(true);
    expect(s.wizards[1].alive).toBe(false);
  });
});
