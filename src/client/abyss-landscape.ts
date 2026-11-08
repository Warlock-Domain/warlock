import * as THREE from 'three';
import { SHAPES, type ArenaId } from '../shared/arena.ts';
import { mountainRockGeometry } from './mountain-rock.ts';

const VALLEY_Y = -13;
const CASCADES = [{ side: -1, z: 6.1, height: 5.6 }, { side: 1, z: -9.1, height: 3.65 }];
const CASCADE_START = -.65, CASCADE_RUN = 2.1;
const RIVER_SPREAD = 18.6;
const VALLEY_SHELVES = [
  [-32, -17, 5.7, 3.9, 3.2], [-27, -15, 6.1, 3.0, 3.7], [-23.8, -13, 4.1, 1.5, 2.7],
  [-13, -24, 5.1, 1.8, 2.9], [-8, -23, 6.0, 3.6, 3.5], [-2, -25, 5.0, 2.4, 3.0], [3, -26, 4.6, 1.6, 2.4],
  [25.9, -16, 4.5, 1.8, 3.5], [30.3, -12.9, 6.0, 3.6, 3.2], [34, -8, 4.2, 2.1, 3.6],
  [25.7, 5.4, 4.1, 1.3, 3.5], [30.1, 8.7, 5.8, 2.8, 4.0], [33, 13, 5.0, 2.0, 3.5],
  [-27, 16, 5.6, 2.6, 4.1], [-30.5, 20, 5.0, 1.8, 3.6], [26, 21, 5.8, 2.3, 3.8], [30, 24, 4.9, 1.5, 3.2],
];

