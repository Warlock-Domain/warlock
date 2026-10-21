# Warlock Wars — instruções para agentes de IA

Guia para quem trabalha neste repositório com Claude Code, Codex, Cursor ou outro agente. Também vale para humanos. `AGENTS.md` aponta para este arquivo.

Jogo no ar: https://warlock.fernandorffdev.com · remake web do mod **Warlock** (Warcraft 3 / Warlock Brawl do Dota 2). O público são jogadores de Dota: na dúvida de interface, siga o jeito do Dota.

## Mapa do código

```
src/shared/   lógica do jogo, roda igual no servidor e no navegador
  sim.ts        simulação (60 passos/s): magos, projéteis, lava, obstáculos, ilhas, runas
  spells.ts     as 25 magias (níveis, recarga, dano, empurrão); items.ts os itens
  bots.ts       bots (BOT_SKILL por dificuldade, decisão a cada pensamento)
  match.ts      partida: fases, loja, ouro, rodadas, votações, estatísticas
  ascension.ts  modo Ascensão: XP, cartas, pontos por queda, recuperação (match.ts chama atrás de m.asc)
  protocol.ts   mensagens cliente↔servidor e a validação delas (fronteira de confiança)
  arena.ts      formatos de arena, borda, caminho dentro da pedra
  characters.ts personagens e o "look" de 7 peças (criador de personagem)
src/worker/   Cloudflare Workers + Durable Objects (uma sala por objeto; lobby.ts guarda a telemetria)
src/client/   navegador: main.ts (laço), scene.ts (Three.js), ui.ts (HUD, menus, loja), ascension-ui.ts (cartas do Ascensão), i18n.ts, grimoire.ts…
scripts/      balance-sim.ts (simulador de balanceamento), build-tournament.ts (torneio de compras), smoke.mjs
tests/        Vitest (lógica e funções puras do cliente)
docs/         auditorias, revisões de código e catálogos
```

## Comandos

```bash
npm install
npx wrangler dev                    # servidor + cliente em http://localhost:8787
npx tsc --noEmit -p .               # tipos do cliente e do compartilhado
npx tsc --noEmit -p src/worker      # tipos do servidor
npx vitest run                      # testes
npx vite build                      # build do cliente (dist/)
```

**Gates antes de qualquer commit:** os dois `tsc`, `vitest run` e `vite build`, todos limpos.

## Regras do código

- **Comentários curtos em português, explicando o porquê** (decisão de 20/10): toda decisão que não se entende só lendo o código leva 1 linha de porquê, para outra pessoa ou outra IA não desfazer sem querer: tempos e números escolhidos, ordem de chamadas que importa, contorno de bug do navegador ou da Cloudflare, por que algo roda no servidor e não no cliente. Não comente o óbvio (o que a linha faz). Mudou a decisão, mude o comentário junto. Decisão de produto vai no registro de decisões abaixo; "onde mexer" vai no `CLAUDE.md` da pasta. Imports sempre no topo do arquivo.
- **Interface só com as peças que já existem** (`dialog()`, `iconButton()`, `tabs()`, `choice()`, `searchFilter()`, `withTip`, detalhes em `src/client/CLAUDE.md`), com cores e tamanhos pelas variáveis do `:root`. Precisa de algo que nenhuma peça faz? Primeiro estenda a peça (um parâmetro a mais); só se não couber, crie uma função nova junto das outras e registre em `src/client/CLAUDE.md`. Nada de HTML/CSS repetido nem de cor ou tamanho soltos no código.
- **Menos código vence:** reaproveite o que já existe (`el()` em icons.ts, `dialog()`, `iconButton()`, `tabs()`, `choice()`, `searchFilter()`, `withTip`, `store`, `t()`), sem abstração para um uso só, sem configuração que ninguém pediu. Mudança cirúrgica: não reformate código vizinho.
- **Todo texto que o jogador vê sai nas duas línguas** com `t('português', 'English')` de `src/client/i18n.ts`. Nomes de magia/item/arena pelos helpers `spellName`, `itemName`, `arenaName`. Números com `LOCALE`.
- **Determinismo:** a simulação não pode usar `Math.random` solto nem mudar a ordem dos sorteios sem querer. `tests/style.test.ts` guarda um hash dos eventos de uma partida com semente: se ele mudar, você mudou o jogo. Só regrave o valor quando a mudança de jogabilidade for intencional.
- **Protocolo é fronteira de confiança:** toda mensagem nova é validada em `parseClientMessage` (tipos, limites, chaves conhecidas).
- **Celular fora de foco por enquanto** (decisão de 20/10): não é preciso conferir nem otimizar para celular; só não apague as media queries que já existem (≤ 600 px e `pointer: coarse`).

## Decisões de produto (não desfazer sem combinar numa issue)

