import { WIZ_R } from './constants.ts';
import { dist, type Vec } from './vec.ts';

type Unit = { id: string; pos: Vec; alive: boolean; team?: number | null; hidden?: boolean; suspended?: boolean; r?: number };
// Shared targeting requires a visible enemy body, never ground, allies or self.
export function sniperTarget<T extends Unit>(units: readonly T[], caster: Unit, at: Vec, range: number): T | undefined {
  let best: T | undefined, gap = Infinity;
  for (const z of units) {
    if (!z.alive || z.id === caster.id || (caster.team != null && z.team === caster.team) || z.hidden || z.suspended || dist(caster.pos,z.pos) > range + 1e-9) continue;
    const d = dist(at,z.pos);
    if (d <= (z.r ?? WIZ_R) + .15 && d < gap) { best = z; gap = d; }
  }
  return best;
}
