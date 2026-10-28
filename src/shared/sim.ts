// Simulação 2D da arena. Pura: o servidor roda a 60 passos/s; o cliente usa moveWizard para prever o próprio mago.
import {
  ARENA_MIN, ARENA_STEP, CHEST, CREDIT_WINDOW, ZONES, DM_RESPAWN, DM_SPAWN_GAP, OBSTACLES, OBSTACLE_KINDS, PILLAR, type ObstacleKind, DT, FRICTION, HP_MAX, HP_REGEN, INVULN_TIME, KB_PER_DMG, KB_SOFT_CAP, KNOCK_HP_SCALE, LAVA_DPS, LAVA_KB_FACTOR, PROJ_R, SHRINK_EVERY, SPAWN_INSET, STUN_SPEED,
  ISLAND, NO_MODS, PIT, PROJ_SPAWN, RUNE, RUNE_KINDS, SUDDEN, SWORDS, WALL_GAP, WIZ_R, WIZ_SPEED, arenaRadius, type RoundEffectId, type RoundMods, type RuneKind,
} from './constants.ts';
import { CELL, SHAPES, cellAt, edge, inArena, inLavaAt, inward, isleSpot, onIsle, safeInside, type ArenaId, type Isle, type Terrain } from './arena.ts';
import { AEGIS, CRIT, SHOCK_BOOTS, WIND_BOOTS, itemStats, noItems, type ItemId } from './items.ts';
import { BOOMERANG, BOUNCER, CAST_POINT, CLOSED_BODY, CLUSTER_FAN, DRAIN, GRAVITY, GRIP, HOMING_TURN, LIGHTNING, LINK, MAGNETIZE, METEOR_DELAY, PACT, PIX, PROJECTILE_COLLISION, RECHARGE, RUSH, SNOWBALL, SPELL_IDS, SPLITTER, THRUST, WARPZONE, WINDWALK, spellLevel, type Level, type SpellId } from './spells.ts';
import { inCone } from './sand-cone.ts';
import { add, clampLen, dist, dot, len, norm, scale, sub, v, type Vec } from './vec.ts';
import { SHIELD, castBlocked } from './spells.ts';
import { BASIC_ATTACK, BRACE, GUARD, KNOCK_RECOVERY, MELEE_ARC } from './constants.ts';
import { sniperTarget } from './sniper-target.ts';
import { healTarget } from './heal-target.ts';
import { channelLevel, channelPower } from './channeling.ts';

export type Wizard = {
  electroUntil?: number; // duração da eletrificação.
  id: string;
  pos: Vec;
  vel: Vec; // só o empurrão; andar não entra aqui
  channel?: { spell: SpellId; since: number };
  stunLeft?: number; // bloqueio de controle separado da velocidade física.
  recoveryLeft?: number; // retomada disparada pelo fim do impulso, não pelo fim de qualquer stun.
  basicReadyAt?: number; // Attack cooldown
  basicCasting?: { target: string | number; fireAt: number; melee: boolean; arc?: number; at?: Vec }; // Attack windup in progress; arc: direction of the melee arc (no target)
  braceUntil?: number; // Hold ground: resists only new impulses while S is held
  braceReadyAt?: number; // effects start only after the continuous 0.5 s windup
  arc?: boolean; // alternative Attack chosen in the shop: melee arc (MELEE_ARC); bots never set it
  guard?: boolean; // alternative Hold ground chosen in the shop: guard stance (GUARD); bots never set it
  blindUntil?: number; // Blindness: sight limited until this time
  incapacitateUntil?: number; // Incapacitate: until this time
  closedBodyUntil?: number; // Closed body: active until this time
  geyserLeft?: number; // Geyser: seconds left suspended in the jet
  geyserAt?: Vec; // horizontal anchor: external forces do not move a suspended body
  puppetBy?: string; // Squid Pix: who controls this wizard until puppetUntil
  puppetUntil?: number;
  target: Vec | null;
  moveHeld?: boolean; // direito pressionado preserva tentativa contra obstáculo.
  blockedMove?: boolean; // destino de clique único cancelado por colisão.
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
  hpMax: number;
  regen: number;
  kbResist: number; // fração de empurrão a menos (itens)
  baseSpeed: number;
  speed: number; // velocidade de andar agora (botas, Investida, preso)
  debuffMult: number; // duração de lentidões e penalidades
  crit: number; // chance de crítico no golpe (Lente Letal)
  critDmg: number; // dano a mais do crítico, por cima do CRIT.dmg (Magia Perfurante)
  afflict: number; // duração das lentidões e penalidades que aplica nos outros (Runa da aflição)
  pactUntil: number; // Pacto armado até este instante
  gripUntil: number; // preso (Agarrar): não anda até o primeiro golpe com dano
  gripBonus: number; // empurrão a mais desse golpe (pelo nível do Agarrar de quem prendeu)
  windBonus: number; // Botas de vento: velocidade a mais depois de WIND_BOOTS.calm s sem dano (0 = não tem)
  calmSince: number; // último instante em que causou ou levou dano
  rushPower?: number;
  rushUntil: number; // Investida ativa até este instante
  rushLeft: number; // dano que a Investida ainda pode absorver
  rushBonus: number; // velocidade extra da Investida agora (m/s)
  dashUntil: number; // avanço da Investida em curso até este instante
  dashVel: Vec; // velocidade do avanço (m/s)
  dashHit: string[]; // quem este avanço já acertou
  dashDmg?: number; // dano deste avanço quando não é o da Investida (a investida do chefe, bosses.ts)
  r?: number; // body radius when it is not WIZ_R (the giant Campaign boss, ODRAN.size); collisions, hits and blasts read bodyR
  thrustUntil: number; // Estocada em curso até este instante (0 = nenhuma)
  thrustAcc: Vec; // aceleração da Estocada (m/s²)
  thrustMult: number; // Pacto na Estocada
  slowUntil: number; // lento (Drenar, Bola de neve) até este instante
  slow: number; // m/s a menos enquanto lento
  hasteUntil: number; // acelerado (Drenar num aliado) até este instante
  haste: number; // m/s a mais enquanto acelerado
  snow: { until: number; by: string; dmg: number } | null; // Bola de neve encostou: dano quando acabar
  magnetUntil: number; // Magnetizar até este instante
  magnet: number; // 1 atrai, −1 repele os projéteis inimigos
  alterUntil: number; // Alteração ativa até este instante
  windUntil: number; // Caminhada no vento (invisível) até este instante
  windMult: number; // Pacto na Caminhada no vento
  veilUntil: number; // Ilusão: invisível até a cópia acabar
  streak: number; // Recarga: acertos seguidos
  invulnUntil: number;
  respawnAt: number; // deathmatch: instante (w.t) em que o morto volta
  rangeF: number; // alcance das magias (Elmo: −10%)
  lifesteal: number; // fração do dano causado que volta como vida
  lavaCut: number; // Botas de lava: fração do dano da lava a menos
  ward: number; // Guardião: dano a menos por golpe (até metade do golpe)
  shockBonus: number; // Botas de choque: velocidade a mais depois de levar um golpe (já descontadas as Botas)
  shockUntil: number;
  aegis: boolean; // Égide ainda não usada nesta rodada (nesta vida, no deathmatch)
  rune: RuneKind | null; // runa ativa até runeUntil (pegar outra troca)
  runeUntil: number;
  team: number | null; // modo Times: 0 ou 1; fora dele null (ninguém é aliado)
  // magia ou item sendo conjurado: sai em fireAt e o mago fica parado até lá (pedido do Fernando, 17/10:
  // clicar para andar não cancela); o clique de andar fica guardado em `then` e vale quando a magia sai
  casting: { spell: SpellId; at: Vec; fireAt: number; power?: number; aimedId?: string; then?: Vec | null } | null;
  god?: boolean; // sandbox: vida infinita (não morre; fica na lava com a vida cheia, sem voltar para a pedra: pedido do Fernando, 20/10)
  turretAnchor?: Vec; // sandbox: ponto fixo da torreta nesta rodada
  pitDeath?: boolean; // mapa: cai no abismo e morre (servo do Fumo, Lucas 22/10); sem o campo volta à beira com dano
  safe?: Vec; // mapa: último ponto em chão firme (quem cai no abismo volta aqui)
  // Campanha: brasa do Aceso caído (match.ts): prog s com aliado perto, need s para voltar; out = apagou (arena do chefe)
  ember?: { prog: number; need: number; since: number; out?: boolean };
};

// meteor fica parado no ponto de impacto até `until` e então explode; swap e grip não causam dano
// boomerang curva e volta ao dono; gravity não bate em mago, só puxa; bouncer pula de mago em mago
// drain e recharge com back voltam a quem lançou (cura, recarga); link fica preso a um mago ou obstáculo; splitter vira lançador de shard;
// warpzone não anda (zona de tempo lento); illusion é a cópia autônoma do mago, que dura até o prazo mesmo quando atingida
export const PROJ_KINDS = ['fireball', 'homing', 'swap', 'grip', 'meteor', 'cluster', 'boomerang', 'gravity', 'bouncer',
  'drain', 'snowball', 'illusion', 'magnetize', 'recharge', 'link', 'splitter', 'shard', 'warpzone', 'basic', 'geyser', 'pix'] as const;
export type ProjKind = (typeof PROJ_KINDS)[number];

export type Projectile = {
  id: number;
  born?: number; // w.t em que surgiu (os bots só reagem depois do tempo de reação deles)
  kind: ProjKind;
  owner: string;
  pos: Vec;
  vel: Vec;
  level: number;
  until: number;
  target: string | null;
  power?: number; // Captured channel strength follows the projectile, even after reflection.
  dmgMult: number; // Pacto
  caster: string; // quem lançou (o dono muda quando um escudo reflete)
  dest?: Vec; // Troca: aonde o mago vai se ela não tocar ninguém (o ponto da mira)
  decoy?: number; // Ilusão: id da cópia que este projétil já empurrou (empurra uma vez só ao atravessar)
  decoyTarget?: number; // estado de Elo preso a uma cópia, não considerado projétil em voo.
  pushVel?: Vec; // Ilusão: empurrão da cópia, separado da caminhada e de para onde ela olha
  recoveryLeft?: number; // the same recovery as the real body
  stunLeft?: number; // only blocks the copy's walk, never kills or hides it
  decoyDamage?: number; // Ilusão: dano que a cópia já levou (só aumenta o empurrão; ela não morre)
  decoyResist?: number; // Ilusão: resistência a empurrão do dono no momento do lançamento
  decoyDebuff?: number; // Illusion: the owner's status-duration multiplier at cast, so the copy's stun lasts like the wizard's
  curve?: { acc: Vec; next: Vec; flipAt: number; stopAt: number }; // Bumerangue indo: aceleração agora, a da volta e quando trocam
  back?: boolean; // Bumerangue voltando ao dono
  prev?: string; // Ricochete: último mago tocado (não bate nele de novo em seguida)
  tick?: number; // Gravidade: próximo dano
  lockOn?: string | number; // locked on one body (wizard or Illusion copy): chases it and can only hit it
  stats?: Level; // own numbers when the projectile does not come from a spell (Attack)
  src?: string; // hit source when it is not a spell: shown on the hit, not counted as spell accuracy
  landed?: boolean; // já contou 'land' (Bumerangue e Ricochete acertam mais de uma vez)
  turnAt?: number; // Drenar: quando vira para o mago mais perto; Elo: quando recolhe
  bonus?: number; // Recarga: dano a mais pelos acertos seguidos
  waves?: number; // Divisor: ondas de filhotes que faltam (lançador)
  pillar?: number; // Elo preso a este obstáculo
  soak?: Record<string, number>; // Lula Pix rain: seconds each wizard has spent inside
};

export type Cmd =
  | { id: string; kind: 'move'; to: Vec; held?: boolean }
  | { id: string; kind: 'moveHold'; on: boolean }
  | { id: string; kind: 'stop' }
  | { id: string; kind: 'brace'; on: boolean }
  | { id: string; kind: 'basic'; at: Vec; target?: string | number }
  | { id: string; kind: 'channel'; spell: SpellId }
  | { id: string; kind: 'cast'; spell: SpellId; at: Vec }

export type SimEvent =
  | { k: 'sand'; id: string; x: number; y: number; dx: number; dy: number; length: number; width: number }
  | { k: 'heal'; id: string; x: number; y: number; amount: number }
  | { k: 'attack'; id: string; melee: boolean }
  | { k: 'cast'; id: string; spell: SpellId }
  | { k: 'hit'; id: string; by: string; x: number; y: number; dmg: number; src: string; crit?: true }
  | { k: 'reflect'; id: string; x: number; y: number }
  | { k: 'lightning'; from: Vec; to: Vec }
  | { k: 'snipe'; id: string; from: Vec; to: Vec }
  | { k: 'teleport'; id: string; from: Vec; to: Vec }
  | { k: 'grip'; id: string; x: number; y: number }
  | { k: 'pix'; id: string; x: number; y: number } // Squid Pix: id, at (x, y), now repeats its controller's commands
  | { k: 'vines'; x: number; y: number; r: number }
  | { k: 'death'; id: string; by: string | null; src: string } // src: o que empurrou por último (dentro da janela de crédito) ou 'lava'
  | { k: 'gold'; id: string; n: number; x: number; y: number }
  | { k: 'shrink'; r: number }
  | { k: 'aegis'; id: string } // a Égide tirou o mago da lava (junto vem um 'teleport')
  | { k: 'fall'; id: string; x: number; y: number } // mapa: caiu no abismo em (x, y) e voltou à beira (junto vem um 'teleport')
  | { k: 'rune'; kind: RuneKind; x: number; y: number } // runa apareceu
  | { k: 'runeTake'; id: string; kind: RuneKind } // alguém pegou a runa
  // chefe da Campanha (bosses.ts): aim = parou e mira a investida até (tx, ty); stun = derrubou um pilar; phase2; down = caiu
  | { k: 'boss'; id: string; what: BossEventKind; x: number; y: number; tx?: number; ty?: number }
  | { k: 'ember'; id: string; what: EmberEventKind; x: number; y: number } // Campanha: reacendido pelo grupo, ou a brasa apagou
  | { k: 'relic'; id: string; x: number; y: number } // Campaign: id opened the chest at (x, y) and earned a card
  | { k: 'sudden' } // morte súbita: a arena passa a encolher mais rápido
  // sequência de abate (vem da partida): multi = abates seguidos rápidos, spree = abates sem morrer, breaker = acabou com a sequência de victim
  | { k: 'streak'; id: string; kind: StreakKind; n: number; victim?: string }
  | { k: 'scourge'; id: string; x: number; y: number; r: number }
  | { k: 'clash'; x: number; y: number; combo: ComboKind; r: number }
  | { k: 'pillar'; i: number; x: number; y: number }
  | { k: 'chest'; x: number; y: number } // baú apareceu
  | { k: 'loot'; id: string; x: number; y: number } // alguém ganhou 1 de ouro em cima do monte
  // estatística de precisão: 'fire' ao lançar dano; 'land' uma vez por cone/projétil acertado
  | { k: 'fire'; id: string; src: SpellId }
  | { k: 'land'; id: string; src: SpellId };

// as de utilidade (teleport, shield, swap, grip, rush, pact) contam uso em 'fire' e, quando pegam alguém, 'land'

// choque de magias: fogo×fogo, fogo×míssil, míssil×míssil, e o raio detonando uma bola de fogo
export const BOSS_EVENT_KINDS = ['aim', 'stun', 'phase2', 'start', 'down'] as const;
export type BossEventKind = (typeof BOSS_EVENT_KINDS)[number];
export const EMBER_EVENT_KINDS = ['lit', 'out'] as const;
export type EmberEventKind = (typeof EMBER_EVENT_KINDS)[number];
export const STREAK_KINDS = ['multi', 'spree', 'breaker'] as const;
export type StreakKind = (typeof STREAK_KINDS)[number];
export const COMBO_KINDS = ['fire', 'arcane', 'pulse', 'detonate', 'pillar', 'snow'] as const; // snow: explosão da Bola de neve
export type ComboKind = (typeof COMBO_KINDS)[number];

// until: some sozinho (Pilar de pedra); wall: índice do pedaço do meio da parede do Pilar de pedra (os 3 dividem a vida); gold: ouro do monte do baú
export type Pillar = { pos: Vec; hp: number; alive: boolean; kind: ObstacleKind; until?: number; wall?: number; gold?: number };

export type Zone = { pos: Vec; r: number; kind: 'burn' | 'slow' | 'pull'; until: number; by?: string | null }; // by: quem causou (fogo amigo)

export type World = {
  t: number;
  arena: ArenaId; // formato desta rodada (arena.ts)
  effect: RoundEffectId | null; // efeito sorteado desta rodada (match.ts); null na sandbox e fora da partida
  mods: RoundMods; // multiplicadores do efeito (NO_MODS sem efeito)
  arenaR: number; // raio atual: o encolhimento escala a forma
  shrinkAt: number;
  wizards: Wizard[];
  projectiles: Projectile[];
  pillars: Pillar[];
  zones: Zone[]; // chão com efeito deixado pelos choques
  loots: { pos: Vec; left: number; until: number }[]; // montes de ouro dos baús quebrados
  chestAt: number; // quando o próximo baú aparece
  chestsLeft: number; // baús que ainda podem aparecer nesta rodada
  runes: { pos: Vec; kind: RuneKind }[]; // no máximo uma
  runeAt: number; // quando a próxima runa aparece
  isles: (Isle & { a: number; d: number })[]; // ilhas de refúgio: rumo a do centro e distância d da borda (a posição segue o encolhimento)
  sudden: boolean; // morte súbita já começou
  rules: Rules; // mecânicas ligadas nesta rodada (opções da partida)
  events: SimEvent[];
  // dano de lava creditado neste passo (quem acertou → quem queimou → dano); fica no servidor, não vai para o navegador
  lavaCredit: Record<string, Record<string, number>>;
  nextId: number;
  dm: boolean; // deathmatch: a arena não encolhe e quem morre volta depois de DM_RESPAWN s
  // sorteio do passo: stepWorld grava o rand que recebeu, para o crítico sortear dentro de hit() sem passar o rand pelas 18 chamadas;
  // é sempre o mesmo do passo (determinismo) e fica no servidor: o snapshot monta campo a campo e a sala salva o mundo como null
  rand: () => number;
  shrink?: boolean; // sandbox (mundo de deathmatch): a arena encolhe mesmo assim
  map?: Terrain; // Campanha: mapa explorável no lugar da arena (sem lava nem encolhimento)
  lock?: Room; // Campanha: sala trancada durante o encontro (ninguém sai dela)
};

export type Room = { x: number; y: number; w: number; h: number };

// mecânicas que a sala pode desligar (opções da partida)
type Rules = { runes: boolean; sudden: boolean; chests: boolean };
const ALL_RULES: Rules = { runes: true, sudden: true, chests: true };

