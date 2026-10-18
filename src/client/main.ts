import { edgeAt, type ArenaId } from '../shared/arena.ts';
import { ARENA_MIN, HP_MAX, HP_REGEN, RUNE, SHRINK_EVERY, STUN_SPEED, type RuneKind } from '../shared/constants.ts';
import { isCharacter } from '../shared/characters.ts';
import type { PublicRoom, ServerMsg, Snap } from '../shared/protocol.ts';
import type { SimEvent } from '../shared/sim.ts';
import { decodeSnap, type SnapView } from '../shared/snapshot.ts';
import { ACTIVE_ITEMS, ITEM_CAST, SCOURGE, itemStats, type ItemId } from '../shared/items.ts';
import { CAST_POINT, SPELLS, SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { dist, len, type Vec } from '../shared/vec.ts';
import { coachTip } from './coach.ts';
import { reachOf } from './reach.ts';
import { ITEM_ICON, RUNE_ICON, SOURCE_ICON, icon } from './icons.ts';
import { createInput } from './input.ts';
import { isPadMode, labelOf } from './keys.ts';
import { rumble, startPad } from './gamepad.ts';
import { createInterp } from './interp.ts';
import { connect } from './net.ts';
import { createPredict } from './predict.ts';
import { createScene, type WizDraw } from './scene.ts';
import { createSound, type SoundKind } from './sound.ts';
import { TEAM_NAMES, askName, banner, createRoomUi, renderLobby, screen, toast, type RoomInfo } from './ui.ts';
import { TAUNTS } from '../shared/taunts.ts';

// som de cada magia: as novas reaproveitam os sons que já existem
const SPELL_SOUND: Record<SpellId, SoundKind> = {
  fireball: 'fireball', lightning: 'lightning', homing: 'homing', shield: 'shield', teleport: 'teleport',
  swap: 'teleport', grip: 'lightning', meteor: 'fireball', rush: 'shield', cluster: 'fireball',
  boomerang: 'homing', thrust: 'teleport', gravity: 'homing', rockpillar: 'shield', bouncer: 'lightning',
  drain: 'homing', snowball: 'fireball', twin: 'homing', magnetize: 'lightning', recharge: 'homing',
  alteration: 'teleport', link: 'lightning', windwalk: 'shield', splitter: 'fireball', warpzone: 'shield',
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
  let offline = false;
  const draw = () =>
    renderLobby(ui, name, rooms, offline, create, async () => {
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
  }, () => {}, (on) => {
    // sem a conexão da lista, o lobby mostra o erro em vez de "Carregando salas…" para sempre
    if (offline === !on) return;
    offline = !on;
    draw();
  });
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
  // círculo de alcance: tecla segurada, magia escolhida no botão (toque no chão para lançar) ou controle mirando
  let held: SpellId | ItemId | null = null;
  let padAiming: SpellId | ItemId | null = null;
  let hovered: SpellId | ItemId | null = null; // mouse em cima da magia na barra
  let seq = 0;
  const sentAt = new Map<number, number>();
  let lastSnap: Snap | null = null;
  // a latência só existe depois do primeiro comando confirmado (antes, predict.rtt() é um chute)
  let rttSeen = false;
  // modo treino (só para quem apertou o botão): dicas nas primeiras rodadas; playingAt marca o "Já!"
  let training = false;
  let arenaId: ArenaId = 'circle'; // formato da arena da rodada (vem na mensagem 'room')
  let playingAt = 0;
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const justCast = new Map<string, number>();
  let scourgeUntil = 0;
  let follow = true;
  // espectador: quem a câmera segue e o pedido de troca (+1 próximo, −1 anterior) do quadro seguinte
  let watchId: string | null = null;
  let watchStep = 0;
  // efeitos visuais Completo/Leve guardados no navegador; sem escolha, quem pede menos movimento ao sistema começa no Leve
  let fxLite = (store.get('warlock:fx') ?? (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'lite' : 'full')) === 'lite';
  document.body.classList.toggle('fx-lite', fxLite);

  const view = createRoomUi(ui, code, {
    start: (bots, mode, shuffle, opts) => {
      training = false; // partida normal depois de um treino: sem dicas
      net.send({ t: 'start', bots, mode, shuffle, opts });
    },
    train: (opts) => {
      training = true;
      net.send({ t: 'start', bots: 3, mode: 'rounds', shuffle: true, opts });
    },
    buy: (spell) => net.send({ t: 'buy', spell }),
    buyItem: (item) => net.send({ t: 'buyItem', item }),
    kick: (target) => net.send({ t: 'kick', target }),
    vote: (kind, target) => net.send({ t: 'vote', kind, target }),
    ballot: (yes) => net.send({ t: 'ballot', yes }),
    undo: (key) => net.send({ t: 'undo', key }),
    sell: (key) => net.send({ t: 'sell', key }),
    taunt: (i) => net.send({ t: 'taunt', i }),
    useItem: (item) => input.itemButton(item),
    pick: (character) => {
      store.set(CHAR, character);
      net.send({ t: 'pick', character });
    },
    ready: () => net.send({ t: 'ready' }),
    spell: (s) => input.button(s),
    hover: (a) => (hovered = a),
    volumes: () => vol,
    setVolume: (kind, value) => {
      vol[kind] = value;
      store.set(kind === 'sfx' ? 'warlock:vol-sfx' : 'warlock:vol-music', String(value));
      sound.refresh();
      if (kind === 'sfx') sound.play('click');
    },
    click: () => sound.play('click'),
    fxLite: () => fxLite,
    setFxLite: (lite) => {
      fxLite = lite;
      store.set('warlock:fx', lite ? 'lite' : 'full');
      document.body.classList.toggle('fx-lite', lite);
      scene.setFx(lite);
    },
    spellReady: () => sound.play('ready', 0.8),
    watch: (step) => (watchStep = step),
  });
  addEventListener('keydown', (e) => {
    // ← → já trocam o período do placar quando ele está aberto (ui.ts marca o evento; por isso este ouvinte vem depois do createRoomUi)
    if (!watchId || e.defaultPrevented || (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight')) return;
    watchStep = e.code === 'ArrowLeft' ? -1 : 1;
    e.preventDefault();
  });
  const scene = createScene(canvas, document.getElementById('labels')!);
  scene.setFx(fxLite);
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
      if ((lastSnap?.cd[i] ?? 0) > 0.1 || performance.now() < (justCast.get(spell) ?? 0) || (performance.now() < scourgeUntil && spell !== 'teleport')) return;
      if (spell === 'teleport') scourgeUntil = 0; // o Teleporte cancela o Flagelo em preparo
      if (spell === 'rush') predict.stop(); // o avanço esquece o destino de andar, como no servidor
      // até a recarga chegar do servidor, não repete a mesma magia (senão a animação e o som tocam sem sair nada)
      justCast.set(spell, performance.now() + 120 + CAST_POINT[spell] * 1000 + predict.rtt() * 1000);
      command({ t: 'cast', spell, x: at.x, y: at.y });
      // conjurando, o mago fica parado e o clique de andar espera a magia sair (o servidor faz o mesmo)
      predict.hold(CAST_POINT[spell]);
      scene.castLocal(me, spell, at);
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
    center: () => {
      follow = true;
      scene.resetCamera();
    },
    zoom: (d) => scene.zoomBy(d),
    pan: (dx, dy) => scene.panBy(dx, dy),
    armedChanged: (s) => (armed = s),
    preview: (s) => (held = s),
    padRange: (s) => (padAiming = s),
    me: () => (myWizard(interp.latest())?.alive ? (drawn.get(me) ?? null) : null),
    aim: (at) => scene.aim(at),
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

  const RUNE_NAME: Record<RuneKind, string> = { haste: 'Runa da Pressa', fury: 'Runa da Fúria', shield: 'Runa do Escudo', recharge: 'Runa da Recarga' };
  const RUNE_TEXT = (k: RuneKind) => [icon(RUNE_ICON[k]), ' ' + RUNE_NAME[k]];
  // o que cada runa faz, com os números do código (pedido do Fernando, 18/10: dizer ao pegar)
  const RUNE_EFFECT: Record<RuneKind, string> = {
    haste: `anda ${Math.round(RUNE.haste * 100)}% mais rápido por ${RUNE.secs} s`,
    fury: `magias causam ${Math.round(RUNE.fury * 100)}% mais dano por ${RUNE.secs} s`,
    shield: `leva ${Math.round(RUNE.armor * 100)}% menos dano por ${RUNE.secs} s`,
    recharge: `recargas ${Math.round(RUNE.cdr * 100)}% mais rápidas por ${RUNE.secs} s`,
  };
  const MULTI_TEXT = ['', '', 'Abate duplo!', 'Abate triplo!', 'Massacre!'];
  const SPREE_TEXT: Record<number, string> = { 3: 'Matança', 5: 'Fúria assassina', 7: 'sequência Imparável', 10: 'sequência Lendária' };
  let live: Record<string, { dmg: number; kills: number; taken?: number }> = {};
  function onEvents(events: SimEvent[]) {
    const pos = myWizard(interp.latest())?.pos;
    const near = (x: number, y: number) => (pos ? Math.max(0.25, 1 - dist(pos, { x, y }) / 20) : 0.6);
    const who = names();
    let liveChanged = false;
    let shout = '';
    let voice: string | undefined;
    const notes: string[] = [];
    for (const e of events) {
      // dano e abates da rodada ao vivo na lista do canto
      if (e.k === 'hit' && e.by !== e.id && e.dmg > 0) {
        (live[e.by] ??= { dmg: 0, kills: 0 }).dmg += e.dmg;
        liveChanged = true;
      } else if (e.k === 'death' && e.by && e.by !== e.id) {
        (live[e.by] ??= { dmg: 0, kills: 0 }).kills++;
        liveChanged = true;
      }
      // dano levado por mim na rodada (sem a lava): a ficha mostra quanto o empurrão já cresceu
      if (e.k === 'hit' && e.id === me && e.dmg > 0) {
        const mine = (live[me] ??= { dmg: 0, kills: 0 });
        mine.taken = (mine.taken ?? 0) + e.dmg;
        liveChanged = true;
      }
      // controle: vibra ao levar golpe forte e ao morrer
      // golpe recebido: seta na borda da tela do lado de quem bateu (a câmera não gira, então o ângulo do chão vale na tela)
      if (e.k === 'hit' && e.id === me && e.dmg > 0 && e.by !== me) {
        const from = interp.latest()?.wizards.find((z) => z.id === e.by)?.pos;
        if (from && dist(from, { x: e.x, y: e.y }) > 0.5) view.hitFrom(Math.atan2(from.y - e.y, from.x - e.x));
      }
      if (e.k === 'hit' && e.id === me && e.dmg >= 60) rumble(Math.min(1, e.dmg / 160), 200);
      else if (e.k === 'death' && e.id === me) rumble(1, 500);
      if (e.k === 'cast' && e.id !== me) {
        const w = interp.latest()?.wizards.find((z) => z.id === e.id);
        sound.play(SPELL_SOUND[e.spell], w ? near(w.pos.x, w.pos.y) : 0.5);
      } else if (e.k === 'hit') sound.play(e.dmg >= 100 ? 'hitHeavy' : e.dmg < 50 ? 'hitLight' : 'hit', near(e.x, e.y));
      else if (e.k === 'pillar') sound.play('hit', near(e.x, e.y) * 0.6);
      else if (e.k === 'grip') sound.play('hit', near(e.x, e.y));
      else if (e.k === 'reflect') sound.play('reflect', near(e.x, e.y));
      else if (e.k === 'teleport' && e.id === me) predict.teleported(e.to);
      else if (e.k === 'item') sound.play(e.item === 'redirector' ? 'teleport' : e.item === 'pact' ? 'shield' : 'homing', 0.7);
      else if (e.k === 'scourge') sound.play('death', near(e.x, e.y));
      else if (e.k === 'shrink') sound.play('shrink');
      else if (e.k === 'chest') toast('Baú de ouro na arena! Quebre e fique em cima do ouro', 'gold');
      else if (e.k === 'loot') sound.play('go', near(e.x, e.y));
      else if (e.k === 'sudden') {
        sound.play('shrink');
        banner([icon(SOURCE_ICON.lava), ' Morte súbita! A arena encolhe a cada 5 s'], 'bad');
      } else if (e.k === 'rune') toast([...RUNE_TEXT(e.kind), ` apareceu na arena (${RUNE_EFFECT[e.kind]})`], 'info');
      else if (e.k === 'runeTake') {
        sound.play('shield', e.id === me ? 1 : 0.5);
        toast([`${e.id === me ? 'Você pegou' : (who.get(e.id) ?? '?') + ' pegou'} `, ...RUNE_TEXT(e.kind), `: ${RUNE_EFFECT[e.kind]}`], e.id === me ? 'good' : 'info');
      } else if (e.k === 'streak') {
        const name = e.id === me ? 'Você' : (who.get(e.id) ?? '?');
        // uma voz por lote de eventos: o Quebra-combo vem primeiro, depois o multi e por último a Matança
        const say = (file: string) => voice ??= file;
        if (e.kind === 'multi') {
          shout = `${name}: ${MULTI_TEXT[Math.min(e.n, 4)]}`;
          if (e.n >= 4) say('ultra_kill');
          else if (e.n === 3) say('multi_kill');
          else sound.play('go');
        } else if (e.kind === 'spree') {
          notes.push(`${name} está numa ${SPREE_TEXT[e.n] ?? 'sequência'} (${e.n} abates sem morrer)`);
          say('laugh');
        } else {
          notes.push(`${name} quebrou a sequência de ${e.victim === me ? 'você' : (who.get(e.victim ?? '') ?? '?')} (Quebra-combo: ouro extra)`);
          say('combo_breaker');
        }
      } else if (e.k === 'aegis') {
        sound.play('shield');
        banner([icon(ITEM_ICON.aegis), e.id === me ? ' A Égide te tirou da lava e quebrou' : ` A Égide tirou ${who.get(e.id) ?? '?'} da lava`], e.id === me ? 'good' : '');
      }
      else if (e.k === 'death') {
        // fora da pedra: mergulho na lava (chiado e bolhas) em vez da explosão
        const snap = interp.latest();
        const w = snap?.wizards.find((z) => z.id === e.id);
        sound.play(w && snap && edgeAt(arenaId, snap.arenaR, w.pos) < 0.3 ? 'splash' : 'death', w ? near(w.pos.x, w.pos.y) : 1);
        const dead = who.get(e.id) ?? '?';
        // todo abate vai para o feed do canto; a faixa grande fica só para o que envolve você
        view.kill(e.by, e.id, e.src);
        if (e.by === me && e.id !== me) banner(`Você derrubou ${dead}!`, 'good');
        else if (e.id === me) banner(e.by && e.by !== me ? `${who.get(e.by)} te derrubou!` : 'Você caiu na lava!', 'bad');
      }
    }
    if (shout) banner(shout, 'good');
    if (notes.length) toast(notes.join(' · '));
    if (voice) void sound.taunt(voice);
    if (liveChanged) view.live(live);
    scene.onEvents(events, who);
  }

  let lastPhase = '';
  function onMsg(m: ServerMsg) {
    if (m.t === 'error') {
      if (m.code === 'not_found') return screen(ui, 'Sala não encontrada', 'Ela pode ter fechado por ficar vazia.', 'Ver salas', () => (location.hash = ''));
      // sem parar a conexão, ela se reconectaria sozinha e derrubaria a outra aba, num vaivém sem fim
      if (m.code === 'other_tab' || m.code === 'full' || m.code === 'kicked') net.stop();
      if (m.code === 'kicked') return screen(ui, 'Você foi removido da sala por votação', 'Não dá para voltar a esta sala. Entre em outra ou crie uma.', 'Ver salas', () => (location.hash = ''));
      if (m.code === 'other_tab') return screen(ui, 'Sala aberta em outra aba', 'Continue por lá ou recarregue esta.', 'Recarregar', () => location.reload());
      if (m.code === 'full') return screen(ui, 'Sala cheia', 'Já tem 8 magos nesta sala.', 'Ver salas', () => (location.hash = ''));
      sound.play('error');
      return toast(m.msg, 'bad');
    }
    if (m.t === 'room') {
      const prev = room;
      room = m.room;
      me = m.you;
      arenaId = room.arena ?? arenaId; // na loja não há rodada: fica a última arena
      view.update(room, me, online);
      // compra na loja: o ouro caiu → som de moedas
      if (prev?.phase === 'shop' && room.phase === 'shop') {
        const was = prev.players.find((p) => p.id === me)?.gold, now = room.players.find((p) => p.id === me)?.gold;
        if (was !== undefined && now !== undefined && now < was) sound.play('buy');
      }
      scene.preload(room.players.map((p) => p.character));
      if (room.phase !== lastPhase) onPhase(prev);
      lastPhase = room.phase;
      return;
    }
    if (m.t === 'taunt') {
      const t = TAUNTS[m.i];
      if (!t) return;
      void sound.taunt(t.id);
      if (!scene.bubble(m.id, t.text)) toast(`${room?.players.find((p) => p.id === m.id)?.name ?? '?'}: ${t.text}`);
      return;
    }
    lastSnap = m;
    predict.setSpeed(m.sp);
    const acked = sentAt.get(m.ack);
    if (acked !== undefined) {
      predict.setRtt(performance.now() - acked);
      rttSeen = true;
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
    sound.duck(room.phase === 'shop');
    if (room.phase === 'countdown') {
      live = {};
      view.live(live);
      interp.reset();
      predict.reset();
      follow = true;
      watchId = null;
      // modo Times: avisa em que time a pessoa está nesta rodada
      const team = room.mode === 'teams' ? room.players.find((p) => p.id === me)?.team : null;
      banner(team != null ? `Rodada ${room.round} · Você está no time ${TEAM_NAMES[team]}` : `Rodada ${room.round}`);
      [3, 2, 1].forEach((_, i) => setTimeout(() => sound.play('beep'), i * 1000));
    } else if (room.phase === 'playing') {
      playingAt = performance.now();
      banner('Já!', 'good');
      sound.play('go');
    } else if (room.phase === 'roundEnd') {
      const w = room.players.find((p) => p.id === room!.lastRoundWinner);
      const myTeam = room.players.find((p) => p.id === me)?.team;
      // vencedor (ou o time dele) vê a faixa VITÓRIA com confete e ouve o arpejo; quem jogou e perdeu ouve o arpejo descendo
      const won = !!w && (room.mode === 'teams' && w.team !== null ? w.team === myTeam : w.id === me);
      if (w && room.players.some((p) => p.id === me)) sound.play(won ? 'winRound' : 'loseRound');
      if (won) banner(room.mode === 'teams' && w!.team !== null ? `Vitória do time ${TEAM_NAMES[w!.team]}!` : room.mode === 'deathmatch' ? 'Vitória! Mais abates' : 'Vitória!', 'win');
      else if (room.mode === 'teams' && w && w.team !== null) banner(`Time ${TEAM_NAMES[w.team]} venceu a rodada!`);
      else banner(!w ? (room.mode === 'deathmatch' ? 'Fim da rodada' : 'Ninguém sobrou!') : room.mode === 'deathmatch' ? (w.id === me ? 'Você fez mais abates!' : `${w.name} fez mais abates!`) : w.id === me ? 'Você venceu a rodada!' : `${w.name} venceu a rodada!`, w?.id === me ? 'good' : '');
    } else if (room.phase === 'end' && prev) {
      const w = room.players.find((p) => p.id === room!.winner);
      const myTeam = room.players.find((p) => p.id === me)?.team;
      const won = !!w && (room.winnerTeam !== null ? myTeam === room.winnerTeam : w.id === me);
      if (w) sound.play(won ? 'winRound' : 'loseRound');
      // o cartão do fim já mostra o vencedor e o pódio: a faixa grande só para quem venceu (antes cobria o pódio)
      if (won) banner('Vitória na partida!', 'win');
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
    // modo Times: cor do time no anel e na barra; no fim da rodada o time vencedor inteiro comemora
    const teams = room?.mode === 'teams';
    const winTeam = teams ? colorOf.get(room!.lastRoundWinner ?? '')?.team : null;
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
        wizards.push({ ...w, pos, hpMax: HP_MAX + (p ? itemStats(p.items).hp : 0), regen: HP_REGEN + (p ? itemStats(p.items).regen : 0), bot: p?.bot ? room?.opts.difficulty : null, color: p?.color ?? 0, character: p?.character ?? 'mage', name: p?.name ?? '?', shieldR: p?.spells.shield ? SPELLS.shield.levels[p.spells.shield - 1].radius : 0, loot: lastSnap?.lp?.[room?.ids.indexOf(w.id) ?? -1] ?? 0, moving, cheer: room?.phase === 'roundEnd' && (room.lastRoundWinner === w.id || (teams && p?.team != null && p.team === winTeam)), team: teams ? p?.team : null });
      }
    }
    // perigo: vida abaixo de 25% e pé na lava (mesma regra da simulação: fora do raio da arena)
    const meW = room?.phase === 'playing' ? myWizard(latest) : null;
    const meP = colorOf.get(me);
    const low = !!meW?.alive && !!meP && meW.hp < 0.25 * (HP_MAX + itemStats(meP.items).hp);
    const lava = !!meW?.alive && !!latest && edgeAt(arenaId, latest.arenaR, meW.pos) < 0;
    view.danger(low, lava);
    const shrinkIn = s && room?.phase === 'playing' && room.mode !== 'deathmatch' ? s.shrinkAt - s.time : null;
    // espectador: morto na rodada (ou só assistindo), a câmera segue o vivo com mais vida; ← → ou os botões trocam
    const alive = room?.phase === 'playing' && s && !meW?.alive ? wizards.filter((w) => w.alive && w.id !== me && !(w.status & 2048)) : [];
    let watched = alive.find((w) => w.id === watchId);
    if (!watched && alive.length) watched = alive.reduce((a, w) => (w.hp > a.hp ? w : a));
    if (watchStep && watched) watched = alive[(alive.indexOf(watched) + watchStep + alive.length) % alive.length];
    watchStep = 0;
    watchId = watched?.id ?? null;
    view.watching(watched?.name ?? null);
    if (training && room) view.coach(meP ? coachTip({ phase: room.phase, round: room.round, playingFor: (nowMs - playingAt) / 1000, shrinkIn, low, lava, alive: !!meW?.alive, touch, fireKey: isPadMode() ? 'A' : labelOf('fireball'), fire: meP.spells.fireball > 0 }) : null);
    scene.render({
      arena: arenaId,
      arenaR: s?.arenaR ?? 11,
      shrinkIn: shrinkIn ?? SHRINK_EVERY,
      wizards,
      projectiles: playing && s ? s.projectiles : [],
      pillars: playing && s ? s.pillars : [],
      loots: playing && s ? s.loots : [],
      runes: playing && s ? s.runes : [],
      zones: playing && s ? s.zones : [],
      follow: watched ? watched.pos : follow ? myPos : null,
      lock: !!watched,
    });
    // círculo de alcance em volta do próprio mago (some ao lançar ou cancelar)
    const showing = room?.phase === 'playing' && meW?.alive && myPos ? (held ?? armed ?? padAiming ?? hovered) : null;
    scene.range(showing && myPos ? myPos : null, showing && meP ? reachOf(showing, meP.spells, meP.items) : 0);
    const respawnIn = room?.phase === 'playing' ? (lastSnap?.rs?.[room.ids.indexOf(me)] ?? 0) : 0;
    // no tamanho mínimo a arena não encolhe mais: o aviso some
    view.frame(lastSnap?.cd ?? [], lastSnap?.icd ?? [], armed, s && s.arenaR > ARENA_MIN + 0.01 ? shrinkIn : null, respawnIn, myWizard(latest)?.status ?? 0, rttSeen ? predict.rtt() * 1000 : null);
  }
  const drawn = new Map<string, Vec>();
  void scene.ready.then(() => requestAnimationFrame(frame), () => toast('Não deu para carregar o mago. Recarregue a página.'));
}

startPad(toast);
void main();
