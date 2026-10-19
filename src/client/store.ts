// Preferências guardadas no navegador. localStorage pode falhar (aba anônima, dados bloqueados): cai para a memória e vale só nesta aba.
const memory = new Map<string, string>();

export const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k) ?? memory.get(k) ?? null;
    } catch {
      return memory.get(k) ?? null;
    }
  },
  set(k: string, v: string) {
    memory.set(k, v);
    try {
      localStorage.setItem(k, v);
    } catch {
      // só na memória
    }
  },
  // JSON guardado; ausente ou inválido = null
  json<T>(k: string): T | null {
    try {
      return JSON.parse(store.get(k) ?? 'null') as T;
    } catch {
      return null;
    }
  },
};
