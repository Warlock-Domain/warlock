// Estado compacto enviado 30 vezes por segundo, e a leitura dele no navegador.
import type { Snap } from './protocol.ts';
import type { SimEvent, World } from './sim.ts';
import { ACTIVE_ITEMS } from './items.ts';
import { SPELL_IDS } from './spells.ts';
import { v, type Vec } from './vec.ts';

const r2 = (x: number) => Math.round(x * 100) / 100;

// troca os ids secretos dos eventos pelos públicos (ver publicId)
export function publicEvents(events: SimEvent[], pub: (id: string) => string): SimEvent[] {
  return events.map((e) => {
    const out: Record<string, unknown> = { ...e };
    if ('id' in e) out.id = pub(e.id);
    if ('by' in e && e.by) out.by = pub(e.by);
    return out as SimEvent;
  });
}

export function encodeSnap(w: World, forId: string, ack: number, events: SimEvent[]): Snap {
  const wz: number[] = [];
  for (const z of w.wizards) {
    const bits = (z.alive ? 1 : 0) | (w.t < z.shieldUntil ? 2 : 0);
    wz.push(r2(z.pos.x), r2(z.pos.y), r2(z.vel.x), r2(z.vel.y), Math.ceil((z.hp / z.hpMax) * 100), r2(z.facing), bits);
  }
  const p: number[] = [];
  for (const q of w.projectiles) p.push(q.id, q.kind === 'fireball' ? 0 : 1, r2(q.pos.x), r2(q.pos.y), r2(q.vel.x), r2(q.vel.y));
  const me = w.wizards.find((z) => z.id === forId);
  const cd = SPELL_IDS.map((s) => (me ? r2(Math.max(0, me.cd[s] - w.t)) : 0));
  const icd = ACTIVE_ITEMS.map((i) => (me ? r2(Math.max(0, me.itemCd[i] - w.t)) : 0));
  const snap: Snap = { t: 'snap', time: r2(w.t * 1000) / 1000, r: r2(w.arenaR), s: r2(w.shrinkAt), w: wz, p, cd, icd, sp: r2(me?.speed ?? 0), ack };
  if (events.length) snap.e = events;
  return snap;
}

export type WizView = { id: string; pos: Vec; vel: Vec; hp: number; facing: number; alive: boolean; shield: boolean };
export type ProjView = { id: number; kind: 'fireball' | 'homing'; pos: Vec; vel: Vec };
export type SnapView = { time: number; arenaR: number; shrinkAt: number; wizards: WizView[]; projectiles: ProjView[] };

export function decodeSnap(s: Snap, ids: string[]): SnapView {
  const wizards: WizView[] = [];
  for (let i = 0; i * 7 < s.w.length && i < ids.length; i++) {
    const [x, y, vx, vy, hp, facing, bits] = s.w.slice(i * 7, i * 7 + 7);
    wizards.push({ id: ids[i], pos: v(x, y), vel: v(vx, vy), hp, facing, alive: (bits & 1) > 0, shield: (bits & 2) > 0 });
  }
  const projectiles: ProjView[] = [];
  for (let i = 0; i < s.p.length; i += 6) {
    const [id, kind, x, y, vx, vy] = s.p.slice(i, i + 6);
    projectiles.push({ id, kind: kind === 0 ? 'fireball' : 'homing', pos: v(x, y), vel: v(vx, vy) });
  }
  return { time: s.time, arenaR: s.r, shrinkAt: s.s, wizards, projectiles };
}
