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

// Começa em cima e segue no sentido horário; o centro neutro evita escolher por tremor do analógico.
export function radialIndex(x: number, y: number, count: number, dead = 0.25): number | null {
  if (count < 1 || Math.hypot(x, y) < dead) return null;
  const turn = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(turn / (Math.PI * 2) * count) % count;
}
