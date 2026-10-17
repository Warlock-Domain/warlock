// Simulação 2D da arena. Pura: o servidor roda a 60 passos/s; o cliente usa moveWizard para prever o próprio mago.
import {
  ARENA_R0, ARENA_STEP, CREDIT_WINDOW, DT, FRICTION, HP_MAX, KNOCK_HP_SCALE, LAVA_DPS, PROJ_R, SHRINK_EVERY, STUN_SPEED, WIZ_R, WIZ_SPEED,
} from './constants.ts';
import { HOMING_TURN, SPELL_IDS, spellLevel, type SpellId } from './spells.ts';
import { add, clampLen, dist, dot, len, norm, scale, sub, v, type Vec } from './vec.ts';

export type Wizard = {
  id: string;
  pos: Vec;
  vel: Vec; // só o empurrão; andar não entra aqui
  target: Vec | null;
  facing: number;
  hp: number;
  alive: boolean;
  shieldUntil: number;
  lastHitBy: string | null;
  lastHitAt: number;
  spells: Record<SpellId, number>; // nível; 0 = não tem
  cd: Record<SpellId, number>; // instante (w.t) em que fica pronta
};

export type Projectile = {
  id: number;
  kind: 'fireball' | 'homing';
  owner: string;
  pos: Vec;
  vel: Vec;
  level: number;
  until: number;
  target: string | null;
};

export type Cmd =
  | { id: string; kind: 'move'; to: Vec }
  | { id: string; kind: 'stop' }
  | { id: string; kind: 'cast'; spell: SpellId; at: Vec };

export type SimEvent =
  | { k: 'cast'; id: string; spell: SpellId }
  | { k: 'hit'; id: string; by: string; x: number; y: number }
  | { k: 'reflect'; id: string; x: number; y: number }
  | { k: 'lightning'; from: Vec; to: Vec }
  | { k: 'teleport'; id: string; from: Vec; to: Vec }
  | { k: 'death'; id: string; by: string | null }
  | { k: 'shrink'; r: number };

export type World = {
  t: number;
  arenaR: number;
  shrinkAt: number;
  wizards: Wizard[];
  projectiles: Projectile[];
  events: SimEvent[];
  nextId: number;
};

export function newWorld(ids: string[], spells: Record<string, Record<SpellId, number>>): World {
  const r = ARENA_R0 * 0.7;
  const wizards = ids.map((id, i): Wizard => {
    const a = (i / ids.length) * Math.PI * 2;
    return {
      id,
      pos: v(Math.cos(a) * r, Math.sin(a) * r),
      vel: v(0, 0),
      target: null,
      facing: a + Math.PI,
      hp: HP_MAX,
      alive: true,
      shieldUntil: 0,
      lastHitBy: null,
      lastHitAt: -1e9,
      spells: { ...spells[id] },
      cd: Object.fromEntries(SPELL_IDS.map((s) => [s, 0])) as Record<SpellId, number>,
    };
  });
  return { t: 0, arenaR: ARENA_R0, shrinkAt: SHRINK_EVERY, wizards, projectiles: [], events: [], nextId: 1 };
}

export const isSliding = (wz: Wizard) => len(wz.vel) > STUN_SPEED;

export function moveWizard(wz: Wizard, dt: number) {
  if (wz.target && !isSliding(wz)) {
    const d = sub(wz.target, wz.pos);
    const l = len(d);
    const step = WIZ_SPEED * dt;
    if (l <= step) {
      wz.pos = wz.target;
      wz.target = null;
    } else {
      wz.pos = add(wz.pos, scale(d, step / l));
      wz.facing = Math.atan2(d.y, d.x);
    }
  }
  wz.pos = add(wz.pos, scale(wz.vel, dt));
  wz.vel = scale(wz.vel, Math.exp(-FRICTION * dt));
  if (len(wz.vel) < 0.05) wz.vel = v(0, 0);
}

const byId = (w: World, id: string | null) => w.wizards.find((z) => z.id === id && z.alive);
const shielded = (w: World, wz: Wizard) => w.t < wz.shieldUntil;

function hit(w: World, target: Wizard, by: string, dmg: number, knock: number, dir: Vec) {
  const mult = 1 + (KNOCK_HP_SCALE * (HP_MAX - target.hp)) / HP_MAX;
  target.hp -= dmg;
  target.vel = add(target.vel, scale(norm(dir), knock * mult));
  target.lastHitBy = by;
  target.lastHitAt = w.t;
  w.events.push({ k: 'hit', id: target.id, by, x: target.pos.x, y: target.pos.y });
}

// primeiro mago (fora os excluídos) que o segmento a→b toca; t em [0,1] ao longo do segmento
function firstOnSegment(w: World, a: Vec, b: Vec, radius: number, skip: string): { wz: Wizard; t: number } | null {
  const d = sub(b, a);
  const dd = dot(d, d);
  let best: { wz: Wizard; t: number } | null = null;
  for (const wz of w.wizards) {
    if (!wz.alive || wz.id === skip) continue;
    const t = dd > 0 ? Math.max(0, Math.min(1, dot(sub(wz.pos, a), d) / dd)) : 0;
    if (dist(add(a, scale(d, t)), wz.pos) > radius) continue;
    if (!best || t < best.t) best = { wz, t };
  }
  return best;
}

function nearestEnemy(w: World, to: Vec, skip: string): Wizard | null {
  let best: Wizard | null = null;
  for (const wz of w.wizards) {
    if (!wz.alive || wz.id === skip) continue;
    if (!best || dist(wz.pos, to) < dist(best.pos, to)) best = wz;
  }
  return best;
}

