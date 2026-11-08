export const WORLD_ENDS = ['lava', 'ice', 'darkness', 'abyss'] as const;
export type WorldEnd = (typeof WORLD_ENDS)[number];
export const worldEndUsesCircle = (ending: WorldEnd | 'random' | undefined) => ending === 'ice' || ending === 'darkness';
export const SCENERY_CHOICES = ['random', 'forest', 'dungeon'] as const;
export type SceneryChoice = (typeof SCENERY_CHOICES)[number];

export const ICE = { damageRatio: .7, slow: .3 };
export const DARKNESS = { fuel: 15, grace: 2, torchRadius: 2.5 };
export const ABYSS = { hang: 15, rescue: 1.25, reach: .8 };
export const HEARTH_CLEAR_RADIUS = .9;
export const hasWorldHearth = (ending: WorldEnd | undefined) => ending === 'ice' || ending === 'darkness';
