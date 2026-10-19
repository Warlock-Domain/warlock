// Teclas de cada magia, item ativo e atalho da interface, trocáveis pelo jogador (guardadas no navegador), e os botões do controle.
import { ACTIVE_ITEMS, type ItemId } from '../shared/items.ts';
import { SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { store } from './store.ts';

export type Action = SpellId | ItemId;
export const ACTIONS: Action[] = [...SPELL_IDS, ...ACTIVE_ITEMS];
// atalhos da interface (pedido do Fernando, 18/10): trocáveis no mesmo painel das magias; o Votar começa sem tecla
export const UI_ACTIONS = ['shop', 'board', 'sheet', 'taunt', 'rules', 'stop', 'vote'] as const;
export type UiAction = (typeof UI_ACTIONS)[number];
export const UI_NAMES: Record<UiAction, string> = { shop: 'Loja só para ver', board: 'Placar (segurar)', sheet: 'Ficha do mago', taunt: 'Provocações', rules: 'Grimório (como jogar)', stop: 'Parar', vote: 'Votar' };
export type AnyAction = Action | UiAction;
const ALL: AnyAction[] = [...ACTIONS, ...UI_ACTIONS];
const DEFAULTS: Record<string, string> = {
  fireball: 'KeyQ', lightning: 'KeyW', homing: 'KeyE', shield: 'KeyR', teleport: 'KeyF',
  cluster: 'KeyT', swap: 'KeyD', grip: 'KeyG', rush: 'KeyC', meteor: 'KeyV',
  boomerang: 'KeyB', thrust: 'KeyX', gravity: 'KeyH', rockpillar: 'KeyZ', bouncer: 'KeyA',
  // as dez últimas: sobraram 9 letras livres; a Zona de dobra fica sem tecla padrão (modo Q W E R D F ou painel de teclas)
  drain: 'KeyN', snowball: 'KeyO', twin: 'KeyJ', magnetize: 'KeyM', recharge: 'KeyK', alteration: 'KeyL', link: 'KeyU', windwalk: 'KeyI', splitter: 'KeyP', warpzone: '',
  scourge: 'Digit1', redirector: 'Digit2', pact: 'Digit3',
  // loja: o B do Dota é do Bumerangue e as 26 letras já têm dono, então o 4; ficha: a tecla à esquerda do 1 (' no ABNT2);
  // grimório no F1 (o H é da Gravidade)
  shop: 'Digit4', board: 'Tab', sheet: 'Backquote', taunt: 'KeyY', rules: 'F1', stop: 'KeyS', vote: '',
};
// fixas: Esc (cancela, fecha e abre as configurações), Enter, Espaço (segurar arrasta a câmera, soltar centraliza) e ← → (placar e espectador)
export const RESERVED = new Set(['Escape', 'Enter', 'Space', 'ArrowLeft', 'ArrowRight']);
const STORE = 'warlock:keys';

let map: Record<string, string> = { ...DEFAULTS };
for (const [a, code] of Object.entries(store.json<Record<string, string>>(STORE) ?? {})) if (a in DEFAULTS && typeof code === 'string' && !RESERVED.has(code)) map[a] = code;

const listeners: (() => void)[] = [];
const notify = () => listeners.forEach((f) => f());
const save = () => {
  store.set(STORE, JSON.stringify(map));
  notify();
};

// modo Q W E R D F (como no Dota; pedido do Fernando, 17/10): as magias equipadas, na ordem da barra, usam essas teclas;
// os itens ativos seguem nas teclas deles. Escolha guardada no navegador.
const SLOT_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF'];
const SLOT_STORE = 'warlock:slotkeys';
let slotMode = store.get(SLOT_STORE) === '1';
let slots: SpellId[] = [];
const isSpell = (a: AnyAction) => (SPELL_IDS as readonly string[]).includes(a);
export const isSlotMode = () => slotMode;
export function setSlotMode(on: boolean) {
  slotMode = on;
  store.set(SLOT_STORE, on ? '1' : '0');
  notify();
}
// magias equipadas na ordem da barra (a interface avisa quando muda)
export function setSlots(next: SpellId[]) {
  if (next.join() === slots.join()) return;
  slots = next;
  if (slotMode || pad) notify();
}
export const slotSpell = (i: number): SpellId | undefined => slots[i];

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
export const PAD_ACTIONS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'item1', 'item2', 'item3', 'sheet', 'board', 'shop', 'center'] as const;
export type PadAction = (typeof PAD_ACTIONS)[number];
const PAD_DEFAULTS: Record<PadAction, number> = { slot1: 0, slot2: 1, slot3: 2, slot4: 3, slot5: 4, slot6: 5, item1: 6, item2: 7, item3: 12, sheet: 10, board: 8, shop: 13, center: 11 };
export const PAD_ACTION_NAMES: Record<PadAction, string> = { slot1: 'Magia 1', slot2: 'Magia 2', slot3: 'Magia 3', slot4: 'Magia 4', slot5: 'Magia 5', slot6: 'Magia 6',
  item1: 'Item 1', item2: 'Item 2', item3: 'Item 3', sheet: 'Ficha do mago', board: 'Placar (segurar)', shop: 'Loja só para ver', center: 'Centralizar a câmera' };
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
  const i = isSpell(a) ? slots.indexOf(a as SpellId) : ACTIVE_ITEMS.indexOf(a as ItemId);
  return i < 0 ? '—' : PAD_NAMES[padMap[`${isSpell(a) ? 'slot' : 'item'}${i + 1}` as PadAction]];
};

