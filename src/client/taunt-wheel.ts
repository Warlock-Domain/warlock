import { TAUNTS } from '../shared/taunts.ts';

export const TAUNT_WHEEL_SIZE = 8;

// Guarda a tecla física: repetição, perda de foco e confirmação por outro meio não podem reenviar a fala.
export function radialHold() {
  let held: string | null = null;
  return {
    active: () => held !== null,
    press: (code: string) => { if (held !== null) return false; held = code; return true; },
    release: (code: string) => { if (held !== code) return false; held = null; return true; },
    cancel: () => { held = null; },
  };
}
// Preferência só de apresentação: os índices originais continuam sendo enviados ao servidor.
export function tauntWheelSlots(saved: unknown, allowed = TAUNTS.map((_, i) => i)): number[] {
  const slots: number[] = [];
  for (let i = 0; i < TAUNT_WHEEL_SIZE; i++) {
    const n = Array.isArray(saved) ? saved[i] : undefined;
    slots.push(Number.isInteger(n) && allowed.includes(n) && !slots.includes(n)
      ? n : allowed.find((j) => !slots.includes(j))!);
  }
  return slots;
}
export function assignTauntSlot(slots: number[], position: number, taunt: number): number[] {
  if (!Number.isInteger(position) || position < 0 || position >= TAUNT_WHEEL_SIZE || !Number.isInteger(taunt) || taunt < 0 || taunt >= TAUNTS.length) return slots;
  const next = tauntWheelSlots(slots), other = next.indexOf(taunt);
  if (other >= 0) next[other] = next[position];
  next[position] = taunt;
  return next;
}

// Começa em cima e segue no sentido horário; o centro neutro evita escolher por tremor do analógico.
export function radialIndex(x: number, y: number, count: number, dead = 0.25): number | null {
  if (count < 1 || Math.hypot(x, y) < dead) return null;
  const turn = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(turn / (Math.PI * 2) * count) % count;
}
