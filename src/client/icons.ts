// Ícones de magias, itens, runas, efeitos e interface num lugar só: desenhos do game-icons.net (CC BY 3.0, créditos em
// public/CREDITS.txt) num sprite só (public/icons.svg, montado por scripts/assets/build-icons.mjs). Cor pelo tema (currentColor).
import type { RuneKind } from '../shared/constants.ts';
import { ITEMS, type ItemId } from '../shared/items.ts';
import { SPELLS, isSpell, type SpellId } from '../shared/spells.ts';

// símbolo do sprite → <svg> do tamanho da fonte; o emoji antigo fica como texto alternativo
const ALT: Record<string, string> = {};
export function icon(id: string): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gi');
  svg.setAttribute('viewBox', '0 0 512 512');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', ALT[id] ?? '');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `/icons.svg#${id}`);
  svg.append(use);
  return svg;
}
// registra o emoji de cada ícone (texto alternativo) e devolve só os ids
const named = <K extends string>(m: Record<K, [id: string, alt: string]>) =>
  Object.fromEntries(Object.entries<[string, string]>(m).map(([k, [id, alt]]) => ((ALT[id] = alt), [k, id]))) as Record<K, string>;

export const ICON: Record<SpellId, string> = named<SpellId>({ fireball: ['fire-ray', '🔥'], lightning: ['focused-lightning', '⚡'], homing: ['on-target', '🎯'], shield: ['shield-reflect', '🛡️'],
  teleport: ['teleport', '✨'], swap: ['body-swapping', '🔄'], grip: ['grab', '⛓️'], meteor: ['meteor-impact', '☄️'], rush: ['sprint', '💨'], cluster: ['striking-splinter', '🔱'],
  boomerang: ['boomerang', '🪃'], thrust: ['knife-thrust', '🗡️'], gravity: ['vortex', '🌀'], rockpillar: ['menhir', '🪨'], bouncer: ['ricochet', '🏓'], drain: ['life-tap', '🧛'],
  snowball: ['frozen-orb', '❄️'], illusion: ['two-shadows', '👥'], magnetize: ['magnet', '🧲'], recharge: ['cycle', '🔋'], alteration: ['card-exchange', '🔀'], link: ['harpoon-chain', '🔗'],
  windwalk: ['wind-slap', '👻'], splitter: ['split-arrows', '💠'], warpzone: ['time-trap', '⏳'] });
// Armadura e Roubo de vida tinham o mesmo emoji de Agarrar e de Drenar; agora cada um tem desenho próprio
export const ITEM_ICON: Record<ItemId, string> = named<ItemId>({ ring: ['diamond-ring', '💍'], cursed_ring: ['skull-ring', '🧿'], cape: ['cape', '🧣'], armor: ['breastplate', '🦺'],
  boots: ['leather-boot', '👢'], watch: ['pocket-watch', '⏱️'], vampire: ['bat', '🦇'], scourge: ['flail', '💥'], redirector: ['divert', '↪️'], pact: ['chalice-drops', '🩸'],
  lava_boots: ['metal-boot', '🥾'], warden: ['stone-bust', '🗿'], helmet: ['spartan-helmet', '🪖'], shock_boots: ['winged-leg', '🌩️'], aegis: ['angel-wings', '👼'], wind_boots: ['feather', '🪶'] });
export const RUNE_ICON: Record<RuneKind, string> = named<RuneKind>({ haste: ['rabbit', '🐇'], fury: ['enrage', '😡'], shield: ['checked-shield', '🔰'], recharge: ['energise', '🔋'] });
// o que derrubou alguém, além de magias e itens (placar)
export const SOURCE_ICON = named({ lava: ['volcano', '🌋'], pillar: ['menhir', '🪨'], shock: ['knockout', '💫'], unknown: ['uncertainty', '❔'] });
// botões e colunas da interface
export const UI_ICON = named({ board: ['histogram', '📊'], sheet: ['scroll-unfurled', '📜'], taunt: ['talk', '💬'], vote: ['vote', '🗳️'], sound: ['speaker', '🔊'], mute: ['speaker-off', '🔇'],
  help: ['help', '❓'], keys: ['keyboard', '⌨️'], kills: ['skull-crossed-bones', '☠'], dmg: ['spiky-explosion', '💥'], wins: ['trophy', '🏆'], aim: ['archery-target', '🎯'],
  gold: ['two-coins', '🪙'], tip: ['light-bulb', '💡'], bot: ['robot-antennas', '🤖'], person: ['character', '👤'], info: ['info', 'ℹ️'], shop: ['shop', '🏪'],
  gear: ['cog', '⚙️'], pad: ['gamepad', '🎮'], video: ['tv', '📺'] });
// ícone e nome de uma magia ou item ativo (teclas, grimório, magia escolhida)
export const actionIcon = (a: SpellId | ItemId) => (isSpell(a) ? ICON[a] : ITEM_ICON[a]);
export const actionName = (a: SpellId | ItemId) => (isSpell(a) ? SPELLS[a].name : ITEMS[a].name);
// efeitos em cima do mago (bits do snapshot, ver shared/snapshot.ts); negativos primeiro. Também listados na ficha do mago
const fx = named({ stun: ['star-swirl', '💫'], invuln: ['sunbeams', '🌟'], locked: ['padlock', '🔒'], slow: ['snail', '🐌'], burn: ['small-fire', '🔥'],
  repel: ['magnet-blast', '🌬️'], invis: ['ghost', '👻'], fast: ['run', '🏃'] });
export const STATUS_ICONS: [bit: number, icon: string, name: string][] = [[16, fx.stun, 'atordoado'], [32, fx.invuln, 'invulnerável'], [64, ITEM_ICON.pact, 'Pacto armado'],
  [128, fx.locked, 'preso'], [256, ICON.rush, 'Investida'], [4, fx.slow, 'lento'], [512, fx.burn, 'queimando'], [65536, ICON.link, 'preso pelo Elo'], [8192, ICON.magnetize, 'magnetizado: atrai projéteis'],
  [16384, fx.repel, 'magnetizado: afasta projéteis'], [1024, fx.invis, 'invisível (Caminhada no vento)'], [4096, fx.fast, 'acelerado'], [32768, ICON.alteration, 'Alteração'], [131072, ITEM_ICON.aegis, 'Égide pronta'],
  [262144, RUNE_ICON.haste, 'Runa da Pressa'], [524288, RUNE_ICON.fury, 'Runa da Fúria'], [1048576, RUNE_ICON.shield, 'Runa do Escudo'], [4194304, RUNE_ICON.recharge, 'Runa da Recarga'], [2097152, ICON.gravity, 'no redemoinho']];
export const BAD_STATUS = [16, 4, 128, 65536, 8192, 512, 2097152];
