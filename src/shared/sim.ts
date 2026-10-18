// Simulação 2D da arena. Pura: o servidor roda a 60 passos/s; o cliente usa moveWizard para prever o próprio mago.
import {
  ARENA_MIN, ARENA_STEP, CHEST, CREDIT_WINDOW, ZONES, DM_RESPAWN, DM_SPAWN_GAP, OBSTACLES, OBSTACLE_KINDS, PILLAR, type ObstacleKind, DT, FRICTION, HP_MAX, HP_REGEN, INVULN_TIME, KB_PER_DMG, KB_SOFT_CAP, KNOCK_HP_SCALE, LAVA_DPS, LAVA_KB_FACTOR, PROJ_R, SHRINK_EVERY, SPAWN_INSET, STUN_SPEED,
  WIZ_R, WIZ_SPEED, arenaRadius,
} from './constants.ts';
import { ACTIVE_ITEMS, ITEM_CAST, PACT, REDIRECTOR, SCOURGE, itemStats, noItems, type ItemId } from './items.ts';
import { BOOMERANG, BOUNCER, CAST_POINT, CLUSTER_FAN, GRAVITY, GRIP, HOMING_TURN, METEOR_DELAY, RUSH, SPELL_IDS, THRUST, spellLevel, type SpellId } from './spells.ts';
import { add, clampLen, dist, dot, len, norm, scale, sub, v, type Vec } from './vec.ts';

export type Wizard = {
  id: string;
  pos: Vec;
  vel: Vec; // só o empurrão; andar não entra aqui
  target: Vec | null;
  facing: number;
  hp: number;
  dmgTaken: number; // dano acumulado na rodada: quanto maior, mais longe o mago voa
  alive: boolean;
  shieldUntil: number;
  lastHitBy: string | null;
  lastHitAt: number;
  lastHitSrc: string; // fonte do último golpe, para a causa da morte nos dados
  shieldR: number; // raio da bolha do escudo (cresce com o nível)
  lootProg: number; // segundos em cima do monte de ouro desde o último ouro
  zone: number; // 1 = no chão lento, 2 = no chão queimando (recalculado a cada passo)
  spells: Record<SpellId, number>; // nível; 0 = não tem
  cd: Record<SpellId, number>; // instante (w.t) em que fica pronta
  items: Record<ItemId, number>;
  itemCd: Record<ItemId, number>;
  hpMax: number;
  regen: number;
  kbResist: number; // fração de empurrão a menos (itens)
  baseSpeed: number;
  speed: number; // velocidade de andar agora (botas, Investida, preso)
  debuffMult: number; // duração de lentidões e penalidades
  kbPenaltyUntil: number; // Redirecionador: voa mais longe até este instante
  pactUntil: number; // Pacto armado até este instante
  gripUntil: number; // preso (Agarrar): não anda, leva menos empurrão
  rushUntil: number; // Investida ativa até este instante
  rushLeft: number; // dano que a Investida ainda pode absorver
  rushBonus: number; // velocidade extra da Investida agora (m/s)
  dashUntil: number; // avanço da Investida em curso até este instante
  dashVel: Vec; // velocidade do avanço (m/s)
  dashHit: string[]; // quem este avanço já acertou
  thrustUntil: number; // Estocada em curso até este instante (0 = nenhuma)
  thrustAcc: Vec; // aceleração da Estocada (m/s²)
  thrustMult: number; // Pacto na Estocada
  invulnUntil: number;
  respawnAt: number; // deathmatch: instante (w.t) em que o morto volta
  durF: number; // maestria de duração (multiplica escudo e pacto)
  rangeF: number; // maestria de alcance
  lifesteal: number; // fração do dano causado que volta como vida
  team: number | null; // modo Times: 0 ou 1; fora dele null (ninguém é aliado)
  // magia ou item sendo conjurado: sai em fireAt e o mago fica parado até lá (pedido do Fernando, 17/10:
  // clicar para andar não cancela); o clique de andar fica guardado em `then` e vale quando a magia sai
  casting: { spell?: SpellId; item?: ItemId; at: Vec; fireAt: number; then?: Vec | null } | null;
};

// meteor fica parado no ponto de impacto até `until` e então explode; swap e grip não causam dano
// boomerang curva e volta ao dono; gravity não bate em mago, só puxa; bouncer pula de mago em mago
export const PROJ_KINDS = ['fireball', 'homing', 'swap', 'grip', 'meteor', 'cluster', 'boomerang', 'gravity', 'bouncer'] as const;
export type ProjKind = (typeof PROJ_KINDS)[number];

export type Projectile = {
  id: number;
  kind: ProjKind;
  owner: string;
  pos: Vec;
  vel: Vec;
  level: number;
  until: number;
  target: string | null;
  dmgMult: number; // Pacto
  caster: string; // quem lançou (o dono muda quando um escudo reflete)
  dest?: Vec; // Troca: aonde o mago vai se ela não tocar ninguém (o ponto da mira)
  curve?: { acc: Vec; next: Vec; flipAt: number; stopAt: number }; // Bumerangue indo: aceleração agora, a da volta e quando trocam
  back?: boolean; // Bumerangue voltando ao dono
  prev?: string; // Ricochete: último mago tocado (não bate nele de novo em seguida)
  tick?: number; // Gravidade: próximo dano
  landed?: boolean; // já contou 'land' (Bumerangue e Ricochete acertam mais de uma vez)
};

export type Cmd =
  | { id: string; kind: 'move'; to: Vec }
  | { id: string; kind: 'stop' }
  | { id: string; kind: 'cast'; spell: SpellId; at: Vec }
  | { id: string; kind: 'item'; item: ItemId; at: Vec };

export type SimEvent =
  | { k: 'cast'; id: string; spell: SpellId }
  | { k: 'hit'; id: string; by: string; x: number; y: number; dmg: number; src: string }
  | { k: 'reflect'; id: string; x: number; y: number }
  | { k: 'lightning'; from: Vec; to: Vec }
  | { k: 'teleport'; id: string; from: Vec; to: Vec }
  | { k: 'grip'; id: string; x: number; y: number }
  | { k: 'death'; id: string; by: string | null; src: string } // src: o que empurrou por último (dentro da janela de crédito) ou 'lava'
  | { k: 'gold'; id: string; n: number; x: number; y: number }
  | { k: 'shrink'; r: number }
  | { k: 'item'; id: string; item: ItemId }
  | { k: 'scourge'; id: string; x: number; y: number; r: number }
  | { k: 'redirect'; x: number; y: number }
  | { k: 'clash'; x: number; y: number; combo: Combo; r: number }
  | { k: 'pillar'; i: number; x: number; y: number }
  | { k: 'chest'; x: number; y: number } // baú apareceu
  | { k: 'loot'; id: string; x: number; y: number } // alguém ganhou 1 de ouro em cima do monte
  // estatística de precisão: 'fire' quando uma magia de dano sai, 'land' quando ela acerta um inimigo (uma vez por projétil; a Rajada conta os 4)
  | { k: 'fire'; id: string; src: AimSrc }
  | { k: 'land'; id: string; src: AimSrc };

// as de utilidade (teleport, shield, swap, grip, rush, pact, redirector) contam uso em 'fire' e, quando pegam alguém, 'land'
export type AimSrc = 'fireball' | 'lightning' | 'homing' | 'scourge' | 'meteor' | 'cluster' | 'teleport' | 'shield' | 'swap' | 'grip' | 'rush' | 'pact' | 'redirector'
  | 'boomerang' | 'thrust' | 'gravity' | 'rockpillar' | 'bouncer';

