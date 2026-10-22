import { describe, expect, it } from 'vitest';
import { createPredict } from '../src/client/predict.ts';
import { DT, WIZ_SPEED } from '../src/shared/constants.ts';
import { isSliding, moveWizard, type Wizard } from '../src/shared/sim.ts';
import type { WizView } from '../src/shared/snapshot.ts';
import { v } from '../src/shared/vec.ts';

const snapshot = (x = 0, speed = 1): WizView => ({ id: 'p', pos: v(x, 0), vel: v(speed, 0), hp: 1000, facing: 0, alive: true, shield: false, status: 1 });

describe('previsão no fim do empurrão', () => {
  it('acompanha o impulso fraco em vez de esperar uma correção de posição', () => {
    const p = createPredict();
    expect(p.frame(snapshot(), .1).x).toBeCloseTo(.1, 8);
  });

  it('não reaplica a velocidade do mesmo snapshot a cada quadro nem altera o snapshot', () => {
    const p = createPredict(), s = snapshot();
    const model = { pos: v(0, 0), vel: v(1, 0), target: null } as Wizard;
    for (let i = 0; i < 6; i++) {
      moveWizard(model, 1 / 120);
      expect(p.frame(s, 1 / 120).x).toBeCloseTo(model.pos.x, 8);
    }
    expect(s.pos).toEqual(v(0, 0));
    expect(s.vel).toEqual(v(1, 0));
  });

  it('usa o novo impulso recebido sem somá-lo novamente ao anterior', () => {
    const p = createPredict();
    const before = p.frame(snapshot(), .05).x;
    expect(p.frame(snapshot(before, -1), .05).x).toBeCloseTo(before - .05, 8);
  });

  it('andar e parar não apagam o empurrão que o servidor ainda aplica', () => {
    const p = createPredict(), s = snapshot();
    p.frame(s, 0);
    p.setSpeed(WIZ_SPEED);
    p.move(v(0, 5));
    const walking = { ...p.frame(s, DT) };
    expect(walking.x).toBeGreaterThan(0);
    expect(walking.y).toBeGreaterThan(0);
    p.stop();
    const stopped = p.frame(s, DT);
    expect(stopped.y).toBeCloseTo(walking.y, 8);
    expect(stopped.x).toBeGreaterThan(walking.x);
  });

  it('Teleporte usa a posição nova e conserva o impulso informado pelo servidor', () => {
    const p = createPredict();
    p.frame(snapshot(), DT);
    p.teleported(v(5, 0));
    expect(p.frame(snapshot(5, .8), .1).x).toBeCloseTo(5.08, 8);
  });

  it('renascer e resetar não reaproveitam o impulso da vida anterior', () => {
    const p = createPredict();
    const s = snapshot();
    p.frame(s, DT);
    p.frame({ ...snapshot(2, 0), alive: false }, DT);
    expect(p.frame(snapshot(9, 0), DT).x).toBe(9);
    p.reset();
    expect(p.frame(s, .1).x).toBeCloseTo(.1, 8);
  });

  it('novo empurrão forte volta a acompanhar o servidor, sem somar caminhada prevista', () => {
    const p = createPredict();
    const before = p.frame(snapshot(), .1).x;
    p.move(v(10, 0));
    expect(p.frame(snapshot(1, 5), .1).x).toBeCloseTo(before + (1 - before) * .35, 8);
  });

  it.each([30, 60, 144])('não alterna paradas e saltos após liberar a caminhada (%s FPS, snapshots 30Hz)', (fps) => {
    const server = { id: 'p', pos: v(0, 0), vel: v(4.529, 0), target: v(0, 20), speed: WIZ_SPEED } as Wizard;
    const view = () => ({ ...snapshot(server.pos.x, server.vel.x), pos: { ...server.pos }, recoveryLeft: server.recoveryLeft });
    const p = createPredict();
    let latest = view(), tick = 0, before = 0, checked = 0;
    p.frame(latest, 0);
    p.setSpeed(WIZ_SPEED);
    p.move(v(0, 20));
    for (let frame = 1; frame <= fps * 4; frame++) {
      const time = frame / fps;
      while ((tick + 1) * DT <= time + 1e-9) {
        moveWizard(server, DT);
        if (++tick % 2 === 0) latest = view();
      }
      const position = p.frame(latest, 1 / fps);
      const shown = position.y;
      if (!isSliding(latest) && (server.recoveryLeft ?? 0) > 0) {
        expect(shown - before).toBeGreaterThan(0);
        expect(Math.abs(server.pos.y - shown)).toBeLessThan(.25);
        expect(Math.abs(position.x - server.pos.x)).toBeLessThan(.03); // destino diagonal legítimo também reduz x durante a caminhada.
        checked++;
      }
      before = shown;
    }
    expect(checked).toBeGreaterThan(fps * .8);
  });
});
