import { describe, expect, it } from 'vitest';
import { DT, HP_MAX, LAVA_DPS, STUN_SPEED, WIZ_SPEED } from '../src/shared/constants.ts';
import { AEGIS, ITEMS, ITEM_IDS, MAX_ITEMS, SHOCK_BOOTS, itemPrice, noItems, startItems, type ItemId } from '../src/shared/items.ts';
import { addPlayer, buy, buyItem, newMatch, resume, sell, sellValue, startMatch, tickMatch, undoBuy } from '../src/shared/match.ts';
import { randomPlan } from '../src/shared/bots.ts';
import { itemTip } from '../src/client/tips.ts';
import { len } from '../src/shared/vec.ts';
import { newWorld, stepWorld, type Cmd, type World } from '../src/shared/sim.ts';
import { CAST_POINT, PACT, SPELLS, noSpells, priceOf, type SpellId } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world as spotsWorld } from './helpers.ts';

const allSpells = (): Record<SpellId, number> => ({ ...noSpells(), lightning: 1, homing: 1, shield: 1, teleport: 1 });
const with_ = (it: Partial<Record<ItemId, number>>) => ({ ...noItems(), ...it });
const world = (spots: [number, number][], items: Partial<Record<ItemId, number>>[] = []) => spotsWorld(spots, allSpells(), items);
const steps = (w: World, n: number) => {
  for (let i = 0; i < n; i++) stepWorld(w, []);
};

describe('Passive items', () => {
  it('ring raises max hp', () => {
    const w = world([[0, 0]], [{ ring: 2 }]);
    expect(w.wizards[0].hpMax).toBe(HP_MAX + 100);
    expect(w.wizards[0].hp).toBe(HP_MAX + 100);
  });

  it('armor reduces knockback', () => {
    const plain = world([[0, 0], [3, 0]]);
    const armored = world([[0, 0], [3, 0]], [{}, { armor: 3 }]);
    for (const w of [plain, armored]) {
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
      steps(w, 30);
    }
    const ratio = armored.wizards[1].vel.x / plain.wizards[1].vel.x;
    expect(ratio).toBeCloseTo(1 - 0.12, 2);
  });

  it('boots make you walk faster', () => {
    const w = world([[0, 0]], [{ boots: 3 }]);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(5, 0) }]);
    steps(w, 59);
    expect(w.wizards[0].pos.x).toBeCloseTo(WIZ_SPEED + ITEMS.boots.levels[0].speed!, 1);
  });
});