// choque de magias: fogo×fogo, fogo×míssil, míssil×míssil, e o raio detonando uma bola de fogo
export type Combo = 'fire' | 'arcane' | 'pulse' | 'detonate' | 'pillar';

export type Pillar = { pos: Vec; hp: number; alive: boolean; kind: ObstacleKind; until?: number }; // until: some sozinho (Pilar de pedra)

export type Zone = { pos: Vec; r: number; kind: 'burn' | 'slow' | 'pull'; until: number };

export type World = {
  t: number;
  arenaR: number;
  shrinkAt: number;
  wizards: Wizard[];
  projectiles: Projectile[];
  pillars: Pillar[];
  zones: Zone[]; // chão com efeito deixado pelos choques
  loots: { pos: Vec; left: number; until: number }[]; // montes de ouro dos baús quebrados
  chestAt: number; // quando o próximo baú aparece
  events: SimEvent[];
  nextId: number;
  dm: boolean; // deathmatch: a arena não encolhe e quem morre volta depois de DM_RESPAWN s
};

export function newWorld(
  ids: string[],
  spells: Record<string, Record<SpellId, number>>,
  items: Record<string, Record<ItemId, number>> = {},
  pillarCount = 0,
  rand: () => number = Math.random,
  dm = false,
  teams: Record<string, number> = {}, // modo Times: id → time
): World {
  const arenaR = arenaRadius(ids.length);
  const r = arenaR - SPAWN_INSET;
  const wizards = ids.map((id, i): Wizard => {
    const a = (i / ids.length) * Math.PI * 2;
    const own = { ...noItems(), ...items[id] };
    const st = itemStats(own);
    return {
      id,
      pos: v(Math.cos(a) * r, Math.sin(a) * r),
      vel: v(0, 0),
      target: null,
      facing: a + Math.PI,
      hp: HP_MAX + st.hp,
      dmgTaken: 0,
      alive: true,
      shieldUntil: 0,
      lastHitBy: null,
      lastHitSrc: '',
      zone: 0,
      shieldR: 0,
      lootProg: 0,
      lastHitAt: -1e9,
      spells: { ...spells[id] },
      cd: Object.fromEntries(SPELL_IDS.map((s) => [s, 0])) as Record<SpellId, number>,
      items: own,
      itemCd: noItems(),
      hpMax: HP_MAX + st.hp,
      regen: HP_REGEN + st.regen,
      kbResist: st.kb,
      baseSpeed: WIZ_SPEED + st.speed,
      speed: WIZ_SPEED + st.speed,
      debuffMult: Math.max(0, 1 + st.debuff),
      kbPenaltyUntil: 0,
      pactUntil: 0,
      gripUntil: 0,
      rushUntil: 0,
      rushLeft: 0,
      rushBonus: 0,
      dashUntil: 0,
      dashVel: v(0, 0),
      dashHit: [],
      thrustUntil: 0,
      thrustAcc: v(0, 0),
      thrustMult: 1,
      invulnUntil: INVULN_TIME,
      respawnAt: 0,
      durF: 1, // maestrias de Duração e Alcance tiradas (17/10); os multiplicadores ficam em 1
      rangeF: 1,
      lifesteal: st.lifesteal,
      team: teams[id] ?? null,
      casting: null,
    };
  });
  return { t: 0, arenaR, shrinkAt: SHRINK_EVERY, wizards, projectiles: [], pillars: placePillars(pillarCount, wizards.map((z) => z.pos), rand), zones: [], loots: [], chestAt: CHEST.first, events: [], nextId: 1, dm };
}

// sorteia pilares longe de onde os magos nascem e longe uns dos outros
function pickKind(r: number): ObstacleKind {
  const total = OBSTACLE_KINDS.reduce((s, k) => s + OBSTACLES[k].weight, 0);
  let acc = 0;
  for (const k of OBSTACLE_KINDS) {
    acc += OBSTACLES[k].weight / total;
    if (r < acc) return k;
  }
  return 'pillar';
}

function placePillars(n: number, spawns: Vec[], rand: () => number): Pillar[] {
  const out: Pillar[] = [];
  for (let tries = 0; out.length < n && tries < n * 60; tries++) {
    const pos = v((rand() * 2 - 1) * PILLAR.spread, (rand() * 2 - 1) * PILLAR.spread);
    if (spawns.some((s) => dist(s, pos) < 2) || out.some((p) => dist(p.pos, pos) < 2)) continue;
    const kind = pickKind(rand());
    out.push({ pos, hp: OBSTACLES[kind].hp, alive: true, kind });
  }
  return out;
}

export const isSliding = (wz: Wizard) => len(wz.vel) > STUN_SPEED;

