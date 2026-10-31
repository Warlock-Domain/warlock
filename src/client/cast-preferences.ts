import { store } from './store.ts';
import { isRecord } from './saved-data.ts';

export const CAST_MODES = ['quick', 'release', 'click'] as const;
export type CastMode = (typeof CAST_MODES)[number];
const valid = (x: unknown): x is CastMode => (CAST_MODES as readonly unknown[]).includes(x);
const KEY = 'warlock:cast-overrides';
const KEY_RE = /^(key|spell|item):[\w-]{1,64}$/;
const raw = store.json(KEY);
const overrides: Record<string, CastMode> = isRecord(raw)
  ? Object.fromEntries(Object.entries(raw).filter(([key, value]) => KEY_RE.test(key) && valid(value)).map(([key, value]) => [key, value as CastMode])) : {};

export const castPreference = (key: string): CastMode | undefined => overrides[key];
export function setCastPreference(key: string, mode?: CastMode) {
  if (!KEY_RE.test(key) || (mode !== undefined && !valid(mode))) return;
  if (mode === undefined) delete overrides[key];
  else overrides[key] = mode;
  store.set(KEY, JSON.stringify(overrides));
}
// Heal and Inelegant Solution always confirm on a clicked body (src/client/CLAUDE.md), so no preference reaches them;
// otherwise individual ability preferences win over keyboard preferences. Passive items only save future intent.
export const clickOnly = (ability?: string) => ability === 'spell:heal' || ability === 'spell:sniper';
export const resolveCastMode = (fallback: CastMode, ability?: string, code?: string): CastMode =>
  clickOnly(ability) ? 'click' : (ability && overrides[ability]) || (code && overrides['key:' + code]) || fallback;
