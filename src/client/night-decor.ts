// Campaign scenery (Lucas, 24/10): KayKit props (CC0, public/models/charneca.glb) against the walls of each Charneca room,
// themed by room. Only visual: nothing here collides or reaches the simulation. Placement comes from the map itself (cell
// coordinates), so every player sees the same props on the same night without any message.
import type { NightMap } from '../shared/levels.ts';

// h: height of the base (torches stand on top of the 1 m walls)
export type NightProp = { name: string; x: number; y: number; rot: number; h?: number };

// props per room, by the start of the room id (levels/charneca.ts); the default fits any room
const THEMES: [string, string[]][] = [
  ['charneca-entrada', ['bone_A', 'skull', 'candle_triple', 'lantern_standing', 'ribcage']],
  ['moinho', ['barrel_small', 'crates_stacked', 'rubble_half', 'bone_C']],
  ['ponte', ['post_lantern', 'sword_shield_broken', 'skull_candle']],
  ['vilarejo', ['barrel_small', 'crates_stacked', 'candle_melted', 'rubble_half']],
  ['cemiterio', ['gravestone', 'gravemarker_A', 'gravemarker_B', 'grave_A_destroyed', 'candle_melted', 'fence_pillar_broken']],
  ['charneca-portao', ['sword_shield_broken', 'skull_candle', 'lantern_standing']],
  ['arena', ['torch_lit', 'bone_A', 'skull', 'sword_shield_broken', 'ribcage']],
];
const DEFAULT = ['bone_A', 'skull', 'bone_C'];
// one wall-side cell in DENSITY gets a prop; CLEAR: cells kept free around marks and openings (spawns, checkpoint, doors);
// trees and statues are obstacles already, so they only keep their own cell; one wall-top cell in TORCHES gets a torch
const DENSITY = 4, CLEAR = 2, TORCHES = 9;

export const cellHash = (x: number, y: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;

// opened: chests already opened (index among the chest marks): a closed one is golden and glows, an opened one is plain
export function nightProps(n: NightMap, opened: number[] = []): NightProp[] {
  const out: NightProp[] = [];
  n.marks.filter((m) => m.kind === 'chest').forEach((m, k) => out.push({ name: opened.includes(k) ? 'chest' : 'chest_gold', x: m.x + 0.5, y: m.y + 0.5, rot: 0 }));
  for (const m of n.marks.filter((q) => q.kind === 'candle')) out.push({ name: 'shrine_candles', x: m.x + 0.5, y: m.y + 0.5, rot: 0 });
  const at = (x: number, y: number) => n.ground[y]?.[x] ?? 'wall';
  n.rooms.forEach((p, i) => {
    const theme = THEMES.find(([id]) => p.room.id.startsWith(id))?.[1] ?? DEFAULT;
    // openings of this room on the map (floor on its border) and its marks: keep them clear
    const keep: [number, number][] = n.marks.filter((m) => m.room === i && m.kind !== 'tree' && m.kind !== 'statue').map((m) => [m.x, m.y]);
    const solid = n.marks.filter((m) => m.room === i && (m.kind === 'tree' || m.kind === 'statue'));
    for (let x = p.x; x < p.x + p.room.w; x++) for (const y of [p.y, p.y + p.room.h - 1]) if (at(x, y) !== 'wall') keep.push([x, y]);
    for (let y = p.y; y < p.y + p.room.h; y++) for (const x of [p.x, p.x + p.room.w - 1]) if (at(x, y) !== 'wall') keep.push([x, y]);
    for (let y = p.y + 1; y < p.y + p.room.h - 1; y++) for (let x = p.x + 1; x < p.x + p.room.w - 1; x++) {
      if (at(x, y) !== 'floor') continue;
      const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => at(x + dx, y + dy) === 'wall');
      if (!walls.length || keep.some(([kx, ky]) => Math.abs(kx - x) <= CLEAR && Math.abs(ky - y) <= CLEAR)) continue;
      if (solid.some((m) => x >= m.x && y >= m.y && x < m.x + (m.w ?? 1) && y < m.y + (m.h ?? 1))) continue;
      const h = cellHash(x, y);
      if (h % DENSITY) continue;
      // back to the wall: faces the room
      const [dx, dy] = walls[0];
      out.push({ name: theme[(h >>> 4) % theme.length], x: x + 0.5, y: y + 0.5, rot: Math.atan2(-dx, -dy) });
    }
    // torches along the room's own walls, on the visible shell (a wall cell next to something that is not wall)
    for (let y = p.y; y < p.y + p.room.h; y++) for (let x = p.x; x < p.x + p.room.w; x++) {
      if (at(x, y) !== 'wall' || cellHash(y, x) % TORCHES) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) !== 'wall')) continue;
      out.push({ name: 'torch_lit', x: x + 0.5, y: y + 0.5, rot: 0, h: 1 });
    }
  });
  return out;
}
