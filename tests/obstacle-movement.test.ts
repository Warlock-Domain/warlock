import { describe, expect, it } from 'vitest';
import { createPredict } from '../src/client/predict.ts';
import { OBSTACLE_KINDS, OBSTACLES, WALL_GAP, WIZ_R } from '../src/shared/constants.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { BLOCKED_MOVE_BIT, HOLDING_MOVE_BIT, WALKING_BIT, decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

describe('clique único bloqueado por objeto estático', () => {
  it.each(OBSTACLE_KINDS)('primeiro contato oblíquo cancela o clique em %s, sem contornar', (kind) => {
    for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI * .75, Math.PI, Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75]) {
      for (const offset of [-.75, 0, .75]) {
        const w = world([[2 * Math.cos(angle), 2 * Math.sin(angle)]], noSpells(), [], () => .5);
        w.pillars = [{ pos: v(0, 0), kind, alive: true, hp: OBSTACLES[kind].hp }];
        const z = w.wizards[0];
        const side = offset * OBSTACLES[kind].r;
        stepWorld(w, [{ id: z.id, kind: 'move', to: v(-Math.sin(angle) * side, Math.cos(angle) * side) }], () => .5);
        let touched = false;
        for (let step = 0; step < 240; step++) {
          stepWorld(w, [], () => .5);
          if (Math.hypot(z.pos.x, z.pos.y) <= OBSTACLES[kind].r + WIZ_R + 1e-8) {
            touched = true;
            expect(z.target, `${kind}/${angle}/${offset}`).toBeNull();
            expect(z.blockedMove).toBe(true);
            const at = { ...z.pos };
            run(w, 1);
            expect(z.pos.x).toBeCloseTo(at.x, 10);
            expect(z.pos.y).toBeCloseTo(at.y, 10);
            break;
          }
        }
        expect(touched).toBe(true);
      }
    }
  });
  it('parede de três partes cancela clique também nas extremidades', () => {
    for (const side of [-1, 0, 1]) {
      const w = world([[-2, side * WALL_GAP + .2]], noSpells(), [], () => .5);
      w.pillars = [0, -1, 1].map((i) => ({ pos: v(0, i * WALL_GAP), kind: 'rockpillar', alive: true, hp: 200, wall: 0 }));
      run(w, 3, [{ id: 'p0', kind: 'move', to: v(0, side * WALL_GAP + .2) }]);
      expect(w.wizards[0].target).toBeNull();
      expect(w.wizards[0].blockedMove).toBe(true);
    }
  });
  it.each(OBSTACLE_KINDS)('direito mantido continua tentando contra %s; soltar encerra', (kind) => {
    const w = world([[-2, .2]], noSpells(), [], () => .5);
    w.pillars = [{ pos: v(0, 0), kind, alive: true, hp: OBSTACLES[kind].hp }];
    run(w, 3, [{ id: 'p0', kind: 'move', to: v(0, .1), held: true }]);
    expect(w.wizards[0].target).not.toBeNull();
    expect(w.wizards[0].blockedMove).not.toBe(true);
    stepWorld(w, [{ id: 'p0', kind: 'moveHold', on: false }], () => .5);
    expect(w.wizards[0].target).toBeNull();
  });
  it.each(['dead', 'expired', 'clear'] as const)('não cancela caminho livre: %s', (mode) => {
    const w = world([[-2, 0]], noSpells(), [], () => .5);
    w.pillars = [{ pos: v(0, mode === 'clear' ? 2 : 0), kind: 'pillar', alive: mode !== 'dead', hp: 200, until: mode === 'expired' ? 0 : undefined }];
    run(w, 2, [{ id: 'p0', kind: 'move', to: v(3, 0) }]);
    expect(w.wizards[0].pos.x).toBeGreaterThan(0);
    expect(w.wizards[0].target).not.toBeNull();
    expect(w.wizards[0].blockedMove).toBe(false);
  });
  it('colisão causada por empurrão não apaga o destino guardado', () => {
    const w = world([[-1.21, 0]], noSpells(), [], () => .5);
    w.pillars = [{ pos: v(0, 0), kind: 'rock', alive: true, hp: Infinity }];
    w.wizards[0].vel = v(4, 0);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(-3, 2) }], () => .5);
    expect(w.wizards[0].target).toEqual(v(-3, 2));
    expect(w.wizards[0].blockedMove).toBe(false);
  });
  it.each(['rock', 'pillar'] as const)('cancela destino e caminhada ao parar contra %s', (kind) => {
    const w = world([[-2, 0]], noSpells(), [], () => .5);
    w.pillars = [{ pos: v(0, 0), kind, alive: true, hp: 1000 }];
    run(w, 3, [{ id: 'p0', kind: 'move', to: v(0, 0) }]);
    const z = w.wizards[0], at = { ...z.pos };
    expect(z.target).toBeNull();
    expect(z.blockedMove).toBe(true);
    expect(encodeSnap(w, z.id, 0, []).w[6] & WALKING_BIT).toBe(0);
    run(w, .5);
    expect(z.pos).toEqual(at);
    stepWorld(w, [{ id: z.id, kind: 'move', to: v(-2, 2) }], () => .5);
    expect(z.blockedMove).toBe(false);
    expect(z.pos.y).toBeGreaterThan(0);
  });
  it('segurar conserva tentativa e pose; soltar cancela só se continuar bloqueado', () => {
    const w = world([[-2, 0]], noSpells(), [], () => .5);
    w.pillars = [{ pos: v(0, 0), kind: 'rock', alive: true, hp: Infinity }];
    run(w, 3, [{ id: 'p0', kind: 'move', to: v(0, 0), held: true }]);
    expect(w.wizards[0].target).toEqual(v(0, 0));
    const bits = encodeSnap(w, 'p0', 0, []).w[6];
    expect(bits & HOLDING_MOVE_BIT).toBe(HOLDING_MOVE_BIT);
    expect(bits & WALKING_BIT).toBe(WALKING_BIT);
    stepWorld(w, [{ id: 'p0', kind: 'moveHold', on: false }], () => .5);
    expect(w.wizards[0].target).toBeNull();
  });
  it('previsão também apaga o destino cancelado, sem continuar contra o obstáculo', () => {
    const w = world([[-2, 0]], noSpells(), [], () => .5);
    const p = createPredict();
    const snap = () => decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0']).wizards[0];
    p.frame(snap(), 0); p.setSpeed(2); p.move(v(0, 0));
    w.wizards[0].blockedMove = true;
    const s = snap();
    expect(s.status & BLOCKED_MOVE_BIT).toBe(BLOCKED_MOVE_BIT);
    for (let i = 0; i < 60; i++) expect(p.frame(s, 1 / 60)).toEqual(v(-2, 0));
  });
  it('protocolo valida botão mantido e soltura sem aceitar tipos inválidos', () => {
    const p = (m: object) => parseClientMessage(JSON.stringify(m));
    expect(p({ t: 'move', x: 0, y: 1, seq: 1, held: true })).toEqual({ t: 'move', x: 0, y: 1, seq: 1, held: true });
    expect(p({ t: 'moveHold', on: false, seq: 2 })).toEqual({ t: 'moveHold', on: false, seq: 2 });
    expect(p({ t: 'move', x: 0, y: 1, seq: 1, held: 'true' })).toBeNull();
    expect(p({ t: 'moveHold', on: 0, seq: 2 })).toBeNull();
    expect(p({ t: 'moveHold', on: false, seq: -1 })).toBeNull();
  });
});
