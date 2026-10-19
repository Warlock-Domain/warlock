// Idioma do jogo (pedido do Fernando, 19/10): português ou inglês. Lido uma vez ao carregar; trocar grava e recarrega a página.
// Texto curto: t('pt', 'en') no ponto de uso. Nomes de magias, itens, personagens, provocações e arenas: o campo `en` ao lado do pt em src/shared.
import { ARENA_EN, ARENA_NAMES, type ArenaId } from '../shared/arena.ts';
import { ITEMS, type ItemId } from '../shared/items.ts';
import { SPELLS, type SpellId } from '../shared/spells.ts';
import { store } from './store.ts';

export type Lang = 'pt' | 'en';
export const LANG_KEY = 'warlock:lang';

// escolha salva vale; sem ela, navegador em português (pt, pt-BR, pt-PT) abre em português e o resto em inglês
export const pickLang = (saved: string | null, nav: string | undefined): Lang =>
  saved === 'pt' || saved === 'en' ? saved : /^pt\b/i.test(nav ?? '') ? 'pt' : 'en';

export const LANG: Lang = pickLang(store.get(LANG_KEY), typeof navigator === 'undefined' ? undefined : navigator.language);
// números: vírgula decimal em português, ponto em inglês
export const LOCALE = LANG === 'en' ? 'en-US' : 'pt-BR';
if (typeof document !== 'undefined') document.documentElement.lang = LOCALE;

export const t = (pt: string, en: string) => (LANG === 'en' ? en : pt);

export function setLang(l: Lang) {
  if (l === LANG) return;
  store.set(LANG_KEY, l);
  location.reload();
}

export const spellName = (id: SpellId) => t(SPELLS[id].name, SPELLS[id].en);
export const itemName = (id: ItemId) => t(ITEMS[id].name, ITEMS[id].en);
export const itemText = (id: ItemId) => t(ITEMS[id].text, ITEMS[id].textEn);
export const arenaName = (id: ArenaId) => t(ARENA_NAMES[id], ARENA_EN[id]);
