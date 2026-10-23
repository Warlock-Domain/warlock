import { ARENA_IDS } from '../shared/arena.ts';
import { isCharacter } from '../shared/characters.ts';
import { MODES, OPTION_CHOICES } from '../shared/match.ts';
import { RUNE_KINDS, ROUND_EFFECT_IDS } from '../shared/constants.ts';
import { ITEM_IDS } from '../shared/items.ts';
import type { PublicPlayer, PublicRoom, RoomInfo, ServerMsg, Snap } from '../shared/protocol.ts';
import { SPELL_IDS, isSpell } from '../shared/spells.ts';
import type { SimEvent } from '../shared/sim.ts';

type Obj = Record<string, unknown>;
const object = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const integer = (x: unknown): x is number => Number.isSafeInteger(x);
const string = (x: unknown): x is string => typeof x === 'string';
const nullableString = (x: unknown): x is string | null => x === null || string(x);
const numericArray = (x: unknown): x is number[] => Array.isArray(x) && x.every(finite);
const stringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every(string);
const numberMap = (x: unknown) => object(x) && Object.values(x).every(finite);
const vector = (x: unknown) => object(x) && finite(x.x) && finite(x.y);
const phase = (x: unknown) => ['lobby', 'shop', 'countdown', 'playing', 'roundEnd', 'end'].includes(String(x));
const mode = (x: unknown) => (MODES as readonly unknown[]).includes(x);
const card = (x: unknown): boolean => object(x) && (x.kind === 'spell' ? isSpell(x.id) : x.kind === 'up' ? isSpell(x.id) && (x.rare === undefined || x.rare === true) : x.kind === 'item' && ITEM_IDS.some((id) => id === x.id));
const stat = (x: unknown) => object(x) && ['gold', 'dmg', 'kills', 'deaths', 'alive', 'threats', 'struck', 'shieldable', 'shielded', 'reactSum', 'reactN', 'nearSum', 'nearN'].every((k) => finite(x[k])) && numberMap(x.dmgBy) && numberMap(x.fired) && numberMap(x.landed) && numberMap(x.deathBy);
const stats = (x: unknown) => object(x) && stat(x.round) && stat(x.match) && stat(x.room);

function player(x: unknown): x is PublicPlayer {
  if (!object(x) || !string(x.id) || !string(x.name) || typeof x.bot !== 'boolean' || !integer(x.color) || !isCharacter(x.character) || !string(x.look) || !finite(x.score) || !finite(x.gold)) return false;
  if (!object(x.spells) || !Object.entries(x.spells).every(([id, n]) => isSpell(id) && integer(n)) || !object(x.items) || !Object.entries(x.items).every(([id, n]) => ITEM_IDS.some((item) => item === id) && integer(n)) || !stats(x.stats)) return false;
  if (!stringArray(x.bought) || !object(x.held) || !Object.values(x.held).every((levels) => Array.isArray(levels) && levels.every(integer))) return false;
  if (typeof x.ready !== 'boolean' || typeof x.connected !== 'boolean' || (x.team !== null && !integer(x.team))) return false;
  if (x.difficulty !== undefined && !['easy', 'casual', 'normal', 'veteran', 'hard', 'auto'].includes(String(x.difficulty))) return false;
  if (x.dummy !== undefined && x.dummy !== true || x.turret !== undefined && x.turret !== true || x.watch !== undefined && x.watch !== true) return false;
  if (x.hpMax !== undefined && !finite(x.hpMax)) return false;
  if (x.servo !== undefined && !['ash', 'archer', 'watcher', 'hound', 'odran'].includes(String(x.servo))) return false;
  if (x.asc !== undefined) {
    const a = x.asc;
    if (!object(a) || !integer(a.xp) || !integer(a.level) || !integer(a.next) || !Array.isArray(a.todo) || !a.todo.every((k) => ['spell', 'up', 'item'].includes(String(k))) || !Array.isArray(a.offer) || !a.offer.every((row) => Array.isArray(row) && row.every(card)) || !Array.isArray(a.pick) || !a.pick.every((pick) => pick === null || object(pick) && integer(pick.i) && (pick.swap === undefined || isSpell(pick.swap))) || !integer(a.rerolls) || !Array.isArray(a.auto) || !a.auto.every(card)) return false;
  }
  return true;
}

