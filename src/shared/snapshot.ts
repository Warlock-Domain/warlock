// Estado compacto enviado 30 vezes por segundo, e a leitura dele no navegador.
import type { Snap } from './protocol.ts';
import { PROJ_KINDS, bootsBonus, type ProjKind, type SimEvent, type World } from './sim.ts';
import { CHEST, OBSTACLES, OBSTACLE_KINDS, RUNE_KINDS, STUN_SPEED, type ObstacleKind, type RuneKind } from './constants.ts';
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
    if ('victim' in e && e.victim) out.victim = pub(e.victim);
    return out as SimEvent;
  });
}

export function encodeSnap(w: World, forId: string, ack: number, events: SimEvent[]): Snap {
  const wz: number[] = [];
  const me = w.wizards.find((z) => z.id === forId);
  const linked = new Set(w.projectiles.filter((p) => p.kind === 'link' && p.target).map((p) => p.target));
  for (const z of w.wizards) {
    // bits: 1 vivo, 2 escudo, 4 lento (chão arcano, Drenar, Bola de neve), 512 queimando (chão de fogo), 8 vulnerável (Redirecionador), 16 atordoado (arremessado), 32 invulnerável, 64 Pacto armado, 128 preso (Agarrar), 256 Investida,
    // 1024 Caminhada no vento (quem anda e os aliados veem), 2048 invisível para quem recebe (o cliente esconde), 4096 acelerado (Drenar, Botas de choque ou de vento),
    // 8192 magnetizado atraindo, 16384 magnetizado repelindo, 32768 Alteração, 65536 preso pelo Elo, 131072 Égide pronta,
    // runas: 262144 Pressa, 524288 Fúria, 1048576 Escudo de runa (com dano ainda a absorver)
    const hidden = z.id !== forId && !(me && me.team !== null && me.team === z.team);
    const bits = (z.alive ? 1 : 0) | (w.t < z.shieldUntil ? 2 : 0) | (w.t < z.kbPenaltyUntil ? 8 : 0)
      | (Math.hypot(z.vel.x, z.vel.y) > STUN_SPEED ? 16 : 0) | (w.t < z.invulnUntil ? 32 : 0) | (w.t < z.pactUntil ? 64 : 0)
      | (w.t < z.gripUntil ? 128 : 0) | (w.t < z.rushUntil ? 256 : 0) | (z.zone & 1 || w.t < z.slowUntil ? 4 : 0) | (z.zone & 2 ? 512 : 0)
      | (w.t < z.windUntil ? (hidden ? 2048 : 1024) : 0) | (w.t < z.hasteUntil || bootsBonus(w, z) > 0 ? 4096 : 0) | (w.t < z.magnetUntil ? (z.magnet > 0 ? 8192 : 16384) : 0)
      | (w.t < z.alterUntil ? 32768 : 0) | (linked.has(z.id) ? 65536 : 0) | (z.aegis ? 131072 : 0)
      | (w.t < z.runeUntil ? (z.rune === 'haste' ? 262144 : z.rune === 'fury' ? 524288 : z.rune === 'shield' && z.runeShield > 0 ? 1048576 : 0) : 0);
    // avançando (Investida): a velocidade enviada inclui o avanço, e o cliente segue o servidor como num empurrão
    const dash = w.t < z.dashUntil ? z.dashVel : { x: 0, y: 0 };
    wz.push(r2(z.pos.x), r2(z.pos.y), r2(z.vel.x + dash.x), r2(z.vel.y + dash.y), Math.ceil(z.hp), r2(z.facing), bits);
  }
  const p: number[] = [];
  // o meteoro e a Zona de dobra não andam: no lugar da velocidade vão o raio e os segundos que faltam;
  // o Elo manda a posição de quem lançou (o cliente desenha o fio até ela)
  for (const q of w.projectiles) {
    const still = q.kind === 'meteor' || q.kind === 'warpzone' ? q.kind : null;
    const tail = q.kind === 'link' ? w.wizards.find((z) => z.id === q.owner)?.pos : undefined;
    const a = still ? spellLevel(still, q.level).radius : (tail ?? q.vel).x;
    const b = still ? Math.max(0, q.until - w.t) : (tail ?? q.vel).y;
    p.push(q.id, PROJ_KINDS.indexOf(q.kind), r2(q.pos.x), r2(q.pos.y), r2(a), r2(b));
  }
  const cd = SPELL_IDS.map((s) => (me ? r2(Math.max(0, me.cd[s] - w.t)) : 0));
  const icd = ACTIVE_ITEMS.map((i) => (me ? r2(Math.max(0, me.itemCd[i] - w.t)) : 0));
  const snap: Snap = { t: 'snap', time: r2(w.t * 1000) / 1000, r: r2(w.arenaR), s: r2(w.shrinkAt), w: wz, p, cd, icd, sp: r2(me?.speed ?? 0), pl: w.pillars.flatMap((q) => [r2(q.pos.x), r2(q.pos.y), q.alive ? (Number.isFinite(q.hp) ? Math.ceil((q.hp / OBSTACLES[q.kind].hp) * 100) : 100) : 0, OBSTACLE_KINDS.indexOf(q.kind)]), ack };
  // deathmatch: segundos até cada mago voltar (0 = vivo), na ordem de room.ids; o limite cobre o expulso, que não volta
  if (w.dm) snap.rs = w.wizards.map((z) => (z.alive ? 0 : r2(Math.min(99, Math.max(0, z.respawnAt - w.t)))));
  if (w.loots.length) {
    snap.ch = w.loots.flatMap((l) => [r2(l.pos.x), r2(l.pos.y), l.left]);
    snap.lp = w.wizards.map((z) => r2(z.lootProg / CHEST.goldEvery));
  }
  if (w.runes.length) snap.ru = w.runes.flatMap((r) => [r2(r.pos.x), r2(r.pos.y), RUNE_KINDS.indexOf(r.kind)]);
  if (events.length) snap.e = events;
  return snap;
}

export type WizView = { id: string; pos: Vec; vel: Vec; hp: number; facing: number; alive: boolean; shield: boolean; status: number };
// meteor e warpzone: vel = (raio, segundos que faltam); link: vel = posição de quem lançou
export type ProjView = { id: number; kind: ProjKind; pos: Vec; vel: Vec };
export type PillarView = { pos: Vec; hp: number; kind: ObstacleKind };
export type RuneView = { pos: Vec; kind: RuneKind };
export type SnapView = { time: number; arenaR: number; shrinkAt: number; wizards: WizView[]; projectiles: ProjView[]; pillars: PillarView[]; loots: { pos: Vec; left: number }[]; runes: RuneView[] };

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
  const runes: RuneView[] = [];
  for (let i = 0; i + 2 < (s.ru?.length ?? 0); i += 3) runes.push({ pos: v(s.ru![i], s.ru![i + 1]), kind: RUNE_KINDS[s.ru![i + 2]] ?? 'haste' });
  return { time: s.time, arenaR: s.r, shrinkAt: s.s, wizards, projectiles, pillars, runes, loots: Array.from({ length: Math.floor((s.ch?.length ?? 0) / 3) }, (_, i) => ({ pos: v(s.ch![i * 3], s.ch![i * 3 + 1]), left: s.ch![i * 3 + 2] })) };
}
