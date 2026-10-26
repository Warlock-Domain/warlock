import { store } from './store.ts';
import { isRecord } from './saved-data.ts';

export const CAST_MODES = ['quick', 'release', 'click'] as const;
export type CastMode = (typeof CAST_MODES)[number];
const valid = (x: unknown): x is CastMode => (CAST_MODES as readonly unknown[]).includes(x);
const KEY = 'warlock:cast-overrides';
const raw = store.json(KEY);
const overrides: Record<string, CastMode> = isRecord(raw)
  ? Object.fromEntries(Object.entries(raw).filter(([key, value]) => /^(key|spell|item):[\w-]{1,64}$/.test(key) && valid(value)).map(([key, value]) => [key, value as CastMode])) : {};

export const castPreference = (key: string): CastMode | undefined => overrides[key];
export function setCastPreference(key: string, mode?: CastMode) {
  if (!/^(key|spell|item):[\w-]{1,64}$/.test(key) || (mode !== undefined && !valid(mode))) return;
  if (mode === undefined) delete overrides[key];
  else overrides[key] = mode;
  store.set(KEY, JSON.stringify(overrides));
}
// Individual ability preferences win over keyboard preferences; passive items only save future intent.
export const resolveCastMode = (fallback: CastMode, ability?: string, code?: string): CastMode =>
  (ability && overrides[ability]) || (code && overrides['key:' + code]) ||
  (ability === 'spell:heal' || ability === 'spell:sniper' ? 'click' : fallback);
