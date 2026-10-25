import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/shared/campaign.ts';
import { STAGE_ROOMS, buildNight, flip, layoutStage, parseRooms, type Ground, type NightMap } from '../src/shared/levels.ts';

const rooms = STAGE_ROOMS[0];
const room = (id: string) => rooms.find((r) => r.id === id)!;
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 3);

// cells you can walk on (low wall, debris, wall and abyss are not)
const WALK: Ground[] = ['floor', 'wax'];
function reachable(n: NightMap, from: { x: number; y: number }): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const { x, y } = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !WALK.includes(n.ground[ny]?.[nx])) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }
  return seen;
}

describe('Campaign: Charneca rooms', () => {
  it('reads the 7 rooms of the level design with their pools', () => {
    expect(rooms.map((r) => [r.id, r.pool])).toEqual([
      ['charneca-entrada-01', 'entrada'], ['moinho-caido-01', 'meio'], ['vilarejo-queimado-02', 'meio'], ['cemiterio-dos-vigias-01', 'meio'],
      ['ponte-dos-enforcados-01', 'meio'], ['charneca-portao-01', 'portão'], ['arena-odran-01', 'chefe'],
    ]);
  });

  it('every room has its checkpoint, entries and special points', () => {
    const kinds = (id: string) => room(id).marks.map((m) => m.kind);
    expect(kinds('charneca-entrada-01')).toEqual(expect.arrayContaining(['start', 'checkpoint', 'entry']));
    for (const id of ['moinho-caido-01', 'vilarejo-queimado-02', 'cemiterio-dos-vigias-01', 'ponte-dos-enforcados-01']) expect(kinds(id), id).toContain('checkpoint');
    // every encounter needs somewhere for the Smoke to enter: E in rooms with a checkpoint, B in the boss arena
    for (const r of rooms) if (r.pool === 'chefe' || r.marks.some((m) => m.kind === 'checkpoint')) expect(r.marks.some((m) => m.kind === (r.pool === 'chefe' ? 'boss' : 'entry')), r.id).toBe(true);
    expect(kinds('charneca-portao-01')).toContain('candle');
    expect(kinds('arena-odran-01')).toContain('boss');
    const pillars = room('arena-odran-01').marks.filter((m) => m.kind === 'statue');
    expect(pillars.map((m) => [m.w, m.h])).toEqual([[2, 2], [2, 2], [2, 2], [2, 2]]); // the 4 pillars of 2×2
    expect(room('cemiterio-dos-vigias-01').marks.filter((m) => m.kind === 'statue').every((m) => m.w === 1 && m.h === 1)).toBe(true);
    expect(room('charneca-entrada-01').marks.find((m) => m.kind === 'checkpoint')!.id).toBe('C1');
  });

  it('reads the ground: low wall, debris, wax, lava and bridge', () => {
    const at = (id: string, x: number, y: number) => room(id).ground[y][x];
    expect(at('charneca-entrada-01', 12, 2)).toBe('low');
    expect(at('moinho-caido-01', 8, 1)).toBe('debris');
    expect(at('vilarejo-queimado-02', 11, 5)).toBe('wax');
    expect(at('ponte-dos-enforcados-01', 12, 1)).toBe('lava'); // lava under the bridge (22/10)
    expect(at('arena-odran-01', 1, 4)).toBe('lava'); // lava ring of the arena
    expect(at('ponte-dos-enforcados-01', 12, 4)).toBe('floor');
  });

  it('exits are the openings drawn on the border', () => {
    expect(room('charneca-entrada-01').exits).toEqual([{ letter: 'N', edge: 'top', from: 13, to: 16 }, { letter: 'L', edge: 'right', from: 4, to: 6 }, { letter: 'S', edge: 'bottom', from: 13, to: 16 }]);
    expect(room('vilarejo-queimado-02').exits.map((e) => e.letter).sort()).toEqual(['L', 'N', 'O', 'S']);
    expect(room('arena-odran-01').exits).toEqual([{ letter: 'X', edge: 'left', from: 6, to: 8 }]);
  });

  it('ignores spaces left at the end of a grid line', () => {
    const r = parseRooms('sala: a   estágio: x   pool: meio\nsaídas: L\n\n####  \n#..L\n####\n')[0];
    expect([r.w, r.h]).toEqual([4, 3]);
  });

  it('reads the encounter lines of each room', () => {
    expect(room('charneca-entrada-01').fight).toEqual({ waves: [[{ kind: 'ash', e: 0 }, { kind: 'ash', e: 0 }, { kind: 'ash', e: 0 }]] });
    expect(room('moinho-caido-01').fight!.waves.map((w) => w.map((s) => `${s.kind}@E${s.e + 1}`))).toEqual([
      ['ash@E1', 'ash@E1', 'ash@E2', 'ash@E2'], ['archer@E1', 'archer@E2'],
    ]);
    expect(room('vilarejo-queimado-02').fight!.waves[0]).toContainEqual({ kind: 'hound', e: 0 });
    expect(room('cemiterio-dos-vigias-01').fight!.tombs).toEqual({ kind: 'watcher', every: 10, max: 3 });
    expect(room('ponte-dos-enforcados-01').fight!.waves).toEqual([[{ kind: 'archer', e: 0 }, { kind: 'archer', e: 1 }]]); // only what the note says
    expect(room('charneca-portao-01').fight).toBeUndefined();
    expect(room('arena-odran-01').fight).toBeUndefined(); // until Sir Odran, the arena uses drawn waves
  });

  it('points out encounter mistakes with the room name', () => {
    const base = 'sala: e   estágio: x   pool: meio\nsaídas: L\n\n#####\n#E.EL\n#####\n\n';
    expect(() => parseRooms(base + 'onda 1: 2 Esqueletos @E1\n')).toThrow(/sala e: .*"Esqueletos" desconhecido/);
    expect(() => parseRooms(base + 'onda 1: 1 Cinzento @E3\n')).toThrow(/@E3 mas a sala tem 2 E/);
    expect(() => parseRooms(base + 'onda 2: 1 Cinzento @E1\n')).toThrow(/fora de ordem/);
    expect(() => parseRooms(base + 'onda 1: 5 Cinzentos @E1\n')).toThrow(/mais de 4 servos/);
    expect(() => parseRooms(base + 'onda 1: dois Cinzentos @E1\n')).toThrow(/não entendi "dois Cinzentos @E1"/);
    expect(() => parseRooms(base + 'lápides: 1 Vigia Oco a cada 10 s, até 3\n')).toThrow(/sem lápide/);
    expect(() => parseRooms(base + 'Onda 1 - 1 Cinzento @E1\n')).toThrow(/não entendi a linha/);
    // a capital letter and leading space count the same
    expect(parseRooms(base + '  Onda 1: 1 Cinzento @E1\n')[0].fight).toEqual({ waves: [[{ kind: 'ash', e: 0 }]] });
  });

  it('points out drawing mistakes with the room name', () => {
    expect(() => parseRooms('sala: torta   estágio: x   pool: meio\nsaídas: L\n\n####\n#..L\n###\n')).toThrow(/torta.*tamanhos/);
    expect(() => parseRooms('sala: q   estágio: x   pool: meio\nsaídas: L\n\n####\n#Q.L\n####\n')).toThrow(/"Q" desconhecido/);
    expect(() => parseRooms('sala: s   estágio: x   pool: meio\nsaídas: O, L\n\n####\n#..L\n####\n')).toThrow(/cabeçalho \(L,O\).*grade \(L\)/);
  });
});

