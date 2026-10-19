// Botão "i" das opções da partida (pedido do Fernando, 18/10): o que cada opção faz e o que muda em cada valor,
// com os números lidos do código. Clique ou toque fixa a explicação (✕, Esc ou toque fora fecham); mouse em cima e foco pelo teclado mostram.
import { BOT_SKILL } from '../shared/bots.ts';
import { ARENA_IDS, ARENA_NAMES } from '../shared/arena.ts';
import { ASSIST_GOLD, CHEST, COUNTDOWN_MS, DM_RESPAWN, DM_ROUND_MS, KILL_GOLD, RECOVERY, ROUND_END_MS, ROUND_GOLD, RUNE, SUDDEN, TOP_DMG_GOLD, WIN_GOLD } from '../shared/constants.ts';
import { DM_GOALS, OPTION_CHOICES, PACE, type MatchOpts, type Mode } from '../shared/match.ts';
import { UI_ICON, el, icon } from './icons.ts';
import { n1, pct } from './rules-text.ts';

const s = (ms: number) => `${n1(ms / 1000)} s`;
const list = (rows: string[]) => `<ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>`;

const ARENA_TEXT: Record<(typeof ARENA_IDS)[number], string> = {
  circle: 'a pedra redonda de sempre',
  ring: 'anel com lava no meio: quem cai no buraco também queima',
  islands: 'duas ilhas ligadas por uma ponte estreita',
  cross: 'cruz de quatro braços: os cantos são lava',
};
// nomes do ritmo e da dificuldade (aqui e nas opções da sala)
export const PACE_NAME: Record<MatchOpts['pace'], string> = { short: 'Curto', normal: 'Normal', long: 'Longo' };
export const SKILL_NAME: Record<MatchOpts['difficulty'], string> = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil', auto: 'Automático' };

// explicação de cada opção (HTML curto); a meta depende do modo
export const OPT_INFO: Record<keyof MatchOpts, (mode: Mode) => string> = {
  shop: () => `<p>Tempo da loja entre as rodadas. A loja fecha antes quando todos clicam Pronto.</p>${list(OPTION_CHOICES.shop.map((v) => `${v >= 120 ? '2 min' : `${v} s`}`))}`,
  pace: () => `<p>Espera antes de cada rodada (contagem) e depois dela (fim de rodada).</p>${list((['short', 'normal', 'long'] as const).map((k) =>
    `${PACE_NAME[k]}: contagem ${s(COUNTDOWN_MS * PACE[k])}, fim de rodada ${s(ROUND_END_MS * PACE[k])}`))}`,
  economy: () => `<p>Multiplica todo ouro ganho na partida: por rodada ${ROUND_GOLD}, vitória ${WIN_GOLD}, abate ${KILL_GOLD}, top dano ${TOP_DMG_GOLD}, assistência ${ASSIST_GOLD}, baú 1 a cada ${CHEST.goldEvery} s, recuperação até ${RECOVERY.max} (e o ouro inicial).</p>${list(OPTION_CHOICES.economy.map((v) =>
    `×${n1(v)}: rodada ${Math.round(ROUND_GOLD * v)}, vitória ${Math.round(WIN_GOLD * v)}, abate ${Math.round(KILL_GOLD * v)}${v === 1 ? ' (o normal)' : v > 1 ? ` (${pct(v - 1)} a mais)` : ` (${pct(1 - v)} a menos)`}`))}`,
  startGold: () => `<p>Ouro de cada um no começo da partida (também multiplicado pelo Ouro ganho).</p>${list(OPTION_CHOICES.startGold.map((v) => `${v} de ouro`))}`,
  goal: (mode) => `<p>Pontos para vencer a partida.</p>${list(OPTION_CHOICES.goal.map((v) => `${v} rodadas nas Rodadas e nos Times, ou ${DM_GOALS[v]} abates no Deathmatch`))}<small>Agora: ${mode === 'deathmatch' ? 'Deathmatch (conta abates)' : 'conta rodadas vencidas'}.</small>`,
  runes: () => `<p>Uma runa por vez aparece num ponto livre: a primeira aos ${RUNE.first} s e a próxima ${RUNE.every} s depois de alguém pegar. Dura ${RUNE.secs} s.</p>${list([
    `Pressa: +${pct(RUNE.haste)} de velocidade`, `Fúria: +${pct(RUNE.fury)} de dano`, `Escudo de runa: leva ${pct(RUNE.armor)} menos dano`, `Recarga: recargas levam ${pct(RUNE.cdr)} menos tempo`])}<small>Desligado: sem runas.</small>`,
  sudden: () => `<p>Rodada longa: passados ${SUDDEN.at} s, a arena encolhe a cada ${SUDDEN.every} s em vez de 10.</p><small>Desligado: encolhe sempre a cada 10 s. Depois de ${SUDDEN.collapse} s a arena some aos poucos de qualquer jeito, para a rodada acabar.</small>`,
  chests: () => `<p>Baú de ouro no meio da rodada: o primeiro aos ${CHEST.first} s, depois um a cada ${CHEST.every} s (até ${CHEST.maxUp} de pé). Quebre com magias e fique em cima do monte: 1 de ouro a cada ${CHEST.goldEvery} s, até ${CHEST.pile}.</p><small>Desligado: sem baús.</small>`,
  difficulty: () => `<p>Como os bots jogam.</p>${list([...(['easy', 'normal', 'hard'] as const).map((k) => {
    const b = BOT_SKILL[k];
    return `${SKILL_NAME[k]}: reage em ${n1(b.delay)} s, decide ${n1(b.rate)} vezes por segundo, mira erra até ${n1(b.aim)} m, usa a magia ${n1(b.waitMin)} a ${n1(b.waitMax)} s depois da recarga, desvia ${pct(b.dodge)} dos tiros, emenda ${pct(b.combo)} dos combos, fica a ${n1(b.range)} m do alvo e vê até ${b.vision} m`;
  }), 'Automático: cada bot fica entre o Fácil e o Difícil conforme o placar: humano perdendo deixa os bots mais fracos, ganhando mais fortes'])}`,
  arena: () => `<p>Formato da pedra. Todas têm área parecida e encolhem igual.</p>${list(['Sortear: uma arena diferente a cada rodada', ...ARENA_IDS.map((a) => `${ARENA_NAMES[a]}: ${ARENA_TEXT[a]}`)])}`,
};
export const MODE_INFO = () => list([
  'Rodadas: o último vivo ganha a rodada e 1 ponto.',
  `Deathmatch: rodadas de ${s(DM_ROUND_MS)}, quem cai volta em ${DM_RESPAWN} s; cada abate vale 1 ponto.`,
  'Times: Azul contra Vermelho; a rodada acaba quando só sobra um time e todos dele pontuam. Magia em aliado só empurra.',
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
  const b = el('button', { type: 'button', class: 'info', 'aria-label': 'Sobre: ' + title, 'aria-expanded': 'false' }, icon(UI_ICON.info));
  const open = () => {
    if (owner === b) return;
    close();
    const body = el('div');
    body.innerHTML = html();
    pop = el('div', { class: 'info-pop', role: 'dialog', 'aria-label': title },
      el('button', { type: 'button', class: 'info-close', 'aria-label': 'Fechar', onclick: close }, '✕'), el('b', {}, title), body);
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
