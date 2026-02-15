import type { SyncEnvelope } from "./envelope";
import { createSyncEventBus } from "./eventBus";

export type SyncPeerId = string;

export interface SyncTransport {
  start(localPeerId?: SyncPeerId): Promise<void>;
  stop(): Promise<void>;
  connect(peerId: SyncPeerId): Promise<void>;
  disconnect(peerId?: SyncPeerId): Promise<void> | void;
  peers(): SyncPeerId[];
  localPeerId(): SyncPeerId | null;
  send(peerId: SyncPeerId, message: SyncEnvelope): void;
  broadcast(message: SyncEnvelope): void;
  onMessage(
    callback: (fromPeerId: SyncPeerId, message: SyncEnvelope) => void
  ): () => void;
  onConnectionOpen?(callback: (peerId: SyncPeerId) => void): () => void;
  onConnectionClose?(callback: (peerId: SyncPeerId) => void): () => void;
}

export interface SyncChannelPlugin<TState, TPatch> {
  key: string;
  getState: () => TState;
  subscribe?: (callback: (next: TState, prev: TState) => void) => () => void;
  setState: (
    next: TState,
    meta: { origin: "local" | "remote"; fromPeerId?: SyncPeerId }
  ) => void;
  diff: (prev: TState, next: TState) => TPatch | null;
  apply: (base: TState, patch: TPatch) => TState;
  snapshot: (state: TState) => unknown;
  hydrate: (raw: unknown) => TState;
}

export interface SyncClientOptions {
  roomId: string;
  localPeerId?: SyncPeerId;
  transport: SyncTransport;
}

type SyncMessageHandler<TPayload = unknown> = (
  message: SyncEnvelope<string, TPayload>,
  fromPeerId: SyncPeerId
) => void;

type ChannelRecord = {
  plugin: SyncChannelPlugin<unknown, unknown>;
  lastState: unknown;
  isApplyingRemoteUpdate: boolean;
  stopSubscription: (() => void) | null;
};

export const SYNC_CHANNEL_PATCH_MESSAGE_TYPE = "sync:channel-patch" as const;
export const SYNC_CHANNEL_SNAPSHOT_MESSAGE_TYPE = "sync:channel-snapshot" as const;

type ChannelPatchPayload = {
  channel: string;
  patch: unknown;
};

type ChannelSnapshotPayload = {
  channel: string;
  snapshot: unknown;
};

const SYNC_ENVELOPE_VERSION = 1;

