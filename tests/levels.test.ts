import { describe, expect, it } from 'vitest';
import { STAGE_ROOMS, buildNight, layoutStage, parseRooms, type Ground, type NightMap } from '../src/shared/levels.ts';

const rooms = STAGE_ROOMS[0];
const room = (id: string) => rooms.find((r) => r.id === id)!;
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 3);

// casas por onde se anda (mureta, destroço, parede e abismo não)
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

describe('Campanha: salas da Charneca', () => {
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
    // todo encontro precisa de onde o Fumo entrar: E nas salas com ponto de controle, B na arena do chefe
    for (const r of rooms) if (r.pool === 'chefe' || r.marks.some((m) => m.kind === 'checkpoint')) expect(r.marks.some((m) => m.kind === (r.pool === 'chefe' ? 'boss' : 'entry')), r.id).toBe(true);
    expect(kinds('charneca-portao-01')).toContain('candle');
    expect(kinds('arena-odran-01')).toContain('boss');
    const pillars = room('arena-odran-01').marks.filter((m) => m.kind === 'statue');
    expect(pillars.map((m) => [m.w, m.h])).toEqual([[2, 2], [2, 2], [2, 2], [2, 2]]); // os 4 pilares de 2×2
    expect(room('cemiterio-dos-vigias-01').marks.filter((m) => m.kind === 'statue').every((m) => m.w === 1 && m.h === 1)).toBe(true);
    expect(room('charneca-entrada-01').marks.find((m) => m.kind === 'checkpoint')!.id).toBe('C1');
  });

  it('reads the ground: low wall, debris, wax, ditch and bridge', () => {
    const at = (id: string, x: number, y: number) => room(id).ground[y][x];
    expect(at('charneca-entrada-01', 12, 2)).toBe('low');
    expect(at('moinho-caido-01', 8, 1)).toBe('debris');
    expect(at('vilarejo-queimado-02', 11, 5)).toBe('wax');
    expect(at('ponte-dos-enforcados-01', 12, 1)).toBe('pit');
    expect(at('ponte-dos-enforcados-01', 12, 4)).toBe('floor');
  });

  it('exits are the openings drawn on the border', () => {
    expect(room('charneca-entrada-01').exits).toEqual([{ letter: 'L', edge: 'right', from: 4, to: 6 }]);
    expect(room('vilarejo-queimado-02').exits.map((e) => e.letter).sort()).toEqual(['L', 'N', 'O']);
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
    expect(room('ponte-dos-enforcados-01').fight!.waves).toEqual([[{ kind: 'archer', e: 0 }, { kind: 'archer', e: 1 }]]); // só o que a nota diz
    expect(room('charneca-portao-01').fight).toBeUndefined();
    expect(room('arena-odran-01').fight).toBeUndefined(); // até o Sir Odran, a arena usa ondas sorteadas
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
    // maiúscula e espaço no começo valem igual
    expect(parseRooms(base + '  Onda 1: 1 Cinzento @E1\n')[0].fight).toEqual({ waves: [[{ kind: 'ash', e: 0 }]] });
  });

  it('points out drawing mistakes with the room name', () => {
    expect(() => parseRooms('sala: torta   estágio: x   pool: meio\nsaídas: L\n\n####\n#..L\n###\n')).toThrow(/torta.*tamanhos/);
    expect(() => parseRooms('sala: q   estágio: x   pool: meio\nsaídas: L\n\n####\n#Q.L\n####\n')).toThrow(/"Q" desconhecido/);
    expect(() => parseRooms('sala: s   estágio: x   pool: meio\nsaídas: O, L\n\n####\n#..L\n####\n')).toThrow(/cabeçalho \(L,O\).*grade \(L\)/);
  });
});

describe('Campanha: montagem da noite', () => {
  it('same seed same map, and the seeds vary the path', () => {
    const ids = (s: number) => layoutStage(s, 0).map((p) => `${p.room.id}@${p.x},${p.y}`).join(' ');
    expect(ids(42)).toBe(ids(42));
    expect(new Set(SEEDS.slice(0, 30).map(ids)).size).toBeGreaterThan(5);
  });

  it('every night goes entrance, 2 or 3 middle rooms, gate, boss, with at most 2 side rooms', () => {
    for (const s of SEEDS) {
      const all = layoutStage(s, 0);
      const main = all.filter((p) => !p.side).map((p) => p.room.pool);
      expect(main[0], String(s)).toBe('entrada');
      expect(main.slice(-2), String(s)).toEqual(['portão', 'chefe']);
      expect(main.length - 3, String(s)).toBeGreaterThanOrEqual(2);
      expect(main.length - 3, String(s)).toBeLessThanOrEqual(3);
      const side = all.filter((p) => p.side);
      expect(side.length, String(s)).toBeLessThanOrEqual(2);
      expect(new Set(all.map((p) => p.room.id)).size, String(s)).toBe(all.length); // sala nenhuma repete
    }
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
      // as salas laterais também são alcançáveis (o baú delas é a recompensa de quem explora)
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
      // nenhuma casa andável na borda do mapa inteiro: ninguém sai do mapa
      for (let x = 0; x < W; x++) expect([n.ground[0][x], n.ground[n.h - 1][x]], String(s)).toEqual(['wall', 'wall']);
      for (let y = 0; y < n.h; y++) expect([n.ground[y][0], n.ground[y][W - 1]], String(s)).toEqual(['wall', 'wall']);
    }
  });
});