function escarpment(arena: ArenaId) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const levels = [
    [1, -.045], [.98, -.95], [1.015, -1.35], [.95, -1.7], [.95, -3.15], [.99, -3.55], [.97, -4.25],
    [1.05, -6.8], [1.13, -7.25], [1.1, -7.95], [1.27, -10.5], [1.39, -11.05], [1.54, VALLEY_Y - .25],
  ];
  const ledge = new THREE.Color('#3a4e46'), wall = new THREE.Color('#303b53'), haze = new THREE.Color('#384e79');
  const tint = new THREE.Color();
  for (const [loop, corners] of SHAPES[arena].outline.entries()) {
    const outline = corners.flatMap((a, i) => {
      const b = corners[(i + 1) % corners.length];
      const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 13);
      return Array.from({ length: count }, (_, j) => ({
        x: THREE.MathUtils.lerp(a.x, b.x, j / count),
        y: THREE.MathUtils.lerp(a.y, b.y, j / count),
      }));
    });
    const start = positions.length / 3;
    for (let j = 0; j < levels.length; j++) {
      const [scale, y] = levels[j];
      for (let i = 0; i < outline.length; i++) {
        const { x, y: z } = outline[i];
        const cut = Math.sin(i * 1.74) * .035 + Math.sin(i * .61) * .04;
        const taper = 1 + (scale - 1 + cut * .7) * Math.min(j, 2) / 2;
        // Widen the solid rock toward the valley, including on the inside of a ring.
        const width = loop === 0 ? taper : 1 / taper;
        const depth = THREE.MathUtils.lerp(width, 1, THREE.MathUtils.smoothstep(-y, 4, 12) * .62);
        positions.push(x * width, y + (j ? Math.sin(i * .79 + j * .8) * .21 : 0), z * depth);
        tint.copy(j === 0 || j === 2 ? ledge : wall).lerp(haze, j / levels.length * .8)
          .multiplyScalar(.92 + .13 * Math.cos(i * .67) + .10 * Math.sin(i * 2.4 + j));
        colors.push(tint.r, tint.g, tint.b);
        if (j) {
          const a = start + (j - 1) * outline.length + i;
          const b = start + (j - 1) * outline.length + (i + 1) % outline.length;
          indices.push(a, b, a + outline.length, b, b + outline.length, a + outline.length);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const worldVertex = `
  varying vec2 at;
  varying vec2 st;
  void main() {
    at = (modelMatrix * vec4(position, 1.0)).xz;
    st = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

function riverX(side: number, z: number) {
  return side * (RIVER_SPREAD + 3.6 * Math.sin(z * .15 + side) + 1.35 * Math.sin(z * .36));
}

export function createAbyssLandscape() {
  const root = new THREE.Group();
  root.name = 'Abyss_Tepui';
  root.visible = false;
  const clock = { value: 0 };
  const cliffMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  cliffMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vValleyHaze;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvValleyHaze = smoothstep(2.0, 12.0, -position.y);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vValleyHaze;')
      .replace('#include <opaque_fragment>', `
        outgoingLight = mix(outgoingLight, vec3(.075, .115, .185), vValleyHaze * .63);
        #include <opaque_fragment>`);
  };
  let shape: ArenaId = 'circle';
  const cliff = new THREE.Mesh(escarpment(shape), cliffMaterial);
  cliff.name = 'Abyss_Escarpment';
  root.add(cliff);
  // Paint the distant relief and both rivers on one plane to keep the valley inexpensive.
  const fallFeet = CASCADES.map(({ side, z }) => {
    const downstream = z + CASCADE_START + CASCADE_RUN;
    return new THREE.Vector2(riverX(side, downstream), downstream);
  });
  const valley = new THREE.Mesh(new THREE.PlaneGeometry(210, 210).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { clock, fallFeet: { value: fallFeet } }, vertexShader: worldVertex,
    fragmentShader: `
      varying vec2 at;
      uniform float clock;
      uniform vec2 fallFeet[2];
      float riverX(float side, float z) {
        return side * (${RIVER_SPREAD} + 3.6 * sin(z * .15 + side) + 1.35 * sin(z * .36));
      }
      float valleyHash(vec2 p) {
        vec3 h = fract(p.xyx * vec3(.1031, .1099, .0973));
        h += dot(h, h.yzx + 19.19);
        return fract((h.x + h.y) * h.z);
      }
      float valleyNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(valleyHash(i), valleyHash(i + vec2(1., 0.)), f.x),
                   mix(valleyHash(i + vec2(0., 1.)), valleyHash(i + vec2(1.)), f.x), f.y);
      }
      float impactMist(vec2 foot, float detail) {
        vec2 offset = at - foot;
        offset.x += (detail - .5) * .7;
        offset.y -= .72 + .22 * sin(clock * .67 + detail * 4.);
        vec2 plume = offset / vec2(1.8, 2.55);
        return (1. - smoothstep(.05, 1., dot(plume, plume))) * (.40 + .20 * detail);
      }
      void main() {
        float d = min(abs(at.x - riverX(-1., at.y)), abs(at.x - riverX(1., at.y)));
        float detail = valleyNoise(at * .36);
        float ridge = valleyNoise(at * .11 + detail * .26) * .82 + detail * .18;
        float shelf = smoothstep(.35, .42, ridge) * .4 + smoothstep(.56, .62, ridge) * .42;
        float strata = sin(ridge * 61.) * .025;
        vec3 ground = mix(vec3(.027, .052, .107), vec3(.082, .126, .169), shelf + strata);
        ground *= .79 + .21 * smoothstep(.6, 2.2, d);
        float water = 1. - smoothstep(.37, .72, d + detail * .20);
        float flow = pow(.5 + .5 * sin(at.y * 1.65 - clock * 2.4 + d * 8. + detail * 2.), 5.);
        vec3 river = vec3(.11, .23, .34) + vec3(.06, .09, .13) * flow;
        vec3 color = mix(ground, river, water);
        float mist = .29 + .14 * sin(at.x * .10 + at.y * .15) * sin(at.y * .19 - at.x * .11);
        color = mix(color, vec3(.17, .25, .40), mist);
        float banks = valleyNoise(at * .085 + vec2(clock * .018, -.8));
        color = mix(color, vec3(.19, .27, .41), smoothstep(.49, .82, banks) * .72);
        float spray = max(impactMist(fallFeet[0], detail), impactMist(fallFeet[1], detail));
        color = mix(color, vec3(.40, .54, .67), spray);
        gl_FragColor = vec4(mix(color, vec3(.029, .05, .095), smoothstep(37., 95., length(at))), 1.);
        #include <colorspace_fragment>
      }`,
  }));
  valley.name = 'Abyss_Miniature_Valley';
  valley.position.y = VALLEY_Y;
  root.add(valley);

  const cascade = new THREE.ShaderMaterial({
    uniforms: { clock }, vertexShader: worldVertex, side: THREE.DoubleSide,
    fragmentShader: `
      varying vec2 st;
      uniform float clock;
      void main() {
        float flow = sin(st.y * 29. - clock * 8. + sin(st.x * 31.) * .9);
        float threads = .5 + .5 * sin(st.x * 54. + st.y * 4.);
        float foam = .3 * smoothstep(.0, .25, flow) + .23 * threads + .4 * smoothstep(.78, 1., st.y);
        vec3 water = mix(vec3(.13, .27, .40), vec3(.57, .74, .87), foam);
        gl_FragColor = vec4(mix(water, vec3(.27, .39, .51), smoothstep(.82, 1., st.y) * .85), 1.);
        #include <colorspace_fragment>
      }`,
  });
  const mesa = mountainRockGeometry(2, .8);
  const strata = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 });
  const foliageMaterial = strata.clone();
  strata.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRidgeAt;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRidgeAt = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRidgeAt;')
      .replace('#include <opaque_fragment>', `
        float height = vRidgeAt.y - (${VALLEY_Y}.0);
        float floorMist = 1.0 - smoothstep(.12, 1.8, height + .25 * sin(vRidgeAt.x * .7 + vRidgeAt.z));
        float distantMist = smoothstep(20.0, 38.0, length(vRidgeAt.xz));
        outgoingLight = mix(outgoingLight, vec3(.10, .15, .23), max(.64 * floorMist, .43 * distantMist));
        #include <opaque_fragment>`);
  };
  const banks = new THREE.InstancedMesh(mesa, strata, CASCADES.length * 3 + VALLEY_SHELVES.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), foliageMaterial, 16);
  const pose = new THREE.Object3D(), color = new THREE.Color();
  const distantRock = new THREE.Color('#405875');
  let bankIndex = 0, crownIndex = 0;
  banks.name = 'Abyss_Valley_Shelves';
  crowns.name = 'Abyss_Valley_Foliage';
  root.add(banks, crowns);
  function placeShelf(x: number, z: number, width: number, rise: number, depth: number, yaw: number, haze: number) {
    const tilt = haze * .13;
    pose.position.set(x, VALLEY_Y + rise / 2 - tilt * width, z);
    pose.scale.set(width, rise, depth);
    pose.rotation.set(tilt * Math.sin(yaw), yaw, tilt * Math.cos(yaw));
    pose.updateMatrix();
    banks.setMatrixAt(bankIndex, pose.matrix);
    banks.setColorAt(bankIndex++, color.copy(distantRock).multiplyScalar(.76 + rise * .055).lerp(hazeRock, haze));
  }
  const hazeRock = new THREE.Color('#526c8a');
  for (const { side, z, height } of CASCADES) {
    const x = riverX(side, z);
    const shelves = [
      [0, -3.10, 4.5, height, 3.1],
      [side * 3.2, -2.5, 2.8, height * .63, 2.8],
      [side * 5.3, -.9, 2.1, height * .35, 2.5],
    ];
    for (const [dx, dz, width, rise, depth] of shelves) {
      placeShelf(x + dx, z + dz, width, rise, depth, side * .3 + dx * .15, 0);
    }
    const foliage = color.set(side === -1 ? '#76628e' : '#5576a5');
    for (let i = 0; i < 8; i++) {
      const [dx, dz, width, rise, depth] = shelves[i < 4 ? 0 : 1];
      const spread = (i % 4 - 1.5) * .45;
      pose.position.set(x + dx + side * width * .40 + spread, VALLEY_Y + rise + .25, z + dz - depth * .36 + Math.sin(i * 1.5) * .68);
      const size = .40 + .12 * Math.sin(i * 2);
      pose.scale.set(size, size * .68, size * .85);
      pose.rotation.set(0, i * 1.2, 0);
      pose.updateMatrix();
      crowns.setMatrixAt(crownIndex, pose.matrix);
      crowns.setColorAt(crownIndex++, foliage);
    }
    const ribbon = new THREE.PlaneGeometry(1.25, 1, 1, 8);
    const position = ribbon.getAttribute('position'), uv = ribbon.getAttribute('uv');
    for (let i = 0; i < position.count; i++) {
      const t = uv.getY(i);
      const downstream = z + CASCADE_START + t * CASCADE_RUN;
      position.setXYZ(i, riverX(side, downstream) + position.getX(i) * (.8 + t * .5),
        VALLEY_Y + .035 + height * (1 - t * t), downstream);
    }
    const fall = new THREE.Mesh(ribbon, cascade);
    fall.name = 'Abyss_Cascade';
    root.add(fall);
  }
  VALLEY_SHELVES.forEach(([x, z, width, rise, depth], i) => {
    placeShelf(x, z, width, rise, depth, .55 + .5 * Math.sin(i * 1.17), .45);
  });

  const silhouette = new THREE.Shape();
  silhouette.moveTo(0, 1);
  for (const [x, z] of [[.21,.38],[.55,.55],[1.38,.82],[1.07,.19],[1.14,-.18],[.65,-.02],[.32,-.23],[.08,-.95],[0,-1.38],[-.16,-.7],[-.32,-.23],[-.65,-.02],[-1.14,-.18],[-1.07,.19],[-1.38,.82],[-.55,.55],[-.21,.38]]) silhouette.lineTo(x, z);
  const dragonShape = new THREE.ShapeGeometry(silhouette).rotateX(-Math.PI / 2);
  const dragonMaterial = new THREE.ShaderMaterial({
    uniforms: { clock }, side: THREE.DoubleSide,
    vertexShader: `
      uniform float clock;
      void main() {
        vec3 p = position;
        p.y += pow(abs(p.x), 1.35) * (.15 + .40 * sin(clock * 4. + modelMatrix[3].x * .12));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `
      void main() {
        gl_FragColor = vec4(.027, .047, .095, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const dragons = [0, 1, 2].map(i => {
    const mesh = new THREE.Mesh(dragonShape, dragonMaterial);
    mesh.name = 'Abyss_Dragon';
    mesh.scale.setScalar(.62 + i * .13);
    root.add(mesh);
    return mesh;
  });
  return { root, update(enabled: boolean, arena: ArenaId, radius: number, now: number, quiet: boolean) {
    root.visible = enabled;
    if (!enabled) return;
    if (shape !== arena) {
      shape = arena;
      cliff.geometry.dispose();
      cliff.geometry = escarpment(shape);
    }
    cliff.scale.set(radius, 1, radius);
    clock.value = quiet ? 0 : now;
    dragons.forEach((mesh, i) => {
      const a = clock.value * (.13 + i * .023) + i * 2.12 + .75;
      const orbit = 19 + i * 4;
      mesh.position.set(Math.cos(a) * orbit, -6.5 - i * 1.95 + Math.sin(a * 2) * .55, Math.sin(a) * orbit * .77);
      mesh.rotation.y = Math.atan2(Math.sin(a), -.77 * Math.cos(a));
    });
  } };
}
