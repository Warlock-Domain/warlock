// Predict local movement immediately with shared server logic, then reconcile gently.
import type { Terrain } from '../shared/arena.ts';
import { BRACING_BIT, WIZ_SPEED } from '../shared/constants.ts';
import { terrainOf, type NightMap } from '../shared/levels.ts';
import { isStunned, keepOut, moveWizard, type MovementState, type Room } from '../shared/sim.ts';
import { BLOCKED_MOVE_BIT, DASHING_BIT, type WizView } from '../shared/snapshot.ts';
import { add, dist, scale, sub, v, type Vec } from '../shared/vec.ts';

export class MovementPredictor {
  private me: MovementState | null = null;
  private velocitySource: WizView | null = null;
  private wasDashing = false;
  private wasStunned = false;
  private rttSec = 0.1;
  // Movement ordered during a cast waits until its windup ends.
  private holdUntil = 0;
  private attackHold = false;
  private dead = false;
  private queued: Vec | null | undefined;
  // Rebuild Campaign terrain only when the map changes; the room lock can change independently.
  private shownMap: NightMap | null = null;
  private terrain: Terrain | null = null;
  private lock: Room | undefined;

  private now() {
    return performance.now() / 1000;
  }

  // Public callbacks stay bound, preserving the createPredict() API.
  setRtt = (ms: number) => {
    this.rttSec = this.rttSec * 0.8 + (ms / 1000) * 0.2;
  };

  rtt = () => this.rttSec;

  setMap = (n: NightMap | null, room?: Room) => {
    if (n !== this.shownMap) this.terrain = n && terrainOf(n);
    this.shownMap = n;
    this.lock = room;
  };

  reset = () => {
    this.me = null;
    this.velocitySource = null;
    this.wasDashing = false;
    this.wasStunned = false;
    // A new round discards transient input/death state while the network estimate remains valid.
    this.holdUntil = 0;
    this.queued = undefined;
    this.dead = false;
    this.attackHold = false;
  };

  // The walk speed the server reports right now (boots, Rush, Grip).
  setSpeed = (sp: number) => {
    if (this.me && sp >= 0) this.me.speed = sp;
  };

  hold = (secs: number, interruptible = false) => {
    if (this.attackHold) { this.holdUntil = 0; this.queued = undefined; }
    this.attackHold = interruptible;
    if (secs <= 0) return;
    this.holdUntil = this.now() + secs;
    this.queued = undefined;
    if (this.me) this.me.target = null;
  };

  move = (to: Vec) => {
    if (this.velocitySource && (this.velocitySource.geyserLeft ?? 0) > 0) return;
    if (this.attackHold) { this.holdUntil = 0; this.queued = undefined; this.attackHold = false; }
    if (this.now() < this.holdUntil) this.queued = to;
    else if (this.me) this.me.target = to;
  };

  // Stop cancels the cast windup on both client and server, allowing movement immediately.
  stop = () => {
    this.attackHold = false;
    this.holdUntil = 0;
    this.queued = undefined;
    if (this.me) this.me.target = null;
  };

  teleported = (to: Vec) => {
    if (!this.me) return;
    this.me.pos = to;
    this.me.target = null; // the server also forgets the destination on teleport
    this.holdUntil = 0; // Teleport cancels Scourge's windup, allowing movement immediately.
    this.queued = undefined;
  };

  // The newest authoritative snapshot is roughly half a round trip behind the local clock.
  frame = (server: WizView, dt: number): Vec => {
    const me = this.me ??= { pos: { ...server.pos }, vel: v(0, 0), target: null, facing: server.facing, speed: WIZ_SPEED };
    if (!server.alive) this.dead = true;
    else if (this.dead) {
      // A deathmatch respawn uses a new server-chosen position immediately.
      this.dead = false;
      me.pos = server.pos;
      me.target = null;
    }
    const dashing = server.alive && !!(server.status & DASHING_BIT);
    // Snap once to the authoritative endpoint instead of visually extending a finished dash.
    if (this.wasDashing && !dashing) me.pos = { ...server.pos };
    this.wasDashing = dashing;
    if ((server.sniperLeft ?? 0)>0) { me.target = null; this.queued = undefined; }
    if (this.velocitySource && (this.velocitySource.sniperLeft ?? 0)>0 && !(server.sniperLeft ?? 0) && this.attackHold) { this.holdUntil=0; this.attackHold=false; }
    if (server.channelElapsed !== undefined) { me.target = null; this.queued = undefined; }
    const suspended = (server.geyserLeft ?? 0) > 0;
    const stunned = suspended || (server.stunLeft === undefined ? isStunned(server) : !!(server.status & 16));
    if (suspended) { me.target = null; this.queued = undefined; }
    if (this.wasStunned && !stunned) me.pos = { ...server.pos };
    this.wasStunned = stunned;
    // Read residual velocity once per snapshot, before the server-controlled branch below.
    // Re-reading it every frame would renew the impulse after walking becomes available again.
    if (server !== this.velocitySource) {
      if (server.status & BLOCKED_MOVE_BIT) { me.target = null; me.pos = { ...server.pos }; }
      me.stunLeft = server.stunLeft;
      me.recoveryLeft = server.recoveryLeft ?? 0;
      me.vel = { ...server.vel };
      this.velocitySource = server;
    }
    if (!server.alive || dashing || stunned) {
      if (stunned) this.holdUntil = 0; // An interrupted cast must not preserve its old wait.
      // The server controls position while the wizard is dead, stunned, or dashing.
      me.pos = add(me.pos, scale(sub(server.pos, me.pos), 0.35));
      me.vel = v(0, 0);
      return me.pos;
    }
    if (this.queued !== undefined && this.now() >= this.holdUntil) {
      me.target = this.queued;
      this.queued = undefined;
    }
    if (server.status & 128) me.target = null; // Grip blocks walking.
    if (server.status & BRACING_BIT) { me.target = null; this.queued = undefined; }
    moveWizard(me, dt);
    if (this.terrain) keepOut(this.terrain, me, this.lock);
    const slack = WIZ_SPEED * (this.rttSec / 2) + 0.3;
    if (dist(me.pos, server.pos) > slack) me.pos = add(me.pos, scale(sub(server.pos, me.pos), 0.15));
    return me.pos;
  };
}

export function createPredict() {
  return new MovementPredictor();
}
