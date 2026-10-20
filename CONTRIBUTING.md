# Como contribuir

Bem-vindo! Este guia diz como uma mudança sai da sua máquina e chega ao jogo. As regras de código, os comandos e o método de balanceamento estão em [CLAUDE.md](CLAUDE.md) (vale para gente e para agentes de IA).

Vai trabalhar com agentes de IA? Veja a sugestão de ambiente em [Sessões com orquestrador](docs/SESSOES-COM-ORQUESTRADOR.md): uma sessão que coordena e uma por tarefa, com economia de tokens e trabalho em paralelo.

## Fluxo

1. **Combine antes** o que vai fazer: abra uma issue pelos modelos **Bug** ou **Ideia** (ou comente numa existente). Mudança grande só começa depois de decidida (veja [Mudança grande: decidir antes de fazer](#mudança-grande-decidir-antes-de-fazer)). Evita duas pessoas no mesmo trabalho. Issues com a etiqueta `bom primeiro PR` são boas para começar.
2. **Crie uma branch a partir do `master` atualizado**, uma por tarefa:
   - `feat/<assunto>` coisa nova (`feat/runa-de-gelo`)
   - `fix/<assunto>` conserto (`fix/loja-trava-no-celular`)
   - `balance/<assunto>` números de magia, item ou bot
   - `style/<assunto>` visual e interface
   - `docs/<assunto>`, `refactor/<assunto>`
   Colaborador trabalha em branch deste repositório. Fork só para quem não é colaborador: nele o CI espera aprovação manual, a revisão automática não roda e o ambiente dev não publica.
3. **Commits pequenos, em português**, começando pelo tipo: `feat: …`, `fix: …`, `balance: …`, `style: …`, `refactor: …`, `docs: …`. A mensagem diz o que mudou para o jogador e, em balanceamento, os números medidos.
4. **Antes de abrir o PR**, rode os gates (os dois `tsc`, `vitest run`, `vite build`) e jogue no navegador. Para testar com outras pessoas, publique no seu ambiente dev (veja [Ambiente de cada dev](#ambiente-de-cada-dev)). Mantenha a branch em dia com o `master` (`git pull --rebase origin master` ou merge).
5. **Abra o pull request para o `master`** preenchendo o modelo (Por quê, O que muda, Prints antes e depois se mudou algo na tela, Como testei, Balanceamento) e com `Closes #n` para ligar a issue. **Título no formato do commit** (`feat: …`, `fix: …`): uma checagem do GitHub barra título fora do padrão. O GitHub Actions roda as mesmas checagens dos gates; o PR só entra com tudo verde.
6. **Revisão:** o Claude comenta sozinho em todo PR (veredito, checagens, pontos); comente `@claude` para pedir ajuda. O agente do dono pode ajustar e mesclar o PR. Responda os comentários com commits novos na mesma branch (sem reescrever o histórico depois que a revisão começou).
7. **Merge:** *squash and merge* no `master`; o título do PR vira o commit. A branch é apagada depois.
8. **Publicação é automática:** o merge no `master` publica o jogo no ar pela pipeline Produção (decisão de 20/10: sem dev geral, PR direto para o `master`).

## Mudança grande: decidir antes de fazer

Projeto de grupo: o que muda o jogo para todo mundo é combinado antes de virar código (decisão do Fernando, 20/10).

- **Pequeno vai direto em PR:** correção de bug, alinhamento de interface, texto, ajuste visual pontual. Na dúvida se é pequeno, pergunte no grupo.
- **Grande passa por decisão:** mudar como o jogo se joga (magia, item, regra, modo, controle), mexer em número de balanceamento, tirar algo que existe, ou trabalho de mais de um dia.
- **Como decidir:**
  1. Abra a issue pelo modelo **Ideia**: ela já nasce com a etiqueta `precisa de decisão`. Avise no grupo do Telegram com o link; a conversa fica na issue, para não se perder.
  2. Cerca de 2 dias de discussão na issue. Depois o Fernando dá a palavra final, ouvindo o que foi dito.
  3. A decisão fica escrita na issue (o que foi decidido e por quê), a etiqueta sai e a linha entra na tabela de decisões do [CLAUDE.md](CLAUDE.md). Coisa grande ganha um desenho em `docs/` (como o Ascensão e a Campanha).
  4. Só então alguém pega para fazer, e o PR cita a issue (`Closes #n`).
- **PR grande sem decisão** recebe `precisa de decisão` e espera, sem mesclar, até a issue ser decidida.

## Ambiente de cada dev

Cada colaborador tem um jogo só seu na internet, para testar a tarefa com outras pessoas antes do PR. Ele usa Worker e salas próprios: nada do que acontece ali chega ao jogo no ar.

| Quem | GitHub | Branch | Link |
|---|---|---|---|
| Leonard | lboesmans | `lboesmans-dev` | https://lboesmans-dev-warlock.fernandorffdev.com |
| Sky | breakie33 | `breakie33-dev` | https://breakie33-dev-warlock.fernandorffdev.com |
| Lucas | lucascvalle | `lucascvalle-dev` | https://lucascvalle-dev-warlock.fernandorffdev.com |
| Arthur | arthurbaquit | `arthurbaquit-dev` | https://arthurbaquit-dev-warlock.fernandorffdev.com |
| Fernando | fernandorff | `fernandorff-dev` | https://fernandorff-dev-warlock.fernandorffdev.com |

**Como subir:** todo push na branch `<seu usuário do GitHub>-dev` (em minúsculas) publica sozinho no seu link. A branch é sua: pode substituir à vontade.

```bash
# o estado da sua branch de tarefa vai para o seu ambiente
git push --force origin HEAD:<seu-usuario>-dev

# ou: juntar o jogo no ar no seu ambiente, sem perder o que já está lá
git checkout <seu-usuario>-dev && git pull && git merge origin/master && git push
```

- **Acompanhar:** aba [Actions](https://github.com/fernandorff/warlock/actions), pipeline **Ambiente dev**. Ela faz o build, publica, espera o link responder e roda o teste rápido (uma sala de verdade). Leva menos de 1 minuto.
- **Se der errado:** build quebrado não publica nada e o site anterior continua. Teste rápido vermelho quer dizer que a versão nova já está no ar com problema: veja o log.
- **Colaborador novo:** o primeiro push na `<usuário>-dev` cria o ambiente sozinho. Use o seu usuário do GitHub em minúsculas: a pipeline só aceita letras minúsculas e números antes do `-dev`. Avise o dono para entrar na tabela acima.
- **Não abra PR a partir da `-dev`.** O PR sai da branch da tarefa (`feat/…`, `fix/…`) para o `master`.

## Pipelines

Tabela completa no [CLAUDE.md](CLAUDE.md#pipelines): CI, título do PR, revisão do Claude, `@claude` e ambiente dev. Logs em https://github.com/fernandorff/warlock/actions.

## Issues

Toda issue sai de um dos dois modelos (a issue em branco está desligada): https://github.com/fernandorff/warlock/issues/new/choose

| Modelo | Quando | O que pede |
|---|---|---|
| **Bug** | algo no jogo não funciona como deveria | o que aconteceu (e o que esperava), como repetir passo a passo, onde (navegador e aparelho), prints ou vídeo |
| **Ideia** | magia, item, modo, interface ou balanceamento novo | o que, por quê, como imagina (números, desenho, referência), se quer fazer o PR. Já nasce com `precisa de decisão` |

- **Título:** uma frase que diga o problema ou a ideia, sem prefixo (`Loja trava ao vender no celular`, `Runa de gelo que deixa lento`). O prefixo `tipo:` é do PR, não da issue.
- **Um assunto por issue.** Duas coisas viram duas issues.
- **Antes de começar a fazer, atribua-se** na issue (Assignees, ou comente "vou fazer") e só pegue issue sem dono. Assim duas pessoas não fazem o mesmo trabalho. Desistiu? Tire o seu nome.
- Ideia só é pega depois de decidida (a etiqueta `precisa de decisão` saiu).
- O PR que resolve a issue leva `Closes #n` na descrição: ao mesclar, a issue fecha sozinha. Tem de ser em inglês (`Closes`, `Fixes` ou `Resolves`); "Fecha #n" o GitHub não entende.
- **Quadros (kanban):** um geral com tudo e um por tema. A issue entra no quadro do tema pela etiqueta:

  | Quadro | Etiqueta | O que entra |
  |---|---|---|
  | [Warlock (geral)](https://github.com/users/fernandorff/projects/3) | todas | todas as issues |
  | [Balanceamento](https://github.com/users/fernandorff/projects/4) | `balanceamento` | números de magia, item, bot, ouro e opções da sala |
  | [Jogabilidade](https://github.com/users/fernandorff/projects/5) | `jogabilidade` | modos, classes, mecânicas e magias novas |
  | [Interface](https://github.com/users/fernandorff/projects/6) | `visual` | telas, menus, HUD, teclas e efeitos visuais |
  | [Bugfix](https://github.com/users/fernandorff/projects/7) | `bug` | o que não funciona como deveria |

  Colunas iguais em todos: **Precisa de decisão** → **A fazer** → **Fazendo** → **Em revisão** → **Feito**. Ao se atribuir, mova o cartão para Fazendo; com o PR aberto, para Em revisão. Issue fechada ou PR mesclado vai para Feito sozinho. Issue nova: ponha a etiqueta do tema e adicione ao quadro do tema (campo Projects da issue).

## Etiquetas

`bug`, `ideia`, `balanceamento`, `jogabilidade`, `visual`, `bom primeiro PR`, `precisa de decisão` (espera o dono do projeto decidir). `bug`, `balanceamento`, `jogabilidade` e `visual` também dizem em qual quadro a issue entra.

## Regras que valem para todo PR

- Um PR, um assunto. Mudança grande vira vários PRs.
- Texto novo que o jogador vê sai em português e inglês.
- Mudança de balanceamento só com medição do simulador no PR (rodadas por dificuldade, antes → depois).
- Nada de segredo no repositório (chaves, tokens, senhas). O repositório é público.
- Asset novo só com licença livre e crédito em `public/CREDITS.txt`.

## Master protegido

Desde 19/10 o `master` é protegido: só entra por pull request com o CI verde, sem force push. A branch `dev` (antigo dev geral) está parada desde 20/10 e não recebe PR. O dono do projeto pode mesclar os próprios PRs passando por cima da aprovação (administrador).
