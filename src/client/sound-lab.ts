// Forum sound lab arena (issue #366): the real simulation and 3D scene running in the browser with no server (Fernando, 25/10:
// a new local arena, chosen over reusing the sandbox), the player and one dummy. Only the spell under test makes a sound, through
// `play`, so each candidate is heard alone. Loaded on demand by forum-sounds.ts: Three.js stays out of the forum's first load.
import type { SoundMoment } from '../shared/forum-sounds.ts';
import { DT, HP_MAX } from '../shared/constants.ts';
import { newWorld, stepWorld, type Cmd, type World } from '../shared/sim.ts';
import { WALKING_BIT, decodeSnap, encodeSnap } from '../shared/snapshot.ts';
import { SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { v, type Vec } from '../shared/vec.ts';
import { savedLook } from './avatar.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { createScene, type WizDraw } from './scene.ts';

const IDS = ['me', 'dummy'];
const RULES = { runes: false, sudden: false, chests: false };
// the dummy stands still in the middle and takes no knockback (Fernando, 26/10), so every hit lands on the same spot
const ME_AT = v(-5, 0);
const DUMMY_AT = v(0, 0);

function build(): World {
  const all = Object.fromEntries(SPELL_IDS.map((id) => [id, 1])) as Record<SpellId, number>;
  const none = Object.fromEntries(SPELL_IDS.map((id) => [id, 0])) as Record<SpellId, number>;
  const w = newWorld(IDS, { me: all, dummy: none }, {}, 0, Math.random, false, {}, RULES, 'circle');
  w.shrinkAt = Infinity;
  Object.assign(w.wizards[0], { pos: ME_AT, facing: 0, invulnUntil: 0 });
  Object.assign(w.wizards[1], { pos: DUMMY_AT, facing: Math.PI, invulnUntil: 0 });
  return w;
}

export function openLab(host: HTMLElement, opts: { spell: () => SpellId; play: (moment: SoundMoment) => void }) {
  const canvas = el('canvas', { id: 'c' });
  const labels = el('div', { class: 'labels' });
  host.append(canvas, labels);
  const scene = createScene(canvas, labels);
  const look = savedLook();
  let w = build();
  let cmds: Cmd[] = [];
  let cursor: Vec | null = null;
  let acc = 0;
  let last = performance.now();
  let paused = false;

  const pick = (e: { clientX: number; clientY: number }) => scene.pick(e.clientX, e.clientY);
  const cast = (at: Vec | null) => at && cmds.push({ id: 'me', kind: 'cast', spell: opts.spell(), at });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => (cursor = pick(e)));
  canvas.addEventListener('pointerdown', (e) => {
    const at = pick(e);
    if (e.button === 2 && at) cmds.push({ id: 'me', kind: 'move', to: at });
    else if (e.button === 0) cast(at);
  });
  // holding S is Hold ground, as in the game (Closed Body needs it); the command is a lease, so it is renewed while held
  let brace: ReturnType<typeof setInterval> | undefined;
  const release = () => {
    clearInterval(brace);
    brace = undefined;
    cmds.push({ id: 'me', kind: 'brace', on: false });
  };
  const onKey = (e: KeyboardEvent) => {
    if (paused || e.repeat || (e.target as Element).closest?.('input, textarea')) return;
    if (e.code === 'KeyQ') cast(cursor);
    else if (e.code === 'KeyS' && !brace) {
      cmds.push({ id: 'me', kind: 'stop' }, { id: 'me', kind: 'brace', on: true });
      brace = setInterval(() => cmds.push({ id: 'me', kind: 'brace', on: true }), 100);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => e.code === 'KeyS' && brace && release();
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKeyUp);

  function step() {
    const [me, dummy] = w.wizards;
    // no cooldown and no death for the player: the lab is for hearing the spell as often as wanted
    for (const id of SPELL_IDS) me.cd[id] = 0;
    me.hp = HP_MAX;
    dummy.hp = HP_MAX;
    stepWorld(w, cmds, Math.random);
    cmds = [];
    const spell = opts.spell();
    for (const e of w.events) {
      if (e.k === 'cast' && e.id === 'me' && e.spell === spell) opts.play('cast');
      else if (e.k === 'hit' && e.by === 'me' && e.src === spell) opts.play('hit');
    }
    scene.onEvents(w.events);
    // pinned after the step: knockback, pulls and swaps never move it
    dummy.pos = DUMMY_AT;
    dummy.vel = v(0, 0);
  }

  function frame(now: number) {
    if (!host.isConnected) {
      removeEventListener('keydown', onKey);
      return removeEventListener('keyup', onKeyUp);
    }
    requestAnimationFrame(frame);
    // a hidden tab or a closed overlay must not run a burst of steps when it comes back
    acc = paused ? 0 : Math.min(acc + (now - last) / 1000, 0.25);
    last = now;
    for (; acc >= DT; acc -= DT) step();
    if (paused) return;
    const s = decodeSnap(encodeSnap(w, 'me', 0, [], true), IDS);
    const wizards: WizDraw[] = s.wizards.map((z, i) => ({
      ...z, hpMax: HP_MAX, color: i, character: 'mage', look: i === 0 ? look : undefined, name: i === 0 ? t('Você', 'You') : t('Boneco', 'Dummy'),
      moving: z.alive && (z.status & WALKING_BIT) > 0, cheer: false,
    }));
    scene.render({ arena: 'circle', arenaR: s.arenaR, shrinkIn: Infinity, wizards, projectiles: s.projectiles, pillars: s.pillars, loots: s.loots, runes: s.runes, zones: s.zones, isles: s.isles, follow: null });
  }
  void scene.ready.then(() => requestAnimationFrame(frame));

  return {
    reset() {
      w = build();
    },
    // the page hides the overlay instead of tearing it down: the scene has no dispose, and a new one per opening would pile up
    // WebGL contexts
    pause(on: boolean) {
      paused = on;
      if (on && brace) release();
    },
  };
}
