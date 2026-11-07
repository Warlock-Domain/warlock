// Formatos da arena (pedido do Fernando, 18/10: formatos novos além do círculo): círculo, anel com lava no meio,
// duas ilhas ligadas por ponte e cruz. Cada forma é desenhada em escala 1 e esticada pelo raio atual (w.arenaR):
// o encolhimento escala a forma inteira. Todos (simulação, bots, cliente) perguntam aqui o que é dentro da pedra.
// As áreas ficam perto da do círculo (π em escala 1) para a rodada durar parecido.
import { SPAWN_INSET } from './constants.ts';
import { add, dist, len, norm, scale, sub, v, type Vec } from './vec.ts';

export const ARENA_IDS = ['circle', 'ring', 'islands', 'cross'] as const;
export type ArenaId = (typeof ARENA_IDS)[number];
export const ARENA_NAMES: Record<ArenaId, string> = { circle: 'Círculo', ring: 'Anel', islands: 'Ilhas', cross: 'Cruz' };
export const ARENA_EN: Record<ArenaId, string> = { circle: 'Circle', ring: 'Ring', islands: 'Islands', cross: 'Cross' };

type Shape = {
  sdf: (x: number, y: number) => number; // distância com sinal até a borda, em escala 1 (negativa dentro da pedra)
  reach: number; // ponto mais longe do centro (escala 1), para a câmera e os sorteios
  outline: Vec[][]; // contornos em escala 1: o de fora no sentido anti-horário, buracos no horário (o cliente desenha)
  spawn: (i: number, n: number, R: number) => Vec; // onde o mago i de n nasce, em metros
  obstacles: Vec[][]; // conjuntos fixos de obstáculos (escala 1); além deles, o sorteio espalhado de sempre
};

const TAU = Math.PI * 2;
// pontos de um arco de a0 a a1 (sem o último, para os contornos não repetirem ponto)
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): Vec[] =>
  Array.from({ length: n }, (_, i) => v(cx + r * Math.cos(a0 + ((a1 - a0) * i) / n), cy + r * Math.sin(a0 + ((a1 - a0) * i) / n)));
// distância com sinal até um retângulo centrado na origem (meias medidas hx, hy)
function box(x: number, y: number, hx: number, hy: number): number {
  const dx = Math.abs(x) - hx, dy = Math.abs(y) - hy;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}
const around = (n: number, r: number, a0 = 0): Vec[] => arc(0, 0, r, a0, a0 + TAU, n);

// anel: centro da faixa RC, meia largura RW (área 2π·RC·2RW ≈ 3,08)
const RC = 0.72, RW = 0.34;
// ilhas: raio A, centros em (±C, 0), ponte de meia largura H (área ≈ 3,07)
const A = 0.68, C = 0.95, H = 0.15;
const BRIDGE = Math.asin(H / A);
// cruz: braços de meio comprimento L e meia largura W (área 8LW − 4W² ≈ 3,04)
const L = 1.15, W = 0.4;

