import * as THREE from 'three';
import { ABYSS, DARKNESS, hasWorldHearth, type WorldEnd } from '../shared/world-end.ts';
import type { HazardView } from '../shared/snapshot.ts';
import type { Vec } from '../shared/vec.ts';

export function snowCover(amount: { value: number }, hearthHeat: { value: number }) {
  const covered = new WeakSet<THREE.Material>();
  const apply = (material: THREE.Material, heatedFloor: boolean) => {
    if (covered.has(material)) return;
    covered.add(material);
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.customProgramCacheKey = () => key + (heatedFloor ? ':world-snow-hearth' : ':world-snow');
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.uSnow = amount;
      if (heatedFloor) shader.uniforms.uHearthHeat = hearthHeat;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSnowAt;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 snowAt = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            snowAt = instanceMatrix * snowAt;
          #endif
          vSnowAt = (modelMatrix * snowAt).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vSnowAt;
          uniform float uSnow;
          ${heatedFloor ? 'uniform float uHearthHeat;' : ''}
          float frostHash(vec2 cell) {
            return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
          }
          float frostNoise(vec2 at) {
            vec2 i = floor(at), f = fract(at);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(frostHash(i), frostHash(i + vec2(1, 0)), f.x),
                       mix(frostHash(i + vec2(0, 1)), frostHash(i + vec2(1)), f.x), f.y);
          }`)
        .replace('#include <opaque_fragment>', `
          if (uSnow > 0.0) {
            vec3 nSnow = normalize(cross(dFdx(vSnowAt), dFdy(vSnowAt)));
            vec2 patchAt = vSnowAt.xz * 1.7 + vSnowAt.y * vec2(.83, 1.29);
            float ground = 1. - smoothstep(.03, .14, abs(vSnowAt.y));
            float coverage = frostNoise(patchAt * .42);
            // Break up the ground patches without repeating the grid of the base noise.
            vec2 groundDetail = mat2(.8, .6, -.6, .8) * patchAt * 1.35;
            float fine = frostNoise(mix(patchAt * 5., groundDetail, ground));
            float snowPatch = smoothstep(
              mix(.32, .25, ground), mix(.66, .73, ground), mix(coverage, fine, mix(.22, .12, ground)));
            float cap = smoothstep(.32, .86, nSnow.y + (coverage - .5) * .3);
            vec3 frost = vec3(.54, .68, .81) * (.87 + .15 * coverage + mix(.06, .025, ground) * fine);
            float dusting = ground * (1. - snowPatch) * (.09 + .07 * fine);
            float snow = uSnow * cap * (.06 + .8 * snowPatch + dusting);
            ${heatedFloor ? `
            float heat = uHearthHeat;
            float meltRadius = .42 + 1.78 * heat;
            float distanceFromFire = length(vSnowAt.xz * vec2(1.0, .88)) + (coverage - .5) * .72 + (fine - .5) * .2;
            float thaw = (1.0 - smoothstep(meltRadius * .67, meltRadius, distanceFromFire)) * smoothstep(.14, .74, heat);
            snow *= 1.0 - thaw;
            outgoingLight *= mix(vec3(1.0), vec3(.61, .66, .71), thaw * .82);
            ` : ''}
            outgoingLight = mix(outgoingLight, frost, snow);
          }
          #include <opaque_fragment>`);
    };
    material.needsUpdate = true;
  };
  return (root: THREE.Object3D, heatedFloor?: THREE.Material) => root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) apply(material, material === heatedFloor);
    }
  });
}

export function createWorldHearth(flames: THREE.Texture[]) {
  const root = new THREE.Group();
  root.name = 'World_End_Hearth';
  root.visible = false;
  const fire = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flames[0], color: '#ffb563', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flames[0], color: '#fff0bc', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  fire.material.color.multiplyScalar(2.6);
  core.material.color.multiplyScalar(3);
  // The central light source remains visible through its own ground-projected vignette.
  fire.renderOrder = core.renderOrder = 10002;
  const tongues = [-1, 1].map(side => {
    const sprite = new THREE.Sprite(fire.material.clone());
    sprite.material.color.set('#ff994a').multiplyScalar(2);
    sprite.renderOrder = 10002;
    root.add(sprite);
    return { sprite, side };
  });
  const wood = new THREE.Group();
  const logGeometry = new THREE.CylinderGeometry(.07, .1, .65, 7);
  const logMaterial = new THREE.MeshStandardMaterial({ color: '#4c3028', roughness: .95 });
  for (let i = 0; i < 3; i++) {
    const layer = new THREE.Group();
    const log = new THREE.Mesh(logGeometry, logMaterial);
    log.rotation.z = Math.PI / 2;
    layer.rotation.y = i * Math.PI / 3;
    layer.position.y = .09 + i * .055;
    layer.add(log);
    wood.add(layer);
  }
  const light = new THREE.PointLight('#ffab5c', 12, 8, 1.65);
  light.position.y = .75;
  const stones = new THREE.DodecahedronGeometry(.15, 0);
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#565154', flatShading: true, roughness: .95 });
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    const stone = new THREE.Mesh(stones, stoneMaterial);
    stone.position.set(Math.cos(a) * .46, .065, Math.sin(a) * .46);
    stone.rotation.set(i * 2, i, i * .5);
    wood.add(stone);
  }
  root.add(wood, fire, core, light);
  return { root, update(kind: WorldEnd, radius: number, startRadius: number, time: number, quiet: boolean) {
    root.visible = hasWorldHearth(kind) && radius > .05;
    if (!root.visible) return 0;
    const strength = THREE.MathUtils.clamp(radius / Math.max(.01, startRadius), 0, 1);
    const size = .2 + 4.1 * Math.pow(strength, 1.15);
    const flicker = quiet ? 1 : 1 + .045 * Math.sin(time * 9.3) + .025 * Math.sin(time * 16.7);
    fire.material.map = flames[quiet ? 0 : Math.floor(time * 10) % flames.length];
    fire.scale.set(size * .66, size * flicker, 1);
    fire.position.y = .18 + size * flicker * .44;
    core.material.map = flames[quiet ? 0 : Math.floor(time * 10 + 2) % flames.length];
    core.scale.set(size * .34, size * .6, 1);
    core.position.y = .18 + size * .27;
    for (const { sprite, side } of tongues) {
      const sway = quiet ? 0 : Math.sin(time * 5.1 + side) * .06;
      const height = size * (.53 + side * .035);
      sprite.material.map = flames[quiet ? 0 : Math.floor(time * 12 + side + flames.length) % flames.length];
      sprite.material.opacity = strength * .8;
      sprite.scale.set(size * .36, height * flicker, 1);
      sprite.position.set(side * size * (.15 + sway), .18 + height * .44, side * .05);
    }
    // In Darkness the hearth reveals the entire safe area through the vignette.
    light.visible = kind === 'ice';
    light.intensity = 19 * strength * flicker;
    light.distance = 3 + 6 * strength;
    return strength;
  } };
}

