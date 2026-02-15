import type { SyncEnvelope, SyncPeerId, SyncTransport } from "../core";

type MessageDeliveryContext = {
  fromPeerId: SyncPeerId;
  toPeerId: SyncPeerId;
  message: SyncEnvelope;
};

type MemoryTransportMessageListener = (
  fromPeerId: SyncPeerId,
  message: SyncEnvelope
) => void;

type MemoryTransportConnectionListener = (peerId: SyncPeerId) => void;

export type MemoryTransportDelayResolver = (
  context: MessageDeliveryContext
) => number;

export type MemoryTransportDropResolver = (
  context: MessageDeliveryContext
) => boolean;

export type MemorySyncNetworkOptions = {
  deliveryLatencyMs?: number;
  resolveDeliveryDelayMs?: MemoryTransportDelayResolver;
  shouldDropMessage?: MemoryTransportDropResolver;
};

export type MemoryTransportOptions = {
  startDelayMs?: number;
};

const sleep = (durationMs: number) =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });

const cloneEnvelope = (message: SyncEnvelope): SyncEnvelope => {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(message);
  }

  return JSON.parse(JSON.stringify(message)) as SyncEnvelope;
};

const linkKey = (left: SyncPeerId, right: SyncPeerId) => {
  return [left, right].sort().join("::");
};

export class MemorySyncTransport implements SyncTransport {
  private readonly messageListeners = new Set<MemoryTransportMessageListener>();
  private readonly connectionOpenListeners =
    new Set<MemoryTransportConnectionListener>();
  private readonly connectionCloseListeners =
    new Set<MemoryTransportConnectionListener>();

  private localId: SyncPeerId | null = null;
  private started = false;

  constructor(
    private readonly network: MemorySyncNetwork,
    private readonly options: MemoryTransportOptions = {}
  ) {}

  async start(localPeerId?: SyncPeerId) {
    if (this.started) return;
    if (this.options.startDelayMs && this.options.startDelayMs > 0) {
      await sleep(this.options.startDelayMs);
    }

    const resolvedId = localPeerId ?? this.network.createPeerId();
    this.network.registerPeer(resolvedId, this);
    this.localId = resolvedId;
    this.started = true;
  }

  async stop() {
    if (!this.started || !this.localId) return;
    this.network.unregisterPeer(this.localId);
    this.started = false;
    this.localId = null;
  }

  async connect(peerId: SyncPeerId) {
    this.assertStarted();
    this.network.connectPeers(this.localId as SyncPeerId, peerId);
  }

  async disconnect(peerId?: SyncPeerId) {
    if (!this.started || !this.localId) return;

    if (!peerId) {
      this.network.peerLinksFor(this.localId).forEach((linkedPeerId) => {
        this.network.disconnectPeers(this.localId as SyncPeerId, linkedPeerId);
      });
      return;
    }

    this.network.disconnectPeers(this.localId, peerId);
  }

  peers() {
    if (!this.started || !this.localId) return [];
    return this.network.peerLinksFor(this.localId);
  }

  localPeerId() {
    return this.localId;
  }

  send(peerId: SyncPeerId, message: SyncEnvelope) {
    if (!this.started || !this.localId) return;
    this.network.deliverMessage({
      fromPeerId: this.localId,
      toPeerId: peerId,
      message,
    });
  }

  broadcast(message: SyncEnvelope) {
    if (!this.started || !this.localId) return;
    this.network.peerLinksFor(this.localId).forEach((peerId) => {
      this.network.deliverMessage({
        fromPeerId: this.localId as SyncPeerId,
        toPeerId: peerId,
        message,
      });
    });
  }

  onMessage(callback: MemoryTransportMessageListener) {
    this.messageListeners.add(callback);
    return () => {
      this.messageListeners.delete(callback);
    };
  }

  onConnectionOpen(callback: MemoryTransportConnectionListener) {
    this.connectionOpenListeners.add(callback);
    return () => {
      this.connectionOpenListeners.delete(callback);
    };
  }

  onConnectionClose(callback: MemoryTransportConnectionListener) {
    this.connectionCloseListeners.add(callback);
    return () => {
      this.connectionCloseListeners.delete(callback);
    };
  }

  isStarted() {
    return this.started;
  }

  notifyConnectionOpen(peerId: SyncPeerId) {
    this.connectionOpenListeners.forEach((listener) => listener(peerId));
  }

