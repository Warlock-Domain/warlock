import { SOUND_PICKS } from './sound-picks.ts';
import { SPELL_IDS, isSpell, spellLevel, type SpellId } from './spells.ts';

// Forum sound lab (issue #366, docs/plans/2026-10-25-forum-sound-lab-design.md): per spell, a cast and an impact sound effect.
export const SOUND_MOMENTS = ['cast', 'hit'] as const;
export type SoundMoment = (typeof SOUND_MOMENTS)[number];
// Impact only for spells that deal damage at level 1: the others never raise a `hit` with damage of their own
export const HIT_SPELLS: readonly SpellId[] = SPELL_IDS.filter((id) => spellLevel(id, 1).dmg > 0);
export const hasMoment = (spell: SpellId, moment: SoundMoment) => moment === 'cast' || HIT_SPELLS.includes(spell);

// 'game' = the sound the game plays today; 'pack:<path>' = a file of the converted assets/sons-rpg pack in R2;
// 'up:<id>.<ext>' = a member upload in R2
export const GAME_SOUND = 'game';
export const SOUND_UPLOAD_MAX_BYTES = 1024 * 1024;
export const SOUND_UPLOAD_MAX_S = 5;
export const SOUND_UPLOADS_PER_PERSON = 30;
// all uploads together: on PR environments every "sign in as tester" is a new person, so the per-person cap alone has no ceiling
export const SOUND_UPLOADS_TOTAL = 300;
export const SOUND_COMMENT_MAX = 1000;
export const UPLOAD_TYPES = { 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav' } as const;

const PACK_SRC = /^pack:[\w-]+(\/[\w-]+){0,6}$/;
const UPLOAD_SRC = /^up:[\w-]{22}\.(mp3|ogg|wav)$/;
export const isSoundSrc = (s: unknown): s is string => typeof s === 'string' && (s === GAME_SOUND || PACK_SRC.test(s) || UPLOAD_SRC.test(s));
// R2 key of a src: the pack is converted to mp3, uploads keep their own extension
export const soundKey = (src: string) => (src.startsWith('pack:') ? `pack/${src.slice(5)}.mp3` : `up/${src.slice(3)}`);
export const isSoundKey = (key: string) => /^pack\/[\w-]+(\/[\w-]+){0,6}\.mp3$/.test(key) || /^up\/[\w-]{22}\.(mp3|ogg|wav)$/.test(key) || key === 'pack/index.json';

export type SoundCandidate = { spell: SpellId; moment: SoundMoment; src: string; by: string; at: number };
export type SoundComment = { id: number; spell: SpellId; name: string; avatar: string; text: string; at: number };
// tally only for the pairs I voted on (the count appears after voting, Fernando 25/10); key `${spell}:${moment}`
export type SoundState = {
  candidates: SoundCandidate[];
  mine: Record<string, string>;
  tally: Record<string, Record<string, number>>;
  comments: SoundComment[];
};
export type PackEntry = { path: string; s: number };

export const pairKey = (spell: SpellId, moment: SoundMoment) => `${spell}:${moment}`;
// the AI's ranked suggestions from the pack (sound-picks.ts): always options of their pair, before anything members add
export const picksFor = (spell: SpellId, moment: SoundMoment) => (SOUND_PICKS[pairKey(spell, moment)] ?? []).map(([path, pt, en]) => ({ src: `pack:${path}`, pt, en }));
export const isPick = (spell: SpellId, moment: SoundMoment, src: string) => picksFor(spell, moment).some((p) => p.src === src);

function obj(raw: string): Record<string, unknown> | null {
  try {
    const m: unknown = JSON.parse(raw);
    return typeof m === 'object' && m !== null && !Array.isArray(m) ? (m as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
const isMoment = (x: unknown): x is SoundMoment => SOUND_MOMENTS.includes(x as SoundMoment);
const pair = (spell: unknown, moment: unknown) => (isSpell(spell) && isMoment(moment) && hasMoment(spell, moment) ? { spell, moment } : null);
export const parsePair = (spell: string | null, moment: string | null) => pair(spell, moment);

// Trust boundary of the sound-lab POST bodies: each parser returns null on anything unexpected
export function parseSoundPick(raw: string): { spell: SpellId; moment: SoundMoment; src: string } | null {
  const m = obj(raw);
  const p = m && pair(m.spell, m.moment);
  return m && p && isSoundSrc(m.src) ? { ...p, src: m.src } : null;
}

export function parseSoundComment(raw: string): { spell: SpellId; text: string } | null {
  const m = obj(raw);
  if (!m || !isSpell(m.spell) || typeof m.text !== 'string') return null;
  const text = m.text.trim();
  return text && text.length <= SOUND_COMMENT_MAX ? { spell: m.spell, text } : null;
}
