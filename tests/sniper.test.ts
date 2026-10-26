import { describe, expect, it } from 'vitest';
import { world, run } from './helpers.ts';
import { stepWorld, type Cmd } from '../src/shared/sim.ts';
import { botCmds } from '../src/shared/bots.ts';
import { CAST_POINT, noSpells, priceOf, spellLevel, spellMax } from '../src/shared/spells.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { sniperTarget } from '../src/shared/sniper-target.ts';
import { demoStep, demoWorld } from '../src/client/demo.ts';
import { spellLevels, spellTip } from '../src/client/tips.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { CELL } from '../src/shared/arena.ts';
import { DT } from '../src/shared/constants.ts';

function setup() {
  const w=world([[0,0],[15,0]],{...noSpells(),sniper:1});
  w.pillars=[];w.runes=[];w.isles=[];w.arenaR=50;w.shrinkAt=Infinity;
  for(const z of w.wizards) {z.regen=0;z.stunLeft=0;}
  return w;
}
const aim:Extract<Cmd,{kind:'cast'}>={id:'p0',kind:'cast',spell:'sniper',at:{x:15,y:0}};
// The charged aim waits for the key (26/10): run until charged, press it again and return every event on the way
function fire(w:ReturnType<typeof setup>) {
  const a=w.wizards.find(z=>z.id==='p0')!,events=[];
  while(a.casting&&w.t+1e-8<a.casting.fireAt){stepWorld(w,[],()=>.5);events.push(...w.events);}
  if(a.casting){stepWorld(w,[{...aim,at:a.casting.at}],()=>.5);events.push(...w.events);}
  return events;
}
describe('Inelegant Solution',()=>{
  it('validates aim snapshots and confirmed shot events at the client boundary',()=>{
    const w=setup();w.shrinkAt=120;stepWorld(w,[aim],()=>.5);
    const snap=encodeSnap(w,'p0',0,[{k:'snipe',id:'p0',from:{x:0,y:0},to:{x:15,y:0}}]);
    expect(parseServerMessage(snap)).not.toBeNull();
    expect(parseServerMessage({...snap,sn:[1]})).toBeNull();
    expect(parseServerMessage({...snap,sn:[8,0,0,0,0,0]})).toBeNull();
  });
  it('retains target identity when another enemy overlaps at the shot instant',()=>{
    const w=setup(),a=w.wizards[0],b=w.wizards[1];stepWorld(w,[aim],()=>.5);
    const c=world([[15,0]],noSpells(),[],()=>.5).wizards[0];c.id='other';c.regen=0;
    w.wizards=[a,c,b];fire(w);
    expect(b.hp).toBe(650);expect(c.hp).toBe(1000);
  });
  it.each([3,7.5])('stops at the nearest Campaign wall or obstacle at %s',obstacleX=>{
    const w=setup();w.wizards[0].pos={x:1.5,y:2.5};w.wizards[1].pos={x:9.5,y:2.5};
    w.pillars=[{pos:{x:obstacleX,y:2.5},kind:'tree',hp:9999,alive:true}];
    w.map={w:12,h:5,cells:Uint8Array.from({length:60},(_,i)=>i%12===4?CELL.wall:CELL.floor),home:{x:1.5,y:2.5}};
    stepWorld(w,[{...aim,at:{x:9.5,y:2.5}}],()=>.5);
    const events=fire(w);for(let i=0;i<80;i++){stepWorld(w,[],()=>.5);events.push(...w.events);}
    expect(w.wizards[1].hp).toBe(1000);
    expect(w.pillars[0].hp).toBe(obstacleX<4?9649:9999);
    const shot=events.find(e=>e.k==='snipe');expect(shot?.to.x).toBeLessThan(4);
  });
  it('accepts clicks on the edge of larger Campaign bodies',()=>{
    const w=setup(),a=w.wizards[0],b=w.wizards[1];b.r=2;
    expect(sniperTarget(w.wizards,a,{x:16.5,y:0},20)?.id).toBe(b.id);
  });
  it('costs 30, cools down for 35 s, aims for 3 s and has no progression',()=>{
    expect(priceOf('sniper',0)).toBe(30);expect(priceOf('sniper',1)).toBeNull();
    expect(spellMax('sniper')).toBe(1);expect(CAST_POINT.sniper).toBe(3);
    for(let level=1;level<=7;level++) expect(spellLevel('sniper',level)).toMatchObject({dmg:350,range:20,knock:0,cd:35});
    expect(spellLevels('sniper')).not.toContain('<th>2</th>');expect(spellTip('sniper',1)).not.toContain('Próximo nível');
  });
  it('waits charged until the key and fires exactly one 350 damage shot without knockback',()=>{
    const w=setup(),a=w.wizards[0],b=w.wizards[1];a.target={x:2,y:0};stepWorld(w,[aim],()=>.5);
    run(w,4);expect(b.hp).toBe(1000);expect(a.cd.sniper).toBe(0);expect(a.pos).toEqual({x:0,y:0});expect(a.casting?.spell).toBe('sniper');
    const events=fire(w);for(let i=0;i<14;i++){stepWorld(w,[],()=>.5);events.push(...w.events);}
    expect(b.hp).toBe(650);expect(b.vel).toEqual({x:0,y:0});expect(a.cd.sniper-w.t).toBeCloseTo(34.77,1);
    expect(events.filter(e=>e.k==='snipe')).toHaveLength(1);expect(events.filter(e=>e.k==='hit')).toHaveLength(1);
    run(w,1);expect(b.hp).toBe(650);
  });
  it.each([20,20.01])('validates the range boundary at %s metres',distance=>{
    const w=setup();w.wizards[1].pos.x=distance;stepWorld(w,[{...aim,at:{x:distance,y:0}}],()=>.5);
    expect(!!w.wizards[0].casting).toBe(distance<=20);
  });
  it('an early key press neither fires nor cancels the aim; a bot presses it once charged',()=>{
    const w=setup(),a=w.wizards[0],b=w.wizards[1];stepWorld(w,[aim],()=>.5);run(w,1);stepWorld(w,[aim],()=>.5);
    expect(b.hp).toBe(1000);expect(a.casting?.spell).toBe('sniper');
    run(w,CAST_POINT.sniper);expect(botCmds(w,'p0',()=>.5)).toEqual([{id:'p0',kind:'cast',spell:'sniper',at:b.pos}]);
  });
  it('tracks the moving target until firing rather than the clicked position',()=>{
    const w=setup(),b=w.wizards[1];stepWorld(w,[aim],()=>.5);run(w,2);b.pos={x:10,y:8};
    stepWorld(w,[],()=>.5);expect(w.wizards[0].casting?.at).toEqual(b.pos);fire(w);expect(b.hp).toBe(650);
  });
  it.each(['move','stop','stun','dead','invisible','range','geyser'] as const)('%s cancels without firing or cooldown',reason=>{
    const w=setup(),a=w.wizards[0],b=w.wizards[1];stepWorld(w,[aim],()=>.5);run(w,1);
    const cmds:Cmd[]=reason==='move'?[{id:a.id,kind:'move',to:{x:1,y:0}}]:reason==='stop'?[{id:a.id,kind:'stop'}]:[];
    if(reason==='stun')a.stunLeft=1;if(reason==='dead')b.alive=false;if(reason==='invisible')b.veilUntil=20;if(reason==='range')b.pos.x=21;
    if(reason==='geyser'){a.geyserLeft=2;a.geyserAt={...a.pos};}
    stepWorld(w,cmds,()=>.5);run(w,5);expect(a.casting).toBeNull();expect(a.cd.sniper).toBe(0);expect(b.hp).toBe(1000);
  });
  it.each(['ground','self','ally','hidden'] as const)('rejects %s targets before revealing or spending cooldown',reason=>{
    const w=setup(),a=w.wizards[0],b=w.wizards[1];a.veilUntil=10;
    if(reason==='ally')a.team=b.team=1;if(reason==='hidden')b.veilUntil=10;
    const at=reason==='ground'?{x:10,y:10}:reason==='self'?a.pos:b.pos;
    stepWorld(w,[{...aim,at}],()=>.5);expect(a.casting).toBeNull();expect(a.veilUntil).toBe(10);expect(a.cd.sniper).toBe(0);
  });
  it('reveals the caster and does not restart on repeated input',()=>{
    const w=setup(),a=w.wizards[0];a.veilUntil=10;a.windUntil=10;stepWorld(w,[aim],()=>.5);const fireAt=a.casting!.fireAt;
    run(w,1);stepWorld(w,[aim],()=>.5);expect(a.casting?.fireAt).toBe(fireAt);expect(a.veilUntil).toBe(0);expect(a.windUntil).toBe(0);
  });
  it('respects general resistance, Shield and invulnerability',()=>{
    for(const kind of ['shield','invuln','closed'] as const){
      const w=setup(),b=w.wizards[1];stepWorld(w,[aim],()=>.5);
      if(kind==='shield')b.shieldUntil=10;if(kind==='invuln')b.invulnUntil=10;
      if(kind==='closed'){b.braceReadyAt=0;b.braceUntil=10;b.closedBodyUntil=10;}
      fire(w);expect(b.hp).toBe(kind==='closed'?965:1000);
    }
  });
  it('obstacles block the shot without hitting the target behind them',()=>{
    const w=setup();w.pillars=[{pos:{x:7,y:0},hp:9999,kind:'rock',alive:true}];stepWorld(w,[aim],()=>.5);run(w,4.6);expect(w.wizards[1].hp).toBe(1000);
  });
  it('snapshot sends authoritative time and aim, clearing on cancel',()=>{
    const w=setup();stepWorld(w,[aim],()=>.5);run(w,1);
    const snap=encodeSnap(w,'p0',0,[]),a=decodeSnap(snap,['p0','p1']).wizards[0];expect(a.sniperLeft).toBeCloseTo(CAST_POINT.sniper-1,1);expect(a.sniperAt).toEqual({x:15,y:0});
    stepWorld(w,[{id:'p0',kind:'stop'}],()=>.5);expect(encodeSnap(w,'p0',0,[]).sn).toBeUndefined();
  });
  it('shared helper excludes allies and hidden units and requires a body click',()=>{
    const w=setup(),a=w.wizards[0],b=w.wizards[1];expect(sniperTarget(w.wizards,a,b.pos,20)?.id).toBe(b.id);
    expect(sniperTarget([{...b,hidden:true}],a,b.pos,20)).toBeUndefined();expect(sniperTarget(w.wizards,a,{x:8,y:8},20)).toBeUndefined();
  });
  it('demo uses the real simulation and fires once after the windup',()=>{
    const s=demoWorld('sniper');const events=[];for(let i=0;i<Math.ceil(6/DT);i++){demoStep(s);events.push(...s.w.events);}
    expect(events.filter(e=>e.k==='snipe')).toHaveLength(1);expect(s.w.wizards[1].hp).toBe(650);
  });
});
