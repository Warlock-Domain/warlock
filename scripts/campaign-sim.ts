// Campaign simulator (Lucas, 25/10): bots play whole Charneca nights as the Acesos, from the entrance to Sir Odran, to
// measure the night (win rate, time, levels before the boss, falls, boss fight length) for each group size.
// The Acesos fight with the normal bot brain; between encounters they walk the room path (breadth-first search on the map
// grid): rekindle fallen allies, open the room's chest, stand at the Sanctuary candle until healed, then the next checkpoint.
// Cards are picked like a Normal bot picks in the Ascension. Usage:
//   node scripts/campaign-sim.ts --nights 20 --sizes 1,2,3,4 --difficulty normal --seed 1 [--out balance/campaign]
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { autoPick } from '../src/shared/ascension.ts';
import { BOT_SKILL, botCmds, botThinks } from '../src/shared/bots.ts';
import { nightLevel } from '../src/shared/campaign.ts';
import { DT } from '../src/shared/constants.ts';
import { nightMap, type NightMap } from '../src/shared/levels.ts';
import { addPlayer, newMatch, nightPick, setReady, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import type { Cmd, World } from '../src/shared/sim.ts';
import { spellCount } from '../src/shared/spells.ts';
import { dist, v, type Vec } from '../src/shared/vec.ts';
import { seedRandom, writeAtomic } from './sim-lib.ts';

const { values } = parseArgs({ options: {
  nights: { type: 'string', default: '20' }, sizes: { type: 'string', default: '1,2,3,4' }, difficulty: { type: 'string', default: 'normal' },
  seed: { type: 'string', default: '1' }, out: { type: 'string' }, minutes: { type: 'string', default: '30' },
} });
const NIGHTS = Number(values.nights), SIZES = values.sizes!.split(',').map(Number), SEED = Number(values.seed), LIMIT = Number(values.minutes) * 60;
const D = BOT_SKILL[values.difficulty as keyof typeof BOT_SKILL];
if (!(NIGHTS > 0) || SIZES.some((n) => !(n >= 1 && n <= 4)) || !D || !(LIMIT > 0)) throw new Error('usage: --nights N --sizes 1,2,3,4 --difficulty easy|casual|normal|veteran|hard --seed S --minutes M');

const STEP = DT * 1000;
const PASS = new Set(['floor', 'wax']); // the bots walk around lava, pits, low walls, walls and debris

// distance field (in cells) to a goal cell, over walkable cells without trees or statues
function field(n: NightMap, goal: Vec): Int32Array {
  const blocked = new Set(n.marks.filter((m) => m.kind === 'tree' || m.kind === 'statue').flatMap((m) => {
    const out: number[] = [];
    for (let y = m.y; y < m.y + (m.h ?? 1); y++) for (let x = m.x; x < m.x + (m.w ?? 1); x++) out.push(y * n.w + x);
    return out;
  }));
  const d = new Int32Array(n.w * n.h).fill(-1);
  const start = Math.floor(goal.y) * n.w + Math.floor(goal.x);
  d[start] = 0;
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q], x = c % n.w, y = (c - x) / n.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * n.w + nx;
      if (nx < 0 || ny < 0 || nx >= n.w || ny >= n.h || d[k] >= 0 || blocked.has(k) || !PASS.has(n.ground[ny][nx])) continue;
      d[k] = d[c] + 1;
      queue.push(k);
    }
  }
  return d;
}
const fields = new Map<string, Int32Array>();
// next point on the way to the goal: walk the field down (4 neighbours) up to 8 cells and keep the farthest cell that is in
// a straight, clear line from here (a click stops at the first obstacle, so the line must not graze a wall or a tree)
function stepToward(n: NightMap, key: string, from: Vec, goal: Vec): Vec {
  const fk = key + ':' + Math.floor(goal.x) + ',' + Math.floor(goal.y);
  let d = fields.get(fk);
  if (!d) fields.set(fk, (d = field(n, goal)));
  const free = (x: number, y: number) => d![Math.floor(y) * n.w + Math.floor(x)] >= 0;
  const clear = (a: Vec, b: Vec) => {
    const steps = Math.ceil(dist(a, b) * 4);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      // the body is 0.35 m wide: check both sides of the line too
      if (!free(x, y) || !free(x + 0.35, y) || !free(x - 0.35, y) || !free(x, y + 0.35) || !free(x, y - 0.35)) return false;
    }
    return true;
  };
  if (clear(from, goal) && dist(from, goal) < 8) return goal;
  let x = Math.floor(from.x), y = Math.floor(from.y), out = v(x + 0.5, y + 0.5);
  for (let i = 0; i < 8; i++) {
    const here = d[y * n.w + x];
    let best: [number, number] | null = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (y + dy) * n.w + x + dx;
      if (d[k] >= 0 && (here < 0 || d[k] < here) && (!best || d[k] < d[best[1] * n.w + best[0]])) best = [x + dx, y + dy];
    }
    if (!best) break;
    [x, y] = best;
    const c = v(x + 0.5, y + 0.5);
    if (i === 0 || clear(from, c)) out = c;
    else break;
  }
  return out;
}

