// Tela do modo Ascensão: as 3 cartas do intervalo (no lugar da loja), o nível no placar e o líder marcado.
// A regra do modo mora em src/shared/ascension.ts; aqui só se desenha o que a sala manda em PublicPlayer.asc.
import { ASC_ROUNDS, MARK_KB, markedLeader, type Card } from '../shared/ascension.ts';
import { ITEMS } from '../shared/items.ts';
import type { PublicPlayer, PublicRoom } from '../shared/protocol.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELL_IDS, spellCount, type SpellId } from '../shared/spells.ts';
import { ICON, ITEM_ICON, el, icon, type Child } from './icons.ts';
import { itemName, itemText, spellName, t } from './i18n.ts';
import { SPELL_USE, spellClass } from './rules-text.ts';

export type AscActions = { card: (i: number, swap?: SpellId) => void; reroll: () => void };
type Dialog = (cls: string, title: string, body: Node[]) => { close: () => void };

export const ASC_MODE_TEXT = t(
  `${ASC_ROUNDS} rodadas. Golpes dão XP; cada nível vira 1 carta entre 3 no intervalo (magia nova, subir magia ou item). Sem ouro nem loja. Pontos pela ordem de queda; vence a maior soma.`,
  `${ASC_ROUNDS} rounds. Hits give XP; each level becomes 1 card out of 3 between rounds (new spell, spell upgrade or item). No gold or shop. Points by fall order; highest total wins.`,
);

const ascLeader = (r: PublicRoom) => markedLeader(r.players.map((p) => [p.id, p.asc?.level ?? 1]));

// "Nv 3" no placar, com o XP na dica; o líder ganha a marca
export function ascLevel(r: PublicRoom, p: PublicPlayer): Child {
  if (!p.asc) return null;
  const lead = ascLeader(r)?.id === p.id;
  return el('span', { class: 'asc-lv' + (lead ? ' lead' : ''), title: t(`Nível ${p.asc.level} · ${p.asc.xp} de ${p.asc.next} XP`, `Level ${p.asc.level} · ${p.asc.xp} of ${p.asc.next} XP`) + (lead ? t(' · líder marcado: leva mais empurrão', ' · marked leader: takes more knockback') : '') },
    lead ? '◎ ' : '', t(`Nv ${p.asc.level}`, `Lv ${p.asc.level}`));
}

function cardFace(c: Card, p: PublicPlayer) {
  if (c.kind === 'item') {
    const lvl = p.items[c.id];
    return { cls: 'is-item', ico: ITEM_ICON[c.id], kind: lvl ? t(`Item · nível ${lvl + 1}`, `Item · level ${lvl + 1}`) : t('Item novo', 'New item'), name: itemName(c.id), text: itemText(c.id), max: ITEMS[c.id].levels.length, lvl };
  }
  const lvl = p.spells[c.id];
  const to = c.kind === 'up' ? Math.min(MAX_SPELL_LEVEL, lvl + (c.rare ? 2 : 1)) : 1;
  const kind = c.kind === 'up' ? t(`Subir magia · nível ${lvl} → ${to}`, `Spell upgrade · level ${lvl} → ${to}`) : t('Magia nova · nível 1', 'New spell · level 1');
  return { cls: spellClass(c.id), ico: ICON[c.id], kind, name: spellName(c.id), text: SPELL_USE[c.id], max: MAX_SPELL_LEVEL, lvl };
}

// intervalo do Ascensão: barra de XP, as 3 cartas (ou a espera), novo sorteio para quem está atrás e o placar ao lado
export function ascPanel(r: PublicRoom, me: string, act: AscActions, dialog: Dialog, side: Child[]): HTMLElement {
  const mine = r.players.find((p) => p.id === me);
  if (!mine?.asc) return el('div', { class: 'card' }, el('p', {}, t('Você está assistindo. Entra na próxima partida.', 'You are watching. You join the next match.')));
  const a = mine.asc;
  const full = spellCount(mine.spells) >= MAX_SPELLS;
  // magia nova com a barra cheia: escolhe qual sai
  const choose = (i: number, c: Card) => {
    if (c.kind !== 'spell' || !full) return act.card(i);
    const d = dialog('asc-swap', t(`${spellName(c.id)} entra no lugar de qual?`, `${spellName(c.id)} replaces which?`),
      [el('div', { class: 'asc-swap-list' }, ...SPELL_IDS.filter((s) => mine.spells[s] > 0).map((s) => el('button', { type: 'button', class: spellClass(s), onclick: () => (d.close(), act.card(i, s)) },
        icon(ICON[s]), ` ${spellName(s)} · ${t('nível', 'level')} ${mine.spells[s]}`)))]);
  };
  const cards = a.offer.map((c, i) => {
    const f = cardFace(c, mine);
    return el('button', { type: 'button', class: `asc-card ${f.cls}` + (c.kind === 'up' && c.rare ? ' rare' : ''), 'data-key': `card-${i}`, onclick: () => choose(i, c) },
      el('span', { class: 'asc-kind' }, f.kind), el('span', { class: 'ico' }, icon(f.ico)), el('b', {}, f.name), el('small', {}, f.text),
      c.kind === 'up' && c.rare ? el('span', { class: 'asc-rare' }, t('Rara: +2 níveis', 'Rare: +2 levels')) : null);
  });
  const pct = Math.min(100, Math.round((100 * a.xp) / Math.max(1, a.next)));
  const lead = ascLeader(r);
  return el('div', { class: 'card asc' },
    el('div', { class: 'asc-main' },
      el('div', { class: 'shop-head' }, el('h2', { class: 'title' }, r.round === 0 ? t('Ascensão · carta inicial', 'Ascension · starting card') : t(`Ascensão · depois da rodada ${r.round} de ${ASC_ROUNDS}`, `Ascension · after round ${r.round} of ${ASC_ROUNDS}`)),
        el('small', {}, t(`${spellCount(mine.spells)} de ${MAX_SPELLS} magias`, `${spellCount(mine.spells)} of ${MAX_SPELLS} spells`))),
      el('div', { class: 'asc-xp', title: `${a.xp} / ${a.next} XP` }, el('b', {}, t(`Nível ${a.level}`, `Level ${a.level}`)), el('span', { class: 'asc-bar' }, el('i', { style: `width:${pct}%` })), el('small', {}, `${a.xp} / ${a.next} XP`)),
      a.picks > 0
        ? el('div', {}, el('p', { class: 'asc-pick' }, a.picks > 1 ? t(`Escolha 1 carta (faltam ${a.picks})`, `Pick 1 card (${a.picks} left)`) : t('Escolha 1 carta', 'Pick 1 card')),
          el('div', { class: 'asc-cards' }, ...cards),
          a.rerolls > 0 ? el('button', { type: 'button', class: 'asc-reroll', onclick: act.reroll }, t('Novo sorteio (1 por intervalo, para quem está atrás do líder)', 'Reroll (1 per break, for those behind the leader)')) : null)
        : el('p', { class: 'muted' }, t('Sem carta nova desta vez. Esperando os outros escolherem.', 'No new card this time. Waiting for the others to pick.')),
      lead ? el('small', { class: 'muted' }, t(`Líder marcado: ${r.players.find((p) => p.id === lead.id)?.name} leva +${Math.round(MARK_KB * lead.above * 100)}% de empurrão.`, `Marked leader: ${r.players.find((p) => p.id === lead.id)?.name} takes +${Math.round(MARK_KB * lead.above * 100)}% knockback.`)) : null),
    el('aside', { class: 'asc-side' }, ...side));
}
