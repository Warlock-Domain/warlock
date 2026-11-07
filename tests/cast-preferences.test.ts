import { afterEach, expect, it, vi } from 'vitest';
import { UNIT_TARGET_SPELLS } from '../src/shared/spells.ts';
import ui from '../src/client/ui.ts?raw';

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
it('keeps every unit-target spell on click whatever the preferences', async () => {
  const { clickOnly, resolveCastMode, setCastPreference } = await import('../src/client/cast-preferences.ts');
  setCastPreference('key:KeyQ', 'release');
  for (const spell of UNIT_TARGET_SPELLS) {
    const ability = 'spell:' + spell;
    setCastPreference(ability, 'quick');
    expect(clickOnly(ability)).toBe(true);
    expect(resolveCastMode('quick', ability, 'KeyQ')).toBe('click');
    setCastPreference(ability);
  }
  expect(clickOnly('spell:fireball')).toBe(false);
  expect(clickOnly('item:heal')).toBe(false);
  expect(clickOnly()).toBe(false);
  setCastPreference('key:KeyQ');
});
it('tells the player to click the target, not the ground, for unit-target spells', () => {
  expect(ui).toContain("const onTarget = UNIT_TARGET_SPELLS.has(armed as SpellId);");
  expect(ui).toContain("${onTarget ? 'no alvo' : 'no chão'}");
  expect(ui).toContain("${onTarget ? 'a target' : 'the ground'}");
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
