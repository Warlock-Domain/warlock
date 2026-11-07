// Sandbox bot spell selection. Random keeps the bot's existing shop behavior.
// Bot spell selection is only available in the Sandbox; match bots always buy for themselves.
import { BOT_SKILL, type BotSkill } from '../shared/bots.ts';
import { LEGACY_ITEM_MAX, ITEMS, ITEM_IDS } from '../shared/items.ts';
import { MAX_PLAYERS } from '../shared/constants.ts';
import { OPTION_CHOICES } from '../shared/match.ts';
import { isRecord, readLevels } from './saved-data.ts';
import type { BotSetup, SandboxCmd } from '../shared/match.ts';
import { BAR_SPELLS, MAX_SPELLS, spellMax, noSpells, spellCount, type SpellId } from '../shared/spells.ts';
import { ICON, choice, el, icon } from './icons.ts';
import { store } from './store.ts';
import { spellName, t } from './i18n.ts';

// Campos obsoletos ficam de fora; mantém a posição de cada bot mesmo quando o salvo está estragado.
const KEY = 'warlock:sandboxbot';
export function readBotSetup(value: unknown): BotSetup[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_PLAYERS - 1).map((raw: unknown) => {
    if (!isRecord(raw)) return {};
    const bot: BotSetup = {};
    if (isRecord(raw.spells)) {
      const spells = readLevels(raw.spells, BAR_SPELLS, spellMax);
      if (spellCount({ ...noSpells(), ...spells }) <= MAX_SPELLS) bot.spells = spells;
    }
    if (isRecord(raw.items)) bot.items = Object.fromEntries(Object.entries(readLevels(raw.items, ITEM_IDS, id => LEGACY_ITEM_MAX[id])).map(([id, level]) => [id, level ? 1 : 0]));
    const difficulty = OPTION_CHOICES.difficulty.find((d) => d === raw.difficulty);
    if (difficulty) bot.difficulty = difficulty;
    if (isRecord(raw.skill)) {
      const skill: Partial<BotSkill> = {};
      for (const key of Object.keys(BOT_SKILL.normal) as (keyof BotSkill)[]) {
        const n = raw.skill[key];
        if (typeof n !== 'number' || !Number.isFinite(n)) continue;
        skill[key] = Math.min(Math.max(...Object.values(BOT_SKILL).map((s) => s[key])), Math.max(key === 'rate' ? BOT_SKILL.easy.rate : 0, n));
      }
      bot.skill = skill;
    }
    return bot;
  });
}
export const savedBotSetup = (): BotSetup[] => readBotSetup(store.json(KEY));
// sandbox nova: você e um boneco parado; torreta só pelo painel (o tiro dela enchia de som ao abrir, Fernando, 21/10)
export const SANDBOX_START: SandboxCmd[] = [{ op: 'bot', dummy: true }];
let open = false; // Expanded state survives the room redraw.

// One row per bot: random or a chosen spell loadout (up to MAX_SPELLS, including Fireball), with each spell's level.
export function botSetupPanel(n: number, saved: BotSetup[], onChange: (s: BotSetup[]) => void): HTMLElement {
  const setup = Array.from({ length: n }, (_, i): BotSetup => saved[i] ?? {});
  const save = () => {
    store.set(KEY, JSON.stringify(setup));
    onChange(setup);
  };
  const rows = setup.map((_, i) => row(i));
  function row(i: number): HTMLElement {
    const spells = setup[i].spells;
    const picked = BAR_SPELLS.filter((s) => (spells?.[s] ?? 0) > 0);
    // Level 0 unchecks a spell; no selected spells means Random, and the bot still starts with Fireball by default.
    const pick = (s: SpellId, lvl: number, redraw: boolean) => {
      const next = Object.fromEntries(Object.entries({ fireball: 0, ...setup[i].spells, [s]: lvl }).filter(([k, l]) => l || k === 'fireball'));
      setup[i] = Object.values(next).some((l) => l) ? { spells: next } : {};
      save();
      if (redraw) rows[i].replaceWith((rows[i] = row(i)));
    };
    const random = () => {
      setup[i] = {};
      save();
      rows[i].replaceWith((rows[i] = row(i)));
    };
    return el('div', { class: 'opt-row bot-setup' },
      el('div', { class: 'opt-label' }, el('b', {}, `Bot ${i + 1}`),
        choice(t(`Seleção de magias do bot ${i + 1}`, `Bot ${i + 1} spell selection`), [['random', t('Sorteio', 'Random')]], picked.length ? 'custom' : 'random', random),
        el('small', { class: 'muted' }, picked.length ? t(`${picked.length} de ${MAX_SPELLS} magias`, `${picked.length} of ${MAX_SPELLS} spells`) : t('compra sozinho na loja', 'buys on its own in the shop'))),
      el('div', { class: 'bs-spells' }, ...BAR_SPELLS.map((s) => {
        const lvl = spells?.[s] ?? 0;
        return el('label', { class: 'bs-spell' + (lvl ? ' on' : '') },
          el('input', { type: 'checkbox', checked: lvl > 0, disabled: !lvl && picked.length >= MAX_SPELLS, onchange: () => pick(s, lvl ? 0 : 1, true) }),
          icon(ICON[s]), ' ', spellName(s),
          lvl ? el('input', { type: 'number', min: 1, max: spellMax(s), value: lvl, 'aria-label': t(`Nível de ${spellName(s)}`, `${spellName(s)} level`), onchange: (e: Event) => {
            const t = e.target as HTMLInputElement;
            t.value = String(Math.max(1, Math.min(spellMax(s), Math.round(Number(t.value)) || 1)));
            pick(s, Number(t.value), false);
          } }) : null);
      })));
  }
  return el('details', { class: 'match-opts', open, ontoggle: (e: Event) => (open = (e.target as HTMLDetailsElement).open) },
    el('summary', {}, t('Magias dos bots · ', 'Bot spells · '), el('small', { class: 'muted' }, t('Sorteio ou as que você escolher', 'Random or the ones you pick'))), ...rows);
}
