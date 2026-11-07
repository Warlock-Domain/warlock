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

it('gives a number key to the active item in that slot and leaves the other numbers to their bindings', async () => {
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
  cast.mockClear(); setCastMode('quick'); send('Digit3'); expect(cast).toHaveBeenCalledWith('fireball', { x: 3, y: 0 });
  input.setEnabled(false); setCastPreference('item:addicted_rings'); setKey('fireball', 'KeyQ');
});

it('lets an open dialog hold the keys, even when it was opened after the input started', async () => {
  type Fn = (e: Record<string, unknown>) => void;
  const down: { fn: Fn; capture: boolean }[] = [];
  vi.stubGlobal('addEventListener', (name: string, fn: Fn, o?: { capture?: boolean }) => { if (name === 'keydown') down.push({ fn, capture: !!o?.capture }); });
  vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 600);
  const { createInput } = await import('../src/client/input.ts');
  const cast = vi.fn(() => true);
  const input = createInput({ addEventListener() {} } as unknown as HTMLCanvasElement, {
    pick: () => ({ x: 3, y: 0 }), move() {}, stop() {}, cast, center() {}, zoom() {}, pan() {}, armedChanged() {}, preview() {}, padRange() {}, me: () => ({ x: 0, y: 0 }), aim() {},
  });
  input.setEnabled(true); setSlotMode(false); setKey('fireball', 'KeyQ'); setCastMode('quick');
  // same order as a real window: capture listeners first, each phase in registration order, stopped by stopImmediatePropagation
  const press = () => {
    let stopped = false;
    const e = { code: 'KeyQ', repeat: false, preventDefault() {}, stopImmediatePropagation() { stopped = true; }, target: { tagName: 'CANVAS' } };
    for (const l of [...down.filter(l => l.capture), ...down.filter(l => !l.capture)]) { if (stopped) return; l.fn(e); }
  };
  const dialog = { fn: (e: Record<string, unknown>) => (e.stopImmediatePropagation as () => void)(), capture: true };
  down.push(dialog); press(); expect(cast).not.toHaveBeenCalled();
  down.splice(down.indexOf(dialog), 1); press(); expect(cast).toHaveBeenCalledTimes(1);
  input.setEnabled(false);
});
