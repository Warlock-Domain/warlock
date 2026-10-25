import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCastMode, setKey, setSlotMode } from '../src/client/keys.ts';
import type { InputHandlers } from '../src/client/input.ts';

afterEach(()=>vi.unstubAllGlobals());
describe('Channeling keyboard and mouse',()=>{
  it.each(['quick','release','click'] as const)('requires an explicit click in %s mode',async mode=>{
    type Fn=(e:Record<string,unknown>)=>void;
    const win=new Map<string,Fn[]>(),canvasEvents=new Map<string,Fn[]>();
    const listen=(map:Map<string,Fn[]>)=>(name:string,fn:Fn)=>map.set(name,[...(map.get(name)??[]),fn]);
    const send=(map:Map<string,Fn[]>,name:string,data:Record<string,unknown>)=>map.get(name)?.forEach(fn=>fn({preventDefault(){},target:{tagName:'CANVAS'},...data}));
    vi.stubGlobal('addEventListener',listen(win)); vi.stubGlobal('innerWidth',800); vi.stubGlobal('innerHeight',600);
    const {createInput}=await import('../src/client/input.ts');
    const channel=vi.fn(()=>true),cast=vi.fn(()=>false),stop=vi.fn(),basic=vi.fn();
    const h:InputHandlers={pick:()=>({x:3,y:0}),move(){},stop,basic,channel,canChannel:()=>true,cast,center(){},zoom(){},pan(){},armedChanged(){},preview(){},padRange(){},me:()=>({x:0,y:0}),aim(){}};
    const canvas={addEventListener:listen(canvasEvents)} as unknown as HTMLCanvasElement;
    const input=createInput(canvas,h);input.setEnabled(true);setSlotMode(false);setKey('basic','KeyA');setKey('fireball','KeyQ');setCastMode(mode);
    const key=(name:string,code:string)=>send(win,name,{code,repeat:false});
    key('keydown','KeyA');key('keydown','KeyQ');key('keyup','KeyQ');key('keyup','KeyA');
    expect(channel).toHaveBeenCalledExactlyOnceWith('fireball');expect(cast).not.toHaveBeenCalled();expect(basic).not.toHaveBeenCalled();
    const click=()=>send(canvasEvents,'pointerdown',{button:0,clientX:3,clientY:0,pointerType:'mouse'});
    click();expect(cast).toHaveBeenCalledTimes(1);
    cast.mockReturnValue(true);click();expect(cast).toHaveBeenCalledTimes(2);
    click();expect(cast).toHaveBeenCalledTimes(2);
    key('keydown','KeyA');key('keydown','KeyQ');key('keyup','KeyA');key('keyup','KeyQ');
    key('keydown','Escape');expect(stop).toHaveBeenCalled();input.setEnabled(false);
  });
});
