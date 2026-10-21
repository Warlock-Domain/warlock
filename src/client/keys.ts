// Teclas de cada magia, item ativo e atalho da interface, trocáveis pelo jogador (guardadas no navegador), e os botões do controle.
import { ACTIVE_ITEMS, type ItemId } from '../shared/items.ts';
import { SPELL_IDS, isSpell, type SpellId } from '../shared/spells.ts';
import { t } from './i18n.ts';
import { store } from './store.ts';

export type Action = SpellId | ItemId;
export const ACTIONS: Action[] = [...SPELL_IDS, ...ACTIVE_ITEMS];
// atalhos da interface (pedido do Fernando, 18/10): trocáveis no mesmo painel das magias; o Votar começa sem tecla
export const UI_ACTIONS = ['shop', 'board', 'sheet', 'taunt', 'rules', 'library', 'stop', 'vote', 'replay'] as const;
export type UiAction = (typeof UI_ACTIONS)[number];
export const UI_NAMES: Record<UiAction, string> = { shop: t('Loja só para ver', 'Shop (view only)'), board: t('Placar (segurar)', 'Scoreboard (hold)'), sheet: t('Ficha do mago', 'Wizard sheet'), taunt: t('Provocações', 'Taunts'), rules: t('Grimório (como jogar)', 'Grimoire (how to play)'), library: t('Magias e itens (consulta)', 'Spells and items (lookup)'), stop: t('Parar', 'Stop'), vote: t('Votar', 'Vote'), replay: t('Rever a queda', 'Replay the fall') };
export type AnyAction = Action | UiAction | PosAction;
const ALL: AnyAction[] = [...ACTIONS, ...UI_ACTIONS];
const DEFAULTS: Record<string, string> = {
  fireball: 'KeyQ', lightning: 'KeyW', homing: 'KeyE', shield: 'KeyR', teleport: 'KeyF',
  cluster: 'KeyT', swap: 'KeyD', grip: 'KeyG', rush: 'KeyC', meteor: 'KeyV',
  boomerang: 'KeyB', thrust: 'KeyX', gravity: 'KeyH', rockpillar: 'KeyZ', bouncer: 'KeyA',
  // as dez últimas: sobraram 9 letras livres; a Zona de dobra fica sem tecla padrão (modo Q W E R D F ou painel de teclas)
  drain: 'KeyN', snowball: 'KeyO', illusion: 'KeyJ', magnetize: 'KeyM', recharge: 'KeyK', alteration: 'KeyL', link: 'KeyU', windwalk: 'KeyI', splitter: 'KeyP', warpzone: '',
  scourge: 'Digit1', redirector: 'Digit2', pact: 'Digit3',
  // loja: o B do Dota é do Bumerangue e as 26 letras já têm dono, então o 4; ficha: a tecla à esquerda do 1 (' no ABNT2);
  // grimório no F1 (o H é da Gravidade) e a biblioteca de magias e itens no F2
  shop: 'Digit4', board: 'Tab', sheet: 'Backquote', taunt: 'KeyY', rules: 'F1', library: 'F2', stop: 'KeyS', vote: '', replay: 'Digit5',
};
// fixas: Esc (cancela, fecha e abre as configurações), Enter, Espaço (segurar arrasta a câmera, soltar centraliza) e ← → (placar e espectador)
export const RESERVED = new Set(['Escape', 'Enter', 'Space', 'ArrowLeft', 'ArrowRight']);
const STORE = 'warlock:keys';

let map: Record<string, string> = { ...DEFAULTS };
for (const [a, code] of Object.entries(store.json<Record<string, string>>(STORE) ?? {})) if (a in DEFAULTS && typeof code === 'string' && !RESERVED.has(code)) map[a] = code;

