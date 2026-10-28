// Dica ao passar o mouse (ou focar com o teclado) em magias e itens: números do nível atual e o que muda no próximo.
import { AEGIS, AFFLICT_SPELLS, CRIT, ITEMS, SHOCK_BOOTS, WIND_BOOTS, type ItemId } from '../shared/items.ts';
import { BASIC_ATTACK, BRACE, OBSTACLES, DT, GUARD, MELEE_ARC, FRICTION, KB_SOFT_CAP, LAVA_DPS, STUN_SPEED } from '../shared/constants.ts';
import { SCRIPTS, createDemo, runDemo, type DemoId } from './demo.ts';
import { itemName, itemText, spellName, t } from './i18n.ts';
import { labelOf, uiLabel } from './keys.ts';
import { CAST_POINT, GRIP, MAX_SPELL_LEVEL, METEOR_DELAY, PACT, PIX, RECHARGE, RUSH, SHIELD, SPELLS, WARPZONE, spellLevel, spellMax, type Level, type SpellId } from '../shared/spells.ts';
import { MECHANIC_GUIDES, RULES_SHORT, n1, n2 } from './rules-text.ts';
import { COLORS } from './scene.ts';

const m = (x: number) => `${n1(x)} m`;
const s = (x: number) => `${n1(x)} s`;
// lugar da demonstração do grimório no topo da dica (withTip liga a animação quando a dica abre)
const demo = (id: DemoId) => (SCRIPTS[id] ? `<canvas class="tip-demo" data-demo="${id}" aria-hidden="true"></canvas>` : '');

// rótulos que se repetem em muitas magias
const DMG = t('Dano', 'Damage');
const KNOCK = t('Empurrão', 'Knockback');
const CD = t('Recarga', 'Cooldown');
const RANGE = t('Alcance', 'Range');
const DURATION = t('Duração', 'Duration');
const RADIUS = t('Raio', 'Radius');
const DPS = t('Dano por segundo', 'Damage per second');
const PULL = t('Puxão', 'Pull');

