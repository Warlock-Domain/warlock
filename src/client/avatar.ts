// Criação de personagem (pedido do Fernando, 19/10): 7 peças misturando os bonecos KayKit, com prévia 3D girando. Salva neste navegador
// e avisa a sala pelo evento 'warlock:look' (main.ts manda ao servidor, que vale até no meio da partida).
import * as THREE from 'three';
import { CHARACTERS, LOOK_PARTS, PRESETS, fixLook, isCharacter, isLook, isRetired, lookHead, lookOf, randomLook, type Piece } from '../shared/characters.ts';
import { t } from './i18n.ts';
import { el, iconButton } from './icons.ts';
import { cloneAppearance, disposeAppearance, loadFile, loadLook, lookModel, type AppearanceInstance } from './scene.ts';
import { store } from './store.ts';

// ?as=nome (várias abas na mesma máquina) também separa a aparência, como o apelido e o personagem em main.ts
const as = new URLSearchParams(location.search).get('as')?.replace(/[^a-z0-9]/gi, '').slice(0, 12) ?? '';
const LOOK_KEY = 'warlock:look' + (as && ':' + as);
const CHAR_KEY = 'warlock:char' + (as && ':' + as);
export const LOOK_EVENT = 'warlock:look';

// a salva; sem ela, a do personagem pronto escolhido antes; sem nada, o mago
export function savedLook(): string {
  const look = store.get(LOOK_KEY);
  if (isLook(look)) return fixLook(look);
  const c = store.get(CHAR_KEY);
  return lookOf(isCharacter(c) ? c : 'mage');
}
// cliques seguidos nas setas: guarda na hora e manda ao servidor só o último, 250 ms depois do último clique
let sendTimer: ReturnType<typeof setTimeout> | undefined;
export function saveLook(look: string) {
  store.set(LOOK_KEY, look);
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => dispatchEvent(new CustomEvent(LOOK_EVENT, { detail: look })), 250);
}

const optName = (o: Piece, part: string) => {
  if (!o) return part === 'hands' ? t('Nada', 'Nothing') : t('Nenhum', 'None');
  const c = CHARACTERS.find((x) => x.id === o.from)!;
  return o.name ? t(o.name, o.en!) : t(c.name, c.en);
};

const W = 300, H = 400;

