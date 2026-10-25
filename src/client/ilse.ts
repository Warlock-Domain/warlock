// Campanha: a Charneca Cinzenta é o tutorial (Lucas, 22/10). A Ilse ensina em falas curtas, uma de cada vez: cada fala
// só some pelo botão (pedido do Lucas: o jogador lê no ritmo dele) e a próxima entra em seguida. Primeiro andar e a lava,
// depois, no primeiro encontro, as magias e as teclas; nas outras salas, uma lição por sala. Nada pausa o jogo. As falas
// valem até o grupo vencer a Charneca uma vez neste navegador; nas Configurações dá para ligar de novo.
import { t } from './i18n.ts';
import { store } from './store.ts';

const KEY = 'warlock:ilse';

// 'on' (padrão até vencer), 'off' (venceu a Charneca ou desligou)
export const ilseOn = () => store.get(KEY) !== 'off';
export const setIlse = (on: boolean) => store.set(KEY, on ? 'on' : 'off');

// teclas de agora (são trocáveis): andar e lançar dependem de toque ou mouse
export type IlseCtx = { touch: boolean; fireKey: string; scourgeKey: string; stopKey: string };
type Lines = (c: IlseCtx) => string[];

// falas por sala da Charneca, na ordem do tutorial (o id é o da sala em levels/charneca.ts)
export const ILSE_ROOMS: Record<string, Lines> = {
  // entrada: só movimento e o perigo do chão; as magias esperam o primeiro encontro
  'charneca-entrada-01': (c) => [
    c.touch ? t('Acorde, Aceso. Toque no chão para andar até lá.', 'Wake up, Kindled. Tap the ground to walk there.')
      : t('Acorde, Aceso. Clique com o botão direito no chão para andar até lá.', 'Wake up, Kindled. Right-click the ground to walk there.'),
    ...(c.touch ? [] : [t(`Para parar onde está, aperte ${c.stopKey}.`, `To stop where you are, press ${c.stopKey}.`)]),
    t('A lava queima quem fica nela, e a vida não volta enquanto você está lá dentro. Fique na pedra.', 'Lava burns whoever stands in it, and your health does not come back while you are inside. Stay on the rock.'),
    t('Quando estiver pronto, pise no círculo verde: ele chama o Fumo e fecha a sala até o último servo cair.', 'When you are ready, step on the green circle: it calls the Smoke and seals the room until the last servant falls.'),
  ],
  'moinho-caido-01': () => [t('Os Arqueiros atiram de longe, mas o tiro se vê chegando: saia da frente. A mureta para o passo, não a magia, e os destroços quebram.', 'The Archers shoot from afar, but you can see the shot coming: step aside. The low wall stops feet, not spells, and the rubble breaks.')],
  'ponte-dos-enforcados-01': () => [t('Sob a ponte só há lava. Empurre o Fumo para fora dela: lá embaixo ele queima até o fim.', 'Beneath the bridge there is only lava. Push the Smoke off it: down there it burns to the end.')],
  'vilarejo-queimado-02': () => [t('A cera prende os pés: dentro dela você anda devagar. O Cão de Brasa corre; mantenha distância e atire enquanto ele vem.', 'Wax grips your feet: inside it you walk slowly. The Ember Hound runs; keep your distance and shoot while it comes.')],
  'cemiterio-dos-vigias-01': () => [t('Os mísseis dos Vigias perseguem você: ponha uma estátua no caminho. E não demore, as lápides racham.', 'The Watchers\' missiles chase you: put a statue in their way. And do not linger, the tombstones crack.')],
  'charneca-portao-01': () => [t('Respire. Depois desta passagem está Sir Odran. Se alguém cair, fique perto da brasa dele para reacendê-lo.', 'Breathe. Past this passage waits Sir Odran. If someone falls, stand by their ember to rekindle them.')],
  'arena-odran-01': () => [
    t('Quando ele parar e o chão ficar vermelho, saia da faixa. Se ele bater num pilar, cai atordoado: é a sua hora.', 'When he stops and the ground turns red, leave the strip. If he hits a pillar, he falls stunned: that is your moment.'),
    t('A borda da arena é lava. Ele é pesado, mas empurrado para lá também queima.', 'The edge of the arena is lava. He is heavy, but pushed there he burns too.'),
  ],
};

// momentos fora da entrada nas salas
export const ILSE_MOMENTS = {
  // primeiro encontro: as magias, as teclas da barra e o empurrão para a lava
  fight: (c: IlseCtx) => [
    c.touch ? t('Agora as magias. Toque na Bola de fogo e depois no chão para lançá-la.', 'Now the spells. Tap the Fireball and then the ground to cast it.')
      : t(`Agora as magias. ${c.fireKey} lança a Bola de fogo na direção do mouse; ${c.scourgeKey} é o Flagelo, que explode em volta de você.`, `Now the spells. ${c.fireKey} casts the Fireball toward the mouse; ${c.scourgeKey} is the Scourge, which bursts around you.`),
    t('Cada vaga da barra embaixo tem a sua tecla (Q W E R D F). Arraste uma magia para a vaga que preferir.', 'Each slot of the bar below has its key (Q W E R D F). Drag a spell to the slot you prefer.'),
    t('Quanto mais dano um servo leva, mais longe ele voa. Empurre-o para a lava.', 'The more damage a servant takes, the farther it flies. Push it into the lava.'),
  ],
  // first level-up after a cleared room (Lucas, 24/10: XP from the servants, a card per level)
  level: () => [t('Cada servo que cai dá experiência ao grupo. Subiu de nível: escolha uma carta à direita, magia nova ou um nível a mais numa que você já tem.', 'Every servant that falls gives the group experience. You levelled up: pick a card on the right, a new spell or one more level on one you already have.')],
  // first step into the Sanctuary candle's circle: nothing else on screen says that it heals (Fernando, 24/10)
  candle: () => [t('A vela cura quem fica perto dela. Respire aqui antes do chefe.', 'The candle heals whoever stays close to it. Catch your breath here before the boss.')],
  fall: () => [t('O abismo cobra caro: cada queda tira um pedaço da sua vida.', 'The abyss charges dearly: every fall takes a piece of your life.')],
  won: () => [t('A primeira vela segue acesa. Daqui em diante eu falo menos: vocês já sabem o caminho.', 'The first candle still burns. From here on I will speak less: you know the way now.')],
};

// fila de falas: cada assunto entra uma vez por noite; a da frente fica até o botão
export type IlseQueue = { said: Set<string>; lines: string[] };
export const newIlseQueue = (): IlseQueue => ({ said: new Set(), lines: [] });
export function ilsePush(q: IlseQueue, key: string, lines: string[]): boolean {
  if (q.said.has(key)) return false;
  q.said.add(key);
  q.lines.push(...lines);
  return true;
}
export const ilseNext = (q: IlseQueue) => void q.lines.shift();
