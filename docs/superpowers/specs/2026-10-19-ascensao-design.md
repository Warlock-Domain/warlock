# Modo Ascensão (Ascension) — desenho

Decidido com o Fernando em 19/10/2026 (chat da sessão "🎮🔥 Warlock online"; acompanhamento em https://claude.ai/artifact/Wa1tMCugkMNfXSfvcujH8u).

## Intenção

Um quarto modo de partida, "meio roguelike, tipo o ARAM do LoL com as cartinhas de upgrade" (palavras dele): o mago começa fraco e fica mais forte a cada rodada, escolhendo cartas. Quem fica mais tempo vivo e causa mais dano sobe mais rápido, mas há mecanismos de recuperação para quem fica para trás, para a partida não se decidir cedo.

## Objetivos

- Progressão visível dentro de uma partida: build montada carta a carta.
- Premiar jogar bem (dano, empurrão, derrubar, sobreviver).
- Partida aberta até o fim: o líder da rodada 3 não vence sempre.
- Reaproveitar o que existe: as 25 magias, os 16 itens, seus níveis e números já medidos.

## Não objetivos (1ª versão)

- **Aumentos** (cartas que mudam como uma magia funciona, ex.: "Bola de fogo quica"): ficam para a 2ª leva. Lista proposta no artefato.
- Ouro, loja, venda e desfazer no Ascensão.
- Mudar os modos atuais (Rodadas, Deathmatch, Times) ou os números das magias e itens.
- Rebalancear magias para o Ascensão (decisão de 21/10): as magias e os itens entram com os números de hoje; o simulador só ajusta o que é do modo (XP, curva de níveis, pontos, peso no sorteio e raridade).

## Anti-objetivos

- O líder disparar e ninguém mais ter chance (bola de neve).
- O catch-up pesar tanto que jogar bem não compense.
- Intervalo longo ou confuso entre rodadas (menus enxutos: decisão de 19/10).
- Escolher carta no meio da luta.

## Decidido (19/10)

| Assunto | Decisão |
|---|---|
| Nome | Ascensão / Ascension (id interno sugerido: `ascension`) |
| Progressão | XP do **mago** (não de cada magia). Subir de nível dá uma escolha de carta |
| Escolha | 1 entre 3 cartas sorteadas |
| Hora | No intervalo entre rodadas (onde hoje fica a loja). Cada nível ganho na rodada = uma escolha |
| Conteúdo das cartas | Magia nova, subir 1 nível de uma magia que você tem, e itens (sem ouro, sem loja) |
| Começo | Bola de fogo nível 1 e o Flagelo de graça (como nos outros modos), + 1 carta escolhida antes da rodada 1 |
| Vitória | 9 rodadas fixas; pontos pela ordem de queda (último vivo leva mais); maior soma vence |
| Recuperação | As 4: recompensa por derrubar o líder, XP de consolação, cartas melhores para quem está atrás, líder marcado leva mais empurrão |
| Baús | Não existem no Ascensão (a opção some da sala nesse modo) |
| Bots | Escolhem pela dificuldade: Fácil ao acaso; Normal completa grupos que faltam (defesa/mobilidade antes de mais ataque); Difícil escolhe a carta que mais vence no simulador |
| Crédito de abate por controle (21/10) | Troca, Agarrar e Magnetizar contam como golpe para o crédito do abate (janela de 5 s), **em todos os modos**: "no jogo normal tbm deve contar". Fica em issue própria, fora do Ascensão; o modo só herda |
| Cartas por intervalo (21/10) | Todo intervalo dá 1 magia nova e 1 item ("no modo assencao todo round deve ganhar ... 1 magia nova e 1 item"); cada nível de XP dá 1 subir magia. Cada escolha é 1 entre 3 cartas do mesmo tipo. Substitui "cada nível = 1 carta de qualquer tipo" |
| Ritmo e troca (21/10, pela simulação de 1 430 partidas) | Nível custa 1 100 XP (1,3 subir magia por intervalo; com 600 eram 2,8). Com a barra cheia, a fileira de magia nova pode ser recusada ("Manter as minhas magias"); o tempo esgotado e os bots mantêm em vez de trocar |
| Magias no modo (21/10) | "Por enquanto o modo Ascension vai ser sem skills rebalanceadas": mesmos números de `spells.ts` e `items.ts` dos outros modos |

## Como funciona

1. Sala com modo Ascensão (2 a 8 magos, bots inclusive). Todos com Bola de fogo nível 1 e Flagelo; cada um escolhe 1 entre 3 cartas.
2. Rodada igual às de hoje (arena que encolhe, lava, morte súbita, runas), sem baús. Golpes dão XP ao mago.
3. Fim da rodada: pontos de colocação e XP de consolação.
4. Intervalo: para cada nível ganho, uma escolha de 1 entre 3 (escolhas em sequência). Quem está atrás pode ver raridade maior e ganhar 1 novo sorteio.
5. Após a rodada 9, maior soma de pontos vence (empate: maior dano total).

## Cartas

- **Magia nova:** entra no nível 1, no próximo espaço livre. Com a barra cheia (`MAX_SPELLS` = 6), o jogador escolhe qual trocar ou mantém as suas (21/10).
- **Subir magia:** +1 nível numa magia que já tem (usa os 7 níveis de `spells.ts`).
- **Item:** os itens de `items.ts`; item repetido sobe de nível (como hoje na loja).
- Sorteio com semente (`rand` recebido, nunca `Math.random`): as 3 cartas não repetem e cobrem pelo menos 2 tipos/grupos diferentes, para não virem 3 de ataque.
- Raridade (comum, rara) existe para o catch-up "cartas melhores atrás"; o que cada raridade significa fica para o builder propor e o simulador medir (ex.: rara = subir 2 níveis).

## XP (números iniciais, a medir)

| Fonte | Inicial |
|---|---|
| Dano causado | proporcional ao dano |
| Empurrão causado | a medir (no Warlock quem mata é a lava) |
| Derrubar alguém na lava | bônus fixo |
| Tempo vivo | pequeno, por segundo |

Curva de níveis calibrada para dar em média 1 a 2 escolhas por intervalo.

## Recuperação (números iniciais, a medir)

| Mecanismo | Regra inicial |
|---|---|
| Recompensa pelo líder | derrubar quem tem o maior nível rende XP extra proporcional à diferença de nível |
| XP de consolação | abaixo da média de nível: +25% de XP por nível abaixo, no fim da rodada |
| Cartas melhores atrás | abaixo do líder: chance maior de carta rara e 1 novo sorteio por intervalo |
| Líder marcado | marca visível; +5% de empurrão recebido por nível acima do 2º colocado |

## Decisões minhas (resposta ao revisor do desenho, 19/10; o Fernando pode mudar)

- **Bot Difícil:** usa uma tabela fixa de força por carta, gerada antes pelo simulador e versionada no repositório; escolhe com sorteio ponderado por essa força (a melhor carta é a mais provável, não a garantida). Sem simulação durante o intervalo.
- **Critério dos 40%:** medido com bots Normais (o Difícil, por desenho, prefere as fortes).
- **Alavancas de balanceamento do modo:** peso no sorteio e raridade da carta, ajustados em ciclo pelo simulador sem parar a cada carta; tirar uma carta do sorteio ou mexer em número de magia/item continua precisando do Fernando.
- **Empate após a rodada 9:** desempate pelo dano total da partida.
- **Tempo do intervalo esgotado:** escolha automática (a carta de cima). Humano desconectado: o bot escolhe por ele.
- **Troca de modo por votação:** reinicia a partida.

## Critérios de sucesso (simulador)

- Rodada média entre 60 e 120 s; ≥ 60% das mortes por golpe (metas atuais).
- Quem lidera em nível na rodada 3 vence entre 25% e 50% das partidas.
- Nenhuma carta escolhida em mais de 40% das vezes em que aparece (sinal de carta forte demais).

## Código separado (pedido do Fernando, 19/10: "deixe o código do ascension mais separado pois vai mudar muita coisa da core gameplay")

- Toda a regra do modo mora em `src/shared/ascension.ts` (XP, níveis, cartas, pontos, recuperação, escolha dos bots) e a tela em `src/client/ascension-ui.ts`.
- `match.ts`, `sim.ts`, `protocol.ts`, `room-do.ts` e `ui.ts` ganham só ganchos curtos do tipo `if (m.mode === 'ascension') return asc.algo(...)`.
- Os outros modos não mudam: o hash de `tests/style.test.ts` continua o mesmo.

## Onde mexe (para o builder confirmar)

- `src/shared/match.ts`: `MODES` ganha o modo; fase de escolha no lugar da loja; pontos por colocação; fim na rodada 9; XP e níveis do mago; catch-up.
- `src/shared/protocol.ts`: mensagem nova de escolher carta (validada em `parseClientMessage`).
- `src/shared/bots.ts`: escolha de carta por dificuldade.
- `src/shared/sim.ts`: só o "+empurrão no líder", se não couber em `match.ts`.
- `src/client`: tela das 3 cartas no intervalo (ícones existentes, cores por grupo, itens prateados), barra de XP, marca do líder, seletor de modo na sala; textos em `t('pt','en')`.
- `scripts/balance-sim.ts`: rodar o modo novo.
- `tests/`: XP, sorteio com semente, catch-up, fim na rodada 9.
- `CLAUDE.md` (Registro de decisões), `README.md` e `docs/GUIA-COLABORADOR.md`.

## Fica com o builder

- Fórmula exata de XP, curva de níveis e pontos por colocação, desde que o simulador cumpra os critérios.
- Layout da tela de cartas, seguindo os padrões de `src/client/CLAUDE.md`.
- O que a raridade "rara" dá.
- Tempo do intervalo (hoje `SHOP_MS`), com teto para não alongar a partida.
