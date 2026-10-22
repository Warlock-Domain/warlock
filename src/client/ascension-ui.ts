// Tela do modo Ascensão: as 3 cartas do intervalo (no lugar da loja), o nível no placar e o líder marcado.
// A regra do modo mora em src/shared/ascension.ts; aqui só se desenha o que a sala manda em PublicPlayer.asc.
import { ASC_ROUNDS, DOUBLE_FROM, MARK_KB, markedLeader, type Card, type Kind } from '../shared/ascension.ts';
import { ITEMS } from '../shared/items.ts';
import type { PublicPlayer, PublicRoom } from '../shared/protocol.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELL_IDS, spellCount, type SpellId } from '../shared/spells.ts';
import { ICON, ITEM_ICON, el, icon, type Child } from './icons.ts';
import { itemName, itemText, spellName, t } from './i18n.ts';
import { SPELL_USE, spellClass } from './rules-text.ts';
import { itemCardTip, spellCardTip, withTip } from './tips.ts';

export type AscActions = { card: (slot: number, i: number, swap?: SpellId) => void; reroll: () => void; keep: (slot: number) => void };
type Dialog = (cls: string, title: string, body: Node[]) => { close: () => void };

export const ASC_MODE_TEXT = t(
  `${ASC_ROUNDS} rodadas. Todo intervalo dá 1 magia nova e 1 item; golpes dão XP e cada nível sobe 1 magia (cada escolha é 1 carta entre 3). Sem ouro nem loja. Pontos pela ordem de queda, em dobro nas rodadas ${DOUBLE_FROM} a ${ASC_ROUNDS}; vence a maior soma.`,
  `${ASC_ROUNDS} rounds. Every break gives 1 new spell and 1 item; hits give XP and each level upgrades 1 spell (each pick is 1 card out of 3). No gold or shop. Points by fall order, doubled in rounds ${DOUBLE_FROM} to ${ASC_ROUNDS}; highest total wins.`,
);

const KIND_TITLE: Record<Kind, string> = { spell: t('Magia nova', 'New spell'), item: t('Item', 'Item'), up: t('Subir magia (nível ganho)', 'Spell upgrade (level up)') };
const ascLeader = (r: PublicRoom) => markedLeader(r.players.map((p) => [p.id, p.asc?.level ?? 1]));

// "Nv 3" no placar, com o XP na dica; o líder ganha a marca
export function ascLevel(r: PublicRoom, p: PublicPlayer): Child {
  if (!p.asc) return null;
  const lead = ascLeader(r)?.id === p.id;
  return el('span', { class: 'asc-lv' + (lead ? ' lead' : ''), title: t(`Nível ${p.asc.level} · ${p.asc.xp} de ${p.asc.next} XP`, `Level ${p.asc.level} · ${p.asc.xp} of ${p.asc.next} XP`) + (lead ? t(' · líder marcado: leva mais empurrão', ' · marked leader: takes more knockback') : '') },
    lead ? '◎ ' : '', t(`Nv ${p.asc.level}`, `Lv ${p.asc.level}`));
}

// nome da carta (magia ou item), na carta e no aviso do sorteio por tempo esgotado (main.ts)
export const cardName = (c: Card) => (c.kind === 'item' ? itemName(c.id) : spellName(c.id));

function cardFace(c: Card, p: PublicPlayer) {
  if (c.kind === 'item') {
    const lvl = p.items[c.id];
    return { cls: 'is-item', ico: ITEM_ICON[c.id], kind: lvl ? t(`Item · nível ${lvl + 1}`, `Item · level ${lvl + 1}`) : t('Item novo', 'New item'), name: cardName(c), text: itemText(c.id), max: ITEMS[c.id].levels.length, lvl };
  }
  const lvl = p.spells[c.id];
  const to = c.kind === 'up' ? Math.min(MAX_SPELL_LEVEL, lvl + (c.rare ? 2 : 1)) : 1;
  const swap = c.kind === 'spell' && spellCount(p.spells) >= MAX_SPELLS;
  const kind = c.kind === 'up' ? t(`Subir magia · nível ${lvl} → ${to}`, `Spell upgrade · level ${lvl} → ${to}`)
    : swap ? t('Magia nova · troca, herda o nível', 'New spell · swap, keeps the level') : t('Magia nova · nível 1', 'New spell · level 1');
  return { cls: spellClass(c.id), ico: ICON[c.id], kind, name: cardName(c), text: SPELL_USE[c.id], max: MAX_SPELL_LEVEL, lvl };
}

