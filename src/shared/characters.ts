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

// Aparência montada (pedido do Fernando, 19/10): 7 peças, cada uma tirada de um dos 9 bonecos (mesmo esqueleto de 41 ossos e
// mesmas animações). Cada opção diz o arquivo (public/models/<from>.glb) e os nós do GLB; null = nenhuma.
export type Piece = { from: CharacterId; nodes: string[]; name?: string; en?: string } | null;
// Look: um índice por peça, na ordem de LOOK_PARTS; no protocolo vai como 7 dígitos (ver encodeLook)
export type Look = number[];
const P = (from: CharacterId, ...nodes: string[]): Piece => ({ from, nodes });
const PRE = ['Mage', 'Knight', 'Barbarian', 'Rogue', 'Rogue', 'Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior'];
const each = (...suffix: string[]) => CHARACTERS.map((c, i) => P(c.id, ...suffix.map((s) => PRE[i] + s)));
const skull = (pre: string, head = pre + '_Head') => [head, pre + '_Eyes', pre + '_Jaw'];
export const LOOK_PARTS: { id: string; name: string; en: string; opts: Piece[] }[] = [
  { id: 'head', name: 'Cabeça', en: 'Head', opts: [
    P('mage', 'Mage_Head'), P('knight', 'Knight_Head'), P('barbarian', 'Barbarian_Head'), P('rogue', 'Rogue_Head'), P('rogue_hooded', 'Rogue_Head_Hooded'),
    P('skeleton_mage', ...skull('Skeleton_Mage', 'Skeleton_Mage_Skull')), P('skeleton_minion', ...skull('Skeleton_Minion')), P('skeleton_rogue', ...skull('Skeleton_Rogue')), P('skeleton_warrior', ...skull('Skeleton_Warrior')),
  ] },
  { id: 'hat', name: 'Chapéu', en: 'Hat', opts: [null, P('mage', 'Mage_Hat'), P('knight', 'Knight_Helmet'), P('barbarian', 'Barbarian_Hat'), P('skeleton_mage', 'Skeleton_Mage_Hat'), P('skeleton_warrior', 'Skeleton_Warrior_Helmet'), P('skeleton_rogue', 'Skeleton_Rogue_Hood')] },
  { id: 'body', name: 'Tronco', en: 'Torso', opts: each('_Body') },
  { id: 'arms', name: 'Braços', en: 'Arms', opts: each('_ArmLeft', '_ArmRight') },
  { id: 'legs', name: 'Pernas', en: 'Legs', opts: each('_LegLeft', '_LegRight') },
  { id: 'cape', name: 'Capa', en: 'Cape', opts: [null, P('mage', 'Mage_Cape'), P('knight', 'Knight_Cape'), P('barbarian', 'Barbarian_Cape'), P('rogue', 'Rogue_Cape'), P('skeleton_minion', 'Skeleton_Minion_Cloak'), P('skeleton_warrior', 'Skeleton_Warrior_Cloak'), P('skeleton_rogue', 'Skeleton_Rogue_Cape')] },
  { id: 'hands', name: 'Nas mãos', en: 'In hands', opts: [null,
    { from: 'mage', nodes: ['2H_Staff'], name: 'Cajado', en: 'Staff' },
    { from: 'knight', nodes: ['1H_Sword', 'Round_Shield'], name: 'Espada e escudo', en: 'Sword and shield' },
    { from: 'barbarian', nodes: ['1H_Axe', 'Barbarian_Round_Shield'], name: 'Machado e escudo', en: 'Axe and shield' },
    { from: 'rogue', nodes: ['Knife', 'Knife_Offhand'], name: 'Facas', en: 'Knives' },
  ] },
];
const BODY = 2;

export const encodeLook = (l: Look) => l.join('');
// null se não for uma aparência válida (formato e índice de cada peça)
export function decodeLook(s: unknown): Look | null {
  if (typeof s !== 'string' || !/^\d{7}$/.test(s)) return null;
  const l = [...s].map(Number);
  return l.every((n, i) => n < LOOK_PARTS[i].opts.length) ? l : null;
}
export const isLook = (s: unknown): s is string => decodeLook(s) !== null;
// os 9 personagens prontos viram a aparência equivalente (a encapuzada usa a capa e as facas da Ladina)
export const lookOf = (c: CharacterId) => encodeLook(LOOK_PARTS.map(({ opts }) => {
  const i = opts.findIndex((o) => o?.from === c);
  return i >= 0 ? i : c === 'rogue_hooded' ? Math.max(0, opts.findIndex((o) => o?.from === 'rogue')) : 0;
}));
// retrato 2D (placar, pódio): o da cabeça
export const lookHead = (s: string): CharacterId => LOOK_PARTS[0].opts[Number(s[0])]!.from;
export const lookBody = (s: string): CharacterId => LOOK_PARTS[BODY].opts[Number(s[BODY])]!.from;
export const lookPieces = (s: string) => [...s].map((n, i) => LOOK_PARTS[i].opts[Number(n)]).filter((p): p is NonNullable<Piece> => !!p);
export const randomLook = (rand = Math.random) => encodeLook(LOOK_PARTS.map(({ opts }) => Math.floor(rand() * opts.length)));
