// Mapa explorável da Campanha: lê as salas desenhadas em ASCII (levels/*.ts, 1 caractere = 1 casa) e monta a noite no
// padrão Diablo 2: objetivo fixo (entrada → salas do meio → portão → arena do chefe), salas sorteadas pela semente e,
// nas saídas que sobram, salas laterais opcionais.
import { CELL, type Terrain } from './arena.ts';
import { CAMPAIGN, SERVOS, SERVO_KINDS, STAGES, roomWaves, type ServoKind } from './campaign.ts';
import { OBSTACLES, type ObstacleKind } from './constants.ts';
import { CHARNECA } from './levels/charneca.ts';
import { nightRand } from './rng.ts';
import type { Pillar, Room as Rect } from './sim.ts';
import { v } from './vec.ts';

// chão de cada casa: parede bloqueia tudo; mureta (low) bloqueia o passo e deixa a magia passar; destroço bloqueia os dois
// até quebrar; cera deixa lento; abismo (pit) derruba quem é empurrado para dentro
export type Ground = 'wall' | 'floor' | 'low' | 'debris' | 'wax' | 'pit' | 'lava';
const GROUND: Record<string, Ground> = { '#': 'wall', '.': 'floor', ':': 'low', '%': 'debris', '~': 'wax', '*': 'pit', '=': 'floor', '^': 'lava' };
// marcas ficam em cima do chão: árvore e estátua são obstáculos; o resto é ponto de jogo
type MarkKind = 'tree' | 'statue' | 'chest' | 'start' | 'candle' | 'entry' | 'boss' | 'checkpoint';
const MARK: Record<string, MarkKind> = { T: 'tree', I: 'statue', $: 'chest', '@': 'start', '+': 'candle', E: 'entry', B: 'boss' };
// x, y: canto da casa (o centro é +0,5); w, h: estátuas encostadas viram um bloco só (os pilares 2×2 da arena)
export type Mark = { kind: MarkKind; x: number; y: number; w?: number; h?: number; id?: string };

// saída: letras na borda (N, S, O, L; X é a passagem para a arena do chefe e só liga com outro X)
type Edge = 'top' | 'bottom' | 'left' | 'right';
export type Exit = { letter: string; edge: Edge; from: number; to: number }; // casas da borda ocupadas pela abertura
type Pool = 'entrada' | 'meio' | 'portão' | 'chefe';
// encontro desenhado: cada onda diz quem entra por qual E (e = índice do E na ordem de leitura, 0 = E1); tombs: lápides que
// rachem de tempos em tempos e soltam mais um servo
export type Spawn = { kind: ServoKind; e: number };
type Fight = { waves: Spawn[][]; tombs?: { kind: ServoKind; every: number; max: number } };
export type Room = { id: string; stage: string; pool: Pool; w: number; h: number; ground: Ground[][]; marks: Mark[]; exits: Exit[]; notes: string; fight?: Fight; boss?: ServoKind }; // boss: o chefe do cabeçalho "chefe:" (arena)

// linha de grade: sem espaço (o texto das notas e o cabeçalho têm espaços)
const GRID_LINE = /^\S{3,}$/;
const EXIT_LETTERS = 'NSOLX';

// cabeçalho "chave: valor   chave: valor" (separados por 2 ou mais espaços)
const pairs = (line: string) => Object.fromEntries(line.split(/\s{2,}/).map((p) => p.split(/:\s*/)).filter((kv) => kv.length === 2).map(([k, v]) => [k.trim(), v.trim()]));

export function parseRooms(text: string): Room[] {
  return text.split(/\n(?=sala:)/).filter((b) => b.trim().startsWith('sala:')).map((block) => parseRoom(block.trim()));
}

function parseRoom(block: string): Room {
  const lines = block.split('\n').map((l) => l.trimEnd());
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
  const notes = lines.slice(end);
  const boss = head['chefe'] ? kindOf(head['chefe']) : undefined;
  if (head['chefe'] && !(boss && SERVOS[boss].boss)) fail(`chefe "${head['chefe']}" desconhecido`);
  return { id, stage: head['estágio'], pool, w, h, ground, marks: blocks(marks), exits, notes: notes.join('\n').trim(), fight: parseFight(notes, marks.filter((m) => m.kind === 'entry').length, marks.some((m) => m.kind === 'statue'), fail), ...(boss && { boss }) };
}

// "Cinzento" ou "Cinzentos" → ash
const kindOf = (name: string) => SERVO_KINDS.find((k) => SERVOS[k].name === name || SERVOS[k].plural === name);

