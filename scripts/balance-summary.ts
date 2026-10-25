export type BandCell = { n: number; w: number; e: number };
export type Bands = Record<string, BandCell>;
export type Agg = { n: number; wins: number; exp: number; dmg: number; kills: number; deaths: number; alive: number; gold: number; by?: Record<string, Bands> };

export type Summary = {
  seed: string;
  plan: string;
  difficulty: string;
  arena: string;
  effect: string;
  startedAt: string;
  seconds: number;
  roundsPerMin: number;
  matches: number;
  rounds: number;
  playerRounds: number;
  noWinner: number;
  stalled: number;
  modes: Record<string, number>;
  sizes: Record<string, number>;
  duration: { sum: number; by10s: Record<string, number> };
  owned: Record<string, Agg>;
  sources: Record<string, { fired: number; landed: number; dmg: number }>;
  deathBy: Record<string, number>;
  arenaDur: Record<string, { rounds: number; sum: number }>;
  botMatches: number;
  picked: Record<string, number>;
};

type SummaryValue = string | number | { [key: string]: SummaryValue };
const SUMMARY_FIELD_GROUPS = {
  strings: ['seed', 'plan', 'difficulty', 'arena', 'effect', 'startedAt'],
  numbers: ['seconds', 'roundsPerMin', 'matches', 'rounds', 'playerRounds', 'noWinner', 'stalled', 'botMatches'],
  objects: ['modes', 'sizes', 'duration', 'owned', 'sources', 'deathBy', 'arenaDur', 'picked'],
} as const satisfies Record<string, readonly (keyof Summary)[]>;
type SummaryField = (typeof SUMMARY_FIELD_GROUPS)[keyof typeof SUMMARY_FIELD_GROUPS][number];
const summaryFieldsAreComplete: Exclude<keyof Summary, SummaryField> extends never ? true : never = true;
void summaryFieldsAreComplete;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isFiniteNumber);
}

function isBands(value: unknown): value is Bands {
  return isRecord(value) && Object.values(value).every((cell) =>
    isRecord(cell) && isFiniteNumber(cell.n) && isFiniteNumber(cell.w) && isFiniteNumber(cell.e));
}

function isAgg(value: unknown): value is Agg {
  return isRecord(value)
    && ['n', 'wins', 'exp', 'dmg', 'kills', 'deaths', 'alive', 'gold'].every((key) => isFiniteNumber(value[key]))
    && (value.by === undefined || (isRecord(value.by) && Object.values(value.by).every(isBands)));
}

// Summary files live outside git; validate them before combining measurements from different runs.
export function isSummary(value: unknown): value is Summary {
  if (!isRecord(value)) return false;
  const { strings, numbers, objects } = SUMMARY_FIELD_GROUPS;
  const fields = new Set<string>([...strings, ...numbers, ...objects]);
  const duration = value.duration;
  const sources = value.sources;
  const arenaDur = value.arenaDur;
  return Object.keys(value).every((key) => fields.has(key))
    && strings.every((key) => typeof value[key] === 'string')
    && numbers.every((key) => isFiniteNumber(value[key]))
    && isNumberRecord(value.modes)
    && isNumberRecord(value.sizes)
    && isRecord(duration) && isFiniteNumber(duration.sum) && isNumberRecord(duration.by10s)
    && isRecord(value.owned) && Object.values(value.owned).every(isAgg)
    && isRecord(sources) && Object.values(sources).every((source) =>
      isRecord(source) && isFiniteNumber(source.fired) && isFiniteNumber(source.landed) && isFiniteNumber(source.dmg))
    && isNumberRecord(value.deathBy)
    && isRecord(arenaDur) && Object.values(arenaDur).every((entry) =>
      isRecord(entry) && isFiniteNumber(entry.rounds) && isFiniteNumber(entry.sum))
    && isNumberRecord(value.picked);
}

function mergeValues(left: SummaryValue | undefined, right: SummaryValue): SummaryValue {
  if (typeof right === 'number') return (typeof left === 'number' ? left : 0) + right;
  // Different seeds are expected when merging runs with the same settings.
  if (typeof right === 'string') return left === undefined || left === right ? right : `${left}, ${right}`;
  const previous = typeof left === 'object' && left !== null ? left : {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(right)]);
  return Object.fromEntries([...keys].map((key) => [key, key in right
    ? mergeValues(previous[key], right[key])
    : previous[key]]));
}

export function mergeSummaries(parts: readonly Summary[]): Summary {
  if (!parts.length) throw new Error('--merge exige ao menos uma pasta de resumo');
  const [first, ...rest] = parts;
  for (const part of rest) {
    for (const key of ['plan', 'difficulty', 'arena', 'effect'] as const) {
      if (part[key] !== first[key]) throw new Error(`Não é possível juntar resumos com ${key} diferentes`);
    }
  }

  let merged: SummaryValue = first;
  for (const part of rest) merged = mergeValues(merged, part);
  // Wall-clock time uses the longest run; start time uses the earliest run.
  return {
    ...(merged as Summary),
    seconds: Math.max(...parts.map((part) => part.seconds)),
    startedAt: parts.map((part) => part.startedAt).sort()[0],
  };
}
