import { describe, expect, it } from 'vitest';
import { parseServerMessage } from '../src/client/net-message.ts';
import { illusionCopies } from '../src/client/screen-data.ts';
import { botCmds } from '../src/shared/bots.ts';
import { noItems } from '../src/shared/items.ts';
import { reachOf } from '../src/client/reach.ts';
import { DT } from '../src/shared/constants.ts';
import { channelLevel, channelPower } from '../src/shared/channeling.ts';
import { noSpells, priceOf, spellLevel, spellMax } from '../src/shared/spells.ts';
import { stepWorld, type Cmd } from '../src/shared/sim.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { demoStep, demoWorld } from '../src/client/demo.ts';
import { world, run } from './helpers.ts';

function setup() {
  const w = world([[0,0],[25,0]], { ...noSpells(), channel: 1, meteor: 1, shield: 1, teleport: 1 });
  w.pillars=[]; w.runes=[]; w.isles=[]; w.arenaR=50; w.shrinkAt=Infinity;
  for(const z of w.wizards) { z.regen=0; z.stunLeft=0; }
  return w;
}
const charge: Cmd = { id:'p0',kind:'channel',spell:'fireball' };
const cast: Cmd = { id:'p0',kind:'cast',spell:'fireball',at:{x:30,y:0} };

