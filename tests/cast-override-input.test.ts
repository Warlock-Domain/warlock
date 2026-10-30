import { afterEach, expect, it, vi } from 'vitest';
import { setCastPreference } from '../src/client/cast-preferences.ts';
import { setCastMode, setKey, setSlotMode } from '../src/client/keys.ts';
import type { InputHandlers } from '../src/client/input.ts';
afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ['key:KeyQ', 'key:KeyH', 'spell:heal', 'spell:fireball']) setCastPreference(key);
});
it('honors key overrides but keeps Heal on click-to-confirm', async () => {
  type Fn = (e: Record<string, unknown>) => void;
  const win = new Map<string, Fn[]>(), canvas = new Map<string, Fn[]>();
  const listen = (map: Map<string, Fn[]>) => (name: string, fn: Fn) => map.set(name, [...(map.get(name) ?? []), fn]);
  const send = (type: string, code: string) => win.get(type)?.forEach((fn) => fn({ code, repeat: false, preventDefault() {}, target: { tagName: 'CANVAS' } }));
  vi.stubGlobal('addEventListener', listen(win));
  vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 600);
  const { createInput } = await import('../src/client/input.ts');
  const cast = vi.fn(() => true);
  const handlers: InputHandlers = { pick: () => ({ x: 3, y: 0 }), move() {}, stop() {}, cast, center() {}, zoom() {}, pan() {}, armedChanged() {}, preview() {}, padRange() {}, me: () => ({ x: 0, y: 0 }), aim() {} };
  const input = createInput({ addEventListener: listen(canvas) } as unknown as HTMLCanvasElement, handlers);
  input.setEnabled(true); setSlotMode(false); setKey('fireball', 'KeyQ'); setKey('heal', 'KeyH'); setCastMode('click');
  setCastPreference('key:KeyQ', 'quick');
  send('keydown', 'KeyQ');
  expect(cast).toHaveBeenCalledWith('fireball', { x: 3, y: 0 });
  setCastPreference('spell:heal', 'quick');
  setCastPreference('key:KeyH', 'quick');
  cast.mockClear(); send('keydown', 'KeyH'); send('keyup', 'KeyH');
  expect(cast).not.toHaveBeenCalled();
  input.setEnabled(false);
});

it('reserves inventory number keys and applies the active item preference', async () => {
  type Fn = (e: Record<string, unknown>) => void;
  const win = new Map<string, Fn[]>(), canvas = new Map<string, Fn[]>();
  const listen = (map: Map<string, Fn[]>) => (name: string, fn: Fn) => map.set(name, [...(map.get(name) ?? []), fn]);
  const send = (code: string) => win.get('keydown')?.forEach(fn => fn({ code, repeat: false, preventDefault() {}, stopImmediatePropagation() {}, target: { tagName: 'CANVAS' } }));
  vi.stubGlobal('addEventListener', listen(win)); vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 600);
  const { createInput } = await import('../src/client/input.ts');
  const cast = vi.fn(() => true);
  const input = createInput({ addEventListener: listen(canvas) } as unknown as HTMLCanvasElement, {
    pick: () => ({ x: 3, y: 0 }), move() {}, stop() {}, cast, center() {}, zoom() {}, pan() {}, armedChanged() {}, preview() {}, padRange() {}, me: () => ({ x: 0, y: 0 }), aim() {},
    itemAt: code => code === 'Digit2' ? { spell: 'recharge', id: 'addicted_rings' } : undefined,
  });
  input.setEnabled(true); setSlotMode(false); setKey('fireball', 'Digit3'); setCastMode('click');
  setCastPreference('item:addicted_rings', 'quick');
  send('Digit2'); expect(cast).toHaveBeenCalledWith('recharge', { x: 3, y: 0 });
  cast.mockClear(); send('Digit3'); expect(cast).not.toHaveBeenCalled();
  input.setEnabled(false); setCastPreference('item:addicted_rings'); setKey('fireball', 'KeyQ');
});