// intervalo do Ascensão: barra de XP, as 3 cartas (ou a espera), novo sorteio para quem está atrás e o placar ao lado
export function ascPanel(r: PublicRoom, me: string, act: AscActions, dialog: Dialog, side: Child[]): HTMLElement {
  const mine = r.players.find((p) => p.id === me);
  if (!mine?.asc) return el('div', { class: 'card' }, el('p', {}, t('Você está assistindo. Entra na próxima partida.', 'You are watching. You join the next match.')));
  const a = mine.asc;
  const full = spellCount(mine.spells) >= MAX_SPELLS;
  // magia nova com a barra cheia: escolhe qual sai
  const choose = (slot: number, i: number, c: Card) => {
    if (c.kind !== 'spell' || !full) return act.card(slot, i);
    const d = dialog('asc-swap', t(`${spellName(c.id)} entra no lugar de qual?`, `${spellName(c.id)} replaces which?`),
      [el('div', { class: 'asc-swap-list' }, ...SPELL_IDS.filter((s) => mine.spells[s] > 0).map((s) => el('button', { type: 'button', class: spellClass(s), onclick: () => (d.close(), act.card(slot, i, s)) },
        icon(ICON[s]), ` ${spellName(s)} · ${t('nível', 'level')} ${mine.spells[s]}`, el('small', {}, t(` (${spellName(c.id)} entra no nível ${mine.spells[s]})`, ` (${spellName(c.id)} comes in at level ${mine.spells[s]})`)))))]);
  };
  // uma fileira por escolha do intervalo: magia nova, item e um subir magia por nível ganho; a escolha fica marcada e
  // dá para trocar até o intervalo acabar (as fileiras não fecham; Fernando, 21/10)
  const rows = a.offer.map((cards, slot) => {
    const pick = a.pick[slot];
    return el('section', { class: 'asc-row' + (pick ? ' done' : '') }, el('h3', {}, KIND_TITLE[a.todo[slot]], pick ? el('span', { class: 'asc-done' }, t(' ✓ escolhida', ' ✓ picked')) : null),
      el('div', { class: 'asc-cards' }, ...cards.map((c, i) => {
        const f = cardFace(c, mine);
        const on = pick?.i === i;
        // a mesma janelinha da loja: números de agora → depois da carta
        const tip = () => (c.kind === 'item' ? itemCardTip(c.id, mine.items[c.id]) : c.kind === 'up' ? spellCardTip(c.id, mine.spells[c.id], Math.min(MAX_SPELL_LEVEL, mine.spells[c.id] + (c.rare ? 2 : 1))) : spellCardTip(c.id, 0, 1, full));
        return withTip(el('button', { type: 'button', class: `asc-card ${f.cls}` + (c.kind === 'up' && c.rare ? ' rare' : '') + (on ? ' chosen' : ''), 'aria-pressed': String(on), 'data-key': `card-${slot}-${i}`, onclick: () => choose(slot, i, c) },
          el('span', { class: 'asc-kind' }, f.kind), el('span', { class: 'ico' }, icon(f.ico)), el('b', {}, f.name), el('small', {}, f.text),
          c.kind === 'up' && c.rare ? el('span', { class: 'asc-rare' }, t('Rara: +2 níveis', 'Rare: +2 levels')) : null,
          on && pick?.swap ? el('span', { class: 'asc-swapped' }, t(`No lugar de ${spellName(pick.swap)}`, `Replaces ${spellName(pick.swap)}`)) : null), tip);
      })),
      // barra cheia: magia nova é troca, e trocar é escolha (pode recusar)
      a.todo[slot] === 'spell' && full ? el('button', { type: 'button', class: 'asc-keep' + (pick?.i === -1 ? ' chosen' : ''), 'aria-pressed': String(pick?.i === -1), 'data-key': `keep-${slot}`, onclick: () => act.keep(slot) }, t('Manter as minhas magias', 'Keep my spells')) : null);
  });
  const left = a.pick.filter((p) => !p).length;
  const pct = Math.min(100, Math.round((100 * a.xp) / Math.max(1, a.next)));
  const lead = ascLeader(r);
  return el('div', { class: 'card asc' },
    el('div', { class: 'asc-main' },
      el('div', { class: 'shop-head' }, el('h2', { class: 'title' }, r.round === 0 ? t('Ascensão · cartas iniciais', 'Ascension · starting cards') : t(`Ascensão · depois da rodada ${r.round} de ${ASC_ROUNDS}`, `Ascension · after round ${r.round} of ${ASC_ROUNDS}`)),
        el('small', {}, t(`${spellCount(mine.spells)} de ${MAX_SPELLS} magias`, `${spellCount(mine.spells)} of ${MAX_SPELLS} spells`))),
      el('div', { class: 'asc-xp', title: `${a.xp} / ${a.next} XP` }, el('b', {}, t(`Nível ${a.level}`, `Level ${a.level}`)), el('span', { class: 'asc-bar' }, el('i', { style: `width:${pct}%` })), el('small', {}, `${a.xp} / ${a.next} XP`)),
      a.todo.length > 0
        ? el('div', { class: 'asc-rows' }, el('p', { class: 'asc-pick' + (left ? '' : ' ready') }, left ? t(`Escolha 1 carta em cada fileira (falta${left > 1 ? 'm' : ''} ${left})`, `Pick 1 card in each row (${left} left)`) : t('Tudo escolhido. Dá para trocar até a rodada começar.', 'All picked. You can still change until the round starts.')), ...rows,
          a.rerolls > 0 ? el('button', { type: 'button', class: 'asc-reroll', onclick: act.reroll }, t('Novo sorteio (1 por intervalo, para quem está atrás do líder)', 'Reroll (1 per break, for those behind the leader)')) : null)
        : el('p', { class: 'muted' }, t('Sem carta nova desta vez. Esperando os outros escolherem.', 'No new card this time. Waiting for the others to pick.')),
      lead ? el('small', { class: 'muted' }, t(`Líder marcado: ${r.players.find((p) => p.id === lead.id)?.name} leva +${Math.round(MARK_KB * lead.above * 100)}% de empurrão.`, `Marked leader: ${r.players.find((p) => p.id === lead.id)?.name} takes +${Math.round(MARK_KB * lead.above * 100)}% knockback.`)) : null),
    el('aside', { class: 'asc-side' }, ...side));
}