const listeners: (() => void)[] = [];
const notify = () => listeners.forEach((f) => f());
// trocar uma tecla fixa o modo em uso (Q W E R D F ou não): quem personalizou não muda de modo sozinho ao recarregar
const save = () => {
  store.set(STORE, JSON.stringify(map));
  store.set(POS_STORE, JSON.stringify(posMap));
  store.set(SLOT_STORE, slotMode ? '1' : '0');
  notify();
};

// modo Q W E R D F (como no Dota; pedido do Fernando, 17/10): as magias e os itens ativos usam a tecla da posição na barra.
// As posições são trocáveis (Fernando, 20/10): Magia 1 a 6 (Q W E R D F) e Item 1 a 3 (1 2 3), com os nomes das do controle.
export const POS_ACTIONS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'item1', 'item2', 'item3'] as const;
export type PosAction = (typeof POS_ACTIONS)[number];
const POS_DEFAULTS: Record<PosAction, string> = { slot1: 'KeyQ', slot2: 'KeyW', slot3: 'KeyE', slot4: 'KeyR', slot5: 'KeyD', slot6: 'KeyF', item1: 'Digit1', item2: 'Digit2', item3: 'Digit3' };
export const isPos = (a: AnyAction): a is PosAction => a in POS_DEFAULTS;
const POS_STORE = 'warlock:poskeys';
let posMap: Record<PosAction, string> = { ...POS_DEFAULTS };
for (const [a, code] of Object.entries(store.json<Record<string, string>>(POS_STORE) ?? {})) if (a in POS_DEFAULTS && typeof code === 'string' && !RESERVED.has(code)) posMap[a as PosAction] = code;
const SLOT_STORE = 'warlock:slotkeys';
// ligado por padrão (Fernando, 20/10), menos para quem já tem teclas salvas: o modo ignoraria as teclas das magias e prenderia Q W E R D F
let slotMode = (store.get(SLOT_STORE) ?? (store.get(STORE) ? '0' : '1')) === '1';
let slots: (SpellId | null)[] = [];
let itemSlots: (ItemId | null)[] = [];
export const isSlotMode = () => slotMode;
export function setSlotMode(on: boolean) {
  slotMode = on;
  store.set(SLOT_STORE, on ? '1' : '0');
  notify();
}
// magias e itens ativos na ordem da barra (a interface avisa quando muda)
export function setSlots(next: (SpellId | null)[], items: (ItemId | null)[] = []) {
  if (next.join() === slots.join() && items.join() === itemSlots.join()) return;
  slots = next;
  itemSlots = items;
  if (slotMode || pad) notify();
}
export const slotSpell = (i: number): SpellId | undefined => slots[i] ?? undefined;
export const slotItem = (i: number): ItemId | undefined => itemSlots[i] ?? undefined;

// jeito de lançar pela tecla no PC (decisão do Fernando, 18/10; os três do Dota), guardado no navegador:
// quick = lança na hora (padrão, como sempre foi); release = segurar mostra o alcance, soltar lança;
// click = a tecla escolhe a magia e mostra o alcance, o clique esquerdo lança (direito ou Esc cancelam)
export const CAST_MODES = ['quick', 'release', 'click'] as const;
export type CastMode = (typeof CAST_MODES)[number];
const CAST_STORE = 'warlock:castmode';
const savedCast = store.get(CAST_STORE);
let castMode: CastMode = (CAST_MODES as readonly string[]).includes(savedCast ?? '') ? (savedCast as CastMode) : 'quick';
export const getCastMode = () => castMode;
export function setCastMode(m: CastMode) {
  castMode = m;
  store.set(CAST_STORE, m);
  notify();
}

