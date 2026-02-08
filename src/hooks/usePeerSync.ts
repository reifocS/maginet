import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { usePeerStore } from "./usePeerConnection";
import { useShapeStore } from "./useShapeStore";
import type { Shape } from "../types/canvas";
import type { RandomEventType } from "../types/canvas";
import type { ActionLogEntry } from "../ActionLog";
import type { CardState } from "./useCardReducer";
import {

  HEARTBEAT_INTERVAL_MS,
  MAX_ACTION_LOG_ENTRIES,
  CARD_ACTION_DESCRIPTIONS,
} from "../constants/game";
import { logActionToConsole, generatePlayerName, describeRandomEvent } from "../utils/game";

interface UsePeerSyncOptions {
  cards: { id: string; src: string[] }[];
  deck: { id: string; src: string[] }[];
  cardState: CardState;
}

export function usePeerSync({ cards, deck, cardState }: UsePeerSyncOptions) {
  const {
    initPeer,
    connectToPeer,
    disconnect,
    sendMessage,
    onMessage,
    peer,
    error,
    connections,
  } = usePeerStore();

  const [receivedDataMap, setReceivedDataMap] = useState<Record<string, Shape[]>>({});
  const [peerPresence, setPeerPresence] = useState<Record<string, number>>({});
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const [, setActionLog] = useState<ActionLogEntry[]>([]);

  const playerNameRef = useRef<string>(generatePlayerName());
  const actionLogRef = useRef<ActionLogEntry[]>([]);
  const lastLoggedActionId = useRef<number | undefined>(undefined);

  const updateActionLog = (updater: (prev: ActionLogEntry[]) => ActionLogEntry[]) => {
    setActionLog((prev) => {
      const next = updater(prev);
      actionLogRef.current = next;
      return next;
    });
  };

  const addActionLogEntry = (entry: ActionLogEntry) => {
    logActionToConsole(entry);
    updateActionLog((prev) => [...prev, entry].slice(-MAX_ACTION_LOG_ENTRIES));
  };

  const updateActionLogRef = useRef(updateActionLog);
  const addActionLogEntryRef = useRef(addActionLogEntry);
  updateActionLogRef.current = updateActionLog;
  addActionLogEntryRef.current = addActionLogEntry;

  const sendRandomEvent = (event: { type: RandomEventType; result: string }) => {
    const entry: ActionLogEntry = {
      playerId: peer?.id ?? "You",
      playerName: playerNameRef.current,
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
          playerName: playerNameRef.current,
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
    const name = peerNames[chosen] || chosen;
    sendRandomEvent({ type: "starter", result: name });
  };

  // Shape broadcasting
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

    const emitSnapshot = (snapshot: Shape[]) => {
      sendMessage({
        type: "shapes",
        payload: { id: peerId, data: snapshot },
      });
    };

    emitSnapshot(useShapeStore.getState().shapes);

    const unsubscribe = useShapeStore.subscribe((state, prevState) => {
      if (state.shapes === prevState.shapes) return;
      pendingShapes = state.shapes;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(flush);
    });

    return () => {
      unsubscribe();
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [sendMessage, peer?.id]);

  // Init peer
  useEffect(() => {
    initPeer();
    return () => {
      disconnect();
    };
  }, [initPeer, disconnect]);

  // Register player name
  useEffect(() => {
    if (peer?.id) {
      setPeerNames((prev) => ({ ...prev, [peer.id]: playerNameRef.current }));
    }
  }, [peer?.id]);

  // Broadcast players info
  useEffect(() => {
    sendMessage({
      type: "playersInfo",
      payload: {
        peerId: peer?.id,
        data: {
          cardsInHand: cards.length,
          lastAction: cardState.lastAction,
        },
      },
    });
  }, [cards, cardState.lastAction, sendMessage, peer]);

  // Card action logging
  useEffect(() => {
    if (!cardState.lastAction || !cardState.actionId) return;
    if (lastLoggedActionId.current === cardState.actionId) return;
    lastLoggedActionId.current = cardState.actionId;

    const description = CARD_ACTION_DESCRIPTIONS[cardState.lastAction];
    if (!description) return;

    const entry: ActionLogEntry = {
      playerId: peer?.id ?? "You",
      playerName: playerNameRef.current,
      action: description,
      cardsInHand: cards.length,
      timestamp: Date.now(),
    };

    addActionLogEntryRef.current(entry);

    if (peer?.id) {
      sendMessage({ type: "action-log", payload: entry });
    }
  }, [cardState.actionId, cardState.lastAction, cards.length, peer?.id, sendMessage]);

  // Heartbeat
  useEffect(() => {
    if (!peer?.id) return;

    const sendHeartbeat = () => {
      const timestamp = Date.now();
      setPeerPresence((prev) => ({ ...prev, [peer.id]: timestamp }));
      setPeerNames((prev) => ({ ...prev, [peer.id]: playerNameRef.current }));
      sendMessage({
        type: "heartbeat",
        payload: { peerId: peer.id, timestamp, name: playerNameRef.current },
      });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [peer?.id, sendMessage]);

  // Message subscribers
  useEffect(() => {
    const unsubscribeShapes = onMessage("shapes", (message) => {
      setReceivedDataMap((prev) => ({
        ...prev,
        [message.payload.id]: message.payload.data,
      }));
    });

    const unsubscribeConnected = onMessage("connected", (message) => {
      toast(`Peer connected: ${message.payload.peerId}`);
      setPeerPresence((prev) => ({
        ...prev,
        [message.payload.peerId]: Date.now(),
      }));
      if (message.payload.name) {
        setPeerNames((prev) => ({
          ...prev,
          [message.payload.peerId]: message.payload.name,
        }));
      }

      if (peer?.id && message.payload.peerId && actionLogRef.current.length > 0) {
        sendMessage(
          {
            type: "action-log-snapshot",
            payload: { entries: actionLogRef.current.slice(-20) },
          },
          message.payload.peerId
        );
      }
    });

    const unsubscribeProuton = onMessage("prouton", () => {
      toast(`Prouton!`);
    });

    const unsubscribePlayersInfo = onMessage("playersInfo", () => {});

    const unsubscribeHeartbeat = onMessage("heartbeat", (message) => {
      setPeerPresence((prev) => ({
        ...prev,
        [message.payload.peerId]: message.payload.timestamp,
      }));
      if (message.payload.name) {
        setPeerNames((prev) => ({
          ...prev,
          [message.payload.peerId]: message.payload.name,
        }));
      }
    });

    const unsubscribeActionLog = onMessage("action-log", (message) => {
      const incoming = message.payload as ActionLogEntry;
      const entry = {
        ...incoming,
        timestamp: incoming.timestamp ?? Date.now(),
      };
      addActionLogEntryRef.current(entry);
    });

    const unsubscribeRandomEvent = onMessage("random-event", (message) => {
      const {
        type,
        result,
        playerName: name,
        peerId: fromPeerId,
        timestamp,
      } = message.payload as {
        type: RandomEventType;
        result: string;
        playerName?: string;
        peerId?: string;
        timestamp?: number;
      };
      const entry: ActionLogEntry = {
        playerId: fromPeerId ?? "Peer",
        playerName: name,
        action: describeRandomEvent({ type, result }),
        cardsInHand: 0,
        timestamp: timestamp ?? Date.now(),
      };
      addActionLogEntryRef.current(entry);
    });

    const unsubscribeActionLogSnapshot = onMessage(
      "action-log-snapshot",
      (message) => {
        const { entries } = message.payload as { entries: ActionLogEntry[] };
        if (Array.isArray(entries) && entries.length > 0) {
          updateActionLogRef.current((prev) => {
            const merged = [...prev, ...entries].slice(-MAX_ACTION_LOG_ENTRIES);
            return merged;
          });
          entries.forEach((entry) => logActionToConsole(entry, "Action Snapshot"));
        }
      }
    );

    const unsubscribeCardState = onMessage("card-state", () => {});

    return () => {
      unsubscribeShapes();
      unsubscribeConnected();
      unsubscribeProuton();
      unsubscribePlayersInfo();
      unsubscribeHeartbeat();
      unsubscribeActionLog();
      unsubscribeActionLogSnapshot();
      unsubscribeRandomEvent();
      unsubscribeCardState();
    };
  }, [onMessage, peer?.id, sendMessage]);

  // Connection cleanup
  useEffect(() => {
    setReceivedDataMap((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach((peerId) => {
        if (!connections.has(peerId)) {
          delete next[peerId];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setPeerPresence((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach((peerId) => {
        if (!connections.has(peerId) && peerId !== peer?.id) {
          delete next[peerId];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setPeerNames((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach((peerId) => {
        if (!connections.has(peerId) && peerId !== peer?.id) {
          delete next[peerId];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [connections, peer?.id]);

  // Deck broadcasting
  useEffect(() => {
    sendMessage({ type: "cards", payload: cards.length });
    sendMessage({ type: "deck", payload: deck.length });
  }, [cards, deck, sendMessage]);

  // Error toast
  useEffect(() => {
    if (error) {
      toast.error(error.message);
    }
  }, [error]);

  return {
    peer,
    error,
    connections,
    connectToPeer,
    receivedDataMap,
    peerPresence,
    peerNames,
    rollCoin,
    rollDie,
    pickStarter,
  };
}