export function moveWizard(wz: Wizard, dt: number) {
  if (wz.target && !isSliding(wz)) {
    const d = sub(wz.target, wz.pos);
    const l = len(d);
    const step = (wz.speed ?? WIZ_SPEED) * dt;
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
// modo Times: do mesmo time e não é a própria pessoa
const allies = (a: Wizard | undefined, b: Wizard) => !!a && a !== b && a.team !== null && a.team === b.team;

// src: o que causou o dano (magia, item, choque ou pilar), para o placar e os dados de balanceamento
function hit(w: World, target: Wizard, by: string, dmg: number, knock: number, dir: Vec, src = 'outro') {
  // invulnerável: sem dano nem empurrão, mas o acerto aparece (explosão e som), senão o projétil sumiria sem efeito
  if (w.t < target.invulnUntil) return void w.events.push({ k: 'hit', id: target.id, by, x: target.pos.x, y: target.pos.y, dmg: 0, src });
  const penalty = w.t < target.kbPenaltyUntil ? REDIRECTOR.kbPenalty : 0;
  const gripped = w.t < target.gripUntil ? GRIP.kbCut : 0;
  // como no mod de Dota 2 (pawn.lua): acima de 10 de dano por golpe o empurrão cresce pela raiz, não em linha reta
  const big = dmg > KB_SOFT_CAP ? Math.sqrt(KB_SOFT_CAP * dmg) / dmg : 1;
  const mult = big * (1 + (KNOCK_HP_SCALE * target.dmgTaken) / HP_MAX) * Math.max(0, 1 - target.kbResist + penalty - gripped);
  // fogo amigo: só empurra; sem dano, sem roubo de vida e sem crédito de abate para o aliado
  if (allies(w.wizards.find((z) => z.id === by), target)) {
    target.vel = add(target.vel, scale(norm(dir), knock * mult));
    return void w.events.push({ k: 'hit', id: target.id, by, x: target.pos.x, y: target.pos.y, dmg: 0, src });
  }
  // Investida: depois do empurrão, absorve metade do golpe (de outro mago) e converte em velocidade
  if (w.t < target.rushUntil && by !== target.id && target.rushLeft > 0) {
    const absorbed = Math.min(target.rushLeft, dmg * RUSH.share);
    target.rushLeft -= absorbed;
    target.rushBonus += absorbed * RUSH.perHp;
    dmg -= absorbed;
  }
  target.hp -= dmg;
  target.dmgTaken += dmg;
  target.vel = add(target.vel, scale(norm(dir), knock * mult));
  target.lastHitBy = by;
  target.lastHitSrc = src;
  target.lastHitAt = w.t;
  // roubo de vida: quem acertou recupera parte do dano (e, como no original, a cura reduz o dano acumulado pela metade dela)
  const thief = by !== target.id ? byId(w, by) : undefined;
  if (thief && thief.lifesteal > 0) {
    const heal = dmg * thief.lifesteal;
    thief.hp = Math.min(thief.hpMax, thief.hp + heal);
    thief.dmgTaken = Math.max(0, thief.dmgTaken - heal * 0.5);
  }
  w.events.push({ k: 'hit', id: target.id, by, x: target.pos.x, y: target.pos.y, dmg: Math.round(dmg * 10) / 10, src });
}

// primeiro mago (fora os excluídos) que o segmento a→b toca; t em [0,1] ao longo do segmento
function firstOnSegment(w: World, a: Vec, b: Vec, radius: number, skip: string): { wz: Wizard; t: number } | null {
  const d = sub(b, a);
  const dd = dot(d, d);
  let best: { wz: Wizard; t: number } | null = null;
  for (const wz of w.wizards) {
    if (!wz.alive || wz.id === skip) continue;
    const t = dd > 0 ? Math.max(0, Math.min(1, dot(sub(wz.pos, a), d) / dd)) : 0;
    // com escudo, a bolha (maior que o mago) é que encosta
    if (dist(add(a, scale(d, t)), wz.pos) > radius + (w.t < wz.shieldUntil ? Math.max(0, wz.shieldR - WIZ_R) : 0)) continue;
    if (!best || t < best.t) best = { wz, t };
  }
  return best;
}

// só bola de fogo e míssil se chocam entre si e com o raio; as outras magias atravessam
const clashes = (p: Projectile) => p.kind === 'fireball' || p.kind === 'homing';

// bola de fogo de qualquer dono ou míssil de outro dono no caminho do raio
function firstProjectileOnSegment(w: World, a: Vec, b: Vec, caster: string): { p: Projectile; t: number } | null {
  const d = sub(b, a);
  const dd = dot(d, d);
  let best: { p: Projectile; t: number } | null = null;
  for (const p of w.projectiles) {
    if (!clashes(p) || (p.kind === 'homing' && p.owner === caster)) continue;
    const t = dd > 0 ? Math.max(0, Math.min(1, dot(sub(p.pos, a), d) / dd)) : 0;
    if (dist(add(a, scale(d, t)), p.pos) > PROJ_R + 0.15) continue;
    if (!best || t < best.t) best = { p, t };
  }
  return best;
}

// explosão em área: dano e empurrão em todos dentro do raio (inclusive donos); falloff = dano cai até zero na borda
function area(w: World, at: Vec, radius: number, dmg: number, kbFactor: number, by: string | null, falloff: boolean, combo: Combo) {
  for (const o of w.wizards) {
    if (!o.alive) continue;
    const d = dist(o.pos, at);
    if (d > radius + WIZ_R) continue;
    const k = falloff ? Math.max(0, 1 - d / (radius + WIZ_R)) : 1;
    const amount = dmg * k;
    if (amount <= 0.05) continue;
    hit(w, o, by && by !== o.id ? by : (o.lastHitBy ?? by ?? o.id), amount, amount * KB_PER_DMG * kbFactor, sub(o.pos, at), 'choque:' + combo);
  }
  w.events.push({ k: 'clash', x: at.x, y: at.y, combo, r: radius });
  const kind = combo === 'fire' || combo === 'detonate' ? 'burn' : combo === 'arcane' ? 'slow' : combo === 'pulse' ? 'pull' : null;
  if (kind) w.zones.push({ pos: at, r: radius * ZONES.size, kind, until: w.t + (combo === 'detonate' ? 3.5 : ZONES[kind].secs) });
}

// combinações quando dois projéteis de donos diferentes se encontram (minha decisão; no original os dois só somem)
// (mais fortes e maiores a pedido do Fernando, 17/10)
export const CLASH = {
  fire: { r: 2.0, dmg: 7, kb: 1.3 },
  arcane: { r: 2.6, dmg: 9, kb: 1.6 },
  pulse: { r: 1.6, dmg: 5, kb: 1.1 },
  detonate: { r: 2.0 }, // original 225 unidades (1,46 m)
};

function clashProjectiles(w: World) {
  const gone = new Set<Projectile>();
  for (let i = 0; i < w.projectiles.length; i++) {
    const a = w.projectiles[i];
    if (gone.has(a) || !clashes(a)) continue;
    for (let j = i + 1; j < w.projectiles.length; j++) {
      const b = w.projectiles[j];
      if (gone.has(b) || !clashes(b) || a.owner === b.owner || dist(a.pos, b.pos) > PROJ_R * 2 + 0.1) continue;
      gone.add(a);
      gone.add(b);
      const at = scale(add(a.pos, b.pos), 0.5);
      const combo: Combo = a.kind === b.kind ? (a.kind === 'fireball' ? 'fire' : 'pulse') : 'arcane';
      const c = CLASH[combo];
      area(w, at, c.r, c.dmg * Math.max(a.dmgMult, b.dmgMult), c.kb, null, true, combo);
      break;
    }
  }
  if (gone.size) w.projectiles = w.projectiles.filter((p) => !gone.has(p));
}

function firstPillarOnSegment(w: World, a: Vec, b: Vec, radius: number): { i: number; t: number } | null {
  const d = sub(b, a);
  const dd = dot(d, d);
  let best: { i: number; t: number } | null = null;
  w.pillars.forEach((p, i) => {
    if (!p.alive) return;
    const t = dd > 0 ? Math.max(0, Math.min(1, dot(sub(p.pos, a), d) / dd)) : 0;
    if (dist(add(a, scale(d, t)), p.pos) > OBSTACLES[p.kind].r + radius) return;
    if (!best || t < best.t) best = { i, t };
  });
  return best;
}

function damagePillar(w: World, i: number, dmg: number, by: string | null) {
  const p = w.pillars[i];
  p.hp -= dmg;
  w.events.push({ k: 'pillar', i, x: p.pos.x, y: p.pos.y });
  if (p.hp > 0) return;
  p.alive = false;
  const o = OBSTACLES[p.kind];
  if (p.kind === 'chest') w.loots.push({ pos: p.pos, left: CHEST.pile, until: w.t + CHEST.pileSecs });
  if (o.blastR > 0) area(w, p.pos, o.blastR, o.blastDmg, 1, by, true, 'pillar');
  else w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'pillar', r: o.r * 1.5 });
}

// magos não atravessam pilares: empurra para fora e corta o deslize na direção do pilar
function blockPillars(w: World) {
  for (const p of w.pillars) {
    if (p.alive && p.until !== undefined && w.t >= p.until) {
      // o Pilar de pedra acaba: some sem explodir (removeObstacle do original)
      p.alive = false;
      w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'pillar', r: OBSTACLES[p.kind].r * 1.5 });
    }
    if (!p.alive) continue;
    for (const wz of w.wizards) {
      if (!wz.alive) continue;
      const d = sub(wz.pos, p.pos);
      const l = len(d);
      const min = OBSTACLES[p.kind].r + WIZ_R;
      if (l >= min) continue;
      const n = l > 1e-6 ? scale(d, 1 / l) : v(1, 0);
      wz.pos = add(p.pos, scale(n, min));
      const into = dot(wz.vel, n);
      if (into < 0) wz.vel = sub(wz.vel, scale(n, into * 1.5)); // quica de leve
    }
  }
}

