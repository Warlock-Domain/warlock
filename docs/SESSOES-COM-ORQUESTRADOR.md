# Sessões com orquestrador: como trabalhar no Warlock com vários agentes

Sugestão de ambiente de desenvolvimento, usada pelo dono do projeto desde 20/10/2026: **uma sessão orquestradora** que conversa com você e coordena, e **uma sessão filha por tarefa**, cada uma no seu próprio worktree. Funciona melhor no app do Claude Code (Code tab do Claude Desktop), que abre sessões filhas e mostra a árvore na barra lateral. Em outro agente (Codex, Cursor, Claude Code no terminal) dá para imitar: uma conversa fixa para orquestrar e uma conversa nova por issue.

## Resumo

| Sessão | O que faz | O que NÃO faz |
|---|---|---|
| **Orquestradora** (uma só) | recebe seus pedidos; cria a issue; abre a sessão filha com um brief; revisa e mescla os PRs; mantém o HANDOFF e as regras do projeto | não escreve código de tarefa; não faz pergunta de decisão sobre o assunto de uma filha |
| **Filha por issue** | lê a issue, trabalha num worktree próprio, roda os gates, tira os prints, abre o PR com `Closes #n` e pergunta a você as decisões da tarefa | não mescla; não muda configuração do repositório; não mexe no worktree de outra sessão |
| **Filha fixa** (opcional) | um papel contínuo, por exemplo o bot do Telegram que responde dúvidas e anuncia os merges | não faz trabalho de código; repassa ao orquestrador o que for decisão ou tarefa |

## Por que vale a pena

- **Economia de tokens.** Cada sessão carrega só o contexto da própria tarefa: a filha lê a issue, os arquivos que vai mexer e o `CLAUDE.md`, e não a conversa inteira do dia. A orquestradora não guarda diffs, logs de teste nem prints, só o resumo que cada filha devolve. Sem isso, uma conversa única cresce até ser compactada (resumida) várias vezes, e a cada compactação o agente relê e perde detalhe.
- **Modelo certo para cada tarefa.** Levantamento, leitura e pesquisa podem rodar num modelo mais barato; o mais forte fica para o que exige raciocínio. Numa conversa única, tudo roda no modelo mais caro.
- **Trabalho em paralelo.** Três issues independentes andam ao mesmo tempo em três sessões; você continua falando com a orquestradora enquanto elas trabalham.
- **Nada se mistura.** Cada filha tem o seu worktree (pasta `../warlock-<nome>`, ao lado do repositório) e a sua branch, então uma tarefa não sobrescreve a outra e o checkout principal fica limpo.
- **Decisão com contexto.** A pergunta sobre o anel de alcance é feita na sessão do anel, que tem os prints e os números na mão. A orquestradora só aponta onde há decisão esperando você.
- **Revisão independente.** Quem revisa e mescla (a orquestradora) não é quem escreveu o código (a filha), como numa equipe.
- **Retomar sem perder o fio.** O estado fica no HANDOFF e nas issues; uma orquestradora nova lê o HANDOFF e continua de onde a outra parou.
- **Histórico visível.** Cada tarefa vira issue → PR com `Closes #n` → cartão no [quadro geral](https://github.com/users/fernandorff/projects/3) e no quadro do tema (Balanceamento, Jogabilidade, Interface, Bugfix ou Documentação e fluxos), e a barra lateral mostra as sessões filhas embaixo da orquestradora.

## Passo a passo

1. **Abra a orquestradora** na pasta do projeto e dê a ela o contexto fixo: o `CLAUDE.md`, o `CONTRIBUTING.md` e um arquivo de HANDOFF (estado atual, pendências, links). Peça que ela atualize o HANDOFF ao fechar cada bloco.
2. **Faça os pedidos só para a orquestradora.** Ela decide: coisa rápida (doc, ajuste de uma linha, revisão de PR) faz ali mesmo; tarefa de código vira **issue + sessão filha**.
3. **Issue antes de codar.** Mudança grande segue [Mudança grande: decidir antes de fazer](../CONTRIBUTING.md#mudança-grande-decidir-antes-de-fazer).
4. **Brief da filha** (a orquestradora escreve): link da issue; arquivos e área; o worktree e a branch (`git worktree add -b feat/<assunto> ../warlock-<nome> origin/master`); os gates; os prints esperados (PC); "PR para o master com `Closes #n`, sem mesclar"; e o contexto que ela precisa saber (decisões, regras). Título no formato `🧙🧩 Warlock #<n> · <assunto>`.
5. **A filha trabalha e pergunta.** Dúvida de produto vai para você em múltipla escolha, dentro da filha.
6. **PR aberto → a orquestradora revisa e mescla** (squash no master); a pipeline Produção publica o jogo no ar. A issue fecha sozinha pelo `Closes #n`.
7. **Feche o ciclo.** A orquestradora confere o deploy, anota no HANDOFF e libera o worktree (move para a pasta de lixo; nunca apaga direto).

## Regras que evitam problema

- **Um dono por recurso.** Worktree, branch, porta do `wrangler dev` e aba aberta pertencem a quem os abriu. Antes de usar porta ou serviço, confira se outra sessão já usa (porta, PID, linha de comando). Cada filha usa a sua porta (8811, 8812, 8815…).
- **Mensagem entre sessões só para evento:** PR pronto, decisão tomada, pedido de recurso. Nada de "já terminou?".
- **Segurança não se repassa.** Se uma sessão foi barrada numa ação, outra não faz por ela; a ação volta para você decidir.
- **Navegador do app sem som.** Ao abrir o jogo no painel de navegador, deixe o som mudo e feche a aba no fim (já aconteceu de duas abas esquecidas tocarem a música).
- **Prints só no PC** por enquanto (decisão de 20/10).
- **Commits em português, sem `Co-Authored-By`**; nada vai para o `master` sem PR.

## Sessões fixas que já usamos

| Sessão | Papel |
|---|---|
| Orquestrador Warlock | pedidos, issues, revisão, mescla, HANDOFF |
| Bot do Telegram (Gul'dan) | lê o grupo, responde dúvidas com fato conferido, anuncia cada merge no master; decisão de jogo vai para o dono |

## Sem o app do Claude Code

- **Claude Code no terminal ou outro agente:** abra uma janela/conversa fixa como orquestradora e uma nova por issue, colando o brief do passo 4. O "mandar mensagem entre sessões" vira você copiar o resumo da filha para a orquestradora.
- **Subagentes** (dentro de uma só conversa) servem para pesquisa curta; para tarefa que gera PR, prefira sessão própria com worktree.
