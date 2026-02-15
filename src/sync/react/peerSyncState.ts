import toast from "react-hot-toast";
import type { Shape, RandomEventType } from "../../types/canvas";
import type { ActionLogEntry } from "../../board/ActionLog";
import { MAX_ACTION_LOG_ENTRIES } from "../../board/constants/game";
import { describeRandomEvent, logActionToConsole } from "../../utils/game";
import { usePeerStore } from "./peerStore";

type ConnectedMessagePayload = {
  peerId: string;
  name?: string;
};

type HeartbeatMessagePayload = {
  peerId: string;
  timestamp: number;
  name?: string;
};

type RandomEventMessagePayload = {
  type: RandomEventType;
  result: string;
  playerName?: string;
  peerId?: string;
  timestamp?: number;
};

type ActionLogSnapshotPayload = {
  entries: ActionLogEntry[];
};

export type PeerSyncUiState = {
  receivedDataMap: Record<string, Shape[]>;
  peerPresence: Record<string, number>;
  peerNames: Record<string, string>;
  actionLog: ActionLogEntry[];
};

const INITIAL_PEER_SYNC_UI_STATE: PeerSyncUiState = {
  receivedDataMap: {},
  peerPresence: {},
  peerNames: {},
  actionLog: [],
};

let peerSyncUiState = INITIAL_PEER_SYNC_UI_STATE;

const peerSyncUiListeners = new Set<() => void>();

export const subscribePeerSyncUiState = (listener: () => void) => {
  peerSyncUiListeners.add(listener);
  return () => {
    peerSyncUiListeners.delete(listener);
  };
};

export const getPeerSyncUiStateSnapshot = () => peerSyncUiState;

const setPeerSyncUiState = (
  updater: (prev: PeerSyncUiState) => PeerSyncUiState
) => {
  const next = updater(peerSyncUiState);
  if (next === peerSyncUiState) return;
  peerSyncUiState = next;
  peerSyncUiListeners.forEach((listener) => listener());
};

export const setPeerShapes = (peerId: string, data: Shape[]) => {
  setPeerSyncUiState((prev) => {
    const current = prev.receivedDataMap[peerId];
    if (current === data) return prev;
    return {
      ...prev,
      receivedDataMap: {
        ...prev.receivedDataMap,
        [peerId]: data,
      },
    };
  });
};

export const setPeerPresenceTimestamp = (peerId: string, timestamp: number) => {
  setPeerSyncUiState((prev) => {
    if (prev.peerPresence[peerId] === timestamp) return prev;
    return {
      ...prev,
      peerPresence: {
        ...prev.peerPresence,
        [peerId]: timestamp,
      },
    };
  });
};

export const setPeerName = (peerId: string, name: string) => {
  setPeerSyncUiState((prev) => {
    if (!name || prev.peerNames[peerId] === name) return prev;
    return {
      ...prev,
      peerNames: {
        ...prev.peerNames,
        [peerId]: name,
      },
    };
  });
};

export const addActionLogEntry = (entry: ActionLogEntry) => {
  logActionToConsole(entry);
  setPeerSyncUiState((prev) => {
    const actionLog = [...prev.actionLog, entry].slice(-MAX_ACTION_LOG_ENTRIES);
    return {
      ...prev,
      actionLog,
    };
  });
};

const mergeActionLogSnapshot = (entries: ActionLogEntry[]) => {
  if (entries.length === 0) return;
  setPeerSyncUiState((prev) => {
    const actionLog = [...prev.actionLog, ...entries].slice(-MAX_ACTION_LOG_ENTRIES);
    return {
      ...prev,
      actionLog,
    };
  });
  entries.forEach((entry) => logActionToConsole(entry, "Action Snapshot"));
};

let messageSubscriptionsRegistered = false;

export const ensurePeerSyncMessageSubscriptions = () => {
  if (messageSubscriptionsRegistered) return;
  messageSubscriptionsRegistered = true;

  const onMessage = usePeerStore.getState().onMessage;

  onMessage<ConnectedMessagePayload>("connected", (message) => {
    toast(`Peer connected: ${message.payload.peerId}`, {
      id: `peer-connected:${message.payload.peerId}`,
    });

    setPeerPresenceTimestamp(message.payload.peerId, Date.now());

    if (message.payload.name) {
      setPeerName(message.payload.peerId, message.payload.name);
    }

    const { peer, sendMessage } = usePeerStore.getState();
    const actionLogEntries = getPeerSyncUiStateSnapshot().actionLog;
    if (peer?.id && message.payload.peerId && actionLogEntries.length > 0) {
      sendMessage(
        {
          type: "action-log-snapshot",
          payload: { entries: actionLogEntries.slice(-20) },
        },
        message.payload.peerId
      );
    }
  });

  onMessage("prouton", () => {
    toast("Prouton!");
  });

  onMessage<HeartbeatMessagePayload>("heartbeat", (message) => {
    setPeerPresenceTimestamp(message.payload.peerId, message.payload.timestamp);
    if (message.payload.name) {
      setPeerName(message.payload.peerId, message.payload.name);
    }
  });

  onMessage<ActionLogEntry>("action-log", (message) => {
    const incoming = message.payload;
    addActionLogEntry({
      ...incoming,
      timestamp: incoming.timestamp ?? Date.now(),
    });
  });

  onMessage<RandomEventMessagePayload>("random-event", (message) => {
    const { type, result, playerName, peerId, timestamp } = message.payload;

    addActionLogEntry({
      playerId: peerId ?? "Peer",
      playerName,
      action: describeRandomEvent({ type, result }),
      cardsInHand: 0,
      timestamp: timestamp ?? Date.now(),
    });
  });

  onMessage<ActionLogSnapshotPayload>("action-log-snapshot", (message) => {
    const { entries } = message.payload;
    if (!Array.isArray(entries)) return;
    mergeActionLogSnapshot(entries);
  });

};