// o mais perto, fora skip; nos Times, também fora o time do dono (só inimigos)
function nearestEnemy(w: World, to: Vec, skip: string, owner = skip): Wizard | null {
  const team = w.wizards.find((z) => z.id === owner)?.team ?? null;
  let best: Wizard | null = null;
  for (const wz of w.wizards) {
    if (!wz.alive || wz.id === skip || (team !== null && wz.team === team)) continue;
    if (!best || dist(wz.pos, to) < dist(best.pos, to)) best = wz;
  }
  return best;
}

function cast(w: World, wz: Wizard, spell: SpellId, at: Vec) {
  const level = wz.spells[spell];
  if (!level || w.t < wz.cd[spell]) return;
  const L = spellLevel(spell, level);
  wz.cd[spell] = w.t + L.cd;
  if (w.t < wz.gripUntil) wz.dmgTaken += GRIP.castPenalty; // preso, cada magia custa mais empurrão
  const dmgMult = L.dmg > 0 ? usePact(w, wz) : 1;
  const dir = norm(sub(at, wz.pos));
  wz.facing = Math.atan2(dir.y, dir.x);

  // projétil reto saindo do mago; life em segundos (já com a maestria de alcance)
  const launch = (kind: ProjKind, d: Vec, life: number, target: string | null = null, from = add(wz.pos, scale(d, WIZ_R + PROJ_R + 0.05))) =>
    w.projectiles.push({ id: w.nextId++, kind, owner: wz.id, pos: from, vel: scale(d, L.speed), level, until: w.t + life, target, dmgMult, caster: wz.id });

  if (spell === 'fireball' || spell === 'homing') {
    const homing = spell === 'homing';
    launch(spell, dir, (homing ? L.duration : L.range / L.speed) * wz.rangeF, homing ? (nearestEnemy(w, at, wz.id)?.id ?? null) : null);
    w.events.push({ k: 'fire', id: wz.id, src: spell });
  } else if (spell === 'cluster') {
    const base = Math.atan2(dir.y, dir.x);
    for (const off of CLUSTER_FAN) {
      launch('cluster', v(Math.cos(base + off), Math.sin(base + off)), (L.range / L.speed) * wz.rangeF);
      w.events.push({ k: 'fire', id: wz.id, src: 'cluster' });
    }
  } else if (spell === 'grip') {
    w.events.push({ k: 'fire', id: wz.id, src: 'grip' });
    launch('grip', dir, (L.range / L.speed) * wz.rangeF);
  } else if (spell === 'swap') {
    w.events.push({ k: 'fire', id: wz.id, src: 'swap' });
    // voa o alcance todo e troca com o primeiro mago que tocar; sem ninguém, o mago vai ao ponto da mira
    // (no original parava no clique e errava quem se mexia; mudança a pedido do Fernando, 17/10)
    launch('swap', dir, (L.range * wz.rangeF) / L.speed, null, wz.pos);
    // errou: vai só até a metade do caminho até a mira (pedido do Fernando, 17/10)
    w.projectiles[w.projectiles.length - 1].dest = add(wz.pos, scale(clampLen(sub(at, wz.pos), L.range * wz.rangeF), 0.5));
  } else if (spell === 'meteor') {
    const to = add(wz.pos, clampLen(sub(at, wz.pos), L.range * wz.rangeF));
    w.projectiles.push({ id: w.nextId++, kind: 'meteor', owner: wz.id, pos: to, vel: v(0, 0), level, until: w.t + METEOR_DELAY, target: null, dmgMult, caster: wz.id });
    w.events.push({ k: 'fire', id: wz.id, src: 'meteor' });
  } else if (spell === 'rush') {
    w.events.push({ k: 'fire', id: wz.id, src: 'rush' });
    wz.rushUntil = w.t + L.duration * wz.durF;
    wz.rushLeft = L.absorb;
    wz.rushBonus = RUSH.bonus;
    wz.dashUntil = w.t + RUSH.dashTime - DT / 2; // meio passo de folga: o arredondamento daria um passo a mais
    wz.dashVel = scale(dir, RUSH.dash / RUSH.dashTime);
    wz.dashHit = [];
    wz.target = null;
  } else if (spell === 'boomerang') {
    w.events.push({ k: 'fire', id: wz.id, src: 'boomerang' });
    // boomerang.lua e boomerangprojectile.lua: velocidade e acelerações que levam ao ponto (300 a 800 u) em curva e trazem de volta
    const d = Math.min(Math.max(len(sub(at, wz.pos)), BOOMERANG.minDist), L.range * wz.rangeF);
    const perp = v(-dir.y, dir.x);
    const par = -(L.speed * L.speed) / (2 * d);
    const side = (2 * par * BOOMERANG.side) / L.speed;
    const flip = -L.speed / par;
    launch('boomerang', dir, BOOMERANG.life);
    const p = w.projectiles[w.projectiles.length - 1];
    p.vel = add(scale(dir, L.speed), scale(perp, BOOMERANG.side));
    p.curve = { acc: add(scale(dir, par), scale(perp, side)), next: sub(scale(dir, par), scale(perp, side)), flipAt: w.t + flip, stopAt: w.t + 2 * flip - 0.15 };
  } else if (spell === 'gravity') {
    w.events.push({ k: 'fire', id: wz.id, src: 'gravity' });
    launch('gravity', dir, (L.range / L.speed) * wz.rangeF);
    w.projectiles[w.projectiles.length - 1].tick = w.t + GRAVITY.tick;
  } else if (spell === 'bouncer') {
    w.events.push({ k: 'fire', id: wz.id, src: 'bouncer' });
    launch('bouncer', dir, (L.range / L.speed) * wz.rangeF);
    w.projectiles[w.projectiles.length - 1].prev = wz.id;
  } else if (spell === 'thrust') {
    // thrust.lua: sai a 77% da velocidade rumo ao ponto (até 900 u) e acelera; dura o caminho + 0,09 s
    w.events.push({ k: 'fire', id: wz.id, src: 'thrust' });
    const d = Math.min(len(sub(at, wz.pos)), L.range);
    wz.vel = scale(dir, THRUST.start * L.speed);
    wz.thrustAcc = scale(dir, L.speed * THRUST.accel);
    wz.thrustUntil = w.t + THRUST.extra + d / L.speed;
    wz.thrustMult = dmgMult;
    wz.target = null;
  } else if (spell === 'rockpillar') {
    // rockpillar.lua: obstáculo no ponto (até o alcance) que some depois da duração (com a maestria de duração)
    w.events.push({ k: 'fire', id: wz.id, src: 'rockpillar' });
    const pos = add(wz.pos, clampLen(sub(at, wz.pos), L.range));
    w.pillars.push({ pos, hp: OBSTACLES.rockpillar.hp, alive: true, kind: 'rockpillar', until: w.t + L.duration * wz.durF });
  } else if (spell === 'lightning') {
    w.events.push({ k: 'fire', id: wz.id, src: 'lightning' });
    const end = add(wz.pos, scale(dir, L.range * wz.rangeF));
    const found = firstOnSegment(w, wz.pos, end, WIZ_R, wz.id);
    const proj = firstProjectileOnSegment(w, wz.pos, end, wz.id);
    const pil = firstPillarOnSegment(w, wz.pos, end, 0.1);
    if (pil && (!found || pil.t < found.t) && (!proj || pil.t < proj.t)) {
      const at = w.pillars[pil.i].pos;
      w.events.push({ k: 'lightning', from: wz.pos, to: at });
      damagePillar(w, pil.i, L.dmg * dmgMult, wz.id);
      return;
    }
    if (proj && (!found || proj.t < found.t)) {
      w.events.push({ k: 'lightning', from: wz.pos, to: proj.p.pos });
      w.projectiles = w.projectiles.filter((q) => q !== proj.p);
      // como no original: dano máximo 2/3 de (dano do raio + 7), caindo até zero na borda, empurrão 1,35×
      if (proj.p.kind === 'fireball') area(w, proj.p.pos, CLASH.detonate.r, (2 / 3) * (L.dmg * dmgMult + 7), 1.35, wz.id, true, 'detonate');
      else w.events.push({ k: 'clash', x: proj.p.pos.x, y: proj.p.pos.y, combo: 'pulse', r: 0.6 });
      return;
    }
    if (!found) return void w.events.push({ k: 'lightning', from: wz.pos, to: end });
    const target = found.wz;
    w.events.push({ k: 'lightning', from: wz.pos, to: target.pos });
    if (shielded(w, target)) {
      w.events.push({ k: 'reflect', id: target.id, x: target.pos.x, y: target.pos.y });
      w.events.push({ k: 'lightning', from: target.pos, to: wz.pos });
      hit(w, wz, target.id, L.dmg * dmgMult, L.knock * dmgMult, scale(dir, -1), 'lightning');
    } else {
      hit(w, target, wz.id, L.dmg * dmgMult, L.knock * dmgMult, dir, 'lightning');
      w.events.push({ k: 'land', id: wz.id, src: 'lightning' });
    }
  } else if (spell === 'shield') {
    w.events.push({ k: 'fire', id: wz.id, src: 'shield' });
    wz.shieldUntil = w.t + L.duration * wz.durF;
    wz.shieldR = L.radius;
  } else {
    // teleport
    w.events.push({ k: 'fire', id: wz.id, src: 'teleport' });
    const from = wz.pos;
    wz.pos = add(wz.pos, clampLen(sub(at, wz.pos), L.range * wz.rangeF));
    wz.target = null;
    w.events.push({ k: 'teleport', id: wz.id, from, to: wz.pos });
  }
}

