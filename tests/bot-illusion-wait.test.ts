import { describe, expect, it } from 'vitest';
import { BOT_SKILL, botCmds, botThinks } from '../src/shared/bots.ts';
import { DT } from '../src/shared/constants.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { encodeSnap, decodeSnap } from '../src/shared/snapshot.ts';
import { noSpells, SPELL_IDS } from '../src/shared/spells.ts';
import { world } from './helpers.ts';

describe('IA preserva o véu da Ilusão', () => {
  it.each(Object.keys(BOT_SKILL) as (keyof typeof BOT_SKILL)[])('não conjura nenhuma magia durante o véu em %s, mas pode andar', (level) => {
    const w = world([[0, 0], [1.5, 0]], Object.fromEntries(SPELL_IDS.map(s => [s, 1])) as ReturnType<typeof noSpells>, [], () => .5);
    w.pillars = []; w.isles = [];
    w.wizards[0].veilUntil = 2;
    const cmds = botCmds(w, 'p0', () => .5, BOT_SKILL[level]);
    expect(cmds.filter(c => c.kind === 'cast')).toEqual([]);
    expect(cmds.some(c => c.kind === 'move')).toBe(true);
  });
  it('não levanta Escudo enquanto velado, mesmo sob ameaça', () => {
    const w = world([[0, 0], [4, 0]], { ...noSpells(), shield: 1 }, [], () => .5);
    w.pillars = [];
    w.wizards[0].veilUntil = 2;
    w.projectiles.push({ id: 1, kind: 'fireball', owner: 'p1', caster: 'p1', pos: { x: 1.5, y: 0 }, vel: { x: -6.47, y: 0 }, level: 1, until: 9, target: null, dmgMult: 1 });
    expect(botCmds(w, 'p0', () => .1).filter(c => c.kind === 'cast')).toEqual([]);
  });
  it('volta a conjurar exatamente quando o prazo termina', () => {
    const w = world([[0, 0], [4, 0]], noSpells(), [], () => .5);
    w.pillars = [];
    w.wizards[0].veilUntil = 2;
    w.t = 2 - DT;
    expect(botCmds(w, 'p0', () => .5).filter(c => c.kind === 'cast')).toEqual([]);
    w.t = 2;
    expect(botCmds(w, 'p0', () => .5)).toContainEqual(expect.objectContaining({ kind: 'cast', spell: 'fireball' }));
  });
  it('também impede Flagelo, que usa o caminho sem espera de reação', () => {
    const w = world([[0, 0], [.5, 0]], { ...noSpells(), fireball: 0 }, [], () => .5);
    w.pillars = [];
    w.wizards[0].veilUntil = 2;
    expect(botCmds(w, 'p0', () => .5).filter(c => c.kind === 'cast')).toEqual([]);
    w.t = 2;
    expect(botCmds(w, 'p0', () => .5)).toContainEqual(expect.objectContaining({ kind: 'cast', spell: 'scourge' }));
  });
  it('decisão natural mantém o bot oculto até o fim e retoma ataques depois', () => {
    const w = world([[0, 0], [1.5, 0]], { ...noSpells(), illusion: 1 }, [], () => .2);
    w.pillars = []; w.isles = [];
    const bot = w.wizards[1];
    bot.spells.scourge = 0;
    let deadline = 0, checked = 0, resumed = false;
    for (let i = 1; i <= 180; i++) {
      const cmds = botThinks(i, 1, BOT_SKILL.normal) ? botCmds(w, bot.id, () => .2) : [];
      if (deadline && w.t < deadline) expect(cmds.filter(c => c.kind === 'cast')).toEqual([]);
      if (deadline && w.t >= deadline) resumed ||= cmds.some(c => c.kind === 'cast');
      stepWorld(w, cmds, () => .2);
      if (!deadline && bot.veilUntil > w.t) deadline = bot.veilUntil;
      if (deadline && w.t < deadline) {
        expect(bot.veilUntil).toBe(deadline);
        expect(decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0', 'p1']).wizards[1].status & 2048).toBe(2048);
        checked++;
      }
    }
    expect(deadline).toBe(2);
    expect(checked).toBeGreaterThan(100);
    expect(resumed).toBe(true);
  });
});