// o que os itens dão ao mago: no começo da rodada e, na sandbox, ao comprar no meio dela
export function gearOf(items: Partial<Record<ItemId, number>> = {}) {
  const own = { ...noItems(), ...items };
  const st = itemStats(own);
  return {
    items: own,
    hpMax: HP_MAX + st.hp,
    regen: HP_REGEN + st.regen,
    kbResist: st.kb,
    baseSpeed: WIZ_SPEED + st.speed,
    debuffMult: Math.max(0, 1 + st.debuff),
    crit: st.crit,
    critDmg: st.critDmg,
    afflict: 1 + st.afflict,
    windBonus: own.wind_boots ? Math.max(0, WIND_BOOTS.speed[own.wind_boots - 1] - st.speed) : 0, // como as de choque: vale a maior das botas
    rangeF: 1 + st.range, // Elmo: −10%
    lifesteal: st.lifesteal,
    lavaCut: st.lava,
    ward: st.ward,
    // não soma com as Botas: vale a maior das duas (as Botas são o único item de velocidade)
    shockBonus: own.shock_boots ? Math.max(0, SHOCK_BOOTS.speed - st.speed) : 0,
    aegis: own.aegis > 0,
  } satisfies Partial<Wizard>;
}

export function newWorld(
  ids: string[],
  spells: Record<string, Record<SpellId, number>>,
  items: Record<string, Record<ItemId, number>> = {},
  pillarCount = 0,
  rand: () => number = Math.random,
  dm = false,
  teams: Record<string, number> = {}, // modo Times: id → time
  rules: Rules = ALL_RULES,
  arena: ArenaId = 'circle',
): World {
  const arenaR = arenaRadius(ids.length);
  const wizards = ids.map((id, i): Wizard => {
    const pos = SHAPES[arena].spawn(i, ids.length, arenaR);
    const gear = gearOf(items[id]);
    return {
      id,
      pos,
      vel: v(0, 0),
      target: null,
      facing: Math.atan2(-pos.y, -pos.x), // olhando para o centro
      hp: gear.hpMax,
      dmgTaken: 0,
      alive: true,
      shieldUntil: 0,
      lastHitBy: null,
      lastHitSrc: '',
      zone: 0,
      shieldR: 0,
      lootProg: 0,
      lastHitAt: -1e9,
      // the Scourge is an item since 26/10 (#227): cast through the spell path at the item level; without the item, the spells value counts
      // (only demos and tests build a wizard that way: players always have spells.scourge = 0)
      spells: { ...spells[id], scourge: gear.items.scourge || (spells[id]?.scourge ?? 0) },
      cd: Object.fromEntries(SPELL_IDS.map((s) => [s, 0])) as Record<SpellId, number>,
      speed: gear.baseSpeed,
      pactUntil: 0,
      gripUntil: 0,
      gripBonus: 0,
      calmSince: 0,
      rushUntil: 0,
      rushLeft: 0,
      rushBonus: 0,
      dashUntil: 0,
      dashVel: v(0, 0),
      dashHit: [],
      thrustUntil: 0,
      thrustAcc: v(0, 0),
      thrustMult: 1,
      slowUntil: 0,
      slow: 0,
      hasteUntil: 0,
      haste: 0,
      snow: null,
      magnetUntil: 0,
      magnet: 0,
      alterUntil: 0,
      windUntil: 0,
      windMult: 1,
      veilUntil: 0,
      streak: 0,
      invulnUntil: INVULN_TIME,
      respawnAt: 0,
      shockUntil: 0,
      rune: null,
      runeUntil: 0,
      team: teams[id] ?? null,
      casting: null,
      ...gear,
    };
  });
  const pillars = placePillars(arena, arenaR, pillarCount, wizards.map((z) => z.pos), rand);
  // ilhas nas diagonais (±15°), longe dos eixos onde os magos nascem e caem mais
  const isles = Array.from({ length: ISLAND.n }, (_, i) => {
    const a = Math.PI / 4 + (i * Math.PI * 2) / ISLAND.n + (rand() - 0.5) * (Math.PI / 6);
    const d = ISLAND.near + rand() * (ISLAND.far - ISLAND.near);
    return { a, d, r: ISLAND.r, pos: isleSpot({ arena, arenaR }, a, d) };
  });
  return { t: 0, arena, effect: null, mods: NO_MODS, arenaR, shrinkAt: SHRINK_EVERY, wizards, projectiles: [], pillars, zones: [], loots: [], chestAt: CHEST.first, chestsLeft: Math.min(CHEST.perRound, Math.floor(ids.length / 2) + 1), runes: [], runeAt: RUNE.first, isles, sudden: false, rules: { ...rules }, events: [], lavaCredit: {}, nextId: 1, dm, rand };
}

// no mapa da Campanha a lava é chão desenhado (^): o mesmo dano, crédito e queima da arena (Lucas, 22/10)
export const inLava = (w: World, p: Vec) => (w.map ? cellAt(w.map, p.x, p.y) === CELL.lava : inLavaAt(w.arena, w.arenaR, w.isles, p));

// ilhas: com alguém em cima a lava come a borda; vazia, a pedra volta a crescer (menos quando a arena já está sumindo: a rodada tem de acabar)
function stepIsles(w: World) {
  const grow = w.t < SUDDEN.collapse ? (ISLAND.r / ISLAND.regrow) * DT : 0;
  for (const i of w.isles) {
    // em cima = com o pé na ilha (centro a até o raio do mago da beira): afundada, quem está ali não a deixa voltar
    const busy = w.wizards.some((z) => z.alive && dist(z.pos, i.pos) < i.r + WIZ_R);
    i.r = busy ? Math.max(0, i.r - ISLAND.sink * DT) : Math.min(ISLAND.r, i.r + grow);
  }
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

// cada arena tem conjuntos fixos (sorteia um deles ou o espalhado de sempre, com chances iguais)
function placePillars(arena: ArenaId, arenaR: number, n: number, spawns: Vec[], rand: () => number): Pillar[] {
  const out: Pillar[] = [];
  const put = (pos: Vec) => { const kind = pickKind(rand()); out.push({ pos, hp: OBSTACLES[kind].hp, alive: true, kind }); };
  const sets = SHAPES[arena].obstacles;
  const set = n > 0 ? Math.floor(rand() * (sets.length + 1)) : sets.length;
  if (set < sets.length) {
    for (const u of sets[set]) {
      const pos = scale(u, arenaR);
      if (!spawns.some((s) => dist(s, pos) < 2)) put(pos);
    }
    return out;
  }
  const spread = PILLAR.spread * SHAPES[arena].reach;
  for (let tries = 0; out.length < n && tries < n * 60; tries++) {
    const pos = v((rand() * 2 - 1) * spread, (rand() * 2 - 1) * spread);
    // fora da pedra (ou quase) não serve: no círculo de 3 ou mais magos isso nunca acontece
    if (edge({ arena, arenaR }, pos) < 1 || spawns.some((s) => dist(s, pos) < 2) || out.some((p) => dist(p.pos, pos) < 2)) continue;
    put(pos);
  }
  return out;
}

export const isSliding = (wz: { vel: Vec }) => len(wz.vel) > STUN_SPEED;
export const bodyR = (wz: { r?: number }) => wz.r ?? WIZ_R;
export const isSuspended = (wz: { geyserLeft?: number }) => (wz.geyserLeft ?? 0) > 1e-8;
export const isStunned = (wz: { vel: Vec; stunLeft?: number; geyserLeft?: number }) => isSuspended(wz) || (wz.stunLeft === undefined ? isSliding(wz) : wz.stunLeft > 1e-8);
// velocidade das botas que agem agora: as de choque depois de um golpe, as de vento na calmaria (não somam: vale a maior)
export const bootsBonus = (w: World, wz: Wizard) =>
  Math.max(w.t < wz.shockUntil ? wz.shockBonus : 0, wz.windBonus > 0 && w.t - wz.calmSince >= WIND_BOOTS.calm[wz.items.wind_boots - 1] ? wz.windBonus : 0);

export type MovementState = Pick<Wizard, 'pos' | 'vel' | 'target' | 'facing' | 'speed' | 'safe' | 'stunLeft' | 'recoveryLeft' | 'geyserLeft' | 'geyserAt' | 'channel'>;

export function moveWizard(wz: MovementState, dt: number) {
  if (wz.channel) wz.target = null;
  if (isSuspended(wz)) {
    wz.target = null; wz.vel = v(0, 0);
    if (wz.geyserAt) wz.pos = { ...wz.geyserAt };
    if (wz.stunLeft !== undefined) wz.stunLeft = Math.max(0, wz.stunLeft - dt);
    return;
  }
  const sliding = isSliding(wz);
  const left = wz.recoveryLeft ?? 0;
  const recovery = left > 1e-8 ? KNOCK_RECOVERY.start + KNOCK_RECOVERY.step * Math.floor((KNOCK_RECOVERY.seconds - left + 1e-8) / KNOCK_RECOVERY.interval) : 1;
  if (wz.target && !isStunned(wz)) {
    const d = sub(wz.target, wz.pos);
    const l = len(d);
    const step = (wz.speed ?? WIZ_SPEED) * recovery * dt;
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
  if (sliding && !isSliding(wz)) {
    // A caminhada retoma sem somar impulso residual; stun sem impulso nunca entra neste ramo.
    wz.vel = v(0, 0);
    wz.recoveryLeft = KNOCK_RECOVERY.seconds;
  } else wz.recoveryLeft = sliding ? 0 : Math.max(0, left - dt);
  if (len(wz.vel) < 0.05) wz.vel = v(0, 0);
  if (wz.stunLeft !== undefined) wz.stunLeft = Math.max(0, wz.stunLeft - dt);
}

const byId = (w: World, id: string | null) => w.wizards.find((z) => z.id === id && z.alive); // só os vivos
const anyById = (w: World, id: string | null) => w.wizards.find((z) => z.id === id); // vivo ou morto
// Squid Pix: the living controller of a wizard under control, or undefined; dying frees the target
export const puppeteer = (w: World, z: Wizard | undefined) => (z?.puppetBy && w.t < (z.puppetUntil ?? 0) ? byId(w, z.puppetBy) : undefined);
const puppetsOf = (w: World, wz: Wizard) => w.wizards.filter((z) => z.alive && puppeteer(w, z) === wz);
// whoever acts through a controlled body is its controller: damage, marks and kill credit go to them
const actor = (w: World, id: string) => puppeteer(w, anyById(w, id))?.id ?? id;
const shielded = (w: World, wz: Wizard) => w.t < wz.shieldUntil;
export const statusDuration = (w: World, wz: Wizard, seconds: number) => seconds * (shielded(w, wz) ? SHIELD.statusDuration : 1) * (closedBodyActive(w, wz) ? CLOSED_BODY.statusDuration : 1);
export const closedBodyActive = (w: World, wz: Wizard) => w.t < (wz.closedBodyUntil ?? 0) && bracingActive(w, wz);
export const damageFactor = (w: World, wz: Wizard) => closedBodyActive(w, wz) ? CLOSED_BODY.damage : 1;
export const bracingActive = (w: World, wz: Wizard) => w.t + 1e-8 >= (wz.braceReadyAt ?? Infinity) && w.t < (wz.braceUntil ?? 0);
export const incapacitatedUntil = (wz: Wizard, now = Infinity) => Math.max(wz.incapacitateUntil ?? 0, wz.electroUntil ?? 0, now + 1e-8 >= (wz.braceReadyAt ?? Infinity) ? wz.braceUntil ?? 0 : 0);
export function applyElectrocution(w: World, wz: Wizard) {
  if (w.t < wz.invulnUntil) return;
  wz.electroUntil = Math.max(wz.electroUntil ?? 0, w.t + statusDuration(w, wz, LIGHTNING.debuffDuration * wz.debuffMult));
}
function stun(w: World, wz: Wizard, seconds: number) {
  if (w.t < wz.invulnUntil) return;
  wz.stunLeft = Math.max(wz.stunLeft ?? 0, statusDuration(w, wz, seconds * wz.debuffMult));
  wz.casting = null;
  wz.basicCasting = undefined;
  wz.dashUntil = wz.thrustUntil = 0; // encerra avanço voluntário, mas preserva forças externas.
}
// Resistance to new impulses while Hold ground is active: fixed today; the guard stance grows from 0 to GUARD.max over GUARD.ramp
export const braceResistance = (w: World, wz: Wizard) => !bracingActive(w, wz) ? 0 : wz.guard ? GUARD.max * Math.min(1, (w.t - (wz.braceReadyAt ?? w.t)) / GUARD.ramp) : BRACE.resistance;
function addKnock(w: World, wz: Wizard, impulse: Vec) {
  if (bracingActive(w, wz)) impulse = scale(impulse, 1 - braceResistance(w, wz));
  if (shielded(w, wz)) impulse = scale(impulse, SHIELD.knock);
  if (closedBodyActive(w, wz)) impulse = scale(impulse, CLOSED_BODY.knock);
  wz.vel = add(wz.vel, impulse);
  if (len(impulse) <= 0 || !isSliding(wz)) return;
  // O relógio de controle não precisa carregar o resto do impulso depois do limite de caminhada.
  stun(w, wz, Math.log(len(wz.vel) / STUN_SPEED) / FRICTION);
}
const bubble = (w: World, wz: Wizard) => (shielded(w, wz) ? Math.max(0, wz.shieldR - WIZ_R) : 0); // quanto a bolha do escudo passa do mago
// aliados: do mesmo time e não é a própria pessoa (fora dos modos com time, ninguém é aliado)
// a controlled body (a) treats its controller (b) as an ally, so area statuses it casts spare them (Squid Pix); not the other way round
const allies = (a: Wizard | undefined, b: Wizard) => !!a && a !== b && ((a.team !== null && a.team === b.team) || a.puppetBy === b.id);

// src: o que causou o dano (magia, item, choque ou pilar), para o placar e os dados de balanceamento
function knockScale(dmg: number, taken: number, resist: number) {
  const big = dmg > KB_SOFT_CAP ? Math.sqrt(KB_SOFT_CAP * dmg) / dmg : 1;
  return big * (1 + (KNOCK_HP_SCALE * taken) / HP_MAX) * Math.max(0, 1 - resist);
}

// último golpe, para o crédito do abate; também o efeito sem dano num inimigo (Troca, Agarrar, Magnetizar; #179)
function mark(w: World, target: Wizard, by: string, src: string) {
  target.lastHitBy = actor(w, by);
  target.lastHitSrc = src;
  target.lastHitAt = w.t;
}

// Runa da aflição de quem lançou (as magias desta lista estão em AFFLICT_SPELLS, items.ts, que a dica mostra): alonga as lentidões e penalidades por cima do debuffMult do alvo (Relógio, Anel amaldiçoado)
const afflictBy = (w: World, id: string) => byId(w, id)?.afflict ?? 1;

function hit(w: World, target: Wizard, by: string, dmg: number, knock: number, dir: Vec, src: string, knockDmg = dmg) {
  // a controlled body never hurts its controller (Fernando's grill of 25/10: "everything is yours")
  if (by !== target.id && actor(w, by) === target.id) return;
  by = actor(w, by);
  // invulnerável: sem dano nem empurrão, mas o acerto aparece (explosão e som), senão o projétil sumiria sem efeito
  if (w.t < target.invulnUntil) return void w.events.push({ k: 'hit', id: target.id, by, x: target.pos.x, y: target.pos.y, dmg: 0, src });
  // como no mod de Dota 2 (pawn.lua): acima de 100 de dano por golpe o empurrão cresce pela raiz, não em linha reta
  const mult = knockScale(knockDmg, target.dmgTaken, target.kbResist);
  // fogo amigo: só empurra; sem dano, sem roubo de vida e sem crédito de abate para o aliado
  if (allies(anyById(w, by), target)) {
    addKnock(w, target, scale(norm(dir), knock * mult));
    return void w.events.push({ k: 'hit', id: target.id, by, x: target.pos.x, y: target.pos.y, dmg: 0, src });
  }
  // runa da Fúria de quem bateu
  const att = by !== target.id ? byId(w, by) : undefined;
  if (att && att.rune === 'fury' && w.t < att.runeUntil) dmg *= 1 + RUNE.fury;
  if (shielded(w, target)) dmg = 0; // áreas e golpes não refletidos também respeitam a proteção geral.
  // crítico (Lente Letal) depois da Fúria e antes de Guardião e Escudo: multiplica o golpe já forte (Pacto e Fúria somam sem teto, regra geral)
  // e as defesas do alvo cortam o golpe já crítico. Só sorteia quem tem chance, para as partidas sem o item seguirem com a mesma sequência de sorteios
  const crit = !!att && att.crit > 0 && dmg > 0 && w.rand() < att.crit;
  if (crit) dmg *= 1 + CRIT.dmg + att!.critDmg;
  // Guardião: tira um pouco de cada golpe, nunca mais que metade dele (senão zerava os tiques da Gravidade e do Elo)
  dmg = Math.max(dmg * 0.5, dmg - target.ward);
  // runa do Escudo: menos dano levado (o empurrão do golpe continua)
  if (target.rune === 'shield' && w.t < target.runeUntil) dmg *= 1 - RUNE.armor;
  // Botas de choque: golpe de outro mago dá velocidade por alguns segundos
  if (target.shockBonus > 0 && by !== target.id && dmg > 0) target.shockUntil = w.t + SHOCK_BOOTS.secs[target.items.shock_boots - 1];
  // Investida: depois do empurrão, absorve metade do golpe (de outro mago) e converte em velocidade
  if (w.t < target.rushUntil && by !== target.id && target.rushLeft > 0) {
    const absorbed = Math.min(target.rushLeft, dmg * RUSH.share);
    target.rushLeft -= absorbed;
    target.rushBonus += absorbed * RUSH.perHp;
    dmg -= absorbed;
  }
  dmg *= damageFactor(w, target);
  target.hp -= dmg;
  target.dmgTaken += dmg;
  // Agarrar: o primeiro golpe com dano de outro mago solta o preso e empurra mais longe
  const release = w.t < target.gripUntil && dmg > 0 && by !== target.id ? 1 + target.gripBonus : 1;
  if (release > 1) target.gripUntil = 0;
  // Botas de vento: causar ou levar dano acaba a calmaria
  if (dmg > 0 && by !== target.id) {
    target.calmSince = w.t;
    if (att) att.calmSince = w.t;
  }
  addKnock(w, target, scale(norm(dir), knock * mult * release));
  mark(w, target, by, src);
  // roubo de vida: quem acertou recupera parte do dano (e, como no original, a cura reduz o dano acumulado pela metade dela)
  if (att && att.lifesteal > 0) heal(w, att, dmg * att.lifesteal);
  w.events.push({ k: 'hit', id: target.id, by, x: target.pos.x, y: target.pos.y, dmg: Math.round(dmg), src, ...(crit && { crit: true as const }) });
}

// ponto do segmento a→a+d mais perto de p: a fração t em [0,1] ao longo dele e a distância de p até ele
function segT(a: Vec, d: Vec, p: Vec): [t: number, gap: number] {
  const dd = dot(d, d);
  const t = dd > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / dd)) : 0;
  return [t, dist(add(a, scale(d, t)), p)];
}

