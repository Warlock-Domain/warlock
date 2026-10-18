// Taunts da roda (tecla Y): voz em inglês de pacotes CC0 (Kenney Voiceover Packs; miau e risada do OpenGameArt), legenda em português.
// O arquivo fica em public/sfx/taunt/<id>.mp3; a mensagem leva só o índice.
export const TAUNTS = [
  { id: 'loser', text: 'Perdedor!' },
  { id: 'laugh', text: 'Muahaha!' },
  { id: 'meow', text: 'Miau~' },
  { id: 'flawless', text: 'Vitória perfeita!' },
  { id: 'combo_breaker', text: 'Quebra-combo!' },
  { id: 'multi_kill', text: 'Multi kill!' },
  { id: 'fire_in_the_hole', text: 'Lá vai bomba!' },
  { id: 'look_out', text: 'Cuidado!' },
  { id: 'congrats', text: 'Parabéns… 👏' },
] as const;
export const TAUNT_COOLDOWN_MS = 2500;
// Taunts gravados pelo próprio jogador: até 3, cada um com até 3 s de voz e legenda curta.
// Na mensagem 'taunt', i = OWN_TAUNT + slot toca o taunt próprio daquele slot.
export const VOICE_SLOTS = 3;
export const VOICE_MAX_MS = 3000;
export const VOICE_MAX_B64 = 48_000;
export const VOICE_TEXT_MAX = 24;
export const OWN_TAUNT = 100;
export const VOICE_MIME = /^audio\/[a-z0-9/;=.,+ -]{1,58}$/;
export type Voice = { text: string; mime: string; data: string };
