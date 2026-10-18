import { describe, expect, it } from 'vitest';
import { ARENA_IDS, SHAPES, edge, edgeAt, inArena, safeInside, type ArenaId } from '../src/shared/arena.ts';
import { botCmds } from '../src/shared/bots.ts';
import { ARENA_R0, DT, SHRINK_EVERY, arenaRadius } from '../src/shared/constants.ts';
import { addPlayer, newMatch, parseOpt, startMatch, tickMatch } from '../src/shared/match.ts';
import { publicRoom } from '../src/shared/protocol.ts';
import { newWorld, stepWorld, type World } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { dist, len, v, type Vec } from '../src/shared/vec.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = ARENA_R0;
const area = (loop: Vec[]) => loop.reduce((s, p, i) => s + (p.x * loop[(i + 1) % loop.length].y - loop[(i + 1) % loop.length].x * p.y), 0) / 2;
const world = (arena: ArenaId, n = 4, pillars = 0, rand = Math.random): World =>
  newWorld(Array.from({ length: n }, (_, i) => 'w' + i), Object.fromEntries(Array.from({ length: n }, (_, i) => ['w' + i, noSpells()])), {}, pillars, rand, false, {}, undefined, arena);

describe('formatos da arena', () => {
  it('dentro e fora em cada forma', () => {
    const cases: Record<ArenaId, [Vec, boolean][]> = {
      circle: [[v(0, 0), true], [v(0.99, 0), true], [v(0, -1.01), false]],
      ring: [[v(0, 0), false], [v(0.3, 0), false], [v(0.72, 0), true], [v(0, -0.72), true], [v(1.1, 0), false]],
      islands: [[v(0.95, 0), true], [v(-0.95, 0.6), true], [v(0, 0), true], [v(0, 0.3), false], [v(0, 0.8), false], [v(1.7, 0), false]],
      cross: [[v(0, 0), true], [v(1.1, 0), true], [v(0, -1.1), true], [v(0.8, 0.8), false], [v(1.2, 0), false]],
    };
    for (const id of ARENA_IDS) for (const [u, inside] of cases[id]) expect([id, u, edgeAt(id, R, v(u.x * R, u.y * R)) > 0]).toEqual([id, u, inside]);
  });

  it('o círculo segue a regra de sempre: fora do raio é lava', () => {
    const w = { arena: 'circle' as const, arenaR: 7.3 };
    for (let i = 0; i < 200; i++) {
      const p = v(Math.cos(i) * i * 0.05, Math.sin(i) * i * 0.05);
      expect(inArena(w, p)).toBe(len(p) < 7.3);
    }
  });

  it('o contorno desenhado é a mesma borda da simulação (fora anti-horário, buraco horário) e a área fica perto da do círculo', () => {
    for (const id of ARENA_IDS) {
      const s = SHAPES[id];
      for (const loop of s.outline) for (const p of loop) expect(Math.abs(s.sdf(p.x, p.y))).toBeLessThan(1e-9);
      const areas = s.outline.map(area);
      expect(areas[0]).toBeGreaterThan(0);
      for (const a of areas.slice(1)) expect(a).toBeLessThan(0);
      expect(Math.abs(areas.reduce((x, y) => x + y, 0) - Math.PI)).toBeLessThan(0.15);
      expect(Math.max(...s.outline.flat().map(len))).toBeCloseTo(s.reach, 2);
    }
  });

  it('o encolhimento escala a forma: o ponto mais longe vira lava e as distâncias encolhem junto', () => {
    for (const id of ARENA_IDS) {
      const p = v(3.1, -1.7);
      expect(edgeAt(id, R * 0.5, v(p.x * 0.5, p.y * 0.5))).toBeCloseTo(edgeAt(id, R, p) * 0.5, 9);
      const w = world(id);
      const far = SHAPES[id].outline.flat().reduce((a, b) => (len(b) > len(a) ? b : a));
      const at = v(far.x * w.arenaR * 0.99, far.y * w.arenaR * 0.99);
      expect(inArena(w, at)).toBe(true);
      const r0 = w.arenaR;
      while (w.t < SHRINK_EVERY + DT) stepWorld(w, []);
      expect(w.arenaR).toBeLessThan(r0);
      expect(inArena(w, at)).toBe(false);
    }
  });

  it('todo mago nasce dentro, longe da borda e dos outros, de 2 a 8 magos', () => {
    for (const id of ARENA_IDS) for (let n = 2; n <= 8; n++) {
      const w = world(id, n);
      expect(w.arenaR).toBeCloseTo(arenaRadius(n));
      for (const z of w.wizards) {
        expect([id, n, edge(w, z.pos) > 2]).toEqual([id, n, true]);
        for (const o of w.wizards) if (o !== z) expect(dist(o.pos, z.pos)).toBeGreaterThan(3);
      }
    }
  });

  it('obstáculos ficam na pedra e longe de onde os magos nascem, em todos os conjuntos', () => {
    for (const id of ARENA_IDS) {
      const sets = new Set<string>();
      for (let s = 0; s < 40; s++) {
        const w = world(id, 2 + (s % 7), 5, seeded(s));
        sets.add(w.pillars.map((q) => `${q.pos.x.toFixed(1)},${q.pos.y.toFixed(1)}`).join(' '));
        for (const q of w.pillars) {
          expect(edge(w, q.pos)).toBeGreaterThan(0.5);
          for (const z of w.wizards) expect(dist(q.pos, z.pos)).toBeGreaterThanOrEqual(2);
        }
      }
      expect(sets.size).toBeGreaterThan(SHAPES[id].obstacles.length); // fixos e espalhados aparecem
    }
  });

  it('ponto seguro: sai da lava (até do buraco do anel e de entre as ilhas) sem atravessar para o outro lado', () => {
    const lava: [ArenaId, Vec][] = [['ring', v(0, 0.05)], ['ring', v(0, 1.2)], ['islands', v(0, 0.4)], ['islands', v(1.75, 0.2)], ['cross', v(0.7, 0.7)], ['circle', v(1.2, 0)]];
    for (const [id, u] of lava) {
      const w = { arena: id, arenaR: R };
      const p = v(u.x * R, u.y * R);
      expect(inArena(w, p)).toBe(false);
      expect(edge(w, safeInside(w, p, R * 0.7))).toBeGreaterThan(0.5);
    }
    // na ponte das ilhas o ponto seguro fica na própria ponte
    const w = { arena: 'islands' as const, arenaR: R };
    const q = safeInside(w, v(0, 0.14 * R), R * 0.7);
    expect(Math.abs(q.x)).toBeLessThan(1);
    expect(edge(w, q)).toBeGreaterThan(0.5);
  });

  it('bot na lava ou na borda volta para dentro em todas as arenas', () => {
    const spots: [ArenaId, Vec][] = [['ring', v(0, 0.36)], ['ring', v(0, 1.08)], ['islands', v(0, 0.17)], ['islands', v(1.66, 0)], ['cross', v(0.45, 0.45)], ['cross', v(1.16, 0)], ['circle', v(0, 1.02)]];
    for (const [id, u] of spots) for (let s = 0; s < 20; s++) {
      const w = world(id, 2);
      w.wizards[0].pos = v(u.x * w.arenaR, u.y * w.arenaR);
      w.wizards[1].pos = v(-50, -50); // longe
      const move = botCmds(w, 'w0', seeded(s)).find((c) => c.kind === 'move');
      expect([id, u, move && move.kind === 'move' && edge(w, move.to) > 0.5]).toEqual([id, u, true]);
    }
  });

  it('bot com Teleporte na borda do anel teleporta para a faixa, não para o buraco', () => {
    const w = newWorld(['b', 'x'], { b: { ...noSpells(), teleport: 1 }, x: noSpells() }, {}, 0, Math.random, false, {}, undefined, 'ring');
    w.wizards[0].pos = v(0, 0.39 * w.arenaR); // perto da borda de dentro
    w.wizards[1].pos = v(-50, -50);
    const tp = botCmds(w, 'b', () => 0.5).find((c) => c.kind === 'cast');
    expect(tp && tp.kind === 'cast' && tp.spell === 'teleport' && edge(w, tp.at) > 1).toBe(true);
  });

  it('a arena é opção da partida: sorteada a cada rodada ou fixa, e vai para o navegador', () => {
    expect(parseOpt('arena:islands')).toEqual(['arena', 'islands']);
    expect(parseOpt('arena:square')).toBeNull();
    const seen = new Set<string>();
    for (let s = 0; s < 30; s++) {
      const m = newMatch();
      addPlayer(m, 'h', 'Ana');
      startMatch(m, 0, 2, 'rounds', true, seeded(s));
      tickMatch(m, 1e9, [], seeded(s)); // fecha a loja: o mundo da rodada nasce
      seen.add(m.world!.arena);
      expect(publicRoom('ABCD', m, 1e9).arena).toBe(m.world!.arena);
    }
    expect(seen.size).toBe(ARENA_IDS.length);
    const m = newMatch();
    addPlayer(m, 'h', 'Ana');
    startMatch(m, 0, 2, 'rounds', true, Math.random, { arena: 'cross' });
    tickMatch(m, 1e9, []);
    expect(m.world!.arena).toBe('cross');
  });
});