// primeiro mago (fora os excluídos) que o segmento a→b toca; t em [0,1] ao longo do segmento
function firstOnSegment(w: World, a: Vec, b: Vec, radius: number, skip: string, only?: string): { wz: Wizard; t: number } | null {
  const d = sub(b, a);
  let best: { wz: Wizard; t: number } | null = null;
  for (const wz of w.wizards) {
    // A suspended body is out of the projectiles' plane, Shield collision bubble included
    if (!wz.alive || isSuspended(wz) || wz.id === skip || wz === puppeteer(w, anyById(w, skip)) || (only !== undefined && wz.id !== only)) continue;
    const [t, gap] = segT(a, d, wz.pos);
    // com escudo, a bolha (maior que o mago) é que encosta
    if (gap > radius + bubble(w, wz) + (bodyR(wz) - WIZ_R)) continue; // radius already counts a WIZ_R body; the parentheses add exactly 0 in PvP
    if (!best || t < best.t) best = { wz, t };
  }
  return best;
}

// O Elo preso e o lançador do Divisor já não são projéteis em voo; áreas e cópia seguem seus próprios prazos.
const clashes = (p: Projectile) => PROJECTILE_COLLISION[p.kind] !== null && p.waves === undefined && !(p.kind === 'link' && (p.target || p.pillar !== undefined || p.decoyTarget !== undefined));

// Limpa todos os projéteis tocados até o bloqueio real do feixe, de qualquer dono, sem consumir o Raio nem gerar dano extra.
function clearProjectilesOnSegment(w: World, a: Vec, b: Vec) {
  if (!LIGHTNING.destroysProjectiles) return;
  const d = sub(b, a);
  w.projectiles = w.projectiles.filter((p) => {
    if (!clashes(p) || segT(a, d, p.pos)[1] > PROJ_R + LIGHTNING.width) return true;
    w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'pulse', r: LIGHTNING.destroyFxRadius });
    return false;
  });
}

// explosão em área: dano e empurrão em todos dentro do raio (inclusive donos), caindo até zero na borda
function area(w: World, at: Vec, radius: number, dmg: number, kbFactor: number, by: string | null, combo: ComboKind) {
  for (const o of w.wizards) {
    if (!o.alive) continue;
    const d = dist(o.pos, at);
    if (d > radius + bodyR(o)) continue;
    const k = Math.max(0, 1 - d / (radius + bodyR(o)));
    const amount = dmg * k;
    if (amount <= 0.5) continue;
    hit(w, o, by && by !== o.id ? by : (o.lastHitBy ?? by ?? o.id), amount, amount * KB_PER_DMG * kbFactor, sub(o.pos, at), 'choque:' + combo);
  }
  for (const q of w.projectiles) {
    const owner = anyById(w, q.owner);
    const caster = by ? byId(w, by) : undefined;
    if (q.kind !== 'illusion' || q.owner === by || (caster && owner && allies(caster, owner))) continue;
    const d = dist(q.pos, at);
    if (d > radius + WIZ_R) continue;
    const amount = dmg * Math.max(0, 1 - d / (radius + WIZ_R));
    if (amount > 0.5) pushDecoy(q, scale(norm(sub(q.pos, at)), amount * KB_PER_DMG * kbFactor), amount);
  }
  blastPillars(w, at, radius, (k) => dmg * k, by);
  w.events.push({ k: 'clash', x: at.x, y: at.y, combo, r: radius });
  const kind = combo === 'fire' || combo === 'detonate' ? 'burn' : combo === 'arcane' ? 'slow' : combo === 'pulse' ? 'pull' : null;
  if (kind) w.zones.push({ pos: at, r: radius * ZONES.size, kind, until: w.t + (combo === 'detonate' ? 3.5 : ZONES[kind].secs), by });
}

// combinações quando dois projéteis de donos diferentes se encontram (minha decisão; no original os dois só somem)
// (mais fortes e maiores a pedido do Fernando, 17/10)
export const CLASH = {
  fire: { r: 2.0, dmg: 70, kb: 1.3 },
  arcane: { r: 2.6, dmg: 90, kb: 1.6 },
  pulse: { r: 1.6, dmg: 50, kb: 1.1 },
  detonate: { r: 2.0 }, // original 225 unidades (1,46 m)
};

function clashProjectiles(w: World) {
  const gone = new Set<Projectile>();
  for (let i = 0; i < w.projectiles.length; i++) {
    const a = w.projectiles[i];
    if (gone.has(a) || !clashes(a)) continue;
    for (let j = i + 1; j < w.projectiles.length; j++) {
      const b = w.projectiles[j];
      // magias do mesmo dono ou de aliados (modo Times) não se chocam
      const team = byId(w, a.owner)?.team ?? null;
      if (gone.has(b) || !clashes(b) || a.owner === b.owner || (team !== null && team === byId(w, b.owner)?.team) || dist(a.pos, b.pos) > PROJ_R * 2 + 0.1) continue;
      const ae = PROJECTILE_COLLISION[a.kind], be = PROJECTILE_COLLISION[b.kind];
      // Ataque frágil cede ao choque sem apagar a magia nem criar dano de combinação.
      if (ae === 'fragile' || be === 'fragile') {
        if (ae === 'fragile') gone.add(a);
        if (be === 'fragile') gone.add(b);
        const at = ae === 'fragile' ? a.pos : b.pos;
        w.events.push({ k: 'clash', x: at.x, y: at.y, combo: 'pulse', r: PROJ_R * 2 });
        if (gone.has(a)) break;
        continue;
      }
      gone.add(a);
      gone.add(b);
      const at = scale(add(a.pos, b.pos), 0.5);
      if (ae && be && ae !== 'plain' && be !== 'plain') {
        const combo = ae === be ? ae : 'arcane';
        const c = CLASH[combo];
        area(w, at, c.r, c.dmg * Math.max(a.dmgMult, b.dmgMult), c.kb, null, combo);
      } else w.events.push({ k: 'clash', x: at.x, y: at.y, combo: 'pulse', r: .6 });
      break;
    }
  }
  if (gone.size) w.projectiles = w.projectiles.filter((p) => !gone.has(p));
}

function firstPillarOnSegment(w: World, a: Vec, b: Vec, radius: number): { i: number; t: number } | null {
  const d = sub(b, a);
  let best: { i: number; t: number } | null = null;
  w.pillars.forEach((p, i) => {
    if (!p.alive) return;
    const [t, gap] = segT(a, d, p.pos);
    if (gap > OBSTACLES[p.kind].r + radius) return;
    if (!best || t < best.t) best = { i, t };
  });
  return best;
}

// Every blast hits the obstacles it reaches, like the wizards (Fernando, 25/10); dmgAt gets the closeness k (1 at the
// centre, 0 at the edge plus the obstacle's radius). A wall is hit once, however many pieces are inside
function blastPillars(w: World, at: Vec, radius: number, dmgAt: (k: number) => number, by: string | null) {
  const walls = new Set<number>();
  w.pillars.forEach((q, i) => {
    const reach = radius + OBSTACLES[q.kind].r, d = dist(q.pos, at);
    if (!q.alive || d > reach || (q.wall !== undefined && walls.has(q.wall))) return;
    if (q.wall !== undefined) walls.add(q.wall);
    const dmg = dmgAt(Math.max(0, 1 - d / reach));
    if (dmg > 0.5 && Number.isFinite(q.hp)) damagePillar(w, i, dmg, by); // no hit effect on an unbreakable Campaign rock
  });
}

function damagePillar(w: World, i: number, dmg: number, by: string | null, quiet = false) {
  const p = w.pillars[i];
  // parede: os 3 pedaços compartilham a vida, quebram juntos e explodem uma vez só, no meio
  const mates = p.wall === undefined ? [p] : w.pillars.filter((q) => q.wall === p.wall && q.alive);
  for (const q of mates) q.hp -= dmg;
  if (!quiet) w.events.push({ k: 'pillar', i, x: p.pos.x, y: p.pos.y });
  if (p.hp > 0) return;
  for (const q of mates) q.alive = false;
  const at = p.wall === undefined ? p.pos : w.pillars[p.wall].pos;
  const o = OBSTACLES[p.kind];
  // o ouro cai na pedra: baú que a lava pegou espalha o monte na beira de dentro
  if (p.kind === 'chest') w.loots.push({ pos: safeInside(w, p.pos, 0.6), left: p.gold ?? CHEST.pile[1], until: w.t + CHEST.pileSecs });
  if (o.blastR > 0) area(w, at, o.blastR, o.blastDmg, 1, by, 'pillar');
  else w.events.push({ k: 'clash', x: at.x, y: at.y, combo: 'pillar', r: o.r * 1.5 });
}

// magos não atravessam pilares: empurra para fora e corta o deslize na direção do pilar
function blockPillars(w: World, walking?: ReadonlySet<Wizard>) {
  const burnt = new Set<number>();
  for (const p of w.pillars) {
    if (p.alive && p.until !== undefined && w.t >= p.until) {
      // o Pilar de pedra acaba: some sem explodir (removeObstacle do original); a parede some com uma nuvem só, no meio, do tamanho dela
      p.alive = false;
      if (p.wall === undefined) w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'pillar', r: OBSTACLES[p.kind].r * 1.5 });
      else if (w.pillars[p.wall] === p) w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'pillar', r: 1.1 });
    }
    if (!p.alive) continue;
    // baú na lava quebra sozinho (Fernando, 18/10)
    if (p.kind === 'chest' && edge(w, p.pos) < 0) {
      damagePillar(w, w.pillars.indexOf(p), p.hp, null);
      continue;
    }
    // An obstacle the shrinking arena left in the lava burns at a wizard's lava rate (round effect included) until it breaks;
    // quiet: no hit flash or sound every step, only the usual break effect at the end (Fernando, 25/10).
    // The wall's pieces share one health, so it burns once per step however many pieces are in the lava
    if (inLava(w, p.pos) && (p.wall === undefined || !burnt.has(p.wall))) {
      if (p.wall !== undefined) burnt.add(p.wall);
      damagePillar(w, w.pillars.indexOf(p), LAVA_DPS * DT * w.mods.lava, null, true);
      if (!p.alive) continue;
    }
    for (const wz of w.wizards) {
      if (!wz.alive || isSuspended(wz)) continue;
      const d = sub(wz.pos, p.pos);
      const l = len(d);
      const min = OBSTACLES[p.kind].r + bodyR(wz);
      if (l >= min) continue;
      // Deslizar pela tangente ainda é bloqueio: clique único para no primeiro contato, sem orbitar o objeto.
      if (walking?.has(wz) && wz.target && !wz.moveHeld) {
        wz.target = null;
        wz.blockedMove = true;
      }
      const n = l > 1e-6 ? scale(d, 1 / l) : v(1, 0);
      wz.pos = add(p.pos, scale(n, min));
      const into = dot(wz.vel, n);
      if (into < 0) wz.vel = sub(wz.vel, scale(n, into * 1.5)); // quica de leve
    }
  }
}

// o mais perto, fora skip; nos Times, também fora o time do dono (só inimigos)
function nearestEnemy(w: World, to: Vec, skip: string, owner = skip): Wizard | null {
  const me = anyById(w, owner);
  let best: Wizard | null = null;
  for (const wz of w.wizards) {
    if (!wz.alive || isSuspended(wz) || wz.id === skip || wz.id === owner || allies(me, wz)) continue;
    if (!best || dist(wz.pos, to) < dist(best.pos, to)) best = wz;
  }
  return best;
}

// cura (Drenar, Roubo de vida): como no original, tira do dano acumulado metade do que curou (pawn.lua)
function heal(w: World, wz: Wizard, amount: number) {
  amount *= w.mods.heal; // Fonte da vida
  wz.hp = Math.min(wz.hpMax, wz.hp + amount);
  wz.dmgTaken = Math.max(0, wz.dmgTaken - amount * 0.5);
}

// ponytail: duas lentidões juntas valem a maior (no original somavam); somar pede uma lista de efeitos por mago
function slowDown(w: World, wz: Wizard, amount: number, secs: number) {
  wz.slow = w.t < wz.slowUntil ? Math.max(wz.slow, amount) : amount;
  wz.slowUntil = Math.max(wz.slowUntil, w.t + statusDuration(w, wz, secs));
}

// quantos 'fire' cada lançamento conta (a Rajada sai com 4 e o Divisor com 8 filhotes); as outras, 1
const SHOTS: Partial<Record<SpellId, number>> = { splitter: 2 * SPLITTER.waves };

function geyserLift(w: World, p: Projectile) {
  const L = spellLevel('geyser', p.level);
  for (const z of w.wizards) {
    if (!z.alive || dist(z.pos, p.pos) > L.radius + bodyR(z)) continue;
    if (!isSuspended(z)) z.geyserAt = { ...z.pos };
    z.geyserLeft = Math.max(z.geyserLeft ?? 0, p.until - w.t);
    z.invulnUntil = Math.max(z.invulnUntil, p.until);
    z.channel = undefined; z.casting = null; z.basicCasting = undefined; z.target = null;
    z.dashUntil = z.thrustUntil = 0; z.moveHeld = false;
    z.vel = v(0, 0);
  }
}

// Sand cone: damages, incapacitates and blinds every enemy inside it
function castCluster(w: World, wz: Wizard, L: Level, dir: Vec, dmgMult: number) {
  const length = L.range * wz.rangeF, width = L.width * wz.rangeF;
  w.events.push({ k: 'sand', id: wz.id, x: wz.pos.x, y: wz.pos.y, dx: dir.x, dy: dir.y, length, width });
  let landed = false;
  for (const z of w.wizards) {
    if (!z.alive || z === wz || allies(wz,z) || isSuspended(z) || w.t < z.invulnUntil || !inCone(wz.pos,dir,length,width,z.pos,bodyR(z)) || firstPillarOnSegment(w,wz.pos,z.pos,0) || wallClip(w,wz.pos,z.pos) !== z.pos) continue; // Campaign walls block it like Lightning
    hit(w,z,wz.id,L.dmg*dmgMult,0,dir,'cluster');
    z.incapacitateUntil = Math.max(z.incapacitateUntil ?? 0,w.t+statusDuration(w,z,L.incapacitate*z.debuffMult));
    z.blindUntil = Math.max(z.blindUntil ?? 0,w.t+statusDuration(w,z,L.blind*z.debuffMult));
    landed = true;
  }
  if (landed) w.events.push({k:'land',id:wz.id,src:'cluster'});
}

// Barricade: a 3-stone wall at the target that hits whoever stands under it
function castRockpillar(w: World, wz: Wizard, L: Level, at: Vec, dmgMult: number) {
  // rockpillar.lua: place an obstacle within range that expires after its duration
  const pos = add(wz.pos, clampLen(sub(at, wz.pos), L.range * wz.rangeF));
  // Place the wall across the caster-to-target path, with one stone at the target and one on each side
  const way = len(sub(at, wz.pos)) > 1e-6 ? norm(sub(at, wz.pos)) : v(Math.cos(wz.facing), Math.sin(wz.facing));
  const side = v(-way.y, way.x), mid = w.pillars.length;
  for (const k of [0, -1, 1]) w.pillars.push({ pos: add(pos, scale(side, k * WALL_GAP)), hp: OBSTACLES.rockpillar.hp, alive: true, kind: 'rockpillar', until: w.t + L.duration, wall: mid });
  // Falls from above (#206): anyone under the wall takes a hit and is pushed away from its line.
  // The wall blocks immediately so it can defend against incoming projectiles; only the fall is visual
  const a = sub(pos, scale(side, WALL_GAP)), seg = scale(side, 2 * WALL_GAP);
  for (const z of w.wizards) {
    if (!z.alive || z === wz || segT(a, seg, z.pos)[1] > OBSTACLES.rockpillar.r + bodyR(z)) continue;
    const away = dot(sub(z.pos, pos), way) < 0 ? scale(way, -1) : way;
    hit(w, z, wz.id, L.dmg * dmgMult, L.knock * dmgMult, away, 'rockpillar');
  }
}

// Lightning: hits the first wizard or obstacle on the line, then jumps to the nearest enemy of each one struck
function castLightning(w: World, wz: Wizard, L: Level, dir: Vec, dmgMult: number) {
  const end = wallClip(w, wz.pos, add(wz.pos, scale(dir, L.range * wz.rangeF)));
  const found = firstOnSegment(w, wz.pos, end, WIZ_R + LIGHTNING.width, wz.id);
  const pil = firstPillarOnSegment(w, wz.pos, end, 0.1);
  const stop = pil && (!found || pil.t < found.t) ? w.pillars[pil.i].pos : found ? found.wz.pos : end;
  for (const q of enemyDecoys(w, wz.id)) if (segT(wz.pos, sub(stop, wz.pos), q.pos)[1] <= WIZ_R + LIGHTNING.width) pushDecoy(q, scale(dir, L.knock * dmgMult), L.dmg * dmgMult);
  clearProjectilesOnSegment(w, wz.pos, stop);
  if (pil && (!found || pil.t < found.t)) {
    const at = w.pillars[pil.i].pos;
    w.events.push({ k: 'lightning', from: wz.pos, to: at });
    damagePillar(w, pil.i, L.dmg * dmgMult, wz.id);
    return;
  }
  if (!found) return void w.events.push({ k: 'lightning', from: wz.pos, to: end });
  let target: Wizard | undefined = found.wz;
  let from = wz.pos, reach = L.range * wz.rangeF, power = dmgMult;
  const struck = new Set<string>([wz.id]);
  let landed = false;
  while (target) {
    struck.add(target.id); // Each body is hit once; the set terminates the chain without an arbitrary jump limit.
    w.events.push({ k: 'lightning', from, to: target.pos });
    if (shielded(w, target)) {
      w.events.push({ k: 'reflect', id: target.id, x: target.pos.x, y: target.pos.y });
      w.events.push({ k: 'lightning', from: target.pos, to: wz.pos });
      hit(w, wz, target.id, L.dmg * power, L.knock * power, sub(wz.pos, target.pos), 'lightning', L.dmg * dmgMult);
      applyElectrocution(w, wz);
      break; // Reflect back to the caster without starting another chain from the shield.
    }
    // Use the original hit's soft cap so reduced damage also reduces each jump's impulse by 50%.
    hit(w, target, wz.id, L.dmg * power, L.knock * power, sub(target.pos, from), 'lightning', L.dmg * dmgMult);
    if (!allies(wz, target)) applyElectrocution(w, target);
    if (!landed) w.events.push({ k: 'land', id: wz.id, src: 'lightning' });
    landed = true;
    from = target.pos;
    power *= LIGHTNING.jumpPower;
    let closest = reach;
    target = undefined;
    for (const other of w.wizards) {
      if (!other.alive || isSuspended(other) || struck.has(other.id) || allies(wz, other)) continue;
      const distance = dist(from, other.pos);
      if (distance > closest || firstPillarOnSegment(w, from, other.pos, .1)) continue;
      // Ties preserve wizard order; choosing the next enemy consumes no random draws.
      if (target && distance === closest) continue;
      target = other;
      closest = distance;
    }
    if (target) {
      clearProjectilesOnSegment(w, from, target.pos);
    }
  }
}

