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

// Ordem da roda: permutação de 0..count-1 guardada no navegador. A preferência é só de apresentação (o servidor recebe o índice do
// catálogo); salvo inválido ou de catálogo menor vira a ordem original, e falas novas entram no fim.
export function tauntWheelSlots(saved: unknown, count: number): number[] {
  const slots: number[] = [];
  for (const n of Array.isArray(saved) ? saved : []) if (Number.isInteger(n) && n >= 0 && n < count && !slots.includes(n)) slots.push(n);
  for (let i = 0; i < count; i++) if (!slots.includes(i)) slots.push(i);
  return slots;
}
// Põe a fala na posição; quem estava nela vai para onde a fala estava.
export function assignTauntSlot(slots: number[], position: number, taunt: number): number[] {
  const from = slots.indexOf(taunt);
  if (!Number.isInteger(position) || position < 0 || position >= slots.length || from < 0) return slots;
  const next = [...slots];
  [next[position], next[from]] = [next[from], next[position]];
  return next;
}

// Começa em cima e segue no sentido horário; o centro neutro evita escolher por tremor do analógico.
export function radialIndex(x: number, y: number, count: number, dead = 0.25): number | null {
  if (count < 1 || Math.hypot(x, y) < dead) return null;
  const turn = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(turn / (Math.PI * 2) * count) % count;
}
