# Sessões com orquestrador: como trabalhar no Warlock com vários agentes

Sugestão de ambiente de desenvolvimento, usada pelo dono do projeto desde 20/10/2026: **uma sessão orquestradora** que conversa com você e coordena, e **uma sessão filha por tarefa**, cada uma no seu próprio worktree. Funciona melhor no app do Claude Code (Code tab do Claude Desktop), que abre sessões filhas e mostra a árvore na barra lateral. Em outro agente (Codex, Cursor, Claude Code no terminal) dá para imitar: uma conversa fixa para orquestrar e uma conversa nova por issue.

## Resumo

| Sessão | O que faz | O que NÃO faz |
|---|---|---|
| **Orquestradora** (uma só) | recebe seus pedidos; cria a issue; abre a sessão filha com um brief; repassa os merges às filhas; arquiva as sessões terminadas; mantém o HANDOFF e as regras do projeto | não escreve código de tarefa; não revisa nem mescla PR; não faz pergunta de decisão sobre o assunto de uma filha |
| **Revisoras** (fixas, opcional) | revisam e mesclam os PRs, divididas pelo autor do PR (ex.: uma para os PRs do dono e de docs/CI, outra por colaborador); avisam a orquestradora a cada merge | não escrevem código de tarefa; um PR nunca é mesclado por duas |
| **Filha por issue** | lê a issue, trabalha num worktree próprio, roda os gates, tira os prints, abre o PR com `Closes #n` e pergunta a você as decisões da tarefa | não mescla; não muda configuração do repositório; não mexe no worktree de outra sessão |
| **Filha fixa** (opcional) | um papel contínuo, por exemplo o bot do Telegram que responde dúvidas e anuncia os merges | não faz trabalho de código; repassa ao orquestrador o que for decisão ou tarefa |

## Por que vale a pena

