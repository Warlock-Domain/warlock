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
  it('ignores slots saved in the old 8-slot layout (1 2 3 4 Q W E R), so no digit comes back and nothing clashes', async () => {
    const old = { slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'KeyQ', slot6: 'KeyW', slot7: 'KeyE', slot8: 'KeyR' };
    const data = { 'warlock:slotkeys': '1', 'warlock:poskeys8': JSON.stringify(old) };
    const keys = await load(data);
    const pos = keys.POS_ACTIONS.map((p) => keys.keyOf(p));
    expect(pos).toEqual(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF']);
    expect(keys.UI_ACTIONS.map((u) => keys.keyOf(u)).filter((k) => pos.includes(k))).toEqual([]);
    expect(data['warlock:poskeys8']).toBe(JSON.stringify(old)); // the old entry is not rewritten
  });
});
