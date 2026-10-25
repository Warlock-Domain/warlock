import type { Level } from './spells.ts';

export const CHANNEL = { min: 1, max: 2 };
export const channelPower = (elapsed: number) => elapsed + 1e-8 < CHANNEL.min ? 0 : 1 + Math.min(CHANNEL.max, Math.max(0, elapsed)) / 2;

// Only the requested attributes change; no extra healing, duration, radius or status time.
export function channelLevel(level: Level, power = 1): Level {
  return power === 1 ? level : { ...level, dmg: level.dmg * power, dmgMin: level.dmgMin * power,
    dot: level.dot * power, knock: level.knock * power, range: level.range * power, speed: level.speed * power };
}
