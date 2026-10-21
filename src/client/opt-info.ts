// Botão "i" das opções da partida (pedido do Fernando, 18/10): o que cada opção faz e o que muda em cada valor,
// com os números lidos do código. Clique ou toque fixa a explicação (✕, Esc ou toque fora fecham); mouse em cima e foco pelo teclado mostram.
import { BOT_SKILL } from '../shared/bots.ts';
import { ARENA_IDS } from '../shared/arena.ts';
import { ASSIST_GOLD, CHEST, COUNTDOWN_MS, DM_RESPAWN, DM_ROUND_MS, KILL_GOLD, RECOVERY, ROUND_END_MS, ROUND_GOLD, RUNE, SUDDEN, TOP_DMG_GOLD, WIN_GOLD } from '../shared/constants.ts';
import { DM_GOALS, OPTION_CHOICES, PACE, type MatchOpts, type Mode } from '../shared/match.ts';
import { arenaName, t } from './i18n.ts';
import { UI_ICON, el, icon, iconButton } from './icons.ts';
import { n1, pct } from './rules-text.ts';

const s = (ms: number) => `${n1(ms / 1000)} s`;
const list = (rows: string[]) => `<ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>`;

const ARENA_TEXT: Record<(typeof ARENA_IDS)[number], string> = {
  circle: t('a pedra redonda de sempre', 'the usual round rock'),
  ring: t('anel com lava no meio: quem cai no buraco também queima', 'a ring with lava in the middle: falling into the hole burns too'),
  islands: t('duas ilhas ligadas por uma ponte estreita', 'two islands joined by a narrow bridge'),
  cross: t('cruz de quatro braços: os cantos são lava', 'a four-armed cross: the corners are lava'),
};
// nomes do ritmo e da dificuldade (aqui e nas opções da sala)
export const PACE_NAME: Record<MatchOpts['pace'], string> = { short: t('Curto', 'Short'), normal: 'Normal', long: t('Longo', 'Long') };
export const SKILL_NAME: Record<MatchOpts['difficulty'], string> = { easy: t('Fácil', 'Easy'), normal: 'Normal', hard: t('Difícil', 'Hard'), auto: t('Automático', 'Auto') };