// Scourge and Pact became spells on 21/10 (#217); Redirector was removed
describe('Scourge and Pact spells', () => {
  const scourge = (id = 'p0'): Cmd => ({ id, kind: 'cast', spell: 'scourge', at: v(0, 0) });
  const windup = Math.round(CAST_POINT.scourge / DT);

  it('scourge explodes after the windup and pushes nearby, without hurting the caster', () => {
    const w = world([[0, 0], [1, 0], [5, 0]]);
    stepWorld(w, [scourge()]);
    steps(w, windup - 5);
    expect(w.wizards[1].hp).toBe(HP_MAX);
    steps(w, 10);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX);
    expect(w.wizards[1].vel.x).toBeGreaterThan(0);
    expect(w.wizards[2].hp).toBe(HP_MAX);
    expect(w.wizards[0].hp).toBe(HP_MAX);
    expect(w.wizards[0].cd.scourge).toBeGreaterThan(w.t);
  });

  // Owner decision (21/10): the blast cancels incoming knockback
  it('the blast stops the knockback the caster is taking', () => {
    const w = world([[0, 0], [1, 0]]);
    stepWorld(w, [scourge()]);
    w.wizards[0].vel = v(-12, 0); // pushed during windup
    steps(w, windup - 5);
    expect(len(w.wizards[0].vel)).toBeGreaterThan(STUN_SPEED);
    let blasted = false;
    for (let i = 0; i < 10 && !blasted; i++) {
      stepWorld(w, []);
      blasted = w.events.some((e) => e.k === 'scourge');
    }
    expect(blasted).toBe(true);
    expect(len(w.wizards[0].vel)).toBe(0);
  });

  // Scourge stays a free active item with fixed level-one attributes.
  it('every player starts with fixed-level Scourge and legacy ranks retain base attributes', () => {
    expect(noSpells().scourge).toBe(0);
    expect(startItems().scourge).toBe(1);
    expect(ITEMS.scourge.levels).toHaveLength(1);
    expect(ITEMS.scourge.cost).toBe(7);
    expect(priceOf('scourge', 0)).toBeNull();
    expect(priceOf('scourge', 1)).toBeNull();
    expect(SPELLS.scourge.levels.map((l) => l.dmg)).toEqual([80, 100, 120]);
    const w = world([[0, 0], [1, 0]]);
    w.wizards[0].spells.scourge = 3;
    stepWorld(w, [scourge()]);
    steps(w, windup + 5);
    expect(HP_MAX - w.wizards[1].hp).toBeGreaterThan(SPELLS.scourge.levels[0].dmg - 5);
  });

  it('scourge also damages obstacles and the chest in the blast', () => {
    const w = world([[0, 0]]);
    w.pillars = [{ pos: v(1.2, 0), hp: 250, alive: true, kind: 'chest' }];
    stepWorld(w, [scourge()]);
    steps(w, 40);
    expect(w.pillars[0].hp).toBeLessThan(250);
  });

  it('scourge never kills its caster', () => {
    const w = world([[0, 0]]);
    w.wizards[0].spells.scourge = 3;
    w.wizards[0].hp = 30;
    stepWorld(w, [scourge()]);
    steps(w, 70);
    expect(w.wizards[0].alive).toBe(true);
    expect(w.wizards[0].hp).toBeGreaterThanOrEqual(10);
  });

  it('pact makes the next damaging spell stronger and does not slow', () => {
    const w = world([[0, 0], [2, 0]]);
    w.wizards[0].spells.pact = 1;
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'pact', at: v(0, 0) }]);
    steps(w, 15);
    expect(w.wizards[0].cd.pact).toBeGreaterThan(w.t);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(2, 0) }]);
    steps(w, 15);
    // regeneration restores some health between impact and assertion
    expect(HP_MAX - w.wizards[1].hp).toBeGreaterThan(SPELLS.lightning.levels[0].dmg * PACT.mult - 2);
    steps(w, 2);
    expect(w.wizards[0].speed).toBe(WIZ_SPEED);
  });

  it('teleport during the scourge windup cancels the blast', () => {
    const w = world([[0, 0], [1, 0]]);
    stepWorld(w, [scourge()]);
    steps(w, 5);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'teleport', at: v(-3, 0) }]);
    expect(w.wizards[0].casting).toBeNull();
    expect(w.wizards[0].pos.x).toBeLessThan(-1);
    steps(w, 40);
    expect(w.wizards[1].hp).toBe(HP_MAX);
    expect(w.wizards[0].cd.scourge).toBe(0); // not released: no cooldown
  });

  it('no spell goes out while the scourge is winding up', () => {
    const w = world([[0, 0], [1, 0]]);
    stepWorld(w, [scourge()]);
    steps(w, 5);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(2, 0) }]);
    expect(w.wizards[0].casting?.spell).toBe('scourge');
    expect(w.wizards[0].cd.lightning).toBe(0);
    steps(w, 40);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX); // Scourge still fired
  });

  it('a chest swallowed by the lava breaks on its own and the gold lands on the stone', () => {
    const w = world([[0, 0]], [{}]);
    w.pillars = [{ pos: v(w.arenaR + 0.3, 0), hp: 1, alive: true, kind: 'chest' }];
    stepWorld(w, []);
    expect(w.pillars[0].alive).toBe(false);
    expect(w.loots).toHaveLength(1);
    expect(len(w.loots[0].pos)).toBeLessThan(w.arenaR);
  });

  it('scourge destroys enemy projectiles in the blast', () => {
    // Fireball reaches the area during the half-second windup
    const w = world([[0, 0], [5.5, 0]]);
    stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'fireball', at: v(0, 0) }]);
    steps(w, 6);
    stepWorld(w, [scourge()]);
    steps(w, 32);
    expect(w.projectiles.length).toBe(0);
    expect(w.wizards[0].hp).toBe(HP_MAX);
  });

  it('a sold Scourge does nothing', () => {
    const w = world([[0, 0], [1, 0]]);
    w.wizards[0].spells.scourge = 0; w.wizards[0].items.scourge = 0;
    stepWorld(w, [scourge()]);
    steps(w, 70);
    expect(w.wizards[1].hp).toBe(HP_MAX);
  });
});

