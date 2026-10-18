// Ícones de magias, itens e fontes de dano num lugar só. Hoje são emojis distintos; a troca por ícones desenhados
// (game-icons.net, CC BY 3.0, num estilo só) acontece aqui, sem mexer nas telas.
import type { ItemId } from '../shared/items.ts';
import type { SpellId } from '../shared/spells.ts';

export const ICON: Record<SpellId, string> = { fireball: '🔥', lightning: '⚡', homing: '🎯', shield: '🛡️', teleport: '✨', swap: '🔄', grip: '⛓️', meteor: '☄️', rush: '💨', cluster: '🔱', boomerang: '🪃', thrust: '🗡️', gravity: '🌀', rockpillar: '🪨', bouncer: '🏓',
  drain: '🧛', snowball: '❄️', twin: '♊', magnetize: '🧲', recharge: '🔋', alteration: '🔀', link: '🔗', windwalk: '👻', splitter: '💠', warpzone: '⏳' };
// Armadura e Roubo de vida tinham o mesmo emoji de Agarrar e de Drenar
export const ITEM_ICON: Record<ItemId, string> = { ring: '💍', cursed_ring: '🧿', cape: '🧣', armor: '🦺', boots: '👢', watch: '⏱️', vampire: '🦇', scourge: '💥', redirector: '↪️', pact: '🩸',
  lava_boots: '🥾', warden: '🗿', helmet: '🪖', shock_boots: '🌩️', aegis: '👼' };
// o que derrubou alguém, além de magias e itens (placar)
export const SOURCE_ICON = { lava: '🌋', pillar: '🪨', shock: '💫', unknown: '❔' };
// efeitos em cima do mago (bits do snapshot, ver shared/snapshot.ts); negativos primeiro. Também listados na ficha do mago
export const STATUS_ICONS: [bit: number, icon: string, name: string][] = [[16, '💫', 'atordoado'], [8, '⚠️', 'vulnerável'], [32, '🌟', 'invulnerável'], [64, '🩸', 'Pacto armado'], [128, '🔒', 'preso'], [256, '⏩', 'Investida'], [4, '🐌', 'lento'], [512, '🔥', 'queimando'],
  [65536, '🔗', 'preso pelo Elo'], [8192, '🧲', 'magnetizado: atrai projéteis'], [16384, '🌬️', 'magnetizado: afasta projéteis'], [1024, '👻', 'invisível (Caminhada no vento)'], [4096, '🏃', 'acelerado'], [32768, '🔀', 'Alteração'], [131072, '👼', 'Égide pronta'],
  [262144, '🐇', 'Runa da Pressa'], [524288, '😡', 'Runa da Fúria'], [1048576, '🔰', 'Runa do Escudo']];
export const BAD_STATUS = [16, 4, 8, 128, 65536, 8192];