// Pacto armado: esta magia sai 2× mais forte (dano e empurrão) e o Pacto acaba
function usePact(w: World, wz: Wizard): number {
  if (w.t >= wz.pactUntil) return 1;
  wz.pactUntil = 0;
  return PACT.mult;
}

// começa a conjurar: confere nível e recarga agora; o efeito sai depois do tempo de conjuração
function beginCast(w: World, wz: Wizard, what: { spell?: SpellId; item?: ItemId }, at: Vec) {
  // a mesma magia já sendo conjurada: ignora a tecla repetida (a recarga só começa quando ela sai)
  if (wz.casting && wz.casting.spell === what.spell && wz.casting.item === what.item) return;
  // Flagelo em preparo: nada mais sai até ele explodir, menos o Teleporte, que cancela a explosão (pedidos do Fernando, 17/10)
  if (wz.casting?.item === 'scourge') {
    if (what.spell !== 'teleport') return;
    wz.casting = null;
  }
  if (what.spell) {
    if (!wz.spells[what.spell] || w.t < wz.cd[what.spell]) return;
  } else if (what.item) {
    if (!wz.items[what.item] || !ACTIVE_ITEMS.includes(what.item) || w.t < wz.itemCd[what.item]) return;
  }
  const delay = what.spell ? CAST_POINT[what.spell] : (ITEM_CAST[what.item!] ?? 0);
  const d = sub(at, wz.pos);
  if (len(d) > 0.01) wz.facing = Math.atan2(d.y, d.x);
  if (what.spell) w.events.push({ k: 'cast', id: wz.id, spell: what.spell });
  else w.events.push({ k: 'item', id: wz.id, item: what.item! });
  if (delay <= 0) return fire(w, wz, what, at);
  wz.target = null;
  wz.casting = { ...what, at, fireAt: w.t + delay };
}

function fire(w: World, wz: Wizard, what: { spell?: SpellId; item?: ItemId }, at: Vec) {
  if (what.spell) cast(w, wz, what.spell, at);
  else useItem(w, wz, what.item!, at);
}

function useItem(w: World, wz: Wizard, item: ItemId, at: Vec) {
  const level = wz.items[item];
  if (!level || !ACTIVE_ITEMS.includes(item) || w.t < wz.itemCd[item]) return;
  if (item === 'scourge') {
    wz.itemCd.scourge = w.t + SCOURGE.cd;
    scourge(w, wz);
  } else if (item === 'pact') {
    w.events.push({ k: 'fire', id: wz.id, src: 'pact' });
    wz.itemCd.pact = w.t + PACT.cd;
    wz.pactUntil = w.t + PACT.window * wz.durF;
  } else {
    w.events.push({ k: 'fire', id: wz.id, src: 'redirector' });
    wz.itemCd.redirector = w.t + REDIRECTOR.cd;
    wz.kbPenaltyUntil = w.t + REDIRECTOR.penaltyTime * wz.debuffMult;
    let best: Projectile | null = null;
    for (const p of w.projectiles) if (p.owner === wz.id && p.kind !== 'meteor' && (!best || dist(p.pos, at) < dist(best.pos, at))) best = p;
    if (!best) return;
    best.vel = scale(norm(sub(at, best.pos)), len(best.vel));
    best.until += REDIRECTOR.extraLife;
    best.target = null; // o míssil passa a seguir reto para onde foi mandado
    w.events.push({ k: 'redirect', x: best.pos.x, y: best.pos.y });
  }
}

// Flagelo: explosão em volta; quanto mais perto do centro, mais empurrão (no original custava a mesma vida a quem usa;
// aqui não custa nada, a pedido do Fernando em 17/10)
function scourge(w: World, wz: Wizard) {
  const mult = usePact(w, wz);
  const dmg = SCOURGE.dmg[wz.items.scourge - 1] * mult;
  w.events.push({ k: 'fire', id: wz.id, src: 'scourge' });
  let landed = false;
  for (const o of w.wizards) {
    if (!o.alive || o.id === wz.id) continue;
    const d = dist(o.pos, wz.pos);
    if (d > SCOURGE.radius + WIZ_R) continue;
    const factor = 0.75 + 0.25 * Math.max(0, 1 - d / SCOURGE.radius);
    hit(w, o, wz.id, dmg, dmg * KB_PER_DMG * factor, sub(o.pos, wz.pos), 'scourge');
    landed = true;
  }
  if (landed) w.events.push({ k: 'land', id: wz.id, src: 'scourge' });
  // também bate nos obstáculos e no baú dentro da explosão (pedido do Fernando, 17/10)
  w.pillars.forEach((q, i) => {
    if (q.alive && dist(q.pos, wz.pos) <= SCOURGE.radius + OBSTACLES[q.kind].r) damagePillar(w, i, dmg, wz.id);
  });
  // também destrói bolas de fogo e mísseis inimigos dentro da explosão (pedido do Fernando, 17/10)
  const caught = w.projectiles.filter((p) => p.owner !== wz.id && p.kind !== 'meteor' && dist(p.pos, wz.pos) <= SCOURGE.radius + PROJ_R);
  if (caught.length) {
    w.projectiles = w.projectiles.filter((p) => !caught.includes(p));
    for (const p of caught) w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'pulse', r: 0.6 });
  }
  w.events.push({ k: 'scourge', id: wz.id, x: wz.pos.x, y: wz.pos.y, r: SCOURGE.radius });
}