describe('Channeling',()=>{
  it('charged bots keep holding with no target in sight and release through the normal aim',()=>{
    const w=setup(),z=w.wizards[0]; z.channel={spell:'fireball',since:-3}; z.blindUntil=10;
    expect(botCmds(w,z.id,()=>.5)).toEqual([]);
    z.blindUntil=0;
    expect(botCmds(w,z.id,()=>.5)).toEqual([]);
    w.wizards[1].pos={x:2,y:0};
    expect(botCmds(w,z.id,()=>.5)).toEqual([{id:z.id,kind:'cast',spell:'fireball',at:{x:2,y:0}}]);
  });
  it('validates bounded charge snapshots and does not give copies the held pose',()=>{
    const w=setup();w.shrinkAt=120;stepWorld(w,[charge],()=>.5);const snap=encodeSnap(w,'p0',0,[]);
    expect(parseServerMessage(snap)).not.toBeNull();
    expect(parseServerMessage({...snap,cn:[0]})).toBeNull();
    expect(parseServerMessage({...snap,cn:[999,1,-1,0]})).toBeNull();
    expect(parseServerMessage({...snap,cn:[0,3,-1,0]})).toBeNull();
    const copies=illusionCopies<{id:string;status:number;channelElapsed?:number}>([{kind:'illusion',pos:{x:1,y:0},vel:{x:0,y:0}}],['p0'],[{id:'p0',status:1,channelElapsed:2}]);
    expect(copies[0].channelElapsed).toBeUndefined();
  });
  it.each([[.99,0],[1,1.5],[1.5,1.75],[2,2],[10,2]])('time %s gives power %s',(seconds,power)=>{
    expect(channelPower(seconds)).toBeCloseTo(power);
  });
  it('keeps the range of spells without damage, so a charged Teleport or Heal reaches the same distance',()=>{
    expect(channelLevel(spellLevel('teleport',1),2).range).toBe(spellLevel('teleport',1).range);
    expect(channelLevel(spellLevel('heal',1),2).range).toBe(spellLevel('heal',1).range);
  });
  it('has a single level: no paid upgrade without effect',()=>{
    expect(priceOf('channel',0)).toBe(12); expect(priceOf('channel',1)).toBeNull(); expect(spellMax('channel')).toBe(1);
  });
  it('changes only damage/range/projectile speed/knockback, not status/healing/duration/radius',()=>{
    const l={...spellLevel('fireball',1),heal:45,duration:3,radius:2,blind:2,incapacitate:1};
    expect(channelLevel(l,2)).toMatchObject({dmg:l.dmg*2,knock:l.knock*2,range:l.range*2,speed:l.speed*2,heal:45,duration:3,radius:2,blind:2,incapacitate:1});
  });
  it('waits indefinitely without firing, consuming cooldown or walking',()=>{
    const w=setup(),z=w.wizards[0]; z.target={x:5,y:5}; stepWorld(w,[charge],()=>.5);
    run(w,5); expect(z.pos).toEqual({x:0,y:0}); expect(z.channel?.spell).toBe('fireball');
    expect(w.projectiles).toHaveLength(0); expect(z.cd.fireball).toBe(0); expect(z.cd.channel).toBe(0);
    const view=decodeSnap(encodeSnap(w,z.id,0,[]),['p0','p1']).wizards[0];
    expect(view.channelSpell).toBe('fireball'); expect(view.channelElapsed).toBe(2);
  });
  it('refuses an early cast without losing charge or spending cooldown',()=>{
    const w=setup(); stepWorld(w,[charge],()=>.5); run(w,.5); stepWorld(w,[cast],()=>.5);
    expect(w.wizards[0].casting).toBeNull(); expect(w.wizards[0].channel).toBeTruthy();
    expect(w.projectiles).toHaveLength(0); expect(w.wizards[0].cd.fireball).toBe(0);
  });
  it.each([1,1.5,2,5])('captures power after %ss and keeps normal spell cooldown',seconds=>{
    const w=setup(),z=w.wizards[0]; stepWorld(w,[charge],()=>.5); run(w,seconds-DT);
    const elapsed=w.t-z.channel!.since;
    stepWorld(w,[cast],()=>.5); const power=channelPower(elapsed);
    run(w,.15);
    const p=w.projectiles.find(p=>p.kind==='fireball')!; expect(p).toBeTruthy();
    expect(p.power).toBeCloseTo(power); expect(p.vel.x).toBeCloseTo(spellLevel('fireball',1).speed*power);
    expect(z.channel).toBeUndefined(); expect(z.cd.channel).toBe(0);
    expect(z.cd.fireball-w.t).toBeGreaterThan(4.6);
    expect(p.until-w.t).toBeLessThanOrEqual(spellLevel('fireball',1).range/spellLevel('fireball',1).speed);
  });
  it('applies captured damage at impact and retains increased flight range',()=>{
    const w=setup(),z=w.wizards[0],target=w.wizards[1]; target.pos={x:10,y:0};
    stepWorld(w,[charge],()=>.5); run(w,2); stepWorld(w,[cast],()=>.5);
    const events=[]; for(let i=0;i<100;i++){stepWorld(w,[],()=>.5);events.push(...w.events);}
    expect(events.find(e=>e.k==='hit'&&e.id===target.id)).toMatchObject({dmg:140});
    expect(z.cd.channel).toBe(0);
  });
  it.each(['move','stop','brace','stun'] as const)('%s cancels without using spell cooldown',reason=>{
    const w=setup(),z=w.wizards[0]; stepWorld(w,[charge],()=>.5); run(w,1.2);
    if(reason==='stun') { z.stunLeft=1; stepWorld(w,[],()=>.5); }
    else stepWorld(w,[reason==='move'?{id:z.id,kind:'move',to:{x:4,y:0}}:reason==='brace'?{id:z.id,kind:'brace',on:true}:{id:z.id,kind:'stop'}],()=>.5);
    expect(z.channel).toBeUndefined(); expect(z.cd.fireball).toBe(0);
  });
  it('requires both spells and readiness; duplicate input cannot reset charge',()=>{
    const w=setup(),z=w.wizards[0]; z.spells.channel=0; stepWorld(w,[charge],()=>.5); expect(z.channel).toBeUndefined();
    z.spells.channel=1; z.cd.fireball=10; stepWorld(w,[charge],()=>.5); expect(z.channel).toBeUndefined();
    z.cd.fireball=0; z.stunLeft=1; stepWorld(w,[charge],()=>.5); expect(z.channel).toBeUndefined();
    z.stunLeft=0; stepWorld(w,[charge],()=>.5); const since=z.channel!.since; run(w,.5); stepWorld(w,[charge],()=>.5); expect(z.channel!.since).toBe(since);
  });
  it('buying Channeling disables basic attacks and removing it restores them',()=>{
    const w=setup(),z=w.wizards[0]; w.wizards[1].pos={x:2,y:0};
    const attack:Cmd={id:z.id,kind:'basic',at:{x:2,y:0},target:'p1'};
    stepWorld(w,[attack],()=>.5); expect(z.basicCasting).toBeUndefined();
    z.spells.channel=0; stepWorld(w,[attack],()=>.5); expect(z.basicCasting).toBeTruthy();
  });
  it('can channel a ready Closed Body while an existing stance lease is renewed',()=>{
    const w=setup(),z=w.wizards[0]; z.spells.closedbody=1;
    for(let i=0;i<160;i++)stepWorld(w,[{id:z.id,kind:'brace',on:true},...(i===40?[{id:z.id,kind:'channel' as const,spell:'closedbody' as const}]:[])],()=>.5);
    expect(z.channel?.spell).toBe('closedbody');
    stepWorld(w,[{id:z.id,kind:'cast',spell:'closedbody',at:{x:2,y:0}}],()=>.5);
    expect(z.closedBodyUntil).toBeGreaterThan(w.t);expect(z.channel).toBeUndefined();
  });
  it('range preview matches boosted flight without scaling spawn offset or projectile radius',()=>{
    const w=setup(),sp=w.wizards[0].spells;const base=reachOf('fireball',sp,noItems());
    expect(reachOf('fireball',sp,noItems(),2)-base).toBeCloseTo(spellLevel('fireball',1).range);
  });
  it('AI holds charge then issues an explicit cast command rather than auto-firing',()=>{
    const w=setup(),z=w.wizards[0]; w.wizards[1].pos={x:10,y:0}; stepWorld(w,[charge],()=>.5);
    expect(botCmds(w,z.id,()=>.5)).toEqual([]);run(w,2);
    expect(botCmds(w,z.id,()=>.5)[0]).toMatchObject({kind:'cast',spell:'fireball'});
    expect(w.projectiles).toHaveLength(0);
  });
  it('normal spells still cast normally without channeling',()=>{
    const w=setup(); stepWorld(w,[cast],()=>.5); run(w,.15);
    expect(w.projectiles[0].vel.x).toBe(spellLevel('fireball',1).speed);
    expect(w.projectiles[0].power).toBe(1);
  });
  it('does not expose a hidden caster channel through snapshots',()=>{
    const w=setup(); stepWorld(w,[charge],()=>.5); w.wizards[0].veilUntil=w.t+5;
    expect(decodeSnap(encodeSnap(w,'p1',0,[]),['p0','p1']).wizards[0].channelSpell).toBeUndefined();
  });
  it('validates channel commands and rejects injected power or invalid spells',()=>{
    const parse=(x:object)=>parseClientMessage(JSON.stringify(x));
    expect(parse({t:'channel',spell:'fireball',seq:1})).toEqual({t:'channel',spell:'fireball',seq:1});
    expect(parse({t:'channel',spell:'fireball',seq:1,power:100})).toBeNull();
    expect(parse({t:'channel',spell:'channel',seq:1})).toBeNull();
    expect(parse({t:'channel',spell:'unknown',seq:1})).toBeNull();
  });
  it('demo holds a full charge beyond 2s until its explicit cast step',()=>{
    const s=demoWorld('channel'); while(s.w.t<2.8)demoStep(s);
    expect(s.w.wizards[0].channel).toBeTruthy(); expect(s.w.projectiles).toHaveLength(0);
    while(s.w.t<3.3)demoStep(s);
    expect(s.w.projectiles.find(p=>p.kind==='fireball')?.power).toBe(2);
  });
});
