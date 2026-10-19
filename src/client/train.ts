// Treino: escolher as magias de cada bot (decisão do Fernando, 18/10). Sorteio = o bot compra sozinho, como sempre.
import type { BotSetup } from '../shared/protocol.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELLS, SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { ICON, el, icon } from './icons.ts';
import { store } from './store.ts';

const KEY = 'warlock:botsetup';
// magia que saiu do jogo (o Gêmeos, 19/10) fica de fora: o servidor recusaria o treino inteiro
export const savedBotSetup = (): BotSetup[] =>
  (store.json<BotSetup[]>(KEY) ?? []).map((b) => (b?.spells ? { ...b, spells: Object.fromEntries(Object.entries(b.spells).filter(([id]) => (SPELL_IDS as readonly string[]).includes(id))) } : b));
// algum bot com magias escolhidas; senão o treino vai sem configuração
export const hasBotSetup = (s: BotSetup[]) => s.some((b) => b?.spells);
let open = false; // aberto ou fechado sobrevive ao redesenho da sala

// uma linha por bot: Sorteio ou as magias marcadas (até MAX_SPELLS, a Bola de fogo conta), cada uma com o nível
export function botSetupPanel(n: number, saved: BotSetup[], onChange: (s: BotSetup[]) => void): HTMLElement {
  const setup = Array.from({ length: n }, (_, i): BotSetup => saved[i] ?? {});
  const save = () => {
    store.set(KEY, JSON.stringify(setup));
    onChange(setup);
  };
  const rows = setup.map((_, i) => row(i));
  function row(i: number): HTMLElement {
    const spells = setup[i].spells;
    const picked = SPELL_IDS.filter((s) => (spells?.[s] ?? 0) > 0);
    // nível 0 desmarca; a Bola de fogo vai como 0 quando não marcada (o bot já começaria com ela); sem nenhuma marcada = Sorteio
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
        el('div', { class: 'stats-tabs' }, el('button', { type: 'button', 'aria-pressed': String(!picked.length), class: picked.length ? '' : 'on', onclick: random }, 'Sorteio')),
        el('small', { class: 'muted' }, picked.length ? `${picked.length} de ${MAX_SPELLS} magias` : 'compra sozinho na loja')),
      el('div', { class: 'bs-spells' }, ...SPELL_IDS.map((s) => {
        const lvl = spells?.[s] ?? 0;
        return el('label', { class: 'bs-spell' + (lvl ? ' on' : '') },
          el('input', { type: 'checkbox', checked: lvl > 0, disabled: !lvl && picked.length >= MAX_SPELLS, onchange: () => pick(s, lvl ? 0 : 1, true) }),
          icon(ICON[s]), ' ', SPELLS[s].name,
          lvl ? el('input', { type: 'number', min: 1, max: MAX_SPELL_LEVEL, value: lvl, 'aria-label': `Nível de ${SPELLS[s].name}`, onchange: (e: Event) => {
            const t = e.target as HTMLInputElement;
            t.value = String(Math.max(1, Math.min(MAX_SPELL_LEVEL, Math.round(Number(t.value)) || 1)));
            pick(s, Number(t.value), false);
          } }) : null);
      })));
  }
  return el('details', { class: 'match-opts', open, ontoggle: (e: Event) => (open = (e.target as HTMLDetailsElement).open) },
    el('summary', {}, 'Magias dos bots · ', el('small', { class: 'muted' }, 'Sorteio ou as que você escolher')), ...rows);
}
