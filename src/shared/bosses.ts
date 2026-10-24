// Chefes da Campanha (Apagadores): cérebro próprio em vez do botCmds. O Sir Odran (desenho do Lucas, 20/10, nas notas da
// arena em levels/charneca.ts): investe em linha reta; se bater num pilar, o pilar cai e ele fica atordoado 3 s (a janela
// de dano). Pisão (Meteoro no próprio pé) em quem chega perto, Varredura (leque próprio, SWEEP) a meia distância. Com os 4 pilares no
// chão começa a fase 2: entram 2 Cinzentos e cada investida espalha cera pela arena. Números iniciais, a medir
import { DT, KB_PER_DMG, OBSTACLES, PROJ_SPAWN, UNIT } from './constants.ts';
import { CLUSTER_FAN, type Level } from './spells.ts';
import { bodyR, type Cmd, type World, type Wizard } from './sim.ts';
import { add, dist, norm, scale, sub, v, type Vec } from './vec.ts';

export const ODRAN = {
  perAceso: 0.5, // vida +50% por Aceso além do primeiro
  size: 2.5, // giant undead (Lucas, 24/10): body and model 2.5× a wizard; easier to hit, and his charge meets the pillars sooner
  kbResist: 0.7, // empurrão a menos: pesado, mas sai do lugar
  // investida cega: para e mira (windup s, com a linha no chão), depois corre reach m a speed m/s; quem ela atropelar leva dmg
  // every: s entre uma investida e a próxima; first: a primeira, depois que ele entra; min: não investe em quem está colado nele
  charge: { windup: 0.9, speed: 11, reach: 18, dmg: 90, every: 5, first: 2, min: 0.5 },
  stun: 3, // atordoado depois de derrubar um pilar
  stomp: 2.6, // Pisão em quem está a menos disso
  sweep: 7, // Varredura em quem está a menos disso
  switchEvery: 12, // a cada 12 s alterna entre o Aceso mais perto e o mais longe (puxa o grupo para junto)
  adds: 2, // Cinzentos que entram na fase 2
  wax: { r: 0.9, every: 0.18, life: 40 }, // poça de cera deixada pela investida na fase 2
};

// Odran's own Sweep (Fernando, 24/10): the old Rajada fan of 4 shots with its level-3 numbers, carried in the projectile's stats.
// The players' Rajada became the sand cone (PR #348); the boss kit is Lucas's design, so it keeps reach and knockback, no Blindness
export const SWEEP: Level = { cd: 14, dmg: 39, knock: 39 * KB_PER_DMG * 0.65, speed: 844 * UNIT, range: 672 * UNIT, heal: 0, blind: 0, incapacitate: 0, width: 0, duration: 0, radius: 0, dmgMin: 0, absorb: 0, pull: 0, scale: 0, dot: 0 };

// estado da luta (guardado na noite, Night.boss): fase, próxima investida, mira, investida em curso, atordoado
export type BossState = { phase: 1 | 2; next: number; windUntil: number; to: Vec | null; charging: boolean; aimed: boolean; last: Vec | null; stunUntil: number; moveAt: number; waxAt: number; down: boolean; sweepAt?: Vec };
export const newBoss = (t: number): BossState => ({ phase: 1, next: t + ODRAN.charge.first, windUntil: 0, to: null, charging: false, aimed: false, last: null, stunUntil: 0, moveAt: 0, waxAt: 0, down: false });

// vida máxima do chefe para este tamanho de grupo
export const bossHp = (base: number, acesos: number) => base * (1 + ODRAN.perAceso * Math.max(0, acesos - 1));

// alvo: o Aceso mais perto, ou o mais longe nos ciclos alternados
function targetOf(w: World, z: Wizard): Wizard | null {
  const foes = w.wizards.filter((o) => o.alive && o.team !== null && o.team !== z.team).sort((a, b) => dist(a.pos, z.pos) - dist(b.pos, z.pos));
  if (!foes.length) return null;
  return Math.floor(w.t / ODRAN.switchEvery) % 2 === 1 ? foes[foes.length - 1] : foes[0];
}

