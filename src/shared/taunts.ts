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