describe('Campaign: night assembly', () => {
  it('same seed same map, and the seeds vary the path', () => {
    const ids = (s: number) => layoutStage(s, 0).map((p) => `${p.room.id}@${p.x},${p.y}`).join(' ');
    expect(ids(42)).toBe(ids(42));
    // the Charneca has a fixed order: the seed mirrors the rooms and changes which way the path goes
    // N/S openings (Lucas, 24/10): with only E/W exits the 30 seeds gave 4 shapes; now most seeds give their own
    expect(new Set(SEEDS.slice(0, 30).map(ids)).size).toBeGreaterThanOrEqual(15);
  });

  it('the Charneca (tutorial) always goes entrance, the 4 middle rooms in order, gate, boss', () => {
    for (const s of SEEDS) {
      const all = layoutStage(s, 0);
      expect(all.map((p) => p.room.id), String(s)).toEqual(['charneca-entrada-01', ...STAGES[0].order!, 'charneca-portao-01', 'arena-odran-01']);
      expect(all.some((p) => p.side), String(s)).toBe(false);
    }
  });

  it('a mirrored room keeps its exits, marks and encounter consistent', () => {
    const r = room('vilarejo-queimado-02');
    const m = flip(r, true, true);
    expect(flip(m, true, true)).toEqual(r);
    expect(m.ground[0][0]).toBe(r.ground[r.h - 1][r.w - 1]);
    // E1 is still the same mark (order kept), only mirrored
    const e = (q: typeof r) => q.marks.filter((k) => k.kind === 'entry');
    expect(e(m).map((k) => [k.x, k.y])).toEqual(e(r).map((k) => [r.w - 1 - k.x, r.h - 1 - k.y]));
    // the checkpoint center (between the C and the number) goes to the mirrored center
    const cp = (q: typeof r) => q.marks.find((k) => k.kind === 'checkpoint')!;
    expect(cp(m).x + 1).toBe(r.w - (cp(r).x + 1));
    // the N exit becomes S, the L becomes O, at the mirrored position
    expect(m.exits.find((x) => x.letter === 'S')).toEqual({ letter: 'S', edge: 'bottom', from: r.w - 1 - r.exits.find((x) => x.letter === 'N')!.to, to: r.w - 1 - r.exits.find((x) => x.letter === 'N')!.from });
    expect(m.fight).toBe(r.fight);
  });

  it('rooms never overlap and the boss is reachable on foot from the start', () => {
    for (const s of SEEDS) {
      const n = buildNight(s, 0);
      for (const [i, a] of n.rooms.entries()) for (const b of n.rooms.slice(i + 1))
        expect(a.x < b.x + b.room.w && b.x < a.x + a.room.w && a.y < b.y + b.room.h && b.y < a.y + a.room.h, `${s}: ${a.room.id} × ${b.room.id}`).toBe(false);
      const start = n.marks.find((m) => m.kind === 'start')!;
      const seen = reachable(n, start);
      const boss = n.marks.find((m) => m.kind === 'boss')!;
      expect(seen.has(`${boss.x},${boss.y}`), String(s)).toBe(true);
      // the side rooms are reachable too (their chest rewards whoever explores)
      for (const p of n.rooms.filter((q) => q.side)) {
        const cp = n.marks.find((m) => m.room === n.rooms.indexOf(p) && m.kind === 'checkpoint')!;
        expect(seen.has(`${cp.x},${cp.y}`), `${s}: ${p.room.id}`).toBe(true);
      }
    }
  });

  it('exits nobody uses are walled up', () => {
    for (const s of SEEDS.slice(0, 40)) {
      const n = buildNight(s, 0);
      const W = n.ground[0].length;
      // no walkable cell on the border of the whole map: nobody leaves the map
      for (let x = 0; x < W; x++) expect([n.ground[0][x], n.ground[n.h - 1][x]], String(s)).toEqual(['wall', 'wall']);
      for (let y = 0; y < n.h; y++) expect([n.ground[y][0], n.ground[y][W - 1]], String(s)).toEqual(['wall', 'wall']);
    }
  });
});
