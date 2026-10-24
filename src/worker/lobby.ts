import { DurableObject } from 'cloudflare:workers';
import type { RoomInfo } from '../shared/protocol.ts';
import { addRecord, addResourceSample, emptyTotals, type ResourceSample, type RoundRecord, type Totals } from '../shared/telemetry.ts';

const RECONCILE_MS = 60_000; // Atualiza entradas órfãs sem fazer RPC a cada mudança do lobby.
const RECONCILE_BATCH = 8; // Limita o trabalho por alarme; o cursor continua no lote seguinte.

// Lista de salas abertas: um único objeto ('lobby') que todo navegador na tela inicial escuta.
export class Lobby extends DurableObject<Env> {
  private resourceWrite: Promise<void> = Promise.resolve();
  // Invalida resultados antigos de inspect enquanto o alarme aguarda o RPC da sala.
  private revisions = new Map<string, number>();

  // Só mantém revisões enquanto um inspect está em andamento; salas ocupadas podem mudar sem crescer este mapa.
  private inspecting = new Set<string>();

  private revision = 0;

  private changed(id: string) {
    const version = ++this.revision;
    this.revisions.set(id, version);
    return version;
  }

  private currentRevision(id: string) {
    return this.revisions.get(id) ?? 0;
  }

  private async armReconciliation() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + RECONCILE_MS);
  }

  private async rooms(): Promise<Record<string, RoomInfo>> {
    return (await this.ctx.storage.get<Record<string, RoomInfo>>('rooms')) ?? {};
  }

  private async save(rooms: Record<string, RoomInfo>) {
    await this.ctx.storage.put('rooms', rooms);
    const msg = JSON.stringify({ t: 'rooms', rooms: Object.values(rooms) });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        // socket fechado
      }
    }
  }

  async upsert(info: RoomInfo) {
    this.changed(info.id); // invalida uma inspeção que esteja aguardando o RPC da sala
    const rooms = await this.rooms();
    rooms[info.id] = info;
    await this.save(rooms);
    if (!this.inspecting.has(info.id)) this.revisions.delete(info.id);
    if (info.players === 0) await this.armReconciliation();
  }

  async remove(id: string) {
    const version = this.changed(id);
    const rooms = await this.rooms();
    if (this.currentRevision(id) !== version) return;
    delete rooms[id];
    await this.save(rooms);
    if (this.currentRevision(id) === version && !this.inspecting.has(id)) this.revisions.delete(id);
  }

  async alarm() {
    const rooms = await this.rooms();
    const empty = Object.values(rooms).filter((room) => room.players === 0).sort((a, b) => a.id.localeCompare(b.id));
    if (!empty.length) return;

    // Agenda antes dos RPCs: uma falha ou hibernação durante a varredura não perde a próxima tentativa.
    await this.ctx.storage.setAlarm(Date.now() + RECONCILE_MS);
    const cursor = (await this.ctx.storage.get<string>('reconcileCursor')) ?? '';
    const start = empty.findIndex((room) => room.id > cursor);
    const ordered = start < 0 ? empty : [...empty.slice(start), ...empty.slice(0, start)];
    const batch = ordered.slice(0, RECONCILE_BATCH);
    await this.ctx.storage.put('reconcileCursor', batch.at(-1)!.id);

    for (const listed of batch) {
      this.inspecting.add(listed.id);
      const version = this.currentRevision(listed.id);
      this.revisions.set(listed.id, version);
      try {
        const current = await this.rooms();
        if (this.currentRevision(listed.id) !== version || current[listed.id]?.players !== 0) continue;
        const stub = this.env.ROOM.get(this.env.ROOM.idFromName(listed.id));
        const actual = await stub.inspect();
        if (this.currentRevision(listed.id) !== version) continue;
        const latest = await this.rooms();
        if (this.currentRevision(listed.id) !== version || latest[listed.id]?.players !== 0) continue;
        if (!actual) delete latest[listed.id];
        else latest[listed.id] = actual;
        if (!actual || JSON.stringify(latest[listed.id]) !== JSON.stringify(current[listed.id])) {
          const savedRevision = this.changed(listed.id);
          await this.save(latest);
          if (!actual && this.currentRevision(listed.id) === savedRevision) this.revisions.delete(listed.id);
        }
      } catch {
        // Mantém a entrada e o alarme já armado para tentar novamente no próximo lote.
      } finally {
        this.inspecting.delete(listed.id);
        this.revisions.delete(listed.id);
      }
    }

    // Há entradas vazias fora deste lote: continua a rotação em um minuto.
    if (empty.length > batch.length) await this.ctx.storage.setAlarm(Date.now() + RECONCILE_MS);
  }

  // dados de balanceamento: soma de todas as rodadas jogadas no site
  async record(r: RoundRecord) {
    await this.ctx.storage.put('telemetry', addRecord(await this.telemetry(), r));
  }

  async telemetry(): Promise<Totals> {
    return (await this.ctx.storage.get<Totals>('telemetry')) ?? emptyTotals();
  }

  recordResources(sample: ResourceSample): Promise<void> {
    const write = this.resourceWrite.then(async () => {
      const samples = (await this.ctx.storage.get<ResourceSample[]>('resource-samples')) ?? [];
      await this.ctx.storage.put('resource-samples', addResourceSample(samples, sample));
    });
    this.resourceWrite = write.catch(() => {});
    return write;
  }

  async resourceSamples(): Promise<ResourceSample[]> {
    return (await this.ctx.storage.get<ResourceSample[]>('resource-samples')) ?? [];
  }

  async has(id: string): Promise<boolean> {
    return id in (await this.rooms());
  }

  async fetch(): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const rooms = await this.rooms();
    server.send(JSON.stringify({ t: 'rooms', rooms: Object.values(rooms) }));
    if (Object.values(rooms).some((room) => room.players === 0)) await this.armReconciliation();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage() {}
}
