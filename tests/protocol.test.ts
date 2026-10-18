import { describe, expect, it } from 'vitest';
import { cleanName, parseClientMessage } from '../src/shared/protocol.ts';
import { newWorld, stepWorld } from '../src/shared/sim.ts';
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
    expect(p({ t: 'vote', kind: 'mode', target: 'teams' })).toEqual({ t: 'vote', kind: 'mode', target: 'teams' });
    expect(p({ t: 'vote', kind: 'shuffle', target: 'x' })).toEqual({ t: 'vote', kind: 'shuffle' });
    expect(p({ t: 'vote', kind: 'kick', target: 'p1a2b3' })).toEqual({ t: 'vote', kind: 'kick', target: 'p1a2b3' });
    expect(p({ t: 'ballot', yes: false })).toEqual({ t: 'ballot', yes: false });
  });

  it('rejects bad commands', () => {
    expect(parseClientMessage('{"t":"move","x":NaN,"y":0,"seq":1}')).toBeNull();
    expect(p({ t: 'move', x: 1e9, y: 0, seq: 1 })).toBeNull();
    expect(p({ t: 'move', x: 1, y: 0, seq: -1 })).toBeNull();
    expect(p({ t: 'cast', spell: 'invisibility', x: 0, y: 0, seq: 1 })).toBeNull();
    expect(p({ t: 'start', bots: 8 })).toBeNull();
    expect(p({ t: 'hello', playerId: 'x', name: 'a' })).toBeNull();
    expect(p({ t: 'buy', spell: 'shield', extra: 'x'.repeat(2000) })).toBeNull();
    expect(p({ t: 'pick', character: 'dragon' })).toBeNull();
    expect(p({ t: 'vote', kind: 'kick' })).toBeNull();
    expect(p({ t: 'vote', kind: 'kick', target: 'raw-player-id-123' })).toBeNull();
    expect(p({ t: 'vote', kind: 'ban', target: 'p1' })).toBeNull();
    expect(p({ t: 'vote', kind: 'mode', target: 'x' })).toBeNull();
    expect(p({ t: 'vote', kind: 'mode' })).toBeNull();
    expect(p({ t: 'ballot', yes: 'sim' })).toBeNull();
    expect(parseClientMessage('nada')).toBeNull();
    expect(p([1, 2])).toBeNull();
  });

  it('taunt: only the fixed ones (0..9)', () => {
    expect(p({ t: 'taunt', i: 0 })).toEqual({ t: 'taunt', i: 0 });
    expect(p({ t: 'taunt', i: 8 })).toEqual({ t: 'taunt', i: 8 });
    expect(p({ t: 'taunt', i: 9 })).toEqual({ t: 'taunt', i: 9 });
    expect(p({ t: 'taunt', i: 10 })).toBeNull();
    expect(p({ t: 'taunt', i: 99 })).toBeNull();
    expect(p({ t: 'taunt', i: 100 })).toBeNull();
    expect(p({ t: 'taunt', i: -1 })).toBeNull();
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

  it('snapshot: absorção da Investida vai só quando existe; runa do Escudo vai como efeito', () => {
    const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() });
    expect(encodeSnap(w, 'a', 0, []).ab).toBeUndefined();
    Object.assign(w.wizards[0], { rune: 'shield', runeUntil: 5 });
    Object.assign(w.wizards[1], { rushUntil: 5, rushLeft: 11.5 });
    const s = decodeSnap(JSON.parse(JSON.stringify(encodeSnap(w, 'a', 0, []))), ['a', 'b']);
    expect([s.wizards[0].rushLeft, s.wizards[1].rushLeft]).toEqual([0, 12]);
    expect(s.wizards[0].status & 1048576).toBeTruthy();
    // acabou o tempo: some
    w.t = 6;
    expect(encodeSnap(w, 'a', 0, []).ab).toBeUndefined();
  });

  it('snapshot: chão dos choques e o efeito em quem pisa (queimando, lento, no redemoinho)', () => {
    const w = newWorld(['a', 'b', 'c'], { a: noSpells(), b: noSpells(), c: noSpells() });
    expect(encodeSnap(w, 'a', 0, []).zn).toBeUndefined();
    w.wizards[0].pos = v(-3, 0);
    w.wizards[1].pos = v(0, 0);
    w.wizards[2].pos = v(3, 0);
    w.zones.push({ pos: v(-3, 0), r: 1.5, kind: 'burn', until: 4.5 }, { pos: v(0, 0), r: 1.95, kind: 'slow', until: 4.5 }, { pos: v(3, 0), r: 1.2, kind: 'pull', until: 3 });
    w.t = 1;
    stepWorld(w, [], () => 0.5); // o passo da simulação marca quem está em cada chão
    w.t = 1;
    const s = decodeSnap(JSON.parse(JSON.stringify(encodeSnap(w, 'a', 0, []))), ['a', 'b', 'c']);
    expect(s.zones).toEqual([
      { pos: v(-3, 0), r: 1.5, kind: 'burn', left: 3.5 },
      { pos: v(0, 0), r: 1.95, kind: 'slow', left: 3.5 },
      { pos: v(3, 0), r: 1.2, kind: 'pull', left: 2 },
    ]);
    expect(s.wizards.map((z) => [z.status & 512, z.status & 4, z.status & 2097152])).toEqual([[512, 0, 0], [0, 4, 0], [0, 0, 2097152]]);
  });
});
