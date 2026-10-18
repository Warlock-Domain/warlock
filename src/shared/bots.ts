// Bots: usam qualquer magia e item ativo que tiverem e compram seguindo um plano sorteado no começo da partida.
import { FRICTION, OBSTACLES, PROJ_R, WIZ_R } from './constants.ts';
import type { Cmd, Projectile, Wizard, World } from './sim.ts';
import { ITEM_IDS, SCOURGE, itemPrice, type ItemId } from './items.ts';
import { CAST_POINT, MAX_SPELLS, METEOR_DELAY, SPELL_IDS, priceOf, spellCount, spellLevel, type SpellId } from './spells.ts';
import { add, clampLen, dist, dot, len, norm, scale, sub, v, type Vec } from './vec.ts';

export type BotPick = { kind: 'spell'; id: SpellId } | { kind: 'item'; id: ItemId };
// plano de compras: o que comprar, na ordem; depois da lista, como gastar o resto (menor nível, ordem do plano ou sorteio)
export type BotPlan = { buys: BotPick[]; upgrade: 'lowest' | 'first' | 'random' };
type Buyer = { gold: number; spells: Record<SpellId, number>; items?: Record<ItemId, number>; plan?: BotPlan };

// o bot antigo: 5 magias fixas, depois defesa, depois a magia de menor nível
export const CLASSIC_PLAN: BotPlan = {
  buys: [
    ...(['lightning', 'homing', 'meteor', 'cluster', 'shield'] as SpellId[]).map((id): BotPick => ({ kind: 'spell', id })),
    ...(['armor', 'ring', 'boots', 'cape'] as ItemId[]).map((id): BotPick => ({ kind: 'item', id })),
  ],
  upgrade: 'lowest',
};

