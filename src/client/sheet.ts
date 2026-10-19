// Ficha do mago: os números de agora (vida, velocidade, empurrão, magias e itens) e de onde vem cada um.
// Sem DOM: a loja e a partida desenham a partir daqui, e a prévia de compra ou venda compara duas fichas.
import { HP_MAX, HP_REGEN, LAVA_DPS, WIZ_SPEED } from '../shared/constants.ts';
import { ACTIVE_ITEMS, ITEM_IDS, itemStats, noItems, type ItemId } from '../shared/items.ts';
import { SPELLS, SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { labelOf } from './keys.ts';
import { n1, pct } from './rules-text.ts';
import { ITEM_ROWS, SPELL_ROWS } from './tips.ts';
import { LOCALE, itemName, spellName } from './i18n.ts';

export type SheetRow = { group: string; label: string; value: string; from?: string };
export const BASE = 'Mago';

const n2 = (x: number) => x.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
const signed = (x: number, f: (y: number) => string) => (x < 0 ? '−' : '+') + f(Math.abs(x));

// como mostrar cada campo de itemStats (total e parte de cada item); campo novo sem entrada aparece cru, para nada ficar escondido
const FIELDS: Record<string, [label: string, total: (x: number) => string, part: (x: number) => string]> = {
  hp: ['Vida máxima', (x) => n1(HP_MAX + x), (x) => signed(x, n1)],
  regen: ['Vida por segundo (na pedra)', (x) => n2(HP_REGEN + x), (x) => signed(x, n2)],
  speed: ['Velocidade', (x) => `${n2(WIZ_SPEED + x)} m/s`, (x) => signed(x, (y) => `${n2(y)} m/s`)],
  kb: ['Empurrão recebido', (x) => pct(1 - x), (x) => signed(-x, pct)],
  debuff: ['Duração de lentidões e penalidades', (x) => pct(1 + x), (x) => signed(x, pct)],
  lifesteal: ['Roubo de vida', (x) => `${pct(x)} do dano causado`, (x) => signed(x, pct)],
  lava: ['Dano da lava', (x) => `${n1(LAVA_DPS * (1 - x))} por segundo`, (x) => signed(-x, pct)],
  ward: ['Dano a menos por golpe', (x) => `${n1(x)} (até metade do golpe)`, (x) => signed(x, n1)],
  range: ['Alcance das magias', (x) => pct(1 + x), (x) => signed(x, pct)],
};

export function sheet(spells: Record<SpellId, number>, items: Record<ItemId, number>): SheetRow[] {
  const st = itemStats(items) as Record<string, number>;
  const rows: SheetRow[] = Object.keys(st).map((k) => {
    const [label, total, part] = FIELDS[k] ?? [k, (x: number) => n2(x), (x: number) => signed(x, n2)];
    // origem: a parte de cada item que mexe neste campo
    const from = ITEM_IDS.filter((i) => items[i] > 0).map((i) => [i, (itemStats({ ...noItems(), [i]: items[i] }) as Record<string, number>)[k]] as const)
      .filter(([, x]) => x).map(([i, x]) => `${part(x)} de ${itemName(i)} nível ${items[i]}`).join(' · ');
    return { group: BASE, label, value: total(st[k]), from: from || undefined };
  });
  const rangeF = 1 + (st.range ?? 0);
  for (const s of SPELL_IDS) {
    const lvl = spells[s];
    if (!lvl) continue;
    const L = SPELLS[s].levels[lvl - 1];
    const shown = { ...L, range: L.range * rangeF }; // o Elmo encurta o alcance de todas as magias
    rows.push({ group: spellName(s), label: 'Nível', value: `${lvl} · tecla ${labelOf(s)}` });
    for (const [label, f] of SPELL_ROWS[s]) rows.push({ group: spellName(s), label, value: f(shown) });
  }
  for (const i of ACTIVE_ITEMS) {
    const lvl = items[i];
    if (!lvl) continue;
    rows.push({ group: itemName(i), label: 'Nível', value: `${lvl} · tecla ${labelOf(i)}` });
    for (const [label, value] of ITEM_ROWS[i]?.(lvl - 1) ?? []) rows.push({ group: itemName(i), label, value });
  }
  return rows;
}

// o que muda de uma ficha para a outra; "pior" quando o número piora para quem joga
export type Change = { label: string; before: string | null; after: string | null; worse: boolean };
const LOWER_BETTER = /Recarga|Empurrão recebido|lava|lentidões|Preparo|Penalidade/i;
const num = (s: string | null) => (s === null ? NaN : Number(s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.').replace(/^-$/, '')));
export function diff(before: SheetRow[], after: SheetRow[]): Change[] {
  const key = (r: SheetRow) => r.group + '|' + r.label;
  const a = new Map(after.map((r) => [key(r), r]));
  const b = new Map(before.map((r) => [key(r), r]));
  const keys = [...new Set([...b.keys(), ...a.keys()])];
  return keys.flatMap((k) => {
    const x = b.get(k)?.value ?? null, y = a.get(k)?.value ?? null;
    if (x === y) return [];
    const r = (a.get(k) ?? b.get(k))!;
    const d = num(y) - num(x);
    const worse = y === null || (!Number.isNaN(d) && (LOWER_BETTER.test(r.label) ? d > 0 : d < 0));
    return [{ label: r.group === BASE ? r.label : `${r.group} · ${r.label}`, before: x, after: y, worse }];
  });
}
