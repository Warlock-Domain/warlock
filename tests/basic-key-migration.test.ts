import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
const load = async (data: Record<string, string>) => {
  vi.resetModules();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data[k] ?? null, setItem: (k: string, value: string) => { data[k] = value; } });
  return import('../src/client/keys.ts');
};
describe('new shortcut without taking customized keys', () => {
  it.each(['fresh', 'legacy', 'position', 'ui'])('keeps preferences: %s', async (mode) => {
    const keys = await load(mode === 'legacy' ? { 'warlock:keys': JSON.stringify({ bouncer: 'KeyA' }), 'warlock:slotkeys': '0' }
      : mode === 'position' ? { 'warlock:slotkeys': '1', 'warlock:poskeys6': JSON.stringify({ slot1: 'KeyA' }) }
      : mode === 'ui' ? { 'warlock:keys': JSON.stringify({ shop: 'KeyA' }), 'warlock:slotkeys': '1' } : {});
    expect(keys.keyOf('basic')).toBe(mode === 'fresh' ? 'KeyA' : '');
    if (mode === 'legacy') expect(keys.actionFor('KeyA')).toBe('bouncer');
    if (mode === 'position') expect(keys.keyOf('slot1')).toBe('KeyA');
    if (mode === 'ui') expect(keys.keyOf('shop')).toBe('KeyA');
  });
});

describe('6 position slots on Q W E R D F (issue #401)', () => {
  it('starts from Q W E R D F, with A and S left to Attack and Hold ground', async () => {
    const keys = await load({});
    expect(keys.POS_ACTIONS.map((p) => keys.keyOf(p))).toEqual(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF']);
    expect([keys.keyOf('basic'), keys.keyOf('stop')]).toEqual(['KeyA', 'KeyS']);
  });
});

describe('migration of the 8-slot position keys (warlock:poskeys8 → warlock:poskeys6)', () => {
  const migrate = async (old: unknown, extra: Record<string, string> = {}) => {
    const data: Record<string, string> = { 'warlock:slotkeys': '1', 'warlock:poskeys8': JSON.stringify(old), ...extra };
    const keys = await load(data);
    return { keys, data, pos: keys.POS_ACTIONS.map((p) => keys.keyOf(p)) };
  };
  it('old slots 5 to 8 become slots 1 to 4, the digits are dropped, D F stay default; saved once, the old entry kept', async () => {
    const old = { slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'KeyT', slot6: 'KeyW', slot7: 'KeyE', slot8: 'KeyG' };
    const { keys, data, pos } = await migrate(old);
    expect(pos).toEqual(['KeyT', 'KeyW', 'KeyE', 'KeyG', 'KeyD', 'KeyF']);
    expect(keys.UI_ACTIONS.map((u) => keys.keyOf(u)).filter((k) => pos.includes(k))).toEqual([]);
    expect(JSON.parse(data['warlock:poskeys6'])).toEqual({ slot1: 'KeyT', slot2: 'KeyW', slot3: 'KeyE', slot4: 'KeyG', slot5: 'KeyD', slot6: 'KeyF' });
    expect(data['warlock:poskeys8']).toBe(JSON.stringify(old));
    // a later load reads poskeys6, not the old entry again
    data['warlock:poskeys8'] = JSON.stringify({ slot5: 'KeyZ' });
    expect((await load(data)).keyOf('slot1')).toBe('KeyT');
  });
  it('a migrated key that clashes with A, S, a shortcut or D F goes back to that slot default only', async () => {
    const { pos } = await migrate({ slot5: 'KeyA', slot6: 'KeyS', slot7: 'KeyD', slot8: 'KeyG' }, { 'warlock:keys': JSON.stringify({ shop: 'KeyG' }) });
    expect(pos).toEqual(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF']);
  });
  it('two old slots on the same key: the first keeps it, the second goes back to its default', async () => {
    const { pos } = await migrate({ slot5: 'KeyT', slot6: 'KeyT' });
    expect(pos).toEqual(['KeyT', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF']);
  });
  it('invalid entries fall back to the defaults: wrong types, reserved keys, broken JSON', async () => {
    expect((await migrate({ slot5: 7, slot6: 'Space', slot7: '', slot8: { code: 'KeyT' } })).pos).toEqual(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF']);
    expect((await migrate(['KeyT'])).pos.slice(0, 1)).toEqual(['KeyQ']);
    const keys = await load({ 'warlock:slotkeys': '1', 'warlock:poskeys8': '{broken' });
    expect(keys.keyOf('slot1')).toBe('KeyQ');
  });
});
