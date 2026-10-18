// Modo treino: uma dica curta por vez nas primeiras rodadas, escolhida pelo que está acontecendo agora.
import type { Phase } from '../shared/match.ts';

export const COACH_ROUNDS = 3;

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
};

// o mais urgente primeiro: lava, morte e borda; depois o básico de andar e atirar no começo da rodada
export function coachTip(s: CoachState): string | null {
  if (s.round > COACH_ROUNDS) return null;
  if (s.phase === 'shop') return s.round === 0 ? 'Compre uma magia nova e aperte Pronto' : 'Compre uma magia nova ou suba o nível de uma que você já tem';
  if (s.phase === 'countdown') return 'O último de pé vence a rodada';
  if (s.phase !== 'playing') return null;
  if (!s.alive) return 'Você caiu. Veja como os outros jogam: a próxima rodada já vem';
  if (s.lava) return 'Você está na lava! Volte para a pedra';
  if (s.shrinkIn !== null && s.shrinkIn <= 5) return 'A borda vermelha vai afundar: corra para o meio';
  if (s.low) return 'Vida baixa: quanto mais dano você leva, mais longe voa';
  if (s.playingFor < 6) return s.touch ? 'Toque no chão para andar' : 'Clique com o botão direito no chão para andar';
  if (s.playingFor < 14) return s.touch ? 'Toque na Bola de fogo e depois no chão para atirar' : `Use ${s.fireKey} para atirar a Bola de fogo na direção do mouse`;
  return null;
}
