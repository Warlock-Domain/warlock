import * as THREE from 'three';
import { SHAPES, type ArenaId } from '../shared/arena.ts';
import { METEOR_DELAY } from '../shared/spells.ts';
import type { ProjKind } from '../shared/sim.ts';
import type { ProjView } from '../shared/snapshot.ts';
import { DARKNESS } from '../shared/world-end.ts';
import type { Vec } from '../shared/vec.ts';

export const torchRadius = (fuel: number) => DARKNESS.torchRadius * THREE.MathUtils.clamp(fuel / DARKNESS.fuel, 0, 1);
export const BLIZZARD_WHITEOUT_DEPTH = .055;
const GUST_SLOTS = 3;
const HAZARD_LIGHT_SLOTS = 16;
const FLASH_SECONDS = 1;
const PROJECTILE_LIGHT_SLOTS = 6;
const SPELL_LIGHT_STRENGTH = .5;

const PROJECTILE_LIGHT_RADIUS: Partial<Record<ProjKind, number>> = {
  fireball: 2.45,
  homing: 2,
  cluster: 1.55,
  swap: 1.7,
  gravity: 1.85,
  bouncer: 1.45,
  magnetize: 1.45,
  recharge: 1.6,
  splitter: 1.7,
  shard: 1.2,
};

export function projectileDarknessLights(projectiles: readonly ProjView[]) {
  return projectiles.flatMap(projectile => {
    if (projectile.kind === 'meteor') {
      const descent = THREE.MathUtils.clamp(1 - projectile.vel.y / METEOR_DELAY, 0, 1);
      const ringLightRadius = projectile.vel.x + .42;
      return [{ pos: projectile.pos, radius: THREE.MathUtils.lerp(.8, ringLightRadius, THREE.MathUtils.smoothstep(descent, 0, 1)), strength: SPELL_LIGHT_STRENGTH }];
    }
    const base = projectile.kind === 'basic' && projectile.element && projectile.element !== 'void'
      ? 1.45
      : PROJECTILE_LIGHT_RADIUS[projectile.kind];
    return base ? [{ pos: projectile.pos, radius: base * THREE.MathUtils.clamp(projectile.size ?? 1, .7, 1.6), strength: SPELL_LIGHT_STRENGTH }] : [];
  }).sort((a, b) => b.radius - a.radius).slice(0, PROJECTILE_LIGHT_SLOTS);
}

function gustHash(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453;
  return value - Math.floor(value);
}

