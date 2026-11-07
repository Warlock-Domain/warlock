import { afterEach, describe, expect, it, vi } from 'vitest';
import { attackAim } from '../src/client/screen-data.ts';
import type { InputHandlers } from '../src/client/input.ts';
import { setKey } from '../src/client/keys.ts';
import { BASIC_ATTACK } from '../src/shared/constants.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { attackTarget, sniperTarget } from '../src/shared/sniper-target.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v, type Vec } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

const me = { id: 'me', pos: v(0, 0), alive: true, team: 0 };
const near = { id: 'near', pos: v(3, 0), alive: true, team: 1 };
const far = { id: 'far', pos: v(5, 2), alive: true, team: 1 };
const ally = { id: 'ally', pos: v(1, 0), alive: true, team: 0 };
const units = [me, near, far, ally];

describe('target lock preview', () => {
  it('Attack marks the hovered body, else the body at the cursor, and nobody on empty ground', () => {
    expect(attackTarget(units, me, v(0, 9), 6, 'far')?.id).toBe('far');
    expect(attackTarget(units, me, v(5, 2.3), 6)?.id).toBe('far');
    expect(attackTarget(units, me, v(0, 9), 6)).toBeUndefined();
    expect(attackTarget(units, me, v(1, 0), 6, 'ally')).toBeUndefined();
    expect(attackTarget(units, me, v(0, 9), 2, 'far')).toBeUndefined();
  });
  it('Inelegant Solution takes the hovered enemy even when the ground point misses its body', () => {
    expect(sniperTarget(units, me, v(5, 4), 20)).toBeUndefined();
    expect(sniperTarget(units, me, v(5, 4), 20, 'far')?.id).toBe('far');
    expect(sniperTarget(units, me, v(5, 4), 20, 'ally')).toBeUndefined();
  });
});

describe('Attack aim on a model under the mouse', () => {
  // The floor point under a chest click falls about a metre behind the body (1.9 m model, 42 degree camera).
  const wiz = (id: string, x: number, y: number, team: number | null = 1, status = 0) => ({ id, pos: v(x, y), alive: true, team, status });
  const copy = (ownerIndex: number, x: number, y: number) => ({ kind: 'illusion', pos: v(x, y), vel: v(ownerIndex, 0) });
  const floor = v(5, 3);
  const wizards = [wiz('me', 0, 0, 0), wiz('foe', 5, 2), wiz('ally', 1, 0, 0), wiz('veiled', 2, 2, 1, 2048)];
  const ids = wizards.map((z) => z.id);

  it('aims at the enemy body, or keeps the clicked point for anything else', () => {
    expect(attackAim(wizards, [], ids, 'me', floor, 'foe')).toEqual(v(5, 2));
    for (const other of [undefined, 'ally', 'me', 'veiled', 'gone']) expect(attackAim(wizards, [], ids, 'me', floor, other), String(other)).toEqual(floor);
  });
  it('finds an Illusion copy through its owner, without taking the own or an allied copy', () => {
    const copies = [copy(1, 4, -1), copy(0, 2, 0), copy(2, 3, 3)];
    expect(attackAim(wizards, copies, ids, 'me', floor, 'foe~ilusao')).toEqual(v(4, -1));
    expect(attackAim(wizards, copies, ids, 'me', floor, 'me~ilusao')).toEqual(floor);
    expect(attackAim(wizards, copies, ids, 'me', floor, 'ally~ilusao')).toEqual(floor);
    // Free-for-all has no team to tell the own copy apart.
    expect(attackAim(wizards.map((z) => ({ ...z, team: null })), copies, ids, 'me', floor, 'me~ilusao')).toEqual(floor);
  });

  const arena = (x: number) => {
    const w = world([[0, 0], [x, 0]], noSpells(), [], () => .5);
    w.pillars = []; w.runes = []; w.shrinkAt = Infinity;
    w.wizards.forEach((z) => z.regen = 0);
    return w;
  };
  const clickChest = (x: number, behind: Vec) => {
    const w = arena(x);
    const at = attackAim(w.wizards.map((z) => ({ ...z, status: 0, team: z.id === 'p0' ? 0 : 1 })), [], ['p0', 'p1'], 'p0', behind, 'p1');
    stepWorld(w, [{ id: 'p0', kind: 'basic', at }], () => .5);
    return w;
  };
  it('a chest click on a close enemy is melee even though the floor point is too far from the body', () => {
    const w = clickChest(1, v(1, 1));
    expect(w.wizards[0].basicCasting?.melee).toBe(true);
    run(w, BASIC_ATTACK.windup + .05);
    expect(w.wizards[1].hp).toBe(1000 - BASIC_ATTACK.dmg);
    expect(w.projectiles).toHaveLength(0);
  });
  it('a chest click on a distant enemy sends the projectile at the body', () => {
    const w = clickChest(5, v(5, 1.06));
    expect(w.wizards[0].basicCasting?.melee).toBe(false);
    run(w, BASIC_ATTACK.windup + 1);
    expect(w.wizards[1].hp).toBe(1000 - BASIC_ATTACK.dmg);
  });
});

describe('Attack click wiring', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('an armed click reports the model under the mouse, which also feeds the lock ring', async () => {
    type Fn = (e: Record<string, unknown>) => void;
    const win = new Map<string, Fn[]>(), canvas = new Map<string, Fn[]>();
    const listen = (m: Map<string, Fn[]>) => (n: string, f: Fn) => m.set(n, [...(m.get(n) ?? []), f]);
    const send = (m: Map<string, Fn[]>, n: string, d: Record<string, unknown>) => m.get(n)?.forEach((f) => f({ preventDefault() {}, target: { tagName: 'CANVAS' }, ...d }));
    vi.stubGlobal('addEventListener', listen(win)); vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 600);
    const { createInput } = await import('../src/client/input.ts');
    const basic = vi.fn();
    const h: InputHandlers = { pick: () => v(3, 0), pickAttack: () => 'foe', basic, move() {}, stop() {}, cast: () => false, center() {}, zoom() {}, pan() {}, armedChanged() {}, preview() {}, padRange() {}, me: () => v(0, 0), aim() {} };
    const input = createInput({ addEventListener: listen(canvas) } as unknown as HTMLCanvasElement, h);
    input.setEnabled(true); setKey('basic', 'KeyA');
    send(win, 'keydown', { code: 'KeyA', repeat: false }); send(win, 'keyup', { code: 'KeyA' });
    expect(input.hovered()).toBe('foe');
    send(canvas, 'pointerdown', { button: 0, clientX: 3, clientY: 0, pointerType: 'mouse' });
    expect(basic).toHaveBeenCalledWith(v(3, 0), 'foe');
    input.setEnabled(false);
  });
  it('the game hands the model pick to the input', async () => {
    const { readFileSync } = await import('node:fs' as string) as { readFileSync(path: URL, encoding: 'utf8'): string };
    // main.ts does not load in Node; without this handler hovered() is always empty and the Inelegant Solution ring vanishes over a model's upper body.
    expect(readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8')).toContain('pickAttack: (x, y) => scene.pickMage(x, y)');
  });
});
