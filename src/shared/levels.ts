// Mapa explorável da Campanha: lê as salas desenhadas em ASCII (levels/*.ts, 1 caractere = 1 casa) e monta a noite no
// padrão Diablo 2: objetivo fixo (entrada → salas do meio → portão → arena do chefe), salas sorteadas pela semente e,
// nas saídas que sobram, salas laterais opcionais.
import { CHARNECA } from './levels/charneca.ts';
import { nightRand } from './rng.ts';

// chão de cada casa: parede bloqueia tudo; mureta (low) bloqueia o passo e deixa a magia passar; destroço bloqueia os dois
// até quebrar; cera deixa lento; abismo (pit) derruba quem é empurrado para dentro
export type Ground = 'wall' | 'floor' | 'low' | 'debris' | 'wax' | 'pit';
const GROUND: Record<string, Ground> = { '#': 'wall', '.': 'floor', ':': 'low', '%': 'debris', '~': 'wax', '*': 'pit', '=': 'floor' };
// marcas ficam em cima do chão: árvore e estátua são obstáculos; o resto é ponto de jogo
export type MarkKind = 'tree' | 'statue' | 'chest' | 'start' | 'candle' | 'entry' | 'boss' | 'checkpoint';
const MARK: Record<string, MarkKind> = { T: 'tree', I: 'statue', $: 'chest', '@': 'start', '+': 'candle', E: 'entry', B: 'boss' };
// x, y: canto da casa (o centro é +0,5); w, h: estátuas encostadas viram um bloco só (os pilares 2×2 da arena)
export type Mark = { kind: MarkKind; x: number; y: number; w?: number; h?: number; id?: string };

// saída: letras na borda (N, S, O, L; X é a passagem para a arena do chefe e só liga com outro X)
type Edge = 'top' | 'bottom' | 'left' | 'right';
export type Exit = { letter: string; edge: Edge; from: number; to: number }; // casas da borda ocupadas pela abertura
export type Pool = 'entrada' | 'meio' | 'portão' | 'chefe';
export type Room = { id: string; stage: string; pool: Pool; w: number; h: number; ground: Ground[][]; marks: Mark[]; exits: Exit[]; notes: string };

// linha de grade: sem espaço (o texto das notas e o cabeçalho têm espaços)
const GRID_LINE = /^\S{3,}$/;
const EXIT_LETTERS = 'NSOLX';

// cabeçalho "chave: valor   chave: valor" (separados por 2 ou mais espaços)
const pairs = (line: string) => Object.fromEntries(line.split(/\s{2,}/).map((p) => p.split(/:\s*/)).filter((kv) => kv.length === 2).map(([k, v]) => [k.trim(), v.trim()]));

export function parseRooms(text: string): Room[] {
  return text.split(/\n(?=sala:)/).filter((b) => b.trim().startsWith('sala:')).map((block) => parseRoom(block.trim()));
}