// copy: the controller's level when a controlled body repeats the cast (Squid Pix), without the body's own spells or cooldowns
function cast(w: World, wz: Wizard, spell: SpellId, at: Vec, power = 1, aimedId?: string, copy?: number) {
  const firstId = w.nextId, from = wz.pos, ready = wz.cd[spell];
  castSpell(w, wz, spell, at, power, aimedId, copy);
  for (const p of w.projectiles) if (p.id >= firstId) p.power = power;
  // only a cast that went out (its cooldown started) is repeated by each controlled body; one level only,
  // so a controlled wizard's own targets do not repeat the copy
  if (copy === undefined && wz.cd[spell] !== ready) for (const z of puppetsOf(w, wz)) {
    // the copy aims at the caster's point (the two shots make a V, Fernando 26/10); standing on it, the caster's direction
    if (!isSuspended(z) && !castBlocked(isStunned(z), w.t < z.gripUntil, spell)) cast(w, z, spell, dist(at, z.pos) > .01 ? at : add(z.pos, sub(at, from)), power, aimedId, wz.spells[spell]);
  }
}

function castSpell(w: World, wz: Wizard, spell: SpellId, at: Vec, power: number, aimedId?: string, copy?: number) {
  if (spell === 'channel') return;
  const level = copy ?? wz.spells[spell];
  if (!level || (copy === undefined && w.t < wz.cd[spell])) return;
  const L = channelLevel(spellLevel(spell, level), power);
  const recipient = spell === 'heal' ? healTarget(w.wizards, wz, at, L.range * wz.rangeF) : undefined;
  if (spell === 'heal' && !recipient) return;
  if (spell === 'closedbody' && !bracingActive(w, wz)) return;
  const aimed = spell === 'sniper' ? sniperVictim(w,wz,at,L.range*wz.rangeF,aimedId) : undefined;
  if (spell === 'sniper' && !aimed) return;
  if (copy === undefined) wz.cd[spell] = w.t + L.cd;
  if (recipient) {
    const before = recipient.hp;
    heal(w, recipient, L.heal);
    wz.windUntil = 0;
    w.events.push({ k: 'heal', id: recipient.id, x: recipient.pos.x, y: recipient.pos.y, amount: recipient.hp - before });
    return;
  }
  for (let i = 0; i < (SHOTS[spell] ?? 1); i++) w.events.push({ k: 'fire', id: wz.id, src: spell });
  wz.windUntil = 0; // qualquer magia acaba com a Caminhada no vento (windwalkmodifier.lua)
  // Elo: teleportar ou trocar para fora da arena solta o mago ligado (linkmodifier.lua)
  if ((spell === 'teleport' || spell === 'swap') && !inArena(w, at)) w.projectiles = w.projectiles.filter((p) => !(p.kind === 'link' && p.owner === wz.id && p.target));
  if (w.t < wz.gripUntil) wz.dmgTaken += GRIP.castPenalty; // preso, cada magia custa mais empurrão
  const dmgMult = L.dmg > 0 ? usePact(w, wz) : 1;
  if (aimed) {
    const clipped = wallClip(w,wz.pos,aimed.pos);
    const pil = firstPillarOnSegment(w,wz.pos,clipped,0);
    const wallBlocked = clipped !== aimed.pos;
    const to = pil ? w.pillars[pil.i].pos : clipped;
    w.events.push({ k: 'snipe', id: wz.id, from: { ...wz.pos }, to: { ...to } });
    if (pil) damagePillar(w,pil.i,L.dmg*dmgMult,wz.id);
    else if (!wallBlocked) { hit(w,aimed,wz.id,L.dmg*dmgMult,0,sub(aimed.pos,wz.pos),'sniper'); w.events.push({k:'land',id:wz.id,src:'sniper'}); }
    return;
  }
  if (spell === 'scourge') return scourge(w, wz, L, dmgMult);
  if (spell === 'closedbody') {
    wz.closedBodyUntil = w.t + L.duration;
    return;
  }
  if (spell === 'pact') {
    wz.pactUntil = w.t + L.duration;
    return;
  }
  const dir = norm(sub(at, wz.pos));
  wz.facing = Math.atan2(dir.y, dir.x);
  const flight = (L.range / L.speed) * wz.rangeF; // segundos de voo do alcance todo

  // projétil reto saindo do mago; life em segundos (já com o alcance do Elmo)
  const launch = (kind: ProjKind, d: Vec, life: number, target: string | null = null, from = add(wz.pos, scale(d, PROJ_SPAWN))) => {
    const p: Projectile = { id: w.nextId++, born: w.t, kind, owner: wz.id, pos: from, vel: scale(d, L.speed), level, until: w.t + life, target, dmgMult, caster: wz.id };
    w.projectiles.push(p);
    return p;
  };

  if (spell === 'fireball' || spell === 'homing') {
    const homing = spell === 'homing';
    launch(spell, dir, homing ? L.duration * wz.rangeF : flight, homing ? (nearestEnemy(w, at, wz.id)?.id ?? null) : null);
  } else if (spell === 'cluster') {
    castCluster(w, wz, L, dir, dmgMult);
  } else if (spell === 'pix') {
    const to = add(wz.pos, clampLen(sub(at, wz.pos), L.range * wz.rangeF));
    w.projectiles.push({ id: w.nextId++, born: w.t, kind: 'pix', owner: wz.id, pos: to, vel: v(0, 0), level, until: w.t + PIX.rain, target: null, dmgMult, caster: wz.id, soak: {} });
  } else if (spell === 'grip') {
    const to = add(wz.pos, clampLen(sub(at, wz.pos), L.range * wz.rangeF));
    w.projectiles.push({ id: w.nextId++, born: w.t, kind: 'grip', owner: wz.id, pos: to, vel: v(0, 0), level, until: w.t + GRIP.delay, target: null, dmgMult, caster: wz.id });
  } else if (spell === 'snowball' || spell === 'magnetize') {
    launch(spell, dir, flight);
  } else if (spell === 'swap') {
    // voa o alcance todo e troca com o primeiro mago que tocar (no original parava no clique e errava quem se mexia);
    // errou: vai só até a metade do caminho até a mira (pedidos do Fernando, 17/10)
    launch('swap', dir, (L.range * wz.rangeF) / L.speed, null, wz.pos).dest = add(wz.pos, scale(clampLen(sub(at, wz.pos), L.range * wz.rangeF), 0.5));
  } else if (spell === 'meteor') {
    const to = add(wz.pos, clampLen(sub(at, wz.pos), L.range * wz.rangeF));
    w.projectiles.push({ id: w.nextId++, born: w.t, kind: 'meteor', owner: wz.id, pos: to, vel: v(0, 0), level, until: w.t + METEOR_DELAY, target: null, dmgMult, caster: wz.id });
  } else if (spell === 'rush') {
    wz.rushUntil = w.t + L.duration;
    wz.rushLeft = L.absorb;
    wz.rushPower = power;
    wz.rushBonus = RUSH.bonus;
    wz.dashUntil = w.t + RUSH.dashTime - DT / 2; // meio passo de folga: o arredondamento daria um passo a mais
    wz.dashVel = scale(dir, (RUSH.dash * power) / RUSH.dashTime);
    wz.dashHit = [];
    wz.target = null;
  } else if (spell === 'boomerang') {
    // boomerang.lua e boomerangprojectile.lua: velocidade e acelerações que levam ao ponto (300 a 800 u) em curva e trazem de volta
    const d = Math.min(Math.max(len(sub(at, wz.pos)), BOOMERANG.minDist), L.range * wz.rangeF);
    const perp = v(-dir.y, dir.x);
    const par = -(L.speed * L.speed) / (2 * d);
    const side = (2 * par * BOOMERANG.side * power) / L.speed;
    const flip = -L.speed / par;
    const p = launch('boomerang', dir, BOOMERANG.life);
    p.vel = add(scale(dir, L.speed), scale(perp, BOOMERANG.side * power));
    p.curve = { acc: add(scale(dir, par), scale(perp, side)), next: sub(scale(dir, par), scale(perp, side)), flipAt: w.t + flip, stopAt: w.t + 2 * flip - 0.15 };
  } else if (spell === 'gravity') {
    launch('gravity', dir, flight).tick = w.t + GRAVITY.tick;
  } else if (spell === 'bouncer') {
    launch('bouncer', dir, flight).prev = wz.id;
  } else if (spell === 'thrust') {
    // thrust.lua: sai a 77% da velocidade rumo ao ponto (até 900 u) e acelera; dura o caminho + 0,09 s
    const d = Math.min(len(sub(at, wz.pos)), L.range * wz.rangeF);
    wz.vel = scale(dir, THRUST.start * L.speed);
    wz.thrustAcc = scale(dir, L.speed * THRUST.accel);
    wz.thrustUntil = w.t + THRUST.extra + d / L.speed;
    wz.thrustMult = dmgMult * power;
    wz.target = null;
  } else if (spell === 'rockpillar') {
    castRockpillar(w, wz, L, at, dmgMult);
  } else if (spell === 'drain') {
    // drain.lua: reto até o ponto (no máximo o alcance), depois vira para o mago mais perto e voa mais 1,2 s
    const turn = Math.min(len(sub(at, wz.pos)), L.range * wz.rangeF) / L.speed;
    launch('drain', dir, turn + DRAIN.extra * wz.rangeF).turnAt = w.t + turn;
  } else if (spell === 'illusion') {
    // a cópia segue o movimento atual (ou o destino recém-ordenado); parada, usa a direção da magia
    const moveDir = len(wz.vel) > 0.5 ? norm(wz.vel) : wz.target && dist(wz.target, wz.pos) > 0.1 ? norm(sub(wz.target, wz.pos)) : dir;
    const copy = launch('illusion', moveDir, L.duration, null, wz.pos);
    copy.decoyDamage = wz.dmgTaken;
    copy.decoyResist = wz.kbResist;
    copy.decoyDebuff = wz.debuffMult;
    wz.veilUntil = w.t + L.duration;
  } else if (spell === 'recharge') {
    launch('recharge', dir, flight).bonus = RECHARGE.perHit * wz.streak;
  } else if (spell === 'alteration') {
    wz.alterUntil = w.t + L.duration;
  } else if (spell === 'link') {
    // link.lua: voa o alcance e recolhe; preso a alguém ou a um obstáculo, fica até soltar (linkHold)
    launch('link', dir, LINK.life).turnAt = w.t + (L.range * wz.rangeF) / L.speed;
  } else if (spell === 'windwalk') {
    wz.windUntil = w.t + L.duration;
    wz.windMult = dmgMult * power;
  } else if (spell === 'splitter') {
    // splitter.lua: estoura no ponto se ele estiver mais perto que 1 s de voo; os 8 filhotes contam como 8 tiros (SHOTS)
    launch('splitter', dir, Math.min(L.range * wz.rangeF, len(sub(at, wz.pos))) / L.speed);
  } else if (spell === 'geyser') {
    const to = add(wz.pos, clampLen(sub(at, wz.pos), L.range * wz.rangeF));
    const p: Projectile = { id: w.nextId++, born: w.t, kind: 'geyser', owner: wz.id, pos: to, vel: v(0, 0), level, until: w.t + L.duration, target: null, dmgMult: 1, caster: wz.id };
    w.projectiles.push(p);
    geyserLift(w, p); // suspende já na criação, antes de preparos de outros magos no mesmo passo.
  } else if (spell === 'warpzone') {
    const to = add(wz.pos, clampLen(sub(at, wz.pos), L.range * wz.rangeF));
    w.projectiles.push({ id: w.nextId++, born: w.t, kind: 'warpzone', owner: wz.id, pos: to, vel: v(0, 0), level, until: w.t + L.duration, target: null, dmgMult, caster: wz.id });
  } else if (spell === 'lightning') {
    castLightning(w, wz, L, dir, dmgMult);
  } else if (spell === 'shield') {
    wz.shieldUntil = w.t + L.duration;
    wz.shieldR = L.radius;
  } else {
    // teleport
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

function sniperVictim(w: World, wz: Wizard, at: Vec, range: number, aimedId?: string) {
  const visible = w.wizards.filter(z => (!aimedId || z.id === aimedId) && w.t >= z.veilUntil && w.t >= z.windUntil && !isSuspended(z) && (w.t >= (wz.blindUntil ?? 0) || dist(wz.pos,z.pos) <= 3));
  return sniperTarget(visible,wz,at,range);
}

// começa a conjurar: confere nível e recarga agora; o efeito sai depois do tempo de conjuração
function beginCast(w: World, wz: Wizard, spell: SpellId, at: Vec) {
  if (spell === 'channel') return;
  if (castBlocked(isStunned(wz), w.t < wz.gripUntil, spell)) return;
  if (spell === 'closedbody' && !bracingActive(w, wz)) return;
  // a mesma magia já sendo conjurada: ignora a tecla repetida (a recarga só começa quando ela sai)
  if (wz.casting?.spell === spell && spell !== 'sniper') return;
  // Flagelo em preparo: nada mais sai até ele explodir, menos o Teleporte, que cancela a explosão (pedidos do Fernando, 17/10)
  if (wz.casting?.spell === 'scourge') {
    if (spell !== 'teleport') return;
    wz.casting = null;
  }
  // Charged aim waits for the player (Fernando, 26/10): the spell key again fires at the tracked target; nothing else is accepted.
  if (wz.casting?.spell === 'sniper') {
    if (spell !== 'sniper' || w.t + 1e-8 < wz.casting.fireAt) return;
    const c = wz.casting;
    wz.casting = null;
    return cast(w, wz, 'sniper', c.at, c.power, c.aimedId);
  }
  if (!wz.spells[spell] || w.t < wz.cd[spell]) return;
  // An invalid target neither reveals the wizard nor cancels another action.
  if (spell === 'heal' && !healTarget(w.wizards, wz, at, spellLevel(spell, wz.spells[spell]).range * wz.rangeF * (wz.channel?.spell === spell ? channelPower(w.t - wz.channel.since) || 1 : 1))) return;
  const aimed = spell === 'sniper' ? sniperVictim(w,wz,at,spellLevel(spell,wz.spells[spell]).range*wz.rangeF) : undefined;
  if (spell === 'sniper' && !aimed) return;
  let power = 1;
  if (wz.channel?.spell === spell) {
    power = channelPower(w.t - wz.channel.since);
    if (!power) return; // A premature click keeps charging instead of firing a weak spell.
  }
  wz.channel = undefined;
  wz.basicCasting = undefined; // só uma conjuração válida cancela o ataque em preparo.
  const delay = CAST_POINT[spell];
  const d = sub(at, wz.pos);
  // Closed Body reinforces the current stance instead of aiming at the cursor.
  if (spell !== 'closedbody' && len(d) > 0.01) wz.facing = Math.atan2(d.y, d.x);
  w.events.push({ k: 'cast', id: wz.id, spell });
  if (spell === 'sniper') wz.windUntil = 0;
  if (spell !== 'illusion') wz.veilUntil = 0; // outra magia revela o dono, mas a cópia continua até o próprio prazo
  if (delay <= 0) return cast(w, wz, spell, at, power);
  wz.target = null;
  wz.casting = { spell, at, fireAt: w.t + delay, power, aimedId: aimed?.id };
}

// Flagelo: explosão em volta; quanto mais perto do centro, mais empurrão (no original custava a mesma vida a quem usa;
// aqui não custa nada, a pedido do Fernando em 17/10)
function scourge(w: World, wz: Wizard, L: Level, mult: number) {
  const dmg = L.dmg * mult;
  // ao explodir, o empurrão que o mago está sofrendo acaba (Fernando, 21/10, issue #217: a explosão cancela o empurrão)
  wz.vel = v(0, 0);
  let landed = false;
  for (const o of w.wizards) {
    if (!o.alive || o.id === wz.id) continue;
    const d = dist(o.pos, wz.pos);
    if (d > L.radius + bodyR(o)) continue;
    const factor = 0.75 + 0.25 * Math.max(0, 1 - d / L.radius);
    hit(w, o, wz.id, dmg, dmg * KB_PER_DMG * factor, sub(o.pos, wz.pos), 'scourge');
    landed = true;
  }
  if (landed) w.events.push({ k: 'land', id: wz.id, src: 'scourge' });
  for (const q of w.projectiles) {
    const owner = anyById(w, q.owner);
    if (q.kind !== 'illusion' || q.owner === wz.id || (owner && allies(wz, owner))) continue;
    const d = dist(q.pos, wz.pos);
    if (d <= L.radius + WIZ_R) {
      const factor = 0.75 + 0.25 * Math.max(0, 1 - d / L.radius);
      pushDecoy(q, scale(norm(sub(q.pos, wz.pos)), dmg * KB_PER_DMG * factor), dmg);
    }
  }
  // também bate nos obstáculos e no baú dentro da explosão (pedido do Fernando, 17/10)
  blastPillars(w, wz.pos, L.radius, () => dmg, wz.id);
  // também destrói bolas de fogo e mísseis inimigos dentro da explosão (pedido do Fernando, 17/10)
  const caught = w.projectiles.filter((p) => p.owner !== wz.id && p.kind !== 'illusion' && !fixed(p) && p.kind !== 'snowball' && dist(p.pos, wz.pos) <= L.radius + PROJ_R);
  if (caught.length) {
    w.projectiles = w.projectiles.filter((p) => !caught.includes(p));
    for (const p of caught) w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'pulse', r: 0.6 });
  }
  w.events.push({ k: 'scourge', id: wz.id, x: wz.pos.x, y: wz.pos.y, r: L.radius });
}

