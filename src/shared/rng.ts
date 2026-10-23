// Sorteio com semente (mulberry32): o simulador de balanceamento e a noite da Campanha (mesma semente, mesma noite).
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// sorteio próprio de cada pedaço da noite, sem estado: a sala pode hibernar e voltar no meio sem perder a sequência
export const nightRand = (seed: number, stage: number, clearing: number) =>
  mulberry32(seed ^ Math.imul(stage + 1, 0x9e3779b1) ^ Math.imul(clearing + 1, 0x85ebca6b));
