// Campaign minimap and exploration fog (Lucas, 25/10). A room is "seen" once an Aceso stands in it (or it was won); the
// scene covers the unseen rooms and the minimap draws only the seen ones. No objective marker: the night is linear and
// the map itself shows the way. Pure functions (no DOM at load), so the logic is tested in Node.
import type { NightMap } from '../shared/levels.ts';
import type { Vec } from '../shared/vec.ts';

// rooms the group has seen: the ones won, the ones an Aceso stands in now, and every one seen before on this night
export function seenRooms(n: NightMap, acesos: Vec[], done: number[], before: number[] = []): number[] {
  const seen = new Set([...before, ...done]);
  n.rooms.forEach((p, i) => {
    if (acesos.some((a) => a.x >= p.x && a.y >= p.y && a.x < p.x + p.room.w && a.y < p.y + p.room.h)) seen.add(i);
  });
  return [...seen].sort((a, b) => a - b);
}

export type MiniDot = { pos: Vec; me: boolean; foe: boolean };
// colors come from the :root variables (style.css), read by the caller
export type MiniColors = { floor: string; wall: string; lava: string; wax: string; done: string; fight: string; me: string; ally: string; foe: string };

// the seen rooms in cells of `k` px (walls only where they touch a seen floor), the open encounter outlined, then the dots
export function drawMinimap(ctx: CanvasRenderingContext2D, n: NightMap, seen: number[], done: number[], fight: number | null, dots: MiniDot[], c: MiniColors) {
  const { width, height } = ctx.canvas;
  const k = Math.min(width / n.w, height / n.h);
  const ox = (width - n.w * k) / 2, oy = (height - n.h * k) / 2;
  ctx.clearRect(0, 0, width, height);
  for (const i of seen) {
    const p = n.rooms[i];
    if (!p) continue;
    for (let y = p.y; y < p.y + p.room.h; y++) for (let x = p.x; x < p.x + p.room.w; x++) {
      const g = n.ground[y][x];
      ctx.fillStyle = g === 'wall' ? c.wall : g === 'lava' ? c.lava : g === 'wax' ? c.wax : g === 'pit' ? c.wall : done.includes(i) ? c.done : c.floor;
      ctx.fillRect(ox + x * k, oy + y * k, Math.ceil(k), Math.ceil(k));
    }
  }
  if (fight !== null && n.rooms[fight]) {
    const p = n.rooms[fight];
    ctx.strokeStyle = c.fight;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + p.x * k, oy + p.y * k, p.room.w * k, p.room.h * k);
  }
  // me last, on top
  for (const d of [...dots].sort((a, b) => Number(a.me) - Number(b.me))) {
    ctx.fillStyle = d.me ? c.me : d.foe ? c.foe : c.ally;
    ctx.beginPath();
    ctx.arc(ox + d.pos.x * k, oy + d.pos.y * k, d.me ? 3.5 : 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}