export const keyOf = (a: AnyAction) => (slotMode && isSpell(a) ? (SLOT_KEYS[slots.indexOf(a as SpellId)] ?? '') : map[a]);
// a tecla apertada é a do atalho da interface? (sem tecla nunca casa)
export const isUiKey = (code: string, a: UiAction) => !!code && map[a] === code;
// só magias e itens: os atalhos da interface nunca lançam nada
export const actionFor = (code: string): Action | undefined => {
  if (!slotMode) return ACTIONS.find((a) => map[a] === code) as Action | undefined;
  const i = SLOT_KEYS.indexOf(code);
  if (i >= 0) return slots[i];
  return ACTIVE_ITEMS.find((a) => map[a] === code);
};
export const onKeysChange = (f: () => void) => listeners.push(f);

// rótulo curto para mostrar: KeyQ → Q, Digit1 → 1, Numpad4 → Num 4
export function keyLabel(code: string): string {
  if (!code) return '—'; // sem tecla (a Zona de dobra começa assim)
  if (code === 'Backquote') return "'";
  if (code === 'Space') return 'Espaço';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code.replace('Left', '').replace('Right', '');
}
export const labelOf = (a: Action) => (pad ? padLabel(a) : keyLabel(keyOf(a)));
// rótulo do atalho da interface, para dicas e textos de ajuda
export const uiLabel = (a: UiAction) => keyLabel(map[a]);

// quem usa a tecla agora; no modo Q W E R D F as seis letras são das posições da barra (magia fora da barra não conta)
export function whoUses(code: string): AnyAction | undefined {
  if (!code) return undefined;
  if (slotMode && SLOT_KEYS.includes(code)) return slots[SLOT_KEYS.indexOf(code)];
  return ALL.find((a) => map[a] === code && !(slotMode && isSpell(a)));
}

// troca a tecla; se outra ação já usava essa tecla, as duas trocam entre si (a interface avisa quem trocou).
// Recusa as fixas e, no modo Q W E R D F, as seis letras das posições para quem não é magia.
export function setKey(a: AnyAction, code: string): boolean {
  if (RESERVED.has(code)) return false;
  if (slotMode && !isSpell(a) && SLOT_KEYS.includes(code)) return false;
  const other = ALL.find((o) => map[o] === code);
  if (other && other !== a) map[other] = map[a];
  map[a] = code;
  save();
  return true;
}

export function resetKeys() {
  map = { ...DEFAULTS };
  save();
}

// Esc que ninguém usou: quem cancela ou fecha algo com o Esc chama preventDefault; o que sobra abre as configurações.
// Registrar por último (main.ts), para correr depois dos outros ouvintes do mesmo Esc.
export const onFreeEsc = (f: () => void) => addEventListener('keydown', (e) => e.code === 'Escape' && !e.repeat && !e.defaultPrevented && f());
