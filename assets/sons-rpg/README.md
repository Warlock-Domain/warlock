# Sons de RPG (biblioteca)

532 efeitos sonoros curtos em `.wav` (30,6 MB): magias, projéteis de armas e golpes de combate. Ficam aqui para quem trabalha nos efeitos sonoros (issues #202, #203 e #205) ouvir e escolher sem baixar nada.

- **Lista de cada arquivo, por categoria:** [INDICE.md](INDICE.md).
- **Visão geral de todos os assets do jogo:** [docs/ASSETS.md](../../docs/ASSETS.md).

## Origem e licença: não informadas

- **Origem:** o pacote chegou como `freeware rpg sounds.rar`, sem página de download, sem autor e sem arquivo de licença ou readme. Os `.wav` também não trazem metadado de crédito.
- **Licença:** não informada. "Freeware" no nome do arquivo não é licença e não garante que se possa redistribuir.
- **Entrou por decisão do Fernando em 21/10/2026**, mesmo sem origem nem licença.
- **Atenção:** os nomes e as pastas (`Abilities/Spells/...`, `Sound/Units/Combat`) seguem o mesmo padrão dos sons do Warcraft III, e um dos arquivos (`FlameStrikeTargetWaveNonLoop1.wav`) aparece com esse caminho em [scripts de mapa do Warcraft III](https://www.hiveworkshop.com/threads/sounds-not-playing-the-first-time.299270/). O Fernando disse que o pacote não é do Warcraft III. A dúvida fica registrada aqui para quem for usar.

## Como usar

**Esta pasta não vai para o jogo no ar:** só o que está em `public/` é publicado a cada deploy.

- Antes de levar um som daqui para `public/sfx/`, descubra a origem e a licença dele. O jogo no ar só usa som com licença livre e crédito em `public/CREDITS.txt` (regra do [docs/ASSETS.md](../../docs/ASSETS.md)).
- Os arquivos estão como vieram no pacote, com as mesmas pastas e sem conversão. O jogo usa MP3 mono: converta só o que for para `public/`.