function gripLand(w: World, p: Projectile) {
  const L = channelLevel(spellLevel('grip', p.level), p.power);
  let landed = false;
  for (const z of w.wizards) {
    if (!z.alive || z.id === p.owner || allies(anyById(w, p.owner), z) || w.t < z.invulnUntil || dist(z.pos, p.pos) > L.radius + bodyR(z)) continue;
    z.gripUntil = Math.max(z.gripUntil, w.t + statusDuration(w, z, L.duration * z.debuffMult * afflictBy(w, p.owner)));
    if (z.casting && castBlocked(false, true, z.casting.spell)) z.casting = null;
    z.dashUntil = z.thrustUntil = 0;
    z.gripBonus = L.scale;
    mark(w, z, p.owner, 'grip'); // crédito do abate sem dano (#179)
    z.target = null;
    w.events.push({ k: 'grip', id: z.id, x: z.pos.x, y: z.pos.y });
    landed = true;
  }
  // A erupção aparece também sem alvo; a marca não é uma zona persistente.
  w.events.push({ k: 'vines', x: p.pos.x, y: p.pos.y, r: L.radius });
  if (landed) land(w, p, 'grip');
}

// Lula Pix rain: everyone inside but the caster adds up time (allies too, Fernando's grill of 26/10); at PIX.soak s they repeat
// the caster's commands for the duration and their own actions stop
function pixRain(w: World, p: Projectile) {
  const L = channelLevel(spellLevel('pix', p.level), p.power);
  const by = actor(w, p.owner); // a copied rain hands its targets to the controller too
  for (const z of w.wizards) {
    if (!z.alive || z.id === p.owner || z.id === by || isSuspended(z) || w.t < z.invulnUntil || dist(z.pos, p.pos) > L.radius + bodyR(z)) continue;
    const soak = (p.soak![z.id] = (p.soak![z.id] ?? 0) + DT);
    if (soak + 1e-8 < PIX.soak) continue;
    delete p.soak![z.id];
    z.puppetBy = by;
    z.puppetUntil = w.t + statusDuration(w, z, L.duration * z.debuffMult * afflictBy(w, p.owner));
    z.target = null; z.moveHeld = false; z.casting = null; z.channel = undefined; z.basicCasting = undefined; z.braceUntil = 0;
    mark(w, z, by, 'pix');
    w.events.push({ k: 'pix', id: z.id, x: z.pos.x, y: z.pos.y });
    land(w, p, 'pix', true);
  }
}

// o meteoro cai: dano de dmgMin na borda até o máximo no centro, em todos menos quem lançou
function meteorLand(w: World, p: Projectile) {
  const L = channelLevel(spellLevel('meteor', p.level), p.power);
  let landed = false;
  for (const o of w.wizards) {
    if (!o.alive || o.id === p.owner) continue;
    const d = dist(o.pos, p.pos);
    if (d > L.radius + bodyR(o)) continue;
    const amount = (L.dmgMin + (L.dmg - L.dmgMin) * Math.max(0, 1 - d / L.radius)) * p.dmgMult;
    hit(w, o, p.owner, amount, amount * (L.knock / L.dmg), sub(o.pos, p.pos), 'meteor');
    stun(w, o, L.duration);
    landed = true;
  }
  const owner = anyById(w, p.owner);
  for (const q of w.projectiles) {
    const qo = q.kind === 'illusion' ? anyById(w, q.owner) : undefined;
    if (!qo || q.owner === p.owner || allies(owner, qo)) continue;
    const d = dist(q.pos, p.pos);
    if (d > L.radius + WIZ_R) continue;
    const amount = (L.dmgMin + (L.dmg - L.dmgMin) * Math.max(0, 1 - d / L.radius)) * p.dmgMult;
    pushDecoy(q, scale(norm(sub(q.pos, p.pos)), amount * (L.knock / L.dmg)), amount);
  }
  blastPillars(w, p.pos, L.radius, (k) => (L.dmgMin + (L.dmg - L.dmgMin) * k) * p.dmgMult, p.owner);
  w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'fire', r: L.radius });
  if (landed) land(w, p, 'meteor');
}

// a Troca sem alvo: o mago vai ao destino (metade do caminho até a mira), ou para onde ela bateu num obstáculo antes de chegar lá
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
  const L = channelLevel(spellLevel('gravity', g.level), g.power);
  const owner = anyById(w, g.owner);
  const pullBody = (body: { pos: Vec }) => {
    const d = dist(g.pos, body.pos);
    if (d <= GRAVITY.wizR) body.pos = add(body.pos, scale(norm(sub(g.pos, body.pos)), (L.pull / FRICTION) * (1 - (d * d) / (GRAVITY.wizR * GRAVITY.wizR)) * DT));
  };
  for (const o of w.wizards) {
    if (!o.alive || o.id === g.owner || allies(owner, o)) continue; // aliado não é puxado nem queimado
    // no original é aceleração na velocidade; aqui o mago parado zera velocidade abaixo de 0,05 m/s (moveWizard), então o puxão
    // vira deslocamento na velocidade de equilíbrio (puxão ÷ atrito), sem deixar o mago atordoado: ele ainda anda contra, como lá
    pullBody(o);
  }
  for (const q of w.projectiles) {
    if (q.kind === 'illusion') {
      // The copy has a wizard body: it does not gain projectile acceleration or change its walk
      const copyOwner = anyById(w, q.owner);
      if (q.owner !== g.owner && !(copyOwner && allies(owner, copyOwner))) pullBody(q);
      continue;
    }
    if (fixed(q) || q.kind === 'gravity') continue;
    const d = dist(g.pos, q.pos);
    if (d <= GRAVITY.projR) q.vel = add(q.vel, scale(norm(sub(g.pos, q.pos)), GRAVITY.projPull * (1.5 - (d * d) / (GRAVITY.projR * GRAVITY.projR)) * DT));
  }
  if (w.t < (g.tick ?? 0)) return;
  g.tick = w.t + GRAVITY.tick;
  for (const o of w.wizards) {
    if (!o.alive || o.id === g.owner || allies(owner, o) || dist(g.pos, o.pos) > L.radius) continue;
    hit(w, o, g.owner, L.dmg * GRAVITY.tick * g.dmgMult, 0, sub(o.pos, g.pos), 'gravity');
    land(w, g, 'gravity', true);
  }
}

// Bumerangue (boomerangprojectile.lua): indo, segue as acelerações da curva; voltando, vira até 1000 u/s² rumo ao dono
// a 1000 u/s e some ao encostar nele. Devolve false quando acabou
function steerBoomerang(w: World, p: Projectile, dt: number): boolean {
  const owner = byId(w, p.owner);
  if (!owner) return false;
  if (p.curve) {
    p.vel = add(p.vel, scale(p.curve.acc, dt));
    if (w.t >= p.curve.flipAt) [p.curve.acc, p.curve.flipAt] = [p.curve.next, Infinity];
    if (w.t >= p.curve.stopAt) [p.curve, p.back] = [undefined, true];
    return true;
  }
  if (dist(owner.pos, p.pos) < WIZ_R + PROJ_R) return false;
  const want = sub(scale(norm(sub(owner.pos, p.pos)), BOOMERANG.back * (p.power ?? 1)), p.vel);
  p.vel = add(p.vel, scale(norm(want), Math.min(len(want), BOOMERANG.turn * (p.power ?? 1) * dt)));
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
    if (dist(o.pos, wz.pos) > bodyR(wz) + bodyR(o) + THRUST.reach + bubble(w, o)) continue; // the giant boss is touched at its own edge
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
  for (const q of enemyDecoys(w, wz.id)) {
    if (dist(q.pos, wz.pos) > 2 * WIZ_R + THRUST.reach) continue;
    const k = Math.min(1, dot(wz.vel, wz.vel) / (L.speed * L.speed) / THRUST.full);
    pushDecoy(q, scale(norm(sub(q.pos, wz.pos)), L.knock * k * wz.thrustMult), L.dmg * k * wz.thrustMult);
    wz.vel = v(0, 0);
    wz.thrustUntil = 0;
    w.events.push({ k: 'land', id: wz.id, src: 'thrust' });
    return;
  }
}

// Caminhada no vento (windwalkmodifier.lua): o primeiro inimigo que encosta leva o dano e o efeito acaba (aliado atravessa)
function windTouch(w: World, wz: Wizard) {
  const L = spellLevel('windwalk', wz.spells.windwalk);
  for (const o of w.wizards) {
    if (!o.alive || o === wz || allies(wz, o) || dist(o.pos, wz.pos) > bodyR(wz) + bodyR(o) + WINDWALK.reach) continue;
    wz.windUntil = 0;
    hit(w, o, wz.id, L.dmg * wz.windMult, L.knock * wz.windMult, sub(o.pos, wz.pos), 'windwalk');
    w.events.push({ k: 'land', id: wz.id, src: 'windwalk' });
    return;
  }
  for (const q of enemyDecoys(w, wz.id)) {
    if (dist(q.pos, wz.pos) > 2 * WIZ_R + WINDWALK.reach) continue;
    wz.windUntil = 0;
    pushDecoy(q, scale(norm(sub(q.pos, wz.pos)), L.knock * wz.windMult), L.dmg * wz.windMult);
    w.events.push({ k: 'land', id: wz.id, src: 'windwalk' });
    return;
  }
}

// Marcas de chão não são desviadas por habilidades; a cópia da Ilusão continua móvel.
const fixed = (p: Projectile) => p.kind === 'meteor' || p.kind === 'warpzone' || p.kind === 'grip' || p.kind === 'geyser' || p.kind === 'pix';
const returning = (p: Projectile) => !!p.back && (p.kind === 'drain' || p.kind === 'recharge'); // bolinha voltando a quem lançou
export const spellOf = (k: ProjKind): SpellId => (k === 'shard' ? 'splitter' : k === 'basic' ? 'fireball' : k); // Attack reuses the Fireball visuals; numbers and hit source come from the projectile (stats, src)
// acerto conta para quem lançou ('land'), não para quem devolveu; once: só o primeiro (os que acertam mais de uma vez)
function land(w: World, p: Projectile, src: SpellId, once = false) {
  if (p.src) return; // hits outside spells do not count accuracy
  if (p.owner === p.caster && !(once && p.landed)) w.events.push({ k: 'land', id: p.caster, src });
  if (once) p.landed = true;
}

// Zonas de dobra (warpzone.lua) de inimigos de `id` (quem não é ele nem aliado dele) que cobrem o ponto p
function enemyWarps(w: World, id: string, p: Vec): Projectile[] {
  const me = anyById(w, id);
  return w.projectiles.filter((z) => {
    if (z.kind !== 'warpzone' || z.owner === id) return false;
    const zo = anyById(w, z.owner);
    return (!zo || !allies(me, zo)) && dist(z.pos, p) <= spellLevel('warpzone', z.level).radius;
  });
}

// projétil anda e vive mais devagar dentro da zona de um inimigo do dono (zonas juntas multiplicam)
function timeScale(w: World, p: Projectile): number {
  let ts = 1;
  for (const z of enemyWarps(w, p.owner, p.pos)) ts *= spellLevel('warpzone', z.level).scale;
  return ts;
}

// mago dentro da zona de um inimigo anda mais devagar (zonas juntas não somam)
const inWarp = (w: World, wz: Wizard) => enemyWarps(w, wz.id, wz.pos).length > 0;

// tempo lento: todos os prazos do projétil andam junto
function delay(p: Projectile, d: number) {
  p.until += d;
  if (p.curve) [p.curve.flipAt, p.curve.stopAt] = [p.curve.flipAt + d, p.curve.stopAt + d];
  if (p.tick !== undefined) p.tick += d;
  if (p.turnAt !== undefined) p.turnAt += d;
}

// Magnetizar (magnetizemodifier.lua): projéteis de inimigos do magnetizado a até 300 u viram para ele (atrai) ou para longe (repele)
function magnetPull(w: World) {
  for (const z of w.wizards) {
    if (!z.alive || w.t >= z.magnetUntil) continue;
    for (const q of w.projectiles) {
      if (q.kind === 'illusion' || fixed(q) || q.owner === z.id || allies(anyById(w, q.owner), z)) continue;
      const d = dist(q.pos, z.pos);
      if (d > MAGNETIZE.r) continue;
      // o original vira f por tique de 0,035 s; aqui a mesma curva por segundo com passos de 1/60 s
      const f = 1 - (1 - MAGNETIZE.f * (1 - (d * d) / (MAGNETIZE.r * MAGNETIZE.r))) ** (DT / MAGNETIZE.tick);
      q.vel = add(scale(q.vel, 1 - f), scale(norm(sub(z.pos, q.pos)), f * len(q.vel) * z.magnet));
    }
  }
}

// Alteração (alterationmodifier.lua): o primeiro projétil inimigo que entra na bolha indo para o mago troca de lugar com ele
function alter(w: World, p: Projectile, next: Vec): boolean {
  if (p.kind === 'gravity') return false;
  const owner = anyById(w, p.owner);
  for (const z of w.wizards) {
    if (!z.alive || isSuspended(z) || w.t >= z.alterUntil || z.id === p.owner || allies(owner, z)) continue;
    if (dist(next, z.pos) > spellLevel('alteration', z.spells.alteration).radius + PROJ_R || dot(p.vel, sub(z.pos, p.pos)) <= 0) continue;
    const from = z.pos;
    [z.pos, p.pos] = [p.pos, from];
    z.alterUntil = 0;
    w.events.push({ k: 'teleport', id: z.id, from, to: z.pos }, { k: 'land', id: z.id, src: 'alteration' });
    return true;
  }
  return false;
}

// bolinha voltando a quem lançou: a do Drenar cura, a da Recarga zera a recarga (drainhealprojectile.lua, rechargerefreshprojectile.lua)
function flyBack(w: World, p: Projectile, dt: number): boolean {
  const to = byId(w, p.target);
  if (!to || w.t >= p.until) return false;
  const drain = p.kind === 'drain';
  if (dist(to.pos, p.pos) < (drain ? DRAIN.reach : RECHARGE.reach)) {
    if (drain) heal(w, to, spellLevel('drain', p.level).dmg * p.dmgMult);
    else to.cd.recharge = w.t;
    return false;
  }
  p.vel = scale(norm(sub(to.pos, p.pos)), (drain ? DRAIN.back : RECHARGE.back) * (p.power ?? 1));
  p.pos = add(p.pos, scale(p.vel, dt));
  return true;
}

// Drenar: no inimigo, dano (empurrão 0,2), lentidão e uma bolinha de cura que volta a quem lançou; no aliado, cura e pressa
function drainHit(w: World, p: Projectile, wz: Wizard, L: Level) {
  const owner = anyById(w, p.owner);
  const amount = L.dmg * p.dmgMult;
  if (allies(owner, wz)) {
    heal(w, wz, amount);
    wz.haste = DRAIN.haste;
    wz.hasteUntil = w.t + L.duration;
    return;
  }
  hit(w, wz, p.owner, amount, L.knock * p.dmgMult, p.vel, 'drain');
  slowDown(w, wz, DRAIN.slow, L.duration * wz.debuffMult * afflictBy(w, p.owner));
  land(w, p, 'drain');
  w.projectiles.push({ id: w.nextId++, born: w.t, kind: 'drain', power: p.power, owner: p.owner, pos: p.pos, vel: v(0, 0), level: p.level, until: w.t + DRAIN.life, target: p.owner, dmgMult: p.dmgMult, caster: p.caster, back: true });
}

export const snowR = (level: number) => SNOWBALL.coll + SNOWBALL.perLevel * (level - 1);

// Bola de neve rolando: arrasta quem encosta e, a cada 0,5 s de contato, deixa lento e marca o dano (só inimigos, como no original)
function snowRoll(w: World, p: Projectile, at: Vec) {
  const L = channelLevel(spellLevel('snowball', p.level), p.power);
  const owner = anyById(w, p.owner);
  const dir = norm(p.vel);
  for (const o of w.wizards) {
    if (!o.alive || o.id === p.owner || allies(owner, o) || dist(at, o.pos) > bodyR(o) + snowR(p.level)) continue;
    const c = SNOWBALL.drag - dot(dir, o.vel);
    if (c > 0) addKnock(w, o, scale(dir, c));
    if (o.snow) continue;
    o.snow = { until: w.t + SNOWBALL.period, by: p.owner, dmg: L.dot * SNOWBALL.period * p.dmgMult };
    slowDown(w, o, SNOWBALL.slow, SNOWBALL.period * afflictBy(w, p.owner));
    land(w, p, 'snowball', true);
  }
  for (const q of w.projectiles) {
    const copyOwner = q.kind === 'illusion' ? anyById(w, q.owner) : undefined;
    if (!copyOwner || q.owner === p.owner || allies(owner, copyOwner) || dist(at, q.pos) > WIZ_R + snowR(p.level)) continue;
    // Contact drags up to the fixed speed; it does not use the end-of-flight explosion's damage or push
    const push = q.pushVel ?? v(0, 0), extra = SNOWBALL.drag - dot(dir, push);
    if (extra > 0) {
      q.pushVel = add(push, scale(dir, extra));
      if (isSliding({ vel: q.pushVel })) q.stunLeft = Math.max(q.stunLeft ?? 0, decoyStun(q));
    }
  }
}

// a Bola de neve explode (fim do voo ou obstáculo): 0 na borda até dmg no centro, em todos menos quem lançou (como o Meteoro)
function snowBlast(w: World, p: Projectile) {
  const L = channelLevel(spellLevel('snowball', p.level), p.power);
  let landed = false;
  for (const o of w.wizards) {
    const k = 1 - dist(o.pos, p.pos) / L.radius;
    if (!o.alive || o.id === p.owner || k <= 0) continue;
    hit(w, o, p.owner, L.dmg * k * p.dmgMult, L.knock * k * p.dmgMult, sub(o.pos, p.pos), 'snowball');
    landed = true;
  }
  for (const q of enemyDecoys(w, p.owner)) {
    const k = 1 - dist(q.pos, p.pos) / L.radius;
    if (k > 0) pushDecoy(q, scale(norm(sub(q.pos, p.pos)), L.knock * k * p.dmgMult), L.dmg * k * p.dmgMult);
  }
  if (landed) land(w, p, 'snowball', true);
  w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'snow', r: L.radius });
}

// pushes the Illusion copy on the same scale as the wizard (per-hit cap and the owner's resistance); it never dies
// slide stun of the copy: same formula as the wizard's stun(), scaled by the owner's debuff multiplier (no Shield on a copy)
const decoyStun = (q: Projectile) => (Math.log(len(q.pushVel!) / STUN_SPEED) / FRICTION) * (q.decoyDebuff ?? 1);
function pushDecoy(q: Projectile, impulse: Vec, dmg: number) {
  const taken = q.decoyDamage ?? 0;
  q.pushVel = add(q.pushVel ?? v(0, 0), scale(impulse, knockScale(dmg, taken, q.decoyResist ?? 0)));
  if (len(impulse) > 0 && isSliding({ vel: q.pushVel })) q.stunLeft = Math.max(q.stunLeft ?? 0, decoyStun(q));
  q.decoyDamage = taken + dmg;
}

