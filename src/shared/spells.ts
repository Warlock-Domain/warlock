export type SpellId = 'fireball' | 'lightning' | 'homing' | 'shield' | 'teleport' | 'swap' | 'grip' | 'meteor' | 'rush' | 'cluster';
export const SPELL_IDS: SpellId[] = ['fireball', 'lightning', 'homing', 'shield', 'teleport', 'swap', 'grip', 'meteor', 'rush', 'cluster'];
// decisão do Fernando (17/10): no máximo 6 magias por mago (a Bola de fogo conta)
export const MAX_SPELLS = 6;

import { KB_PER_DMG, UNIT } from './constants.ts';

// radius: raio da explosão do Meteoro; dmgMin: dano na borda dele; absorb: dano que a Investida converte em velocidade
export type Level = { cd: number; dmg: number; knock: number; speed: number; range: number; duration: number; radius: number; dmgMin: number; absorb: number };
type Spell = { key: string; name: string; cost: number; up: number[]; levels: Level[] };

export const MAX_SPELL_LEVEL = 7;

// os 7 níveis do original (npc_abilities_custom.txt e npc_items_custom.txt); dano na escala de vida 100, distâncias em metros (UNIT)
// kbf = fator de empurrão da magia no original (o raio empurra 0,92 do normal)
const L = ({ kbf = 1, ...l }: Partial<Level> & { kbf?: number }): Level => ({ cd: 0, dmg: 0, speed: 0, range: 0, duration: 0, radius: 0, dmgMin: 0, absorb: 0, ...l, knock: (l.dmg ?? 0) * KB_PER_DMG * kbf });
const zip = (a: number[], b: number[]) => a.map((x, i) => [x, b[i]]);

export const SPELLS: Record<SpellId, Spell> = {
  fireball: { key: 'Q', name: 'Bola de fogo', cost: 0, up: [7, 7, 7, 7, 7, 7], levels: [70, 77, 84, 91, 98, 105, 112].map((d) => L({ cd: 4.8, dmg: d / 10, speed: 1000 * UNIT, range: 1000 * UNIT })) },
  lightning: { key: 'W', name: 'Raio', cost: 11, up: [8, 9, 10, 11, 12, 13], levels: zip([16.5, 15.5, 15, 14.5, 14, 13.5, 13], [70, 78, 86, 94, 102, 110, 118]).map(([cd, d]) => L({ cd: Math.round(cd * 7) / 10, dmg: d / 10, kbf: 0.92, range: 600 * UNIT })) },
  homing: { key: 'E', name: 'Míssil teleguiado', cost: 11, up: [8, 9, 10, 11, 12, 13], levels: zip([16.5, 14.5, 13, 12, 11, 10, 9], [70, 80, 90, 100, 110, 120, 130]).map(([cd, d]) => L({ cd, dmg: (d / 10) * 0.8, speed: 1000 * UNIT, duration: 4.5 })) },
  shield: { key: 'R', name: 'Escudo', cost: 12, up: [6, 7, 8, 9, 10, 11], levels: [14, 13, 12, 11, 10, 9, 8].map((cd) => L({ cd, duration: 1.2 })) },
  teleport: { key: 'F', name: 'Teleporte', cost: 12, up: [6, 7, 8, 9, 10, 11], levels: zip([16, 13.5, 11.5, 10, 9, 8, 7], [770, 840, 910, 980, 1050, 1120, 1190]).map(([cd, r]) => L({ cd, range: r * UNIT })) },
  // as cinco magias seguintes: npc_abilities_custom.txt, spells/*.lua e shop/warlock_shop_data.js do Warlock Brawl
  // troca: projétil de 1983 u/s que vive 0,4706 s (alcance 933 u)
  swap: { key: 'D', name: 'Troca', cost: 11, up: [6, 7, 8, 9, 10, 11], levels: [15.8, 13.3, 11.3, 9.8, 8.8, 7.8, 7].map((cd) => L({ cd, speed: 1983 * UNIT, range: 933 * UNIT })) },
  // agarrar: projétil de 1000 u/s por 1,1 s; duration = tempo preso
  // Agarrar prende metade do tempo do original (nerf pedido pelo Fernando, 17/10)
  grip: { key: 'G', name: 'Agarrar', cost: 12, up: [6, 7, 8, 9, 10, 11], levels: zip([24, 20, 17, 15, 13, 12, 10.5], [4.5, 4.75, 5, 5.25, 5.5, 5.75, 6]).map(([cd, duration]) => L({ cd, duration: duration / 2, speed: 1000 * UNIT, range: 1100 * UNIT })) },
  // meteoro: dano de 40 (4) na borda até o máximo no centro; empurrão 0,66
  meteor: { key: 'V', name: 'Meteoro', cost: 14, up: [6, 7, 8, 9, 10, 11], levels: zip([20, 19.5, 19, 18.5, 18, 17.5, 17], [110, 120, 130, 140, 150, 160, 170]).map(([cd, d], i) => L({ cd, dmg: d / 10, dmgMin: 4, kbf: 0.66, radius: [225, 240, 255, 269, 282, 294, 304][i] * UNIT, range: 1000 * UNIT })) },
  // investida: absorve até `absorb` de dano (metade de cada golpe) e vira velocidade
  rush: { key: 'C', name: 'Investida', cost: 12, up: [6, 7, 8, 9, 10, 11], levels: zip([21, 20, 19, 18, 17, 16, 15], [6, 6.5, 7, 7.5, 8, 8.5, 9]).map(([cd, duration], i) => L({ cd, duration, absorb: (50 + 20 * i) / 10 })) },
  // rajada: 4 projéteis em leque de 844 u/s e 672 u de alcance; empurrão 0,65
  cluster: { key: 'T', name: 'Rajada', cost: 14, up: [6, 7, 8, 9, 10, 11], levels: zip([15.5, 14.75, 14, 13.25, 12.5, 11.75, 11], [33, 36, 39, 42, 45, 48, 51]).map(([cd, d]) => L({ cd, dmg: d / 10, kbf: 0.65, speed: 844 * UNIT, range: 672 * UNIT })) },
};

