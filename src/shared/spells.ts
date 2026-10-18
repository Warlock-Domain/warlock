export type SpellId = 'fireball' | 'lightning' | 'homing' | 'shield' | 'teleport' | 'swap' | 'grip' | 'meteor' | 'rush' | 'cluster' | 'boomerang' | 'thrust' | 'gravity' | 'rockpillar' | 'bouncer';
export const SPELL_IDS: SpellId[] = ['fireball', 'lightning', 'homing', 'shield', 'teleport', 'swap', 'grip', 'meteor', 'rush', 'cluster', 'boomerang', 'thrust', 'gravity', 'rockpillar', 'bouncer'];
// decisão do Fernando (17/10): no máximo 6 magias por mago (a Bola de fogo conta)
export const MAX_SPELLS = 6;

import { FRICTION, KB_PER_DMG, UNIT } from './constants.ts';

// radius: raio da explosão do Meteoro (e do dano da Gravidade); dmgMin: dano na borda dele; absorb: dano que a Investida converte em velocidade;
// pull: puxão da Gravidade nos magos (m/s²)
export type Level = { cd: number; dmg: number; knock: number; speed: number; range: number; duration: number; radius: number; dmgMin: number; absorb: number; pull: number };
type Spell = { key: string; name: string; cost: number; up: number[]; levels: Level[] };

export const MAX_SPELL_LEVEL = 7;

// os 7 níveis do original (npc_abilities_custom.txt e npc_items_custom.txt); dano na escala de vida 100, distâncias em metros (UNIT)
// kbf = fator de empurrão da magia no original (o raio empurra 0,92 do normal)
const L = ({ kbf = 1, ...l }: Partial<Level> & { kbf?: number }): Level => ({ cd: 0, dmg: 0, speed: 0, range: 0, duration: 0, radius: 0, dmgMin: 0, absorb: 0, pull: 0, ...l, knock: (l.dmg ?? 0) * KB_PER_DMG * kbf });
const zip = (a: number[], b: number[]) => a.map((x, i) => [x, b[i]]);

