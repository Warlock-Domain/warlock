import { describe, expect, it } from 'vitest';
import { BOT_NAMES, addPlayer, newMatch, startMatch } from '../src/shared/match.ts';

describe('nomes dos bots', () => {
  it('usa os sete nomes pedidos na mesma ordem do menu e da partida', () => {
    const names = ['Rasputinho', 'Gandalfo', 'Mendigo Ocultista', "Gul'Dan", 'Soldado do Lula', 'Robô do Bolsonaro', 'Merlim'];
    expect(BOT_NAMES).toEqual(names);
    const match = newMatch();
    addPlayer(match, 'human', 'Jogador');
    startMatch(match, 0, 7, 'rounds', true, () => .5);
    expect(match.players.filter((p) => p.bot).map((p) => p.name)).toEqual(names);
  });
});
