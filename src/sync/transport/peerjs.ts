import Peer, { DataConnection } from "peerjs";
import {
  isSyncEnvelope,
  type SyncEnvelope,
  type SyncPeerId,
  type SyncTransport,
} from "../core";

const normalizeError = (error: unknown) => {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("Unknown peer transport error");
};

type PeerTransportListener<TPayload> = Set<(payload: TPayload) => void>;

export type PeerJsTransportOptions = {
  createPeer?: (peerId?: string) => Peer;
  onPeerReady?: (peer: Peer) => void;
  onPeerDestroyed?: () => void;
  onConnectionsChanged?: (connections: Map<string, DataConnection>) => void;
  onError?: (error: Error) => void;
};

type PeerJsTransport = SyncTransport & {
  getPeer: () => Peer | null;
  getConnections: () => Map<string, DataConnection>;
};

export const createPeerJsTransport = (
  options: PeerJsTransportOptions = {}
): PeerJsTransport => {
  let peer: Peer | null = null;
  const connections = new Map<string, DataConnection>();

  const messageListeners: PeerTransportListener<{
    fromPeerId: SyncPeerId;
    message: SyncEnvelope;
  }> = new Set();
  const connectionOpenListeners: PeerTransportListener<SyncPeerId> = new Set();
  const connectionCloseListeners: PeerTransportListener<SyncPeerId> = new Set();

  const emitConnectionsChanged = () => {
    options.onConnectionsChanged?.(new Map(connections));
  };

  const emitError = (error: unknown) => {
    options.onError?.(normalizeError(error));
  };

  const notifyConnectionOpen = (peerId: SyncPeerId) => {
    connectionOpenListeners.forEach((listener) => listener(peerId));
  };

  const notifyConnectionClose = (peerId: SyncPeerId) => {
    connectionCloseListeners.forEach((listener) => listener(peerId));
  };

  const notifyMessage = (fromPeerId: SyncPeerId, message: SyncEnvelope) => {
    messageListeners.forEach((listener) => listener({ fromPeerId, message }));
  };

  const attachConnection = (connection: DataConnection) => {
    connection.on("open", () => {
      connections.set(connection.peer, connection);
      emitConnectionsChanged();
      notifyConnectionOpen(connection.peer);
    });

    connection.on("data", (data: unknown) => {
      if (!isSyncEnvelope(data)) {
        emitError(`Invalid message received from ${connection.peer}`);
        return;
      }

      notifyMessage(connection.peer, data);
    });

    connection.on("close", () => {
      const didDelete = connections.delete(connection.peer);
      if (!didDelete) return;
      emitConnectionsChanged();
      notifyConnectionClose(connection.peer);
    });

    connection.on("error", emitError);
  };

  const ensurePeer = () => {
    if (peer) {
      return peer;
    }

    throw new Error("Peer transport must be started before connecting");
  };

  const start = async (localPeerId?: SyncPeerId) => {
    if (peer) return;

    await new Promise<void>((resolve, reject) => {
      const createPeer =
        options.createPeer ??
        ((requestedPeerId?: string) =>
          requestedPeerId ? new Peer(requestedPeerId) : new Peer());

      const nextPeer = createPeer(localPeerId);
      let settled = false;

      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(normalizeError(error));
      };

      nextPeer.on("open", () => {
        peer = nextPeer;
        options.onPeerReady?.(nextPeer);
        resolveOnce();
      });

      nextPeer.on("connection", attachConnection);
      nextPeer.on("error", (error) => {
        emitError(error);
        rejectOnce(error);
      });
      nextPeer.on("close", () => {
        options.onPeerDestroyed?.();
      });
    });
  };

  const stop = async () => {
    connections.forEach((connection) => {
      connection.close();
    });
    connections.clear();
    emitConnectionsChanged();

    if (peer) {
      peer.destroy();
      peer = null;
      options.onPeerDestroyed?.();
    }
  };

  return {
    start,
    stop,
    connect: async (peerId: SyncPeerId) => {
      const activePeer = ensurePeer();
      if (activePeer.id === peerId) return;
      if (connections.has(peerId)) return;

      const connection = activePeer.connect(peerId);
      attachConnection(connection);
    },
    disconnect: async (peerId?: SyncPeerId) => {
      if (!peerId) {
        await stop();
        return;
      }

      const connection = connections.get(peerId);
      if (!connection) return;
      connection.close();
      connections.delete(peerId);
      emitConnectionsChanged();
      notifyConnectionClose(peerId);
    },
    peers: () => Array.from(connections.keys()),
    localPeerId: () => peer?.id ?? null,
    send: (peerId: SyncPeerId, message: SyncEnvelope) => {
      const connection = connections.get(peerId);
      if (!connection || !connection.open) return;
      connection.send(message);
    },
    broadcast: (message: SyncEnvelope) => {
      connections.forEach((connection) => {
        if (!connection.open) return;
        connection.send(message);
      });
    },
    onMessage: (callback) => {
      const listener = ({ fromPeerId, message }: {
        fromPeerId: SyncPeerId;
        message: SyncEnvelope;
      }) => {
        callback(fromPeerId, message);
      };
      messageListeners.add(listener);

      return () => {
        messageListeners.delete(listener);
      };
    },
    onConnectionOpen: (callback) => {
      connectionOpenListeners.add(callback);
      return () => {
        connectionOpenListeners.delete(callback);
      };
    },
    onConnectionClose: (callback) => {
      connectionCloseListeners.add(callback);
      return () => {
        connectionCloseListeners.delete(callback);
      };
    },
    getPeer: () => peer,
    getConnections: () => new Map(connections),
  };
};

export const sendEnvelopeToPeer = (
  connections: Map<string, DataConnection>,
  peerId: string,
  message: SyncEnvelope
) => {
  const connection = connections.get(peerId);
  if (!connection) return;
  connection.send(message);
};

export const broadcastEnvelope = (
  connections: Map<string, DataConnection>,
  message: SyncEnvelope
) => {
  connections.forEach((connection) => {
    connection.send(message);
  });
};