// controle (gamepad): botão de cada ação, trocável na aba Controle das configurações (pedido do Fernando, 18/10).
// Padrão: A B X Y LB RB pela ordem da barra; LT, RT e ↑ itens 1 a 3; L3 ficha; View placar; ↓ loja; R3 câmera.
// Start fica fora: é o Esc do controle. Índices do mapeamento padrão da Gamepad API (PlayStation nas mesmas posições).
export const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Start', 'L3', 'R3', '↑', '↓', '←', '→'];
export const PAD_NAMES_PS = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '↑', '↓', '←', '→'];
export const PAD_START = 9;
// nome do botão nas duas famílias ("A / ✕"); L3, R3 e o D-pad são iguais
export const padButtonName = (b: number, open = ' / ', close = '') => (PAD_NAMES[b] === PAD_NAMES_PS[b] ? PAD_NAMES[b] : PAD_NAMES[b] + open + PAD_NAMES_PS[b] + close);
export const PAD_ACTIONS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'item1', 'item2', 'item3', 'sheet', 'board', 'shop', 'center'] as const;
export type PadAction = (typeof PAD_ACTIONS)[number];
const PAD_DEFAULTS: Record<PadAction, number> = { slot1: 0, slot2: 1, slot3: 2, slot4: 3, slot5: 4, slot6: 5, item1: 6, item2: 7, item3: 12, sheet: 10, board: 8, shop: 13, center: 11 };
export const PAD_ACTION_NAMES: Record<PadAction, string> = { slot1: t('Magia 1', 'Spell 1'), slot2: t('Magia 2', 'Spell 2'), slot3: t('Magia 3', 'Spell 3'), slot4: t('Magia 4', 'Spell 4'), slot5: t('Magia 5', 'Spell 5'), slot6: t('Magia 6', 'Spell 6'),
  item1: 'Item 1', item2: 'Item 2', item3: 'Item 3', sheet: t('Ficha do mago', 'Wizard sheet'), board: t('Placar (segurar)', 'Scoreboard (hold)'), shop: t('Loja só para ver', 'Shop (view only)'), center: t('Centralizar a câmera', 'Center the camera') };
const PAD_STORE = 'warlock:pad';
let padMap: Record<PadAction, number> = { ...PAD_DEFAULTS };
for (const [a, b] of Object.entries(store.json<Record<string, number>>(PAD_STORE) ?? {})) if (a in PAD_DEFAULTS && Number.isInteger(b) && b >= 0 && b < PAD_NAMES.length && b !== PAD_START) padMap[a as PadAction] = b;
export const padButtonOf = (a: PadAction) => padMap[a];
export const padActionAt = (btn: number): PadAction | undefined => PAD_ACTIONS.find((a) => padMap[a] === btn);
// troca o botão; quem já usava esse botão fica com o antigo desta ação. Start não entra (é o Esc do controle)
export function setPadButton(a: PadAction, btn: number): boolean {
  if (btn === PAD_START || !(btn >= 0 && btn < PAD_NAMES.length)) return false;
  const other = padActionAt(btn);
  if (other && other !== a) padMap[other] = padMap[a];
  padMap[a] = btn;
  savePad();
  return true;
}
export function resetPad() {
  padMap = { ...PAD_DEFAULTS };
  savePad();
}
function savePad() {
  store.set(PAD_STORE, JSON.stringify(padMap));
  notify();
}

// Com o controle em uso, a barra e a loja mostram os botões; tecla ou mouse de novo voltam às teclas.
let pad = false;
export const isPadMode = () => pad;
export function setPadMode(on: boolean) {
  if (on === pad) return;
  pad = on;
  notify();
}
const padLabel = (a: Action) => {
  const i = isSpell(a) ? slots.indexOf(a) : itemSlots.indexOf(a);
  return i < 0 ? '—' : PAD_NAMES[padMap[`${isSpell(a) ? 'slot' : 'item'}${i + 1}` as PadAction]];
};

