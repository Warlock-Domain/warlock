// Taunts da roda (tecla Y): voz em inglês de pacotes CC0 (Kenney Voiceover Packs; miau e risada do OpenGameArt), legenda em português.
// O arquivo fica em public/sfx/taunt/<id>.mp3; a mensagem leva só o índice.
export const TAUNTS = [
  { id: 'loser', text: 'Perdedor!', en: 'Loser!' },
  { id: 'laugh', text: 'Muahaha!', en: 'Muahaha!' },
  { id: 'meow', text: 'Miau~', en: 'Meow~' },
  { id: 'flawless', text: 'Vitória perfeita!', en: 'Flawless victory!' },
  { id: 'combo_breaker', text: 'Quebra-combo!', en: 'Combo breaker!' },
  { id: 'multi_kill', text: 'Multi kill!', en: 'Multi kill!' },
  { id: 'ultra_kill', text: 'ULTRA KILL!', en: 'ULTRA KILL!' }, // voz sintética do Windows (Zira) com efeito de locutor; a do Dota é da Valve
  { id: 'fire_in_the_hole', text: 'Lá vai bomba!', en: 'Fire in the hole!' },
  { id: 'look_out', text: 'Cuidado!', en: 'Look out!' },
  { id: 'congrats', text: 'Parabéns… 👏', en: 'Congrats… 👏' },
] as const;
export const TAUNT_COOLDOWN_MS = 2500;