// antes do passo: o que o Odran faz agora. A investida é um avanço longo do próprio mago (dashUntil/dashVel), começado aqui
export function bossCmds(w: World, z: Wizard, s: BossState): Cmd[] {
  if (!z.alive || s.charging || w.t < s.stunUntil) return [];
  const C = ODRAN.charge;
  if (s.windUntil) {
    if (w.t < s.windUntil) return [];
    const dir = norm(sub(s.to!, z.pos));
    Object.assign(z, { dashUntil: w.t + C.reach / C.speed, dashVel: scale(dir, C.speed), dashHit: [], dashDmg: C.dmg, target: null });
    Object.assign(s, { windUntil: 0, charging: true, last: z.pos });
    return [];
  }
  const t = targetOf(w, z);
  if (!t) return [];
  const d = dist(t.pos, z.pos);
  if (w.t >= s.next && d > C.min && !z.casting) {
    const to = add(z.pos, scale(norm(sub(t.pos, z.pos)), C.reach));
    Object.assign(s, { windUntil: w.t + C.windup, to, aimed: false });
    z.target = null;
    return [{ id: z.id, kind: 'stop' }];
  }
  if (d < ODRAN.stomp && z.spells.meteor && w.t >= z.cd.meteor) return [{ id: z.id, kind: 'cast', spell: 'meteor', at: z.pos }];
  // fired after the step (afterBoss): the step clears w.events, and the 'fire' events drive the sound and the stats
  if (d < ODRAN.sweep && z.spells.cluster && w.t >= z.cd.cluster) return (z.cd.cluster = w.t + SWEEP.cd, s.sweepAt = t.pos, []);
  if (w.t < s.moveAt) return [];
  s.moveAt = w.t + 0.3;
  return [{ id: z.id, kind: 'move', to: t.pos }];
}

// depois do passo: a investida que encostou num pilar da arena (pillars = índices em w.pillars) derruba o pilar e atordoa;
// a que parou na parede ou chegou ao fim só acaba. Na fase 2 a investida deixa cera. Devolve 'phase2' no passo em que o
// último pilar cai
export function afterBoss(w: World, z: Wizard, s: BossState, pillars: number[]): 'phase2' | null {
  if (!z.alive) {
    if (!s.down) w.events.push({ k: 'boss', id: z.id, what: 'down', x: z.pos.x, y: z.pos.y });
    s.down = true;
    return null;
  }
  if (s.sweepAt) {
    const base = Math.atan2(s.sweepAt.y - z.pos.y, s.sweepAt.x - z.pos.x);
    for (const off of CLUSTER_FAN) {
      const d = v(Math.cos(base + off), Math.sin(base + off));
      w.projectiles.push({ id: w.nextId++, born: w.t, kind: 'cluster', owner: z.id, caster: z.id, pos: add(z.pos, scale(d, PROJ_SPAWN)), vel: scale(d, SWEEP.speed), level: 1, until: w.t + SWEEP.range / SWEEP.speed, target: null, dmgMult: 1, stats: SWEEP });
      w.events.push({ k: 'fire', id: z.id, src: 'cluster' });
    }
    s.sweepAt = undefined;
  }
  // o aviso sai depois do passo (o passo zera w.events): a linha da investida no chão durante a mira
  if (s.windUntil && !s.aimed) {
    s.aimed = true;
    w.events.push({ k: 'boss', id: z.id, what: 'aim', x: z.pos.x, y: z.pos.y, tx: s.to!.x, ty: s.to!.y });
  }
  if (!s.charging) return null;
  const end = (next: number) => {
    Object.assign(z, { dashUntil: 0, vel: v(0, 0), dashDmg: undefined });
    Object.assign(s, { charging: false, next });
  };
  const hit = pillars.find((i) => w.pillars[i].alive && dist(w.pillars[i].pos, z.pos) < OBSTACLES[w.pillars[i].kind].r + bodyR(z) + 0.15);
  if (hit !== undefined) {
    const q = w.pillars[hit];
    q.alive = false;
    w.events.push({ k: 'pillar', i: hit, x: q.pos.x, y: q.pos.y }, { k: 'clash', x: q.pos.x, y: q.pos.y, combo: 'pillar', r: 1.4 }, { k: 'boss', id: z.id, what: 'stun', x: z.pos.x, y: z.pos.y });
    s.stunUntil = w.t + ODRAN.stun;
    end(s.stunUntil + ODRAN.charge.every);
    if (s.phase === 1 && pillars.every((i) => !w.pillars[i].alive)) {
      s.phase = 2;
      w.events.push({ k: 'boss', id: z.id, what: 'phase2', x: z.pos.x, y: z.pos.y });
      return 'phase2';
    }
    return null;
  }
  // parede (andou menos da metade do que devia neste passo) ou fim do avanço
  const stuck = s.last && dist(s.last, z.pos) < ODRAN.charge.speed * DT * 0.5;
  if (w.t >= z.dashUntil || stuck) return end(w.t + ODRAN.charge.every), null;
  s.last = z.pos;
  if (s.phase === 2 && w.t >= s.waxAt) {
    w.zones.push({ pos: z.pos, r: ODRAN.wax.r, kind: 'slow', until: w.t + ODRAN.wax.life, by: z.id });
    s.waxAt = w.t + ODRAN.wax.every;
  }
  return null;
}