export function createDarknessEyes() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffacb9';
  context.beginPath();
  context.moveTo(13, 25); context.quadraticCurveTo(28, 40, 51, 35);
  context.quadraticCurveTo(27, 56, 13, 25); context.fill();
  context.beginPath();
  context.moveTo(115, 25); context.quadraticCurveTo(100, 40, 77, 35);
  context.quadraticCurveTo(101, 56, 115, 25); context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const root = new THREE.Group(); root.name = 'Darkness_Watching_Eyes';
  const overlay = (map: THREE.Texture, color = '#ffffff', depthTest = false) => {
    const material = new THREE.SpriteMaterial({ map, color, transparent: true, depthTest, depthWrite: false, toneMapped: false });
    material.allowOverride = false;
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 10002;
    sprite.visible = false;
    root.add(sprite);
    return sprite;
  };
  const eyes = Array.from({ length: 6 }, (_, i) => {
    const sprite = overlay(texture);
    const width = .65 + (i % 3) * .15;
    sprite.scale.set(width, width / 2, 1);
    return { sprite, width };
  });
  const rushing = overlay(texture, '#ff818e');
  rushing.name = 'Darkness_Rushing_Eyes';
  const silhouette = document.createElement('canvas');
  silhouette.width = 96; silhouette.height = 128;
  const ink = silhouette.getContext('2d')!;
  ink.fillStyle = '#19222a';
  ink.beginPath();
  ink.moveTo(30, 113);
  ink.quadraticCurveTo(38, 93, 35, 70);
  ink.quadraticCurveTo(28, 81, 12, 92);
  ink.quadraticCurveTo(18, 58, 41, 49);
  ink.quadraticCurveTo(37, 33, 46, 15);
  ink.lineTo(51, 30);
  ink.quadraticCurveTo(63, 22, 68, 35);
  ink.lineTo(79, 46);
  ink.lineTo(66, 54);
  ink.quadraticCurveTo(71, 67, 86, 73);
  ink.lineTo(67, 82);
  ink.quadraticCurveTo(55, 90, 59, 112);
  ink.quadraticCurveTo(52, 120, 47, 98);
  ink.quadraticCurveTo(39, 118, 30, 113);
  ink.fill();
  const silhouetteTexture = new THREE.CanvasTexture(silhouette);
  silhouetteTexture.colorSpace = THREE.SRGBColorSpace;
  const shadow = overlay(silhouetteTexture, '#ffffff', true);
  shadow.name = 'Darkness_Passing_Shadow';
  shadow.scale.set(1.15, 2.1, 1);
  const lurker = document.createElement('canvas');
  lurker.width = 128; lurker.height = 192;
  const shade = lurker.getContext('2d')!;
  shade.fillStyle = '#0b1017';
  shade.beginPath();
  // Wide hooked horns and a low head avoid reading as a pointed wizard hat.
  shade.moveTo(50, 52);
  shade.quadraticCurveTo(38, 42, 27, 18);
  shade.lineTo(17, 7);
  shade.lineTo(20, 30);
  shade.quadraticCurveTo(27, 55, 45, 65);
  shade.quadraticCurveTo(27, 68, 19, 88);
  shade.quadraticCurveTo(39, 82, 49, 91);
  shade.quadraticCurveTo(38, 129, 35, 180);
  shade.lineTo(51, 158);
  shade.lineTo(62, 190);
  shade.lineTo(73, 157);
  shade.lineTo(92, 181);
  shade.quadraticCurveTo(89, 128, 79, 91);
  shade.quadraticCurveTo(90, 82, 109, 88);
  shade.quadraticCurveTo(101, 68, 83, 65);
  shade.quadraticCurveTo(101, 55, 108, 30);
  shade.lineTo(111, 7);
  shade.lineTo(101, 18);
  shade.quadraticCurveTo(90, 42, 78, 52);
  shade.quadraticCurveTo(64, 38, 50, 52);
  shade.fill();
  shade.strokeStyle = '#0b1017';
  shade.lineWidth = 11;
  shade.lineCap = 'round';
  for (const side of [-1, 1]) {
    shade.beginPath();
    shade.moveTo(64 + side * 27, 76);
    shade.quadraticCurveTo(64 + side * 48, 98, 64 + side * 54, 137);
    shade.stroke();
    shade.lineWidth = 4;
    for (let finger = -1; finger <= 1; finger++) {
      shade.beginPath();
      shade.moveTo(64 + side * 54, 134);
      shade.lineTo(64 + side * (61 + Math.abs(finger) * 2), 151 + finger * 7);
      shade.stroke();
    }
    shade.lineWidth = 11;
  }
  shade.fillStyle = '#f2a0aa';
  shade.beginPath();
  shade.moveTo(45, 57); shade.quadraticCurveTo(53, 64, 61, 58); shade.quadraticCurveTo(53, 70, 45, 57); shade.fill();
  shade.beginPath();
  shade.moveTo(83, 57); shade.quadraticCurveTo(75, 64, 67, 58); shade.quadraticCurveTo(75, 70, 83, 57); shade.fill();
  const lurkerTexture = new THREE.CanvasTexture(lurker);
  lurkerTexture.colorSpace = THREE.SRGBColorSpace;
  const startled = Array.from({ length: 2 }, (_, i) => {
    const sprite = overlay(lurkerTexture, '#ffffff', true);
    sprite.name = `Darkness_Startled_Entity_${i + 1}`;
    sprite.scale.set(1.72, 3.15, 1);
    return sprite;
  });
  let flashes: { at: Vec; born: number; radius: number; direction: number }[] = [];
  let rays: { from: Vec; to: Vec; born: number }[] = [];
  let approach: { wave: number; direction: number } | undefined;
  const flashRadius = (flash: (typeof flashes)[number], time: number) => {
    const age = time - flash.born;
    return flash.radius * THREE.MathUtils.smoothstep(age, 0, .075)
      * (1 - THREE.MathUtils.smoothstep(age, .22, .86));
  };
  return {
    root,
    flash(at: Vec, radius: number, time: number) {
      if (flashes.some(entry => time - entry.born < .12 && Math.hypot(entry.at.x - at.x, entry.at.y - at.y) < 1.2)) return;
      const outward = Math.hypot(at.x, at.y) > .5 ? Math.atan2(at.y, at.x) : gustHash(at.x * 17.3 + at.y * 31.7) * Math.PI * 2;
      flashes.push({ at: { ...at }, born: time, radius, direction: outward + (gustHash(at.x * 11.1 - at.y * 7.3) - .5) * .65 });
      if (flashes.length > startled.length) flashes.shift();
    },
    ray(from: Vec, to: Vec, time: number) {
      rays.push({ from: { ...from }, to: { ...to }, born: time });
      if (rays.length > 2) rays.shift();
    },
    lights(time: number) {
      flashes = flashes.filter(flash => time - flash.born < FLASH_SECONDS);
      rays = rays.filter(ray => time - ray.born < .14);
      const rayLights = rays.flatMap(ray => {
        const count = THREE.MathUtils.clamp(Math.ceil(Math.hypot(ray.to.x - ray.from.x, ray.to.y - ray.from.y) / 2), 2, 7);
        return Array.from({ length: count }, (_, i) => {
          const progress = count === 1 ? 0 : i / (count - 1);
          return { pos: { x: THREE.MathUtils.lerp(ray.from.x, ray.to.x, progress), y: THREE.MathUtils.lerp(ray.from.y, ray.to.y, progress) }, radius: .38, strength: .08 };
        });
      });
      const flashLights = flashes.map(flash => {
        const radius = flashRadius(flash, time);
        return { pos: flash.at, radius, strength: SPELL_LIGHT_STRENGTH * THREE.MathUtils.clamp(radius / flash.radius, 0, 1) };
      }).filter(light => light.radius > .02);
      return [...flashLights, ...rayLights];
    },
    update(enabled: boolean, time: number, radius: number, reach: number, outline: Vec[], darkAt: (position: Vec) => boolean, quiet: boolean, torch?: { pos: Vec; fuel: number }) {
    root.visible = enabled;
    if (!enabled) { approach = undefined; flashes = []; rays = []; return; }
    eyes.forEach(({ sprite, width }, i) => {
      const angle = i * 2.39996 + .43;
      const distance = reach + 2.5 + (i * 3.7) % 9;
      const position = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
      const phase = (time + i * 3.17) % (11 + i * 1.13);
      const fade = quiet ? (i % 2 ? .55 : 0)
        : THREE.MathUtils.smoothstep(phase, 1, 2) * (1 - THREE.MathUtils.smoothstep(phase, 6, 7.5));
      const blink = quiet ? 1 : 1 - Math.max(0, 1 - Math.abs(phase - 4.7) / .14);
      sprite.visible = fade > .01 && darkAt(position);
      sprite.material.opacity = fade;
      sprite.position.set(position.x, .65 + (i % 3) * .33, position.y);
      sprite.scale.set(width, width * .5 * Math.max(.04, blink), 1);
    });

    // A single figure passes the penumbra at a time, with a longer pause between passes.
    const cycle = Math.floor(time / 8);
    const progress = (time - cycle * 8 - 2) / 1.35;
    shadow.visible = false;
    if (!quiet && progress > 0 && progress < 1) {
      const along = ((cycle * .618 + progress * .085) % 1) * outline.length;
      const i = Math.floor(along), from = outline[i], to = outline[(i + 1) % outline.length];
      const offset = along - i;
      const at = { x: radius * 1.014 * THREE.MathUtils.lerp(from.x, to.x, offset), y: radius * 1.014 * THREE.MathUtils.lerp(from.y, to.y, offset) };
      shadow.visible = darkAt(at);
      shadow.position.set(at.x, .95, at.y);
      shadow.material.opacity = Math.sin(Math.PI * progress) * .78;
    }

    startled.forEach(sprite => { sprite.visible = false; });
    flashes = flashes.filter(flash => time - flash.born < FLASH_SECONDS);
    flashes.forEach((flash, i) => {
      const sprite = startled[i], age = time - flash.born, progress = THREE.MathUtils.clamp(age / FLASH_SECONDS, 0, 1);
      const escape = THREE.MathUtils.clamp(progress + .035 * Math.sin(progress * 22), 0, 1);
      const start = flash.radius * .42, travel = quiet ? 0 : flash.radius * .84 * escape * escape;
      const distance = start + travel;
      const at = { x: flash.at.x + Math.cos(flash.direction) * distance, y: flash.at.y + Math.sin(flash.direction) * distance };
      const revealed = flashRadius(flash, time) > start * .7;
      sprite.visible = revealed && darkAt(at);
      sprite.position.set(at.x, 1.48 + (quiet ? 0 : .16 * Math.sin(progress * Math.PI * 5)), at.y);
      sprite.scale.set((Math.cos(flash.direction) < 0 ? -1 : 1) * (1.72 - progress * .16), 3.15 + progress * .24, 1);
      sprite.material.rotation = quiet ? 0 : (Math.cos(flash.direction) < 0 ? -.21 : .21) * Math.sin(Math.PI * progress);
      sprite.material.opacity = Math.sin(Math.PI * Math.min(1, progress * 1.18)) * (1 - THREE.MathUtils.smoothstep(progress, .58, 1)) * .88;
    });

    rushing.visible = false;
    if (!torch || torch.fuel >= 5 || torch.fuel <= 0) { approach = undefined; return; }
    const elapsed = 5 - torch.fuel;
    const wave = Math.floor(elapsed / 2.4);
    const t = (elapsed - wave * 2.4) / 1.65;
    if (t >= 1) return;
    const near = torchRadius(torch.fuel) + .35;
    const far = 6.8;
    const point = (direction: number, distance: number) => ({
      x: torch.pos.x + Math.cos(direction) * distance,
      y: torch.pos.y + Math.sin(direction) * distance,
    });
    if (approach?.wave !== wave) {
      const outward = Math.atan2(torch.pos.y, torch.pos.x);
      const side = wave % 2 ? -1 : 1;
      const direction = [side * 1.25, -side * 1.25, side * .6, -side * .6, 0, Math.PI]
        .map(offset => outward + offset)
        .find(angle => [near, (near + far) / 2, far].every(distance => darkAt(point(angle, distance))));
      if (direction === undefined) return;
      approach = { wave, direction };
    }
    const advance = quiet ? 0 : t * (.65 + .35 * t);
    const at = point(approach.direction, THREE.MathUtils.lerp(far, near, advance));
    rushing.visible = darkAt(at);
    rushing.position.set(at.x, .8 + (quiet ? 0 : .12 * Math.abs(Math.sin(t * 14))), at.y);
    rushing.scale.set(1.05 + advance * .3, .5 + advance * .12, 1);
    rushing.material.opacity = THREE.MathUtils.smoothstep(t, 0, .13) * (1 - THREE.MathUtils.smoothstep(t, .76, 1));
  } };
}