// o meteoro cai: dano de dmgMin na borda até o máximo no centro, em todos menos quem lançou
function meteorLand(w: World, p: Projectile) {
  const L = spellLevel('meteor', p.level);
  let landed = false;
  for (const o of w.wizards) {
    if (!o.alive || o.id === p.owner) continue;
    const d = dist(o.pos, p.pos);
    if (d > L.radius + WIZ_R) continue;
    const amount = (L.dmgMin + (L.dmg - L.dmgMin) * Math.max(0, 1 - d / L.radius)) * p.dmgMult;
    hit(w, o, p.owner, amount, amount * (L.knock / L.dmg), sub(o.pos, p.pos), 'meteor');
    landed = true;
  }
  w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'fire', r: L.radius });
  if (landed && p.owner === p.caster) w.events.push({ k: 'land', id: p.caster, src: 'meteor' });
}

// a Troca sem alvo: o mago vai ao ponto da mira, ou para onde ela bateu num obstáculo antes de chegar lá
function swapEnd(w: World, p: Projectile) {
  const wz = byId(w, p.owner);
  if (!wz) return;
  const from = wz.pos;
  wz.pos = p.dest && dot(sub(p.pos, p.dest), p.vel) >= 0 ? p.dest : p.pos;
  wz.target = null;
  w.events.push({ k: 'teleport', id: wz.id, from, to: wz.pos });
}

function swapPlaces(w: World, p: Projectile, other: Wizard) {
  const wz = byId(w, p.owner);
  if (!wz) return;
  const [a, b] = [wz.pos, other.pos];
  wz.pos = b;
  other.pos = a;
  wz.target = null;
  w.events.push({ k: 'teleport', id: wz.id, from: a, to: b }, { k: 'teleport', id: other.id, from: b, to: a });
}

// projétil quica num círculo (mago ou obstáculo): reflete se estava indo para ele e sai de dentro
function bounceOff(p: Projectile, center: Vec, r: number, speed = len(p.vel)) {
  const n = norm(sub(p.pos, center));
  const into = dot(p.vel, n);
  if (into < 0) p.vel = sub(p.vel, scale(n, 2 * into));
  p.vel = scale(norm(p.vel), speed);
  p.pos = add(center, scale(n, r + PROJ_R + BOOMERANG.gap));
}

// Gravidade (gravityprojectile.lua): puxa magos inimigos e todos os projéteis (menos meteoro e outra gravidade) e queima
// quem está perto a cada 0,2 s, sem empurrão
function gravityPull(w: World, g: Projectile) {
  const L = spellLevel('gravity', g.level);
  const owner = w.wizards.find((z) => z.id === g.owner);
  for (const o of w.wizards) {
    if (!o.alive || o.id === g.owner || allies(owner, o)) continue; // aliado não é puxado nem queimado
    const d = dist(g.pos, o.pos);
    // no original é aceleração na velocidade; aqui o mago parado zera velocidade abaixo de 0,05 m/s (moveWizard), então o puxão
    // vira deslocamento na velocidade de equilíbrio (puxão ÷ atrito), sem deixar o mago atordoado: ele ainda anda contra, como lá
    if (d <= GRAVITY.wizR) o.pos = add(o.pos, scale(norm(sub(g.pos, o.pos)), (L.pull / FRICTION) * (1 - (d * d) / (GRAVITY.wizR * GRAVITY.wizR)) * DT));
  }
  for (const q of w.projectiles) {
    if (q.kind === 'meteor' || q.kind === 'gravity') continue;
    const d = dist(g.pos, q.pos);
    if (d <= GRAVITY.projR) q.vel = add(q.vel, scale(norm(sub(g.pos, q.pos)), GRAVITY.projPull * (1.5 - (d * d) / (GRAVITY.projR * GRAVITY.projR)) * DT));
  }
  if (w.t < (g.tick ?? 0)) return;
  g.tick = w.t + GRAVITY.tick;
  for (const o of w.wizards) {
    if (!o.alive || o.id === g.owner || allies(owner, o) || dist(g.pos, o.pos) > L.radius) continue;
    hit(w, o, g.owner, L.dmg * GRAVITY.tick * g.dmgMult, 0, sub(o.pos, g.pos), 'gravity');
    if (!g.landed && g.owner === g.caster) w.events.push({ k: 'land', id: g.caster, src: 'gravity' });
    g.landed = true;
  }
}

// Bumerangue (boomerangprojectile.lua): indo, segue as acelerações da curva; voltando, vira até 1000 u/s² rumo ao dono
// a 1000 u/s e some ao encostar nele. Devolve false quando acabou
function steerBoomerang(w: World, p: Projectile): boolean {
  const owner = byId(w, p.owner);
  if (!owner) return false;
  if (p.curve) {
    p.vel = add(p.vel, scale(p.curve.acc, DT));
    if (w.t >= p.curve.flipAt) [p.curve.acc, p.curve.flipAt] = [p.curve.next, Infinity];
    if (w.t >= p.curve.stopAt) [p.curve, p.back] = [undefined, true];
    return true;
  }
  if (dist(owner.pos, p.pos) < WIZ_R + PROJ_R) return false;
  const want = sub(scale(norm(sub(owner.pos, p.pos)), BOOMERANG.back), p.vel);
  p.vel = add(p.vel, scale(norm(want), Math.min(len(want), BOOMERANG.turn * DT)));
  return true;
}

// Estocada (thrustmodifier.lua): acelera e, ao encostar num inimigo, para e causa dano proporcional ao quadrado da
// velocidade (cheio a partir de 80% dele); escudo faz o mago quicar; sem acertar, freia para 20% no fim
function stepThrust(w: World, wz: Wizard) {
  if (wz.thrustUntil <= 0) return;
  if (w.t >= wz.thrustUntil) {
    wz.thrustUntil = 0;
    wz.vel = scale(wz.vel, THRUST.endSlow);
    return;
  }
  wz.vel = add(wz.vel, scale(wz.thrustAcc, DT));
  const L = spellLevel('thrust', wz.spells.thrust);
  for (const o of w.wizards) {
    if (!o.alive || o === wz) continue;
    const n = norm(sub(o.pos, wz.pos));
    if (dist(o.pos, wz.pos) > 2 * WIZ_R + THRUST.reach + (shielded(w, o) ? Math.max(0, o.shieldR - WIZ_R) : 0)) continue;
    if (shielded(w, o)) {
      const into = dot(wz.vel, n);
      if (into > 0) {
        wz.vel = sub(wz.vel, scale(n, 2 * into));
        w.events.push({ k: 'reflect', id: o.id, x: o.pos.x, y: o.pos.y });
      }
      continue;
    }
    const k = Math.min(1, dot(wz.vel, wz.vel) / (L.speed * L.speed) / THRUST.full);
    wz.vel = v(0, 0);
    wz.thrustUntil = 0;
    hit(w, o, wz.id, L.dmg * k * wz.thrustMult, L.knock * k * wz.thrustMult, n, 'thrust');
    w.events.push({ k: 'land', id: wz.id, src: 'thrust' });
    return;
  }
}