// explicação de cada opção (HTML curto); a meta depende do modo
export const OPT_INFO: Record<keyof MatchOpts, (mode: Mode) => string> = {
  shop: () => `<p>${t('Tempo da loja entre as rodadas. A loja fecha antes quando todos clicam Pronto.', 'Shop time between rounds. The shop closes early when everyone clicks Ready.')}</p>${list(OPTION_CHOICES.shop.map((v) => `${v >= 120 ? '2 min' : `${v} s`}`))}`,
  pace: () => `<p>${t('Espera antes de cada rodada (contagem) e depois dela (fim de rodada).', 'Wait before each round (countdown) and after it (round end).')}</p>${list((['short', 'normal', 'long'] as const).map((k) =>
    t(`${PACE_NAME[k]}: contagem ${s(COUNTDOWN_MS * PACE[k])}, fim de rodada ${s(ROUND_END_MS * PACE[k])}`, `${PACE_NAME[k]}: countdown ${s(COUNTDOWN_MS * PACE[k])}, round end ${s(ROUND_END_MS * PACE[k])}`)))}`,
  economy: () => `<p>${t(`Multiplica todo ouro ganho na partida: por rodada ${ROUND_GOLD}, vitória ${WIN_GOLD}, abate ${KILL_GOLD}, top dano ${TOP_DMG_GOLD}, assistência ${ASSIST_GOLD}, baú 1 a cada ${CHEST.goldEvery} s, recuperação até ${RECOVERY.max} (e o ouro inicial).`,
    `Multiplies all gold earned in the match: ${ROUND_GOLD} per round, ${WIN_GOLD} per win, ${KILL_GOLD} per kill, ${TOP_DMG_GOLD} for top damage, ${ASSIST_GOLD} per assist, chest 1 every ${CHEST.goldEvery} s, catch-up up to ${RECOVERY.max} (and the starting gold).`)}</p>${list(OPTION_CHOICES.economy.map((v) =>
    t(`×${n1(v)}: rodada ${n1(ROUND_GOLD * v)}, vitória ${n1(WIN_GOLD * v)}, abate ${n1(KILL_GOLD * v)}${v === 1 ? ' (o normal)' : v > 1 ? ` (${pct(v - 1)} a mais)` : ` (${pct(1 - v)} a menos)`}`,
      `×${n1(v)}: round ${n1(ROUND_GOLD * v)}, win ${n1(WIN_GOLD * v)}, kill ${n1(KILL_GOLD * v)}${v === 1 ? ' (normal)' : v > 1 ? ` (${pct(v - 1)} more)` : ` (${pct(1 - v)} less)`}`)))}`,
  startGold: () => `<p>${t('Ouro de cada um no começo da partida (também multiplicado pelo Ouro ganho).', 'Everyone’s gold at the start of the match (also multiplied by Gold earned).')}</p>${list(OPTION_CHOICES.startGold.map((v) => t(`${v} de ouro`, `${v} gold`)))}`,
  goal: (mode) => `<p>${t('Pontos para vencer a partida.', 'Points needed to win the match.')}</p>${list(OPTION_CHOICES.goal.map((v) => t(`${v} rodadas nas Rodadas e nos Times, ou ${DM_GOALS[v]} abates no Deathmatch`, `${v} rounds in Rounds and Teams, or ${DM_GOALS[v]} kills in Deathmatch`)))}<small>${t('Agora', 'Now')}: ${mode === 'deathmatch' ? t('Deathmatch (conta abates)', 'Deathmatch (counts kills)') : t('conta rodadas vencidas', 'counts rounds won')}.</small>`,
  runes: () => `<p>${t(`Uma runa por vez aparece num ponto livre: a primeira aos ${RUNE.first} s e a próxima ${RUNE.every} s depois de alguém pegar. Dura ${RUNE.secs} s.`,
    `One rune at a time appears on a free spot: the first at ${RUNE.first} s and the next ${RUNE.every} s after someone picks it up. Lasts ${RUNE.secs} s.`)}</p>${list([
    t(`Pressa: +${pct(RUNE.haste)} de velocidade`, `Haste: +${pct(RUNE.haste)} speed`), t(`Fúria: +${pct(RUNE.fury)} de dano`, `Fury: +${pct(RUNE.fury)} damage`),
    t(`Escudo de runa: leva ${pct(RUNE.armor)} menos dano`, `Rune shield: takes ${pct(RUNE.armor)} less damage`), t(`Recarga: recargas levam ${pct(RUNE.cdr)} menos tempo`, `Recharge: cooldowns are ${pct(RUNE.cdr)} shorter`)])}<small>${t('Desligado: sem runas.', 'Off: no runes.')}</small>`,
  sudden: () => `<p>${t(`Rodada longa: passados ${SUDDEN.at} s, a arena encolhe a cada ${SUDDEN.every} s em vez de 10.`, `Long round: after ${SUDDEN.at} s, the arena shrinks every ${SUDDEN.every} s instead of 10.`)}</p><small>${t(`Desligado: encolhe sempre a cada 10 s. Depois de ${SUDDEN.collapse} s a arena some aos poucos de qualquer jeito, para a rodada acabar.`,
    `Off: always shrinks every 10 s. After ${SUDDEN.collapse} s the arena fades away gradually anyway, so the round ends.`)}</small>`,
  chests: () => `<p>${t(`Baú de ouro no meio da rodada: o primeiro aos ${CHEST.first} s, depois um a cada ${CHEST.every} s (até ${CHEST.maxUp} de pé). Quebre com magias e fique em cima do monte: 1 de ouro a cada ${CHEST.goldEvery} s; o monte tem de ${CHEST.pile[0]} a ${CHEST.pile[1]} de ouro.`,
    `Gold chest mid-round: the first at ${CHEST.first} s, then one every ${CHEST.every} s (up to ${CHEST.maxUp} standing). Break it with spells and stand on the pile: 1 gold every ${CHEST.goldEvery} s; the pile holds ${CHEST.pile[0]} to ${CHEST.pile[1]}.`)}</p><small>${t('Desligado: sem baús.', 'Off: no chests.')}</small>`,
  difficulty: () => `<p>${t('Como os bots jogam.', 'How the bots play.')}</p>${list([...(['easy', 'normal', 'hard'] as const).map((k) => {
    const b = BOT_SKILL[k];
    return t(`${SKILL_NAME[k]}: reage em ${n1(b.delay)} s, decide ${n1(b.rate)} vezes por segundo, mira erra até ${n1(b.aim)} m, usa a magia ${n1(b.waitMin)} a ${n1(b.waitMax)} s depois da recarga, desvia ${pct(b.dodge)} dos tiros, emenda ${pct(b.combo)} dos combos, fica a ${n1(b.range)} m do alvo e vê até ${b.vision} m`,
      `${SKILL_NAME[k]}: reacts in ${n1(b.delay)} s, decides ${n1(b.rate)} times per second, aim misses by up to ${n1(b.aim)} m, uses a spell ${n1(b.waitMin)} to ${n1(b.waitMax)} s after its cooldown, dodges ${pct(b.dodge)} of shots, chains ${pct(b.combo)} of combos, stays ${n1(b.range)} m from the target and sees up to ${b.vision} m`);
  }), t('Automático: cada bot fica entre o Fácil e o Difícil conforme o placar: humano perdendo deixa os bots mais fracos, ganhando mais fortes',
    'Auto: each bot sits between Easy and Hard depending on the score: a human losing makes the bots weaker, winning makes them stronger')])}`,
  arena: () => `<p>${t('Formato da pedra. Todas têm área parecida e encolhem igual.', 'Shape of the rock. All have a similar area and shrink the same way.')}</p>${list([t('Sortear: uma arena diferente a cada rodada', 'Random: a different arena every round'), ...ARENA_IDS.map((a) => `${arenaName(a)}: ${ARENA_TEXT[a]}`)])}`,
};
export const MODE_INFO = () => list([
  t('Rodadas: o último vivo ganha a rodada e 1 ponto.', 'Rounds: the last one alive wins the round and 1 point.'),
  t(`Deathmatch: rodadas de ${s(DM_ROUND_MS)}, quem cai volta em ${DM_RESPAWN} s; cada abate vale 1 ponto.`, `Deathmatch: ${s(DM_ROUND_MS)} rounds, whoever falls comes back after ${DM_RESPAWN} s; each kill is worth 1 point.`),
  t('Times: Azul contra Vermelho; a rodada acaba quando só sobra um time e todos dele pontuam. Magia em aliado só empurra.', 'Teams: Blue vs. Red; the round ends when only one team is left and all of them score. Spells on allies only knock back.'),
]);