export const SHAPES: Record<ArenaId, Shape> = {
  circle: {
    sdf: (x, y) => Math.hypot(x, y) - 1,
    reach: 1,
    outline: [around(96, 1)],
    // como sempre foi: em volta do centro, a SPAWN_INSET da borda
    spawn: (i, n, R) => scale(v(Math.cos((i / n) * TAU), Math.sin((i / n) * TAU)), R - SPAWN_INSET),
    obstacles: [around(6, 0.45, Math.PI / 6), [v(0, 0), ...around(4, 0.55, Math.PI / 4)]],
  },
  ring: {
    sdf: (x, y) => Math.abs(Math.hypot(x, y) - RC) - RW,
    reach: RC + RW,
    outline: [around(96, RC + RW), arc(0, 0, RC - RW, TAU, 0, 48)],
    spawn: (i, n, R) => scale(v(Math.cos((i / n) * TAU), Math.sin((i / n) * TAU)), RC * R),
    obstacles: [around(4, RC, Math.PI / 4), around(6, RC, Math.PI / 6)],
  },
  islands: {
    sdf: (x, y) => Math.min(Math.hypot(Math.abs(x) - C, y) - A, box(x, y, C, H)),
    reach: C + A,
    // ilha da direita, borda de cima da ponte, ilha da esquerda, borda de baixo (as bordas da ponte ligam os arcos)
    outline: [[...arc(C, 0, A, -Math.PI + BRIDGE, Math.PI - BRIDGE, 40), v(C - A * Math.cos(BRIDGE), H), ...arc(-C, 0, A, BRIDGE, TAU - BRIDGE, 40), v(-C + A * Math.cos(BRIDGE), -H)]],
    // metade em cada ilha, em volta do centro dela (o primeiro de fora, longe da ponte)
    spawn: (i, n, R) => {
      const side = i % 2;
      const k = Math.floor(i / 2);
      const m = side ? Math.floor(n / 2) : Math.ceil(n / 2);
      const p = add(v(C, 0), scale(v(Math.cos((k / m) * TAU), Math.sin((k / m) * TAU)), 0.36));
      return scale(side ? v(-p.x, -p.y) : p, R);
    },
    obstacles: [
      [v(C, 0), v(-C, 0), v(0.55, 0.35), v(0.55, -0.35), v(-0.55, 0.35), v(-0.55, -0.35)],
      [...arc(C, 0, 0.3, Math.PI / 2, Math.PI / 2 + TAU, 3), ...arc(-C, 0, 0.3, -Math.PI / 2, -Math.PI / 2 + TAU, 3)],
    ],
  },
  cross: {
    sdf: (x, y) => Math.min(box(x, y, L, W), box(x, y, W, L)),
    reach: Math.hypot(L, W),
    outline: [[v(L, -W), v(L, W), v(W, W), v(W, L), v(-W, L), v(-W, W), v(-L, W), v(-L, -W), v(-W, -W), v(-W, -L), v(W, -L), v(W, -W)]],
    // um por braço (opostos primeiro); do quinto em diante, o segundo do braço mais perto do meio
    spawn: (i, n, R) => {
      const a = [0, 2, 1, 3][i % 4] * (Math.PI / 2);
      const r = i < 4 ? 0.85 : 0.42;
      return v(Math.cos(a) * r * R, Math.sin(a) * r * R);
    },
    obstacles: [around(4, 0.62), [v(0, 0), ...around(4, 0.4, Math.PI / 4)]],
  },
};

// distância até a borda em metros, positiva dentro da pedra; R = raio atual da arena
export function edgeAt(id: ArenaId, R: number, p: Vec): number {
  if (id === 'circle') return R - len(p); // exato, como a regra de sempre (fora do raio = lava)
  if (R <= 0) return -len(p);
  return -R * SHAPES[id].sdf(p.x / R, p.y / R);
}

// Compact mirrored formations keep allies together without changing player order or drawing RNG.
export function teamSpawns(arena: ArenaId, R: number, ids: string[], teams: Record<string, number>): Vec[] {
  const sides = [...new Set(ids.map((id) => teams[id]))].sort((a, b) => a - b);
  if (sides.length !== 2 || sides.some((side) => side === undefined)) return ids.map((_, i) => SHAPES[arena].spawn(i, ids.length, R));
  return ids.map((id) => {
    const allies = ids.filter((other) => teams[other] === teams[id]);
    const y = (allies.indexOf(id) - (allies.length - 1) / 2) * 1.2;
    const radius = arena === 'circle' ? R - SPAWN_INSET : arena === 'ring' ? RC * R : 0.36 * R;
    const x = arena === 'cross' ? 0.85 * R : (arena === 'islands' ? C * R : 0) + Math.sqrt(Math.max(0, radius * radius - y * y));
    const side = teams[id] === sides[0] ? 1 : -1;
    return v(side * x, side * y);
  });
}