export const SPELLS: Record<SpellId, Spell> = {
  fireball: { key: 'Q', name: 'Bola de fogo', cost: 0, up: [7, 7, 7, 7, 7, 7], levels: [70, 77, 84, 91, 98, 105, 112].map((d) => L({ cd: 4.8, dmg: d / 10, speed: 1000 * UNIT, range: 1000 * UNIT })) },
  lightning: { key: 'W', name: 'Raio', cost: 11, up: [8, 9, 10, 11, 12, 13], levels: zip([16.5, 15.5, 15, 14.5, 14, 13.5, 13], [70, 78, 86, 94, 102, 110, 118]).map(([cd, d]) => L({ cd: Math.round(cd * 7) / 10, dmg: d / 10, kbf: 0.92, range: 800 * UNIT })) }, // balanceamento de 17/10: recarga ×0,7 e alcance 600 → 800 (acertava 21%)
  homing: { key: 'E', name: 'Míssil teleguiado', cost: 11, up: [8, 9, 10, 11, 12, 13], levels: zip([16.5, 14.5, 13, 12, 11, 10, 9], [70, 80, 90, 100, 110, 120, 130]).map(([cd, d]) => L({ cd, dmg: (d / 10) * 0.8, speed: 1000 * UNIT, duration: 4.5 })) },
  shield: { key: 'R', name: 'Escudo', cost: 12, up: [6, 7, 8, 9, 10, 11], levels: [14, 13, 12, 11, 10, 9, 8].map((cd, i) => L({ cd, duration: 1.2, radius: (200 + 10 * i) * UNIT })) }, // bolha de 200 a 260 (abil.txt do original)
  teleport: { key: 'F', name: 'Teleporte', cost: 12, up: [6, 7, 8, 9, 10, 11], levels: zip([16, 13.5, 11.5, 10, 9, 8, 7], [770, 840, 910, 980, 1050, 1120, 1190]).map(([cd, r]) => L({ cd, range: r * UNIT })) },
  // as cinco magias seguintes: npc_abilities_custom.txt, spells/*.lua e shop/warlock_shop_data.js do Warlock Brawl
  // troca: projétil de 1983 u/s que vive 0,4706 s (alcance 933 u)
  swap: { key: 'D', name: 'Troca', cost: 11, up: [6, 7, 8, 9, 10, 11], levels: [15.8, 13.3, 11.3, 9.8, 8.8, 7.8, 7].map((cd) => L({ cd, speed: 1983 * UNIT, range: 933 * UNIT })) },
  // agarrar: projétil de 1000 u/s por 1,1 s; duration = tempo preso
  // Agarrar prende metade do tempo do original (nerf pedido pelo Fernando, 17/10)
  grip: { key: 'G', name: 'Agarrar', cost: 12, up: [6, 7, 8, 9, 10, 11], levels: zip([24, 20, 17, 15, 13, 12, 10.5], [4.5, 4.75, 5, 5.25, 5.5, 5.75, 6]).map(([cd, duration]) => L({ cd, duration: duration / 2, speed: 1000 * UNIT, range: 1100 * UNIT })) },
  // meteoro: dano de 40 (4) na borda até o máximo no centro; empurrão 0,66
  meteor: { key: 'V', name: 'Meteoro', cost: 14, up: [6, 7, 8, 9, 10, 11], levels: zip([20, 19.5, 19, 18.5, 18, 17.5, 17], [110, 120, 130, 140, 150, 160, 170]).map(([cd, d], i) => L({ cd, dmg: d / 10, dmgMin: 6, kbf: 0.66, /* borda 4 → 6 em 17/10 */ radius: [225, 240, 255, 269, 282, 294, 304][i] * UNIT, range: 1000 * UNIT })) },
  // investida: absorve até `absorb` de dano (metade de cada golpe) e vira velocidade
  rush: { key: 'C', name: 'Investida', cost: 12, up: [6, 7, 8, 9, 10, 11], levels: zip([21, 20, 19, 18, 17, 16, 15], [6, 6.5, 7, 7.5, 8, 8.5, 9]).map(([cd, duration], i) => L({ cd, duration, absorb: (50 + 20 * i) / 10 })) },
  // rajada: 4 projéteis em leque de 844 u/s e 672 u de alcance; empurrão 0,65
  cluster: { key: 'T', name: 'Rajada', cost: 14, up: [6, 7, 8, 9, 10, 11], levels: zip([15.5, 14.75, 14, 13.25, 12.5, 11.75, 11], [33, 36, 39, 42, 45, 48, 51]).map(([cd, d]) => L({ cd, dmg: d / 10, kbf: 0.65, speed: 844 * UNIT, range: 672 * UNIT })) },
  // as cinco do Warlock Brawl de 17/10 (decisão do Fernando): npc_abilities_custom.txt, base/shop.lua, spells/, projectiles/ e modifiers/
  // bumerangue: curva até o ponto (300 a 800 u) e volta ao dono; empurrão 0,95
  boomerang: { key: 'B', name: 'Bumerangue', cost: 11, up: [7, 8, 9, 10, 11, 12], levels: zip([16, 13.9, 12.5, 11.7, 11, 10.3, 9.6], [70, 76, 82, 88, 94, 100, 106]).map(([cd, d]) => L({ cd, dmg: d / 10, kbf: 0.95, speed: 1500 * UNIT, range: 800 * UNIT })) },
  // estocada: o mago dispara até 900 u a 1300 u/s; dano cheio só a 89% da velocidade máxima ou mais; empurrão 1,2
  thrust: { key: 'X', name: 'Estocada', cost: 11, up: [6, 7, 8, 9, 10, 11], levels: zip([16.5, 14.5, 13, 12, 11, 10, 9], [50, 55, 60, 65, 70, 75, 80]).map(([cd, d]) => L({ cd, dmg: d / 10, kbf: 1.2, speed: 1300 * UNIT, range: 900 * UNIT })) },
  // gravidade: orbe de 450 u/s por 900 u; dmg = dano por segundo em quem está a 250 u; pull = força em 550 u (sem empurrão)
  gravity: { key: 'H', name: 'Gravidade', cost: 12, up: [7, 8, 9, 10, 11, 12], levels: zip([21, 20.5, 20, 19.5, 19, 18.5, 18], [20, 33.33, 46.67, 60, 73.33, 86.67, 100]).map(([cd, d], i) => L({ cd, dmg: d / 10, kbf: 0, speed: 450 * UNIT, range: 900 * UNIT, radius: 250 * UNIT, pull: (500 + 30 * i) * UNIT })) },
  // pilar de pedra: obstáculo de 4 s a até 650..1100 u; recarga = AbilityCooldown (o cooldown2 do mesmo arquivo diz 24..12 e só aparece na dica)
  rockpillar: { key: 'Z', name: 'Pilar de pedra', cost: 13, up: [5, 6, 7, 8, 9, 10], levels: zip([26, 24, 22, 20, 18, 16, 14], [650, 725, 800, 875, 950, 1025, 1100]).map(([cd, r]) => L({ cd, duration: 4, range: r * UNIT })) },
  // ricochete: 900 u/s, vive 1 s e renova a cada mago tocado; perde 30% a cada inimigo acertado; empurrão 1,2
  bouncer: { key: 'A', name: 'Ricochete', cost: 14, up: [6, 7, 8, 9, 10, 11], levels: zip([19, 18, 17, 16, 15, 14, 13], [54, 62, 70, 78, 86, 94, 102]).map(([cd, d]) => L({ cd, dmg: d / 10, kbf: 1.2, speed: 900 * UNIT, range: 900 * UNIT })) },
};

