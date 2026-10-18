// Teclas de cada magia e item ativo, trocáveis pelo jogador (guardadas no navegador).
import { ACTIVE_ITEMS, type ItemId } from '../shared/items.ts';
import { SPELL_IDS, type SpellId } from '../shared/spells.ts';

export type Action = SpellId | ItemId;
export const ACTIONS: Action[] = [...SPELL_IDS, ...ACTIVE_ITEMS];
const DEFAULTS: Record<string, string> = {
  fireball: 'KeyQ', lightning: 'KeyW', homing: 'KeyE', shield: 'KeyR', teleport: 'KeyF',
  cluster: 'KeyT', swap: 'KeyD', grip: 'KeyG', rush: 'KeyC', meteor: 'KeyV',
  boomerang: 'KeyB', thrust: 'KeyX', gravity: 'KeyH', rockpillar: 'KeyZ', bouncer: 'KeyA',
  // as dez últimas: sobraram 9 letras livres; a Zona de dobra fica sem tecla padrão (modo Q W E R D F ou painel de teclas)
  drain: 'KeyN', snowball: 'KeyO', twin: 'KeyJ', magnetize: 'KeyM', recharge: 'KeyK', alteration: 'KeyL', link: 'KeyU', windwalk: 'KeyI', splitter: 'KeyP', warpzone: '',
  scourge: 'Digit1', redirector: 'Digit2', pact: 'Digit3',
};
// teclas com outra função no jogo: não podem virar atalho de magia
// ficha do mago: a tecla à esquerda do 1 (' no ABNT2, ` no americano); as letras já são todas de magias
export const SHEET_KEY = 'Backquote';
export const RESERVED = new Set(['KeyS', 'Space', 'Escape', 'Tab', 'Enter', 'KeyY', SHEET_KEY]);
const STORE = 'warlock:keys';

let map: Record<string, string> = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, string>;
  for (const [a, code] of Object.entries(saved)) if (a in DEFAULTS && typeof code === 'string' && !RESERVED.has(code)) map[a] = code;
} catch {
  // sem armazenamento: ficam as teclas padrão
}

const listeners: (() => void)[] = [];
const save = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(map));
  } catch {
    // só nesta aba
  }
  listeners.forEach((f) => f());
};

// modo Q W E R D F (como no Dota; pedido do Fernando, 17/10): as magias equipadas, na ordem da barra, usam essas teclas;
// os itens ativos seguem nas teclas deles. Escolha guardada no navegador.
export const SLOT_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF'];
const SLOT_STORE = 'warlock:slotkeys';
let slotMode = false;
try {
  slotMode = localStorage.getItem(SLOT_STORE) === '1';
} catch {
  // sem armazenamento: modo por magia
}
let slots: SpellId[] = [];
const isSpell = (a: Action) => (SPELL_IDS as string[]).includes(a);
export const isSlotMode = () => slotMode;
export function setSlotMode(on: boolean) {
  slotMode = on;
  try {
    localStorage.setItem(SLOT_STORE, on ? '1' : '0');
  } catch {
    // só nesta aba
  }
  listeners.forEach((f) => f());
}
// magias equipadas na ordem da barra (a interface avisa quando muda)
export function setSlots(next: SpellId[]) {
  if (next.join() === slots.join()) return;
  slots = next;
  if (slotMode || pad) listeners.forEach((f) => f());
}
export const slotSpell = (i: number): SpellId | undefined => slots[i];

// controle (gamepad): A B X Y LB RB pela ordem da barra; LT, RT e ↑ para os itens ativos 1 a 3.
// Com o controle em uso, a barra e a loja mostram esses rótulos; tecla ou mouse de novo voltam às teclas.
export const PAD_SLOTS = ['A', 'B', 'X', 'Y', 'LB', 'RB'];
export const PAD_ITEMS = ['LT', 'RT', '↑'];
let pad = false;
export const isPadMode = () => pad;
export function setPadMode(on: boolean) {
  if (on === pad) return;
  pad = on;
  listeners.forEach((f) => f());
}
const padLabel = (a: Action) => (isSpell(a) ? PAD_SLOTS[slots.indexOf(a as SpellId)] : PAD_ITEMS[ACTIVE_ITEMS.indexOf(a as ItemId)]) ?? '—';

export const keyOf = (a: Action) => (slotMode && isSpell(a) ? (SLOT_KEYS[slots.indexOf(a as SpellId)] ?? '') : map[a]);
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
  if (code === SHEET_KEY) return "'";
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code.replace('Left', '').replace('Right', '');
}
export const labelOf = (a: Action) => (pad ? padLabel(a) : keyLabel(keyOf(a)));

// troca a tecla; se outra ação já usava essa tecla, as duas trocam entre si
export function setKey(a: Action, code: string): boolean {
  if (RESERVED.has(code)) return false;
  const other = actionFor(code);
  if (other && other !== a) map[other] = map[a];
  map[a] = code;
  save();
  return true;
}

export function resetKeys() {
  map = { ...DEFAULTS };
  save();
}
