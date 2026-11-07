import { WIZ_R } from './constants.ts';
import { dist, type Vec } from './vec.ts';

type Unit = { id: string; pos: Vec; alive: boolean; team?: number | null; hidden?: boolean; suspended?: boolean; r?: number };
export const foe = (z: Unit, caster: Unit) => z.alive && z.id !== caster.id && !(caster.team != null && z.team === caster.team) && !z.hidden && !z.suspended;
// Shared targeting requires a visible enemy body, never ground, allies or self.
// hovered: the client's model under the mouse wins, since the ground point under a tall body falls behind it.
export function sniperTarget<T extends Unit>(units: readonly T[], caster: Unit, at: Vec, range: number, hovered?: string): T | undefined {
  const picked = units.find((z) => z.id === hovered && foe(z, caster) && dist(caster.pos, z.pos) <= range + 1e-9);
  if (picked) return picked;
  let best: T | undefined, gap = Infinity;
  for (const z of units) {
    if (!foe(z, caster) || dist(caster.pos,z.pos) > range + 1e-9) continue;
    const d = dist(at,z.pos);
    if (d <= (z.r ?? WIZ_R) + .15 && d < gap) { best = z; gap = d; }
  }
  return best;
}
// Client preview of an Attack click (beginBasic in sim.ts): the hovered body, else the body at the cursor; empty ground marks nobody, the shot just flies there.
// ponytail: ignores Illusion decoys and pillars in the way, so the mark can show where the server then refuses.
export function attackTarget<T extends Unit>(units: readonly T[], caster: Unit, at: Vec, range: number, hovered?: string): T | undefined {
  const foes = units.filter((z) => foe(z, caster));
  const target = foes.find((z) => z.id === hovered) ?? foes.filter((z) => dist(z.pos, at) <= (z.r ?? WIZ_R) + WIZ_R).sort((a, b) => dist(a.pos, at) - dist(b.pos, at))[0];
  return target && dist(target.pos, caster.pos) <= range ? target : undefined;
}
