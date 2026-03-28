import type {
  SyncTransport,
  SyncEnvelope,
  SyncPeerId,
} from "@vescofire/peersync";

export interface WebSocketTransportOptions {
  url: string;
  agentPeerId?: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export function createWebSocketTransport(
  options: WebSocketTransportOptions
): SyncTransport {
  const agentPeerId = options.agentPeerId ?? "agent";
  let ws: WebSocket | null = null;
  let localId: string | null = null;
  const messageListeners = new Set<
    (fromPeerId: SyncPeerId, message: SyncEnvelope) => void
  >();
  const openListeners = new Set<(peerId: SyncPeerId) => void>();
  const closeListeners = new Set<(peerId: SyncPeerId) => void>();

  return {
    start: async (localPeerId?: SyncPeerId) => {
      localId =
        localPeerId ?? `browser-${Math.random().toString(36).substr(2, 6)}`;

      return new Promise<void>((resolve, reject) => {
        ws = new WebSocket(options.url);

        ws.onopen = () => {
          openListeners.forEach((listener) => listener(agentPeerId));
          options.onConnected?.();
          resolve();
        };

        ws.onerror = () => {
          const error = new Error("WebSocket connection failed");
          options.onError?.(error);
          reject(error);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(
              typeof event.data === "string" ? event.data : ""
            ) as SyncEnvelope;
            messageListeners.forEach((listener) =>
              listener(agentPeerId, message)
            );
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onclose = () => {
          ws = null;
          closeListeners.forEach((listener) => listener(agentPeerId));
          options.onDisconnected?.();
        };
      });
    },

    stop: async () => {
      if (ws) {
        ws.close();
        ws = null;
      }
    },

    connect: async () => {
      // No-op: the WebSocket connection is established in start()
    },

    disconnect: () => {
      if (ws) {
        ws.close();
        ws = null;
      }
    },

    peers: () => {
      return ws && ws.readyState === WebSocket.OPEN ? [agentPeerId] : [];
    },

    localPeerId: () => localId,

    send: (_peerId: SyncPeerId, message: SyncEnvelope) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },

    broadcast: (message: SyncEnvelope) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },

    onMessage: (
      callback: (fromPeerId: SyncPeerId, message: SyncEnvelope) => void
    ) => {
      messageListeners.add(callback);
      return () => {
        messageListeners.delete(callback);
      };
    },

    onConnectionOpen: (callback: (peerId: SyncPeerId) => void) => {
      openListeners.add(callback);
      return () => {
        openListeners.delete(callback);
      };
    },

    onConnectionClose: (callback: (peerId: SyncPeerId) => void) => {
      closeListeners.add(callback);
      return () => {
        closeListeners.delete(callback);
      };
    },
  };
}
