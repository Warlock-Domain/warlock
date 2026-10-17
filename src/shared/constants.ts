// Números do jogo. Metros e segundos. Valores iniciais: ajustar jogando.
export const DT = 1 / 60;
export const SEND_EVERY = 2; // envia o estado a cada 2 passos (30 por segundo)

export const ARENA_R0 = 11;
export const ARENA_STEP = 1.4;
export const SHRINK_EVERY = 15;
export const SHRINK_WARN = 2;

export const WIZ_R = 0.45;
export const WIZ_SPEED = 3.2;
export const HP_MAX = 100;
export const LAVA_DPS = 10;
export const FRICTION = 2.2; // a velocidade do empurrão cai e^(-FRICTION·t)
export const STUN_SPEED = 1.5; // deslizando mais rápido que isso, o mago não anda
export const KNOCK_HP_SCALE = 1; // empurrão × (1 + KNOCK_HP_SCALE·vidaPerdida/HP_MAX)
export const CREDIT_WINDOW = 5; // o abate vai para quem acertou nos últimos 5 s
export const PROJ_R = 0.3;

export const MAX_PLAYERS = 8;
export const ROUNDS = 5;
export const START_GOLD = 10;
export const ROUND_GOLD = 10;
export const KILL_GOLD = 5;
export const WIN_GOLD = 5;
export const WIN_POINTS = 3;
export const SHOP_MS = 20_000;
export const COUNTDOWN_MS = 3_000;
export const ROUND_END_MS = 2_500;