describe('Item shop', () => {
  it('buys each item once and respects six inventory spaces', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    const p = m.players[0];
    p.gold = 200;
    expect(buyItem(m, 'a', 'cape')).toBe(true);
    expect(buyItem(m, 'a', 'cape')).toBe(false);
    expect(buyItem(m, 'a', 'cape')).toBe(false);
    expect(buyItem(m, 'a', 'cape')).toBe(false);
    expect(p.gold).toBe(200 - ITEMS.cape.cost);
    for (const i of ['ring', 'armor', 'boots', 'watch'] as ItemId[]) expect(buyItem(m, 'a', i)).toBe(true);
    expect(itemPrice(p.items, 'helmet')).toBeNull();
    expect(buyItem(m, 'a', 'helmet')).toBe(false);
    expect(Object.values(p.items).filter(Boolean).length).toBe(MAX_ITEMS);
  });
});

describe('Purchase undo', () => {
  it('undo refunds the latest purchase of that kind in this shop', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    const p = m.players[0];
    p.gold = 50;
    buy(m, 'a', 'lightning');
    buyItem(m, 'a', 'armor');
    buyItem(m, 'a', 'vampire');
    expect(p.gold).toBe(50 - 11 - 6 - 5);
    expect(undoBuy(m, 'a', 'spell:lightning')).toBe(true);
    expect(undoBuy(m, 'a', 'item:vampire')).toBe(true);
    expect(p.spells.lightning).toBe(0);
    expect(p.items.vampire).toBe(0);
    expect(p.gold).toBe(50 - 6);
    expect(undoBuy(m, 'a', 'spell:lightning')).toBe(false);
    // the free starting Scourge cannot be undone for gold
    expect(undoBuy(m, 'a', 'spell:scourge')).toBe(false);
  });
});

describe('Shop sales', () => {
  // a new shop treats previous purchases as belonging to earlier rounds
  const shop = () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    m.players[0].gold = 100;
    return { m, p: m.players[0] };
  };

  // Owner decision (19/10): sales refund the full paid price in any round
  it('sells for 100% of what was paid, in any round', () => {
    const { m, p } = shop();
    buy(m, 'a', 'lightning'); // 11
    buy(m, 'a', 'lightning'); // 8
    expect(sellValue(p, m.round, 'spell:lightning')).toBe(19);
    expect(sellValue(p, m.round + 1, 'spell:lightning')).toBe(19);
    expect(sellValue(p, m.round + 20, 'spell:lightning')).toBe(19);
    m.round += 2;
    const gold = p.gold;
    expect(sell(m, 'a', 'spell:lightning')).toBe(true);
    expect(p.spells.lightning).toBe(0);
    expect(p.gold).toBe(gold + 19);
    expect(p.held['spell:lightning']).toBeUndefined();
  });

  it('each level counts from the round it was bought', () => {
    const { m, p } = shop();
    buy(m, 'a', 'lightning'); // 11 in round zero
    m.round = 4;
    buy(m, 'a', 'lightning'); // 8 in round four
    expect(sellValue(p, 4, 'spell:lightning')).toBe(11 + 8);
    expect(undoBuy(m, 'a', 'spell:lightning')).toBe(true);
    expect(p.held['spell:lightning']).toEqual([0]);
  });

  it('a room saved before this rule counts unrecorded levels from round 0', () => {
    const { m, p } = shop();
    p.spells.lightning = 1;
    expect(sellValue(p, 2, 'spell:lightning')).toBe(11);
  });

  it('items sell the same way; the free Fireball sells for 0, the free Scourge level does not sell', () => {
    const { m, p } = shop();
    buyItem(m, 'a', 'armor');
    buyItem(m, 'a', 'armor'); // duplicate purchase is rejected
    expect(sellValue(p, m.round + 1, 'item:armor')).toBe(6);
    expect(sell(m, 'a', 'item:armor')).toBe(true);
    expect(p.items.armor).toBe(0);
    const gold = p.gold;
    expect(sell(m, 'a', 'item:scourge')).toBe(false); // The free starting item is protected.
    expect(p.spells.scourge).toBe(0);
    expect(p.gold).toBe(gold);
    expect(sell(m, 'a', 'spell:fireball')).toBe(true); // the free starting level refunds zero and frees the slot
    expect(p.spells.fireball).toBe(0);
  });

  it('does not sell outside the shop', () => {
    const { m, p } = shop();
    buy(m, 'a', 'lightning');
    m.phase = 'playing';
    expect(sell(m, 'a', 'spell:lightning')).toBe(false);
    expect(p.spells.lightning).toBe(1);
  });
});

