// Controles do Dota: botão direito anda, Q W E R F lançam na direção do cursor, S para.
// Três jeitos de lançar pela tecla (keys.ts, getCastMode): na hora, ao soltar (segurar mostra o alcance) ou com clique.
// No celular: tocar no chão anda; tocar no botão da magia e depois no chão lança.
import type { SpellId } from '../shared/spells.ts';
import { actionFor, getCastMode, isUiKey, typing } from './keys.ts';
import { setPadGame } from './gamepad.ts';
import type { Vec } from '../shared/vec.ts';

export type InputHandlers = {
  pick: (x: number, y: number, spell?: SpellId) => Vec | null;
  move: (to: Vec, held?: boolean) => void;
  holdMove?: (on: boolean) => void;
  stop: () => void;
  brace?: (on: boolean) => void;
  basic?: (at: Vec, target?: string) => void;
  canChannel?: () => boolean;
  channel?: (spell: SpellId) => boolean;
  pickAttack?: (x: number, y: number) => string | undefined;
  fireSniper?: () => boolean;
  attackArmedChanged?: (on: boolean) => void;
  meleeArc?: () => boolean; // golpe em arco escolhido na loja (issue #402): a tecla golpeia na hora rumo ao cursor, sem escolher alvo
  cast: (spell: SpellId, at: Vec) => boolean | void; // true when the spell actually casts (owned and off cooldown)
  checkCooldown?: (spell: SpellId) => boolean;
  center: () => void;
  zoom: (deltaY: number) => void;
  pan: (dx: number, dy: number) => void;
  armedChanged: (armed: SpellId | null) => void;
  preview: (held: SpellId | null, at?: Vec) => void; // tecla segurada (círculo de alcance); at: ponto do lançamento no Rápido
  padRange: (aiming: SpellId | null) => void; // controle mirando com o analógico direito
  // controle: posição do próprio mago (para andar e mirar) e o retículo no chão
  me: () => Vec | null;
  aim: (at: Vec | null) => void;
};

