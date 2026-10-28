// Teclas de cada magia e atalho da interface, trocáveis pelo jogador (guardadas no navegador), e os botões do controle.
import { SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { t } from './i18n.ts';
import { isRecord } from './saved-data.ts';
import { store } from './store.ts';

export type Action = SpellId;
export const ACTIONS: Action[] = [...SPELL_IDS];
// atalhos da interface (pedido do Fernando, 18/10): trocáveis no mesmo painel das magias; o Votar começa sem tecla
export const UI_ACTIONS = ['shop', 'board', 'sheet', 'taunt', 'rules', 'library', 'stop', 'vote', 'replay', 'camera', 'basic'] as const;
export type UiAction = (typeof UI_ACTIONS)[number];
export const UI_NAMES: Record<UiAction, string> = { shop: t('Loja só para ver', 'Shop (view only)'), board: t('Placar (segurar)', 'Scoreboard (hold)'), sheet: t('Ficha do mago', 'Wizard sheet'), taunt: t('Provocações', 'Taunts'), rules: t('Grimório (como jogar)', 'Grimoire (how to play)'), library: t('Magias e itens (consulta)', 'Spells and items (lookup)'), stop: t('Parar / Manter base (segurar 0,5 s)', 'Stop / Hold ground (hold 0.5 s)'), basic: t('Atacar', 'Attack'), vote: t('Votar', 'Vote'), replay: t('Rever a queda', 'Replay the fall'), camera: t('Câmera no mago ou na arena', 'Camera on the wizard or the arena') };
export type AnyAction = Action | UiAction | PosAction;
const ALL: AnyAction[] = [...ACTIONS, ...UI_ACTIONS];
const DEFAULTS: Record<string, string> = {
  fireball: 'KeyQ', lightning: 'KeyW', homing: 'KeyE', shield: 'KeyR', teleport: 'KeyF',
  cluster: 'KeyT', swap: 'KeyD', grip: 'KeyG', rush: 'KeyC', meteor: 'KeyV',
  boomerang: 'KeyB', thrust: 'KeyX', gravity: 'KeyH', rockpillar: 'KeyZ', bouncer: '', basic: 'KeyA',
  // as dez últimas: sobraram 9 letras livres; a Zona de dobra fica sem tecla padrão (teclas por posição ou painel de teclas)
  drain: 'KeyN', snowball: 'KeyO', illusion: 'KeyJ', magnetize: 'KeyM', recharge: 'KeyK', alteration: 'KeyL', link: 'KeyU', windwalk: 'KeyI', splitter: 'KeyP', warpzone: '',
  // Flagelo e Pacto ficam nas teclas que tinham como item (viraram magia em 21/10, #217)
  scourge: 'Digit1', pact: 'Digit3', heal: '', geyser: '', closedbody: '', channel: '', sniper: '', pix: '', elemental: '',
  // Shop: Dota's B belongs to Boomerang and all 26 letters are taken; 1 to 4 were position keys from 21/10 to 25/10 (#217), hence 7
  // (5 was already Replay the fall and 6 the camera, #235); sheet: the key left of 1 (' on ABNT2); Grimoire on F1 (H is Gravity) and the library on F2
  shop: 'Digit7', board: 'Tab', sheet: 'Backquote', taunt: 'KeyY', rules: 'F1', library: 'F2', stop: 'KeyS', vote: '', replay: 'Digit5', camera: 'Digit6',
};
// fixas: Esc (cancela, fecha e abre as configurações), Enter, Espaço (segurar arrasta a câmera, soltar centraliza) e ← → (placar e espectador)
export const RESERVED = new Set(['Escape', 'Enter', 'Space', 'ArrowLeft', 'ArrowRight']);
const STORE = 'warlock:keys';

let map: Record<string, string> = { ...DEFAULTS };
const savedKeys = store.json(STORE);
if (isRecord(savedKeys)) for (const a of ALL) {
  const code = savedKeys[a];
  if (typeof code === 'string' && !RESERVED.has(code)) map[a] = code;
}

const listeners: (() => void)[] = [];
const notify = () => listeners.forEach((f) => f());
// trocar uma tecla fixa o modo em uso (teclas por posição ou não): quem personalizou não muda de modo sozinho ao recarregar
const save = () => {
  store.set(STORE, JSON.stringify(map));
  store.set(POS_STORE, JSON.stringify(posMap));
  store.set(SLOT_STORE, slotMode ? '1' : '0');
  notify();
};

// Position keys (as in Dota; Fernando's request, 17/10): spells use the key of their slot on the bar, rebindable (20/10).
// 6 slots in Q W E R D F (Fernando, 25/10, issue #401; undoes the 8 slots in 1 2 3 4 Q W E R of 21/10, #217): A and S stay with
// Attack and Hold ground, fixed on the bottom row of the bar.
export const POS_ACTIONS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6'] as const;
type PosAction = (typeof POS_ACTIONS)[number];
const POS_DEFAULTS: Record<PosAction, string> = { slot1: 'KeyQ', slot2: 'KeyW', slot3: 'KeyE', slot4: 'KeyR', slot5: 'KeyD', slot6: 'KeyF' };
export const isPos = (a: AnyAction): a is PosAction => a in POS_DEFAULTS;
const POS_STORE = 'warlock:poskeys6';
const usable = (code: unknown): code is string => typeof code === 'string' && !!code && !RESERVED.has(code);
let posMap: Record<PosAction, string> = { ...POS_DEFAULTS };
const savedPositions = store.json(POS_STORE);
if (isRecord(savedPositions)) for (const a of POS_ACTIONS) {
  const code = savedPositions[a];
  if (typeof code === 'string' && !RESERVED.has(code)) posMap[a] = code;
}
else posMap = migratePositions(store.json('warlock:poskeys8'));
// One-time migration of the 8-slot layout (Fernando, 25/10, #401): old slots 5 to 8 (the Q W E R row) become new slots 1 to 4,
// the old 1 to 4 (digits) are dropped and D F keep their defaults. A migrated key that clashes with a shortcut (A, S…) or with
// another slot goes back to that slot's default, or stays unbound if the default is taken too. The old entry is never deleted.
function migratePositions(old: unknown): Record<PosAction, string> {
  const next = { ...POS_DEFAULTS };
  if (!isRecord(old)) return next;
  const taken = new Set([...UI_ACTIONS.map((u) => map[u]), next.slot5, next.slot6]);
  const fallback: PosAction[] = [];
  POS_ACTIONS.slice(0, 4).forEach((a, i) => {
    const code = old[`slot${i + 5}`];
    if (usable(code) && !taken.has(code)) { next[a] = code; taken.add(code); } else fallback.push(a);
  });
  for (const a of fallback) taken.has(next[a]) ? (next[a] = '') : taken.add(next[a]);
  store.set(POS_STORE, JSON.stringify(next));
  return next;
}
const SLOT_STORE = 'warlock:slotkeys';
// ligado por padrão (Fernando, 20/10), menos para quem já tem teclas salvas: o modo ignoraria as teclas das magias e prenderia as teclas das posições
let slotMode = (store.get(SLOT_STORE) ?? (store.get(STORE) ? '0' : '1')) === '1';
// atalho salvo antes de 21/10 numa tecla que agora é de posição (a Loja no 4): volta ao padrão, senão a tecla abriria a loja e lançaria a magia;
// sem as teclas por posição nada colide, e o atalho fica onde a pessoa pôs
if (slotMode) for (const u of UI_ACTIONS) if (Object.values(posMap).includes(map[u])) map[u] = DEFAULTS[u];
// Ação nova nunca toma a tecla de uma preferência salva, nem de posições vazias.
if (!(isRecord(savedKeys) && 'basic' in savedKeys) && ((slotMode ? Object.values(posMap).includes(map.basic) : ACTIONS.some((a) => map[a] === map.basic)) || UI_ACTIONS.some((a) => a !== 'basic' && map[a] === map.basic))) map.basic = '';
let slots: (SpellId | null)[] = [];
export const isSlotMode = () => slotMode;
export function setSlotMode(on: boolean) {
  slotMode = on;
  store.set(SLOT_STORE, on ? '1' : '0');
  notify();
}
// magias na ordem da barra (a interface avisa quando muda)
export function setSlots(next: (SpellId | null)[]) {
  if (next.join() === slots.join()) return;
  slots = next;
  if (slotMode || pad) notify();
}
export const slotSpell = (i: number): SpellId | undefined => slots[i] ?? undefined;

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
// Default: A B X Y LB RB in bar order (6 spells since 25/10, #401; LT and RT left free); L3 sheet; View scoreboard; ↓ shop; R3 camera.
// Start fica fora: é o Esc do controle. Índices do mapeamento padrão da Gamepad API (PlayStation nas mesmas posições).
export const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Start', 'L3', 'R3', '↑', '↓', '←', '→'];
const PAD_NAMES_PS = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '↑', '↓', '←', '→'];
export const PAD_START = 9;
// nome do botão nas duas famílias ("A / ✕"); L3, R3 e o D-pad são iguais
export const padButtonName = (b: number, open = ' / ', close = '') => (PAD_NAMES[b] === PAD_NAMES_PS[b] ? PAD_NAMES[b] : PAD_NAMES[b] + open + PAD_NAMES_PS[b] + close);
export const PAD_ACTIONS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'sheet', 'board', 'shop', 'center', 'taunt', 'item'] as const;
export type PadAction = (typeof PAD_ACTIONS)[number];
const PAD_DEFAULTS: Record<PadAction, number> = { slot1: 0, slot2: 1, slot3: 2, slot4: 3, slot5: 4, slot6: 5, sheet: 10, board: 8, shop: 13, center: 11, taunt: 14, item: 6 }; // item: the Scourge on LT, the Item 1 button until 21/10 (26/10, #227)
export const PAD_ACTION_NAMES: Record<PadAction, string> = { slot1: t('Magia 1', 'Spell 1'), slot2: t('Magia 2', 'Spell 2'), slot3: t('Magia 3', 'Spell 3'), slot4: t('Magia 4', 'Spell 4'), slot5: t('Magia 5', 'Spell 5'), slot6: t('Magia 6', 'Spell 6'),
  sheet: t('Ficha do mago', 'Wizard sheet'), board: t('Placar (segurar)', 'Scoreboard (hold)'), shop: t('Loja só para ver', 'Shop (view only)'), center: t('Centralizar a câmera', 'Center the camera'), taunt: t('Provocações', 'Taunts'), item: t('Flagelo (item)', 'Scourge (item)') };