type NightLog = { size: number; seed: number; result: 'won' | 'lost' | 'timeout'; time: number; bossTime: number; levelAtBoss: number; spellsAtBoss: number; falls: number; rekindled: number; chests: number; rooms: number; bossBy?: string; lostIn?: string };

function playNight(size: number, seed: number): NightLog {
  const rand = seedRandom(seed);
  fields.clear();
  const m: Match = newMatch();
  const ids = ['a', 'b', 'c', 'd'].slice(0, size);
  for (const id of ids) addPlayer(m, id, id);
  let now = 0;
  startMatch(m, now, 0, 'campaign', true, rand);
  for (const id of ids) setReady(m, id);
  while (m.phase !== 'playing') tickMatch(m, (now = Math.max(now + STEP, m.phaseEnds)), [], rand);
  const n = m.night!, map = nightMap(n.seed, n.stage), key = `${n.seed}`;
  const boss = map.rooms.findIndex((r) => r.room.pool === 'chefe');
  const candle = map.marks.find((q) => q.kind === 'candle');
  const chests = map.marks.filter((q) => q.kind === 'chest');
  const log: NightLog = { size, seed, result: 'timeout', time: 0, bossTime: 0, levelAtBoss: 0, spellsAtBoss: 0, falls: 0, rekindled: 0, chests: 0, rooms: 0 };
  let bossAt = -1;
  while (!n.result && m.phase === 'playing') {
    const w: World = m.world!;
    if (w.t > LIMIT) break;
    // cards: picked as soon as they are on the table (a Normal bot's pick)
    for (const id of ids) {
      const offer = n.offer?.[id], p = m.players.find((q) => q.id === id)!;
      if (offer) nightPick(m, id, Math.max(0, autoPick(p, offer, 'normal', rand)));
    }
    if (n.fight === boss && bossAt < 0) {
      bossAt = w.t;
      log.levelAtBoss = Math.min(...ids.map((id) => nightLevel(n.xp?.[id] ?? 0)));
      log.spellsAtBoss = Math.min(...ids.map((id) => spellCount(m.players.find((q) => q.id === id)!.spells)));
    }
    const cmds: Cmd[] = [];
    const embers = w.wizards.filter((z) => z.team === 0 && !z.alive && z.ember && !z.ember.out);
    const nextRoom = map.rooms.findIndex((r, i) => !n.done.includes(i) && (r.room.fight || r.room.boss));
    for (const id of ids) {
      const z = w.wizards.find((q) => q.id === id);
      if (!z?.alive) continue;
      const foeNear = w.wizards.some((q) => q.team === 1 && q.alive && dist(q.pos, z.pos) < 9);
      // the closest standing Aceso to an ember goes to rekindle it when no servant is close to that ember
      const ember = embers.find((e) => !w.wizards.some((q) => q.team === 1 && q.alive && dist(q.pos, e.pos) < 5)
        && w.wizards.filter((q) => q.team === 0 && q.alive).sort((a, b) => dist(a.pos, e.pos) - dist(b.pos, e.pos))[0] === z);
      if (ember) {
        cmds.push({ id, kind: 'move', to: stepToward(map, key, z.pos, ember.pos) });
        continue;
      }
      if (n.fight !== null || foeNear) {
        // same thinking rate as a real bot (tickMatch's botThinks; botWatch already ran in the last step)
        if (botThinks(m.steps, m.players.findIndex((p) => p.id === id), D)) cmds.push(...botCmds(w, id, rand, D, {}));
        continue;
      }
      // between encounters: the chest of a won room, the candle until healed (before the boss), then the next checkpoint
      const chest = chests.map((c, k) => ({ c, k })).find(({ c, k }) => !n.opened?.includes(k) && (n.done.includes(c.room) || !map.rooms[c.room].room.fight));
      const hurt = w.wizards.some((q) => q.team === 0 && q.alive && q.hp < q.hpMax * 0.95);
      let goal: Vec | null = null;
      if (chest) goal = v(chest.c.x + 0.5, chest.c.y + 0.5);
      else if (candle && nextRoom === boss && hurt) goal = v(candle.x + 0.5 + (ids.indexOf(id) % 2) - 0.5, candle.y + 1.5);
      else if (nextRoom >= 0) {
        const cp = map.marks.find((q) => q.room === nextRoom && q.kind === 'checkpoint');
        const r = map.rooms[nextRoom];
        goal = cp ? v(cp.x + 1, cp.y + 0.5) : v(r.x + 6, r.y + r.room.h / 2);
      }
      if (goal && (dist(z.pos, goal) > 0.6 || goal !== null && nextRoom === boss && !hurt)) cmds.push({ id, kind: 'move', to: stepToward(map, key, z.pos, goal) });
    }
    const events = tickMatch(m, (now += STEP), cmds, rand);
    for (const e of events) {
      if (e.k === 'death' && ids.includes(e.id)) log.falls++;
      else if (e.k === 'ember' && e.what === 'lit') log.rekindled++;
      else if (e.k === 'relic') log.chests++;
      if (e.k === 'death' && m.players.find((p) => p.id === e.id)?.servo === 'odran') log.bossBy = e.src; // lava, a spell…
    }
  }
  log.result = n.result ?? 'timeout';
  if (log.result === 'lost') log.lostIn = n.fight === null ? 'between rooms' : map.rooms[n.fight].room.id;
  log.time = Math.round(m.world?.t ?? 0);
  log.bossTime = bossAt < 0 ? 0 : Math.round((m.world?.t ?? 0) - bossAt);
  log.rooms = n.done.length;
  return log;
}

