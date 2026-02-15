import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import toast from "react-hot-toast";
import { useShapeStore } from "../../hooks/useShapeStore";
import type { RandomEventType, Shape } from "../../types/canvas";
import type { ActionLogEntry } from "../../board/ActionLog";
import type { CardState } from "../../hooks/useCardReducer";
import {
  HEARTBEAT_INTERVAL_MS,
  CARD_ACTION_DESCRIPTIONS,
} from "../../board/constants/game";
import { describeRandomEvent, generatePlayerName } from "../../utils/game";
import {
  acquirePeerRuntime,
  releasePeerRuntime,
  usePeerStore,
} from "./peerStore";
import {
  addActionLogEntry,
  ensurePeerSyncMessageSubscriptions,
  getPeerSyncUiStateSnapshot,
  setPeerName,
  setPeerPresenceTimestamp,
  subscribePeerSyncUiState,
  type PeerSyncUiState,
} from "./peerSyncState";

export interface UsePeerSyncOptions {
  cards: { id: string; src: string[] }[];
  deck: { id: string; src: string[] }[];
  cardState: CardState;
}

const localPlayerName = generatePlayerName();

const selectConnectedPeerSyncUiState = (
  state: PeerSyncUiState,
  connections: Map<string, unknown>,
  localPeerId?: string
): PeerSyncUiState => {
  let changed = false;

  const receivedDataMap = Object.fromEntries(
    Object.entries(state.receivedDataMap).filter(([peerId]) => {
      const keep = connections.has(peerId);
      if (!keep) changed = true;
      return keep;
    })
  );

  const peerPresence = Object.fromEntries(
    Object.entries(state.peerPresence).filter(([peerId]) => {
      const keep = connections.has(peerId) || peerId === localPeerId;
      if (!keep) changed = true;
      return keep;
    })
  );

  const peerNames = Object.fromEntries(
    Object.entries(state.peerNames).filter(([peerId]) => {
      const keep = connections.has(peerId) || peerId === localPeerId;
      if (!keep) changed = true;
      return keep;
    })
  );

  if (!changed) return state;

  return {
    ...state,
    receivedDataMap,
    peerPresence,
    peerNames,
  };
};

export function usePeerSync(options: UsePeerSyncOptions) {
  const { cards, cardState } = options;
  const { connectToPeer, sendMessage, peer, error, connections } = usePeerStore();

  const peerSyncUiState = useSyncExternalStore(
    subscribePeerSyncUiState,
    getPeerSyncUiStateSnapshot,
    getPeerSyncUiStateSnapshot
  );
  const connectedPeerSyncUiState = useMemo(
    () => selectConnectedPeerSyncUiState(peerSyncUiState, connections, peer?.id),
    [connections, peer?.id, peerSyncUiState]
  );

  const lastLoggedActionId = useRef<number | undefined>(undefined);
  const lastShownErrorMessageRef = useRef<string | null>(null);

  const sendRandomEvent = (event: { type: RandomEventType; result: string }) => {
    const entry: ActionLogEntry = {
      playerId: peer?.id ?? "You",
      playerName: localPlayerName,
      action: describeRandomEvent(event),
      cardsInHand: cards.length,
      timestamp: Date.now(),
    };

    addActionLogEntry(entry);

    if (peer?.id) {
      sendMessage({
        type: "random-event",
        payload: {
          ...event,
          peerId: peer.id,
          playerName: localPlayerName,
          timestamp: entry.timestamp,
        },
      });
    }
  };

  const rollCoin = () => {
    const result = Math.random() < 0.5 ? "Heads" : "Tails";
    sendRandomEvent({ type: "coin", result });
  };

  const rollDie = (sides: number) => {
    const result = Math.floor(Math.random() * sides) + 1;
    const type = sides === 6 ? "d6" : "d20";
    sendRandomEvent({ type, result: result.toString() });
  };

  const pickStarter = () => {
    const participantIds = Array.from(
      new Set([peer?.id, ...connections.keys()].filter(Boolean))
    ) as string[];

    if (participantIds.length === 0) return;

    const chosen = participantIds[Math.floor(Math.random() * participantIds.length)];
    const name = connectedPeerSyncUiState.peerNames[chosen] || chosen;
    sendRandomEvent({ type: "starter", result: name });
  };

  useEffect(() => {
    if (!peer?.id) return;

    const peerId = peer.id;
    let rafId: number | null = null;
    let pendingShapes: Shape[] | null = null;

    const flush = () => {
      if (!pendingShapes) {
        rafId = null;
        return;
      }

      sendMessage({
        type: "shapes",
        payload: { id: peerId, data: pendingShapes },
      });
      pendingShapes = null;
      rafId = null;
    };

    sendMessage({
      type: "shapes",
      payload: { id: peerId, data: useShapeStore.getState().shapes },
    });

    const unsubscribe = useShapeStore.subscribe((state, prevState) => {
      if (state.shapes === prevState.shapes) return;
      pendingShapes = state.shapes;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(flush);
    });

    return () => {
      unsubscribe();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [sendMessage, peer?.id]);

  useEffect(() => {
    ensurePeerSyncMessageSubscriptions();
    acquirePeerRuntime();
    return () => {
      releasePeerRuntime();
    };
  }, []);

  useEffect(() => {
    if (!cardState.lastAction || !cardState.actionId) return;
    if (lastLoggedActionId.current === cardState.actionId) return;
    lastLoggedActionId.current = cardState.actionId;

    const description = CARD_ACTION_DESCRIPTIONS[cardState.lastAction];
    if (!description) return;

    const entry: ActionLogEntry = {
      playerId: peer?.id ?? "You",
      playerName: localPlayerName,
      action: description,
      cardsInHand: cards.length,
      timestamp: Date.now(),
    };

    addActionLogEntry(entry);

    if (peer?.id) {
      sendMessage({ type: "action-log", payload: entry });
    }
  }, [cardState.actionId, cardState.lastAction, cards.length, peer?.id, sendMessage]);

  useEffect(() => {
    if (!peer?.id) return;

    const sendHeartbeat = () => {
      const timestamp = Date.now();
      setPeerPresenceTimestamp(peer.id, timestamp);
      setPeerName(peer.id, localPlayerName);
      sendMessage({
        type: "heartbeat",
        payload: { peerId: peer.id, timestamp, name: localPlayerName },
      });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [peer?.id, sendMessage]);

  useEffect(() => {
    const errorMessage = error?.message?.trim();
    if (!errorMessage) return;
    if (lastShownErrorMessageRef.current === errorMessage) return;
    lastShownErrorMessageRef.current = errorMessage;
    toast.error(errorMessage, { id: "peer-connection-error" });
  }, [error?.message]);

  return {
    peer,
    error,
    connections,
    connectToPeer,
    receivedDataMap: connectedPeerSyncUiState.receivedDataMap,
    peerPresence: connectedPeerSyncUiState.peerPresence,
    peerNames: connectedPeerSyncUiState.peerNames,
    rollCoin,
    rollDie,
    pickStarter,
  };
}