// cópia da Ilusão de um inimigo do dono de p que o segmento p.pos→b toca (a mais perto do começo); t em [0,1]
function decoyOnSegment(w: World, p: Projectile, b: Vec, radius: number): { q: Projectile; t: number } | null {
  const owner = anyById(w, p.owner);
  const d = sub(b, p.pos);
  let best: { q: Projectile; t: number } | null = null;
  for (const q of w.projectiles) {
    const qo = q.kind === 'illusion' && q.until > w.t && q.owner !== p.owner && q.id !== p.decoy ? anyById(w, q.owner) : undefined;
    if (!qo || allies(owner, qo)) continue;
    const [t, gap] = segT(p.pos, d, q.pos);
    if (gap <= radius && (!best || t < best.t)) best = { q, t };
  }
  return best;
}

// Divisor: o projétil vira o lançador de filhotes (sem colisão), que anda devagar e solta 4 ondas de 2
function split(w: World, p: Projectile) {
  p.vel = scale(norm(p.vel), SPLITTER.spawnSpeed * (p.power ?? 1));
  p.waves = SPLITTER.waves;
  p.tick = w.t + SPLITTER.spawnLife / SPLITTER.waves;
  p.until = Infinity; // acaba na última onda
}

// splitterspawnerprojectile.lua: filhotes simétricos que abrem menos a cada onda (a conta do original, sem normalizar)
function spawnShards(w: World, p: Projectile, dt: number): boolean {
  p.pos = add(p.pos, scale(p.vel, dt));
  if (w.t < (p.tick ?? 0)) return true;
  const d = norm(p.vel);
  const a = SPLITTER.spawnLife * (p.waves! / SPLITTER.waves);
  for (const s of [-1, 1]) {
    const dir = v((d.x - s * d.y * a) / (1 + a), (d.y + s * d.x * a) / (1 + a));
    w.projectiles.push({ id: w.nextId++, born: w.t, kind: 'shard', owner: p.owner, pos: p.pos, vel: scale(dir, SPLITTER.childSpeed * (p.power ?? 1)), power: p.power, level: p.level, until: w.t + SPLITTER.childLife, target: null, dmgMult: p.dmgMult, caster: p.caster });
  }
  p.tick = (p.tick ?? 0) + SPLITTER.spawnLife / SPLITTER.waves;
  return --p.waves! > 0;
}

// Elo preso (linkmodifier.lua): puxa o mago ligado até quem lançou (ou quem lançou até o obstáculo), com dano a cada 0,2 s no inimigo;
// solta perto, com escudo ou Investida no ligado, ou se alguém morreu. Devolve false quando acabou
function linkHold(w: World, p: Projectile): boolean {
  const owner = byId(w, p.owner);
  if (!owner) return false;
  const L = channelLevel(spellLevel('link', p.level), p.power);
  if (p.decoyTarget !== undefined) {
    const q = w.projectiles.find((copy) => copy.id === p.decoyTarget && copy.until > w.t);
    if (!q || dist(owner.pos, q.pos) < 2 * WIZ_R + LINK.wizGap) return false;
    q.pushVel = add(q.pushVel ?? v(0, 0), scale(norm(sub(owner.pos, q.pos)), L.pull * DT));
    p.pos = q.pos;
    return true;
  }
  if (p.pillar !== undefined) {
    const q = w.pillars[p.pillar];
    if (!q.alive || dist(owner.pos, q.pos) < OBSTACLES[q.kind].r + WIZ_R + LINK.pillarGap) return false;
    owner.vel = add(owner.vel, scale(norm(sub(q.pos, owner.pos)), L.pull * DT));
    return true;
  }
  const o = byId(w, p.target);
  if (!o || shielded(w, o) || w.t < o.rushUntil || dist(owner.pos, o.pos) < bodyR(owner) + bodyR(o) + LINK.wizGap) return false;
  o.vel = add(o.vel, scale(norm(sub(owner.pos, o.pos)), L.pull * DT));
  p.pos = o.pos;
  if (w.t >= (p.tick ?? 0)) {
    p.tick = w.t + LINK.tick;
    if (!allies(owner, o)) hit(w, o, p.owner, L.dmg * LINK.tick * p.dmgMult, 0, v(0, 0), 'link');
  }
  return true;
}

// Per-step steering: locked aim, Boomerang, Link recall, Drain turn and Homing; false removes the projectile
function steer(w: World, p: Projectile, L: Level, dt: number): boolean {
  if (p.lockOn !== undefined) {
    const owner = anyById(w, p.owner);
    const aim = owner && attackBody(w, owner, p.lockOn, false);
    if (!aim) return false; // Do not switch targets or follow a new life after death.
    // A target lifted by the jet does not make the projectile stop or turn around under it
    if (!p.target || !isSuspended(anyById(w, p.target) ?? {})) p.vel = scale(norm(sub(aim.pos, p.pos)), L.speed);
  }
  if (p.kind === 'boomerang' && (w.t >= p.until || !steerBoomerang(w, p, dt))) return false;
  if (p.kind === 'link' && w.t >= (p.turnAt ?? Infinity)) {
    // Link recalls toward its caster and disappears nearby (linkprojectile.lua)
    const owner = byId(w, p.owner);
    if (!owner || dist(owner.pos, p.pos) < LINK.gone) return false;
    p.back = true;
    p.vel = scale(norm(sub(owner.pos, p.pos)), L.speed);
  }
  if (p.kind === 'drain' && w.t >= (p.turnAt ?? Infinity)) {
    // Drain turns toward the nearest wizard, ally or enemy (drainprojectile.lua)
    p.turnAt = undefined;
    let to: Wizard | null = null;
    for (const z of w.wizards) if (z.alive && !isSuspended(z) && z.id !== p.owner && (!to || dist(z.pos, p.pos) < dist(to.pos, p.pos))) to = z;
    p.vel = scale(to ? norm(sub(to.pos, p.pos)) : norm(p.vel), DRAIN.turnSpeed * (p.power ?? 1));
  }
  // Illusion redirects a missile chasing its owner toward the copy while it exists
  const chase = p.kind === 'homing' ? byId(w, p.target) : undefined;
  const target = chase && !isSuspended(chase) && (w.projectiles.find((q) => q.kind === 'illusion' && q.owner === chase.id && q.until > w.t) ?? chase);
  if (target) {
    // Turn toward the target by at most HOMING_TURN rad/s; the lag makes the missile circle before hitting
    const cur = Math.atan2(p.vel.y, p.vel.x);
    const want = Math.atan2(target.pos.y - p.pos.y, target.pos.x - p.pos.x);
    const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    const a = cur + Math.max(-HOMING_TURN * dt, Math.min(HOMING_TURN * dt, diff));
    const speed = len(p.vel);
    p.vel = v(Math.cos(a) * speed, Math.sin(a) * speed);
  }
  return true;
}

// Projectile reached an obstacle before any wizard; true keeps it in the world
function hitPillar(w: World, p: Projectile, pil: { i: number; t: number }, L: Level): boolean {
  const q = w.pillars[pil.i];
  // Gravity, Bouncer, Drain, Magnetize and Recharge bounce off obstacles; Boomerang bounces harder and returns to its owner
  if (p.kind === 'gravity' || p.kind === 'bouncer' || p.kind === 'boomerang' || p.kind === 'drain' || p.kind === 'magnetize' || p.kind === 'recharge') {
    bounceOff(p, q.pos, OBSTACLES[q.kind].r, p.kind === 'boomerang' ? BOOMERANG.bounceWall * (p.power ?? 1) : undefined);
    if (p.kind === 'boomerang') [p.curve, p.back] = [undefined, true];
    if (p.kind === 'magnetize') p.prev = ''; // After bouncing it can hit its caster and repel projectiles
    // Bouncer follows the nearest enemy after an obstacle hit (Fernando, 18/10)
    if (p.kind === 'bouncer') {
      const nextTo = nearestEnemy(w, p.pos, p.owner);
      if (nextTo) p.vel = scale(norm(sub(nextTo.pos, p.pos)), len(p.vel));
    }
    // Bouncing still damages the obstacle, like any hit (Fernando, 25/10; before only the Boomerang, and only on chests)
    if (L.dmg > 0) damagePillar(w, pil.i, L.dmg * p.dmgMult, p.owner);
    return true;
  }
  if (p.kind === 'link') {
    // Link on an obstacle pulls the caster toward it
    [p.pillar, p.pos, p.vel] = [pil.i, q.pos, v(0, 0)];
    return true;
  }
  if (p.kind === 'splitter') {
    // splitterprojectile.lua: move outside the obstacle, reverse course and release shards backward
    p.pos = add(q.pos, scale(norm(sub(p.pos, q.pos)), OBSTACLES[q.kind].r + PROJ_R + BOOMERANG.gap));
    p.vel = scale(p.vel, -1);
    damagePillar(w, pil.i, L.dmg * p.dmgMult, p.owner);
    split(w, p);
    return true;
  }
  if (p.kind === 'snowball') {
    damagePillar(w, pil.i, L.dmg * p.dmgMult, p.owner);
    snowBlast(w, p);
    return false;
  }
  if (p.kind === 'swap') swapEnd(w, p);
  else if (L.dmg > 0) damagePillar(w, pil.i, L.dmg * p.dmgMult, p.owner);
  return false;
}

// Projectile reached a wizard (a shield reflects it; each spell applies its own effect); true keeps it in the world
function hitWizard(w: World, p: Projectile, found: { wz: Wizard; t: number }, L: Level, dt: number): boolean {
  const wz = found.wz;
  if (shielded(w, wz)) {
    // Swap harms nobody: a shield blocks it without moving either wizard
    if (p.kind === 'swap') {
      w.events.push({ k: 'reflect', id: wz.id, x: p.pos.x, y: p.pos.y });
      return false;
    }
    // Boomerang and Link bounce back from shields without changing owner (shieldmodifier.lua)
    if (p.kind === 'boomerang' || p.kind === 'link') {
      bounceOff(p, wz.pos, Math.max(WIZ_R, wz.shieldR));
      [p.curve, p.back] = [undefined, true];
      if (p.kind === 'link') p.turnAt = w.t;
      w.events.push({ k: 'reflect', id: wz.id, x: p.pos.x, y: p.pos.y });
      return true;
    }
    if (p.kind === 'bouncer') p.prev = wz.id;
    // Reflect toward the current caster position (Fernando, 17/10, to strengthen shields);
    // if the caster is dead, reverse course. The reflecting wizard becomes the projectile owner.
    const shooter = byId(w, p.owner);
    const back = shooter ? norm(sub(shooter.pos, p.pos)) : scale(norm(p.vel), -1);
    p.vel = scale(back, len(p.vel));
    p.target = p.kind === 'homing' ? ((shooter && !allies(shooter, wz) ? shooter.id : null) ?? nearestEnemy(w, p.pos, wz.id)?.id ?? null) : null;
    if (p.lockOn !== undefined) p.lockOn = shooter?.id; // reflected: locks on the shooter
    p.owner = wz.id;
    p.until = w.t + (p.kind === 'homing' ? L.duration : L.range / L.speed);
    w.events.push({ k: 'reflect', id: wz.id, x: p.pos.x, y: p.pos.y });
    return true;
  }
  if (p.kind === 'swap') {
    swapPlaces(w, p, wz);
    if (!allies(anyById(w, p.owner), wz)) mark(w, wz, p.owner, 'swap');
    w.events.push({ k: 'land', id: p.caster, src: 'swap' });
  } else if (p.kind === 'boomerang') {
    // Hit, bounce at 500 original units/s and return to the owner; can hit again on the way back
    hit(w, wz, p.owner, L.dmg * p.dmgMult, L.knock * p.dmgMult, sub(wz.pos, p.pos), 'boomerang');
    land(w, p, 'boomerang', true);
    bounceOff(p, wz.pos, bodyR(wz), BOOMERANG.bounce * (p.power ?? 1)); // bodyR: with WIZ_R the bounce restarted inside the giant body and hit again on the next step
    [p.curve, p.back] = [undefined, true];
    return true;
  } else if (p.kind === 'bouncer') {
    // bouncerprojectile.lua: damage enemies only (−30% per hit); follow the nearest enemy, excluding the caster (18/10)
    // Renew its lifetime by 1 s until damage falls below 10
    if (wz.id !== p.owner) {
      hit(w, wz, p.owner, L.dmg * p.dmgMult, L.knock * p.dmgMult, p.vel, 'bouncer');
      land(w, p, 'bouncer', true);
      p.dmgMult *= BOUNCER.decay;
    }
    if (L.dmg * p.dmgMult < BOUNCER.minDmg) return false;
    p.prev = wz.id;
    p.pos = add(p.pos, scale(p.vel, dt * found.t));
    const nextTo = nearestEnemy(w, p.pos, wz.id, p.owner);
    if (nextTo) p.vel = scale(norm(sub(nextTo.pos, p.pos)), L.speed);
    p.until = w.t + (L.range / L.speed) * (byId(w, p.caster)?.rangeF ?? 1);
    return true;
  } else if (p.kind === 'drain') {
    drainHit(w, p, wz, L);
  } else if (p.kind === 'magnetize') {
    // Enemies attract their enemies' projectiles; allies or the caster (after a bounce) repel them
    const enemy = wz.id !== p.owner && !allies(anyById(w, p.owner), wz);
    wz.magnet = enemy ? 1 : -1;
    wz.magnetUntil = w.t + (enemy ? statusDuration(w, wz, L.duration * wz.debuffMult * afflictBy(w, p.owner)) : L.duration);
    if (enemy) {
      mark(w, wz, p.owner, 'magnetize');
      land(w, p, 'magnetize');
    }
  } else if (p.kind === 'recharge') {
    // Damage +1 per consecutive unreflected hit; other hits reset the streak. Recharge returns to its last caster
    const dmg = L.dmg + (p.bonus ?? 0);
    hit(w, wz, p.owner, dmg * p.dmgMult, L.knock * (dmg / L.dmg) * p.dmgMult, p.vel, 'recharge');
    const caster = anyById(w, p.caster);
    const enemy = !allies(anyById(w, p.owner), wz);
    if (caster) caster.streak = p.owner === p.caster && enemy ? caster.streak + 1 : 0;
    if (enemy) land(w, p, 'recharge');
    if (enemy) w.projectiles.push({ id: w.nextId++, born: w.t, kind: 'recharge', power: p.power, owner: p.owner, pos: p.pos, vel: v(0, 0), level: p.level, until: w.t + RECHARGE.life, target: p.owner, dmgMult: 1, caster: p.caster, back: true });
  } else if (p.kind === 'link') {
    // Stay attached to the wizard until released (linkHold)
    [p.target, p.pos, p.vel, p.tick] = [wz.id, wz.pos, v(0, 0), w.t + LINK.tick];
    if (!allies(anyById(w, p.owner), wz)) land(w, p, 'link');
    return true;
  } else if (p.kind === 'splitter') {
    split(w, p); // No direct damage; only bursts into shards
    return true;
  } else {
    const src = spellOf(p.kind);
    hit(w, wz, p.owner, L.dmg * p.dmgMult, L.knock * p.dmgMult, p.vel, p.src ?? src);
    land(w, p, src);
  }
  return false;
}

function stepProjectiles(w: World) {
  // Every body moves before impacts, so list order cannot give the copy an extra push step
  for (const p of w.projectiles) if (p.kind === 'illusion') {
    const body: MovementState = { pos: p.pos, vel: p.pushVel ?? v(0, 0), target: len(p.vel) > 0 ? add(p.pos, scale(norm(p.vel), 100)) : null, speed: len(p.vel), facing: 0, recoveryLeft: p.recoveryLeft, stunLeft: p.stunLeft };
    moveWizard(body, DT);
    if (!firstPillarOnSegment(w, p.pos, body.pos, WIZ_R)) p.pos = body.pos;
    p.pushVel = len(body.vel) > 0 ? body.vel : undefined;
    p.recoveryLeft = body.recoveryLeft;
    p.stunLeft = body.stunLeft;
  }
  for (const g of w.projectiles) if (g.kind === 'gravity') gravityPull(w, g);
  magnetPull(w);
  const keep: Projectile[] = [];
  // projéteis criados durante o passo (cura do Drenar, filhotes do Divisor) entram no fim da lista e já andam neste passo
  for (const p of w.projectiles) {
    if (p.kind === 'geyser') {
      if (w.t + 1e-8 >= p.until) continue;
      geyserLift(w, p);
      keep.push(p);
      continue;
    }
    if (p.kind === 'pix') {
      if (w.t + 1e-8 >= p.until) continue;
      pixRain(w, p);
      keep.push(p);
      continue;
    }
    if (p.kind === 'grip') {
      if (w.t >= p.until) gripLand(w, p);
      else keep.push(p);
      continue;
    }
    if (p.kind === 'meteor') {
      if (w.t >= p.until) meteorLand(w, p);
      else keep.push(p);
      continue;
    }
    if (p.kind === 'warpzone') {
      if (w.t < p.until) keep.push(p);
      continue;
    }
    if (p.kind === 'link' && (p.target || p.pillar !== undefined || p.decoyTarget !== undefined)) {
      if (linkHold(w, p)) keep.push(p);
      continue;
    }
    const ts = p.kind === 'illusion' ? 1 : timeScale(w, p); // a cópia mantém os 2 s de duração mesmo em zonas lentas
    const dt = DT * ts;
    if (ts < 1) delay(p, DT - dt);
    if (returning(p)) {
      if (flyBack(w, p, dt)) keep.push(p);
      continue;
    }
    if (p.kind === 'illusion') {
      if (w.t < p.until) keep.push(p);
      continue;
    }
    if (p.waves !== undefined) {
      if (spawnShards(w, p, dt)) keep.push(p);
      continue;
    }
    const L = channelLevel(p.stats ?? spellLevel(spellOf(p.kind), p.level), p.power);
    if (!steer(w, p, L, dt)) continue;
    // a Troca anda só o que falta no último passo, para parar exatamente no ponto da mira (até - agora = tempo de voo que falta)
    const next = add(p.pos, scale(p.vel, p.kind === 'swap' ? Math.min(dt, Math.max(0, p.until - w.t - DT + dt)) : dt));
    if (alter(w, p, next)) {
      keep.push(p);
      continue;
    }
    // a Gravidade não bate em mago; o Ricochete não repete o último mago tocado (pode voltar em quem lançou);
    // o Magnetizar só pega quem lançou depois de quicar; a Bola de neve é grande
    const r = p.kind === 'snowball' ? snowR(p.level) : PROJ_R;
    let found = p.kind === 'gravity' ? null : firstOnSegment(w, p.pos, next, WIZ_R + r, p.kind === 'bouncer' || p.kind === 'magnetize' ? (p.prev ?? p.owner) : p.owner, p.lockOn === undefined ? undefined : typeof p.lockOn === 'string' ? p.lockOn : '');
    const pil = firstPillarOnSegment(w, p.pos, next, r);
    // Ilusão: projéteis não a destroem; ao acertá-la, transferem o empurrão e continuam o trajeto
    let fake = p.kind === 'gravity' ? null : decoyOnSegment(w, p, next, WIZ_R + r);
    if (p.lockOn !== undefined && fake?.q.id !== p.lockOn) fake = null;
    if (p.kind !== 'snowball' && fake && (!found || fake.t <= found.t) && (!pil || fake.t < pil.t)) {
      if (p.kind === 'link') {
        p.decoyTarget = fake.q.id;
        p.pos = fake.q.pos;
        p.vel = v(0, 0);
        keep.push(p);
        continue;
      }
      const direction = p.kind === 'boomerang' ? sub(fake.q.pos, p.pos) : p.vel;
      pushDecoy(fake.q, scale(norm(direction), L.knock * p.dmgMult), L.dmg * p.dmgMult);
      p.decoy = fake.q.id;
      if (p.lockOn !== undefined) continue; // a locked shot ends on the chosen copy, like on the real body
    }
    // a Bola de neve atravessa magos (arrastando) e só para em obstáculo ou escudo
    if (p.kind === 'snowball' && ((found && !shielded(w, found.wz) && (!pil || found.t <= pil.t)) || (fake && (!pil || fake.t < pil.t)))) {
      snowRoll(w, p, next);
      if (found && !shielded(w, found.wz)) found = null;
    }
    if (pil && (!found || pil.t < found.t)) {
      if (hitPillar(w, p, pil, L)) keep.push(p);
      continue;
    }
    if (found) {
      if (hitWizard(w, p, found, L, dt)) keep.push(p);
      continue;
    }
    p.pos = next;
    if (p.kind === 'swap' ? w.t + DT < p.until : w.t < p.until) keep.push(p);
    else if (p.kind === 'swap') swapEnd(w, p);
    else if (p.kind === 'snowball') snowBlast(w, p);
    else if (p.kind === 'splitter') {
      split(w, p);
      keep.push(p);
    } else if (p.kind === 'recharge') {
      const caster = anyById(w, p.caster);
      if (caster) caster.streak = 0; // errou: zera os acertos seguidos
    }
  }
  w.projectiles = keep;
}

