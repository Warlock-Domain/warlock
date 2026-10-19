# Como contribuir

Bem-vindo! Este guia diz como uma mudança sai da sua máquina e chega ao jogo. As regras de código, os comandos e o método de balanceamento estão em [CLAUDE.md](CLAUDE.md) (vale para gente e para agentes de IA).

## Fluxo

1. **Combine antes** o que vai fazer: abra uma issue (ou comente numa existente) dizendo a ideia. Evita duas pessoas no mesmo trabalho.
2. **Crie uma branch a partir do `master` atualizado**, uma por tarefa:
   - `feat/<assunto>` coisa nova (`feat/runa-de-gelo`)
   - `fix/<assunto>` conserto (`fix/loja-trava-no-celular`)
   - `balance/<assunto>` números de magia, item ou bot
   - `style/<assunto>` visual e interface
   - `docs/<assunto>`, `refactor/<assunto>`
   Quem não tem acesso de escrita faz um fork e trabalha na branch do fork.
3. **Commits pequenos, em português**, começando pelo tipo: `feat: …`, `fix: …`, `balance: …`, `style: …`, `refactor: …`, `docs: …`. A mensagem diz o que mudou para o jogador e, em balanceamento, os números medidos.
4. **Antes de abrir o PR**, rode os gates (os dois `tsc`, `vitest run`, `vite build`) e jogue no navegador. Mantenha a branch em dia com o `master` (`git pull --rebase origin master` ou merge).
5. **Abra o pull request para o `master`** preenchendo o modelo. O GitHub Actions roda as mesmas checagens; o PR só entra com tudo verde.
6. **Revisão:** pelo menos uma aprovação do dono do projeto. Responda os comentários com commits novos na mesma branch (sem reescrever o histórico depois que a revisão começou).
7. **Merge:** *squash and merge*, com o título do PR no formato de commit (`feat: …`). A branch é apagada depois.
8. **Publicação no site** é feita pelo dono do projeto (conta Cloudflare), depois do merge.

## Regras que valem para todo PR

- Um PR, um assunto. Mudança grande vira vários PRs.
- Texto novo que o jogador vê sai em português e inglês.
- Mudança de balanceamento só com medição do simulador no PR (rodadas por dificuldade, antes → depois).
- Nada de segredo no repositório (chaves, tokens, senhas). O repositório é público.
- Asset novo só com licença livre e crédito em `public/CREDITS.txt`.

## Enquanto o time é pequeno

O dono do projeto ainda envia direto para o `master`. Quando houver mais colaboradores, o `master` passa a ser protegido (só entra por PR aprovado e com o CI verde).
