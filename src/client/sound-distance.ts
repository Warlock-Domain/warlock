import type { Vec } from '../shared/vec.ts';

// Referência é o personagem, não o zoom/câmera; sem piso audível para sons fora do alcance.
export const SOUND_DISTANCE = { full: 2, silent: 24 };
export function distanceVolume(listener: Vec | null | undefined, source: Vec | null | undefined): number {
  if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.y)) return 0;
  if (!listener) return .6; // espectador sem personagem mantém escuta neutra.
  const d = Math.hypot(source.x - listener.x, source.y - listener.y);
  if (!Number.isFinite(d)) return 0;
  const t = Math.max(0, Math.min(1, (d - SOUND_DISTANCE.full) / (SOUND_DISTANCE.silent - SOUND_DISTANCE.full)));
  return (1 - t) ** 2;
}