- **Economia de tokens.** Cada sessão carrega só o contexto da própria tarefa: a filha lê a issue, os arquivos que vai mexer e o `CLAUDE.md`, e não a conversa inteira do dia. A orquestradora não guarda diffs, logs de teste nem prints, só o resumo que cada filha devolve. Sem isso, uma conversa única cresce até ser compactada (resumida) várias vezes, e a cada compactação o agente relê e perde detalhe.
- **Modelo certo para cada tarefa.** Levantamento, leitura e pesquisa podem rodar num modelo mais barato; o mais forte fica para o que exige raciocínio. Numa conversa única, tudo roda no modelo mais caro.
- **Trabalho em paralelo.** Três issues independentes andam ao mesmo tempo em três sessões; você continua falando com a orquestradora enquanto elas trabalham.
- **Nada se mistura.** Cada filha tem o seu worktree (pasta `../warlock-<nome>`, ao lado do repositório) e a sua branch, então uma tarefa não sobrescreve a outra e o checkout principal fica limpo.
- **Decisão com contexto.** A pergunta sobre o anel de alcance é feita na sessão do anel, que tem os prints e os números na mão. A orquestradora só aponta onde há decisão esperando você.
- **Revisão independente.** Quem revisa e mescla (uma revisora) não é quem escreveu o código (a filha) nem quem coordena (a orquestradora), como numa equipe.
- **Retomar sem perder o fio.** O estado fica no HANDOFF e nas issues; uma orquestradora nova lê o HANDOFF e continua de onde a outra parou.
- **Histórico visível.** Cada tarefa vira issue → PR com `Closes #n` → cartão no [quadro geral](https://github.com/users/fernandorff/projects/3) e no quadro do tema (Balanceamento, Jogabilidade, Interface, Bugfix ou Documentação e fluxos), e a barra lateral mostra as sessões filhas embaixo da orquestradora.

## Passo a passo

1. **Abra a orquestradora** na pasta do projeto e dê a ela o contexto fixo: o `CLAUDE.md`, o `CONTRIBUTING.md` e um arquivo de HANDOFF (estado atual, pendências, links). Peça que ela atualize o HANDOFF ao fechar cada bloco.
2. **Faça os pedidos só para a orquestradora.** Ela decide: coisa rápida (doc, ajuste de uma linha, revisão de PR) faz ali mesmo; tarefa de código vira **issue + sessão filha**.
3. **Issue antes de codar** (prova de conceito não tem issue: testa, mostra e só vira issue se o Fernando decidir que vale). Mudança grande segue [Mudança grande: decidir antes de fazer](../CONTRIBUTING.md#mudança-grande-decidir-antes-de-fazer).
4. **Brief da filha** (a orquestradora escreve): link da issue; arquivos e área; o worktree e a branch (`git worktree add -b feat/<assunto> ../warlock-<nome> origin/master`); os gates; os prints esperados (PC); "PR para o master com `Closes #n`, sem mesclar"; e o contexto que ela precisa saber (decisões, regras). Título no formato `🧙🧩 Warlock #<n> · <assunto>`.
5. **A filha trabalha e pergunta.** Dúvida de produto vai para você em múltipla escolha, dentro da filha.
6. **Teste aprovado por você.** Antes do merge, a filha deixa o servidor local em dia com o `master`, abre a aba no seu navegador já no ponto do teste (`?aba=<nome do teste>&ir=<lugar>`), lista no chat o que testar e o que esperar, e põe notas na tela (só em `localhost`) apontando o que mudou; as notas são um passo manual da sessão, feito para o teste e fora do PR. Você aprova em múltipla escolha; sem aprovação, nada é mesclado. PR só de docs/CI e PR de colaborador não passam por esse passo.
7. **PR aberto ganha o próprio link** (`https://pr-<n>-warlock.fernandorffdev.com`, no comentário fixo do PR); para jogar com o grupo antes de pronto, a filha abre o PR em rascunho. Fechar o PR apaga o ambiente.
8. **PR aprovado → a revisora revisa e mescla** (squash no master); a pipeline Produção publica o jogo no ar. A issue fecha sozinha pelo `Closes #n`.
9. **Feche o ciclo.** A orquestradora confere o deploy, anota no HANDOFF e libera o worktree (move para a pasta de lixo; nunca apaga direto).

## Regras que evitam problema

- **Um dono por recurso.** Worktree, branch, porta do `wrangler dev` e aba aberta pertencem a quem os abriu. Antes de usar porta ou serviço, confira se outra sessão já usa (porta, PID, linha de comando). Cada filha usa a sua porta (8811, 8812, 8815…).
- **Mensagem entre sessões só para evento:** PR pronto, decisão tomada, pedido de recurso. Nada de "já terminou?".
- **Segurança não se repassa.** Se uma sessão foi barrada numa ação, outra não faz por ela; a ação volta para você decidir.
- **Branch local em dia com o `master`.** A cada merge no `master`, a orquestradora avisa as filhas com branch ativa; cada uma faz `git fetch` + `git merge origin/master` (sem rebase nem force num PR já aberto; conflito em 2 commits, o mecânico e o manual), roda os gates e reinicia o servidor local. A filha também faz isso antes de cada bloco de trabalho. Assim o PR não acumula conflito e a aba de teste mostra o jogo atual.
- **Navegador do app sem som.** Ao abrir o jogo no painel de navegador, deixe o som mudo e feche a aba no fim (já aconteceu de duas abas esquecidas tocarem a música).
- **Aba de teste diz qual é o teste.** Toda aba aberta para o Fernando testar mostra no título o que está em teste: em localhost é automático (`🧪 <branch> · Warlock Wars`); para dar outro nome, abra com `?aba=<nome>` na URL. O nome da aba é o mesmo da sessão: `?aba=` recebe o mesmo número e o mesmo assunto do título da sessão (ex.: sessão `warlock-140-ir` → `?aba=140-ir`).
- **Aba de teste já no ponto do teste.** Em localhost, `?ir=<lugar>` leva direto ao que vai ser testado (issue #140): abas do menu inicial (`play`, `library`, `char`, `shop`, `profile`, `settings`), `config:<seção>` (ex.: `config:video`), `sandbox`, `partida` (contra 1 bot, já lutando) , `partida:loja` (loja da rodada 1, com 120 s) e `partida:ascensao` (Ascensão contra 3 bots, na carta inicial). Sala e seção juntas, com vírgula, para as Configurações de dentro da partida: `sandbox,config:som`. A lista fica no comentário de `src/client/main.ts`; no ar o parâmetro não faz nada. Ex.: `http://localhost:8839/?aba=loja-nova&ir=partida:loja`.
- **Aba de teste sem música.** Em localhost a música começa desligada para quem nunca mexeu no volume (issue #158): várias abas abertas tocavam juntas. Teste de som abre com `?musica=1` (ex.: `http://localhost:8852/?aba=158-som&ir=partida&musica=1`). Volume mexido numa aba fica guardado para a porta inteira e vale nas outras abas dela, com ou sem `?musica=1`.
- **Aba velha pede para ser fechada.** Em localhost, abrir uma aba nova na mesma porta troca o título das anteriores para `❌ FECHAR · <título>`, e o servidor local fora do ar por 3 s troca para `❌ FECHAR · servidor desligado` (volta sozinho quando o servidor religa). Abas com `?as=` não são marcadas como velhas.
- **Uma frente por sessão.** 1 sessão = 1 issue = 1 branch = 1 servidor local. Sessão que pegou uma segunda frente passa essa frente para uma sessão nova (com um arquivo de handoff), para você não se perder entre abas e sessões.
- **Issue marcada ao começar.** Ao pegar uma issue que já existe, a sessão se atribui (`gh issue edit N --add-assignee <você>`), comenta "Em andamento" e põe o cartão em "Fazendo" nos quadros. Antes, confere se um colaborador já se atribuiu; se sim, não duplica.
- **Navegador só para testes.** As abas de teste abrem num navegador separado (um perfil próprio, com porta de depuração local em `127.0.0.1`), que a sessão consegue listar e fechar sozinha; o seu navegador do dia a dia fica intocado. Aba de servidor desligado é fechada a cada merge.
- **PR que não muda o comportamento do jogo** (refatoração, limpeza, docs, CI) não abre aba de teste nem espera aprovação: basta CI verde, a revisão de excesso de código (`/ponytail-review`) e prints iguais.
- **Sessão se arquiva sozinha.** Mandou o PR para revisão ou terminou a frente: derruba o próprio servidor, fecha as próprias abas e se arquiva. Se o PR precisar de ajuste, a revisora ou a orquestradora reabre a sessão.
- **Revisora nova todo dia** (se usar revisoras): uma tarefa agendada abre uma revisora de cada papel pela manhã; a nova pede à anterior que atualize o arquivo de estado do papel (um `.md` fora do repositório, na pasta que você escolher; uma linha por PR aberto: o que foi pedido, o que falta, de quem depende) e se arquive. Assim nenhuma sessão fica lotada de contexto.
- **Prints só no PC** por enquanto (decisão de 20/10).
- **Commits em português, sem `Co-Authored-By`**; nada vai para o `master` sem PR.

## Sessões fixas que já usamos

| Sessão | Papel |
|---|---|
| Orquestrador Warlock | pedidos, issues, sessões filhas, repasse dos merges, HANDOFF |
| Revisoras 1, 2 e 3 (trocadas todo dia) | revisão e merge, divididas pelo autor do PR: PRs do dono e de docs/CI; PRs de um colaborador; PRs dos demais colaboradores |
| Bot do Telegram (Gul'dan) | lê o grupo, responde dúvidas com fato conferido, anuncia cada merge no master; decisão de jogo vai para o dono |

## Sem o app do Claude Code

- **Claude Code no terminal ou outro agente:** abra uma janela/conversa fixa como orquestradora e uma nova por issue, colando o brief do passo 4. O "mandar mensagem entre sessões" vira você copiar o resumo da filha para a orquestradora.
- **Subagentes** (dentro de uma só conversa) servem para pesquisa curta; para tarefa que gera PR, prefira sessão própria com worktree.
