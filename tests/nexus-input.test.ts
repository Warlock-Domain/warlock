import { afterEach, expect, it, vi } from 'vitest';
import { setKey, setSlotMode } from '../src/client/keys.ts';
import type { InputHandlers } from '../src/client/input.ts';
afterEach(() => { vi.unstubAllGlobals(); });
it('cancels Nexus ahead of Channeling but ignores OS key repeat', async () => {
  type Fn = (e: Record<string, unknown>) => void;
  const events = new Map<string, Fn[]>();
  vi.stubGlobal('addEventListener', (k: string, f: Fn) => events.set(k, [...events.get(k) ?? [], f]));
  vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 600);
  const { createInput } = await import('../src/client/input.ts');
  const cancelNexus = vi.fn(() => true), channel = vi.fn(() => true);
  const h: InputHandlers = { cancelNexus, channel, canChannel: () => true, pick: () => ({ x: 0, y: 0 }), move() {}, stop() {}, cast: () => true, center() {}, zoom() {}, pan() {}, armedChanged() {}, preview() {}, padRange() {}, me: () => ({ x: 0, y: 0 }), aim() {} };
  const input = createInput({ addEventListener() {} } as unknown as HTMLCanvasElement, h);
  input.setEnabled(true); setSlotMode(false); setKey('nexus', 'KeyN'); setKey('basic', 'KeyA');
  const key = (code: string, repeat = false) => events.get('keydown')?.forEach(f => f({ code, repeat, preventDefault() {}, target: { tagName: 'CANVAS' } }));
  key('KeyA'); key('KeyN', true); expect(cancelNexus).not.toHaveBeenCalled();
  key('KeyN'); expect(cancelNexus).toHaveBeenCalledTimes(1); expect(channel).not.toHaveBeenCalled();
  input.setEnabled(false);
});
