// Dica ao passar o mouse (ou focar com o teclado) em magias e itens: números do nível atual e o que muda no próximo.
import { ITEMS, PACT, REDIRECTOR, SCOURGE, type ItemId } from '../shared/items.ts';
import { labelOf } from './keys.ts';
import { MAX_SPELL_LEVEL, RECHARGE, RUSH, SPELLS, type Level, type SpellId } from '../shared/spells.ts';

const n1 = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const m = (x: number) => `${n1(x)} m`;
const s = (x: number) => `${n1(x)} s`;

type Row = [label: string, value: (l: Level) => string];
const SPELL_ROWS: Record<SpellId, Row[]> = {
  fireball: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  lightning: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  homing: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Tempo de voo', (l) => s(l.duration)]],
  shield: [['Duração', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)]],
  teleport: [['Alcance', (l) => m(l.range)], ['Recarga', (l) => s(l.cd)]],
  swap: [['Alcance', (l) => m(l.range)], ['Recarga', (l) => s(l.cd)]],
  grip: [['Tempo preso', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  meteor: [['Dano no centro', (l) => n1(l.dmg)], ['Dano na borda', (l) => n1(l.dmgMin)], ['Raio', (l) => m(l.radius)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  rush: [['Avanço', () => m(RUSH.dash)], ['Duração', (l) => s(l.duration)], ['Dano absorvido', (l) => n1(l.absorb)], ['Recarga', (l) => s(l.cd)]],
  cluster: [['Dano por projétil', (l) => n1(l.dmg)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  boomerang: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  thrust: [['Dano máximo', (l) => n1(l.dmg)], ['Empurrão máximo', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  gravity: [['Dano por segundo', (l) => n1(l.dmg)], ['Puxão', (l) => `${n1(l.pull)} m/s²`], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  rockpillar: [['Duração', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  bouncer: [['Dano no 1º', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance por salto', (l) => m(l.range)]],
  drain: [['Dano e cura', (l) => n1(l.dmg)], ['Lentidão ou pressa', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)], ['Alcance até virar', (l) => m(l.range)]],
  snowball: [['Dano por segundo encostado', (l) => n1(l.dot)], ['Explosão no centro', (l) => n1(l.dmg)], ['Raio', (l) => m(l.radius)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  twin: [['Dano de cada', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  magnetize: [['Duração', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  recharge: [['Dano', (l) => n1(l.dmg)], ['Por acerto seguido', () => '+' + n1(RECHARGE.perHit)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  alteration: [['Duração', (l) => s(l.duration)], ['Raio', (l) => m(l.radius)], ['Recarga', (l) => s(l.cd)]],
  link: [['Dano por segundo', (l) => n1(l.dmg)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  windwalk: [['Dano', (l) => n1(l.dmg)], ['Empurrão', (l) => m(l.knock / 1.166)], ['Duração', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)]],
  splitter: [['Dano por filhote (8)', (l) => n1(l.dmg)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
  warpzone: [['Tempo dos projéteis', (l) => `${n1(l.scale * 100)}%`], ['Raio', (l) => m(l.radius)], ['Duração', (l) => s(l.duration)], ['Recarga', (l) => s(l.cd)], ['Alcance', (l) => m(l.range)]],
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
  return `${head}${table(rows)}${foot}<small class="muted">Empurrão: distância que um mago sem dano acumulado desliza.</small>`;
}

const ITEM_ROWS: Partial<Record<ItemId, (lvl: number) => [string, string][]>> = {
  ring: (l) => [['Vida máxima', '+' + n1(ITEMS.ring.levels[l].hp!)]],
  cursed_ring: (l) => [['Vida máxima', '+' + n1(ITEMS.cursed_ring.levels[l].hp!)], ['Empurrão recebido', `−${n1(ITEMS.cursed_ring.levels[l].kb! * 100)}%`], ['Lentidões', `+${n1(ITEMS.cursed_ring.levels[l].debuff! * 100)}% de duração`]],
  cape: (l) => [['Vida por segundo', '+' + n1(ITEMS.cape.levels[l].regen!)]],
  armor: (l) => [['Empurrão recebido', `−${n1(ITEMS.armor.levels[l].kb! * 100)}%`]],
  boots: (l) => [['Velocidade', `+${n1(ITEMS.boots.levels[l].speed! * 100) } cm/s`]],
  watch: (l) => [['Lentidões', `−${n1(-ITEMS.watch.levels[l].debuff! * 100)}% de duração`]],
  vampire: (l) => [['Vida de volta', `${n1(ITEMS.vampire.levels[l].lifesteal! * 100)}% do dano causado`]],
  scourge: (l) => [['Dano em volta', n1(SCOURGE.dmg[l])], ['Raio', m(SCOURGE.radius)], ['Preparo', s(SCOURGE.windup)], ['Recarga', s(SCOURGE.cd)]],
  redirector: () => [['Recarga', s(REDIRECTOR.cd)], ['Penalidade', `+${REDIRECTOR.kbPenalty * 100}% de empurrão por ${s(REDIRECTOR.penaltyTime)}`]],
  pact: () => [['Próxima magia de dano', `${n1(PACT.mult)}× dano e empurrão`], ['Janela', s(PACT.window)], ['Recarga', s(PACT.cd)]],
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

// liga a dica a um elemento; o conteúdo é gerado na hora (o nível pode ter mudado)
export function withTip<T extends HTMLElement>(target: T, html: () => string): T {
  const show = () => {
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
  target.addEventListener('focus', show);
  target.addEventListener('blur', hide);
  return target;
}

export function hideTip() {
  if (tipEl) tipEl.hidden = true;
}
