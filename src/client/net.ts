import { decodeMessage } from './net-message.ts';
import type { ClientMsg } from '../shared/protocol.ts';

const BACKOFF = [1000, 2000, 5000];
const PING_MS = 10_000;
// sem nenhuma mensagem (nem o 'pong') por esse tempo, a conexão está morta: abre outra
const DEAD_MS = 25_000;

// WebSocket que se reconecta sozinho (o celular derruba a conexão quando a tela bloqueia)
export function connect<T>(path: string, parse: (value: unknown) => T | null, onMsg: (m: T) => void, onOpen: () => void, onStatus: (on: boolean) => void = () => {}) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`;
  let ws: WebSocket | null = null;
  let tries = 0;
  let stopped = false;
  let lastSeen = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const warnedTypes = new Set<string>();

  const detach = (socket: WebSocket) => {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
  };

  function open() {
    clearTimeout(timer);
    if (stopped || (ws && ws.readyState <= WebSocket.OPEN)) return;
    const self = new WebSocket(url);
    ws = self;
    lastSeen = Date.now();
    // os handlers ignoram um socket que já foi trocado por outro
    self.onopen = () => {
      if (stopped || ws !== self) return;
      tries = 0;
      onStatus(true);
      if (!stopped && ws === self) onOpen();
    };
    self.onmessage = (e) => {
      if (stopped || ws !== self) return;
      lastSeen = Date.now();
      const raw: unknown = e.data;
      if (raw === 'pong') return;
      const parsed = decodeMessage(raw, parse, (type, reason) => {
        if (warnedTypes.has(type)) return;
        warnedTypes.add(type);
        console.warn(`Rejected invalid server message (type: ${type}; reason: ${reason})`);
      });
      if (parsed !== null) onMsg(parsed);
    };
    self.onclose = () => {
      if (stopped || ws !== self) return;
      detach(self);
      ws = null;
      onStatus(false);
      if (stopped) return;
      timer = setTimeout(open, BACKOFF[Math.min(tries++, BACKOFF.length - 1)]);
    };
  }

  function replaceIfDead() {
    if (stopped || !ws || ws.readyState !== WebSocket.OPEN || Date.now() - lastSeen < DEAD_MS) return;
    const dead = ws;
    ws = null;
    detach(dead);
    dead.close();
    onStatus(false);
    open();
  }

  const heartbeat = setInterval(() => {
    replaceIfDead();
    if (ws?.readyState === WebSocket.OPEN) ws.send('ping');
  }, PING_MS);
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    replaceIfDead();
    open();
  };
  document.addEventListener('visibilitychange', onVisibility);
  open();

  return {
    send(m: ClientMsg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      // Invalidar antes de fechar também bloqueia eventos já enfileirados pelo navegador.
      const socket = ws;
      ws = null;
      if (socket) {
        detach(socket);
        socket.close();
      }
    },
  };
}
