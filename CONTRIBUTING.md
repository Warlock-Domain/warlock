# Como contribuir

Bem-vindo! Este guia diz como uma mudança sai da sua máquina e chega ao jogo. As regras de código, os comandos e o método de balanceamento estão em [CLAUDE.md](CLAUDE.md) (vale para gente e para agentes de IA).

## Fluxo

1. **Combine antes** o que vai fazer: abra uma issue pelos modelos **Bug** ou **Ideia** (ou comente numa existente). Evita duas pessoas no mesmo trabalho. Issues com a etiqueta `bom primeiro PR` são boas para começar.
2. **Crie uma branch a partir do `master` atualizado**, uma por tarefa:
   - `feat/<assunto>` coisa nova (`feat/runa-de-gelo`)
   - `fix/<assunto>` conserto (`fix/loja-trava-no-celular`)
   - `balance/<assunto>` números de magia, item ou bot
   - `style/<assunto>` visual e interface
   - `docs/<assunto>`, `refactor/<assunto>`
   Quem não tem acesso de escrita faz um fork e trabalha na branch do fork.
3. **Commits pequenos, em português**, começando pelo tipo: `feat: …`, `fix: …`, `balance: …`, `style: …`, `refactor: …`, `docs: …`. A mensagem diz o que mudou para o jogador e, em balanceamento, os números medidos.
4. **Antes de abrir o PR**, rode os gates (os dois `tsc`, `vitest run`, `vite build`) e jogue no navegador. Mantenha a branch em dia com o `master` (`git pull --rebase origin master` ou merge).
5. **Abra o pull request para o `master`** preenchendo o modelo (Por quê, O que muda, Prints antes e depois se mudou algo na tela, Como testei, Balanceamento) e com `Fecha #n` para ligar a issue. **Título no formato do commit** (`feat: …`, `fix: …`): uma checagem do GitHub barra título fora do padrão. O GitHub Actions roda as mesmas checagens dos gates; o PR só entra com tudo verde.
6. **Revisão:** pelo menos uma aprovação do dono do projeto. Responda os comentários com commits novos na mesma branch (sem reescrever o histórico depois que a revisão começou).
7. **Merge:** *squash and merge*, com o título do PR no formato de commit (`feat: …`). A branch é apagada depois.
8. **Publicação no site** é feita pelo dono do projeto (conta Cloudflare), depois do merge.

## Etiquetas

`bug`, `ideia`, `balanceamento`, `visual`, `bom primeiro PR`, `precisa de decisão` (espera o dono do projeto decidir).

## Regras que valem para todo PR

- Um PR, um assunto. Mudança grande vira vários PRs.
- Texto novo que o jogador vê sai em português e inglês.
- Mudança de balanceamento só com medição do simulador no PR (rodadas por dificuldade, antes → depois).
- Nada de segredo no repositório (chaves, tokens, senhas). O repositório é público.
- Asset novo só com licença livre e crédito em `public/CREDITS.txt`.

## Master protegido

Desde 19/10 o `master` é protegido: só entra por pull request com o CI verde e uma aprovação, sem force push. O dono do projeto pode mesclar os próprios PRs passando por cima da aprovação (administrador).
