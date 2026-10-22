// Campanha: a Charneca Cinzenta é o tutorial (Lucas, 22/10). A Ilse fala uma linha curta ao entrar em cada sala e em alguns
// momentos (primeira queda no abismo, vitória); a fala nunca pausa o jogo e some sozinha. As falas valem até o grupo vencer a
// Charneca uma vez neste navegador; nas Configurações dá para ligar de novo.
import { t } from './i18n.ts';
import { store } from './store.ts';

const KEY = 'warlock:ilse';

// 'on' (padrão até vencer), 'off' (venceu a Charneca ou desligou)
export const ilseOn = () => store.get(KEY) !== 'off';
export const setIlse = (on: boolean) => store.set(KEY, on ? 'on' : 'off');

export type IlseCtx = { fireKey: string; touch: boolean };
type Line = (c: IlseCtx) => string;

// uma fala por sala da Charneca, na ordem do tutorial (o id é o da sala em levels/charneca.ts)
export const ILSE_ROOMS: Record<string, Line> = {
  'charneca-entrada-01': (c) => c.touch
    ? t('Acorde, Aceso. Toque no chão para andar e na sua chama para lançá-la. O círculo no chão chama o Fumo.', 'Wake up, Kindled. Tap the ground to walk and your flame to cast it. The circle on the ground calls the Smoke.')
    : t(`Acorde, Aceso. Botão direito no chão para andar; ${c.fireKey} lança a sua chama na direção do mouse. O círculo no chão chama o Fumo.`, `Wake up, Kindled. Right-click the ground to walk; ${c.fireKey} casts your flame toward the mouse. The circle on the ground calls the Smoke.`),
  'moinho-caido-01': () => t('Os Arqueiros atiram de longe, mas o tiro se vê chegando: saia da frente. A mureta para o passo, não a magia, e os destroços quebram.', 'The Archers shoot from afar, but you can see the shot coming: step aside. The low wall stops feet, not spells, and the rubble breaks.'),
  'ponte-dos-enforcados-01': () => t('Quanto mais dano um servo leva, mais longe ele voa. Empurre o Fumo no abismo: de lá ele não volta. Você volta, mas mais fraco.', 'The more damage a servant takes, the farther it flies. Push the Smoke into the abyss: it does not come back. You do, but weaker.'),
  'vilarejo-queimado-02': () => t('A cera prende os pés: dentro dela você anda devagar. O Cão de Brasa corre; mantenha distância e atire enquanto ele vem.', 'Wax grips your feet: inside it you walk slowly. The Ember Hound runs; keep your distance and shoot while it comes.'),
  'cemiterio-dos-vigias-01': () => t('Os mísseis dos Vigias perseguem você: ponha uma estátua no caminho. E não demore, as lápides racham.', 'The Watchers\' missiles chase you: put a statue in their way. And do not linger, the tombstones crack.'),
  'charneca-portao-01': () => t('Respire. Depois desta passagem está Sir Odran. Se alguém cair, fique perto da brasa dele para reacendê-lo.', 'Breathe. Past this passage waits Sir Odran. If someone falls, stand by their ember to rekindle them.'),
  'arena-odran-01': () => t('Quando ele parar e o chão ficar vermelho, saia da faixa. Se ele bater num pilar, cai atordoado: é a sua hora.', 'When he stops and the ground turns red, leave the strip. If he hits a pillar, he falls stunned: that is your moment.'),
};

// momentos fora das salas
export const ILSE_MOMENTS = {
  fall: () => t('O abismo cobra caro: cada queda tira um pedaço da sua vida.', 'The abyss charges dearly: every fall takes a piece of your life.'),
  won: () => t('A primeira vela segue acesa. Daqui em diante eu falo menos: vocês já sabem o caminho.', 'The first candle still burns. From here on I will speak less: you know the way now.'),
};

// segundos que a fala fica na tela: o bastante para ler (uns 15 caracteres por segundo), entre 5 e 12 s
export const ilseSecs = (text: string) => Math.min(12, Math.max(5, text.length / 15));
