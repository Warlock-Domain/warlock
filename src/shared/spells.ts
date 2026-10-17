export type SpellId = 'fireball' | 'lightning' | 'homing' | 'shield' | 'teleport';
export const SPELL_IDS: SpellId[] = ['fireball', 'lightning', 'homing', 'shield', 'teleport'];

export type Level = { cd: number; dmg: number; knock: number; speed: number; range: number; duration: number };
type Spell = { key: string; name: string; cost: number; up: [number, number]; levels: [Level, Level, Level] };

// nível 2 e 3: +20% e +40% em dano e empurrão, −10% e −20% na recarga
function levels(base: Level): [Level, Level, Level] {
  const at = (power: number, cd: number): Level => ({ ...base, dmg: base.dmg * power, knock: base.knock * power, cd: base.cd * cd });
  return [base, at(1.2, 0.9), at(1.4, 0.8)];
}

const L = (l: Partial<Level>): Level => ({ cd: 0, dmg: 0, knock: 0, speed: 0, range: 0, duration: 0, ...l });

export const SPELLS: Record<SpellId, Spell> = {
  fireball: { key: 'Q', name: 'Bola de fogo', cost: 0, up: [8, 12], levels: levels(L({ cd: 2.5, dmg: 10, knock: 7, speed: 9, range: 11 })) },
  lightning: { key: 'W', name: 'Raio', cost: 10, up: [8, 12], levels: levels(L({ cd: 6, dmg: 6, knock: 6, range: 7 })) },
  homing: { key: 'E', name: 'Míssil teleguiado', cost: 10, up: [8, 12], levels: levels(L({ cd: 8, dmg: 10, knock: 6.5, speed: 5, duration: 4 })) },
  shield: { key: 'R', name: 'Escudo', cost: 10, up: [8, 12], levels: levels(L({ cd: 10, duration: 1.5 })) },
  teleport: { key: 'F', name: 'Teleporte', cost: 10, up: [8, 12], levels: levels(L({ cd: 10, range: 6 })) },
};

export const HOMING_TURN = 3; // rad/s

export const spellLevel = (id: SpellId, level: number): Level => SPELLS[id].levels[Math.max(1, Math.min(3, level)) - 1];

// preço para subir do nível atual para o próximo; null = já no máximo
export function priceOf(id: SpellId, level: number): number | null {
  if (level >= 3) return null;
  return level === 0 ? SPELLS[id].cost : SPELLS[id].up[level - 1];
}

export const noSpells = (): Record<SpellId, number> => ({ fireball: 1, lightning: 0, homing: 0, shield: 0, teleport: 0 });
