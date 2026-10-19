// Modo treino: uma dica curta por vez nas primeiras rodadas, escolhida pelo que está acontecendo agora.
import type { Phase } from '../shared/match.ts';
import { t } from './i18n.ts';

const COACH_ROUNDS = 3;

export type CoachState = {
  phase: Phase;
  round: number;
  playingFor: number; // segundos desde o "Já!"
  shrinkIn: number | null; // segundos até a borda afundar (null: não encolhe)
  low: boolean;
  lava: boolean;
  alive: boolean;
  touch: boolean;
  fireKey: string; // tecla da Bola de fogo agora (as teclas são trocáveis)
  fire: boolean; // tem a Bola de fogo (dá para vender desde 18/10)
};

// o mais urgente primeiro: lava, morte e borda; depois o básico de andar e atirar no começo da rodada
export function coachTip(s: CoachState): string | null {
  if (s.round > COACH_ROUNDS) return null;
  if (s.phase === 'shop') return s.round === 0 ? t('Compre uma magia nova e aperte Pronto', 'Buy a new spell and press Ready') : t('Compre uma magia nova ou suba o nível de uma que você já tem', 'Buy a new spell or level up one you already have');
  if (s.phase === 'countdown') return t('O último de pé vence a rodada', 'The last one standing wins the round');
  if (s.phase !== 'playing') return null;
  if (!s.alive) return t('Você caiu. Veja como os outros jogam: a próxima rodada já vem', 'You fell. Watch how the others play: the next round is coming');
  if (s.lava) return t('Você está na lava! Volte para a pedra', 'You are in the lava! Get back to the rock');
  if (s.shrinkIn !== null && s.shrinkIn <= 5) return t('A borda vermelha vai afundar: corra para o meio', 'The red edge is about to sink: run to the middle');
  if (s.low) return t('Vida baixa: quanto mais dano você leva, mais longe voa', 'Low health: the more damage you take, the farther you fly');
  if (s.playingFor < 6) return s.touch ? t('Toque no chão para andar', 'Tap the ground to walk') : t('Clique com o botão direito no chão para andar', 'Right-click the ground to walk');
  if (s.playingFor < 14 && s.fire) return s.touch ? t('Toque na Bola de fogo e depois no chão para atirar', 'Tap the Fireball and then the ground to shoot') : t(`Use ${s.fireKey} para atirar a Bola de fogo na direção do mouse`, `Press ${s.fireKey} to shoot the Fireball toward the mouse`);
  return null;
}
