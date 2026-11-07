import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTN, padAction } from '../src/client/gamepad.ts';
import {
  ACTIONS, PAD_START, POS_ACTIONS, UI_ACTIONS, actionFor, isUiKey, keyOf, labelOf, onFreeEsc, padActionAt, padButtonOf, resetKeys, resetPad, setKey, setPadButton, setPadMode, setSlotMode, setSlots, whoUses,
} from '../src/client/keys.ts';
import { RULES } from '../src/client/rules-text.ts';

beforeEach(() => {
  setSlotMode(false);
  setPadMode(false);
  resetKeys();
  resetPad();
});

describe('interface shortcuts in the same panel as the spells', () => {
  it('gives Transfusion an explicit empty default when swapping an occupied key', () => {
    expect(keyOf('transfusion')).toBe('');
    setKey('transfusion', 'KeyQ');
    expect(keyOf('fireball')).toBe('');
    expect(actionFor('KeyQ')).toBe('transfusion');
  });
  it('taunts start on Y and on the D-pad left, and their button can be changed', () => {
    expect(keyOf('taunt')).toBe('KeyY');
    expect(padButtonOf('taunt')).toBe(BTN.LEFT);
    expect(padActionAt(BTN.LEFT)).toBe('taunt');
    expect(setPadButton('taunt', BTN.DOWN)).toBe(true);
    expect(padButtonOf('shop')).toBe(BTN.LEFT);
    expect(padActionAt(BTN.DOWN)).toBe('taunt');
  });
  it('a shortcut and a spell never share a key: giving Q to taunts swaps with Fireball, and the shortcut never casts', () => {
    expect(whoUses('KeyQ')).toBe('fireball');
    expect(setKey('taunt', 'KeyQ')).toBe(true);
    expect([keyOf('taunt'), keyOf('fireball')]).toEqual(['KeyQ', 'KeyY']);
    expect(actionFor('KeyQ')).toBeUndefined();
    expect(actionFor('KeyY')).toBe('fireball');
    expect([isUiKey('KeyQ', 'taunt'), isUiKey('KeyY', 'taunt')]).toEqual([true, false]);
  });

  it('Vote starts without a key and "no key" never matches anything', () => {
    expect(keyOf('vote')).toBe('');
    expect(isUiKey('', 'vote')).toBe(false);
    expect(setKey('vote', 'Digit9')).toBe(true);
    expect(isUiKey('Digit9', 'vote')).toBe(true);
  });

  it('Esc, Enter, Space and ← → are fixed for spells and shortcuts', () => {
    for (const code of ['Escape', 'Enter', 'Space', 'ArrowLeft', 'ArrowRight']) {
      expect(setKey('fireball', code)).toBe(false);
      expect(setKey('board', code)).toBe(false);
    }
    expect([keyOf('fireball'), keyOf('board')]).toEqual(['KeyQ', 'Tab']);
  });

  it('Q W E R D F mode: keys belong to the bar slots (Spell 1 to 6), rebindable; a slot and a shortcut swap keys (issues #76 and #401)', () => {
    setSlots(['fireball', 'lightning', null, null, 'pact']);
    setSlotMode(true);
    expect([whoUses('KeyQ'), actionFor('KeyW'), actionFor('KeyD'), keyOf('pact')]).toEqual(['slot1', 'lightning', 'pact', 'KeyD']);
    expect(POS_ACTIONS.map(keyOf)).toEqual(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF']);
    // Spell 1 cannot take Space (fixed); Spell 1 on T: Fireball moves to T
    expect(setKey('slot1', 'Space')).toBe(false);
    setKey('slot1', 'KeyT');
    expect([actionFor('KeyT'), actionFor('KeyQ'), keyOf('fireball')]).toEqual(['fireball', undefined, 'KeyT']);
    // Spell 2 on T: the two slots swap (Spell 1 gets W)
    setKey('slot2', 'KeyT');
    expect([keyOf('slot1'), keyOf('slot2')]).toEqual(['KeyW', 'KeyT']);
    // a shortcut on Spell 1's W: the slot gets the shortcut's old key (7)
    setKey('shop', 'KeyW');
    expect([isUiKey('KeyW', 'shop'), keyOf('slot1'), actionFor('KeyW'), actionFor('Digit7')]).toEqual([true, 'Digit7', undefined, 'fireball']);
    // a slot on the Stop key (S): Stop gets the slot's old key
    setKey('slot5', 'KeyS');
    expect([actionFor('KeyS'), keyOf('stop')]).toEqual(['pact', 'KeyD']);
    // no key on two actions of the mode; Reset to default resets the slots too
    const used = [...POS_ACTIONS, ...UI_ACTIONS].map(keyOf).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
    resetKeys();
    expect([keyOf('slot1'), keyOf('slot5'), keyOf('shop')]).toEqual(['KeyQ', 'KeyD', 'Digit7']);
  });

  it('Replay the fall starts on 5 and is rebindable like the other shortcuts', () => {
    expect(isUiKey('Digit5', 'replay')).toBe(true);
    expect(actionFor('Digit5')).toBeUndefined();
    expect(setKey('replay', 'Digit9')).toBe(true);
    expect([isUiKey('Digit9', 'replay'), isUiKey('Digit5', 'replay')]).toEqual([true, false]);
  });

  it('Camera on the wizard or the arena starts on 6 and is rebindable (issue #222)', () => {
    expect(isUiKey('Digit6', 'camera')).toBe(true);
    expect(actionFor('Digit6')).toBeUndefined();
    expect(setKey('camera', 'Digit8')).toBe(true);
    expect([isUiKey('Digit8', 'camera'), isUiKey('Digit6', 'camera')]).toEqual([true, false]);
  });

  it('after many swaps no key shows up on two actions', () => {
    const all = [...ACTIONS, ...UI_ACTIONS];
    const codes = ['KeyQ', 'KeyS', 'Tab', 'Digit4', 'F1', 'Backquote', 'KeyY', 'Digit1', 'KeyZ', 'F2'];
    for (let i = 0; i < 200; i++) setKey(all[(i * 7) % all.length], codes[(i * 3) % codes.length]);
    const used = all.map(keyOf).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe('keys and buttons saved in the browser', () => {
  const store = new Map<string, string>();
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('a swap survives a page reload; a fixed key or the Start button saved by hand is ignored', async () => {
    Object.assign(globalThis, { localStorage: fake });
    store.set('warlock:slotkeys', '0'); // per-action keys: Q W E R D F is on by default and holds those six letters
    vi.resetModules();
    const a = await import('../src/client/keys.ts');
    a.setKey('sheet', 'F2');
    a.setKey('rules', 'KeyQ'); // swaps with Fireball
    a.setPadButton('sheet', BTN.LEFT);
    vi.resetModules();
    const b = await import('../src/client/keys.ts');
    expect([b.keyOf('sheet'), b.keyOf('rules'), b.keyOf('fireball'), b.padButtonOf('sheet')]).toEqual(['F2', 'KeyQ', 'F1', BTN.LEFT]);
    store.set('warlock:keys', JSON.stringify({ shop: 'Escape', taunt: 'KeyP' }));
    store.set('warlock:pad', JSON.stringify({ shop: PAD_START, center: BTN.RIGHT }));
    vi.resetModules();
    const c = await import('../src/client/keys.ts');
    expect([c.keyOf('shop'), c.keyOf('taunt'), c.padButtonOf('shop'), c.padButtonOf('center')]).toEqual(['Digit7', 'KeyP', BTN.DOWN, BTN.RIGHT]);
  });

  it('keeps a D-pad left customized in earlier versions without duplicating the taunt', async () => {
    Object.assign(globalThis, { localStorage: fake });
    store.set('warlock:pad', JSON.stringify({ sheet: BTN.LEFT }));
    vi.resetModules();
    const k = await import('../src/client/keys.ts');
    expect(k.padButtonOf('sheet')).toBe(BTN.LEFT);
    expect(k.padActionAt(BTN.LEFT)).toBe('sheet');
    const assigned = k.PAD_ACTIONS.map(k.padButtonOf);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('a saved key of a spell removed from the game (Twins) is ignored: J stays with Illusion', async () => {
    Object.assign(globalThis, { localStorage: fake });
    store.set('warlock:keys', JSON.stringify({ twin: 'KeyZ', taunt: 'KeyP' }));
    vi.resetModules();
    const k = await import('../src/client/keys.ts');
    expect([k.actionFor('KeyJ'), k.keyOf('rockpillar'), k.keyOf('taunt'), k.whoUses('KeyZ')]).toEqual(['illusion', 'KeyZ', 'KeyP', 'rockpillar']);
  });
});

describe('rebindable controller buttons', () => {
  it('default: A B X Y LB RB spells, LT the Scourge item, L3 sheet, View scoreboard, ↓ shop, R3 camera, ← taunts; Start, ↑ and RT unused', () => {
    expect([BTN.A, BTN.RB, BTN.LT, BTN.RT, BTN.L3, BTN.VIEW, BTN.DOWN, BTN.R3, BTN.START, BTN.UP, BTN.LEFT].map(padActionAt))
      .toEqual(['slot1', 'slot6', 'item', undefined, 'sheet', 'board', 'shop', 'center', undefined, undefined, 'taunt']);
  });

  it('changing a button swaps with whoever used it; Start is refused', () => {
    expect(setPadButton('sheet', BTN.A)).toBe(true);
    expect([padButtonOf('sheet'), padButtonOf('slot1')]).toEqual([BTN.A, BTN.L3]);
    expect(setPadButton('board', PAD_START)).toBe(false);
    expect(padButtonOf('board')).toBe(BTN.VIEW);
    expect(setPadButton('center', BTN.LEFT)).toBe(true); // swaps with taunts
    expect([padActionAt(BTN.LEFT), padActionAt(BTN.R3)]).toEqual(['center', 'taunt']);
  });

  it('the controller casts and the bar shows the labels from the new mapping', () => {
    setSlots(['fireball', 'homing', null, null, null, 'pact']);
    setPadButton('slot1', BTN.RB); // Spell 6 moves to A
    expect([padAction(BTN.RB), padAction(BTN.A)]).toEqual(['fireball', 'pact']);
    setPadMode(true);
    expect([labelOf('fireball'), labelOf('homing'), labelOf('pact')]).toEqual(['RB', 'B', 'A']);
  });
});

describe('help texts with the current keys', () => {
  it('the grimoire (On PC, With a controller, Shop) reads the changed key and button', () => {
    setKey('taunt', 'KeyP');
    setKey('shop', 'Digit7');
    setPadButton('sheet', BTN.LEFT);
    expect(RULES.pc.join(' ')).toContain('P: provocações');
    expect(RULES.loja.join(' ')).toContain('a tecla 7');
    expect(RULES.controle.join(' ')).toContain('←: ficha do mago');
  });
});

describe('an unused Esc opens the settings', () => {
  it('only fires when nobody consumed the Esc (preventDefault), and only for Esc', () => {
    const fns: ((e: { code: string; defaultPrevented: boolean }) => void)[] = [];
    Object.assign(globalThis, { addEventListener: (_t: string, f: (typeof fns)[number]) => fns.push(f) });
    let opened = 0;
    onFreeEsc(() => opened++);
    const fire = (code: string, prevented: boolean) => fns.forEach((f) => f({ code, defaultPrevented: prevented }));
    fire('Escape', true); // a panel was closed first
    fire('KeyQ', false);
    expect(opened).toBe(0);
    fire('Escape', false);
    expect(opened).toBe(1);
  });
});

describe('Q W E R D F mode', () => {
  it('is on for anyone who never touched it; whoever unchecked it stays off (issue #65)', async () => {
    vi.resetModules();
    expect((await import('../src/client/keys.ts')).isSlotMode()).toBe(true);
    vi.resetModules();
    (await import('../src/client/store.ts')).store.set('warlock:slotkeys', '0');
    expect((await import('../src/client/keys.ts')).isSlotMode()).toBe(false);
  });

  it('whoever already has saved keys stays without the mode: a spell on another key and a shortcut on Q keep working', async () => {
    vi.resetModules();
    (await import('../src/client/store.ts')).store.set('warlock:keys', JSON.stringify({ fireball: 'KeyZ', rockpillar: 'KeyQ' }));
    let k = await import('../src/client/keys.ts');
    expect([k.isSlotMode(), k.keyOf('fireball'), k.actionFor('KeyQ')]).toEqual([false, 'KeyZ', 'rockpillar']);
    vi.resetModules();
    (await import('../src/client/store.ts')).store.set('warlock:keys', JSON.stringify({ taunt: 'KeyQ', fireball: 'KeyY' }));
    k = await import('../src/client/keys.ts');
    expect([k.isSlotMode(), k.keyOf('taunt'), k.actionFor('KeyQ')]).toEqual([false, 'KeyQ', undefined]);
    vi.resetModules();
    const s = (await import('../src/client/store.ts')).store;
    s.set('warlock:keys', JSON.stringify({ fireball: 'KeyZ' }));
    s.set('warlock:slotkeys', '1'); // checked by hand: the choice wins
    expect((await import('../src/client/keys.ts')).isSlotMode()).toBe(true);
  });
});
