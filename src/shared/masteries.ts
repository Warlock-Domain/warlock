// Maestria do original (shop.lua MASTERY_GAIN): 6 níveis, 5 de ouro por nível. Duração e Alcance foram tiradas a pedido
// do Fernando (17/10): fica só o Roubo de vida.
export type MasteryId = 'lifesteal';
export const MASTERY_IDS: MasteryId[] = ['lifesteal'];
export const MASTERY_COST = 5;
export const MASTERY_MAX = 6;

export const MASTERIES: Record<MasteryId, { name: string; text: string; gains: number[] }> = {
  lifesteal: { name: 'Roubo de vida', text: 'Recupera parte do dano que você causa.', gains: [0.09, 0.08, 0.07, 0.06, 0.05, 0.04] },
};

export const noMasteries = (): Record<MasteryId, number> => ({ lifesteal: 0 });

// soma dos ganhos até o nível (ex.: nível 2 = +17%)
export const masteryValue = (id: MasteryId, level: number) => MASTERIES[id].gains.slice(0, level).reduce((a, b) => a + b, 0);
