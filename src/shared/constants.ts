// Números do jogo, em metros e segundos, convertidos do Warlock Brawl para Dota 2 (github.com/warlockbrawl/warlock,
// scripts/vscripts/base/config.lua, arena.lua, pawn.lua e npc_abilities_custom.txt). Escala: a arena com 4 magos
// (1700 unidades de raio no original) vira 11 m, ou seja, 1 unidade = 0,00647 m. Vida 1000 do original = 100 aqui.
export const DT = 1 / 60;
export const SEND_EVERY = 2; // envia o estado a cada 2 passos (30 por segundo)

export const UNIT = 0.00647; // metros por unidade do original
export const ARENA_STEP = 100 * UNIT; // uma camada de ladrilhos
export const arenaRadius = (wizards: number) => (13 + wizards) * ARENA_STEP; // 13 camadas + 1 por mago
export const ARENA_R0 = arenaRadius(4);
// a arena para de encolher aqui (no original o mínimo é 1 camada): nunca some, a rodada só acaba quando sobra 1
export const ARENA_MIN = 2 * ARENA_STEP;
export const SPAWN_INSET = 600 * UNIT;
export const SHRINK_EVERY = 10;
export const SHRINK_WARN = 2;

export const WIZ_R = 0.35; // original 30 unidades (0,19 m); maior aqui porque o modelo 3D é mais largo
export const WIZ_SPEED = 210 * UNIT;
export const HP_MAX = 100;
export const HP_REGEN = 0.5; // 5 por segundo no original
export const LAVA_DPS = 10;
export const FRICTION = -Math.log(0.96) / 0.035; // 0,96 por tique de 0,035 s: a velocidade do empurrão cai e^(-FRICTION·t)
export const KB_SOFT_CAP = 10; // golpe acima disso empurra pela raiz (100 no original, pawn.lua do mod de Dota 2)
export const KB_PER_DMG = 10 * UNIT * 10; // empurrão (m/s) por ponto de dano: 10 unidades/s por dano do original
export const STUN_SPEED = 1.5; // deslizando mais rápido que isso, o mago não anda
export const KNOCK_HP_SCALE = 1; // empurrão × (1 + KNOCK_HP_SCALE·danoRecebido/HP_MAX); a lava conta pela metade
export const LAVA_KB_FACTOR = 0.5;
export const CREDIT_WINDOW = 5; // o abate vai para quem acertou nos últimos 5 s
export const PROJ_R = 0.2;

// pilares do original (mode.lua e obstacles.lua): 2 a 8 por rodada, sorteados até 1000 unidades do centro,
// 400 de vida (40 aqui); ao quebrar explodem em 300 unidades com 5 a 10 de dano (0,5 a 1 aqui)
export const PILLAR = { r: 0.5, hp: 40, spread: 1000 * UNIT, blastR: 300 * UNIT, blastDmg: 1, min: 2, max: 8 };

// tipos de obstáculo (pedido do Fernando, 17/10: "não só esses pilares"); o pilar segue o original, os outros são meus:
// rocha grande que não quebra, árvore morta frágil e altar de velas que explode em fogo. weight = chance relativa no sorteio
export type ObstacleKind = 'pillar' | 'rock' | 'tree' | 'shrine' | 'chest' | 'rockpillar';
export const OBSTACLE_KINDS: ObstacleKind[] = ['pillar', 'rock', 'tree', 'shrine', 'chest', 'rockpillar'];
export const OBSTACLES: Record<ObstacleKind, { r: number; hp: number; blastR: number; blastDmg: number; weight: number }> = {
  pillar: { r: 0.5, hp: 40, blastR: 300 * UNIT, blastDmg: 1, weight: 4 },
  rock: { r: 0.85, hp: Infinity, blastR: 0, blastDmg: 0, weight: 2 },
  tree: { r: 0.35, hp: 15, blastR: 0, blastDmg: 0, weight: 2 },
  shrine: { r: 0.45, hp: 10, blastR: 1.6, blastDmg: 6, weight: 1 },
  chest: { r: 0.4, hp: 25, blastR: 0, blastDmg: 0, weight: 0 }, // baú de ouro: não sai no sorteio, aparece no meio da rodada
  // Pilar de pedra (magia): obstáculo comum do original (400 de vida, explode igual ao pilar) com raio 90 u, 1,5× o pilar
  // de 60 u; aqui 1,5× o nosso pilar, que já é maior que o original. Some sozinho (Pillar.until)
  rockpillar: { r: 0.75, hp: 40, blastR: 300 * UNIT, blastDmg: 1, weight: 0 },
};

