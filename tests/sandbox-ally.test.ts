import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, DT } from '../src/shared/constants.ts';
import { addPlayer, kick, newMatch, sandboxCmd, setWatch, startMatch, tickMatch } from '../src/shared/match.ts';
import { parseClientMessage, publicRoom } from '../src/shared/protocol.ts';
import { healTarget } from '../src/shared/heal-target.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { toPlaying } from './helpers.ts';

function setup() {
  const m = newMatch();
  addPlayer(m, 'a', 'Ana', false, false, () => .5);
  startMatch(m, 0, 0, 'rounds', true, () => .5, {}, [], true);
  const now = toPlaying(m, 0);
  return { m, now };
}
const command = { op: 'bot', ally: true, bot: { difficulty: 'easy', spells: { fireball: 1 } } } as const;

describe('Sandbox allied bots', () => {
  it('validates the optional ally flag and rebuilds the command without arbitrary identity/team fields', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'sandbox', cmd: { ...command, owner: 'victim', team: 99 } }))).toEqual({ t: 'sandbox', cmd: command });
    for (const ally of [1, 'true', null, {}, []]) expect(parseClientMessage(JSON.stringify({ t: 'sandbox', cmd: { op: 'bot', ally } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'sandbox', cmd: { op: 'bot', ally: false } }))).toEqual({ t: 'sandbox', cmd: { op: 'bot' } });
  });

  it('creates a real teammate immediately while preserving selected difficulty and loadout', () => {
    const { m, now } = setup();
    expect(sandboxCmd(m, command, now, 'a', () => .5)).toBe(true);
    const human = m.players[0], bot = m.players.find(p => p.bot)!;
    expect(bot).toMatchObject({ difficulty: 'easy', team: human.team, spells: { fireball: 1 } });
    expect(human.team).toBe(0);
    expect(m.world!.wizards.map(z => z.team)).toEqual([0, 0]);
    expect(publicRoom('test', m, now).players.find(p => p.bot)?.team).toBe(human.team);
  });

  it('does not change existing enemy bots, training dummies or turrets', () => {
    const { m, now } = setup();
    sandboxCmd(m, { op: 'bot', dummy: true }, now, 'a', () => .5);
    sandboxCmd(m, { op: 'turret', direction: 'east' }, now, 'a', () => .5);
    sandboxCmd(m, command, now, 'a', () => .5);
    sandboxCmd(m, { op: 'bot' }, now, 'a', () => .5);
    expect(m.players.filter(p => p.bot).map(p => p.team)).toEqual([null, null, 0, null]);
  });

  it('allows friendly support targeting and prevents friendly damage using existing combat rules', () => {
    const { m, now } = setup();
    sandboxCmd(m, { ...command, dummy: true }, now, 'a', () => .5);
    tickMatch(m, now + 1000 / 60, [], () => .5);
    const w = m.world!, [human, ally] = w.wizards;
    w.pillars = []; w.rules.runes = w.rules.chests = false;
    human.pos = v(0, 0); ally.pos = v(2, 0); ally.invulnUntil = 0;
    ally.hp = 500; ally.regen = human.regen = 0;
    expect(healTarget(w.wizards, human, ally.pos, 10)).toBe(ally);
    human.spells = { ...noSpells(), heal: 1 };
    stepWorld(w, [{ id: human.id, kind: 'cast', spell: 'heal', at: ally.pos }], () => .5);
    expect(ally.hp).toBeCloseTo(545);
    w.projectiles.push({ id: w.nextId++, kind: 'fireball', owner: human.id, caster: human.id, pos: v(1.9, 0), vel: v(10, 0), level: 1, until: w.t + 1, target: null, dmgMult: 1 });
    stepWorld(w, [], () => .5);
    expect(ally.hp).toBeCloseTo(545);
  });

  it('preserves teams through death/respawn and arena/round restart', () => {
    const { m, now } = setup();
    sandboxCmd(m, command, now, 'a', () => .5);
    const ally = m.world!.wizards.find(z => z.id !== 'a')!;
    ally.alive = false; ally.respawnAt = m.world!.t;
    tickMatch(m, now + DT * 1000, [], () => .5);
    expect(ally.alive).toBe(true); expect(ally.team).toBe(0);
    sandboxCmd(m, { op: 'arena', arena: 'cross' }, now + DT * 1000, 'a', () => .5);
    const next = toPlaying(m, now + DT * 1000);
    expect(m.world!.wizards.map(z => z.team)).toEqual([0, 0]);
    sandboxCmd(m, { op: 'restart' }, next, 'a', () => .5);
    toPlaying(m, next);
    expect(m.world!.wizards.map(z => z.team)).toEqual([0, 0]);
  });

  it('keeps its ally after the human watches and returns to play', () => {
    const { m, now } = setup();
    sandboxCmd(m, command, now, 'a', () => .5);
    expect(setWatch(m, 'a', true)).toBe(true);
    expect(setWatch(m, 'a', false)).toBe(true);
    tickMatch(m, now + DT * 1000, [], () => .5);
    expect(m.players.map(p => p.team)).toEqual([0, 0]);
    expect(m.world!.wizards.map(z => z.team)).toEqual([0, 0]);
  });

  it('rejects absent, bot, disconnected and spectating requesters without adding a player', () => {
    const { m, now } = setup();
    for (const id of ['', 'missing']) expect(sandboxCmd(m, command, now, id, () => .5)).toBe(false);
    m.players[0].connected = false;
    expect(sandboxCmd(m, command, now, 'a', () => .5)).toBe(false);
    m.players[0].connected = true;
    setWatch(m, 'a', true);
    expect(sandboxCmd(m, command, now, 'a', () => .5)).toBe(false);
    expect(m.players).toHaveLength(1);
  });

  it('respects room capacity and supports removing and re-adding an ally', () => {
    const { m, now } = setup();
    for (let i = 1; i < MAX_PLAYERS; i++) expect(sandboxCmd(m, command, now, 'a', () => .5)).toBe(true);
    expect(sandboxCmd(m, command, now, 'a', () => .5)).toBe(false);
    const bot = m.players.find(p => p.bot)!;
    expect(kick(m, bot.id)).toBe(true);
    expect(sandboxCmd(m, command, now, 'a', () => .5)).toBe(true);
    expect(m.players.find(p => p.id === bot.id)?.team).toBe(0);
  });

  it('does nothing in a normal match', () => {
    const m = newMatch(); addPlayer(m, 'a', 'Ana');
    expect(sandboxCmd(m, command, 0, 'a', () => .5)).toBe(false);
    expect(m.players).toHaveLength(1);
    expect(m.players[0].team).toBeNull();
  });
});
