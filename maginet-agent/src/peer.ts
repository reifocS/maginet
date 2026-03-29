// WebRTC polyfill — MUST be set before PeerJS is imported
import polyfill from "node-datachannel/polyfill";
Object.assign(globalThis, polyfill);

import {
  createSyncClient,
  type SyncEnvelope,
} from "@vescofire/peersync";
import { createPeerJsTransport } from "@vescofire/peersync/peerjs";
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

export function createAgentPeer(options: AgentPeerOptions) {
  let localPeerId: string | null = null;

  const syncTransport = createPeerJsTransport({
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