type Row = [label: string, value: (l: Level) => string];
// Referência sem resistência/comando/obstáculo: mesmo amortecimento e corte de residual do corpo no servidor.
export function knockDistance(dmg: number, knock: number): number {
  let speed = knock * (dmg > KB_SOFT_CAP ? Math.sqrt(KB_SOFT_CAP / dmg) : 1), distance = 0;
  const sliding = speed > STUN_SPEED;
  for (let i = 0; i < 3000 && speed > 0; i++) {
    distance += speed * DT;
    speed *= Math.exp(-FRICTION * DT);
    if (speed < .05 || (sliding && speed <= STUN_SPEED)) break;
  }
  return distance;
}
const knockMeters = (l: Level) => m(knockDistance(l.dmg, l.knock));
// todo campo do nível que muda o jogo tem uma linha (o teste confere)
export const SPELL_ROWS: Record<SpellId, Row[]> = {
  pix: [[t('Chuva de moedas', 'Coin rain'), () => s(PIX.rain)], [RADIUS, (l) => m(l.radius)], [t('Tempo dentro para controlar', 'Time inside to control'), () => s(PIX.soak)], [t('Tempo controlado', 'Time controlled'), (l) => s(l.duration)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  sniper: [[DMG,l=>n1(l.dmg)],[RANGE,l=>m(l.range)],[t('Canalização','Channel time'),()=>s(CAST_POINT.sniper)],[CD,l=>s(l.cd)]],
  channel: [[t('Preparo mínimo', 'Minimum charge'), () => '1 s'], [t('Carga máxima', 'Maximum charge'), () => '2 s'], [t('Bônus em 1 s / 2 s', 'Bonus at 1 s / 2 s'), () => '+50% / +100%'], [CD, () => '0 s']],
  closedbody: [[DURATION, l => s(l.duration)], [t('Redução de dano', 'Damage reduction'), () => '90%'], [t('Resistência a novos status', 'New status resistance'), () => '90%'], [t('Resistência a novo empurrão', 'New knockback resistance'), () => '90%'], [CD, l => s(l.cd)]],
  geyser: [[t('Suspensão e invulnerabilidade', 'Suspension and invulnerability'), l => s(l.duration)], [CD, l => s(l.cd)], [RANGE, l => m(l.range)], [t('Raio da área', 'Area radius'), l => m(l.radius)]],
  heal: [[t('Cura', 'Healing'), l => n1(l.heal)], [CD, l => s(l.cd)], [RANGE, l => m(l.range)]],
  fireball: [[DMG, (l) => n1(l.dmg)], [KNOCK, (l) => knockMeters(l)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  lightning: [[DMG, (l) => n1(l.dmg)], [KNOCK, (l) => knockMeters(l)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  homing: [[DMG, (l) => n1(l.dmg)], [KNOCK, (l) => knockMeters(l)], [CD, (l) => s(l.cd)], [t('Tempo de voo', 'Flight time'), (l) => s(l.duration)]],
  shield: [[DURATION, (l) => s(l.duration)], [t('Dano recebido', 'Damage received'), () => '0'], [t('Novo empurrão recebido', 'New knockback received'), () => `${n1(SHIELD.knock * 100)}%`], [t('Duração dos novos status', 'New status duration'), () => `${n1(SHIELD.statusDuration * 100)}%`], [t('Raio da bolha', 'Bubble radius'), (l) => m(l.radius)], [CD, (l) => s(l.cd)]],
  teleport: [[RANGE, (l) => m(l.range)], [CD, (l) => s(l.cd)]],
  swap: [[RANGE, (l) => m(l.range)], [CD, (l) => s(l.cd)]],
  grip: [[t('Atraso dos cipós', 'Vine delay'), () => s(GRIP.delay)], [RADIUS, (l) => m(l.radius)], [t('Tempo preso', 'Time gripped'), (l) => s(l.duration) + t(' ou até o 1º golpe', ' or until the 1st hit')], [t('Empurrão do golpe que solta', 'Knockback of the hit that frees'), (l) => `+${Math.round(l.scale * 100)}%`], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  meteor: [[t('Dano no centro', 'Center damage'), (l) => n1(l.dmg)], [t('Dano na borda', 'Edge damage'), (l) => n1(l.dmgMin)], [t('Atraso após marcar', 'Delay after marking'), () => `${n2(METEOR_DELAY)} s`], [t('Atordoamento', 'Stun'), (l) => `${n2(l.duration)} s`], [KNOCK, () => m(0)], [RADIUS, (l) => m(l.radius)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  rush: [[t('Avanço', 'Dash'), () => m(RUSH.dash)], [t('Tempo do avanço', 'Dash time'), () => s(RUSH.dashTime)], [t('Dano do avanço', 'Dash damage'), () => n1(RUSH.dashDmg)], [DURATION, (l) => s(l.duration)], [t('Limite de dano absorvido', 'Damage absorption cap'), (l) => n1(l.absorb)], [CD, (l) => s(l.cd)]],
  cluster: [[DMG,l=>n1(l.dmg)], [t('Incapacitar','Incapacitate'),l=>s(l.incapacitate)], [t('Cegueira','Blindness'),l=>s(l.blind)], [t('Comprimento do cone','Cone length'),l=>m(l.range)], [t('Largura na ponta','Width at far end'),l=>m(l.width)], [CD,l=>s(l.cd)]],
  boomerang: [[DMG, (l) => n1(l.dmg)], [KNOCK, (l) => knockMeters(l)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  thrust: [[t('Dano máximo', 'Max damage'), (l) => n1(l.dmg)], [t('Empurrão máximo', 'Max knockback'), (l) => knockMeters(l)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  gravity: [[DPS, (l) => n1(l.dmg)], [PULL, (l) => `${n1(l.pull)} m/s²`], [RADIUS, (l) => m(l.radius)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  rockpillar: [[t('Dano em quem está embaixo', 'Damage to whoever is under it'), (l) => n1(l.dmg)], [KNOCK, (l) => knockMeters(l)], [t('Vida da parede', 'Wall health'), () => n1(OBSTACLES.rockpillar.hp)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  bouncer: [[t('Dano no 1º', 'Damage on the 1st hit'), (l) => n1(l.dmg)], [KNOCK, (l) => knockMeters(l)], [CD, (l) => s(l.cd)], [t('Alcance por salto', 'Range per bounce'), (l) => m(l.range)]],
  drain: [[t('Dano e cura', 'Damage and healing'), (l) => n1(l.dmg)], [KNOCK, (l) => knockMeters(l)], [t('Lentidão ou pressa', 'Slow or haste'), (l) => s(l.duration)], [CD, (l) => s(l.cd)], [t('Alcance até virar', 'Range until it turns'), (l) => m(l.range)]],
  snowball: [[t('Dano por segundo encostado', 'Damage per second touching'), (l) => n1(l.dot)], [t('Explosão no centro', 'Center blast'), (l) => n1(l.dmg)], [t('Empurrão da explosão', 'Blast knockback'), (l) => knockMeters(l)], [RADIUS, (l) => m(l.radius)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  illusion: [[t('Cópia e invisibilidade', 'Copy and invisibility'), (l) => s(l.duration)], [CD, (l) => s(l.cd)]],
  magnetize: [[DURATION, (l) => s(l.duration)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  recharge: [[DMG, (l) => n1(l.dmg)], [KNOCK, (l) => knockMeters(l)], [t('Por acerto seguido', 'Per consecutive hit'), () => '+' + n1(RECHARGE.perHit)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  alteration: [[DURATION, (l) => s(l.duration)], [RADIUS, (l) => m(l.radius)], [CD, (l) => s(l.cd)]],
  link: [[DPS, (l) => n1(l.dmg)], [PULL, (l) => `${n1(l.pull)} m/s²`], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  windwalk: [[DMG, (l) => n1(l.dmg)], [KNOCK, (l) => knockMeters(l)], [DURATION, (l) => s(l.duration)], [CD, (l) => s(l.cd)]],
  splitter: [[t('Dano por filhote (8)', 'Damage per shard (8)'), (l) => n1(l.dmg)], [t('Empurrão por filhote', 'Knockback per shard'), (l) => knockMeters(l)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  warpzone: [[t('Tempo dos projéteis', 'Projectile time'), (l) => `${n1(l.scale * 100)}%`], [t('Inimigos andam', 'Enemies move at'), () => t(`${n1(WARPZONE.wizMult * 100)}% da velocidade`, `${n1(WARPZONE.wizMult * 100)}% of normal speed`)], [RADIUS, (l) => m(l.radius)], [DURATION, (l) => s(l.duration)], [CD, (l) => s(l.cd)], [RANGE, (l) => m(l.range)]],
  scourge: [[t('Dano em volta', 'Damage around you'), (l) => n1(l.dmg)], [KNOCK, (l) => knockMeters(l)], [RADIUS, (l) => m(l.radius)], [t('Preparo', 'Windup'), () => s(CAST_POINT.scourge)], [CD, (l) => s(l.cd)]],
  pact: [[t('Próxima magia de dano', 'Next damage spell'), () => t(`${n1(PACT.mult)}× dano e empurrão`, `${n1(PACT.mult)}× damage and knockback`)], [t('Janela', 'Window'), (l) => s(l.duration)], [CD, (l) => s(l.cd)]],
};

function table(rows: [string, string, string | null][]): string {
  return `<table>${rows.map(([k, now, next]) => `<tr><th>${k}</th><td>${now}</td>${next !== null ? `<td class="up">${next === now ? '' : '→ ' + next}</td>` : ''}</tr>`).join('')}</table>`;
}

export function spellTip(id: SpellId, level: number): string {
  const sp = SPELLS[id];
  const cur = spellLevel(id, level);
  const next = level >= 1 && level < spellMax(id) ? spellLevel(id, level + 1) : null;
  const head = `<b>${spellName(id)}</b> <span class="k">${labelOf(id)}</span><br><small>${level ? t(`Nível ${level} de ${spellMax(id)}`, `Level ${level} of ${spellMax(id)}`) : t('Ainda não comprada · preço ', 'Not bought yet · price ') + sp.cost}</small>`;
  const rows = SPELL_ROWS[id].map(([k, f]): [string, string, string | null] => [k, f(cur), next ? f(next) : null]);
  const foot = next ? `<small class="up">${t(`Próximo nível (${sp.up[level - 1]} de ouro): o que está à direita`, `Next level (${sp.up[level - 1]} gold): shown on the right`)}</small>` : level >= spellMax(id) ? `<small>${t('Nível máximo', 'Max level')}</small>` : '';
  return `${demo(id)}${head}<p>${RULES_SHORT[id]}</p>${table(rows)}${foot}<small class="muted">${t('Empurrão: distância que um mago sem resistência desliza.', 'Knockback: distance a wizard without resistance slides.')}</small>`;
}

// grimório: todos os níveis lado a lado; linha igual em todos os níveis vira uma célula só
function levelsTable(heads: number, rows: [string, string[]][]): string {
  const cells = (vals: string[]) => (vals.every((x) => x === vals[0]) ? `<td colspan="${heads}">${vals[0]}</td>` : vals.map((x) => `<td>${x}</td>`).join(''));
  return `<table class="lv"><tr><th>${t('Nível', 'Level')}</th>${Array.from({ length: heads }, (_, i) => `<th>${i + 1}</th>`).join('')}</tr>${rows.map(([k, vals]) => `<tr><th>${k}</th>${cells(vals)}</tr>`).join('')}</table>`;
}
export function spellLevels(id: SpellId): string {
  const sp = SPELLS[id];
  return levelsTable(spellMax(id), [[t('Ouro', 'Gold'), [sp.cost, ...sp.up].map(String)], ...SPELL_ROWS[id].map(([k, f]): [string, string[]] => [k, sp.levels.slice(0, spellMax(id)).map(f)])]);
}
export function itemLevels(id: ItemId): string {
  const n = ITEMS[id].levels.length;
  const per = Array.from({ length: n }, (_, l) => ITEM_ROWS[id]!(l));
  return levelsTable(n, [[t('Ouro', 'Gold'), per.map(() => String(ITEMS[id].cost))], ...per[0].map(([k], i): [string, string[]] => [k, per.map((r) => r[i][1])])]);
}

const KNOCK_TAKEN = t('Empurrão recebido', 'Knockback taken');
const SLOWS = t('Lentidões', 'Slows');
const WITH_BOOTS_RULE = t('vale a maior velocidade, não soma', 'the highest speed applies, no stacking');

export const ITEM_ROWS: Partial<Record<ItemId, (lvl: number) => [string, string][]>> = {
  ring: (l) => [[t('Vida máxima', 'Max health'), '+' + n1(ITEMS.ring.levels[l].hp!)]],
  cursed_ring: (l) => [[t('Vida máxima', 'Max health'), '+' + n1(ITEMS.cursed_ring.levels[l].hp!)], [KNOCK_TAKEN, `−${n1(ITEMS.cursed_ring.levels[l].kb! * 100)}%`], [SLOWS, t(`+${n1(ITEMS.cursed_ring.levels[l].debuff! * 100)}% de duração`, `+${n1(ITEMS.cursed_ring.levels[l].debuff! * 100)}% duration`)]],
  cape: (l) => [[t('Vida por segundo', 'Health per second'), '+' + n1(ITEMS.cape.levels[l].regen!)]],
  armor: (l) => [[KNOCK_TAKEN, `−${n1(ITEMS.armor.levels[l].kb! * 100)}%`]],
  boots: (l) => [[t('Velocidade', 'Speed'), `+${n1(ITEMS.boots.levels[l].speed! * 100) } cm/s`]],
  watch: (l) => [[SLOWS, t(`−${n1(-ITEMS.watch.levels[l].debuff! * 100)}% de duração`, `−${n1(-ITEMS.watch.levels[l].debuff! * 100)}% duration`)]],
  vampire: (l) => [[t('Vida de volta', 'Health back'), t(`${n1(ITEMS.vampire.levels[l].lifesteal! * 100)}% do dano causado`, `${n1(ITEMS.vampire.levels[l].lifesteal! * 100)}% of damage dealt`)]],
  lava_boots: (l) => [[t('Dano da lava', 'Lava damage'), t(`−${n1(ITEMS.lava_boots.levels[l].lava! * 100)}% (${n1(LAVA_DPS * (1 - ITEMS.lava_boots.levels[l].lava!))} por segundo)`, `−${n1(ITEMS.lava_boots.levels[l].lava! * 100)}% (${n1(LAVA_DPS * (1 - ITEMS.lava_boots.levels[l].lava!))} per second)`)]],
  warden: (l) => [[t('Dano por golpe', 'Damage per hit'), t(`−${n1(ITEMS.warden.levels[l].ward!)} (no máximo metade do golpe)`, `−${n1(ITEMS.warden.levels[l].ward!)} (at most half the hit)`)], [KNOCK_TAKEN, `+${n1(-ITEMS.warden.levels[l].kb! * 100)}%`]],
  helmet: (l) => [[KNOCK_TAKEN, `−${n1(ITEMS.helmet.levels[l].kb! * 100)}%`], [t('Alcance das magias', 'Spell range'), `−${n1(-ITEMS.helmet.levels[l].range! * 100)}%`]],
  wind_boots: (l) => [[t('Espera sem causar nem levar dano', 'Wait without dealing or taking damage'), s(WIND_BOOTS.calm[l])], [t('Velocidade', 'Speed'), `+${n1(WIND_BOOTS.speed[l] * 100)} cm/s`], [t('Acaba', 'Ends'), t('ao causar ou levar dano (golpe, lava, fogo)', 'when you deal or take damage (hit, lava, fire)')], [t('Com outras botas', 'With other boots'), WITH_BOOTS_RULE]],
  shock_boots: (l) => [[t('Ao levar um golpe', 'When you take a hit'), t(`+${n1(SHOCK_BOOTS.speed * 100)} cm/s por ${s(SHOCK_BOOTS.secs[l])}`, `+${n1(SHOCK_BOOTS.speed * 100)} cm/s for ${s(SHOCK_BOOTS.secs[l])}`)], [t('Com Botas', 'With Boots'), WITH_BOOTS_RULE]],
  lens: (l) => [[t('Chance de crítico', 'Critical chance'), `${n1(ITEMS.lens.levels[l].crit! * 100)}%`], [t('Dano do crítico', 'Critical damage'), `+${n1(CRIT.dmg * 100)}%`]],
  piercing: (l) => [[t('Dano do crítico', 'Critical damage'), t(`+${n1(ITEMS.piercing.levels[l].critDmg! * 100)}% (soma ao da Lente Letal)`, `+${n1(ITEMS.piercing.levels[l].critDmg! * 100)}% (adds to the Lethal Lens)`)], [t('Sem a Lente Letal', 'Without the Lethal Lens'), t('não há crítico', 'no critical hits')]],
  affliction: (l) => [[t('Lentidões e prisões que você aplica', 'Slows and roots you apply'), t(`+${n1(ITEMS.affliction.levels[l].afflict! * 100)}% de duração`, `+${n1(ITEMS.affliction.levels[l].afflict! * 100)}% duration`)], [t('Vale para', 'Applies to'), AFFLICT_SPELLS.map(spellName).join(', ')]],
  aegis: (l) => [[t('Quando', 'When'), t(`na lava com ${AEGIS.hp} de vida ou menos`, `in the lava with ${AEGIS.hp} health or less`)], [t('Efeito', 'Effect'), t(`volta parado para ${n1(AEGIS.back * 100)}% do raio da arena`, `brings you back, standing still, to ${n1(AEGIS.back * 100)}% of the arena radius`)], [t('Salvamentos', 'Saves'), t(`${l + 1}: cada um gasta 1 nível`, `${l + 1}: each one costs 1 level`)]],
  // Scourge item (26/10, #227): the same rows as the spell tip, read at the item level
  scourge: (l) => SPELL_ROWS.scourge.map(([k, f]): [string, string] => [k, f(spellLevel('scourge', l + 1))]),
};

// the Scourge is the only active item (26/10, #227)
const KIND = (id: ItemId) => (id === 'scourge' ? t('ativo', 'active') : t('passivo', 'passive'));
export function itemTip(id: ItemId, level: number): string {
  const it = ITEMS[id];
  const max = it.levels.length;
  const head = `<b>${itemName(id)}</b>${id === 'scourge' ? ` <span class="k">${labelOf('scourge')}</span>` : ''}<br><small>${level ? t(`Nível ${level} de ${max}`, `Level ${level} of ${max}`) : t('Ainda não comprado', 'Not bought yet')} · ${KIND(id)} · ${t(`${it.cost} de ouro por nível`, `${it.cost} gold per level`)}</small>`;
  const rows = ITEM_ROWS[id]!;
  const cur = rows(Math.max(0, level - 1));
  const next = level >= 1 && level < max ? rows(level) : null;
  const body = table(cur.map(([k, v], i): [string, string, string | null] => [k, v, next ? next[i][1] : null]));
  return `${demo(id)}${head}<p>${itemText(id)}</p>${body}${next ? `<small class="up">${t('Próximo nível: o que está à direita', 'Next level: shown on the right')}</small>` : level >= max ? `<small>${t('Nível máximo', 'Max level')}</small>` : ''}`;
}

// Attack and Hold ground (issue #401): same tip shape as a spell, numbers read from the shared constants so they never drift
// alt: a versão para teste escolhida na loja (issue #402) está ativa; a dica troca para o texto e os números dela, porque a tecla faz outra coisa
export function mechanicTip({ id, title: name }: (typeof MECHANIC_GUIDES)[number], alt = false): string {
  const basic = id === 'basic';
  const key = uiLabel(basic ? 'basic' : 'stop');
  const text = basic
    ? alt
      ? t(`Aperte ${key} e bata na direção do cursor: golpe em arco de ${MELEE_ARC.angle}° e ${n1(MELEE_ARC.range)} m que acerta todos os inimigos dentro dele, sem cancelar a magia deles. Movimento, ${uiLabel('stop')} ou magia cancelam o preparo sem gastar a recarga.`, `Press ${key} and strike toward the cursor: a ${MELEE_ARC.angle}° arc of ${n1(MELEE_ARC.range)} m that hits every enemy in it, without cancelling their spell. Moving, ${uiLabel('stop')} or a spell cancel the windup without spending the cooldown.`)
      : t(`Aperte ${key} e clique num inimigo: corpo a corpo até ${n1(BASIC_ATTACK.melee)} m, projétil mais longe. Movimento, ${uiLabel('stop')} ou magia cancelam o preparo sem gastar a recarga.`, `Press ${key} and click an enemy: melee within ${n1(BASIC_ATTACK.melee)} m, a projectile farther away. Moving, ${uiLabel('stop')} or a spell cancel the windup without spending the cooldown.`)
    : alt
      ? t(`Segure ${key}: para e defende na hora. Leva o mesmo dano; o empurrão recebido diminui de 0% a ${n1(GUARD.max * 100)}% em ${n1(GUARD.ramp)} s segurando e volta a 0% ao soltar. Não anda e as recargas de magias e do Atacar ficam paradas enquanto segura.`, `Hold ${key}: stops and guards at once. Same damage taken; knockback taken shrinks from 0% to ${n1(GUARD.max * 100)}% less over ${n1(GUARD.ramp)} s held and resets on release. You cannot walk and spell and Attack cooldowns stay frozen while held.`)
      : t(`Segure ${key}: para na hora e, depois do preparo, resiste a novos empurrões. Não anda e as recargas pausam enquanto segura; magias prontas continuam.`, `Hold ${key}: stops at once and, after the windup, resists new knockback. You cannot walk and cooldowns pause while held; ready spells still work.`);
  const rows: [string, string, null][] = basic
    ? [[DMG, n1(BASIC_ATTACK.dmg), null], [t('Preparo', 'Windup'), s(BASIC_ATTACK.windup), null], [CD, s(BASIC_ATTACK.cd), null], [RANGE, alt ? `${MELEE_ARC.angle}° · ${m(MELEE_ARC.range)}` : m(BASIC_ATTACK.range), null]]
    : alt
      ? [[t('Preparo', 'Windup'), s(0), null], [KNOCK_TAKEN, `0% → −${n1(GUARD.max * 100)}% (${s(GUARD.ramp)})`, null]]
      : [[t('Preparo', 'Windup'), s(BRACE.windup), null], [KNOCK_TAKEN, `−${n1(BRACE.resistance * 100)}%`, null]];
  const tag = alt ? t('Versão para teste (troque na loja)', 'Test version (switch in the shop)') : t('Fixa: todo mago tem, não troca de posição nem vende', 'Fixed: every wizard has it, it cannot be moved or sold');
  return `${demo(id)}<b>${name}</b> <span class="k">${key}</span><br><small>${tag}</small><p>${text}</p>${table(rows)}`;
}


// carta do Ascensão: os números de agora e, à direita, os de depois da carta; sem preço (no modo não há ouro)
export function spellCardTip(id: SpellId, from: number, to: number, swap = false): string {
  const sp = SPELLS[id];
  const after = sp.levels[Math.min(spellMax(id), to) - 1];
  const head = `<b>${spellName(id)}</b><br><small>${from ? t(`Nível ${from} → ${to}`, `Level ${from} → ${to}`) : t(`Magia nova · entra no nível ${to}`, `New spell · comes in at level ${to}`)}</small>`;
  const rows = SPELL_ROWS[id].map(([k, f]): [string, string, string | null] => (from ? [k, f(sp.levels[from - 1]), f(after)] : [k, f(after), null]));
  const foot = from ? `<small class="up">${t('Depois da carta: o que está à direita', 'After the card: shown on the right')}</small>` : swap ? `<small class="up">${t('Barra cheia: entra no nível da magia que sair', 'Full bar: comes in at the level of the spell it replaces')}</small>` : '';
  return `${demo(id)}${head}<p>${RULES_SHORT[id]}</p>${table(rows)}${foot}`;
}
export function itemCardTip(id: ItemId, from: number): string {
  const it = ITEMS[id];
  const to = Math.min(it.levels.length, from + 1);
  const rows = ITEM_ROWS[id]!;
  const head = `<b>${itemName(id)}</b><br><small>${from ? t(`Nível ${from} → ${to}`, `Level ${from} → ${to}`) : t('Item novo · nível 1', 'New item · level 1')} · ${KIND(id)}</small>`;
  const body = table(rows(to - 1).map(([k, v], i): [string, string, string | null] => (from ? [k, rows(from - 1)[i][1], v] : [k, v, null])));
  return `${demo(id)}${head}<p>${itemText(id)}</p>${body}${from ? `<small class="up">${t('Depois da carta: o que está à direita', 'After the card: shown on the right')}</small>` : ''}`;
}

let tipEl: HTMLDivElement | null = null;
let owner: HTMLElement | null = null; // elemento cuja dica está aberta

// liga a dica a um elemento; o conteúdo é gerado na hora (o nível pode ter mudado)
export function withTip<T extends HTMLElement>(target: T, html: () => string): T {
  const show = () => {
    owner = target;
    tipEl ??= Object.assign(document.createElement('div'), { className: 'tip', role: 'tooltip' });
    if (!tipEl.isConnected) document.body.append(tipEl);
    tipEl.innerHTML = html();
    tipEl.hidden = false; // escondida, a altura medida seria zero e a dica cobriria o botão
    const r = target.getBoundingClientRect();
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    const x = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    const y = r.top - h - 10 > 8 ? r.top - h - 10 : r.bottom + 10;
    tipEl.style.transform = `translate(${x}px, ${y}px)`;
    // uma demo por vez: a próxima dica troca o innerHTML e desliga o canvas desta; no toque o CSS esconde o canvas (largura 0) e ela nem começa
    const c = tipEl.querySelector<HTMLCanvasElement>('canvas[data-demo]');
    if (c?.clientWidth) runDemo(createDemo(c, c.dataset.demo as DemoId, COLORS.slice(0, 3)).tick, () => c.isConnected && !tipEl!.hidden, matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  const hide = () => tipEl && (tipEl.hidden = true);
  target.addEventListener('mouseenter', show);
  target.addEventListener('mouseleave', hide);
  // focusin/focusout sobem do botão para o cartão: focar "Comprar" pelo teclado mostra a dica do cartão
  target.addEventListener('focusin', show);
  target.addEventListener('focusout', hide);
  return target;
}

// com `within`, só esconde se a dica aberta é de algo dentro dele (ou que já saiu da tela): redesenhar a loja não fecha a dica da barra
export function hideTip(within?: HTMLElement) {
  if (!tipEl || (within && owner?.isConnected && !within.contains(owner))) return;
  tipEl.hidden = true;
}
