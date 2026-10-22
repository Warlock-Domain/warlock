// Ficha do mago: os números de agora (vida, velocidade, empurrão, magias e itens) e de onde vem cada um.
// Sem DOM: a loja e a partida desenham a partir daqui, e a prévia de compra ou venda compara duas fichas.
import { HP_MAX, HP_REGEN, LAVA_DPS, WIZ_SPEED } from '../shared/constants.ts';
import { ITEM_IDS, itemStats, noItems, type ItemId } from '../shared/items.ts';
import { SPELLS, SPELL_IDS, spellLevel, type SpellBook, type SpellId } from '../shared/spells.ts';
import { labelOf } from './keys.ts';
import { n1, pct } from './rules-text.ts';
import { ITEM_ROWS, SPELL_ROWS } from './tips.ts';
import { LOCALE, itemName, spellName, t } from './i18n.ts';

export type SheetRow = { group: string; label: string; value: string; from?: string; key?: string };
export const BASE = t('Mago', 'Wizard');

const n2 = (x: number) => x.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
const signed = (x: number, f: (y: number) => string) => (x < 0 ? '−' : '+') + f(Math.abs(x));

// como mostrar cada campo de itemStats (total e parte de cada item); campo novo sem entrada aparece cru, para nada ficar escondido
const FIELDS: Record<string, [label: string, total: (x: number) => string, part: (x: number) => string]> = {
  hp: [t('Vida máxima', 'Max health'), (x) => n1(HP_MAX + x), (x) => signed(x, n1)],
  regen: [t('Vida por segundo (na pedra)', 'Health per second (on the rock)'), (x) => n2(HP_REGEN + x), (x) => signed(x, n2)],
  speed: [t('Velocidade', 'Speed'), (x) => `${n2(WIZ_SPEED + x)} m/s`, (x) => signed(x, (y) => `${n2(y)} m/s`)],
  kb: [t('Empurrão recebido', 'Knockback taken'), (x) => pct(1 - x), (x) => signed(-x, pct)],
  debuff: [t('Duração de lentidões e penalidades', 'Duration of slows and penalties'), (x) => pct(1 + x), (x) => signed(x, pct)],
  lifesteal: [t('Roubo de vida', 'Lifesteal'), (x) => t(`${pct(x)} do dano causado`, `${pct(x)} of damage dealt`), (x) => signed(x, pct)],
  lava: [t('Dano da lava', 'Lava damage'), (x) => t(`${n1(LAVA_DPS * (1 - x))} por segundo`, `${n1(LAVA_DPS * (1 - x))} per second`), (x) => signed(-x, pct)],
  ward: [t('Dano a menos por golpe', 'Damage reduced per hit'), (x) => t(`${n1(x)} (até metade do golpe)`, `${n1(x)} (up to half the hit)`), (x) => signed(x, n1)],
  range: [t('Alcance das magias', 'Spell range'), (x) => pct(1 + x), (x) => signed(x, pct)],
};

export function sheet(spells: Record<SpellId, number>, items: Record<ItemId, number>, book?: SpellBook): SheetRow[] {
  const st = itemStats(items) as Record<string, number>;
  const rows: SheetRow[] = Object.keys(st).map((k) => {
    const [label, total, part] = FIELDS[k] ?? [k, (x: number) => n2(x), (x: number) => signed(x, n2)];
    // origem: a parte de cada item que mexe neste campo
    const from = ITEM_IDS.filter((i) => items[i] > 0).map((i) => [i, (itemStats({ ...noItems(), [i]: items[i] }) as Record<string, number>)[k]] as const)
      .filter(([, x]) => x).map(([i, x]) => t(`${part(x)} de ${itemName(i)} nível ${items[i]}`, `${part(x)} from ${itemName(i)} level ${items[i]}`)).join(' · ');
    return { key: k, group: BASE, label, value: total(st[k]), from: from || undefined };
  });
  const rangeF = 1 + (st.range ?? 0);
  for (const s of SPELL_IDS) {
    const lvl = spells[s];
    if (!lvl) continue;
    const L = spellLevel(s, lvl, book);
    const shown = { ...L, range: L.range * rangeF }; // o Elmo encurta o alcance de todas as magias
    rows.push({ group: spellName(s), label: t('Nível', 'Level'), value: t(`${lvl} · tecla ${labelOf(s)}`, `${lvl} · key ${labelOf(s)}`) });
    for (const [label, f] of SPELL_ROWS[s]) rows.push({ group: spellName(s), label, value: f(shown) });
  }
  return rows;
}

// o que muda de uma ficha para a outra; "pior" quando o número piora para quem joga
export type Change = { label: string; before: string | null; after: string | null; worse: boolean };
const LOWER_BETTER = /Recarga|Cooldown|Empurrão recebido|Knockback taken|lava|lentidões|slows|Preparo|Wind-?up|Penalidade|Penalt/i;
const num = (s: string | null) => (s === null ? NaN : Number((LOCALE === 'en-US' ? s.replace(/[^\d.-]/g, '') : s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')).replace(/^-$/, '')));
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
