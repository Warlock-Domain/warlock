// Partes puras da roda de provocações (sem DOM), testadas em tests/radial-picker.test.ts.

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

// O catálogo pode crescer sem aumentar a roda: oito escolhas mantêm as direções legíveis e iguais às do teste local.
export const TAUNT_WHEEL_SIZE = 8;
// Preferência só de apresentação: migra a roda antiga mantendo as primeiras oito escolhas válidas, sem mudar índices do servidor.
export function tauntWheelSlots(saved: unknown, count: number): number[] {
  const slots: number[] = [];
  const size = Math.min(TAUNT_WHEEL_SIZE, count);
  for (const n of Array.isArray(saved) ? saved : []) {
    if (slots.length >= size) break;
    if (Number.isInteger(n) && n >= 0 && n < count && !slots.includes(n)) slots.push(n);
  }
  for (let i = 0; i < count && slots.length < size; i++) if (!slots.includes(i)) slots.push(i);
  return slots;
}
// Troca falas já equipadas; uma fala fora da roda substitui só a posição escolhida, sem criar uma nona vaga.
export function assignTauntSlot(slots: number[], position: number, taunt: number, count = slots.length): number[] {
  if (!Number.isInteger(position) || position < 0 || position >= slots.length || position >= TAUNT_WHEEL_SIZE || !Number.isInteger(taunt) || taunt < 0 || taunt >= count) return slots;
  const from = slots.indexOf(taunt);
  const next = [...slots];
  if (from >= 0) next[from] = next[position];
  next[position] = taunt;
  return next;
}

// Começa em cima e segue no sentido horário; o centro neutro evita escolher por tremor do analógico.
export function radialIndex(x: number, y: number, count: number, dead = 0.25): number | null {
  if (count < 1 || Math.hypot(x, y) < dead) return null;
  const turn = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(turn / (Math.PI * 2) * count) % count;
}
