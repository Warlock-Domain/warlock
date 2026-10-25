import {afterEach,describe,expect,it,vi} from 'vitest';
import {setCastMode,setKey,setSlotMode} from '../src/client/keys.ts';
import type {InputHandlers} from '../src/client/input.ts';
afterEach(()=>vi.unstubAllGlobals());
describe('Inelegant Solution: click selection',()=>{
 it.each(['quick','release','click'] as const)('requires a click and retains invalid selection in %s mode',async mode=>{
  type Fn=(e:Record<string,unknown>)=>void;
  const win=new Map<string,Fn[]>(),ce=new Map<string,Fn[]>();
  const listen=(m:Map<string,Fn[]>)=>(n:string,f:Fn)=>m.set(n,[...(m.get(n)??[]),f]);
  const send=(m:Map<string,Fn[]>,n:string,d:Record<string,unknown>)=>m.get(n)?.forEach(f=>f({preventDefault(){},target:{tagName:'CANVAS'},...d}));
  vi.stubGlobal('addEventListener',listen(win));vi.stubGlobal('innerWidth',800);vi.stubGlobal('innerHeight',600);
  const {createInput}=await import('../src/client/input.ts');const cast=vi.fn((_spell: string,_at: {x:number;y:number})=>false);
  const h:InputHandlers={pick:()=>({x:3,y:0}),move(){},stop(){},cast,center(){},zoom(){},pan(){},armedChanged(){},preview(){},padRange(){},me:()=>({x:0,y:0}),aim(){}};
  const i=createInput({addEventListener:listen(ce)} as unknown as HTMLCanvasElement,h);i.setEnabled(true);setSlotMode(false);setKey('sniper','KeyQ');setCastMode(mode);
  send(win,'keydown',{code:'KeyQ',repeat:false});send(win,'keyup',{code:'KeyQ'});expect(cast).not.toHaveBeenCalled();
  const click=()=>send(ce,'pointerdown',{button:0,clientX:3,clientY:0,pointerType:'mouse'});
  click();expect(cast).toHaveBeenCalledTimes(1);cast.mockReturnValue(true);click();expect(cast).toHaveBeenCalledTimes(2);click();expect(cast).toHaveBeenCalledTimes(2);
  cast.mockClear();cast.mockReturnValue(true);setKey('fireball','KeyF');
  send(win,'keydown',{code:'KeyQ',repeat:false});
  send(win,'keydown',{code:'KeyF',repeat:false});send(win,'keyup',{code:'KeyF'});click();
  expect(cast.mock.calls.every(call=>call[0]!=='sniper')).toBe(true);
  expect(cast).toHaveBeenCalledWith('fireball',{x:3,y:0});i.setEnabled(false);
 });
});
