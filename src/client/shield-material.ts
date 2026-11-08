import * as T from 'three';

export function createShieldMaterial() {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { strength: { value: 1 }, clock: { value: 0 }, still: { value: 0 }, impactAt: { value: -99 }, impactAge: { value: 99 }, impactDirection: { value: new T.Vector3(0, 0, 1) }, blue: { value: new T.Color('#68b9f0') }, rim: { value: new T.Color('#d6f5ff') } },
    vertexShader: `
      varying vec3 viewNormal;
      varying vec3 toEye;
      varying vec3 localPoint;
      void main() {
        vec4 point = modelViewMatrix * vec4(position, 1.0);
        viewNormal = normalize(normalMatrix * normal);
        toEye = -point.xyz;
        localPoint = position;
        gl_Position = projectionMatrix * point;
      }
    `,
    fragmentShader: `
      uniform float strength;
      uniform float clock;
      uniform float still;
      uniform float impactAge;
      uniform vec3 impactDirection;
      uniform vec3 blue;
      uniform vec3 rim;
      varying vec3 viewNormal;
      varying vec3 toEye;
      varying vec3 localPoint;
      void main() {
        vec3 normal = normalize(viewNormal), eye = normalize(toEye);
        float edge = pow(1.0 - max(0.0, dot(normal, eye)), 2.4);
        vec3 light = normalize(vec3(-0.5, 0.8, 0.65));
        float reflection = pow(max(0.0, dot(normal, normalize(light + eye))), 36.0);
        float latitude = (localPoint.y + 0.85) / 1.7;
        float wave = (1.0 - still) * pow(max(0.0, 0.5 + 0.5 * sin(latitude * 12.0 - clock * 2.0)), 8.0);
        float angle = acos(clamp(dot(normalize(localPoint), impactDirection), -1.0, 1.0));
        float age = clamp(impactAge, 0.0, 0.5);
        float ringRadius = mix(0.10 + age * 2.0, 0.18, still);
        float band = exp(-pow((angle - ringRadius) / 0.065, 2.0));
        float impact = (band * 0.8 + exp(-angle * angle * 32.0) * 0.4) * (1.0 - age * 2.0);
        float alpha = min(0.95, (0.025 + edge * 0.72 + reflection * 0.16 + wave * edge * 0.04) * strength + impact * 0.7);
        vec3 color = mix(blue, rim, min(1.0, edge + reflection * 0.65 + impact));
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

export function updateShieldMaterial(material: T.ShaderMaterial, opacity: number, now: number, reduced: boolean) {
  material.uniforms.strength.value = Math.max(0, Math.min(1, opacity / .4));
  material.uniforms.clock.value = reduced ? 0 : now;
  material.uniforms.still.value = reduced ? 1 : 0;
  material.uniforms.impactAge.value = now - material.uniforms.impactAt.value;
}

export function shieldImpact(material: T.ShaderMaterial, localPoint: T.Vector3, now: number) {
  if (localPoint.lengthSq() < .0001) return;
  material.uniforms.impactDirection.value.copy(localPoint).normalize();
  material.uniforms.impactAt.value = now;
}
