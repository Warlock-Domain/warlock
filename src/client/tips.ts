// Dica ao passar o mouse (ou focar com o teclado) em magias e itens: números do nível atual e o que muda no próximo.
import { AEGIS, ITEMS, PACT, REDIRECTOR, SCOURGE, SHOCK_BOOTS, WIND_BOOTS, type ItemId } from '../shared/items.ts';
import { LAVA_DPS } from '../shared/constants.ts';
import { labelOf } from './keys.ts';
import { MAX_SPELL_LEVEL, RECHARGE, RUSH, SPELLS, WARPZONE, type Level, type SpellId } from '../shared/spells.ts';
import { RULES_SHORT } from './rules-text.ts';

const n1 = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const m = (x: number) => `${n1(x)} m`;
const s = (x: number) => `${n1(x)} s`;

type Row = [label: string, value: (l: Level) => string];
// todo campo do nível que muda o jogo tem uma linha (o teste confere)
export const SPELL_ROWS: Record<SpellId, Row[]> = {
  fireball: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  lightning: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  homing: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Tempo de voo', (l) => s(l.duration)]],
  shield: [['Duração', (l) => s(l.duration)], ['Raio da bolha', (l) => m(l.radius)], ['Recarga', (l) => s(l.cd)]],
  teleport: [['Alcance', (l) => m(l.range)], ['Recarga', (l) => s(l.cd)]],
  swap: [['Alcance', (l) => m(l.range)], ['Recarga', (l) => s(l.cd)]],
  grip: [['Tempo preso', (l) => s(l.duration) + ' ou até o 1º golpe'], ['Empurrão do golpe que solta', (l) => `+${Math.round(l.scale * 100)}%`], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  meteor: [['Dano no centro', (l) => n1(l.dmg)], ['Dano na borda', (l) => n1(l.dmgMin)], ['Empurrão no centro', (l) => m(l.knock / 1.166)], ['Raio', (l) => m(l.radius)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  rush: [['Avanço', () => m(RUSH.dash)], ['Duração', (l) => s(l.duration)], ['Dano absorvido', (l) => n1(l.absorb)], ['Recarga', (l) => s(l.cd)]],
  cluster: [['Dano por projétil', (l) => n1(l.dmg)], ['Empurrão por projétil', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  boomerang: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  thrust: [['Dano máximo', (l) => n1(l.dmg)], ['Empurrão máximo', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  gravity: [['Dano por segundo', (l) => n1(l.dmg)], ['Puxão', (l) => `${n1(l.pull)} m/s²`], ['Raio', (l) => m(l.radius)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  rockpillar: [['Duração', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  bouncer: [['Dano no 1º', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance por salto', (l) => m(l.range)]],
  drain: [['Dano e cura', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Lentidão ou pressa', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)], ['Alcance até virar', (l) => m(l.range)]],
  snowball: [['Dano por segundo encostado', (l) => n1(l.dot)], ['Explosão no centro', (l) => n1(l.dmg)], ['Empurrão da explosão', (l) => m(l.knock / 1.166)], ['Raio', (l) => m(l.radius)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  twin: [['Dano de cada', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  magnetize: [['Duração', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  recharge: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Por acerto seguido', () => '+' + n1(RECHARGE.perHit)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  alteration: [['Duração', (l) => s(l.duration)], ['Raio', (l) => m(l.radius)], ['Recarga', (l) => s(l.cd)]],
  link: [['Dano por segundo', (l) => n1(l.dmg)], ['Puxão', (l) => `${n1(l.pull)} m/s²`], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  windwalk: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Duração', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)]],
  splitter: [['Dano por filhote (8)', (l) => n1(l.dmg)], ['Empurrão por filhote', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  warpzone: [['Tempo dos projéteis', (l) => `${n1(l.scale * 100)}%`], ['Inimigos andam', () => `${n1(WARPZONE.wizMult * 100)}% da velocidade`], ['Raio', (l) => m(l.radius)], ['Duração', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
};

function table(rows: [string, string, string | null][]): string {
  return `<table>${rows.map(([k, now, next]) => `<tr><th>${k}</th><td>${now}</td>${next !== null ? `<td class="up">${next === now ? '' : '→ ' + next}</td>` : ''}</tr>`).join('')}</table>`;
}

export function spellTip(id: SpellId, level: number): string {
  const sp = SPELLS[id];
  const cur = sp.levels[Math.max(0, level - 1)];
  const next = level >= 1 && level < MAX_SPELL_LEVEL ? sp.levels[level] : null;
  const head = `<b>${sp.name}</b> <span class="k">${labelOf(id)}</span><br><small>${level ? `Nível ${level} de ${MAX_SPELL_LEVEL}` : 'Ainda não comprada · preço ' + sp.cost}</small>`;
  const rows = SPELL_ROWS[id].map(([k, f]): [string, string, string | null] => [k, f(cur), next ? f(next) : null]);
  const foot = next ? `<small class="up">Próximo nível (${sp.up[level - 1]} de ouro): o que está à direita</small>` : level >= MAX_SPELL_LEVEL ? '<small>Nível máximo</small>' : '';
  return `${head}<p>${RULES_SHORT[id]}</p>${table(rows)}${foot}<small class="muted">Empurrão: distância que um mago sem dano acumulado desliza.</small>`;
}

export const ITEM_ROWS: Partial<Record<ItemId, (lvl: number) => [string, string][]>> = {
  ring: (l) => [['Vida máxima', '+' + n1(ITEMS.ring.levels[l].hp!)]],
  cursed_ring: (l) => [['Vida máxima', '+' + n1(ITEMS.cursed_ring.levels[l].hp!)], ['Empurrão recebido', `−${n1(ITEMS.cursed_ring.levels[l].kb! * 100)}%`], ['Lentidões', `+${n1(ITEMS.cursed_ring.levels[l].debuff! * 100)}% de duração`]],
  cape: (l) => [['Vida por segundo', '+' + n1(ITEMS.cape.levels[l].regen!)]],
  armor: (l) => [['Empurrão recebido', `−${n1(ITEMS.armor.levels[l].kb! * 100)}%`]],
  boots: (l) => [['Velocidade', `+${n1(ITEMS.boots.levels[l].speed! * 100) } cm/s`]],
  watch: (l) => [['Lentidões', `−${n1(-ITEMS.watch.levels[l].debuff! * 100)}% de duração`]],
  vampire: (l) => [['Vida de volta', `${n1(ITEMS.vampire.levels[l].lifesteal! * 100)}% do dano causado`]],
  scourge: (l) => [['Dano em volta', n1(SCOURGE.dmg[l])], ['Raio', m(SCOURGE.radius)], ['Preparo', s(SCOURGE.windup)], ['Recarga', s(SCOURGE.cd)]],
  redirector: () => [['Recarga', s(REDIRECTOR.cd)], ['Desvia', 'todos os seus projéteis voando'], ['Sem projétil voando', 'não gasta a recarga']],
  pact: () => [['Próxima magia de dano', `${n1(PACT.mult)}× dano e empurrão`], ['Janela', s(PACT.window)], ['Recarga', s(PACT.cd)]],
  lava_boots: (l) => [['Dano da lava', `−${n1(ITEMS.lava_boots.levels[l].lava! * 100)}% (${n1(LAVA_DPS * (1 - ITEMS.lava_boots.levels[l].lava!))} por segundo)`]],
  warden: (l) => [['Dano por golpe', `−${n1(ITEMS.warden.levels[l].ward!)} (no máximo metade do golpe)`], ['Empurrão recebido', `+${n1(-ITEMS.warden.levels[l].kb! * 100)}%`]],
  helmet: () => [['Empurrão recebido', `−${n1(ITEMS.helmet.levels[0].kb! * 100)}%`], ['Alcance das magias', `−${n1(-ITEMS.helmet.levels[0].range! * 100)}%`]],
  wind_boots: () => [['5 s sem causar nem levar dano', `+${n1(WIND_BOOTS.speed * 100)} cm/s`], ['Acaba', 'ao causar ou levar dano (golpe, lava, fogo)'], ['Com outras botas', 'vale a maior velocidade, não soma']],
  shock_boots: () => [['Ao levar um golpe', `+${n1(SHOCK_BOOTS.speed * 100)} cm/s por ${s(SHOCK_BOOTS.secs)}`], ['Com Botas', 'vale a maior velocidade, não soma']],
  aegis: () => [['Quando', `na lava com ${AEGIS.hp} de vida ou menos`], ['Efeito', `volta parado para ${n1(AEGIS.back * 100)}% do raio da arena`], ['Usos', '1: quebra ao salvar você (compre de novo na loja)']],
};

export function itemTip(id: ItemId, level: number): string {
  const it = ITEMS[id];
  const max = it.levels.length;
  const head = `<b>${it.name}</b>${it.key ? ` <span class="k">${labelOf(id)}</span>` : ''}<br><small>${level ? `Nível ${level} de ${max}` : 'Ainda não comprado'} · ${it.key ? 'ativo' : 'passivo'} · ${it.cost} de ouro por nível</small>`;
  const rows = ITEM_ROWS[id]!;
  const cur = rows(Math.max(0, level - 1));
  const next = level >= 1 && level < max ? rows(level) : null;
  const body = table(cur.map(([k, v], i): [string, string, string | null] => [k, v, next ? next[i][1] : null]));
  return `${head}<p>${it.text}</p>${body}${next ? '<small class="up">Próximo nível: o que está à direita</small>' : level >= max ? '<small>Nível máximo</small>' : ''}`;
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