  notifyConnectionClose(peerId: SyncPeerId) {
    this.connectionCloseListeners.forEach((listener) => listener(peerId));
  }

  notifyMessage(fromPeerId: SyncPeerId, message: SyncEnvelope) {
    const clonedMessage = cloneEnvelope(message);
    this.messageListeners.forEach((listener) => listener(fromPeerId, clonedMessage));
  }

  private assertStarted() {
    if (!this.started || !this.localId) {
      throw new Error("MemorySyncTransport must be started before use");
    }
  }
}

export class MemorySyncNetwork {
  private readonly peers = new Map<SyncPeerId, MemorySyncTransport>();
  private readonly links = new Set<string>();
  private peerCounter = 1;

  constructor(private readonly options: MemorySyncNetworkOptions = {}) {}

  createTransport(transportOptions: MemoryTransportOptions = {}) {
    return new MemorySyncTransport(this, transportOptions);
  }

  createPeerId() {
    const peerId = `memory-peer-${this.peerCounter}`;
    this.peerCounter += 1;
    return peerId;
  }

  registerPeer(peerId: SyncPeerId, transport: MemorySyncTransport) {
    const existing = this.peers.get(peerId);
    if (existing) {
      throw new Error(`Peer '${peerId}' is already registered`);
    }

    this.peers.set(peerId, transport);
  }

  unregisterPeer(peerId: SyncPeerId) {
    const linkedPeers = this.peerLinksFor(peerId);
    linkedPeers.forEach((linkedPeerId) => {
      this.disconnectPeers(peerId, linkedPeerId);
    });
    this.peers.delete(peerId);
  }

  connectPeers(leftPeerId: SyncPeerId, rightPeerId: SyncPeerId) {
    if (leftPeerId === rightPeerId) return;

    const leftPeer = this.peers.get(leftPeerId);
    const rightPeer = this.peers.get(rightPeerId);
    if (!leftPeer || !rightPeer) {
      throw new Error(
        `Unknown peer in connection '${leftPeerId}' -> '${rightPeerId}'`
      );
    }

    const key = linkKey(leftPeerId, rightPeerId);
    if (this.links.has(key)) return;
    this.links.add(key);

    leftPeer.notifyConnectionOpen(rightPeerId);
    rightPeer.notifyConnectionOpen(leftPeerId);
  }

  disconnectPeers(leftPeerId: SyncPeerId, rightPeerId: SyncPeerId) {
    const leftPeer = this.peers.get(leftPeerId);
    const rightPeer = this.peers.get(rightPeerId);
    if (!leftPeer || !rightPeer) return;

    const key = linkKey(leftPeerId, rightPeerId);
    if (!this.links.has(key)) return;
    this.links.delete(key);

    leftPeer.notifyConnectionClose(rightPeerId);
    rightPeer.notifyConnectionClose(leftPeerId);
  }

  peerLinksFor(peerId: SyncPeerId) {
    const linkedPeers: SyncPeerId[] = [];
    this.links.forEach((key) => {
      const [leftPeerId, rightPeerId] = key.split("::");
      if (leftPeerId === peerId) {
        linkedPeers.push(rightPeerId);
      } else if (rightPeerId === peerId) {
        linkedPeers.push(leftPeerId);
      }
    });
    return linkedPeers;
  }

  deliverMessage(context: MessageDeliveryContext) {
    if (!this.hasLink(context.fromPeerId, context.toPeerId)) return;
    if (this.options.shouldDropMessage?.(context)) return;

    const targetPeer = this.peers.get(context.toPeerId);
    if (!targetPeer) return;

    const delayMs =
      this.options.resolveDeliveryDelayMs?.(context) ??
      this.options.deliveryLatencyMs ??
      0;

    globalThis.setTimeout(() => {
      if (!this.hasLink(context.fromPeerId, context.toPeerId)) return;
      const latestTargetPeer = this.peers.get(context.toPeerId);
      if (!latestTargetPeer) return;
      latestTargetPeer.notifyMessage(context.fromPeerId, context.message);
    }, Math.max(0, delayMs));
  }

  private hasLink(leftPeerId: SyncPeerId, rightPeerId: SyncPeerId) {
    return this.links.has(linkKey(leftPeerId, rightPeerId));
  }
}
