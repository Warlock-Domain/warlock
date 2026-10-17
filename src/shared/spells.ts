export type SpellId = 'fireball' | 'lightning' | 'homing' | 'shield' | 'teleport';
export const SPELL_IDS: SpellId[] = ['fireball', 'lightning', 'homing', 'shield', 'teleport'];

import { KB_PER_DMG, UNIT } from './constants.ts';

export type Level = { cd: number; dmg: number; knock: number; speed: number; range: number; duration: number };
type Spell = { key: string; name: string; cost: number; up: number[]; levels: Level[] };

export const MAX_SPELL_LEVEL = 7;

// os 7 níveis do original (npc_abilities_custom.txt e npc_items_custom.txt); dano na escala de vida 100, distâncias em metros (UNIT)
// kbf = fator de empurrão da magia no original (o raio empurra 0,92 do normal)
const L = ({ kbf = 1, ...l }: Partial<Level> & { kbf?: number }): Level => ({ cd: 0, dmg: 0, speed: 0, range: 0, duration: 0, ...l, knock: (l.dmg ?? 0) * KB_PER_DMG * kbf });
const zip = (a: number[], b: number[]) => a.map((x, i) => [x, b[i]]);

export const SPELLS: Record<SpellId, Spell> = {
  fireball: { key: 'Q', name: 'Bola de fogo', cost: 0, up: [7, 7, 7, 7, 7, 7], levels: [70, 77, 84, 91, 98, 105, 112].map((d) => L({ cd: 4.8, dmg: d / 10, speed: 1000 * UNIT, range: 1000 * UNIT })) },
  lightning: { key: 'W', name: 'Raio', cost: 11, up: [8, 9, 10, 11, 12, 13], levels: zip([16.5, 15.5, 15, 14.5, 14, 13.5, 13], [70, 78, 86, 94, 102, 110, 118]).map(([cd, d]) => L({ cd, dmg: d / 10, kbf: 0.92, range: 600 * UNIT })) },
  homing: { key: 'E', name: 'Míssil teleguiado', cost: 11, up: [8, 9, 10, 11, 12, 13], levels: zip([16.5, 14.5, 13, 12, 11, 10, 9], [70, 80, 90, 100, 110, 120, 130]).map(([cd, d]) => L({ cd, dmg: d / 10, speed: 1000 * UNIT, duration: 4.5 })) },
  shield: { key: 'R', name: 'Escudo', cost: 12, up: [6, 7, 8, 9, 10, 11], levels: [14, 13, 12, 11, 10, 9, 8].map((cd) => L({ cd, duration: 1.2 })) },
  teleport: { key: 'F', name: 'Teleporte', cost: 12, up: [6, 7, 8, 9, 10, 11], levels: zip([16, 13.5, 11.5, 10, 9, 8, 7], [770, 840, 910, 980, 1050, 1120, 1190]).map(([cd, r]) => L({ cd, range: r * UNIT })) },
};

export const HOMING_TURN = 3; // rad/s

// tempo de conjuração: a magia sai esse tempo depois da tecla (AbilityCastPoint do original era 0,2 s)
export const CAST_POINT: Record<SpellId, number> = { fireball: 0.1, lightning: 0.1, homing: 0.1, shield: 0, teleport: 0 }; // original 0,2 s; 0,1 s a pedido do Fernando (17/10)

export const spellLevel = (id: SpellId, level: number): Level => SPELLS[id].levels[Math.max(1, Math.min(MAX_SPELL_LEVEL, level)) - 1];

// preço para subir do nível atual para o próximo; null = já no máximo
export function priceOf(id: SpellId, level: number): number | null {
  if (level >= MAX_SPELL_LEVEL) return null;
  return level === 0 ? SPELLS[id].cost : SPELLS[id].up[level - 1];
}

export const noSpells = (): Record<SpellId, number> => ({ fireball: 1, lightning: 0, homing: 0, shield: 0, teleport: 0 });
