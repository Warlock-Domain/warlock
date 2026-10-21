# Warlock Wars: guia do colaborador

Tudo para contribuir com o jogo usando um agente de IA (Claude Code, Codex, Cursor…) no mesmo fluxo do dono do projeto, sem quebrar o que já funciona. Regras de código e comandos: [CLAUDE.md](../CLAUDE.md). Fluxo de Git: [CONTRIBUTING.md](../CONTRIBUTING.md).

## Comece aqui

Warlock Wars é um remake web do mod **Warlock** (Warcraft 3 / Warlock Brawl do Dota 2): magos numa arena de pedra cercada de lava que encolhe. Ninguém morre de dano: você empurra os outros para a lava com magias. O último de pé vence a rodada; entre rodadas, uma loja vende magias e itens. O público são jogadores de Dota, então a interface segue o jeito do Dota.

- Jogar: https://warlock.fernandorffdev.com (jogue algumas partidas antes de mexer no código)
- Código: https://github.com/fernandorff/warlock; tarefas saem do `master` e voltam para ele por PR; o `master` é o jogo no ar

Primeiro dia:

1. Aceite o convite de colaborador (e-mail ou https://github.com/fernandorff/warlock/invitations). Trabalhe em branches deste repositório, não num fork: em fork o CI precisa de aprovação manual, a revisão automática não roda e o ambiente dev não publica.
2. Prepare a máquina e rode o jogo localmente.
3. Instale o Claude Code e as skills.
4. Jogue e abra o grimório (<kbd>F1</kbd>) e a biblioteca de magias e itens (<kbd>F2</kbd>).
5. Escolha algo pequeno (etiqueta `bom primeiro PR`, ou abra uma issue de Ideia) e combine antes de codar.
6. Branch, gates, PR pelo modelo.

## Preparar a máquina

| Ferramenta | Versão | Para quê |
|---|---|---|
| Node.js | 24 ou mais novo | jogo, testes e simulador (o CI usa 24) |
| Git | recente | branches e commits |
| GitHub CLI (`gh`) | recente | PR e CI pelo terminal (o agente usa) |
| Google Chrome | instalado | scripts de teste no navegador |

```bash
git clone https://github.com/fernandorff/warlock.git
cd warlock
npm ci
npx wrangler dev            # servidor + jogo em http://localhost:8787
```

Não precisa de conta Cloudflare para desenvolver: o `wrangler dev` roda Workers + Durable Objects localmente. Para jogar com outra pessoa no mesmo PC, abra outra aba com `?as=outro` no endereço.

Gates (todos verdes antes de cada commit; o CI roda os mesmos):

```bash
npx tsc --noEmit -p .
npx tsc --noEmit -p src/worker
npx vitest run
npx vite build
```

## Ambiente de cada PR

Todo PR, rascunho também, publica em `https://pr-<n>-warlock.fernandorffdev.com` (`<n>` é o número do PR), com salas separadas do jogo no ar. O link fica num comentário fixo no PR, atualizado a cada push. Para testar com outras pessoas antes de pronto, abra o PR em rascunho e mande o link no grupo. Ao fechar o PR o ambiente é apagado sozinho. Só funciona com branch neste repositório (não em fork).

## Pipelines

| Pipeline | Arquivo | Quando roda | O que faz | Se der errado |
|---|---|---|---|---|
| CI | `ci.yml` | todo PR e todo push no `master` | os dois `tsc`, `vitest run`, `vite build` | o PR não entra; abra o log em Actions e corrija na mesma branch |
| Título do PR | `pr-title.yml` | ao abrir ou editar o PR | confere o formato `tipo: o que muda` | edite o título; roda de novo sozinho |
| Revisão do Claude | `claude-review.yml` | PR aberto, commit novo, saiu de rascunho | comenta veredito, checagens e pontos (não aprova nem mescla) | não bloqueia; não roda em fork nem no PR que altera o próprio workflow |
| `@claude` | `claude.yml` | comentário com `@claude` num PR ou issue | responde e ajuda no próprio PR/issue | — |
| Ambiente do PR | `pr-env.yml` | PR aberto, push novo, reaberto e fechado (só PR do próprio repositório) | build, publica `warlock-pr-<n>` em `pr-<n>-warlock.fernandorffdev.com`, espera o domínio responder, roda o teste rápido e edita o comentário fixo com o link; ao fechar, apaga o Worker (o domínio sai junto) | build quebrado: nada é publicado e a versão anterior do PR continua; teste rápido falhou: a versão nova já está no ar com problema, veja o log; limpeza falhou: o Worker fica no ar, rode o job de novo (*Re-run*) em Actions |
| Produção | `deploy.yml` | push no `master` (merge do PR da tarefa) | gates, publica o jogo no ar, confere se o site serve o build novo e roda o teste rápido | falhou antes do deploy: nada muda no ar; falhou depois: o jogo no ar está com a versão nova, veja o log |

Logs: https://github.com/fernandorff/warlock/actions.

## Claude Code e as skills

Sugestão de organização: uma sessão orquestradora e uma sessão filha por issue, cada uma no seu worktree. Como montar, por que economiza tokens e as regras para as sessões não se atrapalharem: [Sessões com orquestrador](SESSOES-COM-ORQUESTRADOR.md).

Dentro do Claude Code:

```text
/plugin marketplace add anthropics/claude-plugins-official
/plugin install superpowers@claude-plugins-official
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
# opcionais
/plugin install frontend-design@claude-plugins-official
/plugin install playwright@claude-plugins-official
```

| Skill | Quando |
|---|---|
| `superpowers:brainstorming` | antes de funcionalidade nova: perguntas até entender o que se quer |
| `superpowers:writing-plans` | tarefa de vários passos: plano com arquivos, funções e testes |
| `superpowers:test-driven-development` | lógica nova em `src/shared`: teste que falha primeiro |
| `superpowers:systematic-debugging` | qualquer bug, antes de propor conserto |
| `superpowers:verification-before-completion` | antes de dizer "pronto": rodar a checagem que prova |
| `ponytail` | ao implementar: precisa existir? já existe no projeto? a biblioteca padrão faz? cabe em uma linha? |
| `/ponytail-review` | no diff, antes de abrir o PR |

Os padrões do projeto (`CLAUDE.md`) vencem as skills.

### Fluxo com IA

1. **Entender:** o agente lê o `CLAUDE.md` e os arquivos da área antes de tudo.
2. **Combinar:** coisa nova vira issue (diga também o que *não* quer).
3. **Planejar:** mais de um arquivo → plano; leia antes de deixar implementar.
4. **Branch:** `git checkout -b feat/minha-ideia` a partir do `master` atualizado.
5. **Implementar com teste:** lógica em `src/shared` com teste em `tests/`; tela conferida no navegador.
6. **Gates** verdes; mudou tela → prints no PC, português e inglês; sem print de celular por enquanto (o celular não está sendo otimizado, decisão de 20/10).
7. **Revisar:** `/ponytail-review` e uma segunda leitura tentando derrubar a mudança.
8. **PR** pelo modelo, título `tipo: o que muda`. A revisão automática comenta no PR; o dono aprova e mescla. (O teste em `localhost` aprovado pelo Fernando antes do merge vale só para os PRs de código das sessões dele; o seu PR segue a revisão normal.)

### Prompts que funcionam

```text
Leia o CLAUDE.md e o CONTRIBUTING.md. Quero [ideia]. Antes de codar, use o brainstorming
e me faça as perguntas que faltam. Não mude números de magia sem medir no simulador.
```

```text
Bug: [o que acontece] quando [passo a passo]. Use systematic-debugging: reproduza com um
teste que falha, ache a causa e só então corrija. Rode os 4 gates no fim.
```

```text
Faça a mudança numa branch feat/..., commits em português com o tipo na frente, e abra o PR
pelo modelo de .github/ (para o master) com prints antes e depois. Não dê push direto no master.
```

## Fluxo do Git e PR

Fluxo: **branch da tarefa → PR para o `master` → no ar** (decisão de 20/10: o dev geral saiu do fluxo). O merge do PR publica o jogo no ar pela pipeline Produção. O `master` é protegido: só entra por PR com o CI verde (`checks`) e a checagem do título (`titulo`). Sem force push.

| Item | Padrão | Exemplo |
|---|---|---|
| Branch | `tipo/assunto` a partir do `master` | `feat/runa-de-gelo`, `fix/loja-celular`, `balance/raio` |
| Commit | português, tipo na frente | `fix: loja não trava mais no celular` |
| Tipos | `feat` · `fix` · `balance` · `style` · `refactor` · `docs` · `ci` · `test` | |
| Título do PR | igual a um commit (vira o commit no `master`) | `feat: runa de gelo que deixa lento por 3 s` |
| Merge | squash and merge pelo dono | a branch é apagada depois |

Um PR, um assunto. Mantenha a branch em dia com o `master` **a cada merge nele** (`git fetch` + `git merge origin/master`, sem rebase nem force), rode os gates e reinicie o servidor local; depois que a revisão começou, responda com commits novos.

Issues: modelos **Bug** e **Ideia**. Etiquetas: `bug`, `ideia`, `balanceamento`, `jogabilidade`, `visual`, `documentação`, `bom primeiro PR`, `precisa de decisão`. Quadros kanban: um geral e um por tema (Balanceamento, Jogabilidade, Interface, Bugfix, Documentação e fluxos); lista e links no [CONTRIBUTING](../CONTRIBUTING.md#issues).

## Como o jogo funciona por dentro

- **Navegador (`src/client`):** cena 3D (Three.js), teclado/mouse/controle, sons, interface em HTML/CSS, previsão do próprio mago.
- **Servidor (`src/worker`):** Cloudflare Workers; cada sala é um Durable Object que roda a partida de verdade.
- **Lógica comum (`src/shared`):** o mesmo código nos dois lados. O servidor decide; o navegador só prevê.
- **Ritmo:** simulação a 60 passos/s, estado enviado 30 vezes/s por WebSocket, interpolação dos outros magos.

```text
navegador ──WebSocket──▶ Durable Object (uma sala)
   │  comandos validados        │ tickMatch → stepWorld (60/s)
   │  (protocol.ts)             │ bots pensam (bots.ts)
   ◀── snapshot 30/s ───────────┘ snapshot.ts
```

## Mapa do código

`src/shared`: `sim.ts` (simulação), `spells.ts` (25 magias), `items.ts` (16 itens), `constants.ts` (arena, lava, baús, runas), `match.ts` (fases, loja, ouro, votações), `bots.ts` (`BOT_SKILL` por dificuldade), `protocol.ts` (mensagens e validação), `arena.ts`, `snapshot.ts`, `characters.ts` (9 bonecos e o look de 7 peças), `telemetry.ts`.

`src/client`: `main.ts` (laço), `ui.ts` (menus, sala, loja, barra da partida, placar), `scene.ts` (3D), `style.css`, `i18n.ts`, `rules-text.ts`, `grimoire.ts` e `demo.ts` (grimório e demonstrações), `tips.ts`, `sheet.ts`, `settings.ts`, `keys.ts`, `gamepad.ts`, `avatar.ts` (criador de personagem), `train.ts`, `challenges.ts`, `mimic.ts`, `coach.ts`, `predict.ts`, `interp.ts`, `net.ts`.

`src/worker`: `room-do.ts` (sala), `lobby.ts` e `index.ts` (lista de salas, telemetria, `/api/…`).

`scripts`: `balance-sim.ts`, `build-tournament.ts`, `*-headless.mjs`, `smoke.mjs`. `tests`: Vitest (simulação, bots, partida, protocolo, loja, idioma…).

## Regras para não quebrar nada

1. Os 4 gates verdes.
2. Duas línguas: todo texto visível com `t('português', 'English')`; nomes por `spellName`/`itemName`/`arenaName`; números com `LOCALE`.
3. Determinismo: `tests/style.test.ts` guarda o hash de uma partida com semente. Mudou = você mudou o jogo; regrave só se for de propósito e explique no PR.
4. Nada de `Math.random` solto na simulação: use o `rand` recebido.
5. Mensagem nova do navegador validada em `parseClientMessage`.
6. Celular: fora de foco por enquanto (decisão de 20/10); só não apague as regras de celular que já existem.
7. Número de magia, item ou bot só com medição do simulador no PR.
8. Menos código: reaproveite `el()`, `choice()`, `withTip`, `store`, `t()`; mudança cirúrgica.
9. Sem segredo: o repositório é público.
10. Asset só com licença livre e crédito em `public/CREDITS.txt`.

Estilo: decisão não óbvia leva 1 linha de comentário com o porquê (tempo, número, ordem, contorno de bug), para outra pessoa ou IA não desfazer sem querer; o óbvio não se comenta; mudou a decisão, mude o comentário; imports no topo; siga o estilo do arquivo. O `ui.ts` não carrega no Vitest: decisão de tela testável vai para função pura.

## Testar

```bash
npx vitest run                         # todos
npx vitest run tests/bots.test.ts      # um arquivo
npx vitest run -t "Ilusão"             # pelo nome

npx wrangler dev
node scripts/play-headless.mjs http://localhost:8787 prints/          # rodada com prints
node scripts/play-headless.mjs http://localhost:8787 prints/ 390 844  # celular
node scripts/multi-headless.mjs http://localhost:8787 prints/         # 3 pessoas
node scripts/smoke.mjs http://localhost:8787                          # teste rápido
```

Os scripts usam o Chrome instalado e um perfil temporário. `PW_CHANNEL=chromium` usa o Chromium do Playwright (`npx playwright-core install chromium` antes); `PW_PROFILE=<pasta>` usa um perfil fixo.

Atalhos: aba **Jogar** (partida contra bots, desafios, Sombra e a sandbox com ouro e vida infinitos, arena à escolha, pedra que cresce e diminui e torreta de treino), `?as=nome` no endereço, `localStorage['warlock:lang'] = 'pt' | 'en'`. Mudança de tela: PC 1280×720 e 1920×1080, português e inglês, sem erro no console; sem print de celular por enquanto (o celular não está sendo otimizado, decisão de 20/10).

### Fluxo de teste recomendado para a sua IA

Peça à sua IA (Claude Code, Codex, Cursor…) que, a cada mudança, deixe o teste pronto para você testar em segundos. Ela abre o teste num navegador só de testes, já no lugar certo, e diz o que conferir. As sessões do Fernando usam esse fluxo; os detalhes estão em [SESSOES-COM-ORQUESTRADOR](SESSOES-COM-ORQUESTRADOR.md#regras-que-evitam-problema).

1. **Navegador só de testes.** A IA abre um perfil separado do Chrome ou do Edge, com a porta de depuração ligada só no seu PC. Assim ela consegue listar e fechar as abas de teste sem mexer no seu navegador do dia a dia. Desde o Chrome 136, essa porta só funciona fora do perfil normal.
   ```powershell
   # Windows (Edge); no Chrome é igual, trocando o executável
   & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --user-data-dir="$HOME\warlock-testes" --remote-debugging-port=9333 --remote-debugging-address=127.0.0.1 --no-first-run "http://localhost:8787/?aba=minha-mudanca&ir=sandbox"
   ```
   Se a janela já estiver aberta, o mesmo comando só acrescenta uma aba. Para fechar, a IA lista as abas em `http://127.0.0.1:9333/json/list` e fecha cada uma em `http://127.0.0.1:9333/json/close/<id>`.
2. **Já no ponto do teste.** `?ir=<lugar>` leva direto ao que mudou (lista dos lugares no comentário do `?ir=` em `src/client/main.ts`; ex.: `sandbox`, `partida:loja`, `config:som`).

   `?aba=<nome>` dá o nome da aba. Exemplo: `?aba=fix-loja&ir=partida:loja`.
3. **Sem barulho.** Em localhost a música começa desligada. Num teste de som, abra com `?musica=1`.
4. **O que testar, à vista.** A IA manda no chat de 3 a 5 passos curtos, cada um com o que esperar. Se ajudar, ela põe notas na tela, só em localhost: uma caixinha apontando o que mudou, feita por um script local que fica fora do commit.
5. **Limpeza.** Ao terminar, a IA desliga o servidor local e fecha as abas dele. Abas velhas da mesma porta já aparecem como `❌ FECHAR`.
6. **Quando pular.** Mudança que não altera o jogo (refatoração, limpeza, docs, CI) não precisa de aba de teste. Bastam os gates verdes e, se mexer em tela, prints de antes e depois iguais.

Prompt pronto: *"Ao terminar, suba o `wrangler dev`, abra a aba no meu navegador de testes já com `?aba=` e `?ir=` no ponto da mudança, me diga em até 5 passos o que testar e o que esperar, e feche as abas e o servidor quando eu aprovar."*

## Balanceamento

O simulador joga partidas só de bots e mede quanto **ter** cada magia ou item aumenta a chance de vencer.

- **Vitória ajustada pelo ouro:** 1,00 = vence o justo; 1,15 = 15% acima do justo. Faixa aceita **0,85 a 1,15 no Normal e no Difícil**. A Bola de fogo é a referência (todos têm).
- **Metas de diversão:** rodada de 60 a 120 s; ≥ 60% das mortes por golpe; toda magia e item comprado por ≥ 4% dos bots.

```bash
node scripts/balance-sim.ts --minutes 20 --seed 1 --difficulty normal --out balance/x/p1
node scripts/balance-sim.ts --minutes 20 --seed 2 --difficulty normal --out balance/x/p2
node scripts/balance-sim.ts --merge --difficulty normal --out balance/x/total balance/x/p1 balance/x/p2
# relatório em balance/x/total/report.md (balance/ fica fora do git)
```

Conclusão precisa de dezenas de milhares de rodadas por dificuldade (com pouco dado a variação é de ±0,02 a 0,03).

Lições: quando o número não responde, desconfie do bot (o Redirecionador vencia 18% acima do justo por reação perfeita do bot, não pela recarga); o que mata é o empurrão para a lava, não o dano; `build-tournament.ts` acha builds dominantes — relate, não ajuste sozinho.

Estado em 19/10/2026 (~25 mil rodadas no Normal, ~20 mil no Difícil): todas as magias e itens entre 0,85 e 1,15; rodada média 96 s no Normal e 78 s no Difícil; ~90% das mortes por golpe.

## Decisões que já foram tomadas

Não desfaça sem combinar numa issue.

| Assunto | Decisão |
|---|---|
| Público e estilo | jogadores de Dota; menus, loja e barra no jeito do Dota; menus enxutos |
| Menu principal | barra: logo W do ícone da aba (Início) · Jogar · Aprender · Guarda-roupas · Loja (vitrine) · Perfil; Configurações e Sair como ícones (issue #83) |
| Loja | grade de ícones com nome dentro, preço com moeda, busca; itens prateados numa coluna à esquerda; Ataque em 2 fileiras de 5, os outros grupos em 1 |
| Cores por grupo | Ataque vermelho-laranja, Mobilidade verde, Defesa azul, Controle roxo, Itens prateado |
| Grupos de magia | 10 ataque, 5 mobilidade, 5 defesa, 5 controle |
| Sala | sem opção de ritmo (sempre Normal) nem de morte súbita (sempre ligada); dificuldade bot a bot |
| Baús | no máximo metade dos magos + 1 por rodada, nunca mais que 3 |
| Escudo | o do Warlock original, recarga 16 s no nível 1 |
| Drenar | domina combinações no Normal, mas espera partidas reais antes de mexer |
| Ataques | Bola de fogo frequente; as outras são golpes fortes e raros (não encurtar recargas) |
| Bots | jogam "como gente": mira com erro, reação de 0,25 a 0,6 s, hesitação; no duelo final vão atrás do inimigo |
| Personagem | criador de 7 peças com 8 bonecos originais como atalho (uma Ladina só; o capuz é um chapéu); prévia 3D orbitável (arraste para girar e role para aproximar) |
| Recusados | ranking; itens que só ajudam uma magia específica |
| Publicação | automática: merge do PR no `master` → jogo no ar |

## Magias e itens

- **Ataque (10):** Bola de fogo, Raio, Míssil teleguiado, Meteoro, Rajada, Bumerangue, Ricochete, Recarga, Divisor, Bola de neve
- **Mobilidade (5):** Teleporte, Troca, Investida, Estocada, Caminhada no vento
- **Defesa (5):** Escudo, Alteração, Zona de dobra, Barricada, Ilusão
- **Controle (5):** Agarrar, Gravidade, Elo, Magnetizar, Drenar
- **Itens (16):** Anel de vida, Anel amaldiçoado, Capa, Armadura, Botas, Relógio de bolso, Roubo de vida, Botas de lava, Guardião, Elmo, Botas de choque, Égide, Botas de vento, Flagelo (ativo), Redirecionador (ativo), Pacto (ativo)

**Ilusão:** cria uma cópia visível que segue reto na direção do movimento por 2 s. O jogador pode se mover livremente enquanto fica invisível; usar outra magia o revela, sem encerrar a cópia. Jogador e cópia podem ser atingidos; a cópia pode ser empurrada, mas não destruída antes do fim do prazo.

Modos: Rodadas (vence quem fizer 5), Deathmatch (volta em 10 s), Times (Azul × Vermelho). Arenas: Círculo, Anel, Ilhas, Cruz. Atalhos: <kbd>F1</kbd> grimório, <kbd>F2</kbd> biblioteca, <kbd>Tab</kbd> placar, <kbd>4</kbd> loja, <kbd>5</kbd> replay da queda, <kbd>Esc</kbd> configurações.

## Problemas comuns

| Sintoma | Causa e saída |
|---|---|
| Página branca ou 404 no `wrangler dev` depois de um build | o `vite build` trocou o `dist/`: pare e suba o `wrangler dev` de novo |
| `tests/style.test.ts` falha no hash | a jogabilidade mudou; se foi de propósito, regrave e explique no PR |
| Teste de bot falha às vezes | amostra pequena: aumente a duração da partida do teste em vez de afrouxar a conta |
| "Título fora do padrão" no CI | edite o título do PR para `tipo: o que muda` |
| Push no `master` recusado | é a proteção: branch + PR para o `master` |
| CI parado em "aguardando aprovação" | PR veio de fork: use branch neste repositório |
| Aviso LF/CRLF no Windows | normal |
| Texto em português com o jogo em inglês | faltou `t('pt', 'en')` |

## Checklist do PR

- Branch `tipo/assunto`, título `tipo: o que muda`, `Closes #n` se houver issue (em inglês, para o GitHub fechar a issue sozinho).
- Os 4 gates verdes.
- Teste novo para lógica nova, falhando sem a mudança.
- Tela mexida: prints antes e depois no PC, português e inglês; sem print de celular por enquanto (o celular não está sendo otimizado, decisão de 20/10).
- Número mexido: medição do simulador (antes → depois, Normal e Difícil).
- Todo texto com `t()`; sem segredo; asset com licença e crédito.
- `/ponytail-review` no diff.
- Hash do `style.test.ts` igual, ou mudança explicada.

Dúvida sobre o que o jogo deve fazer: issue com a etiqueta `precisa de decisão`.