// mapa explorável da Campanha (levels.ts): casas de 1 m a partir de (0, 0); fora do mapa é parede. Com mapa, a "borda" é
// a distância até a casa mais perto em que não se pode estar (parede, mureta, abismo): os bots desviam dela como da lava
// tudo acima de wax é "fora" para a borda dos bots (o campo de distância): lava conta como a lava da arena
export const CELL = { floor: 0, wax: 1, low: 2, wall: 3, pit: 4, lava: 5 } as const;
export type Terrain = { w: number; h: number; cells: Uint8Array; home: Vec }; // home: onde os bots sem o que fazer passeiam
export const cellAt = (t: Terrain, x: number, y: number) => {
  const cx = Math.floor(x), cy = Math.floor(y);
  return cx < 0 || cy < 0 || cx >= t.w || cy >= t.h ? CELL.wall : t.cells[cy * t.w + cx];
};
const FAR = 6; // a distância da borda no mapa não passa disso (os bots não pedem folga maior)
// distância com sinal do meio de cada casa até a borda (dentro do que bloqueia, negativa), medida uma vez por mapa
const fields = new WeakMap<Terrain, Float32Array>();
function fieldOf(t: Terrain): Float32Array {
  let f = fields.get(t);
  if (f) return f;
  f = new Float32Array(t.w * t.h);
  for (let cy = 0; cy < t.h; cy++) for (let cx = 0; cx < t.w; cx++) {
    const inside = cellAt(t, cx, cy) > CELL.wax;
    let best = FAR;
    for (let y = cy - FAR; y <= cy + FAR; y++) for (let x = cx - FAR; x <= cx + FAR; x++) {
      if (cellAt(t, x, y) > CELL.wax === inside) continue;
      best = Math.min(best, Math.hypot(Math.max(x - cx - 0.5, 0, cx + 0.5 - x - 1), Math.max(y - cy - 0.5, 0, cy + 0.5 - y - 1)));
    }
    f[cy * t.w + cx] = inside ? -best : best;
  }
  fields.set(t, f);
  return f;
}
// entre os meios das casas, interpolada (contínua: os bots acham o rumo para dentro pela diferença)
function mapEdge(t: Terrain, p: Vec): number {
  const f = fieldOf(t), x = p.x - 0.5, y = p.y - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h ? -FAR : f[cy * t.w + cx]);
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

type Arena = { arena: ArenaId; arenaR: number; map?: Terrain };
export const edge = (w: Arena, p: Vec) => (w.map ? mapEdge(w.map, p) : edgeAt(w.arena, w.arenaR, p));
// meio do lugar onde se luta: o centro da arena, ou o ponto do mapa que a partida escolheu
export const middle = (w: Arena) => w.map?.home ?? v(0, 0);
export const inArena = (w: Arena, p: Vec, margin = 0) => edge(w, p) > margin;

// direção para dentro da pedra (para onde a distância até a borda cresce)
export function inward(w: Arena, p: Vec): Vec {
  const h = 0.01;
  return norm(v(edge(w, v(p.x + h, p.y)) - edge(w, v(p.x - h, p.y)), edge(w, v(p.x, p.y + h)) - edge(w, v(p.x, p.y - h))));
}

// ponto a `depth` m da borda, andando reto para dentro a partir de p; numa ponte ou faixa estreita, o quanto couber
// (sem a metade, passaria para a lava do outro lado). Quem já está mais fundo fica onde está
export function safeInside(w: Arena, p: Vec, depth: number): Vec {
  const e = edge(w, p);
  if (e >= depth) return p;
  const n = inward(w, p);
  for (let d = depth; d > 0.05; d /= 2) {
    const q = add(p, scale(n, d - e));
    if (edge(w, q) >= d / 2) return q;
  }
  return add(p, scale(n, Math.max(0, -e) + 0.05));
}

// folga da lava que dá para ter perto de p: `want` m, ou o que a pedra deixa ali (numa ponte ou faixa estreita, quase o meio dela; nunca menos que 0)
export function roomAt(w: Arena, p: Vec, want: number): number {
  const e = edge(w, p);
  return e >= want ? want : Math.max(0, Math.min(want, edge(w, safeInside(w, p, want + 0.3)) - 0.3));
}

// grade da busca de caminho: N ímpar põe uma linha de células no eixo (a ponte das Ilhas); 1 = dá para andar com a folga de roomAt
const N = 41;
const grids = new WeakMap<Arena, { R: number; want: number; ok: Uint8Array }[]>();

