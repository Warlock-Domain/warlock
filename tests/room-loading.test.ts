import { describe, expect, it } from 'vitest';
import ui from '../src/client/ui.ts?raw';
import { RoomLoadingGate } from '../src/client/room-loading.ts';

describe('room loading synchronization',()=>{
  it('keeps loading until both the scene and authoritative room are ready',()=>{
    const g=new RoomLoadingGate();expect(g.pending).toBe(true);
    g.setRoom('lobby');expect(g.pending).toBe(true);
    g.setSceneReady();expect(g.pending).toBe(false);
    const other=new RoomLoadingGate();other.setSceneReady();expect(other.pending).toBe(true);
    other.setRoom('shop');expect(other.pending).toBe(false);
  });
  it('waits for the local player identity before revealing the room',()=>{
    const g=new RoomLoadingGate();g.setSceneReady();g.setRoom('lobby',false);expect(g.pending).toBe(true);
    g.setRoom('lobby',true);expect(g.pending).toBe(false);
  });
  it('does not expose a transient lobby while an automatic or manual start is pending',()=>{
    const g=new RoomLoadingGate();g.setSceneReady();g.setRoom('lobby');g.start();
    g.setRoom('lobby');expect(g.pending).toBe(true);
    g.setRoom('shop');expect(g.pending).toBe(false);
  });
  it.each(['countdown','playing','roundEnd'] as const)('waits for a snapshot when joining %s',phase=>{
    const g=new RoomLoadingGate();g.setSceneReady();g.setRoom(phase);expect(g.pending).toBe(true);
    g.setSnapshot();expect(g.pending).toBe(false);
  });
  it('lets start rejection restore the prior lobby and fatal errors show their own screen',()=>{
    const g=new RoomLoadingGate();g.setSceneReady();g.setRoom('lobby');g.start();g.cancelStart();expect(g.pending).toBe(false);
    const failed=new RoomLoadingGate();failed.fail();expect(failed.pending).toBe(false);
    failed.setSceneReady();expect(failed.pending).toBe(false);
  });
  it('does not leave the loading layer in front of an initialized reconnect',()=>{
    const g=new RoomLoadingGate();g.setSceneReady();g.setRoom('shop');
    g.setRoom('countdown');expect(g.pending).toBe(true);g.setSnapshot();
    g.setRoom('playing');expect(g.pending).toBe(false);
  });
  it('mounts a cat loading screen with the entire HUD hidden on first paint',()=>{
    expect(ui).toContain("class: 'overlay room-loading'");
    expect(ui).toContain("src: '/home-cat.jpg'");
    expect(ui).toContain("t('Carregando', 'Loading')");
    expect(ui).toContain("class: 'home-stage is-subpage loading-stage'");
    expect(ui).not.toContain("class: 'panel loading-card'");
    expect(ui).toContain("class: 'hud', hidden: true");
  });
});
