// Estado compacto enviado 30 vezes por segundo, e a leitura dele no navegador.
import type { Snap } from './protocol.ts';
import { PROJ_KINDS, type ProjKind, type SimEvent, type World } from './sim.ts';
import { OBSTACLES, OBSTACLE_KINDS, STUN_SPEED, type ObstacleKind } from './constants.ts';
import { ACTIVE_ITEMS } from './items.ts';
import { SPELL_IDS, spellLevel } from './spells.ts';
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
    // bits: 1 vivo, 2 escudo, 4 lento (chão arcano), 512 queimando (chão de fogo), 8 vulnerável (Redirecionador), 16 atordoado (arremessado), 32 invulnerável, 64 Pacto armado, 128 preso (Agarrar), 256 Investida
    const bits = (z.alive ? 1 : 0) | (w.t < z.shieldUntil ? 2 : 0) | (w.t < z.kbPenaltyUntil ? 8 : 0)
      | (Math.hypot(z.vel.x, z.vel.y) > STUN_SPEED ? 16 : 0) | (w.t < z.invulnUntil ? 32 : 0) | (w.t < z.pactUntil ? 64 : 0)
      | (w.t < z.gripUntil ? 128 : 0) | (w.t < z.rushUntil ? 256 : 0) | (z.zone & 1 ? 4 : 0) | (z.zone & 2 ? 512 : 0);
    // avançando (Investida): a velocidade enviada inclui o avanço, e o cliente segue o servidor como num empurrão
    const dash = w.t < z.dashUntil ? z.dashVel : { x: 0, y: 0 };
    wz.push(r2(z.pos.x), r2(z.pos.y), r2(z.vel.x + dash.x), r2(z.vel.y + dash.y), Math.ceil(z.hp), r2(z.facing), bits);
  }
  const p: number[] = [];
  // o meteoro não anda: no lugar da velocidade vão o raio da explosão e os segundos que faltam para cair
  for (const q of w.projectiles) {
    const meteor = q.kind === 'meteor';
    p.push(q.id, PROJ_KINDS.indexOf(q.kind), r2(q.pos.x), r2(q.pos.y), r2(meteor ? spellLevel('meteor', q.level).radius : q.vel.x), r2(meteor ? Math.max(0, q.until - w.t) : q.vel.y));
  }
  const me = w.wizards.find((z) => z.id === forId);
  const cd = SPELL_IDS.map((s) => (me ? r2(Math.max(0, me.cd[s] - w.t)) : 0));
  const icd = ACTIVE_ITEMS.map((i) => (me ? r2(Math.max(0, me.itemCd[i] - w.t)) : 0));
  const snap: Snap = { t: 'snap', time: r2(w.t * 1000) / 1000, r: r2(w.arenaR), s: r2(w.shrinkAt), w: wz, p, cd, icd, sp: r2(me?.speed ?? 0), pl: w.pillars.flatMap((q) => [r2(q.pos.x), r2(q.pos.y), q.alive ? (Number.isFinite(q.hp) ? Math.ceil((q.hp / OBSTACLES[q.kind].hp) * 100) : 100) : 0, OBSTACLE_KINDS.indexOf(q.kind)]), ack };
  // deathmatch: segundos até cada mago voltar (0 = vivo), na ordem de room.ids; o limite cobre o expulso, que não volta
  if (w.dm) snap.rs = w.wizards.map((z) => (z.alive ? 0 : r2(Math.min(99, Math.max(0, z.respawnAt - w.t)))));
  if (w.chest) snap.ch = [r2(w.chest.x), r2(w.chest.y)];
  if (events.length) snap.e = events;
  return snap;
}

export type WizView = { id: string; pos: Vec; vel: Vec; hp: number; facing: number; alive: boolean; shield: boolean; status: number };
// meteor: vel = (raio, segundos até cair)
export type ProjView = { id: number; kind: ProjKind; pos: Vec; vel: Vec };
export type PillarView = { pos: Vec; hp: number; kind: ObstacleKind };
export type SnapView = { time: number; arenaR: number; shrinkAt: number; wizards: WizView[]; projectiles: ProjView[]; pillars: PillarView[]; chest: Vec | null };

export function decodeSnap(s: Snap, ids: string[]): SnapView {
  const wizards: WizView[] = [];
  for (let i = 0; i * 7 < s.w.length && i < ids.length; i++) {
    const [x, y, vx, vy, hp, facing, bits] = s.w.slice(i * 7, i * 7 + 7);
    wizards.push({ id: ids[i], pos: v(x, y), vel: v(vx, vy), hp, facing, alive: (bits & 1) > 0, shield: (bits & 2) > 0, status: bits });
  }
  const projectiles: ProjView[] = [];
  for (let i = 0; i < s.p.length; i += 6) {
    const [id, kind, x, y, vx, vy] = s.p.slice(i, i + 6);
    projectiles.push({ id, kind: PROJ_KINDS[kind] ?? 'fireball', pos: v(x, y), vel: v(vx, vy) });
  }
  const pillars: PillarView[] = [];
  for (let i = 0; i + 3 < (s.pl?.length ?? 0); i += 4) pillars.push({ pos: v(s.pl[i], s.pl[i + 1]), hp: s.pl[i + 2], kind: OBSTACLE_KINDS[s.pl[i + 3]] ?? 'pillar' });
  return { time: s.time, arenaR: s.r, shrinkAt: s.s, wizards, projectiles, pillars, chest: s.ch ? v(s.ch[0], s.ch[1]) : null };
}
