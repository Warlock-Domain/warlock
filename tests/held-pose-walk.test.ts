import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {playAnimation} from '../src/client/attack-pose.ts';

function rig(){
  const model=new THREE.Object3D(),mixer=new THREE.AnimationMixer(model);
  const clip=(name:string,values:number[])=>new THREE.AnimationClip(name,1,[new THREE.NumberKeyframeTrack('.position[x]',[0,.5,1],values)]);
  const actions={Attack_Invoke:mixer.clipAction(clip('Attack_Invoke',[0,5,10])),Running_A:mixer.clipAction(clip('Running_A',[0,1,0])),Idle:mixer.clipAction(clip('Idle',[0,0,0])),Spellcast_Shoot:mixer.clipAction(clip('Spellcast_Shoot',[0,2,0]))};
  const m={current:'Attack_Invoke',actions};
  actions.Attack_Invoke.play();actions.Attack_Invoke.paused=true;actions.Attack_Invoke.time=.8;mixer.update(0);
  return{m,model,mixer};
}
describe('returning to walking from a held pose',()=>{
  it.each(['Running_A','Idle','Spellcast_Shoot'])('immediately removes the held invocation on entering %s',name=>{
    const {m,mixer}=rig();playAnimation(m,name);mixer.update(1/60);
    expect(m.actions.Attack_Invoke.isScheduled()).toBe(false);
    expect(m.actions.Attack_Invoke.paused).toBe(false);
    expect(m.actions[name as keyof typeof m.actions].isRunning()).toBe(true);
  });
  it('resumes walking without residual pose weight after repeated cancels',()=>{
    const {m,mixer,model}=rig();
    for(let i=0;i<4;i++){
      playAnimation(m,'Running_A');mixer.update(.25);expect(model.position.x).toBeCloseTo(.5);
      playAnimation(m,'Attack_Invoke');m.actions.Attack_Invoke.paused=true;m.actions.Attack_Invoke.time=.8;mixer.update(.2);
    }
    playAnimation(m,'Running_A');mixer.update(.25);const before=model.position.x;mixer.update(.2);
    expect(model.position.x).not.toBe(before);expect(m.actions.Attack_Invoke.isScheduled()).toBe(false);
  });
  it('holds the charging pose and does not restart walking every frame',()=>{
    const {m,mixer}=rig();playAnimation(m,'Attack_Invoke');expect(m.actions.Attack_Invoke.paused).toBe(true);
    playAnimation(m,'Running_A');mixer.update(.2);const time=m.actions.Running_A.time;
    playAnimation(m,'Running_A');expect(m.actions.Running_A.time).toBe(time);
  });
});
