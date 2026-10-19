// Previsão do próprio mago: anda na hora do clique com o mesmo código do servidor e é corrigido de leve.
import type { Terrain } from '../shared/arena.ts';
import { WIZ_SPEED } from '../shared/constants.ts';
import { terrainOf, type NightMap } from '../shared/levels.ts';
import { isSliding, keepOut, moveWizard, type Room, type Wizard } from '../shared/sim.ts';
import type { WizView } from '../shared/snapshot.ts';
import { add, dist, scale, sub, v, type Vec } from '../shared/vec.ts';

export function createPredict() {
  let me: Wizard | null = null;
  let rttSec = 0.1;
  // conjurando: o mago fica parado até holdUntil; o clique de andar nesse meio-tempo fica guardado
  let holdUntil = 0;
  let dead = false;
  let queued: Vec | null | undefined;
  const now = () => performance.now() / 1000;
  // Campanha: paredes do mapa da noite e a sala trancada no encontro (montado só quando o mapa muda)
  let shownMap: NightMap | null = null;
  let terrain: Terrain | null = null;
  let lock: Room | undefined;

  return {
    setRtt(ms: number) {
      rttSec = rttSec * 0.8 + (ms / 1000) * 0.2;
    },
    rtt: () => rttSec,
    setMap(n: NightMap | null, room?: Room) {
      if (n !== shownMap) terrain = n && terrainOf(n);
      shownMap = n;
      lock = room;
    },
    reset() {
      me = null;
    },
    // velocidade de andar que o servidor diz que o mago tem agora (botas, Investida, preso)
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
      holdUntil = 0; // o Teleporte cancela o Flagelo em preparo: pode andar de novo
      queued = undefined;
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
      if (!server.alive || isSliding(server)) {
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
      if (terrain) keepOut(terrain, me, lock);
      const slack = WIZ_SPEED * (rttSec / 2) + 0.3;
      if (dist(me.pos, server.pos) > slack) me.pos = add(me.pos, scale(sub(server.pos, me.pos), 0.15));
      return me.pos;
    },
  };
}
