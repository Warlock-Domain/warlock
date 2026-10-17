import { HP_MAX, SHRINK_EVERY, STUN_SPEED } from '../shared/constants.ts';
import { isCharacter } from '../shared/characters.ts';
import type { PublicRoom, ServerMsg, Snap } from '../shared/protocol.ts';
import type { SimEvent } from '../shared/sim.ts';
import { decodeSnap, type SnapView } from '../shared/snapshot.ts';
import { ACTIVE_ITEMS, ITEM_CAST, SCOURGE, itemStats, type ItemId } from '../shared/items.ts';
import { CAST_POINT, SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { dist, len, type Vec } from '../shared/vec.ts';
import { createInput } from './input.ts';
import { createInterp } from './interp.ts';
import { connect } from './net.ts';
import { createPredict } from './predict.ts';
import { createScene, type WizDraw } from './scene.ts';
import { createSound, type SoundKind } from './sound.ts';
import { askName, banner, createRoomUi, renderLobby, screen, toast, type RoomInfo } from './ui.ts';

// som de cada magia: as novas reaproveitam os sons que já existem
const SPELL_SOUND: Record<SpellId, SoundKind> = {
  fireball: 'fireball', lightning: 'lightning', homing: 'homing', shield: 'shield', teleport: 'teleport',
  swap: 'teleport', grip: 'lightning', meteor: 'fireball', rush: 'shield', cluster: 'fireball',
};

// localStorage pode falhar (aba anônima, dados bloqueados): cai para a memória
const memory = new Map<string, string>();
const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k) ?? memory.get(k) ?? null;
    } catch {
      return memory.get(k) ?? null;
    }
  },
  set(k: string, v: string) {
    memory.set(k, v);
    try {
      localStorage.setItem(k, v);
    } catch {
      // só na memória
    }
  },
};

// ?as=nome dá outra identidade na mesma máquina (testar com várias abas)
const as = new URLSearchParams(location.search).get('as')?.replace(/[^a-z0-9]/gi, '').slice(0, 12) ?? '';
const PID = 'warlock:pid' + (as && ':' + as);
const NAME = 'warlock:name' + (as && ':' + as);
const CHAR = 'warlock:char' + (as && ':' + as);
const playerId = store.get(PID) ?? crypto.randomUUID();
store.set(PID, playerId);

const ui = document.getElementById('ui')!;
const canvas = document.getElementById('c') as HTMLCanvasElement;
addEventListener('hashchange', () => location.reload());

async function main() {
  const name = store.get(NAME) || (await askName(ui, as));
  store.set(NAME, name);
  const id = location.hash.slice(1).toUpperCase();
  if (/^[A-Z]{4}$/.test(id)) startRoom(id, name);
  else startLobby(name);
}

function startLobby(name: string) {
  document.body.className = 'in-lobby';
  let rooms: RoomInfo[] | null = null;
  const draw = () =>
    renderLobby(ui, name, rooms, create, async () => {
      name = await askName(document.body, name);
      store.set(NAME, name);
      draw();
    });
  async function create() {
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      location.hash = (await res.json()).id;
    } catch {
      toast('Não deu para criar a sala. Tente de novo.');
    }
  }
  connect('/ws/lobby', (m) => {
    if (m.t !== 'rooms') return;
    rooms = (m.rooms as RoomInfo[]).sort((a, b) => Number(b.phase === 'lobby') - Number(a.phase === 'lobby'));
    draw();
  }, () => {});
  draw();
}

