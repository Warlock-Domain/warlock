import type { BandCell, Bands } from './balance-types.ts';
export type { Bands } from './balance-types.ts';

export type Agg = {
  n: number;
  wins: number;
  exp: number;
  dmg: number;
  kills: number;
  deaths: number;
  alive: number;
  gold: number;
  by?: Record<string, Bands>;
};

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
  numbers: [
    'seconds',
    'roundsPerMin',
    'matches',
    'rounds',
    'playerRounds',
    'noWinner',
    'stalled',
    'botMatches',
  ],
  objects: [
    'modes',
    'sizes',
    'duration',
    'owned',
    'sources',
    'deathBy',
    'arenaDur',
    'picked',
  ],
} as const satisfies Record<string, readonly (keyof Summary)[]>;
type SummaryField =
  (typeof SUMMARY_FIELD_GROUPS)[keyof typeof SUMMARY_FIELD_GROUPS][number];
const summaryFieldsAreComplete: Exclude<
  keyof Summary,
  SummaryField
> extends never
  ? true
  : never = true;
void summaryFieldsAreComplete;

const AGG_NUMBER_FIELDS = [
  'n',
  'wins',
  'exp',
  'dmg',
  'kills',
  'deaths',
  'alive',
  'gold',
] as const satisfies readonly (keyof Agg)[];
type AggNumberField = (typeof AGG_NUMBER_FIELDS)[number];
const aggFieldsAreComplete: Exclude<
  keyof Agg,
  AggNumberField | 'by'
> extends never
  ? true
  : never = true;
void aggFieldsAreComplete;
const BAND_CELL_NUMBER_FIELDS = [
  'n',
  'w',
  'e',
] as const satisfies readonly (keyof BandCell)[];
type BandCellNumberField = (typeof BAND_CELL_NUMBER_FIELDS)[number];
const bandCellFieldsAreComplete: Exclude<
  keyof BandCell,
  BandCellNumberField
> extends never
  ? true
  : never = true;
void bandCellFieldsAreComplete;

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
  return (
    isRecord(value) &&
    Object.values(value).every(
      (cell) =>
        isRecord(cell) &&
        BAND_CELL_NUMBER_FIELDS.every((key) => isFiniteNumber(cell[key])),
    )
  );
}

function isAgg(value: unknown): value is Agg {
  return (
    isRecord(value) &&
    AGG_NUMBER_FIELDS.every((key) => isFiniteNumber(value[key])) &&
    (value.by === undefined ||
      (isRecord(value.by) && Object.values(value.by).every(isBands)))
  );
}

// Resumos ficam fora do git; valide-os antes de juntar processos ou versões diferentes do simulador.
export function isSummary(value: unknown): value is Summary {
  if (!isRecord(value)) return false;
  const { strings, numbers, objects } = SUMMARY_FIELD_GROUPS;
  const fields = new Set<string>([...strings, ...numbers, ...objects]);
  const duration = value.duration;
  const sources = value.sources;
  const arenaDur = value.arenaDur;
  return (
    Object.keys(value).every((key) => fields.has(key)) &&
    strings.every((key) => typeof value[key] === 'string') &&
    numbers.every((key) => isFiniteNumber(value[key])) &&
    isNumberRecord(value.modes) &&
    isNumberRecord(value.sizes) &&
    isRecord(duration) &&
    isFiniteNumber(duration.sum) &&
    isNumberRecord(duration.by10s) &&
    isRecord(value.owned) &&
    Object.values(value.owned).every(isAgg) &&
    isRecord(sources) &&
    Object.values(sources).every(
      (source) =>
        isRecord(source) &&
        isFiniteNumber(source.fired) &&
        isFiniteNumber(source.landed) &&
        isFiniteNumber(source.dmg),
    ) &&
    isNumberRecord(value.deathBy) &&
    isRecord(arenaDur) &&
    Object.values(arenaDur).every(
      (entry) =>
        isRecord(entry) &&
        isFiniteNumber(entry.rounds) &&
        isFiniteNumber(entry.sum),
    ) &&
    isNumberRecord(value.picked)
  );
}

function mergeValues(
  left: SummaryValue | undefined,
  right: SummaryValue,
): SummaryValue {
  if (typeof right === 'number')
    return (typeof left === 'number' ? left : 0) + right;
  // Sementes diferentes são esperadas ao juntar processos com as mesmas opções.
  if (typeof right === 'string')
    return left === undefined || left === right ? right : `${left}, ${right}`;
  const previous = typeof left === 'object' && left !== null ? left : {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(right)]);
  return Object.fromEntries(
    [...keys].map((key) => [
      key,
      key in right ? mergeValues(previous[key], right[key]) : previous[key],
    ]),
  );
}

export function mergeSummaries(parts: readonly Summary[]): Summary {
  if (!parts.length)
    throw new Error('--merge exige ao menos uma pasta de resumo');
  const [first, ...rest] = parts;
  for (const part of rest) {
    for (const key of ['plan', 'difficulty', 'arena', 'effect'] as const) {
      if (part[key] !== first[key])
        throw new Error(`Não é possível juntar resumos com ${key} diferentes`);
    }
  }

  let merged: SummaryValue = first;
  for (const part of rest) merged = mergeValues(merged, part);
  const result = merged as Summary;
  // tempo real: o do processo mais longo; início: o mais antigo entre as execuções
  result.seconds = Math.max(...parts.map((part) => part.seconds));
  result.startedAt = parts.map((part) => part.startedAt).sort()[0];
  return result;
}
