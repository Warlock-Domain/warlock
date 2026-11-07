import type { Level } from './spells.ts';
import { v } from './vec.ts';

export const ELEMENTS = ['fire', 'water', 'earth', 'ki', 'void'] as const;
export type Element = (typeof ELEMENTS)[number];
export type ElementalSphere = { element: Element; until: number };
export const ELEMENTAL_SPHERES = { max: 5, orbit: 1, height: 1.1, radius: .16, speed: 1.4, damage: 30 };
export const ELEMENT_COLORS: Record<Element, string> = {
  fire: '#ed3535', water: '#2788ff', earth: '#8b542b', ki: '#ffffff', void: '#000000',
};

export type ElementalBonuses = { fire: number; water: number; earth: number; ki: number; void: number };
export function elementalBonuses(spheres: readonly { element: Element; until?: number; left?: number }[] | undefined, now = 0): ElementalBonuses {
  const bonus = { fire: 0, water: 0, earth: 0, ki: 0, void: 0 };
  for (const sphere of spheres ?? []) if (sphere.until === undefined ? (sphere.left ?? 0) > 0 : sphere.until > now) bonus[sphere.element] += .05;
  return bonus;
}
// Stored element totals are the 5% benefits; their paired penalties are 3% per sphere.
export const elementalPenalty = (benefit: number) => benefit * .6;
export const elementalDamage = (bonus: ElementalBonuses) => (1 + bonus.fire) * (1 - elementalPenalty(bonus.water));
export const elementalKnock = (bonus: ElementalBonuses) => 1 - elementalPenalty(bonus.fire);
export const elementalArea = (bonus: ElementalBonuses) => 1 - elementalPenalty(bonus.earth);
export const elementalRange = (bonus: ElementalBonuses) => (1 + bonus.water) * elementalArea(bonus);
export function elementalLevel(level: Level, bonus: ElementalBonuses): Level {
  return {
    ...level, heal: level.heal * (1 + bonus.ki), dmg: level.dmg * elementalDamage(bonus), dmgMin: level.dmgMin * elementalDamage(bonus),
    dot: level.dot * elementalDamage(bonus), knock: level.knock * elementalKnock(bonus),
    speed: level.speed * (1 + bonus.water), range: level.range * elementalRange(bonus),
    radius: level.radius * Math.sqrt(elementalArea(bonus)), width: level.width * elementalArea(bonus),
    blind: level.blind * (1 + bonus.earth), incapacitate: level.incapacitate * (1 + bonus.earth),
  };
}

export function elementalOrbit(time: number, slot: number, count: number) {
  const angle = time * ELEMENTAL_SPHERES.speed + slot * Math.PI * 2 / Math.max(1, count);
  return v(Math.cos(angle) * ELEMENTAL_SPHERES.orbit, Math.sin(angle) * ELEMENTAL_SPHERES.orbit);
}
