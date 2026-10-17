// Teclas de cada magia e item ativo, trocáveis pelo jogador (guardadas no navegador).
import { ACTIVE_ITEMS, type ItemId } from '../shared/items.ts';
import { SPELL_IDS, type SpellId } from '../shared/spells.ts';

export type Action = SpellId | ItemId;
export const ACTIONS: Action[] = [...SPELL_IDS, ...ACTIVE_ITEMS];
const DEFAULTS: Record<string, string> = {
  fireball: 'KeyQ', lightning: 'KeyW', homing: 'KeyE', shield: 'KeyR', teleport: 'KeyF',
  scourge: 'Digit1', redirector: 'Digit2', pact: 'Digit3',
};
// teclas com outra função no jogo: não podem virar atalho de magia
export const RESERVED = new Set(['KeyS', 'Space', 'Escape', 'Tab', 'Enter']);
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

export const keyOf = (a: Action) => map[a];
export const actionFor = (code: string): Action | undefined => (ACTIONS.find((a) => map[a] === code) as Action | undefined);
export const onKeysChange = (f: () => void) => listeners.push(f);

// rótulo curto para mostrar: KeyQ → Q, Digit1 → 1, Numpad4 → Num 4
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code.replace('Left', '').replace('Right', '');
}
export const labelOf = (a: Action) => keyLabel(map[a]);

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
