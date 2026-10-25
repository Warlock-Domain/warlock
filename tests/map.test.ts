import { describe, expect, it } from 'vitest';
import { CELL, edge, pathStep, type Terrain } from '../src/shared/arena.ts';
import { HP_MAX, PIT, WIZ_R, ZONES } from '../src/shared/constants.ts';
import { stepWorld, type World } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { dist, v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

// mapa de teste desenhado como as salas: # parede, : mureta, * abismo, ~ cera, . chão (1 caractere = 1 m)
function terrain(rows: string[]): Terrain {
  const code: Record<string, number> = { '.': CELL.floor, '~': CELL.wax, ':': CELL.low, '#': CELL.wall, '*': CELL.pit, '^': CELL.lava };
  return { w: rows[0].length, h: rows.length, cells: Uint8Array.from(rows.join(''), (c) => code[c]), home: v(1.5, 1.5) };
}
// mundo de dois magos (p0, p1) num mapa, sem obstáculos nem ilhas
function onMap(rows: string[], spots: [number, number][], spells = noSpells()): World {
  const w = world(spots, spells);
  return Object.assign(w, { map: terrain(rows), arenaR: 3, isles: [], pillars: [] });
}
const ROOM = [
  '##########',
  '#........#',
  '#........#',
  '#........#',
  '##########',
];

describe('mapa da Campanha', () => {
  it('walking into a wall stops at the wall', () => {
    const w = onMap(ROOM, [[2.5, 2.5], [5, 3.5]]);
    run(w, 6, [{ id: 'p0', kind: 'move', to: v(20, 2.5) }]);
    expect(w.wizards[0].pos.x).toBeCloseTo(9 - WIZ_R, 2);
    expect(w.wizards[0].pos.y).toBeCloseTo(2.5, 2);
  });

  it('a low wall stops walking but a fireball flies over it', () => {
    const rows = ['##########', '#....:...#', '#....:...#', '#....:...#', '##########'];
    const w = onMap(rows, [[2.5, 2.5], [7.5, 2.5]]);
    run(w, 4, [{ id: 'p0', kind: 'move', to: v(7.5, 2.5) }]);
    expect(w.wizards[0].pos.x).toBeLessThan(5);
    const hit = onMap(rows, [[2.5, 2.5], [7.5, 2.5]]);
    run(hit, 2, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(7.5, 2.5) }]);
    expect(hit.wizards[1].hp).toBeLessThan(HP_MAX);
  });

  it('a wall stops a fireball and the lightning', () => {
    const rows = ['##########', '#....#...#', '#....#...#', '#....#...#', '##########'];
    for (const spell of ['fireball', 'lightning'] as const) {
      const w = onMap(rows, [[2.5, 2.5], [7.5, 2.5]], { ...noSpells(), lightning: 1 });
      run(w, 2, [{ id: 'p0', kind: 'cast', spell, at: v(7.5, 2.5) }]);
      expect(w.wizards[1].hp, spell).toBe(HP_MAX);
      expect(w.projectiles.length, spell).toBe(0);
    }
  });

  it('a wall stops the sand cone (no damage, Blindness or Incapacitate behind it)', () => {
    const rows = ['##########', '#....#...#', '#....#...#', '#....#...#', '##########'];
    const w = onMap(rows, [[4.3, 2.5], [6.7, 2.5]], { ...noSpells(), cluster: 1 });
    run(w, 1, [{ id: 'p0', kind: 'cast', spell: 'cluster', at: v(6.7, 2.5) }]);
    expect(w.wizards[1].hp).toBe(HP_MAX);
    expect(w.wizards[1].blindUntil ?? 0).toBe(0);
    expect(w.wizards[1].incapacitateUntil ?? 0).toBe(0);
    const open = onMap(ROOM, [[4.3, 2.5], [6.7, 2.5]], { ...noSpells(), cluster: 1 });
    run(open, 1, [{ id: 'p0', kind: 'cast', spell: 'cluster', at: v(6.7, 2.5) }]);
    expect(open.wizards[1].hp).toBeLessThan(HP_MAX);
  });

  it('walking into the abyss stops at the edge: only a push makes you fall', () => {
    const rows = ['##########', '#....****#', '#....****#', '#....****#', '##########'];
    const w = onMap(rows, [[2.5, 2.5], [2.5, 1.5]]);
    run(w, 4, [{ id: 'p0', kind: 'move', to: v(7.5, 2.5) }]);
    expect(w.wizards[0].pos.x).toBeCloseTo(5 - WIZ_R, 2);
    expect(w.wizards[0].hp).toBe(HP_MAX);
  });

  it('lava on the map burns like the arena lava, with the credit to who pushed, and does not become the safe spot', () => {
    const rows = ['##########', '#....^^^^#', '#....^^^^#', '#....^^^^#', '##########'];
    const w = onMap(rows, [[6.5, 2.5], [1.5, 2.5]]);
    Object.assign(w.wizards[0], { lastHitBy: 'p1', lastHitAt: 0, safe: v(4, 2.5) });
    run(w, 1);
    expect(w.wizards[0].hp).toBeLessThan(HP_MAX - 50);
    expect(w.wizards[0].safe).toEqual(v(4, 2.5));
    expect(w.wizards[1].hp).toBe(HP_MAX); // na pedra não queima
  });

  it('a Smoke servant pushed into the abyss dies there, with the credit to who pushed', () => {
    const rows = ['##########', '#....****#', '#....****#', '#....****#', '##########'];
    const w = onMap(rows, [[4.4, 2.5], [1.5, 2.5]]);
    Object.assign(w.wizards[0], { pitDeath: true, vel: v(8, 0), lastHitBy: 'p1', lastHitAt: 0 });
    const events = [];
    for (let i = 0; i < 30; i++) {
      stepWorld(w, []);
      events.push(...w.events);
    }
    expect(w.wizards[0].alive).toBe(false);
    expect(events.some((e) => e.k === 'death' && e.id === 'p0' && e.by === 'p1')).toBe(true);
    expect(events.some((e) => e.k === 'teleport' && e.id === 'p0')).toBe(false); // não volta à beira
  });

  it('pushed into the abyss: back at the edge where you fell, with less health and the credit to who pushed', () => {
    const rows = ['##########', '#....****#', '#....****#', '#....****#', '##########'];
    const w = onMap(rows, [[4.4, 2.5], [1.5, 2.5]]);
    w.wizards[0].vel = v(8, 0); // empurrão forte para dentro
    w.wizards[0].lastHitBy = 'p1';
    w.wizards[0].lastHitAt = 0;
    const events = [];
    for (let i = 0; i < 30; i++) {
      stepWorld(w, []);
      events.push(...w.events);
    }
    const z = w.wizards[0];
    expect(events.some((e) => e.k === 'fall' && e.id === 'p0')).toBe(true);
    expect(z.pos.x).toBeLessThan(5);
    expect(z.pos.x).toBeGreaterThan(4);
    expect(z.hp).toBeCloseTo(HP_MAX * (1 - PIT.hit), -1);
    // caindo várias vezes, morre e o abate é de quem empurrou
    z.hp = 10;
    z.vel = v(8, 0);
    z.lastHitAt = w.t;
    for (let i = 0; i < 30 && z.alive; i++) {
      stepWorld(w, []);
      events.push(...w.events);
    }
    expect(z.alive).toBe(false);
    expect(events.find((e) => e.k === 'death')).toMatchObject({ id: 'p0', by: 'p1' });
  });

  it('wax slows walking', () => {
    const rows = ['############', '#..........#', '#~~~~~~~~~~#', '############'];
    const fast = onMap(rows, [[1.5, 1.5], [10, 1.5]]);
    const slow = onMap(rows, [[1.5, 2.5], [10, 1.5]]);
    run(fast, 1, [{ id: 'p0', kind: 'move', to: v(10, 1.5) }]);
    run(slow, 1, [{ id: 'p0', kind: 'move', to: v(10, 2.5) }]);
    expect((slow.wizards[0].pos.x - 1.5) / (fast.wizards[0].pos.x - 1.5)).toBeCloseTo(ZONES.slow.mult, 1);
  });

  it('teleporting into a wall lands on free ground next to it', () => {
    const rows = ['##########', '#...###..#', '#...###..#', '#...###..#', '##########'];
    const w = onMap(rows, [[1.5, 2.5], [8.5, 1.5]], { ...noSpells(), teleport: 1 });
    run(w, 2, [{ id: 'p0', kind: 'cast', spell: 'teleport', at: v(5.2, 2.5) }]);
    const p = w.wizards[0].pos;
    expect(w.map!.cells[Math.floor(p.y) * w.map!.w + Math.floor(p.x)]).toBe(CELL.floor);
    expect(dist(p, v(5.2, 2.5))).toBeLessThan(2);
  });

  it('teleported far into the void, the wizard goes back to the last firm ground', () => {
    const w = onMap(ROOM, [[2.5, 2.5], [7.5, 2.5]]);
    run(w, 0.2);
    Object.assign(w.wizards[0], { pos: v(5, -9) });
    run(w, 0.2);
    expect(w.wizards[0].pos.x).toBeCloseTo(2.5, 1);
    expect(w.wizards[0].pos.y).toBeCloseTo(2.5, 1);
  });

  it('bots find the way around a wall and keep away from walls and abysses', () => {
    const rows = ['############', '#....#.....#', '#....#.....#', '#....#.....#', '#..........#', '############'];
    const w = onMap(rows, [[2.5, 2.5], [8.5, 2.5]]);
    const next = pathStep(w, v(2.5, 2.5), v(8.5, 2.5), 0.3)!;
    expect(next).not.toEqual(v(8.5, 2.5)); // não atravessa a parede
    expect(next.y).toBeGreaterThan(3); // desce para a passagem de baixo
    expect(edge(w, v(4.5, 2.5))).toBeCloseTo(0.5, 5); // a 0,5 m da parede
    expect(edge(w, v(5.5, 2.5))).toBeLessThan(0); // dentro dela
  });
});
