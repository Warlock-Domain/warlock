// Gesto próprio de invocação: reaproveita KayKit, comprimido para o preparo real do ataque.
import type { AnimationClip, AnimationAction } from 'three';
import { BASIC_ATTACK } from '../shared/constants.ts';

export function createAttackClip(source: AnimationClip): AnimationClip {
  const clip = source.clone();
  clip.name = 'Attack_Invoke';
  for (const track of clip.tracks) for (let i = 0; i < track.times.length; i++) track.times[i] *= BASIC_ATTACK.windup / source.duration;
  clip.duration = BASIC_ATTACK.windup;
  return clip;
}

export function playAnimation(m: {current:string;actions:Record<string,AnimationAction>},name:string,fade=.15) {
  if(m.current===name || !m.actions[name]) return;
  const previous=m.actions[m.current];
  // A held pose must not keep blending into the walking skeleton.
  if(m.current==='Attack_Invoke' && previous?.paused) previous.stop();
  else previous?.fadeOut(fade);
  m.actions[name].reset().fadeIn(fade).play();
  m.current=name;
}