// The single character preview (one WebGL context): owns the renderer, the orbit camera, the shown model and the frame
// loop, which only runs while the panel is on screen and the tab is visible.
class AvatarPreview {
  readonly panel: HTMLElement;
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // transparent: the gradient comes from the canvas CSS
  private readonly stage = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 20);
  private shown: AppearanceInstance | null = null;
  private look = '';
  private sync = () => {};
  private frameId: number | null = null;
  private visible = false;
  private last = 0;
  private scale = 0;
  private orbitYaw = 0;
  private orbitPitch = 0.04;
  private orbitDistance = 4.3;
  private cameraTouched = false;

  constructor() {
    this.panel = this.build();
    // The observer follows hidden tabs, scrolling and remounts without measuring the layout every frame.
    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
      this.updateActivity();
    }).observe(this.panel);
    document.addEventListener('visibilitychange', this.updateActivity);
  }

  // Settings redraws its tabs on every change and asks for the panel again: reread the saved look and resume if visible
  refresh() {
    this.sync();
    this.updateActivity();
  }

  private updateActivity = () => {
    if (!this.visible || document.hidden || !this.panel.isConnected) {
      if (this.frameId !== null) cancelAnimationFrame(this.frameId);
      this.frameId = null;
      this.last = 0; // resuming does not advance the animation by the time the preview was hidden
    } else if (this.frameId === null) this.frameId = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    this.frameId = null;
    if (!this.visible || document.hidden || !this.panel.isConnected) return this.updateActivity();
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    if (this.shown) {
      this.shown.mixer.update(dt);
      if (!this.cameraTouched) this.shown.model.rotation.y += dt * 0.5;
    }
    this.renderer.render(this.stage, this.camera);
    this.frameId = requestAnimationFrame(this.frame);
  };

  // Same assembly and original materials as the match; only the cloned materials belong to the preview.
  private show(want: string) {
    void Promise.all([loadLook(want), loadFile('mage')]).then(([, mage]) => {
      const src = lookModel(want);
      if (want !== this.look || !src) return;
      // same scale as the game: the mage is 1.9 m tall (scene.ts)
      if (mage && !this.scale) this.scale = 1.9 / new THREE.Box3().setFromObject(mage.scene).getSize(new THREE.Vector3()).y;
      const rot = this.shown?.model.rotation.y ?? 0.6;
      if (this.shown) disposeAppearance(this.shown);
      const model = cloneAppearance(src.scene);
      model.scale.setScalar(this.scale || 1);
      model.rotation.y = rot;
      this.stage.add(model);
      const mixer = new THREE.AnimationMixer(model);
      const idle = src.clips.find((c) => c.name === 'Idle');
      if (idle) mixer.clipAction(idle).play();
      this.shown = { model, mixer };
    });
  }

  private aimCamera() {
    const targetY = 0.95;
    const { orbitDistance: d, orbitYaw: yaw, orbitPitch: pitch } = this;
    this.camera.position.set(d * Math.sin(yaw) * Math.cos(pitch), targetY + d * Math.sin(pitch), d * Math.cos(yaw) * Math.cos(pitch));
    this.camera.lookAt(0, targetY, 0);
  }

  private build(): HTMLElement {
    const { renderer, stage } = this;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    stage.add(new THREE.HemisphereLight('#fff4e0', '#3a2a22', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 2.4);
    sun.position.set(2, 4, 3);
    stage.add(sun);
    this.aimCamera();
    let drag: { id: number; x: number; y: number } | null = null;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', t('Prévia 3D do personagem. Arraste para mover a câmera e use a roda do mouse para aproximar.', '3D character preview. Drag to move the camera and use the mouse wheel to zoom.'));
    renderer.domElement.addEventListener('pointerdown', (e) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    });
    renderer.domElement.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (dx || dy) this.cameraTouched = true;
      this.orbitYaw -= dx * 0.008;
      this.orbitPitch = Math.max(-0.45, Math.min(0.75, this.orbitPitch + dy * 0.008));
      this.aimCamera();
    });
    const endDrag = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null;
      renderer.domElement.style.cursor = 'grab';
    };
    renderer.domElement.addEventListener('pointerup', endDrag);
    renderer.domElement.addEventListener('pointercancel', endDrag);
    renderer.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbitDistance = Math.max(2.8, Math.min(8, this.orbitDistance * Math.exp(e.deltaY * 0.001)));
      this.cameraTouched = true;
      this.aimCamera();
    }, { passive: false }); // without passive: false, preventDefault does not stop the page from scrolling while zooming

    const set = (next: string) => {
      if (next === this.look) return;
      saveLook(next);
      this.sync();
    };
    // one thumbnail per piece option: the portrait of the character it comes from (the Hood shows the hooded Rogue), ∅ for none
    const tiles = LOOK_PARTS.map((p, i) => p.opts.flatMap((o, k) => isRetired(o) ? [] : [[k, el('button', { type: 'button', class: 'avatar-preset avatar-tile', title: optName(o, p.id), 'aria-label': `${t(p.name, p.en)}: ${optName(o, p.id)}`, onclick: () => set(this.look.slice(0, i) + k + this.look.slice(i + 1)) },
      o ? el('img', { src: `/chars/${o.nodes[0] === 'Rogue_Hood' ? 'rogue_hooded' : o.from}.webp`, alt: '', width: 30, height: 40 }) : el('span', { class: 'avatar-none' }, '∅')) as HTMLElement] as const]));
    const rows = LOOK_PARTS.map((p, i) => el('div', { class: 'avatar-row' }, el('span', { class: 'muted' }, t(p.name, p.en)), el('div', { class: 'avatar-tiles' }, ...tiles[i].map(([, b]) => b))));
    // the original characters as shortcuts: one click builds the whole character (Fernando, 19/10); one Rogue only, the hood is a hat (#107)
    const presets = PRESETS.map((c) => el('button', { type: 'button', class: 'avatar-preset', title: t(c.name, c.en), 'aria-label': t(c.name, c.en), onclick: () => set(lookOf(c.id)) },
      el('img', { src: `/chars/${lookHead(lookOf(c.id))}.webp`, alt: '', width: 30, height: 40 }))); // the Rogue preset shows the portrait with the Hood
    this.sync = () => {
      const now = this.look;
      this.look = savedLook();
      tiles.forEach((row, i) => row.forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === Number(this.look[i])))));
      presets.forEach((b, i) => b.setAttribute('aria-pressed', String(this.look === lookOf(PRESETS[i].id))));
      if (this.look !== now || !this.shown) this.show(this.look);
    };
    return el('div', { class: 'avatar' },
      el('style', {}, `.avatar{display:flex;gap:var(--sp-16);flex-wrap:wrap;align-items:flex-start}.avatar-view{width:${W}px;max-width:100%;display:flex;flex-direction:column;gap:4px}.avatar canvas{width:${W}px;height:${H}px;max-width:100%;border-radius:12px;background:radial-gradient(circle at 50% 40%,#3a2a40,#15101a);touch-action:none;cursor:grab}.avatar-parts{flex:1;min-width:300px;display:flex;flex-direction:column;gap:var(--sp-6)}.avatar-top{display:flex;justify-content:space-between;align-items:flex-end;gap:var(--sp-8)}.avatar-presets,.avatar-tiles{display:flex;flex-wrap:wrap;gap:4px}.avatar-row{display:flex;align-items:center;gap:var(--sp-8)}.avatar-row>span{width:5.5em;flex:none;font-size:var(--fs-90)}.avatar-preset{padding:2px;min-height:0;border-radius:8px}.avatar-none{width:30px;height:40px;display:grid;place-items:center}.avatar-preset[aria-pressed=true]{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}`),
      el('div', { class: 'avatar-view' }, renderer.domElement, el('small', { class: 'muted' }, t('Arraste para orbitar · role para aproximar', 'Drag to orbit · scroll to zoom'))),
      el('div', { class: 'avatar-parts' },
        el('div', { class: 'avatar-top' }, el('div', {}, el('small', { class: 'muted' }, t('Prontos', 'Presets')), el('div', { class: 'avatar-presets' }, ...presets)),
          el('button', { type: 'button', onclick: () => set(randomLook()) }, t('Aleatório', 'Random'))),
        ...rows,
        el('small', { class: 'muted' }, t('Vale na hora, até no meio da partida, e os outros jogadores veem. Fica salvo neste navegador.', 'Applies right away, even mid-match, and the other players see it. Saved in this browser.'))));
  }
}

// one panel only (one WebGL context): Settings redraws its tabs on every change and calls this again
let preview: AvatarPreview | null = null;
export function avatarPanel(): HTMLElement {
  preview ??= new AvatarPreview();
  preview.refresh();
  return preview.panel;
}
