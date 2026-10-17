// Guarda os últimos estados do servidor e devolve o mundo num instante entre dois deles (outros magos e projéteis).
import type { ProjView, SnapView, WizView } from '../shared/snapshot.ts';
import { v } from '../shared/vec.ts';

export const DELAY = 0.066; // desenha 66 ms no passado: dá tempo de ter sempre dois estados para interpolar

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export function createInterp() {
  let buf: SnapView[] = [];
  let offset: number | null = null; // tempo do servidor − relógio local, em segundos

  return {
    push(s: SnapView, localSec: number) {
      const last = buf[buf.length - 1];
      // rodada nova: o relógio da simulação volta a zero
      if (last && s.time < last.time - 0.5) {
        buf = [];
        offset = null;
      }
      const sample = s.time - localSec;
      // média lenta para não tremer com a oscilação da rede; salto grande recomeça
      offset = offset === null || Math.abs(sample - offset) > 0.5 ? sample : offset + (sample - offset) * 0.05;
      buf.push(s);
      if (buf.length > 30) buf.shift();
    },
    latest: (): SnapView | null => buf[buf.length - 1] ?? null,
    reset() {
      buf = [];
      offset = null;
    },
    sample(localSec: number): SnapView | null {
      if (!buf.length || offset === null) return null;
      const t = localSec + offset - DELAY;
      let i = buf.length - 1;
      while (i > 0 && buf[i - 1].time > t) i--;
      const b = buf[i];
      const a = buf[i - 1];
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
    },
  };
}