type HazardActor = HazardView & {
  pos: Vec; alive: boolean; status: number; local?: boolean; relation?: string; illusion?: boolean;
};

export function createHazardMarkers(flame: THREE.Texture, glow: THREE.Texture) {
  const root = new THREE.Group();
  const ringGeometry = new THREE.RingGeometry(ABYSS.reach - .055, ABYSS.reach, 40).rotateX(-Math.PI / 2);
  const progressGeometry = new THREE.CircleGeometry(ABYSS.reach, 40).rotateX(-Math.PI / 2);
  const monsterGeometry = new THREE.SphereGeometry(1, 8, 6);
  const monsterMaterial = new THREE.MeshBasicMaterial({ color: '#0b0713' });
  const slots: ReturnType<typeof slot>[] = [];
  function slot() {
    const g = new THREE.Group();
    const torch = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame, color: '#ffba72', blending: THREE.AdditiveBlending, depthWrite: false }));
    const monster = new THREE.Group();
    for (const [x, y, sx, sy, sz, tilt] of [[0, .72, .33, .53, .28, 0], [-.25, .93, .10, .36, .12, -.53], [.25, .93, .10, .36, .12, .53]]) {
      const part = new THREE.Mesh(monsterGeometry, monsterMaterial);
      part.position.set(x, y, 0);
      part.scale.set(sx, sy, sz);
      part.rotation.z = tilt;
      monster.add(part);
    }
    for (const x of [-.13, .13]) {
      const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#f55268', blending: THREE.AdditiveBlending, depthWrite: false }));
      eye.position.set(x, .90, .27);
      eye.scale.set(.22, .12, 1);
      monster.add(eye);
    }
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: '#80f4d3', transparent: true, opacity: .94, depthWrite: false }));
    const fill = new THREE.Mesh(progressGeometry, new THREE.MeshBasicMaterial({ color: '#80f4d3', transparent: true, opacity: .23, depthWrite: false }));
    ring.position.y = fill.position.y = .06;
    g.add(torch, monster, ring, fill);
    root.add(g);
    return { g, torch, monster, ring, fill };
  }
  return { root, update(kind: WorldEnd, actors: HazardActor[], inDark: (pos: Vec) => boolean) {
    root.visible = kind === 'darkness' || kind === 'abyss';
    if (!root.visible) return;
    while (slots.length < actors.length) slots.push(slot());
    slots.forEach(({ g, torch, monster, ring, fill }, i) => {
      const actor = actors[i];
      g.visible = !!actor && actor.alive && !(actor.status & 2048) && !actor.illusion;
      if (!g.visible) return;
      const outside = kind === 'darkness' && inDark(actor.pos);
      const fuel = (actor.torchLeft ?? 0) / DARKNESS.fuel;
      torch.visible = kind === 'darkness' && fuel > 0;
      const size = .29 + fuel * .44;
      torch.scale.set(size * .7, size, 1);
      torch.position.set(actor.pos.x + .39, 1.08, actor.pos.y);
      const threat = outside && (actor.darkLeft ?? 0) > 0;
      monster.visible = threat;
      if (threat) monster.position.set(actor.pos.x + (actor.darkLeft ?? 0) * .24, 0, actor.pos.y - .64);
      const ledge = kind === 'abyss' && (actor.local || actor.relation === 'ally') ? actor.ledge : undefined;
      ring.visible = fill.visible = !!ledge;
      if (ledge) {
        ring.position.set(ledge.spot.x, .16, ledge.spot.y);
        fill.position.copy(ring.position);
        fill.scale.setScalar(Math.max(.18, ledge.progress / ABYSS.rescue));
      }
    });
  } };
}