function cast(w: World, wz: Wizard, spell: SpellId, at: Vec) {
  const level = wz.spells[spell];
  if (!level || w.t < wz.cd[spell]) return;
  const L = spellLevel(spell, level);
  wz.cd[spell] = w.t + L.cd;
  const dir = norm(sub(at, wz.pos));
  wz.facing = Math.atan2(dir.y, dir.x);
  w.events.push({ k: 'cast', id: wz.id, spell });

  if (spell === 'fireball' || spell === 'homing') {
    const homing = spell === 'homing';
    w.projectiles.push({
      id: w.nextId++,
      kind: spell,
      owner: wz.id,
      pos: add(wz.pos, scale(dir, WIZ_R + PROJ_R + 0.05)),
      vel: scale(dir, L.speed),
      level,
      until: w.t + (homing ? L.duration : L.range / L.speed),
      target: homing ? (nearestEnemy(w, at, wz.id)?.id ?? null) : null,
    });
  } else if (spell === 'lightning') {
    const end = add(wz.pos, scale(dir, L.range));
    const found = firstOnSegment(w, wz.pos, end, WIZ_R, wz.id);
    if (!found) return void w.events.push({ k: 'lightning', from: wz.pos, to: end });
    const target = found.wz;
    w.events.push({ k: 'lightning', from: wz.pos, to: target.pos });
    if (shielded(w, target)) {
      w.events.push({ k: 'reflect', id: target.id, x: target.pos.x, y: target.pos.y });
      w.events.push({ k: 'lightning', from: target.pos, to: wz.pos });
      hit(w, wz, target.id, L.dmg, L.knock, scale(dir, -1));
    } else hit(w, target, wz.id, L.dmg, L.knock, dir);
  } else if (spell === 'shield') {
    wz.shieldUntil = w.t + L.duration;
  } else {
    const from = wz.pos;
    wz.pos = add(wz.pos, clampLen(sub(at, wz.pos), L.range));
    wz.target = null;
    w.events.push({ k: 'teleport', id: wz.id, from, to: wz.pos });
  }
}

function stepProjectiles(w: World) {
  const keep: Projectile[] = [];
  for (const p of w.projectiles) {
    const L = spellLevel(p.kind, p.level);
    const target = p.kind === 'homing' ? byId(w, p.target) : undefined;
    if (target) {
      // gira no máximo HOMING_TURN rad/s em direção ao alvo: o atraso faz o míssil rodear antes de acertar
      const cur = Math.atan2(p.vel.y, p.vel.x);
      const want = Math.atan2(target.pos.y - p.pos.y, target.pos.x - p.pos.x);
      const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
      const a = cur + Math.max(-HOMING_TURN * DT, Math.min(HOMING_TURN * DT, diff));
      const speed = len(p.vel);
      p.vel = v(Math.cos(a) * speed, Math.sin(a) * speed);
    }
    const next = add(p.pos, scale(p.vel, DT));
    const found = firstOnSegment(w, p.pos, next, WIZ_R + PROJ_R, p.owner);
    if (found) {
      const wz = found.wz;
      if (shielded(w, wz)) {
        // espelha a direção na normal do escudo e o projétil passa a ser de quem refletiu
        const n = norm(sub(p.pos, wz.pos));
        p.vel = sub(p.vel, scale(n, 2 * dot(p.vel, n)));
        p.owner = wz.id;
        p.target = p.kind === 'homing' ? (nearestEnemy(w, p.pos, wz.id)?.id ?? null) : null;
        p.until = w.t + (p.kind === 'homing' ? L.duration : L.range / L.speed);
        w.events.push({ k: 'reflect', id: wz.id, x: p.pos.x, y: p.pos.y });
        keep.push(p);
        continue;
      }
      hit(w, wz, p.owner, L.dmg, L.knock, p.vel);
      continue;
    }
    p.pos = next;
    if (w.t < p.until) keep.push(p);
  }
  w.projectiles = keep;
}

function separate(w: World) {
  const alive = w.wizards.filter((z) => z.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const d = sub(b.pos, a.pos);
      const l = len(d);
      const overlap = 2 * WIZ_R - l;
      if (overlap <= 0) continue;
      const push = scale(l > 1e-6 ? scale(d, 1 / l) : v(1, 0), overlap / 2);
      a.pos = sub(a.pos, push);
      b.pos = add(b.pos, push);
    }
  }
}

export function stepWorld(w: World, cmds: Cmd[]) {
  w.events = [];
  for (const c of cmds) {
    const wz = byId(w, c.id);
    if (!wz) continue;
    if (c.kind === 'move') wz.target = c.to;
    else if (c.kind === 'stop') wz.target = null;
    else cast(w, wz, c.spell, c.at);
  }

  if (w.t >= w.shrinkAt) {
    w.arenaR = Math.max(0, w.arenaR - ARENA_STEP);
    w.shrinkAt += SHRINK_EVERY;
    w.events.push({ k: 'shrink', r: w.arenaR });
  }

  for (const wz of w.wizards) if (wz.alive) moveWizard(wz, DT);
  separate(w);
  stepProjectiles(w);

  for (const wz of w.wizards) {
    if (!wz.alive) continue;
    if (len(wz.pos) > w.arenaR) wz.hp -= LAVA_DPS * DT;
    if (wz.hp > 0) continue;
    wz.hp = 0;
    wz.alive = false;
    wz.target = null;
    const by = wz.lastHitBy !== null && w.t - wz.lastHitAt <= CREDIT_WINDOW ? wz.lastHitBy : null;
    w.events.push({ k: 'death', id: wz.id, by });
  }
  w.t += DT;
}
