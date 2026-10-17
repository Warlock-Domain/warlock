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
export const KB_PER_DMG = 10 * UNIT * 10; // empurrão (m/s) por ponto de dano: 10 unidades/s por dano do original
export const STUN_SPEED = 1.5; // deslizando mais rápido que isso, o mago não anda
export const KNOCK_HP_SCALE = 1; // empurrão × (1 + KNOCK_HP_SCALE·danoRecebido/HP_MAX); a lava conta pela metade
export const LAVA_KB_FACTOR = 0.5;
export const CREDIT_WINDOW = 5; // o abate vai para quem acertou nos últimos 5 s
export const PROJ_R = 0.2;

// pilares do original (mode.lua e obstacles.lua): 2 a 8 por rodada, sorteados até 1000 unidades do centro,
// 400 de vida (40 aqui); ao quebrar explodem em 300 unidades com 5 a 10 de dano (0,5 a 1 aqui)
export const PILLAR = { r: 0.5, hp: 40, spread: 1000 * UNIT, blastR: 300 * UNIT, blastDmg: 1, min: 2, max: 8 };

export const MAX_PLAYERS = 8;
export const WINS_TO_WIN = 5; // original: 1 ponto por rodada vencida (lá o padrão é 11; aqui 5, decisão do Fernando)
export const START_GOLD = 30;
export const ROUND_GOLD = 10;
export const KILL_GOLD = 0;
export const WIN_GOLD = 0;
export const SHOP_MS = 30_000; // Mode.SHOP_TIME do original
export const INVULN_TIME = 2; // invulnerável nos 2 primeiros segundos da rodada (mode.lua)
export const COUNTDOWN_MS = 3_000;
export const ROUND_END_MS = 2_500;