const ELASTICITY = 0.5;

function separate(w: World) {
  const alive = w.wizards.filter((z) => z.alive && !isSuspended(z));
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      if (w.t < a.windUntil || w.t < b.windUntil) continue; // Caminhada no vento atravessa magos
      const d = sub(b.pos, a.pos);
      const l = len(d);
      const overlap = bodyR(a) + bodyR(b) - l;
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
// sorteio chega a DM_SPAWN_GAP, fica o melhor)
function respawn(w: World, wz: Wizard, rand: () => number) {
  const reach = w.arenaR * SHAPES[w.arena].reach - SPAWN_INSET;
  const gap = (p: Vec) => Math.min(...w.wizards.filter((z) => z.alive).map((z) => dist(z.pos, p)), ...w.pillars.filter((q) => q.alive).map((q) => dist(q.pos, p)));
  // sem sorteio bom (fora da pedra), volta onde nasceu
  let best = SHAPES[w.arena].spawn(w.wizards.indexOf(wz), w.wizards.length, w.arenaR);
  let bestGap = -1;
  for (let i = 0; i < 30 && bestGap < DM_SPAWN_GAP; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * reach;
    const p = v(Math.cos(a) * r, Math.sin(a) * r);
    if (!inArena(w, p, 1.5)) continue; // no círculo nunca acontece (o sorteio já fica a SPAWN_INSET da borda)
    const g = gap(p);
    if (g > bestGap) [best, bestGap] = [p, g];
  }
  revive(w, wz, best);
}

// volta vivo em pos (deathmatch e as ondas da Campanha): vida cheia, parado e invulnerável; magias, itens e recargas ficam
export function revive(w: World, wz: Wizard, pos: Vec) {
  Object.assign(wz, {
    alive: true, pos, vel: v(0, 0), target: null, casting: null, channel: undefined, stunLeft: undefined, recoveryLeft: 0, moveHeld: false, blockedMove: false, hp: wz.hpMax, dmgTaken: 0, lastHitBy: null,
    blindUntil: 0, incapacitateUntil: 0, closedBodyUntil: 0, geyserLeft: 0, geyserAt: undefined, puppetBy: undefined, puppetUntil: 0,
    shieldUntil: 0, pactUntil: 0, dashUntil: 0, thrustUntil: 0, invulnUntil: w.t + INVULN_TIME,
    slowUntil: 0, hasteUntil: 0, snow: null, magnetUntil: 0, alterUntil: 0, windUntil: 0, veilUntil: 0, shockUntil: 0, aegis: wz.items.aegis > 0,
    rune: null, runeUntil: 0, braceUntil: 0, braceReadyAt: 0, electroUntil: 0, basicCasting: undefined,
  });
}

// ponto sorteado na pedra longe dos obstáculos e dos magos (baú e runa); null se 20 sorteios não acharem
// (a margem da borda nunca recusa no círculo: lá o sorteio já fica a 40% do raio da borda)
function freeSpot(w: World, rand: () => number, spread: number): Vec | null {
  for (let i = 0; i < 20; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * w.arenaR * spread * SHAPES[w.arena].reach;
    const p = v(Math.cos(a) * r, Math.sin(a) * r);
    if (inArena(w, p, Math.min(1, w.arenaR * 0.2)) && w.pillars.every((q) => !q.alive || dist(q.pos, p) > 1.2) && w.wizards.every((z) => !z.alive || dist(z.pos, p) > 1)) return p;
  }
  return null;
}

// runa: aparece (uma por vez), some se a lava engolir e dá o efeito a quem encostar primeiro
function stepRunes(w: World, rand: () => number) {
  const kept = w.runes.filter((r) => inArena(w, r.pos));
  if (kept.length < w.runes.length) w.runeAt = w.t + RUNE.every;
  w.runes = kept;
  if (!w.runes.length && w.t >= w.runeAt) {
    const at = freeSpot(w, rand, RUNE.spread);
    if (at) {
      const kind = RUNE_KINDS[Math.floor(rand() * RUNE_KINDS.length)];
      w.runes.push({ pos: at, kind });
      w.events.push({ k: 'rune', kind, x: at.x, y: at.y });
    } else w.runeAt = w.t + 1;
  }
  for (const r of w.runes) {
    const z = w.wizards.find((q) => q.alive && dist(q.pos, r.pos) <= RUNE.reach);
    if (!z) continue;
    w.runes = w.runes.filter((q) => q !== r);
    w.runeAt = w.t + RUNE.every;
    w.events.push({ k: 'runeTake', id: z.id, kind: r.kind });
    Object.assign(z, { rune: r.kind, runeUntil: w.t + RUNE.secs });
  }
}

// sandbox: a runa escolhida a 1,5 m de quem pediu, para o lado do centro (troca a que estiver na arena);
// fora da pedra ali, vai para um ponto livre sorteado; sem lugar, não aparece
export function placeRune(w: World, kind: RuneKind, near: Vec | null, rand: () => number = Math.random): boolean {
  const side = near && len(near) > 1.5 ? scale(norm(near), -1.5) : v(1.5, 0);
  const close = near && add(near, side);
  const at = close && inArena(w, close, 0.3) ? close : freeSpot(w, rand, RUNE.spread);
  if (!at) return false;
  w.runes = [{ pos: at, kind }];
  w.events.push({ k: 'rune', kind, x: at.x, y: at.y });
  return true;
}

// raio novo da pedra (encolhimento e painel da sandbox): as ilhas chegam junto com a borda e levam quem está em cima
export function resizeArena(w: World, r: number) {
  w.arenaR = r;
  for (const i of w.isles) {
    const to = isleSpot(w, i.a, i.d);
    for (const z of w.wizards) if (z.alive && dist(z.pos, i.pos) < i.r) z.pos = add(z.pos, sub(to, i.pos));
    i.pos = to;
  }
  w.events.push({ k: 'shrink', r });
}

// volta parado para dentro da pedra, na mesma direção (Égide)
function toStone(w: World, wz: Wizard) {
  const from = wz.pos;
  Object.assign(wz, { pos: safeInside(w, wz.pos, w.arenaR * (1 - AEGIS.back)), vel: v(0, 0), target: null, dashUntil: 0, thrustUntil: 0 });
  w.events.push({ k: 'teleport', id: wz.id, from, to: wz.pos });
}

// --- mapa da Campanha ---------------------------------------------------------------------------------------------

// tira o mago de dentro da parede e da mureta (e do abismo, se ele foi andando: só cai quem é empurrado); com a sala
// trancada, ninguém sai dela. Também roda na previsão do próprio mago no navegador
export function keepOut(t: Terrain, wz: Pick<Wizard, 'pos' | 'vel' | 'safe' | 'r'>, lock?: Room) {
  const sliding = isSliding(wz), R = bodyR(wz);
  const blocked = (x: number, y: number) => {
    const c = cellAt(t, x, y);
    return c === CELL.wall || c === CELL.low || (c === CELL.pit && !sliding);
  };
  if (lock) wz.pos = v(Math.min(lock.x + lock.w - 1 - R, Math.max(lock.x + 1 + R, wz.pos.x)), Math.min(lock.y + lock.h - 1 - R, Math.max(lock.y + 1 + R, wz.pos.y)));
  const cx = Math.floor(wz.pos.x), cy = Math.floor(wz.pos.y);
  if (blocked(cx, cy)) {
    // dentro (teleporte, troca): vai para o meio da casa livre mais perto
    let best: Vec | null = null;
    for (let r = 1; r <= 6 && !best; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      const c = v(x + 0.5, y + 0.5);
      if (!blocked(x, y) && (!best || dist(c, wz.pos) < dist(best, wz.pos))) best = c;
    }
    // longe de tudo (teleporte para fora do mapa): volta ao último chão firme
    if (best ?? wz.safe) wz.pos = (best ?? wz.safe)!;
    return;
  }
  // encostado: empurra para fora das casas vizinhas e corta a velocidade que entra nelas
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
    if (!blocked(x, y)) continue;
    const q = v(Math.min(x + 1, Math.max(x, wz.pos.x)), Math.min(y + 1, Math.max(y, wz.pos.y)));
    const d = dist(q, wz.pos);
    if (d >= R || d === 0) continue;
    const n = scale(sub(wz.pos, q), 1 / d);
    wz.pos = add(wz.pos, scale(n, R - d));
    const into = dot(wz.vel, n);
    if (into < 0) wz.vel = sub(wz.vel, scale(n, into));
  }
}

// abismo: perde PIT.hit da vida máxima e volta parado à beira de onde caiu (o crédito fica com quem empurrou, como na lava)
function fall(w: World, wz: Wizard) {
  const from = wz.pos;
  if (wz.pitDeath) {
    // morre no passo (a morte sai logo abaixo, com o crédito de quem empurrou); abaixo de zero para a regeneração não salvar
    wz.hp = -wz.hpMax;
    w.events.push({ k: 'fall', id: wz.id, x: from.x, y: from.y });
    return;
  }
  Object.assign(wz, { pos: wz.safe ?? from, vel: v(0, 0), target: null, dashUntil: 0, thrustUntil: 0 });
  if (w.t >= wz.invulnUntil) wz.hp -= wz.hpMax * PIT.hit;
  wz.calmSince = w.t;
  w.events.push({ k: 'teleport', id: wz.id, from, to: wz.pos }, { k: 'fall', id: wz.id, x: from.x, y: from.y });
}

// tiro que entra na parede acaba ali (a mureta é baixa: passa por cima); o meteoro cai do céu e a Zona de dobra não anda
function dropWalled(w: World) {
  w.projectiles = w.projectiles.filter((p) => {
    const hit = p.kind !== 'meteor' && p.kind !== 'warpzone' && cellAt(w.map!, p.pos.x, p.pos.y) === CELL.wall;
    if (hit) w.events.push({ k: 'clash', x: p.pos.x, y: p.pos.y, combo: 'pulse', r: 0.3 });
    return !hit;
  });
}

// o Raio para na primeira parede do caminho
function wallClip(w: World, a: Vec, b: Vec): Vec {
  if (!w.map) return b;
  const n = Math.ceil(dist(a, b) / 0.25);
  for (let i = 1; i <= n; i++) if (cellAt(w.map, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n) === CELL.wall) return add(a, scale(sub(b, a), (i - 1) / n));
  return b;
}

// live Illusion copies of players who are not allies of `id`
function enemyDecoys(w: World, id: string): Projectile[] {
  const me = anyById(w, id);
  return w.projectiles.filter((q) => { const o = q.kind === 'illusion' && q.until > w.t && q.owner !== id ? anyById(w, q.owner) : undefined; return !!o && !allies(me, o); });
}

function attackBody(w: World, by: Wizard, target: string | number, visible = true): Wizard | Projectile | undefined {
  if (typeof target === 'number') return enemyDecoys(w, by.id).find((p) => p.id === target);
  const z = byId(w, target);
  return z && z !== by && !allies(by, z) && (!visible || (!isSuspended(z) && w.t >= Math.max(z.veilUntil, z.windUntil))) ? z : undefined;
}
// Attack is not a spell: numbers come from BASIC_ATTACK, nothing inherited from Fireball. The projectile has zero
// knockback on purpose (PR #426, owner's decision); only the melee hit uses BASIC_ATTACK.knock
const BASIC_STATS: Level = { heal: 0, cd: BASIC_ATTACK.cd, dmg: BASIC_ATTACK.dmg, knock: 0, speed: BASIC_ATTACK.speed, range: BASIC_ATTACK.range, duration: 0, radius: 0, dmgMin: 0, absorb: 0, pull: 0, scale: 0, dot: 0, blind: 0, incapacitate: 0, width: 0 };
const edgeOf = (z: Wizard | Projectile) => ('alive' in z ? bodyR(z) : WIZ_R); // an Illusion copy has a wizard's body
function beginBasic(w: World, wz: Wizard, c: Extract<Cmd, { kind: 'basic' }>) {
  if (!wz.alive || wz.spells.channel > 0 || wz.channel || isStunned(wz) || wz.casting || wz.basicCasting || w.t < (wz.basicReadyAt ?? 0)) return;
  if (wz.arc) {
    // Golpe em arco: sem alvo, na direção do cursor; quem estiver no arco quando o preparo termina leva o golpe
    if (dist(c.at, wz.pos) > 1e-6) wz.facing = Math.atan2(c.at.y - wz.pos.y, c.at.x - wz.pos.x);
    wz.basicCasting = { target: '', fireAt: w.t + BASIC_ATTACK.windup, melee: true, arc: wz.facing };
    wz.target = null;
    wz.moveHeld = false;
    return;
  }
  // A close body under the click selects melee; ground clicks never acquire a different target.
  const bodies: (Wizard | Projectile)[] = [...w.wizards.filter(z => attackBody(w, wz, z.id)), ...enemyDecoys(w, wz.id)];
  const clicked = bodies.filter(z => dist(z.pos, c.at) <= edgeOf(z) + WIZ_R).sort((a, b) => dist(a.pos, c.at) - dist(b.pos, c.at))[0];
  const target = clicked && dist(wz.pos, clicked.pos) <= BASIC_ATTACK.melee + edgeOf(clicked) - WIZ_R ? clicked : undefined;
  if (target && firstPillarOnSegment(w, wz.pos, target.pos, .05)) return;
  const aim = sub(c.at, wz.pos);
  if (len(aim) > .001) wz.facing = Math.atan2(aim.y, aim.x);
  wz.basicCasting = { target: target?.id ?? '', fireAt: w.t + BASIC_ATTACK.windup, melee: !!target, at: { ...c.at } };
  wz.target = null;
  wz.moveHeld = false;
}
function finishBasic(w: World, wz: Wizard) {
  const pending = wz.basicCasting!;
  wz.basicCasting = undefined;
  if (pending.arc !== undefined) return finishArc(w, wz, pending.arc);
  const target = pending.melee ? attackBody(w, wz, pending.target) : undefined;
  const range = pending.melee ? BASIC_ATTACK.melee + (target ? edgeOf(target) : WIZ_R) - WIZ_R : BASIC_ATTACK.range;
  if (pending.melee && (!target || dist(target.pos, wz.pos) > range || firstPillarOnSegment(w, wz.pos, target.pos, .05))) return;
  const aim = sub(pending.melee ? target!.pos : pending.at ?? wz.pos, wz.pos);
  const d = len(aim) > .001 ? norm(aim) : v(Math.cos(wz.facing), Math.sin(wz.facing));
  wz.facing = Math.atan2(d.y, d.x);
  wz.basicReadyAt = w.t + BASIC_ATTACK.cd;
  wz.veilUntil = wz.windUntil = 0; // só o golpe liberado revela; preparo cancelado não gasta recarga.
  w.events.push({ k: 'attack', id: wz.id, melee: pending.melee });
  if (pending.melee && target) {
    if ('alive' in target) hit(w, target, wz.id, BASIC_ATTACK.dmg, BASIC_ATTACK.knock, d, 'basic');
    else pushDecoy(target, scale(d, BASIC_ATTACK.knock), BASIC_ATTACK.dmg);
    return;
  }
  w.projectiles.push({ id: w.nextId++, born: w.t, kind: 'basic', owner: wz.id, caster: wz.id, pos: add(wz.pos, scale(d, PROJ_SPAWN)), vel: scale(d, BASIC_ATTACK.speed), level: 1, until: w.t + BASIC_ATTACK.range / BASIC_ATTACK.speed, target: null, stats: BASIC_STATS, src: 'basic', dmgMult: 1 });
}

// Melee arc (issue #402): every enemy body whose edge enters MELEE_ARC.range inside the arc takes the Attack's damage and push.
// The swing spends the cooldown and reveals even when it hits nobody, like a missed Fireball
export function inArc(from: Vec, facing: number, p: Vec, edge: number) {
  const d = sub(p, from), dd = len(d);
  if (dd > MELEE_ARC.range + edge) return false;
  if (dd <= edge) return true; // overlapping bodies always count, whatever the angle
  const a = Math.atan2(d.y, d.x) - facing, off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  return off <= (MELEE_ARC.angle / 2) * Math.PI / 180 + Math.asin(Math.min(1, edge / dd)); // the body's edge entering the arc counts
}
function finishArc(w: World, wz: Wizard, facing: number) {
  wz.facing = facing;
  wz.basicReadyAt = w.t + BASIC_ATTACK.cd;
  wz.veilUntil = wz.windUntil = 0;
  w.events.push({ k: 'attack', id: wz.id, melee: true });
  const bodies: (Wizard | Projectile)[] = [...w.wizards.filter((z) => attackBody(w, wz, z.id, false) && !isSuspended(z)), ...enemyDecoys(w, wz.id)];
  for (const b of bodies) {
    if (!inArc(wz.pos, facing, b.pos, edgeOf(b)) || firstPillarOnSegment(w, wz.pos, b.pos, .05)) continue;
    const d = dist(b.pos, wz.pos) > 1e-6 ? norm(sub(b.pos, wz.pos)) : v(Math.cos(facing), Math.sin(facing));
    if (!('alive' in b)) { pushDecoy(b, scale(d, BASIC_ATTACK.knock), BASIC_ATTACK.dmg); continue; }
    // Só empurra: a magia que o alvo está preparando continua (grill de 25/10), mesmo se o empurrão o atordoar
    const casting = b.casting;
    hit(w, b, wz.id, BASIC_ATTACK.dmg, BASIC_ATTACK.knock, d, 'basic');
    if (b.alive && casting && !b.casting) b.casting = casting;
  }
}