// agarrar: empurrão recebido −67% e cada magia lançada preso soma 5 (0,5 aqui) ao dano acumulado (gripmodifier.lua)
export const GRIP = { kbCut: 0.67, castPenalty: 0.5 };
// meteoro: 0,55 s parado no ar + 0,60 s caindo (meteor.lua)
export const METEOR_DELAY = 1.15;
// investida: +35 u/s ao ativar; cada ponto absorvido soma 1,5 u/s (rushmodifier.lua; vida ×10 em unidades do original)
// avanço: 3 m em 0,2 s na direção do mouse (não existe no original; pedido do Fernando, 17/10: "dash não funciona")
export const RUSH = { bonus: 35 * UNIT, perHp: 15 * UNIT, share: 0.5, dash: 3, dashTime: 0.2 };
// rajada: ângulos do leque em radianos (cluster.lua)
export const CLUSTER_FAN = [-0.18, -0.06, 0.06, 0.18];

export const HOMING_TURN = 3; // rad/s

// tempo de conjuração: a magia sai esse tempo depois da tecla (AbilityCastPoint do original era 0,2 s)
export const CAST_POINT: Record<SpellId, number> = { fireball: 0.1, lightning: 0.1, homing: 0.1, shield: 0, teleport: 0, swap: 0, grip: 0.1, meteor: 0.1, rush: 0, cluster: 0.1 }; // original 0,2 s; 0,1 s a pedido do Fernando (17/10)

export const spellLevel = (id: SpellId, level: number): Level => SPELLS[id].levels[Math.max(1, Math.min(MAX_SPELL_LEVEL, level)) - 1];

// preço para subir do nível atual para o próximo; null = já no máximo
export function priceOf(id: SpellId, level: number): number | null {
  if (level >= MAX_SPELL_LEVEL) return null;
  return level === 0 ? SPELLS[id].cost : SPELLS[id].up[level - 1];
}

export const noSpells = (): Record<SpellId, number> => ({ fireball: 1, lightning: 0, homing: 0, shield: 0, teleport: 0, swap: 0, grip: 0, meteor: 0, rush: 0, cluster: 0 });

export const spellCount = (spells: Record<SpellId, number>) => SPELL_IDS.filter((s) => spells[s] > 0).length;
