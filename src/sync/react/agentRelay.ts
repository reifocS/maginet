/**
 * Agent Relay — bridges WebSocket (agent) ↔ PeerJS (other players).
 *
 * The relay browser doesn't play. It:
 * 1. Receives agent shapes via WS → applies them as local shapes (owned by relay's peer ID)
 * 2. Receives remote player shapes via PeerJS → forwards them to agent via WS
 * 3. Forwards action-log, card-state-sync, random-event messages bidirectionally
 */
import type { Shape } from "../../types/canvas";
import { useShapeStore } from "../../hooks/useShapeStore";
import {
  getPeerSyncUiStateSnapshot,
  subscribePeerSyncUiState,
} from "./peerSyncState";
import { usePeerStore } from "./peerStore";

type AgentMessage = {
  type: string;
  payload: unknown;
  meta?: Record<string, unknown>;
};

let ws: WebSocket | null = null;
let relayActive = false;
let relayGeneration = 0;
let unsubscribeShapes: (() => void) | null = null;
let unsubscribePeerState: (() => void) | null = null;
let lastRemoteSnapshot = "";

const messageListeners = new Set<(msg: AgentMessage) => void>();

function sendToAgent(message: AgentMessage) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function forwardRemoteShapesToAgent() {
  const { receivedDataMap } = getPeerSyncUiStateSnapshot();
  const serialized = JSON.stringify(receivedDataMap);
  // Avoid sending duplicate snapshots
  if (serialized === lastRemoteSnapshot) return;
  lastRemoteSnapshot = serialized;
  sendToAgent({
    type: "sync:remote-shapes",
    payload: receivedDataMap,
  });
}

function applyAgentShapes(shapes: Shape[]) {
  // Replace local shapes with agent's shapes — they appear under relay's peer ID
  useShapeStore.getState().setShapes(shapes);
}

function handleAgentMessage(message: AgentMessage) {
  messageListeners.forEach((listener) => listener(message));

  if (message.type === "sync:agent-shapes") {
    applyAgentShapes(message.payload as Shape[]);
    return;
  }

  // Forward agent action-log entries to PeerJS peers
  if (message.type === "action-log" || message.type === "random-event") {
    const { sendMessage } = usePeerStore.getState();
    sendMessage(message as { type: string; payload: unknown });
  }
}

export function startRelay(port: number = 3210): Promise<void> {
  // Synchronously tear down any previous relay before creating a new one
  stopRelay();
  const gen = ++relayGeneration;

  return new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://localhost:${port}`);

    ws.onopen = () => {
      if (gen !== relayGeneration) return;
      relayActive = true;
      console.log("[relay] Connected to agent");

      // Clean slate — relay browser is a bridge, not a player
      useShapeStore.getState().setShapes([]);

      // Send initial remote shapes snapshot
      forwardRemoteShapesToAgent();

      // Seed the agent with existing action log history
      const { actionLog } = getPeerSyncUiStateSnapshot();
      if (actionLog.length > 0) {
        sendToAgent({
          type: "action-log-snapshot",
          payload: { entries: actionLog },
        });
      }

      // Watch for remote shape changes (from PeerJS peers) → forward to agent
      unsubscribePeerState = subscribePeerSyncUiState(() => {
        if (gen !== relayGeneration) return;
        forwardRemoteShapesToAgent();
      });

      // Forward local sendMessage calls to agent
      // (action-log, card-state-sync from usePeerSync)
      const { onMessage } = usePeerStore.getState();
      const unsubActionLog = onMessage("action-log", (msg) => {
        sendToAgent(msg);
      });
      const unsubCardState = onMessage("card-state-sync", (msg) => {
        sendToAgent(msg);
      });
      const unsubRandomEvent = onMessage("random-event", (msg) => {
        sendToAgent(msg);
      });

      // Store unsubscribers for cleanup
      const prevUnsub = unsubscribeShapes;
      unsubscribeShapes = () => {
        prevUnsub?.();
        unsubActionLog();
        unsubCardState();
        unsubRandomEvent();
      };

      resolve();
    };

    ws.onerror = () => {
      if (gen !== relayGeneration) return;
      ws = null;
      cleanup();
      reject(new Error("Failed to connect to agent"));
    };

    ws.onmessage = (event) => {
      if (gen !== relayGeneration) return;
      try {
        const message = JSON.parse(
          typeof event.data === "string" ? event.data : ""
        ) as AgentMessage;
        handleAgentMessage(message);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (gen !== relayGeneration) return;
      console.log("[relay] Disconnected from agent");
      cleanup();
    };
  });
}

function cleanup() {
  relayActive = false;
  unsubscribePeerState?.();
  unsubscribePeerState = null;
  unsubscribeShapes?.();
  unsubscribeShapes = null;
  lastRemoteSnapshot = "";
}

export function stopRelay() {
  if (ws) {
    ws.close();
    ws = null;
  }
  cleanup();
}

export function isRelayActive(): boolean {
  return relayActive;
}

export function onAgentMessage(listener: (msg: AgentMessage) => void): () => void {
  messageListeners.add(listener);
  return () => {
    messageListeners.delete(listener);
  };
}