// um balão aberto por vez
let pop: HTMLElement | null = null;
let owner: HTMLElement | null = null;
let pinned = false;
function close() {
  pop?.remove();
  owner?.setAttribute('aria-expanded', 'false');
  pop = owner = null;
  pinned = false;
}
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !pop) return;
  e.preventDefault(); // fechou o balão: este Esc não abre as configurações
  close();
});
addEventListener('pointerdown', (e) => {
  if (pop && !pop.contains(e.target as Node) && !owner?.contains(e.target as Node)) close();
}, true);

export function infoButton(title: string, html: () => string): HTMLButtonElement {
  const b = el('button', { type: 'button', class: 'info', 'aria-label': t('Sobre: ', 'About: ') + title, 'aria-expanded': 'false' }, icon(UI_ICON.info));
  const open = () => {
    if (owner === b) return;
    close();
    const body = el('div');
    body.innerHTML = html();
    pop = el('div', { class: 'info-pop', role: 'dialog', 'aria-label': title },
      iconButton('✕', t('Fechar', 'Close'), close, { class: 'info-close' }), el('b', {}, title), body);
    document.body.append(pop);
    owner = b;
    b.setAttribute('aria-expanded', 'true');
    // perto do botão, sem sair da tela
    const r = b.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`;
    pop.style.top = `${r.bottom + 8 + h < innerHeight ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
  };
  b.addEventListener('click', (e) => {
    e.preventDefault();
    if (owner === b && pinned) return close();
    open();
    pinned = true;
  });
  b.addEventListener('mouseenter', open);
  b.addEventListener('mouseleave', () => owner === b && !pinned && close());
  b.addEventListener('focus', open);
  b.addEventListener('blur', () => owner === b && !pinned && close());
  return b;
}
