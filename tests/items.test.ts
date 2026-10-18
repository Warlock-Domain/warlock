import { describe, expect, it } from 'vitest';
import { DT, HP_MAX, LAVA_DPS, WIZ_SPEED } from '../src/shared/constants.ts';
import { AEGIS, ITEMS, ITEM_IDS, MAX_ITEMS, PACT, SCOURGE, SHOCK_BOOTS, itemPrice, noItems, type ItemId } from '../src/shared/items.ts';
import { addPlayer, buy, buyItem, newMatch, resume, sell, sellValue, startMatch, undoBuy } from '../src/shared/match.ts';
import { randomPlan } from '../src/shared/bots.ts';
import { itemTip } from '../src/client/tips.ts';
import { len } from '../src/shared/vec.ts';
import { newWorld, stepWorld, type World } from '../src/shared/sim.ts';
import { SPELLS, noSpells, type SpellId } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

const allSpells = (): Record<SpellId, number> => ({ ...noSpells(), lightning: 1, homing: 1, shield: 1, teleport: 1 });
const with_ = (it: Partial<Record<ItemId, number>>) => ({ ...noItems(), ...it });

function world(spots: [number, number][], items: Partial<Record<ItemId, number>>[] = []): World {
  const ids = spots.map((_, i) => 'p' + i);
  const w = newWorld(ids, Object.fromEntries(ids.map((id) => [id, allSpells()])), Object.fromEntries(ids.map((id, i) => [id, with_(items[i] ?? {})])));
  spots.forEach(([x, y], i) => (w.wizards[i].pos = v(x, y)));
  for (const z of w.wizards) z.invulnUntil = 0;
  return w;
}
const steps = (w: World, n: number) => {
  for (let i = 0; i < n; i++) stepWorld(w, []);
};

describe('itens passivos', () => {
  it('ring raises max hp', () => {
    const w = world([[0, 0]], [{ ring: 2 }]);
    expect(w.wizards[0].hpMax).toBe(HP_MAX + 190);
    expect(w.wizards[0].hp).toBe(HP_MAX + 190);
  });

  it('armor reduces knockback', () => {
    const plain = world([[0, 0], [3, 0]]);
    const armored = world([[0, 0], [3, 0]], [{}, { armor: 3 }]);
    for (const w of [plain, armored]) {
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
      steps(w, 30);
    }
    const ratio = armored.wizards[1].vel.x / plain.wizards[1].vel.x;
    expect(ratio).toBeCloseTo(1 - 0.22, 2);
  });

  it('boots make you walk faster', () => {
    const w = world([[0, 0]], [{ boots: 3 }]);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(5, 0) }]);
    steps(w, 59);
    expect(w.wizards[0].pos.x).toBeCloseTo(WIZ_SPEED + ITEMS.boots.levels[2].speed!, 1);
  });
});

describe('itens ativos', () => {
  it('scourge explodes after the windup and pushes nearby, without hurting the caster', () => {
    const w = world([[0, 0], [1, 0], [5, 0]], [{ scourge: 1 }]);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, Math.round(SCOURGE.windup / DT) - 5);
    expect(w.wizards[1].hp).toBe(HP_MAX);
    steps(w, 10);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX);
    expect(w.wizards[1].vel.x).toBeGreaterThan(0);
    expect(w.wizards[2].hp).toBe(HP_MAX);
    expect(w.wizards[0].hp).toBe(HP_MAX);
  });

  it('scourge also damages obstacles and the chest in the blast', () => {
    const w = world([[0, 0]], [{ scourge: 1 }]);
    w.pillars = [{ pos: v(1.2, 0), hp: 250, alive: true, kind: 'chest' }];
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, 40);
    expect(w.pillars[0].hp).toBeLessThan(250);
  });

  it('scourge never kills its caster', () => {
    const w = world([[0, 0]], [{ scourge: 3 }]);
    w.wizards[0].hp = 30;
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, 70);
    expect(w.wizards[0].alive).toBe(true);
    expect(w.wizards[0].hp).toBeGreaterThanOrEqual(10);
  });

  it('pact makes the next damaging spell stronger and does not slow', () => {
    const w = world([[0, 0], [2, 0]], [{ pact: 1 }]);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'pact', at: v(0, 0) }]);
    steps(w, 15);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(2, 0) }]);
    steps(w, 15);
    // a vida volta um pouco (regeneração) entre o acerto e a conferência
    expect(HP_MAX - w.wizards[1].hp).toBeGreaterThan(SPELLS.lightning.levels[0].dmg * PACT.mult - 2);
    steps(w, 2);
    expect(w.wizards[0].speed).toBe(WIZ_SPEED);
  });

  it('teleport during the scourge windup cancels the blast', () => {
    const w = world([[0, 0], [1, 0]], [{ scourge: 1 }]);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, 5);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'teleport', at: v(-3, 0) }]);
    expect(w.wizards[0].casting).toBeNull();
    expect(w.wizards[0].pos.x).toBeLessThan(-1);
    steps(w, 40);
    expect(w.wizards[1].hp).toBe(HP_MAX);
    expect(w.wizards[0].itemCd.scourge).toBe(0); // não saiu: sem recarga
  });

  it('no spell goes out while the scourge is winding up', () => {
    const w = world([[0, 0], [1, 0]], [{ scourge: 1 }]);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, 5);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(2, 0) }]);
    expect(w.wizards[0].casting?.item).toBe('scourge');
    expect(w.wizards[0].cd.lightning).toBe(0);
    steps(w, 40);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX); // o Flagelo saiu mesmo assim
  });

  it('redirector turns your nearest projectile toward the cursor', () => {
    const w = world([[0, 0], [0, 5]], [{ redirector: 1 }]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(5, 0) }]);
    steps(w, 20);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'redirector', at: v(0, 5) }]);
    steps(w, 13);
    const p = w.projectiles[0];
    expect(p.vel.y).toBeGreaterThan(Math.abs(p.vel.x));
    steps(w, 80);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX);
  });

  it('scourge destroys enemy projectiles in the blast', () => {
    // a bola de fogo chega na área no meio do preparo de 0,5 s
    const w = world([[0, 0], [5.5, 0]], [{ scourge: 1 }]);
    stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'fireball', at: v(0, 0) }]);
    steps(w, 6);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, 32);
    expect(w.projectiles.length).toBe(0);
    expect(w.wizards[0].hp).toBe(HP_MAX);
  });

  it('item not owned does nothing', () => {
    const w = world([[0, 0], [1, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, 70);
    expect(w.wizards[1].hp).toBe(HP_MAX);
  });
});

