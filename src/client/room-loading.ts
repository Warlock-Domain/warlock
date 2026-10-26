import type { Phase } from '../shared/match.ts';

// Owns the readiness barrier; a fixed animation duration cannot synchronize network state.
export class RoomLoadingGate {
  private sceneReady=false;
  private phase: Phase | null=null;
  private snapshotReady=false;
  private starting=false;
  private failed=false;

  setSceneReady() { this.sceneReady=true; }
  setRoom(phase: Phase, joined = true) {
    if (!joined) return;
    this.phase=phase;
    if(phase!=='lobby') this.starting=false;
  }
  setSnapshot() { this.snapshotReady=true; }
  start() { this.starting=true; this.snapshotReady=false; }
  cancelStart() { this.starting=false; }
  fail() { this.failed=true; }
  get pending() {
    if(this.failed) return false;
    return !this.sceneReady || !this.phase || this.starting ||
      (['countdown','playing','roundEnd'].includes(this.phase) && !this.snapshotReady);
  }
}