const isUi = (a: AnyAction): a is UiAction => (UI_ACTIONS as readonly string[]).includes(a);
// posição da magia ou do item na barra (sem posição: ainda não comprou, ou passou das posições que existem)
const posOf = (a: Action): PosAction | undefined => {
  const i = isSpell(a) ? slots.indexOf(a) : itemSlots.indexOf(a);
  const p = `${isSpell(a) ? 'slot' : 'item'}${i + 1}`;
  return i >= 0 && p in POS_DEFAULTS ? (p as PosAction) : undefined;
};
export const keyOf = (a: AnyAction): string => {
  if (isPos(a)) return posMap[a];
  if (!slotMode || isUi(a)) return map[a];
  const p = posOf(a);
  return p ? posMap[p] : '';
};
// a tecla apertada é a do atalho da interface? (sem tecla nunca casa)
export const isUiKey = (code: string, a: UiAction) => !!code && map[a] === code;
// só magias e itens: os atalhos da interface nunca lançam nada
export const actionFor = (code: string): Action | undefined => {
  if (!slotMode) return ACTIONS.find((a) => map[a] === code) as Action | undefined;
  const p = code ? POS_ACTIONS.find((q) => posMap[q] === code) : undefined;
  if (!p) return undefined;
  const i = Number(p.slice(4)) - 1;
  return (p.startsWith('slot') ? slots[i] : itemSlots[i]) ?? undefined;
};
export const onKeysChange = (f: () => void) => listeners.push(f);

// rótulo curto para mostrar: KeyQ → Q, Digit1 → 1, Numpad4 → Num 4
export function keyLabel(code: string): string {
  if (!code) return '—'; // sem tecla (a Zona de dobra começa assim)
  if (code === 'Backquote') return "'";
  if (code === 'Space') return t('Espaço', 'Space');
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code.replace('Left', '').replace('Right', '');
}
export const labelOf = (a: Action) => (pad ? padLabel(a) : keyLabel(keyOf(a)));
// rótulo do atalho da interface, para dicas e textos de ajuda
export const uiLabel = (a: UiAction) => keyLabel(map[a]);

// quem usa a tecla agora: no modo Q W E R D F, as posições e os atalhos; fora dele, as magias, os itens e os atalhos
export function whoUses(code: string): AnyAction | undefined {
  if (!code) return undefined;
  if (slotMode) return POS_ACTIONS.find((p) => posMap[p] === code) ?? UI_ACTIONS.find((u) => map[u] === code);
  return ALL.find((a) => map[a] === code);
}

// troca a tecla; se outra ação já usava essa tecla, as duas trocam entre si (a interface avisa quem trocou). Recusa as fixas.
// Posições e atalhos nunca repetem tecla: quem perde a tecla fica com a antiga de quem a tomou
const assign = (a: Action | UiAction, code: string) => {
  const other = ALL.find((o) => map[o] === code);
  if (other && other !== a) map[other] = map[a];
  map[a] = code;
};
export function setKey(a: AnyAction, code: string): boolean {
  if (RESERVED.has(code)) return false;
  if (isPos(a)) {
    const other = POS_ACTIONS.find((p) => posMap[p] === code);
    if (other && other !== a) posMap[other] = posMap[a];
    const ui = UI_ACTIONS.find((u) => map[u] === code);
    if (ui) assign(ui, posMap[a]);
    posMap[a] = code;
  } else {
    const before = map[a];
    assign(a, code);
    const pos = isUi(a) && POS_ACTIONS.find((p) => posMap[p] === code);
    if (pos) posMap[pos] = before;
  }
  save();
  return true;
}

export function resetKeys() {
  map = { ...DEFAULTS };
  posMap = { ...POS_DEFAULTS };
  save();
}

// tecla repetida, com Ctrl ou Cmd, ou digitando num campo: os atalhos não respondem
export const typing = (e: KeyboardEvent) => e.repeat || e.ctrlKey || e.metaKey || (e.target as HTMLElement)?.tagName === 'INPUT';

// Esc que ninguém usou: quem cancela ou fecha algo com o Esc chama preventDefault; o que sobra abre as configurações.
// Registrar por último (main.ts), para correr depois dos outros ouvintes do mesmo Esc.
export const onFreeEsc = (f: () => void) => addEventListener('keydown', (e) => e.code === 'Escape' && !e.repeat && !e.defaultPrevented && f());