const logs: NightLog[] = [];
for (const size of SIZES) for (let k = 0; k < NIGHTS; k++) {
  const log = playNight(size, SEED * 1000 + size * 100 + k);
  logs.push(log);
  process.stdout.write(`${size} Aceso(s) #${k + 1}: ${log.result} in ${log.time} s${log.lostIn ? ' (' + log.lostIn + ')' : ''}, boss ${log.bossTime} s${log.bossBy ? ' (' + log.bossBy + ')' : ''}, level ${log.levelAtBoss}, ${log.spellsAtBoss} spells, ${log.falls} falls, ${log.chests} chests\n`);
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const rows = SIZES.map((size) => {
  const g = logs.filter((l) => l.size === size), won = g.filter((l) => l.result === 'won'), reached = g.filter((l) => l.levelAtBoss > 0);
  return { size, nights: g.length, won: won.length, lost: g.filter((l) => l.result === 'lost').length, timeout: g.filter((l) => l.result === 'timeout').length,
    time: avg(won.map((l) => l.time)), boss: avg(won.map((l) => l.bossTime)), reachedBoss: reached.length, level: avg(reached.map((l) => l.levelAtBoss)),
    spells: avg(reached.map((l) => l.spellsAtBoss)), falls: avg(g.map((l) => l.falls)), chests: avg(g.map((l) => l.chests)), rooms: avg(g.map((l) => l.rooms)) };
});
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const report = ['| Acesos | nights | won | lost | timeout | reached Odran | level at Odran | spells | night (won, s) | boss fight (won, s) | falls | chests | rooms won |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.size} | ${r.nights} | ${r.won} | ${r.lost} | ${r.timeout} | ${r.reachedBoss} | ${f1(r.level)} | ${f1(r.spells)} | ${f1(r.time)} | ${f1(r.boss)} | ${f1(r.falls)} | ${f1(r.chests)} | ${f1(r.rooms)} |`)].join('\n');
console.log('\n' + report);
if (values.out) {
  mkdirSync(values.out, { recursive: true });
  writeAtomic(values.out, [['summary.json', JSON.stringify({ difficulty: values.difficulty, seed: SEED, rows, logs }, null, 1)], ['report.md', report + '\n']]);
}