function validOpts(x: unknown, partial = false) {
  if (!object(x)) return false;
  const entries = Object.entries(x);
  if (!partial && entries.length !== Object.keys(OPTION_CHOICES).length) return false;
  return entries.every(([key, value]) => Object.entries(OPTION_CHOICES).some(([known, choices]) => known === key && choices.some((choice) => choice === value)));
}

function room(x: unknown): x is PublicRoom {
  if (!object(x) || !string(x.id) || !phase(x.phase) || !mode(x.mode) || !integer(x.round) || !finite(x.phaseLeft) || !Array.isArray(x.players) || !x.players.every(player) || !stringArray(x.ids)) return false;
  if (!nullableString(x.winner) || !nullableString(x.lastRoundWinner) || !(x.pendingMode === null || mode(x.pendingMode)) || typeof x.teamShuffle !== 'boolean' || !(x.pendingShuffle === null || typeof x.pendingShuffle === 'boolean') || !(x.winnerTeam === null || integer(x.winnerTeam))) return false;
  if (!validOpts(x.opts) || !validOpts(x.pendingOpts, true) || !integer(x.botDelta) || !integer(x.goal) || !(x.arena === null || (ARENA_IDS as readonly unknown[]).includes(x.arena)) || !(x.effect === null || (ROUND_EFFECT_IDS as readonly unknown[]).includes(x.effect))) return false;
  if (x.vote !== null && (!object(x.vote) || !['mode', 'kick', 'shuffle', 'opt', 'restart', 'end', 'addBot', 'removeBot', 'skipShop'].includes(String(x.vote.kind)) || !string(x.vote.target) || !string(x.vote.by) || !stringArray(x.vote.yes) || !stringArray(x.vote.no) || !finite(x.vote.left) || !integer(x.vote.need))) return false;
  if (x.sandbox !== undefined) {
    const sandbox = x.sandbox;
    if (!object(sandbox) || !['god', 'noCd', 'shrink'].every((k) => typeof sandbox[k] === 'boolean')) return false;
  }
  if (x.night !== undefined && (!object(x.night) || !integer(x.night.stage) || !integer(x.night.seed) || !(x.night.fight === null || integer(x.night.fight)) || !integer(x.night.wave) || !integer(x.night.waves) || !Array.isArray(x.night.done) || !x.night.done.every(integer) || !(x.night.result === null || ['won', 'lost'].includes(String(x.night.result))))) return false;
  if (x.lobby !== undefined) {
    const lobby = x.lobby;
    if (!object(lobby) || !nullableString(lobby.owner) || !Array.isArray(lobby.bots) || !lobby.bots.every((d) => ['easy', 'casual', 'normal', 'veteran', 'hard', 'auto'].includes(String(d))) || !validOpts(lobby.opts, true)) return false;
  }
  return true;
}

