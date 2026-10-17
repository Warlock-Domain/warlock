// Maestrias do original (shop.lua MASTERY_GAIN): melhoram todas as magias do jogador. 6 níveis cada;
// 5 de ouro por nível, ou 13 para subir as três de uma vez.
export type MasteryId = 'duration' | 'range' | 'lifesteal';
export const MASTERY_IDS: MasteryId[] = ['duration', 'range', 'lifesteal'];
export const MASTERY_COST = 5;
export const MASTERY_ALL_COST = 13;
export const MASTERY_MAX = 6;

export const MASTERIES: Record<MasteryId, { name: string; text: string; gains: number[] }> = {
  duration: { name: 'Duração', text: 'Escudo e Pacto duram mais.', gains: [0.1, 0.08, 0.07, 0.06, 0.05, 0.04] },
  range: { name: 'Alcance', text: 'Bola de fogo, Raio, Míssil e Teleporte vão mais longe.', gains: [0.12, 0.1, 0.09, 0.08, 0.07, 0.06] },
  lifesteal: { name: 'Roubo de vida', text: 'Recupera parte do dano que você causa.', gains: [0.09, 0.08, 0.07, 0.06, 0.05, 0.04] },
};

export const noMasteries = (): Record<MasteryId, number> => ({ duration: 0, range: 0, lifesteal: 0 });

// soma dos ganhos até o nível (ex.: alcance nível 2 = +22%)
export const masteryValue = (id: MasteryId, level: number) => MASTERIES[id].gains.slice(0, level).reduce((a, b) => a + b, 0);
