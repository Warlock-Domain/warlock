# Modelos KayKit (todos os packs grátis)

Todos os packs grátis do KayKit, de Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)): os 10 do [GitHub KayKit-Game-Assets](https://github.com/KayKit-Game-Assets) e a versão grátis (FREE) dos que só existem no [itch.io](https://kaylousberg.itch.io). Todos **CC0** (domínio público: pode usar, mudar e redistribuir sem pedir; o crédito é por cortesia). Ficam aqui para quem contribui achar um modelo sem baixar nada.

- **Lista de cada modelo, pack por pack:** [INDICE.md](INDICE.md) (gerado por `node scripts/assets/kaykit-index.mjs`).
- **Visão geral de todos os assets do jogo e da identidade visual:** [docs/ASSETS.md](../../docs/ASSETS.md).

**Esta pasta não vai para o jogo no ar:** só o que está em `public/` é publicado a cada deploy. Para usar um modelo:

1. Copie o arquivo para `public/models/...` (no `.gltf`, junto o `.bin` e a textura `.png` que ele cita no campo `uri`; o `.glb` já vem com tudo dentro).
2. Ponha o crédito em `public/CREDITS.txt`, no estilo das entradas KayKit que já estão lá (arquivo, pack, autor, link, licença), e registre o arquivo em [docs/ASSETS.md](../../docs/ASSETS.md).
3. Prefira cortar o que não usa (animações, malhas) antes de publicar: cada MB a mais é download para o jogador.

Copiado de cada pack só o glTF (as pastas `gltf`, sem alteração), as texturas e o arquivo de licença. Em `aventureiros` e `esqueletos` as texturas dos bonecos ficam ao lado do `.glb` mesmo já indo dentro dele: servem para repintar. Ficaram de fora `.fbx`, `.obj`, `.dae`, projetos Godot/Unity e exemplos. Licenças lidas em 21/10/2026: todos os `LICENSE.txt` dizem "Creative Commons Zero, CC0"; o zip do Holiday Bits não traz licença, e o `LICENSE.txt` de `feriados` registra a da página ("Creative Commons Zero v1.0 Universal").

| Pasta | Pack | Origem | Licença |
|---|---|---|---|
| `aventureiros` | Character Pack: Adventurers 1.0 | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | CC0 |
| `esqueletos` | Character Pack: Skeletons 1.0 | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) | CC0 |
| `hexagonos-medievais` | Medieval Hexagon Pack 1.0 | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | CC0 |
| `halloween` | Halloween Bits 1.0 | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0) | CC0 |
| `cidade` | City Builder Bits 1.0 | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0) | CC0 |
| `moveis` | Furniture Bits 1.0 | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0) | CC0 |
| `prototipo` | Prototype Bits 1.0 | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0) | CC0 |
| `restaurante` | Restaurant Bits 1.0 | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0) | CC0 |
| `base-espacial` | Space Base Bits 1.0 | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits-1.0) | CC0 |
| `masmorra` | Dungeon Pack 1.1 FREE (contém os 203 modelos do Dungeon Remastered 1.0 do [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0) e mais 8) | [itch.io](https://kaylousberg.itch.io/kaykit-dungeon-pack) | CC0 |
| `animacoes` | Character Animations 1.1 (clips `Rig_Medium`/`Rig_Large` e os 2 manequins) | [itch.io](https://kaylousberg.itch.io/kaykit-character-animations) | CC0 |
| `floresta` | Forest Nature Pack 1.0 FREE | [itch.io](https://kaylousberg.itch.io/kaykit-forest) | CC0 |
| `plataforma` | Platformer Pack 1.0 FREE | [itch.io](https://kaylousberg.itch.io/kaykit-platformer) | CC0 |
| `jogo-de-tabuleiro` | Board Game Bits 1.0 FREE | [itch.io](https://kaylousberg.itch.io/board-game-bits) | CC0 |
| `armas-de-fantasia` | Fantasy Weapons Bits 1.0 FREE | [itch.io](https://kaylousberg.itch.io/fantasy-weapons-bits) | CC0 |
| `ferramentas-rpg` | RPG Tools Bits 1.0 FREE | [itch.io](https://kaylousberg.itch.io/rpg-tools-bits) | CC0 |
| `feriados` | Holiday Bits 1.0 FREE (Natal e inverno) | [itch.io](https://kaylousberg.itch.io/holiday-bits) | CC0 (lida na página) |
| `recursos` | Resource Bits 1.0 FREE | [itch.io](https://kaylousberg.itch.io/resource-bits) | CC0 |
| `blocos` | Block Bits 1.0 FREE | [itch.io](https://kaylousberg.itch.io/block-bits) | CC0 |
| `sortido` | Mixed Bag 1 FREE | [itch.io](https://kaylousberg.itch.io/mixed-bag-1) | CC0 |
| `legado-construtor-medieval` | (Legacy) Medieval Builder Pack 1.0 | [itch.io](https://kaylousberg.itch.io/kaykit-medieval-builder-pack) | CC0 |
| `legado-minigames` | (Legacy) Mini-Game Variety Pack 1.2 | [itch.io](https://kaylousberg.itch.io/kay-kit-mini-game-variety-pack) | CC0 |
| `legado-spooktober` | (Legacy) Spooktober Seasonal Pack 1.1 | [itch.io](https://kaylousberg.itch.io/kaykit-spooktober) | CC0 |

Nº de modelos, arquivos e tamanho de cada pasta: tabela no começo do [INDICE.md](INDICE.md).

**Ficaram de fora:**
- os pacotes pagos (Mystery Monthly Series, Bits Bundle, The Complete KayKit) e a parte "Extra"/"Source" paga dos packs;
- as versões do itch.io dos packs que já estão aqui pelo GitHub, por serem os mesmos modelos;
- os Legacy que têm versão nova aqui: (Legacy) Dungeon Pack, (Legacy) Character Pack: Skeletons e (Legacy) Character Animations.

Os packs "legado" têm um visual mais antigo do KayKit: confira se combinam com o resto antes de usar.