- Menu principal em barra (issue #83): logo W do ícone da aba (leva ao Início) · Jogar · Aprender · Guarda-roupas · Loja (vitrine, sem preço nem compra) · Perfil, com Configurações e Sair como ícones. Menus enxutos.
- Loja em grade com o nome dentro do ícone e preço com moeda; cores por grupo (Ataque vermelho-laranja, Mobilidade verde, Defesa azul, Controle roxo, Itens prateado); 10 magias de ataque e 5 de cada outro grupo.
- Sala sem opção de ritmo nem de morte súbita (sempre ligada); dificuldade escolhida bot a bot.
- Baús: no máximo metade dos magos + 1 por rodada, nunca mais que 3; o monte dá 3 a 5 de ouro. Escudo com recarga de 16 s. Drenar só muda depois de partidas reais. Ataques fortes e raros (não encurtar recargas).
- Recusados: ranking/perfil e itens que só ajudam uma magia específica.

## Registro de decisões do Fernando

Toda decisão nova entra aqui (data, decisão, porquê); se mudar o jeito de codar, também no `CLAUDE.md` da pasta afetada; se mudar o que o jogo tem ou como contribuir, também no `README.md` e no `docs/GUIA-COLABORADOR.md`. Tudo no mesmo PR da mudança. Cada pasta principal tem o seu (`src/shared`, `src/client`, `src/worker`, `scripts`, `tests`) com os padrões de código daquela área; o `AGENTS.md` de cada pasta aponta para ele.

| Data | Decisão | Por quê |
|---|---|---|
| 17/10 | Câmera de cima em 3D, controles do Dota (botão direito anda); 1 ponto por rodada, vence quem fizer 5 | igual ao Warlock original, público de Dota |
| 18/10 | Repositório público | amigos contribuírem |
| 18/10 | Recusados: ranking/perfil e itens que só ajudam uma magia (ex.: Cajado de fogo) | foco no jogo, build livre |
| 18/10 | Número de magia/item só muda depois de medido no simulador; justo no Normal **e** no Difícil (0,85 a 1,15); metas de rodada 60–120 s e ≥ 60% das mortes por golpe | balanceamento por dado, não por opinião |
| 18/10 | Bots em 3 dificuldades | jogar sozinho em qualquer nível |
| 19/10 | Sai Gêmeos, entra Ilusão: 10 magias de ataque, 5 de mobilidade, 5 de defesa, 5 de controle | grupos equilibrados |
| 19/10 | Escudo com recarga 16 s; Drenar espera partidas reais; Ilusão fica como está | resultado do torneio de compras |
| 19/10 | Balanceamento continua tendo a Bola de fogo como referência | todos têm de graça |
| 19/10 | Menu inicial com 5 abas; menus enxutos; loja em grade estilo Dota com cor por grupo; magias e itens numa tela de consulta (F2) | público de Dota, menos coisa na tela |
| 19/10 | Sala sem opção de ritmo (sempre Normal) nem de morte súbita (sempre ligada); dificuldade escolhida bot a bot | menos opção que ninguém entendia |
| 19/10 | Criador de personagem de 7 peças, com os 9 bonecos originais como atalho; troca até no meio da partida | visual próprio sem poluir a sala |
| 19/10 | Rocha vira **Barricada** | nome mais claro |
| 19/10 | Jogo em português e inglês | amigos de fora |
| 19/10 | Baús: no máximo metade dos magos + 1 por rodada, nunca mais que 3 | baú demais por rodada |
| 19/10 | Sandbox no Treino (vida e ouro sem fim, bots e boneco pelo painel) | testar magias e interações |
| 19/10 | `master` protegido (PR + CI + aprovação); revisão automática do Claude em todo PR; ambiente `<nome>-dev` por colaborador; guia do colaborador no repositório | entrada de colaboradores |
| 19/10 | Os `CLAUDE.md` (raiz e pastas) são atualizados a cada decisão nova | todo dev com o mesmo contexto do dono |
| 19/10 | PR passa pela revisão automática do Claude (comentário com veredito) e pode ser ajustado e mesclado pelo agente do dono, inclusive PR de colaborador; comente `@claude` num PR ou issue para pedir ajuda | mesclar rápido sem o dono revisar à mão |
| 19/10 | Cada colaborador tem um ambiente dev próprio (`<usuário do GitHub>-dev`, em minúsculas) publicado sozinho a cada push | testar com outras pessoas antes do PR, sem tocar no jogo no ar |
| 19/10 | Fluxo dev do usuário → dev geral (`dev`, https://dev-warlock.fernandorffdev.com) → `master` (jogo no ar, publicado sozinho pela pipeline Produção) | testar junto antes de ir ao ar, sem publicar à mão |
| 19/10 | Promoção `dev` → `master` só quando o Fernando mandar | as promoções estavam rápidas demais; o dev geral serve para jogar antes |
| 20/10 | Teclas **Q W E R D F pela ordem da barra** ligadas por padrão; quem desmarcou continua sem (issue #65) | público de Dota já joga assim |
| 20/10 | No modo Q W E R D F as teclas das **posições** são trocáveis em Lançamento: Magia 1 a 6 e Item 1 a 3 (itens também por posição na barra; só 3 posições de item por enquanto) (issue #76) | configurar as teclas do Q W E R D F como no Dota; posição de item deixa trocar a ordem e receber itens ativáveis novos |
| 20/10 | Anel de alcance dos projéteis marca até onde a **ponta** chega (inimigo que encosta no anel é atingido); o Meteoro mostra também o círculo da explosão no ponto onde cai (issue #82) | o anel ficava 0,8 m curto (11 a 18%) e não mostrava a explosão; escolhido entre ponta + explosão, só projéteis e até o centro do inimigo |
| 20/10 | Monte de ouro do baú dá **3 a 5** (sorteado quando o baú nasce; antes 10) (issue #80). Aplicado **sem passar pelo simulador** (exceção decidida pelo dono, como a Ilusão) | 10 de ouro por monte era demais; o baú dá o mesmo ouro a qualquer build, então não muda qual magia ou item vence |
| 20/10 | Opção **Ouro ganho** com ×0,6 · ×1 · ×1,5 · ×2 (antes ×1,6 e ×2,5); a parte quebrada do ouro fica guardada por jogador e é paga aos poucos (no ×1,5 o monte do baú paga 1, 2, 1, 2…; abate de 5 vira 7 ou 8) (issue #88) | no ×1,6 o monte pagava 2 por tique (o arredondamento virava ×2); pedido do Fernando depois de jogar |
| 20/10 | **Ilusão** nova (issue #49): a cópia anda reto 2 s na direção do movimento, leva empurrão mas só some no prazo; quem lança fica invisível 2 s para todos (inclusive aliados) e outra magia o revela. Aprovada **sem passar pelo simulador** (exceção decidida pelo dono) | ideia do Leonard no estilo do Phantom Lancer do Dota |
| 20/10 | No lançamento **Rápido** o anel de alcance pisca por 0,4 s quando a magia ou o item sai de verdade (issue #61) | no Rápido o jogador nunca via o alcance; mostra sem atrasar o lançamento |
| 20/10 | Opção **Pixel art** em Configurações → Vídeo e efeitos, desligada por padrão e só no PC (issue #79): Desligado, 2 px ou 3 px; cena em blocos com contorno (`RenderPixelatedPass` do Three.js), câmera presa à grade de pixels e quase sem perspectiva para não tremer | pedido do Fernando a partir do vídeo "3D PixelArt Tutorial - Godot"; testado por ele no local e no fernandorff-dev |
| 20/10 | Comentário obrigatório de porquê em decisão não óbvia do código (regra em Regras do código); a revisão automática cobra | outras IAs e colaboradores entenderem antes de mexer |
| 20/10 | Prova de conceito (teste local, branch `poc/<assunto>`) não tem issue nem PR; a issue nasce só quando o Fernando decide que vale a pena | não encher os quadros com testes |
| 20/10 | Quadros kanban por tema além do geral: Balanceamento, Jogabilidade, Interface, Bugfix e Documentação e fluxos; a etiqueta da issue (`balanceamento`, `jogabilidade`, `visual`, `bug`, `documentação`) diz em qual quadro ela entra (lista no CONTRIBUTING, seção Issues) | acompanhar cada frente separada |
| 20/10 | **Sandbox** sempre na arena redonda (sem o seletor de arena) e com **torreta de treino**: Bola de fogo nível 1 numa direção fixa (cima, baixo, esquerda, direita), sem dano nem empurrão; a primeira nasce à esquerda do centro atirando para a direita, outras pelo painel, em diagonal para uma não bloquear o tiro da outra (issue #93, ideia do Leonard) | testar esquiva e empurrão sempre nas mesmas condições |
| 20/10 | **Loja mostra o equipamento**: 6 posições de magias (Q W E R D F) e 3 de itens ativos (1 2 3) no topo da loja, inclusive vazias; arrastar (na loja ou na barra da partida) troca a posição e Alt + seta faz o mesmo; magia e item não trocam entre si; a ordem fica salva no navegador (`warlock:loadout-order`) e vale para as teclas por posição e o controle (issue #94, ideia do Leonard) | ver a build e escolher a tecla de cada magia sem mudar o que foi comprado |
| 20/10 | **Menu principal novo** (issue #83, ideia do Leonard): barra com a logo W (`warlock-wars.svg`, o mesmo do ícone da aba; leva ao Início) · Jogar · Aprender · Guarda-roupas · Loja · Perfil, Configurações e Sair como ícones; Jogar com online, contra bots, sandbox e desafios à direita; magias dos bots escolhidas na sala. A Loja é só vitrine (sem preço nem compra) e a foto do gato na Início entra sem licença livre, por autorização do Fernando (crédito em `public/CREDITS.txt`) | navegação numa barra só, no estilo do Dota |
| 20/10 | Sem print de celular e sem otimizar para celular por enquanto; prints só no PC (substitui a regra de print de celular para mudança de layout) | foco no PC agora |
| 20/10 | Teclas de magias e itens ficam em Configurações → **Lançamento**, junto da caixa Q W E R D F: desligada, o botão "Teclas de cada magia" abre a lista; itens sempre ali; a seção Teclas fica só com os atalhos (issue #68) | a tecla de cada magia só importa sem o Q W E R D F; escolhido entre botão, lista sempre aberta e atalho |
| 20/10 | Issue só pelos modelos Bug e Ideia (issue em branco desligada), título de uma frase sem prefixo, um assunto por issue, quem vai fazer se atribui antes de começar e só pega issue sem dono | evitar duas pessoas no mesmo trabalho |
| 20/10 | Mudança grande (como o jogo se joga, balanceamento, tirar algo, mais de um dia de trabalho) só começa depois de decidida: issue **Ideia** com `precisa de decisão`, cerca de 2 dias de discussão, o Fernando dá a palavra final ouvindo o grupo, decisão escrita na issue e aqui; PR grande sem decisão espera. Bug e alinhamento de interface vão direto em PR | preocupação do grupo (Branco): cada um atacando o que dá na telha sem combinar |
| 20/10 | O menu de Configurações de dentro da partida usa a mesma página do menu inicial: seções empilhadas com rolagem e sumário (issue #70); no menu inicial, Esc e Start abrem a aba Configurações em vez do diálogo | mesmo estilo nos dois lugares, como pedido; evita duas cópias da página na tela |
| 20/10 | O dev geral continua, mas todo PR mesclado em `dev` (inclusive de colaborador) é promovido para o `master` logo em seguida, sem esperar a palavra do Fernando; balanceamento continua só depois da simulação aprovada. Substitui as duas linhas de 19/10 sobre promoção | ninguém jogava no dev geral antes de liberar; esperar só atrasava |
| 20/10 | Padronizar a interface com **funções no DOM puro** (sem framework): `dialog()`, `iconButton()`, `tabs()` exportada, `searchFilter()` e escala de tamanhos e cores no `:root`, uma função por PR trocando todas as cópias (issue #91). Começa pela `dialog()` nas Configurações, Grimório e Biblioteca (issue #110) | +0 KB no download e o HUD (que roda a cada quadro) fica como está; comparado com Preact (+6,3 KB, dois jeitos de montar tela), Solid (até +16,4 KB, plugin no Vite) e web components (estilo sai do `style.css` único) |
| 20/10 | Aba Configurações do menu inicial em página única (issue #59): seções empilhadas com sumário lateral fixo e a seção visível destacada, como as opções do Dota 2; no celular o sumário recolhe no topo. Personagem vira atalho para a aba dele e Idioma vira seção própria (também no diálogo) | público de Dota; achar e mudar uma opção sem abrir e fechar painéis; usar a largura do PC |
| 19/10 | O que o Fernando pede vai direto para o `master`: PR para `dev`, mescla e promoção `dev` → `master` em seguida | pedido dele ("pode colocar as minhas coisas direto para master sempre"); o que vem dos colaboradores segue esperando a palavra dele no dev geral |
| 20/10 | O dev geral (`dev`) sai do fluxo: a branch da tarefa sai do `master` e o PR vai direto para o `master` (squash), que publica o jogo no ar pela pipeline Produção; sem promoção `dev` → `master`; a `dev` fica parada (sem apagar) e o dev-warlock deixa de ser atualizado; os ambientes `<usuário>-dev` continuam (issue #72). Substitui as linhas de 19/10 e 20/10 sobre o dev geral e a promoção | toda mescla já ia ao ar na hora: o `dev` só dobrava PR e deploy |
| 19/10 | Vender devolve sempre 100% do que pagou; o ouro garantido da rodada (`ROUND_GOLD`) chega na hora da queda, para comprar enquanto assiste; loja: cartas ocupam a coluna, Vender no canto da carta (moeda no toque) | pedidos do Fernando |
| 19/10 | Modo novo **Ascensão** (roguelike, estilo ARAM com cartas): XP do mago, a cada nível escolhe 1 entre 3 cartas (magia nova, subir magia, item) no intervalo; sem ouro, loja nem baús; Flagelo continua de graça; 9 rodadas com pontos por colocação; 4 mecanismos de recuperação; aumentos ficam para a 2ª leva. Desenho em `docs/superpowers/specs/2026-10-19-ascensao-design.md` | progressão dentro da partida sem decidir o jogo cedo |
| 19/10 | Modo novo **Campanha** (co-op PvE roguelike, proposta do Lucas): 1 a 4 Acesos contra o Fumo numa noite de 30 a 45 min (3 estágios + chefe final), mapa gerado por semente no padrão Diablo 2 (objetivo fixo, noite nova a cada tentativa), 6 classes com passiva e árvore de cartas (Guerreiro, Arqueiro, Mago, Warlock, Ladino e Errante, que aprende tudo), XP e cartas do Ascensão, servos do Fumo (esqueletos com IA de bot), chefes pesados que voltam da lava com dano, reacender aliado caído. 1ª campanha: Última Vela; fatia 1 = Charneca Cinzenta + Sir Odran. Desenho em `docs/superpowers/specs/2026-10-19-campanha-design.md`. Dono do modo: Lucas (decide os detalhes da Campanha); o motor de cartas vem do Ascensão (Fernando, 19/10) | jogar junto contra o jogo, com história, sem mudar os modos atuais |
| 20/10 | Ícone da aba = o **W da foto do grupo do Telegram** (fonte Grenze Gotisch, degradê ouro → lava, moldura dourada redonda, fundo lava/escuro) e nome da aba e do cartão de compartilhamento **Warlock Wars** (o nome dentro do jogo não mudou); o ícone também existe em SVG vetorial em `public/warlock-wars.svg` para usar na interface (`<img src="/warlock-wars.svg">`), gerado por `scripts/assets/favicon.py` (issue #99) | identidade igual à do grupo e o nome completo do jogo na aba |
| 20/10 | **Uma Ladina só** nos prontos do criador; o capuz da Ladina encapuzada vira o chapéu **Capuz**, que serve em qualquer cabeça (malha `Rogue_Hood` no `rogue.glb`, 20% maior que o original para cobrir o cabelo das outras, gerada por `scripts/assets/hood.mjs`); códigos salvos com a encapuzada abrem como Ladina + Capuz (issue #107) | duas ladinas quase iguais confundiam; o capuz funciona melhor como acessório |
| 20/10 | Aba de teste diz qual é o teste: em `localhost`/`127.0.0.1` o título vira `🧪 <branch> · Warlock Wars` (branch gravada no build; refazer o build ao trocar de branch) e `?aba=<nome>` na URL troca o nome; no ar nada muda (issue #113) | várias sessões abrem abas de localhost para o Fernando testar e todas tinham o mesmo título |
| 20/10 | Toda sessão abre o teste com `?aba=<nome>&ir=<lugar>`: em `localhost`/`127.0.0.1`, `?ir=` leva direto ao ponto do teste (aba do menu, `config:<seção>`, `sandbox`, `partida`, `partida:loja`, `partida:ascensao`; sala e seção juntas com vírgula, ex. `sandbox,config:som`); lista no comentário de `src/client/main.ts`; abas velhas da mesma porta e aba com o servidor local fora do ar viram `❌ FECHAR · …`; no ar nada muda (issue #140) | pedido do Fernando: "sempre abrir os localhosts de teste o mais avançados possíveis para eu passar o mínimo de tempo testando" |
| 20/10 | A **Ladina pronta já vem com o Capuz** (o atalho do Guarda-roupas e os bots; quem quiser sem capuz troca o Chapéu para Nenhum) e a **Loja** mostra os mesmos 8 prontos, sem a Ladina encapuzada | pedidos do Fernando depois do #108 |
| 20/10 | **Sandbox**: a arena é escolhida no painel (Círculo, Anel, Ilhas, Cruz; começa redonda), escolher reinicia a rodada e a forma fica nos reinícios seguintes, nunca sorteada; botões − Menor / + Maior mudam o raio da pedra uma faixa por clique, na hora (de 1,3 m até o raio de 10 magos, 14,9 m; volta ao normal ao reiniciar); com vida infinita, entrar na lava não leva mais de volta para a pedra, só mantém a vida cheia. Substitui a parte "sempre na arena redonda (sem o seletor de arena)" da linha da torreta (issue #93) | pedidos do Fernando: a sandbox trocava a fase sozinha e o reset de posição na lava atrapalhava o teste |
| 20/10 | Branch local de teste sempre em dia com o `master`: a cada merge no `master`, toda branch com tarefa aberta recebe `git merge origin/master` (sem rebase nem force num PR já aberto), roda os gates e reinicia o servidor local; a orquestradora avisa as sessões filhas | evitar conflito no PR e o Fernando testar sempre a versão atual do jogo |
| 20/10 | PR de código do Fernando só é mesclado depois que ele aprova o teste em `localhost`: a sessão dona abre a aba no navegador dele (`?aba=<nome do teste>`), lista o que testar e o que esperar, e põe notas na tela (só em `localhost`) apontando o que mudou; aprovação em múltipla escolha, citada à revisora. PR só de docs/CI e PR de colaborador seguem como antes | ele quer ver e entender cada mudança no jogo antes de ir ao ar |
| 20/10 | **Ambiente por PR** (issue #125): cada PR (rascunho também) publica o próprio jogo em `pr-<n>-warlock.fernandorffdev.com` e ele é apagado sozinho quando o PR fecha; para testar com o grupo antes de pronto, PR em rascunho. Os ambientes `<usuário>-dev` e o `dev-deploy.yml` saem. Substitui as linhas de 19/10 e 20/10 sobre o ambiente `<nome>-dev` | decisão do Fernando em múltipla escolha ("Por PR, -dev sai"): link por tarefa, sem branch extra por pessoa |
| 20/10 | O **W da barra do menu principal** fica solto, sem placa, moldura nem fundo: só ganha brilho atrás com o mouse em cima; placa inclinada igual às abas e quadrado igual à chave foram recusados (issue #117) | o W é o emblema do jogo, não mais uma aba; a caixa em volta destoava das vizinhas |
| 20/10 | **Animações KayKit nos bonecos** (issue #142): gesto por magia (`CAST_ANIM` em `scene.ts`), preso cambaleia, arremessado de braços abertos, morte na pedra de costas (na lava segue a dos ossos), provocação com gesto pelo tom (`TAUNT_ANIM`), mago sai do chão ao nascer e Teleporte com fade e deslize de 0,24 s (só visual); clips dos originais KayKit e 4 do KayKit Character Animations 1.1 (CC0, mesmo esqueleto). Peso aceito: os 9 bonecos vão de 4,5 MB para 9,2 MB (cada um baixa só quando aparece) | de cima o mago fazia o mesmo gesto para quase tudo e o Teleporte era brusco; testado e aprovado pelo Fernando em localhost |
| 20/10 | Loja com **itens em 3 colunas** (antes 2) no PC: cartão de item de ~105 px (antes 118), coluna de itens de 334 px e a loja só para ver 60 px mais larga (1300 px) para as magias seguirem 5 por fileira em 1280 e 1920 (issue #121) | com 2 colunas a loja ficava muito vertical; escolhido entre cartão de 105 px, de 97 px e cartão de 118 px com a Ficha do mago mais estreita |
| 20/10 | **Sala contra bots sem escolha de magias** (issue #145): sai o bloco "Magias dos bots" (Sorteio + grade); os bots compram sozinhos, como em qualquer sala. A escolha do boneco fica só na sandbox | pedido do Fernando: "nem quero sorteio nem nada" |
| 20/10 | **Música desligada nas abas de teste** (issue #158): em `localhost`/`127.0.0.1`, sem volume guardado, a música começa em 0 (no ar segue 0,7); `?musica=1` volta ao padrão para os testes de som. Os efeitos não mudam e volume já guardado vale igual | pedido do Fernando: "está muito irritante várias abas tocando a música" |
| 21/10 | PR **pequeno** de colaborador (bug, alinhamento de interface, texto, ajuste visual pontual) a revisão aprova e mescla sem o "aprovado" do Fernando; PR **grande** de colaborador só entra com a aprovação do Fernando (além da decisão da issue); PR das sessões do Fernando segue com o teste em `localhost` aprovado por ele | pedido dele: "pode aprovar as PRs deles sem minha aprovação se forem coisas pequenas" |
| 21/10 | Fluxo de teste recomendado para a IA de cada dev (docs/GUIA-COLABORADOR.md, seção Testar): navegador só de testes com perfil separado e porta de depuração em 127.0.0.1, aba já no ponto certo com `?aba=`/`?ir=`, música desligada (`?musica=1` em teste de som), 3 a 5 passos do que testar, limpeza no fim; sem aba em mudança que não altera o jogo | pedido do Fernando: cada dev testar a própria mudança em segundos |
| 21/10 | **Quando sair do rascunho:** PR em rascunho é só trabalho em andamento ou teste com o grupo; pronto (gates verdes, testado, prints de PC se a tela mudou) vai para *Ready for review*. Agente que não consegue testar no navegador sai do rascunho do mesmo jeito e escreve no PR o que não testou e como testar; a revisão testa no ambiente do PR (CONTRIBUTING, Ambiente de cada PR) | pedido do Fernando: PRs dos colaboradores ficavam parados em rascunho porque a IA deles não abre navegador, e rascunho não recebe a revisão automática |
| 21/10 | Sandbox: "Ver invisíveis (teste)" nasce **desligado**; desligado, quem está na Caminhada no vento ou no véu da Ilusão some para os outros humanos como numa sala normal; ligado, aparece translúcido (PR #164, issue #162) | a opção nascia ligada e, desligada, ainda mostrava o dono da Ilusão: o teste com dois humanos não reproduzia o que se vê numa partida |
| 21/10 | Lojas no PC (acima de 1100×600 px) no formato compacto da compra inicial: compra entre rodadas, consulta na partida, Sandbox, Deathmatch, bots e quem caiu; 5 magias por fileira, 3 colunas de itens, 9 vagas; Ficha do mago começa recolhida (PR #163, issue #161) | pedido do Leonard: menos rolagem para ver a loja; em 1280×720 a sobra de rolagem caiu de 488 px para 20 px |
| 21/10 | Troca, Agarrar e Magnetizar num inimigo contam como golpe para o **crédito do abate** (sem dano nem empurrão), em todos os modos: quem derruba alguém na lava só com elas leva o abate, o ouro e a metade da lava (issue #179) | "no jogo normal tbm deve contar" (na revisão do modo Ascensão, #176, ao saber que magia sem dano não dava o abate) |
| 21/10 | Ajuste pedido pelo Fernando e feito na hora vai direto para branch e PR, **sem issue** (o PR descreve o pedido); issue nova só para trabalho que ninguém vai fazer agora e fica no quadro para alguém pegar | "não precisa ficar abrindo issues pra esses meus ajustes ... issues agora só devem ser abertas para algo que você não vai trabalhar agora e quer deixar lá no board pra alguém pegar" |
| 21/10 | Interface só com as peças que já existem (`dialog()`, `iconButton()`, `tabs()`, `choice()`, `searchFilter()`, `withTip`) e as variáveis do `:root`; peça nova só se nenhuma serve, estendendo antes, e registrada em `src/client/CLAUDE.md`; a revisão automática e o modelo do PR cobram | pedido do Fernando: as IAs dos colaboradores não gerarem interface solta e sem componentização |
| 21/10 | Modo **Ascensão** (issue #180, desenho em `docs/superpowers/specs/2026-10-19-ascensao-design.md`): 9 rodadas, XP do mago (dano das magias, lava creditada, abates e tempo vivo), 1 entre 3 cartas por nível no intervalo (magia nova, subir magia ou item; sem ouro, loja nem baús), pontos pela ordem de queda e as 4 recuperações. Toda a regra em `src/shared/ascension.ts` e a tela em `src/client/ascension-ui.ts`; o resto só chama por gancho atrás de `m.asc` ("deixe o código do ascension mais separado", 19/10). Magias e itens com os números de hoje ("por enquanto o modo Ascension vai ser sem skills re balanceadas", 21/10); os números do modo são iniciais e mudam em PRs de rebalanceamento | progressão dentro da partida sem mexer nos outros modos (hash do `tests/style.test.ts` igual) |

## Fluxo com agente

Ambiente sugerido: uma sessão orquestradora e uma sessão filha por issue, cada uma no seu worktree; explicação, vantagens (economia de tokens, paralelismo) e passo a passo em [docs/SESSOES-COM-ORQUESTRADOR.md](docs/SESSOES-COM-ORQUESTRADOR.md).

Skills (plugins `superpowers@claude-plugins-official` e `ponytail@ponytail`): brainstorming antes de coisa nova → writing-plans para vários passos → TDD em `src/shared` → systematic-debugging antes de corrigir bug → verification-before-completion antes de dizer pronto → `/ponytail-review` no diff antes do PR. Guia completo do colaborador (máquina, prompts, testes, problemas comuns): [docs/GUIA-COLABORADOR.md](docs/GUIA-COLABORADOR.md).

Armadilhas: depois de `vite build`, reinicie o `wrangler dev` (senão página branca/404); trabalhe em branch deste repositório, não em fork (em fork o CI espera aprovação manual e a revisão automática não roda); todo PR (rascunho também) publica em `https://pr-<n>-warlock.fernandorffdev.com`.

## Ambiente por PR

Todo PR do próprio repositório, rascunho também, publica em `https://pr-<n>-warlock.fernandorffdev.com` (`.github/workflows/pr-env.yml`, Worker `warlock-pr-<n>` e salas próprios, teste rápido no fim). Um comentário fixo no PR traz o link e o commit no ar, editado a cada push. Ao fechar o PR (mesclado ou não) o domínio e o Worker são apagados e o comentário avisa; reabrir publica de novo. Para testar com o grupo antes de pronto, abra o PR em rascunho. PR de fork não ganha ambiente (sem segredos). Limite do plano grátis: 100 Workers por conta e 100 domínios próprios por zona, PRs abertos somados ao jogo no ar.

### Fluxo dos ambientes

**branch da tarefa → PR para o `master` → no ar** (decisão do Fernando, 20/10; o dev geral saiu do fluxo):

1. Branch da tarefa (`feat/…`, `fix/…`) a partir do `master`; para testar com outras pessoas, abra o PR em rascunho: ele ganha o próprio link. Pronto, sai do rascunho; agente que não consegue testar no navegador sai do rascunho do mesmo jeito e escreve no PR o que não testou e como testar (a revisão testa no ambiente do PR).
2. PR da tarefa para o **`master`** (a branch padrão), em *squash and merge*. Mudança de balanceamento só depois da simulação aprovada.
3. Ao mesclar, a pipeline **Produção** publica em https://warlock.fernandorffdev.com. Sem promoção e sem dev geral.

### Pipelines

| Pipeline | Arquivo | Quando roda | O que faz | Se der errado |
|---|---|---|---|---|
| CI | `ci.yml` | todo PR e todo push no `master` | os dois `tsc`, `vitest run`, `vite build` | o PR não entra; abra o log em Actions e corrija na mesma branch |
| Título do PR | `pr-title.yml` | ao abrir ou editar o PR | confere o formato `tipo: o que muda` | edite o título; roda de novo sozinho |
| Revisão do Claude | `claude-review.yml` | PR aberto, commit novo, saiu de rascunho | comenta veredito, checagens e pontos (não aprova nem mescla) | não bloqueia; não roda em fork nem no PR que altera o próprio workflow |
| `@claude` | `claude.yml` | comentário com `@claude` num PR ou issue | responde e ajuda no próprio PR/issue | — |
| Ambiente do PR | `pr-env.yml` | PR aberto, push novo, reaberto e fechado (só PR do próprio repositório) | build, publica `warlock-pr-<n>` em `pr-<n>-warlock.fernandorffdev.com`, espera o domínio responder, roda o teste rápido e edita o comentário fixo com o link; ao fechar, apaga o Worker (o domínio sai junto) | build quebrado: nada é publicado e a versão anterior do PR continua; teste rápido falhou: a versão nova já está no ar com problema, veja o log; limpeza falhou: o Worker fica no ar, rode o job de novo (*Re-run*) em Actions |
| Produção | `deploy.yml` | push no `master` (merge do PR da tarefa) | gates, publica o jogo no ar, confere se o site serve o build novo e roda o teste rápido | falhou antes do deploy: nada muda no ar; falhou depois: o jogo no ar está com a versão nova, veja o log |

Logs: https://github.com/fernandorff/warlock/actions.

## Balanceamento (como se decide número de magia e item)

- Os números vêm do simulador, não de opinião: `node scripts/balance-sim.ts --minutes 30 --seed 1 --difficulty normal --out balance/<pasta>` (vários processos com sementes diferentes; junte com `--merge`).
- O número que vale é a **vitória ajustada pelo ouro** (coluna "ajustada"; 1,00 = vence o justo). Faixa aceita: **0,85 a 1,15 no Normal e no Difícil**. Metas de diversão no relatório (rodada de 60 a 120 s, ≥ 60% das mortes por golpe).
- Quando um número não responde a mudanças, desconfie do bot: no Redirecionador, a recarga não mudava nada; o problema era o bot reagir perfeitamente.
- `build-tournament.ts` acha combinações de compra dominantes; relate, não ajuste sozinho.
- Mudança de balanceamento só entra depois de medida localmente com dados suficientes (dezenas de milhares de rodadas por dificuldade).

## Testar no navegador

Prints com Playwright headless contra `npx wrangler dev`; confira no PC (1280×720 e 1920×1080), sem print de celular por enquanto (o celular não está sendo otimizado, decisão de 20/10), e as duas línguas (`localStorage.warlock:lang = 'pt' | 'en'`). `node scripts/smoke.mjs <url>` faz o teste rápido de uma sala de verdade. Scripts prontos: `node scripts/play-headless.mjs <url> <pasta-prints>` (uma rodada com prints), `long-headless.mjs`, `multi-headless.mjs` (3 pessoas), `ghost-socket.mjs` (conexão que some sem fechar; sem navegador, ~6 min). Usam o Chrome instalado (`PW_CHANNEL=chromium` para o Chromium do Playwright, depois de `npx playwright-core install chromium`) e um perfil temporário (`PW_PROFILE=<pasta>` para um fixo).

## Git

Fluxo completo em [CONTRIBUTING.md](CONTRIBUTING.md): uma branch por tarefa a partir do `master` (`feat/`, `fix/`, `balance/`, `style/`, `docs/`, `refactor/`), commits em português com o tipo na frente (`feat: …`), pull request com o modelo de `.github/`, CI verde (`.github/workflows/ci.yml`: os dois `tsc`, `vitest`, `vite build`) e *squash and merge*. PR da tarefa vai direto para o `master`. Agente: nunca dê push direto no `master`; abra PR.

## Publicar

Automático: o merge no `master` publica o jogo no ar pela pipeline **Produção** (`deploy.yml`), com gates, conferência do `index-*.js` servido e teste rápido. Publicar à mão (`npx vite build && npx wrangler deploy`) só em emergência, por quem tem a conta Cloudflare.

## Créditos e licenças

Assets de uso livre (KayKit, Kenney, ambientCG, Poly Haven, OpenGameArt): lista em `public/CREDITS.txt`. Asset novo só com licença que permita uso e redistribuição, e com crédito no CREDITS.txt.