export function createInput(canvas: HTMLCanvasElement, h: InputHandlers) {
  let cursor = { x: innerWidth / 2, y: innerHeight / 2 };
  let armed: SpellId | null = null;
  let attackArmed = false;
  let attackHeldCode: string | null = null;
  let channelArmed = false;
  let dragging = false;
  let lastDrag = 0;
  let enabled = false;
  let braceCode: string | null = null;
  let braceTimer: ReturnType<typeof setInterval> | undefined;
  const releaseBrace = () => {
    if (braceCode) h.brace?.(false);
    braceCode = null;
    clearInterval(braceTimer);
  };
  // Espaço segurado + botão esquerdo arrasta a câmera; Espaço solto sem arrastar volta ao centro
  let space = false;
  let panning = false;
  let panned = false;
  let panFrom = { x: 0, y: 0 };

  const arm = (s: SpellId | null) => {
    attackArmed = false;
    channelArmed = false;
    h.attackArmedChanged?.(false);
    armed = s;
    h.armedChanged(s);
  };
  // tecla de magia segurada: lança ao soltar, no ponto do cursor naquela hora
  let held: { action: SpellId; code: string } | null = null;
  let flash: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    held = null;
    h.preview(null);
  };
  const release = () => {
    const a = held?.action;
    cancel();
    const p = a && enabled ? h.pick(cursor.x, cursor.y, a) : null;
    if (a && p) h.cast(a, p);
  };
  const releaseMove = () => { if (dragging) h.holdMove?.(false); dragging = false; };
  const cancelPointer = () => { releaseMove(); panning = space = panned = false; };
  // Cancel active charge on lost focus so no ghost command survives.
  addEventListener('blur', () => { if (channelArmed) h.stop(); attackHeldCode = null; cancel(); arm(null); cancelPointer(); releaseBrace(); });
  addEventListener('visibilitychange', () => { if (document.hidden) { if (channelArmed) { h.stop(); arm(null); } releaseBrace(); } });
  // Capture key release before dialogs can swallow it.
  addEventListener('keyup', (e) => { if (e.code === braceCode) releaseBrace(); }, { capture: true });
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || (['shop', 'sheet', 'rules', 'library', 'taunt'] as const).some((a) => isUiKey(e.code, a))) { if (channelArmed) { h.stop(); arm(null); } releaseBrace(); }
  }, { capture: true });
  addEventListener('pointerdown', (e) => { if (e.target !== canvas) releaseBrace(); }, { capture: true });
  addEventListener('pointercancel', cancelPointer);

  // o controle usa os mesmos comandos, liberados só durante a rodada
  setPadGame({ ...h, enabled: () => enabled });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    h.zoom(e.deltaY);
  }, { passive: false });
  canvas.addEventListener('pointermove', (e) => {
    cursor = { x: e.clientX, y: e.clientY };
    if (!(e.buttons & 2)) releaseMove();
    if (!(e.buttons & 1)) panning = false;
    if (panning) {
      h.pan(e.clientX - panFrom.x, e.clientY - panFrom.y);
      panFrom = { x: e.clientX, y: e.clientY };
      panned = true;
      return;
    }
    // segurar o botão direito arrasta o destino (no máximo 10 comandos por segundo)
    if (dragging && enabled && performance.now() - lastDrag > 100) {
      lastDrag = performance.now();
      const p = h.pick(e.clientX, e.clientY);
      if (p) h.move(p, true);
    }
  });
  canvas.addEventListener('pointerdown', (e) => {
    cursor = { x: e.clientX, y: e.clientY };
    if (space && e.button === 0) {
      panning = true;
      panFrom = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!enabled) return;
    const p = h.pick(e.clientX, e.clientY, e.button === 0 || e.pointerType === 'touch' ? armed ?? undefined : undefined);
    if (!p) return;
    const touch = e.pointerType === 'touch';
    if (attackArmed && e.button === 0) {
      h.basic?.(p, h.pickAttack?.(e.clientX, e.clientY));
      arm(null); // uma ordem manual por golpe; segurar A/clique não repete.
    } else if (armed && (e.button === 0 || touch)) {
      // fora do alcance a magia sai na direção do clique, até a borda do alcance (o servidor limita)
      const chosen = armed;
      const cast = h.cast(chosen, p);
      if (channelArmed ? cast : (chosen !== 'heal' && chosen !== 'sniper') || cast) arm(null);
    } else if (e.button === 2 || touch) {
      if (armed || attackArmed) arm(null); // botão direito cancela a ação escolhida (e anda, como no Dota)
      h.move(p, e.button === 2);
      dragging = e.button === 2;
    }
  });
  addEventListener('pointerup', (e) => {
    if (e.button === 2) releaseMove();
    if (e.button === 0) panning = false;
  });
  addEventListener('keyup', (e) => {
    if (e.code === attackHeldCode) attackHeldCode = null;
    if (held && e.code === held.code) return release();
    if (e.code !== 'Space') return;
    space = false;
    panning = false;
    if (!panned) h.center();
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
      e.preventDefault();
      if (!e.repeat) {
        space = true;
        panned = false;
      }
      return;
    }
    if (!enabled || typing(e)) return;
    // teclas trocáveis pelo jogador (keys.ts)
    const action = actionFor(e.code);
    if (action) {
      if (action === 'elemental') { e.preventDefault(); return; }
      if (action === 'channel') { e.preventDefault(); cancel(); return arm(action); }
      if (h.canChannel?.() && (attackHeldCode || attackArmed || armed === 'channel')) {
        e.preventDefault(); if (e.repeat) return;
        cancel();
        if (h.channel?.(action)) { arm(action); channelArmed = true; }
        return;
      }
      if (channelArmed && action === armed) { e.preventDefault(); return; }
      // Heal and Inelegant Solution always require a click on the target body; a charged sniper aim fires on the key instead.
      if (action === 'sniper' && h.fireSniper?.()) { e.preventDefault(); return; }
      if (action === 'heal' || action === 'sniper') { e.preventDefault(); cancel(); return arm(action); }
      if (armed === 'heal' || armed === 'sniper') arm(null);
      if (attackArmed) arm(null);
      e.preventDefault();
      const mode = getCastMode();
      if (mode === 'click') {
        if (h.checkCooldown && !h.checkCooldown(action)) return arm(null);
        return arm(action); // select the spell and show its range; left click casts
      }
      if (mode === 'release') {
        if (held) release(); // cast the first spell before starting to hold another
        if (h.checkCooldown && !h.checkCooldown(action)) return;
        held = { action, code: e.code };
        return h.preview(action);
      }
      const p = h.pick(cursor.x, cursor.y, action);
      // Rápido: o anel de alcance pisca por um instante quando a magia sai (issue #61), com a faixa de acerto e a área presas
      // no ponto do lançamento (pedido do Fernando, 21/10: igual ao Segurar, mas sem seguir o mouse depois)
      if (p && h.cast(action, p)) {
        h.preview(action, p);
        clearTimeout(flash);
        flash = setTimeout(() => !held && h.preview(null), 400);
      }
      return;
    }
    if (isUiKey(e.code, 'stop')) {
      e.preventDefault();
      if (!e.repeat) {
        cancel(); arm(null); releaseMove(); h.stop();
        releaseBrace();
        braceCode = e.code;
        h.brace?.(true);
        braceTimer = setInterval(() => h.brace?.(true), 100);
      }
    } else if (isUiKey(e.code, 'basic')) {
      e.preventDefault();
      if (e.repeat) return;
      if (h.fireSniper?.()) return; // charged Inelegant Solution: A fires at the marked enemy
      cancel(); arm(null); attackHeldCode = e.code;
      if (!h.canChannel?.() && h.meleeArc?.()) {
        const p = h.pick(cursor.x, cursor.y);
        if (p) h.basic?.(p);
      } else { attackArmed = true; h.attackArmedChanged?.(true); }
    }
    else if (e.code === 'Escape') {
      // só consome o Esc se havia magia escolhida ou segurada; senão ele segue para abrir as configurações
      if (armed || held || attackArmed) e.preventDefault();
      cancel();
      arm(null);
    }
  });

  return {
    setChannelState(on: boolean) { if (!on && channelArmed) arm(null); },
    setEnabled(on: boolean) {
      enabled = on;
      if (!on) {
        if (channelArmed) h.stop();
        attackHeldCode = null;
        releaseBrace();
        releaseMove();
        cancel();
        arm(null);
      }
    },
    // ponto do chão sob o mouse (o Meteoro desenha a explosão ali)
    aimPoint: () => h.pick(cursor.x, cursor.y),
    attackArmed: () => attackArmed,
    // wizard model under the mouse (the click target of Attack and the Inelegant Solution)
    hovered: () => h.pickAttack?.(cursor.x, cursor.y),
    // The toolbar selects a spell; the next ground click or tap casts it.
    button(a: SpellId) {
      if (a === 'elemental') return;
      if (enabled && a === 'sniper' && h.fireSniper?.()) return; // charged aim: the bar button fires at the marked enemy
      if (enabled && a !== 'channel' && h.canChannel?.() && (attackArmed || armed === 'channel')) {
        cancel(); if (h.channel?.(a)) { arm(a); channelArmed = true; } return;
      }
      if (a === 'heal' || a === 'sniper') cancel();
      if (!enabled) return;
      if (armed === a) return arm(null);
      if (h.checkCooldown && !h.checkCooldown(a)) return arm(null);
      arm(a);
    },
  };
}
