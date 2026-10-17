// Controles do Dota: botão direito anda, Q W E R F lançam na direção do cursor, S para.
// No celular: tocar no chão anda; tocar no botão da magia e depois no chão lança.
import { SPELLS, SPELL_IDS, type SpellId } from '../shared/spells.ts';
import type { Vec } from '../shared/vec.ts';

export type InputHandlers = {
  pick: (x: number, y: number) => Vec | null;
  move: (to: Vec) => void;
  stop: () => void;
  cast: (spell: SpellId, at: Vec) => void;
  center: () => void;
  armedChanged: (spell: SpellId | null) => void;
};

const KEYS: Record<string, SpellId> = Object.fromEntries(SPELL_IDS.map((s) => ['Key' + SPELLS[s].key, s]));

export function createInput(canvas: HTMLCanvasElement, h: InputHandlers) {
  let cursor = { x: innerWidth / 2, y: innerHeight / 2 };
  let armed: SpellId | null = null;
  let dragging = false;
  let lastDrag = 0;
  let enabled = false;

  const arm = (s: SpellId | null) => {
    armed = s;
    h.armedChanged(s);
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => {
    cursor = { x: e.clientX, y: e.clientY };
    // segurar o botão direito arrasta o destino (no máximo 10 comandos por segundo)
    if (dragging && enabled && performance.now() - lastDrag > 100) {
      lastDrag = performance.now();
      const p = h.pick(e.clientX, e.clientY);
      if (p) h.move(p);
    }
  });
  canvas.addEventListener('pointerdown', (e) => {
    cursor = { x: e.clientX, y: e.clientY };
    if (!enabled) return;
    const p = h.pick(e.clientX, e.clientY);
    if (!p) return;
    const touch = e.pointerType === 'touch';
    if (armed && (e.button === 0 || touch)) {
      h.cast(armed, p);
      arm(null);
    } else if (e.button === 2 || touch) {
      h.move(p);
      dragging = e.button === 2;
    } else if (e.button === 0 && armed === null) {
      // clique esquerdo no chão sem magia escolhida também anda (ajuda quem joga com trackpad)
      h.move(p);
    }
  });
  addEventListener('pointerup', (e) => {
    if (e.button === 2) dragging = false;
  });
  addEventListener('keydown', (e) => {
    if (!enabled || e.repeat || e.ctrlKey || e.metaKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const spell = KEYS[e.code];
    if (spell) {
      const p = h.pick(cursor.x, cursor.y);
      if (p) h.cast(spell, p);
      e.preventDefault();
    } else if (e.code === 'KeyS') h.stop();
    else if (e.code === 'Space') {
      h.center();
      e.preventDefault();
    } else if (e.code === 'Escape') arm(null);
  });

  return {
    setEnabled(on: boolean) {
      enabled = on;
      if (!on) {
        dragging = false;
        arm(null);
      }
    },
    // botão da barra: escolhe a magia e o próximo clique (ou toque) no chão lança
    button(spell: SpellId) {
      if (enabled) arm(armed === spell ? null : spell);
    },
  };
}