function parseRoom(block: string): Room {
  const lines = block.split('\n');
  const head = Object.assign({}, ...lines.filter((l) => /^\S+:/.test(l) && !GRID_LINE.test(l)).slice(0, 3).map(pairs)) as Record<string, string>;
  const id = head['sala'];
  const fail = (msg: string) => { throw new Error(`sala ${id}: ${msg}`); };
  const start = lines.findIndex((l) => GRID_LINE.test(l));
  if (start < 0) fail('sem grade');
  let end = start;
  while (end < lines.length && GRID_LINE.test(lines[end])) end++;
  const rows = lines.slice(start, end);
  const w = rows[0].length, h = rows.length;
  if (rows.some((r) => r.length !== w)) fail('linhas da grade com tamanhos diferentes');
  const ground: Ground[][] = [];
  const marks: Mark[] = [];
  const border: { letter: string; edge: Edge; i: number }[] = [];
  rows.forEach((row, y) => {
    ground.push([]);
    for (let x = 0; x < w; x++) {
      const c = row[x];
      const edge: Edge | null = y === 0 ? 'top' : y === h - 1 ? 'bottom' : x === 0 ? 'left' : x === w - 1 ? 'right' : null;
      if (edge) {
        if (c !== '#' && !EXIT_LETTERS.includes(c)) fail(`borda com "${c}" na linha ${y + 1}`);
        if (c !== '#') border.push({ letter: c, edge, i: edge === 'top' || edge === 'bottom' ? x : y });
        ground[y].push(c === '#' ? 'wall' : 'floor');
        continue;
      }
      // ponto de controle: "C" seguido do número (as duas casas são chão; a marca fica na do C)
      if (c === 'C' && /\d/.test(row[x + 1] ?? '')) marks.push({ kind: 'checkpoint', x, y, id: c + row[x + 1] });
      else if (/\d/.test(c) && row[x - 1] === 'C') { /* número do ponto de controle */ }
      else if (MARK[c]) marks.push({ kind: MARK[c], x, y });
      else if (!GROUND[c]) fail(`símbolo "${c}" desconhecido na linha ${y + 1}`);
      ground[y].push(GROUND[c] ?? 'floor');
    }
  });
  // casas vizinhas da mesma letra na mesma borda formam uma abertura
  const exits: Exit[] = [];
  for (const b of border) {
    const run = exits.find((e) => e.letter === b.letter && e.edge === b.edge && e.to === b.i - 1);
    if (run) run.to = b.i;
    else exits.push({ letter: b.letter, edge: b.edge, from: b.i, to: b.i });
  }
  // as saídas do cabeçalho ("saídas: O, L"; na arena, "entrada: X") têm de ser as da grade
  const declared = (head['saídas'] ?? head['entrada'] ?? '').split(/[,\s]+/).filter((s) => s.length === 1 && EXIT_LETTERS.includes(s)).sort().join(',');
  const found = [...new Set(exits.map((e) => e.letter))].sort().join(',');
  if (declared !== found) fail(`saídas do cabeçalho (${declared}) diferentes das da grade (${found})`);
  const pool = head['pool'] as Pool;
  if (!['entrada', 'meio', 'portão', 'chefe'].includes(pool)) fail(`pool "${pool}" desconhecido`);
  return { id, stage: head['estágio'], pool, w, h, ground, marks: blocks(marks), exits, notes: lines.slice(end).join('\n').trim() };
}

// estátuas vizinhas (lado a lado ou em cima) formam um bloco retangular
function blocks(marks: Mark[]): Mark[] {
  const out = marks.filter((m) => m.kind !== 'statue');
  const left = marks.filter((m) => m.kind === 'statue');
  while (left.length) {
    const group = [left.pop()!];
    for (let i = 0; i < group.length; i++) {
      const g = group[i];
      for (let j = left.length - 1; j >= 0; j--) if (Math.abs(left[j].x - g.x) + Math.abs(left[j].y - g.y) === 1) group.push(...left.splice(j, 1));
    }
    const x = Math.min(...group.map((m) => m.x)), y = Math.min(...group.map((m) => m.y));
    out.push({ kind: 'statue', x, y, w: Math.max(...group.map((m) => m.x)) - x + 1, h: Math.max(...group.map((m) => m.y)) - y + 1 });
  }
  return out;
}

export const STAGE_ROOMS: Room[][] = [parseRooms(CHARNECA)];

// --- montagem da noite ---------------------------------------------------------------------------------------------

export type Placed = { room: Room; x: number; y: number; side: boolean; used: Exit[] };
export type NightMap = { w: number; h: number; ground: Ground[][]; marks: (Mark & { room: number })[]; rooms: Placed[] };

const FACING: Record<Edge, Edge> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const fits = (a: Exit, b: Exit) => FACING[a.edge] === b.edge && (a.letter === 'X') === (b.letter === 'X');
const center = (e: Exit) => (e.from + e.to) / 2;
const shuffle = <T>(a: T[], rand: () => number) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// onde a sala nova fica para a abertura dela encostar na da sala atual (bordas lado a lado, aberturas alinhadas pelo meio)
function attach(cur: Placed, out: Exit, room: Room, inn: Exit): { x: number; y: number } {
  const along = Math.round(center(out) - center(inn));
  if (out.edge === 'right') return { x: cur.x + cur.room.w, y: cur.y + along };
  if (out.edge === 'left') return { x: cur.x - room.w, y: cur.y + along };
  if (out.edge === 'bottom') return { x: cur.x + along, y: cur.y + cur.room.h };
  return { x: cur.x + along, y: cur.y - room.h };
}
const overlaps = (a: { x: number; y: number; room: Room }, b: { x: number; y: number; room: Room }) =>
  a.x < b.x + b.room.w && b.x < a.x + a.room.w && a.y < b.y + b.room.h && b.y < a.y + a.room.h;

// salas do meio no caminho principal (o resto do pool pode virar sala lateral)
export const MAIN_MIDDLE: [number, number] = [2, 3];
export const MAX_SIDE = 2;