describe('Lifesteal item', () => {
  it('costs five gold once and takes one item slot', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    const p = m.players[0];
    p.gold = 100;
    expect(buyItem(m, 'a', 'vampire')).toBe(true);
    expect(p.gold).toBe(95);
    for (let i = 0; i < 5; i++) buyItem(m, 'a', 'vampire');
    expect(p.items.vampire).toBe(1);
    expect(buyItem(m, 'a', 'vampire')).toBe(false);
  });

  it('lifesteal heals the attacker', () => {
    const w = newWorld(['a', 'b'], { a: allSpells(), b: allSpells() }, { a: with_({ vampire: 3 }) });
    w.wizards[0].pos = v(0, 0);
    w.wizards[1].pos = v(2, 0);
    for (const z of w.wizards) z.invulnUntil = 0;
    w.wizards[0].hp = 500;
    stepWorld(w, [{ id: 'a', kind: 'cast', spell: 'lightning', at: v(2, 0) }]);
    steps(w, 10);
    expect(w.wizards[0].hp).toBeGreaterThan(507);
  });
});

describe('Additional items', () => {
  const fireballAt = (w: World, x: number) => stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(x, 0) }]);
  const hits = (w: World, n: number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'hit') out.push(e.dmg);
    }
    return out;
  };

  it('lava boots always reduce lava damage by 18% without changing built knockback', () => {
    const built: number[] = [];
    for (const [lvl, cut] of [[0, 0], [1, 0.18], [2, 0.18]]) {
      const w = world([[0, 0]], [{ lava_boots: lvl }]);
      w.wizards[0].pos = v(w.arenaR + 1, 0);
      steps(w, 60);
      expect(HP_MAX - w.wizards[0].hp).toBeCloseTo(LAVA_DPS * (1 - cut), 1);
      built.push(w.wizards[0].dmgTaken);
    }
    expect(built[2]).toBeCloseTo(built[0], 5);
  });

  it('warden takes a flat amount off each hit and you fly a bit more', () => {
    const plain = world([[0, 0], [3, 0]]);
    const warded = world([[0, 0], [3, 0]], [{}, { warden: 3 }]);
    fireballAt(plain, 3);
    fireballAt(warded, 3);
    const [a] = hits(plain, 30);
    const [b] = hits(warded, 30);
    expect(a - b).toBeCloseTo(4, 0);
    expect(warded.wizards[1].vel.x / plain.wizards[1].vel.x).toBeCloseTo(1.01, 2);
  });

  it('warden never cuts more than half a hit (damage over time still works)', () => {
    const w = world([[0, 0], [3, 0]], [{}, { warden: 3 }]);
    w.wizards[1].ward = 1000;
    fireballAt(w, 3);
    expect(hits(w, 30)[0]).toBeCloseTo(SPELLS.fireball.levels[0].dmg / 2, 1);
  });

  it('helmet resists knockback but shortens spell range', () => {
    const plain = world([[0, 0], [9, 9]]);
    const helmed = world([[0, 0], [9, 9]], [{ helmet: 1 }]);
    expect(helmed.wizards[0].kbResist).toBeCloseTo(0.15);
    fireballAt(plain, 3);
    fireballAt(helmed, 3);
    steps(plain, 10);
    steps(helmed, 10);
    expect(helmed.projectiles[0].until / plain.projectiles[0].until).toBeCloseTo(0.9, 1);
  });

  it('shock boots speed you up for 3, 4 or 5 s after a hit, and only above the regular boots', () => {
    const w = world([[0, 0], [3, 0]], [{}, { shock_boots: 1 }]);
    const base = w.wizards[1].baseSpeed;
    fireballAt(w, 3);
    steps(w, 30);
    expect(w.wizards[1].speed).toBeCloseTo(base + SHOCK_BOOTS.speed, 5);
    steps(w, Math.round(SHOCK_BOOTS.secs / DT));
    expect(w.wizards[1].speed).toBeCloseTo(base, 5);
    // legacy Boots ranks use the fixed base bonus, so Shock Boots still add the difference
    expect(world([[0, 0]], [{ shock_boots: 1, boots: 3 }]).wizards[0].shockBonus).toBeCloseTo(SHOCK_BOOTS.speed - ITEMS.boots.levels[0].speed!);
    expect(world([[0, 0]], [{ shock_boots: 1, boots: 1 }]).wizards[0].shockBonus).toBeCloseTo(SHOCK_BOOTS.speed - ITEMS.boots.levels[0].speed!);
  });

  it('aegis pulls you out of the lava once, when your life is low', () => {
    const w = world([[0, 0]], [{ aegis: 1 }]);
    const z = w.wizards[0];
    z.pos = v(0, w.arenaR + 1);
    z.vel = v(0, 5);
    steps(w, 30);
    expect(z.pos.y).toBeGreaterThan(w.arenaR); // Aegis waits while health is high
    z.hp = AEGIS.hp + 0.5;
    let saved = false;
    for (let i = 0; i < 5; i++) {
      stepWorld(w, []);
      saved ||= w.events.some((e) => e.k === 'aegis' && e.id === 'p0');
    }
    expect(saved).toBe(true);
    expect(len(z.pos)).toBeCloseTo(w.arenaR * AEGIS.back, 1);
    expect(z.pos.y).toBeGreaterThan(0);
    expect(len(z.vel)).toBe(0);
    expect(z.aegis).toBe(false);
    // Aegis does not save a second time
    z.pos = v(0, w.arenaR + 1);
    steps(w, 600);
    expect(z.alive).toBe(false);
  });

  it('every item has a tooltip and bots can plan any passive item', () => {
    for (const id of ITEM_IDS) for (let l = 0; l <= ITEMS[id].levels.length; l++) expect(itemTip(id, l)).toContain(ITEMS[id].name);
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const planned = new Set<string>();
    for (let i = 0; i < 400; i++) for (const b of randomPlan(rand).buys) if (b.kind === 'item') planned.add(b.id);
    for (const id of ['lava_boots', 'warden', 'helmet', 'shock_boots', 'aegis']) expect(planned.has(id)).toBe(true);
  });

  // A legacy multi-charge save normalizes to one fixed-rank item.
  it('Aegis consumes its single normalized item when it saves you', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'A');
    addPlayer(m, 'b', 'B');
    startMatch(m, 0, 0);
    m.players[0].items.aegis = 2;
    m.players[0].held['item:aegis'] = [0, 0];
    resume(m, 0);
    let now = 0;
    while (m.phase !== 'playing') tickMatch(m, (now = Math.max(now + 17, m.phaseEnds)), []);
    const z = m.world!.wizards.find((q) => q.id === 'a')!;
    expect(z.aegis).toBe(true);
    z.pos = v(0, m.world!.arenaR * 2); // in lava for every arena shape
    z.hp = AEGIS.hp + 5;
    for (let i = 0; i < 300 && m.players[0].items.aegis > 0; i++) tickMatch(m, (now += 17), []);
    expect(z.alive).toBe(true);
    expect(m.players[0].items.aegis).toBe(0);
    expect(m.players[0].held['item:aegis']).toEqual([]);
  });

  // 26/10 (#227): rooms saved before the 3 levels and with the Scourge as a spell
  it('legacy spell ownership and higher item ranks normalize to fixed items', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'A');
    addPlayer(m, 'b', 'B');
    startMatch(m, 0, 0);
    const p = m.players[0];
    delete (p.items as Partial<Record<ItemId, number>>).scourge;
    p.spells.scourge = 5;
    p.items.ring = 5;
    p.items.vampire = 6;
    resume(m, 0);
    expect(p.spells.scourge).toBe(0);
    expect(p.items.scourge).toBe(1);
    expect(p.items.ring).toBe(1);
    expect(p.items.vampire).toBe(1);
    expect(m.players[1].items.scourge).toBe(1);
  });

  it('every item has one fixed level', () => {
    for (const id of ITEM_IDS) expect(ITEMS[id].levels).toHaveLength(1);
  });

  it('rooms saved before the new items get them at level 0', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'A');
    addPlayer(m, 'b', 'B');
    startMatch(m, 0, 0);
    delete (m.players[0].items as Partial<Record<ItemId, number>>).aegis;
    resume(m, 0);
    expect(m.players[0].items.aegis).toBe(0);
    expect(buyItem(m, 'a', 'aegis')).toBe(true);
    expect(m.players[0].items.aegis).toBe(1);
  });
});
