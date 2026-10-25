import {describe,expect,it} from 'vitest';
import {sniperFocusMask,sniperFocusState} from '../src/client/sniper-focus.ts';

describe('Inelegant Solution: personal tension lines',()=>{
  const own={id:'me',alive:true,sniperLeft:3};
  it('follows only the local player aim',()=>{
    expect(sniperFocusState('me',own,true,false)).toEqual({left:3,shot:0});
    expect(sniperFocusState('me',{...own,id:'enemy'},true,false)).toEqual({left:0,shot:0});
  });
  it.each(['dead','spectator','replay','lobby'] as const)('does not appear for %s',reason=>{
    const caster=reason==='spectator'?undefined:{...own,alive:reason!=='dead'};
    expect(sniperFocusState('me',caster,reason!=='lobby',reason==='replay',.1)).toEqual({left:0,shot:0});
  });
  it('a spectator following the caster sees the same time and pulse',()=>{
    const target={...own,id:'caster'};
    expect(sniperFocusState('viewer',target,true,false,.12,'caster')).toEqual({left:3,shot:.5});
    expect(sniperFocusState('viewer',target,true,false,.12,'other')).toEqual({left:0,shot:0});
    expect(sniperFocusState('viewer',target,true,false,.12,null)).toEqual({left:0,shot:0});
    expect(sniperFocusState('viewer',target,true,true,.12,'caster')).toEqual({left:0,shot:0});
  });
  it('cancellation disappears immediately without a fabricated shot pulse',()=>{
    expect(sniperFocusState('me',{...own,sniperLeft:0},true,false)).toEqual({left:0,shot:0});
  });
  it('confirmed pulse ends in 240 ms without flashing the entire screen',()=>{
    expect(sniperFocusState('me',{...own,sniperLeft:0},true,false,0).shot).toBe(1);
    expect(sniperFocusState('me',own,true,false,.12).shot).toBeCloseTo(.5);
    expect(sniperFocusState('me',own,true,false,.24).shot).toBe(0);
    expect(sniperFocusState('me',own,true,false,-1).shot).toBe(0);
  });
  it('mask starts hidden without depth or camera dependence, below blindness',()=>{
    const mesh=sniperFocusMask();expect(mesh.visible).toBe(false);expect(mesh.frustumCulled).toBe(false);expect(mesh.renderOrder).toBe(9999);
    expect(mesh.material.depthTest).toBe(false);expect(mesh.material.depthWrite).toBe(false);expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.fragmentShader).toContain('smoothstep(.48,.92,radius)');
    expect(mesh.material.uniforms.still.value).toBe(0);mesh.geometry.dispose();mesh.material.dispose();
  });
});