export const MAX_PLAYERS = 8;
export const WINS_TO_WIN = 5; // original: 1 ponto por rodada vencida (lá o padrão é 11; aqui 5, decisão do Fernando)
export const START_GOLD = 30;
export const ROUND_GOLD = 10;
// venda: cada nível volta 100% na loja em que foi comprado e perde 5% por rodada com ele, até 75% (Fernando, 17/10)
export const SELL_DECAY = 0.05;
export const SELL_FLOOR = 0.75;
// baú de ouro no meio da rodada (pedidos do Fernando, 17/10: "incentivar a treta"): aparece a cada 15 s, as magias quebram
// (vida em OBSTACLES.chest) e ele vira um monte de ouro; quem fica em cima ganha 1 a cada 2 s até o monte (10) acabar; sair zera o progresso
// primeiro aos 8 s, depois um a cada 12 s mesmo que o anterior não tenha sido quebrado, até 2 baús de pé (Fernando, 17/10: "não aparece mais baú")
export const CHEST = { first: 8, every: 12, maxUp: 2, pile: 10, goldEvery: 2, reach: 0.75, pileSecs: 45, spread: 0.6 };
// chão depois do choque de projéteis (pedido do Fernando, 17/10): fogo queima, arcano deixa lento, pulso puxa para o centro
export const ZONES = { burn: { dps: 2, secs: 4.5 }, slow: { mult: 0.6, secs: 4.5 }, pull: { speed: 2.2, secs: 3 }, size: 0.75 };
// assistência: quem causou mais dano em quem morreu, sem ser quem matou (anti-roubo de abate do Warlock original, versão 082)
export const ASSIST_GOLD = 2;
export const ASSIST_MIN_DMG = 3;
// recuperação (pedido do Fernando, 17/10: "evitar a galera ficar muito atrás"):
// quem ganhou menos ouro na partida que a média recebe metade da diferença no fim da rodada (até 8);
// abater o líder do placar vale +3 por vitória de vantagem dele sobre a média (até 10); o líder que vence ganha só 5
export const RECOVERY = { share: 0.5, max: 8 };
export const BOUNTY = { perWin: 3, max: 10 };
export const LEADER_WIN_GOLD = 5;
export const KILL_GOLD = 5; // 0 no original; +5 a pedido do Fernando (17/10)
export const WIN_GOLD = 10; // 0 no original; +10 a pedido do Fernando (17/10)
export const TOP_DMG_GOLD = 10; // quem causou mais dano na rodada (empate: todos); pedido do Fernando (17/10)
export const SHOP_MS = 30_000; // Mode.SHOP_TIME do original
export const INVULN_TIME = 2; // invulnerável nos 2 primeiros segundos da rodada (mode.lua)
// Deathmatch (modo do Warlock Brawl original): rodada de 60 s, volta em 10 s, 1 ponto por abate
export const DM_ROUND_MS = 60_000;
export const DM_RESPAWN = 10;
export const DM_KILLS_TO_WIN = 15;
export const DM_SPAWN_GAP = 2; // ao voltar, pelo menos 2 m de inimigos vivos e de pilares
export const COUNTDOWN_MS = 3_000;
export const ROUND_END_MS = 2_500;
export const VOTE_MS = 20_000; // votação na partida (trocar o modo, expulsar alguém) fecha em 20 s; pedido do Fernando (17/10)
