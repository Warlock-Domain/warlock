import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });
it('uses individual active-item preferences for the Scourge keyboard action', async () => {
  const { setCastPreference } = await import('../src/client/cast-preferences.ts');
  const { getCastMode } = await import('../src/client/keys.ts');
  setCastPreference('key:Digit1', 'click');
  setCastPreference('item:scourge', 'release');
  expect(getCastMode('scourge', 'Digit1')).toBe('release');
  setCastPreference('item:scourge');
  expect(getCastMode('scourge', 'Digit1')).toBe('click');
  setCastPreference('key:Digit1');
});
it('shares targeted click defaults between the HUD editor and keyboard resolver', async () => {
  const { resolveCastMode, setCastPreference } = await import('../src/client/cast-preferences.ts');
  for (const ability of ['spell:heal', 'spell:sniper']) {
    expect(resolveCastMode('quick', ability, 'KeyQ')).toBe('click');
    setCastPreference('key:KeyQ', 'release');
    expect(resolveCastMode('quick', ability, 'KeyQ')).toBe('release');
    setCastPreference(ability, 'quick');
    expect(resolveCastMode('click', ability, 'KeyQ')).toBe('quick');
    setCastPreference(ability);
    setCastPreference('key:KeyQ');
  }
});
it('resolves individual spell/item, shortcut and global modes in priority order', async () => {
  const { castPreference, setCastPreference, resolveCastMode } = await import('../src/client/cast-preferences.ts');
  setCastPreference('key:KeyQ', 'click');
  expect(resolveCastMode('quick', 'spell:fireball', 'KeyQ')).toBe('click');
  setCastPreference('spell:fireball', 'release');
  expect(resolveCastMode('quick', 'spell:fireball', 'KeyQ')).toBe('release');
  setCastPreference('spell:fireball');
  expect(resolveCastMode('quick', 'spell:fireball', 'KeyQ')).toBe('click');
  setCastPreference('key:KeyQ');
  expect(resolveCastMode('quick', 'spell:fireball', 'KeyQ')).toBe('quick');
  setCastPreference('item:ring', 'quick');
  expect(castPreference('item:ring')).toBe('quick');
  expect(resolveCastMode('click', 'item:ring', 'Digit1')).toBe('quick');
});
it('persists valid preferences and ignores malformed saved fields', async () => {
  const saved: Record<string, string> = {
    'warlock:cast-overrides': JSON.stringify({ 'spell:heal': 'click', 'item:ring': 'release', 'key:KeyW': 'bad', unknown: 'quick' }),
  };
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved[k] ?? null, setItem: (k: string, v: string) => saved[k] = v });
  const { castPreference, setCastPreference } = await import('../src/client/cast-preferences.ts');
  expect(castPreference('spell:heal')).toBe('click');
  expect(castPreference('key:KeyW')).toBeUndefined();
  expect(castPreference('unknown')).toBeUndefined();
  setCastPreference('item:ring', 'quick');
  expect(JSON.parse(saved['warlock:cast-overrides'])['item:ring']).toBe('quick');
});