// linhas do encontro nas notas da sala: "onda 1: 2 Cinzentos @E1, 1 Cão de Brasa @E2" e "lápides: 1 Vigia Oco a cada 10 s, até 3"
function parseFight(notes: string[], entries: number, statues: boolean, fail: (msg: string) => never): Fight | undefined {
  const waves: Spawn[][] = [];
  let tombs: Fight['tombs'];
  for (const raw of notes) {
    // "Onda 1:" ou com espaço no começo vale igual (senão a sala ficaria sem o encontro, sem aviso)
    const line = raw.trim();
    const wave = /^onda (\d+):\s*(.+)$/i.exec(line);
    const tomb = /^lápides:\s*1 (.+?) a cada (\d+) s, até (\d+)$/i.exec(line);
    if (wave) {
      if (Number(wave[1]) !== waves.length + 1) fail(`"onda ${wave[1]}" fora de ordem (esperava a onda ${waves.length + 1})`);
      waves.push(wave[2].split(',').flatMap((part) => {
        const m = /^\s*(\d+) (.+?) @E(\d+)\s*$/.exec(part);
        if (!m) fail(`na onda ${wave[1]}, não entendi "${part.trim()}" (formato: 2 Cinzentos @E1)`);
        const kind = kindOf(m![2]);
        if (!kind) fail(`na onda ${wave[1]}, servo "${m![2]}" desconhecido (${SERVO_KINDS.map((k) => SERVOS[k].name).join(', ')})`);
        if (Number(m![3]) < 1 || Number(m![3]) > entries) fail(`na onda ${wave[1]}, @E${m![3]} mas a sala tem ${entries} E`);
        return Array.from({ length: Number(m![1]) }, () => ({ kind: kind!, e: Number(m![3]) - 1 }));
      }));
      if (waves[waves.length - 1].length > CAMPAIGN.slots) fail(`a onda ${wave[1]} tem mais de ${CAMPAIGN.slots} servos ao mesmo tempo`);
    } else if (tomb) {
      const kind = kindOf(tomb[1]);
      if (!kind) fail(`em "lápides", servo "${tomb[1]}" desconhecido`);
      if (!statues) fail('"lápides" numa sala sem lápide (I)');
      if (Number(tomb[2]) < 1) fail('"lápides" precisa de pelo menos 1 s entre uma e outra');
      tombs = { kind: kind!, every: Number(tomb[2]), max: Number(tomb[3]) };
    } else if (/^(onda|lápides)/i.test(line)) fail(`não entendi a linha "${line}"`);
  }
  return waves.length ? { waves, ...(tombs && { tombs }) } : undefined;
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

type Placed = { room: Room; x: number; y: number; side: boolean; used: Exit[] };
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

// a mesma sala espelhada, como os tiles do Diablo 2: fh troca esquerda e direita, fv troca cima e baixo. Chão, marcas e
// saídas acompanham; a ordem das marcas não muda, então o E1 das linhas de onda continua o mesmo E
const SWAP: Record<string, string> = { O: 'L', L: 'O', N: 'S', S: 'N' };
export function flip(r: Room, fh: boolean, fv: boolean): Room {
  if (!fh && !fv) return r;
  const flat = (e: Edge) => e === 'top' || e === 'bottom';
  const ground = r.ground.map((_, y) => r.ground[fv ? r.h - 1 - y : y].map((_, x) => r.ground[fv ? r.h - 1 - y : y][fh ? r.w - 1 - x : x]));
  // o ponto de controle ocupa 2 casas (o C e o número): espelhado, o C continua à esquerda do número
  const marks = r.marks.map((m) => ({ ...m, x: fh ? r.w - m.x - (m.kind === 'checkpoint' ? 2 : (m.w ?? 1)) : m.x, y: fv ? r.h - m.y - (m.h ?? 1) : m.y }));
  const exits = r.exits.map((e) => {
    const across = flat(e.edge) ? fv : fh, along = flat(e.edge) ? fh : fv, n = flat(e.edge) ? r.w : r.h;
    return { letter: across ? (SWAP[e.letter] ?? e.letter) : e.letter, edge: across ? FACING[e.edge] : e.edge, from: along ? n - 1 - e.to : e.from, to: along ? n - 1 - e.from : e.to };
  });
  return { ...r, ground, marks, exits };
}
const variants = (r: Room, rand: () => number) => shuffle([[false, false], [true, false], [false, true], [true, true]], rand).map(([h, v]) => flip(r, h, v));

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
const MAIN_MIDDLE: [number, number] = [2, 3];
const MAX_SIDE = 2;

// a mesma semente monta sempre o mesmo mapa; sem saída que encaixe, tenta outra ordem (busca com volta atrás)
export function layoutStage(seed: number, stage: number): Placed[] {
  const rand = nightRand(seed, stage, -2);
  const rooms = STAGE_ROOMS[stage];
  const of = (p: Pool) => shuffle(rooms.filter((r) => r.pool === p), rand);
  // estágio com ordem fixa (tutorial): todas as salas da lista, nessa sequência; senão 2 ou 3 sorteadas
  const order = STAGES[stage]?.order?.map((id) => rooms.find((r) => r.id === id) ?? (() => { throw new Error(`estágio ${stage}: sala "${id}" da ordem não existe`); })());
  const middle = order ?? of('meio');
  const want = order ? order.length : MAIN_MIDDLE[0] + Math.floor(rand() * (MAIN_MIDDLE[1] - MAIN_MIDDLE[0] + 1));
  const first: Placed = { room: variants(of('entrada')[0], rand)[0], x: 0, y: 0, side: false, used: [] };
  const gate = of('portão')[0], boss = of('chefe')[0];

  // caminho: do atual, por uma saída livre, para uma sala que caiba; depois de `want` salas do meio, portão e chefe
  const path: Placed[] = [first];
  const step = (n: number): boolean => {
    const cur = path[path.length - 1];
    const next = n < want ? (order ? [order[n]] : middle.filter((r) => !path.some((p) => p.room.id === r.id))) : n === want ? [gate] : n === want + 1 ? [boss] : null;
    if (!next) return true;
    for (const out of shuffle(cur.room.exits.filter((e) => !cur.used.includes(e)), rand)) {
      for (const room of next.flatMap((r) => variants(r, rand))) {
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
  const spare = middle.filter((r) => !path.some((p) => p.room.id === r.id)).flatMap((r) => variants(r, rand));
  const all = [...path];
  for (const cur of shuffle(path.filter((p) => p.room.pool === 'meio' || p.room.pool === 'entrada'), rand)) {
    for (const out of cur.room.exits.filter((e) => !cur.used.includes(e))) {
      if (all.length - path.length >= MAX_SIDE) break;
      const room = spare.find((r) => r.exits.some((e) => fits(out, e)) && !all.some((p) => p.room.id === r.id));
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

// --- do mapa da noite para a simulação ------------------------------------------------------------------------------

const CODE: Record<Ground, number> = { floor: CELL.floor, debris: CELL.floor, wax: CELL.wax, low: CELL.low, wall: CELL.wall, pit: CELL.pit, lava: CELL.lava };
// grade da simulação (o destroço é chão: quem bloqueia é o obstáculo em cima dele); home começa no início do grupo
export function terrainOf(n: NightMap): Terrain {
  const start = n.marks.find((m) => m.kind === 'start')!;
  return { w: n.w, h: n.h, cells: Uint8Array.from(n.ground.flat(), (g) => CODE[g]), home: v(start.x + 0.5, start.y + 0.5) };
}

// obstáculos que já existem no jogo: árvore queimada vira árvore; estátua ou lápide de uma casa vira pilar de pedra (quebra,
// como as lápides que racham); bloco maior (os pilares 2×2 da arena) vira Barricada, que não quebra; cada casa de destroço
// vira um pilar que quebra
// The large rock breaks in the arena modes but not here: it is the room block and Sir Odran's pillar (Fernando, 25/10)
export function obstaclesOf(n: NightMap): Pillar[] {
  const put = (kind: ObstacleKind, x: number, y: number): Pillar => ({ pos: v(x, y), hp: kind === 'rock' ? Infinity : OBSTACLES[kind].hp, alive: true, kind });
  const out = n.marks.filter((m) => m.kind === 'tree' || m.kind === 'statue').map((m) => {
    const w = m.w ?? 1, h = m.h ?? 1;
    return m.kind === 'tree' ? put('tree', m.x + 0.5, m.y + 0.5) : put(w * h > 1 ? 'rock' : 'pillar', m.x + w / 2, m.y + h / 2);
  });
  n.ground.forEach((row, y) => row.forEach((g, x) => g === 'debris' && out.push(put('pillar', x + 0.5, y + 0.5))));
  return out;
}

// retângulo da sala i no mapa (para trancar durante o encontro)
export const roomRect = (n: NightMap, i: number): Rect => ({ x: n.rooms[i].x, y: n.rooms[i].y, w: n.rooms[i].room.w, h: n.rooms[i].room.h });

// o mapa sai de novo da semente sempre que alguém precisa (servidor a cada passo, navegador a cada quadro): guarda os últimos
const built = new Map<string, NightMap>();
export function nightMap(seed: number, stage: number): NightMap {
  const key = seed + ':' + stage;
  let n = built.get(key);
  if (!n) {
    if (built.size >= 8) built.delete(built.keys().next().value!);
    built.set(key, (n = buildNight(seed, stage)));
  }
  return n;
}

// encontro da sala i: o desenhado (linhas "onda"), o chefe do cabeçalho (entra pelo B) ou, sem nenhum dos dois, o sorteado pela noite
export function fightOf(n: NightMap, i: number, seed: number, stage: number): Fight {
  const r = n.rooms[i].room;
  if (!r.fight && r.boss) return { waves: [[{ kind: r.boss, e: 0 }]] };
  return r.fight ?? { waves: roomWaves(seed, stage, i, i, r.pool === 'chefe').map((w) => w.map((kind, e) => ({ kind, e }))) };
}
