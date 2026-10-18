// Formatos da arena (pedido do Fernando, 18/10: "formatos novos além do círculo"): círculo, anel com lava no meio,
// duas ilhas ligadas por ponte e cruz. Cada forma é desenhada em escala 1 e esticada pelo raio atual (w.arenaR):
// o encolhimento escala a forma inteira. Todos (simulação, bots, cliente) perguntam aqui o que é dentro da pedra.
// As áreas ficam perto da do círculo (π em escala 1) para a rodada durar parecido.
import { SPAWN_INSET } from './constants.ts';
import { add, len, norm, scale, v, type Vec } from './vec.ts';

export const ARENA_IDS = ['circle', 'ring', 'islands', 'cross'] as const;
export type ArenaId = (typeof ARENA_IDS)[number];
export const ARENA_NAMES: Record<ArenaId, string> = { circle: 'Círculo', ring: 'Anel', islands: 'Ilhas', cross: 'Cruz' };

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

type Arena = { arena: ArenaId; arenaR: number };
export const edge = (w: Arena, p: Vec) => edgeAt(w.arena, w.arenaR, p);
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
