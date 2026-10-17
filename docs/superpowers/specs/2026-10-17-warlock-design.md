# Warlock online — design

Data: 17/10/2026 · Pasta: `D:\Projetos\warlock` · Endereço: `warlock.fernandorffdev.com`

Legenda de origem: **(Fernando)** = decidido por ele no chat de 17/10/2026 · **(minha decisão)** = escolha do Claude, ele pode mudar · **(medido)** = conferido nesta data · **(doc)** = documentação com link · **(dedução)** = suposição, ainda sem confirmação.

## 1. Para que serve

Uma versão no navegador do **Warlock**, o mod de arena do Warcraft 3 / Dota: magos numa plataforma redonda cercada de lava, jogando magias para empurrar uns aos outros para fora. Quem fica na lava perde vida; a plataforma encolhe com o tempo; o último vivo vence a rodada.

Pedido do Fernando: "no mesmo estilo que você fez o jogo de sinuca", "para jogar em salas com meus amigos". O modelo é a Sinuquinha do Pix (`D:\Projetos\sinuca`, no ar em `sinuca.fernandorffdev.com`): abre o link, digita o apelido, entra na sala, sem conta e sem instalar nada.

Dá certo quando: ele manda o link no grupo, os amigos entram, a partida começa em menos de um minuto e todo mundo vê a mesma arena, com o mago respondendo ao clique sem atraso perceptível.

## 2. Objetivos, fora de escopo e o que seria fracasso

**Objetivos**
- **3D com câmera de cima, inclinada estilo Dota**, com Three.js como a sinuca **(Fernando)**.
- **Controles do Dota**: botão direito anda até o ponto; teclas soltam a magia na direção do cursor **(Fernando)**.
- **5 magias + loja entre rodadas**: Bola de fogo, Teleporte, Raio, Míssil teleguiado e Escudo; entre rodadas cada um ganha ouro e compra/melhora magias **(Fernando)**.
- **Todos contra todos, até 8 por sala, 5 rodadas**; quem somar mais pontos vence **(Fernando)**. **Bots** para completar a sala e para testar sozinho **(Fernando)**.
- **Servidor calcula 60 vezes por segundo e envia 30 vezes por segundo**; a tela desenha na taxa do monitor (60/144) suavizando entre envios **(Fernando, depois de ver o custo: zero em dinheiro, ~45 MB/hora de internet no celular — estimativa)**.
- Lobby com **lista de salas** e **link direto** `/#ABCD`, como na sinuca **(minha decisão: mesmo esquema que ele já aprovou na sinuca)**.

**Fora de escopo (v1)**: contas, ranking, histórico, chat, times, modo com mais de 5 magias, anticheat além de validar o formato das mensagens **(minha decisão, seguindo a sinuca: "n vai precisar de conta nem nada de segurança")**.

**Seria fracasso mesmo funcionando**
- O mago demorar a obedecer o clique, ou "teleportar" aos trancos na tela dos outros.
- Bola de fogo atravessar alguém ou acertar quem já tinha desviado na própria tela de forma gritante.
- Travar ou não caber no celular dos amigos.
- Mexer no site principal `fernandorffdev.com` ou na sinuca.

## 3. Restrições

