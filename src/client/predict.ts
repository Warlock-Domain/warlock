// Previsão do próprio mago: anda na hora do clique com o mesmo código do servidor e é corrigido de leve.
import { STUN_SPEED, WIZ_SPEED } from '../shared/constants.ts';
import { moveWizard, type Wizard } from '../shared/sim.ts';
import type { WizView } from '../shared/snapshot.ts';
import { add, dist, len, scale, sub, v, type Vec } from '../shared/vec.ts';

export function createPredict() {
  let me: Wizard | null = null;
  let rttSec = 0.1;

  return {
    setRtt(ms: number) {
      rttSec = rttSec * 0.8 + (ms / 1000) * 0.2;
    },
    rtt: () => rttSec,
    reset() {
      me = null;
    },
    move(to: Vec) {
      if (me) me.target = to;
    },
    stop() {
      if (me) me.target = null;
    },
    teleported(to: Vec) {
      if (me) me.pos = to;
    },
    // server = o estado mais novo do próprio mago que chegou (cerca de meia ida e volta atrás)
    frame(server: WizView, dt: number): Vec {
      if (!me) {
        me = { id: server.id, pos: server.pos, vel: v(0, 0), target: null } as Wizard;
      }
      if (!server.alive || len(server.vel) > STUN_SPEED) {
        // empurrado ou morto: quem manda é o servidor
        me.pos = add(me.pos, scale(sub(server.pos, me.pos), 0.35));
        me.vel = v(0, 0);
        return me.pos;
      }
      moveWizard(me, dt);
      const slack = WIZ_SPEED * (rttSec / 2) + 0.3;
      if (dist(me.pos, server.pos) > slack) me.pos = add(me.pos, scale(sub(server.pos, me.pos), 0.15));
      return me.pos;
    },
  };
}