type Shore = {
  uSdf: { value: THREE.DataTexture };
  uSpan: { value: number };
  uR: { value: number };
};

function hearthRadiusTexture(arena: ArenaId) {
  const samples = 1024;
  const data = new Uint8Array(samples * 4);
  const { outline: [outer], reach } = SHAPES[arena];
  // Trace the outer contour so the same curve fits each arena as it shrinks.
  for (let i = 0; i < samples; i++) {
    const angle = (i + .5) / samples * Math.PI * 2;
    const x = Math.cos(angle), y = Math.sin(angle);
    let radius = arena === 'circle' ? 1 : 0;
    if (arena !== 'circle') for (let j = 0; j < outer.length; j++) {
      const a = outer[j], b = outer[(j + 1) % outer.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const det = x * dy - y * dx;
      if (Math.abs(det) < 1e-8) continue;
      const along = (a.x * y - a.y * x) / det;
      if (along >= 0 && along <= 1) radius = Math.max(radius, (a.x * dy - a.y * dx) / det);
    }
    const packed = Math.round((radius || reach) * 65535 / 2);
    data[i * 4] = packed >> 8;
    data[i * 4 + 1] = packed & 255;
  }
  const texture = new THREE.DataTexture(data, samples, 1);
  texture.wrapS = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function hazardVignette(camera: THREE.PerspectiveCamera, shore: Shore) {
  const lamps = Array.from({ length: HAZARD_LIGHT_SLOTS }, () => new THREE.Vector4());
  const gusts = Array.from({ length: GUST_SLOTS }, () => new THREE.Vector4());
  const gustStyle = Array.from({ length: GUST_SLOTS }, () => new THREE.Vector2());
  const radii = new Map<ArenaId, THREE.DataTexture>();
  const material = new THREE.ShaderMaterial({
    transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      ...shore, lamps: { value: lamps },
      hearthRadii: { value: null as THREE.DataTexture | null },
      lampCount: { value: 0 },
      whiteout: { value: false },
      gusts: { value: gusts }, gustStyle: { value: gustStyle },
      invProjection: { value: camera.projectionMatrixInverse }, cameraWorld: { value: camera.matrixWorld },
    },
    vertexShader: `varying vec2 screenAt;
      void main() { screenAt = position.xy; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `varying vec2 screenAt;
      uniform mat4 invProjection, cameraWorld;
      uniform sampler2D uSdf, hearthRadii;
      uniform float uSpan, uR;
      uniform vec4 lamps[${HAZARD_LIGHT_SLOTS}];
      uniform int lampCount;
      uniform bool whiteout;
      uniform vec4 gusts[${GUST_SLOTS}];
      uniform vec2 gustStyle[${GUST_SLOTS}];
      float dimSegment(float t, float drop, float startSlope, float endSlope) {
        return drop * smoothstep(0., 1., t)
             + t * (1. - t) * mix(startSlope, -endSlope, t);
      }
      float hearthDim(float progress) {
        // Match the slopes at both joins so the gradient keeps moving through them.
        if (progress < .5) return dimSegment(progress * 2., .25, 0., .4);
        if (progress < .75) return .25 + dimSegment((progress - .5) * 4., .50, .20, .325);
        return .75 + dimSegment(min((progress - .75) * 4., 1.), .25, .325, 0.);
      }
      float hearthShade(vec2 at, float edge) {
        float turn = atan(at.y, at.x + 1e-8) / 6.2831853;
        vec2 encodedRadius = texture2D(hearthRadii, vec2(turn, .5)).rg;
        float radius = dot(encodedRadius, vec2(512., 2.)) / 257.;
        float progress = length(at) / (uR * radius);
        float dim = hearthDim(progress);
        // Holes and inset shores also fade to black before the torch-lit side.
        return max(dim, 1. - smoothstep(0., .08 * uR, -edge));
      }
      float gustLine(float offset, float width) {
        return 1. - smoothstep(width * .25, width, abs(offset));
      }
      float gustShape(vec2 p, float seed) {
        if (abs(p.x) > 2.8 || abs(p.y) > 1.25) return 0.;
        float spine = .24 * sin(p.x * 1.65 + seed * 3.);
        float y = p.y - spine;
        float tail = smoothstep(-2.8, -1.6, p.x) * (1. - smoothstep(1.35, 2.8, p.x));
        float ribbons = .78 * gustLine(y, .13)
                      + .47 * gustLine(y + .18 + .075 * sin(p.x * 1.8), .095)
                      + .28 * gustLine(y - .16 + .06 * sin(p.x * 2.3), .085);
        vec2 grid = vec2(p.x * 6., y * 8.);
        vec2 cell = floor(grid);
        float dotSeed = fract(sin(dot(cell, vec2(127.1, 311.7)) + seed * 41.) * 43758.5453);
        vec2 speck = fract(grid) - vec2(.22 + .56 * dotSeed, .3 + .4 * fract(dotSeed * 17.));
        float dust = .49 * step(.64, dotSeed) * gustLine(length(speck), .26) * exp(-abs(y) * 3.7);
        if (seed > .46) {
          vec2 curl = p - vec2(1.62, .36);
          float turn = atan(curl.y, curl.x + 1e-6) + 3.141593;
          float arc = smoothstep(.25, 1., turn) * (1. - smoothstep(5.2, 6.2, turn));
          ribbons = max(ribbons, .68 * arc * gustLine(length(curl) - (.095 + .066 * turn), .085));
        }
        return min(1., (ribbons + dust) * tail);
      }
      vec3 blizzardColor(vec2 at, float edge) {
        vec3 fogColor = vec3(.91, .945, .98);
        if (edge <= 0.) return fogColor;
        float wind = 0.;
        for (int i = 0; i < ${GUST_SLOTS}; i++) {
          if (gustStyle[i].x <= 0.) continue;
          vec2 radial = gusts[i].xy;
          vec2 tangent = vec2(-radial.y, radial.x);
          vec2 gustAt = vec2(dot(at, tangent) - gusts[i].w, dot(at, radial) - uR - gusts[i].z);
          wind = max(wind, gustStyle[i].x * gustShape(gustAt, gustStyle[i].y));
        }
        return mix(fogColor, vec3(1.), wind * smoothstep(0., .45, edge * uR));
      }
      void main() {
        vec4 projected = invProjection * vec4(screenAt, 1., 1.);
        vec3 ray = (cameraWorld * vec4(projected.xyz / projected.w, 0.)).xyz;
        vec3 eye = cameraWorld[3].xyz;
        float t = -eye.y / ray.y;
        if (t <= 0.) { gl_FragColor = whiteout ? vec4(vec3(.94, .97, .99) * .9, .9) : vec4(0., 0., 0., 1.); return; }
        vec2 at = (eye + ray * t).xz;
        if (whiteout) {
          float edge = length(at) / uR - 1.;
          float fog = .9 * smoothstep(-.14, ${BLIZZARD_WHITEOUT_DEPTH}, edge);
          gl_FragColor = vec4(blizzardColor(at, edge) * fog, fog);
          return;
        }
        vec2 uv = (at / uR + uSpan) / (2. * uSpan);
        float edge = (texture2D(uSdf, uv).r * 2. - 1.) * .3 * uR;
        float shade = hearthShade(at, edge);
        float torchShade = 1.;
        float torchWarmth = 0.;
        for (int i = 0; i < ${HAZARD_LIGHT_SLOTS}; i++) {
          if (i >= lampCount) break;
          vec4 lamp = lamps[i];
          float distanceToLamp = length(at - lamp.xy);
          float softReveal = 1. - smoothstep(0., 1., distanceToLamp / lamp.z);
          float lampShade = 1. - softReveal * lamp.w;
          torchShade = min(torchShade, lampShade);
          torchWarmth = max(torchWarmth, (1. - smoothstep(.12, .88, distanceToLamp / lamp.z)) * lamp.w);
        }
        float torchDim = mix(hearthDim(.65), 1., torchShade);
        float darkness = min(shade, torchDim);
        float hearthWarmth = 1. - smoothstep(.25, max(.35, min(2.8, uR * .58)), length(at));
        float warmth = max(.17 * hearthWarmth, .14 * torchWarmth);
        // Premultiplied blending adds the tint without weakening the visibility mask.
        gl_FragColor = vec4(vec3(1., .43, .10) * warmth * (1. - darkness), darkness);
      }`,
  });
  material.allowOverride = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = 'Darkness_Safe_Light_Vignette';
  mesh.frustumCulled = false;
  mesh.renderOrder = 10001;
  mesh.visible = false;
  return {
    mesh,
    update(mode: 'ice' | 'darkness' | null, arena: ArenaId, lights: { pos: Vec; radius: number; strength?: number }[], time: number) {
      mesh.visible = mode !== null;
      material.uniforms.whiteout.value = mode === 'ice';
      if (mode === 'ice') for (let i = 0; i < GUST_SLOTS; i++) {
        const interval = 7.3 + i * 2.1;
        const clock = time + 1.85 + i * 2.7;
        const cycle = Math.floor(clock / interval);
        const seed = 4 + cycle * 13.71 + i * 33.15;
        const duration = 2.2 + gustHash(seed + 2) * .8;
        const age = clock % interval - .65 - gustHash(seed + 1) * 1.65;
        const progress = THREE.MathUtils.clamp(age / duration, 0, 1);
        const fade = THREE.MathUtils.smoothstep(progress, 0, .2) * (1 - THREE.MathUtils.smoothstep(progress, .66, 1));
        const angle = (i + gustHash(seed + 3)) * Math.PI * 2 / GUST_SLOTS;
        gusts[i].set(Math.cos(angle), Math.sin(angle), 1.55 + 1.9 * gustHash(seed + 4), (progress - .5) * 5.5);
        gustStyle[i].set(fade, gustHash(seed + 5));
      }
      mesh.name = mode === 'ice' ? 'Blizzard_Whiteout' : 'Darkness_Safe_Light_Vignette';
      if (mode !== 'darkness') return;
      let radius = radii.get(arena);
      if (!radius) {
        radius = hearthRadiusTexture(arena);
        radii.set(arena, radius);
      }
      material.uniforms.hearthRadii.value = radius;
      material.uniforms.lampCount.value = Math.min(lamps.length, lights.length);
      lights.slice(0, lamps.length).forEach((light, i) => lamps[i].set(light.pos.x, light.pos.y, light.radius, light.strength ?? 1));
    },
  };
}
