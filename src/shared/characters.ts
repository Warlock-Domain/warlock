// Personagens KayKit (CC0) que cada jogador escolhe na sala. Só visual: todos têm as mesmas magias.
export const CHARACTERS = [
  { id: 'mage', name: 'Mago', en: 'Mage' },
  { id: 'knight', name: 'Cavaleiro', en: 'Knight' },
  { id: 'barbarian', name: 'Bárbaro', en: 'Barbarian' },
  { id: 'rogue', name: 'Ladina', en: 'Rogue' },
  { id: 'rogue_hooded', name: 'Ladina encapuzada', en: 'Hooded Rogue' },
  { id: 'skeleton_mage', name: 'Esqueleto mago', en: 'Skeleton Mage' },
  { id: 'skeleton_minion', name: 'Esqueleto lacaio', en: 'Skeleton Minion' },
  { id: 'skeleton_rogue', name: 'Esqueleto ladino', en: 'Skeleton Rogue' },
  { id: 'skeleton_warrior', name: 'Esqueleto guerreiro', en: 'Skeleton Warrior' },
] as const;

export type CharacterId = (typeof CHARACTERS)[number]['id'];
export const isCharacter = (x: unknown): x is CharacterId => CHARACTERS.some((c) => c.id === x);