function shuffle<T>(a: T[], rand: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// sorteia 2 a 5 magias (além da Bola de fogo) e 0 a 3 itens, em ordem sorteada (sempre começa por uma magia)
export function randomPlan(rand: () => number): BotPlan {
  const spells = shuffle(SPELL_IDS.filter((s) => s !== 'fireball'), rand).slice(0, 2 + Math.floor(rand() * (MAX_SPELLS - 2)));
  const items = shuffle(ITEM_IDS.filter((i) => i !== 'scourge'), rand).slice(0, Math.floor(rand() * 4));
  const buys: BotPick[] = spells.map((id) => ({ kind: 'spell', id }));
  for (const id of items) buys.splice(1 + Math.floor(rand() * buys.length), 0, { kind: 'item', id });
  return { buys, upgrade: (['lowest', 'first', 'random'] as const)[Math.floor(rand() * 3)] };
}

// quem escolhe o plano de cada bot novo (o simulador de balanceamento troca)
export const botConfig = { planner: randomPlan as (rand: () => number) => BotPlan };

// uma compra por chamada; null = nada a comprar agora (ou guardando ouro para o próximo do plano)
export function botBuy(p: Buyer, rand: () => number = Math.random): BotPick | null {
  // os bots são recriados a cada partida, então o plano é sorteado uma vez por partida
  const plan = (p.plan ??= botConfig.planner(rand));
  const level = (b: BotPick) => (b.kind === 'spell' ? p.spells[b.id] : (p.items?.[b.id] ?? 0));
  const price = (b: BotPick) =>
    b.kind === 'spell' ? (p.spells[b.id] === 0 && spellCount(p.spells) >= MAX_SPELLS ? null : priceOf(b.id, p.spells[b.id])) : p.items ? itemPrice(p.items, b.id) : null;
  const next = plan.buys.find((b) => level(b) === 0 && price(b) !== null);
  if (next) return price(next)! <= p.gold ? next : null;
  const seen = new Set<string>();
  const all: BotPick[] = [...plan.buys, ...SPELL_IDS.map((id): BotPick => ({ kind: 'spell', id })), ...(p.items ? ITEM_IDS.map((id): BotPick => ({ kind: 'item', id })) : [])];
  const ups = all.filter((b) => level(b) > 0 && (price(b) ?? Infinity) <= p.gold && !seen.has(b.kind + b.id) && seen.add(b.kind + b.id));
  if (!ups.length) return null;
  if (plan.upgrade === 'random') return ups[Math.floor(rand() * ups.length)];
  if (plan.upgrade === 'lowest') ups.sort((a, b) => level(a) - level(b));
  return ups[0];
}

export function botCmds(w: World, id: string, rand: () => number): Cmd[] {
  const me = w.wizards.find((z) => z.id === id && z.alive);
  if (!me) return [];
  const cmds: Cmd[] = [];
  const ally = (z: Wizard) => z === me || (me.team !== null && z.team === me.team);
  const ready = (s: SpellId) => me.spells[s] > 0 && w.t >= me.cd[s];
  const itemReady = (i: ItemId) => me.items[i] > 0 && w.t >= me.itemCd[i];
  const inside = (p: Vec, margin: number) => len(p) < w.arenaR - margin;
  const jitter = (r: number): Vec => v((rand() - 0.5) * r, (rand() - 0.5) * r);
  // um só lançamento por chamada: um segundo comando de magia no mesmo passo cancelaria o primeiro
  const cast = (spell: SpellId, at: Vec) => (cmds.push({ id, kind: 'cast', spell, at }), cmds);
  const use = (item: ItemId, at: Vec) => (cmds.push({ id, kind: 'item', item, at }), cmds);

  // projétil inimigo que vai passar perto em até 0,6 s (ou meteoro caindo em cima)
  let threat: Projectile | null = null;
  let tHit = Infinity;
  for (const p of w.projectiles) {
    const owner = w.wizards.find((z) => z.id === p.owner);
    // não ameaçam: Gravidade (só puxa), Zona de dobra (parada), cura do Drenar e volta da Recarga, Elo já preso
    if ((owner && ally(owner)) || p.kind === 'gravity' || p.kind === 'warpzone' || (p.back && (p.kind === 'drain' || p.kind === 'recharge'))) continue;
    if (p.kind === 'link' && (p.target || p.pillar !== undefined)) continue;
    if (p.kind === 'meteor') {
      if (dist(p.pos, me.pos) < spellLevel('meteor', p.level).radius + WIZ_R && p.until - w.t < tHit) [threat, tHit] = [p, p.until - w.t];
      continue;
    }
    const rel = sub(me.pos, p.pos);
    // Míssil teleguiado em mim faz curva: a previsão em linha reta não serve, reage pela distância
    if (p.kind === 'homing' && p.target === id && dot(p.vel, rel) > 0) {
      const t = len(rel) / Math.max(1, len(p.vel));
      if (t < 0.5 && t < tHit) [threat, tHit] = [p, t];
    }
    const vv = dot(p.vel, p.vel);
    const t = vv > 1e-6 ? dot(rel, p.vel) / vv : -1;
    if (t < 0 || t > 0.6 || t >= tHit || len(sub(rel, scale(p.vel, t))) > WIZ_R + PROJ_R + 0.25) continue;
    [threat, tHit] = [p, t];
  }
  // o Flagelo em preparo não deixa sair nada além do Teleporte
  const winding = me.casting?.item === 'scourge';
  if (threat) {
    const meteor = threat.kind === 'meteor';
    const side = meteor ? norm(sub(me.pos, threat.pos)) : norm(v(-threat.vel.y, threat.vel.x));
    const away = meteor || dot(side, me.pos) < 0 ? side : scale(side, -1); // de lado, para o lado do centro
    // reação humana: o escudo não sobe sempre nem no último instante (o bot perfeito inflava o Escudo para 1,89×; 15% deixa perto dos amigos, 1,12×)
    if (!meteor && !winding && ready('shield') && tHit > 0.15 && tHit < 0.5 && rand() < 0.15) return cast('shield', me.pos);
    // Alteração: troca de lugar com o projétil quando ele estiver quase chegando
    if (!meteor && !winding && ready('alteration') && tHit < 0.35) return cast('alteration', me.pos);
    // Raio derruba o míssil no caminho (metade das vezes: precisa de mira)
    if (threat.kind === 'homing' && !winding && ready('lightning') && dist(threat.pos, me.pos) > 1 && rand() < 0.5) return cast('lightning', add(threat.pos, scale(threat.vel, 0.1)));
    // Magnetizar num obstáculo perto volta em mim: repele os projéteis inimigos por alguns segundos
    const post = !meteor && !winding && ready('magnetize') && w.t >= me.magnetUntil && rand() < 0.5 &&
      w.pillars.find((q) => q.alive && dist(q.pos, me.pos) - OBSTACLES[q.kind].r > 0.7 && dist(q.pos, me.pos) - OBSTACLES[q.kind].r < 2.4);
    if (post) return cast('magnetize', post.pos);
    if (ready('teleport') && rand() < 0.5 && inside(add(me.pos, scale(away, 4)), 1.5)) return cast('teleport', add(me.pos, scale(away, 4)));
    // Zona de dobra no caminho: o projétil inimigo atravessa a esfera em câmera lenta
    if (!meteor && !winding && ready('warpzone') && dist(threat.pos, me.pos) > 1.2) return cast('warpzone', add(me.pos, scale(norm(sub(threat.pos, me.pos)), Math.min(1.5, dist(threat.pos, me.pos) / 2))));
    if (!meteor && !winding && ready('rockpillar') && dist(threat.pos, me.pos) > 1.6) return cast('rockpillar', add(me.pos, scale(norm(sub(threat.pos, me.pos)), 1.1)));
    if (!winding && ready('rush') && rand() < 0.4 && inside(add(me.pos, scale(away, 3)), 1)) return cast('rush', add(me.pos, scale(away, 3)));
    // Caminhada no vento: mais rápido para sair do caminho
    if (!winding && ready('windwalk') && rand() < 0.4) return (cast('windwalk', me.pos), cmds.push({ id, kind: 'move', to: add(me.pos, scale(away, 3)) }), cmds);
    if (rand() < 0.7) cmds.push({ id, kind: 'move', to: add(me.pos, scale(away, 2)) });
  }
  // Bola de fogo no Míssil teleguiado que ainda vem longe: o choque estoura longe do bot (às vezes: precisa de mira)
  const far = !threat && ready('fireball') && w.projectiles.find((p) => p.kind === 'homing' && p.target === id && dot(p.vel, sub(me.pos, p.pos)) > 0 && dist(p.pos, me.pos) > 4 && dist(p.pos, me.pos) < 6.5);
  if (far && rand() < 0.3) return cast('fireball', add(far.pos, scale(far.vel, 0.35)));

  let enemy: Wizard | null = null;
  // quem está na Caminhada no vento é invisível: o bot também não o vê
  for (const z of w.wizards) if (z.alive && !ally(z) && w.t >= z.windUntil && (!enemy || dist(z.pos, me.pos) < dist(enemy.pos, me.pos))) enemy = z;
  // inimigo sem reação (preso, ligado pelo meu Elo, lento, magnetizado, na minha Gravidade ou Zona): é a hora de emendar o dano
  const opened = (z: Wizard) =>
    w.t < z.gripUntil || w.t < z.slowUntil || (w.t < z.magnetUntil && z.magnet > 0) ||
    w.projectiles.some((p) => p.owner === id && ((p.kind === 'link' && p.target === z.id) || ((p.kind === 'gravity' || p.kind === 'warpzone') && dist(p.pos, z.pos) < 2.5)));
  const prey = w.wizards.find((z) => z.alive && !ally(z) && w.t >= z.windUntil && opened(z) && dist(z.pos, me.pos) < 10);
  if (prey) enemy = prey;

  // sai de lado da linha da puxada do Elo: o puxado passa direto com o embalo (parado, o choque jogaria o bot longe, até na lava)
  // a linha é o embalo dele (já puxado) ou a reta até o bot; sai para o lado em que já está (senão o do centro), para não ficar rodando
  const aside = (z: Wizard): Cmd => {
    const moving = len(z.vel) > 1;
    const ax = moving ? norm(z.vel) : norm(sub(me.pos, z.pos));
    const off = dot(v(-ax.y, ax.x), sub(me.pos, z.pos));
    const side = scale(v(-ax.y, ax.x), moving && Math.abs(off) > 0.2 ? Math.sign(off) : dot(v(-ax.y, ax.x), me.pos) > 0 ? -1 : 1);
    return { id, kind: 'move', to: add(me.pos, add(scale(side, 3), scale(norm(me.pos), -0.6))) };
  };
  const held = w.projectiles.find((p) => p.owner === id && p.kind === 'link' && p.target);
  const pulled = held && w.wizards.find((z) => z.id === held.target && z.alive);
  if (pulled) return [aside(pulled)];
  // deslizando para a lava: Pilar de pedra logo à frente segura o bot
  if (ready('rockpillar') && len(me.vel) > 2 && !inside(add(me.pos, scale(me.vel, 1 / FRICTION)), 0.3)) return cast('rockpillar', add(me.pos, scale(norm(me.vel), 1.15)));

  // perto da borda (ou na lava): volta para o centro, com Teleporte, Investida, Estocada ou Troca se tiver
  if (!inside(me.pos, 1.2)) {
    const home = add(scale(norm(me.pos), w.arenaR * 0.3), jitter(2));
    cmds.push({ id, kind: 'move', to: add(scale(norm(me.pos), w.arenaR * 0.4), jitter(2)) });
    if (ready('teleport')) return cast('teleport', home);
    if (winding) return cmds;
    if (ready('rush')) return cast('rush', home);
    if (ready('thrust')) return cast('thrust', home);
    // Elo num obstáculo mais para dentro: puxa o bot até ele
    const L = spellLevel('link', me.spells.link || 1);
    const post = w.pillars.find((q) => q.alive && len(q.pos) < len(me.pos) - 1 && dist(q.pos, me.pos) < L.range * 0.9 && dist(q.pos, me.pos) > 1.2);
    if (ready('link') && post) return cast('link', post.pos);
    // ou no inimigo bem mais para dentro: o bot sai de lado e ele passa direto para a lava
    if (enemy && ready('link') && len(enemy.pos) < len(me.pos) - 1.5 && dist(enemy.pos, me.pos) > 2 && dist(enemy.pos, me.pos) < L.range * 0.9) return (cast('link', enemy.pos), cmds.push(aside(enemy)), cmds);
    if (ready('windwalk')) return cast('windwalk', home);
    // Troca: só vale com o inimigo bem mais para dentro (ele vai para a borda no lugar do bot)
    if (enemy && ready('swap') && len(enemy.pos) < len(me.pos) - 1.5 && dist(enemy.pos, me.pos) < spellLevel('swap', me.spells.swap).range) return cast('swap', enemy.pos);
    return cmds;
  }
  if (!threat) {
    const loot = w.loots.find((l) => dist(l.pos, me.pos) < 5);
    if (loot && rand() < 0.3) cmds.push({ id, kind: 'move', to: loot.pos });
    else if (!me.target && rand() < 0.25) cmds.push({ id, kind: 'move', to: scale(add(me.pos, jitter(6)), Math.min(1, (w.arenaR * 0.6) / Math.max(1, len(me.pos)))) });
  }
  // na Caminhada no vento qualquer magia a encerra: só corre para encostar no inimigo
  if (w.t < me.windUntil) return enemy ? [...cmds.filter((c) => c.kind !== 'move'), { id, kind: 'move', to: enemy.pos }] : cmds;
  if (!enemy || me.casting) return cmds;
  const E = enemy;
  const d = dist(E.pos, me.pos);
  const dir = norm(sub(E.pos, me.pos));
  // mira onde o alvo vai estar: andando até o destino dele e deslizando com o empurrão (que cai com o atrito)
  const lead = (speed: number, delay: number) => {
    const t = delay + (speed > 0 ? d / speed : 0);
    const walk = E.target ? scale(norm(sub(E.target, E.pos)), Math.min(dist(E.target, E.pos), E.speed * t)) : v(0, 0);
    return add(add(add(E.pos, walk), scale(E.vel, (1 - Math.exp(-FRICTION * t)) / FRICTION)), jitter(0.6));
  };

  // Redirecionador: projétil próprio passando perto do alvo sem ir na direção dele
  if (itemReady('redirector')) {
    const mine = w.projectiles.find((p) => p.owner === id && p.kind !== 'meteor' && dist(p.pos, E.pos) < 3.5 && dist(p.pos, E.pos) > 0.5 && dot(norm(p.vel), norm(sub(E.pos, p.pos))) < 0.9);
    if (mine) return use('redirector', E.pos);
  }

  // Drenar ferido: cura com o dano que causar
  if (ready('drain') && me.hp < me.hpMax * 0.7) {
    const L = spellLevel('drain', me.spells.drain);
    if (d < L.range) return cast('drain', lead(L.speed, CAST_POINT.drain));
  }
  // projétil próprio a caminho do alvo (para Magnetizar e Zona de dobra)
  const incoming = w.projectiles.some((p) => p.owner === id && p.kind !== 'meteor' && p.kind !== 'warpzone' && dist(p.pos, E.pos) < 4 && dot(p.vel, sub(E.pos, p.pos)) > 0);
  // a lava a até k metros atrás do alvo, na linha do bot até ele
  const lavaBehind = (k: number) => !inside(add(E.pos, scale(dir, k)), 0);
  const slideEnd = add(E.pos, scale(E.vel, 1 / FRICTION));
  // magia de dano pronta (ou em até 1 s) para emendar no controle
  const loaded = SPELL_IDS.some((x) => me.spells[x] > 0 && spellLevel(x, me.spells[x]).dmg > 0 && w.t + 1 >= me.cd[x]);
  // candidatos: cada magia pronta com o alvo no alcance; sorteia uma (a jogada certa da vez, `now`, sai sem sorteio)
  const options: (() => Cmd[])[] = [];
  const dmgOpt: boolean[] = [];
  // obstáculo vivo no caminho do bot até o ponto
  const blocked = (to: Vec) => w.pillars.some((q) => {
    if (!q.alive) return false;
    const ab = sub(to, me.pos);
    const t = Math.max(0, Math.min(1, dot(sub(q.pos, me.pos), ab) / Math.max(1e-6, dot(ab, ab))));
    return dist(add(me.pos, scale(ab, t)), q.pos) < OBSTACLES[q.kind].r + PROJ_R + 0.1;
  });
  let damage = false;
  let now: (() => Cmd[]) | null = null;
  let meteor: (() => Cmd[]) | null = null;
  for (const s of SPELL_IDS) {
    if (!ready(s) || s === 'shield' || s === 'swap') continue; // Escudo e Troca só na defesa e na borda
    const L = spellLevel(s, me.spells[s]);
    const cp = CAST_POINT[s] ?? 0.1;
    let at: Vec | null = null;
    let prio = false;
    if (s === 'fireball') at = d < L.range + 1 && d > WIZ_R * 3 ? lead(L.speed, cp) : null;
    else if (s === 'homing') at = d < 12 ? E.pos : null;
    else if (s === 'meteor') at = d < L.range ? lead(0, cp + METEOR_DELAY) : null;
    else if (s === 'grip') {
      // só com dano pronto para emendar; preso na lava (ou deslizando para ela) não volta andando; e o Agarrar corta o Flagelo em preparo
      prio = !inside(E.pos, 0.6) || !inside(slideEnd, 0.3) || (E.casting?.item === 'scourge' && d < 3);
      at = d < L.range * 0.85 && (loaded || prio) ? lead(L.speed, cp) : null;
    }
    else if (s === 'thrust') at = d > 1.5 && d < L.range && inside(add(me.pos, scale(dir, Math.min(d, L.range))), 1.5) ? lead(L.speed, cp) : null;
    else if (s === 'rush') at = d < 3.2 && inside(add(me.pos, scale(dir, 3)), 1) ? E.pos : null;
    else if (s === 'teleport') {
      const to = add(me.pos, clampLen(scale(dir, d - 4), L.range));
      at = d > 7.5 && inside(to, 2) && rand() < 0.3 ? to : null;
    } else if (s === 'rockpillar') at = d > 3 && d < 7 && rand() < 0.25 ? add(me.pos, scale(dir, 1.3)) : null;
    // Magnetizar no inimigo: os projéteis do bot (já voando ou os próximos) curvam para ele
    else if (s === 'magnetize') {
      at = d < L.range * 0.8 && (incoming || loaded) ? lead(L.speed, cp) : null;
      prio = true;
    }
    // Zona de dobra em cima do inimigo: os tiros dele saem em câmera lenta enquanto os do bot chegam
    else if (s === 'warpzone') at = d < L.range && (incoming || rand() < 0.15) ? E.pos : null;
    // Caminhada no vento: invisível e mais rápido para encostar (o dano sai no toque)
    else if (s === 'windwalk') at = d > 1.2 && d < 5 && inside(E.pos, 1) ? E.pos : null;
    // Elo com a lava atrás do bot: o bot sai de lado e o puxado passa direto para a lava; de vez em quando pelo dano,
    // mas nunca com o inimigo mais perto da lava (a puxada o salvaria)
    else if (s === 'link') {
      // de perto não dá tempo de sair da frente; obstáculo no caminho puxaria o próprio bot até ele
      const to = lead(L.speed, cp);
      prio = !inside(add(me.pos, scale(dir, -3)), 0);
      at = d > 3.5 && d < L.range * 0.9 && (prio || (loaded && len(E.pos) < len(me.pos) + 0.5 && rand() < 0.3)) && !blocked(to) ? to : null;
    }
    // Gêmeos: as duas curvas encontram-se no ponto, mas o caminho é mais longo que a reta
    else if (s === 'twin') at = d < L.range ? lead(L.speed * 0.7, cp) : null;
    // Bola de neve: lenta, só de perto
    else if (s === 'snowball') {
      at = d < L.range ? lead(L.speed, cp) : null;
      prio = lavaBehind(3.5); // arrasta o alvo até a lava e explode lá
    }
    // Gravidade passando pelo alvo rumo à lava: de perto ele não consegue andar contra o puxão
    else if (s === 'gravity') {
      at = d < L.range ? lead(L.speed, cp) : null;
      prio = d < 2.8 && lavaBehind(2);
    }
    // Divisor: estoura no ponto e os filhotes seguem mais 4,6 m
    else if (s === 'splitter') at = d < L.range + 3 ? add(me.pos, clampLen(sub(lead(L.speed, cp), me.pos), Math.max(1, d - 2))) : null;
    else if (s === 'alteration') continue; // só na defesa
    // Raio, Rajada, Bumerangue, Ricochete, Gravidade e qualquer magia nova de dano: no alcance, mirando à frente do alvo
    else if (L.dmg > 0) at = d < (L.range || 6) ? lead(L.speed, cp) : null;
    if (!at) continue;
    const to = at;
    const opt =
      s === 'windwalk' ? () => (cast(s, to), cmds.push({ id, kind: 'move', to: E.pos }), cmds)
      : s === 'link' ? () => (cast(s, to), cmds.push(aside(E)), cmds) // já sai de lado enquanto o Elo voa
      : () => cast(s, to);
    if (prio) now ??= opt;
    if (s === 'meteor') meteor = opt;
    options.push(opt);
    dmgOpt.push(L.dmg > 0);
    if (L.dmg > 0) damage = true;
  }
  if (itemReady('scourge') && d < SCOURGE.radius * 0.8) {
    options.push(() => use('scourge', me.pos));
    dmgOpt.push(true);
    damage = true;
  }
  if (now) return now();
  // combo: com o alvo aberto, só dano e sem hesitar (antes os bots prendiam e não aproveitavam, e o controle rendia 0,75 a 0,86×)
  if (prey && damage) {
    const hits = options.filter((_, i) => dmgOpt[i]);
    // preso não sai do Meteoro a tempo: é o golpe mais forte
    if (meteor && w.t < E.gripUntil) return meteor();
    return hits[Math.floor(rand() * hits.length)]();
  }
  if (!options.length || rand() >= 0.7) return cmds;
  // Pacto antes de uma magia de dano: ela sai no próximo comando (as duas juntas perderiam o Pacto)
  if (damage && itemReady('pact') && w.t >= me.pactUntil && rand() < 0.5) return use('pact', me.pos);
  return options[Math.floor(rand() * options.length)]();
}
