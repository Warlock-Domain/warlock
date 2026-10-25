// Buffer server snapshots to interpolate other wizards and projectiles between updates.
import type { ProjView, SnapView, WizView } from '../shared/snapshot.ts';
import { CREDIT_WINDOW, DT, SEND_EVERY } from '../shared/constants.ts';
import { v } from '../shared/vec.ts';

export const DELAY = 0.066; // Render 66 ms behind so two snapshots are available for interpolation.
// Replay covers the kill-credit window plus one second, at 30 snapshots per second.
export const REPLAY_MAX = Math.round((CREDIT_WINDOW + 1) / (DT * SEND_EVERY));

export function keepLast<T>(arr: T[], item: T, max: number) {
  arr.push(item);
  if (arr.length > max) arr.shift();
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class SnapshotInterpolator {
  private buf: SnapView[] = [];
  private offset: number | null = null; // Server time minus local time, in seconds.
  private readonly max: number;

  constructor(max = 30) {
    this.max = max;
  }

  // Bound callbacks preserve the createInterp() API for live and replay callers.
  push = (s: SnapView, localSec: number) => {
    const last = this.buf[this.buf.length - 1];
    // A new round resets the simulation clock to zero.
    if (last && s.time < last.time - 0.5) {
      this.buf = [];
      this.offset = null;
    }
    const sample = s.time - localSec;
    // Smooth network jitter slowly; a large clock jump starts a new estimate.
    this.offset = this.offset === null || Math.abs(sample - this.offset) > 0.5 ? sample : this.offset + (sample - this.offset) * 0.05;
    keepLast(this.buf, s, this.max);
  };

  latest = (): SnapView | null => this.buf[this.buf.length - 1] ?? null;

  reset = () => {
    this.buf = [];
    this.offset = null;
  };

  sample = (localSec: number): SnapView | null => {
    if (!this.buf.length || this.offset === null) return null;
    const t = localSec + this.offset - DELAY;
    let i = this.buf.length - 1;
    while (i > 0 && this.buf[i - 1].time > t) i--;
    const b = this.buf[i];
    const a = this.buf[i - 1];
    if (!a || t >= b.time) return b;
    if (t <= a.time) return a;
    const k = (t - a.time) / (b.time - a.time || 1);
    const wizards: WizView[] = b.wizards.map((wb, j) => {
      const wa = a.wizards[j];
      if (!wa || !wa.alive || !wb.alive) return wb;
      return { ...wb, pos: v(lerp(wa.pos.x, wb.pos.x, k), lerp(wa.pos.y, wb.pos.y, k)), facing: lerpAngle(wa.facing, wb.facing, k) };
    });
    const prev = new Map(a.projectiles.map((p) => [p.id, p]));
    const projectiles: ProjView[] = b.projectiles.map((pb) => {
      const pa = prev.get(pb.id);
      return pa ? { ...pb, pos: v(lerp(pa.pos.x, pb.pos.x, k), lerp(pa.pos.y, pb.pos.y, k)) } : pb;
    });
    return { ...b, time: t, arenaR: lerp(a.arenaR, b.arenaR, k), wizards, projectiles };
  };
}

export function createInterp(max = 30) {
  return new SnapshotInterpolator(max);
}