// próximo ponto do caminho a pé de a até b sem passar perto da lava nem pelos obstáculos (avoid: centro e raio a desviar):
// reta se der; senão busca numa grade (nas Ilhas pela ponte, no Anel em volta do buraco) e corta caminho até o ponto mais
// longe que dá para ver em linha reta. null = não há caminho com essa folga (quem chama tenta uma folga menor)
export function pathStep(w: Arena, a: Vec, b: Vec, want: number, avoid: { pos: Vec; r: number }[] = []): Vec | null {
  const free = (p: Vec) => edge(w, p) > roomAt(w, p, want) - 1e-6;
  const hits = (p: Vec) => avoid.some((o) => dist(p, o.pos) < o.r);
  // a até 1 m de uma ponta sem folga (o bot encostado na borda ou num obstáculo, o alvo na beira) basta estar na pedra
  const clear = (p: Vec, q: Vec) => {
    const L = dist(p, q), n = Math.ceil(L / 0.25), fp = free(p) && !hits(p), fq = free(q) && !hits(q);
    for (let i = 1; i < n; i++) {
      const s = add(p, scale(sub(q, p), i / n));
      const loose = (!fp && (i * L) / n < 1) || (!fq && ((n - i) * L) / n < 1);
      if (loose ? edge(w, s) <= 0.2 : !free(s) || hits(s)) return false;
    }
    return true;
  };
  if (clear(a, b)) return b;
  // grade: na arena, N × N em volta do centro; no mapa, uma célula por casa
  const R = w.arenaR, ext = SHAPES[w.arena].reach * R + 0.5, cell = w.map ? 1 : (2 * ext) / N;
  const nx = w.map?.w ?? N, ny = w.map?.h ?? N, x0 = w.map ? 0 : -ext, y0 = w.map ? 0 : -ext;
  const at = (c: number) => v(x0 + ((c % nx) + 0.5) * cell, y0 + (Math.floor(c / nx) + 0.5) * cell);
  const idx = (p: Vec) => {
    const k = (x: number, n: number, o: number) => Math.min(n - 1, Math.max(0, Math.floor((x - o) / cell)));
    return k(p.x, nx, x0) + nx * k(p.y, ny, y0);
  };
  // a grade só muda com o raio (o encolhimento) e a folga pedida
  const list = grids.get(w) ?? grids.set(w, []).get(w)!;
  if (list.length && list[0].R !== R) list.length = 0;
  let g = list.find((x) => x.want === want);
  if (!g) {
    if (list.length >= 32) list.shift(); // a folga pedida varia: guarda só as últimas grades
    list.push((g = { R, want, ok: Uint8Array.from({ length: nx * ny }, (_, c) => (free(at(c)) ? 1 : 0)) }));
  }
  // casas com o meio dentro de algum obstáculo a desviar, marcadas uma vez (o mesmo teste de hits, só que sem repetir por vizinho)
  const near = new Uint8Array(nx * ny);
  for (const o of avoid) {
    const k = (x: number, n: number, o0: number) => Math.min(n - 1, Math.max(0, Math.floor((x - o0) / cell)));
    for (let cy = k(o.pos.y - o.r, ny, y0); cy <= k(o.pos.y + o.r, ny, y0); cy++) for (let cx = k(o.pos.x - o.r, nx, x0); cx <= k(o.pos.x + o.r, nx, x0); cx++)
      if (dist(at(cx + nx * cy), o.pos) < o.r) near[cx + nx * cy] = 1;
  }
  const ok = (c: number) => g.ok[c] === 1 && !near[c];
  const from = idx(a), to = idx(b);
  const prev = new Int32Array(nx * ny).fill(-1);
  prev[from] = from;
  const queue = [from];
  for (let k = 0; k < queue.length && prev[to] < 0; k++) {
    const c = queue[k], x = c % nx, y = (c - x) / nx;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ax = x + dx, ay = y + dy, n = ax + ay * nx;
      if ((!dx && !dy) || ax < 0 || ay < 0 || ax >= nx || ay >= ny || prev[n] >= 0 || (n !== to && !ok(n))) continue;
      if (dx && dy && !(ok(ax + y * nx) && ok(x + ay * nx))) continue; // na diagonal, sem cortar quina
      prev[n] = c;
      queue.push(n);
    }
  }
  if (prev[to] < 0) return null;
  const path: Vec[] = [];
  for (let c = to; c !== from; c = prev[c]) path.push(c === to ? b : at(c));
  path.reverse();
  let best = path[0];
  for (const p of path) {
    if (!clear(a, p)) break;
    best = p;
  }
  return best;
}

// ilhas de refúgio (sim.ts): a pedra de cada uma é um disco; fora da arena E fora de toda ilha = lava
export type Isle = { pos: Vec; r: number };
export const onIsle = (isles: Isle[] | undefined, p: Vec) => !!isles?.some((i) => dist(p, i.pos) < i.r);
// lava: a menos de margin m da borda da pedra (fora dela com 0) e fora de toda ilha
export const inLavaAt = (id: ArenaId, R: number, isles: Isle[] | undefined, p: Vec, margin = 0) => edgeAt(id, R, p) < margin && !onIsle(isles, p);
// ponto no rumo a (radianos, do centro) a d m da pedra: vem de fora para dentro até a distância até a borda chegar a d
export function isleSpot(w: Arena, a: number, d: number): Vec {
  const dir = v(Math.cos(a), Math.sin(a));
  for (let r = SHAPES[w.arena].reach * w.arenaR + d + 1; r > 0; r -= 0.05) if (edge(w, scale(dir, r)) >= -d) return scale(dir, r);
  return scale(dir, d);
}