- **Mesma conta e mesma pilha da sinuca** (Cloudflare Worker + Durable Objects, conta `b0bb5d0f661e2f77a26a52762050d456`, DNS do domínio no Cloudflare) **(medido: `wrangler.jsonc` da sinuca)**. Subdomínio `warlock.` com `custom_domain = true`; o plano grátis aceitou isso na sinuca **(medido em 17/10)**.
- **Plano grátis** **(doc: [preço](https://developers.cloudflare.com/durable-objects/platform/pricing/), [limites](https://developers.cloudflare.com/durable-objects/platform/limits/), lidos em 17/10)**:
  - 100 mil requisições/dia; mensagem recebida pelo servidor conta 1/20; **mensagem enviada é grátis**.
  - **13.000 GB-s/dia de tempo ligado**, cobrado sobre 128 MB → ~29 horas de sala com partida rodando por dia. Durante a partida o objeto não hiberna (o laço de 60/s o mantém acordado) **(dedução, conferir na página de ciclo de vida)**.
  - CPU: 30 s por requisição, e **cada mensagem recebida zera a conta** **(doc)**. O laço gasta pouco (estimativa: <0,2 ms por passo), mas o navegador manda uma mensagem comum de "estou aqui" a cada 5 s durante a partida para zerar a conta, já que o `ping` com resposta automática não acorda o objeto **(minha decisão)**.
- `~/.npmrc` tem `prefer-offline=true`: instalar com `--prefer-offline=false` **(medido na sinuca)**.
- O login do `wrangler` está salvo na conta dele; se expirar, ele clica "Allow" em até 2 minutos.

## 4. Como funciona (minhas decisões, ele pode mudar)

### 4.1 Pilha e reaproveitamento
- **Vite + Three.js puro + TypeScript, sem React**; um Worker serve os arquivos e os WebSockets. Mesmas versões da sinuca.
- Projeto novo em `D:\Projetos\warlock` com git próprio (só local, commits por tarefa como na sinuca).
- **Copiar da sinuca e adaptar** (não importar entre projetos): Lobby (Durable Object da lista), casca da sala (hibernação, reconexão, aba duplicada, limpeza da sala vazia), `net.ts` (WebSocket que reconecta), validação de mensagens, gerador de música e som no navegador, `?as=nome` para testar várias pessoas num navegador só, scripts de smoke.

### 4.2 Quem manda no resultado: o servidor
Diferente da sinuca (por turnos, quem tacou simulava), aqui **a sala (Durable Object) roda o jogo**:
- Cada navegador manda só **comandos**: "andar até (x,y)", "magia Q na direção (x,y)", "parar", compras na loja, "pronto".
- A sala simula **a 60 passos por segundo** e envia o **estado** (posição, vida, efeitos e projéteis) **30 vezes por segundo** para todos.
- Os **outros magos e os projéteis** são desenhados cerca de **66 ms no passado**, interpolando entre os dois últimos estados, para o movimento ficar liso mesmo com envio a 30/s e alguma oscilação da rede.
- **O próprio mago é previsto no próprio aparelho desde a etapa 1**: o clique move o mago na hora com o mesmo código de movimento do servidor; quando o estado do servidor chega, o aparelho reaplica os comandos ainda não confirmados e corrige a diferença deslizando (sem salto). Empurrões e teleporte vêm do servidor e substituem a previsão. Motivo **(medido em 17/10)**: a ida e volta até o Durable Object a partir do PC do Fernando é **~99 ms** (mediana de 25, mín. 95, máx. 119, saindo por Miami); sem previsão, o clique levaria ~170 a 200 ms para mover o mago, que é o fracasso nº 1 da seção 2. Durable Objects não rodam na América do Sul (o `locationHint: 'sam'` cai na América do Norte) **(doc: [data location](https://developers.cloudflare.com/durable-objects/reference/data-location/))**, então não há como encurtar isso escolhendo o local.
- Magias: a animação de lançar, o som e um projétil "provisório" saem na hora no próprio aparelho; o projétil do servidor assume quando chega.
- O servidor não precisa ser determinístico (só ele simula). Física 2D simples: círculos, velocidade, atrito, empurrão.
- **Gravação no disco só nas trocas de fase** (lobby, rodada, loja, fim) e quando alguém entra ou sai; o estado de cada passo vive na memória enquanto o laço mantém o objeto acordado (a casca da sinuca grava a cada passo e **não** pode ser copiada assim para um laço de 60/s) **(minha decisão)**.
- Com nenhum humano conectado, a partida pausa; a sala some depois de alguns minutos vazia (como a sinuca).

### 4.3 A arena
- Plataforma redonda de pedra sobre um mar de lava. **Raio inicial ~ suficiente para 8 magos espalhados; encolhe em degraus a cada ~15 s** até um raio mínimo (anel de pedra que racha e afunda na lava, com aviso visual 2 s antes).
- **Na lava: perde vida por segundo** (ex.: 10% por segundo). Fora da plataforma não há parede: dá para andar de volta.
- Início da rodada: magos em círculo, igualmente espaçados; contagem de 3 s.

### 4.4 Magos
- **Vida 100.** Sem regeneração. Velocidade de andar fixa.
- **Empurrão**: cada acerto dá um impulso que **desliza** com atrito (o mago não controla enquanto o deslizamento é forte). O empurrão é **um pouco maior quanto menos vida o mago tem** (estilo Smash, para as rodadas não empatarem) — **minha decisão**, os valores ficam com o construtor.
- Morre com vida 0. Morto vira espectador até o fim da rodada.
- Cor por jogador (8 cores), nome e barra de vida em cima da cabeça.

### 4.5 Magias (as 5 do Fernando), teclas e loja
| Magia | Tecla | O que faz | Começa com |
|---|---|---|---|
| Bola de fogo | Q | Projétil reto, dano médio + empurrão médio | **sim, todo mundo** |
| Raio | W | Instantâneo em linha curta, acerta o primeiro no caminho; dano baixo, empurrão médio | compra |
| Míssil teleguiado | E | Projétil lento que persegue o inimigo mais próximo do cursor; dano e empurrão médios | compra |
| Escudo | R | ~1,5 s refletindo projéteis de volta | compra |
| Teleporte | F | Salta até o cursor, alcance curto | compra |

- Teclas fixas por magia **(minha decisão: Q/W/E/R como o Dota; F = "flash")**.
- **Cada magia com sua tecla, todas podem ser compradas** **(Fernando, 17/10)**. Ele viu que no Warlock Brawl Raio e Míssil dividem a mesma "coluna" (um ou outro) e preferiu não seguir isso.
- Míssil teleguiado: no original ele **gira em volta** do inimigo mais próximo do ponto mirado antes de acertar **(doc: [Homing](https://www.warlockbrawl.com/handbook/homing.html))**.
- Cada magia tem **recarga** própria, mostrada nos botões da barra de baixo.
- **Loja entre rodadas (até 20 s, ou antes se todos clicarem "Pronto")**: ganha ouro por rodada (base + por abate + por sobreviver). Comprar magia nova ou **melhorar até o nível 3** (mais dano/empurrão ou menos recarga). Preços e valores ficam com o construtor.
- **Bots** compram com regra simples (a próxima magia mais barata que não têm).

### 4.6 Pontos e partida
- **5 rodadas.** Por rodada: **3 pontos para o último vivo**, **1 ponto por abate** (o abate vai para quem acertou o morto por último nos 5 s antes da morte; morte sem ninguém = sem dono). Vence quem tiver mais pontos; empate = rodada extra entre os empatados **(minha decisão)**.
- Placar entre rodadas (na loja) e no fim, com botão "jogar de novo".
- Rodada com limite de tempo de segurança (a arena encolhe até o mínimo e a lava resolve).

### 4.7 Sala e lobby
- Até **8 lugares**; quem entra com a sala cheia assiste. Quem cria a sala escolhe quantos bots pôr e clica "Começar".
- Bots: andam para longe da borda, atiram no mais próximo, desviam de projéteis que vêm na direção deles com alguma chance. Basta para testar e completar a sala.
- **Reconexão**: como na sinuca (`localStorage` com sala e id do jogador; a sala segura o lugar). Quem cai no meio da rodada: o mago fica parado lá (vira alvo fácil) até voltar.
- Apelido até 20 caracteres, sem HTML; mensagens com formato e tamanho conferidos.

### 4.8 Controles
- **PC**: botão direito anda (segurar arrasta o destino); Q/W/E/R/F soltam a magia na direção do cursor; **S** para; clique esquerdo nos botões da barra também solta a magia (mirando com o próximo clique).
- **Celular** **(minha decisão)**: tocar no chão anda; tocar no botão da magia e depois no chão solta na direção do toque. A câmera segue o próprio mago.
- Câmera: segue o próprio mago, com a arena inteira quase sempre visível; espaço centraliza.

### 4.9 Visual e som (o "estilo da sinuca")
- Lava com brilho e ondulação, pedra com textura, luz quente vinda de baixo, vinheta; magos estilizados (manto, chapéu, cajado) feitos com formas simples, sem modelos baixados.
- Efeitos: rastro e explosão da bola de fogo, raio com clarão, escudo transparente, sumiço/aparição do teleporte, faíscas ao cair na lava.
- Avisos grandes como na sinuca ("Rodada 2!", "Fulano caiu na lava!", "Você venceu a rodada!").
- Som e música gerados no navegador (Web Audio), como a sinuca. Menu de regras curto.

## 5. Ordem de construção
1. **Base jogável sozinho com bots**: projeto, arena 3D, andar com botão direito, bola de fogo, empurrão, lava, encolhimento, rodadas e pontos — servidor de verdade (`wrangler dev`) desde o primeiro dia.
2. **Salas com amigos**: lobby, link, até 8, reconexão, `?as=nome`.
3. **As outras 4 magias + loja + níveis.**
4. **Capricho**: efeitos, som, música, avisos, celular.
5. **Publicar** em `warlock.fernandorffdev.com` quando a etapa 2 passar nos testes, e republicar a cada etapa seguinte testada, sem perguntar (só neste subdomínio) **(Fernando, 17/10)**. Commits locais por tarefa na main, sem push **(Fernando, 17/10)**.

## 6. Como saber que funciona
- **Testes automáticos da simulação** (vitest): bola de fogo acerta e empurra; não atravessa a 60 passos/s nem na velocidade máxima; lava tira vida; arena encolhe; último vivo ganha 3 pontos; abate vai para o último que acertou; escudo reflete; teleporte respeita o alcance; loja desconta ouro e respeita o nível 3.
- **Rede**: `wrangler dev` local com 3+ abas (uma em tela de celular) na mesma sala: todos veem as mesmas posições; fechar e reabrir a aba volta ao mesmo mago.
- **De verdade**: olhar a arena rodando pelo pw-edge (o painel do app recorta fotos com a janela escondida), conferindo o `index-*.js` carregado contra o `dist`.
- **No ar**: smoke contra `warlock.fernandorffdev.com` depois de cada publicação.

### 6.1 Metas de desempenho
- 60 quadros/s num Android intermediário; não menos de 30 num fraco (baixar sombra e resolução).
- Download inicial abaixo de 1 MB compactado.
- Estado enviado enxuto (números arredondados), ~400 bytes por envio com 8 magos **(estimativa)**.

## 6.2 Pontos menores que eu decidi (revisão do desenho, 17/10)
- **Magos colidem entre si** e se empurram de leve (não se atravessam) **(minha decisão)**.
- **Míssil teleguiado trava no alvo escolhido ao lançar** e não troca durante o voo; some depois de alguns segundos **(minha decisão)**.
- **Escudo reflete projéteis e também o Raio** **(doc: [manual do Warlock Brawl, Shield](https://www.warlockbrawl.com/handbook/shield.html), link enviado pelo Fernando em 17/10)**.
- **Quem entra com a partida em andamento** assiste até o fim da rodada e entra na loja seguinte com o ouro mínimo; pontos começam do zero **(minha decisão)**.

## 7. Fica com o construtor
Todos os números de jogo (velocidades, dano, empurrão, recargas, preços, ouro, raio e ritmo do encolhimento); formato exato das mensagens; aparência dos magos e efeitos; layout da loja e da barra de magias; comportamento fino dos bots; tempo de lugar reservado e de limpeza da sala.
