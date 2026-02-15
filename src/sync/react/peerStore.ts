import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { create } from "zustand";
import { useShapeStore } from "../../hooks/useShapeStore";
import {
  createSyncClient,
  isPeerSyncEnvelope,
  type SyncEnvelope,
} from "../core";
import { createPeerJsTransport } from "../transport";

export type Message<TPayload = unknown> = SyncEnvelope<string, TPayload>;

export type MessageCallback<TPayload = unknown> = (
  message: Message<TPayload>,
  peerId: string
) => void;

export interface PeerState {
  peer: Peer | null;
  connections: Map<string, DataConnection>;
  error: Error | null;
  initPeer: () => void;
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
let runtimeRefCount = 0;
let pendingRuntimeStop: ReturnType<typeof setTimeout> | null = null;

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

    syncClient.send(
      {
        type: "shapes",
        payload: {
          id: peer.id,
          data: useShapeStore.getState().shapes,
        },
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

const clearPendingRuntimeStop = () => {
  if (!pendingRuntimeStop) return;
  clearTimeout(pendingRuntimeStop);
  pendingRuntimeStop = null;
};

export const acquirePeerRuntime = () => {
  runtimeRefCount += 1;
  clearPendingRuntimeStop();
  if (runtimeRefCount > 1) return;
  ensureCoreHandlers();
  void syncClient.start().catch((error) => {
    setPeerError(toError(error));
  });
};

export const releasePeerRuntime = () => {
  runtimeRefCount = Math.max(0, runtimeRefCount - 1);
  if (runtimeRefCount > 0) return;
  clearPendingRuntimeStop();
  pendingRuntimeStop = setTimeout(() => {
    if (runtimeRefCount > 0) return;
    void syncClient.stop().catch((error) => {
      setPeerError(toError(error));
    });
  }, 0);
};

export const usePeerStore = create<PeerState>((_, get) => ({
  peer: null,
  connections: new Map(),
  error: null,

  initPeer: () => {
    acquirePeerRuntime();
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

    releasePeerRuntime();
  },

  onMessage: (type: string, callback) => {
    return syncClient.onMessage(type, callback as MessageCallback);
  },
}));
