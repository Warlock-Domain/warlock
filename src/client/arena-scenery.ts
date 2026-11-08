import type { Vec } from '../shared/vec.ts';

export type ArenaScenery = 'dungeon' | 'forest';
function visualHash(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// Public room/round data produces one cosmetic draw shared by every viewer, without consuming gameplay RNG.
export const sceneryFor = (seed: string): ArenaScenery => visualHash(seed.toUpperCase()) & 1 ? 'forest' : 'dungeon';
export const objectYaw = (seed: string, kind: string, pos: Vec) => visualHash(`${seed.toUpperCase()}:${kind}:${pos.x.toFixed(3)},${pos.y.toFixed(3)}`) / 4294967296 * Math.PI * 2;