const createMessageId = () => {
  if (typeof window !== "undefined" && typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const isRoomScopedMessage = (roomId: string, message: SyncEnvelope) => {
  const roomScope = message.meta?.roomId;
  if (!roomScope) return true;
  return roomScope === roomId;
};

const isChannelPayload = (value: unknown): value is { channel: string } => {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.channel === "string";
};

export const createSyncClient = (options: SyncClientOptions) => {
  const eventBus = createSyncEventBus();
  const channels = new Map<string, ChannelRecord>();
  const connectionOpenHandlers = new Set<(peerId: SyncPeerId) => void>();
  const connectionCloseHandlers = new Set<(peerId: SyncPeerId) => void>();

  let started = false;
  let startPromise: Promise<void> | null = null;
  let stopRequestedWhileStarting = false;
  let stopMessageListener: (() => void) | null = null;
  let stopConnectionOpenListener: (() => void) | null = null;
  let stopConnectionCloseListener: (() => void) | null = null;

  const emitConnectionOpen = (peerId: SyncPeerId) => {
    connectionOpenHandlers.forEach((handler) => handler(peerId));
  };

  const emitConnectionClose = (peerId: SyncPeerId) => {
    connectionCloseHandlers.forEach((handler) => handler(peerId));
  };

  const withMeta = (message: SyncEnvelope): SyncEnvelope => {
    const localPeerId = options.transport.localPeerId() ?? options.localPeerId;

    return {
      ...message,
      meta: {
        version: SYNC_ENVELOPE_VERSION,
        roomId: options.roomId,
        from: localPeerId ?? undefined,
        msgId: createMessageId(),
        ts: Date.now(),
        ...message.meta,
      },
    };
  };

  const send = (message: SyncEnvelope, peerId?: SyncPeerId) => {
    const outgoing = withMeta(message);
    if (peerId) {
      options.transport.send(peerId, outgoing);
      return;
    }
    options.transport.broadcast(outgoing);
  };

  const applyRemotePatch = (
    channelRecord: ChannelRecord,
    patch: unknown,
    fromPeerId: SyncPeerId
  ) => {
    const plugin = channelRecord.plugin;
    const nextState = plugin.apply(plugin.getState(), patch);

    channelRecord.isApplyingRemoteUpdate = true;
    try {
      plugin.setState(nextState, { origin: "remote", fromPeerId });
      channelRecord.lastState = nextState;
    } finally {
      channelRecord.isApplyingRemoteUpdate = false;
    }
  };

  const applyRemoteSnapshot = (
    channelRecord: ChannelRecord,
    snapshot: unknown,
    fromPeerId: SyncPeerId
  ) => {
    const plugin = channelRecord.plugin;
    const nextState = plugin.hydrate(snapshot);

    channelRecord.isApplyingRemoteUpdate = true;
    try {
      plugin.setState(nextState, { origin: "remote", fromPeerId });
      channelRecord.lastState = nextState;
    } finally {
      channelRecord.isApplyingRemoteUpdate = false;
    }
  };

  const tryHandleChannelPatch = (message: SyncEnvelope, fromPeerId: SyncPeerId) => {
    if (message.type !== SYNC_CHANNEL_PATCH_MESSAGE_TYPE) return false;
    if (!isChannelPayload(message.payload)) return true;

    const payload = message.payload as ChannelPatchPayload;
    const channelRecord = channels.get(payload.channel);
    if (!channelRecord) return true;

    applyRemotePatch(channelRecord, payload.patch, fromPeerId);
    return true;
  };

  const tryHandleChannelSnapshot = (
    message: SyncEnvelope,
    fromPeerId: SyncPeerId
  ) => {
    if (message.type !== SYNC_CHANNEL_SNAPSHOT_MESSAGE_TYPE) return false;
    if (!isChannelPayload(message.payload)) return true;

    const payload = message.payload as ChannelSnapshotPayload;
    const channelRecord = channels.get(payload.channel);
    if (!channelRecord) return true;

    applyRemoteSnapshot(channelRecord, payload.snapshot, fromPeerId);
    return true;
  };

  const sendChannelSnapshot = (peerId: SyncPeerId, channelRecord: ChannelRecord) => {
    const plugin = channelRecord.plugin;
    send(
      {
        type: SYNC_CHANNEL_SNAPSHOT_MESSAGE_TYPE,
        payload: {
          channel: plugin.key,
          snapshot: plugin.snapshot(plugin.getState()),
        },
      },
      peerId
    );
  };

  const sendAllChannelSnapshots = (peerId: SyncPeerId) => {
    channels.forEach((channelRecord) => {
      sendChannelSnapshot(peerId, channelRecord);
    });
  };

  const handleIncomingMessage = (fromPeerId: SyncPeerId, message: SyncEnvelope) => {
    if (!isRoomScopedMessage(options.roomId, message)) return;
    if (tryHandleChannelPatch(message, fromPeerId)) return;
    if (tryHandleChannelSnapshot(message, fromPeerId)) return;
    eventBus.publish(message, fromPeerId);
  };

  const unsubscribeTransportListeners = () => {
    stopMessageListener?.();
    stopMessageListener = null;

    stopConnectionOpenListener?.();
    stopConnectionOpenListener = null;

    stopConnectionCloseListener?.();
    stopConnectionCloseListener = null;
  };

  const subscribeTransportListeners = () => {
    stopMessageListener = options.transport.onMessage(handleIncomingMessage);

    if (options.transport.onConnectionOpen) {
      stopConnectionOpenListener = options.transport.onConnectionOpen((peerId) => {
        sendAllChannelSnapshots(peerId);
        emitConnectionOpen(peerId);
      });
    }

    if (options.transport.onConnectionClose) {
      stopConnectionCloseListener = options.transport.onConnectionClose((peerId) => {
        emitConnectionClose(peerId);
      });
    }
  };

  const stopStartedClient = async () => {
    if (!started) return;
    unsubscribeTransportListeners();
    await options.transport.stop();
    started = false;
  };

  const start = async () => {
    if (started) return;
    if (startPromise) {
      await startPromise;
      if (!started) {
        await start();
      }
      return;
    }

    startPromise = (async () => {
      await options.transport.start(options.localPeerId);
      unsubscribeTransportListeners();
      subscribeTransportListeners();
      started = true;

      if (stopRequestedWhileStarting) {
        stopRequestedWhileStarting = false;
        await stopStartedClient();
      }
    })();

    try {
      await startPromise;
    } finally {
      startPromise = null;
    }
  };

  const stop = async () => {
    if (startPromise) {
      stopRequestedWhileStarting = true;
      try {
        await startPromise;
      } catch {
        stopRequestedWhileStarting = false;
      }
      return;
    }
    await stopStartedClient();
  };

  const registerChannel = <TState, TPatch>(channel: SyncChannelPlugin<TState, TPatch>) => {
    if (channels.has(channel.key)) {
      throw new Error(`Sync channel '${channel.key}' is already registered`);
    }

    const channelRecord: ChannelRecord = {
      plugin: channel as SyncChannelPlugin<unknown, unknown>,
      lastState: channel.getState(),
      isApplyingRemoteUpdate: false,
      stopSubscription: null,
    };

    if (channel.subscribe) {
      channelRecord.stopSubscription = channel.subscribe((nextState, prevState) => {
        if (channelRecord.isApplyingRemoteUpdate) {
          channelRecord.lastState = nextState;
          return;
        }

        const patch = channel.diff(prevState, nextState);
        channelRecord.lastState = nextState;
        if (patch === null || patch === undefined) return;

        send({
          type: SYNC_CHANNEL_PATCH_MESSAGE_TYPE,
          payload: {
            channel: channel.key,
            patch,
          },
        });
      });
    }

    channels.set(channel.key, channelRecord);

    if (started) {
      options.transport.peers().forEach((peerId) => {
        sendChannelSnapshot(peerId, channelRecord);
      });
    }

    return () => {
      channelRecord.stopSubscription?.();
      channels.delete(channel.key);
    };
  };

  return {
    start,
    stop,
    connect: async (peerId: SyncPeerId) => {
      await start();
      await options.transport.connect(peerId);
    },
    disconnect: async (peerId?: SyncPeerId) => {
      if (peerId) {
        await options.transport.disconnect(peerId);
        return;
      }
      await stop();
    },
    peers: () => options.transport.peers(),
    localPeerId: () => options.transport.localPeerId() ?? options.localPeerId ?? null,
    send,
    onMessage: <TPayload = unknown>(
      type: string,
      handler: SyncMessageHandler<TPayload>
    ) => {
      return eventBus.subscribe(type, handler as SyncMessageHandler);
    },
    onConnectionOpen: (handler: (peerId: SyncPeerId) => void) => {
      connectionOpenHandlers.add(handler);
      return () => {
        connectionOpenHandlers.delete(handler);
      };
    },
    onConnectionClose: (handler: (peerId: SyncPeerId) => void) => {
      connectionCloseHandlers.add(handler);
      return () => {
        connectionCloseHandlers.delete(handler);
      };
    },
    registerChannel,
  };
};