describe('loja de itens', () => {
  it('buys, upgrades to the max level and respects 6 items', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    const p = m.players[0];
    p.gold = 200;
    expect(buyItem(m, 'a', 'cape')).toBe(true);
    expect(buyItem(m, 'a', 'cape')).toBe(true);
    expect(buyItem(m, 'a', 'cape')).toBe(true);
    expect(buyItem(m, 'a', 'cape')).toBe(false);
    expect(p.gold).toBe(200 - 3 * ITEMS.cape.cost);
    // o Flagelo já vem de graça e ocupa um espaço
    expect(p.items.scourge).toBe(1);
    for (const i of ['ring', 'armor', 'boots', 'watch'] as ItemId[]) expect(buyItem(m, 'a', i)).toBe(true);
    expect(itemPrice(p.items, 'pact')).toBeNull();
    expect(buyItem(m, 'a', 'pact')).toBe(false);
    expect(Object.values(p.items).filter(Boolean).length).toBe(MAX_ITEMS);
  });
});

describe('desfazer compra', () => {
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
    // o Flagelo grátis do começo não pode ser "desfeito" para ganhar ouro
    expect(undoBuy(m, 'a', 'item:scourge')).toBe(false);
  });
});

describe('vender na loja', () => {
  // loja nova: o que já foi comprado fica "de rodadas anteriores"
  const shop = () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    m.players[0].gold = 100;
    return { m, p: m.players[0] };
  };

  it('sells for 100% in the shop where it was bought, minus 5% per round held, down to 75%', () => {
    const { m, p } = shop();
    buy(m, 'a', 'lightning'); // 11
    buy(m, 'a', 'lightning'); // 8
    expect(sellValue(p, m.round, 'spell:lightning')).toBe(19);
    expect(sellValue(p, m.round + 1, 'spell:lightning')).toBe(Math.floor(19 * 0.95));
    expect(sellValue(p, m.round + 3, 'spell:lightning')).toBe(Math.floor(19 * 0.85));
    expect(sellValue(p, m.round + 20, 'spell:lightning')).toBe(Math.floor(19 * 0.75));
    m.round += 2;
    const gold = p.gold;
    expect(sell(m, 'a', 'spell:lightning')).toBe(true);
    expect(p.spells.lightning).toBe(0);
    expect(p.gold).toBe(gold + Math.floor(19 * 0.9));
    expect(p.held['spell:lightning']).toBeUndefined();
  });

  it('each level counts from the round it was bought', () => {
    const { m, p } = shop();
    buy(m, 'a', 'lightning'); // 11 na rodada 0
    m.round = 4;
    buy(m, 'a', 'lightning'); // 8 na rodada 4
    expect(sellValue(p, 4, 'spell:lightning')).toBe(Math.floor(11 * 0.8 + 8));
    expect(undoBuy(m, 'a', 'spell:lightning')).toBe(true);
    expect(p.held['spell:lightning']).toEqual([0]);
  });

  it('a room saved before this rule counts unrecorded levels from round 0', () => {
    const { m, p } = shop();
    p.spells.lightning = 1;
    expect(sellValue(p, 2, 'spell:lightning')).toBe(Math.floor(11 * 0.9));
  });

  it('items sell the same way and the free levels do not sell', () => {
    const { m, p } = shop();
    buyItem(m, 'a', 'armor');
    buyItem(m, 'a', 'armor'); // 6 + 6
    expect(sellValue(p, m.round + 1, 'item:armor')).toBe(Math.floor(12 * 0.95));
    expect(sell(m, 'a', 'item:armor')).toBe(true);
    expect(p.items.armor).toBe(0);
    expect(sell(m, 'a', 'item:scourge')).toBe(false); // nível 1 grátis
    expect(p.items.scourge).toBe(1);
    expect(sell(m, 'a', 'spell:fireball')).toBe(false); // nível 1 grátis
    expect(p.spells.fireball).toBe(1);
  });

  it('does not sell outside the shop', () => {
    const { m, p } = shop();
    buy(m, 'a', 'lightning');
    m.phase = 'playing';
    expect(sell(m, 'a', 'spell:lightning')).toBe(false);
    expect(p.spells.lightning).toBe(1);
  });
});

