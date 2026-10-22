import { describe, expect, it } from 'vitest';
import { assignTauntSlot, radialHold, radialIndex, tauntWheelSlots } from '../src/client/taunt-wheel.ts';

describe('seletor radial', () => {
  it('segura a tecla e confirma somente uma vez ao soltá-la, ignorando repetição e outras teclas', () => {
    const hold = radialHold();
    expect(hold.press('KeyY')).toBe(true);
    expect(hold.press('KeyY')).toBe(false);
    expect(hold.active()).toBe(true);
    expect(hold.release('KeyQ')).toBe(false);
    expect(hold.active()).toBe(true);
    expect(hold.release('KeyY')).toBe(true);
    expect(hold.active()).toBe(false);
    expect(hold.release('KeyY')).toBe(false);
  });
  it('cancelar impede envio ao soltar e respeita um atalho remapeado', () => {
    const hold = radialHold();
    hold.press('KeyP');
    expect(hold.release('KeyY')).toBe(false);
    hold.cancel();
    expect(hold.release('KeyP')).toBe(false);
    expect(hold.press('KeyP')).toBe(true);
    expect(hold.release('KeyP')).toBe(true);
  });
  it('configura oito posições únicas e troca as falas que já estavam equipadas', () => {
    const slots = tauntWheelSlots(null);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(assignTauntSlot(slots, 0, 7)).toEqual([7, 1, 2, 3, 4, 5, 6, 0]);
    expect(assignTauntSlot(slots, 3, 9)).toEqual([0, 1, 2, 9, 4, 5, 6, 7]);
    expect(assignTauntSlot(slots, 8, 2)).toBe(slots);
    expect(assignTauntSlot(slots, 1, 100)).toBe(slots);
  });
  it('recupera preferências inválidas sem repetir ou enviar índice fora do catálogo', () => {
    expect(tauntWheelSlots([9, 9, -1, '2', 80])).toEqual([9, 0, 1, 2, 3, 4, 5, 6]);
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      expect(radialIndex(Math.sin(angle), -Math.cos(angle), 8)).toBe(i);
    }
  });
  it('começa em cima e seleciona todos os dez setores no sentido horário', () => {
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * Math.PI * 2;
      expect(radialIndex(Math.sin(angle), -Math.cos(angle), 10)).toBe(i);
    }
  });
  it('mantém o centro neutro e recusa catálogo vazio', () => {
    expect(radialIndex(0, 0, 10)).toBeNull();
    expect(radialIndex(0.1, -0.1, 10)).toBeNull();
    expect(radialIndex(1, 0, 0)).toBeNull();
  });
  it('volta ao primeiro setor ao cruzar o norte sem índices negativos', () => {
    expect(radialIndex(-0.01, -1, 10)).toBe(0);
    expect(radialIndex(0.01, -1, 10)).toBe(0);
    expect(radialIndex(-1, 0, 8)).toBe(6);
    expect(radialIndex(0, 1, 8)).toBe(4);
  });
});