function stepProjectiles(w: World) {
  for (const g of w.projectiles) if (g.kind === 'gravity') gravityPull(w, g);
  const keep: Projectile[] = [];
  for (const p of w.projectiles) {
    if (p.kind === 'meteor') {
      if (w.t >= p.until) meteorLand(w, p);
      else keep.push(p);
      continue;
    }
    const L = spellLevel(p.kind, p.level);
    if (p.kind === 'boomerang' && (w.t >= p.until || !steerBoomerang(w, p))) continue;
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
    // a Troca anda só o que falta no último passo, para parar exatamente no ponto da mira
    const next = add(p.pos, scale(p.vel, p.kind === 'swap' ? Math.min(DT, Math.max(0, p.until - w.t)) : DT));
    // a Gravidade não bate em mago; o Ricochete não repete o último mago tocado (pode voltar em quem lançou)
    const found = p.kind === 'gravity' ? null : firstOnSegment(w, p.pos, next, WIZ_R + PROJ_R, p.kind === 'bouncer' ? (p.prev ?? p.owner) : p.owner);
    const pil = firstPillarOnSegment(w, p.pos, next, PROJ_R);
    if (pil && (!found || pil.t < found.t)) {
      const q = w.pillars[pil.i];
      // Gravidade e Ricochete quicam no obstáculo; o Bumerangue quica mais forte e volta ao dono
      if (p.kind === 'gravity' || p.kind === 'bouncer' || p.kind === 'boomerang') {
        bounceOff(p, q.pos, OBSTACLES[q.kind].r, p.kind === 'boomerang' ? BOOMERANG.bounceWall : undefined);
        if (p.kind === 'boomerang') [p.curve, p.back] = [undefined, true];
        // o Bumerangue também quebra o baú (pedido do Fernando, 17/10; no original não batia em obstáculo)
        if (p.kind === 'boomerang' && q.kind === 'chest') damagePillar(w, pil.i, spellLevel('boomerang', p.level).dmg * p.dmgMult, p.owner);
        keep.push(p);
        continue;
      }
      if (p.kind === 'swap') swapEnd(w, p);
      else if (L.dmg > 0) damagePillar(w, pil.i, L.dmg * p.dmgMult, p.owner);
      continue;
    }
    if (found) {
      const wz = found.wz;
      if (shielded(w, wz)) {
        // a Troca não faz mal a ninguém: o escudo só a barra, ninguém sai do lugar
        if (p.kind === 'swap') {
          w.events.push({ k: 'reflect', id: wz.id, x: p.pos.x, y: p.pos.y });
          continue;
        }
        // o Bumerangue quica no escudo sem trocar de dono e volta (shieldmodifier.lua)
        if (p.kind === 'boomerang') {
          bounceOff(p, wz.pos, Math.max(WIZ_R, wz.shieldR));
          [p.curve, p.back] = [undefined, true];
          w.events.push({ k: 'reflect', id: wz.id, x: p.pos.x, y: p.pos.y });
          keep.push(p);
          continue;
        }
        if (p.kind === 'bouncer') p.prev = wz.id;
        // devolve mirando onde quem atirou está agora (pedido do Fernando, 17/10: deixa o escudo mais forte);
        // se ele já morreu, volta pelo mesmo caminho. O projétil passa a ser de quem refletiu.
        const shooter = byId(w, p.owner);
        const back = shooter ? norm(sub(shooter.pos, p.pos)) : scale(norm(p.vel), -1);
        p.vel = scale(back, len(p.vel));
        p.target = p.kind === 'homing' ? ((shooter && !allies(shooter, wz) ? shooter.id : null) ?? nearestEnemy(w, p.pos, wz.id)?.id ?? null) : null;
        p.owner = wz.id;
        p.until = w.t + (p.kind === 'homing' ? L.duration : L.range / L.speed);
        w.events.push({ k: 'reflect', id: wz.id, x: p.pos.x, y: p.pos.y });
        keep.push(p);
        continue;
      }
      if (p.kind === 'swap') {
        swapPlaces(w, p, wz);
        w.events.push({ k: 'land', id: p.caster, src: 'swap' });
      } else if (p.kind === 'grip') {
        // aliado não fica preso
        if (w.t >= wz.invulnUntil && !allies(w.wizards.find((z) => z.id === p.owner), wz)) {
          w.events.push({ k: 'land', id: p.caster, src: 'grip' });
          wz.gripUntil = w.t + L.duration * wz.debuffMult;
          wz.target = null;
          wz.casting = null;
          w.events.push({ k: 'grip', id: wz.id, x: wz.pos.x, y: wz.pos.y });
        }
      } else if (p.kind === 'boomerang') {
        // bate, quica a 500 u/s e volta ao dono; pode acertar de novo na volta
        hit(w, wz, p.owner, L.dmg * p.dmgMult, L.knock * p.dmgMult, sub(wz.pos, p.pos), 'boomerang');
        if (!p.landed && p.owner === p.caster) w.events.push({ k: 'land', id: p.caster, src: 'boomerang' });
        p.landed = true;
        bounceOff(p, wz.pos, WIZ_R, BOOMERANG.bounce);
        [p.curve, p.back] = [undefined, true];
        keep.push(p);
      } else if (p.kind === 'bouncer') {
        // bouncerprojectile.lua: dano só em inimigo (e −30% a cada um); quem lançou só desvia; segue ao mago mais perto
        // com 1 s de vida renovada, até o dano ficar abaixo de 1
        if (wz.id !== p.owner) {
          hit(w, wz, p.owner, L.dmg * p.dmgMult, L.knock * p.dmgMult, p.vel, 'bouncer');
          if (!p.landed && p.owner === p.caster) w.events.push({ k: 'land', id: p.caster, src: 'bouncer' });
          p.landed = true;
          p.dmgMult *= BOUNCER.decay;
        }
        if (L.dmg * p.dmgMult < BOUNCER.minDmg) continue;
        p.prev = wz.id;
        p.pos = add(p.pos, scale(p.vel, DT * found.t));
        const nextTo = nearestEnemy(w, p.pos, wz.id, p.owner);
        if (nextTo) p.vel = scale(norm(sub(nextTo.pos, p.pos)), L.speed);
        p.until = w.t + (L.range / L.speed) * (byId(w, p.caster)?.rangeF ?? 1);
        keep.push(p);
      } else {
        hit(w, wz, p.owner, L.dmg * p.dmgMult, L.knock * p.dmgMult, p.vel, p.kind);
        if (p.owner === p.caster) w.events.push({ k: 'land', id: p.caster, src: p.kind as AimSrc });
      }
      continue;
    }
    p.pos = next;
    if (p.kind === 'swap' ? w.t + DT < p.until : w.t < p.until) keep.push(p);
    else if (p.kind === 'swap') swapEnd(w, p);
  }
  w.projectiles = keep;
}

const ELASTICITY = 0.5;

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
      const n = l > 1e-6 ? scale(d, 1 / l) : v(1, 0);
      const push = scale(n, overlap / 2);
      a.pos = sub(a.pos, push);
      b.pos = add(b.pos, push);
      // choque elástico como no original (physics.lua, elasticidade 0,5, massas iguais): o empurrado passa o embalo adiante
      const vn = dot(sub(b.vel, a.vel), n);
      if (vn < 0) {
        const j = (-(1 + ELASTICITY) * vn) / 2;
        a.vel = sub(a.vel, scale(n, j));
        b.vel = add(b.vel, scale(n, j));
      }
    }
  }
}

