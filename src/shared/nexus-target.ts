import { healTarget } from './heal-target.ts';
import type { Vec } from './vec.ts';

type Unit = { id: string; pos: Vec; alive: boolean; team?: number | null };
export function nexusTarget<T extends Unit>(units: readonly T[], caster: Unit, at: Vec, range: number): T | undefined {
  return healTarget(units.filter((z) => z.id !== caster.id), caster, at, range);
}
