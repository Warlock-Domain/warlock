// Peças comuns dos decodificadores de preferências; o JSON só ganha tipo depois de conferido.
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
// As somas do perfil e dos recordes não podem estourar ao participar de contas depois da leitura.
export const isSavedNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

export function readNumberMap(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(isRecord(value) ? value : {}).filter((entry): entry is [string, number] => isSavedNumber(entry[1])));
}

export function readLevels<K extends string>(value: unknown, ids: readonly K[], max: (id: K) => number): Partial<Record<K, number>> {
  const result: Partial<Record<K, number>> = {};
  if (!isRecord(value)) return result;
  for (const id of ids) {
    const n = value[id];
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max(id)) result[id] = n;
  }
  return result;
}
