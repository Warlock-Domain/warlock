import { describe, expect, it } from 'vitest';
import { BOOMERANG, DRAIN, RECHARGE, noSpells } from '../src/shared/spells.ts';
import { stepWorld, type Projectile } from '../src/shared/sim.ts';
import { world } from './helpers.ts';

function flight(kind: Projectile['kind']) {
  const w=world([[0,0],[25,0]],noSpells(),[],()=>.5);
  w.pillars=[]; w.runes=[]; w.isles=[]; w.arenaR=60; w.shrinkAt=120;
  const p: Projectile={id:123,born:0,kind,owner:'p0',caster:'p0',pos:{x:10,y:0},vel:{x:1,y:0},level:1,until:20,dmgMult:1,power:2,target:null};
  w.projectiles=[p];
  return {w,p};
}
const speed=(p:Projectile)=>Math.hypot(p.vel.x,p.vel.y);
describe('captured Channeling speed',()=>{
  it('keeps the bonus when Drain turns',()=>{
    const {w,p}=flight('drain'); p.turnAt=0; stepWorld(w,[],()=>.5);
    expect(speed(p)).toBeCloseTo(DRAIN.turnSpeed*2);
  });
  it.each(['drain','recharge'] as const)('keeps %s return-ball speed',kind=>{
    const {w,p}=flight(kind); p.back=true; p.target='p0'; stepWorld(w,[],()=>.5);
    expect(speed(p)).toBeCloseTo((kind==='drain'?DRAIN.back:RECHARGE.back)*2);
  });
  it('keeps Boomerang return steering speed',()=>{
    const {w,p}=flight('boomerang'); p.back=true; p.vel={x:-BOOMERANG.back*2,y:0}; stepWorld(w,[],()=>.5);
    expect(speed(p)).toBeCloseTo(BOOMERANG.back*2);
  });
  it.each(['wizard','obstacle'] as const)('keeps Boomerang speed after a %s bounce',body=>{
    const {w,p}=flight('boomerang'); p.pos={x:23.8,y:0}; p.vel={x:120,y:0};
    if(body==='obstacle') {w.wizards[1].pos={x:40,y:0};w.pillars=[{pos:{x:25,y:0},hp:1000,kind:'chest',alive:true}];}
    stepWorld(w,[],()=>.5);
    expect(p.back).toBe(true);
    expect(speed(p)).toBeCloseTo((body==='wizard'?BOOMERANG.bounce:BOOMERANG.bounceWall)*2);
  });
});
