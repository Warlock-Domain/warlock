import * as T from 'three';

// Bone-attached cues follow the animated hands; the texture remains owned by the scene.
export function createCastingFx(model: T.Object3D, texture: T.Texture, scale: number) {
  const hands = ['l', 'r'].flatMap(side => {
    const bone = model.getObjectByName(T.PropertyBinding.sanitizeNodeName(`hand.${side}`));
    if (!bone) return [];
    const glow = new T.Sprite(new T.SpriteMaterial({ map: texture, color: '#bfa4ff', transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    glow.visible = false; bone.add(glow);
    return [glow];
  });
  const torso = model.getObjectByName('spine');
  const offset = new T.Quaternion(), axis = new T.Vector3(1, 0, 0);
  let layered = false, enabled = false, charge = 0, special = false;
  let preparingUntil = -1, preparingSince = -1, releasedAt = -1;
  const color = new T.Color('#bfa4ff');
  const heldColor = new T.Color('#d9d1ff');
  return {
    begin(tint: string, duration: number, now: number) {
      color.set(tint); preparingSince = now; preparingUntil = now + duration;
    },
    release(tint: string, now: number) {
      color.set(tint); preparingUntil = -1; releasedAt = now;
    },
    sync(visible: boolean, held: number, ownPose: boolean) {
      enabled = visible; charge = held; special = ownPose;
      if (!visible) preparingUntil = releasedAt = -1;
    },
    beforeMixer() {
      if (layered && torso) torso.quaternion.multiply(offset.invert());
      layered = false;
    },
    afterMixer(now: number, lite: boolean, reduced: boolean) {
      const preparation = now < preparingUntil ? Math.min(1, (now - preparingSince) / Math.max(.01, preparingUntil - preparingSince)) : 0;
      const release = releasedAt >= 0 ? Math.max(0, 1 - (now - releasedAt) / .28) : 0;
      const strength = enabled ? Math.max(charge, preparation, release) : 0;
      for (const hand of hands) {
        hand.visible = strength > 0;
        if (!hand.visible) continue;
        hand.material.color.copy(charge > 0 ? heldColor : color);
        hand.material.opacity = (lite || reduced ? .35 : .65) * strength;
        hand.scale.setScalar(((lite || reduced ? .30 : .42) + (reduced ? 0 : .22 * release)) / scale);
      }
      // Add a small shoulder anticipation/release over the existing gesture, never over special poses.
      if (torso && enabled && !special && !reduced && !lite) {
        offset.setFromAxisAngle(axis, -.075 * preparation + .10 * release * release);
        torso.quaternion.multiply(offset); layered = true;
      }
    },
    dispose() {
      this.beforeMixer();
      for (const hand of hands) { hand.removeFromParent(); hand.material.dispose(); }
    },
  };
}
