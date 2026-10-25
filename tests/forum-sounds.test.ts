import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_SOUND, HIT_SPELLS, SOUND_COMMENT_MAX, SOUND_MOMENTS, hasMoment, isPick, isSoundKey, isSoundSrc, pairKey, parsePair, parseSoundComment, parseSoundPick, picksFor, soundKey } from '../src/shared/forum-sounds.ts';
import { SOUND_PICKS } from '../src/shared/sound-picks.ts';
import { SPELL_IDS } from '../src/shared/spells.ts';

const UP = 'up:abcdefghijklmnopqrstuv.mp3';

describe('sound lab sources', () => {
  it('accepts the game sound, pack paths and upload names only', () => {
    for (const ok of [GAME_SOUND, 'pack:Abilities/Spells/Human/Avatar/Avatar', 'pack:Sound/Units/Combat/MetalHeavyBashFlesh1', UP]) expect(isSoundSrc(ok), ok).toBe(true);
    for (const bad of ['', 'pack:', 'pack:../secret', 'pack:a//b', 'pack:a b', 'up:short.mp3', 'up:abcdefghijklmnopqrstuv.exe', 'http://x', 5, null]) expect(isSoundSrc(bad), String(bad)).toBe(false);
  });

  it('maps each source to its R2 key and only serves those keys', () => {
    expect(soundKey('pack:Abilities/Spells/Human/Avatar/Avatar')).toBe('pack/Abilities/Spells/Human/Avatar/Avatar.mp3');
    expect(soundKey(UP)).toBe('up/abcdefghijklmnopqrstuv.mp3');
    for (const ok of ['pack/index.json', soundKey(UP), soundKey('pack:A/B')]) expect(isSoundKey(ok), ok).toBe(true);
    for (const bad of ['pack/../x.mp3', 'pack/x.wav', 'other/x.mp3', 'up/x.mp3', 'index.json']) expect(isSoundKey(bad), bad).toBe(false);
  });
});

describe('sound lab moments', () => {
  it('offers the impact only for spells that deal damage', () => {
    expect(HIT_SPELLS).toContain('fireball');
    expect(HIT_SPELLS).not.toContain('teleport');
    expect(hasMoment('teleport', 'cast')).toBe(true);
    expect(hasMoment('teleport', 'hit')).toBe(false);
    expect(parsePair('teleport', 'hit')).toBeNull();
    expect(parsePair('fireball', 'hit')).toEqual({ spell: 'fireball', moment: 'hit' });
    expect(parsePair('nope', 'cast')).toBeNull();
  });
});

describe('sound lab bodies', () => {
  it('parses a vote and refuses anything else', () => {
    expect(parseSoundPick(JSON.stringify({ spell: 'fireball', moment: 'cast', src: GAME_SOUND }))).toEqual({ spell: 'fireball', moment: 'cast', src: GAME_SOUND });
    for (const bad of ['x', '[]', '{}', JSON.stringify({ spell: 'fireball', moment: 'cast', src: null }), JSON.stringify({ spell: 'fireball', moment: 'cast', src: 'pack:..' })]) {
      expect(parseSoundPick(bad), bad).toBeNull();
    }
  });

  it('lets only the winner route clear a pick', () => {
    expect(parseSoundPick(JSON.stringify({ spell: 'fireball', moment: 'hit', src: null }), true)).toEqual({ spell: 'fireball', moment: 'hit', src: null });
  });

  it('trims a comment and caps its length', () => {
    expect(parseSoundComment(JSON.stringify({ spell: 'meteor', text: '  bom  ' }))).toEqual({ spell: 'meteor', text: 'bom' });
    expect(parseSoundComment(JSON.stringify({ spell: 'meteor', text: 'x'.repeat(SOUND_COMMENT_MAX + 1) }))).toBeNull();
    for (const bad of ['{}', JSON.stringify({ spell: 'meteor', text: '   ' }), JSON.stringify({ spell: 'x', text: 'a' })]) expect(parseSoundComment(bad), bad).toBeNull();
  });
});

describe('sound lab AI picks', () => {
  it('gives every effect at least 10 distinct pack files that exist', () => {
    for (const spell of SPELL_IDS) for (const moment of SOUND_MOMENTS) {
      const key = pairKey(spell, moment);
      if (!hasMoment(spell, moment)) {
        expect(SOUND_PICKS[key], key).toBeUndefined();
        continue;
      }
      const picks = picksFor(spell, moment);
      expect(picks.length, key).toBeGreaterThanOrEqual(10);
      expect(new Set(picks.map((p) => p.src)).size, key).toBe(picks.length);
      for (const p of picks) {
        expect(isSoundSrc(p.src), p.src).toBe(true);
        expect(existsSync(`assets/sons-rpg/${p.src.slice(5)}.wav`), p.src).toBe(true);
        expect(p.pt && p.en, p.src).toBeTruthy();
      }
    }
  });

  it('counts a pick as an option of its own pair only', () => {
    const [first] = picksFor('fireball', 'cast');
    expect(isPick('fireball', 'cast', first.src)).toBe(true);
    expect(isPick('fireball', 'hit', first.src)).toBe(false);
  });
});
