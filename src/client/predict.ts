// Previsão do próprio mago: anda na hora do clique com o mesmo código do servidor e é corrigido de leve.
import { STUN_SPEED, WIZ_SPEED } from '../shared/constants.ts';
import { moveWizard, type Wizard } from '../shared/sim.ts';
import type { WizView } from '../shared/snapshot.ts';
import { add, dist, len, scale, sub, v, type Vec } from '../shared/vec.ts';

export function createPredict() {
  let me: Wizard | null = null;
  let rttSec = 0.1;
  // conjurando: o mago fica parado até holdUntil; o clique de andar nesse meio-tempo fica guardado
  let holdUntil = 0;
  let dead = false;
  let queued: Vec | null | undefined;
  const now = () => performance.now() / 1000;

  return {
    setRtt(ms: number) {
      rttSec = rttSec * 0.8 + (ms / 1000) * 0.2;
    },
    rtt: () => rttSec,
    reset() {
      me = null;
    },
    // velocidade de andar que o servidor diz que o mago tem agora (botas, lentidão do Pacto)
    setSpeed(sp: number) {
      if (me && sp > 0) me.speed = sp;
    },
    hold(secs: number) {
      if (secs <= 0) return;
      holdUntil = now() + secs;
      queued = undefined;
      if (me) me.target = null;
    },
    move(to: Vec) {
      if (now() < holdUntil) queued = to;
      else if (me) me.target = to;
    },
    stop() {
      if (now() < holdUntil) queued = null;
      else if (me) me.target = null;
    },
    teleported(to: Vec) {
      if (!me) return;
      // o servidor também esquece o destino ao teleportar
      me.pos = to;
      me.target = null;
    },
    // server = o estado mais novo do próprio mago que chegou (cerca de meia ida e volta atrás)
    frame(server: WizView, dt: number): Vec {
      if (!me) {
        me = { id: server.id, pos: server.pos, vel: v(0, 0), target: null } as Wizard;
      }
      if (!server.alive) dead = true;
      else if (dead) {
        // voltou no deathmatch: o servidor sorteou outro ponto, vai direto para lá
        dead = false;
        me.pos = server.pos;
        me.target = null;
      }
      if (!server.alive || len(server.vel) > STUN_SPEED) {
        // empurrado ou morto: quem manda é o servidor
        me.pos = add(me.pos, scale(sub(server.pos, me.pos), 0.35));
        me.vel = v(0, 0);
        return me.pos;
      }
      if (queued !== undefined && now() >= holdUntil) {
        me.target = queued;
        queued = undefined;
      }
      if (server.status & 128) me.target = null; // preso (Agarrar): não anda
      moveWizard(me, dt);
      const slack = WIZ_SPEED * (rttSec / 2) + 0.3;
      if (dist(me.pos, server.pos) > slack) me.pos = add(me.pos, scale(sub(server.pos, me.pos), 0.15));
      return me.pos;
    },
  };
}
