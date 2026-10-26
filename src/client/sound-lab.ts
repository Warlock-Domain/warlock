// Forum sound lab arena (issue #366): the real simulation and 3D scene running in the browser with no server (Fernando, 25/10:
// a new local arena, chosen over reusing the sandbox), the player and one dummy. Only the spell under test makes a sound, through
// `play`, so each candidate is heard alone. Loaded on demand by forum-sounds.ts: Three.js stays out of the forum's first load.
import type { SoundMoment } from '../shared/forum-sounds.ts';
import { DT, HP_MAX, arenaRadius } from '../shared/constants.ts';
import { BOT_SKILL, botCmds, botThinks, botWatch } from '../shared/bots.ts';
import { newWorld, resizeArena, revive, stepWorld, type Cmd, type World } from '../shared/sim.ts';
import { WALKING_BIT, decodeSnap, encodeSnap } from '../shared/snapshot.ts';
import { SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { v, type Vec } from '../shared/vec.ts';
import { savedLook } from './avatar.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { createScene, type WizDraw } from './scene.ts';

const RULES = { runes: false, sudden: false, chests: false };
// dummies stand still and take no knockback (Fernando, 26/10), so every hit lands on the same spot: the first in the middle,
// the others around it; bots play with the game's own brain and come back after falling
const ME_AT = v(-5, 0);
const ring = (a: number, r: number) => v(Math.cos(a) * r, Math.sin(a) * r);
const dummyAt = (i: number) => (i === 0 ? v(0, 0) : ring((i * Math.PI * 2) / 3 - Math.PI / 2, 2.5));
const botAt = (i: number) => ring((i * Math.PI) / 2 + Math.PI / 4, 6);
const MAX_EXTRA = 4;
const RESPAWN_S = 1;
const BOT_SPELLS: SpellId[] = ['fireball', 'lightning', 'homing', 'meteor', 'cluster', 'shield'];
const BOT = BOT_SKILL.normal;
// measured at zoom 1: the arena's drawn width is about 1.24 window heights
const ARENA_W = 1.24;
const ARENA_R = arenaRadius(2);

function build(dummies: number, bots: number): World {
  const level = (has: (id: SpellId) => boolean) => Object.fromEntries(SPELL_IDS.map((id) => [id, has(id) ? 1 : 0])) as Record<SpellId, number>;
  const ds = Array.from({ length: dummies }, (_, i) => `d${i}`);
  const bs = Array.from({ length: bots }, (_, i) => `b${i}`);
  const spells = Object.fromEntries([['me', level(() => true)], ...ds.map((id) => [id, level(() => false)]), ...bs.map((id) => [id, level((s) => BOT_SPELLS.includes(s))])]);
  const w = newWorld(['me', ...ds, ...bs], spells, {}, 0, Math.random, false, {}, RULES, 'circle');
  // same size whatever the count, and it never shrinks (Fernando, 26/10)
  resizeArena(w, ARENA_R);
  w.events = [];
  w.shrinkAt = Infinity;
  w.wizards.forEach((z, i) => {
    const pos = i === 0 ? ME_AT : i <= dummies ? dummyAt(i - 1) : botAt(i - 1 - dummies);
    Object.assign(z, { pos, facing: i === 0 ? 0 : Math.PI, invulnUntil: 0 });
  });
  return w;
}

export function openLab(host: HTMLElement, opts: { spell: () => SpellId; play: (moment: SoundMoment) => void; inset: () => number }) {
  const canvas = el('canvas', { id: 'c' });
  const labels = el('div', { class: 'labels' });
  host.append(canvas, labels);
  const scene = createScene(canvas, labels);
  const look = savedLook();
  let dummies = 1;
  let bots = 0;
  let w = build(dummies, bots);
  let steps = 0;
  const deadAt = new Map<string, number>();
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
    const [me] = w.wizards;
    // no cooldown and no health loss for the player: the lab is for hearing the spell as often as wanted
    for (const id of SPELL_IDS) me.cd[id] = 0;
    me.hp = HP_MAX;
    for (let i = 1; i <= dummies; i++) w.wizards[i].hp = HP_MAX;
    botWatch(w);
    w.wizards.forEach((z, i) => z.id[0] === 'b' && z.alive && botThinks(steps, i, BOT) && cmds.push(...botCmds(w, z.id, Math.random, BOT)));
    stepWorld(w, cmds, Math.random);
    steps++;
    cmds = [];
    // after 150 s the game collapses the arena even without sudden death; the lab puts it back and hides the shrink
    if (w.arenaR !== ARENA_R) resizeArena(w, ARENA_R);
    const events = w.events.filter((e) => e.k !== 'shrink');
    const spell = opts.spell();
    for (const e of events) {
      if (e.k === 'cast' && e.id === 'me' && e.spell === spell) opts.play('cast');
      else if (e.k === 'hit' && e.by === 'me' && e.src === spell) opts.play('hit');
    }
    scene.onEvents(events);
    w.wizards.forEach((z, i) => {
      // pinned after the step: knockback, pulls and swaps never move a dummy
      if (i > 0 && i <= dummies) Object.assign(z, { pos: dummyAt(i - 1), vel: v(0, 0) });
      if (z.alive) return void deadAt.delete(z.id);
      const at = deadAt.get(z.id) ?? deadAt.set(z.id, w.t).get(z.id)!;
      if (w.t - at > RESPAWN_S) revive(w, z, i === 0 ? ME_AT : botAt(i - 1 - dummies));
    });
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
    const s = decodeSnap(encodeSnap(w, 'me', 0, [], true), w.wizards.map((z) => z.id));
    const wizards: WizDraw[] = s.wizards.map((z, i) => ({
      ...z, hpMax: HP_MAX, color: i, character: 'mage', look: i === 0 ? look : undefined,
      name: i === 0 ? t('Você', 'You') : i <= dummies ? t('Boneco', 'Dummy') : t('Bot', 'Bot'),
      moving: z.alive && (z.status & WALKING_BIT) > 0, cheer: false,
    }));
    scene.render({ arena: 'circle', arenaR: s.arenaR, shrinkIn: Infinity, wizards, projectiles: s.projectiles, pillars: s.pillars, loots: s.loots, runes: s.runes, zones: s.zones, isles: s.isles, follow: null });
    fit();
  }
  // the spell panel covers the right of the window (the scene always draws the whole window): the camera moves so the arena
  // sits in the free part, and backs off when that part is narrower than the arena. The pan waits one render after the zoom
  // and is measured on the ground between the window's middle and the free part's middle (a pure shift keeps that gap)
  let fitted = '';
  let zoom = 1;
  let panPending = false;
  function fit() {
    const inset = opts.inset();
    const key = `${innerWidth}x${innerHeight}:${inset}`;
    if (panPending) {
      panPending = false;
      const mid = scene.pick(innerWidth / 2, innerHeight / 2);
      const free = scene.pick((innerWidth - inset) / 2, innerHeight / 2);
      scene.resetCamera(mid && free ? mid.x - free.x : 0, 0);
    }
    if (key === fitted) return;
    fitted = key;
    const next = Math.max(1, (ARENA_W * innerHeight) / (0.9 * (innerWidth - inset)));
    scene.zoomBy(Math.log(next / zoom) / 0.0012);
    zoom = next;
    panPending = true;
  }
  const rebuild = () => {
    w = build(dummies, bots);
    deadAt.clear();
  };
  const counter = (name: string, get: () => number, set: (n: number) => void, min: number) => {
    const n = el('span', { class: 'fm-arena-n' }, String(get()));
    const change = (d: number) => {
      set(Math.max(min, Math.min(MAX_EXTRA, get() + d)));
      n.textContent = String(get());
      rebuild();
    };
    return el('div', { class: 'fm-arena-count' }, el('span', {}, name),
      el('button', { type: 'button', class: 'fm-btn', 'aria-label': t(`Menos: ${name}`, `Fewer: ${name}`), onclick: () => change(-1) }, '−'), n,
      el('button', { type: 'button', class: 'fm-btn', 'aria-label': t(`Mais: ${name}`, `More: ${name}`), onclick: () => change(1) }, '+'));
  };
  host.append(el('div', { class: 'fm-arena-tools' },
    counter(t('Bonecos parados', 'Still dummies'), () => dummies, (n) => (dummies = n), 0),
    counter(t('Bots que jogam', 'Playing bots'), () => bots, (n) => (bots = n), 0)));
  void scene.ready.then(() => requestAnimationFrame(frame));

  return {
    reset() {
      rebuild();
    },
    // the page hides the overlay instead of tearing it down: the scene has no dispose, and a new one per opening would pile up
    // WebGL contexts
    pause(on: boolean) {
      paused = on;
      if (on && brace) release();
    },
  };
}