const fields = (x: Obj, required: string[], optional: string[] = []) => required.every((k) => numericArray(x[k])) && optional.every((k) => x[k] === undefined || numericArray(x[k]));
function event(x: unknown): x is SimEvent {
  if (!object(x) || !string(x.k)) return false;
  const id = (key = 'id') => string(x[key]);
  const num = (...keys: string[]) => keys.every((key) => finite(x[key]));
  switch (x.k) {
    case 'sudden': return true;
    case 'cast': return id() && isSpell(x.spell);
    case 'hit': return id() && id('by') && num('x', 'y', 'dmg') && string(x.src) && (x.crit === undefined || x.crit === true);
    case 'reflect': case 'grip': case 'scourge': case 'loot': return id() && num('x', 'y') && (x.k !== 'scourge' || num('r'));
    case 'lightning': return vector(x.from) && vector(x.to);
    case 'teleport': return id() && vector(x.from) && vector(x.to);
    case 'vines': return num('x', 'y', 'r');
    case 'death': return id() && nullableString(x.by) && string(x.src);
    case 'gold': return id() && integer(x.n) && num('x', 'y');
    case 'shrink': return num('r');
    case 'aegis': case 'runeTake': return id() && (x.k !== 'runeTake' || (RUNE_KINDS as readonly unknown[]).includes(x.kind));
    case 'fall': return id() && num('x', 'y');
    case 'rune': return (RUNE_KINDS as readonly unknown[]).includes(x.kind) && num('x', 'y');
    case 'boss': return id() && ['aim', 'stun', 'phase2', 'start', 'down'].includes(String(x.what)) && num('x', 'y') && (x.tx === undefined || finite(x.tx)) && (x.ty === undefined || finite(x.ty));
    case 'ember': return id() && ['lit', 'out'].includes(String(x.what)) && num('x', 'y');
    case 'streak': return id() && ['multi', 'spree', 'breaker'].includes(String(x.kind)) && integer(x.n) && (x.victim === undefined || string(x.victim));
    case 'clash': return num('x', 'y', 'r') && ['fire', 'arcane', 'pulse', 'detonate', 'pillar', 'snow'].includes(String(x.combo));
    case 'pillar': return integer(x.i) && num('x', 'y');
    case 'chest': return num('x', 'y');
    case 'fire': case 'land': return id() && isSpell(x.src);
    default: return false;
  }
}

function snap(x: Obj): x is Obj & Snap {
  if (!finite(x.time) || !finite(x.r) || !finite(x.s) || !finite(x.sp) || !integer(x.ack) || !fields(x, ['w', 'p', 'cd', 'pl'], ['rs', 'ch', 'lp', 'em', 'ru', 'ab', 'zn', 'il', 'fx'])) return false;
  const count = (x.w as number[]).length / 7;
  if (!Number.isInteger(count) || (x.p as number[]).length % 6 || (x.pl as number[]).length % 4 || (x.cd as number[]).length !== SPELL_IDS.length) return false;
  if (['rs', 'lp', 'em', 'ab'].some((k) => x[k] !== undefined && (x[k] as number[]).length !== count) || ['ch', 'ru', 'fx'].some((k) => x[k] !== undefined && (x[k] as number[]).length % 3 && k !== 'fx') || (x.zn !== undefined && (x.zn as number[]).length % 5) || (x.il !== undefined && (x.il as number[]).length % 3) || (x.fx !== undefined && (x.fx as number[]).length % 2)) return false;
  return x.e === undefined || Array.isArray(x.e) && x.e.every(event);
}

export type LobbyMessage = { t: 'rooms'; rooms: RoomInfo[] };
export function parseLobbyMessage(x: unknown): LobbyMessage | null {
  if (!object(x) || x.t !== 'rooms' || !Array.isArray(x.rooms)) return null;
  const rooms = x.rooms;
  if (!rooms.every((r) => object(r) && string(r.id) && integer(r.players) && r.players >= 0 && string(r.phase) && (r.mode === undefined || string(r.mode)) && (r.round === undefined || integer(r.round)) && (r.bots === undefined || integer(r.bots)))) return null;
  return x as LobbyMessage; // Campos e limites foram validados; não copia a lista enviada pelo servidor.
}

export function parseServerMessage(x: unknown): ServerMsg | null {
  if (!object(x)) return null;
  if (x.t === 'room' && room(x.room) && string(x.you)) return x as unknown as ServerMsg; // `room` valida o estado público sem reconstruir arrays a cada atualização.
  if (x.t === 'snap' && snap(x)) return x as unknown as ServerMsg; // Mantém os vetores compactos do snapshot sem cópia a 30 Hz.
  if (x.t === 'taunt' && string(x.id) && integer(x.i) && x.i >= 0 && x.i < 64) return x as unknown as ServerMsg;
  if (x.t === 'error' && ['not_found', 'other_tab', 'full', 'bad_msg', 'kicked'].includes(String(x.code)) && string(x.msg)) return x as unknown as ServerMsg;
  return null;
}

export function decodeMessage<T>(raw: unknown, parse: (value: unknown) => T | null): T | null {
  if (typeof raw !== 'string' || raw.length > 1_000_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return parse(value);
  } catch {
    return null;
  }
}