// Step commands: move, stop, brace, basic attack and spells (beginCast)
function applyCmds(w: World, cmds: Cmd[]) {
  for (const c of cmds) {
    const wz = byId(w, c.id);
    if (!wz || isSuspended(wz) || puppeteer(w, wz)) continue; // a controlled wizard's own commands do nothing
    applyCmd(w, wz, c);
    // Squid Pix: walking, stopping and the Attack repeat with the same offset (spells repeat in cast()); Hold ground and Channeling
    // stay out so the controller cannot freeze the target in place (grill of 25/10)
    if (c.kind === 'move' || c.kind === 'moveHold' || c.kind === 'stop' || c.kind === 'basic') for (const z of puppetsOf(w, wz)) {
      if (isSuspended(z)) continue;
      if (c.kind === 'move') applyCmd(w, z, { ...c, to: add(z.pos, sub(c.to, wz.pos)) });
      else if (c.kind === 'basic') applyCmd(w, z, { ...c, at: add(z.pos, sub(c.at, wz.pos)), target: c.target === z.id ? undefined : c.target });
      else applyCmd(w, z, c);
    }
  }
}

function applyCmd(w: World, wz: Wizard, c: Cmd) {
  if (c.kind === 'channel') {
    if (!(wz.spells.channel > 0) || w.t < wz.dashUntil || w.t < wz.thrustUntil || c.spell === 'channel' || !wz.spells[c.spell] || w.t < wz.cd[c.spell] || wz.casting || castBlocked(isStunned(wz), w.t < wz.gripUntil, c.spell)) return;
    if (wz.channel?.spell === c.spell) return; // Key repeat must not reset the server timer.
    wz.channel = { spell: c.spell, since: w.t };
    w.events.push({ k: 'cast', id: wz.id, spell: 'channel' });
    wz.target = null; wz.moveHeld = false; wz.basicCasting = undefined;
    wz.veilUntil = wz.windUntil = 0;
  } else if (c.kind === 'brace') {
    if (c.on && wz.casting?.spell === 'sniper') wz.casting = null;
    if (c.on && w.t >= (wz.braceUntil ?? 0)) wz.channel = undefined;
    if (c.on && w.t >= (wz.braceUntil ?? 0)) wz.braceReadyAt = w.t + (wz.guard ? 0 : BRACE.windup); // the guard stance counts at once (grill of 25/10)
    wz.braceUntil = c.on ? w.t + BRACE.lease : 0;
    if (!c.on) wz.closedBodyUntil = 0;
  } else if (c.kind === 'basic') {
    beginBasic(w, wz, c);
  } else if (c.kind === 'moveHold') {
    wz.moveHeld = c.on && !bracingActive(w, wz);
  } else if (c.kind === 'move') {
    wz.channel = undefined;
    if (bracingActive(w, wz)) return; // do not queue a walk that would fire when S is released
    wz.basicCasting = undefined;
    wz.moveHeld = c.held ?? false;
    wz.blockedMove = false;
    if (wz.casting?.spell === 'sniper') wz.casting = null; // Moving cancels aim rather than queuing a delayed shot.
    if (wz.casting) wz.casting.then = c.to;
    else wz.target = c.to;
  } else if (c.kind === 'stop') {
    wz.channel = undefined;
    // Like Dota (#144): cancel during windup without spending cooldown, which starts only when the spell fires
    wz.casting = null;
    wz.basicCasting = undefined;
    wz.target = null;
    wz.moveHeld = false;
    wz.blockedMove = false;
  } else beginCast(w, wz, c.spell, c.at);
}

// Per-wizard state before movement: deathmatch respawn, finished casts, ground zones, effects and speed
function prepWizards(w: World, rand: () => number) {
  for (const wz of w.wizards) {
    if (!wz.alive && w.dm && w.t >= wz.respawnAt) respawn(w, wz, rand);
    if (!wz.alive) continue;
    if (!bracingActive(w, wz)) wz.closedBodyUntil = 0; // Releasing S or losing the stance ends it; holding again does not renew it.
    if (!wz.spells.channel || isStunned(wz) || (wz.channel && castBlocked(false, w.t < wz.gripUntil, wz.channel.spell))) wz.channel = undefined;
    if (isStunned(wz)) wz.basicCasting = undefined;
    if (puppeteer(w, wz)) mark(w, wz, wz.puppetBy!, 'pix'); // a fall into the lava while controlled is the controller's kill
    if (wz.basicCasting && w.t + 1e-8 >= wz.basicCasting.fireAt) finishBasic(w, wz);
    if (wz.casting?.spell === 'sniper') {
      const c = wz.casting, target = byId(w,c.aimedId ?? '');
      const range = spellLevel('sniper',wz.spells.sniper).range*wz.rangeF;
      if (!wz.spells.sniper || isStunned(wz) || !target || sniperVictim(w,wz,target.pos,range,target.id)?.id !== target.id) wz.casting = null;
      else { c.at = { ...target.pos }; wz.facing = Math.atan2(target.pos.y-wz.pos.y,target.pos.x-wz.pos.x); }
    }
    if (wz.casting && wz.casting.spell !== 'sniper' && w.t + 1e-8 >= wz.casting.fireAt) {
      const c = wz.casting;
      wz.casting = null;
      cast(w, wz, c.spell, c.at, c.power, c.aimedId);
      if (c.then !== undefined) wz.target = c.then;
    }
    // Rooting clears walking speed and destination; Rush still adds velocity
    const rooted = w.t < wz.gripUntil;
    // Clash ground zones: arcane slows, fire burns like weaker lava
    wz.zone = 0;
    for (const z of w.zones) if (dist(z.pos, wz.pos) < z.r + WIZ_R * 0.5) wz.zone |= z.kind === 'slow' ? 1 : z.kind === 'burn' ? 2 : 0;
    if (wz.zone & 2 && w.t >= wz.invulnUntil && !shielded(w, wz)) {
      wz.hp -= ZONES.burn.dps * DT * damageFactor(w, wz);
      wz.calmSince = w.t;
    }
    // Snowball applies stored damage without knockback when its 0.5 s effect ends (snowballmodifier.lua)
    if (wz.snow && w.t >= wz.snow.until) {
      const s = wz.snow;
      wz.snow = null;
      hit(w, wz, s.by, s.dmg, 0, v(0, 0), 'snowball');
    }
    const extra = (w.t < wz.rushUntil ? wz.rushBonus : 0) + (w.t < wz.hasteUntil ? wz.haste : 0) + (w.t < wz.windUntil ? WINDWALK.speed : 0) + bootsBonus(w, wz) - (w.t < wz.slowUntil ? wz.slow : 0);
    const haste = wz.rune === 'haste' && w.t < wz.runeUntil ? 1 + RUNE.haste : 1;
    // Recharge rune advances cooldowns at 1/(1 − 30%) speed while active
    if (wz.rune === 'recharge' && w.t < wz.runeUntil && w.t >= incapacitatedUntil(wz, w.t)) {
      const extraT = DT * (1 / (1 - RUNE.cdr) - 1);
      for (const s of SPELL_IDS) if (wz.cd[s] > w.t) wz.cd[s] -= extraT;
    }
    wz.speed = rooted ? 0 : Math.max(0.2, (wz.baseSpeed + extra) * (wz.zone & 1 ? ZONES.slow.mult : 1) * (w.map && cellAt(w.map, wz.pos.x, wz.pos.y) === CELL.wax ? ZONES.slow.mult : 1) * (inWarp(w, wz) ? WARPZONE.wizMult : 1) * haste * w.mods.speed);
    if (w.t < (wz.electroUntil ?? 0)) wz.speed *= 1 - LIGHTNING.slow;
    if (rooted) wz.target = null;
    if (bracingActive(w, wz)) {
      wz.target = null;
      wz.moveHeld = false;
      if (wz.casting) wz.casting.then = undefined;
    }
  }
}

// Arena shrink and sudden death
function shrinkArena(w: World) {
  // Sudden death accelerates shrinking in long rounds; the next shrink is at most 5 s away
  if (!w.dm && w.rules.sudden && !w.sudden && w.t >= SUDDEN.at) {
    w.sudden = true;
    w.shrinkAt = Math.min(w.shrinkAt, w.t + SUDDEN.every);
    w.events.push({ k: 'sudden' });
  }
  // After SUDDEN.collapse, remove the minimum size and gradually collapse the arena even with sudden death disabled
  const collapsing = w.t >= SUDDEN.collapse;
  const minR = collapsing && !w.dm ? 0 : ARENA_MIN; // Sandbox shrinks to the minimum without disappearing
  // Spikes arena stops at mods.shrink of the initial-to-minimum distance, then collapses after SUDDEN.collapse
  // as usual; without lava nobody falls, and simulated rounds exceeded 10 minutes without this ending
  const start = arenaRadius(w.wizards.length);
  const floor = w.mods.shrink < 1 && !collapsing ? Math.max(ARENA_MIN, start - (start - ARENA_MIN) * w.mods.shrink) : minR;
  if (!w.dm && collapsing && w.shrinkAt > w.t + SUDDEN.every) w.shrinkAt = w.t + SUDDEN.every;
  if (!w.map && (!w.dm || w.shrink) && w.t >= w.shrinkAt && w.arenaR > floor) {
    resizeArena(w, Math.max(floor, w.arenaR - ARENA_STEP));
    w.shrinkAt += w.sudden || collapsing ? SUDDEN.every : SHRINK_EVERY;
  }
}

function stepChests(w: World, rand: () => number) {
  // Chests spawn at random positions away from obstacles; spells break them into gold piles
  const chestsUp = w.pillars.filter((q) => q.kind === 'chest' && q.alive).length;
  if (w.rules.chests && chestsUp < CHEST.maxUp && w.chestsLeft > 0 && w.t >= w.chestAt) {
    const at = freeSpot(w, rand, CHEST.spread);
    if (at) {
      const gold = CHEST.pile[0] + Math.floor(rand() * (CHEST.pile[1] - CHEST.pile[0] + 1));
      w.pillars.push({ pos: at, hp: OBSTACLES.chest.hp, alive: true, kind: 'chest', gold });
      w.events.push({ k: 'chest', x: at.x, y: at.y });
      w.chestAt = w.t + CHEST.every;
      w.chestsLeft--;
    } else w.chestAt = w.t + 1;
  }
  // Each wizard on a gold pile fills a personal bar and earns 1 every 2 s; leaving resets progress
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
}

// Wizard movement (dash, thrust, wind, pull zones); returns the walking wizards for blockPillars
function moveAll(w: World): Set<Wizard> {
  const walking = new Set<Wizard>();
  for (const wz of w.wizards) {
    if (!wz.alive) continue;
    if (isSuspended(wz)) { moveWizard(wz, DT); continue; }
    if (w.t < wz.dashUntil) {
      wz.pos = add(wz.pos, scale(wz.dashVel, DT)); // Dashing disables walking but still adds knockback
      // Dash contact deals damage and pushes along the dash direction, once per target per dash
      for (const o of w.wizards) {
        if (!o.alive || o === wz || wz.dashHit.includes(o.id) || dist(o.pos, wz.pos) > bodyR(wz) + bodyR(o) + 0.1) continue;
        wz.dashHit.push(o.id);
        const dmg = (wz.dashDmg ?? RUSH.dashDmg) * (wz.rushPower ?? 1);
        hit(w, o, wz.id, dmg, dmg * KB_PER_DMG, wz.dashVel, 'rush');
        w.events.push({ k: 'land', id: wz.id, src: 'rush' });
      }
      for (const q of enemyDecoys(w, wz.id)) {
        const key = `copy:${q.id}`;
        if (wz.dashHit.includes(key) || dist(q.pos, wz.pos) > 2 * WIZ_R + .1) continue;
        wz.dashHit.push(key);
        pushDecoy(q, scale(norm(wz.dashVel), (wz.dashDmg ?? RUSH.dashDmg) * (wz.rushPower ?? 1) * KB_PER_DMG), (wz.dashDmg ?? RUSH.dashDmg) * (wz.rushPower ?? 1)); // same dash damage as the real-body branch (boss dashes too)
      }
    }
    stepThrust(w, wz);
    if (w.t < wz.windUntil) windTouch(w, wz);
    // Pulse clash vortex slowly pulls toward the center
    for (const z of w.zones) {
      const d = sub(z.pos, wz.pos);
      if (z.kind === 'pull' && len(d) < z.r + WIZ_R && len(d) > 0.15) wz.pos = add(wz.pos, scale(norm(d), ZONES.pull.speed * DT));
    }
    if (wz.target && !wz.casting && !isStunned(wz) && wz.speed > 0 && len(wz.vel) < .05) walking.add(wz);
    moveWizard(wz, DT);
  }
  return walking;
}

// After impacts: spikes, lava, pits, regeneration and death
function stepGround(w: World) {
  for (const wz of w.wizards) {
    if (!wz.alive) continue;
    // Spikes push and damage wizards crossing the edge, scaling with impact speed (SWORDS); credit goes to the last
    // attacker as with lava. Run before infinite HP handling so it also applies in Sandbox
    if (isSuspended(wz)) { wz.pos = { ...wz.geyserAt! }; wz.vel = v(0, 0); }
    if (!isSuspended(wz) && w.mods.swords && edge(w, wz.pos) < SWORDS.inset && !onIsle(w.isles, wz.pos)) {
      const n = inward(w, wz.pos);
      const out = dot(wz.vel, n);
      if (out < 0) wz.vel = sub(wz.vel, scale(n, out)); // Remove outward velocity; the hit pushes inward
      wz.pos = safeInside(w, wz.pos, SWORDS.inset + WIZ_R);
      const by = wz.lastHitBy && w.t - wz.lastHitAt <= CREDIT_WINDOW ? wz.lastHitBy : wz.id;
      const dmg = SWORDS.base + SWORDS.perSpeed * Math.max(0, -out);
      hit(w, wz, by, dmg, dmg * KB_PER_DMG, n, 'espinhos'); // The source name appears verbatim in the scoreboard and replay, like 'choque'
    }
    // Sandbox infinite HP prevents death; in lava, stay in place with full HP instead of returning to stone
    if (wz.god) {
      wz.hp = wz.hpMax;
      continue;
    }
    if (w.map) {
      const c = cellAt(w.map, wz.pos.x, wz.pos.y);
      if (c === CELL.pit) fall(w, wz);
      else if (c !== CELL.lava) wz.safe = wz.pos; // Falling into a pit must not return a wizard to lava
    }
    if (inLava(w, wz.pos)) {
      if (w.t < wz.invulnUntil || shielded(w, wz)) continue;
      const dmg = LAVA_DPS * DT * (1 - wz.lavaCut) * w.mods.lava * damageFactor(w, wz), burn = Math.min(Math.max(0, wz.hp), dmg);
      wz.hp -= dmg;
      wz.calmSince = w.t;
      // Half of lava HP loss counts as damage from the last attacker within the kill-credit window; Match adds it to the scoreboard
      if (wz.lastHitBy && wz.lastHitBy !== wz.id && w.t - wz.lastHitAt <= CREDIT_WINDOW) {
        const c = (w.lavaCredit[wz.lastHitBy] ??= {});
        c[wz.id] = (c[wz.id] ?? 0) + burn / 2;
      }
      wz.dmgTaken += LAVA_DPS * DT * LAVA_KB_FACTOR; // Lava Boots protect HP, not accumulated knockback (cycle 2)
      // Aegis returns a low-HP wizard from lava to stone in the same direction, stationary, once
      if (wz.aegis && wz.hp > 0 && wz.hp <= AEGIS.hp) {
        wz.aegis = false;
        toStone(w, wz);
        w.events.push({ k: 'aegis', id: wz.id });
      }
    } else wz.hp = Math.min(wz.hpMax, wz.hp + wz.regen * w.mods.heal * DT);
    if (wz.hp > 0) continue;
    wz.hp = 0;
    wz.alive = false;
    wz.target = null;
    wz.respawnAt = w.t + DM_RESPAWN;
    const credited = wz.lastHitBy !== null && w.t - wz.lastHitAt <= CREDIT_WINDOW;
    const by = credited ? wz.lastHitBy : null;
    w.events.push({ k: 'death', id: wz.id, by, src: credited ? wz.lastHitSrc : 'lava' });
  }
}

export function stepWorld(w: World, cmds: Cmd[], rand: () => number = Math.random) {
  w.rand = rand;
  w.events = [];
  w.lavaCredit = {};
  applyCmds(w, cmds);
  prepWizards(w, rand);
  shrinkArena(w);
  w.zones = w.zones.filter((z) => z.until > w.t);
  stepIsles(w);
  stepChests(w, rand);
  if (w.rules.runes) stepRunes(w, rand);
  const walking = moveAll(w);
  separate(w);
  blockPillars(w, walking);
  if (w.map) for (const z of w.wizards) if (z.alive) keepOut(w.map, z, w.lock);
  stepProjectiles(w);
  if (w.map) dropWalled(w);
  clashProjectiles(w);
  stepGround(w);
  // After commands and impacts, pause cooldown progress without blocking ready abilities.
  for (const wz of w.wizards) if (wz.alive) {
    const pause = Math.min(DT, Math.max(0, incapacitatedUntil(wz, w.t) - w.t));
    if (pause > 0) for (const s of SPELL_IDS) if (wz.cd[s] > w.t) wz.cd[s] += pause;
    // the guard stance also freezes the Attack cooldown (grill of 25/10); today's Hold ground leaves it running
    if (wz.guard && bracingActive(w, wz) && (wz.basicReadyAt ?? 0) > w.t) wz.basicReadyAt! += DT;
  }
  for (const z of w.wizards) if (z.puppetBy && !puppeteer(w, z)) z.puppetBy = undefined; // allies() reads puppetBy without the clock
  for (const z of w.wizards) if (z.geyserLeft !== undefined) {
    z.geyserLeft = Math.max(0, z.geyserLeft - DT);
    if (!isSuspended(z)) { z.geyserLeft = 0; z.geyserAt = undefined; }
  }
  w.t += DT;
}