const PAD_STORE = 'warlock:pad';
let padMap: Record<PadAction, number> = { ...PAD_DEFAULTS };
const savedPad = store.json(PAD_STORE);
if (isRecord(savedPad)) for (const a of PAD_ACTIONS) {
  const b = savedPad[a];
  if (typeof b === 'number' && Number.isInteger(b) && b >= 0 && b < PAD_NAMES.length && b !== PAD_START) padMap[a] = b;
}
// Quem já usava ← para outra ação mantém a escolha; a ação nova ocupa um botão ainda livre.
if (PAD_ACTIONS.some((a) => a !== 'taunt' && padMap[a] === padMap.taunt)) {
  padMap.taunt = PAD_NAMES.findIndex((_, b) => b !== PAD_START && !PAD_ACTIONS.some((a) => a !== 'taunt' && padMap[a] === b));
}
if (PAD_ACTIONS.some((a) => a !== 'item' && padMap[a] === padMap.item)) { // same for the Scourge button (26/10, #227)
  padMap.item = PAD_NAMES.findIndex((_, b) => b !== PAD_START && !PAD_ACTIONS.some((a) => a !== 'item' && padMap[a] === b));
}
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
  if (a === 'scourge') return PAD_NAMES[padMap.item]; // an item, outside the positions
  const i = slots.indexOf(a);
  return i < 0 ? '—' : PAD_NAMES[padMap[`slot${i + 1}` as PadAction]];
};

