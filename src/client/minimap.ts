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
export type MiniColors = { floor: string; wall: string; lava: string; wax: string; done: string; fight: string; me: string; ally: string; foe: string; outline: string };
// px per metre around me: a 30 x 11 m room is 180 x 66 px, so the room I stand in and the edge of its neighbours fit in
// the 220 x 150 frame; the whole-night fit made the current room a 65 x 20 px strip (review of 24/10)
export const MINI_SCALE = 6;

// the seen rooms in cells of `k` px (walls only where they touch a seen floor), centred on me (the whole night when I have
// no wizard); won rooms dashed and the open encounter solid, so neither depends on color alone; then the dots
export function drawMinimap(ctx: CanvasRenderingContext2D, n: NightMap, seen: number[], done: number[], fight: number | null, dots: MiniDot[], c: MiniColors) {
  const { width, height } = ctx.canvas;
  const me = dots.find((d) => d.me)?.pos;
  const k = me ? MINI_SCALE : Math.min(width / n.w, height / n.h);
  const ox = me ? width / 2 - me.x * k : (width - n.w * k) / 2, oy = me ? height / 2 - me.y * k : (height - n.h * k) / 2;
  ctx.clearRect(0, 0, width, height);
  for (const i of seen) {
    const p = n.rooms[i];
    if (!p) continue;
    for (let y = p.y; y < p.y + p.room.h; y++) for (let x = p.x; x < p.x + p.room.w; x++) {
      const g = n.ground[y][x];
      ctx.fillStyle = g === 'wall' || g === 'pit' ? c.wall : g === 'lava' ? c.lava : g === 'wax' ? c.wax : c.floor;
      ctx.fillRect(ox + x * k, oy + y * k, Math.ceil(k), Math.ceil(k));
    }
  }
  const outline = (i: number, color: string, dash: number[]) => {
    const p = n.rooms[i];
    if (!p) return;
    [ctx.strokeStyle, ctx.lineWidth] = [color, 2];
    ctx.setLineDash(dash);
    ctx.strokeRect(ox + p.x * k + 1, oy + p.y * k + 1, p.room.w * k - 2, p.room.h * k - 2);
  };
  for (const i of done) if (seen.includes(i)) outline(i, c.done, [4, 3]);
  if (fight !== null) outline(fight, c.fight, []);
  ctx.setLineDash([]);
  // me last, on top; foes are diamonds and every dot has a dark rim, so a foe on the lava still shows
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = 1.5;
  for (const d of [...dots].sort((a, b) => Number(a.me) - Number(b.me))) {
    const [x, y, r] = [ox + d.pos.x * k, oy + d.pos.y * k, d.me ? 4 : 3];
    ctx.fillStyle = d.me ? c.me : d.foe ? c.foe : c.ally;
    ctx.beginPath();
    if (d.foe) [[0, -r - 1], [r + 1, 0], [0, r + 1], [-r - 1, 0]].forEach(([dx, dy], j) => (j ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
    else ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
