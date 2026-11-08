import * as T from 'three';
import { HEAL_FX } from './heal-fx.ts';

export function createHealTargetFx(texture: T.Texture) {
  const root = new T.Group(); root.name = 'Heal_Target'; root.visible = false;
  const geometry = new T.TorusGeometry(.58, .022, 5, 40);
  const rings = [0, 1].map(() => {
    const ring = new T.Mesh(geometry, new T.MeshBasicMaterial({ color: HEAL_FX.color, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; root.add(ring); return ring;
  });
  const glow = new T.Sprite(new T.SpriteMaterial({ map: texture, color: HEAL_FX.color, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  glow.position.y = .95; glow.scale.setScalar(1.25); root.add(glow);
  const sparks = Array.from({ length: 4 }, () => {
    const spark = new T.Sprite(new T.SpriteMaterial({ map: texture, color: HEAL_FX.glow, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    spark.scale.setScalar(.22); root.add(spark); return spark;
  });
  return {
    root,
    update(until: number, now: number, visible: boolean, reduced: boolean) {
      const left = Math.max(0, Math.min(1, (until - now) / HEAL_FX.seconds));
      root.visible = visible && left > 0;
      if (!root.visible) return;
      const progress = 1 - left, fade = Math.min(1, left * 4);
      glow.material.opacity = .38 * fade;
      for (const [i, ring] of rings.entries()) {
        ring.position.y = reduced ? .25 + i * .85 : .12 + 1.5 * Math.min(1, progress + i * .18);
        ring.scale.setScalar(reduced ? 1 : 1 + .12 * Math.sin(progress * Math.PI));
        ring.material.opacity = (reduced ? .35 : .65) * fade;
      }
      for (const [i, spark] of sparks.entries()) {
        spark.visible = !reduced;
        if (reduced) continue;
        const phase = (progress + i / sparks.length) % 1, angle = i * Math.PI / 2 + progress * 1.2;
        spark.position.set(Math.cos(angle) * .52, .2 + phase * 1.6, Math.sin(angle) * .52);
        spark.material.opacity = .8 * Math.sin(phase * Math.PI) * fade;
      }
    },
    dispose() {
      root.removeFromParent(); geometry.dispose();
      for (const ring of rings) ring.material.dispose();
      for (const sprite of [glow, ...sparks]) sprite.material.dispose();
      root.clear();
    },
  };
}