// agarrar: empurrão recebido −67% e cada magia lançada preso soma 5 (0,5 aqui) ao dano acumulado (gripmodifier.lua)
export const GRIP = { kbCut: 0.67, castPenalty: 0.5 };
// meteoro: 0,55 s parado no ar + 0,60 s caindo (meteor.lua)
export const METEOR_DELAY = 1.15;
// investida: +35 u/s ao ativar; cada ponto absorvido soma 1,5 u/s (rushmodifier.lua; vida ×10 em unidades do original)
// avanço: 3 m em 0,2 s na direção do mouse (não existe no original; pedido do Fernando, 17/10: "dash não funciona")
export const RUSH = { bonus: 35 * UNIT, perHp: 15 * UNIT, share: 0.5, dash: 3, dashTime: 0.2, dashDmg: 6 }; // dashDmg: dano em quem o avanço encostar (pedido do Fernando, 17/10)
// rajada: ângulos do leque em radianos (cluster.lua)
export const CLUSTER_FAN = [-0.18, -0.06, 0.06, 0.18];

export const HOMING_TURN = 3; // rad/s

// bumerangue (boomerangprojectile.lua): sai a 1500 u/s com 300 u/s de lado, volta mirando o dono a 1000 u/s (virando 1000 u/s²);
// ao bater em mago quica a 500 u/s (750 em obstáculo); some perto do dono; life: teto de segurança (não existe no original)
export const BOOMERANG = { side: 300 * UNIT, minDist: 300 * UNIT, back: 1000 * UNIT, turn: 1000 * UNIT, bounce: 500 * UNIT, bounceWall: 750 * UNIT, gap: 10 * UNIT, life: 6 };
// estocada (thrust.lua, thrustmodifier.lua): sai a 77% da velocidade e acelera até ela (aceleração que empata com o atrito);
// dura o caminho + 0,09 s; sem acertar, freia para 20%; reach: a bolha da estocada tem 30 u a mais que o mago
export const THRUST = { start: 0.77, accel: FRICTION, extra: 0.09, endSlow: 0.2, reach: 30 * UNIT, full: 0.8 };
// gravidade (gravity.lua, gravityprojectile.lua): puxa magos inimigos até 550 u e projéteis até 600 u (1650 u/s², de qualquer dono)
export const GRAVITY = { wizR: 550 * UNIT, projR: 600 * UNIT, projPull: 1650 * UNIT, tick: 0.2 };
// ricochete (bouncerprojectile.lua): cada inimigo acertado tira 30% do dano; abaixo de 10 (1 aqui) some
export const BOUNCER = { decay: 0.7, minDmg: 1 };

// tempo de conjuração: a magia sai esse tempo depois da tecla (AbilityCastPoint do original era 0,2 s)
export const CAST_POINT: Record<SpellId, number> = { fireball: 0.1, lightning: 0.1, homing: 0.1, shield: 0, teleport: 0, swap: 0, grip: 0.1, meteor: 0.1, rush: 0, cluster: 0.1, boomerang: 0.1, thrust: 0, gravity: 0.1, rockpillar: 0, bouncer: 0.1 }; // original 0,2 s (Estocada 0); 0,1 s a pedido do Fernando (17/10)

export const spellLevel = (id: SpellId, level: number): Level => SPELLS[id].levels[Math.max(1, Math.min(MAX_SPELL_LEVEL, level)) - 1];

// preço para subir do nível atual para o próximo; null = já no máximo
export function priceOf(id: SpellId, level: number): number | null {
  if (level >= MAX_SPELL_LEVEL) return null;
  return level === 0 ? SPELLS[id].cost : SPELLS[id].up[level - 1];
}

export const noSpells = (): Record<SpellId, number> => ({ fireball: 1, lightning: 0, homing: 0, shield: 0, teleport: 0, swap: 0, grip: 0, meteor: 0, rush: 0, cluster: 0, boomerang: 0, thrust: 0, gravity: 0, rockpillar: 0, bouncer: 0 });

export const spellCount = (spells: Record<SpellId, number>) => SPELL_IDS.filter((s) => spells[s] > 0).length;
