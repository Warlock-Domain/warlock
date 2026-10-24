import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect } from '../src/client/net.ts';

const parseTag = (value: unknown): { t: string } | null => typeof value === 'object' && value !== null && 't' in value && typeof value.t === 'string' ? { t: value.t } : null;

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; this.onclose?.(); });
  constructor(readonly url: string) { Socket.instances.push(this); }
  opened() { this.readyState = Socket.OPEN; this.onopen?.(); }
}

let document: EventTarget & { visibilityState: string };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  Socket.instances = [];
  document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('location', { protocol: 'https:', host: 'example.test' });
  vi.stubGlobal('document', document);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('ciclo da conexão', () => {
  it('invokes caller callbacks without exposing the connection as their receiver', () => {
    const receivers: unknown[] = [];
    function recordReceiver(this: unknown) { receivers.push(this); }
    const net = connect('/ws/lobby', parseTag, recordReceiver, recordReceiver, recordReceiver);
    const socket = Socket.instances[0];
    socket.opened();
    socket.onmessage?.({ data: '{"t":"room"}' });
    socket.close();
    expect(receivers).toEqual([undefined, undefined, undefined, undefined]);
    net.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps detached callbacks bound to their connection without stopping another instance', () => {
    const onMsg = vi.fn();
    const first = connect('/ws/lobby', parseTag, vi.fn(), vi.fn());
    const second = connect('/ws/room/ABCD', parseTag, onMsg, vi.fn());
    const [firstSocket, secondSocket] = Socket.instances;
    firstSocket.opened();
    secondSocket.opened();

    const { send, stop } = first;
    send({ t: 'alive' });
    expect(firstSocket.send).toHaveBeenCalledWith('{"t":"alive"}');
    expect(secondSocket.send).not.toHaveBeenCalled();
    stop();
    stop();
    send({ t: 'alive' });
    expect(firstSocket.send).toHaveBeenCalledOnce();
    expect(firstSocket.close).toHaveBeenCalledOnce();
    expect(secondSocket.close).not.toHaveBeenCalled();
    secondSocket.onmessage?.({ data: '{"t":"room"}' });
    expect(onMsg).toHaveBeenCalledWith({ t: 'room' });
    vi.advanceTimersByTime(10000);
    expect(secondSocket.send).toHaveBeenCalledWith('ping');
    expect(vi.getTimerCount()).toBe(1);
    second.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('libera heartbeat, reconexão, ouvinte e handlers mesmo com stop repetido e eventos atrasados', () => {
    const add = vi.spyOn(document, 'addEventListener'), remove = vi.spyOn(document, 'removeEventListener');
    const onMsg = vi.fn(), onOpen = vi.fn(), onStatus = vi.fn();
    for (let i = 0; i < 10; i++) {
      const net = connect('/ws/lobby', parseTag, onMsg, onOpen, onStatus);
      const socket = Socket.instances.at(-1)!;
      const late = { open: socket.onopen!, message: socket.onmessage!, close: socket.onclose! };
      socket.opened();
      socket.close();
      onMsg.mockClear(); onOpen.mockClear(); onStatus.mockClear();
      net.stop(); net.stop();
      late.open(); late.message({ data: '{"t":"room"}' }); late.close();
      net.send({ t: 'alive' });
      expect(socket.onopen).toBeNull();
      expect(socket.onmessage).toBeNull();
      expect(socket.onclose).toBeNull();
      expect(onMsg).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
      expect(onStatus).not.toHaveBeenCalled();
    }
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60000);
    expect(Socket.instances).toHaveLength(10);
    expect(vi.getTimerCount()).toBe(0);
    expect(add).toHaveBeenCalledTimes(10);
    expect(remove).toHaveBeenCalledTimes(10);
    for (let i = 0; i < 10; i++) expect(remove.mock.calls[i]).toEqual(add.mock.calls[i]);
  });
  it('reconecta com backoff, substitui socket morto e recupera ao voltar à aba visível', () => {
    const onMsg = vi.fn(), onStatus = vi.fn();
    const net = connect('/ws/room/ABCD', parseTag, onMsg, vi.fn(), onStatus);
    const first = Socket.instances[0];
    first.opened();
    vi.advanceTimersByTime(10000);
    expect(first.send).toHaveBeenCalledWith('ping');
    first.onmessage?.({ data: 'pong' });
    expect(onMsg).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20000);
    expect(Socket.instances).toHaveLength(1);
    document.visibilityState = 'hidden';
    vi.advanceTimersByTime(6000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(Socket.instances).toHaveLength(1);
    document.visibilityState = 'visible';
    const oldMessage = first.onmessage!;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(Socket.instances).toHaveLength(2);
    expect(first.close).toHaveBeenCalledOnce();
    oldMessage({ data: '{"old":true}' });
    expect(onMsg).not.toHaveBeenCalled();
    const second = Socket.instances[1];
    second.opened(); second.onmessage?.({ data: '{"t":"room"}' });
    expect(onMsg).toHaveBeenCalledWith({ t: 'room' });
    second.close();
    vi.advanceTimersByTime(999);
    expect(Socket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(Socket.instances).toHaveLength(3);
    Socket.instances[2].close();
    vi.advanceTimersByTime(1999);
    expect(Socket.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(Socket.instances).toHaveLength(4);
    net.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('stop antes de abrir impede callbacks pendentes e novos envios', () => {
    const onOpen = vi.fn(), onMsg = vi.fn();
    const net = connect('/ws/lobby', parseTag, onMsg, onOpen);
    const socket = Socket.instances[0], lateOpen = socket.onopen!, lateMsg = socket.onmessage!;
    net.stop();
    socket.readyState = Socket.OPEN;
    lateOpen(); lateMsg({ data: '{"late":true}' });
    net.send({ t: 'alive' });
    expect(onOpen).not.toHaveBeenCalled();
    expect(onMsg).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('avisa uma vez por tipo de mensagem rejeitada na mesma conexão', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const net = connect('/ws/room/ABCD', parseTag, vi.fn(), vi.fn());
    const socket = Socket.instances[0];
    socket.onmessage?.({ data: '{"bad":true}' });
    socket.onmessage?.({ data: '{"bad":true}' });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Rejected invalid server message (type: (unknown); reason: schema validation failed)');
    net.stop();
    warn.mockRestore();
  });
});
