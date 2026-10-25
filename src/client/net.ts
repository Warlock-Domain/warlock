import { decodeMessage } from './net-message.ts';
import type { ClientMsg } from '../shared/protocol.ts';

const BACKOFF = [1000, 2000, 5000];
const PING_MS = 10_000;
// No traffic, including pong, for this long means the socket needs replacing.
const DEAD_MS = 25_000;

export class Connection<T> {
  private readonly url: string;
  private readonly parse: (value: unknown) => T | null;
  private readonly onMsg: (m: T) => void;
  private readonly onOpen: () => void;
  private readonly onStatus: (on: boolean) => void;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private ws: WebSocket | null = null;
  private tries = 0;
  private stopped = false;
  private lastSeen = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly warnedTypes = new Set<string>();

  constructor(path: string, parse: (value: unknown) => T | null, onMsg: (m: T) => void, onOpen: () => void, onStatus: (on: boolean) => void = () => {}) {
    this.url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`;
    this.parse = parse;
    this.onMsg = onMsg;
    this.onOpen = onOpen;
    this.onStatus = onStatus;
    this.heartbeat = setInterval(() => {
      this.replaceIfDead();
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping');
    }, PING_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.open();
  }

  private detach(socket: WebSocket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
  }

  private open = () => {
    clearTimeout(this.timer);
    if (this.stopped || (this.ws && this.ws.readyState <= WebSocket.OPEN)) return;
    const self = new WebSocket(this.url);
    this.ws = self;
    this.lastSeen = Date.now();
    // Events queued by a replaced socket must not update the current connection.
    self.onopen = () => {
      if (this.stopped || this.ws !== self) return;
      this.tries = 0;
      // Preserve the factory's callback receiver instead of exposing the owner as `this`.
      this.onStatus.call(undefined, true);
      if (!this.stopped && this.ws === self) this.onOpen.call(undefined);
    };
    self.onmessage = (e) => {
      if (this.stopped || this.ws !== self) return;
      this.lastSeen = Date.now();
      const raw: unknown = e.data;
      if (raw === 'pong') return;
      const parsed = decodeMessage(raw, this.parse, (type, reason) => {
        if (this.warnedTypes.has(type)) return;
        this.warnedTypes.add(type);
        console.warn(`Rejected invalid server message (type: ${type}; reason: ${reason})`);
      });
      if (parsed !== null) this.onMsg.call(undefined, parsed);
    };
    self.onclose = () => {
      if (this.stopped || this.ws !== self) return;
      this.detach(self);
      this.ws = null;
      this.onStatus.call(undefined, false);
      if (this.stopped) return;
      this.timer = setTimeout(this.open, BACKOFF[Math.min(this.tries++, BACKOFF.length - 1)]);
    };
  };

  private replaceIfDead() {
    if (this.stopped || !this.ws || this.ws.readyState !== WebSocket.OPEN || Date.now() - this.lastSeen < DEAD_MS) return;
    const dead = this.ws;
    this.ws = null;
    this.detach(dead);
    dead.close();
    this.onStatus.call(undefined, false);
    this.open();
  }

  private onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    this.replaceIfDead();
    this.open();
  };

  // Bound methods preserve the factory API when callers pass them as callbacks.
  send = (m: ClientMsg) => {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  };

  stop = () => {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    document.removeEventListener('visibilitychange', this.onVisibility);
    // Invalidate before closing so queued browser events cannot reactivate this connection.
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      this.detach(socket);
      socket.close();
    }
  };
}

export function connect<T>(path: string, parse: (value: unknown) => T | null, onMsg: (m: T) => void, onOpen: () => void, onStatus: (on: boolean) => void = () => {}) {
  return new Connection(path, parse, onMsg, onOpen, onStatus);
}
