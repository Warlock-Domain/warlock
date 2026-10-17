export type SpellId = 'fireball' | 'lightning' | 'homing' | 'shield' | 'teleport';
export const SPELL_IDS: SpellId[] = ['fireball', 'lightning', 'homing', 'shield', 'teleport'];

import { KB_PER_DMG, UNIT } from './constants.ts';

export type Level = { cd: number; dmg: number; knock: number; speed: number; range: number; duration: number };
type Spell = { key: string; name: string; cost: number; up: [number, number]; levels: [Level, Level, Level] };

// níveis 1 a 3 do original (lá vão até 7); dano na escala de vida 100, distâncias em metros (UNIT)
// kbf = fator de empurrão da magia no original (o raio empurra 0,92 do normal)
const L = ({ kbf = 1, ...l }: Partial<Level> & { kbf?: number }): Level => ({ cd: 0, dmg: 0, speed: 0, range: 0, duration: 0, ...l, knock: (l.dmg ?? 0) * KB_PER_DMG * kbf });

export const SPELLS: Record<SpellId, Spell> = {
  fireball: { key: 'Q', name: 'Bola de fogo', cost: 0, up: [7, 7], levels: [7, 7.7, 8.4].map((dmg) => L({ cd: 4.8, dmg, speed: 1000 * UNIT, range: 1000 * UNIT })) as [Level, Level, Level] },
  lightning: { key: 'W', name: 'Raio', cost: 11, up: [8, 9], levels: [[16.5, 7], [15.5, 7.8], [15, 8.6]].map(([cd, dmg]) => L({ cd, dmg, kbf: 0.92, range: 600 * UNIT })) as [Level, Level, Level] },
  homing: { key: 'E', name: 'Míssil teleguiado', cost: 11, up: [8, 9], levels: [[16.5, 7], [14.5, 8], [13, 9]].map(([cd, dmg]) => L({ cd, dmg, speed: 1000 * UNIT, duration: 4.5 })) as [Level, Level, Level] },
  shield: { key: 'R', name: 'Escudo', cost: 12, up: [6, 7], levels: [14, 13, 12].map((cd) => L({ cd, duration: 1.2 })) as [Level, Level, Level] },
  teleport: { key: 'F', name: 'Teleporte', cost: 12, up: [6, 7], levels: [[16, 770], [13.5, 840], [11.5, 910]].map(([cd, r]) => L({ cd, range: r * UNIT })) as [Level, Level, Level] },
};

export const HOMING_TURN = 3; // rad/s

export const spellLevel = (id: SpellId, level: number): Level => SPELLS[id].levels[Math.max(1, Math.min(3, level)) - 1];

// preço para subir do nível atual para o próximo; null = já no máximo
export function priceOf(id: SpellId, level: number): number | null {
  if (level >= 3) return null;
  return level === 0 ? SPELLS[id].cost : SPELLS[id].up[level - 1];
}

export const noSpells = (): Record<SpellId, number> => ({ fireball: 1, lightning: 0, homing: 0, shield: 0, teleport: 0 });