const isUi = (a: AnyAction): a is UiAction => (UI_ACTIONS as readonly string[]).includes(a);
// posição da magia na barra (sem posição: ainda não comprou, ou passou das posições que existem)
const posOf = (a: Action): PosAction | undefined => {
  const i = slots.indexOf(a);
  const p = `slot${i + 1}`;
  return i >= 0 && p in POS_DEFAULTS ? (p as PosAction) : undefined;
};
// the Scourge is an item (26/10, #227): it stays out of the bar positions and keeps its own key in slot mode too
export const keyOf = (a: AnyAction): string => {
  if (isPos(a)) return posMap[a];
  if (!slotMode || isUi(a) || a === 'scourge') return map[a];
  const p = posOf(a);
  return p ? posMap[p] : '';
};
// a tecla apertada é a do atalho da interface? (sem tecla nunca casa)
export const isUiKey = (code: string, a: UiAction) => !!code && map[a] === code;
// só magias: os atalhos da interface nunca lançam nada
export const actionFor = (code: string): Action | undefined => {
  if (!slotMode) return ACTIONS.find((a) => map[a] === code) as Action | undefined;
  if (code && map.scourge === code) return 'scourge';
  const p = code ? POS_ACTIONS.find((q) => posMap[q] === code) : undefined;
  if (!p) return undefined;
  const i = Number(p.slice(4)) - 1;
  return slots[i] ?? undefined;
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

// quem usa a tecla agora: com as teclas por posição, as posições e os atalhos; fora delas, as magias e os atalhos
// in slot mode these keep their own key: the shortcuts and the Scourge (an item, 26/10, #227)
const FREE_KEYED: (Action | UiAction)[] = [...UI_ACTIONS, 'scourge'];
export function whoUses(code: string): AnyAction | undefined {
  if (!code) return undefined;
  if (slotMode) return POS_ACTIONS.find((p) => posMap[p] === code) ?? FREE_KEYED.find((u) => map[u] === code);
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
    const ui = FREE_KEYED.find((u) => map[u] === code);
    if (ui) assign(ui, posMap[a]);
    posMap[a] = code;
  } else {
    const before = map[a];
    assign(a, code);
    const pos = (isUi(a) || a === 'scourge') && POS_ACTIONS.find((p) => posMap[p] === code);
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