// a mesma semente monta sempre o mesmo mapa; sem saída que encaixe, tenta outra ordem (busca com volta atrás)
export function layoutStage(seed: number, stage: number): Placed[] {
  const rand = nightRand(seed, stage, -2);
  const rooms = STAGE_ROOMS[stage];
  const of = (p: Pool) => shuffle(rooms.filter((r) => r.pool === p), rand);
  const middle = of('meio');
  const want = MAIN_MIDDLE[0] + Math.floor(rand() * (MAIN_MIDDLE[1] - MAIN_MIDDLE[0] + 1));
  const first: Placed = { room: of('entrada')[0], x: 0, y: 0, side: false, used: [] };
  const gate = of('portão')[0], boss = of('chefe')[0];

  // caminho: do atual, por uma saída livre, para uma sala que caiba; depois de `want` salas do meio, portão e chefe
  const path: Placed[] = [first];
  const step = (n: number): boolean => {
    const cur = path[path.length - 1];
    const next = n < want ? middle.filter((r) => !path.some((p) => p.room === r)) : n === want ? [gate] : n === want + 1 ? [boss] : null;
    if (!next) return true;
    for (const out of shuffle(cur.room.exits.filter((e) => !cur.used.includes(e)), rand)) {
      for (const room of next) {
        for (const inn of room.exits.filter((e) => fits(out, e))) {
          const at = attach(cur, out, room, inn);
          const cand: Placed = { room, ...at, side: false, used: [inn] };
          if (path.some((p) => overlaps(p, cand))) continue;
          cur.used.push(out);
          path.push(cand);
          if (step(n + 1)) return true;
          path.pop();
          cur.used.pop();
        }
      }
    }
    return false;
  };
  if (!step(0)) throw new Error(`estágio ${stage}: nenhum caminho com ${want} salas do meio (semente ${seed})`);

  // salas laterais: nas saídas livres do caminho (menos portão e chefe), com as salas do meio que sobraram
  const spare = middle.filter((r) => !path.some((p) => p.room === r));
  const all = [...path];
  for (const cur of shuffle(path.filter((p) => p.room.pool === 'meio' || p.room.pool === 'entrada'), rand)) {
    for (const out of cur.room.exits.filter((e) => !cur.used.includes(e))) {
      if (all.length - path.length >= MAX_SIDE) break;
      const room = spare.find((r) => r.exits.some((e) => fits(out, e)) && !all.some((p) => p.room === r));
      const inn = room?.exits.find((e) => fits(out, e));
      if (!room || !inn) continue;
      const cand: Placed = { room, ...attach(cur, out, room, inn), side: true, used: [inn] };
      if (all.some((p) => overlaps(p, cand))) continue;
      cur.used.push(out);
      all.push(cand);
    }
  }
  return all;
}

// junta as salas numa grade só (fora das salas é parede); saída sem sala do outro lado vira parede
export function buildNight(seed: number, stage: number): NightMap {
  const rooms = layoutStage(seed, stage);
  const x0 = Math.min(...rooms.map((p) => p.x)), y0 = Math.min(...rooms.map((p) => p.y));
  const w = Math.max(...rooms.map((p) => p.x + p.room.w)) - x0, h = Math.max(...rooms.map((p) => p.y + p.room.h)) - y0;
  const ground: Ground[][] = Array.from({ length: h }, () => Array<Ground>(w).fill('wall'));
  const marks: NightMap['marks'] = [];
  rooms.forEach((p, i) => {
    p.x -= x0;
    p.y -= y0;
    const closed = p.room.exits.filter((e) => !p.used.includes(e));
    for (let y = 0; y < p.room.h; y++) for (let x = 0; x < p.room.w; x++) {
      const shut = closed.some((e) => (e.edge === 'top' ? y === 0 : e.edge === 'bottom' ? y === p.room.h - 1 : e.edge === 'left' ? x === 0 : x === p.room.w - 1)
        && (e.edge === 'top' || e.edge === 'bottom' ? x : y) >= e.from && (e.edge === 'top' || e.edge === 'bottom' ? x : y) <= e.to);
      ground[p.y + y][p.x + x] = shut ? 'wall' : p.room.ground[y][x];
    }
    for (const m of p.room.marks) marks.push({ ...m, x: m.x + p.x, y: m.y + p.y, room: i });
  });
  return { w, h, ground, marks, rooms };
}