describe('roubo de vida (item)', () => {
  it('costs 5 per level, 6 levels, and takes an item slot', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    const p = m.players[0];
    p.gold = 100;
    expect(buyItem(m, 'a', 'vampire')).toBe(true);
    expect(p.gold).toBe(95);
    for (let i = 0; i < 5; i++) buyItem(m, 'a', 'vampire');
    expect(p.items.vampire).toBe(6);
    expect(buyItem(m, 'a', 'vampire')).toBe(false);
  });

  it('lifesteal heals the attacker', () => {
    const w = newWorld(['a', 'b'], { a: allSpells(), b: allSpells() }, { a: with_({ vampire: 6 }) });
    w.wizards[0].pos = v(0, 0);
    w.wizards[1].pos = v(2, 0);
    for (const z of w.wizards) z.invulnUntil = 0;
    w.wizards[0].hp = 500;
    stepWorld(w, [{ id: 'a', kind: 'cast', spell: 'lightning', at: v(2, 0) }]);
    steps(w, 10);
    expect(w.wizards[0].hp).toBeGreaterThan(520);
  });
});

describe('itens novos (18/10)', () => {
  const fireballAt = (w: World, x: number) => stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(x, 0) }]);
  const hits = (w: World, n: number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'hit') out.push(e.dmg);
    }
    return out;
  };

  it('lava boots cut lava damage by 35% and 60%', () => {
    for (const [lvl, cut] of [[0, 0], [1, 0.35], [2, 0.6]]) {
      const w = world([[0, 0]], [{ lava_boots: lvl }]);
      w.wizards[0].pos = v(w.arenaR + 1, 0);
      steps(w, 60);
      expect(HP_MAX - w.wizards[0].hp).toBeCloseTo(LAVA_DPS * (1 - cut), 1);
    }
  });

  it('warden takes a flat amount off each hit and you fly a bit more', () => {
    const plain = world([[0, 0], [3, 0]]);
    const warded = world([[0, 0], [3, 0]], [{}, { warden: 3 }]);
    fireballAt(plain, 3);
    fireballAt(warded, 3);
    const [a] = hits(plain, 30);
    const [b] = hits(warded, 30);
    expect(a - b).toBeCloseTo(12, 0);
    expect(warded.wizards[1].vel.x / plain.wizards[1].vel.x).toBeCloseTo(1.03, 2);
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

  it('shock boots speed you up for 3 s after a hit, and only above the regular boots', () => {
    const w = world([[0, 0], [3, 0]], [{}, { shock_boots: 1 }]);
    const base = w.wizards[1].baseSpeed;
    fireballAt(w, 3);
    steps(w, 30);
    expect(w.wizards[1].speed).toBeCloseTo(base + SHOCK_BOOTS.speed, 5);
    steps(w, Math.round(SHOCK_BOOTS.secs / DT));
    expect(w.wizards[1].speed).toBeCloseTo(base, 5);
    // as Botas nível 3 (+40) já passam das de choque (+30): nada a mais
    expect(world([[0, 0]], [{ shock_boots: 1, boots: 3 }]).wizards[0].shockBonus).toBe(0);
    expect(world([[0, 0]], [{ shock_boots: 1, boots: 1 }]).wizards[0].shockBonus).toBeCloseTo(SHOCK_BOOTS.speed - ITEMS.boots.levels[0].speed!);
  });

  it('aegis pulls you out of the lava once, when your life is low', () => {
    const w = world([[0, 0]], [{ aegis: 1 }]);
    const z = w.wizards[0];
    z.pos = v(0, w.arenaR + 1);
    z.vel = v(0, 5);
    steps(w, 30);
    expect(z.pos.y).toBeGreaterThan(w.arenaR); // vida alta: a Égide espera
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
    // segunda vez na lava: não salva de novo
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