function startRoom(code: string, name: string) {
  document.body.className = 'in-room';
  // volumes guardados no navegador (0 a 1); quem tinha deixado mudo na versão antiga começa em zero
  const readVol = (k: string, fallback: number) => {
    const n = Number(store.get(k));
    return Number.isFinite(n) && store.get(k) !== null ? Math.max(0, Math.min(1, n)) : fallback;
  };
  const oldMute = store.get('warlock:mute') === '1';
  const vol = { sfx: readVol('warlock:vol-sfx', oldMute ? 0 : 1), music: readVol('warlock:vol-music', oldMute || store.get('warlock:music') === '0' ? 0 : 0.7) };
  const sound = createSound(() => vol);
  let room: PublicRoom | null = null;
  let me = playerId;
  let online = false;
  let armed: SpellId | ItemId | null = null;
  let seq = 0;
  const sentAt = new Map<number, number>();
  let lastSnap: Snap | null = null;
  const justCast = new Map<string, number>();
  let scourgeUntil = 0;
  let follow = true;

  const view = createRoomUi(ui, code, {
    start: (bots, mode) => net.send({ t: 'start', bots, mode }),
    buy: (spell) => net.send({ t: 'buy', spell }),
    buyItem: (item) => net.send({ t: 'buyItem', item }),
    buyMastery: (mastery) => net.send({ t: 'buyMastery', mastery }),
    kick: (target) => net.send({ t: 'kick', target }),
    undo: (key) => net.send({ t: 'undo', key }),
    useItem: (item) => input.itemButton(item),
    pick: (character) => {
      store.set(CHAR, character);
      net.send({ t: 'pick', character });
    },
    ready: () => net.send({ t: 'ready' }),
    spell: (s) => input.button(s),
    volumes: () => vol,
    setVolume: (kind, value) => {
      vol[kind] = value;
      store.set(kind === 'sfx' ? 'warlock:vol-sfx' : 'warlock:vol-music', String(value));
      sound.refresh();
      if (kind === 'sfx') sound.play('click');
    },
    click: () => sound.play('click'),
  });
  const scene = createScene(canvas, document.getElementById('labels')!);
  const interp = createInterp();
  const predict = createPredict();

  const myWizard = (s: SnapView | null) => s?.wizards.find((w) => w.id === me) ?? null;

  function command(msg: { t: 'move'; x: number; y: number } | { t: 'stop' } | { t: 'cast'; spell: SpellId; x: number; y: number } | { t: 'item'; item: ItemId; x: number; y: number }) {
    seq++;
    sentAt.set(seq, performance.now());
    if (sentAt.size > 50) sentAt.delete(sentAt.keys().next().value!);
    net.send({ ...msg, seq });
  }

  const input = createInput(canvas, {
    pick: (x, y) => scene.pick(x, y),
    move(to) {
      command({ t: 'move', x: to.x, y: to.y });
      predict.move(to);
      scene.clickMarker(to, false);
    },
    stop() {
      command({ t: 'stop' });
      predict.stop();
    },
    cast(spell, at) {
      const i = SPELL_IDS.indexOf(spell);
      const mine = room?.players.find((p) => p.id === me);
      if (!mine?.spells[spell]) return toast('Você ainda não tem essa magia. Compre na loja.');
      if ((lastSnap?.cd[i] ?? 0) > 0.1 || performance.now() < (justCast.get(spell) ?? 0) || performance.now() < scourgeUntil) return;
      // até a recarga chegar do servidor, não repete a mesma magia (senão a animação e o som tocam sem sair nada)
      justCast.set(spell, performance.now() + 120 + CAST_POINT[spell] * 1000 + predict.rtt() * 1000);
      command({ t: 'cast', spell, x: at.x, y: at.y });
      // conjurando, o mago fica parado e o clique de andar espera a magia sair (o servidor faz o mesmo)
      predict.hold(CAST_POINT[spell]);
      scene.castLocal(me, spell);
      scene.clickMarker(at, true);
      sound.play(SPELL_SOUND[spell]);
    },
    useItem(item, at) {
      const mine = room?.players.find((p) => p.id === me);
      if (!mine?.items[item]) return toast('Você ainda não tem esse item. Compre na loja.');
      if ((lastSnap?.icd[ACTIVE_ITEMS.indexOf(item)] ?? 0) > 0.1 || performance.now() < (justCast.get(item) ?? 0) || performance.now() < scourgeUntil) return;
      // Flagelo em preparo: o servidor ignora outras magias até ele explodir
      if (item === 'scourge') scourgeUntil = performance.now() + SCOURGE.windup * 1000;
      justCast.set(item, performance.now() + 120 + (ITEM_CAST[item] ?? 0) * 1000 + predict.rtt() * 1000);
      command({ t: 'item', item, x: at.x, y: at.y });
      predict.hold(ITEM_CAST[item] ?? 0);
      scene.clickMarker(at, true);
    },
    center: () => (follow = true),
    armedChanged: (s) => (armed = s),
  });

  // o personagem escolhido fica salvo e é reenviado ao entrar em qualquer sala
  const saved = store.get(CHAR);
  const net = connect('/ws/room/' + code, onMsg, () => {
    net.send({ t: 'hello', playerId, name });
    if (isCharacter(saved)) net.send({ t: 'pick', character: saved });
  }, (on) => {
    online = on;
    view.setOnline(on);
  });
  // a sala conta a CPU entre mensagens; o "estou aqui" a cada 5 s mantém a conta zerada durante a partida
  setInterval(() => room && room.phase !== 'lobby' && room.phase !== 'end' && net.send({ t: 'alive' }), 5000);

  function names() {
    return new Map(room?.players.map((p) => [p.id, p.name]) ?? []);
  }

  function onEvents(events: SimEvent[]) {
    const pos = myWizard(interp.latest())?.pos;
    const near = (x: number, y: number) => (pos ? Math.max(0.25, 1 - dist(pos, { x, y }) / 20) : 0.6);
    const who = names();
    for (const e of events) {
      if (e.k === 'cast' && e.id !== me) {
        const w = interp.latest()?.wizards.find((z) => z.id === e.id);
        sound.play(SPELL_SOUND[e.spell], w ? near(w.pos.x, w.pos.y) : 0.5);
      } else if (e.k === 'hit') sound.play('hit', near(e.x, e.y));
      else if (e.k === 'pillar') sound.play('hit', near(e.x, e.y) * 0.6);
      else if (e.k === 'grip') sound.play('hit', near(e.x, e.y));
      else if (e.k === 'reflect') sound.play('reflect', near(e.x, e.y));
      else if (e.k === 'teleport' && e.id === me) predict.teleported(e.to);
      else if (e.k === 'item') sound.play(e.item === 'redirector' ? 'teleport' : e.item === 'pact' ? 'shield' : 'homing', 0.7);
      else if (e.k === 'scourge') sound.play('death', near(e.x, e.y));
      else if (e.k === 'shrink') sound.play('shrink');
      else if (e.k === 'death') {
        sound.play('death');
        const dead = who.get(e.id) ?? '?';
        if (e.by) banner(e.by === me ? `Você derrubou ${dead}!` : e.id === me ? `${who.get(e.by)} te derrubou!` : `${who.get(e.by)} derrubou ${dead}!`, e.by === me ? 'good' : e.id === me ? 'bad' : '');
        else banner(e.id === me ? 'Você caiu na lava!' : `${dead} caiu na lava!`, e.id === me ? 'bad' : '');
      }
    }
    scene.onEvents(events, who);
  }

  let lastPhase = '';
  function onMsg(m: ServerMsg) {
    if (m.t === 'error') {
      if (m.code === 'not_found') return screen(ui, 'Sala não encontrada', 'Ela pode ter fechado por ficar vazia.', 'Ver salas', () => (location.hash = ''));
      // sem parar a conexão, ela se reconectaria sozinha e derrubaria a outra aba, num vaivém sem fim
      if (m.code === 'other_tab' || m.code === 'full') net.stop();
      if (m.code === 'other_tab') return screen(ui, 'Sala aberta em outra aba', 'Continue por lá ou recarregue esta.', 'Recarregar', () => location.reload());
      if (m.code === 'full') return screen(ui, 'Sala cheia', 'Já tem 8 magos nesta sala.', 'Ver salas', () => (location.hash = ''));
      return toast(m.msg);
    }
    if (m.t === 'room') {
      const prev = room;
      room = m.room;
      me = m.you;
      view.update(room, me, online);
      scene.preload(room.players.map((p) => p.character));
      if (room.phase !== lastPhase) onPhase(prev);
      lastPhase = room.phase;
      return;
    }
    lastSnap = m;
    predict.setSpeed(m.sp);
    const acked = sentAt.get(m.ack);
    if (acked !== undefined) {
      predict.setRtt(performance.now() - acked);
      sentAt.delete(m.ack);
    }
    if (!room) return;
    interp.push(decodeSnap(m, room.ids), performance.now() / 1000);
    if (m.e) onEvents(m.e);
  }

  function onPhase(prev: PublicRoom | null) {
    if (!room) return;
    // na contagem o servidor ainda não aceita comandos: liberar só quando a rodada começa
    input.setEnabled(room.phase === 'playing');
    sound.setAmbience(room.phase !== 'lobby' && room.phase !== 'end');
    if (room.phase === 'countdown') {
      interp.reset();
      predict.reset();
      follow = true;
      banner(`Rodada ${room.round}`);
      [3, 2, 1].forEach((_, i) => setTimeout(() => sound.play('beep'), i * 1000));
    } else if (room.phase === 'playing') {
      banner('Já!', 'good');
      sound.play('go');
    } else if (room.phase === 'roundEnd') {
      const w = room.players.find((p) => p.id === room!.lastRoundWinner);
      banner(!w ? (room.mode === 'deathmatch' ? 'Fim da rodada' : 'Ninguém sobrou!') : room.mode === 'deathmatch' ? (w.id === me ? 'Você fez mais abates!' : `${w.name} fez mais abates!`) : w.id === me ? 'Você venceu a rodada!' : `${w.name} venceu a rodada!`, w?.id === me ? 'good' : '');
    } else if (room.phase === 'end' && prev) {
      const w = room.players.find((p) => p.id === room!.winner);
      banner(!w ? 'Partida encerrada' : w.id === me ? 'Você venceu a partida!' : `${w.name} venceu!`, 'good');
    }
  }

  let lastFrame = performance.now();
  function frame() {
    requestAnimationFrame(frame);
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - lastFrame) / 1000);
    lastFrame = nowMs;
    const s = interp.sample(nowMs / 1000);
    const latest = interp.latest();
    const playing = room && (room.phase === 'countdown' || room.phase === 'playing' || room.phase === 'roundEnd');
    const colorOf = new Map(room?.players.map((p) => [p.id, p]) ?? []);
    const wizards: WizDraw[] = [];
    let myPos: Vec | null = null;
    if (playing && s) {
      for (const w of s.wizards) {
        const p = colorOf.get(w.id);
        let pos = w.pos;
        let moving = len(w.vel) < STUN_SPEED && w.alive;
        if (w.id === me && latest) {
          const server = myWizard(latest);
          if (server && room?.phase === 'playing') pos = predict.frame(server, dt);
          myPos = pos;
        }
        const prevDraw = drawn.get(w.id);
        if (prevDraw) moving = moving && dist(prevDraw, pos) > 0.004;
        drawn.set(w.id, pos);
        wizards.push({ ...w, pos, hpMax: HP_MAX + (p ? itemStats(p.items).hp : 0), color: p?.color ?? 0, character: p?.character ?? 'mage', name: p?.name ?? '?', moving, cheer: room?.phase === 'roundEnd' && room.lastRoundWinner === w.id });
      }
    }
    const shrinkIn = s && room?.phase === 'playing' && room.mode !== 'deathmatch' ? s.shrinkAt - s.time : null;
    scene.render({
      arenaR: s?.arenaR ?? 11,
      shrinkIn: shrinkIn ?? SHRINK_EVERY,
      wizards,
      projectiles: playing && s ? s.projectiles : [],
      pillars: playing && s ? s.pillars : [],
      follow: follow ? myPos : null,
    });
    const respawnIn = room?.phase === 'playing' ? (lastSnap?.rs?.[room.ids.indexOf(me)] ?? 0) : 0;
    view.frame(lastSnap?.cd ?? [], lastSnap?.icd ?? [], armed, shrinkIn, respawnIn);
  }
  const drawn = new Map<string, Vec>();
  void scene.ready.then(() => requestAnimationFrame(frame), () => toast('Não deu para carregar o mago. Recarregue a página.'));
}

void main();
