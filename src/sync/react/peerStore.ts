import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { create } from "zustand";
import {
  createSyncClient,
  isPeerSyncEnvelope,
  type SyncEnvelope,
} from "@vescofire/peersync";
import { createPeerJsTransport } from "@vescofire/peersync/peerjs";
import { createShapesSyncChannel } from "./shapesChannel";
import { createWebSocketTransport } from "../transport/websocket";

export type Message<TPayload = unknown> = SyncEnvelope<string, TPayload>;

export type MessageCallback<TPayload = unknown> = (
  message: Message<TPayload>,
  peerId: string
) => void;

export interface PeerState {
  peer: Peer | null;
  connections: Map<string, DataConnection>;
  connectedAgentPeerIds: Set<string>;
  error: Error | null;
  initPeer: () => () => void;
  connectToPeer: (peerId: string) => void;
  sendMessage: (message: Message, peerId?: string) => void;
  disconnect: (peerId?: string) => void;
  onMessage: <TPayload = unknown>(
    type: string,
    callback: MessageCallback<TPayload>
  ) => () => void;
}

const toError = (error: unknown) => {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("Unknown peer sync error");
};

const setPeerError = (nextError: Error) => {
  usePeerStore.setState((state) => {
    if (state.error?.message === nextError.message) {
      return state;
    }
    return { error: nextError };
  });
};

const syncTransport = createPeerJsTransport({
  onPeerReady: (peer) => {
    usePeerStore.setState({ peer, error: null });
  },
  onPeerDestroyed: () => {
    usePeerStore.setState({ peer: null, connections: new Map() });
  },
  onConnectionsChanged: (connections) => {
    usePeerStore.setState({ connections: new Map(connections) });
  },
  onError: (error) => {
    setPeerError(error);
  },
});

const syncClient = createSyncClient({
  roomId: "maginet",
  transport: syncTransport,
});

let coreHandlersRegistered = false;
let channelPluginsRegistered = false;
const runtimeLeases = new Set<symbol>();

const ensureCoreHandlers = () => {
  if (coreHandlersRegistered) return;
  coreHandlersRegistered = true;

  syncClient.onConnectionOpen((connectedPeerId) => {
    const { connections, peer } = usePeerStore.getState();
    const connectedPeers = Array.from(connections.keys()).filter(
      (peerId) => peerId !== connectedPeerId
    );

    syncClient.send(
      {
        type: "peer-sync",
        payload: { connectedPeers },
      },
      connectedPeerId
    );

    if (!peer?.id) return;

    syncClient.send(
      {
        type: "connected",
        payload: { peerId: peer.id },
      },
      connectedPeerId
    );
  });

  syncClient.onMessage("peer-sync", (message) => {
    if (!isPeerSyncEnvelope(message)) return;

    const { connections, peer } = usePeerStore.getState();
    message.payload.connectedPeers.forEach((peerId) => {
      if (!connections.has(peerId) && peer?.id !== peerId) {
        usePeerStore.getState().connectToPeer(peerId);
      }
    });
  });
};

const ensureChannelPlugins = () => {
  if (channelPluginsRegistered) return;
  channelPluginsRegistered = true;
  syncClient.registerChannel(
    createShapesSyncChannel({
      getLocalPeerId: () => usePeerStore.getState().peer?.id ?? null,
    })
  );
};

const startPeerRuntime = () => {
  ensureCoreHandlers();
  ensureChannelPlugins();
  void syncClient.start().catch((error) => {
    setPeerError(toError(error));
  });
};

const stopPeerRuntime = () => {
  void syncClient.stop().catch((error) => {
    setPeerError(toError(error));
  });
};

const acquirePeerRuntimeLease = () => {
  const leaseId = Symbol("peer-runtime-lease");
  runtimeLeases.add(leaseId);
  startPeerRuntime();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    runtimeLeases.delete(leaseId);
    if (runtimeLeases.size === 0) {
      stopPeerRuntime();
    }
  };
};

export const usePeerStore = create<PeerState>((_, get) => ({
  peer: null,
  connections: new Map(),
  connectedAgentPeerIds: new Set(),
  error: null,

  initPeer: () => {
    return acquirePeerRuntimeLease();
  },

  connectToPeer: (peerId: string) => {
    const targetPeerId = peerId.trim();
    if (!targetPeerId) return;

    const { peer, connections } = get();
    if (peer?.id === targetPeerId) return;
    if (connections.has(targetPeerId)) return;

    void syncClient.connect(targetPeerId).catch((error) => {
      setPeerError(toError(error));
    });
  },

  sendMessage: (message: Message, peerId?: string) => {
    syncClient.send(message, peerId);
  },

  disconnect: (peerId?: string) => {
    if (peerId) {
      void syncClient.disconnect(peerId).catch((error) => {
        setPeerError(toError(error));
      });
      return;
    }

    runtimeLeases.clear();
    stopPeerRuntime();
  },

  onMessage: (type: string, callback) => {
    return syncClient.onMessage(type, callback as MessageCallback);
  },
}));

let agentSyncClient: ReturnType<typeof createSyncClient> | null = null;
let agentTransport: ReturnType<typeof createWebSocketTransport> | null = null;

export const connectAgent = async (port: number = 3210): Promise<void> => {
  if (agentSyncClient) {
    await agentSyncClient.stop();
  }

  const agentPeerId = "agent";

  agentTransport = createWebSocketTransport({
    url: `ws://localhost:${port}`,
    onConnected: () => {
      console.log("[maginet] Agent connected");
      usePeerStore.setState((state) => {
        const next = new Set(state.connectedAgentPeerIds);
        next.add(agentPeerId);
        return { connectedAgentPeerIds: next };
      });
    },
    onDisconnected: () => {
      console.log("[maginet] Agent disconnected");
      agentSyncClient = null;
      agentTransport = null;
      usePeerStore.setState((state) => {
        const next = new Set(state.connectedAgentPeerIds);
        next.delete(agentPeerId);
        return { connectedAgentPeerIds: next };
      });
    },
    onError: (error) => {
      setPeerError(error);
    },
  });

  agentSyncClient = createSyncClient({
    roomId: "maginet-agent",
    transport: agentTransport,
  });

  agentSyncClient.registerChannel(
    createShapesSyncChannel({
      getLocalPeerId: () => usePeerStore.getState().peer?.id ?? "browser",
    })
  );

  await agentSyncClient.start();
};

export const disconnectAgent = async (): Promise<void> => {
  if (agentSyncClient) {
    await agentSyncClient.stop();
    agentSyncClient = null;
    agentTransport = null;
    usePeerStore.setState((state) => {
      const next = new Set(state.connectedAgentPeerIds);
      next.delete("agent");
      return { connectedAgentPeerIds: next };
    });
  }
};

export const isAgentConnected = (): boolean => {
  return agentTransport !== null && agentSyncClient !== null;
};