// volta ao jogo no deathmatch: sorteia um ponto na pedra longe dos inimigos vivos e dos pilares (se nenhum
// sorteio chega a DM_SPAWN_GAP, fica o melhor); vida cheia, parado e invulnerável; magias, itens e recargas ficam
function respawn(w: World, wz: Wizard, rand: () => number) {
  const reach = w.arenaR - SPAWN_INSET;
  const gap = (p: Vec) => Math.min(...w.wizards.filter((z) => z.alive).map((z) => dist(z.pos, p)), ...w.pillars.filter((q) => q.alive).map((q) => dist(q.pos, p)));
  let best = v(0, 0);
  let bestGap = -1;
  for (let i = 0; i < 30 && bestGap < DM_SPAWN_GAP; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * reach;
    const p = v(Math.cos(a) * r, Math.sin(a) * r);
    const g = gap(p);
    if (g > bestGap) [best, bestGap] = [p, g];
  }
  Object.assign(wz, {
    alive: true, pos: best, vel: v(0, 0), target: null, casting: null, hp: wz.hpMax, dmgTaken: 0, lastHitBy: null,
    shieldUntil: 0, kbPenaltyUntil: 0, pactUntil: 0, dashUntil: 0, thrustUntil: 0, invulnUntil: w.t + INVULN_TIME,
  });
}

export function stepWorld(w: World, cmds: Cmd[], rand: () => number = Math.random) {
  w.events = [];
  for (const c of cmds) {
    const wz = byId(w, c.id);
    if (!wz) continue;
    if (c.kind === 'move') {
      if (wz.casting) wz.casting.then = c.to;
      else wz.target = c.to;
    } else if (c.kind === 'stop') {
      if (wz.casting) wz.casting.then = null;
      else wz.target = null;
    } else if (c.kind === 'item') beginCast(w, wz, { item: c.item }, c.at);
    else beginCast(w, wz, { spell: c.spell }, c.at);
  }
  for (const wz of w.wizards) {
    if (!wz.alive && w.dm && w.t >= wz.respawnAt) respawn(w, wz, rand);
    if (!wz.alive) continue;
    if (wz.casting && w.t >= wz.casting.fireAt) {
      const c = wz.casting;
      wz.casting = null;
      fire(w, wz, c, c.at);
      if (c.then !== undefined) wz.target = c.then;
    }
    // preso: velocidade zero e o destino de andar some; a Investida soma velocidade
    const rooted = w.t < wz.gripUntil;
    // chão do choque: lento no arcano, queima no fogo (como a lava, mas fraco)
    wz.zone = 0;
    for (const z of w.zones) if (dist(z.pos, wz.pos) < z.r + WIZ_R * 0.5) wz.zone |= z.kind === 'slow' ? 1 : z.kind === 'burn' ? 2 : 0;
    if (wz.zone & 2 && w.t >= wz.invulnUntil) wz.hp -= ZONES.burn.dps * DT;
    wz.speed = rooted ? 0 : Math.max(0.2, (wz.baseSpeed + (w.t < wz.rushUntil ? wz.rushBonus : 0)) * (wz.zone & 1 ? ZONES.slow.mult : 1));
    if (rooted) wz.target = null;
  }

  if (!w.dm && w.t >= w.shrinkAt && w.arenaR > ARENA_MIN) {
    w.arenaR = Math.max(ARENA_MIN, w.arenaR - ARENA_STEP);
    w.shrinkAt += SHRINK_EVERY;
    w.events.push({ k: 'shrink', r: w.arenaR });
  }

  w.zones = w.zones.filter((z) => z.until > w.t);
  // baú: aparece num ponto sorteado longe dos obstáculos; as magias quebram e ele vira um monte de ouro
  const chestsUp = w.pillars.filter((q) => q.kind === 'chest' && q.alive).length;
  if (chestsUp < CHEST.maxUp && w.t >= w.chestAt) {
    let at: Vec | null = null;
    for (let i = 0; i < 20 && !at; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * w.arenaR * CHEST.spread;
      const p = v(Math.cos(a) * r, Math.sin(a) * r);
      if (w.pillars.every((q) => !q.alive || dist(q.pos, p) > 1.2) && w.wizards.every((z) => !z.alive || dist(z.pos, p) > 1)) at = p;
    }
    if (at) {
      w.pillars.push({ pos: at, hp: OBSTACLES.chest.hp, alive: true, kind: 'chest' });
      w.events.push({ k: 'chest', x: at.x, y: at.y });
      w.chestAt = w.t + CHEST.every;
    } else w.chestAt = w.t + 1;
  }
  // monte de ouro: cada mago em cima enche a própria barra e ganha 1 a cada 2 s; quem sai perde o progresso
  for (const z of w.wizards) {
    const loot = z.alive ? w.loots.find((l) => l.left > 0 && dist(z.pos, l.pos) <= CHEST.reach) : undefined;
    if (!loot) {
      z.lootProg = 0;
      continue;
    }
    z.lootProg += DT;
    if (z.lootProg >= CHEST.goldEvery) {
      z.lootProg = 0;
      loot.left--;
      w.events.push({ k: 'loot', id: z.id, x: loot.pos.x, y: loot.pos.y });
    }
  }
  w.loots = w.loots.filter((l) => l.left > 0 && w.t < l.until);
  for (const wz of w.wizards) {
    if (!wz.alive) continue;
    if (w.t < wz.dashUntil) {
      wz.pos = add(wz.pos, scale(wz.dashVel, DT)); // avançando: não anda, mas o empurrão ainda soma
      // quem o avanço encostar leva dano e é empurrado na direção do avanço (uma vez por avanço)
      for (const o of w.wizards) {
        if (!o.alive || o === wz || wz.dashHit.includes(o.id) || dist(o.pos, wz.pos) > 2 * WIZ_R + 0.1) continue;
        wz.dashHit.push(o.id);
        hit(w, o, wz.id, RUSH.dashDmg, RUSH.dashDmg * KB_PER_DMG, wz.dashVel, 'rush');
        w.events.push({ k: 'land', id: wz.id, src: 'rush' });
      }
    }
    stepThrust(w, wz);
    // redemoinho do choque de pulso: puxa devagar para o centro
    for (const z of w.zones) {
      const d = sub(z.pos, wz.pos);
      if (z.kind === 'pull' && len(d) < z.r + WIZ_R && len(d) > 0.15) wz.pos = add(wz.pos, scale(norm(d), ZONES.pull.speed * DT));
    }
    moveWizard(wz, DT);
  }
  separate(w);
  blockPillars(w);
  stepProjectiles(w);
  clashProjectiles(w);

  for (const wz of w.wizards) {
    if (!wz.alive) continue;
    if (len(wz.pos) > w.arenaR) {
      if (w.t < wz.invulnUntil) continue;
      wz.hp -= LAVA_DPS * DT;
      wz.dmgTaken += LAVA_DPS * DT * LAVA_KB_FACTOR;
    } else wz.hp = Math.min(wz.hpMax, wz.hp + wz.regen * DT);
    if (wz.hp > 0) continue;
    wz.hp = 0;
    wz.alive = false;
    wz.target = null;
    wz.respawnAt = w.t + DM_RESPAWN;
    const credited = wz.lastHitBy !== null && w.t - wz.lastHitAt <= CREDIT_WINDOW;
    const by = credited ? wz.lastHitBy : null;
    w.events.push({ k: 'death', id: wz.id, by, src: credited ? wz.lastHitSrc : 'lava' });
  }
  w.t += DT;
}
