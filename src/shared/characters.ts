// Personagens KayKit (CC0) que cada jogador escolhe na sala. Só visual: todos têm as mesmas magias.
export const CHARACTERS = [
  { id: 'mage', name: 'Mago' },
  { id: 'knight', name: 'Cavaleiro' },
  { id: 'barbarian', name: 'Bárbaro' },
  { id: 'rogue', name: 'Ladina' },
  { id: 'rogue_hooded', name: 'Ladina encapuzada' },
  { id: 'skeleton_mage', name: 'Esqueleto mago' },
  { id: 'skeleton_minion', name: 'Esqueleto lacaio' },
  { id: 'skeleton_rogue', name: 'Esqueleto ladino' },
  { id: 'skeleton_warrior', name: 'Esqueleto guerreiro' },
] as const;

export type CharacterId = (typeof CHARACTERS)[number]['id'];
export const isCharacter = (x: unknown): x is CharacterId => CHARACTERS.some((c) => c.id === x);
