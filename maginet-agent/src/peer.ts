// WebRTC polyfill — MUST be set before PeerJS is imported
import polyfill from "node-datachannel/polyfill";
Object.assign(globalThis, polyfill);

import {
  createSyncClient,
  type SyncEnvelope,
} from "@vescofire/peersync";
import { createShapesSyncChannel } from "./shapesChannel.js";
import type { Shape } from "./state.js";

export interface AgentPeerOptions {
  getLocalShapes: () => Shape[];
  subscribeLocalShapes: (cb: (next: Shape[], prev: Shape[]) => void) => () => void;
  onPeerReady?: (peerId: string) => void;
  onConnectionOpen?: (peerId: string) => void;
  onConnectionClose?: (peerId: string) => void;
  onRemoteShapes?: (peerId: string, shapes: Shape[]) => void;
  onError?: (error: Error) => void;
}

export async function createAgentPeer(options: AgentPeerOptions) {
  // Dynamic imports — PeerJS must be loaded AFTER polyfill globals are set.
  // Static import of @vescofire/peersync/peerjs pulls in peerjs at module
  // load time, before our polyfill runs. Dynamic import defers it.
  const [peerMod, transportMod] = await Promise.all([
    import("peerjs"),
    import("@vescofire/peersync/peerjs"),
  ]);

  // PeerJS CJS/ESM interop — resolve the Peer class
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Peer = (peerMod as any).Peer ?? (peerMod as any).default?.Peer ?? (peerMod as any).default;
  if (typeof Peer !== "function") {
    throw new Error("Could not resolve Peer class from peerjs module");
  }

  const { createPeerJsTransport } = transportMod;

  let localPeerId: string | null = null;

  const syncTransport = createPeerJsTransport({
    // Override createPeer to use our resolved Peer class (CJS interop)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createPeer: (id?: string) => (id ? new Peer(id) : new Peer()) as any,
    onPeerReady: (peer: { id: string }) => {
      localPeerId = peer.id;
      console.error(`[maginet-agent] Peer ready: ${peer.id}`);
      options.onPeerReady?.(peer.id);
    },
    onPeerDestroyed: () => {
      localPeerId = null;
    },
    onConnectionsChanged: (connections: Map<string, unknown>) => {
      console.error(`[maginet-agent] Connections: ${connections.size}`);
    },
    onError: (error: Error) => {
      console.error(`[maginet-agent] Peer error: ${error.message}`);
      options.onError?.(error);
    },
  });

  const syncClient = createSyncClient({
    roomId: "maginet",
    transport: syncTransport,
  });

  syncClient.registerChannel(
    createShapesSyncChannel({
      getLocalPeerId: () => localPeerId,
      getLocalShapes: options.getLocalShapes,
      subscribeLocalShapes: options.subscribeLocalShapes,
      onRemoteShapes: (peerId, shapes) => {
        options.onRemoteShapes?.(peerId, shapes);
      },
    })
  );

  syncClient.onConnectionOpen((peerId: string) => {
    console.error(`[maginet-agent] Connected to: ${peerId}`);
    options.onConnectionOpen?.(peerId);
  });

  syncClient.onConnectionClose((peerId: string) => {
    console.error(`[maginet-agent] Disconnected from: ${peerId}`);
    options.onConnectionClose?.(peerId);
  });

  return {
    start: () => syncClient.start(),
    stop: () => syncClient.stop(),
    connect: (peerId: string) => syncClient.connect(peerId),
    send: (message: SyncEnvelope, peerId?: string) => syncClient.send(message, peerId),
    onMessage: <T = unknown>(type: string, handler: (msg: SyncEnvelope<string, T>) => void) =>
      syncClient.onMessage(type, handler),
    localPeerId: () => localPeerId,
    peers: () => syncTransport.peers(),
    isConnected: () => syncTransport.peers().length > 0,
  };
}
